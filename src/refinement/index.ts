declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

import type { HonePreset, Stage, UndoEntry, StageRecord, BackendToFrontend, EnhanceMode } from "../types";
import { maskLiteralBlocks, unmaskLiteralBlocks, substituteShields } from "../text/shield";
import { buildChatHistoryBlock, approxTokens } from "../text/history";
import { getSettings } from "../storage/settings";
import { getPreset } from "../resources/presets";
import { resolvePovContent } from "../resources/pov-presets";
import { saveUndo, getUndo, deleteUndo } from "../storage/undo";
import { incrementStats } from "../storage/stats";
import { assembleStage, type AssembleContext } from "../assemble";
import { enqueueChatOperation } from "../mutation/queue";
import { resolveModel } from "./model-resolver";
import { runStrategy } from "./strategy";
import { buildContext, buildShieldPreservationNote, fetchLoreBlock, findLastAssistantMessage, DEFAULT_MESSAGE_CONTEXT_TOKENS } from "./context";
import * as hlog from "../hlog";

type SendFn = (msg: BackendToFrontend) => void;

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
      hlog.debug(
        userId,
        `refineSingle: buildContext done ${messageId.slice(0, 8)} role=${message.role} swipeId=${message.swipe_id} contentLen=${message.content.length} loreLen=${loreBlock.length}`
      );

      const startSwipeId = message.swipe_id;
      const startContent = message.content;

      if (message.content.length < settings.minCharThreshold) {
        hlog.debug(
          userId,
          `Refinement skipped for ${messageId}: below threshold (${message.content.length} < ${settings.minCharThreshold})`
        );
        send({ type: "refine-complete", messageId, success: true });
        success = true;
        return;
      }

      const model = await resolveModel(settings, userId);

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
      hlog.debug(userId, `refineSingle: slot=${slotLabel} preset="${preset.name}" strategy=${preset.strategy}`);

      const shieldEnabled = preset.shieldLiteralBlocks && !isUserMessage;
      const include = preset.shieldConfig?.include?.length ? preset.shieldConfig.include : undefined;
      const exclude = preset.shieldConfig?.exclude?.length ? preset.shieldConfig.exclude : undefined;
      const { masked, blocks } = shieldEnabled
        ? maskLiteralBlocks(message.content, include, exclude)
        : { masked: message.content, blocks: [] };
      if (!shieldEnabled) {
        const reason = isUserMessage ? "user-message path (shielding disabled)" : "preset.shieldLiteralBlocks=false";
        hlog.debug(userId, `refineSingle: shielding skipped: ${reason}`);
      } else {
        hlog.debug(
          userId,
          `refineSingle: shielding on: patterns matched ${blocks.length} block(s), sourceLen ${message.content.length} -> maskedLen ${masked.length}`
        );
        for (let i = 0; i < blocks.length; i++) {
          const b = blocks[i];
          const preview = b.original.replace(/\n/g, "\\n").slice(0, 80);
          hlog.debug(userId, `  shield[${i}] len=${b.original.length} preview="${preview}${b.original.length > 80 ? "…" : ""}"`);
        }
      }

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
            const cleaned = blocks.length > 0 ? { ...record, text: substituteShields(record.text, blocks) } : record;
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
        hlog.debug(userId, `refineSingle: unmask done: outputLen ${before} -> ${refinedText.length}`);
      }

      const fresh = (await spindle.chat.getMessages(chatId)).find((m) => m.id === messageId);
      if (!fresh) {
        hlog.debug(userId, `refineSingle: race guard ${messageId.slice(0, 8)}: message no longer exists`);
        send({ type: "refine-error", messageId, error: "Message no longer exists" });
        return;
      }
      if (fresh.swipe_id !== startSwipeId) {
        hlog.debug(
          userId,
          `Refine aborted for ${messageId}: swipe navigated ${startSwipeId} -> ${fresh.swipe_id} during generation`
        );
        send({
          type: "refine-error",
          messageId,
          error: "Swipe changed during refinement; refinement cancelled to avoid overwriting the wrong swipe",
        });
        return;
      }
      if (fresh.content !== startContent) {
        hlog.debug(
          userId,
          `Refine aborted for ${messageId}: swipe ${startSwipeId} content edited during generation (startLen=${startContent.length}, freshLen=${fresh.content?.length ?? -1})`
        );
        send({
          type: "refine-error",
          messageId,
          error: "Message content was edited during refinement; refinement cancelled to avoid overwriting your edit",
        });
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
      hlog.debug(
        userId,
        `refineSingle: saveUndo done ${messageId.slice(0, 8)} swipe ${startSwipeId} stages=${stageResults.length}`
      );

      try {
        await spindle.chat.updateMessage(chatId, messageId, {
          content: refinedText,
          metadata: { ...message.metadata, hone_refined: true },
        });
        hlog.debug(userId, `refineSingle: updateMessage done ${messageId.slice(0, 8)} swipe ${startSwipeId}`);
      } catch (updateErr) {
        const updateError = updateErr instanceof Error ? updateErr.message : String(updateErr);
        spindle.log.warn(
          `[Hone] rollback: updateMessage failed for ${messageId} swipe ${startSwipeId} after saveUndo succeeded: ${updateError}; deleting orphan undo entry`
        );
        try {
          await deleteUndo(userId, chatId, messageId, startSwipeId);
          spindle.log.warn(`[Hone] rollback: orphan undo entry deleted for ${messageId} swipe ${startSwipeId}`);
        } catch (rollbackErr) {
          const rollbackError = rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr);
          spindle.log.error(
            `[Hone] rollback FAILED for ${messageId} swipe ${startSwipeId}: ${rollbackError}; orphan undo entry will remain until next refine or prune`
          );
        }
        throw updateErr;
      }

      const duration = Date.now() - startTime;
      hlog.debug(
        userId,
        `Refinement complete for ${messageId} swipe ${startSwipeId}: strategy=${strategy}, duration=${duration}ms`
      );

      if (settings.autoShowDiff) {
        send({ type: "diff", original: startContent, refined: refinedText });
      }
      send({ type: "refine-complete", messageId, success: true });
      success = true;

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

export async function undoRefine(chatId: string, messageId: string, userId: string, send: SendFn): Promise<void> {
  hlog.debug(userId, `undoRefine: enqueued ${messageId.slice(0, 8)}`);
  return enqueueChatOperation(`${userId}:${chatId}`, async () => {
    hlog.debug(userId, `undoRefine: queue slot started ${messageId.slice(0, 8)}`);
    try {
      const currentMsg = (await spindle.chat.getMessages(chatId)).find((m) => m.id === messageId);
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
      hlog.debug(
        userId,
        `undoRefine: applying ${messageId.slice(0, 8)} swipe ${targetSwipeId} origLen=${entry.originalContent.length}`
      );

      await spindle.chat.updateMessage(chatId, messageId, {
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
  mode: EnhanceMode,
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
      const messages = await spindle.chat.getMessages(chatId);
      const userMsg = [...messages].reverse().find((m) => m.role === "user");
      if (userMsg) await refineSingle(chatId, userMsg.id, userId, send);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      send({ type: "refine-error", messageId: "", error });
    }
    return;
  }

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
    hlog.debug(userId, `enhanceUserMessage: input preset="${preset.name}" strategy=${preset.strategy}`);

    const model = await resolveModel(settings, userId);
    const chat = await spindle.chats.get(chatId, userId);
    const characterId = chat?.character_id || undefined;

    const messages = await spindle.chat.getMessages(chatId);

    const prior = findLastAssistantMessage(messages, messages.length - 1);
    const latest = prior?.message.content || "";
    const latestId = prior?.message.id || null;

    const totalBudget = settings.maxMessageContextTokens > 0
      ? settings.maxMessageContextTokens
      : DEFAULT_MESSAGE_CONTEXT_TOKENS;
    const historyBudget = Math.max(0, totalBudget - approxTokens(latest));

    const history = buildChatHistoryBlock(messages, messages.length - 1, latestId, historyBudget);
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
  hlog.debug(
    userId,
    `previewStage: start stage="${stage.name}" (${stageIndex}/${totalStages}) preset="${preset.name}" slot=${slot} chatId=${chatId?.slice(0, 8) || "none"} proposals=${proposals?.length ?? 0}`
  );
  const settings = await getSettings(userId);

  let latest = "<last AI response (placeholder: no chat was active when the preview was requested)>";
  let context = "<chat history (placeholder)>";
  let loreBlock = "";
  let pov = "<POV instruction (placeholder)>";
  let userMessage = slot === "input" ? "<user draft (placeholder: type a message to enhance)>" : "";
  const original = slot === "input" ? userMessage : latest;

  let characterId: string | undefined;
  let resolveChatId: string | undefined;

  if (chatId) {
    try {
      const messages = await spindle.chat.getMessages(chatId);
      const prior = findLastAssistantMessage(messages, messages.length - 1);
      if (prior && prior.message.content) latest = prior.message.content;
      const latestId = prior?.message.id || null;

      const totalBudget = settings.maxMessageContextTokens > 0
        ? settings.maxMessageContextTokens
        : DEFAULT_MESSAGE_CONTEXT_TOKENS;
      const historyBudget = Math.max(0, totalBudget - approxTokens(latest));
      context = buildChatHistoryBlock(messages, messages.length - 1, latestId, historyBudget);

      pov = await resolvePovContent(userId, slot === "input" ? settings.userPov : settings.pov);

      const chat = await spindle.chats.get(chatId, userId);
      characterId = chat?.character_id || undefined;
      resolveChatId = chatId;

      const lore = await fetchLoreBlock(chatId, userId, settings.maxLorebookTokens);
      loreBlock = lore.block;

      hlog.debug(
        userId,
        `previewStage: live context latestLen=${latest.length} historyLen=${context.length} povLen=${pov.length} loreLen=${loreBlock.length}`
      );
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
  hlog.debug(
    userId,
    `previewStage: done: ${assembled.messages.length} messages, ${assembled.diagnostics.length} diagnostics, ${assembled.merges} merges`
  );
  return { messages: assembled.messages, diagnostics: assembled.diagnostics };
}
