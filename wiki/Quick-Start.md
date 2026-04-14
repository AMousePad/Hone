# Quick Start

This assumes you've already [[Installation|installed Hone]] and have at least one Lumiverse connection profile configured.

### 1. Refine an AI message

1. Open any chat with an assistant reply.
2. Hover over the AI message. A pencil icon appears in the message's action bar (next to Copy / Edit / Fork).
3. Click the pencil.
4. The button spins. A second LLM call runs in the background. Your main chat stays fully interactive.
5. When it finishes, the message is replaced with the refined version. A word-level diff modal pops up showing what changed.
6. The button icon flips to an undo arrow. Click it to restore the original.

Nothing else requires configuration. Hone comes with working defaults.

"Refinement is too slow."

Switch the output preset to a **Lite** variant (Simulacra v4 1.0 Lite or ReDraft Default 3.0.0 Lite). The Lite presets run the same rules but skip the `<HONE-NOTES>` changelog step, so the model goes straight to generating the refined output. May be less effective on models that benefit from verbalizing their reasoning. Drawer tab, Output, preset bar.

### 2. Enhance your own draft

1. Type a message in the chat input, but don't send it.
2. A Hone button sits next to Lumiverse's native Send / Home / Continue buttons in the input toolbar.
3. Click it.
4. The button spins. When the enhancement arrives, your draft is replaced in place with the polished version.
5. The button flips to undo. Click it to get your original draft back.
6. Edit the enhanced draft if you want, then send normally with Enter or the Send button. Hone doesn't intercept the send.

If you click while the enhancement is running, the request is cancelled and your draft stays as-is.

### 3. Try the floating widget

A small draggable widget appears on the chat page by default. It's a chibi character (Lumia) or a classic icon pill, depending on settings. Tap it to Hone the last AI message. Tap again after refinement to undo. Long-press (mobile) or right-click (desktop) for a context menu with size presets and links into the drawer / settings.

The chibi has moods: idle, hover, thinking, sleepy, post-undo, error, angry-while-dragging. Watch what happens when you drag her, or just let her sit for a minute.

Like the chibi? Keep an eye out for my next extension, Chibiverse!

### 4. Open the drawer tab

Click the Hone tab in the Lumiverse sidebar. You'll see:

- Hone Control. Hone or Undo the last message, Hone All AI messages, plus the pipeline stage picker if you've used a multi-stage preset.
- Automation. Auto-Refine toggle, so every AI reply auto-refines after generation.
- Sub-tabs for Models, Output (AI-message preset), Input (user-draft preset), and Misc (per-chat stats).

This is where you'll spend time once you start customizing Hone. The next pages explain each of these.

## What to tweak first?

"I want Hone to use a different model than my main chat."

Open the Models drawer tab, duplicate the Default profile, switch the connection. See [[Model Profiles]].

"I want to auto-refine every AI reply."

Drawer tab, Automation, toggle Auto-Refine AI on. See [[Automation]].

"The default rules don't fit my requirements."

Drawer tab, Output, Pipeline subtab, click Duplicate in the preset bar to create an editable copy, then edit the prompt chips. See [[Presets]], [[Pipeline Editor]], and [[Prompts and Macros]].

"Someone shared a preset file with me. How do I use it?"

Drawer tab, Output (or Input, depending on what kind of preset), click Import in the preset bar, pick the `.hone-preset.json` file. The preset becomes active immediately. See [[Presets#import]].

"I don't want the floating widget on screen."

Advanced settings, Hide Widget. The drawer and per-message buttons still work. See [[Float Widget#hiding-the-widget]].

"Something went wrong."

Advanced settings, Debug Logging on, reproduce the issue, click Copy Debug Logs, paste into a GitHub issue or Discord. See [[Troubleshooting]].

## Next

- [[Core Concepts]]. The vocabulary and the philosophy behind Hone.
- [[Presets]]. Importing, exporting, and choosing a preset.
- [[Pipeline Editor]]. Building your own.
