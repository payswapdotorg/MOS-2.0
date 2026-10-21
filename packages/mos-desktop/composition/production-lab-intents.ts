import type { TenantScope } from '@mos/contracts';
import type { LabIntentsPort } from '@mos/web';
import type { MarketingBenchmarkPort, OnlineCalibrationPort } from '@mos/lab';
import type { ProductionLabWorkspaceRuntime } from './production-lab-workspace.js';
import { createIntentLedger } from './production-lab-intents-core.js';
import { createWorkspaceLabIntentMethods } from './production-lab-intents-workspace.js';
import { createRunLabIntentMethods } from './production-lab-intents-runs.js';

/**
 * PRODUCTION Lab write-intent binding (UX-003 wave 3, second half) — the
 * LabIntentsPort over the REAL `@mos/lab` runtimes, assembled from:
 *  - production-lab-intents-core.ts — the ledger (every declaration
 *    recorded with its verdict, tenant-scoped reads) + receipt/failure
 *    builders;
 *  - production-lab-intents-parse.ts — the declared-JSON parse helpers
 *    (real `JSON.parse`, named `lab-intent-json-invalid:<field>` codes);
 *  - production-lab-intents-workspace.ts — ingest / snapshot /
 *    register-world-model / simulate-step over the workspace runtimes;
 *  - production-lab-intents-runs.ts — search-organizations /
 *    learn-strategy / run-benchmark / record-calibration-error over the
 *    ensemble, benchmark and calibration transports.
 *
 * The shell DECLARES; THIS binding is the authority transport the wave-20
 * record named as the runtimes' only write path. Each declare method
 * builds the REAL contract input and calls the REAL runtime method;
 * executed runs return the authority echo (the record id + version the
 * authority assigned + a summary of what it actually did, counterfactual
 * discipline visible), and `{error, message}` results map VERBATIM into
 * LabIntentFailure — the rights gate denies acquisition exactly like the
 * runtime says, unknown ensembles reject with the authority's own code,
 * nothing is retried and nothing is paraphrased into success.
 *
 * HONEST COMPOSITION: the only derived values are scope/tenant fields,
 * sequential intent ids and splits of the declared comma texts. The two
 * contract surfaces the declarations cannot fill are handled explicitly,
 * never invented — the ingest artifact reference is composed as the
 * DECLARED reference (visibly `declared-unverified` digest / `declared:`
 * storage, behind the rights gate), and the corpus snapshot's required
 * corpusId is named as a `lab-intent-missing-input` failure (see the
 * workspace module's docblock for the full disclosure).
 */

/** Options for {@link createProductionLabIntents}. */
export interface ProductionLabIntentsOptions {
  /** The tenant scope the composition serves (every intent's scope). */
  readonly scope: TenantScope;
  /** The REAL LAB-001..016 workspace runtimes (corpus/simulator/search/learning). */
  readonly labWorkspaceRuntime: ProductionLabWorkspaceRuntime;
  /** The REAL LAB-017 benchmark runtime (the composition's labRuntime.benchmark). */
  readonly benchmark: MarketingBenchmarkPort;
  /** The REAL LAB-018 calibration runtime (the composition's labRuntime.calibration). */
  readonly calibration: OnlineCalibrationPort;
  /** Injectable clock (deterministic tests). */
  readonly now?: () => string;
}

/**
 * Build the PRODUCTION LabIntentsPort over the REAL runtimes: sequential
 * intent ids `lab-intent-0001`… are composition-local; the ledger records
 * every verdict under the composition's scope.
 */
export function createProductionLabIntents(
  options: ProductionLabIntentsOptions,
): LabIntentsPort {
  const now = options.now ?? (() => new Date().toISOString());
  const scope: TenantScope = options.scope;
  const ledger = createIntentLedger({ scope, now });
  const deps = {
    scope,
    ledger,
    labWorkspaceRuntime: options.labWorkspaceRuntime,
    benchmark: options.benchmark,
    calibration: options.calibration,
  };
  return {
    ...createWorkspaceLabIntentMethods(deps),
    ...createRunLabIntentMethods(deps),
    loadLabIntentLedgerRecord: (intentId: string, scope: TenantScope) =>
      Promise.resolve(ledger.load(intentId, scope)),
  };
}
