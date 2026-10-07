import type { TenantId } from '@mos/contracts';
import type {
  EnsembleEvaluationInput,
  EnsemblePort,
} from '../contracts/ensemble.js';
import type { EnsemblePrediction } from '../contracts/ensemble.js';
import type {
  HistoricalObservation,
  PredictionInterval,
} from '../contracts/evidence.js';
import type {
  OffPolicyEvaluationId,
  OffPolicyEvaluationInput,
  OffPolicyEvaluationPort,
  OffPolicyEvaluationResult,
  OffPolicyError,
  OffPolicyEvaluationScore,
  OffPolicyInsufficientHistory,
  RewardTermContribution,
} from '../contracts/off-policy-evaluation.js';
import type { TimeMachinePort } from '../contracts/time-machine.js';
import type { LabRewardSpec } from '../contracts/reward.js';
import {
  computeRewardValue,
  halfSpreadOf,
  meanOf,
  validateRewardSpec,
} from './reward-computation.js';
import type { ResolvedRewardTerm } from './reward-computation.js';
import { deepFreeze, predictionId, validateStrategyActionCandidate } from './parametric-support.js';

/**
 * The in-memory offline/off-policy evaluator (LAB-008).
 *
 * W4-A DISCLOSURE — THE FULL DOCUMENTED FORMULA (no invented sophistication;
 * every term below is a plainly-derived quantity):
 *
 * ```
 * n          = lagged basis size (observations with observedAt <= T − L)
 * δ          = declared miscoverage probability (default 0.05)
 * S          = input.seeds;  K = program.horizonSteps
 * m̂(s,t)     = ensemble aggregate expected metrics/deltas (LAB-007)
 * R(s,t)     = Σ_j sign(d_j) · w_j · v_j(s,t)    (term sources: predicted
 *              metric / predicted delta / observed baseline mean)
 * R̂          = mean over (s,t) of R(s,t)                       [the estimate]
 * R_i        = the same sum computed from member i's OWN metrics
 *              (observed-baseline terms carry in as member-independent
 *              constants), collected over the rollout
 * ε_ens      = (max_i R_i − min_i R_i) / 2                     [disagreement]
 * R̄_s       = mean over t of R(s,t)
 * ε_seed     = (max_s R̄_s − min_s R̄_s) / 2                    [seed spread]
 * ε_stat     = Σ_{j observed} w_j · (vMax_j − vMin_j) · sqrt(ln(2/δ) / (2n))
 *              [per-term Hoeffding bound on the observed-baseline mean, summed
 *               conservatively (union bound); 0 when no term is observed]
 * interval   = R̂ ± (ε_stat + ε_ens + ε_seed)                   [additive]
 * ```
 *
 * DISCLOSED LIMITS: (1) the Hoeffding term uses observed-basis extremes as
 * the per-term range — a conservative empirical envelope, not an a-priori
 * range; the additive combination is likewise conservative. (2) The horizon
 * is evaluated as K STATIONARY steps — the LAB-004 engine steps from the
 * registered world-model state, so cross-step world evolution (fatigue
 * compounding, audience carryover) is NOT modeled this wave; the horizon
 * dimension averages seeded noise draws. (3) Every estimate is a SIMULATED
 * estimate from a disclosed synthetic ensemble — never experimental proof;
 * the §24 real-experiment boundary is the only path to deployment-grade
 * evidence and remains untouched.
 *
 * LAG DISCIPLINE (lock rule 30): the basis is pulled ONLY through
 * `replayDelayedInformation` with L = scenario.informationLag (caller-fixed
 * — not shrinkable): records with `observedAt > T − L` can NEVER reach the
 * estimate.
 */

const isBlank = (value: string): boolean => value.trim().length === 0;

/** Options for {@link createInMemoryOffPolicyEvaluator}. */
export interface InMemoryOffPolicyEvaluatorOptions {
  /** The LAB-007 ensemble (evaluation + version reads). */
  readonly ensemble: Pick<
    EnsemblePort,
    'evaluateEnsemble' | 'getEnsemble' | 'resolveLatestEnsemble'
  >;
  /** The LAB-006 Time Machine (delayed-information replay ONLY). */
  readonly timeMachine: Pick<TimeMachinePort, 'replayDelayedInformation'>;
}

interface ObservedMeans {
  readonly means: Map<string, number>;
  readonly units: Map<string, string>;
  readonly minima: Map<string, number>;
  readonly maxima: Map<string, number>;
}

const observedStats = (
  observations: readonly HistoricalObservation[],
): ObservedMeans => {
  const sums = new Map<string, number>();
  const counts = new Map<string, number>();
  const units = new Map<string, string>();
  const minima = new Map<string, number>();
  const maxima = new Map<string, number>();
  for (const observation of observations) {
    for (const metric of observation.metrics) {
      const current = sums.get(metric.metric) ?? 0;
      sums.set(metric.metric, current + metric.value);
      counts.set(metric.metric, (counts.get(metric.metric) ?? 0) + 1);
      if (!units.has(metric.metric)) {
        units.set(metric.metric, metric.unit);
      }
      minima.set(metric.metric, Math.min(minima.get(metric.metric) ?? metric.value, metric.value));
      maxima.set(metric.metric, Math.max(maxima.get(metric.metric) ?? metric.value, metric.value));
    }
  }
  const means = new Map<string, number>();
  for (const [metric, sum] of sums) {
    means.set(metric, sum / (counts.get(metric) ?? 1));
  }
  return { means, units, minima, maxima };
};

const domainsFor = (
  prediction: EnsemblePrediction,
  observed: ObservedMeans,
): {
  readonly predictedMetrics: Map<string, number>;
  readonly predictedDeltas: Map<string, number>;
  readonly observedMeans: Map<string, number>;
} => ({
  predictedMetrics: new Map(
    prediction.metrics.map((metric) => [metric.metric, metric.expectedValue]),
  ),
  predictedDeltas: new Map(
    prediction.deltas.map((delta) => [delta.metric, delta.expectedDelta]),
  ),
  observedMeans: observed.means,
});

export function createInMemoryOffPolicyEvaluator(
  options: InMemoryOffPolicyEvaluatorOptions,
): OffPolicyEvaluationPort {
  const fail = (error: OffPolicyError['error'], message: string): OffPolicyError => ({
    error,
    message,
  });

  return {
    async evaluateCandidate(
      input: OffPolicyEvaluationInput,
    ): Promise<OffPolicyEvaluationResult> {
      // ---- 1. structural validation (fail closed, named codes) ----
      const candidateFault = validateStrategyActionCandidate(input.program.candidate);
      if (candidateFault !== null) {
        return fail('invalid-input', candidateFault);
      }
      if (!Number.isInteger(input.program.horizonSteps) || input.program.horizonSteps < 1) {
        return fail('invalid-input', 'program.horizonSteps must be an integer >= 1');
      }
      if (
        !Array.isArray(input.seeds) ||
        input.seeds.length === 0 ||
        input.seeds.some((seed) => typeof seed !== 'number' || !Number.isFinite(seed))
      ) {
        return fail('invalid-input', 'seeds must be a non-empty array of finite numbers');
      }
      if (typeof input.asOf !== 'string' || isBlank(input.asOf)) {
        return fail('invalid-input', 'asOf (T) must be a non-empty timestamp string');
      }
      const minObservations = input.minObservations ?? 1;
      if (!Number.isInteger(minObservations) || minObservations < 1) {
        return fail('invalid-input', 'minObservations must be an integer >= 1');
      }
      const confidence = input.confidence ?? 0.05;
      if (typeof confidence !== 'number' || !(confidence > 0 && confidence < 1)) {
        return fail('invalid-input', 'confidence must be a number in (0, 1)');
      }
      const specFault = validateRewardSpec(input.rewardSpec);
      if (specFault !== null) {
        return fail('invalid-input', specFault);
      }
      if (input.scenario.informationLag < 0 || !Number.isFinite(input.scenario.informationLag)) {
        return fail('invalid-input', 'scenario.informationLag must be a finite number >= 0');
      }

      // ---- 2. ensemble existence + version (pre-resolved for clean codes) ----
      const ensembleRecord = await options.ensemble.getEnsemble(
        input.scope,
        input.ensembleId,
        input.ensembleVersion,
      );
      if (ensembleRecord === null) {
        const latest = await options.ensemble.resolveLatestEnsemble(
          input.scope,
          input.ensembleId,
        );
        if (latest === null) {
          return fail(
            'unknown-ensemble',
            `no ensemble ${input.ensembleId} visible in this tenant scope`,
          );
        }
        return fail(
          'ensemble-version-not-found',
          `ensemble ${input.ensembleId} has no version ${input.ensembleVersion} in this tenant scope (latest is ${latest.version})`,
        );
      }
      if (
        ensembleRecord.niche !== input.scenario.niche ||
        ensembleRecord.platform !== input.scenario.platform
      ) {
        return fail(
          'invalid-input',
          `scenario (${input.scenario.niche}/${input.scenario.platform}) does not match ensemble ${input.ensembleId} v${input.ensembleVersion} (${ensembleRecord.niche}/${ensembleRecord.platform})`,
        );
      }

      // ---- 3. reward spec version pin (§21: versioned, never silent) ----
      if (input.rewardSpec.version !== input.scenario.rewardVersion) {
        return fail(
          'reward-version-mismatch',
          `rewardSpec.version ${input.rewardSpec.version} does not match scenario.rewardVersion ${input.scenario.rewardVersion}`,
        );
      }

      // ---- 4. history basis: Time Machine mode 2 ONLY (≤ T − L) ----
      const lagMs = input.scenario.informationLag;
      const basisResult = await options.timeMachine.replayDelayedInformation(input.scope, {
        asOf: input.asOf,
        lagMs,
        niche: input.scenario.niche,
        platform: input.scenario.platform,
      });
      if ('error' in basisResult) {
        return fail(
          'history-unavailable',
          `Time Machine delayed-information replay failed: [${basisResult.error}] ${basisResult.message}`,
        );
      }
      const basis = basisResult;
      if (basis.length < minObservations) {
        const insufficiency: OffPolicyInsufficientHistory = deepFreeze({
          verdict: 'insufficient-history',
          requiredMinimum: minObservations,
          observed: basis.length,
          asOf: input.asOf,
          lagMs,
          message: `lagged basis at T − L carries ${basis.length} observation(s); the declared minimum is ${minObservations} — no estimate is produced (never a silent zero)`,
        });
        return insufficiency;
      }
      const observed = observedStats(basis);
      const n = basis.length;

      // ---- 5. ensemble rollout over (seed, step) ----
      const rollout: EnsemblePrediction[] = [];
      for (const seed of input.seeds) {
        for (let step = 0; step < input.program.horizonSteps; step += 1) {
          const evaluationInput: EnsembleEvaluationInput = {
            scope: input.scope,
            ensembleId: input.ensembleId,
            ensembleVersion: input.ensembleVersion,
            scenario: input.scenario,
            candidate: input.program.candidate,
            seed,
            step,
          };
          const prediction = await options.ensemble.evaluateEnsemble(evaluationInput);
          if ('error' in prediction) {
            return fail(
              'ensemble-evaluation-failed',
              `ensemble evaluation failed at (seed ${seed}, step ${step}): [${prediction.error}] ${prediction.message}`,
            );
          }
          rollout.push(prediction);
        }
      }

      // ---- 6. reward series (fail closed on non-derivable/ambiguous terms) ----
      const spec: LabRewardSpec = input.rewardSpec;
      const series: number[] = [];
      const contributionSums = new Map<number, number>();
      let resolvedTerms: readonly ResolvedRewardTerm[] = [];
      for (const prediction of rollout) {
        const outcome = computeRewardValue(spec, domainsFor(prediction, observed));
        if ('failure' in outcome) {
          return fail(
            outcome.failure,
            `reward term source "${outcome.metricSource}" does not resolve ${
              outcome.failure === 'reward-term-ambiguous'
                ? 'unambiguously (predicted and observed domains overlap)'
                : 'in any predicted or observed metric domain'
            }`,
          );
        }
        series.push(outcome.reward);
        resolvedTerms = outcome.resolved;
        for (let index = 0; index < outcome.resolved.length; index += 1) {
          const resolved = outcome.resolved[index] as (typeof outcome.resolved)[number];
          const term = spec.terms[index] as (typeof spec.terms)[number];
          const signed =
            (term.direction === 'maximize' ? 1 : -1) * term.weight * resolved.value;
          contributionSums.set(index, (contributionSums.get(index) ?? 0) + signed);
        }
      }
      const estimatedReward = meanOf(series);

      // ---- 7. member-level + per-seed series for the uncertainty terms ----
      // The member-level reward MIRRORS the aggregate's per-term domain
      // binding (captured in `resolvedTerms`): predicted terms draw from the
      // member's OWN metrics/deltas; observed-baseline terms are member-
      // INDEPENDENT constants that carry into every member's sum identically
      // and therefore never inflate the member spread — the disagreement
      // half-width isolates the MODEL differences.
      const memberMetricSources = new Set<string>();
      const memberDeltaSources = new Set<string>();
      const memberObservedSources = new Map<string, number>();
      for (const resolved of resolvedTerms) {
        if (resolved.source === 'predicted-metric') {
          memberMetricSources.add(resolved.term.metricSource);
        } else if (resolved.source === 'predicted-delta') {
          memberDeltaSources.add(resolved.term.metricSource);
        } else {
          memberObservedSources.set(resolved.term.metricSource, resolved.value);
        }
      }
      const memberRewards: number[] = [];
      for (const prediction of rollout) {
        const memberCount = prediction.memberPredictions.length;
        for (let memberIndex = 0; memberIndex < memberCount; memberIndex += 1) {
          const member = prediction.memberPredictions[memberIndex] as (typeof prediction.memberPredictions)[number];
          const memberDomains = {
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
            observedMeans: memberObservedSources,
          };
          const outcome = computeRewardValue(spec, memberDomains);
          if ('failure' in outcome) {
            return fail(
              outcome.failure,
              `member ${member.memberId}: reward term source "${outcome.metricSource}" does not resolve`,
            );
          }
          memberRewards.push(outcome.reward);
        }
      }
      const perSeedAverages = input.seeds.map((_, index) =>
        meanOf(
          series.slice(
            index * input.program.horizonSteps,
            (index + 1) * input.program.horizonSteps,
          ),
        ),
      );

      const epsilonEnsemble = halfSpreadOf(memberRewards);
      const epsilonSeed = halfSpreadOf(perSeedAverages);
      let epsilonStatistical = 0;
      for (const term of spec.terms) {
        if (!observed.means.has(term.metricSource)) {
          continue;
        }
        const range =
          (observed.maxima.get(term.metricSource) ?? 0) -
          (observed.minima.get(term.metricSource) ?? 0);
        epsilonStatistical += term.weight * range * Math.sqrt(Math.log(2 / confidence) / (2 * n));
      }
      const totalHalfWidth = epsilonStatistical + epsilonEnsemble + epsilonSeed;

      // ---- 8. assemble the score (counterfactual, disclosed) ----
      const interval: PredictionInterval = {
        lower: estimatedReward - totalHalfWidth,
        upper: estimatedReward + totalHalfWidth,
      };
      const relativeHalfWidth =
        Math.abs(estimatedReward) === 0
          ? totalHalfWidth === 0 ? 0 : 1
          : totalHalfWidth / Math.abs(estimatedReward);
      const perTerm: RewardTermContribution[] = spec.terms.map((term, index) => {
        const meanContribution = (contributionSums.get(index) ?? 0) / series.length;
        return {
          metric: term.metric,
          direction: term.direction,
          metricSource: term.metricSource,
          source: resolvedTerms[index]?.source ?? 'observed',
          weight: term.weight,
          meanContribution,
        };
      });

      const score: OffPolicyEvaluationScore = deepFreeze({
        id: predictionId('ope', [
          input.ensembleId,
          input.ensembleVersion,
          input.program.candidate.strategyRef,
          input.rewardSpec.version,
          input.asOf,
          lagMs,
          input.seeds.join(','),
          input.program.horizonSteps,
          n,
        ]) as OffPolicyEvaluationId,
        tenantId: input.scope.tenantId as TenantId,
        verdict: 'estimated',
        estimatedReward,
        interval,
        uncertainty: {
          level:
            relativeHalfWidth < 0.05
              ? 'low'
              : relativeHalfWidth < 0.15
                ? 'moderate'
                : 'high',
          note: 'off-policy estimate from a disclosed synthetic ensemble over recorded history (§22) — simulated estimate, never ground truth',
        },
        uncertaintyBreakdown: {
          statisticalHalfWidth: epsilonStatistical,
          ensembleDisagreementHalfWidth: epsilonEnsemble,
          seedRobustnessHalfWidth: epsilonSeed,
          effectiveSampleSize: n,
          confidence,
          formula: 'ope-hoeffding-additive-v1',
        },
        rewardSpecVersion: input.rewardSpec.version,
        ensemble: {
          id: input.ensembleId,
          version: input.ensembleVersion,
          memberCount: ensembleRecord.members.length,
        },
        program: input.program,
        basis: {
          asOf: input.asOf,
          lagMs,
          observationIds: basis.map((observation) => observation.id),
          observationCount: n,
          observedMetricMeans: [...observed.means.entries()].map(([metric, mean]) => ({
            metric,
            mean,
            unit: observed.units.get(metric) ?? '',
          })),
        },
        perTerm,
        oodCarried: rollout.some((prediction) => prediction.ood.flagged),
        counterfactual: true,
        disclosure: 'off-policy-simulated-estimate',
        validity: {
          simulatedEstimate: true,
          statement:
            'off-policy estimate from a disclosed synthetic ensemble over recorded history — a SIMULATED estimate, never experimental proof; the real-experiment boundary (§24) is the only path to deployment-grade evidence',
        },
      });
      return score;
    },
  };
}
