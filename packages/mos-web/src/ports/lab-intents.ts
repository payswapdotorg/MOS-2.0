/**
 * Lab write-intent declaration port (UX-003 wave 3 — the Lab write
 * transport, first half of P2).
 *
 * DISCIPLINE (spec §31 + the wave-20 LAB-WORKSPACE record): the shell
 * NEVER writes. The Lab surfaces DECLARE intents; the composition seam
 * routes each declaration to the lab authority runtime, which alone
 * validates, executes and versions the record (rights gates fail-closed,
 * named error vocabularies). The authority's verdict comes back as the
 * receipt — success carries the record's echo (ids + versions + counts,
 * presentation-minimal), failure carries the authority's own code and
 * message VERBATIM. Nothing is retried, nothing is faked, and no
 * unavailable path is presented as executable.
 *
 * TYPES ARE SELF-CONTAINED PRESENTATION SHAPES: scalar fields arrive as
 * form text/numbers; contract-structured objects the operator must
 * declare (the scenario, reward spec, candidate set, policies, world
 * state, observation refs) arrive as DECLARED JSON TEXT. The seam parses
 * that text into the real contract shapes — a parse failure is a named
 * shell-side failure code on the intent ledger, never a crash and never
 * a silently-defaulted value. This keeps `src/` free of domain-package
 * imports (frozen registry: the web module depends on `[contracts]`
 * only), exactly like every other port in this package.
 *
 * The eight executable paths are the ones the wave-20 record named as
 * awaiting this transport, matched to the views' existing affordances:
 * LAB-001 acquisition + versioning, LAB-004/005 world-model registration
 * and simulation steps, LAB-009 organization search, LAB-010 strategy
 * learning, LAB-017 benchmark execution, LAB-018 calibration recording.
 * Ensemble construction (register/add/freeze) and transform promotion
 * remain DECLARED affordances — their chains are not part of this
 * transport's named scope and the views keep saying so.
 */

import type { TenantScope } from '@mos/contracts';

// ---------------------------------------------------------------------------
// Action vocabulary
// ---------------------------------------------------------------------------

/** The executable Lab write-intent actions (one per authority method). */
export type LabIntentActionId =
  | 'ingest-reference-document'
  | 'snapshot-corpus-version'
  | 'register-world-model'
  | 'simulate-step'
  | 'search-organizations'
  | 'learn-strategy'
  | 'run-benchmark'
  | 'record-calibration-error';

/** The lab authority each action routes to (receipt provenance). */
export type LabIntentAuthorityId =
  | 'lab-corpus-authority'
  | 'lab-simulator-authority'
  | 'lab-organization-search-authority'
  | 'lab-strategy-learning-authority'
  | 'lab-benchmark-authority'
  | 'lab-calibration-authority';

// ---------------------------------------------------------------------------
// Declarations (presentation shapes — form text/numbers + declared JSON)
// ---------------------------------------------------------------------------

/**
 * Acquire one reference document (LAB-001, rights-gated fail-closed: with
 * no registered rights grant the authority DENIES acquisition and the
 * receipt says so verbatim).
 */
export interface IngestReferenceDocumentDeclaration {
  readonly action: 'ingest-reference-document';
  /** Reference document id (authority-validated). */
  readonly documentId: string;
  readonly niche: string;
  readonly platform: string;
  /** Modality vocabulary value (the authority validates membership). */
  readonly modality: string;
  /** Artifact id — the artifact's tenant is the declaring scope's tenant. */
  readonly artifactId: string;
  /** Comma-separated source refs (may be empty). */
  readonly sourceRefsText: string;
  /** ISO-8601 acquisition timestamp (authority-validated). */
  readonly acquiredAt: string;
  /** Rights reference — the acquisition gate resolves THIS. */
  readonly rightsRef: string;
  /** Provenance reference (required by the corpus contract). */
  readonly provenanceRef: string;
}

/** Snapshot one corpus version (LAB-001, append-only membership set). */
export interface SnapshotCorpusVersionDeclaration {
  readonly action: 'snapshot-corpus-version';
  /** Comma-separated document ids forming the version's membership set. */
  readonly documentRefsText: string;
}

/** Register one world-model version (LAB-004, append-only chain). */
export interface RegisterWorldModelDeclaration {
  readonly action: 'register-world-model';
  readonly worldModelId: string;
  readonly niche: string;
  readonly platform: string;
  readonly notesText: string;
  /**
   * DECLARED JSON for the world-model state object (the operator declares
   * the full state; the seam parses it, the authority validates it).
   */
  readonly stateJson: string;
}

/** Step the simulator once (LAB-005, seed-required, counterfactual-labeled). */
export interface SimulateStepDeclaration {
  readonly action: 'simulate-step';
  readonly worldModelId: string;
  /** Exact world-model version to step (the authority resolves it). */
  readonly worldModelVersion: number;
  readonly seed: number;
  readonly step: number;
  /** The scenario's objective (the scenario JSON carries the version pins). */
  readonly scenarioJson: string;
  /** DECLARED JSON for the strategy action candidate. */
  readonly candidateJson: string;
}

/** Run one organization search (LAB-009, over a frozen ensemble). */
export interface SearchOrganizationsDeclaration {
  readonly action: 'search-organizations';
  readonly ensembleId: string;
  readonly ensembleVersion: number;
  readonly seed: number;
  /** DECLARED JSON: the LabScenario (version pins + objective + budget). */
  readonly scenarioJson: string;
  /** DECLARED JSON: the reward spec (version must match scenario.rewardVersion). */
  readonly rewardSpecJson: string;
  /** DECLARED JSON: the candidate set to evaluate. */
  readonly candidatesJson: string;
  /** DECLARED JSON: the search policy. */
  readonly policyJson: string;
}

/** Learn one strategy candidate (LAB-010, over a frozen ensemble). */
export interface LearnStrategyDeclaration {
  readonly action: 'learn-strategy';
  readonly ensembleId: string;
  readonly ensembleVersion: number;
  readonly seed: number;
  readonly scenarioJson: string;
  readonly rewardSpecJson: string;
  /** DECLARED JSON: the initial candidate program descriptor. */
  readonly initialProgramJson: string;
  /** DECLARED JSON: the learning stopping policy. */
  readonly stoppingPolicyJson: string;
}

/** Execute one robust benchmark run (LAB-017 — the no-op baseline stays visible). */
export interface RunBenchmarkDeclaration {
  readonly action: 'run-benchmark';
  readonly benchmarkId: string;
  /** Comma-separated determinism seeds. */
  readonly seedsText: string;
  readonly scenarioJson: string;
  /** DECLARED JSON: the candidate set (may be `[]` — the no-op baseline runs). */
  readonly candidatesJson: string;
  readonly rewardSpecJson: string;
  /** DECLARED JSON: the robustness policy. */
  readonly policyJson: string;
}

/** Record one calibration error observation (LAB-018, against a frozen benchmark record). */
export interface RecordCalibrationErrorDeclaration {
  readonly action: 'record-calibration-error';
  readonly calibrationId: string;
  /** DECLARED JSON: the calibration prediction reference. */
  readonly predictionJson: string;
  /** DECLARED JSON: the reality observation refs (>= 1, distinct). */
  readonly observationRefsJson: string;
  readonly rewardSpecJson: string;
  /** DECLARED JSON: the calibration error functional. */
  readonly functionalJson: string;
  readonly noteText: string;
}

/** Any Lab write-intent declaration (discriminated on `action`). */
export type LabIntentDeclaration =
  | IngestReferenceDocumentDeclaration
  | SnapshotCorpusVersionDeclaration
  | RegisterWorldModelDeclaration
  | SimulateStepDeclaration
  | SearchOrganizationsDeclaration
  | LearnStrategyDeclaration
  | RunBenchmarkDeclaration
  | RecordCalibrationErrorDeclaration;

// ---------------------------------------------------------------------------
// Receipts — the authority verdict echo (presentation-minimal)
// ---------------------------------------------------------------------------

/** The authority echo for an EXECUTED intent (ids/versions/counts only). */
export interface LabIntentAuthorityEcho {
  /** The action-specific record identity (document/world-model/benchmark id). */
  readonly recordId: string;
  /** The record's version after execution (append-only chains). */
  readonly recordVersion: number;
  /** Human-readable authority summary (ids + counts the authority reported). */
  readonly summary: string;
}

/**
 * Receipt for an intent the lab authority EXECUTED. Every declaration —
 * executed, authority-rejected, or shell-side parse-failed — lands in the
 * composition's ledger with its verdict; the intent id is therefore on
 * BOTH result shapes and the outcome surface always reads the ledger.
 */
export interface LabIntentReceipt {
  readonly intentId: string;
  readonly action: LabIntentActionId;
  /** ISO-8601 declaration timestamp. */
  readonly declaredAt: string;
  /** The lab authority that executed the intent. */
  readonly routedTo: LabIntentAuthorityId;
  /** The authority's record echo (never fabricated). */
  readonly authorityEcho: LabIntentAuthorityEcho;
}

/** A named failure verdict (authority OR shell-side JSON parse — verbatim). */
export interface LabIntentFailure {
  readonly intentId: string;
  readonly action: LabIntentActionId;
  /** ISO-8601 declaration timestamp. */
  readonly declaredAt: string;
  /** The lab authority the intent was routed to (or would have reached). */
  readonly routedTo: LabIntentAuthorityId;
  /** The failure code — an authority vocabulary, or a shell-side parse code. */
  readonly error: string;
  /** The failure message, relayed VERBATIM — never paraphrased into success. */
  readonly message: string;
}

/** Every declaration resolves to exactly one of receipt | failure. */
export type LabIntentResult = LabIntentReceipt | LabIntentFailure;

/**
 * The ledger view of a recorded intent — what the outcome panel reads after
 * the post-declaration reload (one route per load; the URL carries only the
 * intent id). Executed AND rejected intents are both ledger-recorded: the
 * operator's declared attempt and the authority's verdict stay inspectable
 * together.
 */
export interface LabIntentLedgerRecord {
  readonly intentId: string;
  readonly action: LabIntentActionId;
  readonly declaredAt: string;
  readonly routedTo: LabIntentAuthorityId;
  readonly outcome: LabIntentReceipt | LabIntentFailure;
}

// ---------------------------------------------------------------------------
// Shell-side failure vocabulary (parse/shape failures at the seam)
// ---------------------------------------------------------------------------

/**
 * Parse-failure code shape: `lab-intent-json-invalid:<field>` — the view
 * presents the field name and the parse message. These are the ONLY
 * shell-side codes; every other failure code belongs to an authority.
 */
export const LAB_INTENT_JSON_INVALID_PREFIX = 'lab-intent-json-invalid';

/**
 * The missing-input code for scalar fields the form required but the
 * declaration did not carry (defense in depth — the forms also validate).
 */
export const LAB_INTENT_MISSING_INPUT = 'lab-intent-missing-input';

// ---------------------------------------------------------------------------
// The port
// ---------------------------------------------------------------------------

/**
 * The Lab write-intent port (UX-003 wave 3). The shell captures
 * declarations and reads the ledger; the composition routes to the lab
 * authority runtimes. Read models stay on the section ports — a successful
 * intent's records appear there on the next full load.
 */
export interface LabIntentsPort {
  /** Declare LAB-001 acquisition (rights-gated fail-closed). */
  declareIngestReferenceDocument(
    declaration: IngestReferenceDocumentDeclaration,
  ): Promise<LabIntentResult>;
  /** Declare a LAB-001 corpus-version snapshot. */
  declareSnapshotCorpusVersion(
    declaration: SnapshotCorpusVersionDeclaration,
  ): Promise<LabIntentResult>;
  /** Declare a LAB-004 world-model registration. */
  declareRegisterWorldModel(
    declaration: RegisterWorldModelDeclaration,
  ): Promise<LabIntentResult>;
  /** Declare a LAB-005 simulation step. */
  declareSimulateStep(declaration: SimulateStepDeclaration): Promise<LabIntentResult>;
  /** Declare a LAB-009 organization search. */
  declareSearchOrganizations(
    declaration: SearchOrganizationsDeclaration,
  ): Promise<LabIntentResult>;
  /** Declare a LAB-010 strategy learning run. */
  declareLearnStrategy(declaration: LearnStrategyDeclaration): Promise<LabIntentResult>;
  /** Declare a LAB-017 benchmark execution. */
  declareRunBenchmark(declaration: RunBenchmarkDeclaration): Promise<LabIntentResult>;
  /** Declare a LAB-018 calibration-error recording. */
  declareRecordCalibrationError(
    declaration: RecordCalibrationErrorDeclaration,
  ): Promise<LabIntentResult>;
  /**
   * Read one ledger record by intent id (tenant-scoped through the scope
   * every other scoped read takes: another tenant's intent id resolves to
   * `null`, never a cross-tenant leak).
   */
  loadLabIntentLedgerRecord(
    intentId: string,
    scope: TenantScope,
  ): Promise<LabIntentLedgerRecord | null>;
}
