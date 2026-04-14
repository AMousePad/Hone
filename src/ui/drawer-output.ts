import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import type {
  FrontendToBackend,
  BackendToFrontend,
  HoneSettings,
  ModelProfileSummary,
} from "../types";
import { createPresetPanel } from "./preset-panel";
import {
  makeDescription,
  makeSelectRow,
  makeSubtabBar,
  createContextSettingsPanel,
} from "./form-helpers";

export function createOutputPanel(
  ctx: SpindleFrontendContext,
  sendToBackend: (msg: FrontendToBackend) => void,
  root: HTMLElement
) {

  let currentSettings: HoneSettings | null = null;
  let modelProfiles: ModelProfileSummary[] = [];

  const panel = createPresetPanel({
    ctx,
    slot: "output",
    root,
    sendToBackend,
    modelProfiles,
    onStateChanged: render,
  });

  let activeSubtab = "pipeline";
  const subtabs = makeSubtabBar(
    [
      { id: "pipeline", label: "Pipeline" },
      { id: "prompts", label: "Prompts" },
      { id: "shield", label: "Shield" },
      { id: "context", label: "Context" },
    ],
    activeSubtab,
    (id) => { activeSubtab = id; render(); }
  );

  function sendUpdate(partial: Partial<HoneSettings>) {
    sendToBackend({ type: "update-settings", settings: partial });
  }

  function render() {
    root.innerHTML = "";
    if (!currentSettings) {
      root.appendChild(makeDescription("Loading..."));
      return;
    }
    const s = currentSettings;

    root.appendChild(panel.buildBar());

    const povRow = makeSelectRow(
      "AI Message PoV",
      "Point of view to enforce for AI messages. Auto-detect instructs the model to match the surrounding text's perspective.",
      [
        { value: "auto", label: "Auto-detect" },
        { value: "1st", label: "First Person" },
        { value: "1.5", label: "First Person (1.5)" },
        { value: "2nd", label: "Second Person" },
        { value: "3rd", label: "Third Person" },
      ],
      () => s.pov,
      (val) => sendUpdate({ pov: val as any })
    );
    root.appendChild(povRow);

    root.appendChild(subtabs.bar);

    const content = document.createElement("div");
    content.className = "hone-subtab-content";

    switch (activeSubtab) {
      case "pipeline":
        content.appendChild(panel.renderPipelineConfig());
        break;
      case "prompts":
        content.appendChild(panel.renderPromptLibrary());
        break;
      case "shield":
        content.appendChild(panel.renderShieldConfig());
        break;
      case "context":
        content.appendChild(createContextSettingsPanel(s, sendUpdate));
        break;
    }

    root.appendChild(content);
  }

  function handleBackendMessage(msg: BackendToFrontend) {
    panel.handleBackendMessage(msg);

    switch (msg.type) {
      case "settings":
        currentSettings = msg.settings;
        panel.onSettings(msg.settings);
        break;
      case "model-profiles":
        modelProfiles = msg.profiles;
        panel.setModelProfiles(modelProfiles);
        break;
    }
    // Parent (drawer.ts) calls renderActivePanel() after delegation.
  }

  return {
    handleBackendMessage,
    render,
  };
}
