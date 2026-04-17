import type { ModelProfile, ModelProfileSummary, GenerationParams, ReasoningConfig } from "../types";
import { DEFAULT_PROFILE_ID } from "../constants";
import { createResourceService } from "./resource-service";

export { DEFAULT_PROFILE_ID };

export const DEFAULT_SAMPLERS: GenerationParams = {
  temperature: null,
  maxTokens: null,
  contextSize: null,
  topP: null,
  minP: null,
  topK: null,
  frequencyPenalty: null,
  presencePenalty: null,
  repetitionPenalty: null,
};

export const DEFAULT_REASONING: ReasoningConfig = {
  stripCoTTags: true,
  requestReasoning: false,
  reasoningEffort: "auto",
};

export function getDefaultProfile(): ModelProfile {
  return {
    id: DEFAULT_PROFILE_ID,
    name: "Default",
    connectionProfileId: "",
    samplers: { ...DEFAULT_SAMPLERS },
    reasoning: { ...DEFAULT_REASONING },
  };
}

function normalizeSamplers(raw: unknown): GenerationParams {
  const out: GenerationParams = { ...DEFAULT_SAMPLERS };
  if (!raw || typeof raw !== "object") return out;
  const s = raw as Record<string, unknown>;
  for (const key of Object.keys(out) as Array<keyof GenerationParams>) {
    const v = s[key];
    out[key] = typeof v === "number" ? v : null;
  }
  return out;
}

function normalizeReasoning(raw: unknown): ReasoningConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_REASONING };
  const r = raw as Partial<ReasoningConfig>;
  return {
    stripCoTTags: typeof r.stripCoTTags === "boolean" ? r.stripCoTTags : DEFAULT_REASONING.stripCoTTags,
    requestReasoning: typeof r.requestReasoning === "boolean" ? r.requestReasoning : DEFAULT_REASONING.requestReasoning,
    reasoningEffort: (r.reasoningEffort as ReasoningConfig["reasoningEffort"]) ?? DEFAULT_REASONING.reasoningEffort,
  };
}

const service = createResourceService<ModelProfile, ModelProfileSummary & { builtIn: boolean }>({
  kind: "model profile",
  prefix: "model-profiles/",
  builtIns: [],
  summarize: (item, builtIn) => ({
    id: item.id,
    name: item.name,
    connectionProfileId: item.connectionProfileId,
    builtIn,
  }),
  normalize: (raw, id) => {
    if (!raw || typeof raw !== "object") return null;
    const p = raw as Partial<ModelProfile>;
    if (typeof p.name !== "string" || typeof p.connectionProfileId !== "string") return null;
    return {
      id,
      name: p.name,
      connectionProfileId: p.connectionProfileId,
      samplers: normalizeSamplers(p.samplers),
      reasoning: normalizeReasoning(p.reasoning),
    };
  },
  buildCopy: (source, newId, newName) => ({
    id: newId,
    name: newName,
    connectionProfileId: source.connectionProfileId,
    samplers: { ...source.samplers },
    reasoning: { ...source.reasoning },
  }),
});

export async function listModelProfiles(userId: string): Promise<ModelProfileSummary[]> {
  const summaries = await service.list(userId);
  return summaries.map((s) => ({ id: s.id, name: s.name, connectionProfileId: s.connectionProfileId }));
}

export function getModelProfile(userId: string, id: string) {
  return service.get(userId, id);
}

export function saveModelProfile(userId: string, profile: ModelProfile) {
  return service.save(userId, profile);
}

export function deleteModelProfile(userId: string, id: string) {
  return service.delete(userId, id);
}

export function duplicateModelProfile(userId: string, sourceId: string) {
  return service.duplicate(userId, sourceId);
}

export async function createModelProfile(
  userId: string,
  connectionProfileId: string,
  name: string
): Promise<ModelProfile> {
  const id = await service.nextId(userId, name);
  const profile: ModelProfile = {
    id,
    name,
    connectionProfileId,
    samplers: { ...DEFAULT_SAMPLERS },
    reasoning: { ...DEFAULT_REASONING },
  };
  await service.save(userId, profile);
  return profile;
}
