declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

import type { HandlerMap } from "../dispatch";
import { getSettings, updateSettings } from "../../storage/settings";
import { getStats } from "../../storage/stats";
import { getActiveChatIdFor, snapshotLastAiState } from "../chat-state";
import { hasPermission } from "../permissions";
import * as hlog from "../../hlog";

export const settingsHandlers: HandlerMap = {
  async "get-settings"(_msg, ctx) {
    hlog.debug(ctx.userId, `ipc get-settings: loading`);
    const settings = await getSettings(ctx.userId);
    hlog.debug(
      ctx.userId,
      `ipc get-settings: returning activeModelProfileId="${settings.activeModelProfileId}" currentPresetId="${settings.currentPresetId}" currentInputPresetId="${settings.currentInputPresetId}" enabled=${settings.enabled} autoRefine=${settings.autoRefine} debugLogging=${settings.debugLogging}`
    );
    ctx.send({ type: "settings", settings });
  },

  async "update-settings"(msg, ctx) {
    const keys = Object.keys(msg.settings);
    hlog.debug(ctx.userId, `ipc update-settings: keys=[${keys.join(",")}] values=${JSON.stringify(msg.settings)}`);
    const updated = await updateSettings(ctx.userId, msg.settings);
    ctx.send({ type: "settings", settings: updated });
    if ("debugLogging" in msg.settings || "debugLogMaxEntries" in msg.settings) {
      const stats = hlog.bufferStats(ctx.userId);
      hlog.debug(
        ctx.userId,
        `ipc update-settings: debug buffer state enabled=${stats.enabled} count=${stats.count}/${stats.capacity}`
      );
      ctx.send({
        type: "debug-logs",
        formatted: hlog.formatLogs(ctx.userId),
        count: stats.count,
        capacity: stats.capacity,
        enabled: stats.enabled,
      });
    }
  },

  async "get-stats"(msg, ctx) {
    hlog.debug(ctx.userId, `ipc get-stats: chatId=${msg.chatId.slice(0, 8)}`);
    if (!hasPermission("chats")) {
      hlog.debug(ctx.userId, `ipc get-stats: 'chats' permission missing, dropping`);
      return;
    }
    const stats = await getStats(ctx.userId, msg.chatId);
    hlog.debug(
      ctx.userId,
      `ipc get-stats: returning messagesRefined=${stats.messagesRefined} totalRefinements=${stats.totalRefinements} strategies=[${Object.keys(stats.byStrategy).join(",")}]`
    );
    ctx.send({ type: "stats", stats });
  },

  async "get-connections"(_msg, ctx) {
    hlog.debug(ctx.userId, `ipc get-connections: fetching`);
    if (!hasPermission("generation")) {
      hlog.debug(ctx.userId, `ipc get-connections: 'generation' permission missing, dropping (frontend select will show 'No connections available')`);
      return;
    }
    try {
      const conns = await spindle.connections.list(ctx.userId);
      const mapped = (conns ?? []).map((c: any) => ({
        id: c.id,
        name: c.name,
        provider: c.provider || "",
        model: c.model || "",
        is_default: !!c.is_default,
        has_api_key: !!c.has_api_key,
      }));
      const defaultCount = mapped.filter((c) => c.is_default).length;
      const missingKeyCount = mapped.filter((c) => !c.has_api_key).length;
      hlog.debug(
        ctx.userId,
        `ipc get-connections: returning ${mapped.length} connection(s), ${defaultCount} marked is_default, ${missingKeyCount} missing api_key`
      );
      ctx.send({ type: "connections", connections: mapped });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      hlog.debug(ctx.userId, `ipc get-connections: spindle.connections.list threw: ${error}`);
      spindle.log.warn(`get-connections failed: ${error}`);
      ctx.send({ type: "connections", connections: [], error });
    }
  },

  async "get-active-chat"(_msg, ctx) {
    hlog.debug(ctx.userId, `ipc get-active-chat: fetching`);
    const chatId = await getActiveChatIdFor(ctx.userId);
    hlog.debug(ctx.userId, `ipc get-active-chat: active chat = ${chatId || "none"}`);
    if (!chatId) {
      ctx.send({
        type: "active-chat",
        chatId: null,
        lastMessageRefined: false,
        lastAiMessageId: null,
        refinedMessageIds: [],
      });
      return;
    }
    const snap = await snapshotLastAiState(ctx.userId, chatId);
    ctx.send({
      type: "active-chat",
      chatId,
      lastMessageRefined: snap.refined,
      lastAiMessageId: snap.messageId,
      lastAiStages: snap.stages,
      refinedMessageIds: snap.refinedMessageIds,
    });
  },
};
