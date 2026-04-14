# Model Profiles

A model profile bundles a Lumiverse connection with sampler overrides (temperature, top-p, etc.) and reasoning config. Hone uses one active profile for every refinement by default, with optional per-stage overrides.

## Why profiles exist

Hone uses your Lumiverse connections (Claude, GPT, Gemini, OpenRouter, self-hosted). But "use the same connection, same samplers, same reasoning config for every stage of every refinement" is often the wrong call:

- You might want the main chat on a creative model and Hone on a cheaper, faster model.
- You might want low temperature for grammar passes and higher temperature for prose rewrites.
- You might want reasoning tags stripped on fast models, but the native thinking API enabled on Claude/OpenRouter.

Model profiles let you set this up once and reuse it. You can switch presets without changing which model runs. You can switch models without touching your preset library.

## The "Default" profile

Hone has a built-in "Default" profile that uses your Lumiverse default connection with no sampler overrides. It also strips `<think>` / `<thinking>` / `<reasoning>` tags from the LLM output (a safe default for chain-of-thought-heavy models like DeepSeek or QwQ).

Default is read-only. To customize, click Duplicate or "+ New" in the Models tab to create your own profile.

The Models tab shows Default at the bottom of the dropdown under a "Built-in" group.

## The "Models" drawer tab

Full profile management lives here.

### Connection

A dropdown of your Lumiverse connections. Changing the connection saves immediately.

### Samplers

A column of sliders: Temperature, Max Response, Context Size, Top P, Min P, Top K, Freq Penalty, Pres Penalty, Rep Penalty.

- Drag the slider, or type a value in the inline number input.
- Double-click the track to reset the sampler to "unset" (Hone won't send that parameter, the connection's default applies).
- Clearing the input has the same effect as double-clicking.

Unset samplers are styled dimly. Set ones are bright.

### Reasoning Detection

Three controls.

- Strip Reasoning Tags (toggle). Strip `<think>`, `<thinking>`, `<reasoning>` blocks from the LLM output before reading the `<HONE-OUTPUT>` block. Default on. Required for DeepSeek, QwQ, and similar models that leak reasoning text if left alone.
- Request Reasoning (toggle). Ask the provider to use its native reasoning API (Anthropic `thinking`, Google `thinkingConfig`, OpenRouter/OpenAI `reasoning`).
  - NOTE: This should be ON for recent Gemini Pro models and effort should be set to the lowest supported effort if you want minimal reasoning! (Gemini Pro models have mandatory reasoning).
  - Reasoning Effort (dropdown, only visible when Request Reasoning is on). `auto`, `none`, `minimal`, `low`, `medium`, `high`, `xhigh` (OpenRouter), `max` (Anthropic). Provider-specific mapping applies.

## Per-stage overrides

Every pipeline stage has a Model Profile dropdown in its header. Default is `(inherit active model profile)`. Pick a specific profile to run *just that stage* on a different model.

### When to override

- Mixed quality and speed tiers. Grammar pass on a fast cheap model, prose pass on a premium creative model.
- Reasoning isolation. One stage wants reasoning-strip on (CoT model), another wants native reasoning requested.
- You want different samplers.

### Stripped at export

`⚠` Per-stage profile references are stripped when you export a preset. Profile ids are tied to your Lumiverse install. They won't resolve on someone else's machine. When someone imports your preset, their active profile applies at every stage.

`⚠` If your preset relies on specific profiles, mention it in the preset name or add a notes prompt explaining the intended setup.

### What happens if a referenced profile is deleted

The dropdown shows `⚠ deleted profile (<id>)` so the override isn't invisible. At refinement time, the stage falls back to the Default profile and a warning is logged. The override isn't auto-cleared.

## Tips

### Name profiles by purpose

`"Grammar (Haiku 4.5)"` vs `"OpenRouter Haiku 4.5"`.
