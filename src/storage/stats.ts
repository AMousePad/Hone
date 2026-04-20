declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

import type { ChatStats } from "../types";
import * as hlog from "../hlog";

const STATS_PREFIX = "stats/";

function statsFile(chatId: string): string {
  return `${STATS_PREFIX}${chatId}.json`;
}

const DEFAULT_STATS: ChatStats = {
  messagesRefined: 0,
  totalRefinements: 0,
  byStrategy: {},
};

export async function getStats(userId: string, chatId: string): Promise<ChatStats> {
  const stats = await spindle.userStorage.getJson<ChatStats>(statsFile(chatId), {
    fallback: { ...DEFAULT_STATS },
    userId,
  });
  hlog.debug(
    userId,
    `getStats: chat=${chatId.slice(0, 8)} messagesRefined=${stats.messagesRefined} totalRefinements=${stats.totalRefinements}`
  );
  return stats;
}

export async function incrementStats(
  userId: string,
  chatId: string,
  strategy: string,
  count: number = 1
): Promise<void> {
  const stats = await spindle.userStorage.getJson<ChatStats>(statsFile(chatId), {
    fallback: { ...DEFAULT_STATS },
    userId,
  });
  stats.messagesRefined += count;
  stats.totalRefinements += count;
  stats.byStrategy[strategy] = (stats.byStrategy[strategy] || 0) + count;
  await spindle.userStorage.setJson(statsFile(chatId), stats, { userId });
  hlog.debug(
    userId,
    `incrementStats: chat=${chatId.slice(0, 8)} strategy="${strategy}" +${count} -> totalRefinements=${stats.totalRefinements} strategyCount=${stats.byStrategy[strategy]}`
  );
}
