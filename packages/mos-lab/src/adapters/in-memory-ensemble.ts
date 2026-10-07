import type { Timestamp } from '@mos/contracts';
import type { EnsemblePort } from '../contracts/ensemble.js';
import type { SimulatorEnginePort } from '../contracts/simulator.js';
import { createInMemoryEnsembleStore } from './in-memory-ensemble-store.js';
import type {
  InMemoryEnsembleStore,
  InMemoryEnsembleStoreOptions,
} from './in-memory-ensemble-store.js';
import { createInMemoryEnsembleEvaluator } from './in-memory-ensemble-evaluation.js';
import type {
  InMemoryEnsembleEvaluator,
  InMemoryEnsembleEvaluatorOptions,
} from './in-memory-ensemble-evaluation.js';

/**
 * The composed in-memory {@link EnsemblePort} (LAB-007): the composition
 * half (register/add/freeze/get/resolveLatest/list — append-only immutable
 * version chains) composed with the evaluation half (evaluateEnsemble +
 * runSeedRobustnessSweep — deterministic aggregation over the injected
 * LAB-004 simulator engine).
 *
 * W4-A DISCLOSURE: ephemeral process-local scaffold (durable persistence is
 * TL-owned). 8 public methods (≤ 12 policy budget). Every evaluation output
 * is a counterfactual-labeled `SimulationPrediction` carrying the §22
 * uncertainty set where computable (calibration is a provenance-declared
 * placeholder carried to LAB-018 — never faked).
 */

/** Options for {@link createInMemoryEnsemble}. */
export interface InMemoryEnsembleOptions {
  /** The LAB-004 simulator engine ensemble members execute through. */
  readonly simulator: SimulatorEnginePort;
  /** Injectable clock for deterministic `createdAt`/`predictedAt` stamps. */
  readonly now?: () => Timestamp;
}

export function createInMemoryEnsemble(
  options: InMemoryEnsembleOptions,
): EnsemblePort {
  const storeOptions: InMemoryEnsembleStoreOptions = options.now
    ? { now: options.now }
    : {};
  const store: InMemoryEnsembleStore = createInMemoryEnsembleStore(storeOptions);
  const evaluatorOptions: InMemoryEnsembleEvaluatorOptions = {
    ensembles: store,
    simulator: options.simulator,
    now: options.now,
  };
  const evaluator: InMemoryEnsembleEvaluator =
    createInMemoryEnsembleEvaluator(evaluatorOptions);
  return { ...store, ...evaluator };
}
