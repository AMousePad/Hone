import type { PovPreset, PovPresetSummary } from "../types";
import { createResourceService } from "./resource-service";

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

const service = createResourceService<PovPreset, PovPresetSummary>({
  kind: "POV preset",
  prefix: "pov-presets/",
  builtIns: BUILTIN_POV_PRESETS,
  summarize: (item, builtIn) => ({
    id: item.id,
    name: item.name,
    content: item.content,
    builtIn,
  }),
  normalize: (raw, id) => {
    if (!raw || typeof raw !== "object") return null;
    const v = raw as Partial<PovPreset>;
    if (typeof v.name !== "string" || typeof v.content !== "string") return null;
    return { id, name: v.name, content: v.content };
  },
  buildCopy: (source, newId, newName) => ({
    id: newId,
    name: newName,
    content: source.content,
  }),
  validateSave: (item) => {
    if (typeof item.name !== "string" || typeof item.content !== "string") {
      throw new Error("POV preset requires name and content strings");
    }
  },
});

export function listPovPresets(userId: string) {
  return service.list(userId);
}

export function getPovPreset(userId: string, id: string) {
  return service.get(userId, id);
}

export function savePovPreset(userId: string, preset: PovPreset) {
  return service.save(userId, { ...preset, name: preset.name.trim() || preset.id });
}

export function deletePovPreset(userId: string, id: string) {
  return service.delete(userId, id);
}

export function duplicatePovPreset(userId: string, sourceId: string) {
  return service.duplicate(userId, sourceId);
}

export function isBuiltInPovPresetId(id: string): boolean {
  return service.isBuiltIn(id);
}

export async function resolvePovContent(userId: string, id: string): Promise<string> {
  const preset = await service.get(userId, id);
  if (preset) return preset.content;
  const fallback = service.getBuiltIn(DEFAULT_POV_PRESET_ID);
  return fallback?.content ?? "";
}
