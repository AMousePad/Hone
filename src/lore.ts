/** Lorebook assembly helpers. Pure (no spindle deps) so unit
 *  tests can import them without pulling the whole refinement module. */

/** Fetch lorebook entry bodies in parallel via `Promise.allSettled`
 *  so one failing entry doesn't drop the rest. Order matches
 *  `entryIds` for every fulfilled non-empty entry. */
export async function fetchLoreContents(
  entryIds: string[],
  getEntry: (id: string) => Promise<{ content?: string } | null | undefined>
): Promise<string[]> {
  const results = await Promise.allSettled(entryIds.map((id) => getEntry(id)));
  const contents: string[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value && r.value.content) {
      contents.push(r.value.content);
    }
  }
  return contents;
}

/** Join lore contents with a double-newline separator and apply the
 *  user-configured token cap (~4 chars/token). `maxTokens <= 0` means
 *  unlimited. */
export function assembleLoreBlock(contents: string[], maxTokens: number): string {
  if (contents.length === 0) return "";
  const block = contents.join("\n\n");
  if (maxTokens <= 0) return block;
  const charCap = maxTokens * 4;
  return block.length > charCap ? block.slice(0, charCap) : block;
}
