declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

import type { HandlerMap } from "../dispatch";
import {
  listModelProfiles,
  getModelProfile,
  getDefaultProfile,
  createModelProfile,
  saveModelProfile,
  deleteModelProfile,
  duplicateModelProfile,
  DEFAULT_PROFILE_ID,
} from "../../resources/model-profiles";
import { getSettings, updateSettings } from "../../storage/settings";
import * as hlog from "../../hlog";

export const profileHandlers: HandlerMap = {
  async "list-model-profiles"(_msg, ctx) {
    hlog.debug(ctx.userId, `ipc list-model-profiles: fetching`);
    const profiles = await listModelProfiles(ctx.userId);
    hlog.debug(
      ctx.userId,
      `ipc list-model-profiles: returning ${profiles.length} profile(s) ids=[${profiles.map((p) => p.id).join(",")}]`
    );
    ctx.send({ type: "model-profiles", profiles });
  },

  async "get-model-profile"(msg, ctx) {
    hlog.debug(ctx.userId, `ipc get-model-profile: id="${msg.id}"`);
    if (msg.id === DEFAULT_PROFILE_ID) {
      hlog.debug(ctx.userId, `ipc get-model-profile: returning virtual default profile`);
      ctx.send({ type: "model-profile", profile: getDefaultProfile() });
      return;
    }
    const profile = await getModelProfile(ctx.userId, msg.id);
    if (profile) {
      hlog.debug(
        ctx.userId,
        `ipc get-model-profile: hit id="${msg.id}" name="${profile.name}" connection="${profile.connectionProfileId || "(default)"}"`
      );
      ctx.send({ type: "model-profile", profile });
      return;
    }
    hlog.debug(ctx.userId, `ipc get-model-profile: "${msg.id}" not found, falling back to default`);
    ctx.send({ type: "model-profile", profile: getDefaultProfile() });
    const settings = await getSettings(ctx.userId);
    if (settings.activeModelProfileId === msg.id) {
      hlog.debug(ctx.userId, `ipc get-model-profile: active profile was the missing id, clearing activeModelProfileId`);
      await updateSettings(ctx.userId, { activeModelProfileId: "" });
      ctx.send({ type: "settings", settings: { ...settings, activeModelProfileId: "" } });
    }
  },

  async "create-model-profile"(msg, ctx) {
    hlog.debug(
      ctx.userId,
      `ipc create-model-profile: connectionProfileId="${msg.connectionProfileId || "(default)"}" name="${msg.name}"`
    );
    const profile = await createModelProfile(ctx.userId, msg.connectionProfileId, msg.name);
    hlog.debug(ctx.userId, `ipc create-model-profile: created id="${profile.id}" activating`);
    ctx.send({ type: "model-profile", profile });
    await updateSettings(ctx.userId, { activeModelProfileId: profile.id });
    const updatedSettings = await getSettings(ctx.userId);
    ctx.send({ type: "settings", settings: updatedSettings });
    ctx.send({ type: "model-profiles", profiles: await listModelProfiles(ctx.userId) });
  },

  async "save-model-profile"(msg, ctx) {
    hlog.debug(
      ctx.userId,
      `ipc save-model-profile: id="${msg.profile.id}" name="${msg.profile.name}" connection="${msg.profile.connectionProfileId || "(default)"}" reasoning=${JSON.stringify(msg.profile.reasoning)}`
    );
    try {
      await saveModelProfile(ctx.userId, msg.profile);
      hlog.debug(ctx.userId, `ipc save-model-profile: persisted id="${msg.profile.id}"`);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      hlog.debug(ctx.userId, `ipc save-model-profile: FAILED for id="${msg.profile.id}": ${error}`);
      spindle.log.warn(`[Hone] save-model-profile failed: ${error}`);
      throw err;
    }
    ctx.send({ type: "model-profile", profile: msg.profile });
    ctx.send({ type: "model-profiles", profiles: await listModelProfiles(ctx.userId) });
  },

  async "delete-model-profile"(msg, ctx) {
    hlog.debug(ctx.userId, `ipc delete-model-profile: id="${msg.id}"`);
    try {
      await deleteModelProfile(ctx.userId, msg.id);
      hlog.debug(ctx.userId, `ipc delete-model-profile: deleted id="${msg.id}"`);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      hlog.debug(ctx.userId, `ipc delete-model-profile: FAILED for id="${msg.id}": ${error}`);
      spindle.log.warn(`[Hone] delete-model-profile failed: ${error}`);
      throw err;
    }
    const settings = await getSettings(ctx.userId);
    if (settings.activeModelProfileId === msg.id) {
      hlog.debug(ctx.userId, `ipc delete-model-profile: cleared activeModelProfileId (pointed at deleted id)`);
      await updateSettings(ctx.userId, { activeModelProfileId: "" });
      const updatedSettings = await getSettings(ctx.userId);
      ctx.send({ type: "settings", settings: updatedSettings });
    }
    ctx.send({ type: "model-profiles", profiles: await listModelProfiles(ctx.userId) });
  },

  async "duplicate-model-profile"(msg, ctx) {
    hlog.debug(ctx.userId, `ipc duplicate-model-profile: id="${msg.id}"`);
    const dup =
      msg.id === DEFAULT_PROFILE_ID
        ? await createModelProfile(ctx.userId, "", "New Profile")
        : await duplicateModelProfile(ctx.userId, msg.id);
    if (!dup) {
      hlog.debug(ctx.userId, `ipc duplicate-model-profile: source "${msg.id}" not found`);
      return;
    }
    hlog.debug(
      ctx.userId,
      `ipc duplicate-model-profile: created copy id="${dup.id}" name="${dup.name}" (from "${msg.id}")`
    );
    await updateSettings(ctx.userId, { activeModelProfileId: dup.id });
    const updatedSettings = await getSettings(ctx.userId);
    ctx.send({ type: "settings", settings: updatedSettings });
    ctx.send({ type: "model-profile", profile: dup });
    ctx.send({ type: "model-profiles", profiles: await listModelProfiles(ctx.userId) });
  },
};
