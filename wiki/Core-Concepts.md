# Core Concepts

A short primer on the ideas behind Hone: the vocabulary the UI uses, and the reasoning behind the defaults.

## The post-prompting idea

Most creative LLM setups try to fix prose at *generation time*. A long system prompt with banlists, style guides, anti-slop instructions, "don't write X, don't start sentences with Y." This is constrained generation. You're asking the model to produce creative text *and* suppress large parts of its own distribution in the same call. This can be difficult for models to follow while maintaining the same level of writing quality and expression.

At longer context lengths, a model is more likely to not follow these instructions for various reasons.

Hone helps this. You let the model generate normally as it usually does, with the full context it needs to move the story forward, and then run Hone to do a *second* pass whose only job is to edit. That second pass:

- Uses a much shorter context, just the message plus a few lines of surrounding chat.
- Changes the task from "write creatively" to "proofread and edit," which activates different internal features. Phrasings the model favors when writing are not the same phrasings it favors when editing.
- Can be as aggressive as you want without hurting the main chat. You are shown a diff between the current and main chat and you can freely undo bad refinements.

Hone is the infrastructure for running that second pass. The actual editing rules live in presets (see below), which you can swap, tune, or replace to fit certain presets.

*Note: It may be optimal to remove these prose, antislop, or ban lists outside your lumiverse prompt preset and put them into Hone instead, but this may require testing (any volunteers?).*

## Alternative use cases

There are other ways you can use Hone that can be unconventional. You can find examples of these at (TODO).

### Translation

An LLM is cheaper, faster, and more skillful at writing in native English than it is at other languages. You can instruct the LLM to write in a English, then use Hone with a preset with translation instructions to translate that into the language of your choice.

### UI Injection

Many presets have the LLM generate UI elements, either by generating HTML natively, or generating tags that a regex matches and replaces with prebuilt HTML. There have been some reports that having an LLM do this mid-generation can cause issues with writing quality! Instead of having your story-writing LLM generate your UI elements, you can use a Hone preset with instructions to add UI elements after.

TODO:

- I might consider an option to auto-undo refinements past a certain depth to remove any bloat Hone introduces (but this can also currently be done in other ways like regex).
- I will eventually implement the ability for an LLM to edit or locally add to a response rather than needing to rewrite it. This will make it faster and cheaper for this use case.

*Note: It may be optimal to remove the UI element generation instructions from your lumiverse prompt preset, and put them into a Hone prompt preset instead.*

## Terminology

### Hone / Refine / Undo

- Hone is the verb in the UI. Clicking "Hone" runs a refinement pipeline on the target.
- Refine is the same thing internally. A refinement is one successful Hone operation.
- Undo restores the pre-refinement original. Undo entries are kept per-swipe, so each swipe keeps its own undo independently. There is an inbuilt max of 200 undo entries.

### Output vs. Input

Hone has two modes:

- Output refinement targets AI messages. It's what you get when you click the pencil-edit on an AI bubble, or tap the float widget. The preset used here is an *output preset*.
- Input enhancement targets *your* drafts/messages. It's what you get when you click the Hone button in the input area. The preset used here is an *input preset*. You can use this to both refine your input before sending it, and to **impersonate your response.**

Both paths use the same pipeline engine. The difference is which preset slot drives the refinement, and which message the macros point to. See [[Presets]] for the breakdown.

### Preset

A preset is the self-contained configuration of *how* one refinement is performed:

- A named prompt library: atomic text blobs like "System Prompt", "Grammar Rule", "Character Description". You can call these text blobs "chips".
- A sequential pipeline (sequential chain of stages) or parallel pipeline (multiple agents in parallel plus an aggregator) that references those prompts by id.
- Optional per-stage model overrides.

Presets are decoupled from global knobs (which LLM to use, POV mode, context token budgets). Switching presets is a single dropdown change. Exporting a preset gives you a `.hone-preset.json` file anyone else can import.

Hone ships 11 built-in presets. You can use them directly, duplicate to edit, or write your own. See [[Presets#built-in-catalog]] for the catalog.

### Stage

A stage is one LLM call. A stage defines the messages that get sent (system, user, assistant) via prompt chips, with every referenced prompt concatenated into its row when the call is built.

A pipeline is a sequence of stages that threads output forward. Stage 1 runs, its refined text becomes the `{{latest}}` macro for stage 2, and so on. The last stage's output is what the chat ends up with. In the drawer, each intermediate stage appears as a button in the stage picker so you can flip between them.

### Parallel (proposals + aggregator)

A parallel strategy fans out. N independent proposal pipelines run concurrently against the same original message, each a full pipeline in its own right. Then an aggregator pipeline receives all the proposal outputs and decides what to do with them.

Parallel presets are useful when you want diverse edits (one agent focused on grammar, another on prose tone, another on UI elements) and then one aggregator to aggregate the strongest elements. See [[Strategies#parallel]].

This can be expensive depending on the LLM used as each stage is a seperate LLM call.

### Row / Chip / Head Collection

Inside a stage, messages are organised as rows. Each row has a role (system, user, assistant) and a sequence of prompt chips, references to prompts in the preset's library.

The Head Collection is a reusable bundle of prompts (character card, persona, POV, chat history, rules header) that typically opens every stage. Instead of copying those chips into every stage's first user row, you put them in the Head Collection once and drop a single Head Collection meta-chip into each stage. Edit the Head Collection once, every stage that uses the chip reflects the change.

See [[Pipeline Editor#head-collection]] for details.

### Swipe

Lumiverse supports swipes: multiple alternative outputs for the same message position that you cycle through. Hone tracks refinement state per-swipe. Refining swipe 0 doesn't affect swipe 1's state, and swiping between them works as expected.

If you navigate to a different swipe during a refine, the refinement will error. I may change this behaviour later.

### Model Profile

A model profile bundles a Lumiverse connection with sampler overrides (temperature, top-p, etc.) and reasoning config. You can:

- Pick a model profile as Hone's active profile. Applies to every refinement unless overridden.
- Set a per-stage override on any pipeline stage. Useful when you want, say, stage 1 on a cheap fast model and stage 3 on a premium model.

The built-in Default profile uses your Lumiverse default connection with no sampler overrides. See [[Model Profiles]].

## Why are there two Hone buttons for AI messages?

The per-message pencil button and the float widget both refine the same way, but they serve different uses:

- Per-message button: when you're reading back through a scene and decide one specific message needs editing.
- Float widget: "refine whatever just generated." A quick tap without hovering over the bubble. You also don't need to scroll and seek the button at the top of the message as the widget stays static on your screen at all times. It's also cute.

The drawer's Hone Last / Hone All buttons exist for bulk flows (refine every AI message in the chat) and for inspecting per-stage history.

## Why the input enhancement button lives on the input bar

In user-message enhancement you're editing a draft that hasn't been sent yet. The input-bar button replaces the draft in place, lets you review, then you send normally.

## Next

- [[Interaction Surfaces]]. Pick a surface.
- [[Presets]]. The unit of configuration.
- [[Pipeline Editor]]. Where most customization happens.
