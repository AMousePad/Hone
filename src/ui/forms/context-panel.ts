import type { HoneSettings } from "../../types";
import { makeSection, makeDescription } from "./sections";
import { makeNumberRow } from "./controls";

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
      "Maximum tokens of activated lorebook content to include. Empty = default (50000).",
      () => settings.maxLorebookTokens,
      (val) => sendUpdate({ maxLorebookTokens: val }),
      0, 5000000,
      undefined,
      50000
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
