# Hone

LLM-powered message refinement for [Lumiverse](https://lumiverse.chat/).

Hone uses a second LLM pass to edit, rewrite, or transform messages in your chat and user input. The editing rules live in shareable presets you can swap, tune, or write yourself. Refinement runs in the background and never blocks the main chat.

If you've used ReDraft or Recast before: Hone has the same post-prompting idea, with a multi-stage pipeline editor, parallel strategies, per-user isolation for multi-user Lumiverse instances, and shareable preset files. The default prompt presets descend directly from ReDraft's rule set and are under a CC BY-NC-SA 4.0 license.

## Why does this exist?

LLMs that handle long creative context tend to drift. Anti-slop instructions, banlists, and "don't do X" prompts fight the model's own distribution. You're asking it to suppress high-probability tokens (that produce slop) *while also* writing creatively, and the longer the context gets, the harder it is for the LLM to do this.

Hone takes a different route. Let the model generate natrually, then edit the result in a second pass with a shorter context. The edit task is local: whether you're polishing prose, translating a passage, or injecting UI elements, only the message itself plus surrounding lines are needed. The full gigantic chat history that generation needs is irrelevant for editing.

Three reasons it works:

1. A focused second pass offloads the burden of generating non-story writing tasks off the main story-writing LLM.
2. It changes the task. "Write a story" activates features the model associates with creative writing. "Proofread this" or "translate this" activates different features that are better suited to following specific editing instructions.
3. Editing is local and doesn't need the whole story.

So your main chat stays clean, and Hone quietly applies a second-pass edit whenever you want it.

## Video Demo

## Getting started

If you're new:

1. [[Installation]]. Install via Lumiverse's Extensions panel.
2. [[Quick Start]]. Refine your first message in 60 seconds.
3. [[Core Concepts]]. Vocabulary and the philosophy behind Hone.

## Using Hone day-to-day

- [[Interaction Surfaces]]. Pick where you click.
- [[Float Widget]]. Lumia??.
- [[Drawer Tab]]. The configuration hub.
- [[Automation]]. Auto-Refine and notification sound.

## Importing or building presets

- [[Presets]]. The shareable JSON file you can hand around.
- [[Pipeline Editor]]. Build your own pipelines.
- [[Prompts and Macros]]. Author the actual prompts.
- [[Strategies]]. Sequential vs. parallel.
- [[Model Profiles]]. Mix and match LLMs per stage.
- [[Context and POV]]. What the LLM sees, and how POV is resolved.
- [[Settings Reference]]. Everything in the Advanced page.
- [[Undo and Diffs]]. Per-swipe undo, diff modal, stage picker.

## When something's off

- [[Troubleshooting]]. Common issues with fixes.
- [[Multi-User and Privacy]]. Debug log export for bug reports, plus what's private to you.
- [[Known Limitations]]. What Hone doesn't do yet.

## Under the hood

- [[Architecture]]. For developers and the curious. Skip if you just want to use Hone.

## License

- [[License and Credits]]. Split-license: code under the Hone Community License, prompt presets under CC BY-NC-SA 4.0 (descending from ReDraft).

## Community templates

If you've tuned a Hone pipeline that works well for your style or use case, please share it. Reach out on Discord: `amousepad`. File-based import/export works today (see [[Presets#importing-a-shared-preset]]). A public template gallery is on the roadmap.

## Bugs?

- Open a [GitHub issue](https://github.com/AMousePad/Hone/issues).
- Enable Debug Logging in Advanced settings, reproduce the bug, click Copy Debug Logs, and paste into the issue.
- Or DM `amousepad` on Discord.

## Like the Chibi?

Stay tuned for my next extension, Chibiverse!
