declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

import type { GenerateRequest, GenerateResult, GenerationParams } from "./types";
import * as hlog from "./hlog";

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
  if (params.repetitionPenalty !== null) result.repetition_penalty = params.repetitionPenalty;
  return Object.keys(result).length > 0 ? result : undefined;
}

/** Resolve a connection profile id to `{id, model}`, falling back to
 *  the user's `is_default` profile (or the first connection) when the
 *  id is empty. Returns null when no connections exist or the
 *  requested id is missing. The caller must fail loudly; an
 *  underspecified request to `generate.raw` is rejected as
 *  "Unknown provider:". */
async function resolveConnection(
  connectionProfileId: string,
  userId: string
): Promise<{ id: string; model: string | undefined } | null> {
  try {
    if (connectionProfileId) {
      // Direct get() instead of list+filter to avoid the pagination
      // trap in characters.list (default limit 50).
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

/** Single LLM call. Takes the messages array built by `assembleStage`
 *  and forwards it to `spindle.generate.raw`. */
export async function generate(req: GenerateRequest, userId: string): Promise<GenerateResult> {
  try {
    const timeoutMs = req.timeoutSeconds * 1000;
    const resolved = await resolveConnection(req.connectionProfileId, userId);
    if (!resolved) {
      const reason = req.connectionProfileId
        ? `Connection profile "${req.connectionProfileId}" not found`
        : "No connection profiles configured. Set a default in Lumiverse Settings -> Connections";
      spindle.log.warn(`Generation failed: ${reason}`);
      return { content: "", success: false, error: reason };
    }

    const parameters: Record<string, unknown> = { ...req.parameters };
    if (resolved.model) parameters.model = resolved.model;

    hlog.debug(
      userId,
      `Generation: connection=${resolved.id}${req.connectionProfileId ? "" : " (default)"}, model=${resolved.model || "none"}, msgs=${req.messages.length}, params=${JSON.stringify(parameters)}`
    );
    if (hlog.isFullPayloadEnabled(userId)) {
      hlog.debug(userId, `Generation request messages: ${safeStringify(req.messages)}`);
    }

    const result = await Promise.race([
      spindle.generate.raw({
        type: "raw",
        messages: req.messages,
        connection_id: resolved.id,
        model: resolved.model,
        parameters,
        userId,
      } as any) as Promise<{ content?: string }>,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Generation timed out")), timeoutMs)
      ),
    ]);

    if (hlog.isFullPayloadEnabled(userId)) {
      hlog.debug(userId, `Generation response: ${safeStringify(result)}`);
    }

    return { content: result.content ?? "", success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    spindle.log.warn(`Generation failed: ${message}`);
    return { content: "", success: false, error: message };
  }
}

/** Concurrent batch path (used by parallel strategy). Each request
 *  carries its own connection profile; resolved independently so
 *  per-stage connection overrides propagate. */
export async function generateBatch(
  requests: GenerateRequest[],
  userId: string
): Promise<GenerateResult[]> {
  if (requests.length === 0) return [];

  const resolvedList = await Promise.all(
    requests.map((r) => resolveConnection(r.connectionProfileId, userId))
  );

  const settled = await Promise.allSettled(
    requests.map((req, i) => {
      const resolved = resolvedList[i];
      if (!resolved) {
        const reason = req.connectionProfileId
          ? `Connection profile "${req.connectionProfileId}" not found`
          : "No connection profiles configured";
        return Promise.reject(new Error(reason));
      }
      const parameters: Record<string, unknown> = { ...req.parameters };
      if (resolved.model) parameters.model = resolved.model;
      hlog.debug(
        userId,
        `GenerationBatch[${i}]: connection=${resolved.id}, model=${resolved.model || "none"}, msgs=${req.messages.length}, params=${safeStringify(parameters)}`
      );
      if (hlog.isFullPayloadEnabled(userId)) {
        hlog.debug(userId, `GenerationBatch[${i}] request messages: ${safeStringify(req.messages)}`);
      }
      return spindle.generate.raw({
        type: "raw",
        messages: req.messages,
        connection_id: resolved.id,
        model: resolved.model,
        parameters,
        userId,
      } as any) as Promise<{ content?: string }>;
    })
  );

  return settled.map((outcome, i) => {
    if (outcome.status === "fulfilled") {
      if (hlog.isFullPayloadEnabled(userId)) {
        hlog.debug(userId, `GenerationBatch[${i}] response: ${safeStringify(outcome.value)}`);
      }
      return { content: outcome.value.content ?? "", success: true };
    }
    const message =
      outcome.reason instanceof Error
        ? outcome.reason.message
        : String(outcome.reason);
    if (hlog.isFullPayloadEnabled(userId)) {
      hlog.debug(userId, `GenerationBatch[${i}] rejected: ${message}`);
    }
    return { content: "", success: false, error: message };
  });
}
