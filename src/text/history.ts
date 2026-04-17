interface HistoryMessage {
  id: string;
  role: string;
  content: string;
}

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
      picked.push({ role: m.role, content: m.content.slice(-remaining) });
      used = charBudget;
      break;
    }
  }

  picked.reverse();

  const parts: string[] = [];
  for (const p of picked) {
    const label =
      p.role === "user" ? "USER" : p.role === "assistant" ? "CHARACTER" : p.role.toUpperCase();
    parts.push(`[${label}]\n${p.content}`);
  }
  return parts.join("\n\n");
}

export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
