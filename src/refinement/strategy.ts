import type { HonePreset, Pipeline, StageRecord, GenerateRequest } from "../types";
import type { HoneSettings } from "../types";
import type { ResolvedModel } from "./model-resolver";
import { resolveProfile, injectReasoningParams } from "./model-resolver";
import { assembleStage, type AssembleContext } from "../assemble";
import { generate } from "../generation";
import { makeAbortError } from "../generation/cancel";
import { removeCoTTags, extractRefinedContent } from "../text/extract";
import * as hlog from "../hlog";

declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

export interface RunStrategyInput {
  preset: HonePreset;
  settings: HoneSettings;
  model: ResolvedModel;
  context: string;
  latest: string;
  messageText: string;
  userMessage: string;
  loreBlock: string;
  pov: string;
  chatId: string;
  characterId?: string;
  userId: string;
  shieldPreservationNote?: string;
  onStageComplete?: (record: StageRecord) => void;
  signal?: AbortSignal;
}

export interface RunStrategyResult {
  refinedText: string;
  stages: StageRecord[];
  strategy: string;
}

async function runPipeline(
  pipeline: Pipeline,
  input: RunStrategyInput,
  initialLatest: string,
  proposals: string[] | undefined,
  emitStages: boolean
): Promise<{ finalText: string; stages: StageRecord[] }> {
  const results: StageRecord[] = [];
  let latest = initialLatest;

  for (let i = 0; i < pipeline.stages.length; i++) {
    const stage = pipeline.stages[i];
    const assemblyCtx: AssembleContext = {
      original: input.messageText,
      latest,
      userMessage: input.userMessage,
      context: input.context,
      lore: input.loreBlock,
      pov: input.pov,
      stageName: stage.name,
      stageIndex: i + 1,
      totalStages: pipeline.stages.length,
      proposals,
      chatId: input.chatId,
      characterId: input.characterId,
      userId: input.userId,
      shieldPreservationNote: input.shieldPreservationNote,
    };

    const assembled = await assembleStage(stage, input.preset.prompts, input.preset.headCollection, assemblyCtx);

    const stageModel = stage.modelProfileId
      ? await resolveProfile(stage.modelProfileId, input.userId)
      : input.model;

    const req: GenerateRequest = {
      messages: assembled.messages,
      connectionProfileId: stageModel.connectionProfileId,
      parameters: injectReasoningParams(stageModel.parameters, stageModel.reasoning),
    };

    hlog.debug(
      input.userId,
      `runPipeline stage ${i + 1}/${pipeline.stages.length} "${stage.name}" msgs=${assembled.messages.length} merges=${assembled.merges} emit=${emitStages} stageProfile="${stage.modelProfileId || "(inherit)"}"`
    );

    const result = await generate(req, input.userId, { signal: input.signal });
    if (!result.success) {
      if (result.aborted) {
        hlog.debug(input.userId, `runPipeline stage ${i + 1} "${stage.name}": aborted, propagating`);
        throw makeAbortError(result.error || "ABORTED");
      }
      hlog.debug(
        input.userId,
        `runPipeline stage ${i + 1} "${stage.name}": generate failed: ${result.error || "(no error)"}`
      );
      throw new Error(result.error || `Stage "${stage.name}" failed`);
    }

    const stripCoT = stageModel.reasoning.stripCoTTags;
    const rawContent = stripCoT ? removeCoTTags(result.content) : result.content;
    if (stripCoT && rawContent.length !== result.content.length) {
      hlog.debug(
        input.userId,
        `runPipeline stage ${i + 1} "${stage.name}": stripped CoT tags ${result.content.length} -> ${rawContent.length}`
      );
    }
    const extracted = extractRefinedContent(rawContent);
    if (!extracted.ok) {
      hlog.debug(
        input.userId,
        `stage "${stage.name}": output-format failure "${extracted.reason}": ${extracted.message}`
      );
      throw new Error(extracted.message);
    }
    for (const r of extracted.recoveries) hlog.debug(input.userId, `stage "${stage.name}": ${r}`);
    hlog.debug(
      input.userId,
      `runPipeline stage ${i + 1} "${stage.name}": extracted content len=${extracted.content.length} (raw=${rawContent.length})`
    );
    latest = extracted.content;

    if (emitStages) {
      const record: StageRecord = { index: i, name: stage.name, text: latest, kind: "step" };
      results.push(record);
      input.onStageComplete?.(record);
    }
  }

  return { finalText: latest, stages: results };
}

async function runParallel(input: RunStrategyInput): Promise<RunStrategyResult> {
  const parallel = input.preset.parallel;
  if (!parallel || parallel.proposals.length === 0) {
    throw new Error("Parallel preset has no proposals configured");
  }

  hlog.debug(
    input.userId,
    `runParallel starting: ${parallel.proposals.length} proposals, aggregator with ${parallel.aggregator.stages.length} stages`
  );

  const proposalSettled = await Promise.allSettled(
    parallel.proposals.map((p, i) => {
      hlog.debug(input.userId, `runParallel: dispatching proposal ${i + 1}`);
      return runPipeline(p, input, input.latest, undefined, false);
    })
  );

  if (input.signal?.aborted) {
    throw makeAbortError("ABORTED");
  }

  const proposalOutputs: string[] = [];
  const proposalRecords: StageRecord[] = [];
  for (let i = 0; i < proposalSettled.length; i++) {
    const outcome = proposalSettled[i];
    if (outcome.status === "fulfilled") {
      proposalOutputs.push(outcome.value.finalText);
      const proposalPipeline = parallel.proposals[i];
      const lastStage = proposalPipeline.stages[proposalPipeline.stages.length - 1];
      const record: StageRecord = {
        index: i,
        name: lastStage ? lastStage.name : `Proposal ${i + 1}`,
        text: outcome.value.finalText,
        kind: "proposal",
      };
      proposalRecords.push(record);
      input.onStageComplete?.(record);
      hlog.debug(input.userId, `runParallel: proposal ${i + 1} succeeded`);
    } else {
      const reason = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
      spindle.log.warn(`[Hone] parallel proposal ${i + 1} failed: ${reason}`);
      hlog.debug(input.userId, `runParallel: proposal ${i + 1} failed: ${reason}`);
    }
  }

  if (proposalOutputs.length === 0) throw new Error("All parallel proposals failed");

  const aggregatorRun = await runPipeline(parallel.aggregator, input, input.latest, proposalOutputs, true);

  return {
    refinedText: aggregatorRun.finalText,
    stages: [...proposalRecords, ...aggregatorRun.stages],
    strategy: "parallel",
  };
}

export async function runStrategy(input: RunStrategyInput): Promise<RunStrategyResult> {
  const startedAt = Date.now();
  hlog.debug(
    input.userId,
    `runStrategy: preset="${input.preset.name}" strategy=${input.preset.strategy} messageLen=${input.messageText.length} latestLen=${input.latest.length} contextLen=${input.context.length} loreLen=${input.loreBlock.length} povLen=${input.pov.length}`
  );
  if (input.preset.strategy === "parallel") {
    const out = await runParallel(input);
    hlog.debug(
      input.userId,
      `runStrategy: parallel complete: finalLen=${out.refinedText.length} stages=${out.stages.length} elapsed=${Date.now() - startedAt}ms`
    );
    return out;
  }
  if (!input.preset.pipeline) {
    hlog.debug(input.userId, `runStrategy: preset "${input.preset.id}" has strategy=pipeline but no pipeline configured`);
    throw new Error(`Preset "${input.preset.id}" has strategy=pipeline but no pipeline configured`);
  }
  hlog.debug(input.userId, `runStrategy: executing pipeline with ${input.preset.pipeline.stages.length} stages`);
  const run = await runPipeline(input.preset.pipeline, input, input.latest, undefined, true);
  hlog.debug(
    input.userId,
    `runStrategy: pipeline complete: finalLen=${run.finalText.length} stages=${run.stages.length} elapsed=${Date.now() - startedAt}ms`
  );
  return { refinedText: run.finalText, stages: run.stages, strategy: "pipeline" };
}
