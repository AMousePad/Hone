# Float Widget

The floating Hone widget (aka Lumia when rendered with the chibi sprites) is a draggable single-button surface that lives above the chat. It's the fastest way to Hone or Undo the last AI message.

## Two visual modes

Toggleable in Advanced settings:

- Lumia mode (default). Animated chibi with multiple moods.
- Classic mode. A circular icon pill with the same refine/undo/spinner icons used everywhere else.

## Tap to Hone / Undo

One tap fires the appropriate action on the last AI message:

- Last message not refined -> Hone it.
- Last message refined on the current swipe -> Undo.

The widget disables itself during a refine, during a main-chat generation, or during the very first page load.

### Confirm required

For users who worry about accidental taps (especially with the widget parked near screen edges on mobile), enable Confirm Widget Taps in Advanced settings. With it on:

- First tap arms the pending action (refine or undo).
- Second tap within 4 seconds fires it.
- Tapping elsewhere on the page, or waiting out the 4 seconds, disarms.

## Context menu

Long-press on mobile or right-click on desktop opens a context menu. Self explanatory.

## Hiding the widget

Advanced settings, Hide Widget. The widget disappears :(

## Notification sound

When "Play Sound on Refinement Complete" is enabled in Advanced settings, a short ding plays at the end of every successful refine (widget-initiated or otherwise). The default sound is a bundled ding. Paste a custom URL in settings to override.
