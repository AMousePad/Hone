# Known Limitations

A short list of things Hone doesn't do yet, or does in a less-than-ideal way. Each item has a workaround or a fix in mind. If any of these matter to you, vote with a [GitHub issue](https://github.com/AMousePad/Hone/issues).

The implementation-side detail (which file holds the workaround, which Spindle API addition would unblock the proper fix) lives in code comments and in [[Architecture]].

## Things blocked on Lumiverse

These would be cleaner if Lumiverse exposed a few more contribution points or runtime APIs. Until those land, Hone uses workarounds.

### Per-message and input-bar Hone buttons are DOM-injected

Lumiverse doesn't yet have a "register a button next to the bubble actions" or "register a button in the input toolbar" API. Hone walks the chat DOM and inserts buttons next to the existing actions. It works, but it's brittle. If Lumiverse ever changes the DOM structure, the buttons would silently disappear (the injector would no-op rather than crash).

When Lumiverse ships per-message and per-input contribution APIs, Hone will switch over.

### Cancelling an in-flight LLM call

When you cancel a draft enhancement (by clicking the spinning Hone button), the backend can't actually abort the LLM call. The generation finishes server-side; Hone just throws away the result when it arrives. Net effect: you got your cancel, but the tokens were already paid for.

When Lumiverse ships an abort API for `generate.raw`, the wasted tokens go away.

### Lore activation is per-generation, not per-message

When you refine an *older* message in a long chat, the lorebook entries that show up in `{{lore}}` are the ones activated by the *most recent* generation, not by the generation that produced the message you're refining. Usually fine for short chats. Sometimes irrelevant for long ones.

Until Lumiverse exposes per-message lore activation, the workaround is to keep lorebook entries broad enough that "the wrong activation set" still has overlap with what the message needed.

## Things Hone could just build

These don't depend on anything else. They just haven't been done yet.

### Continue refining a swipe you've navigated away from

If you swipe to a different sibling while a refine is in progress, Hone aborts the refinement rather than overwriting the swipe you're now looking at. Annoying when it happens.

### Better default presets

Hone ships 11 built-in presets. There's room for more battle-tested defaults: a "Light Touch" preset for grammar-only, an "Echo Cleanup" preset for removing user-echo in AI replies, a "Continuity Pass" preset focused on lore consistency.

If you've tuned one that works for your style, share it on the[ Lumiverse Discord](https://discord.gg/fdB56XdgBb) under presets!

### Public preset gallery and one-click import

I don't think this is needed but, if you really want it, open a ticket

### Auto-Enhance User

The drawer toggle exists as a placeholder. Implementation is paused on the cancellable-generation API blocker above, plus a refactor to unify the user-enhancement code path with the AI refinement code path. See [[Automation#auto-enhance-user-coming-soon]].

### Streaming refinements

LLM calls are non-streaming. Refined text appears all at once when a stage completes. Streaming would let you see progressive output and cancel early if it's going off the rails. Not high priority because it's a bit hard to implement cleanly.

### More granular debug logging

If we get bug reports that are not described in logs, I will implement this.

### Force-activate all lorebook entries during refinement

Currently `{{lore}}` shows entries that activated during the original generation. For lore-consistency checking it might be useful to force *all* entries (or use a relaxed activation threshold) during the refinement, catching inconsistencies the original generation missed because of context-size limits.

This needs either a Lumiverse API addition or a manual lorebook-fetch workaround. Probably a future settings toggle: "Use generation-activated lore" vs "Include all lore entries."

### Include Long-Term Memory or Memory Cortex macros

This is a good idea. Not sure if it will actually be used so I haven't implemented it for now.
