/**
 * REAL interviewer agent stack composed at the studio testing seam
 * (STUDIO-004).
 *
 * Composes the REAL agent packages:
 * - `@mos/agents` in-memory AgentBodyRegistry with the studio's interviewer
 *   AgentBody registered (runtime/interviewer/interviewer-agent-body.ts);
 * - `@mos/agent-runtime` in-memory AgentInstanceRegistry constructed with
 *   THE single model boundary (ModelRuntimePort) — the catalog + default
 *   model configured HERE, at the composition root, exactly where worker B's
 *   design places model catalog configuration. The studio-side adapters
 *   (runtime/interviewer/agent-instance-interviewer.ts) never see it;
 * - the REAL substrate instance executor over @mos/agent-runtime's
 *   DISCLOSED in-memory substrate double (the only doubled part — see the
 *   adapter's substrate disclosure).
 *
 * RUNTIME IMPORT NOTE: `@mos/agents` and `@mos/agent-runtime` export their
 * runtime entrypoints from built `dist/index.js` (unlike `@mos/identity` /
 * `@mos/rights`, whose exports maps point the runtime condition at
 * untranspiled source — those two keep the W2-C relative-dist imports).
 * Bare specifiers therefore work at runtime once the workspace is built;
 * the studio's project references guarantee the build order. No relative
 * path fallback is needed.
 *
 * NOT a production composition root — production binds durable registries,
 * the real capability source and the real substrate at the TL integration
 * point, through the same studio-owned ports.
 */

import { createInMemoryAgentBodyRegistry } from "@mos/agents";
import type { AgentBodyRegistryPort } from "@mos/agents";
import {
  createInMemoryAgentInstanceRegistry,
  createInMemoryModelRuntime,
  createSubstrateInstanceExecutor,
  createInMemoryAgentRuntimeSubstrateDouble,
} from "@mos/agent-runtime";
import type { ModelRef } from "@mos/contracts";
import type {
  AgentInstanceRegistry,
  InMemoryAgentRuntimeSubstrateDouble,
  InstanceExecutorPort,
  ModelRuntimePort,
} from "@mos/agent-runtime";

import { INTERVIEWER_AGENT_BODY } from "../runtime/interviewer/interviewer-agent-body.js";
import {
  createAgentInstanceInterviewerAgent,
  createAgentInstanceInterviewerBinding,
} from "../runtime/interviewer/agent-instance-interviewer.js";
import type { InterviewerAgentPort } from "../ports/interviewer-agent.js";
import type { InterviewerAgentBindingPort } from "../ports/interviewer-agent-binding.js";
import type { Timestamp } from "../contracts/refs.js";

/** Options for {@link composeRealInterviewerAgentStack}. */
export interface RealInterviewerAgentStackOptions {
  /** Injectable clock (deterministic tests: bindings, presentations, events). */
  readonly now?: () => Timestamp;
}

/** The composed REAL interviewer agent stack (plus inspection handles). */
export interface RealInterviewerAgentStack {
  /** The REAL @mos/agents body registry (interviewer body registered). */
  readonly bodyRegistry: AgentBodyRegistryPort;
  /** The REAL model boundary (catalog configured here, at the composition root). */
  readonly modelRuntime: ModelRuntimePort;
  /** The REAL agent-instance lifecycle registry. */
  readonly agentInstances: AgentInstanceRegistry;
  /** The REAL instance executor over the disclosed in-memory substrate double. */
  readonly executor: InstanceExecutorPort;
  /** Studio REAL adapter: interviewer agent lifecycle binding. */
  readonly agentBinding: InterviewerAgentBindingPort;
  /** Studio REAL adapter: question presentation through agent execution. */
  readonly agent: InterviewerAgentPort;
  /** The disclosed substrate double (inspection: started specs, runtimes). */
  readonly substrate: InMemoryAgentRuntimeSubstrateDouble;
}

/** The composed test catalog's default interviewer model. */
export const TEST_INTERVIEWER_DEFAULT_MODEL = "mos-model:interviewer-default" as ModelRef;

/**
 * Compose the REAL interviewer agent stack for contract tests: real body
 * registry + real instance registry over the single model boundary + the
 * real substrate executor over the disclosed in-memory substrate double.
 */
export function composeRealInterviewerAgentStack(
  options: RealInterviewerAgentStackOptions = {},
): RealInterviewerAgentStack {
  const now = options.now ?? (() => new Date().toISOString() as Timestamp);
  const bodyRegistry = createInMemoryAgentBodyRegistry({ initial: [INTERVIEWER_AGENT_BODY] });
  // The composition root owns the model catalog — the studio adapters
  // carry no model-selection surface (pinned by
  // runtime/interviewer/no-model-selection.test.ts).
  const modelRuntime: ModelRuntimePort = createInMemoryModelRuntime({
    models: [
      {
        modelRef: TEST_INTERVIEWER_DEFAULT_MODEL,
        runtimeRef: "mos-runtime:in-memory-agent" as never,
        description: "Composition-seam interviewer model (disclosed test catalog)",
      },
    ],
    defaultModelRef: TEST_INTERVIEWER_DEFAULT_MODEL,
    now,
  });
  const agentInstances = createInMemoryAgentInstanceRegistry({
    bodyRegistry,
    modelRuntime,
    instanceIdPrefix: "studio-interviewer-instance",
  });
  const substrate = createInMemoryAgentRuntimeSubstrateDouble({
    now,
    // Deterministic rendered delivery of the question the executor hands in.
    respondWith: (input) => {
      const question =
        typeof input === "object" && input !== null && "questionText" in input
          ? String((input as { questionText: unknown }).questionText)
          : String(input);
      return `interviewer-delivery: ${question}`;
    },
  });
  const executor = createSubstrateInstanceExecutor(substrate.port);
  return {
    bodyRegistry,
    modelRuntime,
    agentInstances,
    executor,
    agentBinding: createAgentInstanceInterviewerBinding({ agentInstances, now }),
    agent: createAgentInstanceInterviewerAgent({ agentInstances, executor, now }),
    substrate,
  };
}
