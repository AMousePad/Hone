declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

const granted = new Set<string>();

const PERMISSION_PURPOSE: Record<string, string> = {
  chat_mutation: "replace refined messages in the chat",
  chats: "read the current chat and its messages",
  characters: "resolve character fields like {{char}} during refinement",
  world_books: "include activated lorebook entries as refinement context",
  generation: "call your LLM connection to refine messages",
  ui_panels: "render the Hone drawer tab and floating widget",
};

export async function initPermissions(): Promise<void> {
  try {
    const list = await spindle.permissions.getGranted();
    for (const p of list) granted.add(p);
    spindle.log.info(`Permissions initialized: ${[...granted].join(", ") || "none"}`);
  } catch (err) {
    spindle.log.warn(`Failed to load permissions: ${err instanceof Error ? err.message : err}`);
  }
  spindle.permissions.onChanged((detail) => {
    granted.clear();
    for (const p of detail.allGranted) granted.add(p);
    spindle.log.info(`Permissions updated: ${detail.allGranted.join(", ") || "none"}`);
  });
  spindle.permissions.onDenied((detail) => {
    spindle.log.warn(`Permission denied: ${detail.permission} for ${detail.operation}`);
  });
}

export function hasPermission(p: string): boolean {
  return granted.has(p);
}

export function getMissingPermissions(required: readonly string[]): string[] {
  return required.filter((p) => !granted.has(p));
}

export function describeMissingPermissions(missing: readonly string[]): string {
  if (missing.length === 0) return "";
  if (missing.length === 1) {
    const p = missing[0];
    const purpose = PERMISSION_PURPOSE[p] ?? p;
    return `Hone is missing the '${p}' permission. It needs this to ${purpose}. Grant it in Lumiverse's Extensions tab, then try again.`;
  }
  const lines = missing.map((p) => `  \u2022 '${p}': ${PERMISSION_PURPOSE[p] ?? p}`);
  return `Hone is missing ${missing.length} required permissions:\n${lines.join("\n")}\nGrant them in Lumiverse's Extensions tab, then try again.`;
}
