/**
 * REAL @mos/agent-runtime binding for the studio interviewer
 * (STUDIO-004).
 *
 * Two adapters over the REAL agent stack:
 * - {@link createAgentInstanceInterviewerBinding} implements
 *   {@link InterviewerAgentBindingPort}: instantiate the interviewer body
 *   version and request a model binding THROUGH @mos/agent-runtime's single
 *   model boundary, then release the instance when the interview is done.
 *   The studio passes NO model preference and receives NO model identity —
 *   `bind(scope, instanceId)` is called with exactly two arguments and the
 *   returned handle carries only instance/body identity (pinned by
 *   no-model-selection.test.ts).
 * - {@link createAgentInstanceInterviewerAgent} implements
 *   {@link InterviewerAgentPort}: EXECUTES the bound agent instance through
 *   {@link InstanceExecutorPort} to deliver the selected question, carrying
 *   the representation's provenance forward unchanged (§14) plus an audit
 *   trace of the execution.
 *
 * SUBSTRATE DISCLOSURE: the executor handed in here is
 * @mos/agent-runtime's REAL `createSubstrateInstanceExecutor` bound (at the
 * composition seam, testing/real-interviewer-agent.ts) to the DISCLOSED
 * in-memory substrate double — the real Zcode AgentRuntime substrate binding
 * is future work (the W0-B substrate adapter is a disclosed skeleton). The
 * executor logic itself (fail-closed unbound checks, failure wrapping,
 * pass-through model forwarding) is real agent-runtime code; only the
 * runtime underneath is doubled.
 */

import { AgentRuntimeError } from "@mos/agent-runtime";
import type { AgentInstanceRegistry, InstanceExecutorPort } from "@mos/agent-runtime";

import type { Timestamp } from "../../contracts/refs.js";
import type { BoundInterviewerAgent } from "../../contracts/interviewer-session.js";
import type {
  InterviewerAgentBindingInput,
  InterviewerAgentBindingPort,
  InterviewerAgentBindingResult,
  InterviewerAgentReleaseResult,
} from "../../ports/interviewer-agent-binding.js";
import type {
  InterviewerAgentPort,
  InterviewerQuestionPresentation,
  InterviewerQuestionPresentationInput,
  InterviewerQuestionPresentationResult,
} from "../../ports/interviewer-agent.js";
import { derivePresentationProvenance } from "../../ports/interviewer-agent.js";

/** Options for {@link createAgentInstanceInterviewerBinding}. */
export interface AgentInstanceInterviewerBindingOptions {
  /** The REAL agent-instance lifecycle registry (constructed with the single model boundary inside). */
  readonly agentInstances: AgentInstanceRegistry;
  /** Injectable clock for binding/release stamps (deterministic tests). */
  readonly now?: () => Timestamp;
}

/** Options for {@link createAgentInstanceInterviewerAgent}. */
export interface AgentInstanceInterviewerAgentOptions {
  /** The REAL agent-instance lifecycle registry (instance lookup + state checks). */
  readonly agentInstances: AgentInstanceRegistry;
  /** The REAL instance executor (substrate binding disclosed above). */
  readonly executor: InstanceExecutorPort;
  /** Injectable clock for presentation stamps (deterministic tests). */
  readonly now?: () => Timestamp;
}

function describeAgentRuntimeError(error: unknown): string {
  if (error instanceof AgentRuntimeError) {
    return `${error.code}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * The presentation request handed to the agent instance — the body's declared
 * input contract (purpose, exact graph version, the selected question, the
 * representation kind). The agent renders THIS question; selection stays with
 * the AdaptiveSequencerPort.
 */
type PresentationRequest = {
  readonly purpose: string;
  readonly graphId: string;
  readonly graphVersion: number;
  readonly questionNodeId: string;
  readonly questionText: string;
  readonly representationKind: string;
};

function presentationExecutionInput(
  input: InterviewerQuestionPresentationInput,
): PresentationRequest {
  return {
    purpose: "present-question",
    graphId: String(input.graph.graphId),
    graphVersion: input.graph.version as number,
    questionNodeId: input.question.nodeId,
    questionText: input.question.text,
    representationKind: input.representation.representation,
  };
}

/** Studio-side handle built from a registry record (no model identity). */
function handleOf(record: {
  readonly instanceId: string;
  readonly bodyId: string;
  readonly bodyVersion: number;
  readonly lifecycle: string;
}): BoundInterviewerAgent | undefined {
  if (record.lifecycle !== "bound") {
    return undefined;
  }
  return {
    instanceId: String(record.instanceId),
    bodyId: String(record.bodyId),
    bodyVersion: record.bodyVersion as BoundInterviewerAgent["bodyVersion"],
    lifecycle: "bound",
  };
}

/**
 * Creates the {@link InterviewerAgentBindingPort} over the REAL
 * @mos/agent-runtime instance registry. Model selection happens inside the
 * registry's single model boundary; this adapter never expresses a model
 * preference.
 */
export function createAgentInstanceInterviewerBinding(
  options: AgentInstanceInterviewerBindingOptions,
): InterviewerAgentBindingPort {
  const now = options.now ?? (() => new Date().toISOString() as Timestamp);
  const { agentInstances } = options;

  const binding: InterviewerAgentBindingPort = {
    async bindInterviewerAgent(input: InterviewerAgentBindingInput): Promise<InterviewerAgentBindingResult> {
      const scope = { tenantId: input.tenantId };
      let phase: "instantiate" | "bind" = "instantiate";
      try {
        const instantiated = agentInstances.instantiate(scope, {
          bodyId: input.bodyId as never,
          bodyVersion: input.bodyVersion,
        });
        phase = "bind";
        // Two arguments ONLY: the studio never expresses a model preference —
        // the boundary decides and keeps the record.
        const bound = agentInstances.bind(scope, instantiated.instanceId);
        const handle = handleOf(bound);
        if (handle === undefined) {
          return {
            ok: false,
            error: {
              kind: "agent-binding-failed",
              reason: `instance ${String(instantiated.instanceId)} is not bound after the binding call`,
            },
          };
        }
        return { ok: true, agent: handle, boundAt: now() };
      } catch (error) {
        return {
          ok: false,
          error: {
            kind: phase === "instantiate" ? "agent-instantiation-failed" : "agent-binding-failed",
            reason: describeAgentRuntimeError(error),
          },
        };
      }
    },

    async releaseInterviewerAgent(input): Promise<InterviewerAgentReleaseResult> {
      const scope = { tenantId: input.tenantId };
      try {
        agentInstances.release(scope, input.agent.instanceId as never);
      } catch (error) {
        return {
          ok: false,
          error: { kind: "agent-instance-release-failed", reason: describeAgentRuntimeError(error) },
        };
      }
      return {
        ok: true,
        agent: {
          instanceId: input.agent.instanceId,
          bodyId: input.agent.bodyId,
          bodyVersion: input.agent.bodyVersion,
          lifecycle: "released" as const,
        },
        releasedAt: now(),
      };
    },
  };
  return binding;
}

/**
 * Creates the {@link InterviewerAgentPort} that presents questions by
 * EXECUTING the bound interviewer agent instance through the REAL
 * InstanceExecutorPort. The presentation carries the representation's
 * provenance forward unchanged plus the execution audit trace.
 */
export function createAgentInstanceInterviewerAgent(
  options: AgentInstanceInterviewerAgentOptions,
): InterviewerAgentPort {
  const now = options.now ?? (() => new Date().toISOString() as Timestamp);
  const { agentInstances, executor } = options;

  return {
    async presentQuestion(
      input: InterviewerQuestionPresentationInput,
    ): Promise<InterviewerQuestionPresentationResult> {
      if (input.question.text.trim().length === 0) {
        return { ok: false, error: { kind: "question-blank" } };
      }
      const provenance = derivePresentationProvenance(input.representation);
      if (provenance === undefined) {
        return { ok: false, error: { kind: "representation-provenance-missing" } };
      }
      if (input.agent === undefined) {
        return {
          ok: false,
          error: { kind: "agent-unavailable", reason: "no bound interviewer agent instance was supplied" },
        };
      }
      const scope = { tenantId: input.tenantId };
      const record = agentInstances.get(scope, input.agent.instanceId as never);
      if (record === undefined || record.lifecycle !== "bound") {
        return {
          ok: false,
          error: {
            kind: "agent-unavailable",
            reason: `interviewer agent instance ${input.agent.instanceId} is unknown or not bound`,
          },
        };
      }
      if (
        String(record.bodyId) !== input.agent.bodyId ||
        (record.bodyVersion as number) !== (input.agent.bodyVersion as number)
      ) {
        return {
          ok: false,
          error: { kind: "agent-unavailable", reason: "the supplied agent handle does not match the instance record" },
        };
      }
      let outcome;
      try {
        outcome = await executor.execute(record, presentationExecutionInput(input));
      } catch (error) {
        return { ok: false, error: { kind: "agent-unavailable", reason: describeAgentRuntimeError(error) } };
      }
      if (outcome.finishReason !== "completed") {
        return {
          ok: false,
          error: {
            kind: "agent-unavailable",
            reason: `interviewer agent execution finished "${outcome.finishReason}" instead of completing`,
          },
        };
      }
      const presentation: InterviewerQuestionPresentation = Object.freeze({
        questionNodeId: input.question.nodeId,
        questionText: input.question.text,
        representationKind: input.representation.representation,
        provenance,
        agentExecution: Object.freeze({
          instanceId: String(outcome.instanceId),
          bodyId: input.agent.bodyId,
          bodyVersion: input.agent.bodyVersion,
          finishReason: outcome.finishReason,
          output: outcome.output,
          usage: Object.freeze({ ...outcome.usage }),
        }),
        presentedAt: now(),
      });
      return { ok: true, presentation };
    },
  };
}
