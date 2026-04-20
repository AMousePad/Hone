declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

import type { HandlerMap } from "../dispatch";
import type { HoneSettings } from "../../types";
import {
  listPovPresets,
  savePovPreset,
  deletePovPreset,
  duplicatePovPreset,
  isBuiltInPovPresetId,
  DEFAULT_POV_PRESET_ID,
  DEFAULT_USER_POV_PRESET_ID,
} from "../../resources/pov-presets";
import { getSettings, updateSettings } from "../../storage/settings";
import * as hlog from "../../hlog";

export const povHandlers: HandlerMap = {
  async "list-pov-presets"(_msg, ctx) {
    hlog.debug(ctx.userId, `ipc list-pov-presets: fetching`);
    const presets = await listPovPresets(ctx.userId);
    const builtInCount = presets.filter((p) => p.builtIn).length;
    hlog.debug(
      ctx.userId,
      `ipc list-pov-presets: returning ${presets.length} preset(s) (${builtInCount} built-in, ${presets.length - builtInCount} custom)`
    );
    ctx.send({ type: "pov-presets", presets });
  },

  async "save-pov-preset"(msg, ctx) {
    hlog.debug(
      ctx.userId,
      `ipc save-pov-preset: id="${msg.preset.id}" name="${msg.preset.name}" contentLen=${msg.preset.content.length}`
    );
    try {
      if (isBuiltInPovPresetId(msg.preset.id)) {
        throw new Error(`Cannot save over built-in POV preset "${msg.preset.id}"; duplicate it first.`);
      }
      await savePovPreset(ctx.userId, msg.preset);
      hlog.debug(ctx.userId, `ipc save-pov-preset: persisted id="${msg.preset.id}"`);
      ctx.send({ type: "pov-presets", presets: await listPovPresets(ctx.userId) });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      hlog.debug(ctx.userId, `ipc save-pov-preset: FAILED for id="${msg.preset.id}": ${error}`);
      spindle.log.warn(`[Hone] save-pov-preset failed: ${error}`);
      ctx.send({ type: "pov-presets", presets: await listPovPresets(ctx.userId) });
      ctx.send({ type: "pov-preset-error", error: `Failed to save POV preset: ${error}` });
    }
  },

  async "delete-pov-preset"(msg, ctx) {
    hlog.debug(ctx.userId, `ipc delete-pov-preset: id="${msg.id}"`);
    try {
      if (isBuiltInPovPresetId(msg.id)) {
        throw new Error(`Cannot delete built-in POV preset "${msg.id}".`);
      }
      await deletePovPreset(ctx.userId, msg.id);
      const settings = await getSettings(ctx.userId);
      const patch: Partial<HoneSettings> = {};
      if (settings.pov === msg.id) patch.pov = DEFAULT_POV_PRESET_ID;
      if (settings.userPov === msg.id) patch.userPov = DEFAULT_USER_POV_PRESET_ID;
      if (Object.keys(patch).length > 0) {
        hlog.debug(
          ctx.userId,
          `ipc delete-pov-preset: patching active selection(s) -> ${JSON.stringify(patch)}`
        );
        const updated = await updateSettings(ctx.userId, patch);
        ctx.send({ type: "settings", settings: updated });
      } else {
        hlog.debug(ctx.userId, `ipc delete-pov-preset: no active selection pointed at id="${msg.id}"`);
      }
      ctx.send({ type: "pov-presets", presets: await listPovPresets(ctx.userId) });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      hlog.debug(ctx.userId, `ipc delete-pov-preset: FAILED for id="${msg.id}": ${error}`);
      spindle.log.warn(`[Hone] delete-pov-preset failed: ${error}`);
      ctx.send({ type: "pov-presets", presets: await listPovPresets(ctx.userId) });
      ctx.send({ type: "pov-preset-error", error: `Failed to delete POV preset: ${error}` });
    }
  },

  async "duplicate-pov-preset"(msg, ctx) {
    hlog.debug(ctx.userId, `ipc duplicate-pov-preset: id="${msg.id}" slot=${msg.slot}`);
    try {
      const copy = await duplicatePovPreset(ctx.userId, msg.id);
      hlog.debug(
        ctx.userId,
        `ipc duplicate-pov-preset: created copy id="${copy.id}" name="${copy.name}" (from "${msg.id}")`
      );
      const settingsKey: keyof HoneSettings = msg.slot === "input" ? "userPov" : "pov";
      const updated = await updateSettings(ctx.userId, { [settingsKey]: copy.id });
      ctx.send({ type: "settings", settings: updated });
      ctx.send({ type: "pov-presets", presets: await listPovPresets(ctx.userId) });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      hlog.debug(ctx.userId, `ipc duplicate-pov-preset: FAILED for id="${msg.id}": ${error}`);
      spindle.log.warn(`[Hone] duplicate-pov-preset failed: ${error}`);
      ctx.send({ type: "pov-presets", presets: await listPovPresets(ctx.userId) });
      ctx.send({ type: "pov-preset-error", error: `Failed to duplicate POV preset: ${error}` });
    }
  },
};
