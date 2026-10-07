/**
 * The adaptive interviewer session runtime (STUDIO-004, §14).
 *
 * One {@link InterviewerSession} binds ONE exact script-graph version
 * (STUDIO-003) to ONE interviewer: a REAL agent instance from
 * @mos/agent-runtime (bound through the single model boundary) presenting
 * the AdaptiveSequencerPort-selected questions through a declared
 * representation.
 *
 * The adaptive loop (§14): present question → record typed answer → the
 * sequencer selects the next node from the DECLARED branch edges → repeat
 * until the graph path is terminal. Beats are production markers: they are
 * walked over (via their declared `defaultNextNodeId`) without a
 * presentation; a declared cycle fails loudly (`graph-cycle-detected`).
 *
 * Provenance (§14, lock rule 20): every presentation carries the CURRENT
 * representation's provenance unchanged; switching the representation
 * mid-session (voice→text, ...) preserves the session identity, history and
 * agent binding — earlier presentations keep the representation that
 * delivered them, later ones carry the new label.
 *
 * Lifecycle: creating the session binds the interviewer agent instance;
 * `complete()` releases it (terminal agent-instance state). After completion
 * every method fails closed (`session-closed`).
 */

import type { InterviewerSessionId, TenantId, Timestamp } from "../../contracts/refs.js";
import type { ScriptGraph, ScriptGraphVersionRef } from "../../contracts/script-graph.js";
import type {
  BoundInterviewerAgent,
  CreateInterviewerSessionInput,
  InterviewerAnswerInput,
  InterviewerRepresentationSwitchEvent,
  InterviewerSessionError,
  InterviewerSessionOutcome,
  InterviewerSessionSummary,
  RecordedInterviewAnswer,
} from "../../contracts/interviewer-session.js";
import type { InterviewerRepresentation } from "../../contracts/interviewer.js";
import type { InterviewerQuestionPresentation } from "../../ports/interviewer-agent.js";
import type { InterviewerAgentPort } from "../../ports/interviewer-agent.js";
import type { InterviewerAgentBindingPort } from "../../ports/interviewer-agent-binding.js";
import type { AdaptiveSelectionError, AdaptiveSequencerPort } from "../../ports/adaptive-sequencer.js";
import type { ScriptGraphStore } from "../script-graph/script-graph-store.js";

/** Dependencies of {@link createInterviewerSession}. */
export interface InterviewerSessionDeps {
  /** The versioned script-graph store (exact-version resolution). */
  readonly store: ScriptGraphStore;
  /** The deterministic adaptive sequencer (§14 branch selection). */
  readonly sequencer: AdaptiveSequencerPort;
  /** The interviewer agent lifecycle binding (REAL agent runtime). */
  readonly agentBinding: InterviewerAgentBindingPort;
  /** The interviewer agent presenter (executes the bound instance). */
  readonly agent: InterviewerAgentPort;
  readonly clock: () => Timestamp;
  readonly nextSessionId: () => string;
}

const ORIGINS = new Set(["human-performed", "synthetic-generated", "mixed"]);

/** Validate one declared interviewer representation (§14 labeling rules). */
export function interviewerRepresentationIssues(
  representation: InterviewerRepresentation,
): readonly string[] {
  const issues: string[] = [];
  if (representation.representation === "hybrid") {
    if (representation.components.length < 2) {
      issues.push("hybrid representation must combine at least two components");
    }
    for (const component of representation.components) {
      issues.push(...interviewerRepresentationIssues(component).map((reason) => `component ${component.representation}: ${reason}`));
    }
    return issues;
  }
  const provenance = representation.provenance;
  if (provenance === undefined || !ORIGINS.has(provenance.origin)) {
    issues.push(`${representation.representation} representation must carry a provenance origin label (human-performed | synthetic-generated | mixed)`);
    return issues;
  }
  if (provenance.origin !== "human-performed" && provenance.generatorCapability === undefined) {
    issues.push(`synthetic/mixed (${representation.representation}) provenance must name its generatorCapability (§14/§30)`);
  }
  if (representation.representation === "prerecorded") {
    if (String(representation.sourceArtifact).trim().length === 0) {
      issues.push("prerecorded representation must reference its source artifact");
    }
    if (String(representation.rightsRef).trim().length === 0) {
      issues.push("prerecorded representation must carry an explicit rights ref (§27)");
    }
    if (representation.consentRefs.length === 0) {
      issues.push("prerecorded representation must carry consent refs for the performing human");
    }
    if (provenance.origin === "synthetic-generated") {
      issues.push("prerecorded representation is human-performed material — synthetic-generated origin is a contradiction");
    }
  }
  if (representation.representation === "generated") {
    if (representation.requiredCapabilities.length === 0) {
      issues.push("generated representation must declare its required generation capabilities");
    }
    if (provenance.origin !== "synthetic-generated") {
      issues.push("generated representation is synthetic by construction — origin must be synthetic-generated");
    }
  }
  return issues;
}

/** Internal mutable state of one live interviewer session. */
interface InterviewerSessionState {
  readonly sessionId: InterviewerSessionId;
  readonly tenantId: TenantId;
  readonly studioSessionId?: CreateInterviewerSessionInput["sessionId"];
  readonly graph: ScriptGraphVersionRef;
  representation: InterviewerRepresentation;
  agent: BoundInterviewerAgent;
  currentNodeId: string | null;
  terminal: boolean;
  closed: boolean;
  readonly presentations: InterviewerQuestionPresentation[];
  readonly answers: RecordedInterviewAnswer[];
  readonly representationSwitches: InterviewerRepresentationSwitchEvent[];
  readonly createdAt: Timestamp;
}

/** The adaptive interviewer session (5 public methods, policy ≤12). */
export class InterviewerSession {
  private readonly state: InterviewerSessionState;
  private readonly deps: InterviewerSessionDeps;

  constructor(state: InterviewerSessionState, deps: InterviewerSessionDeps) {
    this.state = state;
    this.deps = deps;
  }

  /** Present the current question/prompt through the interviewer agent. */
  async presentCurrentQuestion(): Promise<InterviewerSessionOutcome<InterviewerQuestionPresentation>> {
    if (this.state.closed) {
      return { ok: false, error: { kind: "session-closed" } };
    }
    if (this.state.terminal || this.state.currentNodeId === null) {
      return { ok: false, error: { kind: "interview-complete" } };
    }
    const walk = this.walkPastBeats();
    if (!walk.ok) {
      return walk;
    }
    if (this.state.terminal || this.state.currentNodeId === null) {
      return { ok: false, error: { kind: "interview-complete" } };
    }
    const node = this.currentNode();
    if (node === undefined || (node.kind !== "question" && node.kind !== "prompt")) {
      return { ok: false, error: { kind: "graph-has-no-presentable-entry", ref: this.state.graph } };
    }
    const text = node.text;
    const presented = await this.deps.agent.presentQuestion({
      tenantId: this.state.tenantId,
      sessionId: this.state.studioSessionId,
      graph: this.state.graph,
      question: { nodeId: node.nodeId, text },
      representation: this.state.representation,
      agent: this.state.agent,
    });
    if (!presented.ok) {
      return { ok: false, error: { kind: "agent-unavailable", reason: `${presented.error.kind}: ${"reason" in presented.error ? presented.error.reason : presented.error.kind}` } };
    }
    this.state.presentations.push(presented.presentation);
    return { ok: true, value: presented.presentation };
  }

  /** Record one typed answer and advance via the declared branch graph. */
  async recordAnswer(answer: InterviewerAnswerInput): Promise<InterviewerSessionOutcome<RecordedInterviewAnswer>> {
    if (this.state.closed) {
      return { ok: false, error: { kind: "session-closed" } };
    }
    if (this.state.terminal || this.state.currentNodeId === null) {
      return { ok: false, error: { kind: "interview-complete" } };
    }
    if (String(answer.answerRef).trim().length === 0) {
      return { ok: false, error: { kind: "answer-blank" } };
    }
    const questionNodeId = this.state.currentNodeId;
    const selection = await this.deps.sequencer.selectNextNode({
      graphId: this.state.graph.graphId,
      version: this.state.graph.version,
      currentNodeId: questionNodeId,
      answerRef: answer.answerRef,
    });
    if (!selection.ok) {
      const error: AdaptiveSelectionError = selection.error;
      return { ok: false, error: { kind: "sequencer-failed", error } };
    }
    const recorded: RecordedInterviewAnswer = Object.freeze({
      answerRef: answer.answerRef,
      answerText: answer.answerText,
      answeredBy: answer.answeredBy,
      answeredAt: this.deps.clock(),
      questionNodeId,
      nextNodeId: selection.nextNodeId,
    });
    this.state.answers.push(recorded);
    this.state.currentNodeId = selection.nextNodeId;
    this.state.terminal = selection.nextNodeId === null;
    return { ok: true, value: recorded };
  }

  /** Switch the interviewer representation mid-session (session + provenance preserved). */
  async switchRepresentation(
    representation: InterviewerRepresentation,
  ): Promise<InterviewerSessionOutcome<InterviewerRepresentationSwitchEvent>> {
    if (this.state.closed) {
      return { ok: false, error: { kind: "session-closed" } };
    }
    const issues = interviewerRepresentationIssues(representation);
    if (issues.length > 0) {
      return { ok: false, error: { kind: "representation-invalid", reasons: issues } };
    }
    const event: InterviewerRepresentationSwitchEvent = Object.freeze({
      from: this.state.representation.representation,
      to: representation.representation,
      at: this.deps.clock(),
    });
    this.state.representation = representation;
    this.state.representationSwitches.push(event);
    return { ok: true, value: event };
  }

  /** Complete the session (terminal or early wrap) and RELEASE the agent instance. */
  async complete(): Promise<InterviewerSessionOutcome<InterviewerSessionSummary>> {
    if (this.state.closed) {
      return { ok: false, error: { kind: "session-closed" } };
    }
    const released = await this.deps.agentBinding.releaseInterviewerAgent({
      tenantId: this.state.tenantId,
      agent: this.state.agent,
    });
    if (!released.ok) {
      return { ok: false, error: { kind: "agent-unavailable", reason: released.error.reason } };
    }
    this.state.closed = true;
    return { ok: true, value: this.getSummary() };
  }

  /** Frozen read-only summary (§30 observability). */
  getSummary(): InterviewerSessionSummary {
    return Object.freeze({
      sessionId: this.state.sessionId,
      tenantId: this.state.tenantId,
      studioSessionId: this.state.studioSessionId,
      graph: Object.freeze({ ...this.state.graph }),
      interviewer: Object.freeze({
        representation: this.state.representation,
        agent: Object.freeze({ ...this.state.agent }),
      }),
      currentNodeId: this.state.currentNodeId,
      terminal: this.state.terminal,
      closed: this.state.closed,
      presentations: Object.freeze([...this.state.presentations]),
      answers: Object.freeze([...this.state.answers]),
      representationSwitches: Object.freeze([...this.state.representationSwitches]),
      createdAt: this.state.createdAt,
    });
  }

  private currentNode(): ScriptGraph["nodes"][number] | undefined {
    const graph = this.deps.store.resolve(this.state.graph);
    return graph?.nodes.find((node) => node.nodeId === this.state.currentNodeId);
  }

  /**
   * Walk past beat nodes (production markers) via their declared fallback
   * successors. Bounded by the graph's node count so a DECLARED cycle fails
   * loudly instead of hanging.
   */
  private walkPastBeats(): InterviewerSessionOutcome<true> {
    const graph = this.deps.store.resolve(this.state.graph);
    if (graph === null) {
      return { ok: false, error: { kind: "graph-version-not-found", ref: this.state.graph } };
    }
    let guard = graph.nodes.length;
    while (this.state.currentNodeId !== null) {
      const node = graph.nodes.find((entry) => entry.nodeId === this.state.currentNodeId);
      if (node === undefined) {
        return { ok: false, error: { kind: "graph-has-no-presentable-entry", ref: this.state.graph } };
      }
      if (node.kind !== "beat") {
        return { ok: true, value: true };
      }
      if (guard-- <= 0) {
        return { ok: false, error: { kind: "graph-cycle-detected", nodeId: node.nodeId } };
      }
      this.state.currentNodeId = node.defaultNextNodeId ?? null;
      if (this.state.currentNodeId === null) {
        this.state.terminal = true;
      }
    }
    return { ok: true, value: true };
  }
}

/** Resolve the graph exactly, walking beats to the first presentable node. */
function resolveEntryPoint(
  store: ScriptGraphStore,
  ref: ScriptGraphVersionRef,
): { ok: true; graph: ScriptGraph } | { ok: false; error: InterviewerSessionError } {
  const graph = store.resolve(ref);
  if (graph === null) {
    if (store.versions(ref.graphId).length === 0) {
      return { ok: false, error: { kind: "graph-not-found", graphId: ref.graphId } };
    }
    return { ok: false, error: { kind: "graph-version-not-found", ref } };
  }
  let current: string | null = graph.entryNodeId;
  let guard = graph.nodes.length;
  while (current !== null) {
    const node = graph.nodes.find((entry) => entry.nodeId === current);
    if (node === undefined) {
      return { ok: false, error: { kind: "graph-has-no-presentable-entry", ref } };
    }
    if (node.kind !== "beat") {
      return { ok: true, graph };
    }
    if (guard-- <= 0) {
      return { ok: false, error: { kind: "graph-cycle-detected", nodeId: node.nodeId } };
    }
    current = node.defaultNextNodeId ?? null;
  }
  return { ok: false, error: { kind: "graph-has-no-presentable-entry", ref } };
}

/**
 * Create an interviewer session: validate the representation (§14 labels),
 * resolve the EXACT graph version, walk to the first presentable node and
 * BIND the interviewer agent instance through the REAL agent runtime
 * (model selection stays behind the single model boundary).
 */
export async function createInterviewerSession(
  input: CreateInterviewerSessionInput,
  deps: InterviewerSessionDeps,
): Promise<InterviewerSessionOutcome<InterviewerSession>> {
  const issues = interviewerRepresentationIssues(input.representation);
  if (issues.length > 0) {
    return { ok: false, error: { kind: "representation-invalid", reasons: issues } };
  }
  const entry = resolveEntryPoint(deps.store, input.graph);
  if (!entry.ok) {
    return { ok: false, error: entry.error };
  }
  const bound = await deps.agentBinding.bindInterviewerAgent({
    tenantId: input.tenantId,
    bodyId: input.agentBody.bodyId,
    bodyVersion: input.agentBody.bodyVersion,
  });
  if (!bound.ok) {
    return { ok: false, error: { kind: "agent-binding-failed", reason: `${bound.error.kind}: ${bound.error.reason}` } };
  }
  const state: InterviewerSessionState = {
    sessionId: deps.nextSessionId() as InterviewerSessionId,
    tenantId: input.tenantId,
    studioSessionId: input.sessionId,
    graph: { graphId: input.graph.graphId, version: input.graph.version },
    representation: input.representation,
    agent: bound.agent,
    currentNodeId: entry.graph.entryNodeId,
    terminal: false,
    closed: false,
    presentations: [],
    answers: [],
    representationSwitches: [],
    createdAt: deps.clock(),
  };
  const session = new InterviewerSession(state, deps);
  return { ok: true, value: session };
}
