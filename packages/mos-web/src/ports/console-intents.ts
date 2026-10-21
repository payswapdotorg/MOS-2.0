/**
 * Agent Console write-intent declaration port (the CONSOLE wave — the
 * mission-orchestration write transport, the Lab write-intent pattern
 * applied to the mission→evidence→plan→strategy→run→approval chain).
 *
 * DISCIPLINE (spec §31 + the wave-21 LAB-WRITE-INTENTS record): the shell
 * NEVER writes. The Console surfaces DECLARE intents; the composition seam
 * routes each declaration to the OWNING authority runtime, which alone
 * validates, executes and versions the record (rights gates fail-closed,
 * named error vocabularies). The authority's verdict comes back as the
 * receipt — success carries the record's echo (ids + versions + lifecycle
 * states, presentation-minimal), failure carries the authority's own code
 * and message VERBATIM. Nothing is retried, nothing is faked, and no
 * unavailable path is presented as executable.
 *
 * THE SEVEN PATHS are the first complete product workflow the FINAL TL
 * HANDOFF defines — every one rides a REAL authority through its REAL
 * port:
 *
 *   mission (existing create-mission intent) →
 *   1. create-experiment      @mos/experiments (a REAL experiment record)
 *   2. grant-analysis-rights  @mos/rights (the §27 gate the evidence path needs)
 *   3. record-intelligence    @mos/product-intelligence (§25, rights-gated
 *                              fail-closed — no grant ⇒ verbatim rejection)
 *   4. compose-plan           @mos/missions MARKETING-001 planner (cites the
 *                              intelligence versions + the experiment refs)
 *   5. compile-strategy       @mos/missions PROD-003 compiler (rights gate,
 *                              AGT-003 organization validation, experiment
 *                              binding verification)
 *   6. create-run             @mos/missions PROD-004 engine (run lands
 *                              'compiled' = awaiting authorization)
 *   7. arm-run                @mos/missions PROD-004 engine arm() — THE
 *                              human authorization transition (rights gate +
 *                              experiment binding; the denial is verbatim).
 *
 * After 'armed' the run waits for the durable job/distribution/measurement
 * transports (the P2 service-transport wave, disclosed) — the Console
 * presents that waiting state honestly; it never simulates execution.
 *
 * TYPES ARE SELF-CONTAINED PRESENTATION SHAPES: scalar fields arrive as
 * form text/numbers; contract-structured objects the operator must declare
 * (platform choices, metric expectations, rights terms, intelligence
 * content, sources, bases) arrive as DECLARED JSON TEXT. The seam parses
 * that text into the real contract shapes — a parse failure is a named
 * shell-side failure code on the intent ledger, never a crash and never a
 * silently-defaulted value. This keeps `src/` free of domain-package
 * imports (frozen registry: the web module depends on `[contracts]` only),
 * exactly like every other port in this package.
 */

import type { TenantScope } from '@mos/contracts';

// ---------------------------------------------------------------------------
// Action vocabulary
// ---------------------------------------------------------------------------

/** The executable Console write-intent actions (one per authority path). */
export type ConsoleIntentActionId =
  | 'create-experiment'
  | 'grant-analysis-rights'
  | 'record-intelligence'
  | 'compose-plan'
  | 'compile-strategy'
  | 'create-run'
  | 'arm-run';

/** The authority each action routes to (receipt provenance, verbatim). */
export type ConsoleIntentAuthorityId =
  | 'experiments-authority'
  | 'rights-authority'
  | 'product-intelligence-authority'
  | 'marketing-planner-authority'
  | 'strategy-compiler-authority'
  | 'automation-engine-authority';

// ---------------------------------------------------------------------------
// Declarations (presentation shapes — form text/numbers + declared JSON)
// ---------------------------------------------------------------------------

/**
 * Create one REAL experiment record (@mos/experiments) — the experiment the
 * mission's plan expectations will be decided by and the run will arm
 * against. The authority's own registration gates decide acceptance.
 */
export interface CreateExperimentDeclaration {
  readonly action: 'create-experiment';
  /** Experiment id (authority-validated). */
  readonly experimentId: string;
  /** The question the experiment decides (non-blank). */
  readonly questionText: string;
  /** The declared success criterion (non-blank). */
  readonly successCriterionText: string;
  /** DECLARED JSON: the experiment's declared hypothesis shape. */
  readonly hypothesisJson: string;
  /** Comma-separated mission refs this experiment serves (may be empty). */
  readonly missionRefsText: string;
}

/**
 * Grant analysis rights (@mos/rights) — the operator authorizes the
 * evidence-recording path. The rights authority's own validation decides
 * acceptance (fail-closed terms, typed codes).
 */
export interface GrantAnalysisRightsDeclaration {
  readonly action: 'grant-analysis-rights';
  /** Rights grant id (authority-validated). */
  readonly grantId: string;
  /** The rights holder identity id (non-blank). */
  readonly rightsHolderId: string;
  /** The granted action (the rights action vocabulary — authority-validated). */
  readonly actionText: string;
  /** DECLARED JSON: the rights scope. */
  readonly scopeJson: string;
  /** DECLARED JSON: the rights terms. */
  readonly termsJson: string;
}

/**
 * Record one product-intelligence record (@mos/product-intelligence §25 —
 * append-only, RIGHTS-GATED fail-closed: with no registered grant the
 * authority DENIES recording and the receipt says so verbatim).
 */
export interface RecordIntelligenceDeclaration {
  readonly action: 'record-intelligence';
  /** Intelligence record chain id (authority-validated). */
  readonly recordId: string;
  /** DECLARED JSON: the product subject ref. */
  readonly subjectJson: string;
  /** The content kind (fact | metric | observation — authority-validated). */
  readonly contentKindText: string;
  /** DECLARED JSON: the intelligence content. */
  readonly contentJson: string;
  /** DECLARED JSON: the explicit source attribution. */
  readonly sourceJson: string;
  /** The basis (cited-evidence | counterfactual-forecast — §25 discipline). */
  readonly basisKindText: string;
  /** DECLARED JSON: cited commerce observations (required for external sources). */
  readonly citedCommerceObservationsJson: string;
  /** Rights reference — the recording gate resolves THIS. */
  readonly rightsRef: string;
  /** Attribution note (required when the grant's terms demand it). */
  readonly attributionText: string;
  /** Free-form recorder note (may be empty). */
  readonly noteText: string;
}

/**
 * Compose one marketing plan (MARKETING-001) for a mission — the
 * evidence-linked, mission-cited plan the strategy compiler consumes.
 * Platform choices, metric expectations and experiment expectations each
 * carry ≥ 1 resolvable product-intelligence citations (the planner's own
 * typed gates decide); the declared experiment refs name the REAL
 * experiments the plan's expectations are decided by.
 */
export interface ComposePlanDeclaration {
  readonly action: 'compose-plan';
  /** Plan chain id (caller-driven identifier allocation). */
  readonly planId: string;
  /** The mission this plan serves (latest record version resolved at the seam). */
  readonly missionId: string;
  /** How this plan serves the mission's declared objective (non-blank). */
  readonly objectiveAlignmentText: string;
  /** DECLARED JSON: platform choices (≥ 1, unique per platform). */
  readonly platformsJson: string;
  /** DECLARED JSON: metric expectations (≥ 1, unique per metric). */
  readonly metricExpectationsJson: string;
  /** DECLARED JSON: experiment expectations (≥ 1). */
  readonly experimentExpectationsJson: string;
  /** Comma-separated REAL experiment ids the plan links (≥ 1 at compile). */
  readonly experimentRefsText: string;
  /** Free-form composer note (may be empty). */
  readonly noteText: string;
}

/** Compile a marketing plan into a strategy (PROD-003 — the plan →
 * organization/phases/delegation/comparators/EVD artifact). */
export interface CompileStrategyDeclaration {
  readonly action: 'compile-strategy';
  /** The plan chain to compile. */
  readonly planId: string;
  /** Exact plan record version (`0` = latest at the seam). */
  readonly planVersion: number;
  /** The principal whose compile right is checked (§27 gate). */
  readonly principalText: string;
}

/** Create one automation run (PROD-004 engine) — lands in 'compiled'
 * (awaiting authorization; nothing executes). */
export interface CreateRunDeclaration {
  readonly action: 'create-run';
  /** The compiled strategy the run instantiates. */
  readonly strategyId: string;
}

/**
 * Arm one automation run (PROD-004 engine arm()) — THE human authorization
 * transition: the §27 rights verdict decides, the experiment binding must
 * resolve ACTIVE, and a denial is relayed VERBATIM. Arming emits the
 * publish-window enqueue effects the durable host would execute; the run
 * then waits for that transport (disclosed P2 boundary).
 */
export interface ArmRunDeclaration {
  readonly action: 'arm-run';
  /** The run being authorized. */
  readonly runId: string;
  /** The principal whose run right is checked (§27 gate). */
  readonly principalText: string;
}

/** Any Console write-intent declaration (discriminated on `action`). */
export type ConsoleIntentDeclaration =
  | CreateExperimentDeclaration
  | GrantAnalysisRightsDeclaration
  | RecordIntelligenceDeclaration
  | ComposePlanDeclaration
  | CompileStrategyDeclaration
  | CreateRunDeclaration
  | ArmRunDeclaration;

// ---------------------------------------------------------------------------
// Receipts — the authority verdict echo (presentation-minimal)
// ---------------------------------------------------------------------------

/**
 * The authority echo for an EXECUTED intent: the record identity, the
 * version or lifecycle state the authority reported, and a summary of ids
 * and counts. Never fabricated — projection of what the authority holds.
 */
export interface ConsoleIntentAuthorityEcho {
  /** The action-specific record identity (experiment/grant/record/plan/strategy/run id). */
  readonly recordId: string;
  /** The record's version, or the lifecycle state for run transitions. */
  readonly recordVersion: number;
  /** The lifecycle state after the transition (run actions; else 0). */
  readonly lifecycleState: string | null;
  /** Human-readable authority summary (ids + counts the authority reported). */
  readonly summary: string;
}

/**
 * Receipt for an intent the authority EXECUTED. Every declaration —
 * executed, authority-rejected, or shell-side parse-failed — lands in the
 * composition's ledger with its verdict; the intent id is therefore on
 * BOTH result shapes and the outcome surface always reads the ledger.
 */
export interface ConsoleIntentReceipt {
  readonly intentId: string;
  readonly action: ConsoleIntentActionId;
  /** ISO-8601 declaration timestamp. */
  readonly declaredAt: string;
  /** The authority that executed the intent. */
  readonly routedTo: ConsoleIntentAuthorityId;
  /** The authority's record echo (never fabricated). */
  readonly authorityEcho: ConsoleIntentAuthorityEcho;
}

/** A named failure verdict (authority OR shell-side JSON parse — verbatim). */
export interface ConsoleIntentFailure {
  readonly intentId: string;
  readonly action: ConsoleIntentActionId;
  /** ISO-8601 declaration timestamp. */
  readonly declaredAt: string;
  /** The authority the intent was routed to (or would have reached). */
  readonly routedTo: ConsoleIntentAuthorityId;
  /** The failure code — an authority vocabulary, or a shell-side parse code. */
  readonly error: string;
  /** The failure message, relayed VERBATIM — never paraphrased into success. */
  readonly message: string;
}

/** Every declaration resolves to exactly one of receipt | failure. */
export type ConsoleIntentResult = ConsoleIntentReceipt | ConsoleIntentFailure;

/**
 * The ledger view of a recorded intent — what the outcome panel reads after
 * the post-declaration navigation (the URL carries only the intent id).
 * Executed AND rejected intents are both ledger-recorded: the operator's
 * declared attempt and the authority's verdict stay inspectable together.
 */
export interface ConsoleIntentLedgerRecord {
  readonly intentId: string;
  readonly action: ConsoleIntentActionId;
  readonly declaredAt: string;
  readonly routedTo: ConsoleIntentAuthorityId;
  readonly outcome: ConsoleIntentResult;
}

// ---------------------------------------------------------------------------
// Shell-side failure vocabulary (parse/shape failures at the seam)
// ---------------------------------------------------------------------------

/**
 * Parse-failure code shape: `console-intent-json-invalid:<field>` — the
 * view presents the field name and the parse message. These are the ONLY
 * shell-side codes; every other failure code belongs to an authority.
 */
export const CONSOLE_INTENT_JSON_INVALID_PREFIX = 'console-intent-json-invalid';

/**
 * The missing-input code for scalar fields the form required but the
 * declaration did not carry (defense in depth — the forms also validate).
 */
export const CONSOLE_INTENT_MISSING_INPUT = 'console-intent-missing-input';

// ---------------------------------------------------------------------------
// The port
// ---------------------------------------------------------------------------

/**
 * The Agent Console write-intent port. The shell captures declarations and
 * reads the ledger; the composition routes to the owning authority
 * runtimes. Read models stay on the agent-console port — a successful
 * intent's records appear there on the next full load / soft refresh.
 */
export interface ConsoleIntentsPort {
  /** Declare a REAL experiment creation (@mos/experiments). */
  declareCreateExperiment(
    declaration: CreateExperimentDeclaration,
  ): Promise<ConsoleIntentResult>;
  /** Declare an analysis-rights grant (@mos/rights). */
  declareGrantAnalysisRights(
    declaration: GrantAnalysisRightsDeclaration,
  ): Promise<ConsoleIntentResult>;
  /** Declare an intelligence recording (§25, rights-gated fail-closed). */
  declareRecordIntelligence(
    declaration: RecordIntelligenceDeclaration,
  ): Promise<ConsoleIntentResult>;
  /** Declare a marketing-plan composition (MARKETING-001). */
  declareComposePlan(declaration: ComposePlanDeclaration): Promise<ConsoleIntentResult>;
  /** Declare a strategy compilation (PROD-003). */
  declareCompileStrategy(
    declaration: CompileStrategyDeclaration,
  ): Promise<ConsoleIntentResult>;
  /** Declare an automation-run creation (PROD-004 — lands 'compiled'). */
  declareCreateRun(declaration: CreateRunDeclaration): Promise<ConsoleIntentResult>;
  /** Declare a run authorization — arm (PROD-004, the §27 rights gate). */
  declareArmRun(declaration: ArmRunDeclaration): Promise<ConsoleIntentResult>;
  /**
   * Read one ledger record by intent id (tenant-scoped: another tenant's
   * intent id resolves to `null`, never a cross-tenant leak).
   */
  loadConsoleIntentLedgerRecord(
    intentId: string,
    scope: TenantScope,
  ): Promise<ConsoleIntentLedgerRecord | null>;
}
