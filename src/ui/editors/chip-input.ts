import type { MessageRole, Prompt } from "../../types";
import { HEAD_COLLECTION_ID } from "../../constants";

/** Synthetic prompt for the Head Collection meta-chip. Content is
 *  empty; expansion happens at assembly time, not chip render. */
const HEAD_VIRTUAL_PROMPT: Prompt = {
  id: HEAD_COLLECTION_ID,
  name: "Head Collection",
  content: "",
};

/**
 * Reusable multi-select chip input with autocomplete. Drives the
 * Pipeline Config chip rows.
 *
 * Purely presentational: every mutation routes through `onChange`
 * and the parent re-renders. Row collapse / auto-spawn logic lives
 * in pipeline-editor, not here.
 *
 * Drag: HTML5 drag API (desktop) + long-press touch drag (mobile)
 * share `commitReorder`.
 */

export interface ChipInputOptions {
  promptIds: string[];
  role: MessageRole;
  /** "locked" -> static label; "choice" -> user/assistant select;
   *  "hidden" -> no role control (Head Collection editor). */
  roleMode: "locked" | "choice" | "hidden";
  prompts: Prompt[];
  /** When > 0 the autocomplete pins a "Head Collection" suggestion.
   *  Only the count matters; expansion is at assembly time. */
  headCollectionSize: number;
  readOnly: boolean;
  onChange: (next: { promptIds: string[]; role: MessageRole }) => void;
  placeholder?: string;
}

export interface ChipInputHandle {
  element: HTMLElement;
  update(next: Partial<ChipInputOptions>): void;
  /** Remove the document.body-mounted popup before discarding. */
  destroy(): void;
}

export function createChipInput(opts: ChipInputOptions): ChipInputHandle {
  let state: ChipInputOptions = { ...opts };

  const root = document.createElement("div");
  root.className = "hone-chip-input";

  const roleControl = document.createElement("div");
  roleControl.className = "hone-chip-input__role";

  const chipArea = document.createElement("div");
  chipArea.className = "hone-chip-input__chips";

  root.appendChild(roleControl);
  root.appendChild(chipArea);

  let suggestionPopup: HTMLElement | null = null;
  let highlightedIndex = -1;
  let suggestions: Prompt[] = [];

  function renderRoleControl(): void {
    roleControl.innerHTML = "";
    if (state.roleMode === "hidden") {
      return;
    }
    if (state.roleMode === "locked" || state.readOnly) {
      const label = document.createElement("span");
      label.className = "hone-chip-input__role-label";
      label.textContent = state.role;
      roleControl.appendChild(label);
      return;
    }
    const select = document.createElement("select");
    select.className = "hone-chip-input__role-select";
    for (const opt of ["user", "assistant"] as const) {
      const option = document.createElement("option");
      option.value = opt;
      option.textContent = opt;
      option.selected = state.role === opt;
      select.appendChild(option);
    }
    select.addEventListener("change", () => {
      state.role = select.value as MessageRole;
      state.onChange({ promptIds: [...state.promptIds], role: state.role });
    });
    roleControl.appendChild(select);
  }

  let dragged: { id: string; index: number } | null = null;

  function resolveSourceIndex(): number | null {
    if (!dragged) return null;
    if (state.promptIds[dragged.index] === dragged.id) return dragged.index;
    const fallback = state.promptIds.indexOf(dragged.id);
    return fallback === -1 ? null : fallback;
  }

  function commitReorder(fromIndex: number, toIndex: number): void {
    if (fromIndex === toIndex) return;
    const next = state.promptIds.slice();
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    state.promptIds = next;
    state.onChange({ promptIds: [...state.promptIds], role: state.role });
    renderChips();
  }

  function renderChips(): void {
    chipArea.innerHTML = "";

    for (let i = 0; i < state.promptIds.length; i++) {
      const id = state.promptIds[i];
      const isHead = id === HEAD_COLLECTION_ID;
      const prompt = isHead
        ? HEAD_VIRTUAL_PROMPT
        : state.prompts.find((p) => p.id === id);
      const chip = document.createElement("div");
      chip.className = "hone-chip";
      if (isHead) chip.classList.add("hone-chip--head");
      chip.draggable = !state.readOnly;
      chip.dataset.index = String(i);

      const label = document.createElement("span");
      label.className = "hone-chip__label";
      const chipName = prompt ? prompt.name : `<missing: ${id}>`;
      label.textContent = chipName;
      chip.title = isHead
        ? "Head Collection: expands to the prompts listed under \"Head Collection\" in the Prompts tab."
        : chipName;
      if (!prompt) chip.classList.add("hone-chip--missing");
      chip.appendChild(label);

      if (!state.readOnly) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "hone-chip__remove";
        remove.textContent = "×";
        remove.setAttribute("aria-label", `Remove ${prompt?.name || id}`);
        remove.addEventListener("click", (e) => {
          e.stopPropagation();
          const next = state.promptIds.slice();
          next.splice(i, 1);
          state.promptIds = next;
          state.onChange({ promptIds: [...state.promptIds], role: state.role });
          renderChips();
        });
        chip.appendChild(remove);

        chip.addEventListener("dragstart", () => {
          dragged = { id, index: i };
          chip.classList.add("hone-chip--dragging");
        });
        chip.addEventListener("dragend", () => {
          dragged = null;
          chip.classList.remove("hone-chip--dragging");
          chipArea
            .querySelectorAll(".hone-chip--drop-target")
            .forEach((el) => el.classList.remove("hone-chip--drop-target"));
        });
        chip.addEventListener("dragover", (e) => {
          e.preventDefault();
          chip.classList.add("hone-chip--drop-target");
        });
        chip.addEventListener("dragleave", () => {
          chip.classList.remove("hone-chip--drop-target");
        });
        chip.addEventListener("drop", (e) => {
          e.preventDefault();
          chip.classList.remove("hone-chip--drop-target");
          const src = resolveSourceIndex();
          if (src === null || src === i) return;
          commitReorder(src, i);
        });

        // Touch drag: long-press (150ms) initiates so it doesn't
        // conflict with tap-to-remove. elementFromPoint locates the
        // chip under the finger.
        let touchTimer: number | null = null;
        let touchDragging = false;

        chip.addEventListener("touchstart", (e) => {
          touchTimer = window.setTimeout(() => {
            touchDragging = true;
            dragged = { id, index: i };
            chip.classList.add("hone-chip--dragging");
          }, 150);
        }, { passive: true });

        chip.addEventListener("touchmove", (e) => {
          if (!touchDragging) {
            // Cancel pending long-press if finger moves first.
            if (touchTimer !== null) { window.clearTimeout(touchTimer); touchTimer = null; }
            return;
          }
          e.preventDefault();
          const touch = e.touches[0];
          const target = document.elementFromPoint(touch.clientX, touch.clientY);
          chipArea
            .querySelectorAll(".hone-chip--drop-target")
            .forEach((el) => el.classList.remove("hone-chip--drop-target"));
          const targetChip = target?.closest(".hone-chip") as HTMLElement | null;
          if (targetChip && targetChip !== chip && targetChip.dataset.index !== undefined) {
            targetChip.classList.add("hone-chip--drop-target");
          }
        });

        chip.addEventListener("touchend", (e) => {
          if (touchTimer !== null) { window.clearTimeout(touchTimer); touchTimer = null; }
          if (!touchDragging) return;
          touchDragging = false;
          chip.classList.remove("hone-chip--dragging");
          const touch = e.changedTouches[0];
          const target = document.elementFromPoint(touch.clientX, touch.clientY);
          const targetChip = target?.closest(".hone-chip") as HTMLElement | null;
          chipArea
            .querySelectorAll(".hone-chip--drop-target")
            .forEach((el) => el.classList.remove("hone-chip--drop-target"));
          if (targetChip && targetChip.dataset.index !== undefined) {
            const targetIndex = parseInt(targetChip.dataset.index, 10);
            const src = resolveSourceIndex();
            if (src !== null && src !== targetIndex) commitReorder(src, targetIndex);
          }
          dragged = null;
        });

        chip.addEventListener("touchcancel", () => {
          if (touchTimer !== null) { window.clearTimeout(touchTimer); touchTimer = null; }
          touchDragging = false;
          dragged = null;
          chip.classList.remove("hone-chip--dragging");
          chipArea
            .querySelectorAll(".hone-chip--drop-target")
            .forEach((el) => el.classList.remove("hone-chip--drop-target"));
        });
      }

      chipArea.appendChild(chip);
    }

    if (!state.readOnly) {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "hone-chip-input__text";
      input.placeholder = state.placeholder || "Add prompt...";
      input.setAttribute("aria-label", "Add prompt chip");

      input.addEventListener("focus", () => openSuggestions(input));
      // Click (in addition to focus) so an already-focused input
      // re-opens the popup after scroll dismissed it.
      input.addEventListener("click", () => openSuggestions(input));
      input.addEventListener("blur", () => {
        // 150ms delay so click-on-suggestion fires first.
        setTimeout(() => closeSuggestions(), 150);
      });
      input.addEventListener("input", () => openSuggestions(input));
      input.addEventListener("keydown", (e) => {
        if (e.key === "Backspace" && input.value === "" && state.promptIds.length > 0) {
          e.preventDefault();
          state.promptIds = state.promptIds.slice(0, -1);
          state.onChange({ promptIds: [...state.promptIds], role: state.role });
          renderChips();
          return;
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          highlightedIndex = Math.min(highlightedIndex + 1, suggestions.length - 1);
          renderSuggestions();
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          highlightedIndex = Math.max(highlightedIndex - 1, 0);
          renderSuggestions();
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
            commitPrompt(suggestions[highlightedIndex].id, input);
          } else if (suggestions.length > 0) {
            commitPrompt(suggestions[0].id, input);
          }
        } else if (e.key === "Escape") {
          closeSuggestions();
        }
      });

      chipArea.appendChild(input);
    }
  }

  function commitPrompt(promptId: string, input: HTMLInputElement): void {
    state.promptIds = [...state.promptIds, promptId];
    state.onChange({ promptIds: [...state.promptIds], role: state.role });
    input.value = "";
    renderChips();
    // Keep suggestions open; users typically add multiple prompts
    // in succession.
    const newInput = chipArea.querySelector(
      ".hone-chip-input__text"
    ) as HTMLInputElement | null;
    if (newInput) {
      newInput.focus();
      refreshSuggestions(newInput);
    }
  }

  function openSuggestions(input: HTMLInputElement): void {
    if (!suggestionPopup) {
      suggestionPopup = document.createElement("div");
      suggestionPopup.className = "hone-chip-input__suggestions";
      document.body.appendChild(suggestionPopup);
      // Capture phase catches scroll on ancestors that don't bubble.
      window.addEventListener("scroll", onScrollWhileOpen, true);
    }
    refreshSuggestions(input);
  }

  function onScrollWhileOpen(e: Event): void {
    // Don't close on scroll inside the popup itself.
    const target = e.target as Node | null;
    if (target && suggestionPopup && suggestionPopup.contains(target)) {
      return;
    }
    closeSuggestions();
  }

  function refreshSuggestions(input: HTMLInputElement): void {
    if (!suggestionPopup) return;
    const query = input.value.trim().toLowerCase();
    const filteredPrompts = state.prompts.filter((p) => {
      if (query && !p.name.toLowerCase().includes(query)) return false;
      return true;
    });
    // Pin Head Collection above the alpha-filtered list when the
    // preset has one and the row doesn't already include it.
    const headAlreadyInRow = state.promptIds.includes(HEAD_COLLECTION_ID);
    const showHead = state.headCollectionSize > 0 && !headAlreadyInRow;
    suggestions = showHead ? [HEAD_VIRTUAL_PROMPT, ...filteredPrompts] : filteredPrompts;
    highlightedIndex = suggestions.length > 0 ? 0 : -1;
    renderSuggestions();
    positionSuggestions(input);
  }

  function positionSuggestions(input: HTMLInputElement): void {
    if (!suggestionPopup) return;
    const rect = input.getBoundingClientRect();
    const viewportH = window.innerHeight;
    const viewportW = window.innerWidth;
    const pad = 8;
    const gap = 4;

    // Set fixed position first so the browser can compute the
    // popup's rendered size before final placement.
    suggestionPopup.style.position = "fixed";
    suggestionPopup.style.minWidth = `${Math.max(rect.width, 220)}px`;
    suggestionPopup.style.left = `${rect.left}px`;
    suggestionPopup.style.top = `${rect.bottom + gap}px`;

    const popupRect = suggestionPopup.getBoundingClientRect();

    // Prefer below; flip above if it doesn't fit; clamp to whichever
    // side has more room when neither fits.
    let top = rect.bottom + gap;
    if (top + popupRect.height > viewportH - pad) {
      const aboveTop = rect.top - popupRect.height - gap;
      if (aboveTop >= pad) {
        top = aboveTop;
      } else {
        const spaceBelow = viewportH - rect.bottom - pad;
        const spaceAbove = rect.top - pad;
        top = spaceBelow >= spaceAbove
          ? Math.max(pad, viewportH - popupRect.height - pad)
          : pad;
      }
    }

    let left = rect.left;
    if (left + popupRect.width > viewportW - pad) {
      left = Math.max(pad, viewportW - popupRect.width - pad);
    }

    suggestionPopup.style.top = `${top}px`;
    suggestionPopup.style.left = `${left}px`;
  }

  function renderSuggestions(): void {
    if (!suggestionPopup) return;
    suggestionPopup.innerHTML = "";
    if (suggestions.length === 0) {
      const empty = document.createElement("div");
      empty.className = "hone-chip-input__suggestion hone-chip-input__suggestion--empty";
      empty.textContent = "No matching prompts";
      suggestionPopup.appendChild(empty);
      return;
    }
    for (let i = 0; i < suggestions.length; i++) {
      const p = suggestions[i];
      const item = document.createElement("div");
      item.className = "hone-chip-input__suggestion";
      if (p.id === HEAD_COLLECTION_ID) {
        item.classList.add("hone-chip-input__suggestion--head");
        item.title = "Expands at assembly time to the prompts under Head Collection in the Prompts tab.";
      }
      if (i === highlightedIndex) item.classList.add("hone-chip-input__suggestion--active");
      item.textContent = p.name;
      item.addEventListener("mousedown", (e) => {
        // mousedown beats the input's blur handler that would
        // otherwise close the popup before click fires.
        e.preventDefault();
        const input = chipArea.querySelector(
          ".hone-chip-input__text"
        ) as HTMLInputElement | null;
        if (input) commitPrompt(p.id, input);
      });
      suggestionPopup.appendChild(item);
    }
  }

  function closeSuggestions(): void {
    if (suggestionPopup) {
      suggestionPopup.remove();
      suggestionPopup = null;
      window.removeEventListener("scroll", onScrollWhileOpen, true);
    }
    suggestions = [];
    highlightedIndex = -1;
  }

  renderRoleControl();
  renderChips();

  return {
    element: root,
    update(next: Partial<ChipInputOptions>) {
      state = { ...state, ...next };
      renderRoleControl();
      renderChips();
    },
    destroy() {
      closeSuggestions();
    },
  };
}
