/**
 * Per-user debug logging.
 *
 * Hone is operator-scoped: one worker serves every user on the
 * instance, and `spindle.log.*` writes to one shared host stream.
 * Gating a debug toggle on `spindle.log` would let one user's debug
 * flag pollute the host console with every other user's operations.
 *
 * Instead, each user gets an in-memory circular buffer. Debug entries
 * only accumulate for users whose `settings.debugLogging` is on, and
 * users retrieve their own buffer via the `get-debug-logs` IPC.
 * Nothing ever reaches `spindle.log`:
 *
 *   - User A's debug logs are invisible to user B.
 *   - Invisible to the host operator unless user A shares them.
 *   - Buffer is per-process (lost on extension reload).
 *   - Capped at `debugLogMaxEntries` per user (clamped).
 *
 * Ring buffer: append is O(1) even when full; eviction at cap is O(1)
 * (move the head pointer, overwrite the oldest slot). The previous
 * `Array.shift()` implementation copied every element left on each
 * overflow, up to 20k entries per call under heavy bulk refines.
 */

const DEFAULT_MAX_ENTRIES = 2000;
const MIN_MAX_ENTRIES = 100;
const MAX_MAX_ENTRIES = 20000;

interface LogEntry {
  ts: number;
  msg: string;
}

/** Pre-allocated ring. `data.length === capacity`; live entries occupy
 *  `size` slots starting at `head`, wrapping modulo capacity. */
interface RingBuffer {
  data: Array<LogEntry | null>;
  head: number;
  size: number;
}

function makeRing(capacity: number): RingBuffer {
  return { data: new Array(capacity).fill(null), head: 0, size: 0 };
}

function ringPush(buf: RingBuffer, entry: LogEntry): void {
  const cap = buf.data.length;
  if (buf.size < cap) {
    buf.data[(buf.head + buf.size) % cap] = entry;
    buf.size++;
  } else {
    buf.data[buf.head] = entry;
    buf.head = (buf.head + 1) % cap;
  }
}

/** Snapshot live entries in chronological order. */
function ringSnapshot(buf: RingBuffer): LogEntry[] {
  const cap = buf.data.length;
  const out: LogEntry[] = new Array(buf.size);
  for (let i = 0; i < buf.size; i++) {
    out[i] = buf.data[(buf.head + i) % cap]!;
  }
  return out;
}

/** New ring of `newCapacity` carrying the most recent entries from
 *  `buf`. Used when the user changes `debugLogMaxEntries`. */
function ringResize(buf: RingBuffer, newCapacity: number): RingBuffer {
  const live = ringSnapshot(buf);
  const keep = live.length > newCapacity ? live.slice(live.length - newCapacity) : live;
  const next = makeRing(newCapacity);
  for (const entry of keep) ringPush(next, entry);
  return next;
}

function clampCapacity(raw: number | undefined): number {
  const n = typeof raw === "number" ? Math.floor(raw) : DEFAULT_MAX_ENTRIES;
  return Math.max(MIN_MAX_ENTRIES, Math.min(MAX_MAX_ENTRIES, n));
}

/** Cached debug-enabled flag. Synced from settings.ts so log-call hot
 *  paths don't hit async storage. Absent entry = false. */
const debugEnabledCache = new Map<string, boolean>();

/** Cached full-payload flag. Independent of `debugEnabledCache` so
 *  callers can check it cheaply before serializing large objects. */
const fullPayloadCache = new Map<string, boolean>();

/** Per-user capacity. Mirrors `buffers.get(userId).data.length` when
 *  the buffer exists; separate map so we know the intended cap even
 *  before the user logs anything. */
const capacityCache = new Map<string, number>();

const buffers = new Map<string, RingBuffer>();

/** Sync cache from settings. Turning debug off also clears the
 *  user's buffer. */
export function setDebugEnabled(
  userId: string,
  enabled: boolean,
  maxEntries?: number,
  fullPayloads?: boolean
): void {
  const prev = debugEnabledCache.get(userId) || false;
  debugEnabledCache.set(userId, enabled);
  fullPayloadCache.set(userId, enabled && fullPayloads === true);

  const newCap = clampCapacity(maxEntries);
  const prevCap = capacityCache.get(userId);
  capacityCache.set(userId, newCap);

  if (prev && !enabled) {
    buffers.delete(userId);
    return;
  }
  if (!enabled) return;

  const existing = buffers.get(userId);
  if (existing && prevCap !== newCap) {
    buffers.set(userId, ringResize(existing, newCap));
  }
}

export function isDebugEnabled(userId: string): boolean {
  return debugEnabledCache.get(userId) === true;
}

export function isFullPayloadEnabled(userId: string): boolean {
  return fullPayloadCache.get(userId) === true;
}

/** Append a debug entry. No-op when debug is off. */
export function debug(userId: string, msg: string): void {
  if (!debugEnabledCache.get(userId)) return;
  let buf = buffers.get(userId);
  if (!buf) {
    buf = makeRing(capacityCache.get(userId) ?? DEFAULT_MAX_ENTRIES);
    buffers.set(userId, buf);
  }
  ringPush(buf, { ts: Date.now(), msg });
}

export function getLogs(userId: string): LogEntry[] {
  const buf = buffers.get(userId);
  return buf ? ringSnapshot(buf) : [];
}

/** Format the buffer as a newline-separated string with HH:MM:SS.mmm
 *  timestamps, ready for clipboard export. */
export function formatLogs(userId: string): string {
  const entries = getLogs(userId);
  if (entries.length === 0) return "(no debug log entries)";
  const lines: string[] = new Array(entries.length);
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const d = new Date(e.ts);
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    const s = String(d.getSeconds()).padStart(2, "0");
    const ms = String(d.getMilliseconds()).padStart(3, "0");
    lines[i] = `[${h}:${m}:${s}.${ms}] ${e.msg}`;
  }
  return lines.join("\n");
}

export function clearLogs(userId: string): void {
  buffers.delete(userId);
}

/** Buffer-state summary for the settings page; works even when no
 *  entries have been logged yet. */
export function bufferStats(userId: string): { count: number; capacity: number; enabled: boolean } {
  return {
    count: buffers.get(userId)?.size ?? 0,
    capacity: capacityCache.get(userId) ?? DEFAULT_MAX_ENTRIES,
    enabled: debugEnabledCache.get(userId) === true,
  };
}
