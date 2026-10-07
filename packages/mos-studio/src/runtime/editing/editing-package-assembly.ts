/**
 * The new immutable package-version assembly (STUDIO-008) — treatment
 * versioning like the W3-C discipline: an editing session over a packaged
 * source produces the SAME package id at version+1 (predecessors never
 * mutated, §19); an intermediates source starts a NEW package id. The new
 * version carries the recorded edit graph ref (the StudioArtifactPackage
 * `editGraphRef` facet), the inherited + newly-versioned intermediates, and
 * consent/provenance/cost projections.
 */

import type { MoneyAmount as CanonicalMoneyAmount, TenantScope } from "@mos/contracts";

import type {
  EditingCompositionGraph,
  EditingContributor,
} from "../../contracts/editing-composition.js";
import type { ConsentRef, StudioSessionId, Timestamp } from "../../contracts/refs.js";
import type {
  StudioArtifactPackage,
  StudioArtifactRef,
} from "../../contracts/studio-artifact-package.js";

/** Inputs of {@link assembleNewPackageVersion}. */
export interface AssembleNewPackageVersionInput {
  /** The edited source: a packaged artifact, or intermediates of a session. */
  readonly source:
    | { readonly kind: "package"; readonly artifactPackage: StudioArtifactPackage }
    | {
        readonly kind: "intermediates";
        readonly sessionRef: StudioSessionId;
        readonly intermediates: readonly StudioArtifactRef[];
      };
  readonly scope: TenantScope;
  /** The newly created studio-side intermediate versions (one per operation). */
  readonly operationOutputs: readonly StudioArtifactRef[];
  /** The final assembly artifact, or `null` for the honest no-op session. */
  readonly finalArtifact: StudioArtifactRef | null;
  readonly graph: EditingCompositionGraph;
  /** New package id for the intermediates source (ignored when packaged). */
  readonly newPackageId: StudioArtifactPackage["id"];
  /** Latest version this runtime already assigned for the target package id. */
  readonly latestAssignedVersion: StudioArtifactPackage["version"];
  readonly completedAt: Timestamp;
  readonly startedAt: Timestamp;
  readonly cost: CanonicalMoneyAmount;
  /** §15 contributors of the session input (their consent refs are inherited onto the new version). */
  readonly contributors: readonly EditingContributor[];
}

/** Assembles the NEW immutable package version (treatment-versioned, §19). */
export function assembleNewPackageVersion(
  input: AssembleNewPackageVersionInput,
): StudioArtifactPackage {
  const packaged = input.source.kind === "package" ? input.source.artifactPackage : null;
  const sessionRef: StudioSessionId =
    input.source.kind === "package" ? input.source.artifactPackage.sessionRef : input.source.sessionRef;
  const packageId = packaged ? packaged.id : input.newPackageId;
  const baseVersion = packaged
    ? Math.max(packaged.version, input.latestAssignedVersion)
    : input.latestAssignedVersion;
  const version = baseVersion + 1;
  const rawArtifacts = packaged ? [...packaged.rawArtifacts] : [];
  const inheritedIntermediates = packaged
    ? [...packaged.intermediateArtifacts]
    : input.source.kind === "intermediates"
      ? [...input.source.intermediates]
      : [];
  const intermediateArtifacts = [...inheritedIntermediates, ...input.operationOutputs];
  const finalArtifacts =
    input.finalArtifact !== null ? [input.finalArtifact] : packaged ? [...packaged.finalArtifacts] : [];
  const transcriptRefs = packaged ? [...packaged.transcriptRefs] : [];
  const allArtifacts = [...rawArtifacts, ...intermediateArtifacts, ...finalArtifacts];
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
  const processingSeconds = Math.round(elapsedSeconds(input.startedAt, input.completedAt));
  return Object.freeze({
    id: packageId,
    version,
    sessionRef,
    rawArtifacts: Object.freeze(rawArtifacts),
    intermediateArtifacts: Object.freeze(intermediateArtifacts),
    finalArtifacts: Object.freeze(finalArtifacts),
    transcriptRefs: Object.freeze(transcriptRefs),
    conversationGraphRef: Object.freeze(
      packaged
        ? { ...packaged.conversationGraphRef }
        : {
            graphId: `mos-studio:conversation-graph:${String(sessionRef)}` as StudioArtifactPackage["conversationGraphRef"]["graphId"],
            version: 1,
            derivedFrom: Object.freeze([]),
          },
    ),
    editGraphRef: Object.freeze({
      graphId: input.graph.graphId,
      version: input.graph.version,
      otioInterchange: input.graph.otioInterchange,
    }),
    provenance: Object.freeze({
      provenanceRefs: Object.freeze(provenanceRefs),
      lineageComplete,
      containsSyntheticMaterial,
    }),
    consent: Object.freeze({
      participantConsentRefs: Object.freeze(consentRefs),
      allRawArtifactsCovered: packaged ? packaged.consent.allRawArtifactsCovered : rawArtifacts.length === 0,
    }),
    evaluation: Object.freeze({ status: "pending" as const, outcome: "treatment-requested" as const }),
    cost: Object.freeze({
      total: { currency: input.cost.currency, amount: input.cost.amount.toFixed(2) },
    }),
    duration: Object.freeze({
      captureSeconds: packaged ? packaged.duration.captureSeconds : 0,
      processingSeconds,
      totalWallClockSeconds: processingSeconds,
    }),
    createdAt: input.completedAt,
  });
}

function elapsedSeconds(from: string, to: string): number {
  const ms = Date.parse(to) - Date.parse(from);
  return Number.isFinite(ms) ? Math.max(0, ms) / 1000 : 0;
}
