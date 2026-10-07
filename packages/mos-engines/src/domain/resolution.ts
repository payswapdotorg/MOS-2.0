/**
 * Deterministic engine resolution (ENG-001).
 *
 * Encodes spec/mos-engine-policy-v2.0.yaml `engineSelection` EXACTLY:
 *
 *   deterministicTieBreak: [contractCompatibility, licenseCompatibility,
 *                           benchmarkScore, cost, latency, engineId]
 *
 * Comparison semantics per dimension:
 *   1. contractCompatibility — better (more compatible) verdict wins;
 *   2. licenseCompatibility  — better (less restricted) aggregate wins;
 *   3. benchmarkScore        — HIGHER wins;
 *   4. cost                  — LOWER wins;
 *   5. latency               — LOWER wins;
 *   6. engineId              — lexicographically LOWER wins (final total
 *      order); when the same engine id is entered with multiple activated
 *      versions, the HIGHER engineVersion wins (deterministic completion
 *      of the policy order — same-engine candidates tie through engineId).
 *
 * Engines whose contract verdict for the capability is `incompatible`, or
 * whose three-layer license aggregates to `incompatible` (any blocked
 * layer), are NOT resolvable candidates at all (fail-closed exclusion,
 * never silent ranking to the bottom).
 */

import type {
  Engine,
  EngineId,
  EngineLicense,
  LicenseReviewStatus,
  Version,
} from "@mos/contracts";

/** Contract compatibility of an engine for one capability. */
export type CompatibilityVerdict = "compatible" | "degraded" | "incompatible";

/** Aggregate license compatibility of an engine (worst of the three layers). */
export type LicenseCompatibility = "compatible" | "restricted" | "incompatible";

/** The policy tie-break dimensions, in spec order. */
export const TIE_BREAK_ORDER = [
  "contractCompatibility",
  "licenseCompatibility",
  "benchmarkScore",
  "cost",
  "latency",
  "engineId",
] as const;

export type TieBreakDimension = (typeof TIE_BREAK_ORDER)[number];

const COMPATIBILITY_RANK: Record<CompatibilityVerdict, number> = {
  compatible: 0,
  degraded: 1,
  incompatible: 2,
};

const LICENSE_RANK: Record<LicenseCompatibility, number> = {
  compatible: 0,
  restricted: 1,
  incompatible: 2,
};

const LICENSE_STATUS_RANK: Record<LicenseReviewStatus, number> = {
  cleared: 0,
  "review-required": 1,
  blocked: 2,
};

/**
 * Aggregates the three-layer license record (spec §29) into one
 * compatibility value: any blocked layer → incompatible; any
 * review-required layer → restricted; all cleared → compatible.
 */
export function deriveLicenseCompatibility(
  license: EngineLicense,
): LicenseCompatibility {
  const worst = Math.max(
    LICENSE_STATUS_RANK[license.code.status],
    LICENSE_STATUS_RANK[license.model.status],
    LICENSE_STATUS_RANK[license.data.status],
  );
  if (worst >= LICENSE_STATUS_RANK.blocked) {
    return "incompatible";
  }
  if (worst >= LICENSE_STATUS_RANK["review-required"]) {
    return "restricted";
  }
  return "compatible";
}

/**
 * One resolution candidate: the engine manifest plus the derived ranking
 * inputs. `benchmarkScore` is the canonical scalar of the engine's
 * `benchmark.metrics.score`; `costAmount` is `benchmark.cost.amount`
 * (single-currency assumption within one resolution is documented);
 * `latencyMs` is `benchmark.latency`.
 */
export interface EngineResolutionCandidate {
  readonly engine: Engine;
  readonly engineId: EngineId;
  readonly engineVersion: Version;
  readonly contractCompatibility: CompatibilityVerdict;
  readonly licenseCompatibility: LicenseCompatibility;
  readonly benchmarkScore: number;
  readonly costAmount: number;
  readonly latencyMs: number;
}

/**
 * Deterministic comparator implementing the policy tie-break exactly.
 * Returns a negative number when `a` ranks before `b`.
 */
export function compareEngineCandidates(
  a: EngineResolutionCandidate,
  b: EngineResolutionCandidate,
): number {
  // 1. contractCompatibility — lower rank (more compatible) is better.
  const contractDelta =
    COMPATIBILITY_RANK[a.contractCompatibility] -
    COMPATIBILITY_RANK[b.contractCompatibility];
  if (contractDelta !== 0) {
    return contractDelta;
  }

  // 2. licenseCompatibility — lower rank (less restricted) is better.
  const licenseDelta =
    LICENSE_RANK[a.licenseCompatibility] -
    LICENSE_RANK[b.licenseCompatibility];
  if (licenseDelta !== 0) {
    return licenseDelta;
  }

  // 3. benchmarkScore — higher is better.
  if (a.benchmarkScore !== b.benchmarkScore) {
    return b.benchmarkScore - a.benchmarkScore;
  }

  // 4. cost — lower is better.
  if (a.costAmount !== b.costAmount) {
    return a.costAmount - b.costAmount;
  }

  // 5. latency — lower is better.
  if (a.latencyMs !== b.latencyMs) {
    return a.latencyMs - b.latencyMs;
  }

  // 6. engineId — lexicographically lower is better (total order); when
  // the ids are equal (same engine, different versions) the HIGHER
  // engineVersion wins (deterministic completion of the policy order).
  const idCompare = (a.engineId as string).localeCompare(b.engineId as string);
  if (idCompare !== 0) {
    return idCompare;
  }
  return (b.engineVersion as number) - (a.engineVersion as number);
}

/**
 * The dimension at which two candidates first differ under the policy
 * order — the audit-trace answer to "why did the winner win". For
 * same-engine pairs the deciding dimension is `engineId` (with the
 * documented higher-version completion).
 */
export function firstDifferingDimension(
  a: EngineResolutionCandidate,
  b: EngineResolutionCandidate,
): TieBreakDimension {
  if (a.contractCompatibility !== b.contractCompatibility) {
    return "contractCompatibility";
  }
  if (a.licenseCompatibility !== b.licenseCompatibility) {
    return "licenseCompatibility";
  }
  if (a.benchmarkScore !== b.benchmarkScore) {
    return "benchmarkScore";
  }
  if (a.costAmount !== b.costAmount) {
    return "cost";
  }
  if (a.latencyMs !== b.latencyMs) {
    return "latency";
  }
  return "engineId";
}
