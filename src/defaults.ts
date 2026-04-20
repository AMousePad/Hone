import type { HoneSettings } from "./types";
import { DEFAULT_ACTIVE_PRESET_ID, DEFAULT_INPUT_ACTIVE_PRESET_ID } from "./preset-defaults";
import { DEFAULT_PROFILE_ID } from "./constants";
import { DEFAULT_POV_PRESET_ID, DEFAULT_USER_POV_PRESET_ID } from "./resources/pov-presets";

/** Fresh-user defaults. Every field in HoneSettings must appear here;
 *  `mergeSettingsWithDefaults` uses this as the shape source when
 *  merging partials from disk. */
export const DEFAULT_SETTINGS: HoneSettings = {
  enabled: true,
  autoRefine: false,
  activeModelProfileId: DEFAULT_PROFILE_ID,

  currentPresetId: DEFAULT_ACTIVE_PRESET_ID,
  currentInputPresetId: DEFAULT_INPUT_ACTIVE_PRESET_ID,

  pov: DEFAULT_POV_PRESET_ID,
  autoShowDiff: true,

  userEnhanceEnabled: true,
  userAutoEnhance: false,
  userEnhanceMode: "post",
  userPov: DEFAULT_USER_POV_PRESET_ID,

  maxLorebookTokens: 50000,
  maxMessageContextTokens: 4000,

  streamGenerations: true,
  ttftTimeoutSecs: 480,
  totalTimeoutSecs: 900,
  minCharThreshold: 20,

  batchIntervalMs: 2000,

  notificationSoundEnabled: false,
  notificationSoundUrl: "",

  floatWidgetConfirm: false,
  floatWidgetHidden: false,
  floatWidgetSize: 124,
  floatWidgetLumiaMode: true,
  floatWidgetX: null,
  floatWidgetY: null,

  debugLogging: false,
  debugLogMaxEntries: 20000,
  debugLogFullPayloads: false,
};
