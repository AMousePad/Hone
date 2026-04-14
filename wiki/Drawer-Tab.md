# Drawer Tab

The Hone tab in Lumiverse's sidebar drawer is the configuration hub *and* the stage picker. It's where you set up model profiles, edit presets, toggle auto-refine, and flip between pipeline stages after a multi-stage refine.

You can also access it by right clicking on the Hone widget (hold for mobile).

## Hone Control (quick actions)

The big buttons at the top.

### Hone Last AI Message

Refines the most recent assistant message in the current chat. The button shows a spinner during generation, and a small badge appears on the drawer tab title (`...`, then `✓` or `✗`, then clears after a few seconds).

### Undo Refinement

Appears in place of Hone Last when the last AI message is refined on the current swipe. Two-tap confirm: first click arms, second click within 4 seconds fires. Click outside the drawer to disarm.

### Hone All AI Messages

Bulk-refines every assistant message in the active chat. Two-tap confirm. Per-message progress shows on the drawer badge (`3/12`). A summary modal fires at the end only if any refinements failed. Fully-successful bulk runs are silent.

### Stage picker

After a multi-stage or parallel refinement, the drawer shows one button per intermediate output:

- `Step 1: Grammar Pass`. Sequential pipeline stage 1.
- `Step 2: Prose & Voice`. Stage 2.
- `Agent 1: Grammar Agent`. Parallel proposal 1's final output.
- `Agent 2: Prose Agent`. Proposal 2's final output.
- `Step 1: Aggregator`. Aggregator stage 1.

Clicking a stage button swaps the message's live content to that stage's output and shows a diff against the original. Flipping between stages is instant.

The original is preserved across stage flips. No matter which stage you flip to, clicking Undo restores the pre-refinement content.

Stages stream in as they complete.

## Automation

### Auto-Refine AI

Toggle to automatically Hone every AI message after it finishes generating. Same UI feedback as a manual click: spinner, badge, diff modal, optional ding.

If `chat_mutation` permission is denied, auto-refine silently no-ops. Failures don't interrupt your chat with a modal, but they show up in debug logs.

### Auto-Enhance User (coming soon)

When the feature lands, this will auto-enhance your drafts on send. Until then, manual enhancement via the input-bar Hone button is the only path. See [[Known Limitations]].

## Models sub-tab

Full model profile setup. See [[Model Profiles]] for the complete reference.

## Output sub-tab

The output preset editor. Everything about what happens when you refine an AI message lives here.

Layout:

- Preset bar. Dropdown selector, Rename / Duplicate / Export / Import / New / Delete.
- AI Message POV selector. `auto`, `1st`, `1.5`, `2nd`, `3rd`. See [[Context and POV#pov]].
- Sub-subtab bar:
  - Pipeline. Stage editor. See [[Pipeline Editor]].
  - Prompts. Prompt library. See [[Prompts and Macros]].
  - Shield. Literal-block shielding config: master toggle, include/exclude regex, reset to defaults. See [[Prompts and Macros#shielding-literal-blocks]].
  - Context. Token budgets for `{{context}}` and `{{lore}}`.

Built-in presets show a padlock banner and disable all inputs. Click Duplicate to make an editable copy.

Edits to a custom preset save automatically. There's no Save button.

See [[Presets]] for everything preset-related.

## Input sub-tab

Same layout as Output, but for the input preset. The pipeline that runs when you click the input-bar Hone button.

Differences from Output:

- User Message POV instead of AI Message POV.
- No 1.5 POV option. User messages are always from the user's perspective.
- No Shield sub-subtab. Shielding only applies to output refinement.

## Misc sub-tab

Barebones right now, might add stuff to this in the future.

## Badge behaviour

The drawer tab title gets a small badge during operations:

- `...`: refine in flight.
- `3/12`: bulk refine progress.
- `✓`: successful completion (clears after 3 seconds).
- `✗`: error (clears after 3 seconds).

This is the fastest way to know Hone is working when the drawer is closed.
