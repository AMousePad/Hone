import type { GenerationParams, ConnectionProfile, HoneSettings } from "../types";

/** Pure DOM builders: no state, no closures over component state.
 *  Shared by the settings page and drawer panels. */

export function makeSection(title: string): HTMLElement {
  const section = document.createElement("div");
  section.className = "hone-settings-section";
  const h3 = document.createElement("h3");
  h3.textContent = title;
  section.appendChild(h3);
  return section;
}

export function makeToggleRow(
  label: string,
  tooltip: string,
  getValue: () => boolean,
  onChange: (val: boolean) => void,
  disabled: boolean = false
): HTMLElement {
  const row = document.createElement("div");
  row.className = `hone-settings-row${disabled ? " hone-settings-row--disabled" : ""}`;
  const lbl = document.createElement("label");
  lbl.textContent = label;
  lbl.title = tooltip;
  const toggle = document.createElement("div");
  toggle.className = `hone-toggle${getValue() ? " on" : ""}${disabled ? " disabled" : ""}`;
  if (!disabled) {
    toggle.addEventListener("click", () => {
      const newVal = !getValue();
      onChange(newVal);
      toggle.classList.toggle("on", newVal);
    });
  }
  row.appendChild(lbl);
  row.appendChild(toggle);
  return row;
}

export function makeSelectRow(
  label: string,
  tooltip: string,
  options: Array<{ value: string; label: string }>,
  getValue: () => string,
  onChange: (val: string) => void,
  disabled: boolean = false
): HTMLElement {
  const row = document.createElement("div");
  row.className = `hone-settings-row${disabled ? " hone-settings-row--disabled" : ""}`;
  const lbl = document.createElement("label");
  lbl.textContent = label;
  lbl.title = tooltip;
  const select = document.createElement("select");
  select.disabled = disabled;
  for (const opt of options) {
    const option = document.createElement("option");
    option.value = opt.value;
    option.textContent = opt.label;
    option.selected = getValue() === opt.value;
    select.appendChild(option);
  }
  select.addEventListener("change", () => onChange(select.value));
  row.appendChild(lbl);
  row.appendChild(select);
  return row;
}

export function makeNumberRow(
  label: string,
  tooltip: string,
  getValue: () => number,
  onChange: (val: number) => void,
  min?: number,
  max?: number,
  /** Shown when value is the empty sentinel (e.g. "Unlimited"). */
  emptyPlaceholder?: string,
  /** When set: empty input commits this value, and the field shows
   *  empty when stored value matches. Placeholder reads "default (N)"
   *  unless `emptyPlaceholder` overrides. */
  defaultValue?: number
): HTMLElement {
  const row = document.createElement("div");
  // --number modifier: column layout, wider input. See styles.ts.
  row.className = "hone-settings-row hone-settings-row--number";
  const lbl = document.createElement("label");
  lbl.textContent = label;
  lbl.title = tooltip;
  const input = document.createElement("input");
  input.type = "number";
  const val = getValue();
  // Show empty when value matches defaultValue, or when value is 0
  // and an emptyPlaceholder is configured.
  const isDefaultSentinel = defaultValue !== undefined && val === defaultValue;
  const isEmptySentinel = emptyPlaceholder !== undefined && val === 0;
  input.value = isDefaultSentinel || isEmptySentinel ? "" : String(val);
  if (emptyPlaceholder) {
    input.placeholder = emptyPlaceholder;
  } else if (defaultValue !== undefined) {
    input.placeholder = `default (${defaultValue})`;
  }
  if (min !== undefined) input.min = String(min);
  if (max !== undefined) input.max = String(max);
  input.addEventListener("change", () => {
    // Empty commits defaultValue if set, else 0 (the unlimited sentinel).
    if (input.value === "") {
      onChange(defaultValue !== undefined ? defaultValue : 0);
      return;
    }
    onChange(Number(input.value));
  });
  row.appendChild(lbl);
  row.appendChild(input);
  return row;
}

export function makeTextareaRow(
  label: string,
  tooltip: string,
  placeholder: string,
  getValue: () => string,
  onChange: (val: string) => void
): HTMLElement {
  const row = document.createElement("div");
  row.className = "hone-textarea-row";
  const lbl = document.createElement("label");
  lbl.textContent = label;
  lbl.title = tooltip;
  const textarea = document.createElement("textarea");
  textarea.value = getValue();
  textarea.placeholder = placeholder;
  textarea.addEventListener("change", () => onChange(textarea.value));
  row.appendChild(lbl);
  row.appendChild(textarea);
  return row;
}

/** Single-line text input row. */
export function makeTextRow(
  label: string,
  tooltip: string,
  placeholder: string,
  getValue: () => string,
  onChange: (val: string) => void
): HTMLElement {
  const row = document.createElement("div");
  row.className = "hone-textarea-row";
  const lbl = document.createElement("label");
  lbl.textContent = label;
  lbl.title = tooltip;
  const input = document.createElement("input");
  input.type = "text";
  input.value = getValue();
  input.placeholder = placeholder;
  input.addEventListener("change", () => onChange(input.value));
  row.appendChild(lbl);
  row.appendChild(input);
  return row;
}

export function makeDescription(text: string): HTMLElement {
  const p = document.createElement("p");
  p.className = "hone-section-description";
  p.textContent = text;
  return p;
}

export interface SamplerDef {
  key: keyof GenerationParams;
  label: string;
  type: "int" | "float";
  min: number;
  max: number;
  step: number;
  defaultHint: number;
}

export const SAMPLER_DEFS: SamplerDef[] = [
  { key: "temperature", label: "Temperature", type: "float", min: 0, max: 2, step: 0.01, defaultHint: 1.0 },
  { key: "maxTokens", label: "Max Response", type: "int", min: 1, max: 128000, step: 1, defaultHint: 16384 },
  { key: "contextSize", label: "Context Size", type: "int", min: 1, max: 2000000, step: 1, defaultHint: 128000 },
  { key: "topP", label: "Top P", type: "float", min: 0, max: 1, step: 0.01, defaultHint: 0.95 },
  { key: "minP", label: "Min P", type: "float", min: 0, max: 1, step: 0.01, defaultHint: 0 },
  { key: "topK", label: "Top K", type: "int", min: 0, max: 500, step: 1, defaultHint: 0 },
  { key: "frequencyPenalty", label: "Freq Penalty", type: "float", min: 0, max: 2, step: 0.01, defaultHint: 0 },
  { key: "presencePenalty", label: "Pres Penalty", type: "float", min: 0, max: 2, step: 0.01, defaultHint: 0 },
  { key: "repetitionPenalty", label: "Rep Penalty", type: "float", min: 0, max: 2, step: 0.01, defaultHint: 0 },
];

/** Sampler slider. Double-click track to reset to null. */
export function makeSamplerSlider(
  def: SamplerDef,
  getValue: () => number | null,
  onChange: (val: number | null) => void
): HTMLElement {
  const row = document.createElement("div");
  row.className = "hone-slider-row";

  const header = document.createElement("div");
  header.className = "hone-slider-header";
  const label = document.createElement("span");
  label.className = "hone-slider-label";
  label.textContent = def.label;
  const numInput = document.createElement("input");
  numInput.type = "number";
  numInput.className = "hone-slider-input";
  numInput.min = String(def.min);
  numInput.max = String(def.max);
  numInput.step = String(def.step);
  numInput.placeholder = String(def.defaultHint);
  header.appendChild(label);
  header.appendChild(numInput);

  const track = document.createElement("div");
  track.className = "hone-slider-track";
  track.title = "Double-click to reset";
  const fill = document.createElement("div");
  fill.className = "hone-slider-fill";
  const thumb = document.createElement("div");
  thumb.className = "hone-slider-thumb";
  track.appendChild(fill);
  track.appendChild(thumb);

  row.appendChild(header);
  row.appendChild(track);

  const decimals = (String(def.step).split(".")[1] || "").length;

  function snap(raw: number): number {
    const clamped = Math.min(def.max, Math.max(def.min, raw));
    const stepped = Math.round((clamped - def.min) / def.step) * def.step + def.min;
    return def.type === "int" ? Math.round(stepped) : parseFloat(stepped.toFixed(decimals));
  }

  function posToValue(clientX: number): number {
    const rect = track.getBoundingClientRect();
    if (!rect || rect.width === 0) return def.defaultHint;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return snap(def.min + ratio * (def.max - def.min));
  }

  function applyVisual(displayValue: number, isSet: boolean): void {
    const range = def.max - def.min;
    const pct = range > 0 ? ((displayValue - def.min) / range) * 100 : 0;
    fill.style.width = `${pct}%`;
    thumb.style.left = `${pct}%`;
    track.style.opacity = isSet ? "1" : "0.4";
    label.className = `hone-slider-label ${isSet ? "is-set" : "is-unset"}`;
    numInput.className = `hone-slider-input ${isSet ? "is-set" : "is-unset"}`;
  }

  function syncFromModel(): void {
    const v = getValue();
    const isSet = v !== null && v !== undefined;
    const display = isSet ? v! : def.defaultHint;
    if (!inputEditing) numInput.value = isSet ? String(v) : "";
    applyVisual(display, isSet);
  }

  let dragging = false;
  let dragValue: number | null = null;

  track.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    dragging = true;
    track.setPointerCapture(e.pointerId);
    dragValue = posToValue(e.clientX);
    applyVisual(dragValue, true);
  });
  track.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    dragValue = posToValue(e.clientX);
    applyVisual(dragValue, true);
  });
  track.addEventListener("pointerup", (e) => {
    if (!dragging) return;
    dragging = false;
    track.releasePointerCapture(e.pointerId);
    if (dragValue !== null) {
      onChange(dragValue);
      numInput.value = String(dragValue);
    }
    dragValue = null;
    syncFromModel();
  });
  track.addEventListener("dblclick", () => {
    onChange(null);
    syncFromModel();
  });

  let inputEditing = false;
  let inputTimer: ReturnType<typeof setTimeout> | null = null;

  function commitInput(raw: string): void {
    inputEditing = false;
    if (raw === "") { onChange(null); syncFromModel(); return; }
    const num = def.type === "int" ? parseInt(raw) : parseFloat(raw);
    if (!isNaN(num)) {
      onChange(snap(num));
      syncFromModel();
    }
  }

  numInput.addEventListener("input", () => {
    inputEditing = true;
    if (inputTimer) clearTimeout(inputTimer);
    inputTimer = setTimeout(() => commitInput(numInput.value), 1000);
  });
  numInput.addEventListener("blur", () => {
    if (inputTimer) clearTimeout(inputTimer);
    commitInput(numInput.value);
  });

  syncFromModel();
  return row;
}

/** Connection profile dropdown. */
export function makeConnectionSelect(
  label: string,
  tooltip: string,
  connections: ConnectionProfile[],
  getValue: () => string,
  onChange: (val: string) => void
): HTMLElement {
  const row = document.createElement("div");
  row.className = "hone-settings-row";
  const lbl = document.createElement("label");
  lbl.textContent = label;
  lbl.title = tooltip;
  const select = document.createElement("select");
  const defaultOpt = document.createElement("option");
  defaultOpt.value = "";
  defaultOpt.textContent = connections.length ? "Use default connection" : "No connections available";
  select.appendChild(defaultOpt);
  for (const conn of connections) {
    const opt = document.createElement("option");
    opt.value = conn.id;
    const modelSuffix = conn.model ? ` / ${conn.model}` : "";
    const defaultTag = conn.is_default ? " [default]" : "";
    opt.textContent = `${conn.name} (${conn.provider}${modelSuffix})${defaultTag}`;
    opt.selected = getValue() === conn.id;
    select.appendChild(opt);
  }
  const currentVal = getValue();
  if (currentVal && !connections.find((c) => c.id === currentVal)) {
    const opt = document.createElement("option");
    opt.value = currentVal;
    opt.textContent = `${currentVal} (unknown)`;
    opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener("change", () => onChange(select.value));
  row.appendChild(lbl);
  row.appendChild(select);
  return row;
}

/** Subtab bar: returns the bar plus an `setActive` helper. */
export function makeSubtabBar(
  tabs: Array<{ id: string; label: string }>,
  initialId: string,
  onSwitch: (id: string) => void
): { bar: HTMLElement; activeId: string; setActive: (id: string) => void } {
  let activeId = initialId;
  const bar = document.createElement("div");
  bar.className = "hone-subtab-bar";

  function render() {
    bar.innerHTML = "";
    for (const tab of tabs) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `hone-subtab-btn${tab.id === activeId ? " active" : ""}`;
      btn.textContent = tab.label;
      btn.addEventListener("click", () => {
        if (tab.id === activeId) return;
        activeId = tab.id;
        render();
        onSwitch(tab.id);
      });
      bar.appendChild(btn);
    }
  }

  render();

  return {
    bar,
    get activeId() { return activeId; },
    setActive(id: string) {
      activeId = id;
      render();
    },
  };
}

export function generatePromptId(): string {
  return "prompt_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** Context Settings section: global (lives on HoneSettings, not
 *  per-slot). Both Output and Input panels show the same controls;
 *  edits in either place update the shared values. */
export function createContextSettingsPanel(
  settings: HoneSettings,
  sendUpdate: (patch: Partial<HoneSettings>) => void
): HTMLElement {
  const container = document.createElement("div");

  const section = makeSection("Context Settings");
  section.appendChild(
    makeDescription("Configure the max amount of tokens allowed in {{context}} and {{lore}} macros.")
  );

  section.appendChild(
    makeNumberRow(
      "Max Lorebook Tokens",
      "Maximum tokens of activated lorebook content to include. Empty = unlimited.",
      () => settings.maxLorebookTokens,
      (val) => sendUpdate({ maxLorebookTokens: val }),
      0, 5000000,
      "Unlimited"
    )
  );
  section.appendChild(
    makeNumberRow(
      "Max Message History Tokens",
      "Maximum tokens of preceding chat messages to include as context. Default: 4000.",
      () => settings.maxMessageContextTokens,
      (val) => sendUpdate({ maxMessageContextTokens: val }),
      0, 5000000,
      "4000"
    )
  );
  container.appendChild(section);

  return container;
}
