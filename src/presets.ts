declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

import type {
  HonePreset,
  PresetSummary,
  PresetSlot,
  Prompt,
  Pipeline,
  Stage,
  MessageRow,
  ParallelConfig,
  StrategyKind,
} from "./types";
import { BUILTIN_PRESETS, getBuiltInPreset, isBuiltInPresetId } from "./preset-defaults";
import { HEAD_COLLECTION_ID } from "./constants";
import * as hlog from "./hlog";

/**
 * Custom presets live at `presets/<id>.json` in per-user storage.
 * Built-ins are in-code constants (see preset-defaults.ts); never
 * written to disk, never overwritable by a user save. list/get union
 * both sources.
 *
 * Preset ids: built-in slugs, or custom slugs derived from the user
 * name via `slugifyId` with numeric suffixes on collision.
 */

const PRESETS_PREFIX = "presets/";

function presetPath(id: string): string {
  return `${PRESETS_PREFIX}${id}.json`;
}

function slugifyId(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "preset";
}

async function uniqueId(userId: string, base: string): Promise<string> {
  const slug = slugifyId(base);
  const existing = new Set<string>();
  for (const bp of BUILTIN_PRESETS) existing.add(bp.id);
  const customIds = await listCustomIds(userId);
  for (const id of customIds) existing.add(id);
  if (!existing.has(slug)) return slug;
  let i = 2;
  while (existing.has(`${slug}-${i}`)) i++;
  return `${slug}-${i}`;
}

async function listCustomIds(userId: string): Promise<string[]> {
  try {
    const files = await spindle.userStorage.list(PRESETS_PREFIX, userId);
    return files
      .map((f: string) => f.replace(/\\/g, "/"))
      .filter((f: string) => /^[^/]+\.json$/.test(f))
      .map((f: string) => f.replace(/\.json$/, ""));
  } catch {
    return [];
  }
}

/** Built-ins first, custom presets sorted by name. */
export async function listPresets(userId: string): Promise<PresetSummary[]> {
  hlog.debug(userId, `listPresets: start`);
  const summaries: PresetSummary[] = BUILTIN_PRESETS.map((p) => ({
    id: p.id,
    name: p.name,
    builtIn: true,
    strategy: p.strategy,
    slot: p.slot,
  }));

  const customIds = await listCustomIds(userId);
  hlog.debug(userId, `listPresets: ${BUILTIN_PRESETS.length} built-in, ${customIds.length} custom on disk`);
  const customs: PresetSummary[] = [];
  for (const id of customIds) {
    try {
      const full = await spindle.userStorage.getJson<HonePreset | null>(
        presetPath(id),
        { fallback: null, userId }
      );
      if (
        full &&
        typeof full === "object" &&
        !Array.isArray(full) &&
        full.id &&
        full.name &&
        full.strategy &&
        (full.slot === "input" || full.slot === "output")
      ) {
        customs.push({
          id: full.id,
          name: full.name,
          builtIn: false,
          strategy: full.strategy,
          slot: full.slot,
        });
      } else if (full) {
        hlog.debug(userId, `listPresets: skipping "${id}": malformed preset shape`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      spindle.log.warn(`[Hone] failed to load preset summary for ${id}: ${message}`);
      hlog.debug(userId, `listPresets: failed to load custom preset "${id}": ${message}`);
    }
  }
  customs.sort((a, b) => a.name.localeCompare(b.name));
  hlog.debug(userId, `listPresets: returning ${summaries.length + customs.length} total (${summaries.length} built-in + ${customs.length} custom)`);
  return [...summaries, ...customs];
}

/** Returns null when neither built-in nor custom storage has the id. */
export async function getPreset(userId: string, id: string): Promise<HonePreset | null> {
  hlog.debug(userId, `getPreset: id="${id}"`);
  const builtin = getBuiltInPreset(id);
  if (builtin) {
    hlog.debug(userId, `getPreset: resolved built-in "${builtin.name}" strategy=${builtin.strategy} prompts=${builtin.prompts.length}`);
    return builtin;
  }
  try {
    const custom = await spindle.userStorage.getJson<HonePreset | null>(
      presetPath(id),
      { fallback: null, userId }
    );
    if (custom) {
      const normalized = normalizePreset(custom);
      hlog.debug(userId, `getPreset: loaded custom "${normalized.name}" strategy=${normalized.strategy} prompts=${normalized.prompts.length}`);
      return normalized;
    }
    hlog.debug(userId, `getPreset: id="${id}" not found on disk`);
    return null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    spindle.log.warn(`[Hone] failed to load preset ${id}: ${message}`);
    hlog.debug(userId, `getPreset: FAILED to load "${id}": ${message}`);
    return null;
  }
}

/** Throws on built-in ids; caller must slugify/duplicate first. */
export async function savePreset(
  userId: string,
  preset: HonePreset
): Promise<void> {
  hlog.debug(userId, `savePreset: id="${preset.id}" name="${preset.name}" strategy=${preset.strategy} prompts=${preset.prompts.length}`);
  if (isBuiltInPresetId(preset.id)) {
    hlog.debug(userId, `savePreset: REJECTED: "${preset.id}" is a built-in id`);
    throw new Error(
      `Cannot save over built-in preset "${preset.id}"; duplicate it first.`
    );
  }
  // Validate at the write boundary so malformed presets never hit disk.
  const validated = normalizePreset({ ...preset, builtIn: false });
  const clean: HonePreset = { ...validated, id: preset.id, builtIn: false };
  await spindle.userStorage.setJson(presetPath(preset.id), clean, { userId });
  hlog.debug(userId, `savePreset: written to disk at ${presetPath(preset.id)}`);
}

export async function deletePreset(userId: string, id: string): Promise<void> {
  hlog.debug(userId, `deletePreset: id="${id}"`);
  if (isBuiltInPresetId(id)) {
    hlog.debug(userId, `deletePreset: REJECTED: "${id}" is a built-in id`);
    throw new Error(`Cannot delete built-in preset "${id}".`);
  }
  await spindle.userStorage.delete(presetPath(id), userId);
  hlog.debug(userId, `deletePreset: deleted ${presetPath(id)}`);
}

/** Duplicate a preset (built-in OR custom) as a new custom preset. */
export async function duplicatePreset(
  userId: string,
  id: string
): Promise<HonePreset> {
  hlog.debug(userId, `duplicatePreset: source id="${id}"`);
  const source = await getPreset(userId, id);
  if (!source) {
    hlog.debug(userId, `duplicatePreset: source "${id}" not found`);
    throw new Error(`Preset "${id}" not found`);
  }
  const newName = `${source.name} (Copy)`;
  const newId = await uniqueId(userId, newName);
  const copy: HonePreset = {
    ...deepCloneJson(source),
    id: newId,
    name: newName,
    builtIn: false,
    slot: source.slot,
  };
  await savePreset(userId, copy);
  hlog.debug(userId, `duplicatePreset: created "${newName}" (id="${newId}") from "${source.name}"`);
  return copy;
}

const EXPORT_FORMAT_VERSION = 1;

export interface PresetExportBlob {
  formatVersion: number;
  exportedAt: string;
  preset: HonePreset;
}

export async function exportPreset(
  userId: string,
  id: string
): Promise<{ id: string; name: string; json: string }> {
  hlog.debug(userId, `exportPreset: id="${id}"`);
  const preset = await getPreset(userId, id);
  if (!preset) {
    hlog.debug(userId, `exportPreset: "${id}" not found`);
    throw new Error(`Preset "${id}" not found`);
  }
  // Strip per-stage modelProfileId: profile ids are instance-specific
  // and don't resolve on the importer's install.
  const portable = stripStageModelProfiles(deepCloneJson(preset));
  const blob: PresetExportBlob = {
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    preset: { ...portable, builtIn: false },
  };
  const json = JSON.stringify(blob, null, 2);
  hlog.debug(userId, `exportPreset: exported "${preset.name}": ${json.length} chars`);
  return { id: preset.id, name: preset.name, json };
}

/** Clear every `stage.modelProfileId`. Used at the export/import boundary. */
function stripStageModelProfiles(preset: HonePreset): HonePreset {
  const pipelines: Pipeline[] =
    preset.strategy === "pipeline"
      ? preset.pipeline
        ? [preset.pipeline]
        : []
      : preset.parallel
        ? [...preset.parallel.proposals, preset.parallel.aggregator]
        : [];
  for (const pipe of pipelines) {
    for (const stage of pipe.stages) {
      if (stage.modelProfileId !== undefined) delete stage.modelProfileId;
    }
  }
  return preset;
}

/** Slug-renames to avoid id collision; stamps `slot` from the import
 *  target. Rejects loudly on malformed input so the UI can show the
 *  exact parse/validation error. */
export async function importPreset(
  userId: string,
  json: string,
  targetSlot: PresetSlot
): Promise<HonePreset> {
  hlog.debug(userId, `importPreset: parsing ${json.length} chars`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    hlog.debug(userId, `importPreset: JSON parse FAILED: ${message}`);
    throw new Error(`Invalid JSON: ${message}`);
  }
  if (!parsed || typeof parsed !== "object") {
    hlog.debug(userId, `importPreset: parsed value is not an object`);
    throw new Error("Preset file is not a JSON object");
  }
  const blob = parsed as Partial<PresetExportBlob>;
  if (blob.formatVersion !== EXPORT_FORMAT_VERSION) {
    hlog.debug(userId, `importPreset: format version mismatch: got ${blob.formatVersion}, want ${EXPORT_FORMAT_VERSION}`);
    throw new Error(
      `Unsupported preset format version: ${blob.formatVersion} (expected ${EXPORT_FORMAT_VERSION})`
    );
  }
  if (!blob.preset) {
    hlog.debug(userId, `importPreset: missing preset field in blob`);
    throw new Error("Export blob is missing `preset` field");
  }
  hlog.debug(userId, `importPreset: validating preset name="${(blob.preset as any).name || "?"}" strategy="${(blob.preset as any).strategy || "?"}"`);
  // Stamp target slot BEFORE normalize so the slot requirement passes
  // regardless of what the exporter wrote. The target slot always wins:
  // users import into whichever slot they're currently viewing.
  const withSlot = { ...(blob.preset as any), slot: targetSlot };
  const validated = normalizePreset(withSlot);
  const newId = await uniqueId(userId, validated.name || validated.id);
  const toSave: HonePreset = stripStageModelProfiles({ ...validated, id: newId, builtIn: false, slot: targetSlot });
  await savePreset(userId, toSave);
  hlog.debug(userId, `importPreset: saved as "${toSave.name}" (id="${newId}") slot=${targetSlot}`);
  return toSave;
}

/**
 * Converts an untrusted input (import blob, on-disk custom preset) to a
 * validated HonePreset. Throws on any malformed field. This is the one
 * JSON -> HonePreset boundary; every other consumer can trust the shape.
 */

function requireString(v: unknown, path: string): string {
  if (typeof v !== "string") {
    throw new Error(`Invalid preset: expected string at ${path}`);
  }
  return v;
}

function requireArray(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) {
    throw new Error(`Invalid preset: expected array at ${path}`);
  }
  return v;
}

function normalizePrompt(raw: unknown, path: string): Prompt {
  if (!raw || typeof raw !== "object") {
    throw new Error(`Invalid preset: expected object at ${path}`);
  }
  const p = raw as Partial<Prompt>;
  return {
    id: requireString(p.id, `${path}.id`),
    name: requireString(p.name, `${path}.name`),
    content: typeof p.content === "string" ? p.content : "",
  };
}

function normalizeRow(raw: unknown, path: string): MessageRow {
  if (!raw || typeof raw !== "object") {
    throw new Error(`Invalid preset: expected object at ${path}`);
  }
  const r = raw as Partial<MessageRow>;
  const role = requireString(r.role, `${path}.role`);
  if (role !== "system" && role !== "user" && role !== "assistant") {
    throw new Error(`Invalid preset: unknown role "${role}" at ${path}.role`);
  }
  const promptIds = requireArray(r.promptIds, `${path}.promptIds`).map((id, i) =>
    requireString(id, `${path}.promptIds[${i}]`)
  );
  return { role, promptIds };
}

function normalizeStage(raw: unknown, path: string): Stage {
  if (!raw || typeof raw !== "object") {
    throw new Error(`Invalid preset: expected object at ${path}`);
  }
  const s = raw as Partial<Stage>;
  return {
    id: requireString(s.id, `${path}.id`),
    name: requireString(s.name, `${path}.name`),
    rows: requireArray(s.rows, `${path}.rows`).map((r, i) =>
      normalizeRow(r, `${path}.rows[${i}]`)
    ),
    modelProfileId:
      typeof s.modelProfileId === "string" && s.modelProfileId.length > 0
        ? s.modelProfileId
        : undefined,
  };
}

function normalizePipeline(raw: unknown, path: string): Pipeline {
  if (!raw || typeof raw !== "object") {
    throw new Error(`Invalid preset: expected object at ${path}`);
  }
  const p = raw as Partial<Pipeline>;
  return {
    stages: requireArray(p.stages, `${path}.stages`).map((s, i) =>
      normalizeStage(s, `${path}.stages[${i}]`)
    ),
  };
}

function normalizeShieldConfig(raw: unknown): import("./types").ShieldConfig | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "object") {
    throw new Error(`Invalid preset: "shieldConfig" must be an object`);
  }
  const c = raw as { include?: unknown; exclude?: unknown };
  const asStrings = (v: unknown, path: string): string[] => {
    if (v === undefined) return [];
    if (!Array.isArray(v)) {
      throw new Error(`Invalid preset: "shieldConfig.${path}" must be an array of strings`);
    }
    return v.map((s, i) => {
      if (typeof s !== "string") {
        throw new Error(`Invalid preset: "shieldConfig.${path}[${i}]" must be a string`);
      }
      return s;
    });
  };
  return {
    include: asStrings(c.include, "include"),
    exclude: asStrings(c.exclude, "exclude"),
  };
}

function normalizeParallel(raw: unknown, path: string): ParallelConfig {
  if (!raw || typeof raw !== "object") {
    throw new Error(`Invalid preset: expected object at ${path}`);
  }
  const c = raw as Partial<ParallelConfig>;
  return {
    proposals: requireArray(c.proposals, `${path}.proposals`).map((p, i) =>
      normalizePipeline(p, `${path}.proposals[${i}]`)
    ),
    aggregator: normalizePipeline(c.aggregator, `${path}.aggregator`),
  };
}

export function normalizePreset(raw: unknown): HonePreset {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid preset: not an object");
  }
  const p = raw as Partial<HonePreset>;
  const strategy = requireString(p.strategy, "strategy") as StrategyKind;
  if (strategy !== "pipeline" && strategy !== "parallel") {
    throw new Error(`Invalid preset: unknown strategy "${strategy}"`);
  }
  if (p.slot !== "input" && p.slot !== "output") {
    throw new Error(`Invalid preset: slot must be "input" or "output"`);
  }
  const prompts = requireArray(p.prompts, "prompts").map((pr, i) =>
    normalizePrompt(pr, `prompts[${i}]`)
  );
  // Duplicate prompt ids silently collapse at assembly time (Map dedupe).
  // Reject up front so the import error points at the real data problem.
  const seenPromptIds = new Set<string>();
  for (const pr of prompts) {
    if (seenPromptIds.has(pr.id)) {
      throw new Error(`Invalid preset: duplicate prompt id "${pr.id}" in prompts`);
    }
    seenPromptIds.add(pr.id);
  }
  const headCollection = requireArray(p.headCollection, "headCollection").map((id, i) =>
    requireString(id, `headCollection[${i}]`)
  );
  for (const [i, id] of headCollection.entries()) {
    if (id === HEAD_COLLECTION_ID) {
      throw new Error(`Invalid preset: headCollection[${i}] cannot reference itself ("${HEAD_COLLECTION_ID}")`);
    }
    if (!seenPromptIds.has(id)) {
      throw new Error(`Invalid preset: headCollection[${i}] references unknown prompt id "${id}"`);
    }
  }
  if (typeof p.shieldLiteralBlocks !== "boolean") {
    throw new Error(`Invalid preset: "shieldLiteralBlocks" must be boolean`);
  }
  const shieldConfig = normalizeShieldConfig(p.shieldConfig);
  const preset: HonePreset = {
    id: requireString(p.id, "id"),
    name: requireString(p.name, "name"),
    builtIn: false,
    slot: p.slot,
    prompts,
    headCollection,
    strategy,
    shieldLiteralBlocks: p.shieldLiteralBlocks,
    ...(shieldConfig ? { shieldConfig } : {}),
  };
  if (strategy === "pipeline") {
    if (!p.pipeline) {
      throw new Error("Invalid preset: `pipeline` required when strategy is 'pipeline'");
    }
    preset.pipeline = normalizePipeline(p.pipeline, "pipeline");
  } else {
    if (!p.parallel) {
      throw new Error("Invalid preset: `parallel` required when strategy is 'parallel'");
    }
    preset.parallel = normalizeParallel(p.parallel, "parallel");
  }
  // Every row's promptId must resolve in `prompts`. Previously these
  // were dropped silently at assembly; surfacing here makes corrupted
  // data fail at the import/save boundary instead.
  const pipelines: Pipeline[] =
    strategy === "pipeline"
      ? [preset.pipeline!]
      : [...preset.parallel!.proposals, preset.parallel!.aggregator];
  for (const [pipeIdx, pipe] of pipelines.entries()) {
    for (const [stIdx, st] of pipe.stages.entries()) {
      for (const [rowIdx, row] of st.rows.entries()) {
        for (const [pidIdx, pid] of row.promptIds.entries()) {
          // HEAD_COLLECTION_ID expands at assembly time; it has no
          // entry in `prompts` by construction.
          if (pid === HEAD_COLLECTION_ID) continue;
          if (!seenPromptIds.has(pid)) {
            throw new Error(
              `Invalid preset: row at pipeline[${pipeIdx}].stages[${stIdx}].rows[${rowIdx}].promptIds[${pidIdx}] references unknown prompt id "${pid}"`
            );
          }
        }
      }
    }
  }
  return preset;
}

/** Deep clone via JSON round-trip. Safe for preset data (plain
 *  strings/numbers/arrays, no functions, cycles, or dates). */
function deepCloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
