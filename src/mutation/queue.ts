const queues = new Map<string, Promise<void>>();

export function enqueue(key: string, fn: () => Promise<void>): Promise<void> {
  const prev = queues.get(key) || Promise.resolve();
  const next = prev.then(fn, fn).finally(() => {
    if (queues.get(key) === next) queues.delete(key);
  });
  queues.set(key, next);
  return next;
}

export function enqueueChatOperation(key: string, fn: () => Promise<void>): Promise<void> {
  return enqueue(`chat:${key}`, fn);
}

export function enqueueUserOperation(userId: string, fn: () => Promise<void>): Promise<void> {
  return enqueue(`user:${userId}`, fn);
}
