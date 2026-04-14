# Troubleshooting

A loose FAQ. If you hit something not listed here: enable Debug Logging in Advanced settings, reproduce, copy the buffer, open a [GitHub issue](https://github.com/AMousePad/Hone/issues).

## "No undo available for the current swipe"

The backend doesn't have an undo entry for the swipe you're currently on. Common reasons:

- You've swiped to a sibling since the refine. Undo is per-swipe. Swipe back to the originally-refined swipe.
- The undo entry was evicted under the per-chat cap (200 entries).
- The chat got cleared or the data went missing.

## "Refinement failed" / "All parallel proposals failed"

Every LLM call (or every parallel proposal) failed. Diagnose in this order:

1. Test the connection itself. Does normal chat generation still work? If no, fix the connection first.
2. Click Preview JSON on a stage of your active preset. Does it resolve with recognisable content? If not, check your prompt chips.
3. Enable Debug Logging, refine again, look for the error reason in the buffer.
4. If the LLM returned content but Hone couldn't read it, the model probably ignored the `<HONE-OUTPUT>` tag instruction. Common causes: max-tokens cap hit before the closing tag, "Request Reasoning" overriding output structure, or the model wrapped output in `<think>` tags that need stripping.

Common fixes:

- Increase the model profile's Max Response sampler. A long chat plus aggressive editing rules can blow past 2048 tokens of output.
- Turn off "Request Reasoning" if your provider's native thinking mode is suppressing tagged output.
- Turn on "Strip Reasoning Tags" if `<think>` blocks are wrapping the response.
- Lower the chat-history token budget if you're hitting context length limits.

## "Swipe changed during refinement"

You swiped to a different sibling while a refine was in progress. Hone aborts rather than overwriting the swipe you're now looking at.

See [[Known Limitations]].

## "Message content was edited during refinement"

The message's content changed during generation (you edited it manually, or another extension touched it). Hone aborts rather than overwriting your edit.

## Per-message Hone button doesn't appear

Hovering over an AI message doesn't show a pencil icon next to Copy/Edit/Fork.

- Is the extension loaded? Check the drawer. Is the Hone tab visible?
- Was the `chat_mutation` permission granted? Check Lumiverse's extension permissions.
- You're viewing a user message. User messages don't get the per-message pencil. Use the input-bar Hone button instead.
- You're viewing a streaming message.
- Lumiverse's chat UI changed in a way Hone hasn't caught up with. Refresh the browser; if the button still doesn't appear, file an issue.

## Input-bar Hone button doesn't appear

No Hone button near the chat input.

- Is "User Enhance" off in settings? Check Advanced.
- Refresh the browser. Sometimes the injector misses on the first page load and recovers on refresh.
- If still gone after refresh, file an issue.

## Float widget is gone

No floating chibi on the chat page.

- Is "Hide Widget" on? Advanced settings. Uncheck it.
- Off-screen position? Resize the browser. The widget should snap back inside the viewport.

## Preset changes don't save

Editing a chip, name, or prompt textarea and the change reverts.

If you're on a custom preset and changes still don't save, enable Debug Logging and check the buffer for a save error.

## "Preset import failed: Invalid preset: ..."

The imported JSON doesn't match what Hone expects. The error message names the field that's wrong. Report to the creator or fix the JSON manually.

## Character name / description not resolving

`{{char}}`, `{{description}}` show up in your prompt as literal macro text instead of the character's real values.

- Was the `characters` permission granted?
- Is a character actually loaded in this chat?
- Click Preview JSON on a stage. The "Macro Diagnostics" panel at the top of the modal will tell you which macros didn't resolve.

## Lore doesn't appear

`{{lore}}` resolves empty.

- Was the `world_books` permission granted?
- Are there lorebook entries that activated for the most recent generation? Lore activation is per-generation. If the last generation didn't activate anything, `{{lore}}` is empty.
- You're refining an *older* message. Lore activation reflects the most recent generation, not the one that produced the message under refinement. Known limitation; see [[Context and POV#caveat-per-message-activation]].

## Refine runs automatically on every AI message

If you have the Auto-Refine setting enabled, it will runs on every assistant message while the toggle is on. If you want selective refinement, turn Auto-Refine off and click Hone manually per message.

## Diff modal stacks or queues multiple diffs

Lumiverse caps modals at 2 per extension. Multiple fast-firing diffs (e.g. during bulk refine) queue inside one modal. Use Prev / Next to navigate.

Bulk refine suppresses per-message diffs internally, so this is rare in normal use.

## Debug logs stay empty even with logging on

Copy Debug Logs pastes `(no debug log entries)`.

- Did you do something *after* enabling logging? Logging captures from the moment it's turned on, not retroactively.
- The buffer capacity got resized down. Entries past the new cap are dropped.
- The extension reloaded (browser refresh, Lumiverse worker restart). The buffer is in-memory only.

## "Missing 'X' permission" (where X is `chat_mutation`, `chats`, etc.)

The Lumiverse operator hasn't granted that permission to Hone. Settings -> Extensions -> Hone -> grant the listed permission. Requires operator privileges on the Lumiverse instance.

The extension will load without a permission, but any feature that needs it surfaces this error.

## Something isn't listed here

1. Enable Debug Logging.
2. Reproduce the bug.
3. Copy Debug Logs.
4. Open a [GitHub issue](https://github.com/AMousePad/Hone/issues) with the logs and a short reproduction.
5. Or DM `amousepad` on Discord.

Most bugs can be diagnosed from the structural information in the log. You can and should redact specific prompt content that is sensitive to you.
