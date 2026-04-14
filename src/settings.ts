declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

import type { HoneSettings } from "./types";
import { DEFAULT_SETTINGS } from "./defaults";
import * as hlog from "./hlog";

const SETTINGS_FILE = "settings.json";

// Hone is operator-scoped: a single process serves every user. Cache
// keyed by userId so lookups, mutations, and invalidation never cross
// user boundaries. Populated lazily on first `getSettings(userId)`.
const cacheByUser = new Map<string, HoneSettings>();

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** One-level-deep merge driven by the shape of `defaults`.
 *
 *  For each key in `defaults`: if the default is a plain object,
 *  spread-merge default ← stored so newly-added nested fields don't
 *  disappear when the on-disk copy predates them. For other types,
 *  stored wins. Keys not in defaults are dropped. */
function mergeSettingsWithDefaults(
  defaults: HoneSettings,
  stored: Partial<HoneSettings>
): HoneSettings {
  const out = { ...defaults } as Record<string, unknown>;
  const storedBag = stored as Record<string, unknown>;
  const defaultsBag = defaults as unknown as Record<string, unknown>;
  for (const key of Object.keys(defaultsBag)) {
    const s = storedBag[key];
    if (s === undefined) continue;
    const d = defaultsBag[key];
    out[key] = isPlainObject(d) && isPlainObject(s) ? { ...d, ...s } : s;
  }
  return out as unknown as HoneSettings;
}

function mergeStored(stored: Partial<HoneSettings> | null): HoneSettings {
  return mergeSettingsWithDefaults(DEFAULT_SETTINGS, stored ?? {});
}

export async function loadSettings(userId: string): Promise<HoneSettings> {
  const stored = await spindle.userStorage.getJson<Partial<HoneSettings>>(
    SETTINGS_FILE,
    { fallback: {}, userId }
  );
  const merged = mergeStored(stored);
  cacheByUser.set(userId, merged);
  // Sync the hlog debug-enabled cache so the log hot path doesn't
  // hit async storage per call.
  hlog.setDebugEnabled(userId, merged.debugLogging, merged.debugLogMaxEntries, merged.debugLogFullPayloads);
  return merged;
}

export async function getSettings(userId: string): Promise<HoneSettings> {
  const cached = cacheByUser.get(userId);
  if (cached) return cached;
  return loadSettings(userId);
}

export async function saveSettings(
  userId: string,
  settings: HoneSettings
): Promise<void> {
  // Write disk first; if setJson throws, the cache stays at its
  // previous known-good value.
  await spindle.userStorage.setJson(SETTINGS_FILE, settings, {
    indent: 2,
    userId,
  });
  cacheByUser.set(userId, settings);
}

export async function updateSettings(
  userId: string,
  partial: Partial<HoneSettings>
): Promise<HoneSettings> {
  const current = await getSettings(userId);
  const updated = mergeSettingsWithDefaults(current, partial);
  await saveSettings(userId, updated);
  hlog.setDebugEnabled(userId, updated.debugLogging, updated.debugLogMaxEntries, updated.debugLogFullPayloads);
  return updated;
}

/** Drop a user's cached settings. Call when the on-disk copy may
 *  have changed out-of-band. */
export function evictSettingsCache(userId: string): void {
  cacheByUser.delete(userId);
}
