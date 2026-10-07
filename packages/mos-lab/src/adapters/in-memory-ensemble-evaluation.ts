import type { Timestamp, Version } from '@mos/contracts';
import type {
  CalibrationPlaceholder,
  EnsembleError,
  EnsembleEvaluationInput,
  EnsemblePort,
  MemberPrediction,
  SeedRobustnessMetricSweep,
  SeedRobustnessSweep,
} from '../contracts/ensemble.js';
import type { SimulationPredictionId } from '../contracts/evidence.js';
import type {
  SimulatorEnginePort,
  SimulatorStepInput,
  SocialSimulationResult,
} from '../contracts/simulator.js';
import { aggregateEnsembleMembers, computeOodSignal } from './ensemble-aggregation.js';
import {
  deepFreeze,
  predictionId,
  validateStrategyActionCandidate,
} from './parametric-support.js';

/**
 * In-memory ensemble EVALUATION half (LAB-007): `evaluateEnsemble` +
 * `runSeedRobustnessSweep`.
 *
 * W4-A DISCLOSURE — DETERMINISTIC SYNTHETIC AGGREGATION, NOT A REAL MODEL
 * ENSEMBLE. Members execute through the injected LAB-004
 * `SimulatorEnginePort` (a disclosed deterministic synthetic response
 * function). The evaluation is a PURE function of its inputs:
 *
 * ```
 * memberSeed      = seed (ALL members share the (seed, step) noise stream,
 *                  so the member spread reflects MODEL differences, not
 *                  noise; seed robustness is measured by the sweep)
 * w_i             = policy-resolved effective weight (uniform: 1/N;
 *                  declared: member weight / Σ weights)
 * E[m], L[m], U[m], spread[m]  — see ensemble-aggregation.ts (documented)
 * OOD distance_d  = 0 inside the declared box, else gap / max(boxWidth, 1)
 * ```
 *
 * OOD is a DECLARED-COVERAGE seam: members without a coverage declaration
 * are `undeclared` (never counted as in-coverage); an out-of-coverage input
 * is FLAGGED on the prediction, never silently extrapolated. CALIBRATION is
 * a provenance-declared placeholder carried to LAB-018 — never a number.
 * Every output is a counterfactual-labeled `SimulationPrediction`
 * (lock rule 29) and can never occupy a historical slot.
 */

const nowDefault = (): Timestamp => new Date().toISOString() as Timestamp;

const fail = (error: EnsembleError['error'], message: string): EnsembleError => ({
  error,
  message,
});

const CALIBRATION_PLACEHOLDER: CalibrationPlaceholder = deepFreeze({
  status: 'not-calibrated',
  provenance:
    'calibration is LAB-018 (online calibration) — no calibration numbers are computed or implied by the ensemble',
});

/** Options for {@link createInMemoryEnsembleEvaluator}. */
export interface InMemoryEnsembleEvaluatorOptions {
  /** Ensemble record source (the composition half of the port). */
  readonly ensembles: Pick<EnsemblePort, 'getEnsemble' | 'resolveLatestEnsemble'>;
  /** The LAB-004 simulator engine members execute through. */
  readonly simulator: SimulatorEnginePort;
  /** Injectable clock for deterministic `predictedAt` stamps. */
  readonly now?: () => Timestamp;
}

const effectiveWeights = (
  members: readonly { readonly weight?: number }[],
  kind: 'uniform' | 'declared-member-weights',
): number[] => {
  if (kind === 'uniform') {
    return members.map(() => 1 / members.length);
  }
  const total = members.reduce((sum, member) => sum + (member.weight ?? 0), 0);
  return members.map((member) => (member.weight ?? 0) / total);
};

/** The evaluation half of the {@link EnsemblePort}. */
export type InMemoryEnsembleEvaluator = Pick<
  EnsemblePort,
  'evaluateEnsemble' | 'runSeedRobustnessSweep'
>;

export function createInMemoryEnsembleEvaluator(
  options: InMemoryEnsembleEvaluatorOptions,
): InMemoryEnsembleEvaluator {
  const now = options.now ?? nowDefault;

  const validateEvaluationInput = (
    input: EnsembleEvaluationInput,
  ): EnsembleError | null => {
    const candidateFault = validateStrategyActionCandidate(input.candidate);
    if (candidateFault !== null) {
      return fail('invalid-input', candidateFault);
    }
    if (typeof input.seed !== 'number' || !Number.isFinite(input.seed)) {
      return fail('invalid-input', 'seed is required and must be a finite number');
    }
    if (!Number.isInteger(input.step) || input.step < 0) {
      return fail('invalid-input', 'step must be an integer >= 0');
    }
    if (
      typeof input.scenario.informationLag !== 'number' ||
      !Number.isFinite(input.scenario.informationLag) ||
      input.scenario.informationLag < 0
    ) {
      return fail('invalid-input', 'scenario.informationLag must be a finite number >= 0');
    }
    return null;
  };

  const resolveEnsemble = async (
    input: EnsembleEvaluationInput,
  ): Promise<
    | { readonly error: EnsembleError }
    | { readonly ensemble: import('../contracts/ensemble.js').WorldModelEnsemble }
  > => {
    const record = await options.ensembles.getEnsemble(
      input.scope,
      input.ensembleId,
      input.ensembleVersion,
    );
    if (record !== null) {
      return { ensemble: record };
    }
    const latest = await options.ensembles.resolveLatestEnsemble(
      input.scope,
      input.ensembleId,
    );
    if (latest === null) {
      return {
        error: fail(
          'unknown-ensemble',
          `no ensemble ${input.ensembleId} visible in this tenant scope`,
        ),
      };
    }
    return {
      error: fail(
        'ensemble-version-not-found',
        `ensemble ${input.ensembleId} has no version ${input.ensembleVersion} in this tenant scope (latest is ${latest.version})`,
      ),
    };
  };

  const runMembers = async (
    input: EnsembleEvaluationInput,
    ensemble: import('../contracts/ensemble.js').WorldModelEnsemble,
  ): Promise<{ readonly error: EnsembleError } | { readonly members: readonly MemberPrediction[] }> => {
    const weights = effectiveWeights(ensemble.members, ensemble.weightingPolicy.kind);
    const memberPredictions: MemberPrediction[] = [];
    for (let index = 0; index < ensemble.members.length; index += 1) {
      const member = ensemble.members[index] as (typeof ensemble.members)[number];
      const stepInput: SimulatorStepInput = {
        scope: input.scope,
        worldModelId: member.worldModelId,
        worldModelVersion: member.worldModelVersion,
        scenario: input.scenario,
        candidate: input.candidate,
        seed: input.seed,
        step: input.step,
      };
      const result: SocialSimulationResult | import('../contracts/simulator.js').SimulatorError =
        await options.simulator.simulateStep(stepInput);
      if ('error' in result) {
        return {
          error: fail(
            'member-evaluation-failed',
            `member ${member.id} (world model ${member.worldModelId} v${member.worldModelVersion}) failed: [${result.error}] ${result.message}`,
          ),
        };
      }
      memberPredictions.push({
        memberId: member.id,
        worldModelId: member.worldModelId,
        worldModelVersion: member.worldModelVersion,
        effectiveWeight: weights[index] as number,
        prediction: result,
      });
    }
    return { members: memberPredictions };
  };

  const evaluateInternal = async (
    input: EnsembleEvaluationInput,
  ): Promise<import('../contracts/ensemble.js').EnsemblePrediction | EnsembleError> => {
    const invalid = validateEvaluationInput(input);
    if (invalid !== null) {
      return invalid;
    }
    const resolved = await resolveEnsemble(input);
    if ('error' in resolved) {
      return resolved.error;
    }
    const ensemble = resolved.ensemble;
    if (ensemble.niche !== input.scenario.niche || ensemble.platform !== input.scenario.platform) {
      return fail(
        'scenario-ensemble-mismatch',
        `scenario (${input.scenario.niche}/${input.scenario.platform}) does not match ensemble ${input.ensembleId} v${input.ensembleVersion} (${ensemble.niche}/${ensemble.platform})`,
      );
    }
    if (ensemble.members.length < 2) {
      return fail(
        'invalid-input',
        `ensemble ${input.ensembleId} v${input.ensembleVersion} carries fewer than two members — evaluation fails closed`,
      );
    }
    const run = await runMembers(input, ensemble);
    if ('error' in run) {
      return run.error;
    }
    const aggregated = aggregateEnsembleMembers(run.members);
    const ood = computeOodSignal(ensemble.members, input.candidate);

    const prediction: import('../contracts/ensemble.js').EnsemblePrediction = {
      id: predictionId('ens', [
        input.ensembleId,
        input.ensembleVersion,
        input.candidate.strategyRef,
        input.seed,
        input.step,
      ]) as SimulationPredictionId,
      version: 1 as Version,
      tenantId: input.scope.tenantId,
      scenarioRef: input.scenario.id,
      worldModelVersion: input.ensembleVersion as Version,
      simulatorVersion: input.scenario.simulatorVersion,
      strategyRef: input.candidate.strategyRef,
      seed: input.seed,
      step: input.step,
      metrics: aggregated.metrics,
      predictedAt: now(),
      uncertainty: aggregated.uncertainty,
      counterfactual: true,
      disclosure: 'synthetic-response-function',
      ensembleId: input.ensembleId,
      ensembleVersion: input.ensembleVersion,
      weightingPolicy: ensemble.weightingPolicy,
      memberPredictions: run.members,
      disagreement: aggregated.disagreement,
      ood,
      calibration: CALIBRATION_PLACEHOLDER,
      deltas: aggregated.deltas,
      nonUniversalMetrics: aggregated.nonUniversalMetrics,
    };
    return deepFreeze(prediction);
  };

  return {
    evaluateEnsemble: evaluateInternal,

    async runSeedRobustnessSweep(
      input: EnsembleEvaluationInput & { readonly seeds: readonly number[] },
    ): Promise<SeedRobustnessSweep | EnsembleError> {
      const invalid = validateEvaluationInput(input);
      if (invalid !== null) {
        return invalid;
      }
      if (
        !Array.isArray(input.seeds) ||
        input.seeds.length < 2 ||
        input.seeds.some((seed) => typeof seed !== 'number' || !Number.isFinite(seed))
      ) {
        return fail(
          'invalid-input',
          'a seed robustness sweep requires at least two finite seeds',
        );
      }
      const resolved = await resolveEnsemble(input);
      if ('error' in resolved) {
        return resolved.error;
      }
      const ensemble = resolved.ensemble;
      if (ensemble.niche !== input.scenario.niche || ensemble.platform !== input.scenario.platform) {
        return fail(
          'scenario-ensemble-mismatch',
          `scenario (${input.scenario.niche}/${input.scenario.platform}) does not match ensemble ${input.ensembleId} v${input.ensembleVersion} (${ensemble.niche}/${ensemble.platform})`,
        );
      }
      const perSeedMetrics: import('../contracts/ensemble.js').EnsemblePrediction[] = [];
      for (const seed of input.seeds) {
        const prediction = await evaluateInternal({ ...input, seed });
        if ('error' in prediction) {
          return prediction;
        }
        perSeedMetrics.push(prediction);
      }

      const metricNames = perSeedMetrics[0]?.metrics.map((metric) => metric.metric) ?? [];
      const perMetric: SeedRobustnessMetricSweep[] = [];
      let worstRelativeSpread = 0;
      for (const name of metricNames) {
        const expectedBySeed = perSeedMetrics.map((prediction) => {
          const metric = prediction.metrics.find((row) => row.metric === name);
          return metric?.expectedValue ?? 0;
        });
        const min = Math.min(...expectedBySeed);
        const max = Math.max(...expectedBySeed);
        const spread = max - min;
        const mean = expectedBySeed.reduce((sum, value) => sum + value, 0) / expectedBySeed.length;
        const relativeSpread =
          Math.abs(mean) === 0 ? (spread === 0 ? 0 : 1) : spread / Math.abs(mean);
        if (relativeSpread > worstRelativeSpread) worstRelativeSpread = relativeSpread;
        perMetric.push({
          metric: name,
          unit: perSeedMetrics[0]?.metrics.find((row) => row.metric === name)?.unit ?? '',
          expectedBySeed,
          min,
          max,
          spread,
          relativeSpread,
        });
      }

      const sweep: SeedRobustnessSweep = deepFreeze({
        ensembleId: input.ensembleId,
        ensembleVersion: input.ensembleVersion,
        scenarioRef: input.scenario.id,
        strategyRef: input.candidate.strategyRef,
        seeds: input.seeds,
        step: input.step,
        perMetric,
        summary: {
          level:
            worstRelativeSpread < 0.05
              ? 'low'
              : worstRelativeSpread < 0.15
                ? 'moderate'
                : 'high',
          note: 'seed robustness = (max − min) of aggregate expected values across the swept seeds (§22); simulation-derived diagnostic — NOT ground truth',
        },
        counterfactual: true,
        disclosure: 'synthetic-response-function',
      });
      return sweep;
    },
  };
}
