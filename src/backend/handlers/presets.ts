declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

import type { HandlerMap } from "../dispatch";
import type { HoneSettings } from "../../types";
import {
  listPresets,
  getPreset,
  savePreset,
  deletePreset,
  duplicatePreset,
  exportPreset,
  importPreset,
} from "../../resources/presets";
import { getSettings, updateSettings } from "../../storage/settings";
import { previewStage } from "../../refinement";
import { DEFAULT_ACTIVE_PRESET_ID, DEFAULT_INPUT_ACTIVE_PRESET_ID } from "../../preset-defaults";
import { getActiveChatIdFor } from "../chat-state";
import * as hlog from "../../hlog";

async function pushPresets(userId: string, send: (m: any) => void) {
  const presets = await listPresets(userId);
  const settings = await getSettings(userId);
  const outputCount = presets.filter((p) => p.slot === "output").length;
  const inputCount = presets.filter((p) => p.slot === "input").length;
  const builtInCount = presets.filter((p) => p.builtIn).length;
  hlog.debug(
    userId,
    `pushPresets: ${presets.length} total (${outputCount} output, ${inputCount} input, ${builtInCount} built-in), activeOutput="${settings.currentPresetId}" activeInput="${settings.currentInputPresetId}"`
  );
  send({
    type: "presets",
    presets,
    activeId: settings.currentPresetId,
    activeInputId: settings.currentInputPresetId,
  });
}

export const presetHandlers: HandlerMap = {
  async "list-presets"(_msg, ctx) {
    hlog.debug(ctx.userId, `ipc list-presets: fetching`);
    await pushPresets(ctx.userId, ctx.send);
  },

  async "get-preset"(msg, ctx) {
    hlog.debug(ctx.userId, `ipc get-preset: id="${msg.id}"`);
    const preset = await getPreset(ctx.userId, msg.id);
    if (!preset) {
      hlog.debug(ctx.userId, `ipc get-preset: "${msg.id}" not found, falling back`);
      await pushPresets(ctx.userId, ctx.send);
      return;
    }
    ctx.send({ type: "preset", preset });
  },

  async "save-preset"(msg, ctx) {
    const p = msg.preset;
    const stageCount = p.strategy === "pipeline"
      ? p.pipeline?.stages.length ?? 0
      : (p.parallel?.proposals.reduce((n, pr) => n + pr.stages.length, 0) ?? 0) + (p.parallel?.aggregator.stages.length ?? 0);
    hlog.debug(
      ctx.userId,
      `ipc save-preset: id="${p.id}" name="${p.name}" slot=${p.slot} strategy=${p.strategy} prompts=${p.prompts.length} head=${p.headCollection.length} stages=${stageCount} shield=${p.shieldLiteralBlocks}`
    );
    try {
      await savePreset(ctx.userId, msg.preset);
      hlog.debug(ctx.userId, `ipc save-preset: persisted id="${p.id}"`);
      await pushPresets(ctx.userId, ctx.send);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      hlog.debug(ctx.userId, `ipc save-preset: FAILED for id="${p.id}": ${error}`);
      spindle.log.warn(`[Hone] save-preset failed: ${error}`);
      ctx.send({ type: "preset-import-result", success: false, error });
    }
  },

  async "delete-preset"(msg, ctx) {
    hlog.debug(ctx.userId, `ipc delete-preset: id="${msg.id}"`);
    try {
      await deletePreset(ctx.userId, msg.id);
      hlog.debug(ctx.userId, `ipc delete-preset: deleted id="${msg.id}"`);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      hlog.debug(ctx.userId, `ipc delete-preset: FAILED for id="${msg.id}": ${error}`);
      spindle.log.warn(`[Hone] delete-preset failed: ${error}`);
      ctx.send({ type: "refine-error", messageId: "", error: `Failed to delete preset: ${error}` });
      await pushPresets(ctx.userId, ctx.send);
      return;
    }
    const settings = await getSettings(ctx.userId);
    const fallbacks: Partial<HoneSettings> = {};
    if (settings.currentPresetId === msg.id) fallbacks.currentPresetId = DEFAULT_ACTIVE_PRESET_ID;
    if (settings.currentInputPresetId === msg.id) fallbacks.currentInputPresetId = DEFAULT_INPUT_ACTIVE_PRESET_ID;
    if (Object.keys(fallbacks).length > 0) {
      hlog.debug(
        ctx.userId,
        `ipc delete-preset: patching active selections after delete -> ${JSON.stringify(fallbacks)}`
      );
      await updateSettings(ctx.userId, fallbacks);
    }
    await pushPresets(ctx.userId, ctx.send);
  },

  async "duplicate-preset"(msg, ctx) {
    hlog.debug(ctx.userId, `ipc duplicate-preset: source="${msg.id}" slot=${msg.slot}`);
    try {
      const copy = await duplicatePreset(ctx.userId, msg.id);
      hlog.debug(
        ctx.userId,
        `ipc duplicate-preset: created copy id="${copy.id}" name="${copy.name}" from "${msg.id}", activating in slot=${msg.slot}`
      );
      const settingsKey: keyof HoneSettings = msg.slot === "input" ? "currentInputPresetId" : "currentPresetId";
      await updateSettings(ctx.userId, { [settingsKey]: copy.id });
      await pushPresets(ctx.userId, ctx.send);
      ctx.send({ type: "preset", preset: copy });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      hlog.debug(ctx.userId, `ipc duplicate-preset: FAILED for id="${msg.id}": ${error}`);
      spindle.log.warn(`[Hone] duplicate-preset failed: ${error}`);
      ctx.send({ type: "preset-import-result", success: false, error });
    }
  },

  async "set-active-preset"(msg, ctx) {
    hlog.debug(ctx.userId, `ipc set-active-preset: id="${msg.id}" slot=${msg.slot}`);
    const preset = await getPreset(ctx.userId, msg.id);
    if (!preset) {
      hlog.debug(ctx.userId, `ipc set-active-preset: preset "${msg.id}" not found, ignoring`);
      spindle.log.warn(`[Hone] set-active-preset: preset "${msg.id}" not found`);
      return;
    }
    hlog.debug(
      ctx.userId,
      `ipc set-active-preset: activated id="${preset.id}" name="${preset.name}" strategy=${preset.strategy}`
    );
    const settingsKey: keyof HoneSettings = msg.slot === "input" ? "currentInputPresetId" : "currentPresetId";
    await updateSettings(ctx.userId, { [settingsKey]: msg.id });
    await pushPresets(ctx.userId, ctx.send);
    ctx.send({ type: "preset", preset });
  },

  async "export-preset"(msg, ctx) {
    hlog.debug(ctx.userId, `ipc export-preset: id="${msg.id}"`);
    try {
      const exported = await exportPreset(ctx.userId, msg.id);
      hlog.debug(
        ctx.userId,
        `ipc export-preset: exported id="${exported.id}" name="${exported.name}" size=${exported.json.length} bytes`
      );
      ctx.send({
        type: "preset-exported",
        id: exported.id,
        name: exported.name,
        json: exported.json,
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      hlog.debug(ctx.userId, `ipc export-preset: FAILED for id="${msg.id}": ${error}`);
      spindle.log.warn(`[Hone] export-preset failed: ${error}`);
      ctx.send({ type: "preset-import-result", success: false, error });
    }
  },

  async "import-preset"(msg, ctx) {
    hlog.debug(ctx.userId, `ipc import-preset: ${msg.json.length} bytes slot=${msg.slot}`);
    try {
      const imported = await importPreset(ctx.userId, msg.json, msg.slot);
      hlog.debug(
        ctx.userId,
        `ipc import-preset: imported id="${imported.id}" name="${imported.name}" strategy=${imported.strategy}, activating`
      );
      const settingsKey: keyof HoneSettings = msg.slot === "input" ? "currentInputPresetId" : "currentPresetId";
      await updateSettings(ctx.userId, { [settingsKey]: imported.id });
      await pushPresets(ctx.userId, ctx.send);
      ctx.send({ type: "preset", preset: imported });
      ctx.send({ type: "preset-import-result", success: true, id: imported.id });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      hlog.debug(ctx.userId, `ipc import-preset: FAILED: ${error}`);
      spindle.log.warn(`[Hone] import-preset failed: ${error}`);
      ctx.send({ type: "preset-import-result", success: false, error });
    }
  },

  async "preview-stage"(msg, ctx) {
    const previewChatId = msg.chatId || (await getActiveChatIdFor(ctx.userId)) || undefined;
    hlog.debug(
      ctx.userId,
      `ipc preview-stage: slot=${msg.slot} path=${JSON.stringify(msg.path)} stageIndex=${msg.stageIndex} chatId=${previewChatId?.slice(0, 8) || "none"}`
    );
    try {
      const settings = await getSettings(ctx.userId);
      const presetId = msg.slot === "input" ? settings.currentInputPresetId : settings.currentPresetId;
      const preset = await getPreset(ctx.userId, presetId);
      if (!preset) {
        hlog.debug(ctx.userId, `ipc preview-stage: no active ${msg.slot} preset (id="${presetId}")`);
        spindle.log.warn(`[Hone] preview-stage: no active ${msg.slot} preset`);
        return;
      }
      const pipeline =
        msg.path.kind === "pipeline"
          ? preset.pipeline
          : msg.path.kind === "proposal"
            ? preset.parallel?.proposals[msg.path.proposalIndex]
            : preset.parallel?.aggregator;
      if (!pipeline) {
        hlog.debug(
          ctx.userId,
          `ipc preview-stage: pipeline not found for path=${JSON.stringify(msg.path)} (preset.strategy=${preset.strategy})`
        );
        spindle.log.warn(`[Hone] preview-stage: pipeline not found for path ${JSON.stringify(msg.path)}`);
        return;
      }
      const stage = pipeline.stages[msg.stageIndex];
      if (!stage) {
        hlog.debug(
          ctx.userId,
          `ipc preview-stage: stage ${msg.stageIndex} out of bounds (pipeline has ${pipeline.stages.length} stages)`
        );
        spindle.log.warn(`[Hone] preview-stage: stage ${msg.stageIndex} not found`);
        return;
      }
      const proposals =
        msg.path.kind === "aggregator" && preset.parallel
          ? preset.parallel.proposals.map(
              (_, i) => `<proposal ${i + 1} output: placeholder since no LLM was called for the preview>`
            )
          : undefined;
      const result = await previewStage(
        preset,
        stage,
        msg.stageIndex,
        pipeline.stages.length,
        ctx.userId,
        proposals,
        previewChatId,
        msg.slot
      );
      ctx.send({
        type: "preview-result",
        path: msg.path,
        stageIndex: msg.stageIndex,
        messages: result.messages,
        diagnostics: result.diagnostics,
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      hlog.debug(ctx.userId, `ipc preview-stage: FAILED: ${error}`);
      spindle.log.warn(`[Hone] preview-stage failed: ${error}`);
    }
  },
};
