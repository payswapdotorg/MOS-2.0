import type { LabScenario, TenantScope } from '@mos/contracts';
import type {
  LabIntentsPort,
  LearnStrategyDeclaration,
  RecordCalibrationErrorDeclaration,
  RunBenchmarkDeclaration,
  SearchOrganizationsDeclaration,
} from '@mos/web';
import type {
  BenchmarkCandidate,
  CalibrationErrorFunctional,
  CalibrationObservationRef,
  CalibrationPredictionRef,
  CandidateProgramDescriptor,
  LabCalibrationId,
  LabRewardSpec,
  LearningStoppingPolicy,
  MarketingBenchmarkPort,
  OnlineCalibrationPort,
  OrganizationSearchCandidates,
  OrganizationSearchPolicy,
  RobustBenchmarkId,
  RobustnessPolicy,
  WorldModelEnsembleId,
} from '@mos/lab';
import type { ProductionLabWorkspaceRuntime } from './production-lab-workspace.js';
import { parseDeclaredJson, splitCommaNumbers } from './production-lab-intents-parse.js';
import { failureOf, receiptOf, type IntentLedger } from './production-lab-intents-core.js';

/**
 * The RUNS half of the PRODUCTION lab-intents binding — the four declare
 * methods routed to the REAL ensemble/benchmark/calibration transports:
 * LAB-009 organization search and LAB-010 strategy learning (over the
 * workspace's LAB-007 ensemble — with no ensemble registered the
 * authorities reject `unknown-ensemble` and the verdicts pass through
 * VERBATIM), LAB-017 robust benchmark execution and LAB-018 calibration
 * recording (over the composition's labRuntime stack). Assembled into the
 * port by production-lab-intents.ts.
 *
 * DECLARED-JSON discipline: every contract-structured input (the scenario,
 * reward spec, candidate sets, policies, prediction ref, observation refs,
 * error functional) arrives as declared JSON text; the parse helpers check
 * the top-level kind the port's declaration type names (object, or array
 * for the benchmark candidate set and the observation refs — the no-op
 * baseline runs on an empty candidate set) and deeper shape validation is
 * the authority's, relayed verbatim. Counterfactual discipline stays
 * visible on every summary: search/learning/benchmark outputs are lab
 * candidates, never deployment evidence (§24), and the benchmark summary
 * ALWAYS names the no-op baseline the authority ran.
 */

/** Shared dependencies of the runs declare-method group. */
export interface RunIntentDeps {
  readonly scope: TenantScope;
  readonly ledger: IntentLedger;
  readonly labWorkspaceRuntime: ProductionLabWorkspaceRuntime;
  /** The REAL LAB-017 benchmark runtime (the composition's labRuntime.benchmark). */
  readonly benchmark: MarketingBenchmarkPort;
  /** The REAL LAB-018 calibration runtime (the composition's labRuntime.calibration). */
  readonly calibration: OnlineCalibrationPort;
}

/** Build the four runs declare methods over the REAL runtimes. */
export function createRunLabIntentMethods(deps: RunIntentDeps): Pick<
  LabIntentsPort,
  | 'declareSearchOrganizations'
  | 'declareLearnStrategy'
  | 'declareRunBenchmark'
  | 'declareRecordCalibrationError'
> {
  const scope = deps.scope;
  const ledger = deps.ledger;
  const runtimes = deps.labWorkspaceRuntime;
  const benchmark = deps.benchmark;
  const calibration = deps.calibration;

  return {
    async declareSearchOrganizations(
      declaration: SearchOrganizationsDeclaration,
    ): ReturnType<LabIntentsPort['declareSearchOrganizations']> {
      const identity = ledger.nextIdentity('search-organizations');
      const scenario = parseDeclaredJson(identity, declaration.scenarioJson, 'scenarioJson', 'object');
      if (!scenario.ok) {
        return ledger.record(identity, scenario.failure);
      }
      const rewardSpec = parseDeclaredJson(identity, declaration.rewardSpecJson, 'rewardSpecJson', 'object');
      if (!rewardSpec.ok) {
        return ledger.record(identity, rewardSpec.failure);
      }
      const candidates = parseDeclaredJson(identity, declaration.candidatesJson, 'candidatesJson', 'object');
      if (!candidates.ok) {
        return ledger.record(identity, candidates.failure);
      }
      const policy = parseDeclaredJson(identity, declaration.policyJson, 'policyJson', 'object');
      if (!policy.ok) {
        return ledger.record(identity, policy.failure);
      }
      const result = await runtimes.organizationSearch.searchOrganizations({
        scope,
        ensembleId: declaration.ensembleId as WorldModelEnsembleId,
        ensembleVersion: declaration.ensembleVersion,
        scenario: scenario.value as LabScenario,
        rewardSpec: rewardSpec.value as LabRewardSpec,
        candidates: candidates.value as OrganizationSearchCandidates,
        seed: declaration.seed,
        policy: policy.value as OrganizationSearchPolicy,
      });
      if ('error' in result) {
        return ledger.record(identity, failureOf(identity, result));
      }
      return ledger.record(
        identity,
        receiptOf(
          identity,
          result.id,
          1,
          `organization search ${result.id} ranked ${result.ranked.length} candidates (baseline + hand-designed + ${result.comparison.generated.length} generated) with seed ${declaration.seed} — counterfactual lab candidates only, the §24 real-experiment boundary untouched`,
        ),
      );
    },

    async declareLearnStrategy(
      declaration: LearnStrategyDeclaration,
    ): ReturnType<LabIntentsPort['declareLearnStrategy']> {
      const identity = ledger.nextIdentity('learn-strategy');
      const scenario = parseDeclaredJson(identity, declaration.scenarioJson, 'scenarioJson', 'object');
      if (!scenario.ok) {
        return ledger.record(identity, scenario.failure);
      }
      const rewardSpec = parseDeclaredJson(identity, declaration.rewardSpecJson, 'rewardSpecJson', 'object');
      if (!rewardSpec.ok) {
        return ledger.record(identity, rewardSpec.failure);
      }
      const initialProgram = parseDeclaredJson(
        identity,
        declaration.initialProgramJson,
        'initialProgramJson',
        'object',
      );
      if (!initialProgram.ok) {
        return ledger.record(identity, initialProgram.failure);
      }
      const stoppingPolicy = parseDeclaredJson(
        identity,
        declaration.stoppingPolicyJson,
        'stoppingPolicyJson',
        'object',
      );
      if (!stoppingPolicy.ok) {
        return ledger.record(identity, stoppingPolicy.failure);
      }
      const result = await runtimes.strategyLearning.learnStrategy({
        scope,
        ensembleId: declaration.ensembleId as WorldModelEnsembleId,
        ensembleVersion: declaration.ensembleVersion,
        scenario: scenario.value as LabScenario,
        rewardSpec: rewardSpec.value as LabRewardSpec,
        initialProgram: initialProgram.value as CandidateProgramDescriptor,
        seed: declaration.seed,
        stoppingPolicy: stoppingPolicy.value as LearningStoppingPolicy,
      });
      if ('error' in result) {
        return ledger.record(identity, failureOf(identity, result));
      }
      return ledger.record(
        identity,
        receiptOf(
          identity,
          result.id,
          1,
          `strategy candidate ${result.id} learned from simulation experience (${result.provenance.iterationCount} iterations, stopped: ${result.provenance.stoppingReason}) with seed ${declaration.seed} — counterfactual, it stays in the lab`,
        ),
      );
    },

    async declareRunBenchmark(
      declaration: RunBenchmarkDeclaration,
    ): ReturnType<LabIntentsPort['declareRunBenchmark']> {
      const identity = ledger.nextIdentity('run-benchmark');
      const scenario = parseDeclaredJson(identity, declaration.scenarioJson, 'scenarioJson', 'object');
      if (!scenario.ok) {
        return ledger.record(identity, scenario.failure);
      }
      // The candidate set is an ARRAY the port explicitly allows to be
      // empty — the no-op baseline still runs (§7 / lock rule 5).
      const candidates = parseDeclaredJson(identity, declaration.candidatesJson, 'candidatesJson', 'array');
      if (!candidates.ok) {
        return ledger.record(identity, candidates.failure);
      }
      const rewardSpec = parseDeclaredJson(identity, declaration.rewardSpecJson, 'rewardSpecJson', 'object');
      if (!rewardSpec.ok) {
        return ledger.record(identity, rewardSpec.failure);
      }
      const policy = parseDeclaredJson(identity, declaration.policyJson, 'policyJson', 'object');
      if (!policy.ok) {
        return ledger.record(identity, policy.failure);
      }
      const result = await benchmark.runBenchmark({
        scope,
        benchmarkId: declaration.benchmarkId as RobustBenchmarkId,
        scenario: scenario.value as LabScenario,
        candidates: candidates.value as readonly BenchmarkCandidate[],
        rewardSpec: rewardSpec.value as LabRewardSpec,
        policy: policy.value as RobustnessPolicy,
        seeds: splitCommaNumbers(declaration.seedsText),
      });
      if ('error' in result) {
        return ledger.record(identity, failureOf(identity, result));
      }
      return ledger.record(
        identity,
        receiptOf(
          identity,
          result.id,
          result.version,
          `robust benchmark ${result.id} recorded at version ${result.version}: ${result.comparison.declared.length} declared candidate${result.comparison.declared.length === 1 ? '' : 's'} + the no-op baseline over ${result.seeds.length} seeds — counterfactual §22 estimates, never deployment evidence`,
        ),
      );
    },

    async declareRecordCalibrationError(
      declaration: RecordCalibrationErrorDeclaration,
    ): ReturnType<LabIntentsPort['declareRecordCalibrationError']> {
      const identity = ledger.nextIdentity('record-calibration-error');
      const prediction = parseDeclaredJson(identity, declaration.predictionJson, 'predictionJson', 'object');
      if (!prediction.ok) {
        return ledger.record(identity, prediction.failure);
      }
      // The observation refs are an ARRAY of reality-observation ids.
      const observationRefs = parseDeclaredJson(
        identity,
        declaration.observationRefsJson,
        'observationRefsJson',
        'array',
      );
      if (!observationRefs.ok) {
        return ledger.record(identity, observationRefs.failure);
      }
      const rewardSpec = parseDeclaredJson(identity, declaration.rewardSpecJson, 'rewardSpecJson', 'object');
      if (!rewardSpec.ok) {
        return ledger.record(identity, rewardSpec.failure);
      }
      const functional = parseDeclaredJson(identity, declaration.functionalJson, 'functionalJson', 'object');
      if (!functional.ok) {
        return ledger.record(identity, functional.failure);
      }
      const result = await calibration.recordCalibrationError({
        scope,
        calibrationId: declaration.calibrationId as LabCalibrationId,
        prediction: prediction.value as CalibrationPredictionRef,
        observationRefs: observationRefs.value as readonly CalibrationObservationRef[],
        rewardSpec: rewardSpec.value as LabRewardSpec,
        functional: functional.value as CalibrationErrorFunctional,
        note: declaration.noteText.trim() === '' ? null : declaration.noteText,
      });
      if ('error' in result) {
        return ledger.record(identity, failureOf(identity, result));
      }
      return ledger.record(
        identity,
        receiptOf(
          identity,
          result.id,
          result.version,
          `calibration error recorded at version ${result.version} against benchmark ${result.prediction.benchmarkId} v${result.prediction.benchmarkVersion} candidate "${result.prediction.candidateKey}" (${result.observations.length} observation${result.observations.length === 1 ? '' : 's'}) — the frozen prediction stays frozen; the record feeds back only as declared context`,
        ),
      );
    },
  };
}
