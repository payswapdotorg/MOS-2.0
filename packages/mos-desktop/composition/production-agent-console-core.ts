import type { TenantScope } from '@mos/contracts';
import type {
  ConsoleIntentActionId,
  ConsoleIntentAuthorityId,
  ConsoleIntentFailure,
  ConsoleIntentLedgerRecord,
  ConsoleIntentReceipt,
  ConsoleIntentResult,
} from '@mos/web';
import type {
  AutomationEngine,
  AutomationRunState,
  CompiledStrategy,
  MarketingPlannerPort,
  MissionRepository,
  StrategyCompiler,
} from '@mos/missions';
import type { MarketingBenchmarkPort } from '@mos/lab';
import type { RightsRepository } from '../../mos-rights/dist/index.js';
import type { ProductIntelligencePort } from '../../mos-product-intelligence/dist/index.js';
import type { JobQueuePort } from '../../mos-jobs/dist/index.js';
import type {
  AgentBodyRegistryPort,
  OrganizationRegistryPort,
} from '../../mos-agents/dist/index.js';
import type { ConsoleIntentIdentity } from './production-agent-console-parse.js';
import type { PlanLinkageLedger } from './production-agent-console-plan-bridge.js';
import type { ConsoleExperimentsRuntime } from './production-agent-console-experiments.js';

/**
 * Ledger core for the PRODUCTION Agent-Console binding (the CONSOLE wave,
 * Worker C) — the intent identity allocation, the sequential-id ledger and
 * the receipt/failure builders shared by every declare-method group
 * (production-agent-console-experiments.ts / -intents.ts /
 * -run-intents.ts, assembled by production-agent-console.ts).
 *
 * DISCIPLINE (spec §31 + the port's ledger contract — the wave-21
 * lab-intents-core.ts pattern exactly): EVERY declaration — executed,
 * authority-rejected, or shell-side parse-failed — is recorded with its
 * verdict under the composition's scope; reads are tenant-scoped so
 * another tenant's intent id resolves to `null` (no existence leak).
 * Intent ids are sequential and composition-local (`console-intent-1`…),
 * mirroring the testing double's ledger exactly.
 *
 * PERSISTENCE DISCLOSURE: the intent ledger (like every in-memory REAL
 * adapter behind this binding) is per-load in-process state — durable
 * persistence is the P2 service transport (the wave-21 disclosed
 * limitation, same class).
 */

/** The console authority each action routes to (receipt provenance). */
export const CONSOLE_AUTHORITY_BY_ACTION: Readonly<
  Record<ConsoleIntentActionId, ConsoleIntentAuthorityId>
> = {
  'create-experiment': 'experiments-authority',
  'grant-analysis-rights': 'rights-authority',
  'record-intelligence': 'product-intelligence-authority',
  'compose-plan': 'marketing-planner-authority',
  'compile-strategy': 'strategy-compiler-authority',
  'create-run': 'automation-engine-authority',
  'arm-run': 'automation-engine-authority',
};

interface RecordedIntent {
  readonly intentId: string;
  readonly scope: TenantScope;
  readonly declaredAt: string;
  readonly result: ConsoleIntentResult;
}

/** A runtime `{error, message}` verdict shape (the MOS domain convention). */
export interface RuntimeVerdict {
  readonly error: string;
  readonly message: string;
}

/** The ledger operations the declare-method groups share. */
export interface ConsoleIntentLedger {
  /** Allocate one declaration's identity (sequential id + routing). */
  nextIdentity(action: ConsoleIntentActionId): ConsoleIntentIdentity;
  /** Ledger-record one declaration's verdict and return it. */
  record(identity: ConsoleIntentIdentity, result: ConsoleIntentResult): ConsoleIntentResult;
  /** Tenant-scoped ledger read (cross-tenant ids resolve to `null`). */
  load(intentId: string, scope: TenantScope): ConsoleIntentLedgerRecord | null;
}

/** Build the composition-local intent ledger. */
export function createConsoleIntentLedger(options: {
  readonly scope: TenantScope;
  readonly now: () => string;
}): ConsoleIntentLedger {
  const scope = options.scope;
  const now = options.now;
  const ledger = new Map<string, RecordedIntent>();
  let sequence = 0;

  return {
    nextIdentity(action: ConsoleIntentActionId): ConsoleIntentIdentity {
      sequence += 1;
      const intentId = `console-intent-${sequence}`;
      return {
        intentId,
        action,
        declaredAt: now(),
        routedTo: CONSOLE_AUTHORITY_BY_ACTION[action],
      };
    },
    record(identity: ConsoleIntentIdentity, result: ConsoleIntentResult): ConsoleIntentResult {
      ledger.set(identity.intentId, {
        intentId: identity.intentId,
        scope,
        declaredAt: identity.declaredAt,
        result,
      });
      return result;
    },
    load(intentId: string, scope: TenantScope): ConsoleIntentLedgerRecord | null {
      const recorded = ledger.get(intentId);
      if (recorded === undefined || recorded.scope.tenantId !== scope.tenantId) {
        // Cross-tenant ids resolve to null — never a leak (spec §31).
        return null;
      }
      return {
        intentId: recorded.intentId,
        action: recorded.result.action,
        declaredAt: recorded.declaredAt,
        routedTo: recorded.result.routedTo,
        outcome: recorded.result,
      };
    },
  };
}

/** An executed intent's receipt (the authority echo — never fabricated). */
export function consoleReceiptOf(
  identity: ConsoleIntentIdentity,
  echo: {
    readonly recordId: string;
    readonly recordVersion: number;
    readonly lifecycleState?: string | null;
    readonly summary: string;
  },
): ConsoleIntentReceipt {
  return {
    intentId: identity.intentId,
    action: identity.action,
    declaredAt: identity.declaredAt,
    routedTo: identity.routedTo,
    authorityEcho: {
      recordId: echo.recordId,
      recordVersion: echo.recordVersion,
      lifecycleState: echo.lifecycleState ?? null,
      summary: echo.summary,
    },
  };
}

/** An authority rejection, relayed VERBATIM (code + message). */
export function consoleFailureOf(
  identity: ConsoleIntentIdentity,
  verdict: RuntimeVerdict,
): ConsoleIntentFailure {
  return {
    intentId: identity.intentId,
    action: identity.action,
    declaredAt: identity.declaredAt,
    routedTo: identity.routedTo,
    error: verdict.error,
    message: verdict.message,
  };
}

// ---------------------------------------------------------------------------
// The shared console runtime state (constructed by the entry, read by every
// declare-method group + the read loads — the lab-intents deps pattern)
// ---------------------------------------------------------------------------

/** The operator annotations the console keeps per REAL experiment record. */
export interface ExperimentAnnotation {
  readonly question: string;
  readonly successCriterion: string;
}

/** The shared REAL runtimes + ledgers the whole console binding runs over. */
export interface ConsoleBindingState {
  /** The composition's tenant scope (§31 — every intent's scope). */
  readonly scope: TenantScope;
  /** Injectable clock (deterministic tests). */
  readonly now: () => string;
  readonly ledger: ConsoleIntentLedger;
  /** The REAL missions repository (the planner's + banner's mission source). */
  readonly missionRepository: MissionRepository;
  /** The REAL LAB-017 benchmark (the lab-candidate seam's resolution source). */
  readonly labBenchmark: MarketingBenchmarkPort;
  /** The REAL rights repository — the SHARED §27 gate. */
  readonly rightsRepository: RightsRepository;
  /** The REAL §25 product-intelligence authority. */
  readonly productIntelligence: ProductIntelligencePort;
  /** The REAL MARKETING-001 planner. */
  readonly marketingPlanner: MarketingPlannerPort;
  /** The REAL BRIDGE-003 experiments authority stack (authority + read port). */
  readonly experimentsRuntime: ConsoleExperimentsRuntime;
  /** Declared operator annotations over the real experiment records. */
  readonly experimentAnnotations: Map<string, ExperimentAnnotation>;
  /** The REAL @mos/jobs durable queue (the experiments measurement segment). */
  readonly jobsQueue: JobQueuePort;
  /** The REAL AGT-001 body registry (the composition-registered catalog). */
  readonly agentBodyRegistry: AgentBodyRegistryPort;
  /** The REAL AGT-003 organization registry (compile validates through it). */
  readonly organizationRegistry: OrganizationRegistryPort;
  /** The REAL PROD-003 compiler. */
  readonly strategyCompiler: StrategyCompiler;
  /** The REAL PROD-004 engine. */
  readonly automationEngine: AutomationEngine;
  /** The DECLARED plan-linkage ledger (planId → experimentRefs + view data). */
  readonly planLinkage: PlanLinkageLedger;
  /** The compiled strategies this composition holds (strategyId → record). */
  readonly strategies: Map<string, CompiledStrategy>;
  /** The automation runs this composition holds (runId → engine state). */
  readonly runs: Map<string, AutomationRunState>;
}