declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

import type {
  GenerationRequestDTO,
} from "lumiverse-spindle-types";
import type { GenerateRequest, GenerateResult, GenerationParams, HoneSettings } from "../types";
import { getSettings } from "../storage/settings";
import { isAbortError } from "./cancel";
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

/** Resolve a connection profile id to `{id, model}`, falling back to
 *  the user's `is_default` profile (or the first connection) when the
 *  id is empty. */
async function resolveConnection(
  connectionProfileId: string,
  userId: string
): Promise<{ id: string; model: string | undefined } | null> {
  try {
    if (connectionProfileId) {
      const conn = await spindle.connections.get(connectionProfileId, userId);
      if (!conn) return null;
      return { id: conn.id, model: conn.model || undefined };
    }
    const conns = await spindle.connections.list(userId);
    if (!conns || conns.length === 0) return null;
    const conn = conns.find((c) => c.is_default) || conns[0];
    return { id: conn.id, model: conn.model || undefined };
  } catch (err) {
    spindle.log.warn(`resolveConnection failed: ${err instanceof Error ? err.message : err}`);
    return null;
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
  const resolved = await resolveConnection(req.connectionProfileId, userId);
  if (!resolved) {
    const reason = req.connectionProfileId
      ? `Connection profile "${req.connectionProfileId}" not found`
      : "No connection profiles configured. Set a default in Lumiverse Settings -> Connections";
    spindle.log.warn(`Generation failed: ${reason}`);
    return { ok: false, error: reason };
  }
  const parametersForLog: Record<string, unknown> = { ...req.parameters };
  if (resolved.model) parametersForLog.model = resolved.model;
  return { ok: true, data: { resolved, parametersForLog } };
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

  try {
    const request = buildSpindleRequest(req, resolved, userId, signal);
    const result = (await spindle.generate.raw(request)) as { content?: string };
    const content = result?.content ?? "";
    if (hlog.isFullPayloadEnabled(userId)) {
      hlog.debug(userId, `Generation response: ${safeStringify(result)}`);
    }
    return { content, success: true };
  } catch (err) {
    if (isAbortError(err)) {
      if (options.signal?.aborted && !outcome.ourTimeoutFired) {
        return { content: "", success: false, error: "ABORTED", aborted: true };
      }
      const message = pickStallMessage(false, settings);
      spindle.log.warn(`Generation failed: ${message}`);
      return { content: "", success: false, error: message };
    }
    const message = err instanceof Error ? err.message : String(err);
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

  try {
    const request = buildSpindleRequest(req, resolved, userId, signal);
    const stream = spindle.generate.rawStream(request);
    for await (const chunk of stream) {
      if (chunk.type === "token" || chunk.type === "reasoning") {
        if (!firstTokenSeen) {
          firstTokenSeen = true;
          // First token proves the upstream is alive. Disarm TTFT;
          // tail latency is the provider's own timeout problem.
          disarmTtft();
        }
        if (chunk.type === "token") aggregated += chunk.token;
      } else if (chunk.type === "done") {
        receivedDone = true;
        // Prefer the canonical aggregated content from the done chunk;
        // some providers normalize partial-token boundaries on close.
        aggregated = chunk.content ?? aggregated;
        if (hlog.isFullPayloadEnabled(userId)) {
          hlog.debug(userId, `Generation stream done: ${safeStringify(chunk)}`);
        }
        return { content: aggregated, success: true };
      }
    }
    if (!receivedDone) {
      spindle.log.warn(
        `Generation stream ended without a 'done' chunk (got ${aggregated.length} chars)`
      );
      return {
        content: "",
        success: false,
        error: "Stream ended without a completion marker",
      };
    }
    return { content: aggregated, success: true };
  } catch (err) {
    if (isAbortError(err)) {
      if (options.signal?.aborted && !outcome.ourTimeoutFired) {
        return { content: "", success: false, error: "ABORTED", aborted: true };
      }
      const message = pickStallMessage(true, settings);
      spindle.log.warn(`Generation failed: ${message}`);
      return { content: "", success: false, error: message };
    }
    const message = err instanceof Error ? err.message : String(err);
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
  if (!prepared.ok) return { content: "", success: false, error: prepared.error };
  const { resolved, parametersForLog } = prepared.data;

  hlog.debug(
    userId,
    `Generation: connection=${resolved.id}${req.connectionProfileId ? "" : " (default)"}, model=${resolved.model || "none"}, msgs=${req.messages.length}, streaming=${settings.streamGenerations}, params=${JSON.stringify(parametersForLog)}`
  );
  if (hlog.isFullPayloadEnabled(userId)) {
    hlog.debug(userId, `Generation request messages: ${safeStringify(req.messages)}`);
  }

  return settings.streamGenerations
    ? generateStreaming(req, resolved, userId, options, settings)
    : generateNonStreaming(req, resolved, userId, options, settings);
}
