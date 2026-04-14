# Context and POV

This page covers the context Hone hands to the LLM during a refinement: chat history, lore, character card, POV instruction. Where each comes from, how it's sized, and how you tune it.

## The context model

Every refinement has access to these context sources, addressable as macros in your prompts.

| Macro | Source | Size |
| --- | --- | --- |
| `{{latest}}` | Refences the last AI message or, if in a pipeline, the last refined version of that message. | Unbounded |
| `{{context}}` | Preceding chat history, with `{{latest}}` excluded | Token-budgeted |
| `{{lore}}` | Activated lorebook entries from the most recent generation | Token-budgeted |
| `{{pov}}` | Resolved POV instruction string | Few lines |
| `{{char}}`, `{{description}}`, `{{persona}}` + more. | Lumiverse native macros | Unbounded |

Token budgets for `{{context}}` and `{{lore}}` live under the Output (or Input) sub-tab -> Context sub-subtab.

## Chat context history

Hone walks backward from the message being refined, packing chat messages into a token budget (approximated at 4 chars per token, more accurate is a TODO). The message that fills `{{latest}}` is skipped to avoid duplication. The oldest message that doesn't fit gets truncated to its tail (recent detail wins). Output is role-labeled and chronologically ordered.

### Sizing

- Setting: Max Message History Tokens. Default 4000.
- The budget covers history excluding `{{latest}}`. If `{{latest}}` is huge, less of `{{context}}` will fit.

### Input mode specifics

For input enhancement, `{{latest}}` is the last AI message (the scene your draft responds to) and stays static across stages. `{{context}}` is the chat history before that AI message.

## Lore

The `{{lore}}` macro holds activated lorebook entries from the most recent generation in the chat. Lorebook activation is per-generation, not per-message. When you refine an *older* message in a long conversation, the activated entries reflect the most recent generation, not the one that produced the message you're refining.

For short chats this is fine. For long chats where lore has shifted, the refinement sees lore reflecting the current scene, which may be irrelevant. This is a known limitation.

If lore fetch fails for any reason, `{{lore}}` resolves to empty and the refinement continues.

### Sizing the lore block

- Setting: Max Lorebook Tokens. Default 0 (unlimited).
- Entries are joined with `\n\n` between them.

## POV

POV mode is a global setting, separate per slot. `pov` for AI messages, `userPov` for user messages. Values:

| Mode | AI messages | User messages |
| --- | --- | --- |
| `auto` | Instructs the model to match the surrounding text's perspective. | Same |
| `1st` | First-person from the narrator character | First-person from the user's character |
| `1.5` | "1.5": I/me/my for the POV character, you/your for the player | (not available) |
| `2nd` | Second-person targeting the player character | Second-person targeting the user |
| `3rd` | Third-person | Same |

I will consider making this ediable in the future...

### When to pick a specific POV

- Your chat is consistent and the model is following it: leave it on `auto`.
- The model is drifting or the chat's convention is unusual: pin the POV to your chat's actual convention.
- `1st` vs `1.5` is subtle. `1.5` is for RP where the POV character uses first-person for themselves *and* addresses the player as "you" directly.

## Character card context

Hone uses Lumiverse's native `{{char}}`, `{{description}}`, `{{personality}}`, `{{scenario}}` macros for character context. These are unbounded, sync automatically when you edit the character card, and always work without Hone needing to know about every character field Lumiverse adds in the future.

The built-in presets wrap them in labeled brackets:

```text
[CHARACTER: {{char}}]
{{description}}
```

## Persona context

`{{persona}}` resolves the active user persona description. Built-ins wrap it:

```text
[USER PERSONA]
{{persona}}
```

## Stage metadata

Three macros expose which stage is running:

- `{{stage_name}}`. The current stage's name (e.g. `Grammar & Formatting`).
- `{{stage_index}}`. 1-indexed stage number.
- `{{total_stages}}`. Total stages in the current pipeline.

Use them for stage-aware framing in your system prompt: "This is stage {{stage_index}} of {{total_stages}}, focus on grammar only."

## A stage example

For a sequential output pipeline's middle stage, the assembled user message often looks like:

```text
[CHARACTER: Serenity]
A tall elf with...

[USER PERSONA]
Dave is a knight...

[POV]
Point-of-view: Third person. All characters use he/she/they/proper names.

[CHAT HISTORY]
[USER]
Hello.

[CHARACTER]
Hi!

[WORLD INFO]
The kingdom of Volantis borders...

[RULES]
- Fix grammar & spelling: ...
- Remove echo & restatement: ...
- Reduce repetition: ...

[MESSAGE TO REFINE]
<the AI message being refined>
```

Everything up to `[RULES]` is usually in the Head Collection (shared across stages). `[RULES]` plus the rule chips plus `[MESSAGE TO REFINE]` is stage-specific. The system prompt above is the same across stages.

***Note: Keep in mind that you dont need to use any of these macros if you are building an unconventional use case that doesn't require them...***

## Next

- [[Prompts and Macros]]. The full macro reference.
- [[Pipeline Editor]]. Where you choose which context macros to include per stage.
