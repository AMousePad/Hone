import type { GenerationParams } from "../../types";

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
    if (document.activeElement !== numInput) numInput.value = isSet ? String(v) : "";
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

  function commitInput(raw: string): void {
    if (raw === "") {
      onChange(null);
      syncFromModel();
      return;
    }
    const num = def.type === "int" ? parseInt(raw) : parseFloat(raw);
    if (!isNaN(num)) {
      onChange(snap(num));
      syncFromModel();
    }
  }

  numInput.addEventListener("change", () => commitInput(numInput.value));
  numInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") numInput.blur();
  });

  syncFromModel();
  return row;
}
