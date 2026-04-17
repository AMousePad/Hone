declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

import type {
  HoneSettings,
  UndoEntry,
  BackendToFrontend,
  HonePreset,
  Pipeline,
  Stage,
  StageRecord,
  GenerateRequest,
  ReasoningConfig,
} from "./types";
import {
  maskLiteralBlocks,
  unmaskLiteralBlocks,
  substituteShields,
  extractRefinedContent,
  removeCoTTags,
} from "./text-utils";
import {
  buildChatHistoryBlock,
  approxTokens,
} from "./prompt-builder";
import { resolvePovContent } from "./pov-presets";
import { generate, buildGenerationParameters } from "./generation";
import { getSettings, updateSettings } from "./settings";
import { getPreset } from "./presets";
import { getModelProfile, getDefaultProfile, DEFAULT_PROFILE_ID } from "./model-profiles";
import { assembleStage, type AssembleContext } from "./assemble";
import {
  saveUndo,
  getUndo,
  deleteUndo,
  incrementStats,
} from "./history";
import { enqueueChatOperation } from "./chat-queue";
import { fetchLoreContents, assembleLoreBlock } from "./lore";
import * as hlog from "./hlog";

type SendFn = (msg: BackendToFrontend) => void;

/** Fallback token cap for message-history context when
 *  `settings.maxMessageContextTokens` is zero/unset. */
const DEFAULT_MESSAGE_CONTEXT_TOKENS = 4000;

async function getMessages(chatId: string) {
  return spindle.chat.getMessages(chatId);
}

async function updateMessage(chatId: string, messageId: string, patch: { content?: string; metadata?: Record<string, unknown> }): Promise<void> {
  return spindle.chat.updateMessage(chatId, messageId, patch);
}

async function getChat(chatId: string, userId: string) {
  return spindle.chats.get(chatId, userId);
}

/** Most recent assistant message at or before `fromIndex`. */
function findLastAssistantMessage<
  T extends { role: string },
>(messages: T[], fromIndex: number): { message: T; index: number } | null {
  for (let i = Math.min(fromIndex, messages.length - 1); i >= 0; i--) {
    if (messages[i].role === "assistant") {
      return { message: messages[i], index: i };
    }
  }
  return null;
}

/** Resolves to empty when no blocks were shielded so the macro
 *  costs zero tokens on the no-scaffolding path. */
function buildShieldPreservationNote(
  blocks: ReadonlyArray<{ placeholder: string }>
): string {
  if (blocks.length === 0) return "";
  const tokens = blocks.map((b) => b.placeholder).join(", ");
  return (
    `IMPORTANT: opaque placeholder tokens: ${tokens}. ` +
    "Include each of these tokens through to your output EXACTLY as-is. " +
    "Do not edit, translate, reformat, split across lines, quote, or remove them. " +
    "They stand in for scaffolding that must round-trip unchanged."
  );
}

/** Best-effort lorebook fetch. Errors are non-fatal. */
async function fetchLoreBlock(
  chatId: string,
  userId: string,
  maxLorebookTokens: number
): Promise<{ block: string; activated: number; fetched: number }> {
  try {
    const activated = await spindle.world_books.getActivated(chatId, userId);
    if (!activated || activated.length === 0) {
      return { block: "", activated: 0, fetched: 0 };
    }
    const contents = await fetchLoreContents(activated.map((e) => e.id), (id) =>
      spindle.world_books.entries.get(id, userId)
    );
    return {
      block: assembleLoreBlock(contents, maxLorebookTokens),
      activated: activated.length,
      fetched: contents.length,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    hlog.debug(userId, `fetchLoreBlock: failed (non-fatal): ${errMsg}`);
    return { block: "", activated: 0, fetched: 0 };
  }
}

/** Load the message being refined plus everything needed for assembly.
 *
 *  Handles both refinement modes:
 *   - Output (assistant message): `{{latest}}` = this AI message's
 *     content (threaded across stages). `{{userMessage}}` = "".
 *   - Input post-send (user message): `{{latest}}` = the most recent
 *     AI message in chat *before* this user message (static).
 *     `{{userMessage}}` = this user message's content.
 *
 *  `{{context}}` excludes the `{{latest}}` message; its token budget
 *  is `maxMessageHistoryTokens - tokens(latest)`. Character / persona
 *  / etc. flow through Lumiverse native macros, not `{{context}}`. */
async function buildContext(
  chatId: string,
  messageId: string,
  userId: string,
  settings: HoneSettings
) {
  const messages = await getMessages(chatId);
  const msgIndex = messages.findIndex((m) => m.id === messageId);
  const message = messages[msgIndex];

  if (!message) {
    throw new Error(`Message ${messageId} not found in chat ${chatId}`);
  }

  const chat = await getChat(chatId, userId);
  const characterId = chat?.character_id || undefined;

  const isUserMessage = message.role === "user";

  let latest: string;
  let latestId: string | null;
  if (isUserMessage) {
    const prior = findLastAssistantMessage(messages, msgIndex - 1);
    latest = prior?.message.content || "";
    latestId = prior?.message.id || null;
  } else {
    latest = message.content || "";
    latestId = messageId;
  }

  const totalBudget = settings.maxMessageContextTokens > 0
    ? settings.maxMessageContextTokens
    : DEFAULT_MESSAGE_CONTEXT_TOKENS;
  const historyBudget = Math.max(0, totalBudget - approxTokens(latest));

  const history = buildChatHistoryBlock(
    messages,
    messages.length - 1,
    latestId,
    historyBudget
  );

  const pov = await resolvePovContent(
    userId,
    isUserMessage ? settings.userPov : settings.pov
  );

  const userMessage = isUserMessage ? (message.content || "") : "";

  const lore = await fetchLoreBlock(chatId, userId, settings.maxLorebookTokens);

  hlog.debug(
    userId,
    `buildContext: msg=${messageId.slice(0, 8)} role=${message.role} latestLen=${latest.length} historyBudget=${historyBudget}tok historyLen=${history.length} povLen=${pov.length} userMessageLen=${userMessage.length} lore=${lore.activated}/${lore.fetched}`
  );

  return {
    message,
    characterId,
    latest,
    context: history,
    pov,
    userMessage,
    loreBlock: lore.block,
  };
}

/** Resolved connection + samplers + reasoning config for the LLM
 *  calls in one refinement. Resolved once at the top of refineSingle
 *  / enhanceUserMessage, threaded through the strategy runner. */
interface ResolvedModel {
  connectionProfileId: string;
  parameters: Record<string, unknown> | undefined;
  reasoning: ReasoningConfig;
}

/** Resolve a model-profile id.
 *
 *  Empty id / DEFAULT_PROFILE_ID -> synthetic Default profile.
 *  Known-but-missing id -> fall back to Default and warn once; invoke
 *    `onMissingClear` if provided so the caller can clear a stale
 *    pointer (e.g. `settings.activeModelProfileId`).
 *  Loaded profile -> converted to ResolvedModel. */
async function resolveProfile(
  profileId: string | undefined,
  userId: string,
  onMissingClear?: () => Promise<void>
): Promise<ResolvedModel> {
  let profile;
  if (!profileId || profileId === DEFAULT_PROFILE_ID) {
    profile = getDefaultProfile();
  } else {
    const loaded = await getModelProfile(userId, profileId);
    if (loaded) {
      profile = loaded;
    } else {
      profile = getDefaultProfile();
      spindle.log.warn(
        `[Hone] model profile "${profileId}" no longer exists; falling back to Default`
      );
      if (onMissingClear) await onMissingClear();
    }
  }

  hlog.debug(
    userId,
    `resolveProfile: id="${profileId || "(default)"}" -> "${profile.name}" connection="${profile.connectionProfileId || "(default)"}" reasoning=${JSON.stringify(profile.reasoning)}`
  );

  return {
    connectionProfileId: profile.connectionProfileId,
    parameters: buildGenerationParameters(profile.samplers),
    reasoning: profile.reasoning,
  };
}

async function resolveModel(settings: HoneSettings, userId: string): Promise<ResolvedModel> {
  return resolveProfile(settings.activeModelProfileId, userId, async () => {
    // Stale settings pointer -> clear it so the warning doesn't spam
    // and the Models tab reflects Default as the active selection.
    await updateSettings(userId, { activeModelProfileId: DEFAULT_PROFILE_ID });
  });
}

/** Inject provider-agnostic `thinking` / `output_config` when
 *  `requestReasoning` is enabled. Anthropic consumes these; other
 *  providers ignore unknown keys. */
function injectReasoningParams(
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

/** Both pipeline and parallel strategies route every LLM call through
 *  `assembleStage`. There is exactly one assembler; it is used by
 *  both strategies, the preview path, and every stage in every
 *  pipeline. No code path builds messages without going through it. */

export interface RunStrategyInput {
  preset: HonePreset;
  settings: HoneSettings;
  model: ResolvedModel;
  /** Chat history excluding the last AI message, token-budgeted.
   *  Becomes `{{context}}`. */
  context: string;
  /** Initial `{{latest}}` for stage 0 (threads forward per stage).
   *  Output: AI message being refined. Input: last AI response in
   *  chat (static: input pipelines don't refine the AI message). */
  latest: string;
  /** `{{message}}` / `{{original}}`. Output: the AI message's
   *  original content. Input: the user's draft. */
  messageText: string;
  /** `{{userMessage}}`. Input only; empty for output refinement. */
  userMessage: string;
  /** Activated lorebook entries, concatenated. `{{lore}}`. */
  loreBlock: string;
  /** `{{pov}}`. */
  pov: string;
  chatId: string;
  characterId?: string;
  userId: string;
  /** `{{shield_preservation_note}}`. Empty string when no blocks were
   *  shielded. */
  shieldPreservationNote?: string;
  onStageComplete?: (record: StageRecord) => void;
}

export interface RunStrategyResult {
  refinedText: string;
  stages: StageRecord[];
  strategy: string;
}

/** Run one Pipeline end-to-end, threading `{{latest}}` between stages.
 *
 *  `emitStages=false` hides proposal-internal stages from the
 *  caller-visible stream (the proposal's final output is surfaced
 *  separately as a `kind="proposal"` record by `runParallel`).
 *  `emitStages=true` for the top-level pipeline and the aggregator. */
async function runPipeline(
  pipeline: Pipeline,
  input: RunStrategyInput,
  initialLatest: string,
  proposals: string[] | undefined,
  emitStages: boolean
): Promise<{ finalText: string; stages: StageRecord[] }> {
  const results: StageRecord[] = [];
  let latest = initialLatest;

  for (let i = 0; i < pipeline.stages.length; i++) {
    const stage = pipeline.stages[i];
    const assemblyCtx: AssembleContext = {
      original: input.messageText,
      latest,
      userMessage: input.userMessage,
      context: input.context,
      lore: input.loreBlock,
      pov: input.pov,
      stageName: stage.name,
      stageIndex: i + 1,
      totalStages: pipeline.stages.length,
      proposals,
      chatId: input.chatId,
      characterId: input.characterId,
      userId: input.userId,
      shieldPreservationNote: input.shieldPreservationNote,
    };

    const assembled = await assembleStage(stage, input.preset.prompts, input.preset.headCollection, assemblyCtx);

    // Per-stage model: if the stage declares a profile, resolve it
    // for this call only. Without an override, reuse the preset-level
    // model resolved once at the top of the refinement.
    const stageModel = stage.modelProfileId
      ? await resolveProfile(stage.modelProfileId, input.userId)
      : input.model;

    const req: GenerateRequest = {
      messages: assembled.messages,
      connectionProfileId: stageModel.connectionProfileId,
      timeoutSeconds: input.settings.generationTimeoutSecs,
      parameters: injectReasoningParams(stageModel.parameters, stageModel.reasoning),
    };

    hlog.debug(
      input.userId,
      `runPipeline stage ${i + 1}/${pipeline.stages.length} "${stage.name}" msgs=${assembled.messages.length} merges=${assembled.merges} emit=${emitStages} stageProfile="${stage.modelProfileId || "(inherit)"}"`
    );

    const result = await generate(req, input.userId);
    if (!result.success) {
      // Stage failure aborts the whole refinement. Partial-output
      // continuation is the wrong contract: it silently degrades.
      throw new Error(result.error || `Stage "${stage.name}" failed`);
    }

    // Strip reasoning tags before <HONE-OUTPUT> extraction when the
    // stage's profile asks for it. Models like DeepSeek / QwQ wrap
    // chain-of-thought in tags that would otherwise leak through.
    const rawContent = stageModel.reasoning.stripCoTTags
      ? removeCoTTags(result.content)
      : result.content;
    const extracted = extractRefinedContent(rawContent);
    if (!extracted.ok) {
      hlog.debug(
        input.userId,
        `stage "${stage.name}": output-format failure "${extracted.reason}": ${extracted.message}`
      );
      throw new Error(extracted.message);
    }
    for (const r of extracted.recoveries) {
      hlog.debug(input.userId, `stage "${stage.name}": ${r}`);
    }
    latest = extracted.content;

    if (emitStages) {
      const record: StageRecord = { index: i, name: stage.name, text: latest, kind: "step" };
      results.push(record);
      input.onStageComplete?.(record);
    }
  }

  return { finalText: latest, stages: results };
}

/** Run a Parallel strategy: proposals concurrently, then aggregator.
 *
 *  Surfaced stages:
 *    - One `kind="proposal"` per successful proposal (name = proposal's
 *      last stage name).
 *    - Each aggregator stage as `kind="step"`.
 *
 *  Proposal-internal stages are hidden: a proposal is an alternative
 *  candidate from the user's perspective, not a progression. Surfacing
 *  them would double-count and collide with other proposals' indices. */
async function runParallel(input: RunStrategyInput): Promise<RunStrategyResult> {
  const parallel = input.preset.parallel;
  if (!parallel || parallel.proposals.length === 0) {
    throw new Error("Parallel preset has no proposals configured");
  }

  hlog.debug(
    input.userId,
    `runParallel starting: ${parallel.proposals.length} proposals, aggregator with ${parallel.aggregator.stages.length} stages`
  );

  // Each proposal gets its own `latest` closure. Branches can't read
  // each other's thread. `initialLatest = input.latest` so every
  // branch starts from the last AI message.
  const proposalSettled = await Promise.allSettled(
    parallel.proposals.map((p, i) => {
      hlog.debug(input.userId, `runParallel: dispatching proposal ${i + 1}`);
      return runPipeline(p, input, input.latest, undefined, false);
    })
  );

  const proposalOutputs: string[] = [];
  const proposalRecords: StageRecord[] = [];
  for (let i = 0; i < proposalSettled.length; i++) {
    const outcome = proposalSettled[i];
    if (outcome.status === "fulfilled") {
      proposalOutputs.push(outcome.value.finalText);
      const proposalPipeline = parallel.proposals[i];
      const lastStage = proposalPipeline.stages[proposalPipeline.stages.length - 1];
      const record: StageRecord = {
        index: i,
        name: lastStage ? lastStage.name : `Proposal ${i + 1}`,
        text: outcome.value.finalText,
        kind: "proposal",
      };
      proposalRecords.push(record);
      input.onStageComplete?.(record);
      hlog.debug(input.userId, `runParallel: proposal ${i + 1} succeeded`);
    } else {
      const reason = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
      spindle.log.warn(`[Hone] parallel proposal ${i + 1} failed: ${reason}`);
      hlog.debug(input.userId, `runParallel: proposal ${i + 1} failed: ${reason}`);
    }
  }

  if (proposalOutputs.length === 0) {
    throw new Error("All parallel proposals failed");
  }

  // Aggregator: `{{latest}}` starts at the last AI message because
  // proposals are concurrent alternatives, not a progression; no
  // single proposal wins the pre-aggregator `latest` slot. Aggregator
  // stages thread their own output forward.
  const aggregatorRun = await runPipeline(
    parallel.aggregator,
    input,
    input.latest,
    proposalOutputs,
    true
  );

  return {
    refinedText: aggregatorRun.finalText,
    stages: [...proposalRecords, ...aggregatorRun.stages],
    strategy: "parallel",
  };
}

async function runStrategy(input: RunStrategyInput): Promise<RunStrategyResult> {
  hlog.debug(input.userId, `runStrategy: preset="${input.preset.name}" strategy=${input.preset.strategy} messageLen=${input.messageText.length} latestLen=${input.latest.length} contextLen=${input.context.length}`);
  if (input.preset.strategy === "parallel") {
    return runParallel(input);
  }
  if (!input.preset.pipeline) {
    hlog.debug(input.userId, `runStrategy: FAILED: strategy=pipeline but no pipeline object`);
    throw new Error(`Preset "${input.preset.id}" has strategy=pipeline but no pipeline configured`);
  }
  hlog.debug(input.userId, `runStrategy: executing pipeline with ${input.preset.pipeline.stages.length} stages`);
  const run = await runPipeline(
    input.preset.pipeline,
    input,
    input.latest,
    undefined,
    true
  );
  hlog.debug(input.userId, `runStrategy: pipeline complete: finalLen=${run.finalText.length} stages=${run.stages.length}`);
  return { refinedText: run.finalText, stages: run.stages, strategy: "pipeline" };
}

export async function refineSingle(
  chatId: string,
  messageId: string,
  userId: string,
  send: SendFn
): Promise<boolean> {
  let success = false;

  hlog.debug(userId, `refineSingle: enqueued ${messageId.slice(0, 8)} in ${chatId.slice(0, 8)}`);

  await enqueueChatOperation(`${userId}:${chatId}`, async () => {
    hlog.debug(userId, `refineSingle: queue slot started ${messageId.slice(0, 8)}`);
    const settings = await getSettings(userId);

    if (!settings.enabled) {
      hlog.debug(userId, `refineSingle: skipped ${messageId.slice(0, 8)}: settings.enabled=false`);
      return;
    }

    send({ type: "refine-started", messageId });

    try {
      const { message, latest, context, pov, userMessage, characterId, loreBlock } =
        await buildContext(chatId, messageId, userId, settings);
      hlog.debug(userId, `refineSingle: buildContext done ${messageId.slice(0, 8)} role=${message.role} swipeId=${message.swipe_id} contentLen=${message.content.length} loreLen=${loreBlock.length}`);
      // Capture the swipe we started on. Before writing the refined
      // content we verify the user hasn't swiped away or edited the
      // message; otherwise we'd overwrite the wrong target.
      const startSwipeId = message.swipe_id;
      const startContent = message.content;

      if (message.content.length < settings.minCharThreshold) {
        hlog.debug(userId, `Refinement skipped for ${messageId}: below threshold (${message.content.length} < ${settings.minCharThreshold})`);
        send({ type: "refine-complete", messageId, success: true });
        success = true;
        return;
      }

      const model = await resolveModel(settings, userId);

      // Role-aware preset routing: user messages use the input slot,
      // AI messages use the output slot. Same strategy runner; only
      // the active preset differs.
      const isUserMessage = message.role === "user";
      const presetId = isUserMessage ? settings.currentInputPresetId : settings.currentPresetId;
      const slotLabel = isUserMessage ? "input" : "output";
      const startTime = Date.now();
      let refinedText: string;
      let strategy: string;
      const stageResults: StageRecord[] = [];

      const preset = await getPreset(userId, presetId);
      if (!preset) {
        send({
          type: "refine-error",
          messageId,
          error: `Active ${slotLabel} preset "${presetId}" not found. Select a preset in Hone Settings.`,
        });
        return;
      }
      hlog.debug(
        userId,
        `refineSingle: slot=${slotLabel} preset="${preset.name}" strategy=${preset.strategy}`
      );

      // Shielding is output-only: user drafts are prose and can legitimately
      // contain `{{macro}}` lines that must resolve, not get sentinel-trapped.
      const shieldEnabled = preset.shieldLiteralBlocks && !isUserMessage;
      const include = preset.shieldConfig?.include?.length
        ? preset.shieldConfig.include
        : undefined;
      const exclude = preset.shieldConfig?.exclude?.length
        ? preset.shieldConfig.exclude
        : undefined;
      const { masked, blocks } = shieldEnabled
        ? maskLiteralBlocks(message.content, include, exclude)
        : { masked: message.content, blocks: [] };
      if (!shieldEnabled) {
        const reason = isUserMessage
          ? "user-message path (shielding disabled)"
          : "preset.shieldLiteralBlocks=false";
        hlog.debug(userId, `refineSingle: shielding skipped: ${reason}`);
      } else {
        hlog.debug(
          userId,
          `refineSingle: shielding on: patterns matched ${blocks.length} block(s), sourceLen ${message.content.length} -> maskedLen ${masked.length}`
        );
        for (let i = 0; i < blocks.length; i++) {
          const b = blocks[i];
          const preview = b.original.replace(/\n/g, "\\n").slice(0, 80);
          hlog.debug(
            userId,
            `  shield[${i}] len=${b.original.length} preview="${preview}${b.original.length > 80 ? "…" : ""}"`
          );
        }
      }

      // On output refinement `latest` aliases `message.content`, so it
      // needs the masked copy too for prompts that use `{{latest}}`.
      const latestForRun = isUserMessage ? latest : masked;
      const shieldPreservationNote = buildShieldPreservationNote(blocks);

      try {
        const outcome = await runStrategy({
          preset,
          settings,
          model,
          context,
          latest: latestForRun,
          messageText: masked,
          userMessage,
          loreBlock,
          pov,
          chatId,
          characterId,
          userId,
          shieldPreservationNote,
          onStageComplete: (record) => {
            const cleaned = blocks.length > 0
              ? { ...record, text: substituteShields(record.text, blocks) }
              : record;
            stageResults.push(cleaned);
            send({ type: "stage-complete", messageId, stage: cleaned });
          },
        });
        refinedText = outcome.refinedText;
        strategy = outcome.strategy;
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        send({ type: "refine-error", messageId, error });
        return;
      }

      if (blocks.length > 0) {
        const before = refinedText.length;
        const survivors = blocks.filter((b) => refinedText.includes(b.placeholder));
        const droppedList = blocks.filter((b) => !refinedText.includes(b.placeholder));
        hlog.debug(
          userId,
          `refineSingle: unmask: LLM preserved ${survivors.length}/${blocks.length} shield(s); ${droppedList.length} dropped will be appended before trailing scaffolding`
        );
        for (const b of droppedList) {
          const preview = b.original.replace(/\n/g, "\\n").slice(0, 60);
          hlog.debug(userId, `  dropped shield "${preview}${b.original.length > 60 ? "…" : ""}": recovering at end`);
        }
        refinedText = unmaskLiteralBlocks(refinedText, blocks);
        hlog.debug(
          userId,
          `refineSingle: unmask done: outputLen ${before} -> ${refinedText.length}`
        );
      }

      // Race guard: re-read before write. Two failure modes are
      // reported separately so the user can tell what happened:
      //   (a) swipe_id moved -> they navigated to a different swipe.
      //   (b) swipe content edited mid-flight.
      //
      // Content compare is against `fresh.content`, NOT
      // `fresh.swipes[startSwipeId]`: these are distinct fields in
      // Lumiverse's chat model and can diverge in practice.
      const fresh = (await getMessages(chatId)).find((m) => m.id === messageId);
      if (!fresh) {
        hlog.debug(userId, `refineSingle: race guard ${messageId.slice(0, 8)}: message no longer exists`);
        send({ type: "refine-error", messageId, error: "Message no longer exists" });
        return;
      }
      if (fresh.swipe_id !== startSwipeId) {
        hlog.debug(userId, `Refine aborted for ${messageId}: swipe navigated ${startSwipeId} -> ${fresh.swipe_id} during generation`);
        send({ type: "refine-error", messageId, error: "Swipe changed during refinement; refinement cancelled to avoid overwriting the wrong swipe" });
        return;
      }
      if (fresh.content !== startContent) {
        hlog.debug(userId, `Refine aborted for ${messageId}: swipe ${startSwipeId} content edited during generation (startLen=${startContent.length}, freshLen=${fresh.content?.length ?? -1})`);
        send({ type: "refine-error", messageId, error: "Message content was edited during refinement; refinement cancelled to avoid overwriting your edit" });
        return;
      }
      hlog.debug(userId, `refineSingle: race guard passed for ${messageId.slice(0, 8)} swipe ${startSwipeId}`);

      const undoEntry: UndoEntry = {
        originalContent: startContent,
        refinedContent: refinedText,
        timestamp: Date.now(),
        strategy,
        swipeId: startSwipeId,
        ...(stageResults.length > 0 ? { stages: stageResults } : {}),
      };
      await saveUndo(userId, chatId, messageId, startSwipeId, undoEntry);
      hlog.debug(userId, `refineSingle: saveUndo done ${messageId.slice(0, 8)} swipe ${startSwipeId} stages=${stageResults.length}`);

      // Two-write compensation: if updateMessage fails after saveUndo
      // succeeded (permission revoked mid-flight, chat/message
      // deleted, DB throw), roll back the orphan undo entry.
      try {
        await updateMessage(chatId, messageId, {
          content: refinedText,
          metadata: { ...message.metadata, hone_refined: true },
        });
        hlog.debug(userId, `refineSingle: updateMessage done ${messageId.slice(0, 8)} swipe ${startSwipeId}`);
      } catch (updateErr) {
        const updateError = updateErr instanceof Error ? updateErr.message : String(updateErr);
        spindle.log.warn(
          `[Hone] rollback: updateMessage failed for ${messageId} swipe ${startSwipeId} after saveUndo succeeded: ${updateError}; deleting orphan undo entry`
        );
        hlog.debug(userId, `refineSingle: ROLLBACK updateMessage failed ${messageId.slice(0, 8)}: ${updateError}`);
        try {
          await deleteUndo(userId, chatId, messageId, startSwipeId);
          spindle.log.warn(`[Hone] rollback: orphan undo entry deleted for ${messageId} swipe ${startSwipeId}`);
          hlog.debug(userId, `refineSingle: ROLLBACK orphan undo deleted ${messageId.slice(0, 8)}`);
        } catch (rollbackErr) {
          const rollbackError = rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr);
          spindle.log.error(
            `[Hone] rollback FAILED for ${messageId} swipe ${startSwipeId}: ${rollbackError}; orphan undo entry will remain until next refine or prune`
          );
        }
        throw updateErr;
      }

      const duration = Date.now() - startTime;
      hlog.debug(userId, `Refinement complete for ${messageId} swipe ${startSwipeId}: strategy=${strategy}, duration=${duration}ms`);

      if (settings.autoShowDiff) {
        send({ type: "diff", original: startContent, refined: refinedText });
      }
      send({ type: "refine-complete", messageId, success: true });
      success = true;

      // Best-effort: a stats failure never demotes a successful
      // refinement to an error. Prune is folded into saveUndo.
      try {
        await incrementStats(userId, chatId, strategy);
      } catch (statsErr) {
        spindle.log.warn(
          `[Hone] best-effort: incrementStats failed for ${messageId} (${strategy}): ${statsErr instanceof Error ? statsErr.message : statsErr}; stats may be under-counted`
        );
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      spindle.log.warn(`Refine failed for ${messageId}: ${error}`);
      send({ type: "refine-error", messageId, error: `Refinement failed: ${error}` });
    }
  });

  return success;
}

export async function undoRefine(
  chatId: string,
  messageId: string,
  userId: string,
  send: SendFn
): Promise<void> {
  hlog.debug(userId, `undoRefine: enqueued ${messageId.slice(0, 8)}`);
  return enqueueChatOperation(`${userId}:${chatId}`, async () => {
    hlog.debug(userId, `undoRefine: queue slot started ${messageId.slice(0, 8)}`);
    try {
      const currentMsg = (await getMessages(chatId)).find((m) => m.id === messageId);
      if (!currentMsg) {
        hlog.debug(userId, `undoRefine: ${messageId.slice(0, 8)}: message not found`);
        send({ type: "refine-error", messageId, error: "Undo failed: message not found" });
        return;
      }

      const targetSwipeId = currentMsg.swipe_id;
      const entry = await getUndo(userId, chatId, messageId, targetSwipeId);
      if (!entry) {
        hlog.debug(userId, `undoRefine: ${messageId.slice(0, 8)} swipe ${targetSwipeId}: no undo entry`);
        send({ type: "refine-error", messageId, error: "Undo failed: no undo data found for this swipe" });
        return;
      }
      hlog.debug(userId, `undoRefine: applying ${messageId.slice(0, 8)} swipe ${targetSwipeId} origLen=${entry.originalContent.length}`);

      await updateMessage(chatId, messageId, {
        content: entry.originalContent,
        metadata: { ...(currentMsg.metadata || {}), hone_refined: false },
      });
      hlog.debug(userId, `undoRefine: updateMessage done ${messageId.slice(0, 8)} swipe ${targetSwipeId}`);

      try {
        await deleteUndo(userId, chatId, messageId, targetSwipeId);
      } catch (deleteErr) {
        const deleteError = deleteErr instanceof Error ? deleteErr.message : String(deleteErr);
        spindle.log.warn(
          `[Hone] best-effort: deleteUndo failed for ${messageId} swipe ${targetSwipeId} after successful undo: ${deleteError}; orphan entry will make the UI show 'Undo' until the next refine of this swipe overwrites it`
        );
      }

      hlog.debug(userId, `Undo complete for ${messageId} swipe ${targetSwipeId}`);
      send({ type: "refine-complete", messageId, success: true });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      spindle.log.warn(`[Hone] Undo failed for ${messageId}: ${error}`);
      send({ type: "refine-error", messageId, error: `Undo failed: ${error}` });
    }
  });
}

export async function refineBulk(
  chatId: string,
  messageIds: string[],
  userId: string,
  send: SendFn
): Promise<void> {
  const settings = await getSettings(userId);

  // Lumiverse caps stacked modals per extension at 2. Wrap `send` to
  // drop `diff` events entirely and strip error strings from
  // `refine-error` events (so busy spinners clear without a modal).
  // One summary modal fires via bulk-complete after the loop if any
  // messages failed.
  let succeeded = 0;
  let failed = 0;
  let lastError: string | null = null;
  hlog.debug(userId, `refineBulk: starting ${messageIds.length} messages in ${chatId.slice(0, 8)}`);

  const bulkSend: SendFn = (msg) => {
    if (msg.type === "diff") return;
    if (msg.type === "refine-error") {
      if (msg.error) {
        spindle.log.warn(
          `[Hone] bulk: per-message error for ${msg.messageId} suppressed (modal cap), original error: ${msg.error}`
        );
        lastError = msg.error;
      }
      send({ ...msg, error: "" });
      return;
    }
    send(msg);
  };

  for (let i = 0; i < messageIds.length; i++) {
    const messageId = messageIds[i];
    bulkSend({ type: "bulk-progress", current: i + 1, total: messageIds.length, messageId });

    const ok = await refineSingle(chatId, messageId, userId, bulkSend);
    if (ok) succeeded++;
    else failed++;

    if (i < messageIds.length - 1 && settings.batchIntervalMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, settings.batchIntervalMs));
    }
  }

  hlog.debug(
    userId,
    `bulk refine complete: ${succeeded}/${messageIds.length} succeeded, ${failed} failed${lastError ? `, last error: ${lastError}` : ""}`
  );
  send({ type: "bulk-complete", succeeded, failed, total: messageIds.length });
}

export async function enhanceUserMessage(
  text: string,
  chatId: string,
  userId: string,
  mode: import("./types").EnhanceMode,
  send: SendFn
): Promise<void> {
  hlog.debug(userId, `enhanceUserMessage: mode=${mode} chat=${chatId.slice(0, 8)} textLen=${text.length}`);
  const settings = await getSettings(userId);

  if (!settings.userEnhanceEnabled) {
    hlog.debug(userId, `enhanceUserMessage: skipped: userEnhanceEnabled=false`);
    return;
  }

  if (mode === "post") {
    try {
      const messages = await getMessages(chatId);
      const userMsg = [...messages].reverse().find((m) => m.role === "user");
      if (userMsg) {
        await refineSingle(chatId, userMsg.id, userId, send);
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      send({ type: "refine-error", messageId: "", error });
    }
    return;
  }

  // pre / inplace: run the input preset against an in-flight draft.
  // The draft isn't in chat yet, so there's no messageId; we return
  // the final text via `enhance-result` and the frontend handles
  // in-memory undo.
  //
  // Macro mapping for this path:
  //   `{{message}}` / `{{original}}` = draft
  //   `{{userMessage}}`              = draft (same)
  //   `{{latest}}`                   = last AI response (static:
  //                                    input pipelines don't refine
  //                                    the AI message)
  //   `{{context}}`                  = chat history minus `{{latest}}`
  try {
    const preset = await getPreset(userId, settings.currentInputPresetId);
    if (!preset) {
      send({
        type: "refine-error",
        messageId: "",
        error: `Active input preset "${settings.currentInputPresetId}" not found. Select an input preset in Hone Settings.`,
      });
      return;
    }
    hlog.debug(
      userId,
      `enhanceUserMessage: input preset="${preset.name}" strategy=${preset.strategy}`
    );

    const model = await resolveModel(settings, userId);
    const chat = await getChat(chatId, userId);
    const characterId = chat?.character_id || undefined;

    const messages = await getMessages(chatId);

    const prior = findLastAssistantMessage(messages, messages.length - 1);
    const latest = prior?.message.content || "";
    const latestId = prior?.message.id || null;

    const totalBudget = settings.maxMessageContextTokens > 0
      ? settings.maxMessageContextTokens
      : DEFAULT_MESSAGE_CONTEXT_TOKENS;
    const historyBudget = Math.max(0, totalBudget - approxTokens(latest));

    const history = buildChatHistoryBlock(
      messages,
      messages.length - 1,
      latestId,
      historyBudget
    );

    const pov = await resolvePovContent(userId, settings.userPov);

    const lore = await fetchLoreBlock(chatId, userId, settings.maxLorebookTokens);

    hlog.debug(
      userId,
      `enhanceUserMessage: draftLen=${text.length} latestLen=${latest.length} historyLen=${history.length} povLen=${pov.length} loreLen=${lore.block.length}`
    );

    const outcome = await runStrategy({
      preset,
      settings,
      model,
      context: history,
      latest,
      messageText: text,
      userMessage: text,
      loreBlock: lore.block,
      pov,
      chatId,
      characterId,
      userId,
    });

    send({ type: "enhance-result", text: outcome.refinedText });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    send({ type: "refine-error", messageId: "", error });
  }
}

/** Build the messages array for one stage WITHOUT calling the LLM.
 *
 *  Uses the exact same assembler as refinement, including full
 *  Lumiverse macro resolution, so the preview matches what would
 *  actually be sent. With a chatId, macros resolve against real chat
 *  data; without, placeholders fill every macro. `slot` selects
 *  output-mode or input-mode context values. */
export async function previewStage(
  preset: HonePreset,
  stage: Stage,
  stageIndex: number,
  totalStages: number,
  userId: string,
  proposals: string[] | undefined,
  chatId?: string,
  slot: "input" | "output" = "output"
): Promise<{ messages: Array<{ role: "system" | "user" | "assistant"; content: string }>; diagnostics: Array<{ message: string }> }> {
  hlog.debug(userId, `previewStage: start stage="${stage.name}" (${stageIndex}/${totalStages}) preset="${preset.name}" slot=${slot} chatId=${chatId?.slice(0, 8) || "none"} proposals=${proposals?.length ?? 0}`);
  const settings = await getSettings(userId);

  let latest = "<last AI response (placeholder: no chat was active when the preview was requested)>";
  let context = "<chat history (placeholder)>";
  let loreBlock = "";
  let pov = "<POV instruction (placeholder)>";
  let userMessage = slot === "input"
    ? "<user draft (placeholder: type a message to enhance)>"
    : "";
  const original = slot === "input" ? userMessage : latest;

  let characterId: string | undefined;
  let resolveChatId: string | undefined;

  if (chatId) {
    try {
      const messages = await getMessages(chatId);
      const prior = findLastAssistantMessage(messages, messages.length - 1);
      if (prior && prior.message.content) {
        latest = prior.message.content;
      }
      const latestId = prior?.message.id || null;

      const totalBudget = settings.maxMessageContextTokens > 0
        ? settings.maxMessageContextTokens
        : DEFAULT_MESSAGE_CONTEXT_TOKENS;
      const historyBudget = Math.max(0, totalBudget - approxTokens(latest));
      context = buildChatHistoryBlock(messages, messages.length - 1, latestId, historyBudget);

      pov = await resolvePovContent(
        userId,
        slot === "input" ? settings.userPov : settings.pov
      );

      const chat = await getChat(chatId, userId);
      characterId = chat?.character_id || undefined;
      resolveChatId = chatId;

      const lore = await fetchLoreBlock(chatId, userId, settings.maxLorebookTokens);
      loreBlock = lore.block;

      hlog.debug(userId, `previewStage: live context latestLen=${latest.length} historyLen=${context.length} povLen=${pov.length} loreLen=${loreBlock.length}`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      hlog.debug(userId, `previewStage: live-chat context lookup failed: ${errMsg}`);
    }
  } else {
    hlog.debug(userId, `previewStage: no chatId, using placeholders`);
  }

  const assembleCtx: AssembleContext = {
    original,
    latest,
    userMessage,
    context,
    lore: loreBlock,
    pov,
    stageName: stage.name,
    stageIndex: stageIndex + 1,
    totalStages,
    proposals,
    chatId: resolveChatId,
    characterId,
    userId,
  };

  const assembled = await assembleStage(stage, preset.prompts, preset.headCollection, assembleCtx);
  hlog.debug(userId, `previewStage: done: ${assembled.messages.length} messages, ${assembled.diagnostics.length} diagnostics, ${assembled.merges} merges`);
  return { messages: assembled.messages, diagnostics: assembled.diagnostics };
}
