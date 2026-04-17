declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

import type { HoneSettings } from "../types";
import { buildChatHistoryBlock, approxTokens } from "../text/history";
import { resolvePovContent } from "../resources/pov-presets";
import { fetchLoreContents, assembleLoreBlock } from "../lore";
import * as hlog from "../hlog";

export const DEFAULT_MESSAGE_CONTEXT_TOKENS = 4000;

export async function fetchLoreBlock(
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

export function buildShieldPreservationNote(
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

export function findLastAssistantMessage<T extends { role: string }>(
  messages: T[],
  fromIndex: number
): { message: T; index: number } | null {
  for (let i = Math.min(fromIndex, messages.length - 1); i >= 0; i--) {
    if (messages[i].role === "assistant") return { message: messages[i], index: i };
  }
  return null;
}

export async function buildContext(
  chatId: string,
  messageId: string,
  userId: string,
  settings: HoneSettings
) {
  const messages = await spindle.chat.getMessages(chatId);
  const msgIndex = messages.findIndex((m) => m.id === messageId);
  const message = messages[msgIndex];

  if (!message) throw new Error(`Message ${messageId} not found in chat ${chatId}`);

  const chat = await spindle.chats.get(chatId, userId);
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

  const history = buildChatHistoryBlock(messages, messages.length - 1, latestId, historyBudget);
  const pov = await resolvePovContent(userId, isUserMessage ? settings.userPov : settings.pov);
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
