# Interaction Surfaces

Hone exposes four independent UI buttons. Any of them can trigger a refine or undo.

| Surface              | Who it's for                                     | Main gesture                       |
| -------------------- | ------------------------------------------------ | ---------------------------------- |
| Per-message button   | Targeting a specific AI message in the chat log  | Hover a bubble, click the pencil   |
| Input-bar button     | Enhancing your own draft before sending          | Click the Hone button next to Send |
| Float widget (Lumia) | Quick "refine whatever just generated"           | One tap (or two-tap confirm)       |
| Drawer tab           | Configuration, stage picker, bulk actions, stats | Open the sidebar tab               |

## Float widget (Lumia)

The floating chibi widget is a draggable single-button surface. Defaults to visible, 48 px diameter, left side of the screen. Dedicated page: [[Float Widget]].

- One tap. Hone last AI message (or Undo, if the last message is already refined).
- Two-tap confirm. Optional, see [[Float Widget#confirm-required]].
- Long-press or right-click. Context menu (size presets, open drawer, open settings).
- Drag. Moves the widget. Snaps to screen edge.

The chibi has moods (normal, hover, thinking, sleepy, post-undo, error, angry-while-dragging). You can switch to a plain icon pill in settings.

## Per-message button

A small pencil icon is in every AI message's action bar (next to Copy / Edit / Fork / Hide). Hover-revealed on desktop, always visible on mobile.

### States

- Pencil icon, idle. Message is in its original state. Click to Hone.
- Circular arrow. Message has been refined on the current swipe. Click to Undo.
- Spinner. Refinement is in flight.

### Per-swipe behaviour

Refined state is tracked per message *and per swipe*. Swipe to a different sibling and the button flips back to the un-refined pencil. Swipe back and it flips to Undo again, because that swipe has its own stored undo entry.

### User messages

You can refine user messages that are in your compose box before you send it. Hone doesn't refine already-sent user messages in place. If you want this feature, please context me on discord.

## Input-bar button

A Hone button appears in the chat input toolbar, next to Lumiverse's native Send / Home / Continue / Regenerate. Same three-icon set as the per-message button: refine, undo, spinner.

### What it does

1. Reads whatever's in the compose box (including empty, see below).
2. Runs the input preset's pipeline against it.
3. Replaces the draft in place with the enhanced version.
4. Flips to undo state. Clicking again restores the pre-Hone text.

### Impersonate-persona / blank draft

If you click Hone with an empty compose box, the input preset's system prompt has a clause that tells the model to impersonate your persona and write a short in-persona draft from scratch.

## Drawer tab

The Hone drawer tab is the configuration surface and the stage picker. Opening it gives you four internal sub-tabs:

| Sub-tab        | What's there                                                                                  |
| -------------- | --------------------------------------------------------------------------------------------- |
| Hone (default) | Quick actions (Hone Last / Hone All / Undo), stage picker, Auto-Refine toggle, per-chat stats |
| Models         | Model profile config: connection, samplers, reasoning config                                  |
| Output         | Output preset: pipeline editor, prompt library, context settings, AI-message POV              |
| Input          | Input preset: pipeline editor, prompt library, context settings, user-message POV             |
| Misc           | Some random stuff.                                                                            |

See [[Drawer Tab]] for more info.

### Quick actions (Hone main tab)

- Hone Last AI Message. Refines the most recent assistant message in the current chat. Handy when the pencil pill is hard to reach on mobile.
- Undo Refinement. Undoes the most recent assistant message's refinement.
- Hone All AI Messages. Bulk-refines every assistant message in the chat. Two-tap confirm to prevent accidents. Per-message progress shows on the drawer badge. A summary modal fires at the end only if any failed. I am not sure why you would ever want to do this, but go ahead.
- Stage picker. If the last refined message used a multi-stage pipeline or a parallel strategy, one button per stage (proposals plus aggregator steps) appears. Click to instantly swap the message's content to that stage's output. Diff modal shows original vs. selected stage. Undo still restores the true original.
