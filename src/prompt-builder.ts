import type { PovMode } from "./types";

/**
 * Produces the string values Hone plugs into `{{context}}` and
 * `{{pov}}` before pipeline assembly.
 *
 * Character / persona / lore bundle via Lumiverse native macros
 * (`{{char}}`, `{{persona}}`, `{{description}}`, etc.) or Hone's
 * own `{{pov}}` / `{{lore}}`. They are NOT included in `{{context}}`.
 */

const AUTO_INSTRUCTION =
  "Point-of-view: Match the point-of-view, tense, and pronoun conventions already established in the surrounding text. Do not shift perspective.";

const POV_INSTRUCTIONS: Record<string, string> = {
  "1st":
    "Point-of-view: First person. I/me/my = the narrator character. You/your = the player character. Other characters use he/she/they.",
  "1.5":
    "Point-of-view: First person (1.5). I/me/my = the current POV character. You/your = the player (always used in descriptions). Other characters use he/she/they.",
  "2nd":
    "Point-of-view: Second person. You/your = the player character in narration. AI characters use he/she/they.",
  "3rd":
    "Point-of-view: Third person. All characters use he/she/they/proper names. No I/you in narration.",
};

const USER_POV_INSTRUCTIONS: Record<string, string> = {
  "1st":
    "Point-of-view: First person. I/me/my = the user's character. Other characters use he/she/they.",
  "2nd":
    "Point-of-view: Second person. You/your = the user's character. Other characters use he/she/they.",
  "3rd":
    "Point-of-view: Third person. All characters use he/she/they/proper names.",
};

export function resolvePovInstruction(
  pov: PovMode,
  isUserMessage: boolean
): string {
  if (pov === "auto") return AUTO_INSTRUCTION;
  const table = isUserMessage ? USER_POV_INSTRUCTIONS : POV_INSTRUCTIONS;
  return table[pov] || "";
}

interface HistoryMessage {
  id: string;
  role: string;
  content: string;
}

/** Build the `{{context}}` block.
 *
 *  Walks `messages` backward from `upToIndex` packing into a token-
 *  budgeted block. Skips `excludeId`: that's the message occupying
 *  `{{latest}}`, which would otherwise duplicate. Budget is approximated
 *  at 4 chars/token. A message that doesn't fit whole is truncated to
 *  its tail so recent detail wins. Output is role-labeled, oldest-first,
 *  blank-line-separated.
 *
 *  @param messages Full chat message list.
 *  @param upToIndex Inclusive upper bound.
 *  @param excludeId Id to skip (the `{{latest}}` message); null includes all.
 *  @param tokenBudget Max tokens of history. `<= 0` returns "". */
export function buildChatHistoryBlock(
  messages: HistoryMessage[],
  upToIndex: number,
  excludeId: string | null,
  tokenBudget: number
): string {
  if (tokenBudget <= 0) return "";
  const charBudget = tokenBudget * 4;

  interface Picked {
    role: string;
    content: string;
  }
  const picked: Picked[] = [];
  let used = 0;
  for (let i = Math.min(upToIndex, messages.length - 1); i >= 0; i--) {
    const m = messages[i];
    if (excludeId && m.id === excludeId) continue;
    if (!m.content) continue;

    const remaining = charBudget - used;
    if (remaining <= 0) break;

    if (m.content.length <= remaining) {
      picked.push({ role: m.role, content: m.content });
      used += m.content.length;
    } else {
      // Keep the tail of the oldest-fitting message. Anything further
      // back wouldn't fit either, so stop.
      picked.push({ role: m.role, content: m.content.slice(-remaining) });
      used = charBudget;
      break;
    }
  }

  picked.reverse();

  const parts: string[] = [];
  for (const p of picked) {
    const label =
      p.role === "user"
        ? "USER"
        : p.role === "assistant"
          ? "CHARACTER"
          : p.role.toUpperCase();
    parts.push(`[${label}]\n${p.content}`);
  }
  return parts.join("\n\n");
}

/** Approximate token count at 4 chars/token. Used by callers to size
 *  the history budget: `tokens(context) = max - tokens(latest)`. */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
