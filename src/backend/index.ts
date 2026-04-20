declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

import type { BackendToFrontend, FrontendToBackend } from "../types";
import { createDispatcher, validateIpcMessage, type HandlerMap } from "./dispatch";
import { initPermissions } from "./permissions";
import { registerEvents } from "./events";
import { refineHandlers } from "./handlers/refine";
import { presetHandlers } from "./handlers/presets";
import { profileHandlers } from "./handlers/profiles";
import { povHandlers } from "./handlers/pov";
import { settingsHandlers } from "./handlers/settings";
import { debugHandlers } from "./handlers/debug";
import { HONE_VERSION, HONE_MINIMUM_LUMIVERSE_VERSION } from "../constants";
import { checkHostVersion, type HostVersionCheckResult } from "./version-check";
import * as hlog from "../hlog";

function sendTo(msg: BackendToFrontend, userId: string): void {
  spindle.sendToFrontend(msg, userId);
}

const allHandlers: HandlerMap = {
  ...refineHandlers,
  ...presetHandlers,
  ...profileHandlers,
  ...povHandlers,
  ...settingsHandlers,
  ...debugHandlers,
};

const dispatch = createDispatcher(allHandlers);

spindle.onFrontendMessage(async (raw, userId) => {
  const msg = validateIpcMessage(raw);
  if (!msg) {
    spindle.log.warn("Received invalid IPC message (missing type)");
    return;
  }

  hlog.debug(
    userId,
    `ipc in: ${msg.type}${"chatId" in msg && typeof (msg as { chatId?: unknown }).chatId === "string" ? ` chatId=${(msg as { chatId: string }).chatId.slice(0, 8)}` : ""}${"messageId" in msg && typeof (msg as { messageId?: unknown }).messageId === "string" ? ` msgId=${(msg as { messageId: string }).messageId.slice(0, 8)}` : ""}`
  );

  const rawSend = (m: BackendToFrontend) => sendTo(m, userId);
  const send = wrapSendWithVersionWarning(rawSend);

  try {
    await dispatch(msg as FrontendToBackend, {
      userId,
      send,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    hlog.debug(userId, `ipc dispatch: handler for '${msg.type}' threw: ${error}`);
    spindle.log.warn(`IPC handler error (${msg.type}): ${error}`);
  }
});

registerEvents(sendTo);

async function captureHostVersions(): Promise<{ backend: string | null; frontend: string | null }> {
  let backend: string | null = null;
  let frontend: string | null = null;
  try {
    backend = await spindle.version.getBackend();
  } catch (err) {
    spindle.log.warn(`Hone: spindle.version.getBackend() failed: ${err instanceof Error ? err.message : err}`);
  }
  try {
    frontend = await spindle.version.getFrontend();
  } catch (err) {
    spindle.log.warn(`Hone: spindle.version.getFrontend() failed: ${err instanceof Error ? err.message : err}`);
  }
  hlog.setHostVersions(backend, frontend);
  return { backend, frontend };
}

let hostVersionCheck: HostVersionCheckResult | null = null;

export function getHostVersionWarning(): HostVersionCheckResult | null {
  if (!hostVersionCheck || !hostVersionCheck.needsUpdate) return null;
  return hostVersionCheck;
}

export function emitHostVersionWarning(userId: string, send: (m: BackendToFrontend) => void): void {
  const warning = getHostVersionWarning();
  if (!warning) return;
  hlog.debug(
    userId,
    `emitHostVersionWarning: nagging user (hostVersion=${warning.hostVersion ?? "unknown"} minimum=${warning.minimum})`
  );
  send({
    type: "host-version-warning",
    hostVersion: warning.hostVersion,
    minimum: warning.minimum,
    message: warning.message,
  });
}

export function wrapSendWithVersionWarning(
  send: (m: BackendToFrontend) => void
): (m: BackendToFrontend) => void {
  const warning = getHostVersionWarning();
  if (!warning) return send;
  return (m) => {
    if (m.type === "refine-error" && m.error && m.error !== "ABORTED") {
      send({ ...m, error: `${m.error}\n\n${warning.message}` });
    } else if (m.type === "preset-import-result" && m.error) {
      send({ ...m, error: `${m.error}\n\n${warning.message}` });
    } else if (m.type === "pov-preset-error" && m.error) {
      send({ ...m, error: `${m.error}\n\n${warning.message}` });
    } else {
      send(m);
    }
  };
}

async function init() {
  await initPermissions();
  const { backend, frontend } = await captureHostVersions();
  hostVersionCheck = checkHostVersion(backend, HONE_MINIMUM_LUMIVERSE_VERSION);
  const tag = hostVersionCheck.needsUpdate ? "WARN" : "ok";
  spindle.log.info(
    `Hone v${HONE_VERSION} extension loaded (Lumiverse backend=${backend ?? "unknown"} frontend=${frontend ?? "unknown"}, min=${HONE_MINIMUM_LUMIVERSE_VERSION} ${tag})`
  );
  if (hostVersionCheck.needsUpdate) {
    spindle.log.warn(`[Hone] ${hostVersionCheck.message}`);
  }
}

init();
