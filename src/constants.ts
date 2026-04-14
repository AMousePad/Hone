/** Shared constants used by both backend and frontend builds. Keep
 *  this file free of runtime dependencies so it can be bundled into
 *  either target without pulling in backend-only modules. */

/** Virtual default model profile id. Never persisted; represents
 *  "use the user's default Lumiverse connection with no sampler
 *  overrides and auto-strip reasoning tags". */
export const DEFAULT_PROFILE_ID = "__default__";

/** Sentinel `promptId` that expands at assembly time to the preset's
 *  `headCollection` array. Lets authors bundle the prompts they'd
 *  otherwise add to every stage row into one draggable chip.
 *
 *  Reserved id; user-defined prompts can't collide because `slugifyId`
 *  strips leading/trailing hyphens and never produces a `__`-prefixed
 *  slug. */
export const HEAD_COLLECTION_ID = "__head__";
