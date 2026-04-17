import type {
  Pipeline,
  Stage,
  MessageRow,
  MessageRole,
  Prompt,
  ModelProfileSummary,
  PreviewPath,
} from "../../types";
import { HEAD_COLLECTION_ID } from "../../constants";
import { createChipInput, type ChipInputHandle } from "./chip-input";

/** Inlined from assemble.ts to keep spindle/hlog out of the
 *  frontend bundle. Pure, no backend deps. */
function detectAdjacentSameRoleMerges(pipeline: Pipeline): Array<{
  stageIndex: number;
  rowIndex: number;
  role: MessageRole;
}> {
  const hits: Array<{ stageIndex: number; rowIndex: number; role: MessageRole }> = [];
  for (let s = 0; s < pipeline.stages.length; s++) {
    const stage = pipeline.stages[s];
    for (let r = 1; r < stage.rows.length; r++) {
      const prev = stage.rows[r - 1];
      const cur = stage.rows[r];
      if (prev.promptIds.length === 0 || cur.promptIds.length === 0) continue;
      if (prev.role === cur.role) {
        hits.push({ stageIndex: s, rowIndex: r, role: cur.role });
      }
    }
  }
  return hits;
}

/**
 * Reusable editor for one Pipeline. Used in three contexts with no
 * duplication: pipeline-strategy presets, each proposal in a
 * parallel preset, and the parallel aggregator.
 *
 * Stage mechanics:
 *  - First row is always system-locked. Rows after select user /
 *    assistant via a role selector.
 *  - Auto-spawn: as soon as the last (staging) row gets a chip, a
 *    new empty staging row appears below.
 *  - Auto-collapse: middle rows emptied of chips drop from the DOM
 *    and remaining rows reindex. The last row never collapses.
 *  - Adjacent same-role rows merge at assembly time; we render a
 *    warning banner where the merge would happen.
 */

export interface PipelineEditorOptions {
  pipeline: Pipeline;
  prompts: Prompt[];
  /** When non-empty, new stages auto-seed their first user row with
   *  the head meta-chip. */
  headCollection: string[];
  readOnly: boolean;
  /** Path prefix for this editor: kind=pipeline / proposal /
   *  aggregator. Stage index is appended at preview time. */
  previewPath: PreviewPath;
  /** Empty selection inherits the preset-level active profile. */
  modelProfiles: ModelProfileSummary[];
  onChange: (pipeline: Pipeline) => void;
  onPreview: (path: PreviewPath, stageIndex: number) => void;
  /** Fires when the user attempts to edit a read-only editor;
   *  parent surfaces the "duplicate to edit" toast. */
  onReadOnlyEditAttempt?: () => void;
}

export interface PipelineEditorHandle {
  element: HTMLElement;
  update(next: Partial<PipelineEditorOptions>): void;
}

function genId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function emptyRow(role: MessageRole): MessageRow {
  return { role, promptIds: [] };
}

/** Ensure exactly one trailing empty staging row. Drop middle
 *  empties. Force the first row to system role. */
function normalizeStageRows(stage: Stage): Stage {
  const kept: MessageRow[] = [];
  for (let i = 0; i < stage.rows.length; i++) {
    const row = stage.rows[i];
    const isLast = i === stage.rows.length - 1;
    if (row.promptIds.length === 0 && !isLast && i !== 0) continue;
    kept.push(row);
  }
  if (kept.length === 0) {
    kept.push(emptyRow("system"));
  } else {
    kept[0] = { ...kept[0], role: "system" };
  }
  const last = kept[kept.length - 1];
  if (last.promptIds.length > 0) {
    // Default opposite role so alternating user assistant flows by default.
    const defaultRole: MessageRole =
      last.role === "assistant" ? "user" : last.role === "user" ? "assistant" : "user";
    kept.push(emptyRow(defaultRole));
  }
  return { ...stage, rows: kept };
}

export function createPipelineEditor(opts: PipelineEditorOptions): PipelineEditorHandle {
  let state: PipelineEditorOptions = { ...opts };

  const root = document.createElement("div");
  root.className = "hone-pipeline-editor";

  /** Destroyed before every re-render so document.body popups don't leak. */
  let activeChipInputs: ChipInputHandle[] = [];

  function emitChange(next: Pipeline): void {
    state.pipeline = next;
    state.onChange(next);
    render();
  }

  function guardReadOnly(): boolean {
    if (state.readOnly) {
      state.onReadOnlyEditAttempt?.();
      return false;
    }
    return true;
  }

  function updateStage(index: number, mut: (stage: Stage) => Stage): void {
    if (!guardReadOnly()) return;
    const stages = state.pipeline.stages.slice();
    stages[index] = normalizeStageRows(mut(stages[index]));
    emitChange({ stages });
  }

  function addStage(): void {
    if (!guardReadOnly()) return;
    // Seed the first user row with the head meta-chip when the preset
    // has a head collection. The user can remove it like any chip.
    const seedRows: MessageRow[] = state.headCollection.length > 0
      ? [emptyRow("system"), { role: "user", promptIds: [HEAD_COLLECTION_ID] }]
      : [];
    const newStage: Stage = normalizeStageRows({
      id: genId("stage"),
      name: `Stage ${state.pipeline.stages.length + 1}`,
      rows: seedRows,
    });
    emitChange({ stages: [...state.pipeline.stages, newStage] });
  }

  function removeStage(index: number): void {
    if (!guardReadOnly()) return;
    const stages = state.pipeline.stages.slice();
    stages.splice(index, 1);
    emitChange({ stages });
  }

  function moveStage(index: number, delta: number): void {
    if (!guardReadOnly()) return;
    const target = index + delta;
    if (target < 0 || target >= state.pipeline.stages.length) return;
    const stages = state.pipeline.stages.slice();
    const [moved] = stages.splice(index, 1);
    stages.splice(target, 0, moved);
    emitChange({ stages });
  }

  function renderStage(stage: Stage, stageIndex: number): HTMLElement {
    const card = document.createElement("div");
    card.className = "hone-pipeline-stage";

    /* ── Stage header ── */
    const header = document.createElement("div");
    header.className = "hone-pipeline-stage__header";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "hone-pipeline-stage__name";
    nameInput.value = stage.name;
    nameInput.placeholder = "Stage name";
    nameInput.disabled = state.readOnly;
    // `change` (blur/Enter), not `input` (per keystroke); render()
    // would destroy and recreate this input mid-typing.
    nameInput.addEventListener("change", () => {
      updateStage(stageIndex, (s) => ({ ...s, name: nameInput.value }));
    });
    nameInput.addEventListener("focus", () => {
      if (state.readOnly) state.onReadOnlyEditAttempt?.();
    });
    header.appendChild(nameInput);

    /* ── Stage controls (connection, preview, move, delete) ── */
    const controls = document.createElement("div");
    controls.className = "hone-pipeline-stage__controls";

    const modelProfileSelect = document.createElement("select");
    modelProfileSelect.className = "hone-pipeline-stage__connection";
    modelProfileSelect.disabled = state.readOnly;
    modelProfileSelect.title =
      "Override the model profile for this stage only. Empty = inherit the preset's active profile.";
    const inheritOption = document.createElement("option");
    inheritOption.value = "";
    inheritOption.textContent = "(inherit active model profile)";
    modelProfileSelect.appendChild(inheritOption);
    for (const mp of state.modelProfiles) {
      const opt = document.createElement("option");
      opt.value = mp.id;
      opt.textContent = mp.name;
      opt.selected = stage.modelProfileId === mp.id;
      modelProfileSelect.appendChild(opt);
    }
    // Surface a deleted-profile reference in the dropdown instead of
    // silently rendering as "inherit". Backend also logs a warn at
    // refinement time (resolveProfile).
    if (
      stage.modelProfileId &&
      !state.modelProfiles.some((mp) => mp.id === stage.modelProfileId)
    ) {
      const missing = document.createElement("option");
      missing.value = stage.modelProfileId;
      missing.textContent = `⚠ deleted profile (${stage.modelProfileId})`;
      missing.selected = true;
      modelProfileSelect.appendChild(missing);
    }
    modelProfileSelect.addEventListener("change", () => {
      updateStage(stageIndex, (s) => ({
        ...s,
        modelProfileId: modelProfileSelect.value || undefined,
      }));
    });
    controls.appendChild(modelProfileSelect);

    const previewBtn = document.createElement("button");
    previewBtn.type = "button";
    previewBtn.className = "hone-pipeline-stage__preview";
    previewBtn.textContent = "Preview JSON";
    previewBtn.title = "Resolve this stage through the full assembler and show the messages array";
    previewBtn.addEventListener("click", () => {
      state.onPreview(state.previewPath, stageIndex);
    });
    controls.appendChild(previewBtn);

    if (!state.readOnly) {
      const upBtn = makeIconButton("↑", "Move stage up", () => moveStage(stageIndex, -1));
      upBtn.disabled = stageIndex === 0;
      const downBtn = makeIconButton("↓", "Move stage down", () => moveStage(stageIndex, 1));
      downBtn.disabled = stageIndex === state.pipeline.stages.length - 1;
      const deleteBtn = makeIconButton("✕", "Delete stage", () => removeStage(stageIndex));
      deleteBtn.classList.add("hone-pipeline-stage__delete");
      controls.appendChild(upBtn);
      controls.appendChild(downBtn);
      controls.appendChild(deleteBtn);
    }

    header.appendChild(controls);
    card.appendChild(header);

    /* ── Stage rows ── */
    const rowsContainer = document.createElement("div");
    rowsContainer.className = "hone-pipeline-stage__rows";

    const merges = detectAdjacentSameRoleMerges({ stages: [stage] });
    const mergedRowIndices = new Set(merges.map((m) => m.rowIndex));

    for (let rowIndex = 0; rowIndex < stage.rows.length; rowIndex++) {
      const row = stage.rows[rowIndex];
      const isFirst = rowIndex === 0;

      if (mergedRowIndices.has(rowIndex)) {
        const warn = document.createElement("div");
        warn.className = "hone-pipeline-row-warning";
        warn.textContent = `⚠ This row has the same role as the one above (${row.role}). They will be merged into a single message when sent.`;
        rowsContainer.appendChild(warn);
      }

      const chipInput: ChipInputHandle = createChipInput({
        promptIds: row.promptIds,
        role: row.role,
        roleMode: isFirst ? "locked" : "choice",
        prompts: state.prompts,
        headCollectionSize: state.headCollection.length,
        readOnly: state.readOnly,
        placeholder: isFirst
          ? "Add system prompt chip..."
          : row.promptIds.length === 0
            ? "Add prompt chip..."
            : "Add prompt chip...",
        onChange: ({ promptIds, role }) => {
          updateStage(stageIndex, (s) => {
            const rows = s.rows.slice();
            rows[rowIndex] = { role, promptIds };
            return { ...s, rows };
          });
        },
      });
      activeChipInputs.push(chipInput);
      rowsContainer.appendChild(chipInput.element);
    }

    card.appendChild(rowsContainer);
    return card;
  }

  function render(): void {
    for (const ci of activeChipInputs) ci.destroy();
    activeChipInputs = [];
    root.innerHTML = "";

    for (let i = 0; i < state.pipeline.stages.length; i++) {
      // View-only normalize so freshly-loaded compacted presets still
      // show the staging row. Doesn't mutate or trigger a save.
      const displayStage = normalizeStageRows(state.pipeline.stages[i]);

      if (i > 0) {
        const arrow = document.createElement("div");
        arrow.className = "hone-pipeline-arrow";
        arrow.textContent = "↓";
        root.appendChild(arrow);
      }

      root.appendChild(renderStage(displayStage, i));
    }

    if (!state.readOnly) {
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "hone-pipeline-add-stage";
      addBtn.textContent = "+ Add LLM Refinement Call";
      addBtn.addEventListener("click", () => addStage());
      root.appendChild(addBtn);
    }
  }

  render();

  return {
    element: root,
    update(next: Partial<PipelineEditorOptions>) {
      state = { ...state, ...next };
      render();
    },
  };
}

function makeIconButton(label: string, title: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "hone-pipeline-stage__icon-btn";
  btn.textContent = label;
  btn.title = title;
  btn.addEventListener("click", onClick);
  return btn;
}

/** Drop empty rows before persisting: strips the UI's trailing
 *  staging-row padding so disk state is clean. */
export function compactPipelineForStorage(pipeline: Pipeline): Pipeline {
  return {
    stages: pipeline.stages.map((stage) => ({
      ...stage,
      rows: stage.rows.filter((r) => r.promptIds.length > 0),
    })),
  };
}
