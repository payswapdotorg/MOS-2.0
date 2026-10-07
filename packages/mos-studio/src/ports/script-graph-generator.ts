/**
 * Studio-owned script-graph generator port (STUDIO-003, §14).
 *
 * The GENERATIVE step — turning an {@link IntentRecord} into script/question
 * graph CONTENT — is engine work (question generation, script drafting:
 * STUDIO-004 / ENG-002 capability→engine chain, spec §14). The Studio owns
 * the contracts, the versioned storage (runtime/script-graph/) and the
 * adaptive selection; it binds the generator behind this narrow port so a
 * later wave can attach the real engine-backed implementation without
 * touching studio logic.
 *
 * Authority split (explicit): the generator produces graph CONTENT + the
 * mandatory §14 provenance labels; the versioned SCRIPT GRAPH STORE is the
 * single authority that assigns `graphId`/`version`/`createdAt`
 * (§6 versioning). Composed flow: intent → generator draft → store
 * registration → VERSIONED `ScriptGraph`.
 *
 * Binding status (disclosed): this wave ships a DETERMINISTIC IN-MEMORY
 * DOUBLE (testing/in-memory-script-graph-generator.ts) that derives a
 * question/prompt/beat graph structurally from the intent statement — no
 * engine is involved, and every generated node is labeled
 * `synthetic-generated` with the generating intent (§14 provenance).
 */

import type { IntentRecord, ScriptGraphDraft } from "../contracts/script-graph.js";
import type { StudioFormatId } from "../contracts/refs.js";

/** Input of {@link ScriptGraphGeneratorPort.generateScriptGraph}. */
export interface ScriptGraphGenerationInput {
  /** The recorded user intent to generate from (§14 intent-only generation). */
  readonly intent: IntentRecord;
  /** Declared target format — generators may validate format support. */
  readonly formatId?: StudioFormatId;
}

/** Result of a generation attempt (typed failures, never thrown). */
export type ScriptGraphGenerationResult =
  | { readonly ok: true; readonly draft: ScriptGraphDraft }
  | { readonly ok: false; readonly error: ScriptGraphGenerationError };

/** Failure modes of script-graph generation (explicit, never silent). */
export type ScriptGraphGenerationError =
  | { readonly kind: "intent-statement-blank"; readonly intentId: IntentRecord["intentId"] }
  | { readonly kind: "format-unsupported-for-question-graphs"; readonly formatId: StudioFormatId }
  | { readonly kind: "generation-unavailable"; readonly reason: string };

/**
 * Narrow port an engine-backed generator binds to (STUDIO-003). The returned
 * draft MUST already carry its provenance labels; the studio-side store
 * validates and versions it on registration.
 */
export interface ScriptGraphGeneratorPort {
  /** Generate script/question graph content from one recorded intent. */
  generateScriptGraph(input: ScriptGraphGenerationInput): Promise<ScriptGraphGenerationResult>;
}
