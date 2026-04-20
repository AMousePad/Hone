declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

import type { BackendToFrontend, StageRecord } from "../types";
import { listRefinedKeysInChat, getUndo } from "../storage/undo";
import * as hlog from "../hlog";

export async function getActiveChatIdFor(userId: string): Promise<string | null> {
  try {
    const active = await spindle.chats.getActive(userId);
    const id = active?.id || null;
    hlog.debug(userId, `getActiveChatIdFor: spindle.chats.getActive -> ${id ? id.slice(0, 8) : "null"}`);
    return id;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    hlog.debug(userId, `getActiveChatIdFor: spindle.chats.getActive threw: ${message}`);
    spindle.log.warn(`getActiveChatIdFor(${userId}) failed: ${message}`);
    return null;
  }
}

export async function snapshotLastAiState(
  userId: string,
  chatId: string
): Promise<{
  messageId: string | null;
  refined: boolean;
  stages?: StageRecord[];
  refinedMessageIds: string[];
}> {
  try {
    const messages = await spindle.chat.getMessages(chatId);
    hlog.debug(userId, `snapshotLastAiState: got ${messages.length} messages in chat ${chatId.slice(0, 8)}`);

    const refinedKeys = await listRefinedKeysInChat(userId, chatId);
    const refinedMessageIds: string[] = [];
    let assistantCount = 0;
    for (const m of messages) {
      if (m.role !== "assistant") continue;
      assistantCount++;
      if (refinedKeys.has(`${m.id}:${m.swipe_id}`)) refinedMessageIds.push(m.id);
    }
    hlog.debug(
      userId,
      `snapshotLastAiState: scanned ${assistantCount} assistants, ${refinedMessageIds.length} refined`
    );

    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return { messageId: null, refined: false, refinedMessageIds };
    const lastIsRefined = refinedKeys.has(`${lastAssistant.id}:${lastAssistant.swipe_id}`);
    if (!lastIsRefined) return { messageId: lastAssistant.id, refined: false, refinedMessageIds };
    const lastEntry = await getUndo(userId, chatId, lastAssistant.id, lastAssistant.swipe_id);
    if (!lastEntry) return { messageId: lastAssistant.id, refined: false, refinedMessageIds };

    const stages = lastEntry.stages && lastEntry.stages.length > 0 ? lastEntry.stages : undefined;
    return { messageId: lastAssistant.id, refined: true, stages, refinedMessageIds };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    hlog.debug(userId, `snapshotLastAiState(${chatId.slice(0, 8)}): threw: ${message}`);
    spindle.log.warn(`snapshotLastAiState(${userId}, ${chatId}) failed: ${message}`);
    return { messageId: null, refined: false, refinedMessageIds: [] };
  }
}

export async function sendRefinedStateFor(
  userId: string,
  send: (msg: BackendToFrontend) => void
): Promise<void> {
  const chatId = await getActiveChatIdFor(userId);
  if (!chatId) {
    hlog.debug(userId, `sendRefinedStateFor: no active chat`);
    return;
  }
  const snap = await snapshotLastAiState(userId, chatId);
  hlog.debug(
    userId,
    `sendRefinedStateFor: chat=${chatId.slice(0, 8)} lastRefined=${snap.refined} lastMsg=${snap.messageId?.slice(0, 8) ?? "none"} stages=${snap.stages?.length ?? 0} refinedCount=${snap.refinedMessageIds.length}`
  );
  send({
    type: "active-chat",
    chatId,
    lastMessageRefined: snap.refined,
    lastAiMessageId: snap.messageId,
    lastAiStages: snap.stages,
    refinedMessageIds: snap.refinedMessageIds,
  });
}
