declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

import type { UndoEntry } from "../types";
import * as hlog from "../hlog";

const UNDO_PREFIX = "undo/";
const INDEX_FILENAME = "_index.json";
const MAX_UNDO_PER_CHAT = 200;

interface QueueEntry {
  m: string;
  s: number;
}

interface ChatIndex {
  queue: QueueEntry[];
}

type MessageFile = Record<string, UndoEntry>;

function messageFilePath(chatId: string, messageId: string): string {
  return `${UNDO_PREFIX}${chatId}/${messageId}.json`;
}

function indexPath(chatId: string): string {
  return `${UNDO_PREFIX}${chatId}/${INDEX_FILENAME}`;
}

function chatUndoDir(chatId: string): string {
  return `${UNDO_PREFIX}${chatId}/`;
}

async function loadMessageFile(userId: string, chatId: string, messageId: string): Promise<MessageFile | null> {
  return spindle.userStorage.getJson<MessageFile | null>(messageFilePath(chatId, messageId), {
    fallback: null,
    userId,
  });
}

async function saveMessageFile(userId: string, chatId: string, messageId: string, file: MessageFile): Promise<void> {
  await spindle.userStorage.setJson(messageFilePath(chatId, messageId), file, { userId });
}

async function rebuildQueue(userId: string, chatId: string): Promise<QueueEntry[]> {
  const rels = await spindle.userStorage.list(chatUndoDir(chatId), userId);
  const withTs: Array<QueueEntry & { t: number }> = [];
  for (const rel of rels) {
    const name = rel.replace(/\\/g, "/");
    if (name === INDEX_FILENAME) continue;
    if (name.includes("/")) continue;
    if (!name.endsWith(".json")) continue;
    const messageId = name.slice(0, -".json".length);
    const file = await loadMessageFile(userId, chatId, messageId);
    if (!file) continue;
    for (const [swipeIdStr, entry] of Object.entries(file)) {
      const swipeId = parseInt(swipeIdStr, 10);
      if (!Number.isFinite(swipeId)) continue;
      withTs.push({ m: messageId, s: swipeId, t: entry.timestamp });
    }
  }
  withTs.sort((a, b) => a.t - b.t);
  return withTs.map(({ m, s }) => ({ m, s }));
}

async function loadIndex(userId: string, chatId: string): Promise<ChatIndex> {
  const existing = await spindle.userStorage.getJson<ChatIndex | null>(indexPath(chatId), {
    fallback: null,
    userId,
  });
  if (existing && Array.isArray(existing.queue)) return existing;
  const queue = await rebuildQueue(userId, chatId);
  if (queue.length > 0) {
    hlog.debug(userId, `loadIndex: rebuilt queue for ${chatId.slice(0, 8)} with ${queue.length} entries`);
  }
  return { queue };
}

async function saveIndex(userId: string, chatId: string, index: ChatIndex): Promise<void> {
  await spindle.userStorage.setJson(indexPath(chatId), index, { userId });
}

async function removeSwipeSlot(userId: string, chatId: string, messageId: string, swipeId: number): Promise<void> {
  const file = await loadMessageFile(userId, chatId, messageId);
  if (!file) return;
  delete file[String(swipeId)];
  if (Object.keys(file).length === 0) {
    await spindle.userStorage.delete(messageFilePath(chatId, messageId), userId);
  } else {
    await saveMessageFile(userId, chatId, messageId, file);
  }
}

export async function saveUndo(
  userId: string,
  chatId: string,
  messageId: string,
  swipeId: number,
  entry: UndoEntry
): Promise<void> {
  hlog.debug(
    userId,
    `saveUndo: ${messageId.slice(0, 8)}/${swipeId} origLen=${entry.originalContent.length} refLen=${entry.refinedContent.length} strategy=${entry.strategy} stages=${entry.stages?.length ?? 0}`
  );

  const file = (await loadMessageFile(userId, chatId, messageId)) ?? {};
  file[String(swipeId)] = { ...entry, swipeId };
  await saveMessageFile(userId, chatId, messageId, file);

  const index = await loadIndex(userId, chatId);
  index.queue = index.queue.filter((q) => !(q.m === messageId && q.s === swipeId));
  index.queue.push({ m: messageId, s: swipeId });

  while (index.queue.length > MAX_UNDO_PER_CHAT) {
    const evicted = index.queue.shift()!;
    try {
      await removeSwipeSlot(userId, chatId, evicted.m, evicted.s);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      spindle.log.warn(
        `[Hone] saveUndo: failed to evict ${evicted.m.slice(0, 8)}/${evicted.s} during prune: ${message}; continuing`
      );
    }
  }

  await saveIndex(userId, chatId, index);
}

export async function getUndo(
  userId: string,
  chatId: string,
  messageId: string,
  swipeId: number
): Promise<UndoEntry | null> {
  const file = await loadMessageFile(userId, chatId, messageId);
  if (!file) return null;
  const entry = file[String(swipeId)];
  if (!entry) return null;
  hlog.debug(userId, `getUndo: hit ${messageId.slice(0, 8)}/${swipeId} strategy=${entry.strategy}`);
  return entry;
}

export async function deleteUndo(
  userId: string,
  chatId: string,
  messageId: string,
  swipeId: number
): Promise<void> {
  hlog.debug(userId, `deleteUndo: ${messageId.slice(0, 8)}/${swipeId}`);
  await removeSwipeSlot(userId, chatId, messageId, swipeId);
  const index = await loadIndex(userId, chatId);
  index.queue = index.queue.filter((q) => !(q.m === messageId && q.s === swipeId));
  await saveIndex(userId, chatId, index);
}

export async function listUndoEntriesForMessage(
  userId: string,
  chatId: string,
  messageId: string
): Promise<Array<{ swipeId: number; entry: UndoEntry }>> {
  const file = await loadMessageFile(userId, chatId, messageId);
  if (!file) return [];
  const out: Array<{ swipeId: number; entry: UndoEntry }> = [];
  for (const [swipeIdStr, entry] of Object.entries(file)) {
    const swipeId = parseInt(swipeIdStr, 10);
    if (!Number.isFinite(swipeId)) continue;
    out.push({ swipeId, entry });
  }
  return out;
}

export async function replaceUndoFileForMessage(
  userId: string,
  chatId: string,
  messageId: string,
  next: Array<{ swipeId: number; entry: UndoEntry }>
): Promise<void> {
  if (next.length === 0) {
    await spindle.userStorage.delete(messageFilePath(chatId, messageId), userId);
  } else {
    const file: MessageFile = {};
    for (const { swipeId, entry } of next) file[String(swipeId)] = { ...entry, swipeId };
    await saveMessageFile(userId, chatId, messageId, file);
  }
  const index = await loadIndex(userId, chatId);
  const keepSwipeIds = new Set(next.map((n) => n.swipeId));
  index.queue = index.queue.filter((q) => q.m !== messageId || keepSwipeIds.has(q.s));
  const existingSwipeIds = new Set(index.queue.filter((q) => q.m === messageId).map((q) => q.s));
  for (const { swipeId } of next) {
    if (!existingSwipeIds.has(swipeId)) index.queue.push({ m: messageId, s: swipeId });
  }
  await saveIndex(userId, chatId, index);
}

export async function listRefinedKeysInChat(userId: string, chatId: string): Promise<Set<string>> {
  const index = await loadIndex(userId, chatId);
  const out = new Set<string>();
  for (const q of index.queue) out.add(`${q.m}:${q.s}`);
  return out;
}
