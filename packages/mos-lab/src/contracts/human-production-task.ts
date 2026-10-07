import type {
  ArtifactRef,
  HumanProductionTask,
  HumanProductionTaskId,
  TenantId,
  TenantScope,
  Timestamp,
} from '@mos/contracts';
import type {
  HumanFulfillmentPath,
  HumanTaskAbandonment,
  HumanTaskEvaluation,
  HumanTaskLifecycleEvent,
  HumanTaskStatus,
  AbandonHumanTaskInput,
  DeliverHumanTaskInput,
  EvaluateHumanTaskInput,
} from './human-task-lifecycle.js';
import type {
  HumanTaskAcceptableSubstitutes,
  HumanTaskCaptureInstructions,
  HumanTaskConsent,
  HumanTaskDeadline,
  HumanTaskDelayEconomics,
  HumanTaskEvaluator,
  HumanTaskObjective,
  HumanTaskRequiredArtifacts,
  HumanTaskRights,
  HumanTaskScriptOrQuestions,
  HumanTaskSourceReference,
  HumanTaskTargetModality,
  HumanProductionTaskFieldName,
} from './human-task-fields.js';

/**
 * Human Production Task Packages for the Marketing Lab (LAB-014, §17).
 *
 * Basis: spec/mos-architecture-v2.0.md §17 (the Lab creates a Human
 * Production Task with objective, source/reference, script/questions,
 * capture instructions, target modality, required artifacts, consent/rights,
 * evaluator, deadline, delay economics, acceptable substitutes; fulfillment
 * by project owner / authorized collaborator / Arena provider; human output
 * returns as an INTERMEDIATE artifact), §2 (the delay-expectation
 * first-class variable), §18 (delay economics track list),
 * spec/contracts/core-contracts-v2.0.yaml HumanProductionTask.required,
 * spec/mos-effective-backlog-v2.0.md LAB-014 (deps LAB-012 same-wave +
 * CORE-003 ✓).
 *
 * A {@link LabHumanProductionTask} is the §17 task package as TWELVE
 * explicit typed records (each field's contract lives in
 * human-task-fields.ts; consent and rights are two records — the §17
 * compound "consent/rights" resolves into the consent record carrying the
 * `ConsentRef` and the rights record carrying the `RightsRef`s, both from
 * the `@mos/contracts` vocabulary). The canonical CORE-001
 * {@link HumanProductionTask} projection is derived BY CONSTRUCTION
 * ({@link canonicalHumanProductionTaskView}).
 *
 * Delay economics are DECLARED EXPECTATIONS (§2/§18) — expected wait and
 * the cost dimensions are declared variables of the production strategy,
 * never guarantees. Lifecycle (created → offered → in-progress → delivered
 * → evaluated → completed | abandoned) and the Arena provider seam live in
 * human-task-lifecycle.ts / arena-provider-seam.ts.
 */

/**
 * One VERSIONED, TENANT-SCOPED human production task package. Every
 * lifecycle transition appends version + 1 (append-only; prior versions
 * stay resolvable bit-for-bit); the lifecycle event log is the audit trail.
 * Human output is delivered as INTERMEDIATE artifact references (lock rule
 * 15) — never inline content.
 */
export interface LabHumanProductionTask {
  readonly id: HumanProductionTaskId;
  readonly version: number;
  readonly tenantId: TenantId;
  readonly objective: HumanTaskObjective;
  readonly sourceReference: HumanTaskSourceReference;
  readonly scriptOrQuestions: HumanTaskScriptOrQuestions;
  readonly captureInstructions: HumanTaskCaptureInstructions;
  readonly targetModality: HumanTaskTargetModality;
  readonly requiredArtifacts: HumanTaskRequiredArtifacts;
  readonly consent: HumanTaskConsent;
  readonly rights: HumanTaskRights;
  readonly evaluator: HumanTaskEvaluator;
  readonly deadline: HumanTaskDeadline;
  readonly delayEconomics: HumanTaskDelayEconomics;
  readonly acceptableSubstitutes: HumanTaskAcceptableSubstitutes;
  readonly status: HumanTaskStatus;
  /** The chosen fulfillment path (null until offered). */
  readonly fulfillmentPath: HumanFulfillmentPath | null;
  /** The delivered output as INTERMEDIATE artifact refs (null until delivered). */
  readonly deliveredArtifactRefs: readonly ArtifactRef[] | null;
  /** The latest evaluation (null until evaluated). */
  readonly evaluation: HumanTaskEvaluation | null;
  /** The abandonment record (terminal, abandoned tasks only). */
  readonly abandonment: HumanTaskAbandonment | null;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}

/** Create a human production task (version 1, status `created`). */
export interface CreateHumanProductionTaskInput {
  readonly scope: TenantScope;
  readonly id: HumanProductionTaskId;
  readonly objective: HumanTaskObjective;
  readonly sourceReference: HumanTaskSourceReference;
  readonly scriptOrQuestions: HumanTaskScriptOrQuestions;
  readonly captureInstructions: HumanTaskCaptureInstructions;
  readonly targetModality: HumanTaskTargetModality;
  readonly requiredArtifacts: HumanTaskRequiredArtifacts;
  readonly consent: HumanTaskConsent;
  readonly rights: HumanTaskRights;
  readonly evaluator: HumanTaskEvaluator;
  readonly deadline: HumanTaskDeadline;
  readonly delayEconomics: HumanTaskDelayEconomics;
  readonly acceptableSubstitutes: HumanTaskAcceptableSubstitutes;
}

// ---------------------------------------------------------------------------
// Canonical CORE-001 projection
// ---------------------------------------------------------------------------

/**
 * The canonical CORE-001 {@link HumanProductionTask} projection of a task
 * package (derived, read-only): `objective` is the objective statement,
 * `sourceRefs` the source references, `scriptOrQuestions` the script beats
 * or questions, `captureBrief` the capture brief, `targetOutput` the target
 * modality plus the required artifact types, `rightsConsent` the consent
 * reference, `evaluator` the bound evaluator ref, `deadline` the deadline,
 * `expectedValueOfWaiting` the declared expected incremental value, and
 * `acceptableSubstitutions` the §18 substitution equivalents (owner and
 * collaborator substitutes are human-path entries the canonical record
 * cannot express — they carry no §18 escape equivalent and are not
 * projected; documented, disclosed).
 */
export const canonicalHumanProductionTaskView = (
  task: LabHumanProductionTask,
): HumanProductionTask => ({
  id: task.id,
  version: task.version as HumanProductionTask['version'],
  objective: task.objective.statement,
  sourceRefs: [...task.sourceReference.artifactRefs],
  scriptOrQuestions:
    task.scriptOrQuestions.kind === 'script'
      ? [...task.scriptOrQuestions.beats]
      : [...task.scriptOrQuestions.questions],
  captureBrief: task.captureInstructions.brief,
  targetOutput: {
    modality: task.targetModality.modality,
    requiredArtifactTypes: task.requiredArtifacts.artifacts.map((artifact) => artifact.artifactType),
  },
  rightsConsent: task.consent.consentRef,
  evaluator: task.evaluator.evaluatorRef,
  deadline: task.deadline.deadlineAt,
  expectedValueOfWaiting: task.delayEconomics.expectedIncrementalValue,
  acceptableSubstitutions: task.acceptableSubstitutes.ordered
    .filter((substitute) => substitute.path.kind === 'arena-provider')
    .map(() => 'provider' as const),
});

// ---------------------------------------------------------------------------
// Failure model
// ---------------------------------------------------------------------------

/** Machine-readable failure codes for human production task operations. */
export type HumanProductionTaskErrorCode =
  | 'invalid-task-field'
  | 'invalid-input'
  | 'duplicate-task'
  | 'task-not-found'
  | 'illegal-lifecycle-transition'
  | 'deadline-expired'
  | 'not-overdue'
  | 'arena-provider-required'
  | 'arena-offer-failed'
  | 'arena-provider-declined'
  | 'no-substitute-available';

/** Typed failure value (result union, the MOS domain convention). */
export interface HumanProductionTaskError {
  readonly error: HumanProductionTaskErrorCode;
  readonly message: string;
  /** The named twelve-field surface (field validation failures only). */
  readonly field?: HumanProductionTaskFieldName;
}

// ---------------------------------------------------------------------------
// The port
// ---------------------------------------------------------------------------

/**
 * The Human Production Task port (LAB-014 runtime). TEN public methods
 * (architecture policy budget: 12): create, get, list, offer (fulfillment
 * path chosen — the Arena path goes through the ArenaProviderPort seam),
 * accept, deliver (output as INTERMEDIATE artifact refs), evaluate,
 * abandon (deadline expiry or substitute switch — abandonment is
 * FIRST-CLASS), abandonOverdue and the append-only history.
 */
export interface HumanProductionTaskPort {
  /**
   * Create a task package (version 1, status `created`). ALL TWELVE §17
   * fields are validated structurally — a missing or malformed field fails
   * closed naming the field (`invalid-task-field`). Fails with
   * `duplicate-task` when the id already exists in this tenant scope.
   */
  createHumanProductionTask(
    input: CreateHumanProductionTaskInput,
  ): Promise<LabHumanProductionTask | HumanProductionTaskError>;

  /**
   * Fetch a task — latest version by default, the EXACT version when given —
   * or `null` when unknown in this tenant scope (unknown and cross-tenant
   * are indistinguishable on reads).
   */
  getHumanProductionTask(
    scope: TenantScope,
    taskId: HumanProductionTaskId,
    version?: number,
  ): Promise<LabHumanProductionTask | null>;

  /** The latest version of every task in this tenant scope (insertion order). */
  listHumanProductionTasks(scope: TenantScope): Promise<readonly LabHumanProductionTask[]>;

  /**
   * Offer the task to one fulfillment path (status `created` → `offered`).
   * The `arena-provider` path goes through the wired ArenaProviderPort
   * seam: the provider interaction is recorded (never silent) — a seam
   * failure or provider decline fails closed with `arena-offer-failed` /
   * `arena-provider-declined` and the task stays `created`. Fails with
   * `illegal-lifecycle-transition` from any other status,
   * `arena-provider-required` when no seam is wired, and `invalid-input`
   * for a malformed path.
   */
  offerHumanProductionTask(
    scope: TenantScope,
    taskId: HumanProductionTaskId,
    path: HumanFulfillmentPath,
  ): Promise<LabHumanProductionTask | HumanProductionTaskError>;

  /**
   * Accept the task (status `offered` → `in-progress`). Fails with
   * `illegal-lifecycle-transition` from any other status.
   */
  acceptHumanProductionTask(
    scope: TenantScope,
    taskId: HumanProductionTaskId,
  ): Promise<LabHumanProductionTask | HumanProductionTaskError>;

  /**
   * Deliver the human output as INTERMEDIATE artifact references (status
   * `in-progress` or `evaluated` → `delivered`; the §2 retry loop — a
   * treatment-requested or rejected delivery can be re-delivered). Artifact
   * refs must be non-empty and belong to the tenant scope; delivery must
   * arrive by the deadline (`deadline-expired` afterwards). Fails with
   * `illegal-lifecycle-transition` from any other status.
   */
  deliverHumanProductionTask(
    scope: TenantScope,
    taskId: HumanProductionTaskId,
    input: DeliverHumanTaskInput,
  ): Promise<LabHumanProductionTask | HumanProductionTaskError>;

  /**
   * Evaluate the delivered output (status `delivered` → `evaluated`, or
   * `completed` when the verdict is `accepted`). The evaluator REFERENCE is
   * on the task; evaluation EXECUTION is not this surface. Fails with
   * `illegal-lifecycle-transition` from any other status.
   */
  evaluateHumanProductionTask(
    scope: TenantScope,
    taskId: HumanProductionTaskId,
    input: EvaluateHumanTaskInput,
  ): Promise<LabHumanProductionTask | HumanProductionTaskError>;

  /**
   * Abandon the task (FIRST-CLASS §2/§18 outcome): any non-terminal status
   * → `abandoned`, recorded with the cause (`caller-decision`, or
   * `substitute-switch` when a substitute is selected and the ordered list
   * yields one — the switch records original + substitute + reason, never
   * silent). Fails with `illegal-lifecycle-transition` from a terminal
   * status and `no-substitute-available` when selection finds nothing.
   */
  abandonHumanProductionTask(
    scope: TenantScope,
    taskId: HumanProductionTaskId,
    input: AbandonHumanTaskInput,
  ): Promise<LabHumanProductionTask | HumanProductionTaskError>;

  /**
   * Abandon an overdue task: fails with `not-overdue` unless the injected
   * clock is past the deadline, then abandons with cause `deadline-expiry`
   * and yields the ordered substitute list's next untried path when one
   * exists (the switch is recorded, never silent).
   */
  abandonOverdueHumanProductionTask(
    scope: TenantScope,
    taskId: HumanProductionTaskId,
  ): Promise<LabHumanProductionTask | HumanProductionTaskError>;

  /** The task's append-only lifecycle event log (oldest first). */
  listHumanProductionTaskHistory(
    scope: TenantScope,
    taskId: HumanProductionTaskId,
  ): Promise<readonly HumanTaskLifecycleEvent[]>;
}
