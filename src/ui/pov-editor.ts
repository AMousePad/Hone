import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import type {
  FrontendToBackend,
  BackendToFrontend,
  HoneSettings,
  PovPresetSummary,
  PresetSlot,
} from "../types";

export interface PovEditorOptions {
  ctx: SpindleFrontendContext;
  sendToBackend: (msg: FrontendToBackend) => void;
  slot: PresetSlot;
}

export interface PovEditorHandle {
  element: HTMLElement;
  handleBackendMessage(msg: BackendToFrontend): void;
  onSettings(settings: HoneSettings): void;
}

export function createPovEditor(opts: PovEditorOptions): PovEditorHandle {
  const { ctx, sendToBackend, slot } = opts;
  const settingsKey: "pov" | "userPov" = slot === "input" ? "userPov" : "pov";
  const label = slot === "input" ? "User Message PoV" : "AI Message PoV";
  const tooltip =
    slot === "input"
      ? "Point-of-view for your messages. Presets are shared with AI Message PoV; only the selection differs."
      : "Point-of-view for AI messages. Presets are shared with User Message PoV; only the selection differs.";

  const root = document.createElement("div");
  root.className = "hone-pov-editor";

  let settings: HoneSettings | null = null;
  let presets: PovPresetSummary[] | null = null;

  function isTextareaFocused(): boolean {
    const active = document.activeElement;
    return active instanceof HTMLTextAreaElement && root.contains(active);
  }

  function render(): void {
    if (isTextareaFocused()) return;

    if (!settings || !presets) {
      root.replaceChildren(makeLoading());
      return;
    }

    const activeId = settings[settingsKey];
    const active = presets.find((p) => p.id === activeId) ?? presets[0];
    if (!active) {
      root.replaceChildren(makeLoading());
      return;
    }

    const textarea = renderTextarea(active);
    root.replaceChildren(renderBar(active, textarea), textarea);
  }

  function renderBar(active: PovPresetSummary, textarea: HTMLTextAreaElement): HTMLElement {
    const bar = document.createElement("div");
    bar.className = "hone-preset-bar hone-preset-bar--stacked hone-pov-editor__bar";

    const labelEl = document.createElement("label");
    labelEl.className = "hone-preset-bar__label";
    labelEl.textContent = `${label}:`;
    labelEl.title = tooltip;
    bar.appendChild(labelEl);

    bar.appendChild(renderSelect(active));
    bar.appendChild(renderActions(active, textarea));
    return bar;
  }

  function renderSelect(active: PovPresetSummary): HTMLSelectElement {
    const select = document.createElement("select");
    select.className = "hone-preset-bar__select";
    const list = presets ?? [];
    const customs = list.filter((p) => !p.builtIn);
    const builtIns = list.filter((p) => p.builtIn);
    for (const p of customs) select.appendChild(makeOption(p, active.id));
    if (builtIns.length > 0) {
      const group = document.createElement("optgroup");
      group.label = "Built-in";
      for (const p of builtIns) group.appendChild(makeOption(p, active.id));
      select.appendChild(group);
    }
    select.addEventListener("change", () => {
      if (select.value === active.id) return;
      sendToBackend({
        type: "update-settings",
        settings: { [settingsKey]: select.value } as Partial<HoneSettings>,
      });
    });
    return select;
  }

  function makeOption(preset: PovPresetSummary, activeId: string): HTMLOptionElement {
    const opt = document.createElement("option");
    opt.value = preset.id;
    opt.textContent = preset.name;
    opt.selected = preset.id === activeId;
    return opt;
  }

  function renderActions(active: PovPresetSummary, textarea: HTMLTextAreaElement): HTMLElement {
    const actions = document.createElement("div");
    actions.className = "hone-preset-bar__actions";

    if (!active.builtIn) {
      actions.appendChild(
        makeBtn("Rename", "Rename this POV preset.", () => {
          const input = window.prompt("Rename POV preset:", active.name);
          if (!input) return;
          const trimmed = input.trim();
          if (!trimmed || trimmed === active.name) return;
          sendToBackend({
            type: "save-pov-preset",
            preset: { id: active.id, name: trimmed, content: textarea.value },
          });
        })
      );
    }

    actions.appendChild(
      makeBtn(
        "Duplicate",
        active.builtIn
          ? "Create an editable copy of this built-in POV preset."
          : "Create an editable copy of this POV preset.",
        () => sendToBackend({ type: "duplicate-pov-preset", id: active.id, slot })
      )
    );

    if (!active.builtIn) {
      const del = makeBtn("Delete", "Delete this POV preset.", () => {
        const { id, name } = active;
        ctx.ui
          .showConfirm({
            title: "Delete POV preset",
            message: `Delete "${name}"? This cannot be undone.`,
            confirmLabel: "Delete",
            cancelLabel: "Cancel",
            variant: "danger",
          })
          .then((result) => {
            if (result.confirmed) {
              sendToBackend({ type: "delete-pov-preset", id });
            }
          })
          .catch(() => {});
      });
      del.classList.add("hone-settings-btn--danger");
      actions.appendChild(del);
    }

    return actions;
  }

  function renderTextarea(active: PovPresetSummary): HTMLTextAreaElement {
    const textarea = document.createElement("textarea");
    textarea.className = "hone-pov-editor__textarea";
    textarea.spellcheck = false;
    textarea.value = active.content;
    textarea.readOnly = active.builtIn;
    textarea.placeholder = "POV instruction sent to the model...";
    textarea.title = active.builtIn
      ? "Built-in POV presets are read-only. Duplicate to edit."
      : "Edits save when you click away.";
    textarea.addEventListener("change", () => {
      const current = presets?.find((p) => p.id === active.id);
      if (!current || current.builtIn) return;
      if (textarea.value === current.content) return;
      sendToBackend({
        type: "save-pov-preset",
        preset: { id: current.id, name: current.name, content: textarea.value },
      });
    });
    return textarea;
  }

  function makeLoading(): HTMLElement {
    const p = document.createElement("p");
    p.className = "hone-section-description";
    p.textContent = "Loading POV presets...";
    return p;
  }

  function makeBtn(
    text: string,
    title: string,
    onClick: () => void
  ): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hone-settings-btn";
    btn.textContent = text;
    btn.title = title;
    btn.addEventListener("click", onClick);
    return btn;
  }

  function handleBackendMessage(msg: BackendToFrontend): void {
    if (msg.type === "pov-presets") {
      presets = msg.presets;
      render();
    }
  }

  function onSettings(next: HoneSettings): void {
    settings = next;
    render();
  }

  return {
    element: root,
    handleBackendMessage,
    onSettings,
  };
}
