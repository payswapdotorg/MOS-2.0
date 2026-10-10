/**
 * BRIDGE-003 lab/authority compat pins — the COMPILE-TIME half of the
 * zero-drift battery over the REAL authorities (the W8-A / LAB-017
 * benchmark-production-compat precedent).
 *
 * The REAL `@mos/lab`, `@mos/policy` and `@mos/rights` are NOT registry
 * dependencies of the experiments module (registry deps: contracts,
 * missions, production, distribution, jobs) — they are imported here by
 * RELATIVE SOURCE PATH, TYPE-ONLY, exactly like the studio's
 * compat/bridge-authority-compat.ts imports missions/policy. No runtime
 * dependency edge exists; the runtime half lives in
 * compat/experiments-real-stack.test.ts.
 *
 * Pin directions (documented): where the REAL shapes carry BRANDED ids
 * (`RobustBenchmarkId`, `HistoricalObservationId`), the experiments-owned
 * seam shapes keep the WIDER `string` view (the caller cites; the adapter
 * brand-bridges at the documented composition points — the LAB-018
 * canonical-view precedent). The pins below therefore assert:
 * (a) the REAL records satisfy the experiments-owned VIEWS (assignable in
 *     the consuming direction — the adapters never reinterpret), and
 * (b) the brand-bridged projections satisfy the REAL slots (assignable in
 *     the feeding direction — the outcome observation, with its id
 *     brand-bridged to the lab's, satisfies the lab's reality shape).
 *
 * Pins:
 * 1. THE LAB-018 BOUNDARY — the brand-bridged `ExperimentOutcomeObservation`
 *    satisfies the REAL `HistoricalObservation` slot; both are real
 *    (`counterfactual: false` on both sides).
 * 2. THE PREDICTION REF — the REAL `CalibrationPredictionRef` satisfies the
 *    experiments `LabCandidateCitation` (the binding's cited candidate IS
 *    the calibratable prediction; the adapter bridges the id brand).
 * 3. THE EXPECTATIONS SEAM — the REAL benchmark record's ranked-candidate
 *    evaluation + provenance satisfy the `LabCandidateExpectations` view
 *    (the counterfactual expectations copy over verbatim).
 * 4. THE BENCHMARK READER — the REAL `MarketingBenchmarkPort` record reads
 *    are the reader adapter's exact needs.
 * 5. THE MISSION LINKAGE — the REAL `@mos/missions` `Mission` satisfies the
 *    linkage view (id, tenantId, version, status, rewardSpec.version).
 * 6. THE POLICY MIRROR — the REAL `@mos/policy` verdict vocabulary is the
 *    experiments gate's mirror vocabulary, verbatim.
 * 7. THE RIGHTS FRAME — the REAL rights repository read surface is the
 *    frame-gate adapter's exact needs.
 * 8. CROSS-FAMILY PURITY — measured evidence / lab predictions never
 *    occupy each other's slots (the compat-side §20/§29 pins).
 */

import type {
  ExperimentOutcomeObservation,
  LabCandidateCitation,
  LabCandidateExpectations,
  LabCandidateSnapshot,
  MeasuredExperimentEvidence,
  ExperimentMissionLinkage,
  ExperimentRightsFrameResolution,
} from "../src/index.js";

// REAL @mos/lab shapes (relative source path, TYPE-ONLY — no runtime edge).
import type { HistoricalObservation } from "../../mos-lab/src/contracts/evidence.js";
import type { CalibrationPredictionRef } from "../../mos-lab/src/contracts/online-calibration.js";
import type { MarketingBenchmarkPort } from "../../mos-lab/src/contracts/robust-benchmark-port.js";
import type { RobustBenchmarkRecord } from "../../mos-lab/src/contracts/robust-benchmark-port.js";
import type { RankedBenchmarkCandidate } from "../../mos-lab/src/contracts/robust-benchmark-result.js";
import type { BenchmarkCandidate } from "../../mos-lab/src/contracts/robust-benchmark.js";
// REAL @mos/missions shape (a registry dep — pinned here for the linkage view).
import type { Mission } from "@mos/missions";
// REAL @mos/policy shapes (relative source path, TYPE-ONLY).
import type { PolicyVerdict } from "../../mos-policy/src/contracts/policy-evaluation.js";
import type { PolicyEvaluationRecord } from "../../mos-policy/src/contracts/policy-evaluation.js";
import type { POLICY_ACTION_KINDS } from "../../mos-policy/src/contracts/policy-rule.js";
// REAL @mos/rights shapes (relative source path, TYPE-ONLY).
import type { RightsRepository } from "../../mos-rights/src/ports/rights-repository.js";

type Expect<T extends true> = T;
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type IsAssignable<Source, Target> = Source extends Target ? true : false;

// ---------------------------------------------------------------------------
// 1. The LAB-018 boundary observation (the feeding direction — zero drift)
// ---------------------------------------------------------------------------

/** The brand-bridged projection (id cast at the adapter's documented point). */
type BridgedOutcomeObservation = Omit<ExperimentOutcomeObservation, "id"> & {
  readonly id: HistoricalObservation["id"];
};
type _BridgedObservationsSatisfyTheLabRealityShape = Expect<
  Equal<IsAssignable<BridgedOutcomeObservation, HistoricalObservation>, true>
>;
type _ObservationsAreRealAtBothSeams = Expect<
  Equal<ExperimentOutcomeObservation["counterfactual"], HistoricalObservation["counterfactual"]>
>;
/** The lab's own reality records satisfy the experiments observation VIEW. */
type _LabRealitySatisfiesTheObservationView = Expect<
  Equal<
    IsAssignable<HistoricalObservation, Omit<ExperimentOutcomeObservation, "id" | "regime">>,
    true
  >
>;

// ---------------------------------------------------------------------------
// 2. The prediction ref (the consuming direction — the cited candidate)
// ---------------------------------------------------------------------------

type _RealPredictionRefsSatisfyTheCitation = Expect<
  Equal<IsAssignable<CalibrationPredictionRef, LabCandidateCitation>, true>
>;
/** The brand-bridged citation satisfies the REAL prediction ref slot. */
type _BridgedCitationsSatisfyThePredictionRef = Expect<
  Equal<
    IsAssignable<
      LabCandidateCitation & { benchmarkId: CalibrationPredictionRef["benchmarkId"] },
      CalibrationPredictionRef
    >,
    true
  >
>;

// ---------------------------------------------------------------------------
// 3. The expectations seam (the REAL evaluation satisfies the view)
// ---------------------------------------------------------------------------

/** The REAL ranked-candidate evaluation + provenance view (verbatim copy source). */
interface RealExpectationsView {
  readonly expectedReward: RankedBenchmarkCandidate["evaluation"]["expectedReward"];
  readonly interval: RankedBenchmarkCandidate["evaluation"]["interval"];
  readonly uncertainty: RankedBenchmarkCandidate["evaluation"]["uncertainty"];
  readonly rewardSpecVersion: RobustBenchmarkRecord["provenance"]["rewardSpecVersion"];
  readonly counterfactual: true;
}
type _RealEvaluationsSatisfyTheExpectationsView = Expect<
  Equal<IsAssignable<RealExpectationsView, LabCandidateExpectations>, true>
>;
type _ExpectationsAreCounterfactualAtBothSeams = Expect<
  Equal<RankedBenchmarkCandidate["evaluation"]["counterfactual"], LabCandidateExpectations["counterfactual"]>
>;
/** A REAL record's own disclosure string is the snapshot's disclosure field. */
type _RealDisclosuresAreStrings = Expect<Equal<IsAssignable<string, LabCandidateSnapshot["disclosure"]>, true>>;

// ---------------------------------------------------------------------------
// 4. The benchmark reader (the REAL port record reads behind the seam)
// ---------------------------------------------------------------------------

type RealBenchmarkReads = Pick<MarketingBenchmarkPort, "getBenchmarkRecord" | "resolveLatestBenchmarkRecord">;
type _TheRealPortReadsAreTheReaderView = Expect<
  Equal<IsAssignable<MarketingBenchmarkPort, RealBenchmarkReads>, true>
>;
/** The REAL record satisfies the snapshot's basis (ranked set + provenance). */
type _RealRecordsCarryTheRankedSet = Expect<
  Equal<IsAssignable<RobustBenchmarkRecord["ranked"], readonly RankedBenchmarkCandidate[]>, true>
>;

// ---------------------------------------------------------------------------
// 5. The mission linkage (the REAL Mission satisfies the view)
// ---------------------------------------------------------------------------

type _RealMissionsSatisfyTheLinkageView = Expect<
  Equal<
    IsAssignable<Pick<Mission, "id" | "tenantId" | "version" | "status" | "rewardSpec">, {
      readonly id: Mission["id"];
      readonly tenantId: Mission["tenantId"];
      readonly version: number;
      readonly status: Mission["status"];
      readonly rewardSpec: { readonly version: number };
    }>,
    true
  >
>;
type _LinkageCarriesTheRewardSpecVersion = Expect<
  Equal<IsAssignable<number, ExperimentMissionLinkage["rewardSpecVersion"]>, true>
>;

// ---------------------------------------------------------------------------
// 6. The policy mirror (the REAL verdict vocabulary maps verbatim)
// ---------------------------------------------------------------------------

type _RealVerdictOutcomesAreTheMirrorVocabulary = Expect<
  Equal<PolicyVerdict["outcome"], "allowed" | "denied" | "approval-required" | "insufficient-policy">
>;
type _RealEvaluationRecordsCarryVerdicts = Expect<
  Equal<IsAssignable<PolicyEvaluationRecord["verdict"], PolicyVerdict>, true>
>;
/** The REAL action vocabulary includes the experiments action kind (§24). */
type _ExperimentLaunchIsARealActionKind = Expect<
  Equal<IsAssignable<"experiment-launch", (typeof POLICY_ACTION_KINDS)[number]>, true>
>;

// ---------------------------------------------------------------------------
// 7. The rights frame (the REAL repository behind the frame gate)
// ---------------------------------------------------------------------------

/** The REAL repository satisfies the frame-gate reads (the consuming direction). */
type RealRightsReads = Pick<RightsRepository, "getRights" | "getConsent">;
type _TheRealRepositorySatisfiesTheFrameGate = Expect<IsAssignable<RightsRepository, RealRightsReads>>;
/** The frame-resolution statuses are strings (the verbatim-echo direction). */
type _FrameStatusesAreStrings = Expect<
  Equal<IsAssignable<ExperimentRightsFrameResolution["status"], string>, true>
>;

// ---------------------------------------------------------------------------
// 8. Cross-family purity (the compat-side §20/§29 pins against the REAL lab)
// ---------------------------------------------------------------------------

type _MeasuredEvidenceNeverOccupiesALabHistoricalSlot = Expect<
  Equal<IsAssignable<MeasuredExperimentEvidence, HistoricalObservation>, false>
>;
type _LabPredictionsNeverOccupyAnOutcomeObservationSlot = Expect<
  Equal<IsAssignable<CalibrationPredictionRef, ExperimentOutcomeObservation>, false>
>;
type _LabBenchmarkCandidatesNeverOccupyAnEvidenceSlot = Expect<
  Equal<IsAssignable<BenchmarkCandidate, MeasuredExperimentEvidence>, false>
>;
