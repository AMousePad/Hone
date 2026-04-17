import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import type {
  FrontendToBackend,
  BackendToFrontend,
  HoneSettings,
  ModelProfileSummary,
} from "../../types";
import { createPresetPanel } from "../editors/preset-panel";
import {
  makeDescription,
  makeSubtabBar,
  createContextSettingsPanel,
} from "../forms";
import { createPovEditor } from "../editors/pov-editor";

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

  const povEditor = createPovEditor({ ctx, sendToBackend, slot: "output" });

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
    root.appendChild(povEditor.element);

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
    povEditor.handleBackendMessage(msg);

    switch (msg.type) {
      case "settings":
        currentSettings = msg.settings;
        panel.onSettings(msg.settings);
        povEditor.onSettings(msg.settings);
        break;
      case "model-profiles":
        modelProfiles = msg.profiles;
        panel.setModelProfiles(modelProfiles);
        break;
    }
  }

  return {
    handleBackendMessage,
    render,
  };
}
