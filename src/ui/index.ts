import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import type { FrontendToBackend, BackendToFrontend, HoneSettings } from "../types";
import { STYLES } from "./styles";
import { createSettingsPage } from "./settings-page";
import { createDrawerTab } from "./drawer";
import { showDiffModal } from "./widgets/diff-modal";
import { showPreviewModal } from "./widgets/preview-modal";
import { createFloatWidget } from "./widgets/float-widget";
import { createMessageActionInjector } from "./injectors/message-action";
import { createInputAreaInjector } from "./injectors/input-area";
import { DING_DATA_URL } from "./generated/ding-data";
import * as flog from "./flog";

/** Play the configured notification sound. Empty `customUrl` falls
 *  back to the bundled `ding.mp3` (inlined at build time as a data
 *  URL; no runtime HTTP fetch). */
function playNotificationSound(customUrl: string) {
  const url = customUrl || DING_DATA_URL;
  try {
    const audio = new Audio(url);
    audio.volume = 0.5;
    audio.play().catch((err) => flog.warn("playNotificationSound: play rejected", err));
  } catch (err) {
    flog.warn("playNotificationSound: construction failed", err);
  }
}

/** Interval between initial IPC handshake retries while the backend
 *  hasn't confirmed our user's state via `active-chat`. */
const READY_RETRY_INTERVAL_MS = 3000;

export function setup(ctx: SpindleFrontendContext) {
  const cleanups: (() => void)[] = [];

  const removeStyle = ctx.dom.addStyle(STYLES);
  cleanups.push(removeStyle);

  let currentSettings: HoneSettings | null = null;
  let activeChatId: string | null = null;

  // Flips to true when the backend sends its first `active-chat` in
  // response to the handshake burst, then stays true for the lifetime
  // of this frontend. While false, the float widget is visually
  // disabled and click handlers short-circuit.
  let ready = false;
  function isReady(): boolean {
    return ready;
  }

  function getActiveChatId(): string | null {
    return activeChatId;
  }

  function sendToBackend(msg: FrontendToBackend) {
    ctx.sendToBackend(msg);
  }

  // Wire the frontend -> backend log bridge before any DOM subsystem
  // comes online, so their bootstrap failures route through hlog
  // instead of the shared host console.
  flog.init(sendToBackend);

  // A broken UI surface mustn't take down the rest of the extension.
  // Each surface is wrapped so a registration failure logs loudly but
  // leaves the others working.
  let drawerTab: ReturnType<typeof createDrawerTab> | null = null;
  try {
    drawerTab = createDrawerTab(ctx, sendToBackend);
    cleanups.push(() => drawerTab?.destroy());
  } catch (err) {
    flog.warn("setup: registerDrawerTab failed", err);
  }

  let floatWidget: ReturnType<typeof createFloatWidget> | null = null;
  try {
    floatWidget = createFloatWidget(ctx, sendToBackend, isReady, {
      openDrawerTab: () => drawerTab?.activate(),
    });
    cleanups.push(() => floatWidget?.destroy());
  } catch (err) {
    flog.warn("setup: createFloatWidget failed", err);
  }

  // Per-message refine/undo button. DOM-injected because Lumiverse
  // doesn't (yet) expose a per-message action contribution point;
  // see message-action-injector.ts. When a native API lands, swap
  // the factory body; the public interface is the stable seam.
  let messageInjector: ReturnType<typeof createMessageActionInjector> | null = null;
  try {
    messageInjector = createMessageActionInjector(
      ctx,
      sendToBackend,
      getActiveChatId,
      isReady
    );
    cleanups.push(() => messageInjector?.destroy());
  } catch (err) {
    flog.warn("setup: createMessageActionInjector failed", err);
  }

  const settingsPage = createSettingsPage(ctx, sendToBackend);
  try {
    const settingsMount = ctx.ui.mount("settings_extensions");
    settingsMount.appendChild(settingsPage.root);
  } catch (err) {
    flog.warn("setup: mount settings_extensions failed", err);
  }
  cleanups.push(() => settingsPage.destroy());

  // Input action bar Hone/Undo button. DOM-injected, same seam
  // pattern as message-action-injector.ts.
  let inputAreaInjector: ReturnType<typeof createInputAreaInjector> | null = null;
  try {
    inputAreaInjector = createInputAreaInjector(
      ctx,
      sendToBackend,
      getActiveChatId,
      isReady
    );
    cleanups.push(() => inputAreaInjector?.destroy());
  } catch (err) {
    flog.warn("setup: createInputAreaInjector failed", err);
  }

  const msgUnsub = ctx.onBackendMessage((raw) => {
    const msg = raw as BackendToFrontend;

    drawerTab?.handleBackendMessage(msg);
    settingsPage.handleBackendMessage(msg);
    floatWidget?.handleBackendMessage(msg);

    switch (msg.type) {
      case "settings":
        currentSettings = msg.settings;
        settingsPage.update(msg.settings);
        inputAreaInjector?.setEnabled(msg.settings.userEnhanceEnabled);
        floatWidget?.setConfirmRequired(msg.settings.floatWidgetConfirm);
        floatWidget?.applySize(msg.settings.floatWidgetSize);
        floatWidget?.applyHidden(msg.settings.floatWidgetHidden);
        floatWidget?.setLumiaMode(msg.settings.floatWidgetLumiaMode);
        break;

      case "active-chat": {
        activeChatId = msg.chatId;
        if (!ready) {
          // First authoritative response: unlock widget, stop retrying.
          ready = true;
          floatWidget?.setReady(true);
        }
        // Backend pushes fresh active-chat after every refine, undo,
        // swipe nav, swipe delete. Mirror its authoritative list
        // directly. The per-message injector reflects backend state,
        // never derives it.
        messageInjector?.setRefinedMessages(msg.refinedMessageIds);
        if (activeChatId) {
          messageInjector?.rescan();
          inputAreaInjector?.rescan();
        }
        break;
      }

      case "generation-state":
        // Block the input-area Hone button during main-chat
        // generation so a click can't pile an enhance request on top.
        inputAreaInjector?.setBusy(msg.generating);
        break;

      case "refine-started":
      case "auto-refine-started":
        if (msg.messageId) messageInjector?.setBusy(msg.messageId, true);
        break;

      case "refine-complete":
      case "auto-refine-complete":
        // Button label flips via the follow-up active-chat push;
        // here we only clear the per-message busy spinner.
        if (msg.messageId) {
          messageInjector?.setBusy(msg.messageId, false);
        }
        if (msg.success && currentSettings?.notificationSoundEnabled) {
          playNotificationSound(currentSettings.notificationSoundUrl);
        }
        break;

      case "enhance-result":
        if (msg.text) {
          inputAreaInjector?.onEnhanceResult(msg.text);
        }
        break;

      case "diff":
        // Signal the float widget so its mobile "Done!" state waits
        // for the user to dismiss the diff modal before firing.
        floatWidget?.setDiffModalOpen(true);
        showDiffModal(ctx, msg.original, msg.refined, () => {
          floatWidget?.setDiffModalOpen(false);
        });
        break;

      case "preview-result":
        showPreviewModal(ctx, msg.path, msg.stageIndex, msg.messages, msg.diagnostics);
        break;

      case "refine-error":
        if (msg.messageId) {
          messageInjector?.setBusy(msg.messageId, false);
        }
        if (!msg.messageId) {
          inputAreaInjector?.onEnhanceError();
        }
        if (msg.error) {
          // Flip the widget to error-chibi for the modal's lifetime,
          // then revert. `.finally()` runs on confirm / cancel /
          // dismiss: exactly once.
          floatWidget?.setErrorShowing(true);
          ctx.ui.showConfirm({
            title: "Hone Error",
            message: msg.error,
            confirmLabel: "OK",
            cancelLabel: "Dismiss",
            variant: "danger",
          })
            .catch(() => {})
            .finally(() => floatWidget?.setErrorShowing(false));
        }
        break;

      case "bulk-complete":
        // Summary modal only on partial/total failure; fully
        // successful bulk runs are silent. Per-message failures are
        // already in warn logs.
        if (msg.failed > 0) {
          ctx.ui.showConfirm({
            title: "Bulk Hone Complete",
            message: `${msg.succeeded} of ${msg.total} messages refined. ${msg.failed} failed. Check the extension logs for individual failure details.`,
            confirmLabel: "OK",
            cancelLabel: "Dismiss",
            variant: msg.succeeded > 0 ? "warning" : "danger",
          }).catch(() => {});
        }
        break;

      case "pov-preset-error":
        if (msg.error) {
          ctx.ui.showConfirm({
            title: "POV preset error",
            message: msg.error,
            confirmLabel: "OK",
            cancelLabel: "Dismiss",
            variant: "danger",
          }).catch(() => {});
        }
        break;
    }
  });
  cleanups.push(msgUnsub);

  /** Fire the handshake IPC burst. Idempotent. */
  function sendInitialHandshake() {
    sendToBackend({ type: "get-settings" });
    sendToBackend({ type: "list-presets" });
    sendToBackend({ type: "get-connections" });
    // Model profiles feed the per-stage override dropdown in the
    // pipeline editor; fetched at handshake so the editor renders
    // with the right options on first paint.
    sendToBackend({ type: "list-model-profiles" });
    sendToBackend({ type: "list-pov-presets" });
    sendToBackend({ type: "get-active-chat" });
  }

  // Fire once; retry every READY_RETRY_INTERVAL_MS until an
  // `active-chat` lands. Covers backend cold start, worker restarts,
  // transient WS hiccups without leaving the widget permanently stuck.
  sendInitialHandshake();
  const retryTimer = window.setInterval(() => {
    if (ready) {
      window.clearInterval(retryTimer);
      return;
    }
    sendInitialHandshake();
  }, READY_RETRY_INTERVAL_MS);
  cleanups.push(() => window.clearInterval(retryTimer));

  // Lumiverse signals chat switches by writing `activeChatId` to user
  // settings, which fires SETTINGS_UPDATED. This event is already
  // scoped to the authenticated user; no disambiguation needed.
  const settingsUnsub = ctx.events.on("SETTINGS_UPDATED", (payload: unknown) => {
    const p = payload as { key?: unknown; keys?: unknown } | null;
    if (!p || typeof p !== "object") return;
    const key = p.key;
    const keys = p.keys;
    const touchesActiveChat =
      key === "activeChatId" ||
      (Array.isArray(keys) && keys.includes("activeChatId"));
    if (!touchesActiveChat) return;
    sendToBackend({ type: "get-active-chat" });
  });
  cleanups.push(settingsUnsub);

  return () => {
    for (const fn of cleanups) {
      try { fn(); } catch {}
    }
  };
}
