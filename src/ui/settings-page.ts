import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import type {
  HoneSettings,
  FrontendToBackend,
  BackendToFrontend,
} from "../types";
import {
  makeSection,
  makeToggleRow,
  makeNumberRow,
  makeTextRow,
} from "./forms";
import * as flog from "./flog";

/** Mounts into `settings_extensions`. Holds the Advanced tab;
 *  Models / Output / Input / Automation live in the drawer
 *  (src/ui/drawer.ts). */
export function createSettingsPage(
  _ctx: SpindleFrontendContext,
  sendToBackend: (msg: FrontendToBackend) => void
) {
  let currentSettings: HoneSettings | null = null;
  let debugLogStats: { count: number; capacity: number; enabled: boolean } | null = null;
  let pendingCopyOnNextDebugLogs = false;

  const root = document.createElement("div");
  root.className = "hone-settings-card";

  function sendUpdate(partial: Partial<HoneSettings>) {
    if (currentSettings) Object.assign(currentSettings, partial);
    sendToBackend({ type: "update-settings", settings: partial });
  }

  function render() {
    if (!currentSettings) return;
    root.innerHTML = "";
    const s = currentSettings;

    const header = document.createElement("div");
    header.className = "hone-settings-card__header";
    const title = document.createElement("h2");
    title.textContent = "Hone";
    header.appendChild(title);
    const subtitle = document.createElement("span");
    subtitle.className = "hone-settings-card__version";
    subtitle.textContent = "Advanced Settings";
    header.appendChild(subtitle);
    root.appendChild(header);

    const body = document.createElement("div");
    body.className = "hone-settings";

    const section = makeSection("Refinement");
    section.appendChild(
      makeToggleRow(
        "Show Diff After Refine",
        "Show a word-level diff of changes after each refinement.",
        () => s.autoShowDiff,
        (val) => sendUpdate({ autoShowDiff: val })
      )
    );
    section.appendChild(
      makeNumberRow(
        "Min Char Threshold",
        "Skip refinement for messages shorter than this. Avoids wasting tokens on very short messages.",
        () => s.minCharThreshold,
        (val) => sendUpdate({ minCharThreshold: val }),
        0, 500
      )
    );
    section.appendChild(
      makeNumberRow(
        "Bulk Delay (ms)",
        "Milliseconds to wait between messages during bulk refinement.",
        () => s.batchIntervalMs,
        (val) => sendUpdate({ batchIntervalMs: val }),
        0, 30000
      )
    );
    section.appendChild(
      makeNumberRow(
        "Request Timeout (seconds)",
        "Maximum seconds to wait for each LLM response.",
        () => s.generationTimeoutSecs,
        (val) => sendUpdate({ generationTimeoutSecs: val }),
        30, 600
      )
    );
    section.appendChild(
      makeToggleRow(
        "Play Sound on Refinement Complete",
        "Play a notification sound when a refinement finishes.",
        () => s.notificationSoundEnabled,
        (val) => { sendUpdate({ notificationSoundEnabled: val }); render(); }
      )
    );
    if (s.notificationSoundEnabled) {
      section.appendChild(
        makeTextRow(
          "Custom Sound URL",
          "URL to a custom notification sound. Leave empty to use the built-in ding.",
          "https://example.com/sound.mp3",
          () => s.notificationSoundUrl,
          (val: string) => sendUpdate({ notificationSoundUrl: val })
        )
      );
    }
    body.appendChild(section);

    // Size and shape are also exposed via the widget's context menu;
    // editing here behaves identically.
    const widgetSection = makeSection("Widget");
    widgetSection.appendChild(
      makeToggleRow(
        "Hide Widget",
        "Remove the floating Hone/Undo widget from the screen. The drawer tab and input-bar Hone button remain available.",
        () => s.floatWidgetHidden,
        (val) => sendUpdate({ floatWidgetHidden: val })
      )
    );
    widgetSection.appendChild(
      makeToggleRow(
        "Confirm Widget Taps",
        "Require a second tap on the widget to confirm before refining or undoing. Off by default.",
        () => s.floatWidgetConfirm,
        (val) => sendUpdate({ floatWidgetConfirm: val })
      )
    );
    widgetSection.appendChild(
      makeNumberRow(
        "Widget Size (px)",
        "Diameter of the floating widget. Leave blank to use the default (124). Presets are available via the widget's context menu and depend on Lumia Mode. Classic: 36 / 48 / 64 / 92 / 124, Lumia: 92 / 124 / 164 / 236 / 320 (chibi art needs more room to match the classic pill's visual weight). Any other value here is shown as 'Custom'.",
        () => s.floatWidgetSize,
        (val) => sendUpdate({ floatWidgetSize: val }),
        24, 1920,
        undefined,
        48
      )
    );
    widgetSection.appendChild(
      makeToggleRow(
        "Lumia Mode",
        "Use the chibi Lumia artwork for the floating widget (normal / sleepy / thinking / hover / error states). Turn off for the classic Lumiverse-themed icon pill.",
        () => s.floatWidgetLumiaMode,
        (val) => sendUpdate({ floatWidgetLumiaMode: val })
      )
    );
    body.appendChild(widgetSection);

    const debugSection = makeSection("Debug Logging");
    const debugDesc = document.createElement("p");
    debugDesc.className = "hone-settings-help";
    debugDesc.textContent =
      "When enabled, Hone records detailed backend operations to a per-user in-memory buffer you can copy for bug reports. Logs stay on this device only; they are never written to the Lumiverse host log. Disable when done; the buffer clears automatically.";
    debugSection.appendChild(debugDesc);

    debugSection.appendChild(
      makeToggleRow(
        "Enable Debug Logging",
        "Turn on per-user in-memory debug logging. Default off.",
        () => s.debugLogging,
        (val) => sendUpdate({ debugLogging: val })
      )
    );
    debugSection.appendChild(
      makeNumberRow(
        "Max Log Entries",
        "Maximum number of debug entries to keep in the ring buffer.",
        () => s.debugLogMaxEntries,
        (val) => sendUpdate({ debugLogMaxEntries: val }),
        100, 20000
      )
    );
    debugSection.appendChild(
      makeToggleRow(
        "Record Full LLM Payloads",
        "Also log every outgoing messages array and incoming response in full. Off by default; payloads are large and will evict older entries from the buffer quickly.",
        () => s.debugLogFullPayloads,
        (val) => sendUpdate({ debugLogFullPayloads: val })
      )
    );

    const statsRow = document.createElement("div");
    statsRow.className = "hone-settings-row";
    const statsLabel = document.createElement("label");
    statsLabel.textContent = "Buffer Status";
    const statsContainer = document.createElement("div");
    statsContainer.className = "hone-debug-stats-container";
    const statsValue = document.createElement("span");
    statsValue.className = "hone-debug-stats";
    if (debugLogStats) {
      statsValue.textContent = `${debugLogStats.count} / ${debugLogStats.capacity} entries (${debugLogStats.enabled ? "recording" : "not recording"})`;
    } else {
      statsValue.textContent = "(click refresh to load)";
    }
    const refreshIconBtn = document.createElement("button");
    refreshIconBtn.type = "button";
    refreshIconBtn.className = "hone-debug-refresh-icon";
    refreshIconBtn.title = "Refresh buffer status";
    refreshIconBtn.setAttribute("aria-label", "Refresh buffer status");
    refreshIconBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`;
    refreshIconBtn.addEventListener("click", () => {
      sendToBackend({ type: "get-debug-logs" });
    });
    statsContainer.appendChild(statsValue);
    statsContainer.appendChild(refreshIconBtn);
    statsRow.appendChild(statsLabel);
    statsRow.appendChild(statsContainer);
    debugSection.appendChild(statsRow);

    const actionsRow = document.createElement("div");
    actionsRow.className = "hone-settings-row hone-debug-actions";
    const actionsLabel = document.createElement("label");
    actionsLabel.textContent = "Actions";
    actionsRow.appendChild(actionsLabel);
    const btnGroup = document.createElement("div");
    btnGroup.className = "hone-debug-btn-group";
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "hone-settings-btn";
    copyBtn.textContent = "Copy Debug Logs";
    copyBtn.addEventListener("click", () => {
      pendingCopyOnNextDebugLogs = true;
      sendToBackend({ type: "get-debug-logs" });
    });
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "hone-settings-btn hone-settings-btn--danger";
    clearBtn.textContent = "Clear Logs";
    clearBtn.addEventListener("click", () => {
      sendToBackend({ type: "clear-debug-logs" });
    });
    btnGroup.appendChild(copyBtn);
    btnGroup.appendChild(clearBtn);
    actionsRow.appendChild(btnGroup);
    debugSection.appendChild(actionsRow);
    body.appendChild(debugSection);

    root.appendChild(body);
  }

  function update(settings: HoneSettings) {
    currentSettings = settings;
    render();
  }

  function handleBackendMessage(msg: BackendToFrontend) {
    switch (msg.type) {
      case "settings":
        currentSettings = msg.settings;
        render();
        break;
      case "debug-logs":
        debugLogStats = {
          count: msg.count,
          capacity: msg.capacity,
          enabled: msg.enabled,
        };
        if (pendingCopyOnNextDebugLogs) {
          pendingCopyOnNextDebugLogs = false;
          const text = msg.formatted;
          (async () => {
            try {
              await navigator.clipboard.writeText(text);
            } catch (err) {
              flog.warn("settings: clipboard.writeText failed, using execCommand fallback", err);
              const ta = document.createElement("textarea");
              ta.value = text;
              ta.style.position = "fixed";
              ta.style.opacity = "0";
              document.body.appendChild(ta);
              ta.focus();
              ta.select();
              try {
                document.execCommand("copy");
              } catch (fallbackErr) {
                flog.error("settings: clipboard fallback failed", fallbackErr);
              }
              document.body.removeChild(ta);
            }
          })();
        }
        render();
        break;
    }
  }

  function destroy() {
    root.innerHTML = "";
    root.remove();
  }

  return { root, update, handleBackendMessage, destroy };
}
