declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

import type { HandlerMap } from "../dispatch";
import * as hlog from "../../hlog";

export const debugHandlers: HandlerMap = {
  async "get-debug-logs"(_msg, ctx) {
    const stats = hlog.bufferStats(ctx.userId);
    hlog.debug(
      ctx.userId,
      `ipc get-debug-logs: formatting ${stats.count}/${stats.capacity} entries (enabled=${stats.enabled})`
    );
    const formatted = hlog.formatLogs(ctx.userId);
    ctx.send({
      type: "debug-logs",
      formatted,
      count: stats.count,
      capacity: stats.capacity,
      enabled: stats.enabled,
    });
  },

  async "clear-debug-logs"(_msg, ctx) {
    const before = hlog.bufferStats(ctx.userId);
    hlog.clearLogs(ctx.userId);
    hlog.debug(ctx.userId, `ipc clear-debug-logs: cleared ${before.count}/${before.capacity} entries`);
    const stats = hlog.bufferStats(ctx.userId);
    ctx.send({
      type: "debug-logs",
      formatted: hlog.formatLogs(ctx.userId),
      count: stats.count,
      capacity: stats.capacity,
      enabled: stats.enabled,
    });
  },

  async log(msg, ctx) {
    if (msg.level === "error") {
      spindle.log.warn(`[Hone][frontend] ERROR ${msg.msg}`);
    }
    hlog.debug(ctx.userId, `[frontend ${msg.level}] ${msg.msg}`);
  },
};
