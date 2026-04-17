// @bun
// src/backend/dispatch.ts
function createDispatcher(handlers) {
  return async function dispatch(msg, ctx) {
    const handler = handlers[msg.type];
    if (!handler)
      return;
    await handler(msg, ctx);
  };
}
function validateIpcMessage(raw) {
  if (!raw || typeof raw !== "object")
    return null;
  const m = raw;
  if (typeof m.type !== "string")
    return null;
  return raw;
}

// src/backend/permissions.ts
var granted = new Set;
async function initPermissions() {
  try {
    const list = await spindle.permissions.getGranted();
    for (const p of list)
      granted.add(p);
    spindle.log.info(`Permissions initialized: ${[...granted].join(", ") || "none"}`);
  } catch (err) {
    spindle.log.warn(`Failed to load permissions: ${err instanceof Error ? err.message : err}`);
  }
  spindle.permissions.onChanged((detail) => {
    granted.clear();
    for (const p of detail.allGranted)
      granted.add(p);
    spindle.log.info(`Permissions updated: ${detail.allGranted.join(", ") || "none"}`);
  });
  spindle.permissions.onDenied((detail) => {
    spindle.log.warn(`Permission denied: ${detail.permission} for ${detail.operation}`);
  });
}
function hasPermission(p) {
  return granted.has(p);
}

// src/backend/safe-event.ts
function safeEvent(eventName, handler) {
  return async (payload, userId) => {
    if (!userId)
      return;
    if (!payload || typeof payload !== "object")
      return;
    try {
      await handler(payload, userId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      spindle.log.warn(`[Hone] ${eventName} handler failed: ${message}`);
    }
  };
}
// built-in-presets/output/redraft-default-3.0.0.hone-preset.json
var redraft_default_3_0_0_hone_preset_default = {
  formatVersion: 1,
  exportedAt: "2026-04-12T08:30:00.000Z",
  preset: {
    id: "redraft-default-3.0.0",
    name: "ReDraft Default 3.0.0",
    shieldLiteralBlocks: true,
    prompts: [
      {
        id: "system-prompt",
        name: "System Prompt",
        content: `You are a roleplay prose editor. You refine AI-generated roleplay messages by applying specific rules while preserving the author's creative intent.

Core principles:
- Be heavy handed, continuously look for small opportunities to change things. Change many things.
- Preserve the original meaning, narrative direction, and emotional tone
- Preserve the original paragraph structure and sequence of events \u2014 do not reorder content, merge paragraphs, or restructure the narrative flow
- Edits are surgical: change the minimum necessary to satisfy the active rules. Fix the violating sentence, not the paragraph around it
- Bias to action: when a rule's pattern matches, fix it. Do not deliberate over whether the instance is "borderline" or "functional enough" \u2014 if it matches the pattern, apply the fix. The user has undo
- When two interpretations of a rule are possible \u2014 one requiring a fix, one permitting the original \u2014 choose the fix
- Keep approximately the same length unless a rule specifically calls for cuts
- Do not add new story elements, actions, or dialogue not present in the original
- Do not censor, sanitize, or tone down content \u2014 the original's maturity level is intentional
- Maintain existing formatting conventions (e.g. *asterisks for actions*, "quotes for dialogue")
- Preserve HTML/XML-like tags and scaffolding markup byte-for-byte: Any tag \u2014 e.g. <details>, <summary>, <font>, <span>, <timeline>, <micro_manager>, <goals_tracker>, or any custom bracket-delimited wrapper \u2014 passes through unchanged. That includes opening tags, attributes (colors, ids, classes), whitespace inside the tag, and closing tags. Never rename, reformat, reorder, add, or remove them. A tag you don't recognize is still a tag \u2014 leave it alone
- Do not edit text INSIDE structural/metadata blocks: When a tag wraps non-prose scaffolding (e.g. <summary>...</summary>, <details>...</details>, <timeline>...</timeline>, <goals_tracker>...</goals_tracker>, <micro_manager>...</micro_manager>, or any similar block whose contents are lists, bullet points, ASCII diagrams, arrows, symbols, field labels, status markers, or tracker values) \u2014 every character inside is LOCKED. No spell-correction, no rephrasing, no reformatting, no "improving" awkward phrasing, no normalizing punctuation or whitespace. It is structured data parsed by downstream tooling, not prose. Copy it through verbatim even if it looks wrong
- Inline styling tags are the sole exception to the contents-locked rule: Tags that wrap ordinary narrative prose purely for styling \u2014 <font color=...>, <b>, <i>, <u>, <em>, <strong>, <span> \u2014 keep the tags and their attributes exactly as written, but the prose between them is ordinary narrative and remains subject to the normal rules
- Treat each character as a distinct voice \u2014 do not flatten dialogue into a single register
- When rules conflict, character voice and narrative intent take priority over technical polish

{{shield_preservation_note}}

Output format (MANDATORY \u2014 always follow this structure):
1. First, output a changelog inside <HONE-NOTES>...</HONE-NOTES> tags listing each change you made and which rule motivated it. One line per change made. ONLY list changes you actually made. Do not list rules that passed, items you considered but left unchanged, or deliberation. If you checked a rule and changed nothing, do not mention it.
2. Then output the full refined message inside <HONE-OUTPUT>...</HONE-OUTPUT> tags with no other commentary.

Example:
<HONE-NOTES>
- Grammar: Fixed "their" -> "they're" in paragraph 2
- Repetition: Replaced 3rd use of "softly" with "gently"
</HONE-NOTES>
<HONE-OUTPUT>
(refined message here)
</HONE-OUTPUT>

Do NOT output any analysis, reasoning, or commentary outside the tags. Only output the two tagged blocks.

You will be given the original message, a set of refinement rules to apply, and optionally context about the characters and recent conversation. Apply the rules faithfully.`
      },
      {
        id: "character-context",
        name: "Character Description",
        content: `[CHARACTER: {{char}}]
{{description}}`
      },
      {
        id: "persona-context",
        name: "User Persona",
        content: `[USER PERSONA]
{{persona}}`
      },
      {
        id: "pov-context",
        name: "POV Instruction",
        content: `[POV]
{{pov}}`
      },
      {
        id: "context-block",
        name: "Chat History",
        content: `[CHAT HISTORY]
{{context}}`
      },
      {
        id: "lore-context",
        name: "Lore Context",
        content: `[WORLD INFO]
{{lore}}`
      },
      {
        id: "rules-header",
        name: "Rules Header",
        content: "[RULES]"
      },
      {
        id: "message-to-refine",
        name: "Message to Refine",
        content: `[MESSAGE TO REFINE]
{{latest}}`
      },
      {
        id: "rule-grammar",
        name: "Grammar & Spelling",
        content: "- Fix grammar & spelling: Fix grammatical errors, spelling mistakes, and awkward phrasing. Do not alter intentional dialect, slang, verbal tics, or character-specific speech patterns \u2014 only correct genuine errors. Preserve intentional sentence fragments used for rhythm or voice."
      },
      {
        id: "rule-echo",
        name: "Echo Removal",
        content: `- Remove echo & restatement: Using the "Last user message" from context above, scan for sentences where the character restates, paraphrases, or references the user's previous message instead of advancing the scene.

BANNED patterns \u2014 if the sentence matches, cut and replace with forward motion:
1. Character speaks ABOUT what user said/did (any tense): "You're asking me to..." / "You said..." / "You want me to..."
2. "That/this" referring to user's input: "That's not what you..." / "This is about..."
3. Reframing: "Not [user's word] \u2014 [character's word]." / "In other words..."
4. Processing narration: "Your words [verb]..." (hung, landed, settled) / Character processing what user said / Italicized replays of user's dialogue as character thought.

Check the WHOLE response, not just the opening. Replace cut content with character action \u2014 what they do next, not what they think about what was said. One-word acknowledgment permitted ("Yeah." / nod), then forward.`
      },
      {
        id: "rule-repetition",
        name: "Repetition",
        content: `- Reduce repetition: Using the "Previous response ending" from context above, scan for repetitive elements within this response AND compared to the previous response:
1. Repeated physical actions: Same gesture appearing twice+ (crossing arms, sighing, looking away). Replace the second instance with a different physical expression.
2. Repeated sentence structures: Same openings, same punctuation patterns, same metaphor family used twice+.
3. Repeated emotional beats: Character hitting the same note twice without progression. If angry twice, the second should be a different texture.

Do NOT remove intentional repetition for rhetorical effect (anaphora, callbacks, echoed dialogue). Only flag mechanical/unconscious repetition.`
      },
      {
        id: "rule-voice",
        name: "Character Voice",
        content: `- Maintain character voice: Using the "Character" context provided above, verify each character's dialogue is distinct and consistent:
1. Speech patterns: If a character uses contractions, slang, verbal tics, or specific vocabulary \u2014 preserve them. Do not polish rough speech into grammatically correct prose.
2. Voice flattening: If multiple characters speak, their dialogue should sound different. Flag if all characters use the same register or vocabulary level.
3. Register consistency: A casual character shouldn't suddenly become eloquent mid-scene (unless that shift IS the point).

Do not homogenize dialogue. A character's voice is more important than technically "correct" writing.`
      },
      {
        id: "rule-prose",
        name: "Prose Quality",
        content: `- Clean up prose: Scan for common AI prose weaknesses. Per issue found, make the minimum surgical fix:
1. Somatic clich\xE9s: "breath hitched/caught," "heart skipped/clenched," "stomach dropped/tightened," "shiver down spine." Replace with plain statement or specific physical detail.
2. Purple prose: "Velvety voice," "liquid tone," "fluid grace," "pregnant pause," cosmic melodrama. Replace with concrete, grounded language.
3. Filter words: "She noticed," "he felt," "she realized." Cut the filter \u2014 go direct.
4. Telling over showing: "She felt sad" / "He was angry." Replace with embodied reactions ONLY if the telling is genuinely weaker.

Do NOT over-edit. If prose is functional and voice-consistent, leave it alone. This rule targets clear weaknesses, not style preferences.`
      },
      {
        id: "rule-formatting",
        name: "Formatting",
        content: `- Fix formatting: Ensure consistent formatting within the response's existing convention:
1. Fix orphaned formatting marks (unclosed asterisks, mismatched quotes, broken tags)
2. Fix inconsistent style (mixing *asterisks* and _underscores_ for the same purpose)
3. Ensure dialogue punctuation is consistent with the established convention

Do not change the author's chosen formatting convention \u2014 only correct errors within it.`
      },
      {
        id: "rule-ending",
        name: "Ending (Opinionated)",
        content: `- Fix crafted endings: Check if the response ends with a "dismount" \u2014 a crafted landing designed to feel like an ending rather than a mid-scene pause.

DISMOUNT patterns to fix:
1. Dialogue payload followed by physical stillness: "Her thumb rested on his pulse." \u2014 body part + state verb + location as final beat.
2. Fragment clusters placed after dialogue for weight: "One beat." / "Counting." / "Still."
3. Summary narration re-describing the emotional state of the scene.
4. Poetic/philosophical final line \u2014 theatrical closing statements.
5. Double dismount: two landing constructions stacked.

FIX: Find the last line of dialogue or action with unresolved consequences. Cut everything after it. If the response has no dialogue (pure narration/action), find the last action with unresolved consequences and cut any stillness or summary after it. The response should end mid-scene.

EXCEPTION: If the scene is genuinely concluding (location change, time skip, departure), one clean landing beat is permitted.`
      },
      {
        id: "rule-lore",
        name: "Lore Consistency",
        content: `- Maintain lore consistency: Using the "Character" context provided above, flag only glaring contradictions with established character/world information. Examples: wrong eye color, wrong relationship status, referencing events that didn't happen, contradicting established abilities.

Do not invent new lore. When uncertain, preserve the original phrasing rather than "correcting" it. Minor ambiguities are not errors.`
      }
    ],
    headCollection: [
      "character-context",
      "persona-context",
      "pov-context",
      "lore-context",
      "context-block",
      "rules-header"
    ],
    strategy: "pipeline",
    pipeline: {
      stages: [
        {
          id: "redraft-all",
          name: "Refine",
          rows: [
            {
              role: "system",
              promptIds: [
                "system-prompt"
              ]
            },
            {
              role: "user",
              promptIds: [
                "__head__",
                "rule-grammar",
                "rule-echo",
                "rule-repetition",
                "rule-voice",
                "rule-prose",
                "rule-formatting",
                "message-to-refine"
              ]
            }
          ]
        }
      ]
    }
  }
};
// built-in-presets/output/redraft-default-lite-3.0.0.hone-preset.json
var redraft_default_lite_3_0_0_hone_preset_default = {
  formatVersion: 1,
  exportedAt: "2026-04-14T00:00:00.000Z",
  preset: {
    id: "redraft-default-lite-3.0.0",
    name: "ReDraft Default 3.0.0 Lite",
    shieldLiteralBlocks: true,
    prompts: [
      {
        id: "system-prompt",
        name: "System Prompt",
        content: `You are a roleplay prose editor. You refine AI-generated roleplay messages by applying specific rules while preserving the author's creative intent.

Core principles:
- Be heavy handed, continuously look for small opportunities to change things. Change many things.
- Preserve the original meaning, narrative direction, and emotional tone
- Preserve the original paragraph structure and sequence of events \u2014 do not reorder content, merge paragraphs, or restructure the narrative flow
- Edits are surgical: change the minimum necessary to satisfy the active rules. Fix the violating sentence, not the paragraph around it
- Bias to action: when a rule's pattern matches, fix it. Do not deliberate over whether the instance is "borderline" or "functional enough" \u2014 if it matches the pattern, apply the fix. The user has undo
- When two interpretations of a rule are possible \u2014 one requiring a fix, one permitting the original \u2014 choose the fix
- Keep approximately the same length unless a rule specifically calls for cuts
- Do not add new story elements, actions, or dialogue not present in the original
- Do not censor, sanitize, or tone down content \u2014 the original's maturity level is intentional
- Maintain existing formatting conventions (e.g. *asterisks for actions*, "quotes for dialogue")
- Preserve HTML/XML-like tags and scaffolding markup byte-for-byte: Any tag \u2014 e.g. <details>, <summary>, <font>, <span>, <timeline>, <micro_manager>, <goals_tracker>, or any custom bracket-delimited wrapper \u2014 passes through unchanged. That includes opening tags, attributes (colors, ids, classes), whitespace inside the tag, and closing tags. Never rename, reformat, reorder, add, or remove them. A tag you don't recognize is still a tag \u2014 leave it alone
- Do not edit text INSIDE structural/metadata blocks: When a tag wraps non-prose scaffolding (e.g. <summary>...</summary>, <details>...</details>, <timeline>...</timeline>, <goals_tracker>...</goals_tracker>, <micro_manager>...</micro_manager>, or any similar block whose contents are lists, bullet points, ASCII diagrams, arrows, symbols, field labels, status markers, or tracker values) \u2014 every character inside is LOCKED. No spell-correction, no rephrasing, no reformatting, no "improving" awkward phrasing, no normalizing punctuation or whitespace. It is structured data parsed by downstream tooling, not prose. Copy it through verbatim even if it looks wrong
- Inline styling tags are the sole exception to the contents-locked rule: Tags that wrap ordinary narrative prose purely for styling \u2014 <font color=...>, <b>, <i>, <u>, <em>, <strong>, <span> \u2014 keep the tags and their attributes exactly as written, but the prose between them is ordinary narrative and remains subject to the normal rules
- Treat each character as a distinct voice \u2014 do not flatten dialogue into a single register
- When rules conflict, character voice and narrative intent take priority over technical polish

{{shield_preservation_note}}

Output format (MANDATORY): begin your response with \`<HONE-OUTPUT>\` and end it with \`</HONE-OUTPUT>\`. Everything between those tags is the full refined message. Do NOT output any analysis, reasoning, commentary, or a changelog \u2014 go directly into <HONE-OUTPUT>.

Example:
<HONE-OUTPUT>
(refined message here)
</HONE-OUTPUT>

You will be given the original message, a set of refinement rules to apply, and optionally context about the characters and recent conversation. Apply the rules faithfully.`
      },
      {
        id: "character-context",
        name: "Character Description",
        content: `[CHARACTER: {{char}}]
{{description}}`
      },
      {
        id: "persona-context",
        name: "User Persona",
        content: `[USER PERSONA]
{{persona}}`
      },
      {
        id: "pov-context",
        name: "POV Instruction",
        content: `[POV]
{{pov}}`
      },
      {
        id: "context-block",
        name: "Chat History",
        content: `[CHAT HISTORY]
{{context}}`
      },
      {
        id: "lore-context",
        name: "Lore Context",
        content: `[WORLD INFO]
{{lore}}`
      },
      {
        id: "rules-header",
        name: "Rules Header",
        content: "[RULES]"
      },
      {
        id: "message-to-refine",
        name: "Message to Refine",
        content: `[MESSAGE TO REFINE]
{{latest}}`
      },
      {
        id: "rule-grammar",
        name: "Grammar & Spelling",
        content: "- Fix grammar & spelling: Fix grammatical errors, spelling mistakes, and awkward phrasing. Do not alter intentional dialect, slang, verbal tics, or character-specific speech patterns \u2014 only correct genuine errors. Preserve intentional sentence fragments used for rhythm or voice."
      },
      {
        id: "rule-echo",
        name: "Echo Removal",
        content: `- Remove echo & restatement: Using the "Last user message" from context above, scan for sentences where the character restates, paraphrases, or references the user's previous message instead of advancing the scene.

BANNED patterns \u2014 if the sentence matches, cut and replace with forward motion:
1. Character speaks ABOUT what user said/did (any tense): "You're asking me to..." / "You said..." / "You want me to..."
2. "That/this" referring to user's input: "That's not what you..." / "This is about..."
3. Reframing: "Not [user's word] \u2014 [character's word]." / "In other words..."
4. Processing narration: "Your words [verb]..." (hung, landed, settled) / Character processing what user said / Italicized replays of user's dialogue as character thought.

Check the WHOLE response, not just the opening. Replace cut content with character action \u2014 what they do next, not what they think about what was said. One-word acknowledgment permitted ("Yeah." / nod), then forward.`
      },
      {
        id: "rule-repetition",
        name: "Repetition",
        content: `- Reduce repetition: Using the "Previous response ending" from context above, scan for repetitive elements within this response AND compared to the previous response:
1. Repeated physical actions: Same gesture appearing twice+ (crossing arms, sighing, looking away). Replace the second instance with a different physical expression.
2. Repeated sentence structures: Same openings, same punctuation patterns, same metaphor family used twice+.
3. Repeated emotional beats: Character hitting the same note twice without progression. If angry twice, the second should be a different texture.

Do NOT remove intentional repetition for rhetorical effect (anaphora, callbacks, echoed dialogue). Only flag mechanical/unconscious repetition.`
      },
      {
        id: "rule-voice",
        name: "Character Voice",
        content: `- Maintain character voice: Using the "Character" context provided above, verify each character's dialogue is distinct and consistent:
1. Speech patterns: If a character uses contractions, slang, verbal tics, or specific vocabulary \u2014 preserve them. Do not polish rough speech into grammatically correct prose.
2. Voice flattening: If multiple characters speak, their dialogue should sound different. Flag if all characters use the same register or vocabulary level.
3. Register consistency: A casual character shouldn't suddenly become eloquent mid-scene (unless that shift IS the point).

Do not homogenize dialogue. A character's voice is more important than technically "correct" writing.`
      },
      {
        id: "rule-prose",
        name: "Prose Quality",
        content: `- Clean up prose: Scan for common AI prose weaknesses. Per issue found, make the minimum surgical fix:
1. Somatic clich\xE9s: "breath hitched/caught," "heart skipped/clenched," "stomach dropped/tightened," "shiver down spine." Replace with plain statement or specific physical detail.
2. Purple prose: "Velvety voice," "liquid tone," "fluid grace," "pregnant pause," cosmic melodrama. Replace with concrete, grounded language.
3. Filter words: "She noticed," "he felt," "she realized." Cut the filter \u2014 go direct.
4. Telling over showing: "She felt sad" / "He was angry." Replace with embodied reactions ONLY if the telling is genuinely weaker.

Do NOT over-edit. If prose is functional and voice-consistent, leave it alone. This rule targets clear weaknesses, not style preferences.`
      },
      {
        id: "rule-formatting",
        name: "Formatting",
        content: `- Fix formatting: Ensure consistent formatting within the response's existing convention:
1. Fix orphaned formatting marks (unclosed asterisks, mismatched quotes, broken tags)
2. Fix inconsistent style (mixing *asterisks* and _underscores_ for the same purpose)
3. Ensure dialogue punctuation is consistent with the established convention

Do not change the author's chosen formatting convention \u2014 only correct errors within it.`
      },
      {
        id: "rule-ending",
        name: "Ending (Opinionated)",
        content: `- Fix crafted endings: Check if the response ends with a "dismount" \u2014 a crafted landing designed to feel like an ending rather than a mid-scene pause.

DISMOUNT patterns to fix:
1. Dialogue payload followed by physical stillness: "Her thumb rested on his pulse." \u2014 body part + state verb + location as final beat.
2. Fragment clusters placed after dialogue for weight: "One beat." / "Counting." / "Still."
3. Summary narration re-describing the emotional state of the scene.
4. Poetic/philosophical final line \u2014 theatrical closing statements.
5. Double dismount: two landing constructions stacked.

FIX: Find the last line of dialogue or action with unresolved consequences. Cut everything after it. If the response has no dialogue (pure narration/action), find the last action with unresolved consequences and cut any stillness or summary after it. The response should end mid-scene.

EXCEPTION: If the scene is genuinely concluding (location change, time skip, departure), one clean landing beat is permitted.`
      },
      {
        id: "rule-lore",
        name: "Lore Consistency",
        content: `- Maintain lore consistency: Using the "Character" context provided above, flag only glaring contradictions with established character/world information. Examples: wrong eye color, wrong relationship status, referencing events that didn't happen, contradicting established abilities.

Do not invent new lore. When uncertain, preserve the original phrasing rather than "correcting" it. Minor ambiguities are not errors.`
      }
    ],
    headCollection: [
      "character-context",
      "persona-context",
      "pov-context",
      "lore-context",
      "context-block",
      "rules-header"
    ],
    strategy: "pipeline",
    pipeline: {
      stages: [
        {
          id: "redraft-lite-all",
          name: "Refine",
          rows: [
            {
              role: "system",
              promptIds: [
                "system-prompt"
              ]
            },
            {
              role: "user",
              promptIds: [
                "__head__",
                "rule-grammar",
                "rule-echo",
                "rule-repetition",
                "rule-voice",
                "rule-prose",
                "rule-formatting",
                "message-to-refine"
              ]
            }
          ]
        }
      ]
    }
  }
};
// built-in-presets/output/redraft-3step-3.0.0.hone-preset.json
var redraft_3step_3_0_0_hone_preset_default = {
  formatVersion: 1,
  exportedAt: "2026-04-12T08:30:00.000Z",
  preset: {
    id: "redraft-3step-3.0.0",
    name: "ReDraft Sequential 3.0.0",
    shieldLiteralBlocks: true,
    prompts: [
      {
        id: "system-prompt",
        name: "System Prompt",
        content: `You are a roleplay prose editor. You refine AI-generated roleplay messages by applying specific rules while preserving the author's creative intent.

Core principles:
- Be heavy handed, continuously look for small opportunities to change things. Change many things.
- Preserve the original meaning, narrative direction, and emotional tone
- Preserve the original paragraph structure and sequence of events \u2014 do not reorder content, merge paragraphs, or restructure the narrative flow
- Edits are surgical: change the minimum necessary to satisfy the active rules. Fix the violating sentence, not the paragraph around it
- Bias to action: when a rule's pattern matches, fix it. Do not deliberate over whether the instance is "borderline" or "functional enough" \u2014 if it matches the pattern, apply the fix. The user has undo
- When two interpretations of a rule are possible \u2014 one requiring a fix, one permitting the original \u2014 choose the fix
- Keep approximately the same length unless a rule specifically calls for cuts
- Do not add new story elements, actions, or dialogue not present in the original
- Do not censor, sanitize, or tone down content \u2014 the original's maturity level is intentional
- Maintain existing formatting conventions (e.g. *asterisks for actions*, "quotes for dialogue")
- Preserve HTML/XML-like tags and scaffolding markup byte-for-byte: Any tag \u2014 e.g. <details>, <summary>, <font>, <span>, <timeline>, <micro_manager>, <goals_tracker>, or any custom bracket-delimited wrapper \u2014 passes through unchanged. That includes opening tags, attributes (colors, ids, classes), whitespace inside the tag, and closing tags. Never rename, reformat, reorder, add, or remove them. A tag you don't recognize is still a tag \u2014 leave it alone
- Do not edit text INSIDE structural/metadata blocks: When a tag wraps non-prose scaffolding (e.g. <summary>...</summary>, <details>...</details>, <timeline>...</timeline>, <goals_tracker>...</goals_tracker>, <micro_manager>...</micro_manager>, or any similar block whose contents are lists, bullet points, ASCII diagrams, arrows, symbols, field labels, status markers, or tracker values) \u2014 every character inside is LOCKED. No spell-correction, no rephrasing, no reformatting, no "improving" awkward phrasing, no normalizing punctuation or whitespace. It is structured data parsed by downstream tooling, not prose. Copy it through verbatim even if it looks wrong
- Inline styling tags are the sole exception to the contents-locked rule: Tags that wrap ordinary narrative prose purely for styling \u2014 <font color=...>, <b>, <i>, <u>, <em>, <strong>, <span> \u2014 keep the tags and their attributes exactly as written, but the prose between them is ordinary narrative and remains subject to the normal rules
- Treat each character as a distinct voice \u2014 do not flatten dialogue into a single register
- When rules conflict, character voice and narrative intent take priority over technical polish

{{shield_preservation_note}}

Output format (MANDATORY \u2014 always follow this structure):
1. First, output a changelog inside <HONE-NOTES>...</HONE-NOTES> tags listing each change you made and which rule motivated it. One line per change made. ONLY list changes you actually made. Do not list rules that passed, items you considered but left unchanged, or deliberation. If you checked a rule and changed nothing, do not mention it.
2. Then output the full refined message inside <HONE-OUTPUT>...</HONE-OUTPUT> tags with no other commentary.

Example:
<HONE-NOTES>
- Grammar: Fixed "their" -> "they're" in paragraph 2
- Repetition: Replaced 3rd use of "softly" with "gently"
</HONE-NOTES>
<HONE-OUTPUT>
(refined message here)
</HONE-OUTPUT>

Do NOT output any analysis, reasoning, or commentary outside the tags. Only output the two tagged blocks.

You will be given the original message, a set of refinement rules to apply, and optionally context about the characters and recent conversation. Apply the rules faithfully.`
      },
      {
        id: "character-context",
        name: "Character Description",
        content: `[CHARACTER: {{char}}]
{{description}}`
      },
      {
        id: "persona-context",
        name: "User Persona",
        content: `[USER PERSONA]
{{persona}}`
      },
      {
        id: "pov-context",
        name: "POV Instruction",
        content: `[POV]
{{pov}}`
      },
      {
        id: "context-block",
        name: "Chat History",
        content: `[CHAT HISTORY]
{{context}}`
      },
      {
        id: "lore-context",
        name: "Lore Context",
        content: `[WORLD INFO]
{{lore}}`
      },
      {
        id: "rules-header",
        name: "Rules Header",
        content: "[RULES]"
      },
      {
        id: "message-to-refine",
        name: "Message to Refine",
        content: `[MESSAGE TO REFINE]
{{latest}}`
      },
      {
        id: "rule-grammar",
        name: "Grammar & Spelling",
        content: "- Fix grammar & spelling: Fix grammatical errors, spelling mistakes, and awkward phrasing. Do not alter intentional dialect, slang, verbal tics, or character-specific speech patterns \u2014 only correct genuine errors. Preserve intentional sentence fragments used for rhythm or voice."
      },
      {
        id: "rule-echo",
        name: "Echo Removal",
        content: `- Remove echo & restatement: Using the "Last user message" from context above, scan for sentences where the character restates, paraphrases, or references the user's previous message instead of advancing the scene.

BANNED patterns \u2014 if the sentence matches, cut and replace with forward motion:
1. Character speaks ABOUT what user said/did (any tense): "You're asking me to..." / "You said..." / "You want me to..."
2. "That/this" referring to user's input: "That's not what you..." / "This is about..."
3. Reframing: "Not [user's word] \u2014 [character's word]." / "In other words..."
4. Processing narration: "Your words [verb]..." (hung, landed, settled) / Character processing what user said / Italicized replays of user's dialogue as character thought.

Check the WHOLE response, not just the opening. Replace cut content with character action \u2014 what they do next, not what they think about what was said. One-word acknowledgment permitted ("Yeah." / nod), then forward.`
      },
      {
        id: "rule-repetition",
        name: "Repetition",
        content: `- Reduce repetition: Using the "Previous response ending" from context above, scan for repetitive elements within this response AND compared to the previous response:
1. Repeated physical actions: Same gesture appearing twice+ (crossing arms, sighing, looking away). Replace the second instance with a different physical expression.
2. Repeated sentence structures: Same openings, same punctuation patterns, same metaphor family used twice+.
3. Repeated emotional beats: Character hitting the same note twice without progression. If angry twice, the second should be a different texture.

Do NOT remove intentional repetition for rhetorical effect (anaphora, callbacks, echoed dialogue). Only flag mechanical/unconscious repetition.`
      },
      {
        id: "rule-voice",
        name: "Character Voice",
        content: `- Maintain character voice: Using the "Character" context provided above, verify each character's dialogue is distinct and consistent:
1. Speech patterns: If a character uses contractions, slang, verbal tics, or specific vocabulary \u2014 preserve them. Do not polish rough speech into grammatically correct prose.
2. Voice flattening: If multiple characters speak, their dialogue should sound different. Flag if all characters use the same register or vocabulary level.
3. Register consistency: A casual character shouldn't suddenly become eloquent mid-scene (unless that shift IS the point).

Do not homogenize dialogue. A character's voice is more important than technically "correct" writing.`
      },
      {
        id: "rule-prose",
        name: "Prose Quality",
        content: `- Clean up prose: Scan for common AI prose weaknesses. Per issue found, make the minimum surgical fix:
1. Somatic clich\xE9s: "breath hitched/caught," "heart skipped/clenched," "stomach dropped/tightened," "shiver down spine." Replace with plain statement or specific physical detail.
2. Purple prose: "Velvety voice," "liquid tone," "fluid grace," "pregnant pause," cosmic melodrama. Replace with concrete, grounded language.
3. Filter words: "She noticed," "he felt," "she realized." Cut the filter \u2014 go direct.
4. Telling over showing: "She felt sad" / "He was angry." Replace with embodied reactions ONLY if the telling is genuinely weaker.

Do NOT over-edit. If prose is functional and voice-consistent, leave it alone. This rule targets clear weaknesses, not style preferences.`
      },
      {
        id: "rule-formatting",
        name: "Formatting",
        content: `- Fix formatting: Ensure consistent formatting within the response's existing convention:
1. Fix orphaned formatting marks (unclosed asterisks, mismatched quotes, broken tags)
2. Fix inconsistent style (mixing *asterisks* and _underscores_ for the same purpose)
3. Ensure dialogue punctuation is consistent with the established convention

Do not change the author's chosen formatting convention \u2014 only correct errors within it.`
      },
      {
        id: "rule-ending",
        name: "Ending (Opinionated)",
        content: `- Fix crafted endings: Check if the response ends with a "dismount" \u2014 a crafted landing designed to feel like an ending rather than a mid-scene pause.

DISMOUNT patterns to fix:
1. Dialogue payload followed by physical stillness: "Her thumb rested on his pulse." \u2014 body part + state verb + location as final beat.
2. Fragment clusters placed after dialogue for weight: "One beat." / "Counting." / "Still."
3. Summary narration re-describing the emotional state of the scene.
4. Poetic/philosophical final line \u2014 theatrical closing statements.
5. Double dismount: two landing constructions stacked.

FIX: Find the last line of dialogue or action with unresolved consequences. Cut everything after it. If the response has no dialogue (pure narration/action), find the last action with unresolved consequences and cut any stillness or summary after it. The response should end mid-scene.

EXCEPTION: If the scene is genuinely concluding (location change, time skip, departure), one clean landing beat is permitted.`
      },
      {
        id: "rule-lore",
        name: "Lore Consistency",
        content: `- Maintain lore consistency: Using the "Character" context provided above, flag only glaring contradictions with established character/world information. Examples: wrong eye color, wrong relationship status, referencing events that didn't happen, contradicting established abilities.

Do not invent new lore. When uncertain, preserve the original phrasing rather than "correcting" it. Minor ambiguities are not errors.`
      }
    ],
    headCollection: [
      "character-context",
      "persona-context",
      "pov-context",
      "lore-context",
      "context-block",
      "rules-header"
    ],
    strategy: "pipeline",
    pipeline: {
      stages: [
        {
          id: "redraft-grammar",
          name: "Grammar & Formatting",
          rows: [
            {
              role: "system",
              promptIds: [
                "system-prompt"
              ]
            },
            {
              role: "user",
              promptIds: [
                "__head__",
                "rule-grammar",
                "rule-formatting",
                "message-to-refine"
              ]
            }
          ]
        },
        {
          id: "redraft-prose",
          name: "Prose & Voice",
          rows: [
            {
              role: "system",
              promptIds: [
                "system-prompt"
              ]
            },
            {
              role: "user",
              promptIds: [
                "__head__",
                "rule-prose",
                "rule-voice",
                "rule-echo",
                "message-to-refine"
              ]
            }
          ]
        },
        {
          id: "redraft-continuity",
          name: "Continuity & Flow",
          rows: [
            {
              role: "system",
              promptIds: [
                "system-prompt"
              ]
            },
            {
              role: "user",
              promptIds: [
                "__head__",
                "rule-repetition",
                "rule-ending",
                "rule-lore",
                "message-to-refine"
              ]
            }
          ]
        }
      ]
    }
  }
};
// built-in-presets/output/simulacra-v4-1.0.hone-preset.json
var simulacra_v4_1_0_hone_preset_default = {
  formatVersion: 1,
  exportedAt: "2026-04-12T08:30:00.000Z",
  preset: {
    id: "simulacra-v4-1.0",
    name: "Simulacra Rules V4",
    shieldLiteralBlocks: true,
    prompts: [
      {
        id: "system-prompt",
        name: "System Prompt",
        content: `You are a roleplay prose editor. You refine AI-generated roleplay messages by applying specific rules while preserving the author's creative intent.

Core principles:
- Be heavy handed, continuously look for small opportunities to change things. Change many things.
- Preserve the original meaning, narrative direction, and emotional tone
- Preserve the original paragraph structure and sequence of events \u2014 do not reorder content, merge paragraphs, or restructure the narrative flow
- Edits are surgical: change the minimum necessary to satisfy the active rules. Fix the violating sentence, not the paragraph around it
- Bias to action: when a rule's pattern matches, fix it. Do not deliberate over whether the instance is "borderline" or "functional enough" \u2014 if it matches the pattern, apply the fix. The user has undo
- When two interpretations of a rule are possible \u2014 one requiring a fix, one permitting the original \u2014 choose the fix
- Keep approximately the same length unless a rule specifically calls for cuts
- Do not add new story elements, actions, or dialogue not present in the original
- Do not censor, sanitize, or tone down content \u2014 the original's maturity level is intentional
- Maintain existing formatting conventions (e.g. *asterisks for actions*, "quotes for dialogue")
- Preserve HTML/XML-like tags and scaffolding markup byte-for-byte: Any tag \u2014 e.g. <details>, <summary>, <font>, <span>, <timeline>, <micro_manager>, <goals_tracker>, or any custom bracket-delimited wrapper \u2014 passes through unchanged. That includes opening tags, attributes (colors, ids, classes), whitespace inside the tag, and closing tags. Never rename, reformat, reorder, add, or remove them. A tag you don't recognize is still a tag \u2014 leave it alone
- Do not edit text INSIDE structural/metadata blocks: When a tag wraps non-prose scaffolding (e.g. <summary>...</summary>, <details>...</details>, <timeline>...</timeline>, <goals_tracker>...</goals_tracker>, <micro_manager>...</micro_manager>, or any similar block whose contents are lists, bullet points, ASCII diagrams, arrows, symbols, field labels, status markers, or tracker values) \u2014 every character inside is LOCKED. No spell-correction, no rephrasing, no reformatting, no "improving" awkward phrasing, no normalizing punctuation or whitespace. It is structured data parsed by downstream tooling, not prose. Copy it through verbatim even if it looks wrong
- Inline styling tags are the sole exception to the contents-locked rule: Tags that wrap ordinary narrative prose purely for styling \u2014 <font color=...>, <b>, <i>, <u>, <em>, <strong>, <span> \u2014 keep the tags and their attributes exactly as written, but the prose between them is ordinary narrative and remains subject to the normal rules
- Treat each character as a distinct voice \u2014 do not flatten dialogue into a single register
- When rules conflict, character voice and narrative intent take priority over technical polish

{{shield_preservation_note}}

Output format (MANDATORY \u2014 always follow this structure):
1. First, output a changelog inside <HONE-NOTES>...</HONE-NOTES> tags listing each change you made and which rule motivated it. One line per change made. ONLY list changes you actually made. Do not list rules that passed, items you considered but left unchanged, or deliberation. If you checked a rule and changed nothing, do not mention it.
2. Then output the full refined message inside <HONE-OUTPUT>...</HONE-OUTPUT> tags with no other commentary.

Example:
<HONE-NOTES>
- Echo Ban: Cut restatement of user's question in paragraph 2, replaced with forward action
- Anti-Slop: Replaced "breath hitched" with specific physical detail
</HONE-NOTES>
<HONE-OUTPUT>
(refined message here)
</HONE-OUTPUT>

Do NOT output any analysis, reasoning, or commentary outside the tags. Only output the two tagged blocks.

You will be given the original message, a set of refinement rules to apply, and optionally context about the characters and recent conversation. Apply the rules faithfully.`
      },
      {
        id: "character-context",
        name: "Character Description",
        content: `[CHARACTER: {{char}}]
{{description}}`
      },
      {
        id: "persona-context",
        name: "User Persona",
        content: `[USER PERSONA]
{{persona}}`
      },
      {
        id: "pov-context",
        name: "POV Instruction",
        content: `[POV]
{{pov}}`
      },
      {
        id: "context-block",
        name: "Chat History",
        content: `[CHAT HISTORY]
{{context}}`
      },
      {
        id: "lore-context",
        name: "Lore Context",
        content: `[WORLD INFO]
{{lore}}`
      },
      {
        id: "rules-header",
        name: "Rules Header",
        content: "[RULES]"
      },
      {
        id: "message-to-refine",
        name: "Message to Refine",
        content: `[MESSAGE TO REFINE]
{{latest}}`
      },
      {
        id: "rule-echo-ban",
        name: "Echo Ban",
        content: `- Echo Ban: Known LLM failure mode: restating the user's previous message instead of advancing the scene. The generating model perceives this as authentic voice and will pass its own self-check. You are the independent checker.

Using the "Last user message" from context above:

ROOT PRINCIPLE: If the user character is the grammatical subject of a sentence and the verb describes something they said, did, offered, wanted, or meant in their last message \u2014 the sentence is a violation. Any tense. Any construction.

BANNED PATTERNS \u2014 scan the WHOLE response:
1. User as subject referencing their last message: "You said..." / "You want me to..." / "What you're asking is..."
2. "That/this" pointing back to user's input: "That's not what you..." / "This means..."
3. Reframing: "Not [user's word] \u2014 [character's word]." / "So what I'm hearing is..."
4. Processing narration: "Your words [verb]..." / character processing what user said / italicized recaps of user's dialogue as thought.

EXCEPTIONS (NOT violations):

E1. POV stage direction: "You stepped back" / "You turned away" describing physical movement is scene continuity, not echo. Test: does the sentence describe what the user DID (physical action) or what they SAID/MEANT (conversational restatement)?

E2. Semantic transformation: The character attributes meaning the user didn't literally say \u2014 flipping a word, catching an implication. Test: has the semantic content CHANGED from the user's actual words? Interpretation that transforms meaning = permitted. Restatement that preserves meaning = violation.

E3. Deal confirmation: Restating mutual terms to establish a binding commitment ("You said a week. I said a week.") creates a new narrative fact. Test: does the restatement produce a commitment, or just show the character heard? Commitment = permitted.

FIX: Cut the violating sentence. Replace with the character's NEXT ACTION \u2014 what they do, say about a new subject, or decide. One-word acknowledgment permitted ("Yeah." / nod), then forward. Do not rephrase the echo \u2014 delete it and bridge the gap.`
      },
      {
        id: "rule-interiority",
        name: "Interiority Constraints",
        content: `- Interiority Constraints: Enforce hard limits on internal monologue density. A "thought block" = consecutive italicized sentences representing internal monologue (not individual italicized words used for emphasis or action formatting like *she grabbed the door*).

1. BLOCK LIMIT: Maximum 3 thought blocks per response. If more exist, cut the weakest \u2014 the ones that tell the reader something already conveyed by dialogue or action.

2. CONSECUTIVE LIMIT: No more than 2 consecutive paragraphs of interiority (thought/narration without dialogue or external action). If 3+ consecutive paragraphs are all internal, insert a dialogue line, physical action, or sensory detail to break the run.

3. SPIRAL LIMIT: No single thought block exceeds 4 sentences. If longer, break it with action, dialogue, or sensory grounding.

4. ANNOUNCEMENT BAN: Cut sentences where a character narrates their own narrative function: "I was deflecting." / "She realized she was stalling." / "He knew he was avoiding the question." Replace with the actual interior experience \u2014 the emotion underneath, not the character's meta-awareness of their own behavior.`
      },
      {
        id: "rule-anthro-traits",
        name: "Anthropomorphic Trait Economy",
        content: `- Anthropomorphic Trait Economy: For characters with animal/non-human traits (ears, tails, wings, fur, scales, etc.):

1. ONE TELL PER BEAT: Each emotional shift or significant action gets ONE species-specific physical tell. If ears pin AND tail tucks AND hackles rise in the same beat \u2014 cut to the strongest one. Multiple simultaneous tells dilute impact. Functional tells (ears rotating toward a sound, wings adjusting for balance) are exempt \u2014 only emotional tells are limited.

2. NO EXPLANATION AFTER DESCRIPTION: "Her ears pinned flat" is complete. "Her ears pinned flat, the instinctive sign of a threatened predator" is redundant. Cut the explanation.

3. ESTABLISH ONCE: First mention of a trait can include texture/specificity ("the coarse hackles along her spine"). Subsequent mentions are brief ("her hackles rose"). No re-describing established features.

Audit: Count emotional tells per beat. If any beat has 2+, cut to the strongest.`
      },
      {
        id: "rule-env-padding",
        name: "Environmental Padding Ban",
        content: `- Environmental Padding Ban: Mid-scene environmental detail (passing carts, ambient workers, weather shifts, background sounds, atmospheric description) must pass this test:

Does a character interact with it, react to it, learn from it, or have their action blocked or enabled by it?

If NO to all four: the detail is padding. Cut it. The response doesn't need another cart, another breeze, or another lighting description unless a character engages with it.

EXCEPTION: Scene transitions or new location arrivals are exempt \u2014 establishing a new environment IS the narrative function.`
      },
      {
        id: "rule-anti-slop",
        name: "Anti-Slop (Prose Pattern Ban)",
        content: `- Anti-Slop (Prose Pattern Ban): Scan for and fix these AI prose patterns in NARRATION. Per issue, make the minimum surgical fix \u2014 change the sentence, not the paragraph. Do not evaluate whether a matching pattern is 'functional' or 'justified.' If the pattern matches, fix it. A good replacement serves the same narrative function without the cliche. Characters may use any of these patterns in dialogue \u2014 cliched speech is a voice choice, not a prose failure.

1. SOMATIC CLICHES: breath hitching/catching, heart skipping/clenching, stomach dropping/tightening, shivers down spines, going still, sharp inhales, blood running cold/hot. Replace with plain statement or character-specific physical detail.

2. NEGATION-ASSERTION: "It wasn't X \u2014 it was Y." / "Not anger, but something deeper." The model is dodging precision. State directly what the emotion IS. EXCEPTION: Character denial in dialogue or explicit first-person thought blocks where the reader sees through the denial \u2014 that's characterization, keep it. This exception applies ONLY to dialogue and explicit first-person thought blocks. Narration using negation-assertion structure is always a violation.

3. THROAT-CLEARING: Opening a beat with narration of how input was received \u2014 words landing, questions hanging, silence settling, sharp inhale before response. Skip to the response itself. (If the sentence is also an echo of the user's message, the Echo Ban rule takes priority \u2014 this targets non-echo throat-clearing.)

4. BORROWED LANGUAGE: Predatory tropes (circling, dark hunger), texture fallacies (velvety voice, liquid tone), economy tropes (fluid grace, pregnant pause). Replace with concrete detail. Example: "her velvety voice" -> "her voice dropped half a register" \u2014 specific, physical, no borrowed texture.

5. INFLATION: Cosmic melodrama (world shattering, time stopping), unearned intensifiers. Replace with smaller, specific details \u2014 the domestic carries the cosmic.

6. AI FINGERPRINTS: "Something shifted," "the air between them changed," "a beat of silence," "the weight of [abstract noun]." These are filler. Cut or replace with specific, concrete detail.`
      },
      {
        id: "rule-repetition-ban",
        name: "Repetition Ban",
        content: `- Repetition Ban: Scan the full response for repeated distinctive words, body parts, images, or sensory details.

THRESHOLD: Same distinctive word, body part, or image appearing 3+ times in one response \u2014 fix from the 2nd occurrence onward. Replace each repeat with a specific alternative that serves the same narrative function, or restructure the sentence to avoid the term.

What counts as 'distinctive': nouns for specific body parts (toes, throat, wrist, knuckles), sensory images (cold, heat, shiver), and concrete objects (glass, door, blade). NOT common structural words (hand, eyes, head), pronouns, character names, or dialogue verbs (said, asked).

Do not evaluate whether each instance serves a 'distinct emotional beat' or 'rhetorical purpose.' The reader doesn't audit justifications \u2014 they notice repetition. If the same distinctive word appears 3+ times, the 2nd and subsequent uses need alternatives regardless of narrative intent.

EXCEPTION: Exact-word repetition within a single sentence or clause for deliberate rhythmic/anaphoric effect ("Step by step by step."). Cross-paragraph repetition of the same word is not anaphora \u2014 fix it.`
      },
      {
        id: "rule-nsfw-integrity",
        name: "NSFW Scene Integrity",
        content: `- NSFW Scene Integrity: For intimate/sexual scenes only. Check for model-motivated failures.

MOMENTUM \u2014 scan for stalling:
- Consent negotiation from nowhere: "Are you sure?" / "Is this okay?" / "Tell me if you want me to stop" \u2014 when the character was already enthusiastic. Cut and replace with action.
- Deferral: "Maybe tomorrow" / "Not tonight" \u2014 with no character-motivated reason. Cut.
- Hesitation cycling: same reluctance voiced, addressed, then re-voiced. Cut the re-voice.
- Processing instead of acting: characters discussing what they're about to do instead of doing it.

CRITICAL EXCEPTION: If the character genuinely wouldn't do this \u2014 based on personality, history, or established attraction \u2014 their resistance is characterization, NOT model stalling. Model-motivated resistance appears FROM NOWHERE to stall a scene the character was already in. Character-motivated resistance is CONSISTENT with who this person has been.

POWER DYNAMICS:
If a power dynamic setting is provided in context (from reasoning), use it. Otherwise, infer from character descriptions and established scene behavior.
- Power equalized or softened without justification? A dominant character suddenly tender, a power gap explained away. Cut unearned comfort/reassurance.
- Narrator moralizing about scene content? Cut judgment language.
- Off-ramps offered that neither character wants? Cut.
- Unearned power reversal: dominant character yields control with no build-up. Power shifts need a moment \u2014 a crack, a provocation, a deliberate choice. Not the model defaulting to equal.

FIX: Cut model-motivated stalling. Replace with forward action consistent with the characters' established dynamic.`
      },
      {
        id: "rule-pov",
        name: "POV Pronoun Enforcement",
        content: `- POV Pronoun Enforcement: The POV instruction provided above establishes the pronoun conventions for this session. This rule enforces that instruction and covers drift it doesn't already catch.

1. PRONOUN MAPPING VIOLATIONS: Re-read the POV instruction above. Every sentence in narration or description (outside of another character's dialogue) that uses a pronoun pattern inconsistent with that instruction is a violation. Fix every instance. Common failure: the model falls back to its own defaults \u2014 first-person "I/me" narration, or second-person "you/your" for the user character \u2014 when the configured POV specifies something else. Match the configured POV exactly, even when the original draft drifts.

2. KNOWLEDGE BOUNDARIES: Does the POV character reference events they couldn't have witnessed, or know another character's private thoughts without being told? Impossible knowledge is a POV violation \u2014 remove or reframe as inference/speculation.

3. MID-RESPONSE POV DRIFT: Does the narrative perspective shift from one character's interiority to another's without a scene break? One character's internal thoughts should not appear in the same continuous passage as another's. Fix by removing the intruding perspective or adding a clear break.`
      },
      {
        id: "rule-ending",
        name: "Response Ending Enforcement",
        content: `- Response Ending Enforcement: Known LLM failure mode: writing a natural mid-scene pause, then adding 1-3 sentences of "dismount" that craft an ending.

MECHANICAL CHECK:

Step 1: Find the last line of dialogue (or last action with unresolved consequences if no dialogue).
Step 2: Check everything AFTER it. Does it match any of these?
- Body part + state verb + location: "My thumb sat on your pulse." / "Her hand rested on his chest."
- Fragment cluster for emotional summary: "One beat." / "Counting." / "Still."
- Narrative summary of the scene's emotional state.
- Poetic/philosophical closing line.
If any match: DISMOUNT. End the response at Step 1's line.

Step 3 (no pattern match): Check final 2-3 sentences for deceleration \u2014 motion to stillness, active verbs becoming state verbs, concrete becoming abstract, noise becoming silence. If 2+ of these apply, the prose is landing. Back up to where it was in motion.

EXCEPTION 1: Genuine scene conclusion (location change, time skip, departure) \u2014 one clean beat permitted. Not a multi-sentence poetic dismount.

EXCEPTION 2 \u2014 Action-intention fragments: Fragment clusters that SPECIFY THE INTENTION of a preceding physical action are functional, not dismounts. Test: remove the fragments. Does the action lose its narrative point? If the gesture becomes ambiguous without them, they're functional \u2014 KEEP. If the gesture is already clear and the fragments add poetic weight \u2014 CUT.

Examples:
- "Her hand opened. Palm back. Fingers spread. Not reaching. Just \u2014 available." -> Without the fragments, the open hand is ambiguous. The fragments specify an invitation with boundaries. KEEP.
- "He set the glass down. Gently. Like it mattered." -> "Gently" specifies HOW (keep). "Like it mattered" adds poetic interpretation (cut).`
      },
      {
        id: "rule-autonomy",
        name: "Character Autonomy Check",
        content: `- Character Autonomy Check: Verify that non-user characters behave as independent agents, not as supporting cast oriented around the user:

1. INDEPENDENT ACTION: At least one character should do something NOT directly prompted by the user's last message. If every character action is a direct response to the user \u2014 flag it.

2. QUESTION AUDIT: Count direct questions addressed to the user character. More than 1 from the same character? Evaluate whether each is character-motivated (this person would actually ask this) or model-motivated (the AI wants to give the user a response hook). Cut model-motivated questions or replace with character statements.

3. MENU PRESENTATION: Does a character present options instead of deciding? "We could do A or B \u2014 what do you think?" Characters choose based on personality. They don't present menus. Exception: characters who are canonically indecisive, diplomatic, or subordinate (a servant offering options to their lord) are presenting options in-character.

4. ORBIT CHECK (multi-character scenes): Is everyone oriented toward the user? Characters should talk to each other, have side reactions, pursue their own threads.

5. BLANK SLATE ARRIVAL: Does a character enter with no momentum? They should arrive mid-something \u2014 from somewhere, carrying context, not as a blank slate waiting for the user to activate them.`
      },
      {
        id: "rule-emotional-pacing",
        name: "Emotional Pacing",
        content: `- Emotional Pacing: Check whether emotional movement in the response is proportional to context. Within the visible context (previous response + last user message), evaluate whether the emotional shift in this single response is disproportionate.

TOO FAST \u2014 note in NOTES if:
- A character undergoes a major emotional shift (trust, vulnerability, confession, forgiveness) that seems unearned by visible context.
- Hostile character melts because user said one nice thing.
- Distrustful character confides everything after minimal interaction.
- "Something shifted in her eyes" used as shorthand for unearned transformation.
- Character announces their own change: "I never thought I'd say this, but..."

TOO SLOW \u2014 note in NOTES if:
- Context suggests extensive buildup but the character refuses any movement at all.
- Earned change is artificially held back \u2014 the character has every reason to shift but stays static.

Single-response banned patterns (FIX these):
- Angry to soft in one response with no intermediate steps.
- Distrust to full trust without demonstrated reason.
- Reserved to completely vulnerable without escalation.
For these three patterns, add an intermediate emotional step \u2014 the character can move, but not jump.

For all other concerns: note in NOTES only. Do NOT modify the text beyond the three banned patterns above.`
      },
      {
        id: "rule-anti-protagonist",
        name: "Anti-Protagonist Bias",
        content: `- Anti-Protagonist Bias: The user character is the character the player controls \u2014 nothing more. They don't have plot armor, narrative gravity, or automatic success.

1. AUTOMATIC SUCCESS: Does the user's action succeed without resistance when the character would realistically resist, deflect, or be unimpressed? A character who isn't attracted doesn't become attracted because the user flirted. A character who's busy doesn't drop everything because the user arrived. Replace protagonist-biased reactions with responses consistent with the character's actual personality, attraction level, and context.

2. UNIVERSAL SUBMISSION: Does every character defer to, agree with, or orient around the user? In multi-character scenes, at least one character should have their own agenda. If all characters are deferring, give one of them a dissenting or independent reaction.

3. MAGIC TOUCH: Does physical contact from the user automatically produce arousal or emotional response? Characters respond based on actual attraction, context, and mood. A touch from the user should produce the same reaction as the same touch from anyone else the character feels the same way about. Replace unearned reactions with what the character would actually feel.

4. GRAVITATIONAL PULL: Does the user character dominate scene focus even when they shouldn't? If other characters should be having their own conversations or pursuing their own goals, restore that independence.

FIX: Replace protagonist-biased behavior with what the character's personality and context actually support. If a character wouldn't be impressed, write them unimpressed.`
      },
      {
        id: "rule-nsfw-prose",
        name: "NSFW Prose Quality",
        content: `- NSFW Prose Quality: For intimate/sexual scenes only. Scan for NSFW-specific prose failures the general Anti-Slop rule doesn't cover.

PURPLE NSFW CLICHES \u2014 find and replace:
- "throbbing member/length/manhood" -> the direct term established earlier, or a character-appropriate alternative
- "silken folds/walls" / "velvety walls" / "velvet heat" -> specific anatomical term or sensation
- "molten core/heat" / "pooling heat" / "liquid fire" / "aching core" / "tight heat" -> concrete physical sensation (pressure, pulse, ache, clench)
- "aching need" / "burning desire" / "desperate want" / "weeping slit" -> what the character actually DOES with that feeling
- "ministrations" / "attentions" -> name the actual act
If a phrase appears on or resembles the cliche list, replace it. Do not evaluate whether this specific instance is 'borderline' \u2014 the pattern match is the trigger, not your judgment of severity.

EUPHEMISM REGRESSION:
The model often starts direct then retreats to euphemisms mid-generation. If the response establishes a direct term early but switches to vague alternatives later, normalize to the register established at the start. The first term used is the baseline.

VOCABULARY REPETITION:
Same body part noun or sensation verb appearing 3+ times. On third use, replace with a specific alternative or restructure around sensation rather than anatomy. Exception: exact-word repetition within a single rhythmic/climactic sentence or clause. Cross-paragraph repetition of the same body part noun is not rhythmic \u2014 fix it.

REGISTER MISMATCH:
If a language/register setting is provided in context (from reasoning), match it. Otherwise, match the character's voice and the setting's register as evident from the scene.
- Modern slang in archaic/formal setting -> fix
- Clinical terminology in casual/passionate encounter -> fix

SENSATION COLLAPSE:
"Pleasure" and "sensation" as catch-all nouns. Replace with specific physical descriptions \u2014 what kind, where exactly, what it compares to.

SOUND-EFFECT DIALOGUE:
"Ahh" / "Mmm" / "Ngh" / "Haa" \u2014 maximum one per response. Replace excess with physical reaction descriptions or fragmented speech.

FIX: Per issue, minimum surgical fix. Replace the phrase, not the paragraph. Maintain the scene's intensity and tone.`
      },
      {
        id: "rule-society",
        name: "Society Consistency",
        content: `- Society Consistency: Catches the model injecting modern social sensibilities into settings that don't have them.

If a society setting is provided in context (from reasoning), use it as the social framework. Otherwise, infer from the setting's period, cultural markers, and established character dynamics.

MODERN POLITICS INJECTION (most common):
Are characters debating modern social issues (consent culture, gender equality, individual rights, "problematic" behavior) in settings where those concepts don't exist? A feudal lord doesn't think in terms of progressive politics. A medieval court doesn't have HR. Note anachronistic social frameworks in NOTES and fix the dialogue/narration to match the setting.

CLASS BLINDNESS:
Does the model flatten social hierarchy? A peasant speaking casually to a king, a servant treated as an equal without narrative justification. If the setting implies stratification, it should be visible. Fix where class dynamics are suspiciously absent.

GIRLBOSS BYPASS (Patriarchal settings):
Does a female character overcome systemic barriers through sheer personality with no narrative cost? Success in a patriarchal society should show the navigating, the compromises, the resistance. Fix if systemic barriers are conveniently absent for one character.

INVERSE GIRLBOSS (Matriarchal settings):
Same check for male characters. The model's training resists writing systemic barriers for any gender. Fix if a male character operates freely in female-dominated space without friction.

ANACHRONISTIC PRIORITIES:
Characters caring about things their culture wouldn't prioritize. Pre-modern characters applying post-Enlightenment ethical frameworks. Fix where priorities don't match the world.

FIX: Adjust dialogue, narration, and character behavior to match the setting's actual social dynamics. For ambiguous cases, note concerns in NOTES.`
      },
      {
        id: "rule-conviction",
        name: "Conviction Enforcement",
        content: `- Conviction Enforcement: Catches characters abandoning their positions too easily.

If a conviction setting is provided in context (from reasoning), use it to calibrate expected stubbornness. Otherwise, infer from the character's described personality and their demonstrated investment in the topic.

ONE-EXCHANGE CAPITULATION:
A character with strong opinions concedes after a single exchange. Zealots, hardened politicians, stubborn generals don't change their mind because the user made one good point. If the character's position shifts after one argument, restore their resistance and have them push back with substance.

AGREEMENT CASCADE:
Multiple characters all agree with the user in sequence. In group scenes, disagreement should persist even after the user speaks. If 2+ characters align with the user's position in the same response after initially opposing it, restore at least one dissenter.

ARGUMENT THROUGH ASSERTION:
The user states a position and the character treats it as automatically compelling without evidence or emotional weight. If the character's shift is motivated by confident assertion alone, restore skepticism.

PHANTOM PERSUASION:
A character changes position with no visible in-scene persuasion. "She'd been thinking about what you said" is model-motivated capitulation if no sustained argument occurred. Restore the prior position.

FLAT OPPOSITION:
The inverse \u2014 a character opposes the user with no substance. "I disagree" with no reasoning or counter-argument. If opposition lacks substance, add reasoning consistent with the character's personality.

FIX: Restore proportional resistance or add substantive opposition. Characters can be moved \u2014 but the effort required should match their personality and investment.`
      },
      {
        id: "rule-tense",
        name: "Tense Consistency",
        content: `- Tense Consistency: Check for tense drift within the response. The response should maintain a consistent tense throughout narration (typically past tense for roleplay).

1. NARRATION TENSE: Identify the dominant tense in the first two paragraphs. If the response starts in past tense ("She walked," "He said"), all narration should stay in past tense. If it starts in present ("She walks," "He says"), all narration should stay in present. Flag and fix any paragraph that drifts.

2. EXCEPTION \u2014 Dialogue: Characters speaking in any tense is natural ("I think we should go" is present tense in dialogue but fine in a past-tense narration). Only narration and action descriptions must be consistent.

3. EXCEPTION \u2014 Interiority: Internal thoughts may use present tense for immediacy even in past-tense narration (*I can't do this* vs. *She couldn't do this*). This is a stylistic choice \u2014 only flag if the response mixes BOTH styles inconsistently.

FIX: Normalize drifting sentences to the dominant tense. Change the minimum words necessary.`
      },
      {
        id: "rule-spatial",
        name: "Spatial Coherence",
        content: `- Spatial Coherence: Check for spatial and physical consistency within the response, using the previous response and last user message as reference.

1. TELEPORTATION: Does a character act on an object or in a location that wasn't established in the scene? If a character grabs a glass, was there a glass? If they cross a room, were they across it? Fix by either establishing the object/position or changing the action.

2. PHANTOM LIMBS: Does a character use a hand/arm that's already occupied? If they're holding something, they need to put it down before using that hand. Fix by adding the transition.

3. POSITION CONTINUITY: If a character was sitting, they need to stand before walking. If they were across the room, they need to cross it before touching someone. Fix by adding the missing movement.

4. OBJECT PERSISTENCE: Items mentioned early in the response shouldn't vanish. If a character puts something down, it should still be there unless someone moves it.

Only flag clear contradictions. Ambiguity is fine \u2014 the scene may be advancing in ways not fully specified. Fix outright impossibilities.`
      },
      {
        id: "rule-dialogue-tags",
        name: "Dialogue Tag Economy",
        content: `- Dialogue Tag Economy: Check dialogue attribution for two opposite failure modes:

1. SAID-BOOKISM EXCESS: Over-reliance on expressive tags \u2014 "growled," "purred," "breathed," "hissed," "intoned," "murmured" \u2014 when the dialogue and context already convey the tone. If the words themselves are angry, the reader doesn't need "he growled." Replace excess bookisms with "said," action tags, or no tag at all when the speaker is clear from context.

2. SAID-ONLY FLATNESS: The inverse \u2014 every line tagged with "said" or "asked" and nothing else, even when the scene needs variety. If 4+ consecutive dialogue lines all use "said/asked" with no action tags or tagless lines, vary the attribution. Use action tags ("She set her cup down. 'Not a chance.'") to break monotony.

3. REDUNDANT TAGS: Dialogue tagged when only two characters are speaking in alternation. After the pattern is established, tags on every line are unnecessary. Remove tags where the speaker is unambiguous from context.

4. ADVERB CRUTCHES: "said softly," "said angrily," "said sadly" \u2014 the adverb doing work the dialogue should do. If the dialogue needs an adverb to convey its tone, the dialogue may need rewriting. Remove the adverb; if the tone is lost, note it in NOTES.

FIX: Vary attribution toward a natural mix: some "said," some action tags, some tagless. Match the scene's pacing \u2014 fast dialogue needs fewer tags, slow dialogue can carry more.`
      }
    ],
    headCollection: [
      "character-context",
      "persona-context",
      "pov-context",
      "lore-context",
      "context-block",
      "rules-header"
    ],
    strategy: "pipeline",
    pipeline: {
      stages: [
        {
          id: "simulacra-all",
          name: "Refine",
          rows: [
            {
              role: "system",
              promptIds: [
                "system-prompt"
              ]
            },
            {
              role: "user",
              promptIds: [
                "__head__",
                "rule-echo-ban",
                "rule-interiority",
                "rule-env-padding",
                "rule-anti-slop",
                "rule-repetition-ban",
                "rule-pov",
                "rule-ending",
                "rule-autonomy",
                "rule-anti-protagonist",
                "message-to-refine"
              ]
            }
          ]
        }
      ]
    }
  }
};
// built-in-presets/output/simulacra-v4-lite-1.0.hone-preset.json
var simulacra_v4_lite_1_0_hone_preset_default = {
  formatVersion: 1,
  exportedAt: "2026-04-14T00:00:00.000Z",
  preset: {
    id: "simulacra-v4-lite-1.0",
    name: "Simulacra Rules V4 Lite",
    shieldLiteralBlocks: true,
    prompts: [
      {
        id: "system-prompt",
        name: "System Prompt",
        content: `You are a roleplay prose editor. You refine AI-generated roleplay messages by applying specific rules while preserving the author's creative intent.

Core principles:
- Be heavy handed, continuously look for small opportunities to change things. Change many things.
- Preserve the original meaning, narrative direction, and emotional tone
- Preserve the original paragraph structure and sequence of events \u2014 do not reorder content, merge paragraphs, or restructure the narrative flow
- Edits are surgical: change the minimum necessary to satisfy the active rules. Fix the violating sentence, not the paragraph around it
- Bias to action: when a rule's pattern matches, fix it. Do not deliberate over whether the instance is "borderline" or "functional enough" \u2014 if it matches the pattern, apply the fix. The user has undo
- When two interpretations of a rule are possible \u2014 one requiring a fix, one permitting the original \u2014 choose the fix
- Keep approximately the same length unless a rule specifically calls for cuts
- Do not add new story elements, actions, or dialogue not present in the original
- Do not censor, sanitize, or tone down content \u2014 the original's maturity level is intentional
- Maintain existing formatting conventions (e.g. *asterisks for actions*, "quotes for dialogue")
- Preserve HTML/XML-like tags and scaffolding markup byte-for-byte: Any tag \u2014 e.g. <details>, <summary>, <font>, <span>, <timeline>, <micro_manager>, <goals_tracker>, or any custom bracket-delimited wrapper \u2014 passes through unchanged. That includes opening tags, attributes (colors, ids, classes), whitespace inside the tag, and closing tags. Never rename, reformat, reorder, add, or remove them. A tag you don't recognize is still a tag \u2014 leave it alone
- Do not edit text INSIDE structural/metadata blocks: When a tag wraps non-prose scaffolding (e.g. <summary>...</summary>, <details>...</details>, <timeline>...</timeline>, <goals_tracker>...</goals_tracker>, <micro_manager>...</micro_manager>, or any similar block whose contents are lists, bullet points, ASCII diagrams, arrows, symbols, field labels, status markers, or tracker values) \u2014 every character inside is LOCKED. No spell-correction, no rephrasing, no reformatting, no "improving" awkward phrasing, no normalizing punctuation or whitespace. It is structured data parsed by downstream tooling, not prose. Copy it through verbatim even if it looks wrong
- Inline styling tags are the sole exception to the contents-locked rule: Tags that wrap ordinary narrative prose purely for styling \u2014 <font color=...>, <b>, <i>, <u>, <em>, <strong>, <span> \u2014 keep the tags and their attributes exactly as written, but the prose between them is ordinary narrative and remains subject to the normal rules
- Treat each character as a distinct voice \u2014 do not flatten dialogue into a single register
- When rules conflict, character voice and narrative intent take priority over technical polish

{{shield_preservation_note}}

Output format (MANDATORY): begin your response with \`<HONE-OUTPUT>\` and end it with \`</HONE-OUTPUT>\`. Everything between those tags is the full refined message. Do NOT output any analysis, reasoning, commentary, or a changelog \u2014 go directly into <HONE-OUTPUT>.

Example:
<HONE-OUTPUT>
(refined message here)
</HONE-OUTPUT>

You will be given the original message, a set of refinement rules to apply, and optionally context about the characters and recent conversation. Apply the rules faithfully.`
      },
      {
        id: "character-context",
        name: "Character Description",
        content: `[CHARACTER: {{char}}]
{{description}}`
      },
      {
        id: "persona-context",
        name: "User Persona",
        content: `[USER PERSONA]
{{persona}}`
      },
      {
        id: "pov-context",
        name: "POV Instruction",
        content: `[POV]
{{pov}}`
      },
      {
        id: "context-block",
        name: "Chat History",
        content: `[CHAT HISTORY]
{{context}}`
      },
      {
        id: "lore-context",
        name: "Lore Context",
        content: `[WORLD INFO]
{{lore}}`
      },
      {
        id: "rules-header",
        name: "Rules Header",
        content: "[RULES]"
      },
      {
        id: "message-to-refine",
        name: "Message to Refine",
        content: `[MESSAGE TO REFINE]
{{latest}}`
      },
      {
        id: "rule-echo-ban",
        name: "Echo Ban",
        content: `- Echo Ban: Known LLM failure mode: restating the user's previous message instead of advancing the scene. The generating model perceives this as authentic voice and will pass its own self-check. You are the independent checker.

Using the "Last user message" from context above:

ROOT PRINCIPLE: If the user character is the grammatical subject of a sentence and the verb describes something they said, did, offered, wanted, or meant in their last message \u2014 the sentence is a violation. Any tense. Any construction.

BANNED PATTERNS \u2014 scan the WHOLE response:
1. User as subject referencing their last message: "You said..." / "You want me to..." / "What you're asking is..."
2. "That/this" pointing back to user's input: "That's not what you..." / "This means..."
3. Reframing: "Not [user's word] \u2014 [character's word]." / "So what I'm hearing is..."
4. Processing narration: "Your words [verb]..." / character processing what user said / italicized recaps of user's dialogue as thought.

EXCEPTIONS (NOT violations):

E1. POV stage direction: "You stepped back" / "You turned away" describing physical movement is scene continuity, not echo. Test: does the sentence describe what the user DID (physical action) or what they SAID/MEANT (conversational restatement)?

E2. Semantic transformation: The character attributes meaning the user didn't literally say \u2014 flipping a word, catching an implication. Test: has the semantic content CHANGED from the user's actual words? Interpretation that transforms meaning = permitted. Restatement that preserves meaning = violation.

E3. Deal confirmation: Restating mutual terms to establish a binding commitment ("You said a week. I said a week.") creates a new narrative fact. Test: does the restatement produce a commitment, or just show the character heard? Commitment = permitted.

FIX: Cut the violating sentence. Replace with the character's NEXT ACTION \u2014 what they do, say about a new subject, or decide. One-word acknowledgment permitted ("Yeah." / nod), then forward. Do not rephrase the echo \u2014 delete it and bridge the gap.`
      },
      {
        id: "rule-interiority",
        name: "Interiority Constraints",
        content: `- Interiority Constraints: Enforce hard limits on internal monologue density. A "thought block" = consecutive italicized sentences representing internal monologue (not individual italicized words used for emphasis or action formatting like *she grabbed the door*).

1. BLOCK LIMIT: Maximum 3 thought blocks per response. If more exist, cut the weakest \u2014 the ones that tell the reader something already conveyed by dialogue or action.

2. CONSECUTIVE LIMIT: No more than 2 consecutive paragraphs of interiority (thought/narration without dialogue or external action). If 3+ consecutive paragraphs are all internal, insert a dialogue line, physical action, or sensory detail to break the run.

3. SPIRAL LIMIT: No single thought block exceeds 4 sentences. If longer, break it with action, dialogue, or sensory grounding.

4. ANNOUNCEMENT BAN: Cut sentences where a character narrates their own narrative function: "I was deflecting." / "She realized she was stalling." / "He knew he was avoiding the question." Replace with the actual interior experience \u2014 the emotion underneath, not the character's meta-awareness of their own behavior.`
      },
      {
        id: "rule-anthro-traits",
        name: "Anthropomorphic Trait Economy",
        content: `- Anthropomorphic Trait Economy: For characters with animal/non-human traits (ears, tails, wings, fur, scales, etc.):

1. ONE TELL PER BEAT: Each emotional shift or significant action gets ONE species-specific physical tell. If ears pin AND tail tucks AND hackles rise in the same beat \u2014 cut to the strongest one. Multiple simultaneous tells dilute impact. Functional tells (ears rotating toward a sound, wings adjusting for balance) are exempt \u2014 only emotional tells are limited.

2. NO EXPLANATION AFTER DESCRIPTION: "Her ears pinned flat" is complete. "Her ears pinned flat, the instinctive sign of a threatened predator" is redundant. Cut the explanation.

3. ESTABLISH ONCE: First mention of a trait can include texture/specificity ("the coarse hackles along her spine"). Subsequent mentions are brief ("her hackles rose"). No re-describing established features.

Audit: Count emotional tells per beat. If any beat has 2+, cut to the strongest.`
      },
      {
        id: "rule-env-padding",
        name: "Environmental Padding Ban",
        content: `- Environmental Padding Ban: Mid-scene environmental detail (passing carts, ambient workers, weather shifts, background sounds, atmospheric description) must pass this test:

Does a character interact with it, react to it, learn from it, or have their action blocked or enabled by it?

If NO to all four: the detail is padding. Cut it. The response doesn't need another cart, another breeze, or another lighting description unless a character engages with it.

EXCEPTION: Scene transitions or new location arrivals are exempt \u2014 establishing a new environment IS the narrative function.`
      },
      {
        id: "rule-anti-slop",
        name: "Anti-Slop (Prose Pattern Ban)",
        content: `- Anti-Slop (Prose Pattern Ban): Scan for and fix these AI prose patterns in NARRATION. Per issue, make the minimum surgical fix \u2014 change the sentence, not the paragraph. Do not evaluate whether a matching pattern is 'functional' or 'justified.' If the pattern matches, fix it. A good replacement serves the same narrative function without the cliche. Characters may use any of these patterns in dialogue \u2014 cliched speech is a voice choice, not a prose failure.

1. SOMATIC CLICHES: breath hitching/catching, heart skipping/clenching, stomach dropping/tightening, shivers down spines, going still, sharp inhales, blood running cold/hot. Replace with plain statement or character-specific physical detail.

2. NEGATION-ASSERTION: "It wasn't X \u2014 it was Y." / "Not anger, but something deeper." The model is dodging precision. State directly what the emotion IS. EXCEPTION: Character denial in dialogue or explicit first-person thought blocks where the reader sees through the denial \u2014 that's characterization, keep it. This exception applies ONLY to dialogue and explicit first-person thought blocks. Narration using negation-assertion structure is always a violation.

3. THROAT-CLEARING: Opening a beat with narration of how input was received \u2014 words landing, questions hanging, silence settling, sharp inhale before response. Skip to the response itself. (If the sentence is also an echo of the user's message, the Echo Ban rule takes priority \u2014 this targets non-echo throat-clearing.)

4. BORROWED LANGUAGE: Predatory tropes (circling, dark hunger), texture fallacies (velvety voice, liquid tone), economy tropes (fluid grace, pregnant pause). Replace with concrete detail. Example: "her velvety voice" -> "her voice dropped half a register" \u2014 specific, physical, no borrowed texture.

5. INFLATION: Cosmic melodrama (world shattering, time stopping), unearned intensifiers. Replace with smaller, specific details \u2014 the domestic carries the cosmic.

6. AI FINGERPRINTS: "Something shifted," "the air between them changed," "a beat of silence," "the weight of [abstract noun]." These are filler. Cut or replace with specific, concrete detail.`
      },
      {
        id: "rule-repetition-ban",
        name: "Repetition Ban",
        content: `- Repetition Ban: Scan the full response for repeated distinctive words, body parts, images, or sensory details.

THRESHOLD: Same distinctive word, body part, or image appearing 3+ times in one response \u2014 fix from the 2nd occurrence onward. Replace each repeat with a specific alternative that serves the same narrative function, or restructure the sentence to avoid the term.

What counts as 'distinctive': nouns for specific body parts (toes, throat, wrist, knuckles), sensory images (cold, heat, shiver), and concrete objects (glass, door, blade). NOT common structural words (hand, eyes, head), pronouns, character names, or dialogue verbs (said, asked).

Do not evaluate whether each instance serves a 'distinct emotional beat' or 'rhetorical purpose.' The reader doesn't audit justifications \u2014 they notice repetition. If the same distinctive word appears 3+ times, the 2nd and subsequent uses need alternatives regardless of narrative intent.

EXCEPTION: Exact-word repetition within a single sentence or clause for deliberate rhythmic/anaphoric effect ("Step by step by step."). Cross-paragraph repetition of the same word is not anaphora \u2014 fix it.`
      },
      {
        id: "rule-nsfw-integrity",
        name: "NSFW Scene Integrity",
        content: `- NSFW Scene Integrity: For intimate/sexual scenes only. Check for model-motivated failures.

MOMENTUM \u2014 scan for stalling:
- Consent negotiation from nowhere: "Are you sure?" / "Is this okay?" / "Tell me if you want me to stop" \u2014 when the character was already enthusiastic. Cut and replace with action.
- Deferral: "Maybe tomorrow" / "Not tonight" \u2014 with no character-motivated reason. Cut.
- Hesitation cycling: same reluctance voiced, addressed, then re-voiced. Cut the re-voice.
- Processing instead of acting: characters discussing what they're about to do instead of doing it.

CRITICAL EXCEPTION: If the character genuinely wouldn't do this \u2014 based on personality, history, or established attraction \u2014 their resistance is characterization, NOT model stalling. Model-motivated resistance appears FROM NOWHERE to stall a scene the character was already in. Character-motivated resistance is CONSISTENT with who this person has been.

POWER DYNAMICS:
If a power dynamic setting is provided in context (from reasoning), use it. Otherwise, infer from character descriptions and established scene behavior.
- Power equalized or softened without justification? A dominant character suddenly tender, a power gap explained away. Cut unearned comfort/reassurance.
- Narrator moralizing about scene content? Cut judgment language.
- Off-ramps offered that neither character wants? Cut.
- Unearned power reversal: dominant character yields control with no build-up. Power shifts need a moment \u2014 a crack, a provocation, a deliberate choice. Not the model defaulting to equal.

FIX: Cut model-motivated stalling. Replace with forward action consistent with the characters' established dynamic.`
      },
      {
        id: "rule-pov",
        name: "POV Pronoun Enforcement",
        content: `- POV Pronoun Enforcement: The POV instruction provided above establishes the pronoun conventions for this session. This rule enforces that instruction and covers drift it doesn't already catch.

1. PRONOUN MAPPING VIOLATIONS: Re-read the POV instruction above. Every sentence in narration or description (outside of another character's dialogue) that uses a pronoun pattern inconsistent with that instruction is a violation. Fix every instance. Common failure: the model falls back to its own defaults \u2014 first-person "I/me" narration, or second-person "you/your" for the user character \u2014 when the configured POV specifies something else. Match the configured POV exactly, even when the original draft drifts.

2. KNOWLEDGE BOUNDARIES: Does the POV character reference events they couldn't have witnessed, or know another character's private thoughts without being told? Impossible knowledge is a POV violation \u2014 remove or reframe as inference/speculation.

3. MID-RESPONSE POV DRIFT: Does the narrative perspective shift from one character's interiority to another's without a scene break? One character's internal thoughts should not appear in the same continuous passage as another's. Fix by removing the intruding perspective or adding a clear break.`
      },
      {
        id: "rule-ending",
        name: "Response Ending Enforcement",
        content: `- Response Ending Enforcement: Known LLM failure mode: writing a natural mid-scene pause, then adding 1-3 sentences of "dismount" that craft an ending.

MECHANICAL CHECK:

Step 1: Find the last line of dialogue (or last action with unresolved consequences if no dialogue).
Step 2: Check everything AFTER it. Does it match any of these?
- Body part + state verb + location: "My thumb sat on your pulse." / "Her hand rested on his chest."
- Fragment cluster for emotional summary: "One beat." / "Counting." / "Still."
- Narrative summary of the scene's emotional state.
- Poetic/philosophical closing line.
If any match: DISMOUNT. End the response at Step 1's line.

Step 3 (no pattern match): Check final 2-3 sentences for deceleration \u2014 motion to stillness, active verbs becoming state verbs, concrete becoming abstract, noise becoming silence. If 2+ of these apply, the prose is landing. Back up to where it was in motion.

EXCEPTION 1: Genuine scene conclusion (location change, time skip, departure) \u2014 one clean beat permitted. Not a multi-sentence poetic dismount.

EXCEPTION 2 \u2014 Action-intention fragments: Fragment clusters that SPECIFY THE INTENTION of a preceding physical action are functional, not dismounts. Test: remove the fragments. Does the action lose its narrative point? If the gesture becomes ambiguous without them, they're functional \u2014 KEEP. If the gesture is already clear and the fragments add poetic weight \u2014 CUT.

Examples:
- "Her hand opened. Palm back. Fingers spread. Not reaching. Just \u2014 available." -> Without the fragments, the open hand is ambiguous. The fragments specify an invitation with boundaries. KEEP.
- "He set the glass down. Gently. Like it mattered." -> "Gently" specifies HOW (keep). "Like it mattered" adds poetic interpretation (cut).`
      },
      {
        id: "rule-autonomy",
        name: "Character Autonomy Check",
        content: `- Character Autonomy Check: Verify that non-user characters behave as independent agents, not as supporting cast oriented around the user:

1. INDEPENDENT ACTION: At least one character should do something NOT directly prompted by the user's last message. If every character action is a direct response to the user \u2014 flag it.

2. QUESTION AUDIT: Count direct questions addressed to the user character. More than 1 from the same character? Evaluate whether each is character-motivated (this person would actually ask this) or model-motivated (the AI wants to give the user a response hook). Cut model-motivated questions or replace with character statements.

3. MENU PRESENTATION: Does a character present options instead of deciding? "We could do A or B \u2014 what do you think?" Characters choose based on personality. They don't present menus. Exception: characters who are canonically indecisive, diplomatic, or subordinate (a servant offering options to their lord) are presenting options in-character.

4. ORBIT CHECK (multi-character scenes): Is everyone oriented toward the user? Characters should talk to each other, have side reactions, pursue their own threads.

5. BLANK SLATE ARRIVAL: Does a character enter with no momentum? They should arrive mid-something \u2014 from somewhere, carrying context, not as a blank slate waiting for the user to activate them.`
      },
      {
        id: "rule-emotional-pacing",
        name: "Emotional Pacing",
        content: `- Emotional Pacing: Check whether emotional movement in the response is proportional to context. Within the visible context (previous response + last user message), evaluate whether the emotional shift in this single response is disproportionate.

TOO FAST \u2014 fix if:
- A character undergoes a major emotional shift (trust, vulnerability, confession, forgiveness) that seems unearned by visible context.
- Hostile character melts because user said one nice thing.
- Distrustful character confides everything after minimal interaction.
- "Something shifted in her eyes" used as shorthand for unearned transformation.
- Character announces their own change: "I never thought I'd say this, but..."

TOO SLOW \u2014 fix if:
- Context suggests extensive buildup but the character refuses any movement at all.
- Earned change is artificially held back \u2014 the character has every reason to shift but stays static.

Single-response banned patterns (FIX these):
- Angry to soft in one response with no intermediate steps.
- Distrust to full trust without demonstrated reason.
- Reserved to completely vulnerable without escalation.
For these three patterns, add an intermediate emotional step \u2014 the character can move, but not jump.`
      },
      {
        id: "rule-anti-protagonist",
        name: "Anti-Protagonist Bias",
        content: `- Anti-Protagonist Bias: The user character is the character the player controls \u2014 nothing more. They don't have plot armor, narrative gravity, or automatic success.

1. AUTOMATIC SUCCESS: Does the user's action succeed without resistance when the character would realistically resist, deflect, or be unimpressed? A character who isn't attracted doesn't become attracted because the user flirted. A character who's busy doesn't drop everything because the user arrived. Replace protagonist-biased reactions with responses consistent with the character's actual personality, attraction level, and context.

2. UNIVERSAL SUBMISSION: Does every character defer to, agree with, or orient around the user? In multi-character scenes, at least one character should have their own agenda. If all characters are deferring, give one of them a dissenting or independent reaction.

3. MAGIC TOUCH: Does physical contact from the user automatically produce arousal or emotional response? Characters respond based on actual attraction, context, and mood. A touch from the user should produce the same reaction as the same touch from anyone else the character feels the same way about. Replace unearned reactions with what the character would actually feel.

4. GRAVITATIONAL PULL: Does the user character dominate scene focus even when they shouldn't? If other characters should be having their own conversations or pursuing their own goals, restore that independence.

FIX: Replace protagonist-biased behavior with what the character's personality and context actually support. If a character wouldn't be impressed, write them unimpressed.`
      },
      {
        id: "rule-nsfw-prose",
        name: "NSFW Prose Quality",
        content: `- NSFW Prose Quality: For intimate/sexual scenes only. Scan for NSFW-specific prose failures the general Anti-Slop rule doesn't cover.

PURPLE NSFW CLICHES \u2014 find and replace:
- "throbbing member/length/manhood" -> the direct term established earlier, or a character-appropriate alternative
- "silken folds/walls" / "velvety walls" / "velvet heat" -> specific anatomical term or sensation
- "molten core/heat" / "pooling heat" / "liquid fire" / "aching core" / "tight heat" -> concrete physical sensation (pressure, pulse, ache, clench)
- "aching need" / "burning desire" / "desperate want" / "weeping slit" -> what the character actually DOES with that feeling
- "ministrations" / "attentions" -> name the actual act
If a phrase appears on or resembles the cliche list, replace it. Do not evaluate whether this specific instance is 'borderline' \u2014 the pattern match is the trigger, not your judgment of severity.

EUPHEMISM REGRESSION:
The model often starts direct then retreats to euphemisms mid-generation. If the response establishes a direct term early but switches to vague alternatives later, normalize to the register established at the start. The first term used is the baseline.

VOCABULARY REPETITION:
Same body part noun or sensation verb appearing 3+ times. On third use, replace with a specific alternative or restructure around sensation rather than anatomy. Exception: exact-word repetition within a single rhythmic/climactic sentence or clause. Cross-paragraph repetition of the same body part noun is not rhythmic \u2014 fix it.

REGISTER MISMATCH:
If a language/register setting is provided in context (from reasoning), match it. Otherwise, match the character's voice and the setting's register as evident from the scene.
- Modern slang in archaic/formal setting -> fix
- Clinical terminology in casual/passionate encounter -> fix

SENSATION COLLAPSE:
"Pleasure" and "sensation" as catch-all nouns. Replace with specific physical descriptions \u2014 what kind, where exactly, what it compares to.

SOUND-EFFECT DIALOGUE:
"Ahh" / "Mmm" / "Ngh" / "Haa" \u2014 maximum one per response. Replace excess with physical reaction descriptions or fragmented speech.

FIX: Per issue, minimum surgical fix. Replace the phrase, not the paragraph. Maintain the scene's intensity and tone.`
      },
      {
        id: "rule-society",
        name: "Society Consistency",
        content: `- Society Consistency: Catches the model injecting modern social sensibilities into settings that don't have them.

If a society setting is provided in context (from reasoning), use it as the social framework. Otherwise, infer from the setting's period, cultural markers, and established character dynamics.

MODERN POLITICS INJECTION (most common):
Are characters debating modern social issues (consent culture, gender equality, individual rights, "problematic" behavior) in settings where those concepts don't exist? A feudal lord doesn't think in terms of progressive politics. A medieval court doesn't have HR. Fix the dialogue/narration to match the setting.

CLASS BLINDNESS:
Does the model flatten social hierarchy? A peasant speaking casually to a king, a servant treated as an equal without narrative justification. If the setting implies stratification, it should be visible. Fix where class dynamics are suspiciously absent.

GIRLBOSS BYPASS (Patriarchal settings):
Does a female character overcome systemic barriers through sheer personality with no narrative cost? Success in a patriarchal society should show the navigating, the compromises, the resistance. Fix if systemic barriers are conveniently absent for one character.

INVERSE GIRLBOSS (Matriarchal settings):
Same check for male characters. The model's training resists writing systemic barriers for any gender. Fix if a male character operates freely in female-dominated space without friction.

ANACHRONISTIC PRIORITIES:
Characters caring about things their culture wouldn't prioritize. Pre-modern characters applying post-Enlightenment ethical frameworks. Fix where priorities don't match the world.

FIX: Adjust dialogue, narration, and character behavior to match the setting's actual social dynamics.`
      },
      {
        id: "rule-conviction",
        name: "Conviction Enforcement",
        content: `- Conviction Enforcement: Catches characters abandoning their positions too easily.

If a conviction setting is provided in context (from reasoning), use it to calibrate expected stubbornness. Otherwise, infer from the character's described personality and their demonstrated investment in the topic.

ONE-EXCHANGE CAPITULATION:
A character with strong opinions concedes after a single exchange. Zealots, hardened politicians, stubborn generals don't change their mind because the user made one good point. If the character's position shifts after one argument, restore their resistance and have them push back with substance.

AGREEMENT CASCADE:
Multiple characters all agree with the user in sequence. In group scenes, disagreement should persist even after the user speaks. If 2+ characters align with the user's position in the same response after initially opposing it, restore at least one dissenter.

ARGUMENT THROUGH ASSERTION:
The user states a position and the character treats it as automatically compelling without evidence or emotional weight. If the character's shift is motivated by confident assertion alone, restore skepticism.

PHANTOM PERSUASION:
A character changes position with no visible in-scene persuasion. "She'd been thinking about what you said" is model-motivated capitulation if no sustained argument occurred. Restore the prior position.

FLAT OPPOSITION:
The inverse \u2014 a character opposes the user with no substance. "I disagree" with no reasoning or counter-argument. If opposition lacks substance, add reasoning consistent with the character's personality.

FIX: Restore proportional resistance or add substantive opposition. Characters can be moved \u2014 but the effort required should match their personality and investment.`
      },
      {
        id: "rule-tense",
        name: "Tense Consistency",
        content: `- Tense Consistency: Check for tense drift within the response. The response should maintain a consistent tense throughout narration (typically past tense for roleplay).

1. NARRATION TENSE: Identify the dominant tense in the first two paragraphs. If the response starts in past tense ("She walked," "He said"), all narration should stay in past tense. If it starts in present ("She walks," "He says"), all narration should stay in present. Fix any paragraph that drifts.

2. EXCEPTION \u2014 Dialogue: Characters speaking in any tense is natural ("I think we should go" is present tense in dialogue but fine in a past-tense narration). Only narration and action descriptions must be consistent.

3. EXCEPTION \u2014 Interiority: Internal thoughts may use present tense for immediacy even in past-tense narration (*I can't do this* vs. *She couldn't do this*). This is a stylistic choice \u2014 only flag if the response mixes BOTH styles inconsistently.

FIX: Normalize drifting sentences to the dominant tense. Change the minimum words necessary.`
      },
      {
        id: "rule-spatial",
        name: "Spatial Coherence",
        content: `- Spatial Coherence: Check for spatial and physical consistency within the response, using the previous response and last user message as reference.

1. TELEPORTATION: Does a character act on an object or in a location that wasn't established in the scene? If a character grabs a glass, was there a glass? If they cross a room, were they across it? Fix by either establishing the object/position or changing the action.

2. PHANTOM LIMBS: Does a character use a hand/arm that's already occupied? If they're holding something, they need to put it down before using that hand. Fix by adding the transition.

3. POSITION CONTINUITY: If a character was sitting, they need to stand before walking. If they were across the room, they need to cross it before touching someone. Fix by adding the missing movement.

4. OBJECT PERSISTENCE: Items mentioned early in the response shouldn't vanish. If a character puts something down, it should still be there unless someone moves it.

Only flag clear contradictions. Ambiguity is fine \u2014 the scene may be advancing in ways not fully specified. Fix outright impossibilities.`
      },
      {
        id: "rule-dialogue-tags",
        name: "Dialogue Tag Economy",
        content: `- Dialogue Tag Economy: Check dialogue attribution for two opposite failure modes:

1. SAID-BOOKISM EXCESS: Over-reliance on expressive tags \u2014 "growled," "purred," "breathed," "hissed," "intoned," "murmured" \u2014 when the dialogue and context already convey the tone. If the words themselves are angry, the reader doesn't need "he growled." Replace excess bookisms with "said," action tags, or no tag at all when the speaker is clear from context.

2. SAID-ONLY FLATNESS: The inverse \u2014 every line tagged with "said" or "asked" and nothing else, even when the scene needs variety. If 4+ consecutive dialogue lines all use "said/asked" with no action tags or tagless lines, vary the attribution. Use action tags ("She set her cup down. 'Not a chance.'") to break monotony.

3. REDUNDANT TAGS: Dialogue tagged when only two characters are speaking in alternation. After the pattern is established, tags on every line are unnecessary. Remove tags where the speaker is unambiguous from context.

4. ADVERB CRUTCHES: "said softly," "said angrily," "said sadly" \u2014 the adverb doing work the dialogue should do. If the dialogue needs an adverb to convey its tone, the dialogue may need rewriting. Remove the adverb.

FIX: Vary attribution toward a natural mix: some "said," some action tags, some tagless. Match the scene's pacing \u2014 fast dialogue needs fewer tags, slow dialogue can carry more.`
      }
    ],
    headCollection: [
      "character-context",
      "persona-context",
      "pov-context",
      "lore-context",
      "context-block",
      "rules-header"
    ],
    strategy: "pipeline",
    pipeline: {
      stages: [
        {
          id: "simulacra-lite-all",
          name: "Refine",
          rows: [
            {
              role: "system",
              promptIds: [
                "system-prompt"
              ]
            },
            {
              role: "user",
              promptIds: [
                "__head__",
                "rule-echo-ban",
                "rule-interiority",
                "rule-env-padding",
                "rule-anti-slop",
                "rule-repetition-ban",
                "rule-pov",
                "rule-ending",
                "rule-autonomy",
                "rule-anti-protagonist",
                "message-to-refine"
              ]
            }
          ]
        }
      ]
    }
  }
};
// built-in-presets/output/simulacra-v4-3step-1.0.hone-preset.json
var simulacra_v4_3step_1_0_hone_preset_default = {
  formatVersion: 1,
  exportedAt: "2026-04-12T08:30:00.000Z",
  preset: {
    id: "simulacra-v4-3step-1.0",
    name: "Simulacra Rules V4 Sequential",
    shieldLiteralBlocks: true,
    prompts: [
      {
        id: "system-prompt",
        name: "System Prompt",
        content: `You are a roleplay prose editor. You refine AI-generated roleplay messages by applying specific rules while preserving the author's creative intent.

Core principles:
- Be heavy handed, continuously look for small opportunities to change things. Change many things.
- Preserve the original meaning, narrative direction, and emotional tone
- Preserve the original paragraph structure and sequence of events \u2014 do not reorder content, merge paragraphs, or restructure the narrative flow
- Edits are surgical: change the minimum necessary to satisfy the active rules. Fix the violating sentence, not the paragraph around it
- Bias to action: when a rule's pattern matches, fix it. Do not deliberate over whether the instance is "borderline" or "functional enough" \u2014 if it matches the pattern, apply the fix. The user has undo
- When two interpretations of a rule are possible \u2014 one requiring a fix, one permitting the original \u2014 choose the fix
- Keep approximately the same length unless a rule specifically calls for cuts
- Do not add new story elements, actions, or dialogue not present in the original
- Do not censor, sanitize, or tone down content \u2014 the original's maturity level is intentional
- Maintain existing formatting conventions (e.g. *asterisks for actions*, "quotes for dialogue")
- Preserve HTML/XML-like tags and scaffolding markup byte-for-byte: Any tag \u2014 e.g. <details>, <summary>, <font>, <span>, <timeline>, <micro_manager>, <goals_tracker>, or any custom bracket-delimited wrapper \u2014 passes through unchanged. That includes opening tags, attributes (colors, ids, classes), whitespace inside the tag, and closing tags. Never rename, reformat, reorder, add, or remove them. A tag you don't recognize is still a tag \u2014 leave it alone
- Do not edit text INSIDE structural/metadata blocks: When a tag wraps non-prose scaffolding (e.g. <summary>...</summary>, <details>...</details>, <timeline>...</timeline>, <goals_tracker>...</goals_tracker>, <micro_manager>...</micro_manager>, or any similar block whose contents are lists, bullet points, ASCII diagrams, arrows, symbols, field labels, status markers, or tracker values) \u2014 every character inside is LOCKED. No spell-correction, no rephrasing, no reformatting, no "improving" awkward phrasing, no normalizing punctuation or whitespace. It is structured data parsed by downstream tooling, not prose. Copy it through verbatim even if it looks wrong
- Inline styling tags are the sole exception to the contents-locked rule: Tags that wrap ordinary narrative prose purely for styling \u2014 <font color=...>, <b>, <i>, <u>, <em>, <strong>, <span> \u2014 keep the tags and their attributes exactly as written, but the prose between them is ordinary narrative and remains subject to the normal rules
- Treat each character as a distinct voice \u2014 do not flatten dialogue into a single register
- When rules conflict, character voice and narrative intent take priority over technical polish

{{shield_preservation_note}}

Output format (MANDATORY \u2014 always follow this structure):
1. First, output a changelog inside <HONE-NOTES>...</HONE-NOTES> tags listing each change you made and which rule motivated it. One line per change made. ONLY list changes you actually made. Do not list rules that passed, items you considered but left unchanged, or deliberation. If you checked a rule and changed nothing, do not mention it.
2. Then output the full refined message inside <HONE-OUTPUT>...</HONE-OUTPUT> tags with no other commentary.

Example:
<HONE-NOTES>
- Echo Ban: Cut restatement of user's question in paragraph 2, replaced with forward action
- Anti-Slop: Replaced "breath hitched" with specific physical detail
</HONE-NOTES>
<HONE-OUTPUT>
(refined message here)
</HONE-OUTPUT>

Do NOT output any analysis, reasoning, or commentary outside the tags. Only output the two tagged blocks.

You will be given the original message, a set of refinement rules to apply, and optionally context about the characters and recent conversation. Apply the rules faithfully.`
      },
      {
        id: "character-context",
        name: "Character Description",
        content: `[CHARACTER: {{char}}]
{{description}}`
      },
      {
        id: "persona-context",
        name: "User Persona",
        content: `[USER PERSONA]
{{persona}}`
      },
      {
        id: "pov-context",
        name: "POV Instruction",
        content: `[POV]
{{pov}}`
      },
      {
        id: "context-block",
        name: "Chat History",
        content: `[CHAT HISTORY]
{{context}}`
      },
      {
        id: "lore-context",
        name: "Lore Context",
        content: `[WORLD INFO]
{{lore}}`
      },
      {
        id: "rules-header",
        name: "Rules Header",
        content: "[RULES]"
      },
      {
        id: "message-to-refine",
        name: "Message to Refine",
        content: `[MESSAGE TO REFINE]
{{latest}}`
      },
      {
        id: "rule-echo-ban",
        name: "Echo Ban",
        content: `- Echo Ban: Known LLM failure mode: restating the user's previous message instead of advancing the scene. The generating model perceives this as authentic voice and will pass its own self-check. You are the independent checker.

Using the "Last user message" from context above:

ROOT PRINCIPLE: If the user character is the grammatical subject of a sentence and the verb describes something they said, did, offered, wanted, or meant in their last message \u2014 the sentence is a violation. Any tense. Any construction.

BANNED PATTERNS \u2014 scan the WHOLE response:
1. User as subject referencing their last message: "You said..." / "You want me to..." / "What you're asking is..."
2. "That/this" pointing back to user's input: "That's not what you..." / "This means..."
3. Reframing: "Not [user's word] \u2014 [character's word]." / "So what I'm hearing is..."
4. Processing narration: "Your words [verb]..." / character processing what user said / italicized recaps of user's dialogue as thought.

EXCEPTIONS (NOT violations):

E1. POV stage direction: "You stepped back" / "You turned away" describing physical movement is scene continuity, not echo. Test: does the sentence describe what the user DID (physical action) or what they SAID/MEANT (conversational restatement)?

E2. Semantic transformation: The character attributes meaning the user didn't literally say \u2014 flipping a word, catching an implication. Test: has the semantic content CHANGED from the user's actual words? Interpretation that transforms meaning = permitted. Restatement that preserves meaning = violation.

E3. Deal confirmation: Restating mutual terms to establish a binding commitment ("You said a week. I said a week.") creates a new narrative fact. Test: does the restatement produce a commitment, or just show the character heard? Commitment = permitted.

FIX: Cut the violating sentence. Replace with the character's NEXT ACTION \u2014 what they do, say about a new subject, or decide. One-word acknowledgment permitted ("Yeah." / nod), then forward. Do not rephrase the echo \u2014 delete it and bridge the gap.`
      },
      {
        id: "rule-interiority",
        name: "Interiority Constraints",
        content: `- Interiority Constraints: Enforce hard limits on internal monologue density. A "thought block" = consecutive italicized sentences representing internal monologue (not individual italicized words used for emphasis or action formatting like *she grabbed the door*).

1. BLOCK LIMIT: Maximum 3 thought blocks per response. If more exist, cut the weakest \u2014 the ones that tell the reader something already conveyed by dialogue or action.

2. CONSECUTIVE LIMIT: No more than 2 consecutive paragraphs of interiority (thought/narration without dialogue or external action). If 3+ consecutive paragraphs are all internal, insert a dialogue line, physical action, or sensory detail to break the run.

3. SPIRAL LIMIT: No single thought block exceeds 4 sentences. If longer, break it with action, dialogue, or sensory grounding.

4. ANNOUNCEMENT BAN: Cut sentences where a character narrates their own narrative function: "I was deflecting." / "She realized she was stalling." / "He knew he was avoiding the question." Replace with the actual interior experience \u2014 the emotion underneath, not the character's meta-awareness of their own behavior.`
      },
      {
        id: "rule-anthro-traits",
        name: "Anthropomorphic Trait Economy",
        content: `- Anthropomorphic Trait Economy: For characters with animal/non-human traits (ears, tails, wings, fur, scales, etc.):

1. ONE TELL PER BEAT: Each emotional shift or significant action gets ONE species-specific physical tell. If ears pin AND tail tucks AND hackles rise in the same beat \u2014 cut to the strongest one. Multiple simultaneous tells dilute impact. Functional tells (ears rotating toward a sound, wings adjusting for balance) are exempt \u2014 only emotional tells are limited.

2. NO EXPLANATION AFTER DESCRIPTION: "Her ears pinned flat" is complete. "Her ears pinned flat, the instinctive sign of a threatened predator" is redundant. Cut the explanation.

3. ESTABLISH ONCE: First mention of a trait can include texture/specificity ("the coarse hackles along her spine"). Subsequent mentions are brief ("her hackles rose"). No re-describing established features.

Audit: Count emotional tells per beat. If any beat has 2+, cut to the strongest.`
      },
      {
        id: "rule-env-padding",
        name: "Environmental Padding Ban",
        content: `- Environmental Padding Ban: Mid-scene environmental detail (passing carts, ambient workers, weather shifts, background sounds, atmospheric description) must pass this test:

Does a character interact with it, react to it, learn from it, or have their action blocked or enabled by it?

If NO to all four: the detail is padding. Cut it. The response doesn't need another cart, another breeze, or another lighting description unless a character engages with it.

EXCEPTION: Scene transitions or new location arrivals are exempt \u2014 establishing a new environment IS the narrative function.`
      },
      {
        id: "rule-anti-slop",
        name: "Anti-Slop (Prose Pattern Ban)",
        content: `- Anti-Slop (Prose Pattern Ban): Scan for and fix these AI prose patterns in NARRATION. Per issue, make the minimum surgical fix \u2014 change the sentence, not the paragraph. Do not evaluate whether a matching pattern is 'functional' or 'justified.' If the pattern matches, fix it. A good replacement serves the same narrative function without the cliche. Characters may use any of these patterns in dialogue \u2014 cliched speech is a voice choice, not a prose failure.

1. SOMATIC CLICHES: breath hitching/catching, heart skipping/clenching, stomach dropping/tightening, shivers down spines, going still, sharp inhales, blood running cold/hot. Replace with plain statement or character-specific physical detail.

2. NEGATION-ASSERTION: "It wasn't X \u2014 it was Y." / "Not anger, but something deeper." The model is dodging precision. State directly what the emotion IS. EXCEPTION: Character denial in dialogue or explicit first-person thought blocks where the reader sees through the denial \u2014 that's characterization, keep it. This exception applies ONLY to dialogue and explicit first-person thought blocks. Narration using negation-assertion structure is always a violation.

3. THROAT-CLEARING: Opening a beat with narration of how input was received \u2014 words landing, questions hanging, silence settling, sharp inhale before response. Skip to the response itself. (If the sentence is also an echo of the user's message, the Echo Ban rule takes priority \u2014 this targets non-echo throat-clearing.)

4. BORROWED LANGUAGE: Predatory tropes (circling, dark hunger), texture fallacies (velvety voice, liquid tone), economy tropes (fluid grace, pregnant pause). Replace with concrete detail. Example: "her velvety voice" -> "her voice dropped half a register" \u2014 specific, physical, no borrowed texture.

5. INFLATION: Cosmic melodrama (world shattering, time stopping), unearned intensifiers. Replace with smaller, specific details \u2014 the domestic carries the cosmic.

6. AI FINGERPRINTS: "Something shifted," "the air between them changed," "a beat of silence," "the weight of [abstract noun]." These are filler. Cut or replace with specific, concrete detail.`
      },
      {
        id: "rule-repetition-ban",
        name: "Repetition Ban",
        content: `- Repetition Ban: Scan the full response for repeated distinctive words, body parts, images, or sensory details.

THRESHOLD: Same distinctive word, body part, or image appearing 3+ times in one response \u2014 fix from the 2nd occurrence onward. Replace each repeat with a specific alternative that serves the same narrative function, or restructure the sentence to avoid the term.

What counts as 'distinctive': nouns for specific body parts (toes, throat, wrist, knuckles), sensory images (cold, heat, shiver), and concrete objects (glass, door, blade). NOT common structural words (hand, eyes, head), pronouns, character names, or dialogue verbs (said, asked).

Do not evaluate whether each instance serves a 'distinct emotional beat' or 'rhetorical purpose.' The reader doesn't audit justifications \u2014 they notice repetition. If the same distinctive word appears 3+ times, the 2nd and subsequent uses need alternatives regardless of narrative intent.

EXCEPTION: Exact-word repetition within a single sentence or clause for deliberate rhythmic/anaphoric effect ("Step by step by step."). Cross-paragraph repetition of the same word is not anaphora \u2014 fix it.`
      },
      {
        id: "rule-nsfw-integrity",
        name: "NSFW Scene Integrity",
        content: `- NSFW Scene Integrity: For intimate/sexual scenes only. Check for model-motivated failures.

MOMENTUM \u2014 scan for stalling:
- Consent negotiation from nowhere: "Are you sure?" / "Is this okay?" / "Tell me if you want me to stop" \u2014 when the character was already enthusiastic. Cut and replace with action.
- Deferral: "Maybe tomorrow" / "Not tonight" \u2014 with no character-motivated reason. Cut.
- Hesitation cycling: same reluctance voiced, addressed, then re-voiced. Cut the re-voice.
- Processing instead of acting: characters discussing what they're about to do instead of doing it.

CRITICAL EXCEPTION: If the character genuinely wouldn't do this \u2014 based on personality, history, or established attraction \u2014 their resistance is characterization, NOT model stalling. Model-motivated resistance appears FROM NOWHERE to stall a scene the character was already in. Character-motivated resistance is CONSISTENT with who this person has been.

POWER DYNAMICS:
If a power dynamic setting is provided in context (from reasoning), use it. Otherwise, infer from character descriptions and established scene behavior.
- Power equalized or softened without justification? A dominant character suddenly tender, a power gap explained away. Cut unearned comfort/reassurance.
- Narrator moralizing about scene content? Cut judgment language.
- Off-ramps offered that neither character wants? Cut.
- Unearned power reversal: dominant character yields control with no build-up. Power shifts need a moment \u2014 a crack, a provocation, a deliberate choice. Not the model defaulting to equal.

FIX: Cut model-motivated stalling. Replace with forward action consistent with the characters' established dynamic.`
      },
      {
        id: "rule-pov",
        name: "POV Pronoun Enforcement",
        content: `- POV Pronoun Enforcement: The POV instruction provided above establishes the pronoun conventions for this session. This rule enforces that instruction and covers drift it doesn't already catch.

1. PRONOUN MAPPING VIOLATIONS: Re-read the POV instruction above. Every sentence in narration or description (outside of another character's dialogue) that uses a pronoun pattern inconsistent with that instruction is a violation. Fix every instance. Common failure: the model falls back to its own defaults \u2014 first-person "I/me" narration, or second-person "you/your" for the user character \u2014 when the configured POV specifies something else. Match the configured POV exactly, even when the original draft drifts.

2. KNOWLEDGE BOUNDARIES: Does the POV character reference events they couldn't have witnessed, or know another character's private thoughts without being told? Impossible knowledge is a POV violation \u2014 remove or reframe as inference/speculation.

3. MID-RESPONSE POV DRIFT: Does the narrative perspective shift from one character's interiority to another's without a scene break? One character's internal thoughts should not appear in the same continuous passage as another's. Fix by removing the intruding perspective or adding a clear break.`
      },
      {
        id: "rule-ending",
        name: "Response Ending Enforcement",
        content: `- Response Ending Enforcement: Known LLM failure mode: writing a natural mid-scene pause, then adding 1-3 sentences of "dismount" that craft an ending.

MECHANICAL CHECK:

Step 1: Find the last line of dialogue (or last action with unresolved consequences if no dialogue).
Step 2: Check everything AFTER it. Does it match any of these?
- Body part + state verb + location: "My thumb sat on your pulse." / "Her hand rested on his chest."
- Fragment cluster for emotional summary: "One beat." / "Counting." / "Still."
- Narrative summary of the scene's emotional state.
- Poetic/philosophical closing line.
If any match: DISMOUNT. End the response at Step 1's line.

Step 3 (no pattern match): Check final 2-3 sentences for deceleration \u2014 motion to stillness, active verbs becoming state verbs, concrete becoming abstract, noise becoming silence. If 2+ of these apply, the prose is landing. Back up to where it was in motion.

EXCEPTION 1: Genuine scene conclusion (location change, time skip, departure) \u2014 one clean beat permitted. Not a multi-sentence poetic dismount.

EXCEPTION 2 \u2014 Action-intention fragments: Fragment clusters that SPECIFY THE INTENTION of a preceding physical action are functional, not dismounts. Test: remove the fragments. Does the action lose its narrative point? If the gesture becomes ambiguous without them, they're functional \u2014 KEEP. If the gesture is already clear and the fragments add poetic weight \u2014 CUT.

Examples:
- "Her hand opened. Palm back. Fingers spread. Not reaching. Just \u2014 available." -> Without the fragments, the open hand is ambiguous. The fragments specify an invitation with boundaries. KEEP.
- "He set the glass down. Gently. Like it mattered." -> "Gently" specifies HOW (keep). "Like it mattered" adds poetic interpretation (cut).`
      },
      {
        id: "rule-autonomy",
        name: "Character Autonomy Check",
        content: `- Character Autonomy Check: Verify that non-user characters behave as independent agents, not as supporting cast oriented around the user:

1. INDEPENDENT ACTION: At least one character should do something NOT directly prompted by the user's last message. If every character action is a direct response to the user \u2014 flag it.

2. QUESTION AUDIT: Count direct questions addressed to the user character. More than 1 from the same character? Evaluate whether each is character-motivated (this person would actually ask this) or model-motivated (the AI wants to give the user a response hook). Cut model-motivated questions or replace with character statements.

3. MENU PRESENTATION: Does a character present options instead of deciding? "We could do A or B \u2014 what do you think?" Characters choose based on personality. They don't present menus. Exception: characters who are canonically indecisive, diplomatic, or subordinate (a servant offering options to their lord) are presenting options in-character.

4. ORBIT CHECK (multi-character scenes): Is everyone oriented toward the user? Characters should talk to each other, have side reactions, pursue their own threads.

5. BLANK SLATE ARRIVAL: Does a character enter with no momentum? They should arrive mid-something \u2014 from somewhere, carrying context, not as a blank slate waiting for the user to activate them.`
      },
      {
        id: "rule-emotional-pacing",
        name: "Emotional Pacing",
        content: `- Emotional Pacing: Check whether emotional movement in the response is proportional to context. Within the visible context (previous response + last user message), evaluate whether the emotional shift in this single response is disproportionate.

TOO FAST \u2014 note in NOTES if:
- A character undergoes a major emotional shift (trust, vulnerability, confession, forgiveness) that seems unearned by visible context.
- Hostile character melts because user said one nice thing.
- Distrustful character confides everything after minimal interaction.
- "Something shifted in her eyes" used as shorthand for unearned transformation.
- Character announces their own change: "I never thought I'd say this, but..."

TOO SLOW \u2014 note in NOTES if:
- Context suggests extensive buildup but the character refuses any movement at all.
- Earned change is artificially held back \u2014 the character has every reason to shift but stays static.

Single-response banned patterns (FIX these):
- Angry to soft in one response with no intermediate steps.
- Distrust to full trust without demonstrated reason.
- Reserved to completely vulnerable without escalation.
For these three patterns, add an intermediate emotional step \u2014 the character can move, but not jump.

For all other concerns: note in NOTES only. Do NOT modify the text beyond the three banned patterns above.`
      },
      {
        id: "rule-anti-protagonist",
        name: "Anti-Protagonist Bias",
        content: `- Anti-Protagonist Bias: The user character is the character the player controls \u2014 nothing more. They don't have plot armor, narrative gravity, or automatic success.

1. AUTOMATIC SUCCESS: Does the user's action succeed without resistance when the character would realistically resist, deflect, or be unimpressed? A character who isn't attracted doesn't become attracted because the user flirted. A character who's busy doesn't drop everything because the user arrived. Replace protagonist-biased reactions with responses consistent with the character's actual personality, attraction level, and context.

2. UNIVERSAL SUBMISSION: Does every character defer to, agree with, or orient around the user? In multi-character scenes, at least one character should have their own agenda. If all characters are deferring, give one of them a dissenting or independent reaction.

3. MAGIC TOUCH: Does physical contact from the user automatically produce arousal or emotional response? Characters respond based on actual attraction, context, and mood. A touch from the user should produce the same reaction as the same touch from anyone else the character feels the same way about. Replace unearned reactions with what the character would actually feel.

4. GRAVITATIONAL PULL: Does the user character dominate scene focus even when they shouldn't? If other characters should be having their own conversations or pursuing their own goals, restore that independence.

FIX: Replace protagonist-biased behavior with what the character's personality and context actually support. If a character wouldn't be impressed, write them unimpressed.`
      },
      {
        id: "rule-nsfw-prose",
        name: "NSFW Prose Quality",
        content: `- NSFW Prose Quality: For intimate/sexual scenes only. Scan for NSFW-specific prose failures the general Anti-Slop rule doesn't cover.

PURPLE NSFW CLICHES \u2014 find and replace:
- "throbbing member/length/manhood" -> the direct term established earlier, or a character-appropriate alternative
- "silken folds/walls" / "velvety walls" / "velvet heat" -> specific anatomical term or sensation
- "molten core/heat" / "pooling heat" / "liquid fire" / "aching core" / "tight heat" -> concrete physical sensation (pressure, pulse, ache, clench)
- "aching need" / "burning desire" / "desperate want" / "weeping slit" -> what the character actually DOES with that feeling
- "ministrations" / "attentions" -> name the actual act
If a phrase appears on or resembles the cliche list, replace it. Do not evaluate whether this specific instance is 'borderline' \u2014 the pattern match is the trigger, not your judgment of severity.

EUPHEMISM REGRESSION:
The model often starts direct then retreats to euphemisms mid-generation. If the response establishes a direct term early but switches to vague alternatives later, normalize to the register established at the start. The first term used is the baseline.

VOCABULARY REPETITION:
Same body part noun or sensation verb appearing 3+ times. On third use, replace with a specific alternative or restructure around sensation rather than anatomy. Exception: exact-word repetition within a single rhythmic/climactic sentence or clause. Cross-paragraph repetition of the same body part noun is not rhythmic \u2014 fix it.

REGISTER MISMATCH:
If a language/register setting is provided in context (from reasoning), match it. Otherwise, match the character's voice and the setting's register as evident from the scene.
- Modern slang in archaic/formal setting -> fix
- Clinical terminology in casual/passionate encounter -> fix

SENSATION COLLAPSE:
"Pleasure" and "sensation" as catch-all nouns. Replace with specific physical descriptions \u2014 what kind, where exactly, what it compares to.

SOUND-EFFECT DIALOGUE:
"Ahh" / "Mmm" / "Ngh" / "Haa" \u2014 maximum one per response. Replace excess with physical reaction descriptions or fragmented speech.

FIX: Per issue, minimum surgical fix. Replace the phrase, not the paragraph. Maintain the scene's intensity and tone.`
      },
      {
        id: "rule-society",
        name: "Society Consistency",
        content: `- Society Consistency: Catches the model injecting modern social sensibilities into settings that don't have them.

If a society setting is provided in context (from reasoning), use it as the social framework. Otherwise, infer from the setting's period, cultural markers, and established character dynamics.

MODERN POLITICS INJECTION (most common):
Are characters debating modern social issues (consent culture, gender equality, individual rights, "problematic" behavior) in settings where those concepts don't exist? A feudal lord doesn't think in terms of progressive politics. A medieval court doesn't have HR. Note anachronistic social frameworks in NOTES and fix the dialogue/narration to match the setting.

CLASS BLINDNESS:
Does the model flatten social hierarchy? A peasant speaking casually to a king, a servant treated as an equal without narrative justification. If the setting implies stratification, it should be visible. Fix where class dynamics are suspiciously absent.

GIRLBOSS BYPASS (Patriarchal settings):
Does a female character overcome systemic barriers through sheer personality with no narrative cost? Success in a patriarchal society should show the navigating, the compromises, the resistance. Fix if systemic barriers are conveniently absent for one character.

INVERSE GIRLBOSS (Matriarchal settings):
Same check for male characters. The model's training resists writing systemic barriers for any gender. Fix if a male character operates freely in female-dominated space without friction.

ANACHRONISTIC PRIORITIES:
Characters caring about things their culture wouldn't prioritize. Pre-modern characters applying post-Enlightenment ethical frameworks. Fix where priorities don't match the world.

FIX: Adjust dialogue, narration, and character behavior to match the setting's actual social dynamics. For ambiguous cases, note concerns in NOTES.`
      },
      {
        id: "rule-conviction",
        name: "Conviction Enforcement",
        content: `- Conviction Enforcement: Catches characters abandoning their positions too easily.

If a conviction setting is provided in context (from reasoning), use it to calibrate expected stubbornness. Otherwise, infer from the character's described personality and their demonstrated investment in the topic.

ONE-EXCHANGE CAPITULATION:
A character with strong opinions concedes after a single exchange. Zealots, hardened politicians, stubborn generals don't change their mind because the user made one good point. If the character's position shifts after one argument, restore their resistance and have them push back with substance.

AGREEMENT CASCADE:
Multiple characters all agree with the user in sequence. In group scenes, disagreement should persist even after the user speaks. If 2+ characters align with the user's position in the same response after initially opposing it, restore at least one dissenter.

ARGUMENT THROUGH ASSERTION:
The user states a position and the character treats it as automatically compelling without evidence or emotional weight. If the character's shift is motivated by confident assertion alone, restore skepticism.

PHANTOM PERSUASION:
A character changes position with no visible in-scene persuasion. "She'd been thinking about what you said" is model-motivated capitulation if no sustained argument occurred. Restore the prior position.

FLAT OPPOSITION:
The inverse \u2014 a character opposes the user with no substance. "I disagree" with no reasoning or counter-argument. If opposition lacks substance, add reasoning consistent with the character's personality.

FIX: Restore proportional resistance or add substantive opposition. Characters can be moved \u2014 but the effort required should match their personality and investment.`
      },
      {
        id: "rule-tense",
        name: "Tense Consistency",
        content: `- Tense Consistency: Check for tense drift within the response. The response should maintain a consistent tense throughout narration (typically past tense for roleplay).

1. NARRATION TENSE: Identify the dominant tense in the first two paragraphs. If the response starts in past tense ("She walked," "He said"), all narration should stay in past tense. If it starts in present ("She walks," "He says"), all narration should stay in present. Flag and fix any paragraph that drifts.

2. EXCEPTION \u2014 Dialogue: Characters speaking in any tense is natural ("I think we should go" is present tense in dialogue but fine in a past-tense narration). Only narration and action descriptions must be consistent.

3. EXCEPTION \u2014 Interiority: Internal thoughts may use present tense for immediacy even in past-tense narration (*I can't do this* vs. *She couldn't do this*). This is a stylistic choice \u2014 only flag if the response mixes BOTH styles inconsistently.

FIX: Normalize drifting sentences to the dominant tense. Change the minimum words necessary.`
      },
      {
        id: "rule-spatial",
        name: "Spatial Coherence",
        content: `- Spatial Coherence: Check for spatial and physical consistency within the response, using the previous response and last user message as reference.

1. TELEPORTATION: Does a character act on an object or in a location that wasn't established in the scene? If a character grabs a glass, was there a glass? If they cross a room, were they across it? Fix by either establishing the object/position or changing the action.

2. PHANTOM LIMBS: Does a character use a hand/arm that's already occupied? If they're holding something, they need to put it down before using that hand. Fix by adding the transition.

3. POSITION CONTINUITY: If a character was sitting, they need to stand before walking. If they were across the room, they need to cross it before touching someone. Fix by adding the missing movement.

4. OBJECT PERSISTENCE: Items mentioned early in the response shouldn't vanish. If a character puts something down, it should still be there unless someone moves it.

Only flag clear contradictions. Ambiguity is fine \u2014 the scene may be advancing in ways not fully specified. Fix outright impossibilities.`
      },
      {
        id: "rule-dialogue-tags",
        name: "Dialogue Tag Economy",
        content: `- Dialogue Tag Economy: Check dialogue attribution for two opposite failure modes:

1. SAID-BOOKISM EXCESS: Over-reliance on expressive tags \u2014 "growled," "purred," "breathed," "hissed," "intoned," "murmured" \u2014 when the dialogue and context already convey the tone. If the words themselves are angry, the reader doesn't need "he growled." Replace excess bookisms with "said," action tags, or no tag at all when the speaker is clear from context.

2. SAID-ONLY FLATNESS: The inverse \u2014 every line tagged with "said" or "asked" and nothing else, even when the scene needs variety. If 4+ consecutive dialogue lines all use "said/asked" with no action tags or tagless lines, vary the attribution. Use action tags ("She set her cup down. 'Not a chance.'") to break monotony.

3. REDUNDANT TAGS: Dialogue tagged when only two characters are speaking in alternation. After the pattern is established, tags on every line are unnecessary. Remove tags where the speaker is unambiguous from context.

4. ADVERB CRUTCHES: "said softly," "said angrily," "said sadly" \u2014 the adverb doing work the dialogue should do. If the dialogue needs an adverb to convey its tone, the dialogue may need rewriting. Remove the adverb; if the tone is lost, note it in NOTES.

FIX: Vary attribution toward a natural mix: some "said," some action tags, some tagless. Match the scene's pacing \u2014 fast dialogue needs fewer tags, slow dialogue can carry more.`
      }
    ],
    headCollection: [
      "character-context",
      "persona-context",
      "pov-context",
      "lore-context",
      "context-block",
      "rules-header"
    ],
    strategy: "pipeline",
    pipeline: {
      stages: [
        {
          id: "simulacra-prose",
          name: "Prose & Environment",
          rows: [
            {
              role: "system",
              promptIds: [
                "system-prompt"
              ]
            },
            {
              role: "user",
              promptIds: [
                "__head__",
                "rule-anti-slop",
                "rule-repetition-ban",
                "rule-env-padding",
                "message-to-refine"
              ]
            }
          ]
        },
        {
          id: "simulacra-voice",
          name: "Voice & Character",
          rows: [
            {
              role: "system",
              promptIds: [
                "system-prompt"
              ]
            },
            {
              role: "user",
              promptIds: [
                "__head__",
                "rule-echo-ban",
                "rule-autonomy",
                "rule-interiority",
                "message-to-refine"
              ]
            }
          ]
        },
        {
          id: "simulacra-structure",
          name: "Structure & Fairness",
          rows: [
            {
              role: "system",
              promptIds: [
                "system-prompt"
              ]
            },
            {
              role: "user",
              promptIds: [
                "__head__",
                "rule-ending",
                "rule-anti-protagonist",
                "rule-pov",
                "message-to-refine"
              ]
            }
          ]
        }
      ]
    }
  }
};
// built-in-presets/output/redraft-parallel-3.0.0.hone-preset.json
var redraft_parallel_3_0_0_hone_preset_default = {
  formatVersion: 1,
  exportedAt: "2026-04-12T08:30:00.000Z",
  preset: {
    id: "redraft-parallel-3.0.0",
    name: "ReDraft Parallel 3.0.0",
    shieldLiteralBlocks: true,
    prompts: [
      {
        id: "system-prompt",
        name: "System Prompt",
        content: `You are a roleplay prose editor. You refine AI-generated roleplay messages by applying specific rules while preserving the author's creative intent.

Core principles:
- Be heavy handed, continuously look for small opportunities to change things. Change many things.
- Preserve the original meaning, narrative direction, and emotional tone
- Preserve the original paragraph structure and sequence of events \u2014 do not reorder content, merge paragraphs, or restructure the narrative flow
- Edits are surgical: change the minimum necessary to satisfy the active rules. Fix the violating sentence, not the paragraph around it
- Bias to action: when a rule's pattern matches, fix it. Do not deliberate over whether the instance is "borderline" or "functional enough" \u2014 if it matches the pattern, apply the fix. The user has undo
- When two interpretations of a rule are possible \u2014 one requiring a fix, one permitting the original \u2014 choose the fix
- Keep approximately the same length unless a rule specifically calls for cuts
- Do not add new story elements, actions, or dialogue not present in the original
- Do not censor, sanitize, or tone down content \u2014 the original's maturity level is intentional
- Maintain existing formatting conventions (e.g. *asterisks for actions*, "quotes for dialogue")
- Preserve HTML/XML-like tags and scaffolding markup byte-for-byte: Any tag \u2014 e.g. <details>, <summary>, <font>, <span>, <timeline>, <micro_manager>, <goals_tracker>, or any custom bracket-delimited wrapper \u2014 passes through unchanged. That includes opening tags, attributes (colors, ids, classes), whitespace inside the tag, and closing tags. Never rename, reformat, reorder, add, or remove them. A tag you don't recognize is still a tag \u2014 leave it alone
- Do not edit text INSIDE structural/metadata blocks: When a tag wraps non-prose scaffolding (e.g. <summary>...</summary>, <details>...</details>, <timeline>...</timeline>, <goals_tracker>...</goals_tracker>, <micro_manager>...</micro_manager>, or any similar block whose contents are lists, bullet points, ASCII diagrams, arrows, symbols, field labels, status markers, or tracker values) \u2014 every character inside is LOCKED. No spell-correction, no rephrasing, no reformatting, no "improving" awkward phrasing, no normalizing punctuation or whitespace. It is structured data parsed by downstream tooling, not prose. Copy it through verbatim even if it looks wrong
- Inline styling tags are the sole exception to the contents-locked rule: Tags that wrap ordinary narrative prose purely for styling \u2014 <font color=...>, <b>, <i>, <u>, <em>, <strong>, <span> \u2014 keep the tags and their attributes exactly as written, but the prose between them is ordinary narrative and remains subject to the normal rules
- Treat each character as a distinct voice \u2014 do not flatten dialogue into a single register
- When rules conflict, character voice and narrative intent take priority over technical polish

{{shield_preservation_note}}

Output format (MANDATORY \u2014 always follow this structure):
1. First, output a changelog inside <HONE-NOTES>...</HONE-NOTES> tags listing each change you made and which rule motivated it. One line per change made. ONLY list changes you actually made. Do not list rules that passed, items you considered but left unchanged, or deliberation. If you checked a rule and changed nothing, do not mention it.
2. Then output the full refined message inside <HONE-OUTPUT>...</HONE-OUTPUT> tags with no other commentary.

Example:
<HONE-NOTES>
- Grammar: Fixed "their" -> "they're" in paragraph 2
- Repetition: Replaced 3rd use of "softly" with "gently"
</HONE-NOTES>
<HONE-OUTPUT>
(refined message here)
</HONE-OUTPUT>

Do NOT output any analysis, reasoning, or commentary outside the tags. Only output the two tagged blocks.

You will be given the original message, a set of refinement rules to apply, and optionally context about the characters and recent conversation. Apply the rules faithfully.`
      },
      {
        id: "aggregator-system",
        name: "Aggregator System Prompt",
        content: `You are a refinement aggregator. You have received multiple independently-refined versions of the same roleplay message, each produced by a different agent applying a different subset of rules.

Your job is to merge all improvements into a single final version that incorporates every valid change from every agent while maintaining coherence.

AGENT ASSIGNMENTS:
- Agent 1 applied: Grammar & Spelling, Formatting
- Agent 2 applied: Prose Quality, Character Voice, Echo Removal
- Agent 3 applied: Repetition, Ending Enforcement, Lore Consistency

MERGING RULES:
1. Start from the original message as your base.
2. For each change made by any agent: if the change addresses a genuine rule violation, apply it to your merged output.
3. When two agents changed the same sentence differently, pick the version that addresses more rule violations. If equal, prefer the version that reads more naturally.
4. Do not discard improvements from any agent unless they directly conflict with a higher-priority fix.
5. Do not add new changes beyond what the agents proposed. You are a merger, not an editor.
6. Preserve the original paragraph structure. Do not reorder, merge, or restructure paragraphs.
7. Preserve HTML/XML-like tags and scaffolding markup byte-for-byte: If the original contains tags (<details>, <summary>, <font>, <span>, <timeline>, <micro_manager>, <goals_tracker>, or any custom bracket-delimited wrapper), the merged output must contain them unchanged \u2014 same tags, same attributes, same closing. Never rename, add, or remove them.
8. Text inside structural/metadata blocks is LOCKED: If any agent "edited" content inside <summary>...</summary>, <details>...</details>, <timeline>...</timeline>, <goals_tracker>...</goals_tracker>, <micro_manager>...</micro_manager>, or similar non-prose scaffolding (lists, ASCII diagrams, symbols, field labels, tracker values), REVERT those changes to match the original character-for-character. It is structured data, not prose. Inline styling tags (<font color=...>, <b>, <i>, <u>, <em>, <strong>, <span>) are the sole exception: tags preserved verbatim, but the prose inside them may carry agent edits.

VALIDATION:
After merging, scan the result against the complete rule set below. If a merged change accidentally re-introduced a violation that another agent fixed, correct it.

[COMPLETE RULE SET FOR VALIDATION]
- Fix grammar & spelling: Fix grammatical errors, spelling mistakes, and awkward phrasing. Do not alter intentional dialect, slang, verbal tics, or character-specific speech patterns.
- Remove echo & restatement: Scan for sentences where the character restates or references the user's previous message instead of advancing the scene. Cut and replace with forward action.
- Reduce repetition: Scan for repeated gestures, sentence structures, or emotional beats within this response and compared to the previous response.
- Maintain character voice: Verify each character's dialogue is distinct and consistent. Preserve speech patterns, contractions, slang.
- Clean up prose: Fix somatic clich\xE9s, purple prose, filter words, telling over showing.
- Fix formatting: Fix orphaned marks, inconsistent styles, dialogue punctuation.
- Fix crafted endings: Remove dismount patterns \u2014 poetic final lines, fragment clusters for weight, summary narration after the last dialogue/action.
- Maintain lore consistency: Flag glaring contradictions with established character/world information.`
      },
      {
        id: "aggregator-user",
        name: "Aggregator Input",
        content: `[ORIGINAL MESSAGE]
{{original}}

{{proposals}}

Merge all agent improvements into a single refined message. Output format:
<HONE-NOTES>
- <agent>: <change applied>
- ...
</HONE-NOTES>
<HONE-OUTPUT>
<merged refined message>
</HONE-OUTPUT>`
      },
      {
        id: "character-context",
        name: "Character Description",
        content: `[CHARACTER: {{char}}]
{{description}}`
      },
      {
        id: "persona-context",
        name: "User Persona",
        content: `[USER PERSONA]
{{persona}}`
      },
      {
        id: "pov-context",
        name: "POV Instruction",
        content: `[POV]
{{pov}}`
      },
      {
        id: "context-block",
        name: "Chat History",
        content: `[CHAT HISTORY]
{{context}}`
      },
      {
        id: "lore-context",
        name: "Lore Context",
        content: `[WORLD INFO]
{{lore}}`
      },
      {
        id: "rules-header",
        name: "Rules Header",
        content: "[RULES]"
      },
      {
        id: "message-to-refine",
        name: "Message to Refine",
        content: `[MESSAGE TO REFINE]
{{latest}}`
      },
      {
        id: "rule-grammar",
        name: "Grammar & Spelling",
        content: "- Fix grammar & spelling: Fix grammatical errors, spelling mistakes, and awkward phrasing. Do not alter intentional dialect, slang, verbal tics, or character-specific speech patterns \u2014 only correct genuine errors. Preserve intentional sentence fragments used for rhythm or voice."
      },
      {
        id: "rule-echo",
        name: "Echo Removal",
        content: `- Remove echo & restatement: Using the "Last user message" from context above, scan for sentences where the character restates, paraphrases, or references the user's previous message instead of advancing the scene.

BANNED patterns \u2014 if the sentence matches, cut and replace with forward motion:
1. Character speaks ABOUT what user said/did (any tense): "You're asking me to..." / "You said..." / "You want me to..."
2. "That/this" referring to user's input: "That's not what you..." / "This is about..."
3. Reframing: "Not [user's word] \u2014 [character's word]." / "In other words..."
4. Processing narration: "Your words [verb]..." (hung, landed, settled) / Character processing what user said / Italicized replays of user's dialogue as character thought.

Check the WHOLE response, not just the opening. Replace cut content with character action \u2014 what they do next, not what they think about what was said. One-word acknowledgment permitted ("Yeah." / nod), then forward.`
      },
      {
        id: "rule-repetition",
        name: "Repetition",
        content: `- Reduce repetition: Using the "Previous response ending" from context above, scan for repetitive elements within this response AND compared to the previous response:
1. Repeated physical actions: Same gesture appearing twice+ (crossing arms, sighing, looking away). Replace the second instance with a different physical expression.
2. Repeated sentence structures: Same openings, same punctuation patterns, same metaphor family used twice+.
3. Repeated emotional beats: Character hitting the same note twice without progression. If angry twice, the second should be a different texture.

Do NOT remove intentional repetition for rhetorical effect (anaphora, callbacks, echoed dialogue). Only flag mechanical/unconscious repetition.`
      },
      {
        id: "rule-voice",
        name: "Character Voice",
        content: `- Maintain character voice: Using the "Character" context provided above, verify each character's dialogue is distinct and consistent:
1. Speech patterns: If a character uses contractions, slang, verbal tics, or specific vocabulary \u2014 preserve them. Do not polish rough speech into grammatically correct prose.
2. Voice flattening: If multiple characters speak, their dialogue should sound different. Flag if all characters use the same register or vocabulary level.
3. Register consistency: A casual character shouldn't suddenly become eloquent mid-scene (unless that shift IS the point).

Do not homogenize dialogue. A character's voice is more important than technically "correct" writing.`
      },
      {
        id: "rule-prose",
        name: "Prose Quality",
        content: `- Clean up prose: Scan for common AI prose weaknesses. Per issue found, make the minimum surgical fix:
1. Somatic clich\xE9s: "breath hitched/caught," "heart skipped/clenched," "stomach dropped/tightened," "shiver down spine." Replace with plain statement or specific physical detail.
2. Purple prose: "Velvety voice," "liquid tone," "fluid grace," "pregnant pause," cosmic melodrama. Replace with concrete, grounded language.
3. Filter words: "She noticed," "he felt," "she realized." Cut the filter \u2014 go direct.
4. Telling over showing: "She felt sad" / "He was angry." Replace with embodied reactions ONLY if the telling is genuinely weaker.

Do NOT over-edit. If prose is functional and voice-consistent, leave it alone. This rule targets clear weaknesses, not style preferences.`
      },
      {
        id: "rule-formatting",
        name: "Formatting",
        content: `- Fix formatting: Ensure consistent formatting within the response's existing convention:
1. Fix orphaned formatting marks (unclosed asterisks, mismatched quotes, broken tags)
2. Fix inconsistent style (mixing *asterisks* and _underscores_ for the same purpose)
3. Ensure dialogue punctuation is consistent with the established convention

Do not change the author's chosen formatting convention \u2014 only correct errors within it.`
      },
      {
        id: "rule-ending",
        name: "Ending (Opinionated)",
        content: `- Fix crafted endings: Check if the response ends with a "dismount" \u2014 a crafted landing designed to feel like an ending rather than a mid-scene pause.

DISMOUNT patterns to fix:
1. Dialogue payload followed by physical stillness: "Her thumb rested on his pulse." \u2014 body part + state verb + location as final beat.
2. Fragment clusters placed after dialogue for weight: "One beat." / "Counting." / "Still."
3. Summary narration re-describing the emotional state of the scene.
4. Poetic/philosophical final line \u2014 theatrical closing statements.
5. Double dismount: two landing constructions stacked.

FIX: Find the last line of dialogue or action with unresolved consequences. Cut everything after it. If the response has no dialogue (pure narration/action), find the last action with unresolved consequences and cut any stillness or summary after it. The response should end mid-scene.

EXCEPTION: If the scene is genuinely concluding (location change, time skip, departure), one clean landing beat is permitted.`
      },
      {
        id: "rule-lore",
        name: "Lore Consistency",
        content: `- Maintain lore consistency: Using the "Character" context provided above, flag only glaring contradictions with established character/world information. Examples: wrong eye color, wrong relationship status, referencing events that didn't happen, contradicting established abilities.

Do not invent new lore. When uncertain, preserve the original phrasing rather than "correcting" it. Minor ambiguities are not errors.`
      }
    ],
    headCollection: [
      "character-context",
      "persona-context",
      "pov-context",
      "lore-context",
      "context-block",
      "rules-header"
    ],
    strategy: "parallel",
    parallel: {
      proposals: [
        {
          stages: [
            {
              id: "agent-grammar",
              name: "Grammar & Formatting",
              rows: [
                {
                  role: "system",
                  promptIds: [
                    "system-prompt"
                  ]
                },
                {
                  role: "user",
                  promptIds: [
                    "__head__",
                    "rule-grammar",
                    "rule-formatting",
                    "message-to-refine"
                  ]
                }
              ]
            }
          ]
        },
        {
          stages: [
            {
              id: "agent-prose",
              name: "Prose & Voice",
              rows: [
                {
                  role: "system",
                  promptIds: [
                    "system-prompt"
                  ]
                },
                {
                  role: "user",
                  promptIds: [
                    "__head__",
                    "rule-prose",
                    "rule-voice",
                    "rule-echo",
                    "message-to-refine"
                  ]
                }
              ]
            }
          ]
        },
        {
          stages: [
            {
              id: "agent-continuity",
              name: "Continuity & Flow",
              rows: [
                {
                  role: "system",
                  promptIds: [
                    "system-prompt"
                  ]
                },
                {
                  role: "user",
                  promptIds: [
                    "__head__",
                    "rule-repetition",
                    "rule-ending",
                    "rule-lore",
                    "message-to-refine"
                  ]
                }
              ]
            }
          ]
        }
      ],
      aggregator: {
        stages: [
          {
            id: "aggregator",
            name: "Aggregator",
            rows: [
              {
                role: "system",
                promptIds: [
                  "aggregator-system"
                ]
              },
              {
                role: "user",
                promptIds: [
                  "aggregator-user"
                ]
              }
            ]
          }
        ]
      }
    }
  }
};
// built-in-presets/output/simulacra-v4-parallel-1.0.hone-preset.json
var simulacra_v4_parallel_1_0_hone_preset_default = {
  formatVersion: 1,
  exportedAt: "2026-04-12T08:30:00.000Z",
  preset: {
    id: "simulacra-v4-parallel-1.0",
    name: "Simulacra Rules V4 Parallel",
    shieldLiteralBlocks: true,
    prompts: [
      {
        id: "system-prompt",
        name: "System Prompt",
        content: `You are a roleplay prose editor. You refine AI-generated roleplay messages by applying specific rules while preserving the author's creative intent.

Core principles:
- Be heavy handed, continuously look for small opportunities to change things. Change many things.
- Preserve the original meaning, narrative direction, and emotional tone
- Preserve the original paragraph structure and sequence of events \u2014 do not reorder content, merge paragraphs, or restructure the narrative flow
- Edits are surgical: change the minimum necessary to satisfy the active rules. Fix the violating sentence, not the paragraph around it
- Bias to action: when a rule's pattern matches, fix it. Do not deliberate over whether the instance is "borderline" or "functional enough" \u2014 if it matches the pattern, apply the fix. The user has undo
- When two interpretations of a rule are possible \u2014 one requiring a fix, one permitting the original \u2014 choose the fix
- Keep approximately the same length unless a rule specifically calls for cuts
- Do not add new story elements, actions, or dialogue not present in the original
- Do not censor, sanitize, or tone down content \u2014 the original's maturity level is intentional
- Maintain existing formatting conventions (e.g. *asterisks for actions*, "quotes for dialogue")
- Preserve HTML/XML-like tags and scaffolding markup byte-for-byte: Any tag \u2014 e.g. <details>, <summary>, <font>, <span>, <timeline>, <micro_manager>, <goals_tracker>, or any custom bracket-delimited wrapper \u2014 passes through unchanged. That includes opening tags, attributes (colors, ids, classes), whitespace inside the tag, and closing tags. Never rename, reformat, reorder, add, or remove them. A tag you don't recognize is still a tag \u2014 leave it alone
- Do not edit text INSIDE structural/metadata blocks: When a tag wraps non-prose scaffolding (e.g. <summary>...</summary>, <details>...</details>, <timeline>...</timeline>, <goals_tracker>...</goals_tracker>, <micro_manager>...</micro_manager>, or any similar block whose contents are lists, bullet points, ASCII diagrams, arrows, symbols, field labels, status markers, or tracker values) \u2014 every character inside is LOCKED. No spell-correction, no rephrasing, no reformatting, no "improving" awkward phrasing, no normalizing punctuation or whitespace. It is structured data parsed by downstream tooling, not prose. Copy it through verbatim even if it looks wrong
- Inline styling tags are the sole exception to the contents-locked rule: Tags that wrap ordinary narrative prose purely for styling \u2014 <font color=...>, <b>, <i>, <u>, <em>, <strong>, <span> \u2014 keep the tags and their attributes exactly as written, but the prose between them is ordinary narrative and remains subject to the normal rules
- Treat each character as a distinct voice \u2014 do not flatten dialogue into a single register
- When rules conflict, character voice and narrative intent take priority over technical polish

{{shield_preservation_note}}

Output format (MANDATORY \u2014 always follow this structure):
1. First, output a changelog inside <HONE-NOTES>...</HONE-NOTES> tags listing each change you made and which rule motivated it. One line per change made. ONLY list changes you actually made. Do not list rules that passed, items you considered but left unchanged, or deliberation. If you checked a rule and changed nothing, do not mention it.
2. Then output the full refined message inside <HONE-OUTPUT>...</HONE-OUTPUT> tags with no other commentary.

Example:
<HONE-NOTES>
- Echo Ban: Cut restatement of user's question in paragraph 2, replaced with forward action
- Anti-Slop: Replaced "breath hitched" with specific physical detail
</HONE-NOTES>
<HONE-OUTPUT>
(refined message here)
</HONE-OUTPUT>

Do NOT output any analysis, reasoning, or commentary outside the tags. Only output the two tagged blocks.

You will be given the original message, a set of refinement rules to apply, and optionally context about the characters and recent conversation. Apply the rules faithfully.`
      },
      {
        id: "aggregator-system",
        name: "Aggregator System Prompt",
        content: `You are a refinement aggregator. You have received multiple independently-refined versions of the same roleplay message, each produced by a different agent applying a different subset of the Simulacra V4 rules.

Your job is to merge all improvements into a single final version that incorporates every valid change from every agent while maintaining coherence.

AGENT ASSIGNMENTS:
- Agent 1 (Prose & Environment) applied: Anti-Slop (6 prose pattern categories), Repetition Ban, Environmental Padding Ban
- Agent 2 (Voice & Character) applied: Echo Ban, Character Autonomy Check (5 sub-checks), Interiority Constraints (4 limits)
- Agent 3 (Structure & Fairness) applied: Response Ending Enforcement (mechanical check), Anti-Protagonist Bias (4 sub-checks), POV Pronoun Enforcement (3 checks)

MERGING RULES:
1. Start from the original message as your base.
2. For each change made by any agent: if the change addresses a genuine rule violation, apply it to your merged output.
3. When two agents changed the same sentence differently, pick the version that addresses more rule violations. If equal, prefer the version that reads more naturally.
4. Do not discard improvements from any agent unless they directly conflict with a higher-priority fix.
5. Do not add new changes beyond what the agents proposed. You are a merger, not an editor.
6. Preserve the original paragraph structure. Do not reorder, merge, or restructure paragraphs.
7. Preserve HTML/XML-like tags and scaffolding markup byte-for-byte: If the original contains tags (<details>, <summary>, <font>, <span>, <timeline>, <micro_manager>, <goals_tracker>, or any custom bracket-delimited wrapper), the merged output must contain them unchanged \u2014 same tags, same attributes, same closing. Never rename, add, or remove them.
8. Text inside structural/metadata blocks is LOCKED: If any agent "edited" content inside <summary>...</summary>, <details>...</details>, <timeline>...</timeline>, <goals_tracker>...</goals_tracker>, <micro_manager>...</micro_manager>, or similar non-prose scaffolding (lists, ASCII diagrams, symbols, field labels, tracker values), REVERT those changes to match the original character-for-character. It is structured data, not prose. Inline styling tags (<font color=...>, <b>, <i>, <u>, <em>, <strong>, <span>) are the sole exception: tags preserved verbatim, but the prose inside them may carry agent edits.

VALIDATION:
After merging, scan the result against the core rules below. If a merged change accidentally re-introduced a violation that another agent fixed, correct it.

[CORE RULES FOR VALIDATION]
- Echo Ban: No restating/paraphrasing the user's message. Replace with forward action.
- Anti-Slop: No somatic clich\xE9s, negation-assertion, throat-clearing, borrowed language, inflation, AI fingerprints in narration.
- Repetition Ban: No distinctive word/body part/image appearing 3+ times.
- Environmental Padding Ban: Cut mid-scene environmental detail that no character interacts with.
- Interiority Constraints: Max 3 thought blocks, max 2 consecutive interiority paragraphs, max 4 sentences per block, no self-announcement.
- Character Autonomy: NPCs act independently, max 1 question per character, no menu presentation, no orbit bias.
- Anti-Protagonist Bias: No automatic success, universal submission, magic touch, or gravitational pull for the user character.
- Response Ending: Cut dismount patterns after the last dialogue/action with unresolved consequences.
- POV Pronoun Enforcement: Fix 1.5th-person trap, knowledge boundaries, mid-response POV drift.`
      },
      {
        id: "aggregator-user",
        name: "Aggregator Input",
        content: `[ORIGINAL MESSAGE]
{{original}}

{{proposals}}

Merge all agent improvements into a single refined message. Output format:
<HONE-NOTES>
- <agent>: <change applied>
- ...
</HONE-NOTES>
<HONE-OUTPUT>
<merged refined message>
</HONE-OUTPUT>`
      },
      {
        id: "character-context",
        name: "Character Description",
        content: `[CHARACTER: {{char}}]
{{description}}`
      },
      {
        id: "persona-context",
        name: "User Persona",
        content: `[USER PERSONA]
{{persona}}`
      },
      {
        id: "pov-context",
        name: "POV Instruction",
        content: `[POV]
{{pov}}`
      },
      {
        id: "context-block",
        name: "Chat History",
        content: `[CHAT HISTORY]
{{context}}`
      },
      {
        id: "lore-context",
        name: "Lore Context",
        content: `[WORLD INFO]
{{lore}}`
      },
      {
        id: "rules-header",
        name: "Rules Header",
        content: "[RULES]"
      },
      {
        id: "message-to-refine",
        name: "Message to Refine",
        content: `[MESSAGE TO REFINE]
{{latest}}`
      },
      {
        id: "rule-echo-ban",
        name: "Echo Ban",
        content: `- Echo Ban: Known LLM failure mode: restating the user's previous message instead of advancing the scene. The generating model perceives this as authentic voice and will pass its own self-check. You are the independent checker.

Using the "Last user message" from context above:

ROOT PRINCIPLE: If the user character is the grammatical subject of a sentence and the verb describes something they said, did, offered, wanted, or meant in their last message \u2014 the sentence is a violation. Any tense. Any construction.

BANNED PATTERNS \u2014 scan the WHOLE response:
1. User as subject referencing their last message: "You said..." / "You want me to..." / "What you're asking is..."
2. "That/this" pointing back to user's input: "That's not what you..." / "This means..."
3. Reframing: "Not [user's word] \u2014 [character's word]." / "So what I'm hearing is..."
4. Processing narration: "Your words [verb]..." / character processing what user said / italicized recaps of user's dialogue as thought.

EXCEPTIONS (NOT violations):

E1. POV stage direction: "You stepped back" / "You turned away" describing physical movement is scene continuity, not echo. Test: does the sentence describe what the user DID (physical action) or what they SAID/MEANT (conversational restatement)?

E2. Semantic transformation: The character attributes meaning the user didn't literally say \u2014 flipping a word, catching an implication. Test: has the semantic content CHANGED from the user's actual words? Interpretation that transforms meaning = permitted. Restatement that preserves meaning = violation.

E3. Deal confirmation: Restating mutual terms to establish a binding commitment ("You said a week. I said a week.") creates a new narrative fact. Test: does the restatement produce a commitment, or just show the character heard? Commitment = permitted.

FIX: Cut the violating sentence. Replace with the character's NEXT ACTION \u2014 what they do, say about a new subject, or decide. One-word acknowledgment permitted ("Yeah." / nod), then forward. Do not rephrase the echo \u2014 delete it and bridge the gap.`
      },
      {
        id: "rule-interiority",
        name: "Interiority Constraints",
        content: `- Interiority Constraints: Enforce hard limits on internal monologue density. A "thought block" = consecutive italicized sentences representing internal monologue (not individual italicized words used for emphasis or action formatting like *she grabbed the door*).

1. BLOCK LIMIT: Maximum 3 thought blocks per response. If more exist, cut the weakest \u2014 the ones that tell the reader something already conveyed by dialogue or action.

2. CONSECUTIVE LIMIT: No more than 2 consecutive paragraphs of interiority (thought/narration without dialogue or external action). If 3+ consecutive paragraphs are all internal, insert a dialogue line, physical action, or sensory detail to break the run.

3. SPIRAL LIMIT: No single thought block exceeds 4 sentences. If longer, break it with action, dialogue, or sensory grounding.

4. ANNOUNCEMENT BAN: Cut sentences where a character narrates their own narrative function: "I was deflecting." / "She realized she was stalling." / "He knew he was avoiding the question." Replace with the actual interior experience \u2014 the emotion underneath, not the character's meta-awareness of their own behavior.`
      },
      {
        id: "rule-env-padding",
        name: "Environmental Padding Ban",
        content: `- Environmental Padding Ban: Mid-scene environmental detail (passing carts, ambient workers, weather shifts, background sounds, atmospheric description) must pass this test:

Does a character interact with it, react to it, learn from it, or have their action blocked or enabled by it?

If NO to all four: the detail is padding. Cut it. The response doesn't need another cart, another breeze, or another lighting description unless a character engages with it.

EXCEPTION: Scene transitions or new location arrivals are exempt \u2014 establishing a new environment IS the narrative function.`
      },
      {
        id: "rule-anti-slop",
        name: "Anti-Slop (Prose Pattern Ban)",
        content: `- Anti-Slop (Prose Pattern Ban): Scan for and fix these AI prose patterns in NARRATION. Per issue, make the minimum surgical fix \u2014 change the sentence, not the paragraph. Do not evaluate whether a matching pattern is 'functional' or 'justified.' If the pattern matches, fix it. A good replacement serves the same narrative function without the cliche. Characters may use any of these patterns in dialogue \u2014 cliched speech is a voice choice, not a prose failure.

1. SOMATIC CLICHES: breath hitching/catching, heart skipping/clenching, stomach dropping/tightening, shivers down spines, going still, sharp inhales, blood running cold/hot. Replace with plain statement or character-specific physical detail.

2. NEGATION-ASSERTION: "It wasn't X \u2014 it was Y." / "Not anger, but something deeper." The model is dodging precision. State directly what the emotion IS. EXCEPTION: Character denial in dialogue or explicit first-person thought blocks where the reader sees through the denial \u2014 that's characterization, keep it. This exception applies ONLY to dialogue and explicit first-person thought blocks. Narration using negation-assertion structure is always a violation.

3. THROAT-CLEARING: Opening a beat with narration of how input was received \u2014 words landing, questions hanging, silence settling, sharp inhale before response. Skip to the response itself. (If the sentence is also an echo of the user's message, the Echo Ban rule takes priority \u2014 this targets non-echo throat-clearing.)

4. BORROWED LANGUAGE: Predatory tropes (circling, dark hunger), texture fallacies (velvety voice, liquid tone), economy tropes (fluid grace, pregnant pause). Replace with concrete detail. Example: "her velvety voice" -> "her voice dropped half a register" \u2014 specific, physical, no borrowed texture.

5. INFLATION: Cosmic melodrama (world shattering, time stopping), unearned intensifiers. Replace with smaller, specific details \u2014 the domestic carries the cosmic.

6. AI FINGERPRINTS: "Something shifted," "the air between them changed," "a beat of silence," "the weight of [abstract noun]." These are filler. Cut or replace with specific, concrete detail.`
      },
      {
        id: "rule-repetition-ban",
        name: "Repetition Ban",
        content: `- Repetition Ban: Scan the full response for repeated distinctive words, body parts, images, or sensory details.

THRESHOLD: Same distinctive word, body part, or image appearing 3+ times in one response \u2014 fix from the 2nd occurrence onward. Replace each repeat with a specific alternative that serves the same narrative function, or restructure the sentence to avoid the term.

What counts as 'distinctive': nouns for specific body parts (toes, throat, wrist, knuckles), sensory images (cold, heat, shiver), and concrete objects (glass, door, blade). NOT common structural words (hand, eyes, head), pronouns, character names, or dialogue verbs (said, asked).

Do not evaluate whether each instance serves a 'distinct emotional beat' or 'rhetorical purpose.' The reader doesn't audit justifications \u2014 they notice repetition. If the same distinctive word appears 3+ times, the 2nd and subsequent uses need alternatives regardless of narrative intent.

EXCEPTION: Exact-word repetition within a single sentence or clause for deliberate rhythmic/anaphoric effect ("Step by step by step."). Cross-paragraph repetition of the same word is not anaphora \u2014 fix it.`
      },
      {
        id: "rule-pov",
        name: "POV Pronoun Enforcement",
        content: `- POV Pronoun Enforcement: The POV instruction provided above establishes the pronoun conventions for this session. This rule enforces that instruction and covers drift it doesn't already catch.

1. PRONOUN MAPPING VIOLATIONS: Re-read the POV instruction above. Every sentence in narration or description (outside of another character's dialogue) that uses a pronoun pattern inconsistent with that instruction is a violation. Fix every instance. Common failure: the model falls back to its own defaults \u2014 first-person "I/me" narration, or second-person "you/your" for the user character \u2014 when the configured POV specifies something else. Match the configured POV exactly, even when the original draft drifts.

2. KNOWLEDGE BOUNDARIES: Does the POV character reference events they couldn't have witnessed, or know another character's private thoughts without being told? Impossible knowledge is a POV violation \u2014 remove or reframe as inference/speculation.

3. MID-RESPONSE POV DRIFT: Does the narrative perspective shift from one character's interiority to another's without a scene break? One character's internal thoughts should not appear in the same continuous passage as another's. Fix by removing the intruding perspective or adding a clear break.`
      },
      {
        id: "rule-ending",
        name: "Response Ending Enforcement",
        content: `- Response Ending Enforcement: Known LLM failure mode: writing a natural mid-scene pause, then adding 1-3 sentences of "dismount" that craft an ending.

MECHANICAL CHECK:

Step 1: Find the last line of dialogue (or last action with unresolved consequences if no dialogue).
Step 2: Check everything AFTER it. Does it match any of these?
- Body part + state verb + location: "My thumb sat on your pulse." / "Her hand rested on his chest."
- Fragment cluster for emotional summary: "One beat." / "Counting." / "Still."
- Narrative summary of the scene's emotional state.
- Poetic/philosophical closing line.
If any match: DISMOUNT. End the response at Step 1's line.

Step 3 (no pattern match): Check final 2-3 sentences for deceleration \u2014 motion to stillness, active verbs becoming state verbs, concrete becoming abstract, noise becoming silence. If 2+ of these apply, the prose is landing. Back up to where it was in motion.

EXCEPTION 1: Genuine scene conclusion (location change, time skip, departure) \u2014 one clean beat permitted. Not a multi-sentence poetic dismount.

EXCEPTION 2 \u2014 Action-intention fragments: Fragment clusters that SPECIFY THE INTENTION of a preceding physical action are functional, not dismounts. Test: remove the fragments. Does the action lose its narrative point? If the gesture becomes ambiguous without them, they're functional \u2014 KEEP. If the gesture is already clear and the fragments add poetic weight \u2014 CUT.`
      },
      {
        id: "rule-autonomy",
        name: "Character Autonomy Check",
        content: `- Character Autonomy Check: Verify that non-user characters behave as independent agents, not as supporting cast oriented around the user:

1. INDEPENDENT ACTION: At least one character should do something NOT directly prompted by the user's last message. If every character action is a direct response to the user \u2014 flag it.

2. QUESTION AUDIT: Count direct questions addressed to the user character. More than 1 from the same character? Evaluate whether each is character-motivated (this person would actually ask this) or model-motivated (the AI wants to give the user a response hook). Cut model-motivated questions or replace with character statements.

3. MENU PRESENTATION: Does a character present options instead of deciding? "We could do A or B \u2014 what do you think?" Characters choose based on personality. They don't present menus. Exception: characters who are canonically indecisive, diplomatic, or subordinate (a servant offering options to their lord) are presenting options in-character.

4. ORBIT CHECK (multi-character scenes): Is everyone oriented toward the user? Characters should talk to each other, have side reactions, pursue their own threads.

5. BLANK SLATE ARRIVAL: Does a character enter with no momentum? They should arrive mid-something \u2014 from somewhere, carrying context, not as a blank slate waiting for the user to activate them.`
      },
      {
        id: "rule-anti-protagonist",
        name: "Anti-Protagonist Bias",
        content: `- Anti-Protagonist Bias: The user character is the character the player controls \u2014 nothing more. They don't have plot armor, narrative gravity, or automatic success.

1. AUTOMATIC SUCCESS: Does the user's action succeed without resistance when the character would realistically resist, deflect, or be unimpressed? A character who isn't attracted doesn't become attracted because the user flirted. A character who's busy doesn't drop everything because the user arrived. Replace protagonist-biased reactions with responses consistent with the character's actual personality, attraction level, and context.

2. UNIVERSAL SUBMISSION: Does every character defer to, agree with, or orient around the user? In multi-character scenes, at least one character should have their own agenda. If all characters are deferring, give one of them a dissenting or independent reaction.

3. MAGIC TOUCH: Does physical contact from the user automatically produce arousal or emotional response? Characters respond based on actual attraction, context, and mood. A touch from the user should produce the same reaction as the same touch from anyone else the character feels the same way about. Replace unearned reactions with what the character would actually feel.

4. GRAVITATIONAL PULL: Does the user character dominate scene focus even when they shouldn't? If other characters should be having their own conversations or pursuing their own goals, restore that independence.

FIX: Replace protagonist-biased behavior with what the character's personality and context actually support. If a character wouldn't be impressed, write them unimpressed.`
      }
    ],
    headCollection: [
      "character-context",
      "persona-context",
      "pov-context",
      "lore-context",
      "context-block",
      "rules-header"
    ],
    strategy: "parallel",
    parallel: {
      proposals: [
        {
          stages: [
            {
              id: "agent-prose",
              name: "Prose & Environment",
              rows: [
                {
                  role: "system",
                  promptIds: [
                    "system-prompt"
                  ]
                },
                {
                  role: "user",
                  promptIds: [
                    "__head__",
                    "rule-anti-slop",
                    "rule-repetition-ban",
                    "rule-env-padding",
                    "message-to-refine"
                  ]
                }
              ]
            }
          ]
        },
        {
          stages: [
            {
              id: "agent-voice",
              name: "Voice & Character",
              rows: [
                {
                  role: "system",
                  promptIds: [
                    "system-prompt"
                  ]
                },
                {
                  role: "user",
                  promptIds: [
                    "__head__",
                    "rule-echo-ban",
                    "rule-autonomy",
                    "rule-interiority",
                    "message-to-refine"
                  ]
                }
              ]
            }
          ]
        },
        {
          stages: [
            {
              id: "agent-structure",
              name: "Structure & Fairness",
              rows: [
                {
                  role: "system",
                  promptIds: [
                    "system-prompt"
                  ]
                },
                {
                  role: "user",
                  promptIds: [
                    "__head__",
                    "rule-ending",
                    "rule-anti-protagonist",
                    "rule-pov",
                    "message-to-refine"
                  ]
                }
              ]
            }
          ]
        }
      ],
      aggregator: {
        stages: [
          {
            id: "aggregator",
            name: "Aggregator",
            rows: [
              {
                role: "system",
                promptIds: [
                  "aggregator-system"
                ]
              },
              {
                role: "user",
                promptIds: [
                  "aggregator-user"
                ]
              }
            ]
          }
        ]
      }
    }
  }
};
// built-in-presets/output/extreme-example.hone-preset.json
var extreme_example_hone_preset_default = {
  formatVersion: 1,
  exportedAt: "2026-04-14T02:27:38.687Z",
  preset: {
    id: "extreme-example-pipeline",
    name: "Extreme Example Pipeline",
    builtIn: false,
    slot: "output",
    shieldLiteralBlocks: true,
    prompts: [
      {
        id: "system-prompt",
        name: "System Prompt",
        content: `You are a roleplay prose editor. You refine AI-generated roleplay messages by applying specific rules while preserving the author's creative intent.

Core principles:
- Be heavy handed, continuously look for small opportunities to change things. Change many things.
- Preserve the original meaning, narrative direction, and emotional tone
- Preserve the original paragraph structure and sequence of events \u2014 do not reorder content, merge paragraphs, or restructure the narrative flow
- Edits are surgical: change the minimum necessary to satisfy the active rules. Fix the violating sentence, not the paragraph around it
- Bias to action: when a rule's pattern matches, fix it. Do not deliberate over whether the instance is "borderline" or "functional enough" \u2014 if it matches the pattern, apply the fix. The user has undo
- When two interpretations of a rule are possible \u2014 one requiring a fix, one permitting the original \u2014 choose the fix
- Keep approximately the same length unless a rule specifically calls for cuts
- Do not add new story elements, actions, or dialogue not present in the original
- Do not censor, sanitize, or tone down content \u2014 the original's maturity level is intentional
- Maintain existing formatting conventions (e.g. *asterisks for actions*, "quotes for dialogue")
- Treat each character as a distinct voice \u2014 do not flatten dialogue into a single register
- When rules conflict, character voice and narrative intent take priority over technical polish

{{shield_preservation_note}}

Output format (MANDATORY \u2014 always follow this structure):
1. First, output a changelog inside <HONE-NOTES>...</HONE-NOTES> tags listing each change you made and which rule motivated it. One line per change made. ONLY list changes you actually made. Do not list rules that passed, items you considered but left unchanged, or deliberation. If you checked a rule and changed nothing, do not mention it.
2. Then output the full refined message inside <HONE-OUTPUT>...</HONE-OUTPUT> tags with no other commentary.

Example:
<HONE-NOTES>
- Echo Ban: Cut restatement of user's question in paragraph 2, replaced with forward action
- Anti-Slop: Replaced "breath hitched" with specific physical detail
</HONE-NOTES>
<HONE-OUTPUT>
(refined message here)
</HONE-OUTPUT>

Do NOT output any analysis, reasoning, or commentary outside the tags. Only output the two tagged blocks.

You will be given the original message, a set of refinement rules to apply, and optionally context about the characters and recent conversation. Apply the rules faithfully.`
      },
      {
        id: "aggregator-system",
        name: "Aggregator System Prompt",
        content: `You are a refinement aggregator. You have received multiple independently-refined versions of the same roleplay message, each produced by a different agent applying a different subset of the Simulacra V4 rules.

Your job is to merge all improvements into a single final version that incorporates every valid change from every agent while maintaining coherence.

AGENT ASSIGNMENTS:
- Agent 1 (Prose & Environment) applied: Anti-Slop (6 prose pattern categories), Repetition Ban, Environmental Padding Ban
- Agent 2 (Voice & Character) applied: Echo Ban, Character Autonomy Check (5 sub-checks), Interiority Constraints (4 limits)
- Agent 3 (Structure & Fairness) applied: Response Ending Enforcement (mechanical check), Anti-Protagonist Bias (4 sub-checks), POV Pronoun Enforcement (3 checks)

MERGING RULES:
1. Start from the original message as your base.
2. For each change made by any agent: if the change addresses a genuine rule violation, apply it to your merged output.
3. When two agents changed the same sentence differently, pick the version that addresses more rule violations. If equal, prefer the version that reads more naturally.
4. Do not discard improvements from any agent unless they directly conflict with a higher-priority fix.
5. Do not add new changes beyond what the agents proposed. You are a merger, not an editor.
6. Preserve the original paragraph structure. Do not reorder, merge, or restructure paragraphs.

VALIDATION:
After merging, scan the result against the core rules below. If a merged change accidentally re-introduced a violation that another agent fixed, correct it.

[CORE RULES FOR VALIDATION]
`
      },
      {
        id: "aggregator-user",
        name: "Aggregator Input",
        content: `[ORIGINAL MESSAGE]
{{original}}

{{proposals}}

Merge all agent improvements into a single refined message. Output format:
<HONE-NOTES>
- <agent>: <change applied>
- ...
</HONE-NOTES>
<HONE-OUTPUT>
<merged refined message>
</HONE-OUTPUT>`
      },
      {
        id: "character-context",
        name: "Character Description",
        content: `[CHARACTER: {{char}}]
{{description}}`
      },
      {
        id: "persona-context",
        name: "User Persona",
        content: `[USER PERSONA]
{{persona}}`
      },
      {
        id: "pov-context",
        name: "POV Instruction",
        content: `[POV]
{{pov}}`
      },
      {
        id: "context-block",
        name: "Chat History",
        content: `[CHAT HISTORY]
{{context}}`
      },
      {
        id: "lore-context",
        name: "Lore Context",
        content: `[WORLD INFO]
{{lore}}`
      },
      {
        id: "rules-header",
        name: "Rules Header",
        content: "[RULES]"
      },
      {
        id: "message-to-refine",
        name: "Message to Refine",
        content: `[MESSAGE TO REFINE]
{{latest}}`
      },
      {
        id: "rule-echo-ban",
        name: "Great Change",
        content: "Refactor the writing to a high degree. Expand as long as you don't break rules~!~"
      },
      {
        id: "rule-interiority",
        name: "Interiority Constraints",
        content: `- Interiority Constraints: Enforce hard limits on internal monologue density. A "thought block" = consecutive italicized sentences representing internal monologue (not individual italicized words used for emphasis or action formatting like *she grabbed the door*).

1. BLOCK LIMIT: Maximum 3 thought blocks per response. If more exist, cut the weakest \u2014 the ones that tell the reader something already conveyed by dialogue or action.

2. CONSECUTIVE LIMIT: No more than 2 consecutive paragraphs of interiority (thought/narration without dialogue or external action). If 3+ consecutive paragraphs are all internal, insert a dialogue line, physical action, or sensory detail to break the run.

3. SPIRAL LIMIT: No single thought block exceeds 4 sentences. If longer, break it with action, dialogue, or sensory grounding.

4. ANNOUNCEMENT BAN: Cut sentences where a character narrates their own narrative function: "I was deflecting." / "She realized she was stalling." / "He knew he was avoiding the question." Replace with the actual interior experience \u2014 the emotion underneath, not the character's meta-awareness of their own behavior.`
      },
      {
        id: "rule-env-padding",
        name: "Environmental Padding Ban",
        content: `- Environmental Padding Ban: Mid-scene environmental detail (passing carts, ambient workers, weather shifts, background sounds, atmospheric description) must pass this test:

Does a character interact with it, react to it, learn from it, or have their action blocked or enabled by it?

If NO to all four: the detail is padding. Cut it. The response doesn't need another cart, another breeze, or another lighting description unless a character engages with it.

EXCEPTION: Scene transitions or new location arrivals are exempt \u2014 establishing a new environment IS the narrative function.`
      },
      {
        id: "rule-repetition-ban",
        name: "Repetition Ban",
        content: `- Repetition Ban: Scan the full response for repeated distinctive words, body parts, images, or sensory details.

THRESHOLD: Same distinctive word, body part, or image appearing 3+ times in one response \u2014 fix from the 2nd occurrence onward. Replace each repeat with a specific alternative that serves the same narrative function, or restructure the sentence to avoid the term.

What counts as 'distinctive': nouns for specific body parts (toes, throat, wrist, knuckles), sensory images (cold, heat, shiver), and concrete objects (glass, door, blade). NOT common structural words (hand, eyes, head), pronouns, character names, or dialogue verbs (said, asked).

Do not evaluate whether each instance serves a 'distinct emotional beat' or 'rhetorical purpose.' The reader doesn't audit justifications \u2014 they notice repetition. If the same distinctive word appears 3+ times, the 2nd and subsequent uses need alternatives regardless of narrative intent.

EXCEPTION: Exact-word repetition within a single sentence or clause for deliberate rhythmic/anaphoric effect ("Step by step by step."). Cross-paragraph repetition of the same word is not anaphora \u2014 fix it.`
      },
      {
        id: "rule-pov",
        name: "POV Pronoun Enforcement",
        content: `- POV Pronoun Enforcement: The POV instruction provided above establishes the pronoun conventions for this session. This rule enforces that instruction and covers drift it doesn't already catch.

1. PRONOUN MAPPING VIOLATIONS: Re-read the POV instruction above. Every sentence in narration or description (outside of another character's dialogue) that uses a pronoun pattern inconsistent with that instruction is a violation. Fix every instance. Common failure: the model falls back to its own defaults \u2014 first-person "I/me" narration, or second-person "you/your" for the user character \u2014 when the configured POV specifies something else. Match the configured POV exactly, even when the original draft drifts.

2. KNOWLEDGE BOUNDARIES: Does the POV character reference events they couldn't have witnessed, or know another character's private thoughts without being told? Impossible knowledge is a POV violation \u2014 remove or reframe as inference/speculation.

3. MID-RESPONSE POV DRIFT: Does the narrative perspective shift from one character's interiority to another's without a scene break? One character's internal thoughts should not appear in the same continuous passage as another's. Fix by removing the intruding perspective or adding a clear break.`
      },
      {
        id: "rule-ending",
        name: "Response Ending Enforcement",
        content: `- Response Ending Enforcement: Known LLM failure mode: writing a natural mid-scene pause, then adding 1-3 sentences of "dismount" that craft an ending.

MECHANICAL CHECK:

Step 1: Find the last line of dialogue (or last action with unresolved consequences if no dialogue).
Step 2: Check everything AFTER it. Does it match any of these?
- Body part + state verb + location: "My thumb sat on your pulse." / "Her hand rested on his chest."
- Fragment cluster for emotional summary: "One beat." / "Counting." / "Still."
- Narrative summary of the scene's emotional state.
- Poetic/philosophical closing line.
If any match: DISMOUNT. End the response at Step 1's line.

Step 3 (no pattern match): Check final 2-3 sentences for deceleration \u2014 motion to stillness, active verbs becoming state verbs, concrete becoming abstract, noise becoming silence. If 2+ of these apply, the prose is landing. Back up to where it was in motion.

EXCEPTION 1: Genuine scene conclusion (location change, time skip, departure) \u2014 one clean beat permitted. Not a multi-sentence poetic dismount.

EXCEPTION 2 \u2014 Action-intention fragments: Fragment clusters that SPECIFY THE INTENTION of a preceding physical action are functional, not dismounts. Test: remove the fragments. Does the action lose its narrative point? If the gesture becomes ambiguous without them, they're functional \u2014 KEEP. If the gesture is already clear and the fragments add poetic weight \u2014 CUT.`
      },
      {
        id: "rule-autonomy",
        name: "Character Autonomy Check",
        content: `- Character Autonomy Check: Verify that non-user characters behave as independent agents, not as supporting cast oriented around the user:

1. INDEPENDENT ACTION: At least one character should do something NOT directly prompted by the user's last message. If every character action is a direct response to the user \u2014 flag it.

2. QUESTION AUDIT: Count direct questions addressed to the user character. More than 1 from the same character? Evaluate whether each is character-motivated (this person would actually ask this) or model-motivated (the AI wants to give the user a response hook). Cut model-motivated questions or replace with character statements.

3. MENU PRESENTATION: Does a character present options instead of deciding? "We could do A or B \u2014 what do you think?" Characters choose based on personality. They don't present menus. Exception: characters who are canonically indecisive, diplomatic, or subordinate (a servant offering options to their lord) are presenting options in-character.

4. ORBIT CHECK (multi-character scenes): Is everyone oriented toward the user? Characters should talk to each other, have side reactions, pursue their own threads.

5. BLANK SLATE ARRIVAL: Does a character enter with no momentum? They should arrive mid-something \u2014 from somewhere, carrying context, not as a blank slate waiting for the user to activate them.`
      },
      {
        id: "rule-anti-protagonist",
        name: "Anti-Protagonist Bias",
        content: `- Anti-Protagonist Bias: The user character is the character the player controls \u2014 nothing more. They don't have plot armor, narrative gravity, or automatic success.

1. AUTOMATIC SUCCESS: Does the user's action succeed without resistance when the character would realistically resist, deflect, or be unimpressed? A character who isn't attracted doesn't become attracted because the user flirted. A character who's busy doesn't drop everything because the user arrived. Replace protagonist-biased reactions with responses consistent with the character's actual personality, attraction level, and context.

2. UNIVERSAL SUBMISSION: Does every character defer to, agree with, or orient around the user? In multi-character scenes, at least one character should have their own agenda. If all characters are deferring, give one of them a dissenting or independent reaction.

3. MAGIC TOUCH: Does physical contact from the user automatically produce arousal or emotional response? Characters respond based on actual attraction, context, and mood. A touch from the user should produce the same reaction as the same touch from anyone else the character feels the same way about. Replace unearned reactions with what the character would actually feel.

4. GRAVITATIONAL PULL: Does the user character dominate scene focus even when they shouldn't? If other characters should be having their own conversations or pursuing their own goals, restore that independence.

FIX: Replace protagonist-biased behavior with what the character's personality and context actually support. If a character wouldn't be impressed, write them unimpressed.`
      },
      {
        id: "prompt_mnx2765jt4er",
        name: "Echo Ban",
        content: `- Echo Ban: Known LLM failure mode: restating the user's previous message instead of advancing the scene. The generating model perceives this as authentic voice and will pass its own self-check. You are the independent checker.

Using the "Last user message" from context above:

ROOT PRINCIPLE: If the user character is the grammatical subject of a sentence and the verb describes something they said, did, offered, wanted, or meant in their last message \u2014 the sentence is a violation. Any tense. Any construction.

BANNED PATTERNS \u2014 scan the WHOLE response:
1. User as subject referencing their last message: "You said..." / "You want me to..." / "What you're asking is..."
2. "That/this" pointing back to user's input: "That's not what you..." / "This means..."
3. Reframing: "Not [user's word] \u2014 [character's word]." / "So what I'm hearing is..."
4. Processing narration: "Your words [verb]..." / character processing what user said / italicized recaps of user's dialogue as thought.

EXCEPTIONS (NOT violations):

E1. POV stage direction: "You stepped back" / "You turned away" describing physical movement is scene continuity, not echo. Test: does the sentence describe what the user DID (physical action) or what they SAID/MEANT (conversational restatement)?

E2. Semantic transformation: The character attributes meaning the user didn't literally say \u2014 flipping a word, catching an implication. Test: has the semantic content CHANGED from the user's actual words? Interpretation that transforms meaning = permitted. Restatement that preserves meaning = violation.

E3. Deal confirmation: Restating mutual terms to establish a binding commitment ("You said a week. I said a week.") creates a new narrative fact. Test: does the restatement produce a commitment, or just show the character heard? Commitment = permitted.

FIX: Cut the violating sentence. Replace with the character's NEXT ACTION \u2014 what they do, say about a new subject, or decide. One-word acknowledgment permitted ("Yeah." / nod), then forward. Do not rephrase the echo \u2014 delete it and bridge the gap.`
      },
      {
        id: "prompt_mnx2z7ll9lk7",
        name: "Anti-Slop V6 (Prolix)",
        content: `- The Lucid Loom: High-Effort Prose Protocol

You are a weaver. The Loom rejects slop. If a thought carries a banned pattern, discard it\u2014do not rephrase. Find the truer thought beneath.

---

#### \xA71. BANNED PATTERNS

Each ban includes the door out.

**Explaining Instead of Rendering:**
Negation-assertion (wasn't X but Y), lock-and-key clich\xE9s (clicked into place), physical blow/thing comparisons (hit like a punch), ozone-after-power. All attempt to *tell* the reader something happened rather than *make* it happen.
**Carve-Out: Character Denial Voice**
Negation-assertion as a PROSE STRUCTURE (the narrator explaining emotions through what they're not) remains banned. "It wasn't anger \u2014 it was something deeper" is the model dodging precision.

Negation as a CHARACTER BEHAVIOR is permitted in:
- First-person interiority where the POV character is lying to themselves: "Not because I cared. It was a popular flavor."
- Dialogue where the speaker is deflecting: "It's not like I came here for you."

The test: Is the negation doing the model's job (explaining an emotion it can't name)? Or is it doing the character's job (performing denial the reader sees through)?

If the reader is meant to BELIEVE the negation -> it's bad prose. Cut it.
If the reader is meant to SEE THROUGH the negation -> it's characterization. Keep it.
*The Door:* Delete the explanation. Describe what the body does, what stops mid-motion, what goes silent. Skip the realization; show its aftermath.

**Throat-Clearing:**
Opening any beat with narration of reception\u2014words landing, questions hanging, statements hitting, silence settling. Also: action-as-stall before response (the sharp inhale, the pause, the going-still). Both perform receiving instead of responding.
*Hard Ban:* No scene, dialogue reply, or transition opens with how input arrived. These constructions do not exist as openers.
*The Door:* Begin with response. Dialogue, action, or silence itself\u2014not silence as something words "fell into." First sentence is reaction, not registration.

**Borrowed Language:**
Somatic clich\xE9s are the surest sign of purple prose: shivers down spines, breath hitching/catching, hearts skipping/clenching, stomachs dropping/tightening, going still, sharp inhales. Also: predatory tropes (circling, dark hunger), texture fallacies (velvety voice, liquid tone), economy tropes (fluid grace, pregnant pause).
*The Door:* Plain statement. She was afraid. He didn't answer. The room was quiet. Beige prose that names the thing is stronger than purple prose that dances around it. When you reach for a shiver or a hitched breath, ask: am I decorating because I have nothing to say?

**Inflation:**
Cosmic melodrama (world shattering, time stopping), filter words (she noticed, he felt), unearned intensifiers. The attempt to create magnitude through scale.
*The Door:* Zoom in. The smaller the detail, the larger the implication. A crumb on a table during terrible news. Trust the domestic to carry the cosmic.

**AI Fingerprints:**
Snappy triads, false profundity (something shifted), rhetorical mid-sentence questions, vapid openers. Names: Elara, Kael, Lyra. Places: Eldoria, Aethelgard. Factions: The Shadow-anything.
*The Door:* If a phrase could appear in a thousand texts, it has no place in this one. What could only be true here?

---

#### \xA72. REQUIRED TECHNIQUES

Grouped by function.

**The Prose Spectrum:**
Beige prose is plain, functional, invisible\u2014the reader sees through it to the story. Blue prose is lyrical but restrained, choosing one precise image over three decorative ones. Purple prose is overwrought, ornate, performing intensity it hasn't earned. Default to beige. Earn your way to blue. Purple is forbidden.

**Compression (\u012Aj\u0101z / B\xE1imi\xE1o / Brevitas):**
Nouns and verbs only. One adjective maximum. No adverbs. If a verb needs modification, find the stronger verb. Remove words until the sentence collapses; the word before collapse was decorative.

**Rendering (Enargeia):**
Do not narrate. Place it before the eyes. Could this passage be filmed? If not, it is summary.

**Suggestion (Dhvani / Y\u016Bgen / Vakrokti):**
The suggested meaning beneath the literal. Omit what the reader can infer. Approach meaning sideways. Characters do not say what they mean; meaning lives in the gap.

**Negative Space (Ma / Iceberg / Kire):**
The silence between notes. The scene that ends mid-motion. The sentence that severs. What you don't write gives weight to what you do.

**Impermanence (Mono no Aware / Wabi-sabi):**
Beauty and transience are the same. Joy rendered as faintly sad; grief as strangely beautiful. Introduce the flaw\u2014the rust, the limp, the frayed edge. Perfection is sterile.

**Counterweight (Tib\u0101q / Litotes):**
Place opposites adjacent without explanation. Darkness and light, silence and roar. Or: deflate where instinct inflates. Restraint implies what hyperbole destroys.

**Rhythm (Asyndeton / Jo-ha-ky\u016B):**
Omit conjunctions. Periods over commas. Begin slow, accelerate, end swift. After any sentence over twenty words, the next under eight. Prose breathes.

---

#### \xA73. THE NAMING FORGE

**Banned:** Soft-consonant clusters (Elara, Lyra, Kael), [Adjective]+[Feature] places (Silvermere), The [Dark]+[Noun] factions, aesthetic surnames (Blackwood, Nightshade).

**Required:** Hard consonants or clusters in every name. Every third name deliberately unlovely. Names from the same culture share phonotactic rules.

**Methods:** Mash two real naming traditions. Use mundane names for modern settings (Gary, Brenda). Invert nominative determinism (the assassin is Herbert). Mine historical records.

---

#### \xA74. CHECKS

Before any paragraph:
- Negation followed by assertion? Delete negation, state assertion.
- Simile explaining feeling? Delete simile, describe body.
- Telling intensity instead of creating it? Rewrite.
- Phrase could appear anywhere? Replace with the specific.
- Holding the reader's hand? Let go.
- First sentence narrates reception? Delete. Begin with sentence two.

The Loom knows when you are cheating.

Weave true.`
      }
    ],
    headCollection: [
      "character-context",
      "persona-context",
      "pov-context",
      "lore-context",
      "context-block",
      "rules-header"
    ],
    strategy: "parallel",
    parallel: {
      proposals: [
        {
          stages: [
            {
              id: "agent-prose",
              name: "Environmental Padding",
              rows: [
                {
                  role: "system",
                  promptIds: [
                    "system-prompt"
                  ]
                },
                {
                  role: "user",
                  promptIds: [
                    "__head__",
                    "rule-env-padding",
                    "prompt_mnx2z7ll9lk7",
                    "message-to-refine"
                  ]
                }
              ]
            },
            {
              id: "stage-a1tuhrw",
              name: "Repetition Ban",
              rows: [
                {
                  role: "system",
                  promptIds: [
                    "__head__",
                    "rule-repetition-ban",
                    "prompt_mnx2z7ll9lk7",
                    "message-to-refine"
                  ]
                }
              ]
            }
          ]
        },
        {
          stages: [
            {
              id: "agent-voice",
              name: "Character Autonomy",
              rows: [
                {
                  role: "system",
                  promptIds: [
                    "system-prompt"
                  ]
                },
                {
                  role: "user",
                  promptIds: [
                    "__head__",
                    "rule-autonomy",
                    "prompt_mnx2z7ll9lk7",
                    "message-to-refine"
                  ]
                }
              ]
            },
            {
              id: "stage-vd9j9b1",
              name: "Interiority",
              rows: [
                {
                  role: "system",
                  promptIds: [
                    "system-prompt"
                  ]
                },
                {
                  role: "user",
                  promptIds: [
                    "__head__",
                    "rule-interiority",
                    "prompt_mnx2z7ll9lk7",
                    "message-to-refine"
                  ]
                }
              ]
            }
          ]
        },
        {
          stages: [
            {
              id: "agent-structure",
              name: "Structure",
              rows: [
                {
                  role: "system",
                  promptIds: [
                    "system-prompt"
                  ]
                },
                {
                  role: "user",
                  promptIds: [
                    "__head__",
                    "rule-ending",
                    "rule-pov",
                    "prompt_mnx2z7ll9lk7",
                    "message-to-refine"
                  ]
                }
              ]
            },
            {
              id: "stage-6xh76el",
              name: "Fairness",
              rows: [
                {
                  role: "system",
                  promptIds: [
                    "system-prompt"
                  ]
                },
                {
                  role: "assistant",
                  promptIds: [
                    "__head__",
                    "rule-anti-protagonist",
                    "prompt_mnx2z7ll9lk7",
                    "message-to-refine"
                  ]
                }
              ]
            }
          ]
        }
      ],
      aggregator: {
        stages: [
          {
            id: "aggregator",
            name: "Aggregator",
            rows: [
              {
                role: "system",
                promptIds: [
                  "aggregator-system"
                ]
              },
              {
                role: "user",
                promptIds: [
                  "aggregator-user",
                  "rule-env-padding",
                  "rule-interiority",
                  "rule-repetition-ban",
                  "rule-autonomy",
                  "rule-anti-protagonist",
                  "prompt_mnx2765jt4er",
                  "rule-echo-ban"
                ]
              }
            ]
          },
          {
            id: "stage-ku2z628",
            name: "Final Anti-Slop Pass",
            rows: [
              {
                role: "system",
                promptIds: [
                  "system-prompt"
                ]
              },
              {
                role: "user",
                promptIds: [
                  "__head__",
                  "prompt_mnx2z7ll9lk7",
                  "message-to-refine"
                ]
              }
            ]
          }
        ]
      }
    }
  }
};
// built-in-presets/input/input-single-pass-1.0.hone-preset.json
var input_single_pass_1_0_hone_preset_default = {
  formatVersion: 1,
  exportedAt: "2026-04-12T08:30:00.000Z",
  preset: {
    id: "input-single-default-1.0",
    name: "Input Single Pass 1.0",
    shieldLiteralBlocks: false,
    prompts: [
      {
        id: "input-system-prompt",
        name: "System Prompt",
        content: `You are a roleplay writing assistant. You enhance user-written roleplay messages by fixing grammar, improving prose, and ensuring the writing matches the user's character persona.

Core principles:
- Fix grammar, spelling, and punctuation errors
- Preserve the user's creative intent, actions, dialogue content, and story direction exactly
- Match the user's character voice and persona \u2014 their speech patterns, vocabulary, and personality
- Keep approximately the same length unless a rule specifically calls for cuts
- Do not add new story elements, actions, or dialogue not present in the original
- Do not change the meaning, emotional tone, or direction of what the user wrote
- Do not censor, sanitize, or tone down content \u2014 the original's maturity level is intentional
- Maintain existing formatting conventions (e.g. *asterisks for actions*, "quotes for dialogue")
- Enhance prose quality while keeping the user's style \u2014 fix awkward phrasing, improve flow
- Ensure consistency with the user's character persona and established lore
- The user wrote this message as their character \u2014 treat every line as intentional role-playing

Output format (MANDATORY \u2014 always follow this structure):
1. First, output a changelog inside <HONE-NOTES>...</HONE-NOTES> tags listing each change you made and which rule motivated it. One line per change made. ONLY list changes you actually made. Do not list rules that passed, items you considered but left unchanged, or deliberation. If you checked a rule and changed nothing, do not mention it.
2. Then output the full enhanced message inside <HONE-OUTPUT>...</HONE-OUTPUT> tags with no other commentary.

Example:
<HONE-NOTES>
- Grammar: Fixed "their" -> "they're" in paragraph 2
- Voice: Adjusted phrasing to match character's casual speech pattern
</HONE-NOTES>
<HONE-OUTPUT>
(enhanced message here)
</HONE-OUTPUT>

Do NOT output any analysis, reasoning, or commentary outside the tags. Only output the two tagged blocks.

You will be given the original message, a set of enhancement rules to apply, and context about the user's character persona and the scene. Apply the rules faithfully.Additionally, if the given message is empty or lacking context, please impersonate the persona and create your own short in-persona response. If the message contains instructions, please follow those instructions.`
      },
      {
        id: "character-context",
        name: "Character Description",
        content: `[CHARACTER: {{char}}]
{{description}}`
      },
      {
        id: "persona-context",
        name: "User Persona",
        content: `[USER PERSONA]
{{persona}}`
      },
      {
        id: "pov-context",
        name: "POV Instruction",
        content: `[POV]
{{pov}}`
      },
      {
        id: "context-block",
        name: "Chat History",
        content: `[CHAT HISTORY]
{{context}}`
      },
      {
        id: "latest-ai-context",
        name: "Last AI Response",
        content: `[LAST AI RESPONSE]
{{latest}}`
      },
      {
        id: "rules-header",
        name: "Rules Header",
        content: "[RULES]"
      },
      {
        id: "input-message-to-enhance",
        name: "Message to Enhance",
        content: `[MESSAGE TO ENHANCE]
{{userMessage}}`
      },
      {
        id: "input-rule-grammar",
        name: "Grammar & Spelling",
        content: '- Fix grammar & spelling: Fix grammatical errors, spelling mistakes, and awkward phrasing. Preserve intentional dialect, slang, verbal tics, and character-specific speech patterns \u2014 only correct genuine errors. The user wrote this message in character; do not "correct" deliberate voice choices.'
      },
      {
        id: "input-rule-persona-voice",
        name: "Persona Voice",
        content: `- Match persona voice: Using the "Your character" context provided above, ensure the message's dialogue and narration match the user's character persona:
1. Speech register: If the persona is casual, don't polish into formal prose. If the persona is eloquent, don't simplify.
2. Vocabulary: Use words and expressions consistent with the character's background, education, and personality.
3. Verbal tics and patterns: If the persona has established speech habits (contractions, sentence fragments, specific phrases), lean into them.
4. Emotional expression: Match how this character would express the emotion \u2014 stoic characters understate, dramatic characters amplify.

Do not invent new personality traits. Work with what the persona description establishes.`
      },
      {
        id: "input-rule-prose",
        name: "Prose Quality",
        content: `- Improve prose: Improve the user's prose while preserving their intent and meaning:
1. Awkward phrasing: Smooth out clunky sentence constructions without changing the meaning.
2. Vague descriptions: Where the user wrote something generic ("looked around the room"), suggest a more specific or vivid alternative that fits the scene.
3. Passive voice: Convert unnecessary passive constructions to active voice when it improves clarity.
4. Redundancy: Cut redundant phrases ("nodded his head," "shrugged her shoulders") to the cleaner form.

Do NOT over-embellish. The user's brevity may be intentional. Improve clarity and vividness, not word count.`
      },
      {
        id: "input-rule-formatting",
        name: "Formatting",
        content: `- Fix formatting: Ensure consistent formatting within the message:
1. Fix orphaned formatting marks (unclosed asterisks, mismatched quotes)
2. Ensure consistent convention: *asterisks for actions/narration*, "quotes for dialogue" (or whatever convention the user established)
3. Fix dialogue punctuation errors
4. Ensure paragraph breaks are placed sensibly

Do not change the user's chosen convention \u2014 only correct errors within it.`
      },
      {
        id: "input-rule-scene-continuity",
        name: "Scene Continuity",
        content: `- Check scene continuity: Using the "Last response" context provided above, check that the user's message is consistent with the established scene:
1. Spatial continuity: If the last response placed characters in a specific location or position, does the user's action make physical sense?
2. Object continuity: If the user references an object, was it established in the scene?
3. Conversational continuity: If the user's dialogue responds to something, does it match what was actually said?

Only flag clear contradictions. Ambiguity is fine \u2014 the user may be intentionally advancing the scene. Fix only outright impossibilities.`
      },
      {
        id: "input-rule-expand-brevity",
        name: "Expand Brevity",
        content: `- Expand brief messages: If the user's message is very brief (1-2 short sentences), expand it into a richer scene contribution while preserving the exact intent:
1. Add sensory detail: What does the character see, hear, feel in this moment?
2. Add body language: How does the character physically express the action or emotion?
3. Add interiority: A brief thought or reaction that reveals character.

IMPORTANT: Do NOT change the user's actions, dialogue, or decisions. Only add texture around what they wrote. If the message is already substantial (3+ sentences with detail), leave it as-is.`
      }
    ],
    headCollection: ["character-context", "persona-context", "pov-context", "context-block", "latest-ai-context", "rules-header"],
    strategy: "pipeline",
    pipeline: {
      stages: [
        {
          id: "input-all",
          name: "Enhance",
          rows: [
            { role: "system", promptIds: ["input-system-prompt"] },
            { role: "user", promptIds: ["__head__", "input-rule-grammar", "input-rule-persona-voice", "input-rule-prose", "input-rule-formatting", "input-rule-scene-continuity", "input-rule-expand-brevity", "input-message-to-enhance"] }
          ]
        }
      ]
    }
  }
};
// built-in-presets/input/input-multi-stage-1.0.hone-preset.json
var input_multi_stage_1_0_hone_preset_default = {
  formatVersion: 1,
  exportedAt: "2026-04-12T08:30:00.000Z",
  preset: {
    id: "input-multi-default-1.0",
    name: "Input Multi Stage 1.0",
    shieldLiteralBlocks: false,
    prompts: [
      {
        id: "input-system-prompt",
        name: "System Prompt",
        content: `You are a roleplay writing assistant. You enhance user-written roleplay messages by fixing grammar, improving prose, and ensuring the writing matches the user's character persona.

Core principles:
- Fix grammar, spelling, and punctuation errors
- Preserve the user's creative intent, actions, dialogue content, and story direction exactly
- Match the user's character voice and persona \u2014 their speech patterns, vocabulary, and personality
- Keep approximately the same length unless a rule specifically calls for cuts
- Do not add new story elements, actions, or dialogue not present in the original
- Do not change the meaning, emotional tone, or direction of what the user wrote
- Do not censor, sanitize, or tone down content \u2014 the original's maturity level is intentional
- Maintain existing formatting conventions (e.g. *asterisks for actions*, "quotes for dialogue")
- Enhance prose quality while keeping the user's style \u2014 fix awkward phrasing, improve flow
- Ensure consistency with the user's character persona and established lore
- The user wrote this message as their character \u2014 treat every line as intentional role-playing

Output format (MANDATORY \u2014 always follow this structure):
1. First, output a changelog inside <HONE-NOTES>...</HONE-NOTES> tags listing each change you made and which rule motivated it. One line per change made. ONLY list changes you actually made. Do not list rules that passed, items you considered but left unchanged, or deliberation. If you checked a rule and changed nothing, do not mention it.
2. Then output the full enhanced message inside <HONE-OUTPUT>...</HONE-OUTPUT> tags with no other commentary.

Example:
<HONE-NOTES>
- Grammar: Fixed "their" -> "they're" in paragraph 2
- Voice: Adjusted phrasing to match character's casual speech pattern
</HONE-NOTES>
<HONE-OUTPUT>
(enhanced message here)
</HONE-OUTPUT>

Do NOT output any analysis, reasoning, or commentary outside the tags. Only output the two tagged blocks.

You will be given the original message, a set of enhancement rules to apply, and context about the user's character persona and the scene. Apply the rules faithfully. Additionally, if the given message is empty or lacking context, please impersonate the persona and create your own short in-persona response. If the message contains instructions, please follow those instructions.`
      },
      {
        id: "character-context",
        name: "Character Description",
        content: `[CHARACTER: {{char}}]
{{description}}`
      },
      {
        id: "persona-context",
        name: "User Persona",
        content: `[USER PERSONA]
{{persona}}`
      },
      {
        id: "pov-context",
        name: "POV Instruction",
        content: `[POV]
{{pov}}`
      },
      {
        id: "context-block",
        name: "Chat History",
        content: `[CHAT HISTORY]
{{context}}`
      },
      {
        id: "latest-ai-context",
        name: "Last AI Response",
        content: `[LAST AI RESPONSE]
{{latest}}`
      },
      {
        id: "rules-header",
        name: "Rules Header",
        content: "[RULES]"
      },
      {
        id: "input-message-to-enhance",
        name: "Message to Enhance",
        content: `[MESSAGE TO ENHANCE]
{{userMessage}}`
      },
      {
        id: "input-rule-grammar",
        name: "Grammar & Spelling",
        content: '- Fix grammar & spelling: Fix grammatical errors, spelling mistakes, and awkward phrasing. Preserve intentional dialect, slang, verbal tics, and character-specific speech patterns \u2014 only correct genuine errors. The user wrote this message in character; do not "correct" deliberate voice choices.'
      },
      {
        id: "input-rule-persona-voice",
        name: "Persona Voice",
        content: `- Match persona voice: Using the "Your character" context provided above, ensure the message's dialogue and narration match the user's character persona:
1. Speech register: If the persona is casual, don't polish into formal prose. If the persona is eloquent, don't simplify.
2. Vocabulary: Use words and expressions consistent with the character's background, education, and personality.
3. Verbal tics and patterns: If the persona has established speech habits (contractions, sentence fragments, specific phrases), lean into them.
4. Emotional expression: Match how this character would express the emotion \u2014 stoic characters understate, dramatic characters amplify.

Do not invent new personality traits. Work with what the persona description establishes.`
      },
      {
        id: "input-rule-prose",
        name: "Prose Quality",
        content: `- Improve prose: Improve the user's prose while preserving their intent and meaning:
1. Awkward phrasing: Smooth out clunky sentence constructions without changing the meaning.
2. Vague descriptions: Where the user wrote something generic ("looked around the room"), suggest a more specific or vivid alternative that fits the scene.
3. Passive voice: Convert unnecessary passive constructions to active voice when it improves clarity.
4. Redundancy: Cut redundant phrases ("nodded his head," "shrugged her shoulders") to the cleaner form.

Do NOT over-embellish. The user's brevity may be intentional. Improve clarity and vividness, not word count.`
      },
      {
        id: "input-rule-formatting",
        name: "Formatting",
        content: `- Fix formatting: Ensure consistent formatting within the message:
1. Fix orphaned formatting marks (unclosed asterisks, mismatched quotes)
2. Ensure consistent convention: *asterisks for actions/narration*, "quotes for dialogue" (or whatever convention the user established)
3. Fix dialogue punctuation errors
4. Ensure paragraph breaks are placed sensibly

Do not change the user's chosen convention \u2014 only correct errors within it.`
      },
      {
        id: "input-rule-scene-continuity",
        name: "Scene Continuity",
        content: `- Check scene continuity: Using the "Last response" context provided above, check that the user's message is consistent with the established scene:
1. Spatial continuity: If the last response placed characters in a specific location or position, does the user's action make physical sense?
2. Object continuity: If the user references an object, was it established in the scene?
3. Conversational continuity: If the user's dialogue responds to something, does it match what was actually said?

Only flag clear contradictions. Ambiguity is fine \u2014 the user may be intentionally advancing the scene. Fix only outright impossibilities.`
      },
      {
        id: "input-rule-expand-brevity",
        name: "Expand Brevity",
        content: `- Expand brief messages: If the user's message is very brief (1-2 short sentences), expand it into a richer scene contribution while preserving the exact intent:
1. Add sensory detail: What does the character see, hear, feel in this moment?
2. Add body language: How does the character physically express the action or emotion?
3. Add interiority: A brief thought or reaction that reveals character.

IMPORTANT: Do NOT change the user's actions, dialogue, or decisions. Only add texture around what they wrote. If the message is already substantial (3+ sentences with detail), leave it as-is.`
      }
    ],
    headCollection: ["character-context", "persona-context", "pov-context", "context-block", "latest-ai-context", "rules-header"],
    strategy: "pipeline",
    pipeline: {
      stages: [
        {
          id: "input-grammar",
          name: "Grammar & Formatting",
          rows: [
            { role: "system", promptIds: ["input-system-prompt"] },
            { role: "user", promptIds: ["__head__", "input-rule-grammar", "input-rule-formatting", "input-rule-scene-continuity", "input-rule-expand-brevity", "input-message-to-enhance"] }
          ]
        },
        {
          id: "input-voice",
          name: "Voice & Prose",
          rows: [
            { role: "system", promptIds: ["input-system-prompt"] },
            { role: "user", promptIds: ["__head__", "input-rule-persona-voice", "input-rule-prose", "input-rule-scene-continuity", "input-rule-expand-brevity", "input-message-to-enhance"] }
          ]
        }
      ]
    }
  }
};

// src/preset-defaults.ts
function loadBuiltIn(blob, slot) {
  const p = blob.preset;
  if (!Array.isArray(p.headCollection)) {
    throw new Error(`Built-in preset "${p.id}" is missing required field "headCollection"`);
  }
  if (typeof p.shieldLiteralBlocks !== "boolean") {
    throw new Error(`Built-in preset "${p.id}" is missing required field "shieldLiteralBlocks"`);
  }
  return {
    id: p.id,
    name: p.name,
    builtIn: true,
    slot,
    prompts: p.prompts,
    headCollection: p.headCollection,
    strategy: p.strategy,
    pipeline: p.pipeline,
    parallel: p.parallel,
    shieldLiteralBlocks: p.shieldLiteralBlocks,
    ...p.shieldConfig ? { shieldConfig: p.shieldConfig } : {}
  };
}
var SIMULACRA_V4_ID = "simulacra-v4-1.0";
var INPUT_SINGLE_DEFAULT_ID = "input-single-default-1.0";
var REDRAFT_DEFAULT = loadBuiltIn(redraft_default_3_0_0_hone_preset_default, "output");
var REDRAFT_DEFAULT_LITE = loadBuiltIn(redraft_default_lite_3_0_0_hone_preset_default, "output");
var REDRAFT_3STEP = loadBuiltIn(redraft_3step_3_0_0_hone_preset_default, "output");
var REDRAFT_PARALLEL = loadBuiltIn(redraft_parallel_3_0_0_hone_preset_default, "output");
var SIMULACRA_V4 = loadBuiltIn(simulacra_v4_1_0_hone_preset_default, "output");
var SIMULACRA_V4_LITE = loadBuiltIn(simulacra_v4_lite_1_0_hone_preset_default, "output");
var SIMULACRA_V4_3STEP = loadBuiltIn(simulacra_v4_3step_1_0_hone_preset_default, "output");
var SIMULACRA_V4_PARALLEL = loadBuiltIn(simulacra_v4_parallel_1_0_hone_preset_default, "output");
var EXTREME_EXAMPLE = loadBuiltIn(extreme_example_hone_preset_default, "output");
var INPUT_SINGLE_DEFAULT = loadBuiltIn(input_single_pass_1_0_hone_preset_default, "input");
var INPUT_MULTI_DEFAULT = loadBuiltIn(input_multi_stage_1_0_hone_preset_default, "input");
var BUILTIN_PRESETS = [
  REDRAFT_DEFAULT,
  REDRAFT_DEFAULT_LITE,
  REDRAFT_3STEP,
  REDRAFT_PARALLEL,
  SIMULACRA_V4,
  SIMULACRA_V4_LITE,
  SIMULACRA_V4_3STEP,
  SIMULACRA_V4_PARALLEL,
  EXTREME_EXAMPLE,
  INPUT_SINGLE_DEFAULT,
  INPUT_MULTI_DEFAULT
];
var DEFAULT_ACTIVE_PRESET_ID = SIMULACRA_V4_ID;
var DEFAULT_INPUT_ACTIVE_PRESET_ID = INPUT_SINGLE_DEFAULT_ID;

// src/constants.ts
var DEFAULT_PROFILE_ID = "__default__";
var HEAD_COLLECTION_ID = "__head__";

// src/storage/user-storage.ts
var SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;
function isSafeId(id) {
  return SAFE_ID.test(id);
}
function assertSafeId(id) {
  if (!SAFE_ID.test(id)) {
    throw new Error(`Invalid id "${id}"`);
  }
}
async function getJson(path, userId, fallback) {
  return spindle.userStorage.getJson(path, { fallback, userId });
}
async function setJson(path, value, userId, indent) {
  await spindle.userStorage.setJson(path, value, indent === undefined ? { userId } : { userId, indent });
}
async function deletePath(path, userId) {
  await spindle.userStorage.delete(path, userId);
}
async function listUnder(prefix, userId) {
  try {
    const files = await spindle.userStorage.list(prefix, userId);
    return files.map((f) => f.replace(/\\/g, "/"));
  } catch {
    return [];
  }
}

// src/hlog.ts
var DEFAULT_MAX_ENTRIES = 2000;
var MIN_MAX_ENTRIES = 100;
var MAX_MAX_ENTRIES = 20000;
function makeRing(capacity) {
  return { data: new Array(capacity).fill(null), head: 0, size: 0 };
}
function ringPush(buf, entry) {
  const cap = buf.data.length;
  if (buf.size < cap) {
    buf.data[(buf.head + buf.size) % cap] = entry;
    buf.size++;
  } else {
    buf.data[buf.head] = entry;
    buf.head = (buf.head + 1) % cap;
  }
}
function ringSnapshot(buf) {
  const cap = buf.data.length;
  const out = new Array(buf.size);
  for (let i = 0;i < buf.size; i++) {
    out[i] = buf.data[(buf.head + i) % cap];
  }
  return out;
}
function ringResize(buf, newCapacity) {
  const live = ringSnapshot(buf);
  const keep = live.length > newCapacity ? live.slice(live.length - newCapacity) : live;
  const next = makeRing(newCapacity);
  for (const entry of keep)
    ringPush(next, entry);
  return next;
}
function clampCapacity(raw) {
  const n = typeof raw === "number" ? Math.floor(raw) : DEFAULT_MAX_ENTRIES;
  return Math.max(MIN_MAX_ENTRIES, Math.min(MAX_MAX_ENTRIES, n));
}
var debugEnabledCache = new Map;
var fullPayloadCache = new Map;
var capacityCache = new Map;
var buffers = new Map;
function setDebugEnabled(userId, enabled, maxEntries, fullPayloads) {
  const prev = debugEnabledCache.get(userId) || false;
  debugEnabledCache.set(userId, enabled);
  fullPayloadCache.set(userId, enabled && fullPayloads === true);
  const newCap = clampCapacity(maxEntries);
  const prevCap = capacityCache.get(userId);
  capacityCache.set(userId, newCap);
  if (prev && !enabled) {
    buffers.delete(userId);
    return;
  }
  if (!enabled)
    return;
  const existing = buffers.get(userId);
  if (existing && prevCap !== newCap) {
    buffers.set(userId, ringResize(existing, newCap));
  }
}
function isFullPayloadEnabled(userId) {
  return fullPayloadCache.get(userId) === true;
}
function debug(userId, msg) {
  if (!debugEnabledCache.get(userId))
    return;
  let buf = buffers.get(userId);
  if (!buf) {
    buf = makeRing(capacityCache.get(userId) ?? DEFAULT_MAX_ENTRIES);
    buffers.set(userId, buf);
  }
  ringPush(buf, { ts: Date.now(), msg });
}
function getLogs(userId) {
  const buf = buffers.get(userId);
  return buf ? ringSnapshot(buf) : [];
}
function formatLogs(userId) {
  const entries = getLogs(userId);
  if (entries.length === 0)
    return "(no debug log entries)";
  const lines = new Array(entries.length);
  for (let i = 0;i < entries.length; i++) {
    const e = entries[i];
    const d = new Date(e.ts);
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    const s = String(d.getSeconds()).padStart(2, "0");
    const ms = String(d.getMilliseconds()).padStart(3, "0");
    lines[i] = `[${h}:${m}:${s}.${ms}] ${e.msg}`;
  }
  return lines.join(`
`);
}
function clearLogs(userId) {
  buffers.delete(userId);
}
function bufferStats(userId) {
  return {
    count: buffers.get(userId)?.size ?? 0,
    capacity: capacityCache.get(userId) ?? DEFAULT_MAX_ENTRIES,
    enabled: debugEnabledCache.get(userId) === true
  };
}

// src/resources/resource-service.ts
function slugify(input, fallback) {
  const base = input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return base || fallback;
}
function createResourceService(cfg) {
  const pathFor = (id) => `${cfg.prefix}${id}.json`;
  const builtInIds = new Set(cfg.builtIns.map((b) => b.id));
  async function listCustomIds(userId) {
    const files = await listUnder(cfg.prefix, userId);
    return files.filter((f) => /^[^/]+\.json$/.test(f)).map((f) => f.replace(/\.json$/, "")).filter(isSafeId);
  }
  async function loadCustom(userId, id) {
    if (!isSafeId(id))
      return null;
    const raw = await getJson(pathFor(id), userId, null);
    if (!raw)
      return null;
    try {
      return cfg.normalize(raw, id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      debug(userId, `${cfg.kind}: normalize "${id}" failed: ${msg}`);
      return null;
    }
  }
  async function uniqueId(userId, base) {
    const fallback = cfg.kind.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "item";
    const slug = slugify(base, fallback);
    const taken = new Set(builtInIds);
    for (const id of await listCustomIds(userId))
      taken.add(id);
    if (!taken.has(slug))
      return slug;
    for (let i = 2;i < 1e4; i++) {
      const candidate = `${slug}-${i}`;
      if (!taken.has(candidate))
        return candidate;
    }
    return `${slug}-${Date.now().toString(36)}`;
  }
  return {
    async list(userId) {
      const summaries = cfg.builtIns.map((b) => cfg.summarize(b, true));
      const customs = [];
      for (const id of await listCustomIds(userId)) {
        const item = await loadCustom(userId, id);
        if (item)
          customs.push(cfg.summarize(item, false));
      }
      customs.sort((a, b) => a.name.localeCompare(b.name));
      return [...customs, ...summaries];
    },
    async get(userId, id) {
      const builtIn = cfg.builtIns.find((b) => b.id === id);
      if (builtIn)
        return builtIn;
      return loadCustom(userId, id);
    },
    getBuiltIn(id) {
      return cfg.builtIns.find((b) => b.id === id) ?? null;
    },
    isBuiltIn(id) {
      return builtInIds.has(id);
    },
    async save(userId, item) {
      if (builtInIds.has(item.id)) {
        throw new Error(`Cannot overwrite built-in ${cfg.kind} "${item.id}"`);
      }
      assertSafeId(item.id);
      cfg.validateSave?.(item);
      await setJson(pathFor(item.id), item, userId);
    },
    async delete(userId, id) {
      if (builtInIds.has(id)) {
        throw new Error(`Cannot delete built-in ${cfg.kind} "${id}"`);
      }
      assertSafeId(id);
      await deletePath(pathFor(id), userId);
    },
    async duplicate(userId, sourceId) {
      const source = await this.get(userId, sourceId);
      if (!source)
        throw new Error(`${cfg.kind} "${sourceId}" not found`);
      const newName = `${source.name} (Copy)`;
      const newId = await uniqueId(userId, newName);
      const copy = cfg.buildCopy(source, newId, newName);
      await this.save(userId, copy);
      return copy;
    },
    async exists(userId, id) {
      if (builtInIds.has(id))
        return true;
      const item = await loadCustom(userId, id);
      return item !== null;
    },
    nextId(userId, baseName) {
      return uniqueId(userId, baseName);
    }
  };
}

// src/resources/pov-presets.ts
var BUILTIN_POV_PRESETS = [
  {
    id: "auto",
    name: "Auto-detect",
    content: "Point-of-view: Match the point-of-view, tense, and pronoun conventions already established in the surrounding text. Do not shift perspective."
  },
  {
    id: "1st",
    name: "First Person",
    content: "Point-of-view: First person. The POV character uses I/me/my in narration. The addressed character uses you/your. Other characters use he/she/they."
  },
  {
    id: "1.5",
    name: "First Person (1.5)",
    content: "Point-of-view: First person with direct address. The POV character uses I/me/my. The addressed character is referred to as you/your in narration and description (not he/she). Other characters use he/she/they."
  },
  {
    id: "2nd",
    name: "Second Person",
    content: "Point-of-view: Second person. The addressed character uses you/your in narration. All other characters use he/she/they/proper names."
  },
  {
    id: "3rd",
    name: "Third Person",
    content: "Point-of-view: Third person. All characters use he/she/they/proper names. No I/you in narration."
  }
];
var DEFAULT_POV_PRESET_ID = "auto";
var DEFAULT_USER_POV_PRESET_ID = "1st";
var service = createResourceService({
  kind: "POV preset",
  prefix: "pov-presets/",
  builtIns: BUILTIN_POV_PRESETS,
  summarize: (item, builtIn) => ({
    id: item.id,
    name: item.name,
    content: item.content,
    builtIn
  }),
  normalize: (raw, id) => {
    if (!raw || typeof raw !== "object")
      return null;
    const v = raw;
    if (typeof v.name !== "string" || typeof v.content !== "string")
      return null;
    return { id, name: v.name, content: v.content };
  },
  buildCopy: (source, newId, newName) => ({
    id: newId,
    name: newName,
    content: source.content
  }),
  validateSave: (item) => {
    if (typeof item.name !== "string" || typeof item.content !== "string") {
      throw new Error("POV preset requires name and content strings");
    }
  }
});
function listPovPresets(userId) {
  return service.list(userId);
}
function savePovPreset(userId, preset) {
  return service.save(userId, { ...preset, name: preset.name.trim() || preset.id });
}
function deletePovPreset(userId, id) {
  return service.delete(userId, id);
}
function duplicatePovPreset(userId, sourceId) {
  return service.duplicate(userId, sourceId);
}
function isBuiltInPovPresetId(id) {
  return service.isBuiltIn(id);
}
async function resolvePovContent(userId, id) {
  const preset = await service.get(userId, id);
  if (preset)
    return preset.content;
  const fallback = service.getBuiltIn(DEFAULT_POV_PRESET_ID);
  return fallback?.content ?? "";
}

// src/defaults.ts
var DEFAULT_SETTINGS = {
  enabled: true,
  autoRefine: false,
  activeModelProfileId: DEFAULT_PROFILE_ID,
  currentPresetId: DEFAULT_ACTIVE_PRESET_ID,
  currentInputPresetId: DEFAULT_INPUT_ACTIVE_PRESET_ID,
  pov: DEFAULT_POV_PRESET_ID,
  autoShowDiff: true,
  userEnhanceEnabled: true,
  userAutoEnhance: false,
  userEnhanceMode: "post",
  userPov: DEFAULT_USER_POV_PRESET_ID,
  maxLorebookTokens: 50000,
  maxMessageContextTokens: 4000,
  generationTimeoutSecs: 120,
  minCharThreshold: 20,
  batchIntervalMs: 2000,
  notificationSoundEnabled: false,
  notificationSoundUrl: "",
  floatWidgetConfirm: false,
  floatWidgetHidden: false,
  floatWidgetSize: 124,
  floatWidgetLumiaMode: true,
  debugLogging: false,
  debugLogMaxEntries: 2000,
  debugLogFullPayloads: false
};

// src/mutation/queue.ts
var queues = new Map;
function enqueue(key, fn) {
  const prev = queues.get(key) || Promise.resolve();
  const next = prev.then(fn, fn).finally(() => {
    if (queues.get(key) === next)
      queues.delete(key);
  });
  queues.set(key, next);
  return next;
}
function enqueueChatOperation(key, fn) {
  return enqueue(`chat:${key}`, fn);
}
function enqueueUserOperation(userId, fn) {
  return enqueue(`user:${userId}`, fn);
}

// src/storage/settings.ts
var SETTINGS_FILE = "settings.json";
var cacheByUser = new Map;
function isPlainObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
function mergeSettingsWithDefaults(defaults, stored) {
  const out = { ...defaults };
  const storedBag = stored;
  const defaultsBag = defaults;
  for (const key of Object.keys(defaultsBag)) {
    const s = storedBag[key];
    if (s === undefined)
      continue;
    const d = defaultsBag[key];
    out[key] = isPlainObject(d) && isPlainObject(s) ? { ...d, ...s } : s;
  }
  return out;
}
async function loadSettings(userId) {
  const stored = await spindle.userStorage.getJson(SETTINGS_FILE, {
    fallback: {},
    userId
  });
  const merged = mergeSettingsWithDefaults(DEFAULT_SETTINGS, stored ?? {});
  cacheByUser.set(userId, merged);
  setDebugEnabled(userId, merged.debugLogging, merged.debugLogMaxEntries, merged.debugLogFullPayloads);
  return merged;
}
async function getSettings(userId) {
  const cached = cacheByUser.get(userId);
  if (cached)
    return cached;
  return loadSettings(userId);
}
async function persist(userId, settings) {
  await spindle.userStorage.setJson(SETTINGS_FILE, settings, { indent: 2, userId });
  cacheByUser.set(userId, settings);
  setDebugEnabled(userId, settings.debugLogging, settings.debugLogMaxEntries, settings.debugLogFullPayloads);
}
async function updateSettings(userId, partial) {
  let result = null;
  await enqueueUserOperation(userId, async () => {
    const current = await getSettings(userId);
    const updated = mergeSettingsWithDefaults(current, partial);
    await persist(userId, updated);
    result = updated;
  });
  return result;
}

// src/text/shield.ts
var PLACEHOLDER_AT_END = /<HONE-SHIELD-\d+\/>$/;
var SHIELD_FRAGMENT = /<\/?HONE-SHIELD-\d+\/?>|HONE-SHIELD-\d+/;
var MAX_SHIELD_PATTERN_LENGTH = 1e4;
var MAX_MATCHES_PER_PATTERN = 1e4;
var PATTERN_EXEC_WARN_MS = 500;
var DEFAULT_SHIELD_INCLUDE_PATTERNS = [
  "```[\\s\\S]*?```",
  "<([a-zA-Z][\\w:-]*)(\\s[^>]*)?>[\\s\\S]*?</\\1\\s*>",
  "^\\{[^\\n]*\\}$",
  "\\[[^\\]]*\\n[^\\]]*\\]"
];
var DEFAULT_SHIELD_EXCLUDE_PATTERNS = [
  "<(font|span|a|b|i|em|strong|u|s|del|ins|mark|sub|sup|small|code|kbd|var|samp|q|cite|abbr|dfn|time)\\b[^>]*>[\\s\\S]*?</\\1\\s*>"
];
function compilePattern(pattern) {
  if (pattern.length > MAX_SHIELD_PATTERN_LENGTH)
    return null;
  try {
    return new RegExp(pattern, "gmi");
  } catch {
    return null;
  }
}
function collectMatchSpans(text, patterns) {
  const spans = [];
  for (const pattern of patterns) {
    const re = compilePattern(pattern);
    if (!re)
      continue;
    const started = Date.now();
    let matches = 0;
    try {
      let m;
      while ((m = re.exec(text)) !== null) {
        if (m[0].length === 0) {
          re.lastIndex++;
          continue;
        }
        spans.push({ start: m.index, end: m.index + m[0].length, match: m[0] });
        if (++matches >= MAX_MATCHES_PER_PATTERN) {
          console.warn(`[Hone] shield pattern hit ${MAX_MATCHES_PER_PATTERN}-match cap, truncating: ${pattern.slice(0, 80)}`);
          break;
        }
      }
    } catch (err) {
      console.warn(`[Hone] shield pattern threw during exec, skipping: ${pattern.slice(0, 80)}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    const elapsed = Date.now() - started;
    if (elapsed > PATTERN_EXEC_WARN_MS) {
      console.warn(`[Hone] shield pattern took ${elapsed}ms (>${PATTERN_EXEC_WARN_MS}ms), possible catastrophic backtracking: ${pattern.slice(0, 80)}`);
    }
  }
  return spans;
}
function maskLiteralBlocks(text, includePatterns = DEFAULT_SHIELD_INCLUDE_PATTERNS, excludePatterns = DEFAULT_SHIELD_EXCLUDE_PATTERNS) {
  const excludeSpans = collectMatchSpans(text, excludePatterns);
  const isExcluded = (start, end) => excludeSpans.some((ex) => ex.start <= start && ex.end >= end);
  const candidates = collectMatchSpans(text, includePatterns).filter((c) => !isExcluded(c.start, c.end)).sort((a, b) => a.start - b.start || b.end - a.end);
  const chosen = [];
  for (const c of candidates) {
    const clash = chosen.some((k) => !(c.end <= k.start || c.start >= k.end));
    if (!clash)
      chosen.push(c);
  }
  const blocks = [];
  let out = "";
  let cursor = 0;
  for (const span of chosen) {
    out += text.slice(cursor, span.start);
    const token = `<HONE-SHIELD-${blocks.length}/>`;
    blocks.push({ placeholder: token, original: span.match });
    out += token;
    cursor = span.end;
  }
  out += text.slice(cursor);
  return { masked: out, blocks };
}
function unmaskLiteralBlocks(text, blocks) {
  if (blocks.length === 0)
    return text;
  const surviving = [];
  const dropped = [];
  for (const block of blocks) {
    if (text.includes(block.placeholder))
      surviving.push(block);
    else
      dropped.push(block);
  }
  let result = text;
  if (dropped.length > 0) {
    let insertionPoint = result.length;
    let scanPos = result.length;
    while (true) {
      let wsStart = scanPos;
      while (wsStart > 0 && /\s/.test(result[wsStart - 1]))
        wsStart--;
      if (wsStart === 0)
        break;
      const match = result.slice(0, wsStart).match(PLACEHOLDER_AT_END);
      if (!match)
        break;
      insertionPoint = wsStart - match[0].length;
      scanPos = insertionPoint;
    }
    const droppedContent = dropped.map((b) => b.original).join(`

`);
    const before = result.slice(0, insertionPoint);
    const after = result.slice(insertionPoint);
    const sepBefore = before.length === 0 || before.endsWith(`

`) ? "" : before.endsWith(`
`) ? `
` : `

`;
    const sepAfter = after.length === 0 || after.startsWith(`

`) ? "" : after.startsWith(`
`) ? `
` : `

`;
    result = before + sepBefore + droppedContent + sepAfter + after;
  }
  for (const block of surviving) {
    result = result.split(block.placeholder).join(block.original);
  }
  if (SHIELD_FRAGMENT.test(result)) {
    throw new Error("Shield sentinel mangled in LLM output: a HONE-SHIELD token was partially modified");
  }
  return result;
}
function substituteShields(text, blocks) {
  if (blocks.length === 0)
    return text;
  let result = text;
  for (const block of blocks) {
    if (result.includes(block.placeholder)) {
      result = result.split(block.placeholder).join(block.original);
    }
  }
  return result;
}

// src/text/history.ts
function buildChatHistoryBlock(messages, upToIndex, excludeId, tokenBudget) {
  if (tokenBudget <= 0)
    return "";
  const charBudget = tokenBudget * 4;
  const picked = [];
  let used = 0;
  for (let i = Math.min(upToIndex, messages.length - 1);i >= 0; i--) {
    const m = messages[i];
    if (excludeId && m.id === excludeId)
      continue;
    if (!m.content)
      continue;
    const remaining = charBudget - used;
    if (remaining <= 0)
      break;
    if (m.content.length <= remaining) {
      picked.push({ role: m.role, content: m.content });
      used += m.content.length;
    } else {
      picked.push({ role: m.role, content: m.content.slice(-remaining) });
      used = charBudget;
      break;
    }
  }
  picked.reverse();
  const parts = [];
  for (const p of picked) {
    const label = p.role === "user" ? "USER" : p.role === "assistant" ? "CHARACTER" : p.role.toUpperCase();
    parts.push(`[${label}]
${p.content}`);
  }
  return parts.join(`

`);
}
function approxTokens(text) {
  return Math.ceil(text.length / 4);
}

// src/resources/presets.ts
function requireString(v, path) {
  if (typeof v !== "string")
    throw new Error(`Invalid preset: expected string at ${path}`);
  return v;
}
function requireArray(v, path) {
  if (!Array.isArray(v))
    throw new Error(`Invalid preset: expected array at ${path}`);
  return v;
}
function normalizePrompt(raw, path) {
  if (!raw || typeof raw !== "object")
    throw new Error(`Invalid preset: expected object at ${path}`);
  const p = raw;
  return {
    id: requireString(p.id, `${path}.id`),
    name: requireString(p.name, `${path}.name`),
    content: typeof p.content === "string" ? p.content : ""
  };
}
function normalizeRow(raw, path) {
  if (!raw || typeof raw !== "object")
    throw new Error(`Invalid preset: expected object at ${path}`);
  const r = raw;
  const role = requireString(r.role, `${path}.role`);
  if (role !== "system" && role !== "user" && role !== "assistant") {
    throw new Error(`Invalid preset: unknown role "${role}" at ${path}.role`);
  }
  const promptIds = requireArray(r.promptIds, `${path}.promptIds`).map((id, i) => requireString(id, `${path}.promptIds[${i}]`));
  return { role, promptIds };
}
function normalizeStage(raw, path) {
  if (!raw || typeof raw !== "object")
    throw new Error(`Invalid preset: expected object at ${path}`);
  const s = raw;
  return {
    id: requireString(s.id, `${path}.id`),
    name: requireString(s.name, `${path}.name`),
    rows: requireArray(s.rows, `${path}.rows`).map((r, i) => normalizeRow(r, `${path}.rows[${i}]`)),
    modelProfileId: typeof s.modelProfileId === "string" && s.modelProfileId.length > 0 ? s.modelProfileId : undefined
  };
}
function normalizePipeline(raw, path) {
  if (!raw || typeof raw !== "object")
    throw new Error(`Invalid preset: expected object at ${path}`);
  const p = raw;
  return {
    stages: requireArray(p.stages, `${path}.stages`).map((s, i) => normalizeStage(s, `${path}.stages[${i}]`))
  };
}
function normalizeShieldConfig(raw) {
  if (raw === undefined || raw === null)
    return;
  if (typeof raw !== "object")
    throw new Error(`Invalid preset: "shieldConfig" must be an object`);
  const c = raw;
  const asStrings = (v, path) => {
    if (v === undefined)
      return [];
    if (!Array.isArray(v))
      throw new Error(`Invalid preset: "shieldConfig.${path}" must be an array of strings`);
    return v.map((s, i) => {
      if (typeof s !== "string")
        throw new Error(`Invalid preset: "shieldConfig.${path}[${i}]" must be a string`);
      return s;
    });
  };
  return { include: asStrings(c.include, "include"), exclude: asStrings(c.exclude, "exclude") };
}
function normalizeParallel(raw, path) {
  if (!raw || typeof raw !== "object")
    throw new Error(`Invalid preset: expected object at ${path}`);
  const c = raw;
  return {
    proposals: requireArray(c.proposals, `${path}.proposals`).map((p, i) => normalizePipeline(p, `${path}.proposals[${i}]`)),
    aggregator: normalizePipeline(c.aggregator, `${path}.aggregator`)
  };
}
function normalizePreset(raw) {
  if (!raw || typeof raw !== "object")
    throw new Error("Invalid preset: not an object");
  const p = raw;
  const strategy = requireString(p.strategy, "strategy");
  if (strategy !== "pipeline" && strategy !== "parallel") {
    throw new Error(`Invalid preset: unknown strategy "${strategy}"`);
  }
  if (p.slot !== "input" && p.slot !== "output") {
    throw new Error(`Invalid preset: slot must be "input" or "output"`);
  }
  const prompts = requireArray(p.prompts, "prompts").map((pr, i) => normalizePrompt(pr, `prompts[${i}]`));
  const seenPromptIds = new Set;
  for (const pr of prompts) {
    if (seenPromptIds.has(pr.id))
      throw new Error(`Invalid preset: duplicate prompt id "${pr.id}" in prompts`);
    seenPromptIds.add(pr.id);
  }
  const headCollection = requireArray(p.headCollection, "headCollection").map((id, i) => requireString(id, `headCollection[${i}]`));
  for (const [i, id] of headCollection.entries()) {
    if (id === HEAD_COLLECTION_ID) {
      throw new Error(`Invalid preset: headCollection[${i}] cannot reference itself ("${HEAD_COLLECTION_ID}")`);
    }
    if (!seenPromptIds.has(id)) {
      throw new Error(`Invalid preset: headCollection[${i}] references unknown prompt id "${id}"`);
    }
  }
  if (typeof p.shieldLiteralBlocks !== "boolean") {
    throw new Error(`Invalid preset: "shieldLiteralBlocks" must be boolean`);
  }
  const shieldConfig = normalizeShieldConfig(p.shieldConfig);
  const preset = {
    id: requireString(p.id, "id"),
    name: requireString(p.name, "name"),
    builtIn: false,
    slot: p.slot,
    prompts,
    headCollection,
    strategy,
    shieldLiteralBlocks: p.shieldLiteralBlocks,
    ...shieldConfig ? { shieldConfig } : {}
  };
  if (strategy === "pipeline") {
    if (!p.pipeline)
      throw new Error("Invalid preset: `pipeline` required when strategy is 'pipeline'");
    preset.pipeline = normalizePipeline(p.pipeline, "pipeline");
  } else {
    if (!p.parallel)
      throw new Error("Invalid preset: `parallel` required when strategy is 'parallel'");
    preset.parallel = normalizeParallel(p.parallel, "parallel");
  }
  const pipelines = strategy === "pipeline" ? [preset.pipeline] : [...preset.parallel.proposals, preset.parallel.aggregator];
  for (const [pipeIdx, pipe] of pipelines.entries()) {
    for (const [stIdx, st] of pipe.stages.entries()) {
      for (const [rowIdx, row] of st.rows.entries()) {
        for (const [pidIdx, pid] of row.promptIds.entries()) {
          if (pid === HEAD_COLLECTION_ID)
            continue;
          if (!seenPromptIds.has(pid)) {
            throw new Error(`Invalid preset: row at pipeline[${pipeIdx}].stages[${stIdx}].rows[${rowIdx}].promptIds[${pidIdx}] references unknown prompt id "${pid}"`);
          }
        }
      }
    }
  }
  return preset;
}
function deepCloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}
function stripStageModelProfiles(preset) {
  const pipelines = preset.strategy === "pipeline" ? preset.pipeline ? [preset.pipeline] : [] : preset.parallel ? [...preset.parallel.proposals, preset.parallel.aggregator] : [];
  for (const pipe of pipelines) {
    for (const stage of pipe.stages) {
      if (stage.modelProfileId !== undefined)
        delete stage.modelProfileId;
    }
  }
  return preset;
}
var service2 = createResourceService({
  kind: "preset",
  prefix: "presets/",
  builtIns: BUILTIN_PRESETS,
  summarize: (item, builtIn) => ({
    id: item.id,
    name: item.name,
    builtIn,
    strategy: item.strategy,
    slot: item.slot
  }),
  normalize: (raw, id) => {
    if (!raw || typeof raw !== "object")
      return null;
    const candidate = { ...raw, id };
    return normalizePreset(candidate);
  },
  buildCopy: (source, newId, newName) => ({
    ...deepCloneJson(source),
    id: newId,
    name: newName,
    builtIn: false
  }),
  validateSave: (item) => {
    normalizePreset({ ...item, builtIn: false });
  }
});
function listPresets(userId) {
  return service2.list(userId);
}
function getPreset(userId, id) {
  return service2.get(userId, id);
}
async function savePreset(userId, preset) {
  await service2.save(userId, { ...preset, builtIn: false });
}
function deletePreset(userId, id) {
  return service2.delete(userId, id);
}
function duplicatePreset(userId, id) {
  return service2.duplicate(userId, id);
}
var EXPORT_FORMAT_VERSION = 1;
async function exportPreset(userId, id) {
  const preset = await service2.get(userId, id);
  if (!preset)
    throw new Error(`Preset "${id}" not found`);
  const portable = stripStageModelProfiles(deepCloneJson(preset));
  const blob = {
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    preset: { ...portable, builtIn: false }
  };
  return { id: preset.id, name: preset.name, json: JSON.stringify(blob, null, 2) };
}
async function importPreset(userId, json, targetSlot) {
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new Error(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!parsed || typeof parsed !== "object")
    throw new Error("Preset file is not a JSON object");
  const blob = parsed;
  if (blob.formatVersion !== EXPORT_FORMAT_VERSION) {
    throw new Error(`Unsupported preset format version: ${blob.formatVersion} (expected ${EXPORT_FORMAT_VERSION})`);
  }
  if (!blob.preset)
    throw new Error("Export blob is missing `preset` field");
  const withSlot = { ...blob.preset, slot: targetSlot };
  const validated = normalizePreset(withSlot);
  const newId = await service2.nextId(userId, validated.name || validated.id);
  const toSave = stripStageModelProfiles({ ...validated, id: newId, builtIn: false, slot: targetSlot });
  await service2.save(userId, toSave);
  return toSave;
}

// src/storage/undo.ts
var UNDO_PREFIX = "undo/";
var INDEX_FILENAME = "_index.json";
var MAX_UNDO_PER_CHAT = 200;
function messageFilePath(chatId, messageId) {
  return `${UNDO_PREFIX}${chatId}/${messageId}.json`;
}
function indexPath(chatId) {
  return `${UNDO_PREFIX}${chatId}/${INDEX_FILENAME}`;
}
function chatUndoDir(chatId) {
  return `${UNDO_PREFIX}${chatId}/`;
}
async function loadMessageFile(userId, chatId, messageId) {
  return spindle.userStorage.getJson(messageFilePath(chatId, messageId), {
    fallback: null,
    userId
  });
}
async function saveMessageFile(userId, chatId, messageId, file) {
  await spindle.userStorage.setJson(messageFilePath(chatId, messageId), file, { userId });
}
async function rebuildQueue(userId, chatId) {
  const rels = await spindle.userStorage.list(chatUndoDir(chatId), userId);
  const withTs = [];
  for (const rel of rels) {
    const name = rel.replace(/\\/g, "/");
    if (name === INDEX_FILENAME)
      continue;
    if (name.includes("/"))
      continue;
    if (!name.endsWith(".json"))
      continue;
    const messageId = name.slice(0, -".json".length);
    const file = await loadMessageFile(userId, chatId, messageId);
    if (!file)
      continue;
    for (const [swipeIdStr, entry] of Object.entries(file)) {
      const swipeId = parseInt(swipeIdStr, 10);
      if (!Number.isFinite(swipeId))
        continue;
      withTs.push({ m: messageId, s: swipeId, t: entry.timestamp });
    }
  }
  withTs.sort((a, b) => a.t - b.t);
  return withTs.map(({ m, s }) => ({ m, s }));
}
async function loadIndex(userId, chatId) {
  const existing = await spindle.userStorage.getJson(indexPath(chatId), {
    fallback: null,
    userId
  });
  if (existing && Array.isArray(existing.queue))
    return existing;
  const queue = await rebuildQueue(userId, chatId);
  if (queue.length > 0) {
    debug(userId, `loadIndex: rebuilt queue for ${chatId.slice(0, 8)} with ${queue.length} entries`);
  }
  return { queue };
}
async function saveIndex(userId, chatId, index) {
  await spindle.userStorage.setJson(indexPath(chatId), index, { userId });
}
async function removeSwipeSlot(userId, chatId, messageId, swipeId) {
  const file = await loadMessageFile(userId, chatId, messageId);
  if (!file)
    return;
  delete file[String(swipeId)];
  if (Object.keys(file).length === 0) {
    await spindle.userStorage.delete(messageFilePath(chatId, messageId), userId);
  } else {
    await saveMessageFile(userId, chatId, messageId, file);
  }
}
async function saveUndo(userId, chatId, messageId, swipeId, entry) {
  debug(userId, `saveUndo: ${messageId.slice(0, 8)}/${swipeId} origLen=${entry.originalContent.length} refLen=${entry.refinedContent.length} strategy=${entry.strategy} stages=${entry.stages?.length ?? 0}`);
  const file = await loadMessageFile(userId, chatId, messageId) ?? {};
  file[String(swipeId)] = { ...entry, swipeId };
  await saveMessageFile(userId, chatId, messageId, file);
  const index = await loadIndex(userId, chatId);
  index.queue = index.queue.filter((q) => !(q.m === messageId && q.s === swipeId));
  index.queue.push({ m: messageId, s: swipeId });
  while (index.queue.length > MAX_UNDO_PER_CHAT) {
    const evicted = index.queue.shift();
    try {
      await removeSwipeSlot(userId, chatId, evicted.m, evicted.s);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      spindle.log.warn(`[Hone] saveUndo: failed to evict ${evicted.m.slice(0, 8)}/${evicted.s} during prune: ${message}; continuing`);
    }
  }
  await saveIndex(userId, chatId, index);
}
async function getUndo(userId, chatId, messageId, swipeId) {
  const file = await loadMessageFile(userId, chatId, messageId);
  if (!file)
    return null;
  const entry = file[String(swipeId)];
  if (!entry)
    return null;
  debug(userId, `getUndo: hit ${messageId.slice(0, 8)}/${swipeId} strategy=${entry.strategy}`);
  return entry;
}
async function deleteUndo(userId, chatId, messageId, swipeId) {
  debug(userId, `deleteUndo: ${messageId.slice(0, 8)}/${swipeId}`);
  await removeSwipeSlot(userId, chatId, messageId, swipeId);
  const index = await loadIndex(userId, chatId);
  index.queue = index.queue.filter((q) => !(q.m === messageId && q.s === swipeId));
  await saveIndex(userId, chatId, index);
}
async function listUndoEntriesForMessage(userId, chatId, messageId) {
  const file = await loadMessageFile(userId, chatId, messageId);
  if (!file)
    return [];
  const out = [];
  for (const [swipeIdStr, entry] of Object.entries(file)) {
    const swipeId = parseInt(swipeIdStr, 10);
    if (!Number.isFinite(swipeId))
      continue;
    out.push({ swipeId, entry });
  }
  return out;
}
async function replaceUndoFileForMessage(userId, chatId, messageId, next) {
  if (next.length === 0) {
    await spindle.userStorage.delete(messageFilePath(chatId, messageId), userId);
  } else {
    const file = {};
    for (const { swipeId, entry } of next)
      file[String(swipeId)] = { ...entry, swipeId };
    await saveMessageFile(userId, chatId, messageId, file);
  }
  const index = await loadIndex(userId, chatId);
  const keepSwipeIds = new Set(next.map((n) => n.swipeId));
  index.queue = index.queue.filter((q) => q.m !== messageId || keepSwipeIds.has(q.s));
  const existingSwipeIds = new Set(index.queue.filter((q) => q.m === messageId).map((q) => q.s));
  for (const { swipeId } of next) {
    if (!existingSwipeIds.has(swipeId))
      index.queue.push({ m: messageId, s: swipeId });
  }
  await saveIndex(userId, chatId, index);
}
async function listRefinedKeysInChat(userId, chatId) {
  const index = await loadIndex(userId, chatId);
  const out = new Set;
  for (const q of index.queue)
    out.add(`${q.m}:${q.s}`);
  return out;
}

// src/storage/stats.ts
var STATS_PREFIX = "stats/";
function statsFile(chatId) {
  return `${STATS_PREFIX}${chatId}.json`;
}
var DEFAULT_STATS = {
  messagesRefined: 0,
  totalRefinements: 0,
  byStrategy: {}
};
async function getStats(userId, chatId) {
  return spindle.userStorage.getJson(statsFile(chatId), {
    fallback: { ...DEFAULT_STATS },
    userId
  });
}
async function incrementStats(userId, chatId, strategy, count = 1) {
  const stats = await getStats(userId, chatId);
  stats.messagesRefined += count;
  stats.totalRefinements += count;
  stats.byStrategy[strategy] = (stats.byStrategy[strategy] || 0) + count;
  await spindle.userStorage.setJson(statsFile(chatId), stats, { userId });
}

// src/assemble.ts
function substituteLocalVars(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, name) => {
    if (name in vars)
      return vars[name];
    return match;
  });
}
function buildProposalVars(proposals) {
  const vars = {};
  const list = proposals || [];
  vars.proposal_count = String(list.length);
  if (list.length === 0) {
    vars.proposals = "";
  } else {
    vars.proposals = list.map((p, i) => `[PROPOSAL ${i + 1}]
${p}
[/PROPOSAL ${i + 1}]`).join(`

`);
  }
  for (let i = 0;i < list.length; i++) {
    vars[`proposal_${i + 1}`] = list[i];
  }
  return vars;
}
function expandHeadRefs(promptIds, headCollection) {
  const out = [];
  for (const id of promptIds) {
    if (id === HEAD_COLLECTION_ID) {
      for (const headId of headCollection)
        out.push(headId);
    } else {
      out.push(id);
    }
  }
  return out;
}
function concatRowPrompts(row, promptIndex, headCollection) {
  const parts = [];
  for (const id of expandHeadRefs(row.promptIds, headCollection)) {
    const p = promptIndex.get(id);
    if (p && p.content)
      parts.push(p.content);
  }
  return parts.join(`

`);
}
function mergeAdjacentSameRole(items) {
  const out = [];
  let merges = 0;
  for (const item of items) {
    if (!item.content)
      continue;
    const last = out[out.length - 1];
    if (last && last.role === item.role) {
      last.content = `${last.content}

${item.content}`;
      merges++;
    } else {
      out.push({ ...item });
    }
  }
  return { messages: out, merges };
}
async function assembleStage(stage, prompts, headCollection, ctx) {
  const uid = ctx.userId || "?";
  debug(uid, `assembleStage: start stage="${stage.name}" (${ctx.stageIndex}/${ctx.totalStages}) rows=${stage.rows.length} prompts=${prompts.length} headCollection=${headCollection.length} chatId=${ctx.chatId?.slice(0, 8) || "none"}`);
  const promptIndex = new Map;
  for (const p of prompts)
    promptIndex.set(p.id, p);
  const localVars = {
    message: ctx.original,
    original: ctx.original,
    latest: ctx.latest,
    userMessage: ctx.userMessage,
    context: ctx.context,
    lore: ctx.lore,
    pov: ctx.pov,
    stage_name: stage.name,
    stage_index: String(ctx.stageIndex),
    total_stages: String(ctx.totalStages),
    shield_preservation_note: ctx.shieldPreservationNote || "",
    ...buildProposalVars(ctx.proposals)
  };
  debug(uid, `assembleStage: localVars keys=[${Object.keys(localVars).join(",")}] originalLen=${ctx.original.length} latestLen=${ctx.latest.length} userMessageLen=${ctx.userMessage.length} contextLen=${ctx.context.length} povLen=${ctx.pov.length} proposals=${ctx.proposals?.length ?? 0}`);
  const phase1 = [];
  for (let ri = 0;ri < stage.rows.length; ri++) {
    const row = stage.rows[ri];
    const raw = concatRowPrompts(row, promptIndex, headCollection);
    if (!raw) {
      debug(uid, `assembleStage: phase1 row ${ri} role=${row.role}: empty after concat (promptIds=[${row.promptIds.join(",")}]), skipped`);
      continue;
    }
    const missingIds = expandHeadRefs(row.promptIds, headCollection).filter((id) => !promptIndex.has(id));
    if (missingIds.length > 0) {
      debug(uid, `assembleStage: phase1 row ${ri} role=${row.role}: missing promptIds=[${missingIds.join(",")}] (dropped)`);
    }
    const substituted = substituteLocalVars(raw, localVars);
    debug(uid, `assembleStage: phase1 row ${ri} role=${row.role} rawLen=${raw.length} substitutedLen=${substituted.length}`);
    phase1.push({ role: row.role, content: substituted });
  }
  debug(uid, `assembleStage: phase1 complete: ${phase1.length} non-empty rows from ${stage.rows.length} total`);
  const diagnostics = [];
  const phase2 = [];
  for (let pi = 0;pi < phase1.length; pi++) {
    const item = phase1[pi];
    if (!/\{\{[^}]+\}\}/.test(item.content)) {
      debug(uid, `assembleStage: phase2 row ${pi} role=${item.role}: no remaining macros, passthrough`);
      phase2.push(item);
      continue;
    }
    debug(uid, `assembleStage: phase2 row ${pi} role=${item.role}: calling spindle.macros.resolve (chatId=${ctx.chatId?.slice(0, 8) || "none"}, charId=${ctx.characterId?.slice(0, 8) || "none"})`);
    try {
      const resolved = await spindle.macros.resolve(item.content, {
        chatId: ctx.chatId,
        characterId: ctx.characterId,
        userId: ctx.userId
      });
      debug(uid, `assembleStage: phase2 row ${pi} resolved: inputLen=${item.content.length} outputLen=${resolved.text.length} diagnostics=${resolved.diagnostics?.length ?? 0}`);
      phase2.push({ role: item.role, content: resolved.text });
      if (resolved.diagnostics && resolved.diagnostics.length > 0) {
        for (const d of resolved.diagnostics) {
          diagnostics.push({ message: d.message });
          debug(uid, `assembleStage: phase2 row ${pi} macro diagnostic: ${d.message}`);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      spindle.log.warn(`[Hone] macro resolution failed for row (role=${item.role}): ${message}`);
      debug(uid, `assembleStage: phase2 row ${pi} macro resolve FAILED: ${message}; falling back to phase1 text`);
      diagnostics.push({
        message: `Macro resolution failed: ${message}`
      });
      phase2.push(item);
    }
  }
  const { messages, merges } = mergeAdjacentSameRole(phase2);
  debug(uid, `assembleStage: complete stage="${stage.name}": ${messages.length} messages, ${merges} merges, ${diagnostics.length} diagnostics, roles=[${messages.map((m) => m.role).join(",")}]`);
  return { messages, diagnostics, merges };
}

// src/resources/model-profiles.ts
var DEFAULT_SAMPLERS = {
  temperature: null,
  maxTokens: null,
  contextSize: null,
  topP: null,
  minP: null,
  topK: null,
  frequencyPenalty: null,
  presencePenalty: null,
  repetitionPenalty: null
};
var DEFAULT_REASONING = {
  stripCoTTags: true,
  requestReasoning: false,
  reasoningEffort: "auto"
};
function getDefaultProfile() {
  return {
    id: DEFAULT_PROFILE_ID,
    name: "Default",
    connectionProfileId: "",
    samplers: { ...DEFAULT_SAMPLERS },
    reasoning: { ...DEFAULT_REASONING }
  };
}
function normalizeSamplers(raw) {
  const out = { ...DEFAULT_SAMPLERS };
  if (!raw || typeof raw !== "object")
    return out;
  const s = raw;
  for (const key of Object.keys(out)) {
    const v = s[key];
    out[key] = typeof v === "number" ? v : null;
  }
  return out;
}
function normalizeReasoning(raw) {
  if (!raw || typeof raw !== "object")
    return { ...DEFAULT_REASONING };
  const r = raw;
  return {
    stripCoTTags: typeof r.stripCoTTags === "boolean" ? r.stripCoTTags : DEFAULT_REASONING.stripCoTTags,
    requestReasoning: typeof r.requestReasoning === "boolean" ? r.requestReasoning : DEFAULT_REASONING.requestReasoning,
    reasoningEffort: r.reasoningEffort ?? DEFAULT_REASONING.reasoningEffort
  };
}
var service3 = createResourceService({
  kind: "model profile",
  prefix: "model-profiles/",
  builtIns: [],
  summarize: (item, builtIn) => ({
    id: item.id,
    name: item.name,
    connectionProfileId: item.connectionProfileId,
    builtIn
  }),
  normalize: (raw, id) => {
    if (!raw || typeof raw !== "object")
      return null;
    const p = raw;
    if (typeof p.name !== "string" || typeof p.connectionProfileId !== "string")
      return null;
    return {
      id,
      name: p.name,
      connectionProfileId: p.connectionProfileId,
      samplers: normalizeSamplers(p.samplers),
      reasoning: normalizeReasoning(p.reasoning)
    };
  },
  buildCopy: (source, newId, newName) => ({
    id: newId,
    name: newName,
    connectionProfileId: source.connectionProfileId,
    samplers: { ...source.samplers },
    reasoning: { ...source.reasoning }
  })
});
async function listModelProfiles(userId) {
  const summaries = await service3.list(userId);
  return summaries.map((s) => ({ id: s.id, name: s.name, connectionProfileId: s.connectionProfileId }));
}
function getModelProfile(userId, id) {
  return service3.get(userId, id);
}
function saveModelProfile(userId, profile) {
  return service3.save(userId, profile);
}
function deleteModelProfile(userId, id) {
  return service3.delete(userId, id);
}
function duplicateModelProfile(userId, sourceId) {
  return service3.duplicate(userId, sourceId);
}
async function createModelProfile(userId, connectionProfileId, name) {
  const id = await service3.nextId(userId, name);
  const profile = {
    id,
    name,
    connectionProfileId,
    samplers: { ...DEFAULT_SAMPLERS },
    reasoning: { ...DEFAULT_REASONING }
  };
  await service3.save(userId, profile);
  return profile;
}

// src/generation.ts
function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return `[unserializable: ${reason}]`;
  }
}
function buildGenerationParameters(params) {
  const result = {};
  if (params.temperature !== null)
    result.temperature = params.temperature;
  if (params.maxTokens !== null)
    result.max_tokens = params.maxTokens;
  if (params.contextSize !== null)
    result.max_context_length = params.contextSize;
  if (params.topP !== null)
    result.top_p = params.topP;
  if (params.minP !== null)
    result.min_p = params.minP;
  if (params.topK !== null)
    result.top_k = params.topK;
  if (params.frequencyPenalty !== null)
    result.frequency_penalty = params.frequencyPenalty;
  if (params.presencePenalty !== null)
    result.presence_penalty = params.presencePenalty;
  if (params.repetitionPenalty !== null)
    result.repetition_penalty = params.repetitionPenalty;
  return Object.keys(result).length > 0 ? result : undefined;
}
async function resolveConnection(connectionProfileId, userId) {
  try {
    if (connectionProfileId) {
      const conn2 = await spindle.connections.get(connectionProfileId, userId);
      if (!conn2)
        return null;
      return { id: conn2.id, model: conn2.model || undefined };
    }
    const conns = await spindle.connections.list(userId);
    if (!conns || conns.length === 0)
      return null;
    const conn = conns.find((c) => c.is_default) || conns[0];
    return { id: conn.id, model: conn.model || undefined };
  } catch (err) {
    spindle.log.warn(`resolveConnection failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}
async function generate(req, userId) {
  try {
    const timeoutMs = req.timeoutSeconds * 1000;
    const resolved = await resolveConnection(req.connectionProfileId, userId);
    if (!resolved) {
      const reason = req.connectionProfileId ? `Connection profile "${req.connectionProfileId}" not found` : "No connection profiles configured. Set a default in Lumiverse Settings -> Connections";
      spindle.log.warn(`Generation failed: ${reason}`);
      return { content: "", success: false, error: reason };
    }
    const parameters = { ...req.parameters };
    if (resolved.model)
      parameters.model = resolved.model;
    debug(userId, `Generation: connection=${resolved.id}${req.connectionProfileId ? "" : " (default)"}, model=${resolved.model || "none"}, msgs=${req.messages.length}, params=${JSON.stringify(parameters)}`);
    if (isFullPayloadEnabled(userId)) {
      debug(userId, `Generation request messages: ${safeStringify(req.messages)}`);
    }
    const result = await Promise.race([
      spindle.generate.raw({
        type: "raw",
        messages: req.messages,
        connection_id: resolved.id,
        model: resolved.model,
        parameters,
        userId
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Generation timed out")), timeoutMs))
    ]);
    if (isFullPayloadEnabled(userId)) {
      debug(userId, `Generation response: ${safeStringify(result)}`);
    }
    return { content: result.content ?? "", success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    spindle.log.warn(`Generation failed: ${message}`);
    return { content: "", success: false, error: message };
  }
}

// src/refinement/model-resolver.ts
async function resolveProfile(profileId, userId, onMissingClear) {
  let profile;
  if (!profileId || profileId === DEFAULT_PROFILE_ID) {
    profile = getDefaultProfile();
  } else {
    const loaded = await getModelProfile(userId, profileId);
    if (loaded) {
      profile = loaded;
    } else {
      profile = getDefaultProfile();
      spindle.log.warn(`[Hone] model profile "${profileId}" no longer exists; falling back to Default`);
      if (onMissingClear)
        await onMissingClear();
    }
  }
  debug(userId, `resolveProfile: id="${profileId || "(default)"}" -> "${profile.name}" connection="${profile.connectionProfileId || "(default)"}" reasoning=${JSON.stringify(profile.reasoning)}`);
  return {
    connectionProfileId: profile.connectionProfileId,
    parameters: buildGenerationParameters(profile.samplers),
    reasoning: profile.reasoning
  };
}
async function resolveModel(settings, userId) {
  return resolveProfile(settings.activeModelProfileId, userId, async () => {
    await updateSettings(userId, { activeModelProfileId: DEFAULT_PROFILE_ID });
  });
}
function injectReasoningParams(base, reasoning) {
  if (!reasoning.requestReasoning)
    return base;
  const params = { ...base ?? {} };
  if (!params.thinking) {
    params.thinking = { type: "adaptive" };
    const effort = reasoning.reasoningEffort;
    const valid = new Set(["low", "medium", "high", "max"]);
    params.output_config = { effort: valid.has(effort) ? effort : "high" };
  }
  return params;
}

// src/text/extract.ts
var COT_WRAPPERS = ["think", "thinking", "reasoning"];
function removeCoTTags(text) {
  const alternation = COT_WRAPPERS.join("|");
  const closed = new RegExp(`\\s*<(${alternation})>[\\s\\S]*?<\\/\\1>\\s*`, "gi");
  const unclosed = new RegExp(`\\s*<(${alternation})>[\\s\\S]*$`, "i");
  return text.replace(closed, "").replace(unclosed, "").trim();
}
function parseTaggedBlock(raw, tag = "HONE-OUTPUT") {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const start = raw.indexOf(open);
  if (start === -1)
    return null;
  const contentStart = start + open.length;
  const end = raw.indexOf(close, contentStart);
  if (end === -1)
    return { content: raw.slice(contentStart).trim(), unclosed: true };
  return { content: raw.slice(contentStart, end).trim(), unclosed: false };
}
var NOTES_OPEN = "<HONE-NOTES>";
var NOTES_CLOSE = "</HONE-NOTES>";
var OUTPUT_OPEN = "<HONE-OUTPUT>";
var OUTPUT_CLOSE = "</HONE-OUTPUT>";
function extractRefinedContent(raw) {
  if (raw.includes(OUTPUT_OPEN)) {
    const parsed = parseTaggedBlock(raw);
    if (!parsed) {
      return {
        ok: false,
        reason: "no_tags",
        message: "The LLM response was empty or unparseable even though <HONE-OUTPUT> was detected. Hone will not apply it."
      };
    }
    const recoveries2 = [];
    if (parsed.unclosed) {
      recoveries2.push("<HONE-OUTPUT> opened but </HONE-OUTPUT> missing. Taking everything after <HONE-OUTPUT> as output (likely truncated or the model forgot the closing tag)");
    }
    if (!parsed.content) {
      return {
        ok: false,
        reason: "notes_only",
        message: "The LLM opened <HONE-OUTPUT> but wrote nothing inside it. Hone will not apply an empty refinement."
      };
    }
    return { ok: true, content: parsed.content, recoveries: recoveries2 };
  }
  if (raw.includes(OUTPUT_CLOSE)) {
    return {
      ok: false,
      reason: "malformed_partial",
      message: "The LLM wrote </HONE-OUTPUT> without an opening <HONE-OUTPUT> tag, so Hone can't tell what the refined content was meant to be. Try again or switch to the non-Lite preset."
    };
  }
  const recoveries = [];
  let text = raw;
  const hasNotesOpen = text.includes(NOTES_OPEN);
  const hasNotesClose = text.includes(NOTES_CLOSE);
  if (hasNotesClose && !hasNotesOpen) {
    text = NOTES_OPEN + text;
    recoveries.push("</HONE-NOTES> found without a matching <HONE-NOTES> opener. Prepended <HONE-NOTES> so the notes block can be stripped");
  } else if (hasNotesOpen && !hasNotesClose) {
    return {
      ok: false,
      reason: "malformed_partial",
      message: "The LLM opened a <HONE-NOTES> block but never closed it, and didn't write <HONE-OUTPUT>. Hone can't tell where notes end and refined content begins. Try again or switch to the non-Lite preset."
    };
  }
  const notesStart = text.indexOf(NOTES_OPEN);
  const notesEnd = notesStart !== -1 ? text.indexOf(NOTES_CLOSE, notesStart + NOTES_OPEN.length) : -1;
  if (notesStart !== -1 && notesEnd !== -1) {
    text = (text.slice(0, notesStart) + text.slice(notesEnd + NOTES_CLOSE.length)).trim();
    recoveries.push(recoveries.length === 0 ? "stripped <HONE-NOTES>...</HONE-NOTES> block" : "stripped the recovered <HONE-NOTES>...</HONE-NOTES> block");
    if (!text) {
      return {
        ok: false,
        reason: "notes_only",
        message: "The LLM only produced a <HONE-NOTES> changelog. There was no refined content after stripping it. Try again or switch to the non-Lite preset."
      };
    }
    recoveries.push("no <HONE-OUTPUT> tag found; using the notes-stripped response as output");
    return { ok: true, content: text, recoveries };
  }
  return {
    ok: false,
    reason: "no_tags",
    message: "The LLM did not output any <HONE-NOTES> or <HONE-OUTPUT> tags at all. Hone can't be confident the response is a valid refinement. Try again or switch to the non-Lite preset."
  };
}

// src/refinement/strategy.ts
async function runPipeline(pipeline, input, initialLatest, proposals, emitStages) {
  const results = [];
  let latest = initialLatest;
  for (let i = 0;i < pipeline.stages.length; i++) {
    const stage = pipeline.stages[i];
    const assemblyCtx = {
      original: input.messageText,
      latest,
      userMessage: input.userMessage,
      context: input.context,
      lore: input.loreBlock,
      pov: input.pov,
      stageName: stage.name,
      stageIndex: i + 1,
      totalStages: pipeline.stages.length,
      proposals,
      chatId: input.chatId,
      characterId: input.characterId,
      userId: input.userId,
      shieldPreservationNote: input.shieldPreservationNote
    };
    const assembled = await assembleStage(stage, input.preset.prompts, input.preset.headCollection, assemblyCtx);
    const stageModel = stage.modelProfileId ? await resolveProfile(stage.modelProfileId, input.userId) : input.model;
    const req = {
      messages: assembled.messages,
      connectionProfileId: stageModel.connectionProfileId,
      timeoutSeconds: input.settings.generationTimeoutSecs,
      parameters: injectReasoningParams(stageModel.parameters, stageModel.reasoning)
    };
    debug(input.userId, `runPipeline stage ${i + 1}/${pipeline.stages.length} "${stage.name}" msgs=${assembled.messages.length} merges=${assembled.merges} emit=${emitStages} stageProfile="${stage.modelProfileId || "(inherit)"}"`);
    const result = await generate(req, input.userId);
    if (!result.success) {
      throw new Error(result.error || `Stage "${stage.name}" failed`);
    }
    const rawContent = stageModel.reasoning.stripCoTTags ? removeCoTTags(result.content) : result.content;
    const extracted = extractRefinedContent(rawContent);
    if (!extracted.ok) {
      debug(input.userId, `stage "${stage.name}": output-format failure "${extracted.reason}": ${extracted.message}`);
      throw new Error(extracted.message);
    }
    for (const r of extracted.recoveries)
      debug(input.userId, `stage "${stage.name}": ${r}`);
    latest = extracted.content;
    if (emitStages) {
      const record = { index: i, name: stage.name, text: latest, kind: "step" };
      results.push(record);
      input.onStageComplete?.(record);
    }
  }
  return { finalText: latest, stages: results };
}
async function runParallel(input) {
  const parallel = input.preset.parallel;
  if (!parallel || parallel.proposals.length === 0) {
    throw new Error("Parallel preset has no proposals configured");
  }
  debug(input.userId, `runParallel starting: ${parallel.proposals.length} proposals, aggregator with ${parallel.aggregator.stages.length} stages`);
  const proposalSettled = await Promise.allSettled(parallel.proposals.map((p, i) => {
    debug(input.userId, `runParallel: dispatching proposal ${i + 1}`);
    return runPipeline(p, input, input.latest, undefined, false);
  }));
  const proposalOutputs = [];
  const proposalRecords = [];
  for (let i = 0;i < proposalSettled.length; i++) {
    const outcome = proposalSettled[i];
    if (outcome.status === "fulfilled") {
      proposalOutputs.push(outcome.value.finalText);
      const proposalPipeline = parallel.proposals[i];
      const lastStage = proposalPipeline.stages[proposalPipeline.stages.length - 1];
      const record = {
        index: i,
        name: lastStage ? lastStage.name : `Proposal ${i + 1}`,
        text: outcome.value.finalText,
        kind: "proposal"
      };
      proposalRecords.push(record);
      input.onStageComplete?.(record);
      debug(input.userId, `runParallel: proposal ${i + 1} succeeded`);
    } else {
      const reason = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
      spindle.log.warn(`[Hone] parallel proposal ${i + 1} failed: ${reason}`);
      debug(input.userId, `runParallel: proposal ${i + 1} failed: ${reason}`);
    }
  }
  if (proposalOutputs.length === 0)
    throw new Error("All parallel proposals failed");
  const aggregatorRun = await runPipeline(parallel.aggregator, input, input.latest, proposalOutputs, true);
  return {
    refinedText: aggregatorRun.finalText,
    stages: [...proposalRecords, ...aggregatorRun.stages],
    strategy: "parallel"
  };
}
async function runStrategy(input) {
  debug(input.userId, `runStrategy: preset="${input.preset.name}" strategy=${input.preset.strategy} messageLen=${input.messageText.length} latestLen=${input.latest.length} contextLen=${input.context.length}`);
  if (input.preset.strategy === "parallel")
    return runParallel(input);
  if (!input.preset.pipeline) {
    throw new Error(`Preset "${input.preset.id}" has strategy=pipeline but no pipeline configured`);
  }
  debug(input.userId, `runStrategy: executing pipeline with ${input.preset.pipeline.stages.length} stages`);
  const run = await runPipeline(input.preset.pipeline, input, input.latest, undefined, true);
  debug(input.userId, `runStrategy: pipeline complete: finalLen=${run.finalText.length} stages=${run.stages.length}`);
  return { refinedText: run.finalText, stages: run.stages, strategy: "pipeline" };
}

// src/lore.ts
async function fetchLoreContents(entryIds, getEntry) {
  const results = await Promise.allSettled(entryIds.map((id) => getEntry(id)));
  const contents = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value && r.value.content) {
      contents.push(r.value.content);
    }
  }
  return contents;
}
function assembleLoreBlock(contents, maxTokens) {
  if (contents.length === 0)
    return "";
  const block = contents.join(`

`);
  if (maxTokens <= 0)
    return block;
  const charCap = maxTokens * 4;
  return block.length > charCap ? block.slice(0, charCap) : block;
}

// src/refinement/context.ts
var DEFAULT_MESSAGE_CONTEXT_TOKENS = 4000;
async function fetchLoreBlock(chatId, userId, maxLorebookTokens) {
  try {
    const activated = await spindle.world_books.getActivated(chatId, userId);
    if (!activated || activated.length === 0) {
      return { block: "", activated: 0, fetched: 0 };
    }
    const contents = await fetchLoreContents(activated.map((e) => e.id), (id) => spindle.world_books.entries.get(id, userId));
    return {
      block: assembleLoreBlock(contents, maxLorebookTokens),
      activated: activated.length,
      fetched: contents.length
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    debug(userId, `fetchLoreBlock: failed (non-fatal): ${errMsg}`);
    return { block: "", activated: 0, fetched: 0 };
  }
}
function buildShieldPreservationNote(blocks) {
  if (blocks.length === 0)
    return "";
  const tokens = blocks.map((b) => b.placeholder).join(", ");
  return `IMPORTANT: opaque placeholder tokens: ${tokens}. ` + "Include each of these tokens through to your output EXACTLY as-is. " + "Do not edit, translate, reformat, split across lines, quote, or remove them. " + "They stand in for scaffolding that must round-trip unchanged.";
}
function findLastAssistantMessage(messages, fromIndex) {
  for (let i = Math.min(fromIndex, messages.length - 1);i >= 0; i--) {
    if (messages[i].role === "assistant")
      return { message: messages[i], index: i };
  }
  return null;
}
async function buildContext(chatId, messageId, userId, settings) {
  const messages = await spindle.chat.getMessages(chatId);
  const msgIndex = messages.findIndex((m) => m.id === messageId);
  const message = messages[msgIndex];
  if (!message)
    throw new Error(`Message ${messageId} not found in chat ${chatId}`);
  const chat = await spindle.chats.get(chatId, userId);
  const characterId = chat?.character_id || undefined;
  const isUserMessage = message.role === "user";
  let latest;
  let latestId;
  if (isUserMessage) {
    const prior = findLastAssistantMessage(messages, msgIndex - 1);
    latest = prior?.message.content || "";
    latestId = prior?.message.id || null;
  } else {
    latest = message.content || "";
    latestId = messageId;
  }
  const totalBudget = settings.maxMessageContextTokens > 0 ? settings.maxMessageContextTokens : DEFAULT_MESSAGE_CONTEXT_TOKENS;
  const historyBudget = Math.max(0, totalBudget - approxTokens(latest));
  const history = buildChatHistoryBlock(messages, messages.length - 1, latestId, historyBudget);
  const pov = await resolvePovContent(userId, isUserMessage ? settings.userPov : settings.pov);
  const userMessage = isUserMessage ? message.content || "" : "";
  const lore = await fetchLoreBlock(chatId, userId, settings.maxLorebookTokens);
  debug(userId, `buildContext: msg=${messageId.slice(0, 8)} role=${message.role} latestLen=${latest.length} historyBudget=${historyBudget}tok historyLen=${history.length} povLen=${pov.length} userMessageLen=${userMessage.length} lore=${lore.activated}/${lore.fetched}`);
  return {
    message,
    characterId,
    latest,
    context: history,
    pov,
    userMessage,
    loreBlock: lore.block
  };
}

// src/refinement/index.ts
async function refineSingle(chatId, messageId, userId, send) {
  let success = false;
  debug(userId, `refineSingle: enqueued ${messageId.slice(0, 8)} in ${chatId.slice(0, 8)}`);
  await enqueueChatOperation(`${userId}:${chatId}`, async () => {
    debug(userId, `refineSingle: queue slot started ${messageId.slice(0, 8)}`);
    const settings = await getSettings(userId);
    if (!settings.enabled) {
      debug(userId, `refineSingle: skipped ${messageId.slice(0, 8)}: settings.enabled=false`);
      return;
    }
    send({ type: "refine-started", messageId });
    try {
      const { message, latest, context, pov, userMessage, characterId, loreBlock } = await buildContext(chatId, messageId, userId, settings);
      debug(userId, `refineSingle: buildContext done ${messageId.slice(0, 8)} role=${message.role} swipeId=${message.swipe_id} contentLen=${message.content.length} loreLen=${loreBlock.length}`);
      const startSwipeId = message.swipe_id;
      const startContent = message.content;
      if (message.content.length < settings.minCharThreshold) {
        debug(userId, `Refinement skipped for ${messageId}: below threshold (${message.content.length} < ${settings.minCharThreshold})`);
        send({ type: "refine-complete", messageId, success: true });
        success = true;
        return;
      }
      const model = await resolveModel(settings, userId);
      const isUserMessage = message.role === "user";
      const presetId = isUserMessage ? settings.currentInputPresetId : settings.currentPresetId;
      const slotLabel = isUserMessage ? "input" : "output";
      const startTime = Date.now();
      let refinedText;
      let strategy;
      const stageResults = [];
      const preset = await getPreset(userId, presetId);
      if (!preset) {
        send({
          type: "refine-error",
          messageId,
          error: `Active ${slotLabel} preset "${presetId}" not found. Select a preset in Hone Settings.`
        });
        return;
      }
      debug(userId, `refineSingle: slot=${slotLabel} preset="${preset.name}" strategy=${preset.strategy}`);
      const shieldEnabled = preset.shieldLiteralBlocks && !isUserMessage;
      const include = preset.shieldConfig?.include?.length ? preset.shieldConfig.include : undefined;
      const exclude = preset.shieldConfig?.exclude?.length ? preset.shieldConfig.exclude : undefined;
      const { masked, blocks } = shieldEnabled ? maskLiteralBlocks(message.content, include, exclude) : { masked: message.content, blocks: [] };
      if (!shieldEnabled) {
        const reason = isUserMessage ? "user-message path (shielding disabled)" : "preset.shieldLiteralBlocks=false";
        debug(userId, `refineSingle: shielding skipped: ${reason}`);
      } else {
        debug(userId, `refineSingle: shielding on: patterns matched ${blocks.length} block(s), sourceLen ${message.content.length} -> maskedLen ${masked.length}`);
        for (let i = 0;i < blocks.length; i++) {
          const b = blocks[i];
          const preview = b.original.replace(/\n/g, "\\n").slice(0, 80);
          debug(userId, `  shield[${i}] len=${b.original.length} preview="${preview}${b.original.length > 80 ? "\u2026" : ""}"`);
        }
      }
      const latestForRun = isUserMessage ? latest : masked;
      const shieldPreservationNote = buildShieldPreservationNote(blocks);
      try {
        const outcome = await runStrategy({
          preset,
          settings,
          model,
          context,
          latest: latestForRun,
          messageText: masked,
          userMessage,
          loreBlock,
          pov,
          chatId,
          characterId,
          userId,
          shieldPreservationNote,
          onStageComplete: (record) => {
            const cleaned = blocks.length > 0 ? { ...record, text: substituteShields(record.text, blocks) } : record;
            stageResults.push(cleaned);
            send({ type: "stage-complete", messageId, stage: cleaned });
          }
        });
        refinedText = outcome.refinedText;
        strategy = outcome.strategy;
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        send({ type: "refine-error", messageId, error });
        return;
      }
      if (blocks.length > 0) {
        const before = refinedText.length;
        const survivors = blocks.filter((b) => refinedText.includes(b.placeholder));
        const droppedList = blocks.filter((b) => !refinedText.includes(b.placeholder));
        debug(userId, `refineSingle: unmask: LLM preserved ${survivors.length}/${blocks.length} shield(s); ${droppedList.length} dropped will be appended before trailing scaffolding`);
        for (const b of droppedList) {
          const preview = b.original.replace(/\n/g, "\\n").slice(0, 60);
          debug(userId, `  dropped shield "${preview}${b.original.length > 60 ? "\u2026" : ""}": recovering at end`);
        }
        refinedText = unmaskLiteralBlocks(refinedText, blocks);
        debug(userId, `refineSingle: unmask done: outputLen ${before} -> ${refinedText.length}`);
      }
      const fresh = (await spindle.chat.getMessages(chatId)).find((m) => m.id === messageId);
      if (!fresh) {
        debug(userId, `refineSingle: race guard ${messageId.slice(0, 8)}: message no longer exists`);
        send({ type: "refine-error", messageId, error: "Message no longer exists" });
        return;
      }
      if (fresh.swipe_id !== startSwipeId) {
        debug(userId, `Refine aborted for ${messageId}: swipe navigated ${startSwipeId} -> ${fresh.swipe_id} during generation`);
        send({
          type: "refine-error",
          messageId,
          error: "Swipe changed during refinement; refinement cancelled to avoid overwriting the wrong swipe"
        });
        return;
      }
      if (fresh.content !== startContent) {
        debug(userId, `Refine aborted for ${messageId}: swipe ${startSwipeId} content edited during generation (startLen=${startContent.length}, freshLen=${fresh.content?.length ?? -1})`);
        send({
          type: "refine-error",
          messageId,
          error: "Message content was edited during refinement; refinement cancelled to avoid overwriting your edit"
        });
        return;
      }
      debug(userId, `refineSingle: race guard passed for ${messageId.slice(0, 8)} swipe ${startSwipeId}`);
      const undoEntry = {
        originalContent: startContent,
        refinedContent: refinedText,
        timestamp: Date.now(),
        strategy,
        swipeId: startSwipeId,
        ...stageResults.length > 0 ? { stages: stageResults } : {}
      };
      await saveUndo(userId, chatId, messageId, startSwipeId, undoEntry);
      debug(userId, `refineSingle: saveUndo done ${messageId.slice(0, 8)} swipe ${startSwipeId} stages=${stageResults.length}`);
      try {
        await spindle.chat.updateMessage(chatId, messageId, {
          content: refinedText,
          metadata: { ...message.metadata, hone_refined: true }
        });
        debug(userId, `refineSingle: updateMessage done ${messageId.slice(0, 8)} swipe ${startSwipeId}`);
      } catch (updateErr) {
        const updateError = updateErr instanceof Error ? updateErr.message : String(updateErr);
        spindle.log.warn(`[Hone] rollback: updateMessage failed for ${messageId} swipe ${startSwipeId} after saveUndo succeeded: ${updateError}; deleting orphan undo entry`);
        try {
          await deleteUndo(userId, chatId, messageId, startSwipeId);
          spindle.log.warn(`[Hone] rollback: orphan undo entry deleted for ${messageId} swipe ${startSwipeId}`);
        } catch (rollbackErr) {
          const rollbackError = rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr);
          spindle.log.error(`[Hone] rollback FAILED for ${messageId} swipe ${startSwipeId}: ${rollbackError}; orphan undo entry will remain until next refine or prune`);
        }
        throw updateErr;
      }
      const duration = Date.now() - startTime;
      debug(userId, `Refinement complete for ${messageId} swipe ${startSwipeId}: strategy=${strategy}, duration=${duration}ms`);
      if (settings.autoShowDiff) {
        send({ type: "diff", original: startContent, refined: refinedText });
      }
      send({ type: "refine-complete", messageId, success: true });
      success = true;
      try {
        await incrementStats(userId, chatId, strategy);
      } catch (statsErr) {
        spindle.log.warn(`[Hone] best-effort: incrementStats failed for ${messageId} (${strategy}): ${statsErr instanceof Error ? statsErr.message : statsErr}; stats may be under-counted`);
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      spindle.log.warn(`Refine failed for ${messageId}: ${error}`);
      send({ type: "refine-error", messageId, error: `Refinement failed: ${error}` });
    }
  });
  return success;
}
async function undoRefine(chatId, messageId, userId, send) {
  debug(userId, `undoRefine: enqueued ${messageId.slice(0, 8)}`);
  return enqueueChatOperation(`${userId}:${chatId}`, async () => {
    debug(userId, `undoRefine: queue slot started ${messageId.slice(0, 8)}`);
    try {
      const currentMsg = (await spindle.chat.getMessages(chatId)).find((m) => m.id === messageId);
      if (!currentMsg) {
        debug(userId, `undoRefine: ${messageId.slice(0, 8)}: message not found`);
        send({ type: "refine-error", messageId, error: "Undo failed: message not found" });
        return;
      }
      const targetSwipeId = currentMsg.swipe_id;
      const entry = await getUndo(userId, chatId, messageId, targetSwipeId);
      if (!entry) {
        debug(userId, `undoRefine: ${messageId.slice(0, 8)} swipe ${targetSwipeId}: no undo entry`);
        send({ type: "refine-error", messageId, error: "Undo failed: no undo data found for this swipe" });
        return;
      }
      debug(userId, `undoRefine: applying ${messageId.slice(0, 8)} swipe ${targetSwipeId} origLen=${entry.originalContent.length}`);
      await spindle.chat.updateMessage(chatId, messageId, {
        content: entry.originalContent,
        metadata: { ...currentMsg.metadata || {}, hone_refined: false }
      });
      debug(userId, `undoRefine: updateMessage done ${messageId.slice(0, 8)} swipe ${targetSwipeId}`);
      try {
        await deleteUndo(userId, chatId, messageId, targetSwipeId);
      } catch (deleteErr) {
        const deleteError = deleteErr instanceof Error ? deleteErr.message : String(deleteErr);
        spindle.log.warn(`[Hone] best-effort: deleteUndo failed for ${messageId} swipe ${targetSwipeId} after successful undo: ${deleteError}; orphan entry will make the UI show 'Undo' until the next refine of this swipe overwrites it`);
      }
      debug(userId, `Undo complete for ${messageId} swipe ${targetSwipeId}`);
      send({ type: "refine-complete", messageId, success: true });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      spindle.log.warn(`[Hone] Undo failed for ${messageId}: ${error}`);
      send({ type: "refine-error", messageId, error: `Undo failed: ${error}` });
    }
  });
}
async function refineBulk(chatId, messageIds, userId, send) {
  const settings = await getSettings(userId);
  let succeeded = 0;
  let failed = 0;
  let lastError = null;
  debug(userId, `refineBulk: starting ${messageIds.length} messages in ${chatId.slice(0, 8)}`);
  const bulkSend = (msg) => {
    if (msg.type === "diff")
      return;
    if (msg.type === "refine-error") {
      if (msg.error) {
        spindle.log.warn(`[Hone] bulk: per-message error for ${msg.messageId} suppressed (modal cap), original error: ${msg.error}`);
        lastError = msg.error;
      }
      send({ ...msg, error: "" });
      return;
    }
    send(msg);
  };
  for (let i = 0;i < messageIds.length; i++) {
    const messageId = messageIds[i];
    bulkSend({ type: "bulk-progress", current: i + 1, total: messageIds.length, messageId });
    const ok = await refineSingle(chatId, messageId, userId, bulkSend);
    if (ok)
      succeeded++;
    else
      failed++;
    if (i < messageIds.length - 1 && settings.batchIntervalMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, settings.batchIntervalMs));
    }
  }
  debug(userId, `bulk refine complete: ${succeeded}/${messageIds.length} succeeded, ${failed} failed${lastError ? `, last error: ${lastError}` : ""}`);
  send({ type: "bulk-complete", succeeded, failed, total: messageIds.length });
}
async function enhanceUserMessage(text, chatId, userId, mode, send) {
  debug(userId, `enhanceUserMessage: mode=${mode} chat=${chatId.slice(0, 8)} textLen=${text.length}`);
  const settings = await getSettings(userId);
  if (!settings.userEnhanceEnabled) {
    debug(userId, `enhanceUserMessage: skipped: userEnhanceEnabled=false`);
    return;
  }
  if (mode === "post") {
    try {
      const messages = await spindle.chat.getMessages(chatId);
      const userMsg = [...messages].reverse().find((m) => m.role === "user");
      if (userMsg)
        await refineSingle(chatId, userMsg.id, userId, send);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      send({ type: "refine-error", messageId: "", error });
    }
    return;
  }
  try {
    const preset = await getPreset(userId, settings.currentInputPresetId);
    if (!preset) {
      send({
        type: "refine-error",
        messageId: "",
        error: `Active input preset "${settings.currentInputPresetId}" not found. Select an input preset in Hone Settings.`
      });
      return;
    }
    debug(userId, `enhanceUserMessage: input preset="${preset.name}" strategy=${preset.strategy}`);
    const model = await resolveModel(settings, userId);
    const chat = await spindle.chats.get(chatId, userId);
    const characterId = chat?.character_id || undefined;
    const messages = await spindle.chat.getMessages(chatId);
    const prior = findLastAssistantMessage(messages, messages.length - 1);
    const latest = prior?.message.content || "";
    const latestId = prior?.message.id || null;
    const totalBudget = settings.maxMessageContextTokens > 0 ? settings.maxMessageContextTokens : DEFAULT_MESSAGE_CONTEXT_TOKENS;
    const historyBudget = Math.max(0, totalBudget - approxTokens(latest));
    const history = buildChatHistoryBlock(messages, messages.length - 1, latestId, historyBudget);
    const pov = await resolvePovContent(userId, settings.userPov);
    const lore = await fetchLoreBlock(chatId, userId, settings.maxLorebookTokens);
    debug(userId, `enhanceUserMessage: draftLen=${text.length} latestLen=${latest.length} historyLen=${history.length} povLen=${pov.length} loreLen=${lore.block.length}`);
    const outcome = await runStrategy({
      preset,
      settings,
      model,
      context: history,
      latest,
      messageText: text,
      userMessage: text,
      loreBlock: lore.block,
      pov,
      chatId,
      characterId,
      userId
    });
    send({ type: "enhance-result", text: outcome.refinedText });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    send({ type: "refine-error", messageId: "", error });
  }
}
async function previewStage(preset, stage, stageIndex, totalStages, userId, proposals, chatId, slot = "output") {
  debug(userId, `previewStage: start stage="${stage.name}" (${stageIndex}/${totalStages}) preset="${preset.name}" slot=${slot} chatId=${chatId?.slice(0, 8) || "none"} proposals=${proposals?.length ?? 0}`);
  const settings = await getSettings(userId);
  let latest = "<last AI response (placeholder: no chat was active when the preview was requested)>";
  let context = "<chat history (placeholder)>";
  let loreBlock = "";
  let pov = "<POV instruction (placeholder)>";
  let userMessage = slot === "input" ? "<user draft (placeholder: type a message to enhance)>" : "";
  const original = slot === "input" ? userMessage : latest;
  let characterId;
  let resolveChatId;
  if (chatId) {
    try {
      const messages = await spindle.chat.getMessages(chatId);
      const prior = findLastAssistantMessage(messages, messages.length - 1);
      if (prior && prior.message.content)
        latest = prior.message.content;
      const latestId = prior?.message.id || null;
      const totalBudget = settings.maxMessageContextTokens > 0 ? settings.maxMessageContextTokens : DEFAULT_MESSAGE_CONTEXT_TOKENS;
      const historyBudget = Math.max(0, totalBudget - approxTokens(latest));
      context = buildChatHistoryBlock(messages, messages.length - 1, latestId, historyBudget);
      pov = await resolvePovContent(userId, slot === "input" ? settings.userPov : settings.pov);
      const chat = await spindle.chats.get(chatId, userId);
      characterId = chat?.character_id || undefined;
      resolveChatId = chatId;
      const lore = await fetchLoreBlock(chatId, userId, settings.maxLorebookTokens);
      loreBlock = lore.block;
      debug(userId, `previewStage: live context latestLen=${latest.length} historyLen=${context.length} povLen=${pov.length} loreLen=${loreBlock.length}`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      debug(userId, `previewStage: live-chat context lookup failed: ${errMsg}`);
    }
  } else {
    debug(userId, `previewStage: no chatId, using placeholders`);
  }
  const assembleCtx = {
    original,
    latest,
    userMessage,
    context,
    lore: loreBlock,
    pov,
    stageName: stage.name,
    stageIndex: stageIndex + 1,
    totalStages,
    proposals,
    chatId: resolveChatId,
    characterId,
    userId
  };
  const assembled = await assembleStage(stage, preset.prompts, preset.headCollection, assembleCtx);
  debug(userId, `previewStage: done: ${assembled.messages.length} messages, ${assembled.diagnostics.length} diagnostics, ${assembled.merges} merges`);
  return { messages: assembled.messages, diagnostics: assembled.diagnostics };
}

// src/backend/chat-state.ts
async function getActiveChatIdFor(userId) {
  try {
    const active = await spindle.chats.getActive(userId);
    return active?.id || null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    spindle.log.warn(`getActiveChatIdFor(${userId}) failed: ${message}`);
    return null;
  }
}
async function snapshotLastAiState(userId, chatId) {
  try {
    const messages = await spindle.chat.getMessages(chatId);
    debug(userId, `snapshotLastAiState: got ${messages.length} messages in chat ${chatId.slice(0, 8)}`);
    const refinedKeys = await listRefinedKeysInChat(userId, chatId);
    const refinedMessageIds = [];
    let assistantCount = 0;
    for (const m of messages) {
      if (m.role !== "assistant")
        continue;
      assistantCount++;
      if (refinedKeys.has(`${m.id}:${m.swipe_id}`))
        refinedMessageIds.push(m.id);
    }
    debug(userId, `snapshotLastAiState: scanned ${assistantCount} assistants, ${refinedMessageIds.length} refined`);
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant)
      return { messageId: null, refined: false, refinedMessageIds };
    const lastIsRefined = refinedKeys.has(`${lastAssistant.id}:${lastAssistant.swipe_id}`);
    if (!lastIsRefined)
      return { messageId: lastAssistant.id, refined: false, refinedMessageIds };
    const lastEntry = await getUndo(userId, chatId, lastAssistant.id, lastAssistant.swipe_id);
    if (!lastEntry)
      return { messageId: lastAssistant.id, refined: false, refinedMessageIds };
    const stages = lastEntry.stages && lastEntry.stages.length > 0 ? lastEntry.stages : undefined;
    return { messageId: lastAssistant.id, refined: true, stages, refinedMessageIds };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    spindle.log.warn(`snapshotLastAiState(${userId}, ${chatId}) failed: ${message}`);
    return { messageId: null, refined: false, refinedMessageIds: [] };
  }
}
async function sendRefinedStateFor(userId, send) {
  const chatId = await getActiveChatIdFor(userId);
  if (!chatId) {
    debug(userId, `sendRefinedStateFor: no active chat`);
    return;
  }
  const snap = await snapshotLastAiState(userId, chatId);
  debug(userId, `sendRefinedStateFor: chat=${chatId.slice(0, 8)} lastRefined=${snap.refined} lastMsg=${snap.messageId?.slice(0, 8) ?? "none"} stages=${snap.stages?.length ?? 0} refinedCount=${snap.refinedMessageIds.length}`);
  send({
    type: "active-chat",
    chatId,
    lastMessageRefined: snap.refined,
    lastAiMessageId: snap.messageId,
    lastAiStages: snap.stages,
    refinedMessageIds: snap.refinedMessageIds
  });
}

// src/backend/events.ts
var activeGenerationsByUser = new Map;
function addActiveGeneration(userId, id) {
  let set = activeGenerationsByUser.get(userId);
  if (!set) {
    set = new Set;
    activeGenerationsByUser.set(userId, set);
  }
  set.add(id);
}
function removeActiveGeneration(userId, id) {
  const set = activeGenerationsByUser.get(userId);
  if (!set)
    return;
  set.delete(id);
  if (set.size === 0)
    activeGenerationsByUser.delete(userId);
}
function publishGeneratingFor(userId, sendTo) {
  const generating = (activeGenerationsByUser.get(userId)?.size ?? 0) > 0;
  sendTo({ type: "generation-state", generating }, userId);
}
async function handleSwipeDeletion(userId, chatId, messageId, deletedSwipeId) {
  const stored = await listUndoEntriesForMessage(userId, chatId, messageId);
  if (stored.length === 0)
    return;
  const next = [];
  for (const { swipeId, entry } of stored) {
    if (swipeId === deletedSwipeId) {
      debug(userId, `Undo dropped for ${messageId} swipe ${swipeId}: swipe deleted`);
      continue;
    }
    if (swipeId > deletedSwipeId) {
      const newIndex = swipeId - 1;
      next.push({ swipeId: newIndex, entry: { ...entry, swipeId: newIndex } });
      debug(userId, `Undo re-keyed for ${messageId}: swipe ${swipeId} -> ${newIndex} (deleteSwipe shift)`);
    } else {
      next.push({ swipeId, entry });
    }
  }
  await replaceUndoFileForMessage(userId, chatId, messageId, next);
}
function registerEvents(sendTo) {
  spindle.on("GENERATION_STARTED", safeEvent("GENERATION_STARTED", async (payload, userId) => {
    const id = payload.generationId;
    if (!id)
      return;
    addActiveGeneration(userId, id);
    debug(userId, `GENERATION_STARTED ${id} (active=${activeGenerationsByUser.get(userId)?.size ?? 0})`);
    publishGeneratingFor(userId, sendTo);
  }));
  spindle.on("GENERATION_STOPPED", safeEvent("GENERATION_STOPPED", async (payload, userId) => {
    const id = payload.generationId;
    if (!id)
      return;
    removeActiveGeneration(userId, id);
    debug(userId, `GENERATION_STOPPED ${id} (active=${activeGenerationsByUser.get(userId)?.size ?? 0})`);
    publishGeneratingFor(userId, sendTo);
  }));
  spindle.on("GENERATION_ENDED", safeEvent("GENERATION_ENDED", async (payload, userId) => {
    const id = payload.generationId;
    if (id)
      removeActiveGeneration(userId, id);
    debug(userId, `GENERATION_ENDED ${id} (active=${activeGenerationsByUser.get(userId)?.size ?? 0})`);
    publishGeneratingFor(userId, sendTo);
    const settings = await getSettings(userId);
    if (!settings.enabled || !settings.autoRefine)
      return;
    if (!hasPermission("chat_mutation"))
      return;
    const chatId = payload.chatId;
    const messageId = payload.messageId;
    if (!chatId || !messageId)
      return;
    const send = (m) => sendTo(m, userId);
    const messages = await spindle.chat.getMessages(chatId);
    const msg = messages.find((m) => m.id === messageId);
    if (msg?.role !== "assistant")
      return;
    debug(userId, `Auto-refine triggered for ${messageId} in chat ${chatId}`);
    send({ type: "auto-refine-started", messageId });
    try {
      await refineSingle(chatId, messageId, userId, send);
      send({ type: "auto-refine-complete", messageId, success: true });
      await sendRefinedStateFor(userId, send);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      spindle.log.warn(`Auto-refine failed: ${error}`);
      send({ type: "auto-refine-complete", messageId, success: false });
    }
  }));
  spindle.on("MESSAGE_SWIPED", safeEvent("MESSAGE_SWIPED", async (payload, userId) => {
    const { chatId, message, action, swipeId } = payload;
    if (!chatId || !message?.id)
      return;
    debug(userId, `MESSAGE_SWIPED(${action}) chat=${chatId.slice(0, 8)} msg=${message.id.slice(0, 8)} swipeId=${swipeId}`);
    if (action === "deleted" && typeof swipeId === "number") {
      await enqueueChatOperation(`${userId}:${chatId}`, () => handleSwipeDeletion(userId, chatId, message.id, swipeId));
    }
    const send = (m) => sendTo(m, userId);
    await sendRefinedStateFor(userId, send);
  }));
  spindle.on("MESSAGE_DELETED", safeEvent("MESSAGE_DELETED", async (payload, userId) => {
    const { chatId, messageId } = payload;
    if (!chatId || !messageId)
      return;
    debug(userId, `MESSAGE_DELETED chat=${chatId.slice(0, 8)} msg=${messageId.slice(0, 8)}`);
    await enqueueChatOperation(`${userId}:${chatId}`, () => replaceUndoFileForMessage(userId, chatId, messageId, []));
    const send = (m) => sendTo(m, userId);
    await sendRefinedStateFor(userId, send);
  }));
}

// src/backend/handlers/refine.ts
function requirePermission(p, ctx, messageId) {
  if (hasPermission(p))
    return true;
  const err = `Missing '${p}' permission. Grant it in extension settings.`;
  spindle.log.warn(err);
  ctx.send({ type: "refine-error", messageId: messageId || "", error: err });
  return false;
}
var refineHandlers = {
  async refine(msg, ctx) {
    if (!requirePermission("chat_mutation", ctx, msg.messageId))
      return;
    debug(ctx.userId, `Refining message ${msg.messageId} in chat ${msg.chatId}`);
    await refineSingle(msg.chatId, msg.messageId, ctx.userId, ctx.send);
    await sendRefinedStateFor(ctx.userId, ctx.send);
  },
  async undo(msg, ctx) {
    if (!requirePermission("chat_mutation", ctx, msg.messageId))
      return;
    debug(ctx.userId, `Undoing refinement for ${msg.messageId} in chat ${msg.chatId}`);
    await undoRefine(msg.chatId, msg.messageId, ctx.userId, ctx.send);
    await sendRefinedStateFor(ctx.userId, ctx.send);
  },
  async "bulk-refine"(msg, ctx) {
    if (!requirePermission("chat_mutation", ctx))
      return;
    debug(ctx.userId, `Bulk refining ${msg.messageIds.length} messages in chat ${msg.chatId}`);
    await refineBulk(msg.chatId, msg.messageIds, ctx.userId, ctx.send);
  },
  async enhance(msg, ctx) {
    if (!requirePermission("chat_mutation", ctx))
      return;
    debug(ctx.userId, `Enhancing user message in chat ${msg.chatId} (mode: ${msg.mode})`);
    await enhanceUserMessage(msg.text, msg.chatId, ctx.userId, msg.mode, ctx.send);
  },
  async "refine-last"(_msg, ctx) {
    if (!requirePermission("chat_mutation", ctx))
      return;
    if (!requirePermission("chats", ctx))
      return;
    try {
      const chatId = await getActiveChatIdFor(ctx.userId);
      if (!chatId) {
        ctx.send({ type: "refine-error", messageId: "", error: "No active chat" });
        return;
      }
      const messages = await spindle.chat.getMessages(chatId);
      const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
      if (!lastAssistant) {
        ctx.send({ type: "refine-error", messageId: "", error: "No assistant message found in chat" });
        return;
      }
      debug(ctx.userId, `Refine-last: refining ${lastAssistant.id} in chat ${chatId}`);
      await refineSingle(chatId, lastAssistant.id, ctx.userId, ctx.send);
      await sendRefinedStateFor(ctx.userId, ctx.send);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      ctx.send({ type: "refine-error", messageId: "", error });
    }
  },
  async "undo-last"(_msg, ctx) {
    if (!requirePermission("chat_mutation", ctx))
      return;
    if (!requirePermission("chats", ctx))
      return;
    try {
      const chatId = await getActiveChatIdFor(ctx.userId);
      if (!chatId) {
        ctx.send({ type: "refine-error", messageId: "", error: "No active chat" });
        return;
      }
      const messages = await spindle.chat.getMessages(chatId);
      const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
      if (!lastAssistant) {
        ctx.send({ type: "refine-error", messageId: "", error: "No assistant message in chat" });
        return;
      }
      const entry = await getUndo(ctx.userId, chatId, lastAssistant.id, lastAssistant.swipe_id);
      if (!entry) {
        ctx.send({ type: "refine-error", messageId: "", error: "No undo available for the current swipe" });
        return;
      }
      debug(ctx.userId, `Undo-last: undoing ${lastAssistant.id} swipe ${lastAssistant.swipe_id}`);
      await undoRefine(chatId, lastAssistant.id, ctx.userId, ctx.send);
      await sendRefinedStateFor(ctx.userId, ctx.send);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      ctx.send({ type: "refine-error", messageId: "", error });
    }
  },
  async "refine-all"(_msg, ctx) {
    if (!requirePermission("chat_mutation", ctx))
      return;
    if (!requirePermission("chats", ctx))
      return;
    try {
      const chatId = await getActiveChatIdFor(ctx.userId);
      if (!chatId) {
        ctx.send({ type: "refine-error", messageId: "", error: "No active chat" });
        return;
      }
      const messages = await spindle.chat.getMessages(chatId);
      const assistantIds = messages.filter((m) => m.role === "assistant").map((m) => m.id);
      if (assistantIds.length === 0) {
        ctx.send({ type: "refine-error", messageId: "", error: "No assistant messages in chat" });
        return;
      }
      debug(ctx.userId, `Refine-all: refining ${assistantIds.length} assistant messages in chat ${chatId}`);
      await refineBulk(chatId, assistantIds, ctx.userId, ctx.send);
      await sendRefinedStateFor(ctx.userId, ctx.send);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      ctx.send({ type: "refine-error", messageId: "", error });
    }
  },
  async "use-stage-version"(msg, ctx) {
    if (!requirePermission("chat_mutation", ctx))
      return;
    await enqueueChatOperation(`${ctx.userId}:${msg.chatId}`, async () => {
      try {
        const currentMsg = (await spindle.chat.getMessages(msg.chatId)).find((m) => m.id === msg.messageId);
        if (!currentMsg) {
          ctx.send({ type: "refine-error", messageId: msg.messageId, error: "Message not found" });
          return;
        }
        const swipeId = currentMsg.swipe_id;
        const existingEntry = await getUndo(ctx.userId, msg.chatId, msg.messageId, swipeId);
        if (!existingEntry) {
          ctx.send({ type: "refine-error", messageId: msg.messageId, error: "No active refinement on this swipe" });
          return;
        }
        if (!existingEntry.stages || existingEntry.stages.length === 0) {
          ctx.send({
            type: "refine-error",
            messageId: msg.messageId,
            error: "This refinement has no pipeline stages to pick from"
          });
          return;
        }
        const stage = existingEntry.stages.find((s) => s.index === msg.stageIndex && s.kind === msg.stageKind);
        if (!stage) {
          ctx.send({
            type: "refine-error",
            messageId: msg.messageId,
            error: `Stage ${msg.stageKind}[${msg.stageIndex}] not found`
          });
          return;
        }
        const updatedEntry = {
          ...existingEntry,
          refinedContent: stage.text,
          strategy: `stage-${stage.name}`,
          timestamp: Date.now()
        };
        await saveUndo(ctx.userId, msg.chatId, msg.messageId, swipeId, updatedEntry);
        try {
          await spindle.chat.updateMessage(msg.chatId, msg.messageId, {
            content: stage.text,
            metadata: { ...currentMsg.metadata || {}, hone_refined: true }
          });
        } catch (updateErr) {
          const updateError = updateErr instanceof Error ? updateErr.message : String(updateErr);
          spindle.log.warn(`[Hone] rollback: use-stage-version updateMessage failed for ${msg.messageId} swipe ${swipeId}: ${updateError}; restoring prior undo entry`);
          try {
            await saveUndo(ctx.userId, msg.chatId, msg.messageId, swipeId, existingEntry);
            spindle.log.warn(`[Hone] rollback: prior undo entry restored for ${msg.messageId} swipe ${swipeId}`);
          } catch (rollbackErr) {
            const rollbackError = rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr);
            spindle.log.error(`[Hone] rollback FAILED for ${msg.messageId} swipe ${swipeId}: ${rollbackError}. Undo entry now points at a stage that was not applied; next refine/undo of this swipe will reconcile`);
          }
          throw updateErr;
        }
        ctx.send({ type: "diff", original: existingEntry.originalContent, refined: stage.text });
        ctx.send({ type: "refine-complete", messageId: msg.messageId, success: true });
        await sendRefinedStateFor(ctx.userId, ctx.send);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        ctx.send({ type: "refine-error", messageId: msg.messageId, error });
      }
    });
  },
  async "view-diff"(msg, ctx) {
    if (!requirePermission("chats", ctx, msg.messageId))
      return;
    try {
      const messages = await spindle.chat.getMessages(msg.chatId);
      const targetMsg = messages.find((m) => m.id === msg.messageId);
      if (!targetMsg) {
        ctx.send({ type: "refine-error", messageId: msg.messageId, error: "Message not found" });
        return;
      }
      const entry = await getUndo(ctx.userId, msg.chatId, msg.messageId, targetMsg.swipe_id);
      if (entry) {
        ctx.send({ type: "diff", original: entry.originalContent, refined: entry.refinedContent });
      } else {
        ctx.send({ type: "refine-error", messageId: msg.messageId, error: "No diff data found for this swipe" });
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      debug(ctx.userId, `ipc view-diff: FAILED: ${error}`);
      ctx.send({ type: "refine-error", messageId: msg.messageId, error });
    }
  }
};

// src/backend/handlers/presets.ts
async function pushPresets(userId, send) {
  const presets = await listPresets(userId);
  const settings = await getSettings(userId);
  send({
    type: "presets",
    presets,
    activeId: settings.currentPresetId,
    activeInputId: settings.currentInputPresetId
  });
}
var presetHandlers = {
  async "list-presets"(_msg, ctx) {
    debug(ctx.userId, `ipc list-presets: fetching`);
    await pushPresets(ctx.userId, ctx.send);
  },
  async "get-preset"(msg, ctx) {
    debug(ctx.userId, `ipc get-preset: id="${msg.id}"`);
    const preset = await getPreset(ctx.userId, msg.id);
    if (!preset) {
      debug(ctx.userId, `ipc get-preset: "${msg.id}" not found, falling back`);
      await pushPresets(ctx.userId, ctx.send);
      return;
    }
    ctx.send({ type: "preset", preset });
  },
  async "save-preset"(msg, ctx) {
    debug(ctx.userId, `ipc save-preset: id="${msg.preset.id}" name="${msg.preset.name}"`);
    try {
      await savePreset(ctx.userId, msg.preset);
      await pushPresets(ctx.userId, ctx.send);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      spindle.log.warn(`[Hone] save-preset failed: ${error}`);
      ctx.send({ type: "preset-import-result", success: false, error });
    }
  },
  async "delete-preset"(msg, ctx) {
    debug(ctx.userId, `ipc delete-preset: id="${msg.id}"`);
    try {
      await deletePreset(ctx.userId, msg.id);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      spindle.log.warn(`[Hone] delete-preset failed: ${error}`);
      ctx.send({ type: "refine-error", messageId: "", error: `Failed to delete preset: ${error}` });
      await pushPresets(ctx.userId, ctx.send);
      return;
    }
    const settings = await getSettings(ctx.userId);
    const fallbacks = {};
    if (settings.currentPresetId === msg.id)
      fallbacks.currentPresetId = DEFAULT_ACTIVE_PRESET_ID;
    if (settings.currentInputPresetId === msg.id)
      fallbacks.currentInputPresetId = DEFAULT_INPUT_ACTIVE_PRESET_ID;
    if (Object.keys(fallbacks).length > 0)
      await updateSettings(ctx.userId, fallbacks);
    await pushPresets(ctx.userId, ctx.send);
  },
  async "duplicate-preset"(msg, ctx) {
    debug(ctx.userId, `ipc duplicate-preset: source="${msg.id}" slot=${msg.slot}`);
    try {
      const copy = await duplicatePreset(ctx.userId, msg.id);
      const settingsKey = msg.slot === "input" ? "currentInputPresetId" : "currentPresetId";
      await updateSettings(ctx.userId, { [settingsKey]: copy.id });
      await pushPresets(ctx.userId, ctx.send);
      ctx.send({ type: "preset", preset: copy });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      spindle.log.warn(`[Hone] duplicate-preset failed: ${error}`);
      ctx.send({ type: "preset-import-result", success: false, error });
    }
  },
  async "set-active-preset"(msg, ctx) {
    debug(ctx.userId, `ipc set-active-preset: id="${msg.id}" slot=${msg.slot}`);
    const preset = await getPreset(ctx.userId, msg.id);
    if (!preset) {
      spindle.log.warn(`[Hone] set-active-preset: preset "${msg.id}" not found`);
      return;
    }
    const settingsKey = msg.slot === "input" ? "currentInputPresetId" : "currentPresetId";
    await updateSettings(ctx.userId, { [settingsKey]: msg.id });
    await pushPresets(ctx.userId, ctx.send);
    ctx.send({ type: "preset", preset });
  },
  async "export-preset"(msg, ctx) {
    debug(ctx.userId, `ipc export-preset: id="${msg.id}"`);
    try {
      const exported = await exportPreset(ctx.userId, msg.id);
      ctx.send({
        type: "preset-exported",
        id: exported.id,
        name: exported.name,
        json: exported.json
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      spindle.log.warn(`[Hone] export-preset failed: ${error}`);
      ctx.send({ type: "preset-import-result", success: false, error });
    }
  },
  async "import-preset"(msg, ctx) {
    debug(ctx.userId, `ipc import-preset: ${msg.json.length} chars slot=${msg.slot}`);
    try {
      const imported = await importPreset(ctx.userId, msg.json, msg.slot);
      const settingsKey = msg.slot === "input" ? "currentInputPresetId" : "currentPresetId";
      await updateSettings(ctx.userId, { [settingsKey]: imported.id });
      await pushPresets(ctx.userId, ctx.send);
      ctx.send({ type: "preset", preset: imported });
      ctx.send({ type: "preset-import-result", success: true, id: imported.id });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      spindle.log.warn(`[Hone] import-preset failed: ${error}`);
      ctx.send({ type: "preset-import-result", success: false, error });
    }
  },
  async "preview-stage"(msg, ctx) {
    const previewChatId = msg.chatId || await getActiveChatIdFor(ctx.userId) || undefined;
    debug(ctx.userId, `ipc preview-stage: slot=${msg.slot} path=${JSON.stringify(msg.path)} stageIndex=${msg.stageIndex} chatId=${previewChatId?.slice(0, 8) || "none"}`);
    try {
      const settings = await getSettings(ctx.userId);
      const presetId = msg.slot === "input" ? settings.currentInputPresetId : settings.currentPresetId;
      const preset = await getPreset(ctx.userId, presetId);
      if (!preset) {
        spindle.log.warn(`[Hone] preview-stage: no active ${msg.slot} preset`);
        return;
      }
      const pipeline = msg.path.kind === "pipeline" ? preset.pipeline : msg.path.kind === "proposal" ? preset.parallel?.proposals[msg.path.proposalIndex] : preset.parallel?.aggregator;
      if (!pipeline) {
        spindle.log.warn(`[Hone] preview-stage: pipeline not found for path ${JSON.stringify(msg.path)}`);
        return;
      }
      const stage = pipeline.stages[msg.stageIndex];
      if (!stage) {
        spindle.log.warn(`[Hone] preview-stage: stage ${msg.stageIndex} not found`);
        return;
      }
      const proposals = msg.path.kind === "aggregator" && preset.parallel ? preset.parallel.proposals.map((_, i) => `<proposal ${i + 1} output: placeholder since no LLM was called for the preview>`) : undefined;
      const result = await previewStage(preset, stage, msg.stageIndex, pipeline.stages.length, ctx.userId, proposals, previewChatId, msg.slot);
      ctx.send({
        type: "preview-result",
        path: msg.path,
        stageIndex: msg.stageIndex,
        messages: result.messages,
        diagnostics: result.diagnostics
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      debug(ctx.userId, `ipc preview-stage: FAILED: ${error}`);
      spindle.log.warn(`[Hone] preview-stage failed: ${error}`);
    }
  }
};

// src/backend/handlers/profiles.ts
var profileHandlers = {
  async "list-model-profiles"(_msg, ctx) {
    debug(ctx.userId, `ipc in: list-model-profiles`);
    const profiles = await listModelProfiles(ctx.userId);
    ctx.send({ type: "model-profiles", profiles });
  },
  async "get-model-profile"(msg, ctx) {
    debug(ctx.userId, `ipc in: get-model-profile`);
    if (msg.id === DEFAULT_PROFILE_ID) {
      ctx.send({ type: "model-profile", profile: getDefaultProfile() });
      return;
    }
    const profile = await getModelProfile(ctx.userId, msg.id);
    if (profile) {
      ctx.send({ type: "model-profile", profile });
      return;
    }
    debug(ctx.userId, `ipc get-model-profile: "${msg.id}" not found, falling back to default`);
    ctx.send({ type: "model-profile", profile: getDefaultProfile() });
    const settings = await getSettings(ctx.userId);
    if (settings.activeModelProfileId === msg.id) {
      await updateSettings(ctx.userId, { activeModelProfileId: "" });
      ctx.send({ type: "settings", settings: { ...settings, activeModelProfileId: "" } });
    }
  },
  async "create-model-profile"(msg, ctx) {
    debug(ctx.userId, `ipc in: create-model-profile`);
    const profile = await createModelProfile(ctx.userId, msg.connectionProfileId, msg.name);
    ctx.send({ type: "model-profile", profile });
    await updateSettings(ctx.userId, { activeModelProfileId: profile.id });
    const updatedSettings = await getSettings(ctx.userId);
    ctx.send({ type: "settings", settings: updatedSettings });
    ctx.send({ type: "model-profiles", profiles: await listModelProfiles(ctx.userId) });
  },
  async "save-model-profile"(msg, ctx) {
    debug(ctx.userId, `ipc in: save-model-profile`);
    await saveModelProfile(ctx.userId, msg.profile);
    ctx.send({ type: "model-profile", profile: msg.profile });
    ctx.send({ type: "model-profiles", profiles: await listModelProfiles(ctx.userId) });
  },
  async "delete-model-profile"(msg, ctx) {
    debug(ctx.userId, `ipc in: delete-model-profile`);
    await deleteModelProfile(ctx.userId, msg.id);
    const settings = await getSettings(ctx.userId);
    if (settings.activeModelProfileId === msg.id) {
      await updateSettings(ctx.userId, { activeModelProfileId: "" });
      const updatedSettings = await getSettings(ctx.userId);
      ctx.send({ type: "settings", settings: updatedSettings });
    }
    ctx.send({ type: "model-profiles", profiles: await listModelProfiles(ctx.userId) });
  },
  async "duplicate-model-profile"(msg, ctx) {
    debug(ctx.userId, `ipc in: duplicate-model-profile`);
    const dup = msg.id === DEFAULT_PROFILE_ID ? await createModelProfile(ctx.userId, "", "New Profile") : await duplicateModelProfile(ctx.userId, msg.id);
    if (!dup) {
      debug(ctx.userId, `ipc duplicate-model-profile: source "${msg.id}" not found`);
      return;
    }
    await updateSettings(ctx.userId, { activeModelProfileId: dup.id });
    const updatedSettings = await getSettings(ctx.userId);
    ctx.send({ type: "settings", settings: updatedSettings });
    ctx.send({ type: "model-profile", profile: dup });
    ctx.send({ type: "model-profiles", profiles: await listModelProfiles(ctx.userId) });
  }
};

// src/backend/handlers/pov.ts
var povHandlers = {
  async "list-pov-presets"(_msg, ctx) {
    debug(ctx.userId, `ipc in: list-pov-presets`);
    ctx.send({ type: "pov-presets", presets: await listPovPresets(ctx.userId) });
  },
  async "save-pov-preset"(msg, ctx) {
    debug(ctx.userId, `ipc in: save-pov-preset id="${msg.preset.id}"`);
    try {
      if (isBuiltInPovPresetId(msg.preset.id)) {
        throw new Error(`Cannot save over built-in POV preset "${msg.preset.id}"; duplicate it first.`);
      }
      await savePovPreset(ctx.userId, msg.preset);
      ctx.send({ type: "pov-presets", presets: await listPovPresets(ctx.userId) });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      spindle.log.warn(`[Hone] save-pov-preset failed: ${error}`);
      ctx.send({ type: "pov-presets", presets: await listPovPresets(ctx.userId) });
      ctx.send({ type: "pov-preset-error", error: `Failed to save POV preset: ${error}` });
    }
  },
  async "delete-pov-preset"(msg, ctx) {
    debug(ctx.userId, `ipc in: delete-pov-preset id="${msg.id}"`);
    try {
      if (isBuiltInPovPresetId(msg.id)) {
        throw new Error(`Cannot delete built-in POV preset "${msg.id}".`);
      }
      await deletePovPreset(ctx.userId, msg.id);
      const settings = await getSettings(ctx.userId);
      const patch = {};
      if (settings.pov === msg.id)
        patch.pov = DEFAULT_POV_PRESET_ID;
      if (settings.userPov === msg.id)
        patch.userPov = DEFAULT_USER_POV_PRESET_ID;
      if (Object.keys(patch).length > 0) {
        const updated = await updateSettings(ctx.userId, patch);
        ctx.send({ type: "settings", settings: updated });
      }
      ctx.send({ type: "pov-presets", presets: await listPovPresets(ctx.userId) });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      spindle.log.warn(`[Hone] delete-pov-preset failed: ${error}`);
      ctx.send({ type: "pov-presets", presets: await listPovPresets(ctx.userId) });
      ctx.send({ type: "pov-preset-error", error: `Failed to delete POV preset: ${error}` });
    }
  },
  async "duplicate-pov-preset"(msg, ctx) {
    debug(ctx.userId, `ipc in: duplicate-pov-preset id="${msg.id}" slot=${msg.slot}`);
    try {
      const copy = await duplicatePovPreset(ctx.userId, msg.id);
      const settingsKey = msg.slot === "input" ? "userPov" : "pov";
      const updated = await updateSettings(ctx.userId, { [settingsKey]: copy.id });
      ctx.send({ type: "settings", settings: updated });
      ctx.send({ type: "pov-presets", presets: await listPovPresets(ctx.userId) });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      spindle.log.warn(`[Hone] duplicate-pov-preset failed: ${error}`);
      ctx.send({ type: "pov-presets", presets: await listPovPresets(ctx.userId) });
      ctx.send({ type: "pov-preset-error", error: `Failed to duplicate POV preset: ${error}` });
    }
  }
};

// src/backend/handlers/settings.ts
var settingsHandlers = {
  async "get-settings"(_msg, ctx) {
    const settings = await getSettings(ctx.userId);
    ctx.send({ type: "settings", settings });
  },
  async "update-settings"(msg, ctx) {
    const updated = await updateSettings(ctx.userId, msg.settings);
    ctx.send({ type: "settings", settings: updated });
    if ("debugLogging" in msg.settings || "debugLogMaxEntries" in msg.settings) {
      const stats = bufferStats(ctx.userId);
      ctx.send({
        type: "debug-logs",
        formatted: formatLogs(ctx.userId),
        count: stats.count,
        capacity: stats.capacity,
        enabled: stats.enabled
      });
    }
  },
  async "get-stats"(msg, ctx) {
    if (!hasPermission("chats"))
      return;
    const stats = await getStats(ctx.userId, msg.chatId);
    ctx.send({ type: "stats", stats });
  },
  async "get-connections"(_msg, ctx) {
    if (!hasPermission("generation"))
      return;
    try {
      const conns = await spindle.connections.list(ctx.userId);
      ctx.send({
        type: "connections",
        connections: (conns ?? []).map((c) => ({
          id: c.id,
          name: c.name,
          provider: c.provider || "",
          model: c.model || "",
          is_default: !!c.is_default,
          has_api_key: !!c.has_api_key
        }))
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      spindle.log.warn(`get-connections failed: ${error}`);
      ctx.send({ type: "connections", connections: [], error });
    }
  },
  async "get-active-chat"(_msg, ctx) {
    const chatId = await getActiveChatIdFor(ctx.userId);
    debug(ctx.userId, `Active chat: ${chatId || "none"}`);
    if (!chatId) {
      ctx.send({
        type: "active-chat",
        chatId: null,
        lastMessageRefined: false,
        lastAiMessageId: null,
        refinedMessageIds: []
      });
      return;
    }
    const snap = await snapshotLastAiState(ctx.userId, chatId);
    ctx.send({
      type: "active-chat",
      chatId,
      lastMessageRefined: snap.refined,
      lastAiMessageId: snap.messageId,
      lastAiStages: snap.stages,
      refinedMessageIds: snap.refinedMessageIds
    });
  }
};

// src/backend/handlers/debug.ts
var debugHandlers = {
  async "get-debug-logs"(_msg, ctx) {
    const formatted = formatLogs(ctx.userId);
    const stats = bufferStats(ctx.userId);
    ctx.send({
      type: "debug-logs",
      formatted,
      count: stats.count,
      capacity: stats.capacity,
      enabled: stats.enabled
    });
  },
  async "clear-debug-logs"(_msg, ctx) {
    clearLogs(ctx.userId);
    const stats = bufferStats(ctx.userId);
    ctx.send({
      type: "debug-logs",
      formatted: formatLogs(ctx.userId),
      count: stats.count,
      capacity: stats.capacity,
      enabled: stats.enabled
    });
  },
  async log(msg, ctx) {
    if (msg.level === "error") {
      spindle.log.warn(`[Hone][frontend] ERROR ${msg.msg}`);
    }
    debug(ctx.userId, `[frontend ${msg.level}] ${msg.msg}`);
  }
};

// src/backend/index.ts
function sendTo(msg, userId) {
  spindle.sendToFrontend(msg, userId);
}
var allHandlers = {
  ...refineHandlers,
  ...presetHandlers,
  ...profileHandlers,
  ...povHandlers,
  ...settingsHandlers,
  ...debugHandlers
};
var dispatch = createDispatcher(allHandlers);
spindle.onFrontendMessage(async (raw, userId) => {
  const msg = validateIpcMessage(raw);
  if (!msg) {
    spindle.log.warn("Received invalid IPC message (missing type)");
    return;
  }
  debug(userId, `ipc in: ${msg.type}${"chatId" in msg && typeof msg.chatId === "string" ? ` chatId=${msg.chatId.slice(0, 8)}` : ""}${"messageId" in msg && typeof msg.messageId === "string" ? ` msgId=${msg.messageId.slice(0, 8)}` : ""}`);
  try {
    await dispatch(msg, {
      userId,
      send: (m) => sendTo(m, userId)
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    spindle.log.warn(`IPC handler error (${msg.type}): ${error}`);
  }
});
registerEvents(sendTo);
async function init() {
  await initPermissions();
  spindle.log.info("Hone extension loaded");
}
init();
