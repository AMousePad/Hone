declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

import type {
  GenerationRequestDTO,
} from "lumiverse-spindle-types";
import type { GenerateRequest, GenerateResult, GenerationParams, HoneSettings } from "../types";
import { getSettings } from "../storage/settings";
import { isAbortError } from "./cancel";
import { hasPermission, describeMissingPermissions } from "../backend/permissions";
import * as hlog from "../hlog";

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return `[unserializable: ${reason}]`;
  }
}

export function buildGenerationParameters(params: GenerationParams): Record<string, unknown> | undefined {
  const result: Record<string, unknown> = {};
  if (params.temperature !== null) result.temperature = params.temperature;
  if (params.maxTokens !== null) result.max_tokens = params.maxTokens;
  if (params.contextSize !== null) result.max_context_length = params.contextSize;
  if (params.topP !== null) result.top_p = params.topP;
  if (params.minP !== null) result.min_p = params.minP;
  if (params.topK !== null) result.top_k = params.topK;
  if (params.frequencyPenalty !== null) result.frequency_penalty = params.frequencyPenalty;
  if (params.presencePenalty !== null) result.presence_penalty = params.presencePenalty;
  return Object.keys(result).length > 0 ? result : undefined;
}

type ResolveConnectionResult =
  | { ok: true; value: { id: string; model: string | undefined } }
  | { ok: false; error: string };

/** Resolve a connection profile id to `{id, model}`, falling back to
 *  the user's `is_default` profile (or the first connection) when the
 *  id is empty. Every branch emits an hlog.debug so the per-user
 *  buffer records exactly which path was taken: explicit hit,
 *  explicit miss, default fallback, empty list, or thrown API call.
 *  Pre-checks the `generation` permission so a runtime revocation
 *  surfaces the correct reminder instead of the generic "no profiles
 *  configured" message. */
async function resolveConnection(
  connectionProfileId: string,
  userId: string
): Promise<ResolveConnectionResult> {
  if (!hasPermission("generation")) {
    const reminder = describeMissingPermissions(["generation"]);
    hlog.debug(userId, `resolveConnection: 'generation' permission missing at call time, returning reminder`);
    return { ok: false, error: reminder };
  }
  try {
    if (connectionProfileId) {
      hlog.debug(userId, `resolveConnection: explicit id="${connectionProfileId}" -> spindle.connections.get`);
      const conn = await spindle.connections.get(connectionProfileId, userId);
      if (!conn) {
        hlog.debug(userId, `resolveConnection: explicit id="${connectionProfileId}" not found (spindle.connections.get returned null)`);
        return { ok: false, error: `Connection profile "${connectionProfileId}" not found` };
      }
      hlog.debug(
        userId,
        `resolveConnection: explicit id="${connectionProfileId}" -> hit name="${conn.name}" provider="${conn.provider || ""}" model="${conn.model || ""}"`
      );
      return { ok: true, value: { id: conn.id, model: conn.model || undefined } };
    }
    hlog.debug(userId, `resolveConnection: no explicit id, falling back to spindle.connections.list (default)`);
    const conns = await spindle.connections.list(userId);
    if (!conns || conns.length === 0) {
      hlog.debug(
        userId,
        `resolveConnection: default fallback failed - spindle.connections.list returned ${conns === null ? "null" : conns === undefined ? "undefined" : "empty array"}. User has no Lumiverse connection profiles`
      );
      return {
        ok: false,
        error: "No connection profiles configured. Set a default in Lumiverse Settings -> Connections",
      };
    }
    const conn = conns.find((c) => c.is_default) || conns[0];
    const via = conns.find((c) => c.is_default) ? "is_default" : "first";
    hlog.debug(
      userId,
      `resolveConnection: default fallback -> ${conns.length} connection(s), picked "${conn.name}" via ${via} (provider="${conn.provider || ""}" model="${conn.model || ""}")`
    );
    return { ok: true, value: { id: conn.id, model: conn.model || undefined } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    hlog.debug(userId, `resolveConnection: threw for id="${connectionProfileId || "(default)"}": ${message}`);
    spindle.log.warn(`resolveConnection failed: ${message}`);
    if (message.includes("PERMISSION_DENIED") && message.includes("generation")) {
      return { ok: false, error: describeMissingPermissions(["generation"]) };
    }
    return { ok: false, error: `Connection lookup failed: ${message}` };
  }
}

interface GenerateOptions {
  signal?: AbortSignal;
}

interface TimeoutOutcome {
  ourTimeoutFired: boolean;
}

function pickStallMessage(streamMode: boolean, settings: HoneSettings): string {
  if (streamMode) {
    return `Generation stalled: no first token within ${settings.ttftTimeoutSecs}s. The provider may be slow or unreachable.`;
  }
  return `Generation timed out after ${settings.totalTimeoutSecs}s with no response. Streaming is off; consider enabling it for earlier stall detection.`;
}

function composeAbortSignals(
  external: AbortSignal | undefined,
  timeoutMs: number,
  outcome: TimeoutOutcome
): { signal: AbortSignal; disarm: () => void } {
  const internal = new AbortController();
  const timer = setTimeout(() => {
    if (!internal.signal.aborted && !(external?.aborted ?? false)) {
      outcome.ourTimeoutFired = true;
      internal.abort();
    }
  }, timeoutMs);

  const disarm = () => {
    clearTimeout(timer);
  };

  if (!external) {
    return { signal: internal.signal, disarm };
  }
  if (external.aborted) {
    internal.abort();
    return { signal: internal.signal, disarm };
  }
  const composed = AbortSignal.any([external, internal.signal]);
  return { signal: composed, disarm };
}

function buildSpindleRequest(
  req: GenerateRequest,
  resolved: { id: string; model: string | undefined },
  userId: string,
  signal: AbortSignal
): GenerationRequestDTO {
  const parameters: Record<string, unknown> = { ...req.parameters };
  if (resolved.model) parameters.model = resolved.model;
  // Lumiverse's host reads `model` directly off the top-level request
  // and passes it to the provider, which rejects empty strings. The
  // GenerationRequestDTO type is missing the field but the host accepts it.
  return {
    type: "raw",
    messages: req.messages,
    connection_id: resolved.id,
    model: resolved.model,
    parameters,
    userId,
    signal,
  } as GenerationRequestDTO & { model?: string };
}

interface ResolvedRequest {
  resolved: { id: string; model: string | undefined };
  parametersForLog: Record<string, unknown>;
}

async function prepareRequest(
  req: GenerateRequest,
  userId: string
): Promise<{ ok: true; data: ResolvedRequest } | { ok: false; error: string }> {
  hlog.debug(
    userId,
    `prepareRequest: start connectionProfileId="${req.connectionProfileId || "(default)"}" msgs=${req.messages.length} params=${JSON.stringify(req.parameters ?? {})}`
  );
  const resolved = await resolveConnection(req.connectionProfileId, userId);
  if (!resolved.ok) {
    hlog.debug(userId, `prepareRequest: resolveConnection failed, surfacing error to frontend: ${resolved.error}`);
    spindle.log.warn(`Generation failed: ${resolved.error}`);
    return { ok: false, error: resolved.error };
  }
  const parametersForLog: Record<string, unknown> = { ...req.parameters };
  if (resolved.value.model) parametersForLog.model = resolved.value.model;
  hlog.debug(
    userId,
    `prepareRequest: resolved connection.id=${resolved.value.id} model="${resolved.value.model || "none"}"`
  );
  return { ok: true, data: { resolved: resolved.value, parametersForLog } };
}

async function generateNonStreaming(
  req: GenerateRequest,
  resolved: { id: string; model: string | undefined },
  userId: string,
  options: GenerateOptions,
  settings: HoneSettings
): Promise<GenerateResult> {
  const totalMs = Math.max(1, settings.totalTimeoutSecs) * 1000;
  const outcome: TimeoutOutcome = { ourTimeoutFired: false };
  const { signal, disarm } = composeAbortSignals(options.signal, totalMs, outcome);
  const startedAt = Date.now();
  hlog.debug(userId, `generateNonStreaming: dispatching spindle.generate.raw (totalTimeout=${totalMs}ms)`);

  try {
    const request = buildSpindleRequest(req, resolved, userId, signal);
    const result = (await spindle.generate.raw(request)) as { content?: string };
    const content = result?.content ?? "";
    const elapsed = Date.now() - startedAt;
    hlog.debug(
      userId,
      `generateNonStreaming: success contentLen=${content.length} elapsed=${elapsed}ms`
    );
    if (hlog.isFullPayloadEnabled(userId)) {
      hlog.debug(userId, `Generation response: ${safeStringify(result)}`);
    }
    return { content, success: true };
  } catch (err) {
    const elapsed = Date.now() - startedAt;
    if (isAbortError(err)) {
      if (options.signal?.aborted && !outcome.ourTimeoutFired) {
        hlog.debug(userId, `generateNonStreaming: external abort after ${elapsed}ms`);
        return { content: "", success: false, error: "ABORTED", aborted: true };
      }
      const message = pickStallMessage(false, settings);
      hlog.debug(userId, `generateNonStreaming: own timeout fired after ${elapsed}ms -> ${message}`);
      spindle.log.warn(`Generation failed: ${message}`);
      return { content: "", success: false, error: message };
    }
    const message = err instanceof Error ? err.message : String(err);
    hlog.debug(userId, `generateNonStreaming: threw after ${elapsed}ms: ${message}`);
    spindle.log.warn(`Generation failed: ${message}`);
    return { content: "", success: false, error: message };
  } finally {
    disarm();
  }
}

async function generateStreaming(
  req: GenerateRequest,
  resolved: { id: string; model: string | undefined },
  userId: string,
  options: GenerateOptions,
  settings: HoneSettings
): Promise<GenerateResult> {
  const ttftMs = Math.max(1, settings.ttftTimeoutSecs) * 1000;
  const outcome: TimeoutOutcome = { ourTimeoutFired: false };
  const { signal, disarm: disarmTtft } = composeAbortSignals(options.signal, ttftMs, outcome);

  let firstTokenSeen = false;
  let aggregated = "";
  let receivedDone = false;
  let tokenChunks = 0;
  let reasoningChunks = 0;
  let firstTokenElapsed = -1;
  const startedAt = Date.now();

  hlog.debug(userId, `generateStreaming: opening spindle.generate.rawStream (ttftTimeout=${ttftMs}ms)`);

  try {
    const request = buildSpindleRequest(req, resolved, userId, signal);
    const stream = spindle.generate.rawStream(request);
    for await (const chunk of stream) {
      if (chunk.type === "token" || chunk.type === "reasoning") {
        if (!firstTokenSeen) {
          firstTokenSeen = true;
          firstTokenElapsed = Date.now() - startedAt;
          // First token proves the upstream is alive. Disarm TTFT;
          // tail latency is the provider's own timeout problem.
          disarmTtft();
          hlog.debug(
            userId,
            `generateStreaming: first ${chunk.type} chunk after ${firstTokenElapsed}ms, TTFT disarmed`
          );
        }
        if (chunk.type === "token") {
          aggregated += chunk.token;
          tokenChunks++;
        } else {
          reasoningChunks++;
        }
      } else if (chunk.type === "done") {
        receivedDone = true;
        // Prefer the canonical aggregated content from the done chunk;
        // some providers normalize partial-token boundaries on close.
        const beforeLen = aggregated.length;
        aggregated = chunk.content ?? aggregated;
        const totalElapsed = Date.now() - startedAt;
        hlog.debug(
          userId,
          `generateStreaming: done chunk (tokens=${tokenChunks} reasoning=${reasoningChunks} aggregatedLen=${beforeLen} -> ${aggregated.length} ttft=${firstTokenElapsed}ms total=${totalElapsed}ms)`
        );
        if (hlog.isFullPayloadEnabled(userId)) {
          hlog.debug(userId, `Generation stream done: ${safeStringify(chunk)}`);
        }
        return { content: aggregated, success: true };
      }
    }
    const totalElapsed = Date.now() - startedAt;
    if (!receivedDone) {
      hlog.debug(
        userId,
        `generateStreaming: stream ended with no done chunk (tokens=${tokenChunks} reasoning=${reasoningChunks} aggregatedLen=${aggregated.length} elapsed=${totalElapsed}ms)`
      );
      spindle.log.warn(
        `Generation stream ended without a 'done' chunk (got ${aggregated.length} chars)`
      );
      return {
        content: "",
        success: false,
        error: "Stream ended without a completion marker",
      };
    }
    hlog.debug(
      userId,
      `generateStreaming: loop exited cleanly (tokens=${tokenChunks} aggregatedLen=${aggregated.length} elapsed=${totalElapsed}ms)`
    );
    return { content: aggregated, success: true };
  } catch (err) {
    const elapsed = Date.now() - startedAt;
    if (isAbortError(err)) {
      if (options.signal?.aborted && !outcome.ourTimeoutFired) {
        hlog.debug(
          userId,
          `generateStreaming: external abort after ${elapsed}ms (tokens=${tokenChunks} firstTokenSeen=${firstTokenSeen})`
        );
        return { content: "", success: false, error: "ABORTED", aborted: true };
      }
      const message = pickStallMessage(true, settings);
      hlog.debug(
        userId,
        `generateStreaming: TTFT timeout after ${elapsed}ms (tokens=${tokenChunks} firstTokenSeen=${firstTokenSeen}) -> ${message}`
      );
      spindle.log.warn(`Generation failed: ${message}`);
      return { content: "", success: false, error: message };
    }
    const message = err instanceof Error ? err.message : String(err);
    hlog.debug(
      userId,
      `generateStreaming: threw after ${elapsed}ms (tokens=${tokenChunks} firstTokenSeen=${firstTokenSeen}): ${message}`
    );
    spindle.log.warn(`Generation failed: ${message}`);
    return { content: "", success: false, error: message };
  } finally {
    disarmTtft();
  }
}

/** Single LLM call. Routes through `spindle.generate.rawStream` when
 *  `settings.streamGenerations` is true, `spindle.generate.raw` otherwise. */
export async function generate(
  req: GenerateRequest,
  userId: string,
  options: GenerateOptions = {}
): Promise<GenerateResult> {
  const settings = await getSettings(userId);
  const prepared = await prepareRequest(req, userId);
  if (!prepared.ok) {
    hlog.debug(userId, `generate: aborting before dispatch - ${prepared.error}`);
    return { content: "", success: false, error: prepared.error };
  }
  const { resolved, parametersForLog } = prepared.data;

  hlog.debug(
    userId,
    `Generation: connection=${resolved.id}${req.connectionProfileId ? "" : " (default)"}, model=${resolved.model || "none"}, msgs=${req.messages.length}, streaming=${settings.streamGenerations}, params=${JSON.stringify(parametersForLog)}`
  );
  if (hlog.isFullPayloadEnabled(userId)) {
    hlog.debug(userId, `Generation request messages: ${safeStringify(req.messages)}`);
  }

  const result = settings.streamGenerations
    ? await generateStreaming(req, resolved, userId, options, settings)
    : await generateNonStreaming(req, resolved, userId, options, settings);
  hlog.debug(
    userId,
    `generate: done success=${result.success} aborted=${!!result.aborted} contentLen=${result.content.length}${result.error ? ` error="${result.error}"` : ""}`
  );
  return result;
}
