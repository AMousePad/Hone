declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

export function safeEvent<P>(
  eventName: string,
  handler: (payload: P, userId: string) => Promise<void> | void
): (payload: unknown, userId?: string) => Promise<void> {
  return async (payload, userId) => {
    if (!userId) return;
    if (!payload || typeof payload !== "object") return;
    try {
      await handler(payload as P, userId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      spindle.log.warn(`[Hone] ${eventName} handler failed: ${message}`);
    }
  };
}
