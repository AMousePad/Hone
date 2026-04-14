/**
 * Frontend-side logging -> backend hlog bridge.
 *
 * The frontend runs in the Lumiverse page, not the extension worker,
 * so it can't call `spindle.log` directly. Routing warn/error through
 * an IPC keeps per-user debug coverage uniform and keeps the shared
 * host console clean on multi-tenant instances.
 *
 * Backend handler: `case "log"` in src/backend.ts routes to
 * `hlog.debug(userId, ...)` for per-user buffer visibility AND to
 * `spindle.log.warn` for host visibility on errors.
 *
 * Calls made before `init()` queue in-memory and flush on wire-up.
 */

import type { FrontendToBackend } from "../types";

type Level = "warn" | "error";
type Sender = (msg: FrontendToBackend) => void;

let sender: Sender | null = null;
const pending: Array<{ level: Level; msg: string }> = [];

/** Wire the backend sender. Flushes any pre-init events. */
export function init(send: Sender): void {
  sender = send;
  if (pending.length > 0) {
    for (const p of pending) sender({ type: "log", level: p.level, msg: p.msg });
    pending.length = 0;
  }
}

function format(context: string, err?: unknown): string {
  if (err === undefined) return context;
  if (err instanceof Error) {
    return err.stack ? `${context}: ${err.message}\n${err.stack}` : `${context}: ${err.message}`;
  }
  if (typeof err === "string") return `${context}: ${err}`;
  try {
    return `${context}: ${JSON.stringify(err)}`;
  } catch {
    return `${context}: ${String(err)}`;
  }
}

function emit(level: Level, context: string, err?: unknown): void {
  const msg = format(context, err);
  if (sender) {
    sender({ type: "log", level, msg });
  } else {
    pending.push({ level, msg });
  }
}

export function warn(context: string, err?: unknown): void {
  emit("warn", context, err);
}

export function error(context: string, err?: unknown): void {
  emit("error", context, err);
}
