import type { ConnectionProfile } from "../../types";

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
