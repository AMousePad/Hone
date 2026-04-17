declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

import type { PovPreset, PovPresetSummary } from "./types";
import * as hlog from "./hlog";

const POV_PREFIX = "pov-presets/";

function povPath(id: string): string {
  return `${POV_PREFIX}${id}.json`;
}

function slugifyId(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "pov";
}

const SAFE_CUSTOM_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;

function assertSafeCustomId(id: string): void {
  if (!SAFE_CUSTOM_ID.test(id)) {
    throw new Error(`Invalid POV preset id "${id}"`);
  }
}

const BUILTIN_POV_PRESETS: ReadonlyArray<PovPreset> = [
  {
    id: "auto",
    name: "Auto-detect",
    content:
      "Point-of-view: Match the point-of-view, tense, and pronoun conventions already established in the surrounding text. Do not shift perspective.",
  },
  {
    id: "1st",
    name: "First Person",
    content:
      "Point-of-view: First person. The POV character uses I/me/my in narration. The addressed character uses you/your. Other characters use he/she/they.",
  },
  {
    id: "1.5",
    name: "First Person (1.5)",
    content:
      "Point-of-view: First person with direct address. The POV character uses I/me/my. The addressed character is referred to as you/your in narration and description (not he/she). Other characters use he/she/they.",
  },
  {
    id: "2nd",
    name: "Second Person",
    content:
      "Point-of-view: Second person. The addressed character uses you/your in narration. All other characters use he/she/they/proper names.",
  },
  {
    id: "3rd",
    name: "Third Person",
    content:
      "Point-of-view: Third person. All characters use he/she/they/proper names. No I/you in narration.",
  },
];

export const DEFAULT_POV_PRESET_ID = "auto";
export const DEFAULT_USER_POV_PRESET_ID = "1st";

const BUILTIN_IDS: ReadonlySet<string> = new Set(BUILTIN_POV_PRESETS.map((p) => p.id));

export function isBuiltInPovPresetId(id: string): boolean {
  return BUILTIN_IDS.has(id);
}

export function getBuiltInPovPreset(id: string): PovPreset | null {
  return BUILTIN_POV_PRESETS.find((p) => p.id === id) ?? null;
}

async function listCustomIds(userId: string): Promise<string[]> {
  try {
    const files = await spindle.userStorage.list(POV_PREFIX, userId);
    return files
      .map((f) => f.replace(/\\/g, "/"))
      .filter((f) => /^[^/]+\.json$/.test(f))
      .map((f) => f.replace(/\.json$/, ""));
  } catch {
    return [];
  }
}

async function uniqueId(userId: string, base: string): Promise<string> {
  const slug = slugifyId(base);
  const custom = new Set(await listCustomIds(userId));
  const taken = (id: string): boolean => custom.has(id) || BUILTIN_IDS.has(id);
  if (!taken(slug)) return slug;
  for (let i = 2; i < 10_000; i++) {
    const candidate = `${slug}-${i}`;
    if (!taken(candidate)) return candidate;
  }
  return `${slug}-${Date.now().toString(36)}`;
}

function isPovPresetShape(value: unknown): value is PovPreset {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<PovPreset>;
  return typeof v.id === "string" && typeof v.name === "string" && typeof v.content === "string";
}

async function loadCustom(userId: string, id: string): Promise<PovPreset | null> {
  if (!SAFE_CUSTOM_ID.test(id)) return null;
  try {
    const raw = await spindle.userStorage.getJson<PovPreset | null>(povPath(id), {
      fallback: null,
      userId,
    });
    if (!isPovPresetShape(raw)) return null;
    return { id, name: raw.name, content: raw.content };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    hlog.debug(userId, `loadCustomPov: failed to load "${id}": ${msg}`);
    return null;
  }
}

export async function listPovPresets(userId: string): Promise<PovPresetSummary[]> {
  hlog.debug(userId, `listPovPresets: start`);
  const ids = await listCustomIds(userId);
  const customs: PovPresetSummary[] = [];
  for (const id of ids) {
    const preset = await loadCustom(userId, id);
    if (preset) {
      customs.push({ id: preset.id, name: preset.name, content: preset.content, builtIn: false });
    }
  }
  customs.sort((a, b) => a.name.localeCompare(b.name));
  const builtIns: PovPresetSummary[] = BUILTIN_POV_PRESETS.map((p) => ({
    id: p.id,
    name: p.name,
    content: p.content,
    builtIn: true,
  }));
  hlog.debug(
    userId,
    `listPovPresets: ${customs.length} custom + ${builtIns.length} built-in`
  );
  return [...customs, ...builtIns];
}

export async function getPovPreset(userId: string, id: string): Promise<PovPreset | null> {
  const builtIn = getBuiltInPovPreset(id);
  if (builtIn) return builtIn;
  return loadCustom(userId, id);
}

export async function savePovPreset(userId: string, preset: PovPreset): Promise<void> {
  if (isBuiltInPovPresetId(preset.id)) {
    throw new Error(`Cannot overwrite built-in POV preset "${preset.id}"; duplicate it first.`);
  }
  assertSafeCustomId(preset.id);
  const clean: PovPreset = {
    id: preset.id,
    name: preset.name.trim() || preset.id,
    content: preset.content,
  };
  hlog.debug(userId, `savePovPreset: id="${clean.id}" name="${clean.name}" contentLen=${clean.content.length}`);
  await spindle.userStorage.setJson(povPath(clean.id), clean, { userId });
}

export async function deletePovPreset(userId: string, id: string): Promise<void> {
  if (isBuiltInPovPresetId(id)) {
    throw new Error(`Cannot delete built-in POV preset "${id}".`);
  }
  assertSafeCustomId(id);
  hlog.debug(userId, `deletePovPreset: id="${id}"`);
  await spindle.userStorage.delete(povPath(id), userId);
}

export async function duplicatePovPreset(
  userId: string,
  sourceId: string
): Promise<PovPreset> {
  const source = await getPovPreset(userId, sourceId);
  if (!source) {
    throw new Error(`POV preset "${sourceId}" not found`);
  }
  const newName = `${source.name} (Copy)`;
  const newId = await uniqueId(userId, newName);
  const copy: PovPreset = { id: newId, name: newName, content: source.content };
  await savePovPreset(userId, copy);
  hlog.debug(
    userId,
    `duplicatePovPreset: "${source.name}" (${sourceId}) -> "${newName}" (${newId})`
  );
  return copy;
}

export async function resolvePovContent(userId: string, id: string): Promise<string> {
  const preset = await getPovPreset(userId, id);
  if (preset) return preset.content;
  const fallback = getBuiltInPovPreset(DEFAULT_POV_PRESET_ID);
  hlog.debug(
    userId,
    `resolvePovContent: id="${id}" not found; falling back to "${DEFAULT_POV_PRESET_ID}"`
  );
  return fallback?.content ?? "";
}
