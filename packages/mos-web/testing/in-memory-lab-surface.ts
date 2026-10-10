import type { TenantScope } from '@mos/contracts';
import type { LabBenchmarkDigestPort } from '../dist/src/ports/lab-benchmark.js';
import type { LabCalibrationStatusPort } from '../dist/src/ports/lab-calibration.js';
import {
  FIXTURE_BENCHMARK_RECORDS,
  FIXTURE_LAB_SCENARIOS,
} from './lab-fixture-benchmarks.js';
import {
  FIXTURE_CALIBRATION_CONTEXTS,
  FIXTURE_CALIBRATION_RECORDS,
} from './lab-fixture-calibrations.js';
import {
  benchmarkDigestViewOf,
  benchmarkSummaryViewOf,
  calibrationChainViewOf,
  calibrationContextViewOf,
  calibrationRecordViewOf,
  labBenchmarkFailure,
  labCalibrationFailure,
  sameLabTenant,
  type LabScenarioLookup,
} from './lab-shape-adapter.js';
import type {
  CalibrationContextRecordFixture,
  OnlineCalibrationRecordFixture,
  RobustBenchmarkRecordFixture,
} from './lab-fixture-shapes.js';

/**
 * DISCLOSED in-memory double for the Lab view ports (UX-003, over
 * LAB-017 + LAB-018).
 *
 * Composition seam (OUTSIDE `src/`): implements the web package's
 * `LabBenchmarkDigestPort` and `LabCalibrationStatusPort` by adapting the
 * REAL-shaped fixture records (`lab-fixture-benchmarks.ts` /
 * `lab-fixture-calibrations.ts` — data in the EXACT authority record shapes,
 * see `lab-fixture-shapes.ts` for the field-for-field mirrors and the
 * disclosure of why the shapes are re-declared rather than imported) through
 * the shared shape adapter. The real lab runtime is node-side; the TL-owned
 * production composition binds the same ports over the real records without
 * touching the ports or any view component.
 *
 * Read guards mirror the authority's own discipline: exact-tenant listing,
 * no existence leaks across tenants (§31), append-only chain reads, explicit
 * typed failures — never guessed data. There is NO write path on either
 * port: running benchmarks, recording calibration errors and deriving
 * contexts are lab-authority actions this double never fakes.
 */

/** Options for {@link createInMemoryLabSurface}. */
export interface InMemoryLabSurfaceOptions {
  /**
   * Failure injection for the honest-unavailable states (route-level tests):
   * when set, `listBenchmarkSummaries` / `listCalibrationChains` fail
   * explicitly.
   */
  readonly failListings?: boolean;
}

/** The lab surface double: the two ports plus disclosed test observability. */
export interface InMemoryLabSurface {
  readonly labBenchmark: LabBenchmarkDigestPort;
  readonly labCalibration: LabCalibrationStatusPort;
  /** Fixture access for tests (counts only — the records stay frozen data). */
  readonly fixtureBenchmarkChainCount: () => number;
  readonly fixtureCalibrationChainCount: () => number;
}

const SCENARIOS: LabScenarioLookup = {
  scenarioOf: (scenarioRef) => FIXTURE_LAB_SCENARIOS[scenarioRef] ?? null,
};

interface BenchmarkChain {
  readonly benchmarkId: string;
  readonly tenantId: string;
  /** Append-only record versions, oldest first. */
  readonly records: readonly RobustBenchmarkRecordFixture[];
}

interface CalibrationChain {
  readonly calibrationId: string;
  readonly tenantId: string;
  readonly records: readonly OnlineCalibrationRecordFixture[];
  readonly context: CalibrationContextRecordFixture | null;
}

const benchmarkChains = (): BenchmarkChain[] => {
  const byId = new Map<string, RobustBenchmarkRecordFixture[]>();
  for (const record of FIXTURE_BENCHMARK_RECORDS) {
    const key = `${String(record.tenantId)}:${String(record.id)}`;
    const chain = byId.get(key) ?? [];
    chain.push(record);
    byId.set(key, chain);
  }
  return [...byId.entries()]
    .map(([key, records]) => ({
      benchmarkId: key.slice(key.indexOf(':') + 1),
      tenantId: key.slice(0, key.indexOf(':')),
      records: [...records].sort((a, b) => a.version - b.version),
    }))
    .sort((a, b) => (a.benchmarkId < b.benchmarkId ? -1 : 1));
};

const calibrationChains = (): CalibrationChain[] => {
  const byId = new Map<string, OnlineCalibrationRecordFixture[]>();
  for (const record of FIXTURE_CALIBRATION_RECORDS) {
    const key = `${String(record.tenantId)}:${String(record.id)}`;
    const chain = byId.get(key) ?? [];
    chain.push(record);
    byId.set(key, chain);
  }
  return [...byId.entries()]
    .map(([key, records]) => {
      const calibrationId = key.slice(key.indexOf(':') + 1);
      const tenantId = key.slice(0, key.indexOf(':'));
      const context =
        FIXTURE_CALIBRATION_CONTEXTS.find(
          (candidate) =>
            String(candidate.benchmarkId) === String(records[0]?.prediction.benchmarkId) &&
            sameLabTenant({ tenantId: tenantId as never }, String(candidate.tenantId)),
        ) ?? null;
      return {
        calibrationId,
        tenantId,
        records: [...records].sort((a, b) => a.version - b.version),
        context,
      };
    })
    .sort((a, b) => (a.calibrationId < b.calibrationId ? -1 : 1));
};

/**
 * Build the in-memory Lab surface over the REAL-shaped fixtures. The
 * benchmark directory lists ascending by benchmark id with per-chain
 * summaries from the LATEST record; the calibration status lists ascending
 * by calibration id.
 */
export function createInMemoryLabSurface(
  options: InMemoryLabSurfaceOptions = {},
): InMemoryLabSurface {
  const chains = benchmarkChains();
  const calibrations = calibrationChains();

  const labBenchmark: LabBenchmarkDigestPort = {
    async listBenchmarkSummaries(scope: TenantScope) {
      if (options.failListings === true) {
        return labBenchmarkFailure(
          'lab-benchmark-unavailable',
          'the lab benchmark service failed explicitly (injected)',
        );
      }
      return chains
        .filter((chain) => sameLabTenant(scope, chain.tenantId))
        .map((chain) => {
          const latest = chain.records[chain.records.length - 1] as RobustBenchmarkRecordFixture;
          return benchmarkSummaryViewOf(latest, chain.records.length, SCENARIOS);
        });
    },

    async loadBenchmarkDigest(benchmarkId: string, version: number | null, scope: TenantScope) {
      const chain = chains.find(
        (candidate) =>
          candidate.benchmarkId === benchmarkId && sameLabTenant(scope, candidate.tenantId),
      );
      // Unknown OR cross-tenant: the same explicit miss — no existence leak
      // across tenant boundaries (§31).
      if (chain === undefined) {
        return labBenchmarkFailure(
          'lab-benchmark-not-found',
          `no benchmark record chain ${benchmarkId} is visible in this tenant scope`,
        );
      }
      const record =
        version === null
          ? (chain.records[chain.records.length - 1] as RobustBenchmarkRecordFixture)
          : chain.records.find((candidate) => candidate.version === version);
      if (record === undefined) {
        return labBenchmarkFailure(
          'lab-benchmark-not-found',
          `benchmark ${benchmarkId} has no record version ${version} in this tenant scope`,
        );
      }
      const latest = chain.records[chain.records.length - 1] as RobustBenchmarkRecordFixture;
      const summary = benchmarkSummaryViewOf(latest, chain.records.length, SCENARIOS);
      return benchmarkDigestViewOf(record, summary);
    },
  };

  const labCalibration: LabCalibrationStatusPort = {
    async listCalibrationChains(scope: TenantScope) {
      if (options.failListings === true) {
        return labCalibrationFailure(
          'lab-calibration-unavailable',
          'the lab calibration service failed explicitly (injected)',
        );
      }
      return calibrations
        .filter((chain) => sameLabTenant(scope, chain.tenantId))
        .map((chain) => calibrationChainViewOf(chain.records, chain.context));
    },

    async loadCalibrationRecords(calibrationId: string, scope: TenantScope) {
      const chain = calibrations.find(
        (candidate) =>
          candidate.calibrationId === calibrationId && sameLabTenant(scope, candidate.tenantId),
      );
      if (chain === undefined) {
        return labCalibrationFailure(
          'lab-calibration-not-found',
          `no calibration chain ${calibrationId} is visible in this tenant scope`,
        );
      }
      return chain.records.map(calibrationRecordViewOf);
    },

    async loadCalibrationContext(benchmarkId: string, scope: TenantScope) {
      const context = FIXTURE_CALIBRATION_CONTEXTS.find(
        (candidate) =>
          String(candidate.benchmarkId) === benchmarkId &&
          sameLabTenant(scope, String(candidate.tenantId)),
      );
      // No derived context in this tenant scope: the FIRST-CLASS honest
      // calibration-pending state — null, never a fabricated context.
      return context === undefined ? null : calibrationContextViewOf(context);
    },
  };

  return {
    labBenchmark,
    labCalibration,
    fixtureBenchmarkChainCount: () => chains.filter((chain) => chain.tenantId === 'tenant-demo').length,
    fixtureCalibrationChainCount: () =>
      calibrations.filter((chain) => chain.tenantId === 'tenant-demo').length,
  };
}
