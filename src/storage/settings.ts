declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

import type { HoneSettings } from "../types";
import { DEFAULT_SETTINGS } from "../defaults";
import { enqueueUserOperation } from "../mutation/queue";
import * as hlog from "../hlog";

const SETTINGS_FILE = "settings.json";
const cacheByUser = new Map<string, HoneSettings>();

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function mergeSettingsWithDefaults(defaults: HoneSettings, stored: Partial<HoneSettings>): HoneSettings {
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

export async function loadSettings(userId: string): Promise<HoneSettings> {
  const stored = await spindle.userStorage.getJson<Partial<HoneSettings>>(SETTINGS_FILE, {
    fallback: {},
    userId,
  });
  const keys = stored ? Object.keys(stored) : [];
  const merged = mergeSettingsWithDefaults(DEFAULT_SETTINGS, stored ?? {});
  cacheByUser.set(userId, merged);
  hlog.setDebugEnabled(userId, merged.debugLogging, merged.debugLogMaxEntries, merged.debugLogFullPayloads);
  hlog.debug(
    userId,
    `loadSettings: storedKeys=${keys.length} (${keys.join(",") || "(empty)"}) activeModelProfileId="${merged.activeModelProfileId}" presets=[output=${merged.currentPresetId},input=${merged.currentInputPresetId}] debug=${merged.debugLogging}/${merged.debugLogMaxEntries}`
  );
  return merged;
}

export async function getSettings(userId: string): Promise<HoneSettings> {
  const cached = cacheByUser.get(userId);
  if (cached) return cached;
  return loadSettings(userId);
}

async function persist(userId: string, settings: HoneSettings): Promise<void> {
  await spindle.userStorage.setJson(SETTINGS_FILE, settings, { indent: 2, userId });
  cacheByUser.set(userId, settings);
  hlog.setDebugEnabled(userId, settings.debugLogging, settings.debugLogMaxEntries, settings.debugLogFullPayloads);
}

export async function updateSettings(userId: string, partial: Partial<HoneSettings>): Promise<HoneSettings> {
  let result: HoneSettings | null = null;
  await enqueueUserOperation(userId, async () => {
    const current = await getSettings(userId);
    const updated = mergeSettingsWithDefaults(current, partial);
    const changedKeys: string[] = [];
    for (const k of Object.keys(partial) as Array<keyof HoneSettings>) {
      if (JSON.stringify(current[k]) !== JSON.stringify(updated[k])) changedKeys.push(k);
    }
    if (changedKeys.length > 0) {
      hlog.debug(
        userId,
        `updateSettings: persisting ${changedKeys.length} changed key(s): ${changedKeys.join(",")}`
      );
    } else {
      hlog.debug(userId, `updateSettings: no-op (requested keys matched current values: ${Object.keys(partial).join(",") || "(empty)"})`);
    }
    await persist(userId, updated);
    result = updated;
  });
  return result!;
}

export function evictSettingsCache(userId: string): void {
  cacheByUser.delete(userId);
}
