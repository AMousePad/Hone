import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import type {
  FrontendToBackend,
  BackendToFrontend,
  HoneSettings,
  ConnectionProfile,
  ModelProfile,
  ModelProfileSummary,
  ReasoningEffort,
} from "../types";
import { DEFAULT_PROFILE_ID } from "../constants";
import {
  makeSection,
  makeDescription,
  makeToggleRow,
  makeSelectRow,
  makeSamplerSlider,
  makeConnectionSelect,
  SAMPLER_DEFS,
} from "./form-helpers";

function isDefaultProfile(id: string): boolean {
  return id === DEFAULT_PROFILE_ID;
}

/** Renders into a host root. Hosted as one of the Hone drawer tab's
 *  internal subtab panels. */
export function createModelsPanel(
  ctx: SpindleFrontendContext,
  sendToBackend: (msg: FrontendToBackend) => void,
  root: HTMLElement
) {

  let currentSettings: HoneSettings | null = null;
  let connections: ConnectionProfile[] = [];
  let modelProfileSummaries: ModelProfileSummary[] = [];
  let activeModelProfile: ModelProfile | null = null;

  function sendUpdate(partial: Partial<HoneSettings>) {
    sendToBackend({ type: "update-settings", settings: partial });
  }

  function saveActiveProfile() {
    if (!activeModelProfile) return;
    sendToBackend({ type: "save-model-profile", profile: activeModelProfile });
  }

  function createNewProfile() {
    const conn = connections.find((c) => c.is_default) || connections[0];
    if (!conn) return;
    sendToBackend({ type: "create-model-profile", connectionProfileId: conn.id, name: "New Profile" });
  }

  function render() {
    root.innerHTML = "";
    if (!currentSettings) {
      root.appendChild(makeDescription("Loading..."));
      return;
    }
    const s = currentSettings;
    const activeId = s.activeModelProfileId || DEFAULT_PROFILE_ID;
    const isDefault = isDefaultProfile(activeId);

    const bar = document.createElement("div");
    bar.className = "hone-preset-bar hone-preset-bar--stacked";

    const barLabel = document.createElement("label");
    barLabel.className = "hone-preset-bar__label";
    barLabel.textContent = "Model Profile:";
    bar.appendChild(barLabel);

    const profileSelect = document.createElement("select");
    profileSelect.className = "hone-preset-bar__select";
    // Custom first, Default at the bottom: matches preset dropdown ordering.
    for (const p of modelProfileSummaries) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      opt.selected = activeId === p.id;
      profileSelect.appendChild(opt);
    }
    const builtInGroup = document.createElement("optgroup");
    builtInGroup.label = "Built-in";
    const defaultOpt = document.createElement("option");
    defaultOpt.value = DEFAULT_PROFILE_ID;
    defaultOpt.textContent = "Default";
    defaultOpt.selected = isDefault;
    builtInGroup.appendChild(defaultOpt);
    profileSelect.appendChild(builtInGroup);
    profileSelect.addEventListener("change", () => {
      const newId = profileSelect.value;
      sendUpdate({ activeModelProfileId: newId });
      activeModelProfile = null;
      render();
      if (!isDefaultProfile(newId)) {
        sendToBackend({ type: "get-model-profile", id: newId });
      }
    });
    bar.appendChild(profileSelect);

    const actions = document.createElement("div");
    actions.className = "hone-preset-bar__actions";

    if (!isDefault && activeModelProfile) {
      const renameBtn = document.createElement("button");
      renameBtn.type = "button";
      renameBtn.className = "hone-settings-btn";
      renameBtn.textContent = "Rename";
      renameBtn.title = "Rename this profile.";
      renameBtn.addEventListener("click", () => {
        if (!activeModelProfile) return;
        const newName = prompt("Rename profile:", activeModelProfile.name);
        if (!newName || !newName.trim() || newName.trim() === activeModelProfile.name) return;
        activeModelProfile.name = newName.trim();
        saveActiveProfile();
        render();
      });
      actions.appendChild(renameBtn);
    }

    const duplicateBtn = document.createElement("button");
    duplicateBtn.type = "button";
    duplicateBtn.className = "hone-settings-btn";
    duplicateBtn.textContent = "Duplicate";
    duplicateBtn.title = isDefault
      ? "Create a fresh editable profile (Default is built-in and has no state to copy)."
      : "Create an editable copy of this profile.";
    duplicateBtn.addEventListener("click", () => {
      // Default has no persisted state, so "duplicate" === "+ New".
      if (isDefault) {
        createNewProfile();
        return;
      }
      sendToBackend({ type: "duplicate-model-profile", id: activeId });
    });
    actions.appendChild(duplicateBtn);

    const newBtn = document.createElement("button");
    newBtn.type = "button";
    newBtn.className = "hone-settings-btn";
    newBtn.textContent = "+ New";
    newBtn.title = "Create a new profile from your default connection.";
    newBtn.addEventListener("click", createNewProfile);
    actions.appendChild(newBtn);

    if (!isDefault && activeModelProfile) {
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "hone-settings-btn hone-settings-btn--danger";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", () => {
        if (!activeModelProfile) return;
        const profileToDelete = activeModelProfile;
        ctx.ui
          .showConfirm({
            title: "Delete model profile",
            message: `Delete "${profileToDelete.name}"? This cannot be undone.`,
            confirmLabel: "Delete",
            cancelLabel: "Cancel",
            variant: "danger",
          })
          .then((result) => {
            if (result.confirmed) {
              sendToBackend({ type: "delete-model-profile", id: profileToDelete.id });
            }
          })
          .catch(() => {});
      });
      actions.appendChild(deleteBtn);
    }
    bar.appendChild(actions);
    root.appendChild(bar);

    if (isDefault) {
      const info = makeSection("Default Profile");
      info.appendChild(
        makeDescription("Uses your Lumiverse default connection with no sampler overrides. Reasoning tags are automatically stripped. Duplicate this profile or create a new one to customize connection, samplers, or reasoning settings.")
      );
      root.appendChild(info);
    }

    if (activeModelProfile && !isDefault) {
      const mp = activeModelProfile;

      const connSection = makeSection("Connection");
      connSection.appendChild(
        makeConnectionSelect(
          "Connection",
          "The LLM connection this profile uses.",
          connections,
          () => mp.connectionProfileId,
          (val) => { mp.connectionProfileId = val; saveActiveProfile(); }
        )
      );
      root.appendChild(connSection);

      const samplerSection = makeSection("Samplers");
      samplerSection.appendChild(
        makeDescription("Drag the slider or type a value to override. Double-click the track to reset to connection default. Clear the input to unset.")
      );
      for (const def of SAMPLER_DEFS) {
        samplerSection.appendChild(
          makeSamplerSlider(def, () => mp.samplers[def.key], (val: number | null) => {
            mp.samplers[def.key] = val;
            saveActiveProfile();
          })
        );
      }
      root.appendChild(samplerSection);

      const reasoningSection = makeSection("Reasoning Detection");
      reasoningSection.appendChild(
        makeDescription("Configure how the refinement LLM handles its own reasoning output.")
      );
      reasoningSection.appendChild(
        makeToggleRow(
          "Strip Reasoning Tags",
          "Remove <think>, <thinking>, and <reasoning> tags from the LLM response before extracting refined text.",
          () => mp.reasoning.stripCoTTags,
          (val) => { mp.reasoning.stripCoTTags = val; saveActiveProfile(); }
        )
      );
      reasoningSection.appendChild(
        makeToggleRow(
          "Request Reasoning",
          "Ask the provider to use its native reasoning/thinking API (Anthropic thinking, Google thinkingConfig, OpenRouter reasoning).",
          () => mp.reasoning.requestReasoning,
          (val) => { mp.reasoning.requestReasoning = val; saveActiveProfile(); render(); }
        )
      );
      if (mp.reasoning.requestReasoning) {
        reasoningSection.appendChild(
          makeSelectRow(
            "Reasoning Effort",
            "How much reasoning to request. Provider-specific mapping applies.",
            [
              { value: "auto", label: "Auto" },
              { value: "none", label: "None" },
              { value: "minimal", label: "Minimal" },
              { value: "low", label: "Low" },
              { value: "medium", label: "Medium" },
              { value: "high", label: "High" },
              { value: "xhigh", label: "Extra High (OpenRouter)" },
              { value: "max", label: "Max (Anthropic)" },
            ],
            () => mp.reasoning.reasoningEffort,
            (val) => { mp.reasoning.reasoningEffort = val as ReasoningEffort; saveActiveProfile(); }
          )
        );
      }
      root.appendChild(reasoningSection);
    } else if (!isDefault && activeId !== DEFAULT_PROFILE_ID) {
      root.appendChild(makeDescription("Loading model profile..."));
    }
  }

  function handleBackendMessage(msg: BackendToFrontend) {
    switch (msg.type) {
      case "settings":
        currentSettings = msg.settings;
        if (msg.settings.activeModelProfileId && msg.settings.activeModelProfileId !== activeModelProfile?.id) {
          if (!isDefaultProfile(msg.settings.activeModelProfileId)) {
            sendToBackend({ type: "get-model-profile", id: msg.settings.activeModelProfileId });
          }
        } else if (!msg.settings.activeModelProfileId) {
          activeModelProfile = null;
        }
        sendToBackend({ type: "list-model-profiles" });
        break;

      case "connections":
        connections = msg.connections;
        break;

      case "model-profiles":
        modelProfileSummaries = msg.profiles;
        break;

      case "model-profile": {
        const incoming = msg.profile.id === DEFAULT_PROFILE_ID ? null : msg.profile;
        activeModelProfile = incoming;
        break;
      }
    }
    // Parent (drawer.ts) calls renderActivePanel() after delegation.
  }

  return {
    handleBackendMessage,
    render,
  };
}
