export interface HoneSettings {
  enabled: boolean;
  autoRefine: boolean;

  /** Active model profile id. `DEFAULT_PROFILE_ID` means the virtual
   *  Default profile (user's default Lumiverse connection, no sampler
   *  overrides, reasoning tags auto-stripped). */
  activeModelProfileId: string;

  /** Active output preset id. All AI-message refinement uses this
   *  preset's pipeline and prompt library. */
  currentPresetId: string;

  /** Active input preset id. User-message enhancement uses this
   *  preset's pipeline and prompt library. */
  currentInputPresetId: string;

  pov: string;
  autoShowDiff: boolean;

  userEnhanceEnabled: boolean;
  /** TODO(auto-enhance): feature not yet wired. See drawer.ts and
   *  input-area-injector.ts for the paused surfaces. */
  userAutoEnhance: boolean;
  /** TODO(auto-enhance): consumed once auto-enhance ships. */
  userEnhanceMode: EnhanceMode;
  userPov: string;

  /** Max tokens of lorebook content in refinement context. 0 = unlimited. */
  maxLorebookTokens: number;
  /** Max tokens of preceding chat history in refinement context.
   *  0 = unlimited. */
  maxMessageContextTokens: number;

  generationTimeoutSecs: number;
  minCharThreshold: number;

  batchIntervalMs: number;

  notificationSoundEnabled: boolean;
  notificationSoundUrl: string;

  /** Require a second tap on the floating widget before firing. */
  floatWidgetConfirm: boolean;
  /** Hide the floating widget. Drawer tab and settings stay reachable. */
  floatWidgetHidden: boolean;
  /** Widget diameter in pixels. Clamped 24–1920. */
  floatWidgetSize: number;
  /** Render the chibi artwork. When false, falls back to the classic
   *  icon pill. */
  floatWidgetLumiaMode: boolean;

  /** Per-user in-memory debug logging. See hlog.ts. */
  debugLogging: boolean;
  debugLogMaxEntries: number;
  /** When on full outgoing messages array and the full response content recorded */
  debugLogFullPayloads: boolean;
}

export type EnhanceMode = "pre" | "post" | "inplace";
export type StrategyKind = "pipeline" | "parallel";
export type MessageRole = "system" | "user" | "assistant";

/** Which preset slot an operation targets. */
export type PresetSlot = "output" | "input";

/**
 * A preset is the full, self-contained configuration of HOW a refinement
 * is performed. Presets decouple prompt library + pipeline shape from
 * user-global knobs (connection, POV, context sizing, automation) so
 * import/export is one blob and switching presets is a single pointer.
 *
 * Prompts are atomic named text blobs referenced by id from MessageRows.
 * A MessageRow is a role-tagged list of prompt ids concatenated into one
 * chat message at assembly time. Adjacent rows with the same role merge
 * with a `\n\n` separator. A Stage is one LLM call; a Pipeline is a
 * sequence of stages threading `{{latest}}` between them.
 *
 * Parallel strategy: N proposal pipelines run concurrently; an aggregator
 * pipeline consumes their outputs via `{{proposal_N}}` / `{{proposals}}`.
 */

export interface Prompt {
  id: string;
  name: string;
  content: string;
}

export interface MessageRow {
  role: MessageRole;
  promptIds: string[];
}

export interface Stage {
  id: string;
  name: string;
  rows: MessageRow[];
  /** Per-stage override. When set, the stage runs through this profile's
   *  connection, samplers, and reasoning config. When unset, inherits the
   *  preset-level active profile. */
  modelProfileId?: string;
}

export interface Pipeline {
  stages: Stage[];
}

export interface ParallelConfig {
  /** N individually-configurable proposal pipelines, fanned out
   *  concurrently against the original message. */
  proposals: Pipeline[];
  /** Aggregator pipeline. Receives proposal outputs via
   *  `{{proposal_N}}` / `{{proposals}}` macros. */
  aggregator: Pipeline;
}

export interface HonePreset {
  id: string;
  name: string;
  /** Built-in presets ship with the extension and cannot be edited.
   *  Built-ins live in `src/preset-defaults.ts`; they are never
   *  persisted to disk. */
  builtIn: boolean;
  slot: PresetSlot;
  prompts: Prompt[];
  /** Ordered prompt ids that the `HEAD_COLLECTION_ID` sentinel expands
   *  to at assembly time. Auto-seeded into the first user row of every
   *  new stage. */
  headCollection: string[];
  strategy: StrategyKind;
  /** Present when strategy === "pipeline". */
  pipeline?: Pipeline;
  /** Present when strategy === "parallel". */
  parallel?: ParallelConfig;
  /** Master switch for literal-block shielding. See text-utils.maskLiteralBlocks. */
  shieldLiteralBlocks: boolean;
  /** Per-preset regex overrides. Absent / empty arrays fall back to
   *  the built-in defaults. */
  shieldConfig?: ShieldConfig;
}

export interface ShieldConfig {
  include: string[];
  exclude: string[];
}

/** Inspectable output from a multi-stage strategy.
 *  - `step`: one stage of a sequential pipeline (or aggregator stage).
 *  - `proposal`: the final output of one parallel proposal pipeline.
 *  `(kind, index)` is the unique key. */
export type StageKind = "step" | "proposal";

export interface StageRecord {
  index: number;
  name: string;
  text: string;
  kind: StageKind;
}

export interface UndoEntry {
  /** Pre-refinement content. Immutable across stage flips; undo always
   *  restores to this. */
  originalContent: string;
  /** Currently-applied refined content. Matches the message's live
   *  content while the entry is active. */
  refinedContent: string;
  timestamp: number;
  strategy: string;
  swipeId: number;
  /** Inspectable stage outputs. Absent for single-strategy refinements.
   *  Lifetime bound to the undo entry (saveUndo overwrites, deleteUndo
   *  drops atomically). Pipeline stages land as `step`; parallel proposal
   *  finals as `proposal`; aggregator stages as `step`. */
  stages?: StageRecord[];
}

export interface ChatStats {
  messagesRefined: number;
  totalRefinements: number;
  byStrategy: Record<string, number>;
}

export interface PovPreset {
  id: string;
  name: string;
  content: string;
}

export interface PovPresetSummary extends PovPreset {
  builtIn: boolean;
}

export type FrontendToBackend =
  | { type: "refine"; messageId: string; chatId: string }
  | { type: "undo"; messageId: string; chatId: string }
  | { type: "bulk-refine"; messageIds: string[]; chatId: string }
  | { type: "enhance"; text: string; chatId: string; mode: EnhanceMode }
  | { type: "get-settings" }
  | { type: "update-settings"; settings: Partial<HoneSettings> }
  | { type: "get-stats"; chatId: string }
  | { type: "view-diff"; messageId: string; chatId: string }
  | { type: "list-presets" }
  | { type: "get-preset"; id: string }
  | { type: "save-preset"; preset: HonePreset }
  | { type: "delete-preset"; id: string }
  | { type: "duplicate-preset"; id: string; slot: PresetSlot }
  | { type: "set-active-preset"; id: string; slot: PresetSlot }
  | { type: "import-preset"; json: string; slot: PresetSlot }
  | { type: "export-preset"; id: string }
  | {
      type: "preview-stage";
      /** When set, preview uses this chat's latest assistant message so
       *  Lumiverse macros resolve against the real chat. When unset,
       *  placeholders fill every macro. */
      chatId?: string;
      path: PreviewPath;
      stageIndex: number;
      slot: PresetSlot;
    }
  | { type: "list-model-profiles" }
  | { type: "get-model-profile"; id: string }
  | { type: "create-model-profile"; connectionProfileId: string; name: string }
  | { type: "save-model-profile"; profile: ModelProfile }
  | { type: "delete-model-profile"; id: string }
  | { type: "duplicate-model-profile"; id: string }
  | { type: "list-pov-presets" }
  | { type: "save-pov-preset"; preset: PovPreset }
  | { type: "delete-pov-preset"; id: string }
  | { type: "duplicate-pov-preset"; id: string; slot: PresetSlot }
  | { type: "get-connections" }
  | { type: "refine-last" }
  | { type: "undo-last" }
  | { type: "refine-all" }
  | { type: "use-stage-version"; chatId: string; messageId: string; stageIndex: number; stageKind: StageKind }
  | { type: "get-active-chat" }
  | { type: "get-debug-logs" }
  | { type: "clear-debug-logs" }
  | { type: "log"; level: "warn" | "error"; msg: string };

export type PreviewPath =
  | { kind: "pipeline" }
  | { kind: "proposal"; proposalIndex: number }
  | { kind: "aggregator" };

export type BackendToFrontend =
  | { type: "settings"; settings: HoneSettings }
  | { type: "refine-started"; messageId: string }
  | { type: "refine-complete"; messageId: string; success: boolean }
  | { type: "refine-error"; messageId: string; error: string }
  | { type: "bulk-progress"; current: number; total: number; messageId: string }
  | { type: "bulk-complete"; succeeded: number; failed: number; total: number }
  | { type: "debug-logs"; formatted: string; count: number; capacity: number; enabled: boolean }
  | { type: "enhance-result"; text: string }
  | { type: "stats"; stats: ChatStats }
  | { type: "diff"; original: string; refined: string }
  | { type: "auto-refine-started"; messageId: string }
  | { type: "auto-refine-complete"; messageId: string; success: boolean }
  | { type: "presets"; presets: PresetSummary[]; activeId: string; activeInputId: string }
  | { type: "preset"; preset: HonePreset }
  | { type: "preset-exported"; id: string; name: string; json: string }
  | { type: "preset-import-result"; success: boolean; id?: string; error?: string }
  | { type: "pov-presets"; presets: PovPresetSummary[] }
  | { type: "pov-preset-error"; error: string }
  | {
      type: "preview-result";
      path: PreviewPath;
      stageIndex: number;
      messages: Array<{ role: MessageRole; content: string }>;
      diagnostics: Array<{ message: string }>;
    }
  | { type: "stage-complete"; messageId: string; stage: StageRecord }
  | { type: "model-profiles"; profiles: ModelProfileSummary[] }
  | { type: "model-profile"; profile: ModelProfile }
  | { type: "connections"; connections: ConnectionProfile[]; error?: string }
  | {
      type: "active-chat";
      chatId: string | null;
      lastMessageRefined?: boolean;
      lastAiMessageId?: string | null;
      lastAiStages?: StageRecord[];
      refinedMessageIds: string[];
    }
  | { type: "generation-state"; generating: boolean };

/** Lightweight preset summary for the preset bar dropdown. Avoids
 *  pushing the full HonePreset until the user selects one to edit. */
export interface PresetSummary {
  id: string;
  name: string;
  builtIn: boolean;
  strategy: StrategyKind;
  slot: PresetSlot;
}

export interface GenerationParams {
  temperature: number | null;
  maxTokens: number | null;
  contextSize: number | null;
  topP: number | null;
  minP: number | null;
  topK: number | null;
  frequencyPenalty: number | null;
  presencePenalty: number | null;
  repetitionPenalty: number | null;
}

export interface ConnectionProfile {
  id: string;
  name: string;
  provider: string;
  model: string;
  is_default: boolean;
  has_api_key: boolean;
}

/**
 * A ModelProfile bundles a connection with sampler overrides and
 * reasoning config. Stored per-user; not exportable (connection ids
 * are instance-specific).
 */

export type ReasoningEffort = "auto" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export interface ReasoningConfig {
  /** Strip `<think>` / `<thinking>` / `<reasoning>` tags from LLM output
   *  before extracting the refined text. Case-insensitive; handles
   *  unclosed tags. */
  stripCoTTags: boolean;
  /** Request the provider's native reasoning API (Anthropic `thinking`,
   *  Google `thinkingConfig`, OpenRouter/OpenAI `reasoning`). */
  requestReasoning: boolean;
  /** Reasoning effort. Provider-specific mapping:
   *   - Anthropic: auto, low, medium, high, max
   *   - Google:    auto, minimal, low, medium, high
   *   - OpenRouter: auto, none, minimal, low, medium, high, xhigh
   *   - OpenAI:    auto, low, medium, high, max */
  reasoningEffort: ReasoningEffort;
}

export interface ModelProfile {
  id: string;
  name: string;
  connectionProfileId: string;
  /** Sampler overrides. Null = use the connection's default. */
  samplers: GenerationParams;
  reasoning: ReasoningConfig;
}

export interface ModelProfileSummary {
  id: string;
  name: string;
  connectionProfileId: string;
}

/** Generation request for the assembled-messages path. `messages` is
 *  the full chat-format array built by the assembler. */
export interface GenerateRequest {
  messages: Array<{ role: MessageRole; content: string }>;
  connectionProfileId: string;
  timeoutSeconds: number;
  parameters?: Record<string, unknown>;
}

export interface GenerateResult {
  content: string;
  success: boolean;
  error?: string;
}
