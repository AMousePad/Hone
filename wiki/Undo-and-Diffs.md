# Undo, Diffs & Stage Picker

On the user-facing parts of Hone's undo system. Implementation details (storage layout, race guards, write-compensation rollback) live in [[Architecture]].

## Per-swipe undo

Refinement is tracked per swipe.

If you navigate to a different swipe *during* a refine, the refinement aborts. See [[Known Limitations]].

## The diff modal

After a successful refine, Hone pops a modal showing a word-level diff. Added text is highlighted green-ish, removed text red-ish, unchanged text in the default color.

If multiple diffs arrive while one's open (rare), they queue inside the modal. Prev/Next nav buttons appear with a counter. The view doesn't auto-advance.

## The stage picker

After a multi-stage or parallel refinement, the drawer's Hone Control section shows one button per intermediate output:

- `Step N: <name>`. Sequential pipeline stage, or aggregator stage.
- `Agent N: <name>`. Final output of one parallel proposal.

Clicking a stage button swaps the message's content to that stage's output and shows a diff against the original. Tooltip on each button previews that stage's first 200 characters.

### The original is preserved

No matter which stage you flip to, clicking Undo restores the *pre-refinement* original, not the last stage you were viewing.

## Storage limits

Hone caps undo entries per chat (currently 200). When you exceed the cap, the oldest entry is evicted from disk. Recently-touched entries survive eviction even if they were originally created a long time ago, because re-saving an entry refreshes its position in the eviction queue.

... You'd have to refine 200 different swipes in one chat before noticing this.

## Next

- [[Drawer Tab#stage-picker]]. Stage picker UI.
- [[Pipeline Editor]]. Where multi-stage and parallel pipelines are built.
- [[Architecture]]. The technical detail of how undo is stored and why race guards exist.
