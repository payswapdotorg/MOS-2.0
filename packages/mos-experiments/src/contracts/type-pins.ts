/**
 * BRIDGE-003 compile-time pins — the FORBIDDEN-DUPLICATION law as types.
 *
 * EXPERIMENT ≠ LAB (§3): the experiments authority records REAL
 * experiments and their evidence; it never simulates, never re-runs the
 * Lab's simulators, never treats simulated predictions as observations.
 * The pins below make the smuggling directions ILLEGAL AT COMPILE TIME:
 *
 * 1. Measured evidence is REAL (`counterfactual: false` literal) and can
 *    never occupy the lab-candidate expectation slot (`counterfactual:
 *    true` literal) — and vice versa (lock rule 29, both directions).
 * 2. The declared measurement window carries no values at all (the union
 *    member has no metric field — a fabricated measurement is not even
 *    expressible).
 * 3. The outcome observation is REAL (`counterfactual: false` literal) —
 *    the lab-consumed citation is never a counterfactual projection.
 * 4. The experiment record is not an evidence record and not an outcome
 *    record (distinct record families — no slot mixing).
 * 5. The frozen binding projection carries ALL NINE required contract
 *    fields (exact-keyset pin — the CORE-001 RealExperimentBinding law).
 * 6. The lifecycle vocabulary stays closed and the terminal statuses are
 *    exactly `closed | abandoned`.
 * 7. The audit stage vocabulary stays exactly the two attributable gates.
 */

import type { Equal, IsAssignable } from "./pin-helpers.js";
import type { RealExperimentBinding } from "./experiment-record.js";
import type { ExperimentEvidenceRecord, MeasuredExperimentEvidence } from "./evidence.js";
import type { ExperimentOutcomeObservation } from "./outcome.js";
import type { LabCandidateExpectations } from "./lab-candidate-seam.js";
import type {
  EXPERIMENT_LIFECYCLE_STATUSES,
  TERMINAL_EXPERIMENT_STATUSES,
} from "./experiment-boundary.js";
import type { RealExperimentBindingFailureStage } from "./experiment-record.js";
import type { RealExperimentRecord } from "./experiment-record.js";
import type { ExperimentOutcomeRecord } from "./outcome.js";
import type { DeclaredMeasurementWindowRecord } from "./evidence.js";

type Expect<T extends true> = T;

/** 1a. Measured evidence is always real (lock rule 29). */
type _MeasuredEvidenceIsAlwaysReal = Expect<
  Equal<MeasuredExperimentEvidence["counterfactual"], false>
>;

/** 1b. Lab expectations are always counterfactual (lock rule 29). */
type _LabExpectationsAreAlwaysCounterfactual = Expect<
  Equal<LabCandidateExpectations["counterfactual"], true>
>;

/** 1c. Counterfactual expectations can NEVER occupy an evidence value slot. */
type _ExpectationsNeverOccupyAnEvidenceValueSlot = Expect<
  Equal<IsAssignable<LabCandidateExpectations, ExperimentEvidenceRecord>, false>
>;

/** 1d. Measured evidence can NEVER occupy the expectations slot. */
type _EvidenceNeverOccupiesTheExpectationsSlot = Expect<
  Equal<IsAssignable<MeasuredExperimentEvidence, LabCandidateExpectations>, false>
>;

/** 2. The declared window carries NO observation values (nothing to fabricate). */
type _DeclaredWindowHasNoObservationFields = Expect<
  Equal<
    "observations" extends keyof DeclaredMeasurementWindowRecord ? true : false,
    false
  >
>;
type _DeclaredWindowHasNoUncertaintyField = Expect<
  Equal<
    "uncertainty" extends keyof DeclaredMeasurementWindowRecord ? true : false,
    false
  >
>;

/** 3. The outcome observation is always real (the LAB-018 boundary pin). */
type _OutcomeObservationsAreAlwaysReal = Expect<
  Equal<ExperimentOutcomeObservation["counterfactual"], false>
>;

/** 3b. Lab expectations can NEVER occupy the outcome-observation slot. */
type _ExpectationsNeverOccupyTheOutcomeObservationSlot = Expect<
  Equal<IsAssignable<LabCandidateExpectations, ExperimentOutcomeObservation>, false>
>;

/** 4. The three record families never mix slots. */
type _ExperimentsAreNotEvidence = Expect<
  Equal<IsAssignable<RealExperimentRecord, ExperimentEvidenceRecord>, false>
>;
type _OutcomesAreNotExperiments = Expect<
  Equal<IsAssignable<ExperimentOutcomeRecord, RealExperimentRecord>, false>
>;

/** 5. The frozen binding projection carries ALL NINE required fields (exact keyset). */
type RequiredBindingKeys =
  | "id"
  | "labCandidateRef"
  | "missionRef"
  | "productionRequestRef"
  | "policyRef"
  | "rightsRef"
  | "distributionRef"
  | "experimentRef"
  | "evidenceRef";
type _BindingCarriesAllNineRequiredRefs = Expect<
  Equal<
    RequiredBindingKeys extends keyof RealExperimentBinding ? true : never,
    true
  >
>;
type _BindingKeysetIsExact = Expect<
  Equal<
    keyof RealExperimentBinding,
    | RequiredBindingKeys
    | "recordVersion"
    | "evidenceVersion"
    | "missionVersion"
  >
>;

/** 6. The lifecycle vocabulary is closed (six members, frozen order). */
type _LifecycleVocabularyIsClosed = Expect<
  Equal<
    (typeof EXPERIMENT_LIFECYCLE_STATUSES)[number],
    "created" | "running" | "measured" | "analysed" | "closed" | "abandoned"
  >
>;
type _TerminalStatusesAreClosedOrAbandoned = Expect<
  Equal<(typeof TERMINAL_EXPERIMENT_STATUSES)[number], "closed" | "abandoned">
>;

/** 7. The attributable audit stages are exactly the two gates. */
type _AuditStagesAreExactlyTheTwoGates = Expect<
  Equal<RealExperimentBindingFailureStage, "policy-gate" | "rights-gate">
>;
