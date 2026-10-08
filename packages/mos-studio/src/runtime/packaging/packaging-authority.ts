/**
 * The canonical packaging authority runtime (STUDIO-013).
 *
 * Implements {@link StudioArtifactPackagingPort}: the ONE composition path
 * every format flow's `StudioArtifactPackage` goes through, the append-only
 * immutable version store, and the fail-closed battery documented on
 * contracts/artifact-packaging.ts.
 *
 * Construction disciplines (W9-B, by construction):
 * - D3 clone-then-deep-freeze: the store keeps PRIVATE structural copies —
 *   the caller's draft artifacts are never aliased into a stored package and
 *   never frozen in place; returned packages are deep-frozen and re-read
 *   bit-for-bit stable.
 * - D1/D2 exact-tenant maps: the store is a per-tenant map of per-package-id
 *   version chains (exact equality on both levels — no delimiter-injectable
 *   composite key exists and no listing can widen across tenants).
 * - D5 finite-number guards: cost lines and durations are validated finite
 *   and non-negative before composition (NaN/Infinity/negative fail closed).
 *
 * The session-draft battery consolidates §6/§14/§15/§27/§19 discipline:
 * provenance refs on every artifact, closed lineage (parents on every
 * intermediate/final), root→final traceability, truthful
 * `containsSyntheticMaterial` (derived per source kind from the creation
 * method), full consent coverage of every raw artifact INCLUDING imported
 * sources, and the REAL edit-graph ref (the W1-C synthesized placeholder is
 * gone — a package cites the recorded composition graph or fails closed).
 */

import type { TenantScope } from "@mos/contracts";

import type {
  ConsentRef,
  ConversationGraphId,
  EditGraphId,
  StudioSessionId,
  Timestamp,
} from "../../contracts/refs.js";
import type { ProvenanceRef } from "../../contracts/refs.js";
import type {
  StudioArtifactPackage,
  StudioArtifactRef,
} from "../../contracts/studio-artifact-package.js";
import type {
  RawArtifactConsentEntry,
  SessionPackageCompositionInput,
  StudioPackagingOutcome,
  SuccessorPackageCompositionInput,
} from "../../contracts/artifact-packaging.js";
import type { StudioArtifactPackagingPort } from "../../ports/artifact-packaging.port.js";
import {
  deepFreeze,
  durationIssues,
  elapsedSeconds,
  evaluationIssues,
  lineageIncompleteIds,
  provenanceIncompleteIds,
  totalCostOf,
  untraceableFinalIds,
  validateEditGraphRef,
} from "./packaging-validation.js";
import { createPackagingVersionStore } from "./packaging-store.js";

// ---------------------------------------------------------------------------
// The authority runtime
// ---------------------------------------------------------------------------

/** Options of {@link createStudioPackagingAuthority}. */
export interface StudioPackagingAuthorityOptions {
  /** Injectable clock (reserved for audit stamps; composition is caller-stamped). */
  readonly now?: () => Timestamp;
}

/**
 * Create the canonical packaging authority. The returned object implements
 * `StudioArtifactPackagingPort` plus a test-inspection handle over the
 * append-only store.
 */
export function createStudioPackagingAuthority(
  options: StudioPackagingAuthorityOptions = {},
): StudioArtifactPackagingPort & {
  /** Test inspection: tenants present + package ids per tenant. */
  readonly storeInspection: {
    readonly tenants: readonly string[];
    packageIdsOf(tenantId: string): readonly string[];
  };
} {
  void options;
  /** The append-only version store (D1/D2 exact keys, storage-owned). */
  const store = createPackagingVersionStore();

  function composeSessionPackage(
    scope: TenantScope,
    input: SessionPackageCompositionInput,
  ): StudioPackagingOutcome {
    const sessionRef = input.sessionRef;
    // ---- The fail-closed battery (contract-required completeness) ----
    if (input.rawArtifacts.length === 0) {
      return { ok: false, failure: { kind: "raw-artifacts-required", sessionRef } };
    }
    if (input.transcriptRefs.length === 0) {
      return { ok: false, failure: { kind: "transcripts-required", sessionRef } };
    }
    const editGraphFailure = validateEditGraphRef(sessionRef, input.editGraphRef);
    if (editGraphFailure !== null) {
      return { ok: false, failure: editGraphFailure };
    }
    const evaluationFailureIssues = evaluationIssues(input.evaluation);
    if (evaluationFailureIssues.length > 0) {
      return { ok: false, failure: { kind: "evaluation-required", sessionRef } };
    }
    // The package CITES its transcripts (transcriptRefs) — the §30 provenance
    // consolidation and the §14 synthetic derivation cover every artifact the
    // package carries, the cited transcript artifacts included (flows usually
    // carry them as intermediates too; citing-only transcripts stay
    // consolidated here — never silently outside the provenance set).
    const transcriptArtifacts: readonly StudioArtifactRef[] = input.transcriptRefs.map(
      (transcript) => transcript.artifact,
    );
    const allArtifacts: readonly StudioArtifactRef[] = [
      ...input.rawArtifacts,
      ...input.intermediateArtifacts,
      ...input.finalArtifacts,
      ...transcriptArtifacts,
    ];
    const provenanceGaps = provenanceIncompleteIds(allArtifacts);
    if (provenanceGaps.length > 0) {
      return { ok: false, failure: { kind: "provenance-incomplete", sessionRef, artifactIds: provenanceGaps } };
    }
    const derived = [...input.intermediateArtifacts, ...input.finalArtifacts];
    const lineageGaps = lineageIncompleteIds(derived);
    if (lineageGaps.length > 0) {
      return { ok: false, failure: { kind: "lineage-incomplete", sessionRef, artifactIds: lineageGaps } };
    }
    const untraceable = untraceableFinalIds({
      rawArtifacts: input.rawArtifacts,
      intermediates: input.intermediateArtifacts,
      finals: input.finalArtifacts,
    });
    if (untraceable.length > 0) {
      return { ok: false, failure: { kind: "lineage-untraceable", sessionRef, artifactIds: untraceable } };
    }
    const uncovered = input.rawArtifacts
      .filter((artifact) => (input.rawArtifactConsent.get(String(artifact.artifactId))?.consentRefs.length ?? 0) === 0)
      .map((artifact) => String(artifact.artifactId));
    if (uncovered.length > 0 || input.participantConsentRefs.length === 0) {
      return {
        ok: false,
        failure: {
          kind: "consent-coverage-incomplete",
          sessionRef,
          uncoveredRawArtifactIds: uncovered,
          participantConsentRefsPresent: input.participantConsentRefs.length > 0,
        },
      };
    }
    const cost = totalCostOf(sessionRef, input.costLines);
    if (!cost.ok) {
      return { ok: false, failure: cost.failure };
    }
    const durationProblems = durationIssues([
      ["captureSeconds", input.captureSeconds],
      ["processingSeconds", input.processingSeconds],
    ]);
    if (durationProblems.length > 0) {
      return { ok: false, failure: { kind: "duration-invalid", sessionRef, reasons: durationProblems } };
    }
    // ---- Versioning: append-only under the package id ----
    const chain = store.chainOf(scope, input.packageId);
    const latestStored = chain.length > 0 ? (chain[chain.length - 1] as StudioArtifactPackage).version : 0;
    const predecessorVersion = input.predecessor?.version ?? 0;
    const version = Math.max(latestStored, predecessorVersion) + 1;
    // ---- Provenance/consent consolidation (truthful projections) ----
    const provenanceRefs = [...new Set(allArtifacts.map((artifact) => artifact.provenanceRef))] satisfies ProvenanceRef[];
    const participantConsentRefs = [...new Set(input.participantConsentRefs)] satisfies ConsentRef[];
    const containsSyntheticMaterial = allArtifacts.some(
      (artifact) => artifact.creationMethod === "engine-generated",
    );
    const transcriptRefs = [...input.transcriptRefs];
    const candidate: StudioArtifactPackage = {
      id: input.packageId,
      version,
      sessionRef,
      rawArtifacts: [...input.rawArtifacts],
      intermediateArtifacts: [...input.intermediateArtifacts],
      finalArtifacts: [...input.finalArtifacts],
      transcriptRefs,
      conversationGraphRef:
        input.conversationGraphRef ?? {
          graphId: `mos-studio:conversation-graph:${String(sessionRef)}` as ConversationGraphId,
          version,
          derivedFrom: transcriptRefs,
        },
      editGraphRef: input.editGraphRef as NonNullable<SessionPackageCompositionInput["editGraphRef"]>,
      provenance: {
        provenanceRefs,
        lineageComplete: true,
        containsSyntheticMaterial,
      },
      consent: {
        participantConsentRefs,
        allRawArtifactsCovered: true,
      },
      evaluation: {
        status: input.evaluation.status,
        outcome: input.evaluation.outcome,
        evaluationRef: input.evaluation.evaluationRef,
      },
      cost: { total: cost.total },
      duration: {
        captureSeconds: input.captureSeconds,
        processingSeconds: input.processingSeconds,
        totalWallClockSeconds: elapsedSeconds(input.sessionCreatedAt, input.composedAt),
      },
      createdAt: input.composedAt,
    };
    const frozen = deepFreeze(structuredClone(candidate));
    const registered = store.registerVersion(scope, frozen);
    if (!registered.ok) {
      return { ok: false, failure: registered.failure };
    }
    return { ok: true, package: frozen };
  }

  function composeSuccessorVersion(
    scope: TenantScope,
    input: SuccessorPackageCompositionInput,
  ): StudioPackagingOutcome {
    const packaged = input.source.kind === "package" ? input.source.artifactPackage : null;
    const sessionRef: StudioSessionId =
      input.source.kind === "package" ? input.source.artifactPackage.sessionRef : input.source.sessionRef;
    // ---- Required-field battery for the successor shape ----
    const editGraphFailure = validateEditGraphRef(sessionRef, {
      graphId: input.graph.graphId as EditGraphId,
      version: input.graph.version,
      otioInterchange: input.graph.otioInterchange,
    });
    if (editGraphFailure !== null) {
      return { ok: false, failure: editGraphFailure };
    }
    const evaluation = input.evaluation ?? { status: "pending" as const, outcome: "treatment-requested" as const };
    const evaluationFailureIssues = evaluationIssues(evaluation);
    if (evaluationFailureIssues.length > 0) {
      return { ok: false, failure: { kind: "evaluation-required", sessionRef } };
    }
    const transcriptRefs = packaged ? [...packaged.transcriptRefs] : [];
    const transcriptArtifacts: readonly StudioArtifactRef[] = transcriptRefs.map(
      (transcript) => transcript.artifact,
    );
    const carried: readonly StudioArtifactRef[] = [
      ...(packaged
        ? [...packaged.rawArtifacts, ...packaged.intermediateArtifacts, ...packaged.finalArtifacts]
        : input.source.kind === "intermediates"
          ? [...input.source.intermediates]
          : []),
      ...input.operationOutputs,
      ...(input.finalArtifact !== null ? [input.finalArtifact] : []),
      ...transcriptArtifacts,
    ];
    const provenanceGaps = provenanceIncompleteIds(carried);
    if (provenanceGaps.length > 0) {
      return { ok: false, failure: { kind: "provenance-incomplete", sessionRef, artifactIds: provenanceGaps } };
    }
    if (typeof input.cost.amount !== "number" || !Number.isFinite(input.cost.amount) || input.cost.amount < 0) {
      return {
        ok: false,
        failure: {
          kind: "cost-invalid",
          sessionRef,
          reasons: [`cost.amount "${String(input.cost.amount)}" must be finite and non-negative`],
        },
      };
    }
    const packageId = packaged ? packaged.id : input.newPackageId;
    const chain = store.chainOf(scope, packageId);
    const latestStored = chain.length > 0 ? (chain[chain.length - 1] as StudioArtifactPackage).version : 0;
    const baseVersion = Math.max(packaged?.version ?? 0, latestStored);
    const version = baseVersion + 1;
    // ---- The §19 successor composition (W8-C discipline, ported) ----
    const rawArtifacts = packaged ? [...packaged.rawArtifacts] : [];
    const inheritedIntermediates = packaged
      ? [...packaged.intermediateArtifacts]
      : input.source.kind === "intermediates"
        ? [...input.source.intermediates]
        : [];
    const intermediateArtifacts = [...inheritedIntermediates, ...input.operationOutputs];
    const finalArtifacts =
      input.finalArtifact !== null ? [input.finalArtifact] : packaged ? [...packaged.finalArtifacts] : [];
    const allArtifacts = [...rawArtifacts, ...intermediateArtifacts, ...finalArtifacts, ...transcriptArtifacts];
    const provenanceRefs = [...new Set(allArtifacts.map((artifact) => artifact.provenanceRef))];
    const consentRefs: ConsentRef[] = [
      ...new Set(
        (packaged ? [...packaged.consent.participantConsentRefs] : []).concat(
          input.contributors.flatMap((contributor) => [...contributor.consentRefs]),
        ),
      ),
    ];
    const lineageComplete = [...intermediateArtifacts, ...finalArtifacts].every(
      (artifact) => artifact.parentArtifactRefs.length > 0,
    );
    const containsSyntheticMaterial = allArtifacts.some(
      (artifact) => artifact.creationMethod === "engine-generated",
    );
    const processingSeconds = elapsedSeconds(input.startedAt, input.completedAt);
    const durationProblems = durationIssues([
      ["captureSeconds", packaged ? packaged.duration.captureSeconds : 0],
      ["processingSeconds", processingSeconds],
      ["totalWallClockSeconds", processingSeconds],
    ]);
    if (durationProblems.length > 0) {
      return { ok: false, failure: { kind: "duration-invalid", sessionRef, reasons: durationProblems } };
    }
    const candidate: StudioArtifactPackage = {
      id: packageId,
      version,
      sessionRef,
      rawArtifacts,
      intermediateArtifacts,
      finalArtifacts,
      transcriptRefs,
      conversationGraphRef: packaged
        ? { ...packaged.conversationGraphRef }
        : {
            graphId: `mos-studio:conversation-graph:${String(sessionRef)}` as ConversationGraphId,
            version: 1,
            derivedFrom: [],
          },
      editGraphRef: {
        graphId: input.graph.graphId as EditGraphId,
        version: input.graph.version,
        otioInterchange: input.graph.otioInterchange,
      },
      provenance: {
        provenanceRefs,
        lineageComplete,
        containsSyntheticMaterial,
      },
      consent: {
        participantConsentRefs: consentRefs,
        allRawArtifactsCovered: packaged ? packaged.consent.allRawArtifactsCovered : rawArtifacts.length === 0,
      },
      evaluation: {
        status: evaluation.status,
        outcome: evaluation.outcome,
        evaluationRef: evaluation.evaluationRef,
      },
      cost: {
        total: { currency: input.cost.currency, amount: input.cost.amount.toFixed(2) },
      },
      duration: {
        captureSeconds: packaged ? packaged.duration.captureSeconds : 0,
        processingSeconds,
        totalWallClockSeconds: processingSeconds,
      },
      createdAt: input.completedAt,
    };
    const frozen = deepFreeze(structuredClone(candidate));
    const registered = store.registerVersion(scope, frozen);
    if (!registered.ok) {
      return { ok: false, failure: registered.failure };
    }
    return { ok: true, package: frozen };
  }

  return {
    composeSessionPackage,
    composeSuccessorVersion,

    getArtifactPackage(scope, packageId, version) {
      return store.getVersion(scope, packageId, version);
    },

    listPackageVersions(scope, packageId) {
      return store.listPackageVersions(scope, packageId);
    },

    listPackages(scope, filter) {
      return store.listSummaries(scope, filter);
    },

    storeInspection: {
      get tenants(): readonly string[] {
        return store.tenants;
      },
      packageIdsOf(tenantId: string): readonly string[] {
        return store.packageIdsOf(tenantId);
      },
    },
  };
}

/** Re-exported for the runtime's session-package bridge consumers. */
export type { RawArtifactConsentEntry };
