declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

import type { UndoEntry, ChatStats } from "./types";
import * as hlog from "./hlog";

const UNDO_PREFIX = "undo/";
const STATS_PREFIX = "stats/";
const INDEX_FILENAME = "_index.json";
const MAX_UNDO_PER_CHAT = 200;

/**
 * Undo storage layout:
 *
 *   undo/<chatId>/<messageId>.json  : one file per refined message,
 *                                     holding every refined swipe
 *                                     keyed by stringified swipeId
 *   undo/<chatId>/_index.json       : FIFO queue of (messageId,
 *                                     swipeId) pairs ordered
 *                                     oldest->newest, used for
 *                                     eviction past MAX_UNDO_PER_CHAT
 *
 * Per-message files bound write size to swipe-count per message.
 * Chat-wide files would grow past 20MB in heavy-use chats; per-swipe
 * directories leave empty-dir residue because spindle.userStorage
 * has no rmdir. This middle layout avoids both failure modes and
 * makes prune O(1) per save (pop FIFO head, delete swipe slot).
 *
 * All per-user: callers MUST serialize operations on a given chat
 * via chat-queue.ts; a read-modify-write of the index races
 * otherwise.
 */

interface QueueEntry {
  /** Message id (short name; queue gets written on every save and
   *  multiplies across a cap of 200). */
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

async function loadMessageFile(
  userId: string,
  chatId: string,
  messageId: string
): Promise<MessageFile | null> {
  return spindle.userStorage.getJson<MessageFile | null>(
    messageFilePath(chatId, messageId),
    { fallback: null, userId }
  );
}

async function saveMessageFile(
  userId: string,
  chatId: string,
  messageId: string,
  file: MessageFile
): Promise<void> {
  await spindle.userStorage.setJson(messageFilePath(chatId, messageId), file, { userId });
}

/** Rebuild the FIFO queue by scanning disk. Runs on index loss only;
 *  expensive (reads every message file) but preserves tracking. Sort
 *  by entry timestamp so prune evicts in the original save order. */
async function rebuildQueue(userId: string, chatId: string): Promise<QueueEntry[]> {
  const rels = await spindle.userStorage.list(chatUndoDir(chatId), userId);
  const withTs: Array<QueueEntry & { t: number }> = [];
  for (const rel of rels) {
    const name = rel.replace(/\\/g, "/");
    if (name === INDEX_FILENAME) continue;
    // Only flat `<messageId>.json` at the chat-dir root. Ignore any
    // leftover nested entries from earlier layouts.
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
  const existing = await spindle.userStorage.getJson<ChatIndex | null>(
    indexPath(chatId),
    { fallback: null, userId }
  );
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

/** Drop one swipe slot. Deletes the whole file when no swipes remain. */
async function removeSwipeSlot(
  userId: string,
  chatId: string,
  messageId: string,
  swipeId: number
): Promise<void> {
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

  // Message file is the source of truth: write it first. If this
  // throws, the index stays consistent (may "forget" this save but
  // nothing is lost or double-counted).
  const file = (await loadMessageFile(userId, chatId, messageId)) ?? {};
  file[String(swipeId)] = { ...entry, swipeId };
  await saveMessageFile(userId, chatId, messageId, file);

  // Re-saving an already-tracked swipe refreshes its queue position
  // so recently-touched entries survive prune (matches the earlier
  // timestamp-based eviction semantics).
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

/** All refined swipes for one message. */
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

/** Atomically replace one message's full set of swipes. Used by
 *  swipe-deletion reconciliation. The caller passes the desired
 *  final shape. Also rewrites the FIFO index so evicted swipe ids
 *  don't linger as dangling queue entries. */
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
    for (const { swipeId, entry } of next) {
      file[String(swipeId)] = { ...entry, swipeId };
    }
    await saveMessageFile(userId, chatId, messageId, file);
  }
  const index = await loadIndex(userId, chatId);
  const keepSwipeIds = new Set(next.map((n) => n.swipeId));
  index.queue = index.queue.filter((q) => q.m !== messageId || keepSwipeIds.has(q.s));
  // Append any newly-introduced swipe ids. Unchanged entries keep
  // their existing queue position so age-based eviction stays correct.
  const existingSwipeIds = new Set(
    index.queue.filter((q) => q.m === messageId).map((q) => q.s)
  );
  for (const { swipeId } of next) {
    if (!existingSwipeIds.has(swipeId)) {
      index.queue.push({ m: messageId, s: swipeId });
    }
  }
  await saveIndex(userId, chatId, index);
}

/** Set of `messageId:swipeId` keys for every refined entry in a
 *  chat. One index read answers the whole chat. Avoids per-message
 *  file reads for the active-chat snapshot. */
export async function listRefinedKeysInChat(
  userId: string,
  chatId: string
): Promise<Set<string>> {
  const index = await loadIndex(userId, chatId);
  const out = new Set<string>();
  for (const q of index.queue) out.add(`${q.m}:${q.s}`);
  return out;
}

function statsFile(chatId: string): string {
  return `${STATS_PREFIX}${chatId}.json`;
}

const DEFAULT_STATS: ChatStats = {
  messagesRefined: 0,
  totalRefinements: 0,
  byStrategy: {},
};

export async function getStats(userId: string, chatId: string): Promise<ChatStats> {
  return spindle.userStorage.getJson<ChatStats>(statsFile(chatId), {
    fallback: { ...DEFAULT_STATS },
    userId,
  });
}

export async function incrementStats(
  userId: string,
  chatId: string,
  strategy: string,
  count: number = 1
): Promise<void> {
  const stats = await getStats(userId, chatId);
  stats.messagesRefined += count;
  stats.totalRefinements += count;
  stats.byStrategy[strategy] = (stats.byStrategy[strategy] || 0) + count;
  await spindle.userStorage.setJson(statsFile(chatId), stats, { userId });
}
