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

export function parseTaggedBlock(raw: string, tag: string = "HONE-OUTPUT"): TaggedBlockResult | null {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const start = raw.indexOf(open);
  if (start === -1) return null;
  const contentStart = start + open.length;
  const end = raw.indexOf(close, contentStart);
  if (end === -1) return { content: raw.slice(contentStart).trim(), unclosed: true };
  return { content: raw.slice(contentStart, end).trim(), unclosed: false };
}

export type RefinedExtractionFailure = "no_tags" | "malformed_partial" | "notes_only";

export type RefinedExtraction =
  | { ok: true; content: string; recoveries: string[] }
  | { ok: false; reason: RefinedExtractionFailure; message: string };

const NOTES_OPEN = "<HONE-NOTES>";
const NOTES_CLOSE = "</HONE-NOTES>";
const OUTPUT_OPEN = "<HONE-OUTPUT>";
const OUTPUT_CLOSE = "</HONE-OUTPUT>";

export function extractRefinedContent(raw: string): RefinedExtraction {
  if (raw.includes(OUTPUT_OPEN)) {
    const parsed = parseTaggedBlock(raw);
    if (!parsed) {
      return {
        ok: false,
        reason: "no_tags",
        message:
          "The LLM response was empty or unparseable even though <HONE-OUTPUT> was detected. Hone will not apply it.",
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
      message:
        "The LLM wrote </HONE-OUTPUT> without an opening <HONE-OUTPUT> tag, so Hone can't tell what the refined content was meant to be. Try again or switch to the non-Lite preset.",
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
      message:
        "The LLM opened a <HONE-NOTES> block but never closed it, and didn't write <HONE-OUTPUT>. Hone can't tell where notes end and refined content begins. Try again or switch to the non-Lite preset.",
    };
  }

  const notesStart = text.indexOf(NOTES_OPEN);
  const notesEnd = notesStart !== -1 ? text.indexOf(NOTES_CLOSE, notesStart + NOTES_OPEN.length) : -1;
  if (notesStart !== -1 && notesEnd !== -1) {
    text = (text.slice(0, notesStart) + text.slice(notesEnd + NOTES_CLOSE.length)).trim();
    recoveries.push(
      recoveries.length === 0
        ? "stripped <HONE-NOTES>...</HONE-NOTES> block"
        : "stripped the recovered <HONE-NOTES>...</HONE-NOTES> block"
    );
    if (!text) {
      return {
        ok: false,
        reason: "notes_only",
        message:
          "The LLM only produced a <HONE-NOTES> changelog. There was no refined content after stripping it. Try again or switch to the non-Lite preset.",
      };
    }
    recoveries.push("no <HONE-OUTPUT> tag found; using the notes-stripped response as output");
    return { ok: true, content: text, recoveries };
  }

  return {
    ok: false,
    reason: "no_tags",
    message:
      "The LLM did not output any <HONE-NOTES> or <HONE-OUTPUT> tags at all. Hone can't be confident the response is a valid refinement. Try again or switch to the non-Lite preset.",
  };
}
