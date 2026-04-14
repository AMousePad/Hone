interface ShieldedBlock {
  placeholder: string;
  original: string;
}

interface ShieldedBlocks {
  masked: string;
  blocks: ShieldedBlock[];
}

const PLACEHOLDER_AT_END = /<HONE-SHIELD-\d+\/>$/;
const SHIELD_FRAGMENT = /<\/?HONE-SHIELD-\d+\/?>|HONE-SHIELD-\d+/;

/** Cap on a single user-supplied pattern string.  */
export const MAX_SHIELD_PATTERN_LENGTH = 10_000;

/** Hard ceiling on matches collected from one pattern. */
const MAX_MATCHES_PER_PATTERN = 10_000;

/** Per-pattern execution warning budget. */
const PATTERN_EXEC_WARN_MS = 500;

export const DEFAULT_SHIELD_INCLUDE_PATTERNS: readonly string[] = [
  "```[\\s\\S]*?```",
  "<([a-zA-Z][\\w:-]*)(\\s[^>]*)?>[\\s\\S]*?</\\1\\s*>",
  "^\\{[^\\n]*\\}$",
  "\\[[^\\]]*\\n[^\\]]*\\]",
];

export const DEFAULT_SHIELD_EXCLUDE_PATTERNS: readonly string[] = [
  "<(font|span|a|b|i|em|strong|u|s|del|ins|mark|sub|sup|small|code|kbd|var|samp|q|cite|abbr|dfn|time)\\b[^>]*>[\\s\\S]*?</\\1\\s*>",
];

function compilePattern(pattern: string): RegExp | null {
  if (pattern.length > MAX_SHIELD_PATTERN_LENGTH) return null;
  try {
    return new RegExp(pattern, "gmi");
  } catch {
    return null;
  }
}

export function validateShieldPattern(pattern: string): string | null {
  if (!pattern) return "pattern is empty";
  if (pattern.length > MAX_SHIELD_PATTERN_LENGTH) {
    return `pattern exceeds ${MAX_SHIELD_PATTERN_LENGTH} characters`;
  }
  try {
    new RegExp(pattern, "gmi");
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

function collectMatchSpans(
  text: string,
  patterns: readonly string[]
): Array<{ start: number; end: number; match: string }> {
  const spans: Array<{ start: number; end: number; match: string }> = [];
  for (const pattern of patterns) {
    const re = compilePattern(pattern);
    if (!re) continue;
    const started = Date.now();
    let matches = 0;
    try {
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        if (m[0].length === 0) {
          re.lastIndex++;
          continue;
        }
        spans.push({ start: m.index, end: m.index + m[0].length, match: m[0] });
        if (++matches >= MAX_MATCHES_PER_PATTERN) {
          console.warn(
            `[Hone] shield pattern hit ${MAX_MATCHES_PER_PATTERN}-match cap, truncating: ${pattern.slice(0, 80)}`
          );
          break;
        }
      }
    } catch (err) {
      console.warn(
        `[Hone] shield pattern threw during exec, skipping: ${pattern.slice(0, 80)}: ${err instanceof Error ? err.message : String(err)}`
      );
      continue;
    }
    const elapsed = Date.now() - started;
    if (elapsed > PATTERN_EXEC_WARN_MS) {
      console.warn(
        `[Hone] shield pattern took ${elapsed}ms (>${PATTERN_EXEC_WARN_MS}ms), possible catastrophic backtracking: ${pattern.slice(0, 80)}`
      );
    }
  }
  return spans;
}

export function maskLiteralBlocks(
  text: string,
  includePatterns: readonly string[] = DEFAULT_SHIELD_INCLUDE_PATTERNS,
  excludePatterns: readonly string[] = DEFAULT_SHIELD_EXCLUDE_PATTERNS
): ShieldedBlocks {
  const excludeSpans = collectMatchSpans(text, excludePatterns);
  const isExcluded = (start: number, end: number): boolean =>
    excludeSpans.some((ex) => ex.start <= start && ex.end >= end);

  // Sort so wider / earlier matches win on overlap.
  const candidates = collectMatchSpans(text, includePatterns)
    .filter((c) => !isExcluded(c.start, c.end))
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const chosen: Array<{ start: number; end: number; match: string }> = [];
  for (const c of candidates) {
    const clash = chosen.some(
      (k) => !(c.end <= k.start || c.start >= k.end)
    );
    if (!clash) chosen.push(c);
  }

  const blocks: ShieldedBlock[] = [];
  let out = "";
  let cursor = 0;
  for (const span of chosen) {
    out += text.slice(cursor, span.start);
    const token = `<HONE-SHIELD-${blocks.length}/>`;
    blocks.push({ placeholder: token, original: span.match });
    out += token;
    cursor = span.end;
  }
  out += text.slice(cursor);

  return { masked: out, blocks };
}

/** Restore shielded blocks. Dropped blocks are appended just before
 *  any trailing shield run so end-of-message scaffolding keeps its
 *  position. Throws if a sentinel fragment remains. */
export function unmaskLiteralBlocks(
  text: string,
  blocks: ShieldedBlock[]
): string {
  if (blocks.length === 0) return text;

  const surviving: ShieldedBlock[] = [];
  const dropped: ShieldedBlock[] = [];
  for (const block of blocks) {
    if (text.includes(block.placeholder)) surviving.push(block);
    else dropped.push(block);
  }

  let result = text;

  if (dropped.length > 0) {
    let insertionPoint = result.length;
    let scanPos = result.length;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      let wsStart = scanPos;
      while (wsStart > 0 && /\s/.test(result[wsStart - 1])) wsStart--;
      if (wsStart === 0) break;
      const match = result.slice(0, wsStart).match(PLACEHOLDER_AT_END);
      if (!match) break;
      insertionPoint = wsStart - match[0].length;
      scanPos = insertionPoint;
    }

    const droppedContent = dropped.map((b) => b.original).join("\n\n");
    const before = result.slice(0, insertionPoint);
    const after = result.slice(insertionPoint);
    const sepBefore = before.length === 0 || before.endsWith("\n\n")
      ? ""
      : before.endsWith("\n") ? "\n" : "\n\n";
    const sepAfter = after.length === 0 || after.startsWith("\n\n")
      ? ""
      : after.startsWith("\n") ? "\n" : "\n\n";
    result = before + sepBefore + droppedContent + sepAfter + after;
  }

  for (const block of surviving) {
    result = result.split(block.placeholder).join(block.original);
  }

  if (SHIELD_FRAGMENT.test(result)) {
    throw new Error(
      "Shield sentinel mangled in LLM output: a HONE-SHIELD token was partially modified"
    );
  }

  return result;
}

/** Placeholder -> original swap for intermediate artifacts (stage
 *  records, previews). No drop-recovery, no fail-loud. */
export function substituteShields(
  text: string,
  blocks: ShieldedBlock[]
): string {
  if (blocks.length === 0) return text;
  let result = text;
  for (const block of blocks) {
    if (result.includes(block.placeholder)) {
      result = result.split(block.placeholder).join(block.original);
    }
  }
  return result;
}

/** Strip `<think>` / `<thinking>` / `<reasoning>` wrapper tags from
 *  LLM output. Handles both closed and unclosed tags. */
const COT_WRAPPERS = ["think", "thinking", "reasoning"];

export function removeCoTTags(text: string): string {
  const alternation = COT_WRAPPERS.join("|");
  const closed = new RegExp(`\\s*<(${alternation})>[\\s\\S]*?<\\/\\1>\\s*`, "gi");
  const unclosed = new RegExp(`\\s*<(${alternation})>[\\s\\S]*$`, "i");
  return text.replace(closed, "").replace(unclosed, "").trim();
}

export interface TaggedBlockResult {
  content: string;
  unclosed: boolean;
}

/** Extract a `<TAG>...</TAG>` block from LLM output with recovery. */
export function parseTaggedBlock(
  raw: string,
  tag: string = "HONE-OUTPUT"
): TaggedBlockResult | null {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const start = raw.indexOf(open);
  if (start === -1) return null;
  const contentStart = start + open.length;
  const end = raw.indexOf(close, contentStart);
  if (end === -1) {
    return { content: raw.slice(contentStart).trim(), unclosed: true };
  }
  return { content: raw.slice(contentStart, end).trim(), unclosed: false };
}

/** Failure reasons for `extractRefinedContent` */
export type RefinedExtractionFailure =
  /** No <HONE-NOTES>, </HONE-NOTES>, <HONE-OUTPUT>, or </HONE-OUTPUT> tags anywhere. */
  | "no_tags"
  /** Orphan tags with no recoverable pairing */
  | "malformed_partial"
  /** A well-formed <HONE-NOTES>...</HONE-NOTES> block exists but stripping
   *  it leaves nothing */
  | "notes_only";

export type RefinedExtraction =
  | { ok: true; content: string; recoveries: string[] }
  | { ok: false; reason: RefinedExtractionFailure; message: string };

const NOTES_OPEN = "<HONE-NOTES>";
const NOTES_CLOSE = "</HONE-NOTES>";
const OUTPUT_OPEN = "<HONE-OUTPUT>";
const OUTPUT_CLOSE = "</HONE-OUTPUT>";

/** Extract the refined message from an LLM response. Handles every
 *  recoverable malformed-tag pattern */
export function extractRefinedContent(raw: string): RefinedExtraction {
  if (raw.includes(OUTPUT_OPEN)) {
    const parsed = parseTaggedBlock(raw);
    if (!parsed) {
      return {
        ok: false,
        reason: "no_tags",
        message: "The LLM response was empty or unparseable even though <HONE-OUTPUT> was detected. Hone will not apply it.",
      };
    }
    const recoveries: string[] = [];
    if (parsed.unclosed) {
      recoveries.push(
        "<HONE-OUTPUT> opened but </HONE-OUTPUT> missing. Taking everything after <HONE-OUTPUT> as output (likely truncated or the model forgot the closing tag)"
      );
    }
    if (!parsed.content) {
      return {
        ok: false,
        reason: "notes_only",
        message: "The LLM opened <HONE-OUTPUT> but wrote nothing inside it. Hone will not apply an empty refinement.",
      };
    }
    return { ok: true, content: parsed.content, recoveries };
  }

  if (raw.includes(OUTPUT_CLOSE)) {
    return {
      ok: false,
      reason: "malformed_partial",
      message: "The LLM wrote </HONE-OUTPUT> without an opening <HONE-OUTPUT> tag, so Hone can't tell what the refined content was meant to be. Try again or switch to the non-Lite preset.",
    };
  }

  const recoveries: string[] = [];
  let text = raw;

  const hasNotesOpen = text.includes(NOTES_OPEN);
  const hasNotesClose = text.includes(NOTES_CLOSE);

  if (hasNotesClose && !hasNotesOpen) {
    text = NOTES_OPEN + text;
    recoveries.push(
      "</HONE-NOTES> found without a matching <HONE-NOTES> opener. Prepended <HONE-NOTES> so the notes block can be stripped"
    );
  } else if (hasNotesOpen && !hasNotesClose) {
    return {
      ok: false,
      reason: "malformed_partial",
      message: "The LLM opened a <HONE-NOTES> block but never closed it, and didn't write <HONE-OUTPUT>. Hone can't tell where notes end and refined content begins. Try again or switch to the non-Lite preset.",
    };
  }

  const notesStart = text.indexOf(NOTES_OPEN);
  const notesEnd = notesStart !== -1
    ? text.indexOf(NOTES_CLOSE, notesStart + NOTES_OPEN.length)
    : -1;
  if (notesStart !== -1 && notesEnd !== -1) {
    text = (
      text.slice(0, notesStart) + text.slice(notesEnd + NOTES_CLOSE.length)
    ).trim();
    if (recoveries.length === 0) {
      recoveries.push("stripped <HONE-NOTES>...</HONE-NOTES> block");
    } else {
      recoveries.push("stripped the recovered <HONE-NOTES>...</HONE-NOTES> block");
    }
    if (!text) {
      return {
        ok: false,
        reason: "notes_only",
        message: "The LLM only produced a <HONE-NOTES> changelog. There was no refined content after stripping it. Try again or switch to the non-Lite preset.",
      };
    }
    recoveries.push("no <HONE-OUTPUT> tag found; using the notes-stripped response as output");
    return { ok: true, content: text, recoveries };
  }

  return {
    ok: false,
    reason: "no_tags",
    message: "The LLM did not output any <HONE-NOTES> or <HONE-OUTPUT> tags at all. Hone can't be confident the response is a valid refinement. Try again or switch to the non-Lite preset.",
  };
}
