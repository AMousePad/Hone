declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

import type { HandlerMap, IpcCtx } from "../dispatch";
import type { UndoEntry } from "../../types";
import { refineSingle, undoRefine, refineBulk, enhanceUserMessage } from "../../refinement";
import { getMissingPermissions, describeMissingPermissions } from "../permissions";
import { getActiveChatIdFor, sendRefinedStateFor } from "../chat-state";
import { getUndo, saveUndo } from "../../storage/undo";
import { enqueueChatOperation } from "../../mutation/queue";
import * as cancelRegistry from "../../generation/cancel";
import { emitHostVersionWarning } from "../index";
import * as hlog from "../../hlog";

const REFINE_PERMS = ["chat_mutation", "chats", "generation"] as const;
const UNDO_PERMS = ["chat_mutation", "chats"] as const;
const VIEW_PERMS = ["chats"] as const;

function beginUserAction(ctx: IpcCtx): IpcCtx {
  emitHostVersionWarning(ctx.userId, ctx.send);
  return ctx;
}

function requirePermissions(required: readonly string[], ctx: IpcCtx, messageId?: string): boolean {
  const missing = getMissingPermissions(required);
  if (missing.length === 0) return true;
  const err = describeMissingPermissions(missing);
  hlog.debug(
    ctx.userId,
    `requirePermissions: denied missing=[${missing.join(",")}] required=[${required.join(",")}] messageId=${messageId?.slice(0, 8) || "(none)"}`
  );
  spindle.log.warn(`[Hone] permission check failed, missing: ${missing.join(", ")}`);
  ctx.send({ type: "refine-error", messageId: messageId || "", error: err });
  return false;
}

export const refineHandlers: HandlerMap = {
  async refine(msg, ctx) {
    ctx = beginUserAction(ctx);
    if (!requirePermissions(REFINE_PERMS, ctx, msg.messageId)) return;
    hlog.debug(ctx.userId, `Refining message ${msg.messageId} in chat ${msg.chatId}`);
    await refineSingle(msg.chatId, msg.messageId, ctx.userId, ctx.send);
    await sendRefinedStateFor(ctx.userId, ctx.send);
  },

  async undo(msg, ctx) {
    ctx = beginUserAction(ctx);
    if (!requirePermissions(UNDO_PERMS, ctx, msg.messageId)) return;
    hlog.debug(ctx.userId, `Undoing refinement for ${msg.messageId} in chat ${msg.chatId}`);
    await undoRefine(msg.chatId, msg.messageId, ctx.userId, ctx.send);
    await sendRefinedStateFor(ctx.userId, ctx.send);
  },

  async "bulk-refine"(msg, ctx) {
    ctx = beginUserAction(ctx);
    if (!requirePermissions(REFINE_PERMS, ctx)) return;
    hlog.debug(ctx.userId, `Bulk refining ${msg.messageIds.length} messages in chat ${msg.chatId}`);
    await refineBulk(msg.chatId, msg.messageIds, ctx.userId, ctx.send);
  },

  async enhance(msg, ctx) {
    ctx = beginUserAction(ctx);
    const required = msg.mode === "post" ? REFINE_PERMS : (["chats", "generation"] as const);
    if (!requirePermissions(required, ctx)) return;
    hlog.debug(ctx.userId, `Enhancing user message in chat ${msg.chatId} (mode: ${msg.mode})`);
    await enhanceUserMessage(msg.text, msg.chatId, ctx.userId, msg.mode, msg.requestId, ctx.send);
  },

  async "refine-last"(_msg, ctx) {
    ctx = beginUserAction(ctx);
    if (!requirePermissions(REFINE_PERMS, ctx)) return;
    try {
      const chatId = await getActiveChatIdFor(ctx.userId);
      if (!chatId) {
        hlog.debug(ctx.userId, `refine-last: no active chat`);
        ctx.send({ type: "refine-error", messageId: "", error: "No active chat" });
        return;
      }
      const messages = await spindle.chat.getMessages(chatId);
      const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
      if (!lastAssistant) {
        hlog.debug(
          ctx.userId,
          `refine-last: chat ${chatId.slice(0, 8)} has ${messages.length} message(s) but no assistant role`
        );
        ctx.send({ type: "refine-error", messageId: "", error: "No assistant message found in chat" });
        return;
      }
      hlog.debug(
        ctx.userId,
        `refine-last: refining ${lastAssistant.id.slice(0, 8)} swipe=${lastAssistant.swipe_id} in chat ${chatId.slice(0, 8)}`
      );
      await refineSingle(chatId, lastAssistant.id, ctx.userId, ctx.send);
      await sendRefinedStateFor(ctx.userId, ctx.send);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      hlog.debug(ctx.userId, `refine-last: threw: ${error}`);
      ctx.send({ type: "refine-error", messageId: "", error });
    }
  },

  async "undo-last"(_msg, ctx) {
    ctx = beginUserAction(ctx);
    if (!requirePermissions(UNDO_PERMS, ctx)) return;
    try {
      const chatId = await getActiveChatIdFor(ctx.userId);
      if (!chatId) {
        hlog.debug(ctx.userId, `undo-last: no active chat`);
        ctx.send({ type: "refine-error", messageId: "", error: "No active chat" });
        return;
      }
      const messages = await spindle.chat.getMessages(chatId);
      const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
      if (!lastAssistant) {
        hlog.debug(ctx.userId, `undo-last: chat ${chatId.slice(0, 8)} has no assistant message`);
        ctx.send({ type: "refine-error", messageId: "", error: "No assistant message in chat" });
        return;
      }
      const entry = await getUndo(ctx.userId, chatId, lastAssistant.id, lastAssistant.swipe_id);
      if (!entry) {
        hlog.debug(
          ctx.userId,
          `undo-last: no undo entry for ${lastAssistant.id.slice(0, 8)} swipe=${lastAssistant.swipe_id}`
        );
        ctx.send({ type: "refine-error", messageId: "", error: "No undo available for the current swipe" });
        return;
      }
      hlog.debug(
        ctx.userId,
        `undo-last: undoing ${lastAssistant.id.slice(0, 8)} swipe=${lastAssistant.swipe_id} strategy="${entry.strategy}"`
      );
      await undoRefine(chatId, lastAssistant.id, ctx.userId, ctx.send);
      await sendRefinedStateFor(ctx.userId, ctx.send);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      hlog.debug(ctx.userId, `undo-last: threw: ${error}`);
      ctx.send({ type: "refine-error", messageId: "", error });
    }
  },

  async "refine-all"(_msg, ctx) {
    ctx = beginUserAction(ctx);
    if (!requirePermissions(REFINE_PERMS, ctx)) return;
    try {
      const chatId = await getActiveChatIdFor(ctx.userId);
      if (!chatId) {
        hlog.debug(ctx.userId, `refine-all: no active chat`);
        ctx.send({ type: "refine-error", messageId: "", error: "No active chat" });
        return;
      }
      const messages = await spindle.chat.getMessages(chatId);
      const assistantIds = messages.filter((m) => m.role === "assistant").map((m) => m.id);
      if (assistantIds.length === 0) {
        hlog.debug(
          ctx.userId,
          `refine-all: chat ${chatId.slice(0, 8)} has ${messages.length} message(s) but no assistants`
        );
        ctx.send({ type: "refine-error", messageId: "", error: "No assistant messages in chat" });
        return;
      }
      hlog.debug(
        ctx.userId,
        `refine-all: refining ${assistantIds.length} assistant message(s) in chat ${chatId.slice(0, 8)}`
      );
      await refineBulk(chatId, assistantIds, ctx.userId, ctx.send);
      await sendRefinedStateFor(ctx.userId, ctx.send);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      hlog.debug(ctx.userId, `refine-all: threw: ${error}`);
      ctx.send({ type: "refine-error", messageId: "", error });
    }
  },

  async "use-stage-version"(msg, ctx) {
    ctx = beginUserAction(ctx);
    if (!requirePermissions(UNDO_PERMS, ctx, msg.messageId)) return;
    hlog.debug(
      ctx.userId,
      `ipc use-stage-version: chat=${msg.chatId.slice(0, 8)} msg=${msg.messageId.slice(0, 8)} stageIndex=${msg.stageIndex} stageKind=${msg.stageKind}`
    );
    await enqueueChatOperation(`${ctx.userId}:${msg.chatId}`, async () => {
      try {
        const currentMsg = (await spindle.chat.getMessages(msg.chatId)).find((m) => m.id === msg.messageId);
        if (!currentMsg) {
          hlog.debug(ctx.userId, `use-stage-version: message ${msg.messageId.slice(0, 8)} not found in chat`);
          ctx.send({ type: "refine-error", messageId: msg.messageId, error: "Message not found" });
          return;
        }
        const swipeId = currentMsg.swipe_id;
        const existingEntry = await getUndo(ctx.userId, msg.chatId, msg.messageId, swipeId);
        if (!existingEntry) {
          hlog.debug(
            ctx.userId,
            `use-stage-version: no undo entry for ${msg.messageId.slice(0, 8)} swipe=${swipeId}`
          );
          ctx.send({ type: "refine-error", messageId: msg.messageId, error: "No active refinement on this swipe" });
          return;
        }
        if (!existingEntry.stages || existingEntry.stages.length === 0) {
          hlog.debug(
            ctx.userId,
            `use-stage-version: undo entry for ${msg.messageId.slice(0, 8)} swipe=${swipeId} has no stages (single-strategy refinement)`
          );
          ctx.send({
            type: "refine-error",
            messageId: msg.messageId,
            error: "This refinement has no pipeline stages to pick from",
          });
          return;
        }
        const stage = existingEntry.stages.find(
          (s) => s.index === msg.stageIndex && s.kind === msg.stageKind
        );
        if (!stage) {
          hlog.debug(
            ctx.userId,
            `use-stage-version: stage ${msg.stageKind}[${msg.stageIndex}] not in entry (available: ${existingEntry.stages.map((s) => `${s.kind}[${s.index}]`).join(",")})`
          );
          ctx.send({
            type: "refine-error",
            messageId: msg.messageId,
            error: `Stage ${msg.stageKind}[${msg.stageIndex}] not found`,
          });
          return;
        }
        hlog.debug(
          ctx.userId,
          `use-stage-version: applying stage "${stage.name}" (${stage.kind}[${stage.index}]) textLen=${stage.text.length}`
        );

        const updatedEntry: UndoEntry = {
          ...existingEntry,
          refinedContent: stage.text,
          strategy: `stage-${stage.name}`,
          timestamp: Date.now(),
        };
        await saveUndo(ctx.userId, msg.chatId, msg.messageId, swipeId, updatedEntry);

        try {
          await spindle.chat.updateMessage(msg.chatId, msg.messageId, {
            content: stage.text,
            metadata: { ...(currentMsg.metadata || {}), hone_refined: true },
          });
        } catch (updateErr) {
          const updateError = updateErr instanceof Error ? updateErr.message : String(updateErr);
          spindle.log.warn(
            `[Hone] rollback: use-stage-version updateMessage failed for ${msg.messageId} swipe ${swipeId}: ${updateError}; restoring prior undo entry`
          );
          try {
            await saveUndo(ctx.userId, msg.chatId, msg.messageId, swipeId, existingEntry);
            spindle.log.warn(`[Hone] rollback: prior undo entry restored for ${msg.messageId} swipe ${swipeId}`);
          } catch (rollbackErr) {
            const rollbackError = rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr);
            spindle.log.error(
              `[Hone] rollback FAILED for ${msg.messageId} swipe ${swipeId}: ${rollbackError}. Undo entry now points at a stage that was not applied; next refine/undo of this swipe will reconcile`
            );
          }
          throw updateErr;
        }

        ctx.send({ type: "diff", original: existingEntry.originalContent, refined: stage.text });
        ctx.send({ type: "refine-complete", messageId: msg.messageId, success: true });
        await sendRefinedStateFor(ctx.userId, ctx.send);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        hlog.debug(ctx.userId, `use-stage-version: threw: ${error}`);
        ctx.send({ type: "refine-error", messageId: msg.messageId, error });
      }
    });
  },

  async "cancel-refine"(msg, ctx) {
    const key = cancelRegistry.refineKey(ctx.userId, msg.chatId, msg.messageId);
    const found = cancelRegistry.cancel(key);
    hlog.debug(ctx.userId, `cancel-refine ${msg.messageId.slice(0, 8)}: ${found ? "aborted" : "no in-flight"}`);
  },

  async "cancel-enhance"(msg, ctx) {
    const key = cancelRegistry.enhanceKey(ctx.userId, msg.chatId);
    const found = cancelRegistry.cancel(key);
    hlog.debug(ctx.userId, `cancel-enhance chat=${msg.chatId.slice(0, 8)}: ${found ? "aborted" : "no in-flight"}`);
  },

  async "cancel-bulk"(msg, ctx) {
    const key = cancelRegistry.bulkKey(ctx.userId, msg.chatId);
    const found = cancelRegistry.cancel(key);
    hlog.debug(ctx.userId, `cancel-bulk chat=${msg.chatId.slice(0, 8)}: ${found ? "aborted" : "no in-flight"}`);
  },

  async "cancel-active"(_msg, ctx) {
    const chatId = await getActiveChatIdFor(ctx.userId);
    if (!chatId) {
      hlog.debug(ctx.userId, `cancel-active: no active chat`);
      return;
    }
    const n = cancelRegistry.cancelAllForChat(ctx.userId, chatId);
    hlog.debug(ctx.userId, `cancel-active chat=${chatId.slice(0, 8)}: cancelled ${n} op(s)`);
  },

  async "view-diff"(msg, ctx) {
    if (!requirePermissions(VIEW_PERMS, ctx, msg.messageId)) return;
    hlog.debug(
      ctx.userId,
      `ipc view-diff: chat=${msg.chatId.slice(0, 8)} msg=${msg.messageId.slice(0, 8)}`
    );
    try {
      const messages = await spindle.chat.getMessages(msg.chatId);
      const targetMsg = messages.find((m) => m.id === msg.messageId);
      if (!targetMsg) {
        hlog.debug(ctx.userId, `view-diff: message ${msg.messageId.slice(0, 8)} not found`);
        ctx.send({ type: "refine-error", messageId: msg.messageId, error: "Message not found" });
        return;
      }
      const entry = await getUndo(ctx.userId, msg.chatId, msg.messageId, targetMsg.swipe_id);
      if (entry) {
        hlog.debug(
          ctx.userId,
          `view-diff: hit ${msg.messageId.slice(0, 8)} swipe=${targetMsg.swipe_id} origLen=${entry.originalContent.length} refLen=${entry.refinedContent.length}`
        );
        ctx.send({ type: "diff", original: entry.originalContent, refined: entry.refinedContent });
      } else {
        hlog.debug(
          ctx.userId,
          `view-diff: no undo entry for ${msg.messageId.slice(0, 8)} swipe=${targetMsg.swipe_id}`
        );
        ctx.send({ type: "refine-error", messageId: msg.messageId, error: "No diff data found for this swipe" });
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      hlog.debug(ctx.userId, `ipc view-diff: FAILED: ${error}`);
      ctx.send({ type: "refine-error", messageId: msg.messageId, error });
    }
  },
};
