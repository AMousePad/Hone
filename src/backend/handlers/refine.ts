declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

import type { HandlerMap, IpcCtx } from "../dispatch";
import type { UndoEntry } from "../../types";
import { refineSingle, undoRefine, refineBulk, enhanceUserMessage } from "../../refinement";
import { hasPermission } from "../permissions";
import { getActiveChatIdFor, sendRefinedStateFor } from "../chat-state";
import { getUndo, saveUndo } from "../../storage/undo";
import { enqueueChatOperation } from "../../mutation/queue";
import * as hlog from "../../hlog";

function requirePermission(p: string, ctx: IpcCtx, messageId?: string): boolean {
  if (hasPermission(p)) return true;
  const err = `Missing '${p}' permission. Grant it in extension settings.`;
  spindle.log.warn(err);
  ctx.send({ type: "refine-error", messageId: messageId || "", error: err });
  return false;
}

export const refineHandlers: HandlerMap = {
  async refine(msg, ctx) {
    if (!requirePermission("chat_mutation", ctx, msg.messageId)) return;
    hlog.debug(ctx.userId, `Refining message ${msg.messageId} in chat ${msg.chatId}`);
    await refineSingle(msg.chatId, msg.messageId, ctx.userId, ctx.send);
    await sendRefinedStateFor(ctx.userId, ctx.send);
  },

  async undo(msg, ctx) {
    if (!requirePermission("chat_mutation", ctx, msg.messageId)) return;
    hlog.debug(ctx.userId, `Undoing refinement for ${msg.messageId} in chat ${msg.chatId}`);
    await undoRefine(msg.chatId, msg.messageId, ctx.userId, ctx.send);
    await sendRefinedStateFor(ctx.userId, ctx.send);
  },

  async "bulk-refine"(msg, ctx) {
    if (!requirePermission("chat_mutation", ctx)) return;
    hlog.debug(ctx.userId, `Bulk refining ${msg.messageIds.length} messages in chat ${msg.chatId}`);
    await refineBulk(msg.chatId, msg.messageIds, ctx.userId, ctx.send);
  },

  async enhance(msg, ctx) {
    if (!requirePermission("chat_mutation", ctx)) return;
    hlog.debug(ctx.userId, `Enhancing user message in chat ${msg.chatId} (mode: ${msg.mode})`);
    await enhanceUserMessage(msg.text, msg.chatId, ctx.userId, msg.mode, ctx.send);
  },

  async "refine-last"(_msg, ctx) {
    if (!requirePermission("chat_mutation", ctx)) return;
    if (!requirePermission("chats", ctx)) return;
    try {
      const chatId = await getActiveChatIdFor(ctx.userId);
      if (!chatId) {
        ctx.send({ type: "refine-error", messageId: "", error: "No active chat" });
        return;
      }
      const messages = await spindle.chat.getMessages(chatId);
      const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
      if (!lastAssistant) {
        ctx.send({ type: "refine-error", messageId: "", error: "No assistant message found in chat" });
        return;
      }
      hlog.debug(ctx.userId, `Refine-last: refining ${lastAssistant.id} in chat ${chatId}`);
      await refineSingle(chatId, lastAssistant.id, ctx.userId, ctx.send);
      await sendRefinedStateFor(ctx.userId, ctx.send);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      ctx.send({ type: "refine-error", messageId: "", error });
    }
  },

  async "undo-last"(_msg, ctx) {
    if (!requirePermission("chat_mutation", ctx)) return;
    if (!requirePermission("chats", ctx)) return;
    try {
      const chatId = await getActiveChatIdFor(ctx.userId);
      if (!chatId) {
        ctx.send({ type: "refine-error", messageId: "", error: "No active chat" });
        return;
      }
      const messages = await spindle.chat.getMessages(chatId);
      const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
      if (!lastAssistant) {
        ctx.send({ type: "refine-error", messageId: "", error: "No assistant message in chat" });
        return;
      }
      const entry = await getUndo(ctx.userId, chatId, lastAssistant.id, lastAssistant.swipe_id);
      if (!entry) {
        ctx.send({ type: "refine-error", messageId: "", error: "No undo available for the current swipe" });
        return;
      }
      hlog.debug(ctx.userId, `Undo-last: undoing ${lastAssistant.id} swipe ${lastAssistant.swipe_id}`);
      await undoRefine(chatId, lastAssistant.id, ctx.userId, ctx.send);
      await sendRefinedStateFor(ctx.userId, ctx.send);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      ctx.send({ type: "refine-error", messageId: "", error });
    }
  },

  async "refine-all"(_msg, ctx) {
    if (!requirePermission("chat_mutation", ctx)) return;
    if (!requirePermission("chats", ctx)) return;
    try {
      const chatId = await getActiveChatIdFor(ctx.userId);
      if (!chatId) {
        ctx.send({ type: "refine-error", messageId: "", error: "No active chat" });
        return;
      }
      const messages = await spindle.chat.getMessages(chatId);
      const assistantIds = messages.filter((m) => m.role === "assistant").map((m) => m.id);
      if (assistantIds.length === 0) {
        ctx.send({ type: "refine-error", messageId: "", error: "No assistant messages in chat" });
        return;
      }
      hlog.debug(ctx.userId, `Refine-all: refining ${assistantIds.length} assistant messages in chat ${chatId}`);
      await refineBulk(chatId, assistantIds, ctx.userId, ctx.send);
      await sendRefinedStateFor(ctx.userId, ctx.send);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      ctx.send({ type: "refine-error", messageId: "", error });
    }
  },

  async "use-stage-version"(msg, ctx) {
    if (!requirePermission("chat_mutation", ctx)) return;
    await enqueueChatOperation(`${ctx.userId}:${msg.chatId}`, async () => {
      try {
        const currentMsg = (await spindle.chat.getMessages(msg.chatId)).find((m) => m.id === msg.messageId);
        if (!currentMsg) {
          ctx.send({ type: "refine-error", messageId: msg.messageId, error: "Message not found" });
          return;
        }
        const swipeId = currentMsg.swipe_id;
        const existingEntry = await getUndo(ctx.userId, msg.chatId, msg.messageId, swipeId);
        if (!existingEntry) {
          ctx.send({ type: "refine-error", messageId: msg.messageId, error: "No active refinement on this swipe" });
          return;
        }
        if (!existingEntry.stages || existingEntry.stages.length === 0) {
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
          ctx.send({
            type: "refine-error",
            messageId: msg.messageId,
            error: `Stage ${msg.stageKind}[${msg.stageIndex}] not found`,
          });
          return;
        }

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
        ctx.send({ type: "refine-error", messageId: msg.messageId, error });
      }
    });
  },

  async "view-diff"(msg, ctx) {
    if (!requirePermission("chats", ctx, msg.messageId)) return;
    try {
      const messages = await spindle.chat.getMessages(msg.chatId);
      const targetMsg = messages.find((m) => m.id === msg.messageId);
      if (!targetMsg) {
        ctx.send({ type: "refine-error", messageId: msg.messageId, error: "Message not found" });
        return;
      }
      const entry = await getUndo(ctx.userId, msg.chatId, msg.messageId, targetMsg.swipe_id);
      if (entry) {
        ctx.send({ type: "diff", original: entry.originalContent, refined: entry.refinedContent });
      } else {
        ctx.send({ type: "refine-error", messageId: msg.messageId, error: "No diff data found for this swipe" });
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      hlog.debug(ctx.userId, `ipc view-diff: FAILED: ${error}`);
      ctx.send({ type: "refine-error", messageId: msg.messageId, error });
    }
  },
};
