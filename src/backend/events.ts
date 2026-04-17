declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

import type { BackendToFrontend, UndoEntry } from "../types";
import { safeEvent } from "./safe-event";
import { getSettings } from "../storage/settings";
import { refineSingle } from "../refinement";
import { hasPermission } from "./permissions";
import { sendRefinedStateFor } from "./chat-state";
import { enqueueChatOperation } from "../mutation/queue";
import {
  listUndoEntriesForMessage,
  replaceUndoFileForMessage,
} from "../storage/undo";
import * as hlog from "../hlog";

const activeGenerationsByUser = new Map<string, Set<string>>();

function addActiveGeneration(userId: string, id: string): void {
  let set = activeGenerationsByUser.get(userId);
  if (!set) {
    set = new Set();
    activeGenerationsByUser.set(userId, set);
  }
  set.add(id);
}

function removeActiveGeneration(userId: string, id: string): void {
  const set = activeGenerationsByUser.get(userId);
  if (!set) return;
  set.delete(id);
  if (set.size === 0) activeGenerationsByUser.delete(userId);
}

function publishGeneratingFor(userId: string, sendTo: (m: BackendToFrontend, u: string) => void): void {
  const generating = (activeGenerationsByUser.get(userId)?.size ?? 0) > 0;
  sendTo({ type: "generation-state", generating }, userId);
}

async function handleSwipeDeletion(
  userId: string,
  chatId: string,
  messageId: string,
  deletedSwipeId: number
): Promise<void> {
  const stored = await listUndoEntriesForMessage(userId, chatId, messageId);
  if (stored.length === 0) return;

  const next: Array<{ swipeId: number; entry: UndoEntry }> = [];
  for (const { swipeId, entry } of stored) {
    if (swipeId === deletedSwipeId) {
      hlog.debug(userId, `Undo dropped for ${messageId} swipe ${swipeId}: swipe deleted`);
      continue;
    }
    if (swipeId > deletedSwipeId) {
      const newIndex = swipeId - 1;
      next.push({ swipeId: newIndex, entry: { ...entry, swipeId: newIndex } });
      hlog.debug(userId, `Undo re-keyed for ${messageId}: swipe ${swipeId} -> ${newIndex} (deleteSwipe shift)`);
    } else {
      next.push({ swipeId, entry });
    }
  }
  await replaceUndoFileForMessage(userId, chatId, messageId, next);
}

export function registerEvents(sendTo: (m: BackendToFrontend, u: string) => void): void {
  spindle.on(
    "GENERATION_STARTED",
    safeEvent<{ generationId?: string }>("GENERATION_STARTED", async (payload, userId) => {
      const id = payload.generationId;
      if (!id) return;
      addActiveGeneration(userId, id);
      hlog.debug(userId, `GENERATION_STARTED ${id} (active=${activeGenerationsByUser.get(userId)?.size ?? 0})`);
      publishGeneratingFor(userId, sendTo);
    })
  );

  spindle.on(
    "GENERATION_STOPPED",
    safeEvent<{ generationId?: string }>("GENERATION_STOPPED", async (payload, userId) => {
      const id = payload.generationId;
      if (!id) return;
      removeActiveGeneration(userId, id);
      hlog.debug(userId, `GENERATION_STOPPED ${id} (active=${activeGenerationsByUser.get(userId)?.size ?? 0})`);
      publishGeneratingFor(userId, sendTo);
    })
  );

  spindle.on(
    "GENERATION_ENDED",
    safeEvent<{ generationId?: string; chatId?: string; messageId?: string }>(
      "GENERATION_ENDED",
      async (payload, userId) => {
        const id = payload.generationId;
        if (id) removeActiveGeneration(userId, id);
        hlog.debug(
          userId,
          `GENERATION_ENDED ${id} (active=${activeGenerationsByUser.get(userId)?.size ?? 0})`
        );
        publishGeneratingFor(userId, sendTo);

        const settings = await getSettings(userId);
        if (!settings.enabled || !settings.autoRefine) return;
        if (!hasPermission("chat_mutation")) return;

        const chatId = payload.chatId;
        const messageId = payload.messageId;
        if (!chatId || !messageId) return;

        const send = (m: BackendToFrontend) => sendTo(m, userId);

        const messages = await spindle.chat.getMessages(chatId);
        const msg = messages.find((m) => m.id === messageId);
        if (msg?.role !== "assistant") return;

        hlog.debug(userId, `Auto-refine triggered for ${messageId} in chat ${chatId}`);
        send({ type: "auto-refine-started", messageId });
        try {
          await refineSingle(chatId, messageId, userId, send);
          send({ type: "auto-refine-complete", messageId, success: true });
          await sendRefinedStateFor(userId, send);
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          spindle.log.warn(`Auto-refine failed: ${error}`);
          send({ type: "auto-refine-complete", messageId, success: false });
        }
      }
    )
  );

  spindle.on(
    "MESSAGE_SWIPED",
    safeEvent<{ chatId?: string; message?: { id?: string }; action?: string; swipeId?: number }>(
      "MESSAGE_SWIPED",
      async (payload, userId) => {
        const { chatId, message, action, swipeId } = payload;
        if (!chatId || !message?.id) return;

        hlog.debug(
          userId,
          `MESSAGE_SWIPED(${action}) chat=${chatId.slice(0, 8)} msg=${message.id.slice(0, 8)} swipeId=${swipeId}`
        );

        if (action === "deleted" && typeof swipeId === "number") {
          await enqueueChatOperation(`${userId}:${chatId}`, () =>
            handleSwipeDeletion(userId, chatId, message.id!, swipeId)
          );
        }

        const send = (m: BackendToFrontend) => sendTo(m, userId);
        await sendRefinedStateFor(userId, send);
      }
    )
  );

  spindle.on(
    "MESSAGE_DELETED",
    safeEvent<{ chatId?: string; messageId?: string }>("MESSAGE_DELETED", async (payload, userId) => {
      const { chatId, messageId } = payload;
      if (!chatId || !messageId) return;
      hlog.debug(userId, `MESSAGE_DELETED chat=${chatId.slice(0, 8)} msg=${messageId.slice(0, 8)}`);

      await enqueueChatOperation(`${userId}:${chatId}`, () =>
        replaceUndoFileForMessage(userId, chatId, messageId, [])
      );
      const send = (m: BackendToFrontend) => sendTo(m, userId);
      await sendRefinedStateFor(userId, send);
    })
  );
}
