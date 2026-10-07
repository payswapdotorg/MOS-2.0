/**
 * Studio-owned interviewer agent binding port (STUDIO-004 seam to the REAL
 * `@mos/agent-runtime`).
 *
 * The interviewer is an AGENT INSTANCE (AGT-002): instantiate → bind →
 * release, with model selection happening exclusively behind the agent
 * runtime's single model boundary. This port is the studio-narrow surface of
 * that lifecycle:
 *
 * - {@link InterviewerAgentBindingPort.bindInterviewerAgent} instantiates the
 *   interviewer body version and requests a model binding THROUGH the
 *   boundary — the studio passes NO model preference and receives NO model
 *   identity back (see {@link ../contracts/interviewer-session.js!BoundInterviewerAgent});
 * - {@link InterviewerAgentBindingPort.releaseInterviewerAgent} releases the
 *   instance when the interview completes (terminal lifecycle state).
 *
 * The REAL adapter (runtime/interviewer/agent-instance-interviewer.ts)
 * implements this port over @mos/agent-runtime's AgentInstanceRegistry; the
 * executor's substrate binding is a disclosed in-memory double (testing/
 * real-interviewer-agent.ts) until the real Zcode AgentRuntime substrate
 * binding lands — documented as future work at the adapter.
 */

import type { TenantId, Timestamp } from "../contracts/refs.js";
import type {
  BoundInterviewerAgent,
  InterviewerAgentBodyInput,
  ReleasedInterviewerAgent,
} from "../contracts/interviewer-session.js";

/** Input of {@link InterviewerAgentBindingPort.bindInterviewerAgent}. */
export type InterviewerAgentBindingInput = InterviewerAgentBodyInput & {
  readonly tenantId: TenantId;
};

/** Failure modes of the interviewer agent lifecycle (typed, never thrown). */
export type InterviewerAgentBindingError =
  | { readonly kind: "agent-instantiation-failed"; readonly reason: string }
  | { readonly kind: "agent-binding-failed"; readonly reason: string }
  | { readonly kind: "agent-instance-unknown"; readonly instanceId: string; readonly reason: string }
  | { readonly kind: "agent-instance-release-failed"; readonly reason: string };

/** Result of a binding attempt. */
export type InterviewerAgentBindingResult =
  | { readonly ok: true; readonly agent: BoundInterviewerAgent; readonly boundAt: Timestamp }
  | { readonly ok: false; readonly error: InterviewerAgentBindingError };

/** Result of a release attempt. */
export type InterviewerAgentReleaseResult =
  | { readonly ok: true; readonly agent: ReleasedInterviewerAgent; readonly releasedAt: Timestamp }
  | { readonly ok: false; readonly error: InterviewerAgentBindingError };

/**
 * Narrow lifecycle port for interviewer agent instances. Two public methods.
 */
export interface InterviewerAgentBindingPort {
  /**
   * Instantiate + bind one interviewer agent instance for the tenant. Model
   * selection happens behind the agent runtime's single model boundary; the
   * studio neither requests nor learns which model was selected.
   */
  bindInterviewerAgent(input: InterviewerAgentBindingInput): Promise<InterviewerAgentBindingResult>;
  /** Release the instance (terminal; the interview is done with it). */
  releaseInterviewerAgent(input: {
    readonly tenantId: TenantId;
    readonly agent: BoundInterviewerAgent;
  }): Promise<InterviewerAgentReleaseResult>;
}
