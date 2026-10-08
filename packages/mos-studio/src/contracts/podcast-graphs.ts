/**
 * Podcast graph contracts (STUDIO-010 / STUDIO-011; STUDIO-013 removed the
 * flow-local edit-graph recorder — the W8-C EditingCompositionPort is the
 * ONE composition surface and the `EditingCompositionGraph` the ONE
 * edit-graph record shape for every format).
 *
 * The podcast flows produce one REAL studio-owned graph in addition to the
 * artifact package (§6): the CONVERSATION GRAPH — question/answer nodes
 * derived from the adaptive interviewer session (STUDIO-004), every
 * question node carrying the interviewer representation provenance that
 * delivered it (§14 labels stay end-to-end). Edit graphs live in
 * contracts/editing-composition.ts.
 */

import type {
  AnswerRef,
  ContractVersion,
  ConversationGraphId,
  Timestamp,
} from "./refs.js";
import type { TranscriptRef } from "./studio-artifact-package.js";
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
