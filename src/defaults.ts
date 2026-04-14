import type { HoneSettings } from "./types";
import { DEFAULT_ACTIVE_PRESET_ID, DEFAULT_INPUT_ACTIVE_PRESET_ID } from "./preset-defaults";
import { DEFAULT_PROFILE_ID } from "./constants";

/** Fresh-user defaults. Every field in HoneSettings must appear here;
 *  `mergeSettingsWithDefaults` uses this as the shape source when
 *  merging partials from disk. */
export const DEFAULT_SETTINGS: HoneSettings = {
  enabled: true,
  autoRefine: false,
  activeModelProfileId: DEFAULT_PROFILE_ID,

  currentPresetId: DEFAULT_ACTIVE_PRESET_ID,
  currentInputPresetId: DEFAULT_INPUT_ACTIVE_PRESET_ID,

  pov: "auto",
  autoShowDiff: true,

  userEnhanceEnabled: true,
  userAutoEnhance: false,
  userEnhanceMode: "post",
  userPov: "1st",

  maxLorebookTokens: 50000,
  maxMessageContextTokens: 4000,

  generationTimeoutSecs: 120,
  minCharThreshold: 20,

  batchIntervalMs: 2000,

  notificationSoundEnabled: false,
  notificationSoundUrl: "",

  floatWidgetConfirm: false,
  floatWidgetHidden: false,
  floatWidgetSize: 124,
  floatWidgetLumiaMode: true,

  debugLogging: false,
  debugLogMaxEntries: 2000,
  debugLogFullPayloads: false,
};
