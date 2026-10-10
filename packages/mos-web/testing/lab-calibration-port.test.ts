/**
 * Lab online-calibration port tests (UX-003, over LAB-018) — the DISCLOSED
 * in-memory double behind the declared view port: chain listing with the
 * derived-context state (calibration-ACTIVE vs the first-class honest
 * calibration-PENDING), append-only record chains, the counterfactual
 * prediction side vs the measured observation side (lock rule 29), the
 * frozen v1 functional, §31 isolation and honest failures.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { TenantScope } from '@mos/contracts';
import { createInMemoryLabSurface } from './in-memory-lab-surface.js';

const DEMO_SCOPE: TenantScope = { tenantId: 'tenant-demo' as never, workspaceId: 'ws_demo' as never };
const FOREIGN_SCOPE: TenantScope = { tenantId: 'tenant-other' as never };

test('the calibration status lists the demo chains ascending with their benchmark refs', async () => {
  const surface = createInMemoryLabSurface();
  const chains = await surface.labCalibration.listCalibrationChains(DEMO_SCOPE);
  if ('error' in chains) {
    assert.fail(`unexpected listing failure: ${chains.error}`);
  }
  assert.deepEqual(
    chains.map((chain) => chain.calibrationId),
    ['calib-launch-1', 'calib-reach-1'],
  );
  const reach = chains.find((chain) => chain.calibrationId === 'calib-reach-1');
  assert.ok(reach);
  assert.equal(reach.benchmarkId, 'bench-reach-v1');
  assert.equal(reach.errorRecordCount, 2);
  assert.equal(reach.latestErrorVersion, 2);
  assert.equal(String(reach.tenantId), 'tenant-demo');
});

test('a chain with a derived context shows it (calibration ACTIVE, the closed loop)', async () => {
  const surface = createInMemoryLabSurface();
  const chains = await surface.labCalibration.listCalibrationChains(DEMO_SCOPE);
  if ('error' in chains) {
    assert.fail('unexpected listing failure');
  }
  const reach = chains.find((chain) => chain.calibrationId === 'calib-reach-1');
  assert.ok(reach);
  assert.ok(reach.context !== null, 'the reach chain has a derived context');
  assert.equal(reach.context?.version, 1);
  assert.equal(reach.context?.summary.errorRecordCount, 2);
  assert.equal(reach.context?.summary.meanSignedError, -2.9);
  assert.equal(reach.context?.summary.meanAbsoluteError, 4.5);
  assert.equal(reach.context?.summary.worstAbsoluteError, 7.4);
  assert.equal(reach.context?.summary.intervalCoverage, 0.5);
  assert.deepEqual([...reach.context?.summary.regimes ?? []], ['baseline', 'launch-promo']);
  assert.deepEqual(
    reach.context?.errorRecordCitations.map((citation) => citation.version),
    [1, 2],
  );
  assert.equal(reach.context?.labOnly.includes('never implies calibrated simulator output'), true);
});

test('a chain with NO derived context renders the first-class pending state (never fabricated)', async () => {
  const surface = createInMemoryLabSurface();
  const chains = await surface.labCalibration.listCalibrationChains(DEMO_SCOPE);
  if ('error' in chains) {
    assert.fail('unexpected listing failure');
  }
  const launch = chains.find((chain) => chain.calibrationId === 'calib-launch-1');
  assert.ok(launch);
  assert.equal(launch.context, null, 'no context derived — calibration pending, honestly');
  assert.equal(launch.errorRecordCount, 1);
});

test('a chain’s records load oldest-first with the prediction/observation separation pinned', async () => {
  const surface = createInMemoryLabSurface();
  const records = await surface.labCalibration.loadCalibrationRecords('calib-reach-1', DEMO_SCOPE);
  if ('error' in records) {
    assert.fail('unexpected records failure');
  }
  assert.equal(records.length, 2);
  assert.deepEqual(
    records.map((record) => record.version),
    [1, 2],
    'append-only chain order, oldest first — history is never rewritten',
  );
  for (const record of records) {
    assert.equal(record.predicted.counterfactual, true, 'the prediction side is counterfactual');
    assert.ok(record.observed.observations.length >= 1);
    for (const observation of record.observed.observations) {
      assert.equal(observation.counterfactual, false, 'the observation side is measured reality');
    }
    assert.equal(record.functional.id, 'calib-signed-error-v1');
    assert.equal(record.functional.version, 1);
    assert.equal(record.labOnly.includes('never becomes an experiment or measurement authority'), true);
  }
});

test('the error decomposition is consistent with the cited prediction and outcome', async () => {
  const surface = createInMemoryLabSurface();
  const records = await surface.labCalibration.loadCalibrationRecords('calib-reach-1', DEMO_SCOPE);
  if ('error' in records) {
    assert.fail('unexpected records failure');
  }
  const v1 = records[0];
  assert.ok(v1);
  assert.equal(v1.predicted.expectedReward, 24.6);
  assert.equal(v1.observed.outcome, 17.2);
  assert.equal(v1.errors.signedError, -7.4, 'signed = observed − predicted (over-estimated)');
  assert.equal(v1.errors.absoluteError, 7.4);
  assert.equal(v1.errors.intervalContainment, false, 'reality fell OUTSIDE the predicted interval');
  assert.equal(v1.benchmarkRef.benchmarkId, 'bench-reach-v1');
  assert.equal(v1.benchmarkRef.benchmarkVersion, 1);
  assert.equal(v1.benchmarkRef.candidateKey, 'clip-5');

  const v2 = records[1];
  assert.ok(v2);
  assert.equal(v2.errors.signedError, 1.6);
  assert.equal(v2.errors.intervalContainment, true, 'reality fell INSIDE the predicted interval');
});

test('the context read returns the derived context for its benchmark chain, null when pending', async () => {
  const surface = createInMemoryLabSurface();
  const reachContext = await surface.labCalibration.loadCalibrationContext('bench-reach-v1', DEMO_SCOPE);
  assert.ok(reachContext !== null && !('error' in reachContext));
  assert.equal(reachContext.version, 1);

  const launchContext = await surface.labCalibration.loadCalibrationContext('bench-launch-v2', DEMO_SCOPE);
  assert.equal(launchContext, null, 'no context derived for the launch chain — pending, not a failure');
});

test('an unknown calibration id fails closed with the named not-found failure', async () => {
  const surface = createInMemoryLabSurface();
  const failure = await surface.labCalibration.loadCalibrationRecords('calib-ghost', DEMO_SCOPE);
  assert.deepEqual('error' in failure && failure.error, 'lab-calibration-not-found');
});

test('a known calibration id in a foreign tenant fails closed the SAME way (§31)', async () => {
  const surface = createInMemoryLabSurface();
  const failure = await surface.labCalibration.loadCalibrationRecords('calib-reach-1', FOREIGN_SCOPE);
  assert.deepEqual('error' in failure && failure.error, 'lab-calibration-not-found');
  const foreignChains = await surface.labCalibration.listCalibrationChains(FOREIGN_SCOPE);
  if ('error' in foreignChains) {
    assert.fail('unexpected listing failure');
  }
  assert.deepEqual(
    foreignChains.map((chain) => chain.calibrationId),
    ['calib-other-1'],
    'the foreign tenant sees ONLY its own chain',
  );
});

test('the injected listing failure surfaces as the explicit unavailable failure', async () => {
  const surface = createInMemoryLabSurface({ failListings: true });
  const failure = await surface.labCalibration.listCalibrationChains(DEMO_SCOPE);
  assert.deepEqual('error' in failure && failure.error, 'lab-calibration-unavailable');
});

test('the composition wires the lab ports and turns the Lab section on (UX-003)', async () => {
  const { createInMemoryMosWebComposition } = await import('./compose-in-memory-mos-web.js');
  const composition = createInMemoryMosWebComposition();
  assert.equal(typeof composition.labBenchmark.listBenchmarkSummaries, 'function');
  assert.equal(typeof composition.labBenchmark.loadBenchmarkDigest, 'function');
  assert.equal(typeof composition.labCalibration.listCalibrationChains, 'function');
  assert.equal(typeof composition.labCalibration.loadCalibrationRecords, 'function');
  assert.equal(typeof composition.labCalibration.loadCalibrationContext, 'function');

  const shellView = await composition.appShell.loadAppShell();
  if ('error' in shellView) {
    assert.fail(`unexpected app-shell failure: ${shellView.error}`);
  }
  const lab = shellView.sections.find((section) => section.id === 'lab');
  assert.deepEqual(lab?.availability, { kind: 'available' });
  const connections = shellView.sections.find((section) => section.id === 'connections');
  assert.equal(connections?.availability.kind, 'not-yet-available', 'UX-004 stays untouched');
});
