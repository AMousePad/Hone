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

  try {
    await dispatch(msg as FrontendToBackend, {
      userId,
      send: (m) => sendTo(m, userId),
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    spindle.log.warn(`IPC handler error (${msg.type}): ${error}`);
  }
});

registerEvents(sendTo);

async function init() {
  await initPermissions();
  spindle.log.info("Hone extension loaded");
}

init();
