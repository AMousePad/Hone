import type { SpindleFrontendContext } from "lumiverse-spindle-types";

function computeWordDiff(
  original: string,
  refined: string
): Array<{ type: "same" | "add" | "remove"; text: string }> {
  const origWords = original.split(/(\s+)/);
  const refWords = refined.split(/(\s+)/);

  const m = origWords.length;
  const n = refWords.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0)
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (origWords[i - 1] === refWords[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result: Array<{ type: "same" | "add" | "remove"; text: string }> = [];
  let i = m;
  let j = n;

  const stack: Array<{ type: "same" | "add" | "remove"; text: string }> = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && origWords[i - 1] === refWords[j - 1]) {
      stack.push({ type: "same", text: origWords[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ type: "add", text: refWords[j - 1] });
      j--;
    } else {
      stack.push({ type: "remove", text: origWords[i - 1] });
      i--;
    }
  }

  stack.reverse();

  for (const seg of stack) {
    const last = result[result.length - 1];
    if (last && last.type === seg.type) {
      last.text += seg.text;
    } else {
      result.push({ ...seg });
    }
  }

  return result;
}

interface PendingDiff {
  original: string;
  refined: string;
}

interface ActiveDiffModal {
  modal: ReturnType<SpindleFrontendContext["ui"]["showModal"]>;
  queue: PendingDiff[];
  currentIndex: number;
  /** Fire on user dismiss (every registered listener; frontend.ts
   *  uses this to drive the float widget's "Done!" state). */
  dismissListeners: Array<() => void>;
}

/** Singleton: Lumiverse caps stacked modals per extension at 2.
 *  New diffs queue inside the open modal; user navigates with Prev/
 *  Next. View position is preserved across arrivals; auto-jumping
 *  would yank attention away from the diff being read. */
let activeModal: ActiveDiffModal | null = null;

export function showDiffModal(
  ctx: SpindleFrontendContext,
  original: string,
  refined: string,
  onDismiss?: () => void
) {
  if (activeModal) {
    const entry = { original, refined };
    activeModal.queue.push(entry);
    if (onDismiss) activeModal.dismissListeners.push(onDismiss);
    renderDiff(activeModal);
    return {
      dismiss() {
        if (!activeModal) return;
        const idx = activeModal.queue.indexOf(entry);
        if (idx === -1) return;
        activeModal.queue.splice(idx, 1);
        if (onDismiss) {
          const li = activeModal.dismissListeners.indexOf(onDismiss);
          if (li !== -1) activeModal.dismissListeners.splice(li, 1);
          try { onDismiss(); } catch {}
        }
        if (activeModal.queue.length === 0) {
          dismissActive();
          return;
        }
        if (activeModal.currentIndex >= activeModal.queue.length) {
          activeModal.currentIndex = activeModal.queue.length - 1;
        }
        renderDiff(activeModal);
      },
    };
  }

  const modal = ctx.ui.showModal({
    title: "Hone: Changes",
    width: 600,
    maxHeight: 520,
  });

  const state: ActiveDiffModal = {
    modal,
    queue: [{ original, refined }],
    dismissListeners: onDismiss ? [onDismiss] : [],
    currentIndex: 0,
  };
  activeModal = state;

  modal.onDismiss(() => {
    if (activeModal === state) activeModal = null;
    for (const fn of state.dismissListeners) {
      try { fn(); } catch {}
    }
  });

  renderDiff(state);
  return {
    dismiss() {
      dismissActive();
    },
  };
}

function dismissActive() {
  if (activeModal) {
    const m = activeModal.modal;
    activeModal = null;
    m.dismiss();
  }
}

/** Full rebuild: cheap and avoids stale DOM bugs from partial diffs. */
function renderDiff(state: ActiveDiffModal) {
  const { modal, queue, currentIndex } = state;
  const current = queue[currentIndex];
  if (!current) return;

  modal.root.innerHTML = "";

  if (queue.length > 1) {
    const nav = document.createElement("div");
    nav.className = "hone-diff-nav";

    const prev = document.createElement("button");
    prev.type = "button";
    prev.className = "hone-diff-nav-btn";
    prev.textContent = "‹ Prev";
    prev.disabled = currentIndex === 0;
    prev.addEventListener("click", () => {
      if (state.currentIndex > 0) {
        state.currentIndex--;
        renderDiff(state);
      }
    });

    const counter = document.createElement("span");
    counter.className = "hone-diff-nav-counter";
    counter.textContent = `${currentIndex + 1} of ${queue.length}`;

    const next = document.createElement("button");
    next.type = "button";
    next.className = "hone-diff-nav-btn";
    next.textContent = "Next ›";
    next.disabled = currentIndex === queue.length - 1;
    next.addEventListener("click", () => {
      if (state.currentIndex < state.queue.length - 1) {
        state.currentIndex++;
        renderDiff(state);
      }
    });

    nav.appendChild(prev);
    nav.appendChild(counter);
    nav.appendChild(next);
    modal.root.appendChild(nav);

    modal.setTitle(`Hone: Changes (${currentIndex + 1} of ${queue.length})`);
  } else {
    modal.setTitle("Hone: Changes");
  }

  const container = document.createElement("div");
  container.className = "hone-diff-modal";

  const diff = computeWordDiff(current.original, current.refined);
  for (const segment of diff) {
    const span = document.createElement("span");
    span.textContent = segment.text;
    switch (segment.type) {
      case "add":
        span.className = "hone-diff-add";
        break;
      case "remove":
        span.className = "hone-diff-remove";
        break;
    }
    container.appendChild(span);
  }

  modal.root.appendChild(container);
}
