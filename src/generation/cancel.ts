const inflight = new Map<string, AbortController>();

export function register(key: string): AbortController {
  inflight.get(key)?.abort();
  const controller = new AbortController();
  inflight.set(key, controller);
  return controller;
}

export function release(key: string, controller: AbortController): void {
  if (inflight.get(key) === controller) inflight.delete(key);
}

export function cancel(key: string): boolean {
  const controller = inflight.get(key);
  if (!controller) return false;
  controller.abort();
  inflight.delete(key);
  return true;
}

export function cancelAllForChat(userId: string, chatId: string): number {
  const prefix = `${userId}:${chatId}:`;
  const keys: string[] = [];
  for (const key of inflight.keys()) {
    if (key.startsWith(prefix)) keys.push(key);
  }
  let cancelled = 0;
  for (const key of keys) {
    if (cancel(key)) cancelled++;
  }
  return cancelled;
}

export function refineKey(userId: string, chatId: string, messageId: string): string {
  return `${userId}:${chatId}:refine:${messageId}`;
}

export function enhanceKey(userId: string, chatId: string): string {
  return `${userId}:${chatId}:enhance`;
}

export function bulkKey(userId: string, chatId: string): string {
  return `${userId}:${chatId}:bulk`;
}

export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

export function makeAbortError(message = "ABORTED"): Error {
  const err = new Error(message);
  err.name = "AbortError";
  return err;
}

export const ABORTED_ERROR_MARKER = "ABORTED";
