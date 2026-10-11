import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildObservationSet,
  checkStampedObservation,
  classifyObservationInput,
  toPlatformSaidObservation,
  validateTenantId,
} from './index.js';
import type { Failure, IdGenerator, ObservationExpectation, PlatformSaidObservation, Result, TenantId } from './index.js';

const tenantOk = validateTenantId('acme');
if (!tenantOk.ok) assert.fail('fixture tenant must validate');
const tenant: TenantId = tenantOk.value;

const ids: IdGenerator = { nextId: (prefix) => `${prefix}-1` };

function expectation(overrides: Partial<ObservationExpectation> = {}): ObservationExpectation {
  return {
    experimentId: 'exp-1',
    tenantId: tenant,
    distributionBindingId: 'binding-1',
    distributionBindingVersion: '2.0.0',
    window: { startsAt: '2026-01-01T00:00:00Z', endsAt: '2026-01-02T00:00:00Z', maxObservations: 5 },
    ...overrides,
  };
}

function rawObservation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    observationId: 'obs-1',
    source: 'platform-said',
    saidAt: '2026-01-01T06:00:00Z',
    collectedAt: '2026-01-01T06:00:05Z',
    attribution: {
      distributionBindingId: 'binding-1',
      distributionBindingVersion: '2.0.0',
      saidBy: 'platform',
      channel: 'production-binding',
    },
    degradationFlag: false,
    outOfDistributionFlag: false,
    payload: { family: 'social', metricKey: 'social.engagement', trials: 10, successes: 8 },
    original: { note: 'verbatim upstream record' },
    ...overrides,
  };
}

function expectFailure<T>(result: Result<T, Failure>, code: string): Failure {
  if (result.ok) {
    assert.fail(`expected failure '${code}' but the operation succeeded`);
  }
  assert.equal(result.error.code, code);
  return result.error;
}

function stamp(input: Record<string, unknown>): PlatformSaidObservation {
  const classified = classifyObservationInput(input);
  if (!classified.ok) assert.fail(`fixture classify failed: ${classified.error.code}`);
  const stamped = toPlatformSaidObservation(classified.value, tenant);
  if (!stamped.ok) assert.fail(`fixture stamp failed: ${stamped.error.code}`);
  return stamped.value;
}

test('classify rejects a simulated record with E_NON_PLATFORM_SAID_SOURCE', () => {
  const failure = expectFailure(classifyObservationInput(rawObservation({ source: 'simulated' })), 'E_NON_PLATFORM_SAID_SOURCE');
  assert.equal(failure.details.source, 'simulated');
});

test('classify rejects a counterfactual record with E_NON_PLATFORM_SAID_SOURCE', () => {
  expectFailure(classifyObservationInput(rawObservation({ source: 'counterfactual' })), 'E_NON_PLATFORM_SAID_SOURCE');
});

test('classify rejects records without a source with E_OBSERVATION_INVALID', () => {
  const input = rawObservation();
  delete input['source'];
  expectFailure(classifyObservationInput(input), 'E_OBSERVATION_INVALID');
});

test('toPlatformSaidObservation stamps, canonicalizes, and preserves the verbatim original', () => {
  const observation = stamp(rawObservation());
  assert.equal(observation.tenantId, tenant);
  assert.equal(observation.source, 'platform-said');
  assert.equal(observation.payload.family, 'social');
  assert.deepEqual(observation.original, { note: 'verbatim upstream record' });
});

test('toPlatformSaidObservation rejects saidAt after collectedAt', () => {
  expectFailure(toPlatformSaidObservation(rawObservation({ saidAt: '2026-01-01T06:00:10Z' }), tenant), 'E_OBSERVATION_INVALID');
});

test('toPlatformSaidObservation rejects an out-of-range social payload', () => {
  expectFailure(
    toPlatformSaidObservation(rawObservation({ payload: { family: 'social', metricKey: 'k', trials: 10, successes: 11 } }), tenant),
    'E_OBSERVATION_INVALID',
  );
});

test('toPlatformSaidObservation rejects empty attribution fields', () => {
  expectFailure(
    toPlatformSaidObservation(rawObservation({ attribution: { distributionBindingId: '', distributionBindingVersion: '2.0.0', saidBy: 'platform', channel: 'production-binding' } }), tenant),
    'E_OBSERVATION_INVALID',
  );
});

test('defense in depth: a cast record stamped with a non-platform-said source is rejected', () => {
  const counterfeit = { ...stamp(rawObservation()), source: 'simulated' } as unknown as PlatformSaidObservation;
  expectFailure(checkStampedObservation(counterfeit, expectation()), 'E_NON_PLATFORM_SAID_SOURCE');
});

test('buildObservationSet seals a digest over the canonical stubs', () => {
  const first = stamp(rawObservation({ observationId: 'obs-1' }));
  const second = stamp(rawObservation({ observationId: 'obs-2', payload: { family: 'social', metricKey: 'social.engagement', trials: 15, successes: 9 } }));
  const sealed = buildObservationSet(expectation(), [first, second], ids);
  if (!sealed.ok) assert.fail(`expected ok, got ${sealed.error.code}`);
  assert.equal(sealed.value.observations.length, 2);
  assert.match(sealed.value.digest, /^[0-9a-f]{64}$/);
  assert.equal(sealed.value.observationSetId, 'obsset-1');
});

test('the digest is deterministic across identical builds and sensitive to order', () => {
  const first = stamp(rawObservation({ observationId: 'obs-1' }));
  const second = stamp(rawObservation({ observationId: 'obs-2', payload: { family: 'social', metricKey: 'social.engagement', trials: 15, successes: 9 } }));
  const a = buildObservationSet(expectation(), [first, second], ids);
  const b = buildObservationSet(expectation(), [first, second], ids);
  const reordered = buildObservationSet(expectation(), [second, first], ids);
  if (!a.ok || !b.ok || !reordered.ok) assert.fail('expected ok');
  assert.equal(a.value.digest, b.value.digest);
  assert.notEqual(a.value.digest, reordered.value.digest);
});

test('build rejects foreign-tenant observations with E_TENANT_SCOPE_VIOLATION', () => {
  const foreignOk = validateTenantId('other-co');
  if (!foreignOk.ok) assert.fail('fixture tenant must validate');
  const foreign = stamp(rawObservation());
  const failure = expectFailure(
    buildObservationSet(expectation({ tenantId: foreignOk.value }), [foreign], ids),
    'E_TENANT_SCOPE_VIOLATION',
  );
  assert.equal(failure.details.observationTenant, tenant);
});

test('build rejects observations attributed to a different binding (id and version)', () => {
  const otherId = stamp(rawObservation({ observationId: 'obs-a', attribution: { distributionBindingId: 'binding-2', distributionBindingVersion: '2.0.0', saidBy: 'platform', channel: 'production-binding' } }));
  const otherVersion = stamp(rawObservation({ observationId: 'obs-b', attribution: { distributionBindingId: 'binding-1', distributionBindingVersion: '3.0.0', saidBy: 'platform', channel: 'production-binding' } }));
  expectFailure(buildObservationSet(expectation(), [otherId], ids), 'E_ATTRIBUTION_BINDING_MISMATCH');
  expectFailure(buildObservationSet(expectation(), [otherVersion], ids), 'E_ATTRIBUTION_BINDING_MISMATCH');
});

test('build rejects observations outside the declared window', () => {
  const before = stamp(rawObservation({ observationId: 'obs-early', saidAt: '2025-12-31T23:00:00Z', collectedAt: '2025-12-31T23:00:05Z' }));
  const after = stamp(rawObservation({ observationId: 'obs-late', saidAt: '2026-01-03T00:00:00Z', collectedAt: '2026-01-03T00:00:05Z' }));
  expectFailure(buildObservationSet(expectation(), [before], ids), 'E_OBSERVATION_OUTSIDE_WINDOW');
  expectFailure(buildObservationSet(expectation(), [after], ids), 'E_OBSERVATION_OUTSIDE_WINDOW');
});

test('build rejects duplicate observation ids', () => {
  const one = stamp(rawObservation({ observationId: 'obs-dup' }));
  const two = stamp(rawObservation({ observationId: 'obs-dup', payload: { family: 'social', metricKey: 'k', trials: 5, successes: 5 } }));
  expectFailure(buildObservationSet(expectation(), [one, two], ids), 'E_DUPLICATE_OBSERVATION');
});

test('build enforces the declared observation cap', () => {
  const one = stamp(rawObservation({ observationId: 'obs-c1' }));
  const two = stamp(rawObservation({ observationId: 'obs-c2', payload: { family: 'social', metricKey: 'k', trials: 5, successes: 5 } }));
  expectFailure(
    buildObservationSet(expectation({ window: { startsAt: '2026-01-01T00:00:00Z', endsAt: '2026-01-02T00:00:00Z', maxObservations: 1 } }), [one, two], ids),
    'E_OBSERVATION_LIMIT_EXCEEDED',
  );
});
