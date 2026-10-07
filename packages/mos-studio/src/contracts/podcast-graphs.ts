/**
 * Podcast graph contracts (STUDIO-010 / STUDIO-011).
 *
 * The audio-podcast flow produces two REAL studio-owned graphs in addition
 * to the artifact package (§6):
 * - the CONVERSATION GRAPH: question/answer nodes derived from the adaptive
 *   interviewer session (STUDIO-004), every question node carrying the
 *   interviewer representation provenance that delivered it (§14 labels stay
 *   end-to-end);
 * - the EDIT GRAPH: organization-driven editing decisions RECORDED as
 *   versioned refs. The ORGANIZATION decides edit points (the podcast
 *   format declares the open decision points, §16-style); the studio only
 *   records the decisions — it never invents them. Per §12, OpenTimelineIO
 *   is an interchange layer, never the authority: `otioInterchange` marks
 *   whether an interchange export exists.
 */

import type {
  AnswerRef,
  ContractVersion,
  ConversationGraphId,
  EditGraphId,
  Timestamp,
} from "./refs.js";
import type { TranscriptRef } from "./studio-artifact-package.js";
import type { StudioOrganizationRef } from "./organization-loading.js";
import type { InterviewerAgentExecutionTrace } from "./interviewer-session.js";
import type { InterviewerProvenance, InterviewerRepresentationKind } from "./interviewer.js";

// ---------------------------------------------------------------------------
// Conversation graph (question/answer nodes from the adaptive loop)
// ---------------------------------------------------------------------------

/** One conversation node kind: the interviewer's question or the participant's answer. */
export type ConversationNodeKind = "question" | "answer";

/** Base fields of every conversation node. */
interface ConversationNodeBase {
  /** Stable node id inside one conversation graph version. */
  readonly nodeId: string;
  readonly kind: ConversationNodeKind;
  /** Timestamp of the presentation/answer. */
  readonly at: Timestamp;
}

/** The interviewer's question as a conversation node. */
export interface QuestionConversationNode extends ConversationNodeBase {
  readonly kind: "question";
  /** The script-graph node the question came from. */
  readonly scriptGraphNodeId: string;
  readonly questionText: string;
  /** Which representation kind delivered the question. */
  readonly representationKind: InterviewerRepresentationKind;
  /** The interviewer provenance carried forward unchanged (§14). */
  readonly interviewerProvenance: InterviewerProvenance;
  /** Audit trace of the agent execution that delivered the question, when present. */
  readonly agentExecution?: InterviewerAgentExecutionTrace;
}

/** The participant's answer as a conversation node. */
export interface AnswerConversationNode extends ConversationNodeBase {
  readonly kind: "answer";
  /** The question node (conversation-graph id) this answer responds to. */
  readonly respondsToNodeId: string;
  readonly answerRef: AnswerRef;
  readonly answerText?: string;
  /** Identity of the participant who answered. */
  readonly answeredBy: string;
}

/** Discriminated union of conversation nodes — narrow on `kind`. */
export type ConversationGraphNode = QuestionConversationNode | AnswerConversationNode;

/** One directed conversation edge: question → answer, answer → next question. */
export interface ConversationGraphEdge {
  readonly edgeId: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
}

/**
 * The conversation graph of one interview: question/answer nodes from the
 * adaptive loop, versioned, derived from the session transcripts.
 */
export interface PodcastConversationGraph {
  readonly graphId: ConversationGraphId;
  readonly version: ContractVersion;
  /** The interviewer session the conversation was captured in. */
  readonly interviewSessionId: string;
  /** The EXACT script-graph version the interview followed. */
  readonly scriptGraph: { readonly graphId: string; readonly version: number };
  readonly nodes: readonly ConversationGraphNode[];
  readonly edges: readonly ConversationGraphEdge[];
  readonly derivedFrom: readonly TranscriptRef[];
  /** True when any interviewer material is synthetic/generated (§14 disclosure). */
  readonly containsSyntheticInterviewerMaterial: boolean;
  readonly builtAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Edit graph (organization-driven edit decisions, recorded as refs)
// ---------------------------------------------------------------------------

/** Kinds of edit decisions an organization makes (§16-style decision data). */
export type EditDecisionKind = "keep" | "trim" | "cut" | "reorder";

/** One organization edit decision RECORDED by the studio (the org decides, the studio records). */
export interface RecordedEditDecision {
  readonly decisionId: string;
  /** MUST reference a decision point the format declares as organization-owned. */
  readonly decisionPointId: string;
  /** The organization version that made the decision. */
  readonly decidedByOrganization: StudioOrganizationRef;
  /** The organization node that decided (when the org declares node identity). */
  readonly decidedByNodeId?: string;
  readonly decision: {
    readonly kind: EditDecisionKind;
    /** Conversation-graph nodes the decision applies to. */
    readonly targetConversationNodeIds: readonly string[];
    /** For reorder decisions: the new ordering of the target nodes. */
    readonly reorderedTo?: readonly string[];
  };
  readonly decidedAt: Timestamp;
}

/** Failure modes of edit-graph recording (typed, never thrown). */
export type EditGraphError =
  | { readonly kind: "decision-point-not-declared"; readonly decisionPointId: string; readonly declaredPointIds: readonly string[] }
  | { readonly kind: "edit-decision-malformed"; readonly decisionId: string; readonly reasons: readonly string[] }
  | { readonly kind: "conversation-node-not-found"; readonly nodeId: string; readonly decisionId: string };

/**
 * The edit graph of one podcast: the recorded organization edit decisions,
 * versioned and append-only. The studio owns the RECORD; edit semantics
 * (what the loaded organization actually produces) remain the
 * organization's production program (STUDIO-008).
 */
export interface PodcastEditGraph {
  readonly graphId: EditGraphId;
  readonly version: ContractVersion;
  readonly decisions: readonly RecordedEditDecision[];
  /** Whether an OpenTimelineIO interchange export exists (§12: interchange, never authority). */
  readonly otioInterchange: boolean;
  readonly recordedAt: Timestamp;
}
