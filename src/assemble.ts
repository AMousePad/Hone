declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

import type {
  Stage,
  Pipeline,
  Prompt,
  MessageRow,
  MessageRole,
} from "./types";
import { HEAD_COLLECTION_ID } from "./constants";
import * as hlog from "./hlog";

/**
 * Assemble a Stage into the `messages: [{role, content}]` array that
 * goes to `spindle.generate.raw`. Same function used by live
 * refinement and the preview path.
 *
 * Two-phase macro substitution:
 *
 *  1. Local pass (synchronous): Hone-specific macros
 *     `{{message}}`, `{{original}}`, `{{latest}}`, `{{context}}`,
 *     `{{lore}}`, `{{pov}}`, `{{userMessage}}`, `{{stage_name}}`,
 *     `{{stage_index}}`, `{{total_stages}}`,
 *     `{{shield_preservation_note}}`, and aggregator-only
 *     `{{proposal_N}}` / `{{proposals}}` / `{{proposal_count}}`.
 *  2. Lumiverse pass (`spindle.macros.resolve`): every remaining
 *     `{{macro}}`: character fields, persona, chat context,
 *     variables, time/date, random. Diagnostics propagate to the
 *     caller so the preview modal can surface unresolved macros.
 *
 * Adjacent same-role rows merge with `\n\n` after phase 2. Empty
 * rows drop entirely.
 */

/** Runtime context for a single stage assembly. See HonePreset /
 *  the preset-panel macro reference for the user-facing description
 *  of each macro. */
export interface AssembleContext {
  /** `{{message}}` / `{{original}}`: pre-refinement text. Output:
   *  AI message's original content. Input: user's draft. */
  original: string;
  /** `{{latest}}`. Output: previous stage's refined output (stage 0
   *  = original AI). Input: most recent AI message in chat, static. */
  latest: string;
  /** `{{context}}`: chat history, token-budgeted, last AI message
   *  excluded. No character/POV/persona/lore bundling. */
  context: string;
  /** `{{lore}}`: activated lorebook entries. */
  lore: string;
  /** `{{pov}}`: resolved POV instruction string. */
  pov: string;
  /** `{{userMessage}}`: draft during input refinement; empty for output. */
  userMessage: string;
  stageName: string;
  /** 1-indexed. */
  stageIndex: number;
  totalStages: number;
  /** Aggregator proposal outputs. `{{proposal_N}}` is 1-indexed;
   *  `{{proposals}}` builds `[PROPOSAL N]...[/PROPOSAL N]` blocks. */
  proposals?: string[];
  /** `{{shield_preservation_note}}`: instruction listing the exact
   *  sentinel tokens currently shielding scaffolding in the input.
   *  Empty string when no blocks are shielded. */
  shieldPreservationNote?: string;
  /** Chat id for Lumiverse macro resolution. When present, `{{char}}`,
   *  `{{description}}`, etc. resolve against the real chat. */
  chatId?: string;
  characterId?: string;
  /** Required when passing through `spindle.macros.resolve` so
   *  per-user character/persona lookups work. */
  userId?: string;
}

export interface AssembleResult {
  messages: Array<{ role: MessageRole; content: string }>;
  diagnostics: Array<{ message: string }>;
  /** Count of adjacent same-role rows that collapsed into a single
   *  message. UI already warns at edit time; this is for logging. */
  merges: number;
}

/** Single regex pass, replacing `{{name}}` with `vars[name]`. Unknown
 *  names are left in place so the Lumiverse pass handles them.
 *  Argument macros (`{{foo::arg}}`) are not matched here. */
function substituteLocalVars(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => {
    if (name in vars) return vars[name];
    return match;
  });
}

/** Build `{{proposal_N}}` / `{{proposals}}` / `{{proposal_count}}`
 *  bindings. Always defined (with empty values) even when proposals
 *  is undefined, so a non-parallel aggregator referencing them gets
 *  empty strings instead of raw macro text leaking through. */
function buildProposalVars(proposals?: string[]): Record<string, string> {
  const vars: Record<string, string> = {};
  const list = proposals || [];
  vars.proposal_count = String(list.length);
  if (list.length === 0) {
    vars.proposals = "";
  } else {
    vars.proposals = list
      .map((p, i) => `[PROPOSAL ${i + 1}]\n${p}\n[/PROPOSAL ${i + 1}]`)
      .join("\n\n");
  }
  for (let i = 0; i < list.length; i++) {
    vars[`proposal_${i + 1}`] = list[i];
  }
  return vars;
}

/** Expand `HEAD_COLLECTION_ID` sentinels in-place. Self-refs are
 *  impossible (normalizePreset rejects them). */
function expandHeadRefs(promptIds: readonly string[], headCollection: readonly string[]): string[] {
  const out: string[] = [];
  for (const id of promptIds) {
    if (id === HEAD_COLLECTION_ID) {
      for (const headId of headCollection) out.push(headId);
    } else {
      out.push(id);
    }
  }
  return out;
}

/** Concatenate a row's prompts with `\n\n` between chunks. Missing
 *  prompts drop silently. */
function concatRowPrompts(
  row: MessageRow,
  promptIndex: Map<string, Prompt>,
  headCollection: readonly string[]
): string {
  const parts: string[] = [];
  for (const id of expandHeadRefs(row.promptIds, headCollection)) {
    const p = promptIndex.get(id);
    if (p && p.content) parts.push(p.content);
  }
  return parts.join("\n\n");
}

/** Collapse adjacent same-role rows. Runs after both substitution
 *  phases so the merge sees the final resolved text. */
function mergeAdjacentSameRole(
  items: Array<{ role: MessageRole; content: string }>
): { messages: Array<{ role: MessageRole; content: string }>; merges: number } {
  const out: Array<{ role: MessageRole; content: string }> = [];
  let merges = 0;
  for (const item of items) {
    if (!item.content) continue;
    const last = out[out.length - 1];
    if (last && last.role === item.role) {
      last.content = `${last.content}\n\n${item.content}`;
      merges++;
    } else {
      out.push({ ...item });
    }
  }
  return { messages: out, merges };
}

/** Assemble one stage into a ready-to-send messages array.
 *
 *  `headCollection` is the preset's ordered prompt-id list that
 *  `HEAD_COLLECTION_ID` expands to. Pass `[]` for presets without one. */
export async function assembleStage(
  stage: Stage,
  prompts: Prompt[],
  headCollection: readonly string[],
  ctx: AssembleContext
): Promise<AssembleResult> {
  const uid = ctx.userId || "?";
  hlog.debug(uid, `assembleStage: start stage="${stage.name}" (${ctx.stageIndex}/${ctx.totalStages}) rows=${stage.rows.length} prompts=${prompts.length} headCollection=${headCollection.length} chatId=${ctx.chatId?.slice(0, 8) || "none"}`);

  const promptIndex = new Map<string, Prompt>();
  for (const p of prompts) promptIndex.set(p.id, p);

  const localVars: Record<string, string> = {
    message: ctx.original,
    original: ctx.original,
    latest: ctx.latest,
    userMessage: ctx.userMessage,
    context: ctx.context,
    lore: ctx.lore,
    pov: ctx.pov,
    stage_name: stage.name,
    stage_index: String(ctx.stageIndex),
    total_stages: String(ctx.totalStages),
    shield_preservation_note: ctx.shieldPreservationNote || "",
    ...buildProposalVars(ctx.proposals),
  };

  hlog.debug(uid, `assembleStage: localVars keys=[${Object.keys(localVars).join(",")}] originalLen=${ctx.original.length} latestLen=${ctx.latest.length} userMessageLen=${ctx.userMessage.length} contextLen=${ctx.context.length} povLen=${ctx.pov.length} proposals=${ctx.proposals?.length ?? 0}`);

  // Phase 1: concat prompts per row, substitute local vars.
  const phase1: Array<{ role: MessageRole; content: string }> = [];
  for (let ri = 0; ri < stage.rows.length; ri++) {
    const row = stage.rows[ri];
    const raw = concatRowPrompts(row, promptIndex, headCollection);
    if (!raw) {
      hlog.debug(uid, `assembleStage: phase1 row ${ri} role=${row.role}: empty after concat (promptIds=[${row.promptIds.join(",")}]), skipped`);
      continue;
    }
    const missingIds = expandHeadRefs(row.promptIds, headCollection).filter(
      (id) => !promptIndex.has(id)
    );
    if (missingIds.length > 0) {
      hlog.debug(uid, `assembleStage: phase1 row ${ri} role=${row.role}: missing promptIds=[${missingIds.join(",")}] (dropped)`);
    }
    const substituted = substituteLocalVars(raw, localVars);
    hlog.debug(uid, `assembleStage: phase1 row ${ri} role=${row.role} rawLen=${raw.length} substitutedLen=${substituted.length}`);
    phase1.push({ role: row.role, content: substituted });
  }

  hlog.debug(uid, `assembleStage: phase1 complete: ${phase1.length} non-empty rows from ${stage.rows.length} total`);

  // Phase 2: Lumiverse macro resolution.
  const diagnostics: Array<{ message: string }> = [];
  const phase2: Array<{ role: MessageRole; content: string }> = [];
  for (let pi = 0; pi < phase1.length; pi++) {
    const item = phase1[pi];
    if (!/\{\{[^}]+\}\}/.test(item.content)) {
      hlog.debug(uid, `assembleStage: phase2 row ${pi} role=${item.role}: no remaining macros, passthrough`);
      phase2.push(item);
      continue;
    }
    hlog.debug(uid, `assembleStage: phase2 row ${pi} role=${item.role}: calling spindle.macros.resolve (chatId=${ctx.chatId?.slice(0, 8) || "none"}, charId=${ctx.characterId?.slice(0, 8) || "none"})`);
    try {
      const resolved = await spindle.macros.resolve(item.content, {
        chatId: ctx.chatId,
        characterId: ctx.characterId,
        userId: ctx.userId,
      });
      hlog.debug(uid, `assembleStage: phase2 row ${pi} resolved: inputLen=${item.content.length} outputLen=${resolved.text.length} diagnostics=${resolved.diagnostics?.length ?? 0}`);
      phase2.push({ role: item.role, content: resolved.text });
      if (resolved.diagnostics && resolved.diagnostics.length > 0) {
        for (const d of resolved.diagnostics) {
          diagnostics.push({ message: d.message });
          hlog.debug(uid, `assembleStage: phase2 row ${pi} macro diagnostic: ${d.message}`);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      spindle.log.warn(
        `[Hone] macro resolution failed for row (role=${item.role}): ${message}`
      );
      hlog.debug(uid, `assembleStage: phase2 row ${pi} macro resolve FAILED: ${message}; falling back to phase1 text`);
      diagnostics.push({
        message: `Macro resolution failed: ${message}`,
      });
      phase2.push(item);
    }
  }

  // Phase 3: merge adjacent same-role rows.
  const { messages, merges } = mergeAdjacentSameRole(phase2);

  hlog.debug(uid, `assembleStage: complete stage="${stage.name}": ${messages.length} messages, ${merges} merges, ${diagnostics.length} diagnostics, roles=[${messages.map((m) => m.role).join(",")}]`);

  return { messages, diagnostics, merges };
}

/** Pure / synchronous merge detector for the UI to flag rows that
 *  would collapse at assembly time. Empty rows are ignored; they
 *  drop before merging. */
export function detectAdjacentSameRoleMerges(pipeline: Pipeline): Array<{
  stageIndex: number;
  rowIndex: number;
  role: MessageRole;
}> {
  const hits: Array<{ stageIndex: number; rowIndex: number; role: MessageRole }> = [];
  for (let s = 0; s < pipeline.stages.length; s++) {
    const stage = pipeline.stages[s];
    for (let r = 1; r < stage.rows.length; r++) {
      const prev = stage.rows[r - 1];
      const cur = stage.rows[r];
      if (prev.promptIds.length === 0 || cur.promptIds.length === 0) continue;
      if (prev.role === cur.role) {
        hits.push({ stageIndex: s, rowIndex: r, role: cur.role });
      }
    }
  }
  return hits;
}
