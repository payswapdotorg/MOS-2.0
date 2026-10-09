/**
 * BRIDGE-002 — the §19 Studio-output evaluation/treatment authority core.
 *
 * The Lab-side verdict over produced studio output, recorded through the
 * bridge with full attribution. A SELECTED BRIDGE-001 entry chain's packaged
 * output is evaluated through:
 *
 * 1. INTAKE (fail-closed typed validation — evaluation-validation.ts): the
 *    decision kind must be a member of the CLOSED ten-kind §19 vocabulary
 *    (rights/policy rejections are NOT kinds — §19 distinct classes; unknown
 *    kinds fail closed and record NOTHING, the W8-A discipline).
 * 2. PACKAGE resolution (STUDIO-013): the evaluated package must resolve
 *    through the canonical packaging authority at the EXACT cited version,
 *    in this tenant scope (cross-tenant ≡ unknown, §31).
 * 3. ENTRY/CANDIDATE citation: the BRIDGE-001 entry chain must resolve (at
 *    the cited version, default latest) with status `packaged` whose
 *    `packageRef` IS the cited package and whose session the package
 *    belongs to — the citation chain closes entry → package through the
 *    REAL authorities, never caller claims.
 * 4. EXPECTATIONS citation: the cited entry version carries the BRIDGE-001
 *    declared-expectations surface (simulation-based, counterfactual-labeled
 *    — lock rule 29; never evidence, §22).
 * 5. SESSION observation (STUDIO-014): the runtime's session directory has
 *    the session summary (§30 observability echo; fail closed when absent).
 * 6. DECISION cross-checks: switch-* routings cite the SAME mission the
 *    entry linked; accept-alternate-output's alternate resolves through
 *    STUDIO-013 at exact version.
 * 7. RECORD: exactly ONE immutable v1 record (W9-B D1–D5 by construction in
 *    evaluation-store.ts). A denial at ANY stage means ZERO store mutation.
 *
 * §19 treatment linkage: request-treatment and switch-* decisions reference
 * the prior package version and RESERVE an append-only linkage;
 * `recordTreatmentSuccessor` completes it by CITING the successor version
 * the studio's own path composed through STUDIO-013 — the same package
 * chain's next immutable version (a treatment successor) or the re-produced
 * output's package after a switch. The bridge NEVER packages by itself (the
 * BRIDGE-001 recordStudioPackage citation discipline).
 *
 * DECISIONS DRIVE THE CHAIN, NEVER EXECUTE IT (§24): this authority holds NO
 * runtime/engine/organization/provider surface of any kind — read-only
 * citation seams only (the entry chain, the packaging authority's exact-
 * version reads, the session directory's latest summaries). Pinned
 * structurally by the test battery (zero runtime invocations, port shape).
 *
 * Method budget: 4 public methods (architecture policy maxPublicMethods 12).
 */

import { randomUUID } from "node:crypto";

import type { IdentityRef, TenantScope } from "@mos/contracts";

import type { StudioArtifactPackagingPort } from "../../ports/artifact-packaging.port.js";
import type { StudioSessionDirectory } from "../../ports/session-directory.port.js";
import type { StudioArtifactPackageId, Timestamp } from "../../contracts/refs.js";
import type { LabToStudioBridgePort } from "../lab-to-studio-bridge.js";

import type {
  StudioEvaluationDecision,
  StudioEvaluationEntryCitation,
  StudioEvaluationObservability,
  StudioOutputEvaluationOutcome,
  StudioOutputEvaluationRecord,
  StudioOutputEvaluationRequest,
  TreatmentLinkage,
  TreatmentLinkageDirective,
  TreatmentSuccessorRecordOutcome,
} from "./contracts/studio-output-evaluation.js";
import { STUDIO_EVALUATION_BOUNDARY_STATEMENT } from "./contracts/studio-output-evaluation.js";
import { createStudioOutputEvaluationStore, type StudioOutputEvaluationStore } from "./evaluation-store.js";
import { validateStudioOutputEvaluation } from "./evaluation-validation.js";
import { isCanonicalStringRef, isPositiveInteger, isRecord } from "../validation-guards.js";

/** The switch-* decision members (§19 verdicts that route back to the Lab). */
type SwitchDecision = Extract<
  StudioEvaluationDecision,
  { readonly kind: "switch-organization" | "switch-transform" | "switch-engine" }
>;

/** Type guard: the decision is a switch-* verdict (routes back BY REFERENCE). */
function isSwitchDecision(decision: StudioEvaluationDecision): decision is SwitchDecision {
  return (
    decision.kind === "switch-organization" ||
    decision.kind === "switch-transform" ||
    decision.kind === "switch-engine"
  );
}

// ---------------------------------------------------------------------------
// The port + dependencies
// ---------------------------------------------------------------------------

/** The §19 Studio-output evaluation/treatment surface. 4 public methods (budget: 12). */
export interface StudioOutputEvaluatorPort {
  /** Record one §19 decision over a produced studio package (exact version). */
  evaluateStudioOutput(request: StudioOutputEvaluationRequest): Promise<StudioOutputEvaluationOutcome>;
  /**
   * Complete a reserved §19 treatment linkage by CITING the successor version
   * the studio's own path composed through STUDIO-013 (the bridge never
   * packages by itself). Exactly one successor completes a linkage.
   */
  recordTreatmentSuccessor(
    scope: TenantScope,
    actor: IdentityRef,
    evaluationId: string,
    successor: { readonly packageId: string; readonly version: number },
  ): Promise<TreatmentSuccessorRecordOutcome>;
  /** One evaluation version (latest, or exact) — cross-tenant ≡ unknown (§31). */
  getEvaluation(
    scope: TenantScope,
    evaluationId: string,
    version?: number,
  ): StudioOutputEvaluationRecord | undefined;
  /** Every evaluation chain's latest version of one tenant (creation order). */
  listLatestEvaluations(scope: TenantScope): readonly StudioOutputEvaluationRecord[];
}

/** Dependencies of {@link createStudioOutputEvaluator}. */
export interface StudioOutputEvaluatorDeps {
  /** The BRIDGE-001 surface (entry-chain citation reads — its own store). */
  readonly bridge: LabToStudioBridgePort;
  /** STUDIO-013: the canonical packaging authority (exact-version reads ONLY). */
  readonly packaging: StudioArtifactPackagingPort;
  /** STUDIO-014: the runtime's session-directory observation seam. */
  readonly sessionDirectory: StudioSessionDirectory;
  /** Injectable clock (deterministic tests). */
  readonly clock: () => Timestamp;
  /** Injectable evaluation-id factory (deterministic tests). */
  readonly nextEvaluationId?: () => string;
  /** Injectable store (defaults to the disclosed in-memory double). */
  readonly store?: StudioOutputEvaluationStore;
}

// ---------------------------------------------------------------------------
// The authority core
// ---------------------------------------------------------------------------

/** Create the §19 Studio-output evaluation/treatment authority (BRIDGE-002). */
export function createStudioOutputEvaluator(
  deps: StudioOutputEvaluatorDeps,
): StudioOutputEvaluatorPort & {
  /** Test inspection: the append-only evaluation store the authority composes through. */
  readonly evaluationStore: StudioOutputEvaluationStore;
} {
  const clock = deps.clock;
  const nextEvaluationId = deps.nextEvaluationId ?? (() => `sev_${randomUUID()}`);
  const store = deps.store ?? createStudioOutputEvaluationStore();

  /** The reserved §19 linkage of a treatment-creating decision (null otherwise). */
  const reserveLinkage = (
    decision: StudioEvaluationDecision,
    priorPackageRef: { packageId: StudioArtifactPackageId; version: number },
  ): TreatmentLinkage | null => {
    if (decision.kind === "request-treatment") {
      const directive: TreatmentLinkageDirective = {
        kind: "request-treatment",
        rationale: decision.treatment.rationale,
        treatment: decision.treatment,
      };
      return {
        phase: "awaiting-successor",
        decisionKind: "request-treatment",
        priorPackageRef,
        directive,
        reservedAt: clock(),
      };
    }
    if (isSwitchDecision(decision)) {
      const directive: TreatmentLinkageDirective = {
        kind: decision.kind,
        rationale: decision.routing.rationale,
        routing: decision.routing,
      };
      return {
        phase: "awaiting-successor",
        decisionKind: decision.kind,
        priorPackageRef,
        directive,
        reservedAt: clock(),
      };
    }
    return null;
  };

  async function evaluateStudioOutput(
    request: StudioOutputEvaluationRequest,
  ): Promise<StudioOutputEvaluationOutcome> {
    // — 1. INTAKE (fail-closed typed validation; nothing recorded) —
    const validated = validateStudioOutputEvaluation(request);
    if (!validated.ok) {
      return { ok: false, error: validated.failure };
    }
    const citation = request.evaluatedPackage;

    // — 2. PACKAGE resolution (STUDIO-013, exact version, tenant-scoped) —
    const resolvedPackage = deps.packaging.getArtifactPackage(
      request.scope,
      citation.packageId as StudioArtifactPackageId,
      citation.version,
    );
    if (resolvedPackage === undefined) {
      return {
        ok: false,
        error: {
          kind: "package-unresolved",
          reason: `package ${String(citation.packageId)}@v${String(citation.version)} does not resolve through the canonical packaging authority in this tenant scope (unknown ≡ cross-tenant, §31)`,
        },
      };
    }

    // — 3. ENTRY/CANDIDATE citation (the BRIDGE-001 chain, at the cited version) —
    const entry = deps.bridge.getEntry(request.scope, request.entryId, request.entryVersion);
    if (entry === undefined) {
      return {
        ok: false,
        error: {
          kind: "entry-unresolved",
          reason: `entry ${request.entryId}${request.entryVersion === undefined ? "" : `@v${String(request.entryVersion)}`} does not resolve in this tenant scope (cross-tenant ≡ unknown, §31)`,
        },
      };
    }
    if (entry.status !== "packaged" || entry.studio === null) {
      // §19 distinct classes: a denied/entered entry has NO produced output to
      // evaluate — and a §24 gate denial (rights/policy) can NEVER become an
      // evaluation verdict of any kind.
      return {
        ok: false,
        error: {
          kind: "entry-not-packaged",
          reason: `the cited entry version's status is "${entry.status}" — only a packaged entry (a studio package cited through the studio's own review path) has an evaluable output; §24 gate denials are not §19 verdicts`,
        },
      };
    }
    if (entry.mission === null || entry.packageRef === null) {
      return {
        ok: false,
        error: {
          kind: "entry-not-packaged",
          reason: "the cited packaged entry version is structurally incomplete (missing mission linkage or package citation) — surfaced fail-closed, never bypassed",
        },
      };
    }
    if (
      String(entry.packageRef.packageId) !== String(citation.packageId) ||
      entry.packageRef.version !== citation.version
    ) {
      return {
        ok: false,
        error: {
          kind: "package-citation-mismatch",
          reason: `the cited entry version's packageRef (${String(entry.packageRef.packageId)}@v${String(entry.packageRef.version)}) is not the cited evaluated package ${String(citation.packageId)}@v${String(citation.version)} — the citation chain must close through the entry's own recorded package`,
        },
      };
    }
    if (String(resolvedPackage.sessionRef) !== String(entry.studio.sessionRef)) {
      return {
        ok: false,
        error: {
          kind: "package-citation-mismatch",
          reason: `the resolved package belongs to session ${String(resolvedPackage.sessionRef)} while the entry recorded session ${String(entry.studio.sessionRef)} — the citation chain does not close`,
        },
      };
    }

    // — 4. EXPECTATIONS citation (the BRIDGE-002 consumption surface, rule 29) —
    if (entry.expectations === null) {
      return {
        ok: false,
        error: {
          kind: "expectations-unavailable",
          reason: "the cited entry version carries no declared expectations (the BRIDGE-002 consumption surface) — an evaluation never proceeds expectations-blind",
        },
      };
    }

    // — 5. SESSION observation (STUDIO-014; §30 echo; fail closed) —
    const summary = deps.sessionDirectory.getSessionSummary(request.scope, entry.studio.sessionRef);
    if (summary === undefined) {
      return {
        ok: false,
        error: {
          kind: "session-summary-unresolved",
          reason: `the runtime's session directory has no summary on record for session ${String(entry.studio.sessionRef)} in this tenant scope`,
        },
      };
    }
    if (
      String(summary.organizationRef.id) !== String(entry.studio.organizationRef.id) ||
      summary.organizationRef.version !== entry.studio.organizationRef.version
    ) {
      return {
        ok: false,
        error: {
          kind: "package-citation-mismatch",
          reason: `the session directory reports organization ${String(summary.organizationRef.id)}@v${String(summary.organizationRef.version)} while the entry recorded ${String(entry.studio.organizationRef.id)}@v${String(entry.studio.organizationRef.version)} — the citation chain does not close`,
        },
      };
    }

    // — 6. DECISION cross-checks (payload semantics over resolved records) —
    const decision = request.decision;
    if (isSwitchDecision(decision)) {
      if (String(decision.routing.missionRef) !== String(entry.mission.missionRef)) {
        return {
          ok: false,
          error: {
            kind: "routing-mission-mismatch",
            reason: `the ${decision.kind} routing cites mission ${String(decision.routing.missionRef)} while the entry linked mission ${String(entry.mission.missionRef)} — a switch verdict routes back to the SAME mission's Lab surface`,
          },
        };
      }
    }
    if (decision.kind === "accept-alternate-output") {
      const alternate = deps.packaging.getArtifactPackage(
        request.scope,
        decision.alternate.packageId as StudioArtifactPackageId,
        decision.alternate.version,
      );
      if (alternate === undefined) {
        return {
          ok: false,
          error: {
            kind: "alternate-package-unresolved",
            reason: `the alternate output ${String(decision.alternate.packageId)}@v${String(decision.alternate.version)} does not resolve through the canonical packaging authority in this tenant scope`,
          },
        };
      }
    }

    // — 7. RECORD (exactly ONE immutable v1 append; verbatim citations) —
    const evaluationId = nextEvaluationId();
    const entryCitation: StudioEvaluationEntryCitation = {
      entryId: entry.id,
      entryVersion: entry.version,
      candidate: entry.candidate,
      mission: entry.mission,
      studio: entry.studio,
    };
    const observability: StudioEvaluationObservability = {
      evaluationId,
      entryId: entry.id,
      sessionRef: resolvedPackage.sessionRef,
      formatRef: entry.studio.formatRef,
      organizationRef: entry.studio.organizationRef,
      transformChain: entry.candidate.transformChain.map((step) => ({
        definitionId: step.definitionId,
        definitionVersion: step.definitionVersion,
      })),
      finalArtifactIds: resolvedPackage.finalArtifacts.map((artifact) => String(artifact.artifactId)),
      cost: {
        currency: resolvedPackage.cost.total.currency,
        amount: resolvedPackage.cost.total.amount,
      },
      durationSeconds: resolvedPackage.duration.totalWallClockSeconds,
      sessionLifecycleState: summary.lifecycleState,
      missionRef: { id: String(entry.mission.missionRef), version: entry.mission.missionVersion },
      evaluatedAt: clock(),
    };
    const record: StudioOutputEvaluationRecord = {
      id: evaluationId,
      scope: { tenantId: request.scope.tenantId, workspaceId: request.scope.workspaceId },
      actor: request.actor,
      createdAt: clock(),
      status: "decided",
      decision,
      evaluatedPackage: {
        packageId: resolvedPackage.id,
        version: resolvedPackage.version,
        sessionRef: resolvedPackage.sessionRef,
      },
      entryCitation,
      expectations: entry.expectations,
      treatmentLinkage: reserveLinkage(decision, {
        packageId: resolvedPackage.id,
        version: resolvedPackage.version,
      }),
      observability,
      notes: request.notes ?? null,
      boundaryStatement: STUDIO_EVALUATION_BOUNDARY_STATEMENT,
      version: 1,
      priorVersion: null,
    };
    const stored = store.appendFirstVersion(record);
    return { ok: true, value: { evaluation: stored } };
  }

  async function recordTreatmentSuccessor(
    scope: TenantScope,
    actor: IdentityRef,
    evaluationId: string,
    successor: { readonly packageId: string; readonly version: number },
  ): Promise<TreatmentSuccessorRecordOutcome> {
    // — caller-shape validation (nothing recorded) —
    if (!isRecord(scope) || !isCanonicalStringRef(scope.tenantId)) {
      return {
        ok: false,
        failure: { kind: "invalid-successor-request", reason: "scope.tenantId must be a non-blank string primitive (§31)" },
      };
    }
    if (!isCanonicalStringRef(actor) || !isCanonicalStringRef(evaluationId)) {
      return {
        ok: false,
        failure: { kind: "invalid-successor-request", reason: "actor and evaluationId must be non-blank string primitives (§30 attribution)" },
      };
    }
    if (!isCanonicalStringRef(successor.packageId) || !isPositiveInteger(successor.version)) {
      return {
        ok: false,
        failure: { kind: "invalid-successor-request", reason: "the successor citation must carry a non-blank packageId and an exact positive integer version" },
      };
    }
    // — the evaluation chain resolves in this tenant (cross-tenant ≡ unknown) —
    const evaluation = store.getEvaluation(scope, evaluationId);
    if (evaluation === undefined) {
      return {
        ok: false,
        failure: { kind: "evaluation-unresolved", reason: "no evaluation chain resolves for this tenant scope (cross-tenant ≡ unknown, §31)" },
      };
    }
    const linkage = evaluation.treatmentLinkage;
    if (linkage === null) {
      return {
        ok: false,
        failure: { kind: "linkage-not-open", reason: `the ${String(evaluation.decision.kind)} decision creates no treatment linkage (only request-treatment and switch-* do)` },
      };
    }
    if (linkage.phase === "linked") {
      return {
        ok: false,
        failure: { kind: "linkage-already-completed", reason: `successor ${String(linkage.successorPackageRef.packageId)}@v${String(linkage.successorPackageRef.version)} already completed this linkage (append-only — exactly one successor)` },
      };
    }
    // — the successor resolves through STUDIO-013 at the exact cited version —
    const resolvedSuccessor = deps.packaging.getArtifactPackage(
      scope,
      successor.packageId as StudioArtifactPackageId,
      successor.version,
    );
    if (resolvedSuccessor === undefined) {
      return {
        ok: false,
        failure: { kind: "successor-package-unresolved", reason: `successor ${String(successor.packageId)}@v${String(successor.version)} does not resolve through the canonical packaging authority in this tenant scope` },
      };
    }
    // — linkage verification (the verifiable §19 old → new chain) —
    const prior = linkage.priorPackageRef;
    const samePackageId = String(successor.packageId) === String(prior.packageId);
    if (samePackageId && successor.version <= prior.version) {
      return {
        ok: false,
        failure: { kind: "successor-not-linked", reason: `successor ${String(successor.packageId)}@v${String(successor.version)} is not a LATER immutable version of package ${String(prior.packageId)} (prior v${String(prior.version)}) — treatment creates a NEW version, never rewrites` },
      };
    }
    if (
      samePackageId &&
      String(resolvedSuccessor.sessionRef) !== String(evaluation.evaluatedPackage.sessionRef)
    ) {
      return {
        ok: false,
        failure: { kind: "successor-not-linked", reason: `the treatment successor belongs to session ${String(resolvedSuccessor.sessionRef)} while the prior version belongs to session ${String(evaluation.evaluatedPackage.sessionRef)} — the same-chain successor must stay in the producing session` },
      };
    }
    const successorKind = samePackageId ? "treatment-successor" : "re-produced-output";
    const appended = store.appendTreatmentLinkage(scope, evaluationId, {
      successorKind,
      packageId: String(resolvedSuccessor.id),
      version: resolvedSuccessor.version,
      sessionRef: resolvedSuccessor.sessionRef,
      linkedBy: actor,
      linkedAt: clock(),
    });
    if (!appended.ok) {
      return { ok: false, failure: { kind: "successor-store-rejection", reason: appended.reason } };
    }
    return { ok: true, value: { evaluation: appended.record } };
  }

  return {
    evaluateStudioOutput,
    recordTreatmentSuccessor,
    getEvaluation: (scope, evaluationId, version) => store.getEvaluation(scope, evaluationId, version),
    listLatestEvaluations: (scope) => store.listLatestEvaluations(scope),
    evaluationStore: store,
  };
}
