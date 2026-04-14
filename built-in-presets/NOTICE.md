# Built-in presets: attribution

The JSON files in this directory are bundled default presets for Hone. They are
licensed under [CC BY-NC-SA 4.0](LICENSE), separately from the rest of the
Hone repository (which is under the Hone Community License 1.0; see the
top-level `LICENSE`).

## Provenance

| File | Origin | Notes |
| --- | --- | --- |
| `output/redraft-default-3.0.0.hone-preset.json` | Adapted from [ReDraft](https://github.com/MeowCatboyMeow/ReDraft) by MeowCatboyMeow | Single-stage system prompt + rule set |
| `output/redraft-default-lite-3.0.0.hone-preset.json` | Adapted from ReDraft | Same rule set as ReDraft Default; system prompt omits the `<HONE-NOTES>` changelog step so the model goes straight to `<HONE-OUTPUT>` |
| `output/redraft-3step-3.0.0.hone-preset.json` | Adapted from ReDraft | Multi-stage pipeline variant |
| `output/redraft-parallel-3.0.0.hone-preset.json` | Adapted from ReDraft | Parallel / aggregator variant |
| `output/simulacra-v4-1.0.hone-preset.json` | Adapted from ReDraft / Simulacra rule set | Single-stage |
| `output/simulacra-v4-lite-1.0.hone-preset.json` | Adapted from ReDraft / Simulacra rule set | Same rule set as Simulacra v4 1.0; system prompt omits the `<HONE-NOTES>` changelog step so the model goes straight to `<HONE-OUTPUT>` |
| `output/simulacra-v4-3step-1.0.hone-preset.json` | Adapted from ReDraft / Simulacra rule set | Multi-stage |
| `output/simulacra-v4-parallel-1.0.hone-preset.json` | Adapted from ReDraft / Simulacra rule set | Parallel variant |
| `output/extreme-example.hone-preset.json` | Hone-original structure, includes ReDraft-derived prose | Demonstration preset |
| `input/input-single-pass-1.0.hone-preset.json` | Adapted from ReDraft (user-enhance system prompt) | Single-stage input preset |
| `input/input-multi-stage-1.0.hone-preset.json` | Adapted from ReDraft (user-enhance system prompt) | Multi-stage input preset |

The prompt text in these presets descends from ReDraft's `DEFAULT_SYSTEM_PROMPT`,
`DEFAULT_USER_ENHANCE_SYSTEM_PROMPT`, and `BUILTIN_RULES` (see
[lib/prompt-builder.js](https://github.com/MeowCatboyMeow/ReDraft/blob/main/lib/prompt-builder.js)
and [index.js](https://github.com/MeowCatboyMeow/ReDraft/blob/main/index.js) in the
upstream repo). The JSON schema wrapping them (`formatVersion`, `preset.id`,
`preset.prompts[]`, `preset.pipeline`/`preset.parallel`, etc.) is Hone-native and
covered by the Hone Community License at the repository root.

Original ReDraft author: MeowCatboyMeow (Discord: `catboytimemeow`).

Modifications from the original ReDraft prompts are by AMousePad and are
released under the same CC BY-NC-SA 4.0 license (per ShareAlike).
