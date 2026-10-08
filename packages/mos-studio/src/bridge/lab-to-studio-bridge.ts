/**
 * BRIDGE-001 — the Lab → Studio bridge core (the §24 boundary chain's
 * Lab→Mission→Policy/Rights/Assets→Production/Studio segment).
 *
 * A SELECTED LAB-016 candidate becomes a studio-side production entry
 * through:
 * 1. INTAKE (fail-closed typed validation — bridge-validation.ts): the
 *    candidate must be the search result's OWN entry, versioned and
 *    provenance'd; nothing attributable happened on a caller-shape failure,
 *    so nothing is recorded (the W8-A discipline).
 * 2. MISSION linkage: the versioned citation resolves through the mission
 *    authority port (@mos/missions behind it) at the EXACT record version;
 *    unknown ≡ cross-tenant; a non-active mission fails closed.
 * 3. POLICY gate (§24 order — the W6-C/W8-A distribution gate-ordering
 *    discipline applied here): the REAL policy authority behind the declared
 *    gate port vets the production-request-approval action. GATES PRECEDE
 *    ANY studio invocation: a denial means ZERO studio runtime calls
 *    (test-pinned with an invocation-counting spy).
 * 4. RIGHTS gate: the declared rights frame resolves — every cited grant and
 *    consent record is active in this tenant.
 * 5. ASSETS gate: every source artifact is explicitly covered (the REAL
 *    `evaluateRights` cascade behind the port — denial reasons verbatim,
 *    §27: public URL accessibility never implies rights).
 * 6. PRODUCTION/STUDIO entry through the studio's OWN authorities: the
 *    runtime's `createSession` (production-request entry mode, supplier kind
 *    `lab`) and `loadOrganization` (STUDIO-007, the EXACT cited version) —
 *    the bridge never writes artifacts, never touches session internals,
 *    never packages (STUDIO-013 composes when the studio's own review path
 *    accepts; `recordStudioPackage` only CITES what the runtime's session
 *    directory published and the packaging authority resolved).
 *
 * Records: versioned, tenant-scoped, append-only (bridge-entry-store.ts,
 * W9-B D1–D5 by construction). Every attributable attempt — gate denial or
 * studio failure included — appends exactly one record with the authority's
 * denial attribution VERBATIM.
 *
 * Method budget: 4 public methods (architecture policy maxPublicMethods 12).
 */

import { randomUUID } from "node:crypto";

import type { TenantScope } from "@mos/contracts";

import type { StudioRuntime } from "../runtime/studio-runtime.js";
import type { StudioSession } from "../contracts/studio-session.js";
import type { StudioSessionDirectory } from "../ports/session-directory.port.js";
import type { StudioArtifactPackagingPort } from "../ports/artifact-packaging.port.js";
import type {
  StudioArtifactPackageId,
  StudioSessionId,
  Timestamp,
} from "../contracts/refs.js";
import type { SessionIntakeForValidation } from "../contracts/studio-format.js";
import type { CreateStudioSessionInput } from "../runtime/intake-types.js";

import type {
  LabToStudioAssetsGateRecord,
  LabToStudioEntryOutcome,
  LabToStudioEntryRequest,
  LabToStudioFailureStage,
  LabToStudioMissionLinkage,
  LabToStudioPolicyGateRecord,
  LabToStudioProductionEntry,
  LabToStudioRightsGateRecord,
  LabToStudioStudioEntry,
} from "./contracts/lab-to-studio-entry.js";
import { LAB_TO_STUDIO_BOUNDARY_STATEMENT } from "./contracts/lab-to-studio-entry.js";
import type {
  BridgeMissionPort,
  ProductionEntryPolicyGatePort,
  ProductionEntryRightsGatePort,
} from "./contracts/bridge-authority-ports.js";
import { validateLabToStudioEntry } from "./bridge-validation.js";
import { createLabToStudioEntryStore, type LabToStudioEntryStore } from "./bridge-entry-store.js";
import {
  labCandidateRefOf,
  projectStudioRequestView,
} from "./studio-request-projection.js";

// ---------------------------------------------------------------------------
// The port + dependencies
// ---------------------------------------------------------------------------

/** Failure model of {@link LabToStudioBridgePort.recordStudioPackage}. */
export type LabToStudioPackageRecordFailure =
  | { readonly kind: "entry-not-found"; readonly reason: string }
  | { readonly kind: "entry-not-entered"; readonly reason: string }
  | { readonly kind: "session-summary-unresolved"; readonly reason: string }
  | { readonly kind: "session-not-packaged"; readonly reason: string }
  | { readonly kind: "package-unresolved"; readonly reason: string }
  | { readonly kind: "store-rejection"; readonly reason: string };

/** The Lab → Studio bridge surface. 4 public methods (budget: 12). */
export interface LabToStudioBridgePort {
  /** Run the §24 chain: intake → mission → policy → rights → assets → studio. */
  enterProduction(request: LabToStudioEntryRequest): Promise<LabToStudioEntryOutcome>;
  /** Cite the package the studio's OWN review path composed for an entered entry. */
  recordStudioPackage(
    scope: TenantScope,
    entryId: string,
  ): Promise<
    | { readonly ok: true; readonly value: { readonly entry: LabToStudioProductionEntry } }
    | { readonly ok: false; readonly failure: LabToStudioPackageRecordFailure }
  >;
  /** One entry version (latest, or exact) — cross-tenant ≡ unknown (§31). */
  getEntry(
    scope: TenantScope,
    entryId: string,
    version?: number,
  ): LabToStudioProductionEntry | undefined;
  /** Every entry chain's latest version of one tenant (creation order). */
  listLatestEntries(scope: TenantScope): readonly LabToStudioProductionEntry[];
}

/** Dependencies of {@link createLabToStudioBridge}. */
export interface LabToStudioBridgeDeps {
  /** The studio runtime (the studio's own session authority — never bypassed). */
  readonly runtime: StudioRuntime;
  /** The mission authority seam (@mos/missions behind it). */
  readonly mission: BridgeMissionPort;
  /** The policy gate seam (@mos/policy behind it). */
  readonly policyGate: ProductionEntryPolicyGatePort;
  /** The rights/assets gate seam (@mos/rights behind it — registry dep). */
  readonly rightsGate: ProductionEntryRightsGatePort;
  /** STUDIO-014: the runtime's own session-directory observation seam. */
  readonly sessionDirectory: StudioSessionDirectory;
  /** STUDIO-013: the canonical packaging authority (browsing reads only). */
  readonly packaging: StudioArtifactPackagingPort;
  /** Injectable clock (deterministic tests). */
  readonly clock: () => Timestamp;
  /** Injectable entry-id factory (deterministic tests). */
  readonly nextEntryId?: () => string;
  /** Injectable store (defaults to the disclosed in-memory double). */
  readonly store?: LabToStudioEntryStore;
}

// ---------------------------------------------------------------------------
// The bridge core
// ---------------------------------------------------------------------------

/** Create the Lab → Studio bridge (BRIDGE-001). */
export function createLabToStudioBridge(deps: LabToStudioBridgeDeps): LabToStudioBridgePort & {
  /** Test inspection: the append-only entry store the bridge composes through. */
  readonly entryStore: LabToStudioEntryStore;
} {
  const clock = deps.clock;
  const nextEntryId = deps.nextEntryId ?? (() => `lts_${randomUUID()}`);
  const store = deps.store ?? createLabToStudioEntryStore();

  /** The record factory: one immutable draft for a given chain state. */
  const draftOf = (input: {
    id: string;
    request: LabToStudioEntryRequest;
    citation: LabToStudioProductionEntry["candidate"];
    mission: LabToStudioMissionLinkage | null;
    policyGate: LabToStudioPolicyGateRecord | null;
    rightsGate: LabToStudioRightsGateRecord | null;
    assetsGate: LabToStudioAssetsGateRecord | null;
    studio: LabToStudioStudioEntry | null;
    expectations: LabToStudioProductionEntry["expectations"];
    status: LabToStudioProductionEntry["status"];
    denial: LabToStudioProductionEntry["denial"];
  }): LabToStudioProductionEntry => ({
    id: input.id,
    scope: { tenantId: input.request.scope.tenantId, workspaceId: input.request.scope.workspaceId },
    actor: input.request.actor,
    createdAt: clock(),
    status: input.status,
    denial: input.denial,
    candidate: input.citation,
    mission: input.mission,
    policyGate: input.policyGate,
    rightsGate: input.rightsGate,
    assetsGate: input.assetsGate,
    studio: input.studio,
    expectations: input.expectations,
    packageRef: null,
    boundaryStatement: LAB_TO_STUDIO_BOUNDARY_STATEMENT,
    version: 1,
    priorVersion: null,
  });


  /**
   * Append ONE denied/entry-failed record (the §30-attributable attempt —
   * the authority's denial reason rides the record VERBATIM) and return the
   * immutable stored record. The typed failure VALUE is constructed at each
   * call site with LITERAL kind↔stage correlation — the discriminated union's
   * own literal pairs (policy-gate-denied↔"policy-gate",
   * rights-gate-denied↔"rights-gate", assets-gate-denied↔"assets-gate",
   * studio-entry-failed↔"studio-entry") — never a broadened union, never a
   * cast between unrelated types.
   */
  const appendOutcomeRecord = (
    chain: {
      id: string;
      request: LabToStudioEntryRequest;
      citation: LabToStudioProductionEntry["candidate"];
      mission: LabToStudioMissionLinkage;
      policyGate: LabToStudioPolicyGateRecord | null;
      rightsGate: LabToStudioRightsGateRecord | null;
      assetsGate: LabToStudioAssetsGateRecord | null;
      studio: LabToStudioStudioEntry | null;
      expectations: LabToStudioProductionEntry["expectations"];
    },
    stage: LabToStudioFailureStage,
    status: "denied" | "studio-entry-failed",
    reason: string,
  ): LabToStudioProductionEntry =>
    store.appendFirstVersion(draftOf({ ...chain, status, denial: { stage, reason } }));

  async function enterProduction(
    request: LabToStudioEntryRequest,
  ): Promise<LabToStudioEntryOutcome> {
    // — 1. INTAKE (fail-closed typed validation; nothing recorded) —
    const validated = validateLabToStudioEntry(request);
    if (!validated.ok) {
      return { ok: false, error: validated.failure };
    }
    const value = validated.value;
    const entryId = nextEntryId();

    // — 2. MISSION linkage (versioned citation; nothing recorded on failure) —
    const missionRef = request.searchResult.missionRef;
    const mission = deps.mission.getMission(request.scope, missionRef, request.missionVersion);
    if (mission === null) {
      return {
        ok: false,
        error: {
          kind: "mission-unresolved",
          reason: `mission ${String(missionRef)}@v${request.missionVersion} does not resolve in this tenant scope (unknown ≡ cross-tenant, §31)`,
        },
      };
    }
    if (mission.status !== "active") {
      return {
        ok: false,
        error: {
          kind: "mission-not-active",
          reason: `mission ${String(missionRef)}@v${request.missionVersion} is "${mission.status}" — only an active mission accepts production entry`,
        },
      };
    }
    const missionLinkage: LabToStudioMissionLinkage = {
      missionRef,
      missionVersion: mission.version,
      rewardSpecVersion: mission.rewardSpec.version,
      missionStatus: mission.status,
      linkedAt: clock(),
    };

    // — 3. POLICY gate (PRECEDES any studio invocation; §24 order) —
    const policyCheck = deps.policyGate.check({
      scope: request.scope,
      actor: request.actor,
      subjectRef: String(value.request.id),
      // The caller's DECLARED citation set — consulted verbatim, in order.
      policy: request.policy,
      declaredSpend: value.request.budget.maxCost,
      deadline: value.request.deadline,
    });
    const policyRecord: LabToStudioPolicyGateRecord = {
      outcome: policyCheck.outcome,
      decision: policyCheck.decision,
      denialReason: policyCheck.denialReason,
      policyRef: policyCheck.policyRef,
      evaluationRef: policyCheck.evaluationRef,
      checkedAt: clock(),
    };
    if (policyCheck.decision !== "permitted") {
      const reason = policyCheck.denialReason ?? "policy gate denied the production-request-approval action";
      const entry = appendOutcomeRecord(
        { id: entryId, request, citation: value.citation, mission: missionLinkage, policyGate: policyRecord, rightsGate: null, assetsGate: null, studio: null, expectations: value.expectations },
        "policy-gate",
        "denied",
        reason,
      );
      return { ok: false, error: { kind: "policy-gate-denied", stage: "policy-gate", reason, entry } };
    }

    // — 4. RIGHTS gate (the declared frame must resolve active in-tenant) —
    const frame = deps.rightsGate.resolveFrame({
      scope: request.scope,
      actor: request.actor,
      rightsRefs: [...value.request.rightsContext.rightsRefs],
      consentRefs: [...value.request.rightsContext.consentRefs],
      now: clock(),
    });
    const rightsRecord: LabToStudioRightsGateRecord = {
      frameResolutions: frame.resolutions,
      frameActive: frame.frameActive,
      checkedAt: clock(),
    };
    if (!frame.frameActive) {
      const reason = frame.resolutions
        .filter((resolution) => resolution.status !== "active")
        .map((resolution) => `${resolution.kind} ${resolution.ref} is ${resolution.status}`)
        .join("; ");
      const denialReason = reason.length > 0 ? reason : "the declared rights frame is not active";
      const entry = appendOutcomeRecord(
        { id: entryId, request, citation: value.citation, mission: missionLinkage, policyGate: policyRecord, rightsGate: rightsRecord, assetsGate: null, studio: null, expectations: value.expectations },
        "rights-gate",
        "denied",
        denialReason,
      );
      return { ok: false, error: { kind: "rights-gate-denied", stage: "rights-gate", reason: denialReason, entry } };
    }

    // — 5. ASSETS gate (every source artifact explicitly covered, §27) —
    const sources = value.request.sourceArtifacts.map((source) => ({
      artifactId: String(source.artifactId),
      storageRef: String(source.storageRef),
    }));
    const coverage = deps.rightsGate.evaluateCoverage({
      scope: request.scope,
      actor: request.actor,
      action: value.candidate.transformChain.length > 0 ? "transform" : "use",
      sources,
      rightsRefs: [...value.request.rightsContext.rightsRefs],
      now: clock(),
    });
    const assetsRecord: LabToStudioAssetsGateRecord = {
      action: value.candidate.transformChain.length > 0 ? "transform" : "use",
      verdicts: coverage.verdicts,
      allCovered: coverage.allCovered,
      checkedAt: clock(),
    };
    if (!coverage.allCovered) {
      const reason = coverage.verdicts
        .filter((verdict) => verdict.verdict === "denied")
        .map((verdict) => `source ${verdict.subjectRef}: ${verdict.reason}`)
        .join("; ");
      const denialReason = reason.length > 0 ? reason : "a source artifact is not covered by an explicit grant";
      const entry = appendOutcomeRecord(
        { id: entryId, request, citation: value.citation, mission: missionLinkage, policyGate: policyRecord, rightsGate: rightsRecord, assetsGate: assetsRecord, studio: null, expectations: value.expectations },
        "assets-gate",
        "denied",
        denialReason,
      );
      return { ok: false, error: { kind: "assets-gate-denied", stage: "assets-gate", reason: denialReason, entry } };
    }

    // — 6. PRODUCTION/STUDIO entry (the studio's OWN authorities only) —
    const requestView = projectStudioRequestView(value, request.formatVersion);
    const labCandidateRef = labCandidateRefOf(value.citation.searchResultId, value.citation.rank);
    const intake: SessionIntakeForValidation = {
      inputKind: request.intake.inputKind,
      // DERIVED from the assets gate verdict — never caller-claimed: every
      // source artifact the request composes was verified explicitly covered.
      sourceArtifacts: sources.map((source) => ({ artifactId: source.artifactId, rightsCleared: true })),
      participantCount: request.intake.participantCount,
      hasScriptOrQuestionGraph: request.intake.hasScriptOrQuestionGraph,
    };
    const sessionInput: CreateStudioSessionInput = {
      kind: "production-request",
      request: requestView,
      supplier: { kind: "lab", labCandidateRef },
      tenantId: request.scope.tenantId,
      intake,
    };
    const gatesPassed = {
      id: entryId,
      request,
      citation: value.citation,
      mission: missionLinkage,
      policyGate: policyRecord,
      rightsGate: rightsRecord,
      assetsGate: assetsRecord,
      studio: null,
      expectations: value.expectations,
    };
    const studioSegmentOf = (lifecycleState: string): LabToStudioStudioEntry => ({
      sessionRef: sessionId,
      labCandidateRef,
      organizationRef: {
        id: value.organizationCitation.organizationId,
        version: value.organizationCitation.organizationVersion,
      },
      formatRef: { formatId: value.studioFormatId, version: request.formatVersion },
      lifecycleState,
      enteredAt: clock(),
    });
    const created = await deps.runtime.createSession(sessionInput);
    if (!created.ok) {
      const reason = `createSession rejected the production request: ${created.error.kind}`;
      const entry = appendOutcomeRecord(gatesPassed, "studio-entry", "studio-entry-failed", reason);
      return { ok: false, error: { kind: "studio-entry-failed", stage: "studio-entry", reason, entry } };
    }
    const sessionId = created.value.session.id;
    const loaded = await deps.runtime.loadOrganization(sessionId);
    if (!loaded.ok) {
      const reason = `loadOrganization failed for the cited organization: ${loaded.error.kind}`;
      const entry = appendOutcomeRecord(
        { ...gatesPassed, studio: studioSegmentOf("failed") },
        "studio-entry",
        "studio-entry-failed",
        reason,
      );
      return { ok: false, error: { kind: "studio-entry-failed", stage: "studio-entry", reason, entry } };
    }

    // — 7. The ENTERED record (v1) —
    const session: StudioSession = loaded.value.session;
    const entered = store.appendFirstVersion(
      draftOf({
        ...gatesPassed,
        studio: studioSegmentOf(session.lifecycle.state),
        status: "entered",
        denial: null,
      }),
    );
    return { ok: true, value: { entry: entered, session } };
  }

  async function recordStudioPackage(
    scope: TenantScope,
    entryId: string,
  ): Promise<
    | { readonly ok: true; readonly value: { readonly entry: LabToStudioProductionEntry } }
    | { readonly ok: false; readonly failure: LabToStudioPackageRecordFailure }
  > {
    const entry = store.getEntry(scope, entryId);
    if (entry === undefined) {
      return {
        ok: false,
        failure: { kind: "entry-not-found", reason: "no entry chain resolves for this tenant scope (§31 — cross-tenant ≡ unknown)" },
      };
    }
    if (entry.status === "packaged") {
      return {
        ok: false,
        failure: { kind: "entry-not-entered", reason: `the entry is already packaged (package ${String(entry.packageRef?.packageId)} cited at v${String(entry.version)})` },
      };
    }
    if (entry.status !== "entered" || entry.studio === null) {
      return {
        ok: false,
        failure: { kind: "entry-not-entered", reason: `latest status "${entry.status}" cannot cite a studio package (only entered entries package)` },
      };
    }
    // STUDIO-014: read ONLY what the runtime's own session directory published.
    const summary = deps.sessionDirectory.getSessionSummary(scope, entry.studio.sessionRef);
    if (summary === undefined) {
      return {
        ok: false,
        failure: { kind: "session-summary-unresolved", reason: "the runtime's session directory has no summary on record for this session in this tenant scope" },
      };
    }
    const packageRef = summary.artifactPackageRef;
    if (packageRef === null) {
      return {
        ok: false,
        failure: { kind: "session-not-packaged", reason: `the studio session's latest recorded state is "${summary.lifecycleState}" — no package attached yet` },
      };
    }
    // STUDIO-013: the canonical packaging authority resolves the exact version.
    const resolved = deps.packaging.getArtifactPackage(
      scope,
      packageRef.packageId as StudioArtifactPackageId,
      packageRef.version,
    );
    if (resolved === undefined) {
      return {
        ok: false,
        failure: { kind: "package-unresolved", reason: `package ${String(packageRef.packageId)}@v${String(packageRef.version)} does not resolve through the canonical packaging authority in this tenant scope` },
      };
    }
    const appended = store.appendPackagedVersion(scope, entryId, {
      packageId: packageRef.packageId,
      version: packageRef.version,
    });
    if (!appended.ok) {
      return { ok: false, failure: { kind: "store-rejection", reason: appended.reason } };
    }
    return { ok: true, value: { entry: appended.record } };
  }

  return {
    enterProduction,
    recordStudioPackage,
    getEntry: (scope, entryId, version) => store.getEntry(scope, entryId, version),
    listLatestEntries: (scope) => store.listLatestEntries(scope),
    entryStore: store,
  };
}

/** Re-exported for the package index (one import site per type). */
export type { StudioSessionId };
