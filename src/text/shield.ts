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

export const MAX_SHIELD_PATTERN_LENGTH = 10_000;
const MAX_MATCHES_PER_PATTERN = 10_000;
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

  const candidates = collectMatchSpans(text, includePatterns)
    .filter((c) => !isExcluded(c.start, c.end))
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const chosen: Array<{ start: number; end: number; match: string }> = [];
  for (const c of candidates) {
    const clash = chosen.some((k) => !(c.end <= k.start || c.start >= k.end));
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

export function unmaskLiteralBlocks(text: string, blocks: ShieldedBlock[]): string {
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
    throw new Error("Shield sentinel mangled in LLM output: a HONE-SHIELD token was partially modified");
  }

  return result;
}

export function substituteShields(text: string, blocks: ShieldedBlock[]): string {
  if (blocks.length === 0) return text;
  let result = text;
  for (const block of blocks) {
    if (result.includes(block.placeholder)) {
      result = result.split(block.placeholder).join(block.original);
    }
  }
  return result;
}

export type { ShieldedBlock };
