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
    hlog.debug(ctx.userId, `ipc in: list-pov-presets`);
    ctx.send({ type: "pov-presets", presets: await listPovPresets(ctx.userId) });
  },

  async "save-pov-preset"(msg, ctx) {
    hlog.debug(ctx.userId, `ipc in: save-pov-preset id="${msg.preset.id}"`);
    try {
      if (isBuiltInPovPresetId(msg.preset.id)) {
        throw new Error(`Cannot save over built-in POV preset "${msg.preset.id}"; duplicate it first.`);
      }
      await savePovPreset(ctx.userId, msg.preset);
      ctx.send({ type: "pov-presets", presets: await listPovPresets(ctx.userId) });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      spindle.log.warn(`[Hone] save-pov-preset failed: ${error}`);
      ctx.send({ type: "pov-presets", presets: await listPovPresets(ctx.userId) });
      ctx.send({ type: "pov-preset-error", error: `Failed to save POV preset: ${error}` });
    }
  },

  async "delete-pov-preset"(msg, ctx) {
    hlog.debug(ctx.userId, `ipc in: delete-pov-preset id="${msg.id}"`);
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
        const updated = await updateSettings(ctx.userId, patch);
        ctx.send({ type: "settings", settings: updated });
      }
      ctx.send({ type: "pov-presets", presets: await listPovPresets(ctx.userId) });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      spindle.log.warn(`[Hone] delete-pov-preset failed: ${error}`);
      ctx.send({ type: "pov-presets", presets: await listPovPresets(ctx.userId) });
      ctx.send({ type: "pov-preset-error", error: `Failed to delete POV preset: ${error}` });
    }
  },

  async "duplicate-pov-preset"(msg, ctx) {
    hlog.debug(ctx.userId, `ipc in: duplicate-pov-preset id="${msg.id}" slot=${msg.slot}`);
    try {
      const copy = await duplicatePovPreset(ctx.userId, msg.id);
      const settingsKey: keyof HoneSettings = msg.slot === "input" ? "userPov" : "pov";
      const updated = await updateSettings(ctx.userId, { [settingsKey]: copy.id });
      ctx.send({ type: "settings", settings: updated });
      ctx.send({ type: "pov-presets", presets: await listPovPresets(ctx.userId) });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      spindle.log.warn(`[Hone] duplicate-pov-preset failed: ${error}`);
      ctx.send({ type: "pov-presets", presets: await listPovPresets(ctx.userId) });
      ctx.send({ type: "pov-preset-error", error: `Failed to duplicate POV preset: ${error}` });
    }
  },
};
