declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

import type { HandlerMap } from "../dispatch";
import { getSettings, updateSettings } from "../../storage/settings";
import { getStats } from "../../storage/stats";
import { getActiveChatIdFor, snapshotLastAiState } from "../chat-state";
import { hasPermission } from "../permissions";
import * as hlog from "../../hlog";

export const settingsHandlers: HandlerMap = {
  async "get-settings"(_msg, ctx) {
    const settings = await getSettings(ctx.userId);
    ctx.send({ type: "settings", settings });
  },

  async "update-settings"(msg, ctx) {
    const updated = await updateSettings(ctx.userId, msg.settings);
    ctx.send({ type: "settings", settings: updated });
    if ("debugLogging" in msg.settings || "debugLogMaxEntries" in msg.settings) {
      const stats = hlog.bufferStats(ctx.userId);
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
    if (!hasPermission("chats")) return;
    const stats = await getStats(ctx.userId, msg.chatId);
    ctx.send({ type: "stats", stats });
  },

  async "get-connections"(_msg, ctx) {
    if (!hasPermission("generation")) return;
    try {
      const conns = await spindle.connections.list(ctx.userId);
      ctx.send({
        type: "connections",
        connections: (conns ?? []).map((c: any) => ({
          id: c.id,
          name: c.name,
          provider: c.provider || "",
          model: c.model || "",
          is_default: !!c.is_default,
          has_api_key: !!c.has_api_key,
        })),
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      spindle.log.warn(`get-connections failed: ${error}`);
      ctx.send({ type: "connections", connections: [], error });
    }
  },

  async "get-active-chat"(_msg, ctx) {
    const chatId = await getActiveChatIdFor(ctx.userId);
    hlog.debug(ctx.userId, `Active chat: ${chatId || "none"}`);
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
