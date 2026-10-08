import type { UncertaintySummary } from '@mos/contracts';
import type {
  EnsembleOodSignal,
  EnsemblePrediction,
} from '../contracts/ensemble.js';
import type {
  BenchmarkBaselineComparison,
  BenchmarkCandidateEvaluation,
  BenchmarkCandidateProvenance,
  BenchmarkDisagreement,
  BenchmarkOodSignal,
  BenchmarkSeedRobustness,
  BenchmarkUncertaintyBreakdown,
  BenchmarkWorldModelEvaluation,
  BenchmarkWorldModelPin,
  BenchmarkWorldRobustness,
  RankedBenchmarkCandidate,
} from '../contracts/robust-benchmark-result.js';
import type {
  BenchmarkCandidate,
  BenchmarkCandidateOrigin,
  BenchmarkWorldModelRef,
  RobustnessPolicy,
} from '../contracts/robust-benchmark.js';
import type { LabRewardSpec } from '../contracts/reward.js';
import {
  computeRewardValue,
  meanOf,
} from './reward-computation.js';
import type { RewardResolutionFailure } from './reward-computation.js';
import { uncertaintyLevelForRelativeHalfWidth } from './reward-computation.js';

/**
 * INTERNAL pure support for the LAB-017 in-memory robust marketing
 * benchmark. NOT exported from the package index — implementation detail,
 * not surface.
 *
 * Contains: (1) the deterministic canonical JSON serialization + FNV-1a
 * digest used for the bit-for-bit record immutability check, and (2) the
 * pure §22 robustness evaluation of one candidate's rollout over the
 * world-model set (documented formulas below).
 *
 * THE DOCUMENTED UNCERTAINTY FORMULA (`bench-additive-v1` — no invented
 * sophistication; every term is a plainly-derived quantity, the same
 * additive discipline as LAB-008's OPE bound minus the observed-basis
 * Hoeffding term, which cannot exist in a pure-simulation benchmark):
 *
 * ```
 * cells            = (world w, seed s, step t) — every candidate runs the
 *                    SAME grid (the cross-candidate fairness pin)
 * R(w,s,t)         = Σ_j sign(d_j) · w_j · v_j(w,s,t)   (reward spec over
 *                    the ensemble AGGREGATE prediction's predicted
 *                    metric/delta domains — observed-domain terms fail
 *                    closed; this is the simulation-side benchmark)
 * R_i(w,s,t)       = the same sum from member i's OWN metrics/deltas
 * worldMean_w      = mean over (s,t) of R(w,s,t)
 * seedMean_s       = mean over (w,t) of R(w,s,t)
 * memberMean_i(w)  = mean over (s,t) of R_i(w,s,t)
 * pooledMean       = mean over all cells
 * expectedReward   = pooledMean            (aggregation `pooled-mean`)
 *                  | min_w worldMean_w     (aggregation `worst-world-mean`)
 * ε_member         = max_w (max_i memberMean_i(w) − min_i memberMean_i(w)) / 2
 * ε_seed           = (max_s seedMean_s − min_s seedMean_s) / 2
 * ε_world          = (max_w worldMean_w − min_w worldMean_w) / 2
 * interval         = expectedReward ± (ε_member + ε_seed + ε_world)
 * ```
 *
 * The member disagreement is isolated PER WORLD (the member spread never
 * absorbs cross-world differences) and the worst world's half-spread is
 * reported — model disagreement can never be hidden by aggregation (§22).
 */

// ---------------------------------------------------------------------------
// Deterministic canonical serialization + digest (bit-for-bit immutability)
// ---------------------------------------------------------------------------

/**
 * Canonical JSON serialization: object keys sorted recursively, array
 * order preserved, JSON string escaping, `String(n)` number formatting.
 * Deterministic — structurally identical values serialize identically.
 */
export const canonicalJsonStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') {
    return typeof value === 'string' ? JSON.stringify(value) : String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJsonStringify(entry)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJsonStringify(entry)}`)
    .join(',')}}`;
};

/**
 * Deterministic 32-bit FNV-1a hash of a string (hex, zero-padded) — used
 * ONLY for the record's bit-for-bit immutability digest (a change
 * detector, never a security claim; the production stableTagOf precedent).
 */
export const fnv1aHex = (value: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
};

/** The deterministic digest of one canonical-serialized value. */
export const digestOf = (value: unknown): string => fnv1aHex(canonicalJsonStringify(value));

// ---------------------------------------------------------------------------
// The pure §22 robustness evaluation of one candidate's rollout
// ---------------------------------------------------------------------------

/** One world's rollout for one candidate: predictions in (seed, step) order. */
export interface WorldRollout {
  readonly ref: BenchmarkWorldModelRef;
  readonly predictions: readonly EnsemblePrediction[];
}

/** Aggregated OOD verdict: the worst status across the world-model set. */
const aggregateOod = (
  perWorld: readonly BenchmarkOodSignal['perWorld'][number][],
): BenchmarkOodSignal => {
  const anyOut = perWorld.some((world) => world.status === 'out-of-declared-coverage');
  const anyUndeclared = perWorld.some((world) => world.status === 'partially-undeclared');
  return {
    status: anyOut
      ? 'out-of-declared-coverage'
      : anyUndeclared
        ? 'partially-undeclared'
        : 'in-coverage',
    flagged: anyOut,
    perWorld,
  };
};

/** OOD verdict of one world, taken from that world's predictions. */
const oodOfWorld = (
  ref: BenchmarkWorldModelRef,
  predictions: readonly EnsemblePrediction[],
): BenchmarkOodSignal['perWorld'][number] => {
  const signal: EnsembleOodSignal | undefined = predictions[0]?.ood;
  const maxDistance = (signal?.perMember ?? []).reduce(
    (worst, verdict) => Math.max(worst, verdict.maxDistance),
    0,
  );
  return {
    ensembleId: ref.ensembleId,
    ensembleVersion: ref.ensembleVersion,
    label: ref.label,
    status: signal?.status ?? 'partially-undeclared',
    flagged: signal?.flagged ?? true,
    maxDistance,
  };
};

/**
 * The pure §22 evaluation of one candidate over its world rollouts under
 * the declared policy + seeds. Fails closed on reward-term resolution
 * failures (the shared `computeRewardValue` — never invents values).
 */
export const evaluateCandidateRobustness = (
  candidate: BenchmarkCandidate,
  spec: LabRewardSpec,
  policy: RobustnessPolicy,
  seeds: readonly number[],
  worldRollouts: readonly WorldRollout[],
): BenchmarkCandidateEvaluation | RewardResolutionFailure => {
  const horizon = candidate.horizonSteps;

  // ---- cell rewards + per-member rewards (per world, (seed, step) order) ----
  const cellRewardsByWorld: number[][] = [];
  const memberRewardsByWorld: number[][] = [];
  for (const rollout of worldRollouts) {
    const cellRewards: number[] = [];
    const memberRewards: number[] = [];
    for (const prediction of rollout.predictions) {
      const aggregate = computeRewardValue(spec, {
        predictedMetrics: new Map(
          prediction.metrics.map((metric) => [metric.metric, metric.expectedValue]),
        ),
        predictedDeltas: new Map(
          prediction.deltas.map((delta) => [delta.metric, delta.expectedDelta]),
        ),
      });
      if ('failure' in aggregate) {
        return aggregate;
      }
      cellRewards.push(aggregate.reward);
      // Member-level rewards mirror the aggregate's domain binding: each
      // member draws from its OWN metrics/deltas (the member spread
      // isolates MODEL differences — the OPE member-level discipline).
      const memberMetricSources = new Set(
        aggregate.resolved
          .filter((resolved) => resolved.source === 'predicted-metric')
          .map((resolved) => resolved.term.metricSource),
      );
      const memberDeltaSources = new Set(
        aggregate.resolved
          .filter((resolved) => resolved.source === 'predicted-delta')
          .map((resolved) => resolved.term.metricSource),
      );
      for (const member of prediction.memberPredictions) {
        const memberOutcome = computeRewardValue(spec, {
          predictedMetrics: new Map(
            member.prediction.metrics
              .filter((metric) => memberMetricSources.has(metric.metric))
              .map((metric) => [metric.metric, metric.expectedValue]),
          ),
          predictedDeltas: new Map(
            member.prediction.deltas
              .filter((delta) => memberDeltaSources.has(delta.metric))
              .map((delta) => [delta.metric, delta.expectedDelta]),
          ),
        });
        if ('failure' in memberOutcome) {
          return memberOutcome;
        }
        memberRewards.push(memberOutcome.reward);
      }
    }
    cellRewardsByWorld.push(cellRewards);
    memberRewardsByWorld.push(memberRewards);
  }

  // ---- per-world / per-seed / member means ----
  const worldMeans = cellRewardsByWorld.map((rewards) => meanOf(rewards));
  const perWorldEvaluations: BenchmarkWorldModelEvaluation[] = worldRollouts.map(
    (rollout, index) => ({
      ensembleId: rollout.ref.ensembleId,
      ensembleVersion: rollout.ref.ensembleVersion,
      label: rollout.ref.label,
      expectedReward: worldMeans[index] as number,
    }),
  );
  // Per-seed means over (world, step) — cellRewards are in (seed, step)
  // row-major order per world, so cell (seed, step) of world w lives at
  // index seed·horizon + step.
  const seedMeans = seeds.map((_, seedIndex) => {
    const cells: number[] = [];
    for (let worldIndex = 0; worldIndex < worldRollouts.length; worldIndex += 1) {
      const rewards = cellRewardsByWorld[worldIndex] as number[];
      for (let step = 0; step < horizon; step += 1) {
        cells.push(rewards[seedIndex * horizon + step] as number);
      }
    }
    return meanOf(cells);
  });
  // Per-member mean rewards per world: memberRewards are in (cell, member)
  // order (member-fastest), so member i's cells live at i, i+memberCount, …
  const memberMeansByWorld = memberRewardsByWorld.map((rewards, index) => {
    const memberCount = worldRollouts[index]?.predictions[0]?.memberPredictions.length ?? 1;
    const means: number[] = [];
    for (let memberIndex = 0; memberIndex < memberCount; memberIndex += 1) {
      const memberCells: number[] = [];
      for (let cell = memberIndex; cell < rewards.length; cell += memberCount) {
        memberCells.push(rewards[cell] as number);
      }
      means.push(meanOf(memberCells));
    }
    return means;
  });

  // ---- the §22 pieces ----
  const disagreement: BenchmarkDisagreement = {
    perWorld: worldRollouts.map((rollout, index) => {
      const memberExpected = memberMeansByWorld[index] as number[];
      const spread =
        memberExpected.length === 0
          ? 0
          : Math.max(...memberExpected) - Math.min(...memberExpected);
      return {
        ensembleId: rollout.ref.ensembleId,
        ensembleVersion: rollout.ref.ensembleVersion,
        label: rollout.ref.label,
        memberExpected,
        spread,
        halfSpread: spread / 2,
      };
    }),
    worstHalfWidth: memberMeansByWorld.reduce((worst, means) => {
      const spread =
        means.length === 0 ? 0 : Math.max(...means) - Math.min(...means);
      return Math.max(worst, spread / 2);
    }, 0),
  };
  const perSeedExpected = seedMeans;
  const seedSpread =
    perSeedExpected.length === 0
      ? 0
      : Math.max(...perSeedExpected) - Math.min(...perSeedExpected);
  const seedMeanOfMeans =
    perSeedExpected.length === 0 ? 0 : meanOf(perSeedExpected);
  const seedRobustness: BenchmarkSeedRobustness = {
    seeds,
    perSeedExpected,
    spread: seedSpread,
    halfSpread: seedSpread / 2,
    relativeSpread:
      Math.abs(seedMeanOfMeans) === 0
        ? seedSpread === 0
          ? 0
          : 1
        : seedSpread / Math.abs(seedMeanOfMeans),
  };
  const worldSpread =
    worldMeans.length === 0 ? 0 : Math.max(...worldMeans) - Math.min(...worldMeans);
  const worldRobustness: BenchmarkWorldRobustness = {
    perWorld: perWorldEvaluations,
    spread: worldSpread,
    halfSpread: worldSpread / 2,
    worstExpectedReward: worldMeans.length === 0 ? 0 : Math.min(...worldMeans),
    bestExpectedReward: worldMeans.length === 0 ? 0 : Math.max(...worldMeans),
  };

  // ---- the declared aggregation rule + the additive interval ----
  const pooledCells = cellRewardsByWorld.flat();
  const pooledMean = pooledCells.length === 0 ? 0 : meanOf(pooledCells);
  const expectedReward =
    policy.aggregation === 'worst-world-mean'
      ? worldRobustness.worstExpectedReward
      : pooledMean;
  const epsilonMember = disagreement.worstHalfWidth;
  const epsilonSeed = seedRobustness.halfSpread;
  const epsilonWorld = worldRobustness.halfSpread;
  const totalHalfWidth = epsilonMember + epsilonSeed + epsilonWorld;
  const breakdown: BenchmarkUncertaintyBreakdown = {
    memberDisagreementHalfWidth: epsilonMember,
    seedRobustnessHalfWidth: epsilonSeed,
    worldModelSpreadHalfWidth: epsilonWorld,
    totalHalfWidth,
    formula: 'bench-additive-v1',
    aggregation: policy.aggregation,
  };
  const interval = {
    lower: expectedReward - totalHalfWidth,
    upper: expectedReward + totalHalfWidth,
  };
  const uncertainty: UncertaintySummary = {
    level: uncertaintyLevelForRelativeHalfWidth(expectedReward, totalHalfWidth),
    note: 'robust benchmark estimate over disclosed synthetic ensembles (§22) — simulated estimate, never ground truth; additive half-widths (member disagreement + seed robustness + world-model spread)',
  };

  return {
    expectedReward,
    interval,
    uncertainty,
    breakdown,
    seedRobustness,
    worldRobustness,
    disagreement,
    ood: aggregateOod(
      worldRollouts.map((rollout) => oodOfWorld(rollout.ref, rollout.predictions)),
    ),
    calibration: {
      status: 'pending-reality',
      provenance:
        'calibration is LAB-018 (online calibration): simulation-to-reality prediction error is recorded there once real experiments exist; this frozen benchmark record is never rewritten',
      predictionSurface: 'per-candidate expected reward + interval',
    },
    counterfactual: true,
    disclosure: 'robust-benchmark-over-disclosed-synthetic-ensembles',
  };
};

// ---------------------------------------------------------------------------
// Ranking + comparison assembly (the declared deterministic tie-break)
// ---------------------------------------------------------------------------

/** One evaluated entry before ranking (internal shape). */
export interface EvaluatedEntry {
  readonly key: string;
  readonly label: string | null;
  readonly origin: BenchmarkCandidateOrigin;
  readonly candidate: BenchmarkCandidate;
  readonly evaluation: BenchmarkCandidateEvaluation;
}

const halfWidthOf = (evaluation: BenchmarkCandidateEvaluation): number =>
  (evaluation.interval.upper - evaluation.interval.lower) / 2;

const overlaps = (
  a: { readonly lower: number; readonly upper: number },
  b: { readonly lower: number; readonly upper: number },
): boolean => !(a.upper < b.lower || b.upper < a.lower);

/** The narrow ranking-context slice the ranker consumes (version pins + seeds). */
interface RankingContext {
  readonly scenario: { readonly simulatorVersion: number };
  readonly rewardSpec: { readonly version: number };
  readonly policy: { readonly id: string; readonly version: number };
  readonly seeds: readonly number[];
}

/**
 * Rank the evaluated entries under the DECLARED deterministic tie-break
 * (expected reward DESC → interval half-width ASC → key ASC) and assemble
 * every ranked entry's baseline comparison (§7 — against the
 * always-present no-op baseline) and leader overlap (§22 uncertainty-aware
 * ranking: null on rank 1, declared for every other rank).
 */
export const rankBenchmarkEntries = (
  entries: readonly EvaluatedEntry[],
  worldPins: readonly BenchmarkWorldModelPin[],
  context: RankingContext,
): readonly RankedBenchmarkCandidate[] => {
  const ordered = [...entries].sort((a, b) => {
    if (b.evaluation.expectedReward !== a.evaluation.expectedReward) {
      return b.evaluation.expectedReward - a.evaluation.expectedReward;
    }
    const widthDelta = halfWidthOf(a.evaluation) - halfWidthOf(b.evaluation);
    if (widthDelta !== 0) {
      return widthDelta;
    }
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
  const leader = ordered[0];
  const baseline = entries.find((entry) => entry.origin === 'no-op-baseline');
  const baselineExpected = baseline ? baseline.evaluation.expectedReward : 0;
  return ordered.map((entry, index) => {
    const provenance: BenchmarkCandidateProvenance = {
      origin: entry.origin,
      candidateSource: entry.candidate.source,
      simulatorVersion: context.scenario.simulatorVersion,
      rewardSpecVersion: context.rewardSpec.version,
      policyId: context.policy.id,
      policyVersion: context.policy.version,
      seeds: context.seeds,
      horizonSteps: entry.candidate.horizonSteps,
      worldModels: worldPins,
    };
    const comparisonToBaseline: BenchmarkBaselineComparison = {
      baselineExpectedReward: baselineExpected,
      expectedRewardDelta: entry.evaluation.expectedReward - baselineExpected,
      intervalOverlapWithBaseline: {
        overlaps:
          baseline !== undefined &&
          overlaps(entry.evaluation.interval, baseline.evaluation.interval),
        note: 'declared interval overlap against the always-present no-op baseline (§7)',
      },
      certainlyBetterThanBaseline:
        baseline !== undefined &&
        entry.evaluation.interval.lower > baseline.evaluation.interval.upper,
    };
    return {
      rank: index + 1,
      key: entry.key,
      label: entry.label,
      origin: entry.origin,
      candidate: entry.candidate,
      evaluation: entry.evaluation,
      provenance,
      comparisonToBaseline,
      intervalOverlapWithLeader:
        index === 0 || leader === undefined
          ? null
          : {
              overlaps: overlaps(entry.evaluation.interval, leader.evaluation.interval),
              note: 'declared interval overlap against the rank-1 candidate (uncertainty-aware ranking)',
            },
    };
  });
};
