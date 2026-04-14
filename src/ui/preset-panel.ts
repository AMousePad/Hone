import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import type {
  FrontendToBackend,
  BackendToFrontend,
  HoneSettings,
  HonePreset,
  PresetSummary,
  Prompt,
  Pipeline,
  ModelProfileSummary,
  PresetSlot,
  PreviewPath,
} from "../types";
import { createPipelineEditor, type PipelineEditorHandle, compactPipelineForStorage } from "./pipeline-editor";
import { createChipInput, type ChipInputHandle } from "./chip-input";
import { makeSection, makeDescription, makeSelectRow, makeToggleRow, generatePromptId } from "./form-helpers";
import { HEAD_COLLECTION_ID } from "../constants";
import {
  DEFAULT_SHIELD_INCLUDE_PATTERNS,
  DEFAULT_SHIELD_EXCLUDE_PATTERNS,
  validateShieldPattern,
} from "../text-utils";
import * as flog from "./flog";

/**
 * Slot-parameterized preset management UI: preset bar (selector +
 * CRUD), pipeline config, prompt library. One instance per slot
 * (output, input).
 */

export interface PresetPanelOptions {
  ctx: SpindleFrontendContext;
  slot: PresetSlot;
  root: HTMLElement;
  sendToBackend: (msg: FrontendToBackend) => void;
  /** Mirrored from the backend via setModelProfiles. The panel
   *  doesn't own this list. */
  modelProfiles: ModelProfileSummary[];
  /** Fires after internal state changes so the parent can re-render
   *  alongside. */
  onStateChanged: () => void;
}

export interface PresetPanelHandle {
  getPreset(): HonePreset | null;
  setModelProfiles(profiles: ModelProfileSummary[]): void;
  /** Returns true if the message was consumed. */
  handleBackendMessage(msg: BackendToFrontend): boolean;
  onSettings(settings: HoneSettings): void;
  buildBar(): HTMLElement;
  renderPipelineConfig(): HTMLElement;
  renderPromptLibrary(): HTMLElement;
  renderShieldConfig(): HTMLElement;
}

export function createPresetPanel(opts: PresetPanelOptions): PresetPanelHandle {
  const { ctx, slot, sendToBackend } = opts;
  let modelProfiles = opts.modelProfiles;

  const prefix = slot === "input" ? "Input" : "Output";
  const slotLabel = slot === "input" ? "Hone Input Preset:" : "Hone Output Preset:";

  /* ── State ── */
  let presetSummaries: PresetSummary[] = [];
  let activePreset: HonePreset | null = null;
  let activePresetId: string = "";
  let optimisticPresetId: string | null = null;
  /** Suppresses duplicate `get-preset` fetches when `settings` and
   *  `presets` both ask for the same active preset during handshake. */
  let inFlightPresetId: string | null = null;

  function requestActivePreset(id: string): void {
    if (!id) return;
    if (inFlightPresetId === id) return;
    if (activePreset && activePreset.id === id) return;
    inFlightPresetId = id;
    sendToBackend({ type: "get-preset", id });
  }
  const pipelineEditors = new Map<string, PipelineEditorHandle>();

  /** Head Collection chip-input; destroyed before each re-render
   *  so its document.body-mounted popup doesn't leak. */
  let headChipInput: ChipInputHandle | null = null;

  let readOnlyToastTimer: number | null = null;

  function notifyReadOnlyAttempt(): void {
    const existing = opts.root.querySelector(".hone-readonly-toast");
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.className = "hone-readonly-toast";
    toast.textContent = 'This is a built-in preset. Click "Duplicate" in the preset bar above to create an editable copy.';
    opts.root.appendChild(toast);
    if (readOnlyToastTimer !== null) window.clearTimeout(readOnlyToastTimer);
    readOnlyToastTimer = window.setTimeout(() => {
      toast.remove();
      readOnlyToastTimer = null;
    }, 3000);
  }

  function mutatePreset(mut: (p: HonePreset) => HonePreset): void {
    if (!activePreset) return;
    if (activePreset.builtIn) {
      notifyReadOnlyAttempt();
      return;
    }
    const next = mut(activePreset);
    activePreset = next;
    optimisticPresetId = next.id;
    sendToBackend({ type: "save-preset", preset: compactPresetForStorage(next) });
    opts.onStateChanged();
  }

  function compactPresetForStorage(preset: HonePreset): HonePreset {
    if (preset.strategy === "pipeline" && preset.pipeline) {
      return { ...preset, pipeline: compactPipelineForStorage(preset.pipeline) };
    }
    if (preset.strategy === "parallel" && preset.parallel) {
      return {
        ...preset,
        parallel: {
          proposals: preset.parallel.proposals.map(compactPipelineForStorage),
          aggregator: compactPipelineForStorage(preset.parallel.aggregator),
        },
      };
    }
    return preset;
  }

  function switchStrategy(preset: HonePreset, newStrategy: "pipeline" | "parallel"): HonePreset {
    if (preset.strategy === newStrategy) return preset;
    // When the preset has a Head Collection, seed the first user row
    // of each new stage with the head chip. Mirrors
    // pipeline-editor.addStage so strategy-switch behaves like later
    // stage additions.
    const seedRows = (): Array<{ role: "system" | "user" | "assistant"; promptIds: string[] }> =>
      preset.headCollection.length > 0
        ? [
            { role: "system", promptIds: [] },
            { role: "user", promptIds: [HEAD_COLLECTION_ID] },
          ]
        : [{ role: "system", promptIds: [] }];
    if (newStrategy === "pipeline") {
      return {
        ...preset,
        strategy: "pipeline",
        pipeline: preset.pipeline || { stages: [{ id: generatePromptId(), name: "Stage 1", rows: seedRows() }] },
      };
    }
    return {
      ...preset,
      strategy: "parallel",
      parallel: preset.parallel || {
        proposals: [{ stages: [{ id: generatePromptId(), name: "Agent 1", rows: seedRows() }] }],
        aggregator: { stages: [{ id: generatePromptId(), name: "Aggregator", rows: seedRows() }] },
      },
    };
  }

  function reidStages(pipeline: Pipeline): Pipeline {
    return {
      stages: pipeline.stages.map((s) => ({
        ...s,
        id: generatePromptId(),
        rows: s.rows.map((r) => ({ ...r })),
      })),
    };
  }

  function requestPreview(path: PreviewPath, stageIndex: number): void {
    sendToBackend({ type: "preview-stage", path, stageIndex, slot });
  }

  /* ── Render helpers ── */

  function buildBar(): HTMLElement {
    const bar = document.createElement("div");
    bar.className = "hone-preset-bar";

    const label = document.createElement("label");
    label.className = "hone-preset-bar__label";
    label.textContent = slotLabel;
    bar.appendChild(label);

    const select = document.createElement("select");
    select.className = "hone-preset-bar__select";
    // Custom first, built-ins at the bottom: user presets become
    // the daily drivers, built-ins become "duplicate to start from".
    const filtered = presetSummaries.filter((p) => p.slot === slot);
    const customs = filtered.filter((p) => !p.builtIn);
    const builtins = filtered.filter((p) => p.builtIn);
    const appendOption = (parent: HTMLElement, p: typeof filtered[number]) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      opt.selected = activePresetId === p.id;
      parent.appendChild(opt);
    };
    for (const p of customs) appendOption(select, p);
    if (builtins.length > 0) {
      const group = document.createElement("optgroup");
      group.label = "Built-in";
      for (const p of builtins) appendOption(group, p);
      select.appendChild(group);
    }
    select.addEventListener("change", () => {
      sendToBackend({ type: "set-active-preset", id: select.value, slot });
    });
    bar.appendChild(select);

    const actions = document.createElement("div");
    actions.className = "hone-preset-bar__actions";

    if (activePreset && !activePreset.builtIn) {
      const renameBtn = document.createElement("button");
      renameBtn.type = "button";
      renameBtn.className = "hone-settings-btn";
      renameBtn.textContent = "Rename";
      renameBtn.title = "Rename this preset.";
      renameBtn.addEventListener("click", () => {
        if (!activePreset) return;
        const newName = prompt("Rename preset:", activePreset.name);
        if (!newName || !newName.trim() || newName.trim() === activePreset.name) return;
        mutatePreset((p) => ({ ...p, name: newName.trim() }));
      });
      actions.appendChild(renameBtn);
    }

    const duplicateBtn = document.createElement("button");
    duplicateBtn.type = "button";
    duplicateBtn.className = "hone-settings-btn";
    duplicateBtn.textContent = "Duplicate";
    duplicateBtn.title = "Create an editable copy of the current preset.";
    duplicateBtn.addEventListener("click", () => {
      if (!activePresetId) return;
      sendToBackend({ type: "duplicate-preset", id: activePresetId, slot });
    });
    actions.appendChild(duplicateBtn);

    const exportBtn = document.createElement("button");
    exportBtn.type = "button";
    exportBtn.className = "hone-settings-btn";
    exportBtn.textContent = "Export";
    exportBtn.addEventListener("click", () => {
      if (!activePresetId) return;
      sendToBackend({ type: "export-preset", id: activePresetId });
    });
    actions.appendChild(exportBtn);

    const importBtn = document.createElement("button");
    importBtn.type = "button";
    importBtn.className = "hone-settings-btn";
    importBtn.textContent = "Import";
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "application/json,.json";
    fileInput.style.display = "none";
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        sendToBackend({ type: "import-preset", json: text, slot });
      } catch (err) {
        flog.warn("preset-panel: import file read failed", err);
      }
      fileInput.value = "";
    });
    importBtn.addEventListener("click", () => fileInput.click());
    actions.appendChild(importBtn);
    actions.appendChild(fileInput);

    const newBtn = document.createElement("button");
    newBtn.type = "button";
    newBtn.className = "hone-settings-btn";
    newBtn.textContent = "+ New";
    newBtn.title = "Create a new editable preset from the slot's default built-in.";
    newBtn.addEventListener("click", () => {
      const defaultBuiltIn = presetSummaries.find(
        (p) => p.builtIn && p.slot === slot
      );
      if (!defaultBuiltIn) return;
      sendToBackend({ type: "duplicate-preset", id: defaultBuiltIn.id, slot });
    });
    actions.appendChild(newBtn);

    if (activePreset && !activePreset.builtIn) {
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "hone-settings-btn hone-settings-btn--danger";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", () => {
        if (!activePreset || !activePresetId) return;
        const name = activePreset.name;
        const id = activePresetId;
        ctx.ui
          .showConfirm({
            title: "Delete preset",
            message: `Delete "${name}"? This cannot be undone.`,
            confirmLabel: "Delete",
            cancelLabel: "Cancel",
            variant: "danger",
          })
          .then((result) => {
            if (result.confirmed) sendToBackend({ type: "delete-preset", id });
          })
          .catch(() => {});
      });
      actions.appendChild(deleteBtn);
    }

    bar.appendChild(actions);
    return bar;
  }

  function renderPipelineConfig(): HTMLElement {
    const container = document.createElement("div");
    if (!activePreset) {
      container.appendChild(makeDescription("Loading preset..."));
      return container;
    }

    pipelineEditors.clear();
    const preset = activePreset;

    if (preset.builtIn) {
      const banner = document.createElement("div");
      banner.className = "hone-readonly-banner";
      banner.textContent = '\uD83D\uDD12 Built-in preset: duplicate to edit.';
      container.appendChild(banner);
    }

    // Strategy selector
    container.appendChild(
      makeSelectRow(
        "Strategy",
        "Sequential: stages run one after another. Parallel: N agents run concurrently, then an aggregator merges their outputs.",
        [
          { value: "pipeline", label: "Sequential" },
          { value: "parallel", label: "Parallel (agents + aggregator)" },
        ],
        () => preset.strategy,
        (val) => mutatePreset((p) => switchStrategy(p, val as "pipeline" | "parallel")),
        preset.builtIn
      )
    );

    if (preset.strategy === "pipeline") {
      const pipeline = preset.pipeline || { stages: [] };
      const editor = createPipelineEditor({
        pipeline,
        prompts: preset.prompts,
        headCollection: preset.headCollection,
        readOnly: preset.builtIn,
        previewPath: { kind: "pipeline" },
        modelProfiles,
        onChange: (next) => mutatePreset((p) => ({ ...p, pipeline: next })),
        onPreview: (path, stageIndex) => requestPreview(path, stageIndex),
        onReadOnlyEditAttempt: notifyReadOnlyAttempt,
      });
      pipelineEditors.set("pipeline", editor);
      container.appendChild(editor.element);
    } else if (preset.strategy === "parallel") {
      const parallel = preset.parallel || { proposals: [], aggregator: { stages: [] } };

      // Agents (proposals): flat layout with title dividers, no outer box
      for (let i = 0; i < parallel.proposals.length; i++) {
        const agentHeader = document.createElement("div");
        agentHeader.className = "hone-agent-header";
        const title = document.createElement("h4");
        title.className = "hone-agent-header__title";
        title.textContent = `Agent ${i + 1}`;
        agentHeader.appendChild(title);
        if (!preset.builtIn && parallel.proposals.length > 1) {
          const removeBtn = document.createElement("button");
          removeBtn.type = "button";
          removeBtn.className = "hone-settings-btn hone-settings-btn--danger hone-settings-btn--sm";
          removeBtn.textContent = "Remove";
          removeBtn.addEventListener("click", () => {
            mutatePreset((p) => ({
              ...p,
              parallel: {
                proposals: p.parallel!.proposals.filter((_, idx) => idx !== i),
                aggregator: p.parallel!.aggregator,
              },
            }));
          });
          agentHeader.appendChild(removeBtn);
        }
        container.appendChild(agentHeader);

        const editor = createPipelineEditor({
          pipeline: parallel.proposals[i],
          prompts: preset.prompts,
          headCollection: preset.headCollection,
          readOnly: preset.builtIn,
          previewPath: { kind: "proposal", proposalIndex: i },
          modelProfiles,
          onChange: (next) => {
            mutatePreset((p) => {
              const nextProposals = p.parallel!.proposals.slice();
              nextProposals[i] = next;
              return { ...p, parallel: { proposals: nextProposals, aggregator: p.parallel!.aggregator } };
            });
          },
          onPreview: (path, stageIndex) => requestPreview(path, stageIndex),
          onReadOnlyEditAttempt: notifyReadOnlyAttempt,
        });
        pipelineEditors.set(`proposal-${i}`, editor);
        container.appendChild(editor.element);

        // Divider after each agent (except before the add button if last)
        if (i < parallel.proposals.length - 1) {
          const divider = document.createElement("hr");
          divider.className = "hone-agent-divider";
          container.appendChild(divider);
        }
      }
      if (!preset.builtIn) {
        const addBtn = document.createElement("button");
        addBtn.type = "button";
        addBtn.className = "hone-pipeline-add-stage";
        addBtn.textContent = "+ Add agent";
        addBtn.addEventListener("click", () => {
          mutatePreset((p) => {
            const source = p.parallel!.proposals[0];
            const clone: Pipeline = source
              ? reidStages(source)
              : { stages: [{ id: generatePromptId(), name: "Agent Stage 1", rows: [] }] };
            return {
              ...p,
              parallel: { proposals: [...p.parallel!.proposals, clone], aggregator: p.parallel!.aggregator },
            };
          });
        });
        container.appendChild(addBtn);
      }

      // Aggregator: divider + title
      const aggDivider = document.createElement("hr");
      aggDivider.className = "hone-agent-divider";
      container.appendChild(aggDivider);

      const aggHeader = document.createElement("div");
      aggHeader.className = "hone-agent-header";
      const aggTitle = document.createElement("h4");
      aggTitle.className = "hone-agent-header__title";
      aggTitle.textContent = "Aggregator";
      aggHeader.appendChild(aggTitle);
      container.appendChild(aggHeader);

      const aggregatorEditor = createPipelineEditor({
        pipeline: parallel.aggregator,
        prompts: preset.prompts,
        headCollection: preset.headCollection,
        readOnly: preset.builtIn,
        previewPath: { kind: "aggregator" },
        modelProfiles,
        onChange: (next) => mutatePreset((p) => ({
          ...p,
          parallel: { proposals: p.parallel!.proposals, aggregator: next },
        })),
        onPreview: (path, stageIndex) => requestPreview(path, stageIndex),
        onReadOnlyEditAttempt: notifyReadOnlyAttempt,
      });
      pipelineEditors.set("aggregator", aggregatorEditor);
      container.appendChild(aggregatorEditor.element);
    }

    return container;
  }

  function renderPromptLibrary(): HTMLElement {
    const container = document.createElement("div");
    if (!activePreset) {
      container.appendChild(makeDescription("Loading preset..."));
      return container;
    }

    const preset = activePreset;
    if (preset.builtIn) {
      const banner = document.createElement("div");
      banner.className = "hone-readonly-banner";
      banner.textContent = '\uD83D\uDD12 Built-in preset: duplicate to edit.';
      container.appendChild(banner);
    }

    container.appendChild(
      makeDescription("Define reusable prompts. Reference them by adding chips to pipeline stages. Prompts support both Hone-local macros and Lumiverse native macros.")
    );
    container.appendChild(renderMacroReference());
    container.appendChild(renderHeadCollectionEditor(preset));

    const list = document.createElement("div");
    list.className = "hone-prompt-list";

    for (let i = 0; i < preset.prompts.length; i++) {
      list.appendChild(renderPromptEditor(preset, i));
    }

    if (!preset.builtIn) {
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "hone-pipeline-add-stage";
      addBtn.textContent = "+ Add prompt";
      addBtn.addEventListener("click", () => {
        mutatePreset((p) => ({
          ...p,
          prompts: [...p.prompts, { id: generatePromptId(), name: "New Prompt", content: "" }],
        }));
      });
      list.appendChild(addBtn);
    }

    container.appendChild(list);
    return container;
  }

  /** Head Collection editor: the only place `headCollection` is
   *  mutated. `roleMode: "hidden"` on the chip input so it reads as a
   *  library control, not a stage row. */
  function renderHeadCollectionEditor(preset: HonePreset): HTMLElement {
    const card = document.createElement("div");
    card.className = "hone-head-collection";

    const header = document.createElement("div");
    header.className = "hone-head-collection__header";
    const title = document.createElement("h4");
    title.className = "hone-head-collection__title";
    title.textContent = "Head Collection";
    header.appendChild(title);
    card.appendChild(header);

    const desc = document.createElement("p");
    desc.className = "hone-settings-help";
    desc.textContent =
      "Bundle the prompts you'd otherwise add to every stage's first row. The Head Collection chip is auto-added to the first user row of new stages and is pinned to the top of the row autocomplete. Edits here propagate everywhere the Head Collection chip is used.";
    card.appendChild(desc);

    const chipHost = document.createElement("div");
    chipHost.className = "hone-head-collection__chips";
    card.appendChild(chipHost);

    // headCollectionSize: 0 so the suggestion popup doesn't pin a
    // "Head Collection" entry inside the editor for the head itself.
    const chipInput: ChipInputHandle = createChipInput({
      promptIds: preset.headCollection,
      role: "user",
      roleMode: "hidden",
      prompts: preset.prompts,
      headCollectionSize: 0,
      readOnly: preset.builtIn,
      placeholder: "Add prompt to Head Collection...",
      onChange: ({ promptIds }) => {
        mutatePreset((p) => ({ ...p, headCollection: promptIds }));
      },
    });
    headChipInput?.destroy();
    headChipInput = chipInput;
    chipHost.appendChild(chipInput.element);
    return card;
  }

  /** Collapsible macro reference for preset authors. */
  function renderMacroReference(): HTMLElement {
    const details = document.createElement("details");
    details.className = "hone-macro-reference";

    const summary = document.createElement("summary");
    summary.textContent = "Macro reference (click to expand)";
    details.appendChild(summary);

    const list = document.createElement("dl");
    list.className = "hone-macro-reference__list";

    const macros: Array<{ macro: string; desc: string }> = [
      { macro: "{{message}} / {{original}}", desc: "The original, pre-refinement text of the thing being refined. Output mode: the AI message's original content. Input mode: the user's draft." },
      { macro: "{{latest}}", desc: "The latest AI message. Output mode: pipeline-threaded (stage 0 = original AI, stage N = stage N-1's refined output). Input mode: the last AI response in chat, static across stages." },
      { macro: "{{userMessage}}", desc: "The user's draft during input refinement. Empty for output refinement." },
      { macro: "{{context}}", desc: "Chat history: last-N messages, token-budgeted, with the last AI message (shown in {{latest}}) excluded to avoid duplication. Does not contain character / persona / POV / lore; those have their own macros." },
      { macro: "{{pov}}", desc: "The resolved point-of-view instruction string for the current refinement mode." },
      { macro: "{{lore}}", desc: "Activated lorebook entries from the original generation, concatenated." },
      { macro: "{{shield_preservation_note}}", desc: "Instruction listing the exact <HONE-SHIELD-N/> sentinel tokens currently wrapping scaffolding (block-level HTML-ish tags, fenced code, bracket/brace blocks on their own line) in the input. Include this in a system prompt so the model knows to preserve the tokens verbatim. Resolves to an empty string when no blocks were shielded." },
      { macro: "{{proposal_1}} ... {{proposal_N}}", desc: "Parallel-strategy aggregator-only. Individual proposal pipeline outputs." },
      { macro: "{{proposals}}", desc: "Parallel aggregator-only. All proposal outputs concatenated into [PROPOSAL N]...[/PROPOSAL N] blocks." },
      { macro: "{{proposal_count}}", desc: "Parallel aggregator-only. Number of successful proposals." },
      { macro: "{{stage_name}}, {{stage_index}}, {{total_stages}}", desc: "Stage metadata for the current LLM call." },
    ];

    for (const { macro, desc } of macros) {
      const dt = document.createElement("dt");
      dt.textContent = macro;
      const dd = document.createElement("dd");
      dd.textContent = desc;
      list.appendChild(dt);
      list.appendChild(dd);
    }

    details.appendChild(list);

    const footnote = document.createElement("p");
    footnote.className = "hone-macro-reference__footnote";
    footnote.textContent = "Any macro not listed above is resolved by Lumiverse's native engine (character card fields, identity, conversation, formatting, temporal, etc.).";
    details.appendChild(footnote);

    return details;
  }

  function renderPromptEditor(preset: HonePreset, index: number): HTMLElement {
    const prompt = preset.prompts[index];
    const card = document.createElement("div");
    card.className = "hone-prompt-card";

    const header = document.createElement("div");
    header.className = "hone-prompt-card__header";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "hone-prompt-card__name";
    nameInput.value = prompt.name;
    nameInput.placeholder = "Prompt name";
    nameInput.disabled = preset.builtIn;
    // Use `change` (fires on blur), not `input` (per keystroke).
    // mutatePreset re-renders the panel, which would yank focus
    // every keystroke. Typed text lives in the DOM until blur.
    nameInput.addEventListener("change", () => {
      mutatePreset((p) => {
        const prompts = p.prompts.slice();
        prompts[index] = { ...prompts[index], name: nameInput.value };
        return { ...p, prompts };
      });
    });
    nameInput.addEventListener("focus", () => {
      if (preset.builtIn) notifyReadOnlyAttempt();
    });
    header.appendChild(nameInput);

    if (!preset.builtIn) {
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "hone-settings-btn hone-settings-btn--danger";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", () => {
        mutatePreset((p) => ({
          ...p,
          prompts: p.prompts.filter((_, i) => i !== index),
        }));
      });
      header.appendChild(deleteBtn);
    }
    card.appendChild(header);

    const textarea = document.createElement("textarea");
    textarea.className = "hone-prompt-card__content";
    textarea.value = prompt.content;
    textarea.placeholder = "Prompt content. Supports macros: {{message}}, {{latest}}, {{context}}, {{char}}, {{user}}, {{persona}}, etc.";
    textarea.rows = 6;
    textarea.disabled = preset.builtIn;
    textarea.addEventListener("change", () => {
      mutatePreset((p) => {
        const prompts = p.prompts.slice();
        prompts[index] = { ...prompts[index], content: textarea.value };
        return { ...p, prompts };
      });
    });
    textarea.addEventListener("focus", () => {
      if (preset.builtIn) notifyReadOnlyAttempt();
    });
    card.appendChild(textarea);

    return card;
  }

  /* ── Backend message handling ── */

  function handleBackendMessage(msg: BackendToFrontend): boolean {
    switch (msg.type) {
      case "presets": {
        presetSummaries = msg.presets;
        const newActiveId = slot === "input" ? msg.activeInputId : msg.activeId;
        if (newActiveId !== activePresetId) {
          activePresetId = newActiveId;
          activePreset = null;
        }
        requestActivePreset(activePresetId);
        return true;
      }

      case "preset": {
        const incoming = msg.preset;
        if (incoming.id !== activePresetId) return false;
        if (inFlightPresetId === incoming.id) inFlightPresetId = null;
        // Skip re-render if this is an echo of our own optimistic save.
        if (optimisticPresetId === incoming.id) {
          optimisticPresetId = null;
          const unchanged = activePreset && JSON.stringify(incoming) === JSON.stringify(activePreset);
          if (unchanged) return true;
        }
        activePreset = incoming;
        return true;
      }

      case "preset-exported": {
        const blob = new Blob([msg.json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${msg.name}.hone-preset.json`;
        a.click();
        URL.revokeObjectURL(url);
        return true;
      }

      case "preset-import-result":
        if (!msg.success && msg.error) {
          ctx.ui.showConfirm({
            title: "Preset import failed",
            message: msg.error,
            confirmLabel: "OK",
            cancelLabel: "Dismiss",
            variant: "danger",
          }).catch(() => {});
        }
        return true;

      default:
        return false;
    }
  }

  function renderShieldConfig(): HTMLElement {
    const container = document.createElement("div");
    container.className = "hone-shield-config";
    if (!activePreset) {
      container.appendChild(makeDescription("Loading preset..."));
      return container;
    }
    const preset = activePreset;

    if (preset.builtIn) {
      const banner = document.createElement("div");
      banner.className = "hone-readonly-banner";
      banner.textContent = '\uD83D\uDD12 Built-in preset: duplicate to edit.';
      container.appendChild(banner);
    }

    container.appendChild(
      makeDescription(
        "Shield patterns hide scaffolding from the LLM before refinement and stitch it back afterward. Include patterns define what to shield; exclude patterns override them so matching regions stay visible. Patterns are regex strings compiled with the gmi flags. Empty lists fall back to the built-in defaults."
      )
    );

    container.appendChild(
      makeToggleRow(
        "Enable shielding",
        "Master switch. When off, raw message content is sent to the LLM unmodified; include/exclude patterns are ignored.",
        () => preset.shieldLiteralBlocks,
        (val) => mutatePreset((p) => ({ ...p, shieldLiteralBlocks: val })),
        preset.builtIn
      )
    );

    const includeList = preset.shieldConfig?.include ?? [];
    const excludeList = preset.shieldConfig?.exclude ?? [];

    container.appendChild(
      renderPatternList({
        title: "Include patterns",
        help: "Regex of text regions to shield. Leave empty to use the built-in defaults.",
        patterns: includeList,
        defaults: DEFAULT_SHIELD_INCLUDE_PATTERNS,
        readOnly: preset.builtIn,
        onChange: (next) => writeShieldConfig(next, excludeList),
      })
    );

    container.appendChild(
      renderPatternList({
        title: "Exclude patterns",
        help: "Regex of regions to keep visible even when an include pattern matches them. Useful for inline tags like <font> that the LLM needs to read around.",
        patterns: excludeList,
        defaults: DEFAULT_SHIELD_EXCLUDE_PATTERNS,
        readOnly: preset.builtIn,
        onChange: (next) => writeShieldConfig(includeList, next),
      })
    );

    if (!preset.builtIn) {
      const resetRow = document.createElement("div");
      resetRow.className = "hone-shield-reset-row";

      const resetBtn = document.createElement("button");
      resetBtn.type = "button";
      resetBtn.className = "hone-settings-btn hone-settings-btn--danger";
      resetBtn.textContent = "Reset patterns to defaults";
      resetBtn.addEventListener("click", () => {
        ctx.ui
          .showConfirm({
            title: "Reset shield patterns",
            message:
              "Replace the current include and exclude lists with the built-in defaults? Your current patterns will be lost.",
            confirmLabel: "Reset",
            cancelLabel: "Cancel",
            variant: "danger",
          })
          .then((result) => {
            if (result.confirmed) {
              writeShieldConfig(
                [...DEFAULT_SHIELD_INCLUDE_PATTERNS],
                [...DEFAULT_SHIELD_EXCLUDE_PATTERNS]
              );
            }
          });
      });
      resetRow.appendChild(resetBtn);
      container.appendChild(resetRow);
    }

    return container;
  }

  function writeShieldConfig(include: string[], exclude: string[]): void {
    // Drop the field when both lists are empty so the stored preset stays clean.
    const next =
      include.length === 0 && exclude.length === 0
        ? undefined
        : { include, exclude };
    mutatePreset((p) => {
      const copy: HonePreset = { ...p };
      if (next) copy.shieldConfig = next;
      else delete copy.shieldConfig;
      return copy;
    });
  }

  interface PatternListOpts {
    title: string;
    help: string;
    patterns: string[];
    defaults: readonly string[];
    readOnly: boolean;
    onChange: (next: string[]) => void;
  }

  function renderPatternList(opts: PatternListOpts): HTMLElement {
    const card = document.createElement("div");
    card.className = "hone-shield-pattern-list";

    const heading = document.createElement("h4");
    heading.className = "hone-shield-pattern-list__title";
    heading.textContent = opts.title;
    card.appendChild(heading);

    const help = document.createElement("p");
    help.className = "hone-settings-help";
    help.textContent = opts.help;
    card.appendChild(help);

    const effective =
      opts.patterns.length > 0 ? opts.patterns : [...opts.defaults];
    const showingDefaults = opts.patterns.length === 0;

    if (showingDefaults) {
      const tag = document.createElement("p");
      tag.className = "hone-settings-help hone-shield-pattern-list__defaults";
      tag.textContent =
        "Currently using built-in defaults. Editing a pattern will take a copy into this preset.";
      card.appendChild(tag);
    }

    const rows = document.createElement("div");
    rows.className = "hone-shield-pattern-list__rows";
    card.appendChild(rows);

    for (let i = 0; i < effective.length; i++) {
      rows.appendChild(
        renderPatternRow(effective, i, opts.readOnly, opts.onChange)
      );
    }

    if (!opts.readOnly) {
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "hone-settings-btn hone-settings-btn--sm";
      addBtn.textContent = "+ Add pattern";
      addBtn.addEventListener("click", () => {
        const next = [...effective, ""];
        opts.onChange(next);
      });
      card.appendChild(addBtn);
    }

    return card;
  }

  function renderPatternRow(
    list: string[],
    index: number,
    readOnly: boolean,
    onChange: (next: string[]) => void
  ): HTMLElement {
    const row = document.createElement("div");
    row.className = "hone-shield-pattern-row";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "hone-shield-pattern-input";
    input.value = list[index];
    input.disabled = readOnly;
    input.spellcheck = false;
    input.placeholder = "regex pattern";

    const error = document.createElement("span");
    error.className = "hone-shield-pattern-error";
    const syncError = () => {
      const msg = validateShieldPattern(input.value);
      error.textContent = msg ? `⚠ ${msg}` : "";
    };
    syncError();
    input.addEventListener("input", syncError);

    // Commit on blur or Enter; avoids a per-keystroke save storm.
    const commit = () => {
      if (readOnly) return;
      const next = [...list];
      next[index] = input.value;
      onChange(next);
    };
    input.addEventListener("change", commit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        input.blur();
      }
    });

    row.appendChild(input);
    row.appendChild(error);

    if (!readOnly) {
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "hone-settings-btn hone-settings-btn--danger hone-settings-btn--sm";
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", () => {
        const next = list.filter((_, i) => i !== index);
        onChange(next);
      });
      row.appendChild(removeBtn);
    }

    return row;
  }

  function onSettings(settings: HoneSettings): void {
    const newId = slot === "input" ? settings.currentInputPresetId : settings.currentPresetId;
    if (newId !== activePresetId) {
      activePresetId = newId;
      activePreset = null;
    }
    requestActivePreset(activePresetId);
  }

  return {
    getPreset: () => activePreset,
    setModelProfiles: (profiles) => {
      modelProfiles = profiles;
      // Push into every live editor so per-stage dropdowns update
      // without waiting for a full render.
      for (const editor of pipelineEditors.values()) {
        editor.update({ modelProfiles });
      }
    },
    handleBackendMessage,
    onSettings,
    buildBar,
    renderPipelineConfig,
    renderPromptLibrary,
    renderShieldConfig,
  };
}
