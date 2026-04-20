declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

import type { HoneSettings, ReasoningConfig, GenerationParams } from "../types";
import { DEFAULT_PROFILE_ID, getDefaultProfile, getModelProfile } from "../resources/model-profiles";
import { updateSettings } from "../storage/settings";
import { buildGenerationParameters } from "../generation";
import * as hlog from "../hlog";

export interface ResolvedModel {
  connectionProfileId: string;
  parameters: Record<string, unknown> | undefined;
  reasoning: ReasoningConfig;
}

export async function resolveProfile(
  profileId: string | undefined,
  userId: string,
  onMissingClear?: () => Promise<void>
): Promise<ResolvedModel> {
  let profile;
  if (!profileId || profileId === DEFAULT_PROFILE_ID) {
    profile = getDefaultProfile();
    hlog.debug(userId, `resolveProfile: id="${profileId || ""}" is default/empty -> virtual Default profile`);
  } else {
    const loaded = await getModelProfile(userId, profileId);
    if (loaded) {
      profile = loaded;
    } else {
      profile = getDefaultProfile();
      hlog.debug(
        userId,
        `resolveProfile: id="${profileId}" no longer exists, falling back to Default${onMissingClear ? " and clearing activeModelProfileId" : ""}`
      );
      spindle.log.warn(`[Hone] model profile "${profileId}" no longer exists; falling back to Default`);
      if (onMissingClear) await onMissingClear();
    }
  }

  const parameters = buildGenerationParameters(profile.samplers);
  hlog.debug(
    userId,
    `resolveProfile: id="${profileId || "(default)"}" -> "${profile.name}" connection="${profile.connectionProfileId || "(default)"}" samplers=${JSON.stringify(parameters ?? {})} reasoning=${JSON.stringify(profile.reasoning)}`
  );

  return {
    connectionProfileId: profile.connectionProfileId,
    parameters,
    reasoning: profile.reasoning,
  };
}

export async function resolveModel(settings: HoneSettings, userId: string): Promise<ResolvedModel> {
  return resolveProfile(settings.activeModelProfileId, userId, async () => {
    hlog.debug(userId, `resolveModel: clearing dangling activeModelProfileId -> DEFAULT_PROFILE_ID`);
    await updateSettings(userId, { activeModelProfileId: DEFAULT_PROFILE_ID });
  });
}

export function injectReasoningParams(
  base: Record<string, unknown> | undefined,
  reasoning: ReasoningConfig
): Record<string, unknown> | undefined {
  if (!reasoning.requestReasoning) return base;
  const params: Record<string, unknown> = { ...(base ?? {}) };
  if (!params.thinking) {
    params.thinking = { type: "adaptive" };
    const effort = reasoning.reasoningEffort;
    const valid = new Set(["low", "medium", "high", "max"]);
    params.output_config = { effort: valid.has(effort) ? effort : "high" };
  }
  return params;
}

export type { GenerationParams };
