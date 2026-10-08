/**
 * BRIDGE-001 authority gate ports — the declared seams the Lab → Studio
 * bridge consults BEFORE any studio surface invocation (§24: the
 * Mission → Policy/Rights/Assets segments precede Production/Studio).
 *
 * Registry-exactness (the W6-C/W8-A declared-seam precedent): `@mos/missions`
 * and `@mos/policy` are NOT registry dependencies of the studio module
 * (registry deps: contracts, content, production, agents, capabilities,
 * engines, jobs, rights), so the bridge reaches them through STUDIO-OWNED
 * declared ports whose shapes are pinned against the REAL authority shapes at
 * compile time (compat/bridge-authority-compat.ts — relative TYPE-ONLY
 * imports, no runtime dependency edge) and proven end-to-end at runtime
 * (compat/bridge-real-authorities.test.ts wires the REAL authorities behind
 * these ports). `@mos/rights` IS a registry dependency — its types are
 * imported directly here.
 *
 * GATE ORDER (the W6-C/W8-A distribution gate-ordering discipline applied at
 * the bridge, in the §24 chain's own order): policy → rights frame → assets
 * coverage — every gate PRECEDES any studio runtime invocation, every verdict
 * is fail-closed (denial reasons verbatim), and a denial means ZERO studio
 * calls (test-pinned with an invocation-counting spy).
 */

import type {
  IdentityRef,
  MissionRef,
  MoneyAmount,
  PolicyRef,
  TenantId,
  TenantScope,
  Version,
} from "@mos/contracts";
import type { RightsAction } from "@mos/rights";

import type { ConsentRef, RightsRef, Timestamp as StudioTimestamp } from "../../contracts/refs.js";
import type {
  LabToStudioRightsFrameResolution,
  LabToStudioRightsSubjectVerdict,
} from "./lab-to-studio-entry.js";
import type { BridgePolicyRuleVersionRef } from "./lab-to-studio-entry.js";

// ---------------------------------------------------------------------------
// The Mission segment (versioned linkage — @mos/missions behind the port)
// ---------------------------------------------------------------------------

/**
 * The mission snapshot the bridge consumes — a DECLARED PROJECTION of the
 * REAL `@mos/missions` `Mission` authority shape (id, tenantId, version,
 * status, reward spec version, objective statement): the linkage needs
 * exactly these fields, and the compat pin proves every REAL Mission record
 * satisfies this view unchanged (the adapter is a pure pass-through
 * projection — it never invents mission data).
 */
export interface BridgeMissionSnapshot {
  readonly id: MissionRef;
  readonly tenantId: TenantId;
  /** Mission record version (starts at 1, bumped on every mutation). */
  readonly version: number;
  readonly status: string;
  /** The mission's independently versioned reward spec (§21). */
  readonly rewardSpec: { readonly version: number };
  /** The declared objective statement. */
  readonly objective: { readonly statement: string };
}

/**
 * The mission authority seam. 1 public method (policy budget: 12). Resolves
 * the EXACT cited record version; unknown ≡ cross-tenant (§31 — no existence
 * leaks), both return `null`.
 */
export interface BridgeMissionPort {
  /**
   * Fetch the mission at the EXACT record version, or `null` when unknown in
   * this tenant scope (cross-tenant ≡ unknown).
   */
  getMission(
    scope: TenantScope,
    missionRef: MissionRef,
    version: number,
  ): BridgeMissionSnapshot | null;
}

/**
 * The structural mission-source seam the REAL adapter (src/testing/
 * real-bridge-authorities.ts) consumes: the subset of a REAL `@mos/missions`
 * mission repository read surface the linkage needs (`getMission` at the
 * latest or EXACT record version). The REAL repository's `Mission` carries
 * every snapshot field and more, so the REAL repository satisfies this
 * structurally — compat-pinned in compat/bridge-authority-compat.ts
 * (relative TYPE-ONLY imports, no runtime dependency edge; the runtime
 * battery lives in compat/bridge-real-authorities.test.ts).
 */
export interface BridgeMissionSource {
  /** Fetch one mission by id (latest, or the EXACT record version), or `null` when unknown. */
  getMission(id: MissionRef, version?: number): BridgeMissionSnapshot | null;
}

// ---------------------------------------------------------------------------
// The Policy segment (the W6-C-style declared gate seam — @mos/policy behind
// the port through the REAL PolicyEvaluationPort adapter)
// ---------------------------------------------------------------------------

/** One policy evaluation the bridge requests before any studio invocation. */
export interface ProductionEntryPolicyCheckRequest {
  /** Tenant scope of the action (policy is tenant-scoped, §31). */
  readonly scope: TenantScope;
  /** §30 actor — the principal whose action the policy governs. */
  readonly actor: IdentityRef;
  /** The declared subject (the production request id, documented derivation). */
  readonly subjectRef: string;
  /**
   * The caller's DECLARED citation set consulted at this check — exact
   * versions, in citation order (the entry request's own `policy` list; the
   * gate never discovers rules on its own, and an empty list always fails
   * closed as `insufficient-policy`).
   */
  readonly policy: readonly BridgePolicyRuleVersionRef[];
  /** The declared spend (the candidate request's canonical budget limit). */
  readonly declaredSpend?: MoneyAmount;
  /** The declared deadline (the candidate request's canonical deadline). */
  readonly deadline?: StudioTimestamp | null;
}

/**
 * The fail-closed verdict of one production-entry policy check. `permitted`
 * arises ONLY from the authority's `allowed` verdict; `denied` carries the
 * authority's attribution VERBATIM (approval-required and insufficient-policy
 * both map to denied — the seam has no pending state, the W6-C documented
 * design call; the named role / fail-closed vocabulary rides the reason).
 */
export interface ProductionEntryPolicyVerdict {
  readonly decision: "permitted" | "denied";
  /** The authority's own outcome vocabulary, echoed verbatim. */
  readonly outcome: "allowed" | "denied" | "approval-required" | "insufficient-policy";
  /** The authority's denial attribution, VERBATIM (null when permitted). */
  readonly denialReason: string | null;
  /** The canonical policy ref the verdict cites (allowing or denying rule). */
  readonly policyRef: PolicyRef | null;
  /** The authority's §30 evaluation record id (its own audit log). */
  readonly evaluationRef: string | null;
}

/** The declared policy-gate seam. 1 public method (policy budget: 12). */
export interface ProductionEntryPolicyGatePort {
  /** Evaluate one production-entry policy request — FAIL CLOSED. */
  check(request: ProductionEntryPolicyCheckRequest): ProductionEntryPolicyVerdict;
}

// ---------------------------------------------------------------------------
// The structural mirror of @mos/policy's evaluation surface (the REAL adapter
// consumes this; compat-pinned mutually assignable — zero drift)
// ---------------------------------------------------------------------------

/**
 * The structural subset of the REAL `@mos/policy` evaluation surface the
 * bridge's REAL adapter (src/testing/real-bridge-authorities.ts) consumes.
 * Every field uses the CANONICAL `@mos/contracts` brands (`PolicyRef` ≡ the
 * authority's `PolicyRuleId`, `Version`, `MoneyAmount`, `Timestamp`), so the
 * mirror is assignable with the REAL authority shapes in the directions the
 * composition uses — pinned at compile time in compat/
 * bridge-authority-compat.ts (relative type-only imports, the W8-A
 * zero-drift precedent): the REQUEST the adapter builds satisfies the REAL
 * `PolicyEvaluationRequest`, and the REAL verdict/record satisfy the mirror
 * the adapter reads. No runtime dependency edge exists.
 */
export interface BridgePolicyEvaluationRequest {
  readonly scope: TenantScope;
  readonly actor: IdentityRef;
  readonly policy: readonly { readonly id: PolicyRef; readonly version: Version }[];
  readonly action: {
    /** The §24 chain step this bridge vets (the closed vocabulary member). */
    readonly actionKind: "production-request-approval";
    readonly subjectRef: string;
    readonly declaredSpend?: MoneyAmount;
    readonly deadline?: StudioTimestamp;
  };
}

/** The mirrored verdict union (outcome-literal discrimination, verbatim). */
export type BridgePolicyVerdict =
  | {
      readonly outcome: "allowed";
      readonly byRule: { readonly id: PolicyRef; readonly version: Version };
      readonly rationale: string;
    }
  | {
      readonly outcome: "denied";
      readonly deniedBy: {
        readonly rule: { readonly id: PolicyRef; readonly version: Version };
        readonly violatedConstraint: unknown | null;
        readonly deniedByEffect: boolean;
        readonly rationale: string;
        readonly detail: string;
      };
    }
  | {
      readonly outcome: "approval-required";
      readonly byRule: { readonly id: PolicyRef; readonly version: Version };
      readonly approverRole: string;
      readonly rationale: string;
    }
  | {
      readonly outcome: "insufficient-policy";
      readonly consulted: readonly { readonly id: PolicyRef; readonly version: Version }[];
    };

/** The mirrored evaluation record (the fields the gate adapter reads). */
export interface BridgePolicyEvaluationRecord {
  /** The authority's §30 evaluation id. */
  readonly id: string;
  readonly verdict: BridgePolicyVerdict;
}

/**
 * The structural policy-evaluation authority param the REAL adapter accepts
 * (satisfied by the REAL `PolicyEvaluationPort` instance — assignability is
 * compat-pinned; evaluation caller errors are the adapter's concern, never
 * permitted).
 */
export interface BridgePolicyEvaluationAuthority {
  evaluate(request: BridgePolicyEvaluationRequest): BridgePolicyEvaluationRecord;
}

// ---------------------------------------------------------------------------
// The Rights + Assets segments (@mos/rights IS a registry dependency — the
// REAL types are imported directly; the REAL adapter lives in src/testing)
// ---------------------------------------------------------------------------

/** The declared rights frame the candidate request runs under (canonical). */
export interface ProductionEntryRightsFrameRequest {
  readonly scope: TenantScope;
  /** §30 actor — the grantee the coverage is evaluated for. */
  readonly actor: IdentityRef;
  /** The canonical rightsContext refs (rights grants + consent records). */
  readonly rightsRefs: readonly RightsRef[];
  readonly consentRefs: readonly ConsentRef[];
  /** Evaluation "now" (ISO-8601; expiry is exclusive). */
  readonly now: string;
}

/** The rights frame verdict: per-reference resolutions (verbatim statuses). */
export interface ProductionEntryRightsFrameVerdict {
  readonly resolutions: readonly LabToStudioRightsFrameResolution[];
  /** True only when every declared reference is active in this tenant. */
  readonly frameActive: boolean;
}

/** The per-source-artifact coverage request (the Assets segment). */
export interface ProductionEntryCoverageRequest {
  readonly scope: TenantScope;
  readonly actor: IdentityRef;
  /**
   * The action the production performs over the sources — derived from the
   * candidate's transform chain (`transform` when non-empty, else `use`);
   * documented derivation, never caller-claimed.
   */
  readonly action: RightsAction;
  /**
   * The source artifacts (§27 — public URLs never imply rights): each
   * carries its artifact identity AND storage ref, the two subject shapes an
   * explicit grant may name. The authority implementation documents its
   * per-source subject derivation (a source is covered when ANY of its
   * identity subjects is granted).
   */
  readonly sources: readonly {
    readonly artifactId: string;
    readonly storageRef: string;
  }[];
  /** The declared rights frame's grants (resolved by the authority). */
  readonly rightsRefs: readonly RightsRef[];
  readonly now: string;
}

/** The assets coverage verdict: per-source verdicts (reasons verbatim). */
export interface ProductionEntryCoverageVerdict {
  readonly verdicts: readonly LabToStudioRightsSubjectVerdict[];
  /** True only when every source artifact is explicitly covered. */
  readonly allCovered: boolean;
}

/**
 * The rights/assets gate seam over the REAL rights authority. 2 public
 * methods (policy budget: 12). `resolveFrame` vets the declared frame;
 * `evaluateCoverage` runs the REAL `evaluateRights` cascade per source
 * artifact (denial reasons verbatim: no-explicit-grant / subject-not-covered
 * / grantee-not-covered / action-not-covered / grant-revoked /
 * grant-expired).
 */
export interface ProductionEntryRightsGatePort {
  /** Resolve the declared rights frame — every ref must be active in-tenant. */
  resolveFrame(request: ProductionEntryRightsFrameRequest): ProductionEntryRightsFrameVerdict;
  /** Evaluate per-source-artifact coverage under the declared action. */
  evaluateCoverage(request: ProductionEntryCoverageRequest): ProductionEntryCoverageVerdict;
}
