// DOM-injection for per-message refine/undo buttons. Temporary
// until Lumiverse exposes a registerMessageAction contribution API.
// Swap seam: keep the MessageActionInjector interface stable.
//
// Stable selectors (verified in vendor/Lumiverse/frontend/src/
// components/chat/):
//   [data-component="MessageList"]    : scroll root (observer target)
//   [data-message-id]                 : per-message wrapper
//   [data-part]                       : "user" | "character" | "streaming"
//   [data-component="BubbleActions"]  : bubble-mode action bar
//
// These attributes are written by React directly (not CSS modules)
// so they survive build hashes. If any change upstream, this
// injector silently no-ops; it MUST never throw into the host's
// render cycle. The drawer and float widget stay functional without it.

import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import type { FrontendToBackend } from "../types";
import { REFINE_ICON_SVG, UNDO_ICON_SVG, SPINNER_ICON_SVG } from "./icons";

/* Matches the native `.pill button` shape (26×26, transparent, 6px
 * radius) so the Hone button sits flush next to Copy/Edit/Fork. Same
 * display-toggle icon pattern as input-area-injector.ts. */
const INJECTOR_STYLES = `
button[data-hone-btn] {
  width: 26px;
  height: 26px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--lumiverse-text-dim, rgba(230, 230, 240, 0.55));
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  transition: background 120ms ease, color 120ms ease, opacity 120ms ease;
}
button[data-hone-btn]:hover:not(:disabled) {
  background: var(--lumiverse-fill-subtle, rgba(255, 255, 255, 0.08));
  color: var(--lumiverse-text, inherit);
}
button[data-hone-btn]:disabled {
  opacity: 0.4;
  cursor: default;
}
button[data-hone-btn].hone-msg-btn--refined {
  color: var(--lumiverse-primary, #4a90e2);
}
button[data-hone-btn] .hone-icon {
  display: none;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
button[data-hone-btn]:not(.hone-msg-btn--refined):not(.hone-msg-btn--busy) .hone-icon--refine {
  display: inline-flex;
}
button[data-hone-btn].hone-msg-btn--refined:not(.hone-msg-btn--busy) .hone-icon--undo {
  display: inline-flex;
}
button[data-hone-btn].hone-msg-btn--busy .hone-icon--spinner {
  display: inline-flex;
  animation: hone-msg-spin 1s linear infinite;
  transform-origin: 50% 50%;
}
@keyframes hone-msg-spin {
  to { transform: rotate(360deg); }
}
`;

/** Stable seam. Pure mirror of backend state: per-message state is
 *  never derived locally; only the `active-chat` snapshot from the
 *  backend drives `setRefinedMessages`. */
export interface MessageActionInjector {
  setRefinedMessages(ids: Iterable<string>): void;
  /** Optimistic busy on click; reconciled by refine-started /
   *  refine-complete. */
  setBusy(messageId: string, busy: boolean): void;
  rescan(): void;
  destroy(): void;
}

export function createMessageActionInjector(
  ctx: SpindleFrontendContext,
  sendToBackend: (msg: FrontendToBackend) => void,
  getActiveChatId: () => string | null,
  isReady: () => boolean
): MessageActionInjector {
  const refinedIds = new Set<string>();
  const busyIds = new Set<string>();

  const removeStyle = ctx.dom.addStyle(INJECTOR_STYLES);

  let observer: MutationObserver | null = null;
  let attachedTo: Element | null = null;
  let listPollId: number | null = null;

  function findMessageList(): Element | null {
    return document.querySelector('[data-component="MessageList"]');
  }

  function attach(list: Element) {
    if (attachedTo === list) return;
    detach();
    attachedTo = list;
    observer = new MutationObserver((mutations) => {
      // injectInto is idempotent via `[data-hone-btn]` checks, so
      // duplicate scans are safe.
      for (const m of mutations) {
        for (const node of Array.from(m.addedNodes)) {
          if (node instanceof Element) scanAndInject(node);
        }
      }
    });
    observer.observe(list, { childList: true, subtree: true });
    scanAndInject(list);
  }

  function detach() {
    if (observer) observer.disconnect();
    observer = null;
    attachedTo = null;
  }

  function scanAndInject(root: Element) {
    // Case 1: whole message wrapper added (initial mount, streaming,
    // chat switch).
    if (root instanceof HTMLElement && root.hasAttribute("data-message-id")) {
      injectInto(root);
    }
    const messages = root.querySelectorAll("[data-message-id]");
    messages.forEach((el) => injectInto(el as HTMLElement));

    // Case 2: only the BubbleActions pill re-mounted inside an
    // existing message (e.g. user left edit mode, React swaps the
    // bubble contents but keeps the [data-message-id] wrapper). The
    // wrapper isn't in addedNodes so Case 1 misses it.
    const pillSelector = '[data-component="BubbleActions"]';
    const pills: Element[] = [];
    if (root instanceof HTMLElement && root.matches(pillSelector)) {
      pills.push(root);
    }
    pills.push(...Array.from(root.querySelectorAll(pillSelector)));
    for (const pill of pills) {
      const msgEl = pill.closest("[data-message-id]");
      if (msgEl instanceof HTMLElement) injectInto(msgEl);
    }
  }

  function findActionBar(messageEl: Element): Element | null {
    // Bubble mode: stable data-component attribute.
    const bubble = messageEl.querySelector('[data-component="BubbleActions"]');
    if (bubble) return bubble;
    // Minimal mode: walk up from the Edit button (stable across
    // modes, no CSS module dependency). If the shape changes
    // upstream the fallback quietly no-ops.
    const editBtn = messageEl.querySelector('button[title="Edit"]');
    if (editBtn && editBtn.parentElement) return editBtn.parentElement;
    return null;
  }

  function injectInto(messageEl: HTMLElement) {
    const part = messageEl.getAttribute("data-part");
    // Streaming messages: action bar isn't rendered yet; a follow-up
    // observer fire will catch the message once actions mount.
    if (part === "streaming") return;
    // User messages route through the input-bar enhance flow.
    if (part !== "character") return;

    const messageId = messageEl.getAttribute("data-message-id");
    if (!messageId) return;

    const bar = findActionBar(messageEl);
    if (!bar) return;

    // Guard against duplicate injection when React brings a fresh
    // bar for the same messageId.
    if (bar.querySelector('[data-hone-btn]')) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("data-hone-btn", messageId);
    btn.setAttribute("aria-label", "Hone this message");
    btn.title = "Hone this message";

    const refineIcon = document.createElement("span");
    refineIcon.className = "hone-icon hone-icon--refine";
    refineIcon.innerHTML = REFINE_ICON_SVG;
    const undoIcon = document.createElement("span");
    undoIcon.className = "hone-icon hone-icon--undo";
    undoIcon.innerHTML = UNDO_ICON_SVG;
    const spinnerIcon = document.createElement("span");
    spinnerIcon.className = "hone-icon hone-icon--spinner";
    spinnerIcon.innerHTML = SPINNER_ICON_SVG;
    btn.appendChild(refineIcon);
    btn.appendChild(undoIcon);
    btn.appendChild(spinnerIcon);

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleClick(messageId);
    });
    try {
      bar.appendChild(btn);
    } catch {
      // Bar may have been unmounted between query and append.
      return;
    }
    updateButtonState(messageId);
  }

  function buttonsForMessage(messageId: string): NodeListOf<HTMLButtonElement> {
    return document.querySelectorAll(
      `[data-hone-btn="${CSS.escape(messageId)}"]`
    );
  }

  function updateButtonState(messageId: string) {
    const refined = refinedIds.has(messageId);
    const busy = busyIds.has(messageId);
    const disabled = busy || !isReady();
    const title = busy
      ? "Honing..."
      : refined
      ? "Undo Hone refinement"
      : "Hone this message";
    buttonsForMessage(messageId).forEach((btn) => {
      btn.disabled = disabled;
      btn.title = title;
      btn.classList.toggle("hone-msg-btn--refined", refined);
      btn.classList.toggle("hone-msg-btn--busy", busy);
    });
  }

  function updateAllButtonStates() {
    const buttons = document.querySelectorAll("[data-hone-btn]");
    const seen = new Set<string>();
    buttons.forEach((btn) => {
      const id = btn.getAttribute("data-hone-btn");
      if (id) seen.add(id);
    });
    seen.forEach(updateButtonState);
  }

  function handleClick(messageId: string) {
    if (!isReady()) return;
    if (busyIds.has(messageId)) return;

    const chatId = getActiveChatId();
    if (!chatId) return;

    const wantUndo = refinedIds.has(messageId);
    busyIds.add(messageId);
    updateButtonState(messageId);
    if (wantUndo) {
      sendToBackend({ type: "undo", chatId, messageId });
    } else {
      sendToBackend({ type: "refine", chatId, messageId });
    }
  }

  // MessageList may not be mounted yet; poll briefly.
  const initial = findMessageList();
  if (initial) {
    attach(initial);
  } else {
    listPollId = window.setInterval(() => {
      const l = findMessageList();
      if (l) {
        if (listPollId !== null) {
          window.clearInterval(listPollId);
          listPollId = null;
        }
        attach(l);
      }
    }, 500);
  }

  return {
    setRefinedMessages(ids) {
      refinedIds.clear();
      for (const id of ids) refinedIds.add(id);
      // busyIds untouched; a state refresh shouldn't clear an
      // in-flight refine the user just kicked off.
      updateAllButtonStates();
    },
    setBusy(messageId, busy) {
      if (busy) busyIds.add(messageId);
      else busyIds.delete(messageId);
      updateButtonState(messageId);
    },
    rescan() {
      // Re-find the MessageList in case chat navigation swapped it out,
      // then scan whatever's currently mounted.
      const current = findMessageList();
      if (current && current !== attachedTo) {
        attach(current);
      } else if (attachedTo) {
        scanAndInject(attachedTo);
      }
    },
    destroy() {
      detach();
      if (listPollId !== null) {
        window.clearInterval(listPollId);
        listPollId = null;
      }
      document.querySelectorAll("[data-hone-btn]").forEach((btn) => btn.remove());
      removeStyle();
      refinedIds.clear();
      busyIds.clear();
    },
  };
}
