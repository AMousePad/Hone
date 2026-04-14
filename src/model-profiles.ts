declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

import type { ModelProfile, ModelProfileSummary, GenerationParams, ReasoningConfig } from "./types";
import { DEFAULT_PROFILE_ID } from "./constants";
import * as hlog from "./hlog";

export { DEFAULT_PROFILE_ID };

/**
 * Model profiles live at `model-profiles/<id>.json` in per-user
 * storage. Not exportable: they reference instance-specific
 * connection ids that won't resolve on another Lumiverse install.
 *
 * Bundles: a connection reference, sampler overrides, and reasoning
 * detection config. Per-profile samplers replace the old "one config
 * fits all" generation setup.
 */

const PROFILES_PREFIX = "model-profiles/";

function profilePath(id: string): string {
  return `${PROFILES_PREFIX}${id}.json`;
}

function slugifyId(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "profile";
}

async function listCustomIds(userId: string): Promise<string[]> {
  try {
    const keys = await spindle.userStorage.list(PROFILES_PREFIX, userId);
    return keys
      .filter((k) => k.endsWith(".json"))
      .map((k) => k.replace(PROFILES_PREFIX, "").replace(/\.json$/, ""));
  } catch {
    return [];
  }
}

async function uniqueId(userId: string, base: string): Promise<string> {
  const slug = slugifyId(base);
  const existing = new Set(await listCustomIds(userId));
  if (!existing.has(slug)) return slug;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${slug}-${i}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `${slug}-${Date.now().toString(36)}`;
}

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

export function createDefaultProfile(connectionProfileId: string, name: string): Omit<ModelProfile, "id"> {
  return {
    name,
    connectionProfileId,
    samplers: { ...DEFAULT_SAMPLERS },
    reasoning: { ...DEFAULT_REASONING },
  };
}

export async function listModelProfiles(userId: string): Promise<ModelProfileSummary[]> {
  hlog.debug(userId, `listModelProfiles: start`);
  const ids = await listCustomIds(userId);
  const summaries: ModelProfileSummary[] = [];
  for (const id of ids) {
    try {
      const profile = await spindle.userStorage.getJson<ModelProfile | null>(
        profilePath(id),
        { fallback: null, userId }
      );
      if (profile && profile.id && profile.name && profile.connectionProfileId) {
        summaries.push({
          id: profile.id,
          name: profile.name,
          connectionProfileId: profile.connectionProfileId,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      hlog.debug(userId, `listModelProfiles: failed to load "${id}": ${message}`);
    }
  }
  summaries.sort((a, b) => a.name.localeCompare(b.name));
  hlog.debug(userId, `listModelProfiles: returning ${summaries.length} profiles`);
  return summaries;
}

export async function getModelProfile(userId: string, id: string): Promise<ModelProfile | null> {
  hlog.debug(userId, `getModelProfile: id="${id}"`);
  try {
    const profile = await spindle.userStorage.getJson<ModelProfile | null>(
      profilePath(id),
      { fallback: null, userId }
    );
    if (!profile || !profile.id) {
      hlog.debug(userId, `getModelProfile: "${id}" not found or invalid`);
      return null;
    }
    hlog.debug(userId, `getModelProfile: loaded "${profile.name}" connection=${profile.connectionProfileId}`);
    return profile;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    hlog.debug(userId, `getModelProfile: FAILED for "${id}": ${message}`);
    return null;
  }
}

export async function saveModelProfile(userId: string, profile: ModelProfile): Promise<void> {
  hlog.debug(userId, `saveModelProfile: id="${profile.id}" name="${profile.name}"`);
  await spindle.userStorage.setJson(profilePath(profile.id), profile, { userId });
  hlog.debug(userId, `saveModelProfile: saved "${profile.name}"`);
}

export async function deleteModelProfile(userId: string, id: string): Promise<void> {
  hlog.debug(userId, `deleteModelProfile: id="${id}"`);
  try {
    await spindle.userStorage.delete(profilePath(id), userId);
    hlog.debug(userId, `deleteModelProfile: deleted "${id}"`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    hlog.debug(userId, `deleteModelProfile: FAILED for "${id}": ${message}`);
    throw err;
  }
}

export async function createModelProfile(
  userId: string,
  connectionProfileId: string,
  name: string
): Promise<ModelProfile> {
  const id = await uniqueId(userId, name);
  const profile: ModelProfile = {
    id,
    ...createDefaultProfile(connectionProfileId, name),
  };
  await saveModelProfile(userId, profile);
  hlog.debug(userId, `createModelProfile: created "${name}" (id="${id}") connection=${connectionProfileId}`);
  return profile;
}

export async function duplicateModelProfile(
  userId: string,
  sourceId: string
): Promise<ModelProfile | null> {
  const source = await getModelProfile(userId, sourceId);
  if (!source) {
    hlog.debug(userId, `duplicateModelProfile: source "${sourceId}" not found`);
    return null;
  }
  const newName = `${source.name} (Copy)`;
  const newId = await uniqueId(userId, newName);
  const duplicate: ModelProfile = {
    id: newId,
    name: newName,
    connectionProfileId: source.connectionProfileId,
    samplers: { ...source.samplers },
    reasoning: { ...source.reasoning },
  };
  await saveModelProfile(userId, duplicate);
  hlog.debug(userId, `duplicateModelProfile: "${source.name}" -> "${newName}" (id="${newId}")`);
  return duplicate;
}

/** The virtual default profile. Never stored; synthesized on demand.
 *  Empty `connectionProfileId` tells `resolveConnection` to pick the
 *  user's default Lumiverse connection. */
export function getDefaultProfile(): ModelProfile {
  return {
    id: DEFAULT_PROFILE_ID,
    name: "Default",
    connectionProfileId: "",
    samplers: { ...DEFAULT_SAMPLERS },
    reasoning: { ...DEFAULT_REASONING },
  };
}
