# Installation

Hone installs through Lumiverse's built-in extension system.

## From the Lumiverse Extensions panel

1. Open Lumiverse, then Settings --> Extensions.
2. Paste this repository's URL into the Add extension field.
3. Lumiverse fetches the repo, shows the declared permissions. Grant these permissions.
4. Hone loads. You'll see the Hone drawer tab appear in the sidebar and the floating chibi widget appear on the chat page.

## First-launch

Once installed, confirm:

1. The Hone tab is visible in the Lumiverse sidebar drawer.
2. The floating chibi widget appears on the chat page (default position: left side, roughly the middle of the viewport).
3. Open a chat with at least one AI message. Hover over the message and look for the pencil icon in the bubble's action row (next to Copy / Edit / Fork / Delete).
4. The chat input area has a Hone button next to Lumiverse's native Send / Home buttons.

## Connection profile

Hone uses your existing Lumiverse connection profiles. Before your first refinement, make sure at least one connection profile is configured in Lumiverse -> Settings -> Connections, and set one as the default. These connections live in your configurable Hone model profiles.

By default Hone uses the default Lumiverse connection for every refinement call. If you'd like Hone to use a different connection than your main chat (for example, main chat on a premium creative model and Hone on a cheaper fast model), create a model profile. See [[Model Profiles]].

You may change the samplers (temperature, top-k, etc.) and save it as part of your model profile after switching off the default profile.

## Building from source

The published repo ships pre-built `dist/backend.js` and `dist/frontend.js` so you can install without a toolchain. If you want to build it yourself:

```bash
bun install
bun run build
```

See [[Architecture]] for the dev loop and build internals.

## Required permissions

Lumiverse prompts for these at install.

| Permission        | Why Hone needs it                                                                     |
| ----------------- | ------------------------------------------------------------------------------------- |
| `chat_mutation` | Write refined content back into the message, and restore on undo                      |
| `chats`         | Look up the active chat and last-assistant-message for quick actions like "Hone Last" |
| `characters`    | Read the character card's description/personality so refinements have persona context |
| `world_books`   | Resolve activated lorebook entries into the `{{lore}}` macro                        |
| `generation`    | Make the actual LLM call for refinement                                               |
| `ui_panels`     | Register the Hone drawer tab in the sidebar                                           |

If you deny any of these, the matching feature will tell you when you try to invoke something that requires the permission. See [[Troubleshooting]] if you have issues.

## Next

Head to [[Quick Start]] and refine your first message.
