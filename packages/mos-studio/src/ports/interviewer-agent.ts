/**
 * Studio-owned interviewer agent port (STUDIO-003 / STUDIO-004 seam).
 *
 * STUDIO-004 (REAL binding): the interviewer that presents questions is an
 * AGENT INSTANCE from `@mos/agent-runtime` (an AgentInstance of an
 * interviewer AgentBody registered in `@mos/agents`) with an explicit model
 * boundary (spec §14 interviewer representations; AGT-002 "agent
 * instance/model boundary"). The REAL adapter
 * (runtime/interviewer/agent-instance-interviewer.ts) binds such an instance
 * to this port: the agent renders the selected question through its declared
 * {@link InterviewerRepresentation} (voice/text/avatar/prerecorded/generated/
 * hybrid) and the presentation carries the representation's provenance
 * forward — synthetic/generated interviewer material RETAINS its label
 * end-to-end (§14, architecture-lock #20) — plus an
 * {@link InterviewerAgentExecutionTrace} audit record of the instance
 * execution that delivered the question.
 *
 * The W2-C disclosed in-memory double (testing/in-memory-interviewer-agent.ts)
 * stays available for contract tests that do not exercise the agent runtime:
 * it only ECHOES the question + representation + provenance it is handed —
 * it never invents questions (selection belongs to the
 * AdaptiveSequencerPort) or rewrites provenance.
 */

import type { StudioSessionId, TenantId, Timestamp } from "../contracts/refs.js";
import type { ScriptGraphVersionRef } from "../contracts/script-graph.js";
import type {
  InterviewerProvenance,
  InterviewerRepresentation,
  InterviewerRepresentationKind,
} from "../contracts/interviewer.js";
import type { BoundInterviewerAgent, InterviewerAgentExecutionTrace } from "../contracts/interviewer-session.js";

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
  /**
   * The bound interviewer agent instance that delivers the question
   * (STUDIO-004). The REAL adapter requires it; the W2-C echo double ignores
   * it — presentations without an agent run outside the agent runtime.
   */
  readonly agent?: BoundInterviewerAgent;
}

/** One interviewer question presentation, provenance-labeled. */
export interface InterviewerQuestionPresentation {
  readonly questionNodeId: string;
  readonly questionText: string;
  /** Which of the six representation kinds delivered the question. */
  readonly representationKind: InterviewerRepresentationKind;
  /** The representation's provenance, carried forward unchanged (§14). */
  readonly provenance: InterviewerProvenance;
  /**
   * Audit trace of the agent-instance execution that delivered this
   * question (STUDIO-004 REAL binding; absent on the W2-C echo double).
   * Carries no model identity — that record stays with the agent runtime.
   */
  readonly agentExecution?: InterviewerAgentExecutionTrace;
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
 * Derive the provenance a presentation reports for a declared
 * representation (§14: carried forward UNCHANGED). A hybrid carries
 * provenance per component, so the presentation reports the union of its
 * components' origins; every other kind reports its own label. Returns
 * `undefined` when the representation is not provenance-labeled — callers
 * fail closed (`representation-provenance-missing`).
 */
export function derivePresentationProvenance(
  representation: InterviewerRepresentation,
): InterviewerProvenance | undefined {
  if (representation.representation === "hybrid") {
    if (representation.components.length === 0) {
      return undefined;
    }
    const everyHuman = representation.components.every((c) => c.provenance.origin === "human-performed");
    const everySynthetic = representation.components.every((c) => c.provenance.origin === "synthetic-generated");
    return { origin: everyHuman ? "human-performed" : everySynthetic ? "synthetic-generated" : "mixed" };
  }
  return representation.provenance;
}

/**
 * Narrow port an interviewer agent instance binds to (STUDIO-004 REAL
 * binding: runtime/interviewer/agent-instance-interviewer.ts; the W2-C
 * disclosed echo double remains at testing/in-memory-interviewer-agent.ts).
 */
export interface InterviewerAgentPort {
  /** Present one selected question through the declared representation. */
  presentQuestion(input: InterviewerQuestionPresentationInput): Promise<InterviewerQuestionPresentationResult>;
}
