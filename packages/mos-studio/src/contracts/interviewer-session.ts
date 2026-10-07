/**
 * Interviewer session contracts (STUDIO-004, spec §14).
 *
 * An {@link InterviewerSession} binds ONE versioned script/question graph
 * (STUDIO-003) to ONE interviewer: a REAL agent instance from
 * `@mos/agent-runtime` (an AgentInstance of an interviewer AgentBody
 * registered in `@mos/agents`) presenting the sequencer-selected questions
 * through a declared {@link InterviewerRepresentation}.
 *
 * Provenance discipline (§14, lock rule 20): EVERY representation carries a
 * provenance label; generated/synthetic interviewer material stays labeled
 * `synthetic-generated`/`mixed` END-TO-END — the label travels on each
 * presentation and into the conversation graph.
 *
 * Model boundary (lock rule 9): the interviewer agent's model is selected
 * ONLY behind @mos/agent-runtime's single model boundary. The studio-side
 * surfaces in this file carry NO model identity at all — no model refs, no
 * model preferences, no runtime refs (pinned by
 * runtime/interviewer/no-model-selection.test.ts).
 */

import type {
  AnswerRef,
  IdentityRef,
  InterviewerSessionId,
  StudioSessionId,
  TenantId,
  Timestamp,
  Version,
} from "./refs.js";
import type { ScriptGraphVersionRef } from "./script-graph.js";
import type { InterviewerRepresentation, InterviewerRepresentationKind } from "./interviewer.js";
import type { InterviewerQuestionPresentation } from "../ports/interviewer-agent.js";

/**
 * The interviewer agent body the studio binds: identified by body id +
 * version (canonical `Version`). The agent-runtime adapter validates them
 * against the REAL @mos/agents registry.
 */
export interface InterviewerAgentBodyInput {
  readonly bodyId: string;
  readonly bodyVersion: Version;
}

/**
 * A BOUND interviewer agent instance — the studio-side view. Deliberately
 * carries NO model/runtime identity: which model the instance executes with
 * is decided (and recorded) exclusively behind @mos/agent-runtime's single
 * model boundary (lock rule 9). The studio may observe the instance id +
 * body identity only.
 */
export interface BoundInterviewerAgent {
  readonly instanceId: string;
  readonly bodyId: string;
  readonly bodyVersion: Version;
  readonly lifecycle: "bound";
}

/** A released interviewer agent instance (terminal lifecycle state). */
export interface ReleasedInterviewerAgent {
  readonly instanceId: string;
  readonly bodyId: string;
  readonly bodyVersion: Version;
  readonly lifecycle: "released";
}

/**
 * Audit trace of ONE agent-instance execution that delivered a question
 * (§30 observability): which instance, which body version, how it finished,
 * what it rendered and what it consumed. Carries no model identity (the
 * agent-runtime authority owns that record).
 */
export interface InterviewerAgentExecutionTrace {
  readonly instanceId: string;
  readonly bodyId: string;
  readonly bodyVersion: Version;
  readonly finishReason: string;
  /** The agent's rendered delivery of the question (final output). */
  readonly output: string;
  readonly usage: {
    readonly steps?: number;
    readonly inputTokens?: number;
    readonly outputTokens?: number;
    readonly durationMs?: number;
  };
}

/** One typed answer recorded against the current question node. */
export interface InterviewerAnswerInput {
  /** The answer ref driving branch selection (§14 "based on answers"). */
  readonly answerRef: AnswerRef;
  /** The answer text, when the participant typed/spoke it (verbatim). */
  readonly answerText?: string;
  /** Identity of the participant who answered. */
  readonly answeredBy: IdentityRef;
}

/** One recorded answer (append-only history entry of the session). */
export interface RecordedInterviewAnswer {
  readonly answerRef: AnswerRef;
  readonly answerText?: string;
  readonly answeredBy: IdentityRef;
  readonly answeredAt: Timestamp;
  /** The question node this answer responded to. */
  readonly questionNodeId: string;
  /** The node the sequencer selected next (null ⇒ interview complete). */
  readonly nextNodeId: string | null;
}

/** A mid-session interviewer representation switch (§14, provenance kept). */
export interface InterviewerRepresentationSwitchEvent {
  readonly from: InterviewerRepresentationKind;
  readonly to: InterviewerRepresentationKind;
  readonly at: Timestamp;
}

/** Input of {@link ../runtime/interviewer/interviewer-session.js!createInterviewerSession}. */
export interface CreateInterviewerSessionInput {
  readonly tenantId: TenantId;
  /** Studio session this interview belongs to (optional: dry runs). */
  readonly sessionId?: StudioSessionId;
  /** EXACT graph version (never a silent latest substitution). */
  readonly graph: ScriptGraphVersionRef;
  /** The interviewer's declared representation (provenance labeled, §14). */
  readonly representation: InterviewerRepresentation;
  /** The interviewer agent body to instantiate + bind (via the agent runtime). */
  readonly agentBody: InterviewerAgentBodyInput;
}

/** Read-only summary of one interviewer session. */
export interface InterviewerSessionSummary {
  readonly sessionId: InterviewerSessionId;
  readonly tenantId: TenantId;
  readonly studioSessionId?: StudioSessionId;
  readonly graph: ScriptGraphVersionRef;
  readonly interviewer: {
    readonly representation: InterviewerRepresentation;
    readonly agent: BoundInterviewerAgent;
  };
  /** Node awaiting presentation (null ⇒ terminal or closed). */
  readonly currentNodeId: string | null;
  /** True once the branch graph reached a terminal node. */
  readonly terminal: boolean;
  /** True once the session was completed and the agent instance released. */
  readonly closed: boolean;
  /** Every question presentation, in order (provenance labeled). */
  readonly presentations: readonly InterviewerQuestionPresentation[];
  /** Every recorded answer, in order. */
  readonly answers: readonly RecordedInterviewAnswer[];
  /** Representation switches, in order (session + provenance preserved). */
  readonly representationSwitches: readonly InterviewerRepresentationSwitchEvent[];
  readonly createdAt: Timestamp;
}

/** Every failure the interviewer session can return (explicit, never thrown). */
export type InterviewerSessionError =
  | { readonly kind: "graph-not-found"; readonly graphId: ScriptGraphVersionRef["graphId"] }
  | { readonly kind: "graph-version-not-found"; readonly ref: ScriptGraphVersionRef }
  | { readonly kind: "graph-has-no-presentable-entry"; readonly ref: ScriptGraphVersionRef }
  | { readonly kind: "graph-cycle-detected"; readonly nodeId: string }
  | { readonly kind: "representation-invalid"; readonly reasons: readonly string[] }
  | { readonly kind: "agent-binding-failed"; readonly reason: string }
  | { readonly kind: "agent-unavailable"; readonly reason: string }
  | { readonly kind: "interview-complete" }
  | { readonly kind: "session-closed" }
  | { readonly kind: "answer-blank" }
  | { readonly kind: "sequencer-failed"; readonly error: import("../ports/adaptive-sequencer.js").AdaptiveSelectionError };

/** Ok/failure pair used by every interviewer-session method. */
export type InterviewerSessionOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: InterviewerSessionError };
