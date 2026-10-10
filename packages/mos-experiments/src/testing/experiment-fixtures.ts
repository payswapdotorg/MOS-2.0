/**
 * DISCLOSED BRIDGE-003 fixture world (deterministic, one tenant): the REAL
 * mission repository, the REAL production program search (LAB-016's own
 * `createInMemoryProgramSearch` over its disclosed seam doubles — the
 * studio bridge-search-fixtures precedent), the REAL durable job queue
 * (JOBS-001's own `createDurableJobQueue` over the in-memory store), the
 * disclosed gate doubles, and the platform-said distribution records as
 * DATA (the REAL `@mos/distribution` adapter wiring is the compat
 * battery's subject).
 *
 * The fixture world is DATA: no real tenant/organization/transform is
 * implied. Every timestamp is fixed; every id is deterministic.
 */

import type { MissionRepository } from "@mos/missions";
// RUNTIME import of the missions authority by RELATIVE BUILT-DIST path (the
// studio real-bridge-authorities precedent: the missions exports map points
// the runtime condition at untranspiled src/, which node cannot execute;
// type imports stay on the package name — erased at compile time).
import { createInMemoryMissionRepository } from "../../../mos-missions/dist/index.js";
import type {
  ArtifactRef,
  ContentDigest,
  IdentityRef,
  MissionRef,
  PolicyRef,
  RightsRef,
  TenantId,
  TenantScope,
  Timestamp,
  Version,
} from "@mos/contracts";
import type {
  SocialObservationRecord,
  SocialPublicationRecord,
} from "@mos/distribution";
import type { LabCandidateSnapshot } from "../contracts/lab-candidate-seam.js";
import type { ExperimentId } from "../contracts/ids.js";

// ---------------------------------------------------------------------------
// The world constants (deterministic)
// ---------------------------------------------------------------------------

export const EXPERIMENT_TENANT = "tenant-experiments-fixture" as TenantId;
export const EXPERIMENT_SCOPE: TenantScope = { tenantId: EXPERIMENT_TENANT };
export const EXPERIMENT_ACTOR = "identity:experiment-operator" as IdentityRef;
export const EXPERIMENT_MISSION_REF = "mission:experiment-fixture-1" as MissionRef;
export const EXPERIMENT_POLICY_REF = "policy:experiment-allow-v1" as PolicyRef;
export const EXPERIMENT_RIGHTS_REF = "rights:experiment-grant-1" as RightsRef;
export const EXPERIMENT_CONSENT_REF = "consent:experiment-record-1" as never;
export const EXPERIMENT_BENCHMARK_ID = "benchmark:experiment-fixture-1";
export const EXPERIMENT_CANDIDATE_KEY = "exp-candidate-reaction-1";
export const EXPERIMENT_PUBLICATION_ID = "social-pub:experiment-fixture-1";
export const EXPERIMENT_POST_REF = "platform-post:experiment-1";
export const EXPERIMENT_WINDOW_START = "2026-06-01T00:00:00.000Z";
export const EXPERIMENT_WINDOW_END = "2026-06-08T00:00:00.000Z";

/** The advancing deterministic clock (fixed origin, +1ms per call). */
export const createExperimentClock = (
  origin = "2026-06-01T09:00:00.000Z",
): { now: () => Timestamp; advanceMs: (ms: number) => void; setIso: (iso: string) => void } => {
  let currentMs = Date.parse(origin);
  return {
    now: () => new Date(currentMs).toISOString() as Timestamp,
    advanceMs: (ms) => {
      currentMs += ms;
    },
    setIso: (iso) => {
      currentMs = Date.parse(iso);
    },
  };
};

/** Deterministic experiment-id factory (`exp-fixture-<n>`). */
export const createExperimentIdFactory = (): (() => ExperimentId) => {
  let counter = 0;
  return () => `exp-fixture-${(counter += 1)}` as ExperimentId;
};

// ---------------------------------------------------------------------------
// The REAL mission repository fixture
// ---------------------------------------------------------------------------

/** The ACTIVE mission record version the fixture mission reaches (v2 after activation). */
export const EXPERIMENT_MISSION_ACTIVE_VERSION = 2;

/** The REAL mission repository with one ACTIVE mission at record version v2 (reward spec v1). */
export const createExperimentMissionRepository = (): MissionRepository => {
  const repository = createInMemoryMissionRepository({
    now: () => "2026-05-01T00:00:00.000Z",
  });
  const created = repository.createMission({
    scope: EXPERIMENT_SCOPE,
    id: EXPERIMENT_MISSION_REF,
    objective: {
      statement: "Grow qualified reach for the fixture product line",
      targetMetrics: [
        { metric: "qualified-reach", target: "50000", unit: "count", horizon: "2026-12-31" },
      ],
      constraints: [{ kind: "budget", description: "max 100 USD per experiment" }],
    },
    rewardSpec: {
      version: 1,
      terms: [
        {
          metric: "qualified-reach",
          weight: 1,
          direction: "maximize",
          definition: "qualified reach as reported by the platform",
        },
      ],
    },
  });
  if ("error" in created) {
    throw new Error(`fixture mission creation failed: ${created.error} — ${created.message}`);
  }
  const activated = repository.activateMission(EXPERIMENT_SCOPE, EXPERIMENT_MISSION_REF);
  if ("error" in activated) {
    throw new Error(`fixture mission activation failed: ${activated.error} — ${activated.message}`);
  }
  return repository;
};

// ---------------------------------------------------------------------------
// The lab-candidate snapshot fixture (the disclosed seam double's data)
// ---------------------------------------------------------------------------

/** The fixture LAB-017 candidate snapshot (counterfactual-labeled, finite). */
export const experimentLabCandidateSnapshot = (
  tenantId: string = String(EXPERIMENT_TENANT),
): LabCandidateSnapshot & { readonly tenantId: string } => ({
  tenantId,
  citation: {
    benchmarkId: EXPERIMENT_BENCHMARK_ID,
    benchmarkVersion: 1,
    candidateKey: EXPERIMENT_CANDIDATE_KEY,
  },
  expectations: {
    expectedReward: 42.5,
    interval: { lower: 30, upper: 55 },
    uncertainty: { level: "moderate", note: "fixture: ensemble disagreement over 3 seeds" },
    rewardSpecVersion: 1,
    counterfactual: true,
  },
  disclosure: "robust-benchmark-over-disclosed-synthetic-ensembles",
  benchmarkedAt: "2026-05-30T00:00:00.000Z",
});

// ---------------------------------------------------------------------------
// The platform-said distribution records (DATA — the compat battery wires
// the REAL adapter; these carry the same shapes verbatim)
// ---------------------------------------------------------------------------

function fixtureDigest(seed: string): ContentDigest {
  return `sha256:${seed.padEnd(64 - 7, "0")}` as ContentDigest;
}

/** The distributed studio-output artifact (the published output version). */
export const EXPERIMENT_DISTRIBUTED_ARTIFACT: ArtifactRef = {
  artifactId: "artifact:experiment-output-1" as ArtifactRef["artifactId"],
  version: 2 as Version,
  tenantId: EXPERIMENT_TENANT,
  digest: fixtureDigest("experiment-output-one"),
  type: "video",
  storageRef: "mos-experiments:output:artifact:experiment-output-1" as ArtifactRef["storageRef"],
  rightsRef: EXPERIMENT_RIGHTS_REF,
  provenanceRef: "provenance:experiment-fixture-1" as ArtifactRef["provenanceRef"],
};

/** The platform-confirmed publication record (what the platform said happened). */
export const experimentPublicationFixture = (
  tenantId: string = String(EXPERIMENT_TENANT),
): SocialPublicationRecord => ({
  id: EXPERIMENT_PUBLICATION_ID as SocialPublicationRecord["id"],
  scope: { tenantId: tenantId as TenantId },
  channelRef: "social-channel:experiment-fixture-1" as SocialPublicationRecord["channelRef"],
  providerId: "youtube" as SocialPublicationRecord["providerId"],
  artifact: EXPERIMENT_DISTRIBUTED_ARTIFACT,
  presentation: { caption: "fixture publication" } as SocialPublicationRecord["presentation"],
  postRef: EXPERIMENT_POST_REF as SocialPublicationRecord["postRef"],
  publishedAt: "2026-06-01T01:00:00.000Z" as Timestamp,
  recordedAt: "2026-06-01T01:00:05.000Z" as Timestamp,
  source: "in-memory-social-transport-double",
});

/** One platform-said observation record (the platform's reported payload verbatim). */
export const experimentObservationFixture = (
  observationId: string,
  observedAt: string,
  reported: Record<string, number>,
  tenantId: string = String(EXPERIMENT_TENANT),
): SocialObservationRecord => ({
  id: observationId as SocialObservationRecord["id"],
  scope: { tenantId: tenantId as TenantId },
  channelRef: "social-channel:experiment-fixture-1" as SocialObservationRecord["channelRef"],
  providerId: "youtube" as SocialObservationRecord["providerId"],
  subjectRef: EXPERIMENT_POST_REF,
  reported: reported as SocialObservationRecord["reported"],
  observedAt: observedAt as Timestamp,
  recordedAt: observedAt as Timestamp,
  providerRefs: [`platform-insight:${observationId}`],
  source: "in-memory-social-transport-double",
});

/** The standard observation set within the fixture window (5 observations, 2 providers). */
export const experimentWindowObservations = (): readonly SocialObservationRecord[] => [
  experimentObservationFixture("social-obs:experiment-1", "2026-06-02T00:00:00.000Z", {
    "qualified-reach": 1200,
    "engagement-rate": 0.045,
  }),
  experimentObservationFixture("social-obs:experiment-2", "2026-06-03T00:00:00.000Z", {
    "qualified-reach": 1450,
    "engagement-rate": 0.051,
  }),
  experimentObservationFixture("social-obs:experiment-3", "2026-06-04T00:00:00.000Z", {
    "qualified-reach": 1610,
    "engagement-rate": 0.049,
  }),
  experimentObservationFixture("social-obs:experiment-4", "2026-06-05T00:00:00.000Z", {
    "qualified-reach": 1702,
    "engagement-rate": 0.055,
  }),
  experimentObservationFixture("social-obs:experiment-5", "2026-06-06T00:00:00.000Z", {
    "qualified-reach": 1834,
    "engagement-rate": 0.058,
  }),
];