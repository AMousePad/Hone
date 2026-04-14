/**
 * Per-chat operation serializer.
 *
 * Any read-modify-write of undo storage for a given chat must run
 * through `enqueueChatOperation(chatId, fn)` to prevent concurrent
 * events from interleaving and corrupting state.
 *
 * Current users: `refineSingle` (src/refinement.ts), the
 * MESSAGE_SWIPED(deleted) handler in src/backend.ts.
 */

const chatQueues = new Map<string, Promise<void>>();

export function enqueueChatOperation(
  chatId: string,
  fn: () => Promise<void>
): Promise<void> {
  const prev = chatQueues.get(chatId) || Promise.resolve();
  const next = prev.then(fn, fn).finally(() => {
    if (chatQueues.get(chatId) === next) {
      chatQueues.delete(chatId);
    }
  });
  chatQueues.set(chatId, next);
  return next;
}
