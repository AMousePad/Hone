import type { FrontendToBackend, BackendToFrontend } from "../types";

export interface IpcCtx {
  userId: string;
  send: (msg: BackendToFrontend) => void;
}

export type IpcHandler<K extends FrontendToBackend["type"]> = (
  msg: Extract<FrontendToBackend, { type: K }>,
  ctx: IpcCtx
) => Promise<void> | void;

export type HandlerMap = {
  [K in FrontendToBackend["type"]]?: IpcHandler<K>;
};

export function createDispatcher(handlers: HandlerMap) {
  return async function dispatch(msg: FrontendToBackend, ctx: IpcCtx): Promise<void> {
    const handler = handlers[msg.type] as IpcHandler<typeof msg.type> | undefined;
    if (!handler) return;
    await handler(msg as never, ctx);
  };
}

export function validateIpcMessage(raw: unknown): FrontendToBackend | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as { type?: unknown };
  if (typeof m.type !== "string") return null;
  return raw as FrontendToBackend;
}
