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
  emptyPlaceholder?: string,
  defaultValue?: number
): HTMLElement {
  const row = document.createElement("div");
  row.className = "hone-settings-row hone-settings-row--number";
  const lbl = document.createElement("label");
  lbl.textContent = label;
  lbl.title = tooltip;
  const input = document.createElement("input");
  input.type = "number";
  const val = getValue();
  const isDefaultSentinel = defaultValue !== undefined && val === defaultValue;
  const isEmptySentinel = emptyPlaceholder !== undefined && val === 0;
  input.value = isDefaultSentinel || isEmptySentinel ? "" : String(val);
  if (emptyPlaceholder) input.placeholder = emptyPlaceholder;
  else if (defaultValue !== undefined) input.placeholder = `default (${defaultValue})`;
  if (min !== undefined) input.min = String(min);
  if (max !== undefined) input.max = String(max);
  input.addEventListener("change", () => {
    if (input.value === "") {
      onChange(defaultValue !== undefined ? defaultValue : 0);
      return;
    }
    onChange(Number(input.value));
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") input.blur();
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
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") input.blur();
  });
  row.appendChild(lbl);
  row.appendChild(input);
  return row;
}
