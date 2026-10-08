/**
 * REAL authority adapters behind the BRIDGE-001 gate ports — the studio
 * testing seam (the STUDIO-006 real-participant-authorities precedent).
 *
 * - `createRealProductionEntryPolicyGate`: translates the bridge's declared
 *   policy-gate seam onto a REAL `@mos/policy`-shaped evaluation authority
 *   (the structural mirror in bridge-authority-ports.ts is compat-pinned
 *   assignable against the REAL authority shapes in the composition
 *   directions — zero drift, compiler-enforced in compat/
 *   bridge-authority-compat.ts; the REAL runtime battery lives in
 *   compat/bridge-real-authorities.test.ts).
 * - `createRealBridgeRightsGate`: runs the REAL `@mos/rights` evaluation rule
 *   (`evaluateRights`, imported by relative dist path — the W10-C testing
 *   composition precedent) over the REAL repository's grants, exactly as the
 *   rights authority prescribes: explicit grants as data, no I/O, no URL
 *   probing (§27).
 * - `createRealBridgeMissionPort`: projects the REAL `@mos/missions`
 *   repository read surface (the `BridgeMissionSource` structural seam) onto
 *   the mission port with §31 cross-tenant ≡ unknown narrowing.
 * - `composeBridgeForTests`: one deterministic composition — the REAL studio
 *   runtime + REAL rights authority behind the rights gate + disclosed
 *   mission/policy doubles + the disclosed in-memory entry store.
 *
 * The authorities remain the authorities; the adapters translate, they never
 * invent rules, grants, consents or verdicts.
 */

import { evaluateRights } from "../../../mos-rights/dist/index.js";
import type {
  RightsGrant,
  RightsRepository,
} from "@mos/rights";
import type { IdentityId } from "@mos/identity";

import { bridge } from "./participant-authority-adapters.js";
import type { ConsentRef, RightsRef, Timestamp } from "../contracts/refs.js";
import type {
  LabToStudioRightsFrameResolution,
  LabToStudioRightsSubjectVerdict,
} from "../bridge/contracts/lab-to-studio-entry.js";
import type {
  BridgeMissionSource,
  BridgePolicyEvaluationAuthority,
  ProductionEntryPolicyCheckRequest,
  ProductionEntryPolicyGatePort,
  ProductionEntryPolicyVerdict,
  ProductionEntryCoverageRequest,
  ProductionEntryCoverageVerdict,
  ProductionEntryRightsFrameRequest,
  ProductionEntryRightsFrameVerdict,
  ProductionEntryRightsGatePort,
} from "../bridge/contracts/bridge-authority-ports.js";
import { createLabToStudioBridge, type LabToStudioBridgePort, type LabToStudioBridgeDeps } from "../bridge/lab-to-studio-bridge.js";
import type { StudioRuntime } from "../runtime/studio-runtime.js";
import type { StudioSessionDirectory } from "../ports/session-directory.port.js";
import type { StudioArtifactPackagingPort } from "../ports/artifact-packaging.port.js";
import type { BridgeMissionPort } from "../bridge/contracts/bridge-authority-ports.js";
import { createDeterministicClock } from "./compose-runtime-for-tests.js";

// ---------------------------------------------------------------------------
// The REAL policy gate adapter (translation only — total, fail-closed)
// ---------------------------------------------------------------------------

/** Options of {@link createRealProductionEntryPolicyGate}. */
export interface RealProductionEntryPolicyGateOptions {
  /** The REAL policy evaluation authority (the @mos/policy port instance). */
  readonly evaluation: BridgePolicyEvaluationAuthority;
}

/**
 * The REAL policy gate: translates the declared seam onto the policy
 * authority's evaluation surface. Verdict mapping (documented, the W6-C
 * adapter discipline):
 * - `allowed` → permitted (citing the allowing rule's canonical PolicyRef and
 *   the authority's §30 evaluation record id);
 * - `denied` → denied with the authority's attribution detail VERBATIM;
 * - `approval-required` → denied naming the approver role (the seam has NO
 *   pending state — an action requiring approval is not permitted to proceed
 *   now);
 * - `insufficient-policy` → denied (FAIL CLOSED — the authority's own
 *   vocabulary surfaced verbatim);
 * - thrown authority caller errors (unresolvable citations, malformed
 *   requests) → denied with the typed reason verbatim — the gate is TOTAL,
 *   never throws into the bridge, never permits on error.
 *
 * The citations consulted are the CHECK REQUEST's own declared set (the entry
 * request's `policy` list, verbatim, in citation order) — the adapter never
 * binds or discovers rules on its own.
 */
export function createRealProductionEntryPolicyGate(
  options: RealProductionEntryPolicyGateOptions,
): ProductionEntryPolicyGatePort {
  const verdictDenied = (
    outcome: ProductionEntryPolicyVerdict["outcome"],
    denialReason: string,
    policyRef: ProductionEntryPolicyVerdict["policyRef"],
    evaluationRef: string | null,
  ): ProductionEntryPolicyVerdict => ({
    decision: "denied",
    outcome,
    denialReason,
    policyRef,
    evaluationRef,
  });
  return {
    check(request: ProductionEntryPolicyCheckRequest): ProductionEntryPolicyVerdict {
      let record: ReturnType<BridgePolicyEvaluationAuthority["evaluate"]>;
      try {
        record = options.evaluation.evaluate({
          scope: request.scope,
          actor: request.actor,
          policy: request.policy.map((citation) => ({ id: citation.id, version: citation.version })),
          action: {
            actionKind: "production-request-approval",
            subjectRef: request.subjectRef,
            declaredSpend: request.declaredSpend,
            deadline: request.deadline === null ? undefined : request.deadline,
          },
        });
      } catch (error) {
        // The authority's typed caller error, surfaced verbatim — never a
        // permission and never an escape into the bridge.
        const reason = error instanceof Error ? error.message : String(error);
        return verdictDenied("denied", reason, null, null);
      }
      const verdict = record.verdict;
      if (verdict.outcome === "allowed") {
        return {
          decision: "permitted",
          outcome: "allowed",
          denialReason: null,
          policyRef: verdict.byRule.id,
          evaluationRef: record.id,
        };
      }
      if (verdict.outcome === "denied") {
        return verdictDenied("denied", verdict.deniedBy.detail, verdict.deniedBy.rule.id, record.id);
      }
      if (verdict.outcome === "approval-required") {
        return verdictDenied(
          "approval-required",
          `approval-required: approver role "${verdict.approverRole}" must approve the production request — ${verdict.rationale}`,
          verdict.byRule.id,
          record.id,
        );
      }
      return verdictDenied(
        "insufficient-policy",
        "insufficient-policy: no cited policy rule matched the production-request-approval action (fail closed — never a silent allow)",
        null,
        record.id,
      );
    },
  };
}

// ---------------------------------------------------------------------------
// The REAL mission adapter (the @mos/missions repository behind the port)
// ---------------------------------------------------------------------------

/** Options of {@link createRealBridgeMissionPort}. */
export interface RealBridgeMissionPortOptions {
  /**
   * The REAL mission repository read surface (satisfied by the REAL
   * `@mos/missions` `MissionRepository` — compat-pinned; the repository's
   * full `Mission` records structurally satisfy the snapshot projection).
   */
  readonly source: BridgeMissionSource;
}

/**
 * The REAL mission adapter: resolves the EXACT cited record version through
 * the repository and narrows §31 (a record owned by ANOTHER tenant is
 * `null` — unknown ≡ cross-tenant, no existence leaks). The snapshot is a
 * pure projection of the repository's own record — the adapter never
 * invents mission data.
 */
export function createRealBridgeMissionPort(
  options: RealBridgeMissionPortOptions,
): BridgeMissionPort {
  return {
    getMission(scope, missionRef, version) {
      const mission = options.source.getMission(missionRef, version);
      if (mission === null) {
        return null;
      }
      if (String(mission.tenantId) !== String(scope.tenantId)) {
        // §31: cross-tenant ≡ unknown — the bridge never learns the record
        // exists in another tenant.
        return null;
      }
      return {
        id: mission.id,
        tenantId: mission.tenantId,
        version: mission.version,
        status: mission.status,
        rewardSpec: { version: mission.rewardSpec.version },
        objective: { statement: mission.objective.statement },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// The REAL rights/assets gate adapter (evaluateRights + repository reads)
// ---------------------------------------------------------------------------

/** Options of {@link createRealBridgeRightsGate}. */
export interface RealBridgeRightsGateOptions {
  /** The REAL rights repository (the authority's read surface). */
  readonly repository: RightsRepository;
}

/** Resolve one rights grant ref to its frame-resolution status. */
function resolveGrantStatus(
  repository: RightsRepository,
  scope: { readonly tenantId: string },
  ref: RightsRef,
  now: string,
): LabToStudioRightsFrameResolution {
  const grant = repository.getRights(bridge<RightsGrant["id"]>(ref));
  if (grant === null) {
    return { ref: String(ref), kind: "rights-grant", status: "unresolved" };
  }
  if (String(grant.tenantId) !== String(scope.tenantId)) {
    // §31: cross-tenant ≡ unknown — the status never leaks WHICH foreign
    // tenant owns the record.
    return { ref: String(ref), kind: "rights-grant", status: "foreign-tenant" };
  }
  if (grant.revokedAt !== null) {
    return { ref: String(ref), kind: "rights-grant", status: "revoked" };
  }
  if (grant.expiresAt !== null && grant.expiresAt <= now) {
    return { ref: String(ref), kind: "rights-grant", status: "expired" };
  }
  return { ref: String(ref), kind: "rights-grant", status: "active" };
}

/** Resolve one consent ref to its frame-resolution status. */
function resolveConsentStatus(
  repository: RightsRepository,
  scope: { readonly tenantId: string },
  ref: ConsentRef,
): LabToStudioRightsFrameResolution {
  const consent = repository.getConsent(bridge<Parameters<RightsRepository["getConsent"]>[0]>(ref));
  if (consent === null) {
    return { ref: String(ref), kind: "consent-record", status: "unresolved" };
  }
  if (String(consent.tenantId) !== String(scope.tenantId)) {
    return { ref: String(ref), kind: "consent-record", status: "foreign-tenant" };
  }
  if (consent.revokedAt !== null) {
    return { ref: String(ref), kind: "consent-record", status: "revoked" };
  }
  return { ref: String(ref), kind: "consent-record", status: "active" };
}

/** The active in-tenant grants of a declared rights frame (the authority's data). */
function activeGrantsOf(
  repository: RightsRepository,
  scope: { readonly tenantId: string },
  rightsRefs: readonly RightsRef[],
  now: string,
): RightsGrant[] {
  const grants: RightsGrant[] = [];
  for (const ref of rightsRefs) {
    const grant = repository.getRights(bridge<RightsGrant["id"]>(ref));
    if (grant === null) {
      continue;
    }
    if (String(grant.tenantId) !== String(scope.tenantId)) {
      continue; // §31: cross-tenant ≡ unknown — contributes nothing.
    }
    if (grant.revokedAt !== null) {
      continue;
    }
    if (grant.expiresAt !== null && grant.expiresAt <= now) {
      continue;
    }
    grants.push(grant);
  }
  return grants;
}

/**
 * The REAL rights/assets gate: `resolveFrame` vets every declared reference
 * against the repository; `evaluateCoverage` runs the REAL `evaluateRights`
 * cascade per source artifact. Per-source subject derivation (documented): a
 * source artifact is evaluated under its ARTIFACT identity first, then its
 * STORAGE ref — covered when EITHER subject is granted an explicit active
 * grant for the action (the denial reason carried verbatim is the artifact
 * identity's reason; §27: no URL probing, explicit grants only).
 */
export function createRealBridgeRightsGate(
  options: RealBridgeRightsGateOptions,
): ProductionEntryRightsGatePort {
  const repository = options.repository;
  return {
    resolveFrame(request: ProductionEntryRightsFrameRequest): ProductionEntryRightsFrameVerdict {
      const resolutions: LabToStudioRightsFrameResolution[] = [];
      for (const ref of request.rightsRefs) {
        resolutions.push(resolveGrantStatus(repository, request.scope, ref, request.now));
      }
      for (const ref of request.consentRefs) {
        resolutions.push(resolveConsentStatus(repository, request.scope, ref));
      }
      const frameActive =
        resolutions.length > 0 && resolutions.every((resolution) => resolution.status === "active");
      return { resolutions, frameActive };
    },
    evaluateCoverage(request: ProductionEntryCoverageRequest): ProductionEntryCoverageVerdict {
      const grants = activeGrantsOf(repository, request.scope, request.rightsRefs, request.now);
      const verdicts: LabToStudioRightsSubjectVerdict[] = [];
      for (const source of request.sources) {
        // The REAL evaluation rule — explicit grants as data, §27.
        const byArtifact = evaluateRights({
          tenantId: bridge<Parameters<typeof evaluateRights>[0]["tenantId"]>(request.scope.tenantId),
          grantee: bridge<IdentityId>(request.actor),
          action: request.action,
          subjectRef: source.artifactId,
          grants,
          now: request.now,
        });
        if (byArtifact.verdict === "granted") {
          verdicts.push({
            subjectRef: source.artifactId,
            verdict: "granted",
            reason: null,
            grantRef: byArtifact.grantRef,
          });
          continue;
        }
        const byStorage = evaluateRights({
          tenantId: bridge<Parameters<typeof evaluateRights>[0]["tenantId"]>(request.scope.tenantId),
          grantee: bridge<IdentityId>(request.actor),
          action: request.action,
          subjectRef: source.storageRef,
          grants,
          now: request.now,
        });
        if (byStorage.verdict === "granted") {
          verdicts.push({
            subjectRef: source.artifactId,
            verdict: "granted",
            reason: null,
            grantRef: byStorage.grantRef,
          });
          continue;
        }
        verdicts.push({
          subjectRef: source.artifactId,
          verdict: "denied",
          reason: byArtifact.reason,
          grantRef: null,
        });
      }
      const allCovered = verdicts.length > 0 && verdicts.every((verdict) => verdict.verdict === "granted");
      return { verdicts, allCovered };
    },
  };
}

// ---------------------------------------------------------------------------
// The deterministic bridge test composition (REAL studio + REAL rights)
// ---------------------------------------------------------------------------

/** Options of {@link composeBridgeForTests}. */
export interface ComposeBridgeForTestsOptions {
  /** The composed studio runtime (the studio's own session authority). */
  readonly runtime: StudioRuntime;
  /** Shared deterministic clock (the runtime's own clock). */
  readonly clock: () => Timestamp;
  /** The REAL rights repository behind the rights gate. */
  readonly rightsRepository: RightsRepository;
  /** The mission authority seam (disclosed double by default). */
  readonly mission: BridgeMissionPort;
  /** The policy gate seam (disclosed double by default). */
  readonly policyGate: ProductionEntryPolicyGatePort;
  /** The session-directory observation seam (STUDIO-014). */
  readonly sessionDirectory: StudioSessionDirectory;
  /** The canonical packaging authority (STUDIO-013). */
  readonly packaging: StudioArtifactPackagingPort;
  /** Injectable entry-id factory (deterministic tests). */
  readonly nextEntryId?: () => string;
}

/** The composed bridge + the REAL rights gate (for further assertions). */
export interface ComposedBridgeForTests {
  readonly bridge: LabToStudioBridgePort;
  readonly rightsGate: ProductionEntryRightsGatePort;
}

/**
 * Compose the bridge over the REAL studio runtime + REAL rights authority
 * with disclosed mission/policy doubles — the deterministic test composition
 * for the in-package BRIDGE-001 battery.
 */
export function composeBridgeForTests(
  options: ComposeBridgeForTestsOptions,
): ComposedBridgeForTests {
  const rightsGate = createRealBridgeRightsGate({ repository: options.rightsRepository });
  const deps: LabToStudioBridgeDeps = {
    runtime: options.runtime,
    mission: options.mission,
    policyGate: options.policyGate,
    rightsGate,
    sessionDirectory: options.sessionDirectory,
    packaging: options.packaging,
    clock: options.clock ?? createDeterministicClock(),
    nextEntryId: options.nextEntryId,
  };
  const bridge = createLabToStudioBridge(deps);
  return { bridge, rightsGate };
}
