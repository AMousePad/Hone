# License and Credits

Hone has a split-license structure.

1. Source code, build scripts, tests, and documentation outside `built-in-presets/`. Licensed under the Hone Community License (HCL) 1.0.
2. The prompt preset JSON files inside `built-in-presets/`. Licensed under CC BY-NC-SA 4.0 (ShareAlike: derivatives of the preset files must remain under the same license).

This split mirrors the upstream situation. The presets descend from [ReDraft](https://github.com/MeowCatboyMeow/ReDraft)'s CC BY-NC-SA prompt text, while the runtime, storage, UI, IPC, reliability, per-user isolation, and state-tracking machinery around them is original Hone work.

## Hone Community License 1.0 (source code)

Applies to everything under the repo root *except* the `built-in-presets/` directory.

Plain summary (not the legal text. See [LICENSE](../LICENSE.md) for the controlling version):

- Permitted. Personal use, academic use, non-profit use, study, modification for personal/academic/non-profit purposes, contributing improvements back to the upstream project.
- Not permitted without separate written permission:
  - Redistribution (including forks published as alternatives to upstream).
  - Public deployment (hosting Hone for other users on a service you operate).
  - Commercial use (including use inside paid products or paid hosting).
  - Government use.
  - Use of this software to train, fine-tune, or evaluate AI/ML models.
- Improvements must flow back. If you patch or extend Hone for your own use under the permitted categories, you're expected to open a PR or publish the changes so upstream can consider them.

The HCL is adapted by permission from the [Lumiverse Community License](https://github.com/Lumiverse-LLC/Lumiverse/blob/main/LICENSE.md) by Darran Hall (Prolix OCs).

The full authoritative license text is in [LICENSE.md](../LICENSE.md). This page is a summary. When in doubt, consult the license file.

## CC BY-NC-SA 4.0 (bundled presets)

Applies to every JSON file under [built-in-presets/](../built-in-presets/).

Plain summary ([full text](../built-in-presets/LICENSE)):

- Share and adapt. You can copy, redistribute, remix, transform, and build upon the preset files.
- Attribution. Credit the original authors (MeowCatboyMeow for ReDraft, AMousePad for Hone modifications. See [built-in-presets/NOTICE.md](../built-in-presets/NOTICE.md) for provenance).
- NonCommercial. Not for commercial use.
- ShareAlike. Derivatives must be under CC BY-NC-SA 4.0.

Derivative distributions may omit `built-in-presets/` to avoid the CC BY-NC-SA obligations. The rest of the repository remains governed by the HCL.

## Attribution / Provenance

The default presets' prompt text descends from [ReDraft](https://github.com/MeowCatboyMeow/ReDraft) by MeowCatboyMeow, specifically `DEFAULT_SYSTEM_PROMPT`, `DEFAULT_USER_ENHANCE_SYSTEM_PROMPT`, and `BUILTIN_RULES` in upstream's [`lib/prompt-builder.js`](https://github.com/MeowCatboyMeow/ReDraft/blob/main/lib/prompt-builder.js) and [`index.js`](https://github.com/MeowCatboyMeow/ReDraft/blob/main/index.js).

The JSON preset schema (`formatVersion`, `preset.id`, `preset.prompts[]`, `preset.headCollection`, `preset.pipeline`, `preset.parallel`, per-stage `modelProfileId`, etc.) is Hone-native and covered by the HCL at the repository root.

Modifications from the original ReDraft prompts are by AMousePad and are released under the same CC BY-NC-SA 4.0 license (per ShareAlike).

The HCL text is adapted from the Lumiverse Community License 1.0 by Darran Hall (Prolix OCs), with permission.

## Third-party code

Hone imports runtime types from [`lumiverse-spindle-types`](https://www.npmjs.com/package/lumiverse-spindle-types) and depends on Lumiverse's Spindle extension system at runtime. These are Lumiverse properties, governed by their own licenses.

No other third-party code is bundled into `dist/`. The chibi sprites (in `assets/*.webp`) are Hone-original assets.

The bundled `ding.mp3` is also Hone-original / royalty-free and is inlined as a data URL at build time.

## Contributing

Hone accepts contributions under the HCL's "improvements flow back" expectation. If you've built a fix, improvement, or new feature:

1. Open a PR on [GitHub](https://github.com/AMousePad/Hone/pulls).
2. Or reach out on Discord (`amousepad`) if you'd like to discuss first.

Submitting a PR implies you grant the project the right to distribute your contribution under the HCL. If you're patching a preset file, you grant distribution under CC BY-NC-SA 4.0 per ShareAlike.

## Credits

- Hone. AMousePad.
- ReDraft prompts. MeowCatboyMeow (Discord: `catboytimemeow`).
- Hone Community License. Adapted from the Lumiverse Community License by Darran Hall (Prolix OCs).
- Lumiverse. Darran Hall and the Lumiverse team. Hone exists as a Lumiverse extension. Without Lumiverse there's no Hone.

Thanks to every user who's filed a bug report, tuned a preset, or tested a new feature. Keep it coming. Discord `amousepad`.
