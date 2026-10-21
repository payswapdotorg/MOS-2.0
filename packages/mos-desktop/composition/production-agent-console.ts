import type { AgentConsolePort, ConsoleIntentsPort } from '@mos/web';
import type { TenantScope } from '@mos/contracts';
import type { MissionRepository } from '@mos/missions';
import type { MarketingBenchmarkPort } from '@mos/lab';
import type { RightsRepository } from '../../mos-rights/dist/index.js';
import type { ProductIntelligencePort } from '../../mos-product-intelligence/dist/index.js';
import { createInMemoryRightsRepository } from '../../mos-rights/dist/index.js';
import { createInMemoryProductIntelligence } from '../../mos-product-intelligence/dist/index.js';
import { createInMemoryMarketingPlanner, AutomationEngine, StrategyCompiler } from '../../mos-missions/dist/index.js';
import { createInMemoryCapabilityRegistry } from '../../mos-capabilities/dist/index.js';
import { createInMemoryAgentBodyRegistry, createInMemoryOrganizationRegistry } from '../../mos-agents/dist/index.js';
import type { AgentBody } from '@mos/contracts';
import {
  createConsoleIntentLedger,
  type ConsoleBindingState,
} from './production-agent-console-core.js';
import {
  createConsoleExperimentsRuntime,
  createExperimentIntentMethods,
} from './production-agent-console-experiments.js';
import {
  createComposePlanIntentMethods,
  createGrantRightsIntentMethods,
  createRecordIntelligenceIntentMethods,
} from './production-agent-console-intents.js';
import { createRunIntentMethods } from './production-agent-console-run-intents.js';
import { createProductionAgentConsoleReads } from './production-agent-console-reads.js';
import {
  createConsoleAgentsValidation,
  createConsoleClock,
  createConsoleIntelligenceCitations,
  createConsoleRightsGate,
} from './production-agent-console-authorities.js';
import { createPlanAuthorityBridge, createPlanLinkageLedger } from './production-agent-console-plan-bridge.js';

/**
 * The PRODUCTION Agent Console binding (the CONSOLE wave) — the REAL
 * authority chain behind the shell's console view ports:
 *
 *   @mos/rights repository (the SHARED §27 gate) +
 *   @mos/product-intelligence authority (§25, rights-gated fail-closed) +
 *   @mos/missions MARKETING-001 planner + PROD-003 compiler + PROD-004
 *   engine + the @mos/experiments BRIDGE-003 authority stack (its own
 *   policy/rights/lab-candidate/distribution/jobs seams wired by
 *   production-agent-console-experiments.ts) + the @mos/agents AGT-001/003
 *   registries (the composition-registered standard body catalog — a
 *   disclosed composition decision: capability CONTRACTS, not business
 *   data; the same class as the device-local tenant registration).
 *
 * Every declared intent executes against the REAL runtime and every
 * verdict is relayed VERBATIM; every read model projects what the
 * authorities actually hold. PERSISTENCE DISCLOSURE: the in-memory REAL
 * adapters are per-load in-process state — durable persistence is the P2
 * service transport (the wave-21 disclosed limitation, same class).
 */

/** The console's standard body catalog (registered through the REAL AGT-001 API). */
const CONSOLE_BODY_CATALOG: readonly {
  readonly bodyId: string;
  readonly roleSummary: string;
  readonly duties: readonly string[];
  readonly capabilityId: string;
}[] = [
  {
    bodyId: 'body-console-controller',
    roleSummary: 'Orchestrates the mission plan: sequences phases, delegates and gates.',
    duties: ['Sequence the compiled phases', 'Delegate work and collect verdicts'],
    capabilityId: 'orchestrate_marketing_work',
  },
  {
    bodyId: 'body-console-producer',
    roleSummary: 'Produces the marketing artifacts each execution phase declares.',
    duties: ['Produce phase artifacts', 'Attach provenance to every output'],
    capabilityId: 'produce_marketing_content',
  },
  {
    bodyId: 'body-console-critic',
    roleSummary: 'Reviews produced artifacts against the plan criteria.',
    duties: ['Review phase outputs', 'Return review verdicts with reasons'],
    capabilityId: 'review_marketing_output',
  },
  {
    bodyId: 'body-console-analyst',
    roleSummary: 'Analyzes evidence and measurement records for the mission.',
    duties: ['Analyze cited evidence', 'Derive measurement reads'],
    capabilityId: 'analyze_marketing_evidence',
  },
  {
    bodyId: 'body-console-generalist',
    roleSummary: 'Generalist fallback role for generalist-baseline organizations.',
    duties: ['Execute delegated generalist tasks'],
    capabilityId: 'generalist_marketing_support',
  },
];

/** The composition's own capability records (honest provenance, minimal contracts). */
function consoleCapabilityOf(entry: (typeof CONSOLE_BODY_CATALOG)[number]) {
  return {
    id: entry.capabilityId as never,
    version: 1 as never,
    inputSchema: { type: 'object' } as never,
    outputSchema: { type: 'object' } as never,
    evaluator: `evaluator:console-composition:${entry.capabilityId}@1` as never,
    costModel: { basis: 'per-invocation', amount: 0.01, currency: 'USD' } as never,
    latencyModel: { p50Ms: 100, p95Ms: 200, p99Ms: 400 } as never,
    provenance: `provenance:console-composition:${entry.capabilityId}@1` as never,
  };
}

/** The composition's own agent-body records (registered through the REAL API). */
function consoleBodyOf(entry: (typeof CONSOLE_BODY_CATALOG)[number]): AgentBody {
  return {
    id: entry.bodyId as never,
    version: 1 as never,
    roleContract: {
      summary: entry.roleSummary,
      duties: [...entry.duties],
    } as never,
    inputContract: { type: 'object' } as never,
    outputContract: { type: 'object' } as never,
    tools: [`tool:console:${entry.capabilityId}`] as never,
    permissions: ['permission:console-operator'] as never,
    memory: { scope: 'session' } as never,
    communication: { mayInitiate: false, allowedTopics: ['mission-work'] } as never,
    actionInterface: { actions: [entry.capabilityId] } as never,
    capabilities: [entry.capabilityId as never],
    budget: { maxCost: { amount: 10, currency: 'USD' }, maxDurationMs: 3_600_000 } as never,
    latency: { p50Ms: 100, p95Ms: 200, p99Ms: 300 } as never,
    evaluator: `evaluator:console-composition:${entry.capabilityId}@1` as never,
    safety: { prohibitions: ['fake-engagement', 'deceptive-attribution'] } as never,
  };
}

/** Options for {@link createProductionAgentConsole}. */
export interface ProductionAgentConsoleOptions {
  /** The composition's tenant scope (§31 — every intent's + read's scope). */
  readonly scope: TenantScope;
  /** Injectable clock (deterministic tests). */
  readonly now?: () => string;
  /** The REAL missions repository the composition already holds. */
  readonly missionRepository: MissionRepository;
  /** The REAL LAB-017 benchmark port (the experiments lab-candidate seam). */
  readonly labBenchmark: MarketingBenchmarkPort;
}

/** The composed console ports plus the seams tests and hosts inspect. */
export interface ProductionAgentConsole {
  readonly agentConsole: AgentConsolePort;
  readonly consoleIntents: ConsoleIntentsPort;
  /** The REAL runtimes the binding runs over (disclosed observability). */
  readonly state: ConsoleBindingState;
}

/** Compose the PRODUCTION Agent Console over the REAL authority chain. */
export function createProductionAgentConsole(
  options: ProductionAgentConsoleOptions,
): ProductionAgentConsole {
  const now = options.now ?? (() => new Date().toISOString());
  const scope = options.scope;

  // — the SHARED REAL rights repository (the §27 gate + §25 recording gate) —
  const rightsRepository: RightsRepository = createInMemoryRightsRepository({ now });

  // — the REAL §25 product-intelligence authority over the same gate —
  const productIntelligence: ProductIntelligencePort = createInMemoryProductIntelligence({
    rights: rightsRepository,
    now: now as unknown as () => never,
  });

  // — the REAL MARKETING-001 planner (missions + intelligence + an honest
  //   EMPTY health listing — the composition binds no distribution health
  //   read models yet (P2); no recorded observations is the honest truth) —
  const marketingPlanner = createInMemoryMarketingPlanner({
    missions: options.missionRepository,
    productIntelligence,
    health: {
      listHealthObservations() {
        return [];
      },
    } as never,
    now: now as unknown as () => never,
  });

  // — the REAL BRIDGE-003 experiments authority stack —
  const experimentsRuntime = createConsoleExperimentsRuntime({
    scope,
    now,
    missions: options.missionRepository,
    labBenchmark: options.labBenchmark,
    rightsRepository,
  });

  // — the REAL AGT-001/003 registries + the composition's standard catalog —
  const capabilityRegistry = createInMemoryCapabilityRegistry();
  for (const entry of CONSOLE_BODY_CATALOG) {
    capabilityRegistry.register(consoleCapabilityOf(entry));
  }
  const agentBodyRegistry = createInMemoryAgentBodyRegistry({
    capabilitySource: capabilityRegistry,
  });
  for (const entry of CONSOLE_BODY_CATALOG) {
    agentBodyRegistry.register(consoleBodyOf(entry));
  }
  const organizationRegistry = createInMemoryOrganizationRegistry({ bodyRegistry: agentBodyRegistry });

  // — the compile-time authority ports over the REAL repositories —
  const rightsGate = createConsoleRightsGate({ rightsRepository, now });
  const intelligenceCitations = createConsoleIntelligenceCitations({ productIntelligence });
  const agentsValidation = createConsoleAgentsValidation({ organizationRegistry });
  const clock = createConsoleClock({ now });

  // — the DECLARED plan-linkage ledger + the plan-authority bridge (D7) —
  const planLinkage = createPlanLinkageLedger();
  const plans = createPlanAuthorityBridge({
    scope,
    planner: marketingPlanner,
    missions: options.missionRepository,
    linkage: planLinkage,
  });

  // — the REAL PROD-003 compiler + PROD-004 engine —
  const strategyCompiler = new StrategyCompiler({
    rights: rightsGate,
    plans,
    intelligence: intelligenceCitations,
    experiments: experimentsRuntime.readPort,
    agents: agentsValidation,
    clock,
  });
  const automationEngine = new AutomationEngine({
    rights: rightsGate,
    experimentsRead: experimentsRuntime.readPort,
    clock,
  });

  // — the shared console binding state —
  const state: ConsoleBindingState = {
    scope,
    now,
    ledger: createConsoleIntentLedger({ scope, now }),
    missionRepository: options.missionRepository,
    labBenchmark: options.labBenchmark,
    rightsRepository,
    productIntelligence,
    marketingPlanner,
    experimentsRuntime,
    experimentAnnotations: new Map(),
    jobsQueue: experimentsRuntime.jobsQueue,
    agentBodyRegistry,
    organizationRegistry,
    strategyCompiler,
    automationEngine,
    planLinkage,
    strategies: new Map(),
    runs: new Map(),
  };

  // — the write-intent transport (all seven paths over the REAL runtimes) —
  const consoleIntents: ConsoleIntentsPort = {
    ...createExperimentIntentMethods(state),
    ...createGrantRightsIntentMethods(state),
    ...createRecordIntelligenceIntentMethods(state),
    ...createComposePlanIntentMethods(state),
    ...createRunIntentMethods(state),
    async loadConsoleIntentLedgerRecord(intentId, ledgerScope) {
      return state.ledger.load(intentId, ledgerScope);
    },
  };

  const agentConsole = createProductionAgentConsoleReads(
    state,
    CONSOLE_BODY_CATALOG.map((entry) => entry.bodyId),
  );

  return { agentConsole, consoleIntents, state };
}
