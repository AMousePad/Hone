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
} from "../types";
import { BUILTIN_PRESETS, getBuiltInPreset, isBuiltInPresetId } from "../preset-defaults";
import { HEAD_COLLECTION_ID } from "../constants";
import { createResourceService } from "./resource-service";

export { isBuiltInPresetId };

function requireString(v: unknown, path: string): string {
  if (typeof v !== "string") throw new Error(`Invalid preset: expected string at ${path}`);
  return v;
}

function requireArray(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) throw new Error(`Invalid preset: expected array at ${path}`);
  return v;
}

function normalizePrompt(raw: unknown, path: string): Prompt {
  if (!raw || typeof raw !== "object") throw new Error(`Invalid preset: expected object at ${path}`);
  const p = raw as Partial<Prompt>;
  return {
    id: requireString(p.id, `${path}.id`),
    name: requireString(p.name, `${path}.name`),
    content: typeof p.content === "string" ? p.content : "",
  };
}

function normalizeRow(raw: unknown, path: string): MessageRow {
  if (!raw || typeof raw !== "object") throw new Error(`Invalid preset: expected object at ${path}`);
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
  if (!raw || typeof raw !== "object") throw new Error(`Invalid preset: expected object at ${path}`);
  const s = raw as Partial<Stage>;
  return {
    id: requireString(s.id, `${path}.id`),
    name: requireString(s.name, `${path}.name`),
    rows: requireArray(s.rows, `${path}.rows`).map((r, i) => normalizeRow(r, `${path}.rows[${i}]`)),
    modelProfileId:
      typeof s.modelProfileId === "string" && s.modelProfileId.length > 0 ? s.modelProfileId : undefined,
  };
}

function normalizePipeline(raw: unknown, path: string): Pipeline {
  if (!raw || typeof raw !== "object") throw new Error(`Invalid preset: expected object at ${path}`);
  const p = raw as Partial<Pipeline>;
  return {
    stages: requireArray(p.stages, `${path}.stages`).map((s, i) => normalizeStage(s, `${path}.stages[${i}]`)),
  };
}

function normalizeShieldConfig(raw: unknown): import("../types").ShieldConfig | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "object") throw new Error(`Invalid preset: "shieldConfig" must be an object`);
  const c = raw as { include?: unknown; exclude?: unknown };
  const asStrings = (v: unknown, path: string): string[] => {
    if (v === undefined) return [];
    if (!Array.isArray(v)) throw new Error(`Invalid preset: "shieldConfig.${path}" must be an array of strings`);
    return v.map((s, i) => {
      if (typeof s !== "string") throw new Error(`Invalid preset: "shieldConfig.${path}[${i}]" must be a string`);
      return s;
    });
  };
  return { include: asStrings(c.include, "include"), exclude: asStrings(c.exclude, "exclude") };
}

function normalizeParallel(raw: unknown, path: string): ParallelConfig {
  if (!raw || typeof raw !== "object") throw new Error(`Invalid preset: expected object at ${path}`);
  const c = raw as Partial<ParallelConfig>;
  return {
    proposals: requireArray(c.proposals, `${path}.proposals`).map((p, i) =>
      normalizePipeline(p, `${path}.proposals[${i}]`)
    ),
    aggregator: normalizePipeline(c.aggregator, `${path}.aggregator`),
  };
}

export function normalizePreset(raw: unknown): HonePreset {
  if (!raw || typeof raw !== "object") throw new Error("Invalid preset: not an object");
  const p = raw as Partial<HonePreset>;
  const strategy = requireString(p.strategy, "strategy") as StrategyKind;
  if (strategy !== "pipeline" && strategy !== "parallel") {
    throw new Error(`Invalid preset: unknown strategy "${strategy}"`);
  }
  if (p.slot !== "input" && p.slot !== "output") {
    throw new Error(`Invalid preset: slot must be "input" or "output"`);
  }
  const prompts = requireArray(p.prompts, "prompts").map((pr, i) => normalizePrompt(pr, `prompts[${i}]`));
  const seenPromptIds = new Set<string>();
  for (const pr of prompts) {
    if (seenPromptIds.has(pr.id)) throw new Error(`Invalid preset: duplicate prompt id "${pr.id}" in prompts`);
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
    if (!p.pipeline) throw new Error("Invalid preset: `pipeline` required when strategy is 'pipeline'");
    preset.pipeline = normalizePipeline(p.pipeline, "pipeline");
  } else {
    if (!p.parallel) throw new Error("Invalid preset: `parallel` required when strategy is 'parallel'");
    preset.parallel = normalizeParallel(p.parallel, "parallel");
  }
  const pipelines: Pipeline[] =
    strategy === "pipeline"
      ? [preset.pipeline!]
      : [...preset.parallel!.proposals, preset.parallel!.aggregator];
  for (const [pipeIdx, pipe] of pipelines.entries()) {
    for (const [stIdx, st] of pipe.stages.entries()) {
      for (const [rowIdx, row] of st.rows.entries()) {
        for (const [pidIdx, pid] of row.promptIds.entries()) {
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

function deepCloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

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

const service = createResourceService<HonePreset, PresetSummary>({
  kind: "preset",
  prefix: "presets/",
  builtIns: BUILTIN_PRESETS,
  summarize: (item, builtIn) => ({
    id: item.id,
    name: item.name,
    builtIn,
    strategy: item.strategy,
    slot: item.slot,
  }),
  normalize: (raw, id) => {
    if (!raw || typeof raw !== "object") return null;
    const candidate = { ...(raw as object), id };
    return normalizePreset(candidate);
  },
  buildCopy: (source, newId, newName) => ({
    ...deepCloneJson(source),
    id: newId,
    name: newName,
    builtIn: false,
  }),
  validateSave: (item) => {
    normalizePreset({ ...item, builtIn: false });
  },
});

export function listPresets(userId: string): Promise<PresetSummary[]> {
  return service.list(userId);
}

export function getPreset(userId: string, id: string): Promise<HonePreset | null> {
  return service.get(userId, id);
}

export async function savePreset(userId: string, preset: HonePreset): Promise<void> {
  await service.save(userId, { ...preset, builtIn: false });
}

export function deletePreset(userId: string, id: string): Promise<void> {
  return service.delete(userId, id);
}

export function duplicatePreset(userId: string, id: string): Promise<HonePreset> {
  return service.duplicate(userId, id);
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
  const preset = await service.get(userId, id);
  if (!preset) throw new Error(`Preset "${id}" not found`);
  const portable = stripStageModelProfiles(deepCloneJson(preset));
  const blob: PresetExportBlob = {
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    preset: { ...portable, builtIn: false },
  };
  return { id: preset.id, name: preset.name, json: JSON.stringify(blob, null, 2) };
}

export async function importPreset(
  userId: string,
  json: string,
  targetSlot: PresetSlot
): Promise<HonePreset> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new Error(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!parsed || typeof parsed !== "object") throw new Error("Preset file is not a JSON object");
  const blob = parsed as Partial<PresetExportBlob>;
  if (blob.formatVersion !== EXPORT_FORMAT_VERSION) {
    throw new Error(`Unsupported preset format version: ${blob.formatVersion} (expected ${EXPORT_FORMAT_VERSION})`);
  }
  if (!blob.preset) throw new Error("Export blob is missing `preset` field");
  const withSlot = { ...(blob.preset as object), slot: targetSlot };
  const validated = normalizePreset(withSlot);
  const newId = await service.nextId(userId, validated.name || validated.id);
  const toSave: HonePreset = stripStageModelProfiles({ ...validated, id: newId, builtIn: false, slot: targetSlot });
  await service.save(userId, toSave);
  return toSave;
}

export { getBuiltInPreset };
