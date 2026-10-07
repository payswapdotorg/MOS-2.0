/**
 * Conversation-graph builder (STUDIO-011).
 *
 * Derives the podcast conversation graph from the ADAPTIVE INTERVIEW loop
 * (STUDIO-004): one question node per interviewer presentation (carrying the
 * representation provenance that delivered it — §14 labels stay end-to-end)
 * and one answer node per recorded answer, with edges question→answer and
 * answer→next-question following the recorded adaptive path.
 *
 * Deterministic pure function of the interview history — no engine, no
 * guessing. The graph is versioned by the caller (the podcast flow assigns
 * the version alongside the artifact package).
 */

import type {
  ConversationGraphEdge,
  ConversationGraphNode,
  PodcastConversationGraph,
} from "../../contracts/podcast-graphs.js";
import type { ConversationGraphId, ContractVersion, Timestamp } from "../../contracts/refs.js";
import type { TranscriptRef } from "../../contracts/studio-artifact-package.js";
import type { InterviewerSessionSummary } from "../../contracts/interviewer-session.js";

/** Input of {@link buildConversationGraph}. */
export interface BuildConversationGraphInput {
  readonly interview: InterviewerSessionSummary;
  /** Transcript refs the conversation graph is derived from (§6 derivation). */
  readonly derivedFrom: readonly TranscriptRef[];
  readonly graphId: ConversationGraphId;
  readonly version: ContractVersion;
  readonly builtAt: Timestamp;
}

/** Question node id convention: `q-<presentationIndex>`. */
export const questionNodeId = (presentationIndex: number): string => `q-${presentationIndex}`;

/** Answer node id convention: `a-<answerIndex>`. */
export const answerNodeId = (answerIndex: number): string => `a-${answerIndex}`;

/** Match recorded answers to the presentation they responded to. */
function presentationIndexOf(
  interview: InterviewerSessionSummary,
  questionNodeIdInGraph: string,
): number {
  const scriptNodeId = interview.presentations[Number(questionNodeIdInGraph.slice(2))]?.questionNodeId;
  const answerIndex = interview.answers.findIndex((a) => a.questionNodeId === scriptNodeId);
  return answerIndex;
}

/**
 * Build the conversation graph from an interviewer session summary.
 * Deterministic: nodes follow the presentation/answer order; every question
 * node carries its interviewer provenance and (when present) the agent
 * execution trace; `containsSyntheticInterviewerMaterial` is true when any
 * presentation's provenance is not fully human-performed.
 */
export function buildConversationGraph(
  input: BuildConversationGraphInput,
): PodcastConversationGraph {
  const { interview } = input;
  const nodes: ConversationGraphNode[] = [];
  const edges: ConversationGraphEdge[] = [];
  interview.presentations.forEach((presentation, index) => {
    const id = questionNodeId(index);
    nodes.push(
      Object.freeze({
        nodeId: id,
        kind: "question" as const,
        scriptGraphNodeId: presentation.questionNodeId,
        questionText: presentation.questionText,
        representationKind: presentation.representationKind,
        interviewerProvenance: presentation.provenance,
        agentExecution: presentation.agentExecution,
        at: presentation.presentedAt,
      }),
    );
  });
  interview.answers.forEach((answer, index) => {
    const id = answerNodeId(index);
    nodes.push(
      Object.freeze({
        nodeId: id,
        kind: "answer" as const,
        respondsToNodeId: (() => {
          const presentationIndex = interview.presentations.findIndex(
            (p) => p.questionNodeId === answer.questionNodeId,
          );
          return questionNodeId(presentationIndex === -1 ? 0 : presentationIndex);
        })(),
        answerRef: answer.answerRef,
        answerText: answer.answerText,
        answeredBy: String(answer.answeredBy),
        at: answer.answeredAt,
      }),
    );
    // answer → the question the sequencer selected next (when one exists).
    if (answer.nextNodeId !== null) {
      const nextPresentationIndex = interview.presentations.findIndex(
        (p) => p.questionNodeId === answer.nextNodeId,
      );
      if (nextPresentationIndex !== -1) {
        edges.push(
          Object.freeze({
            edgeId: `e-${id}-next`,
            fromNodeId: id,
            toNodeId: questionNodeId(nextPresentationIndex),
          }),
        );
      }
    }
  });
  // question → the answer that responded to it.
  interview.presentations.forEach((presentation, index) => {
    const id = questionNodeId(index);
    const answerIndex = presentationIndexOf(interview, id);
    if (answerIndex !== -1) {
      edges.push(
        Object.freeze({
          edgeId: `e-${id}-answer`,
          fromNodeId: id,
          toNodeId: answerNodeId(answerIndex),
        }),
      );
    }
  });
  const containsSyntheticInterviewerMaterial = interview.presentations.some(
    (p) => p.provenance.origin !== "human-performed",
  );
  return Object.freeze({
    graphId: input.graphId,
    version: input.version,
    interviewSessionId: String(interview.sessionId),
    scriptGraph: Object.freeze({
      graphId: String(interview.graph.graphId),
      version: interview.graph.version,
    }),
    nodes: Object.freeze(nodes),
    edges: Object.freeze(edges),
    derivedFrom: Object.freeze([...input.derivedFrom]),
    containsSyntheticInterviewerMaterial,
    builtAt: input.builtAt,
  });
}
