import type { HonePreset, PresetSlot } from "./types";

/**
 * Built-in presets: loaded from plain JSON files under
 * `built-in-presets/`. The JSON format matches user-exported presets:
 *
 *     { "formatVersion": 1, "exportedAt": "...", "preset": { ... } }
 *
 * The folder location determines runtime metadata:
 *
 *   built-in-presets/output/ -> slot: "output", builtIn: true
 *   built-in-presets/input/  -> slot: "input",  builtIn: true
 *
 * Neither `builtIn` nor `slot` is stored in the JSON itself; the
 * folder is the single source of truth, and the same export format
 * works for both user presets and built-ins.
 */

import redraftExport from "../built-in-presets/output/redraft-default-3.0.0.hone-preset.json";
import redraftLiteExport from "../built-in-presets/output/redraft-default-lite-3.0.0.hone-preset.json";
import redraft3StepExport from "../built-in-presets/output/redraft-3step-3.0.0.hone-preset.json";
import simulacraExport from "../built-in-presets/output/simulacra-v4-1.0.hone-preset.json";
import simulacraLiteExport from "../built-in-presets/output/simulacra-v4-lite-1.0.hone-preset.json";
import simulacra3StepExport from "../built-in-presets/output/simulacra-v4-3step-1.0.hone-preset.json";
import redraftParallelExport from "../built-in-presets/output/redraft-parallel-3.0.0.hone-preset.json";
import simulacraParallelExport from "../built-in-presets/output/simulacra-v4-parallel-1.0.hone-preset.json";
import extremeExampleExport from "../built-in-presets/output/extreme-example.hone-preset.json";
import inputSingleExport from "../built-in-presets/input/input-single-pass-1.0.hone-preset.json";
import inputMultiExport from "../built-in-presets/input/input-multi-stage-1.0.hone-preset.json";

/** Load a preset from its export blob, stamping runtime metadata.
 *  Every built-in must declare `headCollection` (use `[]` when the
 *  preset has no shared head). */
function loadBuiltIn(blob: { preset: any }, slot: PresetSlot): HonePreset {
  const p = blob.preset;
  if (!Array.isArray(p.headCollection)) {
    throw new Error(`Built-in preset "${p.id}" is missing required field "headCollection"`);
  }
  if (typeof p.shieldLiteralBlocks !== "boolean") {
    throw new Error(`Built-in preset "${p.id}" is missing required field "shieldLiteralBlocks"`);
  }
  return {
    id: p.id,
    name: p.name,
    builtIn: true,
    slot,
    prompts: p.prompts,
    headCollection: p.headCollection,
    strategy: p.strategy,
    pipeline: p.pipeline,
    parallel: p.parallel,
    shieldLiteralBlocks: p.shieldLiteralBlocks,
    ...(p.shieldConfig ? { shieldConfig: p.shieldConfig } : {}),
  };
}

export const REDRAFT_DEFAULT_ID = "redraft-default-3.0.0";
export const REDRAFT_DEFAULT_LITE_ID = "redraft-default-lite-3.0.0";
export const REDRAFT_3STEP_ID = "redraft-3step-3.0.0";
export const SIMULACRA_V4_ID = "simulacra-v4-1.0";
export const SIMULACRA_V4_LITE_ID = "simulacra-v4-lite-1.0";
export const SIMULACRA_V4_3STEP_ID = "simulacra-v4-3step-1.0";
export const REDRAFT_PARALLEL_ID = "redraft-parallel-3.0.0";
export const SIMULACRA_V4_PARALLEL_ID = "simulacra-v4-parallel-1.0";
export const EXTREME_EXAMPLE_ID = "extreme-example-1.0";
export const INPUT_SINGLE_DEFAULT_ID = "input-single-default-1.0";
export const INPUT_MULTI_DEFAULT_ID = "input-multi-default-1.0";

export const REDRAFT_DEFAULT = loadBuiltIn(redraftExport, "output");
export const REDRAFT_DEFAULT_LITE = loadBuiltIn(redraftLiteExport, "output");
export const REDRAFT_3STEP = loadBuiltIn(redraft3StepExport, "output");
export const REDRAFT_PARALLEL = loadBuiltIn(redraftParallelExport, "output");
export const SIMULACRA_V4 = loadBuiltIn(simulacraExport, "output");
export const SIMULACRA_V4_LITE = loadBuiltIn(simulacraLiteExport, "output");
export const SIMULACRA_V4_3STEP = loadBuiltIn(simulacra3StepExport, "output");
export const SIMULACRA_V4_PARALLEL = loadBuiltIn(simulacraParallelExport, "output");
export const EXTREME_EXAMPLE = loadBuiltIn(extremeExampleExport, "output");
export const INPUT_SINGLE_DEFAULT = loadBuiltIn(inputSingleExport, "input");
export const INPUT_MULTI_DEFAULT = loadBuiltIn(inputMultiExport, "input");

export const BUILTIN_PRESETS: HonePreset[] = [
  REDRAFT_DEFAULT,
  REDRAFT_DEFAULT_LITE,
  REDRAFT_3STEP,
  REDRAFT_PARALLEL,
  SIMULACRA_V4,
  SIMULACRA_V4_LITE,
  SIMULACRA_V4_3STEP,
  SIMULACRA_V4_PARALLEL,
  EXTREME_EXAMPLE,
  INPUT_SINGLE_DEFAULT,
  INPUT_MULTI_DEFAULT,
];

export const DEFAULT_ACTIVE_PRESET_ID = SIMULACRA_V4_ID;
export const DEFAULT_INPUT_ACTIVE_PRESET_ID = INPUT_SINGLE_DEFAULT_ID;

export function isBuiltInPresetId(id: string): boolean {
  return BUILTIN_PRESETS.some((p) => p.id === id);
}

export function getBuiltInPreset(id: string): HonePreset | null {
  return BUILTIN_PRESETS.find((p) => p.id === id) || null;
}
