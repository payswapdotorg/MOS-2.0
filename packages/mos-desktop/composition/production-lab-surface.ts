import type { TenantScope, Timestamp } from '@mos/contracts';
import type {
  MarketingBenchmarkPort,
  OnlineCalibrationPort,
  RealityObservationReaderPort,
  RobustBenchmarkError,
  RobustBenchmarkRecord,
} from '@mos/lab';
import type { LabBenchmarkDigestPort, LabCalibrationStatusPort } from '@mos/web';
import {
  createInMemoryEnsemble,
  createInMemoryMarketingBenchmark,
  createInMemoryOnlineCalibration,
  createInMemoryRealityObservationReader,
  createInMemorySimulatorEngine,
  createInMemorySocialWorldModelStore,
} from '../../mos-lab/dist/index.js';
import {
  EMPTY_LAB_SCENARIO_LOOKUP,
  benchmarkDigestViewOf,
  benchmarkSummaryViewOf,
  calibrationChainViewOf,
  calibrationContextViewOf,
  calibrationRecordViewOf,
} from './lab-runtime-projection.js';

/**
 * PRODUCTION Lab surface over the REAL `@mos/lab` runtimes (MOS v2.0
 * desktop shell, UX-003 over LAB-017 + LAB-018).
 *
 * Composition seam (OUTSIDE `src/`, the @mos/web discipline): wires the
 * REAL lab runtime stack — the LAB-007 ensemble over the LAB-004/005
 * simulator + world-model store, the LAB-017 robust marketing benchmark
 * and the LAB-018 online calibration with the disclosed in-memory reality
 * observation reader — and adapts its records into the web package's view
 * models through lab-runtime-projection.ts.
 *
 * FRESH, HONEST STATE — no fixtures, no demo seeds: every runtime starts
 * empty, and there is NO write path on the shell's Lab surface (running
 * benchmarks and recording calibration errors are lab-authority actions
 * this surface never fakes). The listing methods therefore return `[]`
 * until real records exist.
 *
 * CHAIN ENUMERATION (disclosed): the REAL domain ports expose per-id chain
 * reads but NO enumerate-all method, so the surface keeps an index of the
 * chain ids created through THIS composition's runtime instances — fed by
 * the only write paths (`runBenchmark` / `recordCalibrationError`). The
 * index is tenant-scoped (§31) and the reads stay per-id against the REAL
 * runtime. The wrapped runtimes are exposed below as disclosed
 * observability (`labRuntime`) — that is where future transports and tests
 * drive real runs; the shell itself never writes.
 *
 * The benchmark's LAB-018 citation seam (calibration contexts) is
 * late-bound: the benchmark is created before the calibration runtime and
 * wired through a holder resolved at call time — the two-directional
 * composition the lab package itself documents.
 */

/** Options for {@link createProductionLabSurface}. */
export interface ProductionLabSurfaceOptions {
  /** Injectable clock for deterministic record stamps. */
  readonly now?: () => string;
}

/** The REAL lab runtime stack this surface reads (disclosed observability). */
export interface ProductionLabRuntime {
  /** The REAL LAB-017 benchmark runtime (the only benchmark write path). */
  readonly benchmark: MarketingBenchmarkPort;
  /** The REAL LAB-018 calibration runtime (the only error/context write paths). */
  readonly calibration: OnlineCalibrationPort;
  /** The disclosed in-memory reality observation reader (empty at start). */
  readonly reality: RealityObservationReaderPort;
}

/** The production Lab surface bundle. */
export interface ProductionLabSurface {
  readonly labBenchmark: LabBenchmarkDigestPort;
  readonly labCalibration: LabCalibrationStatusPort;
  readonly labRuntime: ProductionLabRuntime;
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Build the production Lab surface over the REAL `@mos/lab` runtimes. */
export function createProductionLabSurface(
  options: ProductionLabSurfaceOptions = {},
): ProductionLabSurface {
  const now: () => Timestamp = options.now
    ? () => options.now() as Timestamp
    : () => new Date().toISOString() as Timestamp;

  // ---- the REAL runtime stack (fresh, empty, no seeds) ----
  const worldModels = createInMemorySocialWorldModelStore({ now });
  const simulator = createInMemorySimulatorEngine({ worldModels, now });
  const ensemble = createInMemoryEnsemble({ simulator, now });
  const reality = createInMemoryRealityObservationReader();

  // Late-bound LAB-018 citation seam (the loop's two-directional wiring).
  const lateBoundCalibration: { current: OnlineCalibrationPort | null } = { current: null };

  const coreBenchmark = createInMemoryMarketingBenchmark({
    ensemble,
    now,
    calibrationContexts: {
      getCalibrationContext: (scope, benchmarkId, version) => {
        const bound = lateBoundCalibration.current;
        if (bound === null) {
          return Promise.reject(
            new Error(
              'lab runtime wiring incomplete: the calibration context reader was invoked before the composition finished binding',
            ),
          );
        }
        return bound.getCalibrationContext(scope, benchmarkId, version);
      },
    },
  });

  // ---- the chain-indexing wrappers (the disclosed enumeration index) ----
  /** tenant id (string) → benchmark chain ids created through this composition. */
  const benchmarkChainIds = new Map<string, Set<string>>();
  /** tenant id (string) → calibration chain ids created through this composition. */
  const calibrationChainIds = new Map<string, Set<string>>();

  const indexChain = (index: Map<string, Set<string>>, tenantId: string, id: string): void => {
    const ids = index.get(tenantId) ?? new Set<string>();
    ids.add(id);
    index.set(tenantId, ids);
  };

  const chainIdsOf = (index: Map<string, Set<string>>, scope: TenantScope): string[] =>
    [...(index.get(String(scope.tenantId)) ?? new Set<string>())].sort();

  const benchmark: MarketingBenchmarkPort = {
    async runBenchmark(input): Promise<RobustBenchmarkRecord | RobustBenchmarkError> {
      const result = await coreBenchmark.runBenchmark(input);
      if (!('error' in result)) {
        indexChain(benchmarkChainIds, String(result.tenantId), String(result.id));
      }
      return result;
    },
    getBenchmarkRecord: (scope, id, version) => coreBenchmark.getBenchmarkRecord(scope, id, version),
    resolveLatestBenchmarkRecord: (scope, id) =>
      coreBenchmark.resolveLatestBenchmarkRecord(scope, id),
    listBenchmarkRecordVersions: (scope, id) =>
      coreBenchmark.listBenchmarkRecordVersions(scope, id),
    verifyBenchmarkRecordIntegrity: (scope, id, version) =>
      coreBenchmark.verifyBenchmarkRecordIntegrity(scope, id, version),
  };

  const coreCalibration = createInMemoryOnlineCalibration({ benchmark, reality, now });

  const calibration: OnlineCalibrationPort = {
    recordCalibrationError: async (input) => {
      const result = await coreCalibration.recordCalibrationError(input);
      if (!('error' in result)) {
        indexChain(calibrationChainIds, String(result.tenantId), String(result.id));
      }
      return result;
    },
    getCalibrationErrorRecord: (scope, id, version) =>
      coreCalibration.getCalibrationErrorRecord(scope, id, version),
    resolveLatestCalibrationErrorRecord: (scope, id) =>
      coreCalibration.resolveLatestCalibrationErrorRecord(scope, id),
    listCalibrationErrorVersions: (scope, id) =>
      coreCalibration.listCalibrationErrorVersions(scope, id),
    listCalibrationErrorsForBenchmark: (scope, benchmarkId) =>
      coreCalibration.listCalibrationErrorsForBenchmark(scope, benchmarkId),
    verifyCalibrationErrorRecordIntegrity: (scope, id, version) =>
      coreCalibration.verifyCalibrationErrorRecordIntegrity(scope, id, version),
    deriveCalibrationContext: (input) => coreCalibration.deriveCalibrationContext(input),
    getCalibrationContext: (scope, benchmarkId, version) =>
      coreCalibration.getCalibrationContext(scope, benchmarkId, version),
    resolveLatestCalibrationContext: (scope, benchmarkId) =>
      coreCalibration.resolveLatestCalibrationContext(scope, benchmarkId),
    listCalibrationContextVersions: (scope, benchmarkId) =>
      coreCalibration.listCalibrationContextVersions(scope, benchmarkId),
    verifyCalibrationContextIntegrity: (scope, benchmarkId, version) =>
      coreCalibration.verifyCalibrationContextIntegrity(scope, benchmarkId, version),
  };

  lateBoundCalibration.current = calibration;

  // ---- the view ports (read-only; every listing honest, fail-closed) ----
  const benchmarkUnavailable = (message: string) => ({
    error: 'lab-benchmark-unavailable' as const,
    message,
  });
  const benchmarkNotFound = (message: string) => ({
    error: 'lab-benchmark-not-found' as const,
    message,
  });
  const calibrationUnavailable = (message: string) => ({
    error: 'lab-calibration-unavailable' as const,
    message,
  });
  const calibrationNotFound = (message: string) => ({
    error: 'lab-calibration-not-found' as const,
    message,
  });

  const labBenchmark: LabBenchmarkDigestPort = {
    async listBenchmarkSummaries(scope) {
      try {
        const summaries = [];
        for (const id of chainIdsOf(benchmarkChainIds, scope)) {
          const records = await benchmark.listBenchmarkRecordVersions(scope, id as never);
          if (records.length === 0) {
            continue;
          }
          const latest = records[records.length - 1] as RobustBenchmarkRecord;
          summaries.push(benchmarkSummaryViewOf(latest, records.length, EMPTY_LAB_SCENARIO_LOOKUP));
        }
        return summaries;
      } catch (error) {
        return benchmarkUnavailable(
          `the lab benchmark listing degraded fail-closed: ${messageOf(error)}`,
        );
      }
    },

    async loadBenchmarkDigest(benchmarkId, version, scope) {
      try {
        const records = await benchmark.listBenchmarkRecordVersions(scope, benchmarkId as never);
        if (records.length === 0) {
          return benchmarkNotFound(
            `no benchmark record chain ${benchmarkId} is visible in this tenant scope`,
          );
        }
        const record =
          version === null
            ? (records[records.length - 1] as RobustBenchmarkRecord)
            : records.find((candidate) => candidate.version === version);
        if (record === undefined) {
          return benchmarkNotFound(
            `benchmark ${benchmarkId} has no record version ${version} in this tenant scope`,
          );
        }
        const integrity = await benchmark.verifyBenchmarkRecordIntegrity(
          scope,
          benchmarkId as never,
          record.version,
        );
        if (integrity === null) {
          return benchmarkUnavailable(
            `benchmark ${benchmarkId} record version ${record.version} could not be digest-verified in this tenant scope`,
          );
        }
        const latest = records[records.length - 1] as RobustBenchmarkRecord;
        const summary = benchmarkSummaryViewOf(latest, records.length, EMPTY_LAB_SCENARIO_LOOKUP);
        return benchmarkDigestViewOf(record, summary, integrity);
      } catch (error) {
        return benchmarkUnavailable(
          `the lab benchmark digest degraded fail-closed: ${messageOf(error)}`,
        );
      }
    },
  };

  const labCalibration: LabCalibrationStatusPort = {
    async listCalibrationChains(scope) {
      try {
        const chains = [];
        for (const id of chainIdsOf(calibrationChainIds, scope)) {
          const records = await calibration.listCalibrationErrorVersions(scope, id as never);
          if (records.length === 0) {
            continue;
          }
          const latest = records[records.length - 1];
          const latestIntegrity = await calibration.verifyCalibrationErrorRecordIntegrity(
            scope,
            id as never,
            latest.version,
          );
          if (latestIntegrity === null) {
            return calibrationUnavailable(
              `calibration ${id} latest error record could not be digest-verified in this tenant scope`,
            );
          }
          const contextRecord = await calibration.resolveLatestCalibrationContext(
            scope,
            latest.prediction.benchmarkId,
          );
          let context: Parameters<typeof calibrationChainViewOf>[0]['context'] = null;
          if (contextRecord !== null) {
            const contextIntegrity = await calibration.verifyCalibrationContextIntegrity(
              scope,
              latest.prediction.benchmarkId,
              contextRecord.version,
            );
            if (contextIntegrity === null) {
              return calibrationUnavailable(
                `the derived calibration context for benchmark ${String(latest.prediction.benchmarkId)} could not be digest-verified in this tenant scope`,
              );
            }
            context = { record: contextRecord, integrityStatus: contextIntegrity.status };
          }
          chains.push(calibrationChainViewOf({ records, latestIntegrity, context }));
        }
        return chains;
      } catch (error) {
        return calibrationUnavailable(
          `the lab calibration listing degraded fail-closed: ${messageOf(error)}`,
        );
      }
    },

    async loadCalibrationRecords(calibrationId, scope) {
      try {
        const records = await calibration.listCalibrationErrorVersions(
          scope,
          calibrationId as never,
        );
        if (records.length === 0) {
          return calibrationNotFound(
            `no calibration chain ${calibrationId} is visible in this tenant scope`,
          );
        }
        const views = [];
        for (const record of records) {
          // Resolve the CITED frozen benchmark record for the prediction-side
          // disclosure — fail closed when it does not resolve.
          const cited = await benchmark.getBenchmarkRecord(
            scope,
            record.prediction.benchmarkId,
            record.prediction.benchmarkVersion,
          );
          if (cited === null) {
            return calibrationUnavailable(
              `calibration ${calibrationId} version ${record.version} cites benchmark ${String(record.prediction.benchmarkId)} v${record.prediction.benchmarkVersion}, which is not resolvable in this tenant scope`,
            );
          }
          const integrity = await calibration.verifyCalibrationErrorRecordIntegrity(
            scope,
            calibrationId as never,
            record.version,
          );
          if (integrity === null) {
            return calibrationUnavailable(
              `calibration ${calibrationId} record version ${record.version} could not be digest-verified in this tenant scope`,
            );
          }
          views.push(calibrationRecordViewOf(record, cited.disclosure, integrity.status));
        }
        return views;
      } catch (error) {
        return calibrationUnavailable(
          `the lab calibration records degraded fail-closed: ${messageOf(error)}`,
        );
      }
    },

    async loadCalibrationContext(benchmarkId, scope) {
      try {
        const context = await calibration.resolveLatestCalibrationContext(
          scope,
          benchmarkId as never,
        );
        if (context === null) {
          // No derived context in this tenant scope: the FIRST-CLASS honest
          // calibration-pending state — null, never a fabricated context.
          return null;
        }
        const integrity = await calibration.verifyCalibrationContextIntegrity(
          scope,
          benchmarkId as never,
          context.version,
        );
        if (integrity === null) {
          return calibrationUnavailable(
            `the derived calibration context for benchmark ${benchmarkId} could not be digest-verified in this tenant scope`,
          );
        }
        return calibrationContextViewOf(context, integrity.status);
      } catch (error) {
        return calibrationUnavailable(
          `the lab calibration context degraded fail-closed: ${messageOf(error)}`,
        );
      }
    },
  };

  return {
    labBenchmark,
    labCalibration,
    labRuntime: { benchmark, calibration, reality },
  };
}
