import type { Timestamp } from '@mos/contracts';
import type {
  EnsembleError,
  EnsembleEvaluationInput,
  EnsemblePort,
  EnsemblePrediction,
  WorldModelEnsemble,
} from '../contracts/ensemble.js';
import type { PredictionInterval } from '../contracts/evidence.js';
import type {
  OrganizationCandidateEvaluation,
  OrganizationSearchError,
  OrganizationSearchInput,
  OrganizationSeedRobustness,
} from '../contracts/organization-search.js';
import type { SearchedOrganizationCandidate } from '../contracts/organization-features.js';
import { computeRewardValue, halfSpreadOf, meanOf, uncertaintyLevelForRelativeHalfWidth } from './reward-computation.js';
import { deepFreeze, mixStepSeed } from './parametric-support.js';
import { organizationEffectiveHorizon, organizationSimulatorAction } from './organization-simulation-mapping.js';

/**
 * INTERNAL candidate estimation for the LAB-010 organization search (NOT
 * exported from the package index).
 *
 * Mirrors the LAB-009 learner's rollout (same disclosure class): the
 * candidate's documented synthetic action mapping is rolled out through the
 * LAB-007 ensemble (whose members execute through the LAB-004
 * SimulatorEnginePort — deterministic, seed-required) over the policy's
 * evaluation seeds and the candidate's stopping-capped horizon:
 *
 * ```
 * estimate   = mean over (seed, step) of R(ensemble evaluation)
 * ε_ens      = half the member-reward spread (model disagreement)
 * ε_seed     = half the per-seed-average spread (seed robustness)
 * interval   = estimate ± (ε_ens + ε_seed)
 * cost       = seeds × horizon × memberCount member steps
 * ```
 *
 * Every output is a counterfactual, ensemble-evaluated simulation estimate
 * (lock rule 29) with the §22 set the ensemble surfaces (disagreement, seed
 * robustness, OOD aggregate; calibration carried as the declared
 * placeholder — never a number).
 */

const fail = (error: OrganizationSearchError['error'], message: string): OrganizationSearchError => ({
  error,
  message,
});

const CALIBRATION_PLACEHOLDER: OrganizationCandidateEvaluation['calibration'] = deepFreeze({
  status: 'not-calibrated',
  provenance:
    'calibration is LAB-018 (online calibration) — no calibration numbers are computed or implied by the ensemble',
});

/** The deterministic evaluation seeds of one search (same derivation as LAB-009's rollout seeds). */
export const evaluationSeedsOf = (seed: number, seedCount: number): number[] => {
  const seeds: number[] = [];
  for (let index = 0; index < seedCount; index += 1) {
    seeds.push(mixStepSeed(seed, 101 * (index + 1)));
  }
  return seeds;
};

/** The ensemble the estimation reads through (narrow seam). */
export interface OrganizationEstimationEnsemble {
  readonly ensemble: Pick<EnsemblePort, 'evaluateEnsemble'>;
  readonly now: () => Timestamp;
}

/**
 * Estimate one candidate: expected reward + §22 uncertainty set + cost.
 * Fails closed on ensemble errors (`ensemble-evaluation-failed`) and
 * non-derivable reward terms (`reward-term-not-derivable`).
 */
export async function estimateOrganizationCandidate(
  options: OrganizationEstimationEnsemble,
  input: OrganizationSearchInput,
  ensembleRecord: WorldModelEnsemble,
  candidate: SearchedOrganizationCandidate,
): Promise<OrganizationCandidateEvaluation | OrganizationSearchError> {
  const action = organizationSimulatorAction(candidate, input.policy);
  const horizon = organizationEffectiveHorizon(candidate, input.policy);
  const seeds = evaluationSeedsOf(input.seed, input.policy.seedCount);
  const series: number[] = [];
  const memberRewards: number[] = [];
  let oodStatus: 'in-coverage' | 'out-of-declared-coverage' | 'partially-undeclared' = 'in-coverage';
  for (const seed of seeds) {
    for (let step = 0; step < horizon; step += 1) {
      const evaluationInput: EnsembleEvaluationInput = {
        scope: input.scope,
        ensembleId: input.ensembleId,
        ensembleVersion: input.ensembleVersion,
        scenario: input.scenario,
        candidate: action,
        seed,
        step,
      };
      const prediction: EnsemblePrediction | EnsembleError =
        await options.ensemble.evaluateEnsemble(evaluationInput);
      if ('error' in prediction) {
        return fail(
          'ensemble-evaluation-failed',
          `ensemble evaluation failed at (seed ${seed}, step ${step}): [${prediction.error}] ${prediction.message}`,
        );
      }
      const domains = {
        predictedMetrics: new Map(
          prediction.metrics.map((metric) => [metric.metric, metric.expectedValue]),
        ),
        predictedDeltas: new Map(
          prediction.deltas.map((delta) => [delta.metric, delta.expectedDelta]),
        ),
      };
      const outcome = computeRewardValue(input.rewardSpec, domains);
      if ('failure' in outcome) {
        return fail(
          'reward-term-not-derivable',
          `reward term source "${outcome.metricSource}" does not resolve in any ensemble-predicted metric domain (resolution failure: ${outcome.failure})`,
        );
      }
      series.push(outcome.reward);
      for (const member of prediction.memberPredictions) {
        const memberDomains = {
          predictedMetrics: new Map(
            member.prediction.metrics.map((metric) => [metric.metric, metric.expectedValue]),
          ),
          predictedDeltas: new Map(
            member.prediction.deltas.map((delta) => [delta.metric, delta.expectedDelta]),
          ),
        };
        const memberOutcome = computeRewardValue(input.rewardSpec, memberDomains);
        if ('failure' in memberOutcome) {
          return fail(
            'reward-term-not-derivable',
            `member ${member.memberId}: reward term source "${memberOutcome.metricSource}" does not resolve (resolution failure: ${memberOutcome.failure})`,
          );
        }
        memberRewards.push(memberOutcome.reward);
      }
      if (prediction.ood.status === 'out-of-declared-coverage') {
        oodStatus = 'out-of-declared-coverage';
      } else if (prediction.ood.status === 'partially-undeclared' && oodStatus === 'in-coverage') {
        oodStatus = 'partially-undeclared';
      }
    }
  }
  const expectedReward = meanOf(series);
  const disagreementHalfWidth = halfSpreadOf(memberRewards);
  const perSeedExpected = seeds.map((_, index) =>
    meanOf(series.slice(index * horizon, (index + 1) * horizon)),
  );
  const seedHalfWidth = halfSpreadOf(perSeedExpected);
  const halfWidth = disagreementHalfWidth + seedHalfWidth;
  const interval: PredictionInterval = {
    lower: expectedReward - halfWidth,
    upper: expectedReward + halfWidth,
  };
  const seedRobustness: OrganizationSeedRobustness = {
    seeds,
    perSeedExpected,
    spread: 2 * seedHalfWidth,
    halfSpread: seedHalfWidth,
  };
  return {
    expectedReward,
    interval,
    uncertainty: {
      level: uncertaintyLevelForRelativeHalfWidth(expectedReward, halfWidth),
      note: 'expected reward from simulation experience only (§22) — ensemble disagreement + seed spread; NOT ground truth',
    },
    disagreementHalfWidth,
    seedRobustness,
    ood: { status: oodStatus, flagged: oodStatus !== 'in-coverage' },
    calibration: CALIBRATION_PLACEHOLDER,
    simulatedMemberSteps: seeds.length * horizon * ensembleRecord.members.length,
    effectiveHorizonSteps: horizon,
    counterfactual: true,
    disclosure: 'ensemble-evaluated-simulation-estimate',
  };
}
