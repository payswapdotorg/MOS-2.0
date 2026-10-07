import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createInMemoryEnsembleStore } from './in-memory-ensemble-store.js';
import type { EnsemblePort } from '../contracts/ensemble.js';
import {
  FIXED_NOW,
  ensembleId,
  fullCoverage,
  memberA,
  memberB,
  narrowCoverage,
  scopeOf,
  uniformPolicy,
  weightedPolicy,
} from '../testing/w4a-lab-fixtures.js';

const asRecord = (
  result: Awaited<ReturnType<EnsemblePort['registerEnsemble']>>,
) => {
  if ('error' in result) {
    assert.fail(`unexpected ensemble error: ${result.error} — ${result.message}`);
  }
  return result;
};

const asError = (
  result: Awaited<ReturnType<EnsemblePort['registerEnsemble']>>,
) => {
  assert.ok('error' in result, `expected a typed failure, got a record: ${String(result)}`);
  return result;
};

// ---------------------------------------------------------------------------
// Registration: versioned, tenant-scoped, structurally validated
// ---------------------------------------------------------------------------

test('ensemble registration creates an immutable version-1 record (deep-frozen)', async () => {
  const store = createInMemoryEnsembleStore({ now: FIXED_NOW });
  const record = asRecord(
    await store.registerEnsemble({
      scope: scopeOf('tenant-a'),
      ensemble: {
        id: ensembleId(),
        niche: 'sourdough-baking',
        platform: 'short-video',
        members: [memberA(), memberB()],
        weightingPolicy: uniformPolicy(),
      },
    }),
  );
  assert.equal(record.version, 1);
  assert.equal(record.tenantId, scopeOf('tenant-a').tenantId);
  assert.equal(record.status, 'active');
  assert.equal(record.members.length, 2);
  assert.equal(
    record.disclosure,
    'synthetic-ensemble-of-disclosed-response-functions',
  );
  assert.throws(() => {
    (record as unknown as { niche: string }).niche = 'tampered';
  }, TypeError);
  assert.throws(() => {
    (record.members as unknown as { push: (value: unknown) => void }).push(memberA());
  }, TypeError);
});

test('EMPTY and SINGLE-member ensembles are structurally rejected', async () => {
  const store = createInMemoryEnsembleStore({ now: FIXED_NOW });
  const base = {
    niche: 'sourdough-baking',
    platform: 'short-video',
    weightingPolicy: uniformPolicy(),
  };
  const empty = asError(
    await store.registerEnsemble({
      scope: scopeOf('tenant-a'),
      ensemble: { ...base, id: ensembleId('ens-empty'), members: [] },
    }),
  );
  assert.equal(empty.error, 'invalid-input');
  assert.match(
    empty.message,
    /at least two members.*structurally rejected/i,
  );

  const single = asError(
    await store.registerEnsemble({
      scope: scopeOf('tenant-a'),
      ensemble: { ...base, id: ensembleId('ens-single'), members: [memberA()] },
    }),
  );
  assert.equal(single.error, 'invalid-input');
  assert.match(single.message, /at least two members/i);
});

test('weighting policy discipline: uniform forbids member weights; declared weights require them', async () => {
  const store = createInMemoryEnsembleStore({ now: FIXED_NOW });
  const base = {
    niche: 'sourdough-baking',
    platform: 'short-video',
  };
  const uniformWithWeights = asError(
    await store.registerEnsemble({
      scope: scopeOf('tenant-a'),
      ensemble: {
        ...base,
        id: ensembleId('ens-uw'),
        members: [memberA({ weight: 2 }), memberB()],
        weightingPolicy: uniformPolicy(),
      },
    }),
  );
  assert.equal(uniformWithWeights.error, 'invalid-input');
  assert.match(uniformWithWeights.message, /uniform policy members must not declare weights/);

  const declaredMissingWeight = asError(
    await store.registerEnsemble({
      scope: scopeOf('tenant-a'),
      ensemble: {
        ...base,
        id: ensembleId('ens-dm'),
        members: [memberA(), memberB()],
        weightingPolicy: weightedPolicy(),
      },
    }),
  );
  assert.equal(declaredMissingWeight.error, 'invalid-input');
  assert.match(declaredMissingWeight.message, /requires a finite weight > 0/);

  const declaredBadWeight = asError(
    await store.registerEnsemble({
      scope: scopeOf('tenant-a'),
      ensemble: {
        ...base,
        id: ensembleId('ens-db'),
        members: [memberA({ weight: -1 }), memberB({ weight: 1 })],
        weightingPolicy: weightedPolicy(),
      },
    }),
  );
  assert.equal(declaredBadWeight.error, 'invalid-input');
  assert.match(declaredBadWeight.message, /finite weight > 0/);

  const declaredValid = asRecord(
    await store.registerEnsemble({
      scope: scopeOf('tenant-a'),
      ensemble: {
        ...base,
        id: ensembleId('ens-dv'),
        members: [memberA({ weight: 3 }), memberB({ weight: 1 })],
        weightingPolicy: weightedPolicy(),
      },
    }),
  );
  assert.equal(declaredValid.weightingPolicy.kind, 'declared-member-weights');
});

test('policy records must be explicit: blank note / bad kind / bad version rejected', async () => {
  const store = createInMemoryEnsembleStore({ now: FIXED_NOW });
  const base = {
    niche: 'sourdough-baking',
    platform: 'short-video',
    members: [memberA(), memberB()],
  };
  for (const policy of [
    { ...uniformPolicy(), note: '  ' },
    { ...uniformPolicy(), kind: 'silent-default' as never },
    { ...uniformPolicy(), version: 0 },
    { ...uniformPolicy(), id: '' },
  ]) {
    const bad = asError(
      await store.registerEnsemble({
        scope: scopeOf('tenant-a'),
        ensemble: { ...base, id: ensembleId('ens-p'), weightingPolicy: policy },
      }),
    );
    assert.equal(bad.error, 'invalid-input');
    assert.match(bad.message, /weightingPolicy\./);
  }
});

test('member validation: duplicate ids, bad world-model versions, malformed coverage rejected', async () => {
  const store = createInMemoryEnsembleStore({ now: FIXED_NOW });
  const base = {
    niche: 'sourdough-baking',
    platform: 'short-video',
    weightingPolicy: uniformPolicy(),
  };
  const duplicate = asError(
    await store.registerEnsemble({
      scope: scopeOf('tenant-a'),
      ensemble: {
        ...base,
        id: ensembleId('ens-dup'),
        members: [memberA(), memberA()],
      },
    }),
  );
  assert.equal(duplicate.error, 'invalid-input');
  assert.match(duplicate.message, /duplicate member id/);

  const badVersion = asError(
    await store.registerEnsemble({
      scope: scopeOf('tenant-a'),
      ensemble: {
        ...base,
        id: ensembleId('ens-bv'),
        members: [memberA({ worldModelVersion: 0 }), memberB()],
      },
    }),
  );
  assert.equal(badVersion.error, 'invalid-input');
  assert.match(badVersion.message, /worldModelVersion must be an integer >= 1/);

  const invertedCoverage = asError(
    await store.registerEnsemble({
      scope: scopeOf('tenant-a'),
      ensemble: {
        ...base,
        id: ensembleId('ens-ic'),
        members: [
          memberA({ coverage: { ...fullCoverage(), cadencePerWeek: { min: 14, max: 0 } } }),
          memberB(),
        ],
      },
    }),
  );
  assert.equal(invertedCoverage.error, 'invalid-input');
  assert.match(invertedCoverage.message, /coverage min must be <= max/);

  const outOfRangeCoverage = asError(
    await store.registerEnsemble({
      scope: scopeOf('tenant-a'),
      ensemble: {
        ...base,
        id: ensembleId('ens-oc'),
        members: [
          memberA({ coverage: { ...narrowCoverage(), novelty: { min: -0.5, max: 0.5 } } }),
          memberB(),
        ],
      },
    }),
  );
  assert.equal(outOfRangeCoverage.error, 'invalid-input');
  assert.match(outOfRangeCoverage.message, /coverage bounds must be >= 0/);
});

// ---------------------------------------------------------------------------
// Append-only composition: member addition + freeze
// ---------------------------------------------------------------------------

test('member addition APPENDS a new ensemble version (prior versions intact)', async () => {
  const store = createInMemoryEnsembleStore({ now: FIXED_NOW });
  const v1 = asRecord(
    await store.registerEnsemble({
      scope: scopeOf('tenant-a'),
      ensemble: {
        id: ensembleId(),
        niche: 'sourdough-baking',
        platform: 'short-video',
        members: [memberA(), memberB()],
        weightingPolicy: uniformPolicy(),
      },
    }),
  );
  const v2 = asRecord(
    await store.addEnsembleMember({
      scope: scopeOf('tenant-a'),
      ensembleId: ensembleId(),
      member: {
        id: 'member-c',
        worldModelId: 'world-c' as never,
        worldModelVersion: 1,
        coverage: fullCoverage(),
      },
    }),
  );
  assert.equal(v2.version, 2);
  assert.equal(v2.members.length, 3);
  assert.equal(v2.status, 'active');

  const v1Again = await store.getEnsemble(scopeOf('tenant-a'), ensembleId(), 1);
  assert.ok(v1Again !== null);
  assert.equal(v1Again.members.length, 2, 'v1 stays intact (append-only)');
  assert.deepEqual(v1Again, v1, 'v1 is bit-identical after the append');

  const versions = await store.listEnsembleVersions(scopeOf('tenant-a'), ensembleId());
  assert.equal(versions.length, 2);
  assert.deepEqual(
    versions.map((record) => record.version),
    [1, 2],
  );
  const latest = await store.resolveLatestEnsemble(scopeOf('tenant-a'), ensembleId());
  assert.ok(latest !== null && latest.version === 2);
});

test('adding a DUPLICATE member id fails closed', async () => {
  const store = createInMemoryEnsembleStore({ now: FIXED_NOW });
  await store.registerEnsemble({
    scope: scopeOf('tenant-a'),
    ensemble: {
      id: ensembleId(),
      niche: 'sourdough-baking',
      platform: 'short-video',
      members: [memberA(), memberB()],
      weightingPolicy: uniformPolicy(),
    },
  });
  const duplicate = asError(
    await store.addEnsembleMember({
      scope: scopeOf('tenant-a'),
      ensembleId: ensembleId(),
      member: memberA(),
    }),
  );
  assert.equal(duplicate.error, 'duplicate-member');
});

test('FREEZE appends a frozen version that blocks further member additions', async () => {
  const store = createInMemoryEnsembleStore({ now: FIXED_NOW });
  await store.registerEnsemble({
    scope: scopeOf('tenant-a'),
    ensemble: {
      id: ensembleId(),
      niche: 'sourdough-baking',
      platform: 'short-video',
      members: [memberA(), memberB()],
      weightingPolicy: uniformPolicy(),
    },
  });
  const frozen = asRecord(
    await store.freezeEnsemble(scopeOf('tenant-a'), ensembleId()),
  );
  assert.equal(frozen.version, 2);
  assert.equal(frozen.status, 'frozen');
  assert.equal(frozen.members.length, 2, 'freeze preserves the membership');

  const blocked = asError(
    await store.addEnsembleMember({
      scope: scopeOf('tenant-a'),
      ensembleId: ensembleId(),
      member: {
        id: 'member-c',
        worldModelId: 'world-c' as never,
        worldModelVersion: 1,
      },
    }),
  );
  assert.equal(blocked.error, 'ensemble-frozen');

  const refreeze = asError(
    await store.freezeEnsemble(scopeOf('tenant-a'), ensembleId()),
  );
  assert.equal(refreeze.error, 'invalid-input');
  assert.match(refreeze.message, /already frozen/);

  const v1 = await store.getEnsemble(scopeOf('tenant-a'), ensembleId(), 1);
  assert.ok(v1 !== null && v1.status === 'active', 'the pre-freeze version stays active');
});

// ---------------------------------------------------------------------------
// Tenant scoping + unknown ensembles (no existence leaks)
// ---------------------------------------------------------------------------

test('ensemble chains are TENANT-SCOPED (no cross-tenant existence leak)', async () => {
  const store = createInMemoryEnsembleStore({ now: FIXED_NOW });
  await store.registerEnsemble({
    scope: scopeOf('tenant-a'),
    ensemble: {
      id: ensembleId(),
      niche: 'sourdough-baking',
      platform: 'short-video',
      members: [memberA(), memberB()],
      weightingPolicy: uniformPolicy(),
    },
  });
  assert.equal(
    await store.getEnsemble(scopeOf('tenant-b'), ensembleId(), 1),
    null,
  );
  assert.equal(await store.resolveLatestEnsemble(scopeOf('tenant-b'), ensembleId()), null);
  assert.deepEqual(await store.listEnsembleVersions(scopeOf('tenant-b'), ensembleId()), []);

  const foreignAdd = asError(
    await store.addEnsembleMember({
      scope: scopeOf('tenant-b'),
      ensembleId: ensembleId(),
      member: memberA({ id: 'member-c' }),
    }),
  );
  assert.equal(foreignAdd.error, 'unknown-ensemble');

  // The same ensemble id in a different tenant is an INDEPENDENT chain.
  const other = asRecord(
    await store.registerEnsemble({
      scope: scopeOf('tenant-b'),
      ensemble: {
        id: ensembleId(),
        niche: 'sourdough-baking',
        platform: 'short-video',
        members: [memberA(), memberB()],
        weightingPolicy: uniformPolicy(),
      },
    }),
  );
  assert.equal(other.tenantId, scopeOf('tenant-b').tenantId);
  assert.equal(other.version, 1);
});

// ---------------------------------------------------------------------------
// Structural surface discipline
// ---------------------------------------------------------------------------

test('the ensemble composition surface is 6 append-only methods (no mutators)', () => {
  const store = createInMemoryEnsembleStore({ now: FIXED_NOW });
  const surface = Object.keys(store) as (keyof EnsemblePort)[];
  assert.deepEqual([...surface].sort(), [
    'addEnsembleMember',
    'freezeEnsemble',
    'getEnsemble',
    'listEnsembleVersions',
    'registerEnsemble',
    'resolveLatestEnsemble',
  ]);
  assert.ok(surface.length <= 12, 'architecture policy: maxPublicMethods');
  for (const method of surface) {
    assert.ok(
      !/update|delete|remove|rewrite|mutate|edit|patch/i.test(String(method)),
      `mutating method name forbidden on the ensemble surface: ${String(method)}`,
    );
  }
});
