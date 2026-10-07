/**
 * Studio-owned interviewer agent port (STUDIO-003 / STUDIO-004 seam).
 *
 * FUTURE BINDING (AGT-002 — Worker B's SAME-WAVE package `@mos/agents`,
 * NOT in this base): the interviewer that presents questions is an AGENT
 * INSTANCE with an explicit model boundary (spec §14 interviewer
 * representations; AGT-002 "agent instance/model boundary"). When
 * `@mos/agents` lands, an adapter binds a real agent instance to this port:
 * the agent renders the selected question through its declared
 * {@link InterviewerRepresentation} (voice/text/avatar/prerecorded/generated/
 * hybrid) and the presentation carries the representation's provenance
 * forward — synthetic/generated interviewer material RETAINS its label
 * end-to-end (§14, architecture-lock #20).
 *
 * This wave ships a DISCLOSED IN-MEMORY DOUBLE (testing/
 * in-memory-interviewer-agent.ts) so the contract is exercised without a
 * second authority: the double only ECHOES the question + representation +
 * provenance it is handed — it never invents questions (selection belongs to
 * the AdaptiveSequencerPort) or rewrites provenance.
 */

import type { StudioSessionId, TenantId, Timestamp } from "../contracts/refs.js";
import type { ScriptGraphVersionRef } from "../contracts/script-graph.js";
import type {
  InterviewerProvenance,
  InterviewerRepresentation,
  InterviewerRepresentationKind,
} from "../contracts/interviewer.js";

/** Input of {@link InterviewerAgentPort.presentQuestion}. */
export interface InterviewerQuestionPresentationInput {
  readonly tenantId: TenantId;
  /** Session the presentation belongs to (optional: dry runs outside sessions). */
  readonly sessionId?: StudioSessionId;
  /** Exact graph version the question was selected from (audit, §30). */
  readonly graph: ScriptGraphVersionRef;
  /** The already-selected question node (selection is the sequencer's job). */
  readonly question: { readonly nodeId: string; readonly text: string };
  /** Declared interviewer representation to present through. */
  readonly representation: InterviewerRepresentation;
}

/** One interviewer question presentation, provenance-labeled. */
export interface InterviewerQuestionPresentation {
  readonly questionNodeId: string;
  readonly questionText: string;
  /** Which of the six representation kinds delivered the question. */
  readonly representationKind: InterviewerRepresentationKind;
  /** The representation's provenance, carried forward unchanged (§14). */
  readonly provenance: InterviewerProvenance;
  readonly presentedAt: Timestamp;
}

/** Result of a presentation attempt (typed failures, never thrown). */
export type InterviewerQuestionPresentationResult =
  | { readonly ok: true; readonly presentation: InterviewerQuestionPresentation }
  | { readonly ok: false; readonly error: InterviewerPresentationError };

/** Failure modes of question presentation (explicit, never silent). */
export type InterviewerPresentationError =
  | { readonly kind: "question-blank" }
  | { readonly kind: "representation-provenance-missing" }
  | { readonly kind: "agent-unavailable"; readonly reason: string };

/**
 * Narrow port an interviewer agent instance binds to (future AGT-002
 * binding; disclosed in-memory double this wave).
 */
export interface InterviewerAgentPort {
  /** Present one selected question through the declared representation. */
  presentQuestion(input: InterviewerQuestionPresentationInput): Promise<InterviewerQuestionPresentationResult>;
}
