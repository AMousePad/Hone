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
    hlog.debug(ctx.userId, `ipc in: list-model-profiles`);
    const profiles = await listModelProfiles(ctx.userId);
    ctx.send({ type: "model-profiles", profiles });
  },

  async "get-model-profile"(msg, ctx) {
    hlog.debug(ctx.userId, `ipc in: get-model-profile`);
    if (msg.id === DEFAULT_PROFILE_ID) {
      ctx.send({ type: "model-profile", profile: getDefaultProfile() });
      return;
    }
    const profile = await getModelProfile(ctx.userId, msg.id);
    if (profile) {
      ctx.send({ type: "model-profile", profile });
      return;
    }
    hlog.debug(ctx.userId, `ipc get-model-profile: "${msg.id}" not found, falling back to default`);
    ctx.send({ type: "model-profile", profile: getDefaultProfile() });
    const settings = await getSettings(ctx.userId);
    if (settings.activeModelProfileId === msg.id) {
      await updateSettings(ctx.userId, { activeModelProfileId: "" });
      ctx.send({ type: "settings", settings: { ...settings, activeModelProfileId: "" } });
    }
  },

  async "create-model-profile"(msg, ctx) {
    hlog.debug(ctx.userId, `ipc in: create-model-profile`);
    const profile = await createModelProfile(ctx.userId, msg.connectionProfileId, msg.name);
    ctx.send({ type: "model-profile", profile });
    await updateSettings(ctx.userId, { activeModelProfileId: profile.id });
    const updatedSettings = await getSettings(ctx.userId);
    ctx.send({ type: "settings", settings: updatedSettings });
    ctx.send({ type: "model-profiles", profiles: await listModelProfiles(ctx.userId) });
  },

  async "save-model-profile"(msg, ctx) {
    hlog.debug(ctx.userId, `ipc in: save-model-profile`);
    await saveModelProfile(ctx.userId, msg.profile);
    ctx.send({ type: "model-profile", profile: msg.profile });
    ctx.send({ type: "model-profiles", profiles: await listModelProfiles(ctx.userId) });
  },

  async "delete-model-profile"(msg, ctx) {
    hlog.debug(ctx.userId, `ipc in: delete-model-profile`);
    await deleteModelProfile(ctx.userId, msg.id);
    const settings = await getSettings(ctx.userId);
    if (settings.activeModelProfileId === msg.id) {
      await updateSettings(ctx.userId, { activeModelProfileId: "" });
      const updatedSettings = await getSettings(ctx.userId);
      ctx.send({ type: "settings", settings: updatedSettings });
    }
    ctx.send({ type: "model-profiles", profiles: await listModelProfiles(ctx.userId) });
  },

  async "duplicate-model-profile"(msg, ctx) {
    hlog.debug(ctx.userId, `ipc in: duplicate-model-profile`);
    const dup =
      msg.id === DEFAULT_PROFILE_ID
        ? await createModelProfile(ctx.userId, "", "New Profile")
        : await duplicateModelProfile(ctx.userId, msg.id);
    if (!dup) {
      hlog.debug(ctx.userId, `ipc duplicate-model-profile: source "${msg.id}" not found`);
      return;
    }
    await updateSettings(ctx.userId, { activeModelProfileId: dup.id });
    const updatedSettings = await getSettings(ctx.userId);
    ctx.send({ type: "settings", settings: updatedSettings });
    ctx.send({ type: "model-profile", profile: dup });
    ctx.send({ type: "model-profiles", profiles: await listModelProfiles(ctx.userId) });
  },
};
