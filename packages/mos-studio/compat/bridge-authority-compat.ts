/**
 * Bridge authority-seam compatibility pins (BRIDGE-001) — the COMPILE-TIME
 * half.
 *
 * Zero-drift guarantee: the structural mirrors the bridge's declared
 * authority ports carry (src/bridge/contracts/bridge-authority-ports.ts —
 * `BridgePolicyEvaluationRequest`, `BridgePolicyVerdict`,
 * `BridgePolicyEvaluationRecord`, `BridgeMissionSnapshot`,
 * `BridgeMissionSource`) and the REAL `@mos/policy` / `@mos/missions`
 * authority shapes are assignable IN THE COMPOSITION DIRECTIONS — pinned
 * here with `null as unknown as X` assertions (no runtime code; any drift in
 * either authority fails `tsc -p tsconfig.compat.json` on every build/test
 * run).
 *
 * The two directions the mirrors deliberately do NOT claim (documented, not
 * defects — the W8-A "mirror is a VIEW" precedent):
 * - `BridgePolicyEvaluationRequest.action.actionKind` narrows the REAL
 *   `PolicyActionKind` vocabulary to the ONE literal the bridge emits
 *   (`production-request-approval`) — the bridge never vets any other
 *   action kind, so REAL→mirror would be unsound; mirror→REAL holds (every
 *   request the adapter builds is a valid REAL request).
 * - `BridgePolicyVerdict`'s `violatedConstraint: unknown | null` widens the
 *   REAL `PolicyConstraint | null` — the adapter treats the constraint
 *   declaration as opaque verbatim audit data; REAL→mirror holds (every REAL
 *   verdict satisfies the view), mirror→REAL would be unsound.
 *
 * `@mos/policy` and `@mos/missions` are NOT registry dependencies of the
 * studio module (registry deps: contracts, content, production, agents,
 * capabilities, engines, jobs, rights) — the imports below are TYPE-ONLY
 * relative-path references (the W7-B/W8-A compat precedent: no runtime
 * dependency edge is created; the boundary harness allows relative imports
 * within packages/mos-*). The RUNTIME half
 * (compat/bridge-real-authorities.test.ts) wires the REAL policy evaluation
 * authority + the REAL mission repository behind the bridge's ports and
 * runs the §24 chain end-to-end.
 */

import type {
  PolicyEvaluationRequest as RealPolicyRequest,
  PolicyEvaluationRecord as RealPolicyRecord,
  PolicyVerdict as RealPolicyVerdict,
  PolicyRuleVersionRef as RealPolicyRuleVersionRef,
} from "../../mos-policy/src/contracts/policy-evaluation.js";
import type {
  PolicyActionKind as RealPolicyActionKind,
  POLICY_ACTION_KINDS as RealPolicyActionKindsConst,
} from "../../mos-policy/src/contracts/policy-rule.js";
import type { PolicyEvaluationPort as RealPolicyPort } from "../../mos-policy/src/ports/policy-evaluation.port.js";

import type { Mission as RealMission } from "../../mos-missions/src/domain/mission.js";
import type { MissionRepository as RealMissionRepository } from "../../mos-missions/src/ports/mission-repository.js";
import type { MissionStatus as RealMissionStatus } from "../../mos-missions/src/domain/mission.js";

import type {
  BridgeMissionSnapshot,
  BridgeMissionSource,
  BridgeMissionPort,
  BridgePolicyEvaluationAuthority,
  BridgePolicyEvaluationRecord,
  BridgePolicyEvaluationRequest,
  BridgePolicyVerdict,
} from "../src/bridge/contracts/bridge-authority-ports.js";
import type { BridgePolicyRuleVersionRef } from "../src/bridge/contracts/lab-to-studio-entry.js";

// ---------------------------------------------------------------------------
// Composition-direction assertions (`null as unknown as X` — no runtime code)
// ---------------------------------------------------------------------------

/**
 * The adapter's WRITE direction: every request the gate adapter builds
 * (mirror shape, the one emitted action-kind literal) is a valid REAL
 * `PolicyEvaluationRequest`.
 */
export const mirrorPolicyRequestSatisfiesReal: RealPolicyRequest =
  null as unknown as BridgePolicyEvaluationRequest;

/**
 * The adapter's READ direction: every REAL verdict satisfies the mirrored
 * verdict view (the opaque `violatedConstraint` widening).
 */
export const realPolicyVerdictSatisfiesMirror: BridgePolicyVerdict =
  null as unknown as RealPolicyVerdict;

/**
 * The adapter's READ direction: a REAL evaluation record (which carries MORE
 * §30 context than the mirror reads) satisfies the mirrored record view.
 */
export const realPolicyRecordSatisfiesMirror: BridgePolicyEvaluationRecord =
  null as unknown as RealPolicyRecord;

/**
 * The REAL policy evaluation port instance satisfies the bridge's declared
 * evaluation authority seam — the composition root can wire the REAL
 * authority behind the port with zero adapter changes.
 */
export const realPolicyPortSatisfiesMirrorAuthority: BridgePolicyEvaluationAuthority =
  null as unknown as RealPolicyPort;

/** The citation ref shapes are mutually assignable (PolicyRef ≡ PolicyRuleId brand). */
export const realRuleVersionRefSatisfiesBridgeCitation: BridgePolicyRuleVersionRef =
  null as unknown as RealPolicyRuleVersionRef;
export const bridgeCitationSatisfiesRealRuleVersionRef: RealPolicyRuleVersionRef =
  null as unknown as BridgePolicyRuleVersionRef;

// ---------------------------------------------------------------------------
// Vocabulary pins (the frozen action-kind const carries the bridge's member)
// ---------------------------------------------------------------------------

/** The bridge's action-kind literal IS a REAL PolicyActionKind member. */
export const bridgeActionKindIsReal: RealPolicyActionKind = "production-request-approval";

/** …and the REAL frozen vocabulary const still carries it (typeof-level pin). */
export type RealActionKindUnion = (typeof RealPolicyActionKindsConst)[number];
export const bridgeActionKindMemberOfRealVocabulary: RealActionKindUnion =
  "production-request-approval" as RealActionKindUnion;

// ---------------------------------------------------------------------------
// The mission projection pins (the adapter is a pure pass-through view)
// ---------------------------------------------------------------------------

/**
 * Every REAL `Mission` record satisfies the bridge's mission snapshot
 * projection (id, tenantId, version, status, rewardSpec.version,
 * objective.statement — the REAL record carries every field and more).
 */
export const realMissionSatisfiesSnapshot: BridgeMissionSnapshot =
  null as unknown as RealMission;

/** The REAL mission status vocabulary satisfies the snapshot's status echo. */
export const realMissionStatusSatisfiesSnapshot: BridgeMissionSnapshot["status"] =
  null as unknown as RealMissionStatus;

/**
 * The REAL mission repository satisfies the bridge's structural mission
 * source seam (`getMission(id, version?)` returning the REAL record — which
 * the snapshot pin above proves satisfies the projection).
 */
export const realMissionRepositorySatisfiesSource: BridgeMissionSource =
  null as unknown as RealMissionRepository;

// ---------------------------------------------------------------------------
// Method-shape pins (the executable form of "the adapters translate, they
// never reshape" — any signature drift fails this file's compilation)
// ---------------------------------------------------------------------------

/** The bridge's mission port lookup shape (scope, ref, exact version). */
export type BridgeMissionLookupParameters = Parameters<BridgeMissionPort["getMission"]>;
/** The REAL repository lookup shape (id, optional exact version). */
export type RealMissionLookupParameters = Parameters<RealMissionRepository["getMission"]>;

/** The mirrored policy evaluate parameters/return are the adapter's shape. */
export type MirrorPolicyEvaluateParameters = Parameters<BridgePolicyEvaluationAuthority["evaluate"]>;
export type MirrorPolicyEvaluateReturn = ReturnType<BridgePolicyEvaluationAuthority["evaluate"]>;
export type RealPolicyEvaluateParameters = Parameters<RealPolicyPort["evaluate"]>;
export type RealPolicyEvaluateReturn = ReturnType<RealPolicyPort["evaluate"]>;

/**
 * The adapter's return translation is the record READ direction pinned
 * above (`realPolicyRecordSatisfiesMirror`): the REAL port's evaluate
 * return satisfies the mirrored record the adapter reads. The mirror record
 * itself is a VIEW (fewer fields than the REAL §30 record) — the reverse
 * direction is deliberately NOT claimed (a view is not a full record).
 */
export const realEvaluateReturnSatisfiesMirrorRecordView: BridgePolicyEvaluationRecord =
  null as unknown as RealPolicyEvaluateReturn;
