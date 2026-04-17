import type {
  SpindleFrontendContext,
  SpindleFloatWidgetHandle,
} from "lumiverse-spindle-types";
import type { FrontendToBackend, BackendToFrontend } from "../../types";
import { REFINE_ICON_SVG, UNDO_ICON_SVG, SPINNER_ICON_SVG } from "../icons";
import { CHIBI_NORMAL_URL } from "../generated/chibi-normal";
import { CHIBI_SLEEPY_URL } from "../generated/chibi-sleepy";
import { CHIBI_THINKING_URL } from "../generated/chibi-thinking";
import { CHIBI_HOVER_HONE_URL } from "../generated/chibi-hover-hone";
import { CHIBI_HOVER_UNDO_URL } from "../generated/chibi-hover-undo";
import { CHIBI_UNDO_AFTER_URL } from "../generated/chibi-undo-after";
import { CHIBI_ERROR_URL } from "../generated/chibi-error";
import { CHIBI_ANGRY_URL } from "../generated/chibi-angry";

type SizeKey = "small" | "medium" | "large" | "giant" | "enormous";
const CLASSIC_SIZES: Record<SizeKey, number> = {
  small: 36,
  medium: 48,
  large: 64,
  giant: 92,
  enormous: 124,
};
const LUMIA_SIZES: Record<SizeKey, number> = {
  small: 92,
  medium: 124,
  large: 164,
  giant: 236,
  enormous: 320,
};
const SIZE_KEYS: SizeKey[] = ["small", "medium", "large", "giant", "enormous"];
const DEFAULT_SIZE = LUMIA_SIZES.medium;
const SIZE_MIN_PX = 24;
const SIZE_MAX_PX = 1920;

const CONFIRM_TIMEOUT_MS = 4000;
/** Pointer movement that flips a tap into a drag. */
const DRAG_THRESHOLD_PX = 5;
const EDGE_PAD_PX = 12;
const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_TOLERANCE_PX = 10;
/** Idle duration that switches the widget to the sleepy chibi. */
const SLEEPY_TIMEOUT_MS = 60_000;
/** Mobile "Done!" / "Undone :(" state duration after a widget tap. */
const POST_ACTION_DURATION_MS = 2000;
/** Desktop post-undo confirmation window. Survives mouseleave so the
 *  user still sees it after walking away. */
const UNDO_AFTER_DURATION_MS = 3000;
/** Angry-chibi linger after the user finishes dragging. */
const DRAG_ANGRY_LINGER_MS = 1000;

export interface FloatWidgetOptions {
  /** Opens the Hone drawer tab; wired to the context menu's
   *  "Open Hone Tab" item. */
  openDrawerTab: () => void;
}

export function createFloatWidget(
  ctx: SpindleFrontendContext,
  sendToBackend: (msg: FrontendToBackend) => void,
  isReady: () => boolean,
  opts: FloatWidgetOptions
) {
  let currentSize = DEFAULT_SIZE;
  let currentHidden = false;

  let refined = false;
  let busy = false;
  let generating = false;
  let ready = isReady();
  let confirmRequired = false;
  /** null = idle, "refine"/"undo" = armed for the next tap to fire
   *  that action. Only reachable when `confirmRequired` is true. */
  let armed: "refine" | "undo" | null = null;
  let armedTimer: ReturnType<typeof setTimeout> | null = null;

  let isHovered = false;
  let isSleepy = false;
  let sleepyTimer: ReturnType<typeof setTimeout> | null = null;
  /** Mirrored from frontend.ts. The widget reacts to the error
   *  modal but doesn't own its lifecycle. Highest-priority display. */
  let errorShowing = false;
  /** Chibi PNG vs classic SVG. Both subtrees are mounted; the
   *  `.hone-float-widget--lumia` class on the button toggles
   *  visibility via CSS. */
  let lumiaMode = true;

  /** Touch-only device. Evaluated once. Touch hybrids (laptops with
   *  touchscreens) report hover: hover and are treated as desktop.
   *  Mobile differs: no hover labels; transient post-action state
   *  after widget-initiated taps. */
  const isMobile =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    !window.matchMedia("(hover: hover)").matches;

  /** Last widget-initiated action waiting for refine-complete.
   *  Mobile only; drives the post-action "Done!" / "Undone :("
   *  branch. Null on desktop. */
  let pendingAction: "refine" | "undo" | null = null;
  let postActionState: "done" | "undone" | null = null;
  let postActionTimer: ReturnType<typeof setTimeout> | null = null;
  /** A mobile refine waiting on the diff modal to close before
   *  flipping to "Done!". */
  let awaitingDiffClose = false;
  let diffModalOpen = false;
  /** Desktop-only post-undo pin on the `undo_after` chibi. Survives
   *  mouseleave so the confirmation is visible even after walking
   *  away; cleared by another click, refine-started, refine-error,
   *  or timer expiry. */
  let undoAfterActive = false;
  let undoAfterTimer: ReturnType<typeof setTimeout> | null = null;
  /** Dragging or within the linger window after release. Drives the
   *  angry chibi. Set when pointermove crosses the drag threshold;
   *  cleared by a timer started in the framework's onDragEnd. */
  let dragActive = false;
  let dragLingerTimer: ReturnType<typeof setTimeout> | null = null;

  // Shared DOM: survives widget recreation on size change. Both
  // render modes' subtrees are mounted at all times; CSS class
  // toggle decides visibility so render() stays cheap.
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "hone-float-widget";

  const chibiImg = document.createElement("img");
  chibiImg.src = CHIBI_NORMAL_URL;
  chibiImg.alt = "Hone";
  chibiImg.className = "hone-float-chibi";
  chibiImg.draggable = false;
  btn.appendChild(chibiImg);

  const labelEl = document.createElement("span");
  labelEl.className = "hone-float-label";
  labelEl.textContent = "Idle";
  btn.appendChild(labelEl);

  const refineIcon = document.createElement("span");
  refineIcon.className = "hone-float-icon hone-float-icon--refine";
  refineIcon.innerHTML = REFINE_ICON_SVG;
  const undoIcon = document.createElement("span");
  undoIcon.className = "hone-float-icon hone-float-icon--undo";
  undoIcon.innerHTML = UNDO_ICON_SVG;
  const spinnerIcon = document.createElement("span");
  spinnerIcon.className = "hone-float-icon hone-float-icon--spinner";
  spinnerIcon.innerHTML = SPINNER_ICON_SVG;
  btn.appendChild(refineIcon);
  btn.appendChild(undoIcon);
  btn.appendChild(spinnerIcon);

  /** Scale classic-mode SVGs. Chibi <img> uses percentage CSS. */
  function applyIconSize(size: number) {
    const iconSize = Math.round(size * 0.5);
    for (const icon of [refineIcon, undoIcon, spinnerIcon]) {
      const svg = icon.querySelector("svg");
      if (svg) {
        svg.setAttribute("width", String(iconSize));
        svg.setAttribute("height", String(iconSize));
      }
    }
  }

  /** Priority order (highest first):
   *    error -> drag -> post-action (mobile) -> busy/generating ->
   *    undo-after (desktop pin) -> hover (desktop) -> sleepy -> default
   *  Hover is gated on !isMobile so a spurious mouseenter on tap
   *  doesn't leak hover chibi to touch users. */
  function selectChibiUrl(): string {
    if (errorShowing) return CHIBI_ERROR_URL;
    if (dragActive) return CHIBI_ANGRY_URL;
    if (postActionState === "undone") return CHIBI_UNDO_AFTER_URL;
    if (postActionState === "done") return CHIBI_HOVER_HONE_URL;
    if (busy || generating) return CHIBI_THINKING_URL;
    if (undoAfterActive) return CHIBI_UNDO_AFTER_URL;
    if (!isMobile && isHovered && ready) {
      return refined ? CHIBI_HOVER_UNDO_URL : CHIBI_HOVER_HONE_URL;
    }
    if (isSleepy) return CHIBI_SLEEPY_URL;
    return CHIBI_NORMAL_URL;
  }

  /** Same priority order as selectChibiUrl; kept in sync so the
   *  label never contradicts the chibi. */
  function selectLabel(): string {
    if (errorShowing) return "Error!";
    if (dragActive) return "don't touch me!";
    if (postActionState === "undone") return "Undone :(";
    if (postActionState === "done") return "Done!";
    if (busy || generating) return "Working~";
    if (undoAfterActive) return "Undone :(";
    if (!isMobile && isHovered && ready) {
      return refined ? "Undo?" : "Hone";
    }
    if (isSleepy) return "Sleeping...";
    return "Idle";
  }

  let widget: SpindleFloatWidgetHandle;
  let offDragEnd: () => void = () => {};

  function buildWidget(size: number, pos?: { x: number; y: number }) {
    widget = ctx.ui.createFloatWidget({
      width: size,
      height: size,
      initialPosition: pos ?? { x: 20, y: 300 },
      snapToEdge: true,
      tooltip: "Hone",
      chromeless: true,
    });
    widget.root.style.width = `${size}px`;
    widget.root.style.height = `${size}px`;
    // Disable browser touch gestures so drag + tap work on mobile.
    widget.root.style.touchAction = "none";
    widget.root.appendChild(btn);

    applyIconSize(size);
    // Re-apply hidden state on every rebuild so a size change during
    // hidden state doesn't flash the widget visible.
    widget.setVisible(!currentHidden);

    offDragEnd = widget.onDragEnd(() => {
      clampWidgetPosition();
      // Only start the angry linger if we actually crossed the drag
      // threshold; onDragEnd fires for taps the framework classifies
      // as sub-threshold drags, which shouldn't trigger angry.
      if (dragActive) {
        if (dragLingerTimer) clearTimeout(dragLingerTimer);
        dragLingerTimer = setTimeout(() => {
          dragActive = false;
          dragLingerTimer = null;
          render();
        }, DRAG_ANGRY_LINGER_MS);
      }
    });
    clampWidgetPosition();
  }

  buildWidget(currentSize);

  /** Pull the widget back inside the viewport. Covers viewport
   *  shrink, off-bounds drags, and stale saved positions. */
  function clampWidgetPosition() {
    const pos = widget.getPosition();
    const maxX = window.innerWidth - currentSize - EDGE_PAD_PX;
    const maxY = window.innerHeight - currentSize - EDGE_PAD_PX;
    const clampedX = Math.max(EDGE_PAD_PX, Math.min(pos.x, maxX));
    const clampedY = Math.max(EDGE_PAD_PX, Math.min(pos.y, maxY));
    if (clampedX !== pos.x || clampedY !== pos.y) {
      widget.moveTo(clampedX, clampedY);
    }
  }
  window.addEventListener("resize", clampWidgetPosition);

  function clearArmedTimer() {
    if (armedTimer !== null) {
      clearTimeout(armedTimer);
      armedTimer = null;
    }
  }

  function disarm() {
    if (armed === null) return;
    armed = null;
    clearArmedTimer();
    render();
  }

  function arm(action: "refine" | "undo") {
    armed = action;
    clearArmedTimer();
    armedTimer = setTimeout(() => {
      if (armed === action) disarm();
    }, CONFIRM_TIMEOUT_MS);
    render();
  }

  function render() {
    const disabled = !ready || busy || generating;
    const showSpinner = busy || generating;
    const showUndo = !showSpinner && refined;
    const showRefine = !showSpinner && !showUndo;

    btn.classList.toggle("hone-float-widget--lumia", lumiaMode);
    btn.classList.toggle("hone-float-widget--disabled", disabled && !errorShowing && !showSpinner);
    btn.classList.toggle("hone-float-widget--armed", armed !== null && !errorShowing && !showSpinner);
    btn.classList.toggle("hone-float-widget--busy", showSpinner);
    btn.classList.toggle("hone-float-widget--refined", refined && !showSpinner);
    btn.classList.toggle("hone-float-widget--show-refine", showRefine);
    btn.classList.toggle("hone-float-widget--show-undo", showUndo);

    btn.setAttribute("aria-disabled", String(disabled));

    // Skip no-op writes to avoid label flicker.
    const nextUrl = selectChibiUrl();
    if (chibiImg.src !== nextUrl) chibiImg.src = nextUrl;
    const nextLabel = selectLabel();
    if (labelEl.textContent !== nextLabel) labelEl.textContent = nextLabel;

    const confirmHint = confirmRequired ? " (two taps to confirm)" : "";
    btn.title = !ready
      ? "Hone is connecting to the backend..."
      : errorShowing
      ? "An error occurred, see the modal"
      : (busy || generating)
      ? busy ? "Honing..." : "Generating..."
      : armed === "refine"
      ? "Confirm?"
      : armed === "undo"
      ? "Confirm?"
      : refined
      ? `Undo the last refinement${confirmHint}`
      : `Hone the last AI message${confirmHint}`;
  }

  /** Reset the sleepy timer on any user activity. Called on hover,
   *  tap, hone-started, hone-complete. */
  function noteActivity() {
    if (isSleepy) {
      isSleepy = false;
      render();
    }
    if (sleepyTimer) clearTimeout(sleepyTimer);
    sleepyTimer = setTimeout(() => {
      isSleepy = true;
      render();
    }, SLEEPY_TIMEOUT_MS);
  }
  noteActivity();

  render();

  // Tap/drag discrimination: pointerdown captures start, pointermove
  // flips didDrag on threshold cross, click/touchend fires if not a
  // drag. Touchend preventDefaults to block the synthetic click.

  let didDrag = false;
  let pointerStartPos = { x: 0, y: 0 };

  function fire(action: "refine" | "undo") {
    clearArmedTimer();
    armed = null;
    // Only widget-initiated actions get mobile post-state:
    // auto-refine and per-message refines leave pendingAction=null
    // and are ignored by handleBackendMessage.
    pendingAction = action;
    clearPostAction();
    clearUndoAfter();
    if (action === "undo") {
      sendToBackend({ type: "undo-last" });
      // Desktop-only confirmation pin; survives mouseleave.
      if (!isMobile) {
        undoAfterActive = true;
        undoAfterTimer = setTimeout(() => {
          undoAfterActive = false;
          undoAfterTimer = null;
          render();
        }, UNDO_AFTER_DURATION_MS);
      }
    } else {
      sendToBackend({ type: "refine-last" });
    }
    render();
  }

  function clearUndoAfter() {
    if (undoAfterTimer !== null) {
      clearTimeout(undoAfterTimer);
      undoAfterTimer = null;
    }
    undoAfterActive = false;
  }

  function clearPostAction() {
    if (postActionTimer !== null) {
      clearTimeout(postActionTimer);
      postActionTimer = null;
    }
    postActionState = null;
    awaitingDiffClose = false;
  }

  /** Mobile-only post-action display window. */
  function startPostAction(kind: "done" | "undone") {
    postActionState = kind;
    if (postActionTimer) clearTimeout(postActionTimer);
    postActionTimer = setTimeout(() => {
      postActionState = null;
      postActionTimer = null;
      render();
    }, POST_ACTION_DURATION_MS);
    render();
  }

  function activate() {
    if (!ready) return;
    if (busy || generating) return;

    const desired: "refine" | "undo" = refined ? "undo" : "refine";

    if (!confirmRequired) {
      fire(desired);
      return;
    }

    if (armed === desired) {
      fire(desired);
      return;
    }
    arm(desired);
  }

  function onPointerDown(e: PointerEvent) {
    didDrag = false;
    pointerStartPos = { x: e.clientX, y: e.clientY };
  }

  function onPointerMove(e: PointerEvent) {
    if (didDrag) return;
    // Hover pointermove (no button pressed) must not flip didDrag;
    // onDragEnd doesn't fire for hover, so dragActive would pin
    // forever with no timer to clear it.
    if (e.buttons === 0) return;
    const dx = Math.abs(e.clientX - pointerStartPos.x);
    const dy = Math.abs(e.clientY - pointerStartPos.y);
    if (dx > DRAG_THRESHOLD_PX || dy > DRAG_THRESHOLD_PX) {
      didDrag = true;
      if (dragLingerTimer) {
        clearTimeout(dragLingerTimer);
        dragLingerTimer = null;
      }
      if (!dragActive) {
        dragActive = true;
        render();
      }
    }
  }

  function onClick(e: Event) {
    e.stopPropagation();
    if (didDrag) {
      didDrag = false;
      return;
    }
    // Any tap (whether it fires or gets gated out) counts as
    // activity. "Attempt" is the operative word in the sleepy spec.
    noteActivity();
    activate();
  }

  function onMouseEnter() {
    isHovered = true;
    noteActivity();
    render();
  }

  function onMouseLeave() {
    isHovered = false;
    // Restart the sleepy clock so a 60s+ hover doesn't jump straight
    // to sleepy on the first mouseleave render.
    noteActivity();
    // Deliberately NOT clearing undoAfterActive; the pin must
    // survive mouseleave.
    render();
  }

  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let longPressFired = false;
  let longPressStart = { x: 0, y: 0 };

  function onTouchStart(e: TouchEvent) {
    longPressFired = false;
    const touch = e.touches[0];
    if (!touch) return;
    longPressStart = { x: touch.clientX, y: touch.clientY };
    longPressTimer = setTimeout(() => {
      longPressFired = true;
      // iOS Safari doesn't expose navigator.vibrate.
      navigator.vibrate?.(50);
      showContextMenu(longPressStart.x, longPressStart.y);
      longPressTimer = null;
    }, LONG_PRESS_MS);
  }

  function onTouchMove(e: TouchEvent) {
    if (!longPressTimer) return;
    const touch = e.touches[0];
    if (!touch) return;
    if (
      Math.abs(touch.clientX - longPressStart.x) > LONG_PRESS_MOVE_TOLERANCE_PX ||
      Math.abs(touch.clientY - longPressStart.y) > LONG_PRESS_MOVE_TOLERANCE_PX
    ) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  function onTouchEnd(e: TouchEvent) {
    // Block the synthetic click the browser would otherwise fire
    // into whatever sits under the widget on mobile.
    e.preventDefault();
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    if (longPressFired) {
      longPressFired = false;
      return;
    }
    if (didDrag) {
      didDrag = false;
      return;
    }
    activate();
  }

  function onContextMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    showContextMenu(e.clientX, e.clientY);
  }

  btn.addEventListener("pointerdown", onPointerDown);
  btn.addEventListener("pointermove", onPointerMove);
  btn.addEventListener("click", onClick);
  btn.addEventListener("touchstart", onTouchStart);
  btn.addEventListener("touchmove", onTouchMove);
  btn.addEventListener("touchend", onTouchEnd);
  btn.addEventListener("contextmenu", onContextMenu);
  btn.addEventListener("mouseenter", onMouseEnter);
  btn.addEventListener("mouseleave", onMouseLeave);

  function activeSizes(): Record<SizeKey, number> {
    return lumiaMode ? LUMIA_SIZES : CLASSIC_SIZES;
  }

  function keyForSize(px: number, sizes: Record<SizeKey, number>): SizeKey | null {
    for (const k of SIZE_KEYS) if (sizes[k] === px) return k;
    return null;
  }

  async function showContextMenu(x: number, y: number) {
    const sizes = activeSizes();
    const activeKey = keyForSize(currentSize, sizes);

    const { selectedKey } = await ctx.ui.showContextMenu({
      position: { x, y },
      items: [
        { key: "small", label: "Small", active: activeKey === "small" },
        { key: "medium", label: "Medium", active: activeKey === "medium" },
        { key: "large", label: "Large", active: activeKey === "large" },
        { key: "giant", label: "Giant", active: activeKey === "giant" },
        { key: "enormous", label: "Enormous", active: activeKey === "enormous" },
        { key: "custom", label: "Custom…", active: activeKey === null },
        { key: "div-nav", label: "", type: "divider" },
        { key: "open-tab", label: "Open Hone Tab" },
        { key: "open-settings", label: "Open Settings" },
      ],
    });
    if (!selectedKey) return;

    switch (selectedKey) {
      case "small":
      case "medium":
      case "large":
      case "giant":
      case "enormous":
        sendToBackend({
          type: "update-settings",
          settings: { floatWidgetSize: sizes[selectedKey as SizeKey] },
        });
        break;
      case "custom":
        // Route to settings for exact-value entry.
        ctx.events.emit("open-settings", { view: "extensions" });
        break;
      case "open-tab":
        opts.openDrawerTab();
        break;
      case "open-settings":
        ctx.events.emit("open-settings", { view: "extensions" });
        break;
    }
  }

  function onDocPointerDown(e: PointerEvent) {
    if (armed === null) return;
    const target = e.target as Node | null;
    if (target && widget.root.contains(target)) return;
    disarm();
  }
  document.addEventListener("pointerdown", onDocPointerDown, true);

  /** createFloatWidget has no in-place resize; size changes mean
   *  destroy + rebuild. `btn` is detached first so it survives
   *  across the rebuild with all listeners intact. */
  function recreateWidget(newSize: number) {
    if (newSize === currentSize) return;
    const pos = widget.getPosition();
    // Explicit detach so btn doesn't rely on the framework's destroy
    // being non-destructive to detached children.
    if (btn.parentElement) btn.parentElement.removeChild(btn);
    offDragEnd();
    widget.destroy();
    currentSize = newSize;
    buildWidget(newSize, pos);
  }

  function applySize(size: number) {
    // Clamp defensively against stale/hand-edited settings.
    const clamped = Math.max(SIZE_MIN_PX, Math.min(SIZE_MAX_PX, Math.round(size)));
    if (clamped === currentSize) return;
    recreateWidget(clamped);
  }

  function applyHiddenSetting(hidden: boolean) {
    if (hidden === currentHidden) return;
    currentHidden = hidden;
    widget.setVisible(!hidden);
  }

  function setLumiaMode(value: boolean) {
    if (lumiaMode === value) return;
    const oldSizes = lumiaMode ? LUMIA_SIZES : CLASSIC_SIZES;
    const newSizes = value ? LUMIA_SIZES : CLASSIC_SIZES;
    const presetKey = keyForSize(currentSize, oldSizes);
    lumiaMode = value;
    if (presetKey !== null && newSizes[presetKey] !== currentSize) {
      sendToBackend({
        type: "update-settings",
        settings: { floatWidgetSize: newSizes[presetKey] },
      });
    }
    render();
  }

  /** Called by frontend.ts around `showDiffModal()`. A
   *  close-while-awaiting triggers the mobile post-action here so
   *  the caller doesn't need to know the widget's state. */
  function setDiffModalOpen(open: boolean) {
    if (diffModalOpen === open) return;
    diffModalOpen = open;
    if (!open && awaitingDiffClose && isMobile) {
      awaitingDiffClose = false;
      startPostAction("done");
    }
  }

  function setErrorShowing(value: boolean) {
    if (errorShowing === value) return;
    errorShowing = value;
    render();
  }

  function setConfirmRequired(value: boolean) {
    if (confirmRequired === value) return;
    confirmRequired = value;
    if (!value && armed !== null) {
      armed = null;
      clearArmedTimer();
    }
    render();
  }

  function handleBackendMessage(msg: BackendToFrontend) {
    switch (msg.type) {
      case "refine-started":
      case "auto-refine-started":
        busy = true;
        armed = null;
        clearArmedTimer();
        clearPostAction();
        clearUndoAfter();
        noteActivity();
        render();
        break;

      case "refine-complete":
      case "auto-refine-complete":
        busy = false;
        noteActivity();
        // Mobile-only: widget-initiated success fires the transient
        // Done!/Undone :( state. Refines wait for diff-modal close
        // (undoes have no modal, so they fire immediately).
        if (
          msg.type === "refine-complete" &&
          msg.success &&
          pendingAction &&
          isMobile
        ) {
          const action = pendingAction;
          pendingAction = null;
          if (action === "undo") {
            startPostAction("undone");
          } else if (diffModalOpen) {
            awaitingDiffClose = true;
          } else {
            startPostAction("done");
          }
        } else if (msg.type === "refine-complete") {
          // Clear pendingAction so a stale tap doesn't fire on a
          // much-later completion.
          pendingAction = null;
        }
        render();
        break;

      case "refine-error":
        busy = false;
        pendingAction = null;
        awaitingDiffClose = false;
        clearUndoAfter();
        // Don't noteActivity on error; the sleepy timer should
        // continue counting so a dismissed-and-walk-away user still
        // reaches sleepy on schedule.
        render();
        break;

      case "active-chat":
        refined = !!msg.lastMessageRefined;
        if (
          (armed === "refine" && refined) ||
          (armed === "undo" && !refined)
        ) {
          armed = null;
          clearArmedTimer();
        }
        render();
        break;

      case "generation-state":
        generating = msg.generating;
        if (generating) {
          armed = null;
          clearArmedTimer();
        }
        render();
        break;
    }
  }

  function setReady(value: boolean) {
    if (ready === value) return;
    ready = value;
    render();
  }

  return {
    handleBackendMessage,
    setReady,
    setConfirmRequired,
    setErrorShowing,
    setDiffModalOpen,
    setLumiaMode,
    applySize,
    applyHidden: applyHiddenSetting,
    destroy() {
      clearArmedTimer();
      clearUndoAfter();
      if (longPressTimer) clearTimeout(longPressTimer);
      if (sleepyTimer) clearTimeout(sleepyTimer);
      if (postActionTimer) clearTimeout(postActionTimer);
      if (dragLingerTimer) clearTimeout(dragLingerTimer);
      btn.removeEventListener("pointerdown", onPointerDown);
      btn.removeEventListener("pointermove", onPointerMove);
      btn.removeEventListener("click", onClick);
      btn.removeEventListener("touchstart", onTouchStart);
      btn.removeEventListener("touchmove", onTouchMove);
      btn.removeEventListener("touchend", onTouchEnd);
      btn.removeEventListener("contextmenu", onContextMenu);
      btn.removeEventListener("mouseenter", onMouseEnter);
      btn.removeEventListener("mouseleave", onMouseLeave);
      document.removeEventListener("pointerdown", onDocPointerDown, true);
      window.removeEventListener("resize", clampWidgetPosition);
      offDragEnd();
      widget.destroy();
    },
  };
}
