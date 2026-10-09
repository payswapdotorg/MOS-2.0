/**
 * DISCLOSED BRIDGE-002 evaluation fixtures — the composed §19 evaluation
 * WORLD: the BRIDGE-001 fixture world (the REAL production program search +
 * the REAL studio runtime + the REAL rights authority + disclosed
 * mission/policy doubles) DRIVEN through the studio's OWN review path to a
 * PACKAGED, BRIDGE-001-cited entry — the state a §19 evaluation consumes.
 *
 * Every authority the evaluator consults is REAL in this composition: the
 * bridge's append-only entry store (BRIDGE-001), the canonical packaging
 * authority (STUDIO-013 — the studio's own review path composed the package),
 * and the runtime's session directory (STUDIO-014). The mission/policy
 * doubles behind the BRIDGE-001 gates are the disclosed
 * bridge-fixtures.ts doubles; their REAL twins run in
 * compat/evaluation-real-authorities.test.ts.
 *
 * The evaluator itself is composed with NO runtime reference at all — the
 * fixtures prove by construction that the §19 authority drives the chain,
 * never executes it (criterion: read-only citation seams).
 */

import type { RankedCandidateProgram } from "@mos/production";
import type { StudioRuntime } from "../runtime/studio-runtime.js";
import type { StudioArtifactRef } from "../contracts/studio-artifact-package.js";
import type { SubmitReviewInput } from "../runtime/intake-types.js";
import type { OutputTreatmentRequest } from "../contracts/treatment.js";
import type { StudioSessionId } from "../contracts/refs.js";
import type { LabToStudioProductionEntry } from "../bridge/contracts/lab-to-studio-entry.js";

import {
  BRIDGE_ACTOR,
  BRIDGE_MISSION_REF,
  BRIDGE_SCOPE,
  BRIDGE_TENANT,
  bridgeEntryRequestOf,
  composeBridgeWorld,
  firstStudioCandidateOf,
  mustEnter,
  runBridgeSearch,
} from "./bridge-fixtures.js";
import type { ComposedBridgeWorld } from "./bridge-fixtures.js";
import {
  OPERATOR,
  USER,
  buildProcessingArtifacts,
  captureRawTake,
  mustOk,
  participantJoin,
  recordedEditGraphRefOf,
} from "./test-fixtures.js";
import { createStudioOutputEvaluator } from "../bridge/evaluation/studio-output-evaluator.js";
import type {
  StudioOutputEvaluatorPort,
  StudioOutputEvaluatorDeps,
} from "../bridge/evaluation/studio-output-evaluator.js";
import type { StudioOutputEvaluationStore } from "../bridge/evaluation/evaluation-store.js";
import type { StudioOutputEvaluationRequest } from "../bridge/evaluation/contracts/studio-output-evaluation.js";

// ---------------------------------------------------------------------------
// The composed evaluation world
// ---------------------------------------------------------------------------

/** A BRIDGE-001 entry driven to the packaged, citation-closed state. */
export interface PackagedBridgeEntry {
  /** The packaged entry record (v2 — status `packaged`, packageRef set). */
  readonly entry: LabToStudioProductionEntry;
  /** The studio session the production ran in. */
  readonly sessionId: StudioSessionId;
  /** The composed package citation (id @ exact version, through STUDIO-013). */
  readonly packageRef: { readonly packageId: string; readonly version: number };
}

/** The composed BRIDGE-002 evaluation world. */
export interface ComposedEvaluationWorld {
  /** The BRIDGE-001 fixture world (REAL runtime + REAL rights + doubles). */
  readonly bridgeWorld: ComposedBridgeWorld;
  /** The §19 evaluation authority (NO runtime reference — read-only seams). */
  readonly evaluator: StudioOutputEvaluatorPort & {
    readonly evaluationStore: StudioOutputEvaluationStore;
  };
  /** The evaluator's deps as composed (test inspection: no runtime surface). */
  readonly evaluatorDeps: StudioOutputEvaluatorDeps;
  /** Drive one more entry through production → the studio's own packaged path. */
  enterAndPackage(): Promise<PackagedBridgeEntry>;
  /** The REAL fixture search result + its first studio candidate. */
  readonly searchResult: Awaited<ReturnType<typeof runBridgeSearch>>;
  readonly candidate: RankedCandidateProgram;
}

/** Options of {@link composeEvaluationWorld}. */
export interface ComposeEvaluationWorldOptions {
  /** Wraps the runtime the BRIDGE-001 world holds (the invocation spy). */
  readonly wrapRuntime?: (runtime: StudioRuntime) => StudioRuntime;
}

/**
 * Drive one entered session to the packaged state through the studio's own
 * surfaces (the BRIDGE-001 drive discipline: join → capture → process →
 * review-accept — the studio's own review path composes the package through
 * STUDIO-013), then cite it through BRIDGE-001's `recordStudioPackage`.
 */
export async function driveEntryToPackaged(
  world: ComposedBridgeWorld,
  sessionId: StudioSessionId,
): Promise<{ readonly packageId: string; readonly packageVersion: number }> {
  world.authorities.ensureIdentity({ tenantId: BRIDGE_TENANT, identityRef: USER });
  const captureConsent = world.authorities.recordSessionConsent({
    tenantId: BRIDGE_TENANT,
    identityRef: USER,
    sessionId,
    actions: ["use"],
  });
  const processingConsent = world.authorities.recordSessionConsent({
    tenantId: BRIDGE_TENANT,
    identityRef: USER,
    sessionId,
    actions: ["transform"],
  });
  // The join cites the ACTUAL refs the REAL rights authority just minted (a
  // repeated drive in one world advances the authority's consent counter —
  // the join never asserts consent, it cites records).
  await mustOk(
    world.runtime.joinParticipant(
      sessionId,
      participantJoin({ consent: { consentRefs: [captureConsent, processingConsent] } }),
    ),
    "join",
  );
  const rawArtifact = await captureRawTake(world.runtime, sessionId, {});
  const { intermediate, finals } = await buildProcessingArtifacts(world.artifactFactory, [rawArtifact]);
  await mustOk(world.runtime.beginProcessing(sessionId), "beginProcessing");
  await mustOk(
    world.runtime.completeProcessing(sessionId, {
      intermediateArtifacts: intermediate,
      finalArtifacts: finals,
      transcriptRefs: [
        { artifact: intermediate[0] as StudioArtifactRef, language: "en-US", diarized: true },
      ],
      editGraphRef: recordedEditGraphRefOf(sessionId),
    }),
    "completeProcessing",
  );
  const accepted = await mustOk(
    world.runtime.submitReview(sessionId, {
      targetArtifactId: (finals[0] as StudioArtifactRef).artifactId,
      outcome: "accept",
      decidedBy: OPERATOR,
    } satisfies SubmitReviewInput),
    "submitReview",
  );
  assertPackaged(accepted.session.lifecycle.state, accepted.package?.id, accepted.package?.version);
  return { packageId: String(accepted.package?.id), packageVersion: accepted.package?.version ?? 0 };
}

function assertPackaged(state: string, packageId: unknown, version: unknown): void {
  if (state !== "packaged" || packageId === undefined || version === undefined) {
    throw new Error(`driveEntryToPackaged: unexpected studio state "${state}" (the studio's own review path must compose the package)`);
  }
}

/** Compose the BRIDGE-002 evaluation world over the BRIDGE-001 fixture world. */
export async function composeEvaluationWorld(
  options: ComposeEvaluationWorldOptions = {},
): Promise<ComposedEvaluationWorld> {
  const bridgeWorld = composeBridgeWorld({ wrapRuntime: options.wrapRuntime });
  bridgeWorld.grantFixtureSourceRights();
  const searchResult = await runBridgeSearch();
  const candidate = firstStudioCandidateOf(searchResult);

  const evaluatorDeps: StudioOutputEvaluatorDeps = {
    bridge: bridgeWorld.bridge,
    packaging: bridgeWorld.packaging,
    sessionDirectory: bridgeWorld.sessionDirectory,
    clock: bridgeWorld.clock,
    nextEvaluationId: (() => {
      let counter = 0;
      return () => `sev_bridge_${String(++counter).padStart(3, "0")}`;
    })(),
  };
  const evaluator = createStudioOutputEvaluator(evaluatorDeps);

  const enterAndPackage = async (): Promise<PackagedBridgeEntry> => {
    const value = await mustEnter(
      bridgeWorld.bridge,
      bridgeEntryRequestOf(searchResult, candidate),
    );
    const sessionId = (value.session as { readonly id: StudioSessionId }).id;
    const packaged = await driveEntryToPackaged(bridgeWorld, sessionId);
    const recorded = await bridgeWorld.bridge.recordStudioPackage(BRIDGE_SCOPE, value.entry.id);
    if (!recorded.ok) {
      throw new Error(`recordStudioPackage failed: ${recorded.failure.kind} — ${recorded.failure.reason}`);
    }
    return {
      entry: recorded.value.entry,
      sessionId,
      packageRef: {
        packageId: packaged.packageId,
        version: packaged.packageVersion,
      },
    };
  };

  return {
    bridgeWorld,
    evaluator,
    evaluatorDeps,
    enterAndPackage,
    searchResult,
    candidate,
  };
}

// ---------------------------------------------------------------------------
// The evaluation-request builder + the §19 decision fixtures
// ---------------------------------------------------------------------------

/** Build one §19 evaluation request over a packaged entry's cited package. */
export function evaluationRequestOf(
  packaged: PackagedBridgeEntry,
  decision: StudioOutputEvaluationRequest["decision"],
  overrides: Partial<StudioOutputEvaluationRequest> = {},
): StudioOutputEvaluationRequest {
  return {
    scope: { tenantId: BRIDGE_TENANT },
    actor: BRIDGE_ACTOR,
    entryId: packaged.entry.id,
    evaluatedPackage: { ...packaged.packageRef },
    decision,
    ...overrides,
  };
}

/** The honest switch-* routing citation (the entry's own mission + search). */
export function labRoutingOf(packaged: PackagedBridgeEntry): {
  readonly rationale: string;
  readonly missionRef: string;
  readonly searchResultId: string;
} {
  return {
    rationale: "the engine portfolio underperformed the declared expectations — route back to the Lab search",
    missionRef: String(BRIDGE_MISSION_REF),
    searchResultId: packaged.entry.candidate.searchResultId,
  };
}

/** The §18 abandonment analysis snapshot fixture (provenance-cited). */
export const ABANDONMENT_ANALYSIS = Object.freeze({
  summary: "delay cost dominates the expected incremental value of waiting for the human capture",
  analysisRef: {
    analysisId: "delay-analysis:bridge-002",
    analysisVersion: 1,
  },
  delayEconomics: {
    expectedIncrementalValue: 1.5,
    estimatedWaitMs: 120_000,
    delayCost: 9.5,
  },
} as const);

/** Apply one §19 treatment through the studio's OWN runtime path (the REAL
 * treatment executor + STUDIO-013 successor composition — what
 * `recordTreatmentSuccessor` will cite). */
export async function applyStudioTreatmentThroughRuntime(
  world: ComposedBridgeWorld,
  packaged: PackagedBridgeEntry,
): Promise<{ readonly packageId: string; readonly version: number }> {
  const resolved = world.packaging.getArtifactPackage(
    BRIDGE_SCOPE,
    packaged.packageRef.packageId as never,
    packaged.packageRef.version,
  );
  if (resolved === undefined) {
    throw new Error("applyStudioTreatmentThroughRuntime: the prior package must resolve through STUDIO-013");
  }
  const target = resolved.finalArtifacts[resolved.finalArtifacts.length - 1];
  if (target === undefined) {
    throw new Error("applyStudioTreatmentThroughRuntime: the prior package carries no final artifact to treat");
  }
  const request: OutputTreatmentRequest = {
    sessionId: packaged.sessionId,
    targetArtifact: target,
    treatment: "edit",
    parametersRef: "mos-studio:test:edit-params",
    requestedBy: { kind: "lab", labCandidateRef: String(packaged.entry.studio?.labCandidateRef ?? "") },
    requestedAt: world.clock(),
  };
  const treated = await world.runtime.applyTreatment(packaged.sessionId, request);
  if (!treated.ok) {
    throw new Error(`applyTreatment failed: ${JSON.stringify(treated.error)}`);
  }
  const successor = treated.value.package;
  if (successor === undefined) {
    throw new Error("applyTreatment over a packaged session must compose a successor package version (STUDIO-013)");
  }
  return { packageId: String(successor.id), version: successor.version };
}
