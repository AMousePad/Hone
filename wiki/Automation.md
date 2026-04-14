# Automation

Hone has one automation toggle shipping today (Auto-Refine AI) and one coming soon (Auto-Enhance User). Both live in the Hone drawer's main tab under the Automation section.

## Auto-Refine AI

When enabled, every AI message gets Honed automatically right after it finishes generating. Same code path as a manual click, same UI feedback (spinner, drawer badge, diff modal, optional ding).

### Use cases

- Silent background polish. Pair Auto-Refine with "Show Diff After Refine" off and your AI messages get polished without interrupting the chat. Undo per-message if anything goes wrong.
- Auto-refine with a specific preset. Presets are global. Switch to a lighter preset for auto-refine to keep the cost down. Use heavier presets manually on specific messages.

### Failure handling

Auto-refine failures don't pop a modal. They just leave the message at its original state and log the failure. The drawer badge briefly flashes `✗`. If a specific chat is failing repeatedly, enable Debug Logging to capture the trace.

### Interaction with manual actions

Auto-refine and manual refine queue through the same per-chat queue. If you click Hone on message A while auto-refine is running on message B in the same chat, message A waits its turn. Cross-chat refines run in parallel.

If you Undo an auto-refined message, the original is restored. Auto-refined messages aren't special. They're just refined messages that fired themselves.

## Notification sound

When "Play Sound on Refinement Complete" (Advanced tab) is enabled, a short ding plays at the end of every successful refinement (manual, auto, bulk, or stage-flip).

The default sound is a bundled ding. Paste a custom URL in the "Custom Sound URL" field to override.

The sound plays only on success. Failed refinements are silent. Volume is fixed (Will change that later).

## Auto-Enhance User (coming soon)

The toggle exists in the drawer, dimmed, with "(coming soon)" next to the label.

When the feature lands, this will auto-enhance your drafts on send.

Until then, the input-bar Hone button is the way to enhance drafts.

## Tips

### Combining Auto-Refine with stage pickers

If you're using a multi-stage preset with auto-refine:

- The stage picker still populates after each auto-refine completes.
- You can flip to an earlier stage's output if the final stage over-edited.
- Undo still restores the true original.

This makes it useful for experimentation. Auto-refine applies the "default" stage (the last one) every time, but you can pick an earlier stage when the final output went too far.
