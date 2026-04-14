import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import type {
  FrontendToBackend,
  BackendToFrontend,
  ChatStats,
  HoneSettings,
  StageKind,
} from "../types";
import { createModelsPanel } from "./drawer-models";
import { createOutputPanel } from "./drawer-output";
import { createInputPanel } from "./drawer-input";

const PENCIL_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;

interface StageEntry {
  index: number;
  name: string;
  text: string;
  kind: StageKind;
}

/** Drawer state is driven entirely by backend messages, same
 *  pattern as the float widget. One source of truth per field
 *  (`active-chat` for chat/refine state, `stats` for stats, etc.)
 *  so handlers can't race each other. */
/** Actions that require a second click to confirm. */
type ConfirmableAction = "refine-all" | "undo-last";

interface DrawerState {
  chatId: string | null;
  stats: ChatStats | null;
  lastAiMessageId: string | null;
  lastRefined: boolean;
  lastAiStages: StageEntry[] | null;
  busy: boolean;
  /** Currently armed confirmable (waiting for second click). */
  pendingConfirm: ConfirmableAction | null;
  /** TODO(auto-enhance): auto-enhance-user is paused for MVP;
   *  settings still carry `userAutoEnhance` / `userEnhanceMode`. */
  autoRefine: boolean;
}

export function createDrawerTab(
  ctx: SpindleFrontendContext,
  sendToBackend: (msg: FrontendToBackend) => void
) {
  const state: DrawerState = {
    chatId: null,
    stats: null,
    lastAiMessageId: null,
    lastRefined: false,
    lastAiStages: null,
    busy: false,
    pendingConfirm: null,
    autoRefine: false,
  };

  const CONFIRM_TIMEOUT_MS = 4000;
  let confirmTimer: ReturnType<typeof setTimeout> | null = null;

  function clearConfirmTimer() {
    if (confirmTimer !== null) {
      clearTimeout(confirmTimer);
      confirmTimer = null;
    }
  }

  function armConfirm(action: ConfirmableAction) {
    state.pendingConfirm = action;
    clearConfirmTimer();
    confirmTimer = setTimeout(() => {
      if (state.pendingConfirm === action) {
        state.pendingConfirm = null;
        render();
      }
    }, CONFIRM_TIMEOUT_MS);
  }

  function resetConfirm() {
    if (state.pendingConfirm === null) return;
    state.pendingConfirm = null;
    clearConfirmTimer();
    render();
  }

  const tab = ctx.ui.registerDrawerTab({
    id: "hone",
    title: "Hone",
    shortName: "Hone",
    description: "Refine AI messages and enhance your writing",
    keywords: ["refine", "enhance", "edit", "rewrite", "draft"],
    iconSvg: PENCIL_ICON,
  });

  const root = tab.root;
  root.classList.add("hone-drawer");

  type InternalTab = "models" | "output" | "input" | "misc";
  let activeInternalTab: InternalTab = "output";

  // Persistent DOM: survives innerHTML rebuilds of the sections
  // rendered above.
  const tabBarEl = document.createElement("div");
  tabBarEl.className = "hone-subtab-bar";

  const panelContainer = document.createElement("div");
  panelContainer.className = "hone-subtab-content";

  const modelsPanel = createModelsPanel(ctx, sendToBackend, panelContainer);
  const outputPanel = createOutputPanel(ctx, sendToBackend, panelContainer);
  const inputPanel = createInputPanel(ctx, sendToBackend, panelContainer);

  function renderTabBar() {
    tabBarEl.innerHTML = "";
    const tabs: Array<{ id: InternalTab; label: string }> = [
      { id: "models", label: "Models" },
      { id: "output", label: "Output" },
      { id: "input", label: "Input" },
      { id: "misc", label: "Misc" },
    ];
    for (const t of tabs) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `hone-subtab-btn${t.id === activeInternalTab ? " active" : ""}`;
      btn.textContent = t.label;
      btn.addEventListener("click", () => {
        if (t.id === activeInternalTab) return;
        activeInternalTab = t.id;
        renderTabBar();
        renderActivePanel();
      });
      tabBarEl.appendChild(btn);
    }
  }

  function renderActivePanel() {
    panelContainer.innerHTML = "";
    switch (activeInternalTab) {
      case "models": modelsPanel.render(); break;
      case "output": outputPanel.render(); break;
      case "input": inputPanel.render(); break;
      case "misc": panelContainer.innerHTML = renderStats(); break;
    }
  }

  const topSections = document.createElement("div");

  function render() {
    topSections.innerHTML = [renderQuickActions(), renderAutomation()].join("");
    root.innerHTML = "";
    root.appendChild(topSections);
    renderTabBar();
    root.appendChild(tabBarEl);
    root.appendChild(panelContainer);
    renderActivePanel();
  }

  function renderQuickActions(): string {
    // Priority: busy -> (stages + refined) -> (stages + finalizing)
    // -> refined (no stages) -> unrefined -> disabled (no chat).
    // The busy branch is checked first so "Pipeline running..." shows
    // on refine-started without waiting for the first stage to land
    // (critical for parallel: proposals run concurrently and nothing
    // hits the stage stream until the first finishes).
    const gated = !state.chatId || state.busy;
    const disabledAttr = gated ? "disabled" : "";
    const canAct = !!state.lastAiMessageId && !gated;
    const stages = state.lastAiStages ?? [];
    const hasStages = stages.length > 0;

    const stageButtons = stages
      .map((s) => {
        // Kind-aware label: proposals and steps live in independent
        // index namespaces.
        const label = s.kind === "proposal" ? `Agent ${s.index + 1}` : `Step ${s.index + 1}`;
        return `
          <button class="hone-drawer-btn hone-drawer-btn--secondary" data-action="use-stage" data-stage-index="${s.index}" data-stage-kind="${s.kind}" ${canAct && state.lastRefined ? "" : "disabled"} title="${escapeAttr(s.text.slice(0, 200))}${s.text.length > 200 ? "..." : ""}">
            ${label}: ${escapeHtml(s.name)}
          </button>
        `;
      })
      .join("");

    let primary: string;
    if (state.busy) {
      primary = `${stageButtons}<div class="hone-drawer-progress">Pipeline running...</div>`;
    } else if (hasStages) {
      const footer = state.lastRefined
        ? (() => {
            const undoArmed = state.pendingConfirm === "undo-last";
            return `
              <button class="hone-drawer-btn hone-drawer-btn--primary ${undoArmed ? "hone-drawer-btn--confirm" : ""}" data-action="undo-last" ${canAct ? "" : "disabled"}>
                ${undoArmed ? "Confirm?" : "Undo Refinement"}
              </button>
            `;
          })()
        : `<div class="hone-drawer-progress">Finalizing...</div>`;
      primary = `${stageButtons}${footer}`;
    } else if (state.lastRefined) {
      const undoArmed = state.pendingConfirm === "undo-last";
      primary = `
        <button class="hone-drawer-btn hone-drawer-btn--primary ${undoArmed ? "hone-drawer-btn--confirm" : ""}" data-action="undo-last" ${canAct ? "" : "disabled"}>
          ${undoArmed ? "Confirm?" : "Undo Refinement"}
        </button>
      `;
    } else {
      primary = `
        <button class="hone-drawer-btn hone-drawer-btn--primary" data-action="refine-last" ${canAct ? "" : "disabled"}>
          Hone Last AI Message
        </button>
      `;
    }

    const refineAllArmed = state.pendingConfirm === "refine-all";
    return `
      <div class="hone-drawer-section">
        <h3 class="hone-drawer-section-title">Hone Control</h3>
        <div class="hone-drawer-actions">
          ${primary}
          <button class="hone-drawer-btn ${refineAllArmed ? "hone-drawer-btn--confirm" : ""}" data-action="refine-all" ${disabledAttr}>
            ${refineAllArmed ? "Confirm?" : "Hone All AI Messages"}
          </button>
        </div>
      </div>
    `;
  }

  function renderAutomation(): string {
    const refineChecked = state.autoRefine ? "checked" : "";
    // TODO(auto-enhance): toggle stays rendered (disabled) so the
    // slot is visible. Manual hone via the input-bar button is the
    // only draft-enhancement path for now.
    return `
      <div class="hone-drawer-section">
        <h3 class="hone-drawer-section-title">Automation</h3>
        <div class="hone-drawer-stat-row">
          <span title="Automatically refine every AI message after it finishes generating.">Auto-Refine AI</span>
          <label class="hone-drawer-toggle"><input type="checkbox" data-action="toggle-auto-refine" ${refineChecked}><span class="hone-drawer-toggle-track"></span></label>
        </div>
        <div class="hone-drawer-stat-row hone-drawer-stat-row--disabled">
          <span title="Auto-enhance your messages after sending. Coming soon; for now, use the Hone button in the chat input bar to enhance drafts manually.">Auto-Enhance User <em class="hone-drawer-coming-soon">(coming soon)</em></span>
          <label class="hone-drawer-toggle"><input type="checkbox" disabled><span class="hone-drawer-toggle-track"></span></label>
        </div>
      </div>
    `;
  }

  function renderStats(): string {
    if (!state.stats) {
      return `
        <div class="hone-drawer-section">
          <h3 class="hone-drawer-section-title">Stats</h3>
          <p class="hone-drawer-empty">No stats available.</p>
        </div>
      `;
    }

    const s = state.stats;
    let strategyBreakdown = "";
    for (const [name, count] of Object.entries(s.byStrategy)) {
      strategyBreakdown += `<div class="hone-drawer-stat-row"><span>${escapeHtml(name)}</span><span>${count}</span></div>`;
    }

    return `
      <div class="hone-drawer-section">
        <h3 class="hone-drawer-section-title">Stats</h3>
        <div class="hone-drawer-stat-row"><span>Messages refined</span><span>${s.messagesRefined}</span></div>
        <div class="hone-drawer-stat-row"><span>Total refinements</span><span>${s.totalRefinements}</span></div>
        ${strategyBreakdown ? `<div class="hone-drawer-stat-divider"></div>${strategyBreakdown}` : ""}
      </div>
    `;
  }

  // Proposals render before aggregator steps: proposals are the
  // input, aggregator stages are the merge.
  function compareStages(a: StageEntry, b: StageEntry): number {
    const rank = (k: StageKind) => (k === "proposal" ? 0 : 1);
    const byKind = rank(a.kind) - rank(b.kind);
    if (byKind !== 0) return byKind;
    return a.index - b.index;
  }

  function escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(str: string): string {
    return escapeHtml(str).replace(/'/g, "&#39;");
  }

  function handleClick(e: Event) {
    const target = e.target as HTMLElement;
    const el = target.closest?.("[data-action]") as HTMLElement | null;
    if (!el) {
      // Click on whitespace: disarm any pending confirmation so a
      // destructive action can't be completed hours later with one tap.
      resetConfirm();
      return;
    }
    if (el.hasAttribute("disabled")) return;

    const action = el.getAttribute("data-action");

    if (action === "refine-last") {
      resetConfirm();
      sendToBackend({ type: "refine-last" });
      return;
    }
    if (action === "use-stage") {
      resetConfirm();
      const stageIdx = parseInt(el.getAttribute("data-stage-index") || "0", 10);
      const rawKind = el.getAttribute("data-stage-kind");
      const stageKind: StageKind = rawKind === "proposal" ? "proposal" : "step";
      if (state.chatId && state.lastAiMessageId) {
        sendToBackend({
          type: "use-stage-version",
          chatId: state.chatId,
          messageId: state.lastAiMessageId,
          stageIndex: stageIdx,
          stageKind,
        });
      }
      return;
    }

    if (action === "refine-all" || action === "undo-last") {
      const confirmable = action as ConfirmableAction;
      if (state.pendingConfirm === confirmable) {
        clearConfirmTimer();
        state.pendingConfirm = null;
        sendToBackend({ type: confirmable });
        render();
      } else {
        armConfirm(confirmable);
        render();
      }
      return;
    }
  }

  function handleDocumentPointerDown(e: PointerEvent) {
    // Capture phase so we see the event even if some handler calls
    // stopPropagation.
    if (state.pendingConfirm === null) return;
    const target = e.target as Node | null;
    if (target && root.contains(target)) return;
    resetConfirm();
  }

  root.addEventListener("click", handleClick);
  root.addEventListener("change", (e: Event) => {
    const target = e.target as HTMLElement;
    if (!target) return;
    const action = target.getAttribute("data-action");
    if (action === "toggle-auto-refine" && target instanceof HTMLInputElement) {
      sendToBackend({ type: "update-settings", settings: { autoRefine: target.checked } });
    }
  });
  document.addEventListener("pointerdown", handleDocumentPointerDown, true);

  function handleBackendMessage(msg: BackendToFrontend) {
    // Delegate state updates to every panel (visible or not). Panels
    // never auto-render; renderActivePanel() below refreshes the one
    // currently visible.
    modelsPanel.handleBackendMessage(msg);
    outputPanel.handleBackendMessage(msg);
    inputPanel.handleBackendMessage(msg);

    renderActivePanel();

    switch (msg.type) {
      case "settings": {
        const s = msg.settings as HoneSettings;
        state.autoRefine = s.autoRefine;
        render();
        break;
      }

      case "stats":
        state.stats = msg.stats;
        render();
        break;

      case "active-chat": {
        // Mirror every field: this is the authoritative snapshot.
        const prevChatId = state.chatId;
        state.chatId = msg.chatId;
        state.lastAiMessageId = msg.lastAiMessageId ?? null;
        state.lastRefined = !!msg.lastMessageRefined;
        state.lastAiStages =
          msg.lastAiStages && msg.lastAiStages.length > 0
            ? [...msg.lastAiStages].sort(compareStages)
            : null;

        // Stats refresh on chat change only. Same-chat active-chat
        // pushes (after refine/undo) get fresh stats via their own
        // message path.
        if (msg.chatId !== prevChatId) {
          state.stats = null;
          state.busy = false;
          if (msg.chatId) {
            sendToBackend({ type: "get-stats", chatId: msg.chatId });
          }
        }
        render();
        break;
      }

      case "refine-started":
      case "auto-refine-started":
        state.busy = true;
        // Clear stale stages from the previous refine; a new
        // pipeline with fewer stages would otherwise mix with them.
        if (msg.messageId && msg.messageId === state.lastAiMessageId) {
          state.lastAiStages = null;
        }
        tab.setBadge("...");
        render();
        break;

      case "stage-complete": {
        // Progressive rendering: stages stream into the picker as
        // they complete. Follow-up active-chat lands with the same
        // list and makes the picker interactive.
        //
        // Filter by messageId: bulk flows stream stages for every
        // message in the batch, but the drawer only tracks the last
        // AI message.
        if (msg.messageId !== state.lastAiMessageId) break;
        const existing = state.lastAiStages ?? [];
        // (kind, index) is the unique key; dedupe on that tuple.
        const merged = existing
          .filter((s) => !(s.index === msg.stage.index && s.kind === msg.stage.kind))
          .concat(msg.stage)
          .sort(compareStages);
        state.lastAiStages = merged;
        render();
        break;
      }

      case "refine-complete":
      case "auto-refine-complete": {
        state.busy = false;
        tab.setBadge(msg.success ? "\u2713" : "\u2717");
        setTimeout(() => tab.setBadge(null), 3000);
        if (msg.success && state.chatId) {
          // Refined/stage state updates via the backend's follow-up
          // active-chat; stats need an explicit fetch.
          sendToBackend({ type: "get-stats", chatId: state.chatId });
        }
        render();
        break;
      }

      case "refine-error":
        state.busy = false;
        tab.setBadge("\u2717");
        setTimeout(() => tab.setBadge(null), 3000);
        render();
        break;

      case "bulk-progress":
        tab.setBadge(`${msg.current}/${msg.total}`);
        break;
    }
  }

  // Initial render: buttons are disabled until the first
  // active-chat lands from the backend's handshake.
  render();

  return {
    handleBackendMessage,
    openBulkRefine() {
      tab.activate();
    },
    /** Bring the Hone drawer tab to the foreground. */
    activate() {
      tab.activate();
    },
    destroy() {
      clearConfirmTimer();
      root.removeEventListener("click", handleClick);
      document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
      tab.destroy();
    },
  };
}
