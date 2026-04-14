/** Pre-build step. Reads binary assets in `assets/` and emits TS
 *  modules exporting `data:` URL constants. Runs from
 *  `build:frontend` so the bundled frontend.js ships every asset
 *  inline: no runtime HTTP fetch, no static-route dependency.
 *
 *  Output under `src/ui/generated/` is gitignored. */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

interface AssetSpec {
  /** Source path relative to repo root. */
  src: string;
  /** Output path relative to repo root. */
  out: string;
  /** MIME type for the data URL. */
  mime: string;
  /** Name of the exported constant. */
  constName: string;
}

const ASSETS: AssetSpec[] = [
  {
    src: "assets/ding.mp3",
    out: "src/ui/generated/ding-data.ts",
    mime: "audio/mpeg",
    constName: "DING_DATA_URL",
  },
  // Float-widget chibi states: one WebP per state. Priority order
  // and state transitions live in float-widget.ts.
  { src: "assets/normal.webp",     out: "src/ui/generated/chibi-normal.ts",     mime: "image/webp", constName: "CHIBI_NORMAL_URL" },
  { src: "assets/sleepy.webp",     out: "src/ui/generated/chibi-sleepy.ts",     mime: "image/webp", constName: "CHIBI_SLEEPY_URL" },
  { src: "assets/thinking.webp",   out: "src/ui/generated/chibi-thinking.ts",   mime: "image/webp", constName: "CHIBI_THINKING_URL" },
  { src: "assets/hover_hone.webp", out: "src/ui/generated/chibi-hover-hone.ts", mime: "image/webp", constName: "CHIBI_HOVER_HONE_URL" },
  { src: "assets/hover_undo.webp", out: "src/ui/generated/chibi-hover-undo.ts", mime: "image/webp", constName: "CHIBI_HOVER_UNDO_URL" },
  { src: "assets/undo_after.webp", out: "src/ui/generated/chibi-undo-after.ts", mime: "image/webp", constName: "CHIBI_UNDO_AFTER_URL" },
  { src: "assets/error.webp",      out: "src/ui/generated/chibi-error.ts",      mime: "image/webp", constName: "CHIBI_ERROR_URL" },
  { src: "assets/angry.webp",      out: "src/ui/generated/chibi-angry.ts",      mime: "image/webp", constName: "CHIBI_ANGRY_URL" },
];

for (const a of ASSETS) {
  const srcPath = resolve(repoRoot, a.src);
  const outPath = resolve(repoRoot, a.out);
  const buf = readFileSync(srcPath);
  const b64 = buf.toString("base64");
  mkdirSync(dirname(outPath), { recursive: true });
  const body = `// AUTO-GENERATED from ${a.src}: do not edit.
// Regenerate by running \`bun run gen:assets\`.

export const ${a.constName} = "data:${a.mime};base64,${b64}";
`;
  writeFileSync(outPath, body);
  const kb = (buf.length / 1024).toFixed(1);
  console.log(`asset: ${a.src} (${kb} KB) -> ${a.out}`);
}
