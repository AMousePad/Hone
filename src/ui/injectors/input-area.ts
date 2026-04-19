// DOM-injection for the Hone/Undo button in the chat input action
// bar. Temporary until Lumiverse ships a per-action contribution API
// (the existing `chat_toolbar` mount is a wrapper around the action
// bar, not inside it).
//
// Swap seam: when a native API lands, replace this module's body
// while preserving the InputAreaInjector interface.
//
// TODO(auto-enhance): an earlier iteration of this module also
// intercepted Enter / native Send when Auto-Enhance User was pre/
// inplace. That surface is paused until the feature ships; this
// module currently manages only the manually-triggered button.
//
// Stable selectors (verified in vendor/Lumiverse/frontend/src/
// components/chat/InputArea.tsx):
//   [data-component="InputArea"]   : top-level container
//   button[title="Back to home"]   : always present; parent = action bar
//
// Native CSS module classnames (`_actionBar_*`, `_actionBtn_*`) are
// hashed and cannot be used directly. We clone the Home button's
// className to inherit the current hash; a hash change just means
// the next MutationObserver pass picks up the new one.

import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import type { FrontendToBackend } from "../../types";
import { REFINE_ICON_SVG, UNDO_ICON_SVG, SPINNER_ICON_SVG } from "../icons";
import * as flog from "../flog";
import { observeRoot } from "./observe-root";

const INJECTOR_STYLES = `
/* State overrides on top of the cloned native action-button styling,
 * plus icon visibility. All three icons are mounted at all times;
 * state classes toggle which one is visible. Display toggling (not
 * innerHTML swaps) keeps state updates to pure attribute changes so
 * the InputArea MutationObserver doesn't re-enter. */
button[data-hone-input-btn] {
  position: relative;
}
/* Visual-disabled without setting the disabled attribute; see
 * updateAllButtonStates for why. handleClick guards on the same
 * conditions so click delivery stays reliable. */
button[data-hone-input-btn].hone-input-btn--disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
button[data-hone-input-btn].hone-input-btn--refined {
  color: var(--lumiverse-primary, #4a90e2);
}
button[data-hone-input-btn].hone-input-btn--enhancing {
  color: var(--lumiverse-primary, #4a90e2);
}
button[data-hone-input-btn] .hone-icon {
  display: none;
  align-items: center;
  justify-content: center;
}
/* Default state (no state class) -> show refine. */
button[data-hone-input-btn]:not(.hone-input-btn--refined):not(.hone-input-btn--enhancing) .hone-icon--refine {
  display: inline-flex;
}
button[data-hone-input-btn].hone-input-btn--refined:not(.hone-input-btn--enhancing) .hone-icon--undo {
  display: inline-flex;
}
button[data-hone-input-btn].hone-input-btn--enhancing .hone-icon--spinner {
  display: inline-flex;
  animation: hone-input-spin 1s linear infinite;
  transform-origin: 50% 50%;
}
@keyframes hone-input-spin {
  to { transform: rotate(360deg); }
}
`;

export interface InputAreaInjector {
  setEnabled(enabled: boolean): void;
  setBusy(busy: boolean): void;
  onEnhanceResult(text: string, requestId: number): void;
  onEnhanceError(): void;
  rescan(): void;
  destroy(): void;
}

export function createInputAreaInjector(
  ctx: SpindleFrontendContext,
  sendToBackend: (msg: FrontendToBackend) => void,
  getActiveChatId: () => string | null,
  isReady: () => boolean
): InputAreaInjector {
  let enabled = true;
  let chatBusy = false;
  let enhanceBusy = false;
  let savedOriginal: string | null = null;
  let savedEnhanced: string | null = null;
  let nextRequestId = 0;
  let activeRequestId = 0;

  const removeStyle = ctx.dom.addStyle(INJECTOR_STYLES);

  let inputListenerEl: HTMLElement | null = null;

  // Lumiverse clears the input field via React state, which doesn't
  // dispatch a DOM `input` event; without MESSAGE_SENT, the Undo
  // button would linger because onInputEdit's divergence check never
  // fires.
  const messageSentUnsub = ctx.events.on("MESSAGE_SENT", (payload: unknown) => {
    const p = payload as { chatId?: string; message?: { is_user?: boolean; role?: string } } | null;
    if (!p) return;
    const activeChatId = getActiveChatId();
    if (!activeChatId || p.chatId !== activeChatId) return;
    // Assistant responses and system events shouldn't clear state.
    const isUser = p.message?.is_user === true || p.message?.role === "user";
    if (!isUser) return;
    if (savedOriginal === null && savedEnhanced === null) return;
    savedOriginal = null;
    savedEnhanced = null;
    updateAllButtonStates();
  });

  function findInputArea(): Element | null {
    return document.querySelector('[data-component="InputArea"]');
  }

  function findActionBar(ia: Element): HTMLElement | null {
    // Home button is rendered in every state; walk up to its parent.
    const homeBtn = ia.querySelector<HTMLButtonElement>('button[title="Back to home"]');
    if (homeBtn?.parentElement) return homeBtn.parentElement as HTMLElement;
    return null;
  }

  function findInputEl(ia: Element): HTMLTextAreaElement | HTMLElement | null {
    const ta = ia.querySelector<HTMLTextAreaElement>("textarea");
    if (ta) return ta;
    const ce = ia.querySelector<HTMLElement>("[contenteditable]");
    return ce ?? null;
  }

  function readInputText(): string {
    const ia = findInputArea();
    if (!ia) return "";
    const el = findInputEl(ia);
    if (!el) return "";
    if (el instanceof HTMLTextAreaElement) return el.value;
    return el.textContent ?? "";
  }

  function writeInputText(text: string): void {
    const ia = findInputArea();
    if (!ia) {
      flog.error("writeInputText: no InputArea found in DOM");
      return;
    }
    const el = findInputEl(ia);
    if (!el) {
      flog.error("writeInputText: no input element inside InputArea");
      return;
    }

    if (el instanceof HTMLTextAreaElement) {
      // React's controlled-input value tracker watches the prototype
      // setter; `el.value = text` bypasses it and the next render
      // restores React's stored value. Use the prototype setter
      // directly, then dispatch `input` so React's onChange fires.
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value"
      )?.set;
      if (!setter) {
        flog.error(
          "writeInputText: HTMLTextAreaElement.prototype value setter not found; falling back to direct assignment"
        );
        el.value = text;
      } else {
        setter.call(el, text);
      }
    } else {
      el.textContent = text;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function buttons(): NodeListOf<HTMLButtonElement> {
    return document.querySelectorAll<HTMLButtonElement>("[data-hone-input-btn]");
  }

  function updateAllButtonStates() {
    // enhanceBusy stays interactive (click = cancel).
    //
    // We deliberately DON'T set the `disabled` attribute: browsers
    // won't dispatch click to disabled buttons, and any transient
    // `disabled=true` between injection and click would make the
    // click silently vanish. Mirror via aria-disabled + CSS class;
    // handleClick gates on the same conditions, so click delivery is
    // immune to React reconciliation races.
    const disabled = !enabled || chatBusy || !isReady();
    const refined = savedOriginal !== null && !enhanceBusy;

    const title = enhanceBusy
      ? "Honing... (click to cancel)"
      : refined
      ? "Undo Hone (restore your original draft)"
      : "Hone your draft";

    buttons().forEach((btn) => {
      btn.setAttribute("aria-disabled", String(disabled));
      btn.classList.toggle("hone-input-btn--disabled", disabled);
      btn.classList.toggle("hone-input-btn--enhancing", enhanceBusy);
      btn.classList.toggle("hone-input-btn--refined", refined);
      btn.title = title;
    });
  }

  // Document-level capture-phase delegation; see injectInto for why
  // direct btn listeners are unreliable here.
  function handleDocClick(e: Event) {
    const target = e.target as Element | null;
    const btn = target?.closest?.("[data-hone-input-btn]");
    if (!btn) return;
    handleClick(e);
  }
  document.addEventListener("click", handleDocClick, true);

  function handleClick(e: Event) {
    e.preventDefault();
    e.stopPropagation();
    // Cancel is always allowed; check before the disabled gate.
    if (enhanceBusy) {
      cancelEnhance();
      return;
    }
    if (!enabled || chatBusy || !isReady()) return;

    if (savedOriginal !== null) {
      // Frontend-only undo; writeInputText routes through the React
      // value setter so the tracker sees the change.
      writeInputText(savedOriginal);
      savedOriginal = null;
      savedEnhanced = null;
      updateAllButtonStates();
      return;
    }

    triggerHone();
  }

  /** Empty drafts are valid; input presets handle the
   *  "impersonate persona / write from scratch" case when
   *  `{{userMessage}}` is empty. `mode: "pre"` routes to the code
   *  path in `enhanceUserMessage` that runs the input preset against
   *  the draft and returns the refined result. */
  function triggerHone(): void {
    const chatId = getActiveChatId();
    if (!chatId) return;
    const currentText = readInputText();
    savedOriginal = currentText;
    savedEnhanced = null;
    enhanceBusy = true;
    activeRequestId = ++nextRequestId;
    sendToBackend({ type: "enhance", text: currentText, chatId, mode: "pre", requestId: activeRequestId });
    updateAllButtonStates();
  }

  function cancelEnhance() {
    if (!enhanceBusy) return;
    const chatId = getActiveChatId();
    enhanceBusy = false;
    savedOriginal = null;
    savedEnhanced = null;
    if (chatId) sendToBackend({ type: "cancel-enhance", chatId });
    updateAllButtonStates();
  }

  function attachInputListener() {
    const ia = findInputArea();
    if (!ia) return;
    const el = findInputEl(ia);
    if (!el || el === inputListenerEl) return;
    // Detach from the previous input if it was replaced.
    if (inputListenerEl) {
      inputListenerEl.removeEventListener("input", onInputEdit);
    }
    inputListenerEl = el;
    el.addEventListener("input", onInputEdit);
  }

  function onInputEdit() {
    // If typed text diverges from the enhanced value, undo no longer
    // points at the draft the user sees; revert to idle-hone.
    if (savedOriginal !== null && savedEnhanced !== null) {
      const current = readInputText();
      if (current !== savedEnhanced) {
        savedOriginal = null;
        savedEnhanced = null;
        updateAllButtonStates();
      }
    }
  }

  function injectInto(bar: HTMLElement) {
    // Idempotent; prevent duplicates when React mutates other
    // subtree parts.
    if (bar.querySelector("[data-hone-input-btn]")) {
      return;
    }
    // createElement (not cloneNode) to inherit only the className,
    // not the template's transient disabled/ARIA/React state.
    const template = bar.querySelector<HTMLButtonElement>('button[title="Back to home"]');
    if (!template) {
      flog.warn("injectInto: no template button (Back to home) found in action bar");
      return;
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = template.className;
    btn.setAttribute("data-hone-input-btn", "");
    btn.title = "Hone your draft";

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

    // Click handling lives on a document capture-phase listener
    // (handleDocClick); direct btn listeners have been observed to
    // silently drop clicks after chat navigation and recover on a
    // later re-render. Document delegation is immune to React
    // reconciliation detaching listeners.
    //
    // Local pointerdown.stopPropagation prevents an ancestor from
    // calling setPointerCapture and stealing subsequent events.
    btn.addEventListener("pointerdown", (e) => e.stopPropagation());
    try {
      bar.appendChild(btn);
    } catch (err) {
      flog.error("injectInto: appendChild failed", err);
      return;
    }
    updateAllButtonStates();
  }

  const observation = observeRoot({
    findRoot: () => document.querySelector('[data-component="InputArea"]'),
    onMount: (root) => {
      const bar = findActionBar(root);
      if (bar) injectInto(bar);
      attachInputListener();
    },
    onMutation: (root) => {
      const bar = findActionBar(root);
      if (bar) injectInto(bar);
      attachInputListener();
    },
  });

  return {
    setEnabled(value) {
      enabled = value;
      updateAllButtonStates();
    },
    setBusy(value) {
      chatBusy = value;
      updateAllButtonStates();
    },
    onEnhanceResult(text, requestId) {
      if (requestId !== activeRequestId) return;
      if (savedOriginal === null) {
        enhanceBusy = false;
        updateAllButtonStates();
        return;
      }
      enhanceBusy = false;
      writeInputText(text);
      savedEnhanced = text;
      updateAllButtonStates();
    },
    onEnhanceError() {
      if (!enhanceBusy) return;
      enhanceBusy = false;
      savedOriginal = null;
      savedEnhanced = null;
      updateAllButtonStates();
    },
    rescan() {
      observation.rescan();
      updateAllButtonStates();
    },
    destroy() {
      observation.destroy();
      messageSentUnsub();
      document.removeEventListener("click", handleDocClick, true);
      if (inputListenerEl) {
        inputListenerEl.removeEventListener("input", onInputEdit);
        inputListenerEl = null;
      }
      document.querySelectorAll("[data-hone-input-btn]").forEach((b) => b.remove());
      removeStyle();
    },
  };
}
