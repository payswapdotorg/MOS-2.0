/**
 * W9-B adversarial regression probes (production/engine/security sweep) —
 * the @mos/lab stores.
 *
 * Attack probes, shaped the way a hostile caller or a future bug would:
 *
 *  - hostile id factories (the W3-A branch-bleed class): every version-chain
 *    store keyed its chains by a DELIMITER-CONCATENATED `${tenant}\u0000${id}`
 *    composite key. That concatenation is NOT injective: a hostile tenant id
 *    containing the delimiter aliases the chain of an honest tenant whose
 *    record id contains it too — e.g. honest ("tenant-a", "x\u0000y") vs
 *    hostile ("tenant-a\u0000x", "y") produce the SAME old key, so the
 *    hostile registration APPENDED INTO the honest tenant's version chain
 *    (cross-tenant record bleed / latest-version corruption). The JSON
 *    array composite keys are injective over the tuple; these probes are
 *    the pinning tests;
 *  - exact-equality tenant listing: the pre-fix `listX` implementations
 *    PREFIX-SCANNED the composite keys — a delimiter-laden tenant id
 *    ("tenant-a\u0000anything") widened another tenant's listing. The
 *    fixed listings compare the stored record's tenant EXACTLY.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createInMemoryDynamicsModelStore } from './in-memory-dynamics.js';
import { createInMemoryEnsembleStore } from './in-memory-ensemble-store.js';
import {
  createInMemorySimulatorEngine,
  createInMemorySocialWorldModelStore,
} from './in-memory-social-simulator.js';
import { createInMemoryCorpusStore } from './in-memory-corpus-store.js';
import { createInMemoryTransformDefinitionRegistry } from './in-memory-transform-definition-registry.js';
import { createInMemoryTransformDiscovery } from './in-memory-transform-discovery.js';
import { createInMemoryTransformGraph } from './in-memory-transform-graph.js';
import { createHumanTaskStore } from './human-task-store.js';
import { createInMemoryTimeMachine } from './in-memory-time-machine.js';
import type { RightsCheckPort, RightsCheckVerdict } from '../contracts/corpus.js';
import type { LabHumanProductionTask } from '../contracts/human-production-task.js';
import type {
  CreateBranchInput,
  TimeMachineBranchId,
} from '../contracts/time-machine.js';
import type { LabScenario, TenantId, Version } from '@mos/contracts';
import { SEED_CAPABILITY_CATALOG, createInMemoryCapabilityRegistry } from '@mos/capabilities';
import {
  FIXED_NOW,
  memberA,
  memberB,
  uniformPolicy,
} from '../testing/w4a-lab-fixtures.js';
import { definitionInputOf, scopeOf } from '../testing/w5a-transform-fixtures.js';
import { knownCandidateInput } from '../testing/w6a-lab-fixtures.js';

const NUL = '\u0000';
const tenantId = (value: string): TenantId => value as TenantId;

const allowAllRights: RightsCheckPort = {
  checkAcquisitionRights: async (): Promise<RightsCheckVerdict> => ({ ok: true }),
};

const userSegment = (id: string) => ({
  id,
  kind: 'user-archetype' as const,
  label: `user archetype ${id}`,
  share: 0.5,
  fatigueSensitivity: 0.4,
  noveltySeeking: 0.6,
  engagementPropensity: 0.5,
});

// ---------------------------------------------------------------------------
// Dynamics model store — hostile composite-key collision
// ---------------------------------------------------------------------------

test('W9-B probe: a hostile tenant id containing the old delimiter cannot append into another tenant\'s dynamics chain', async () => {
  const models = createInMemoryDynamicsModelStore({ now: FIXED_NOW });
  const base = {
    niche: 'sourdough-baking',
    platform: 'short-video',
    populations: [userSegment('users'), { ...userSegment('creators'), id: 'creators', share: 0.5 }],
  };
  // The honest tenant registers an id that CONTAINS the delimiter…
  const honest = await models.registerDynamicsModel({
    scope: scopeOf('tenant-a'),
    dynamicsModel: { id: ('dyn' + NUL + 'x') as never, ...base, notes: 'honest' },
  });
  assert.ok(!('error' in honest), 'fixture premise: the honest registration succeeds');
  // …and the hostile tenant id + suffix concatenate into the SAME old key.
  const hostile = await models.registerDynamicsModel({
    scope: scopeOf('tenant-a' + NUL + 'dyn'),
    dynamicsModel: { id: 'x' as never, ...base, notes: 'hostile' },
  });
  assert.ok(!('error' in hostile));

  // Under the old `${tenant}\u0000${id}` key the hostile write APPENDED into
  // the honest chain (version 2). The injective JSON key keeps the chains
  // independent: both are version 1, each tenant lists exactly one version,
  // and the honest record is untouched.
  assert.equal(honest.version, 1);
  assert.equal(hostile.version, 1, 'the hostile write must NOT extend the honest chain');
  assert.equal(
    (await models.listDynamicsModelVersions(scopeOf('tenant-a'), ('dyn' + NUL + 'x') as never))
      .length,
    1,
  );
  const honestLatest = await models.getDynamicsModel(scopeOf('tenant-a'), ('dyn' + NUL + 'x') as never, 1 as Version);
  assert.ok(honestLatest !== null);
  assert.equal(honestLatest.notes, 'honest');
});

// ---------------------------------------------------------------------------
// Ensemble store — hostile composite-key collision
// ---------------------------------------------------------------------------

test('W9-B probe: a hostile tenant id containing the old delimiter cannot corrupt another tenant\'s ensemble chain', async () => {
  const store = createInMemoryEnsembleStore({ now: FIXED_NOW });
  const ensemble = () => ({
    niche: 'sourdough-baking',
    platform: 'short-video',
    members: [memberA(), memberB()],
    weightingPolicy: uniformPolicy(),
  });
  const honest = await store.registerEnsemble({
    scope: scopeOf('tenant-a'),
    ensemble: { id: ('ens' + NUL + 'x') as never, ...ensemble() },
  });
  assert.ok(!('error' in honest));
  const hostile = await store.registerEnsemble({
    scope: scopeOf('tenant-a' + NUL + 'ens'),
    ensemble: { id: 'x' as never, ...ensemble() },
  });
  assert.ok(!('error' in hostile));

  // Pre-fix: both writes landed in ONE chain — the honest tenant's latest
  // became the HOSTILE record (cross-tenant record bleed). Post-fix: each
  // tenant's chain holds exactly its own record.
  const honestVersions = await store.listEnsembleVersions(
    scopeOf('tenant-a'),
    ('ens' + NUL + 'x') as never,
  );
  assert.equal(honestVersions.length, 1);
  assert.equal(honestVersions[0]?.tenantId, tenantId('tenant-a'));
  const honestLatest = await store.resolveLatestEnsemble(
    scopeOf('tenant-a'),
    ('ens' + NUL + 'x') as never,
  );
  assert.ok(honestLatest !== null);
  assert.equal(honestLatest.tenantId, tenantId('tenant-a'), 'the honest latest stays honest');
  const hostileLatest = await store.resolveLatestEnsemble(scopeOf('tenant-a' + NUL + 'ens'), 'x' as never);
  assert.ok(hostileLatest !== null);
  assert.equal(hostileLatest.tenantId, tenantId('tenant-a' + NUL + 'ens'));
});

// ---------------------------------------------------------------------------
// World-model store — hostile composite-key collision
// ---------------------------------------------------------------------------

test('W9-B probe: a hostile tenant id containing the old delimiter cannot corrupt another tenant\'s world-model chain', async () => {
  const worldModels = createInMemorySocialWorldModelStore({ now: FIXED_NOW });
  const state = { baseAudience: 100, fatigue: 0, competitorShare: 0.1, seasonalFactor: 1 };
  const honest = await worldModels.registerWorldModel({
    scope: scopeOf('tenant-a'),
    worldModel: { id: ('world' + NUL + 'x') as never, niche: 'sourdough-baking', platform: 'short-video', state, notes: 'honest' },
  });
  assert.ok(!('error' in honest));
  const hostile = await worldModels.registerWorldModel({
    scope: scopeOf('tenant-a' + NUL + 'world'),
    worldModel: { id: 'x' as never, niche: 'sourdough-baking', platform: 'short-video', state, notes: 'hostile' },
  });
  assert.ok(!('error' in hostile));

  assert.equal(honest.worldModelVersion, 1);
  assert.equal(hostile.worldModelVersion, 1, 'the hostile write must not extend the honest chain');
  const honestVersions = await worldModels.listWorldModelVersions(
    scopeOf('tenant-a'),
    ('world' + NUL + 'x') as never,
  );
  assert.equal(honestVersions.length, 1);
  assert.equal(honestVersions[0]?.notes, 'honest');
});

// ---------------------------------------------------------------------------
// Corpus store — hostile composite-key collision on version chains
// ---------------------------------------------------------------------------

test('W9-B probe: a hostile tenant id containing the old delimiter cannot append into another tenant\'s corpus version chain', async () => {
  const corpus = createInMemoryCorpusStore({ rights: allowAllRights, now: FIXED_NOW });
  const documentFor = async (tenant: string, suffix: string) => {
    const result = await corpus.ingestReferenceDocument({
      scope: scopeOf(tenant),
      document: {
        id: `doc-${suffix}` as never,
        niche: 'sourdough-baking',
        platform: 'short-video',
        modality: 'video',
        artifact: {
          artifactId: `art-${suffix}` as never,
          version: 1 as Version,
          tenantId: tenantId(tenant),
          digest: `sha256:${(suffix + 'f'.repeat(60)).slice(0, 64).padEnd(64, '0')}` as never,
          type: 'video/mp4',
          storageRef: `mem://${tenant}/art-${suffix}` as never,
          rightsRef: 'grant-1' as never,
          provenanceRef: `prov-${suffix}` as never,
        },
        sourceRefs: ['src://platform/post/1'],
        acquiredAt: FIXED_NOW(),
        rightsRef: 'grant-1' as never,
        provenanceRef: `prov-${suffix}` as never,
      },
    });
    assert.ok(!('error' in result), 'fixture premise: ingestion succeeds');
    return result;
  };
  const honestDoc = await documentFor('tenant-a', 'honest');
  const hostileDoc = await documentFor('tenant-a' + NUL + 'corpus', 'hostile');

  const honest = await corpus.snapshotCorpusVersion({
    scope: scopeOf('tenant-a'),
    corpusId: ('corpus' + NUL + 'x') as never,
    documentRefs: [honestDoc.id],
    notes: 'honest',
  });
  assert.ok(!('error' in honest));
  const hostile = await corpus.snapshotCorpusVersion({
    scope: scopeOf('tenant-a' + NUL + 'corpus'),
    corpusId: 'x' as never,
    documentRefs: [hostileDoc.id],
    notes: 'hostile',
  });
  assert.ok(!('error' in hostile));

  // Both snapshots are version 1 of INDEPENDENT chains (pre-fix: the hostile
  // snapshot became version 2 of the honest chain).
  assert.equal(honest.version, 1);
  assert.equal(hostile.version, 1);
  const honestLatest = await corpus.getCorpusVersion(scopeOf('tenant-a'), ('corpus' + NUL + 'x') as never, 1 as Version);
  assert.ok(honestLatest !== null);
  assert.equal(honestLatest.notes, 'honest');
  assert.equal(
    (await corpus.getCorpusVersion(scopeOf('tenant-a' + NUL + 'corpus'), 'x' as never, 1 as Version))?.notes,
    'hostile',
  );
});

// ---------------------------------------------------------------------------
// Transform-definition registry — composite-key collision + exact-equality listing
// ---------------------------------------------------------------------------

test('W9-B probe: a hostile tenant id containing the old delimiter cannot append into another tenant\'s definition chain (and listings stay exact)', async () => {
  const registry = createInMemoryTransformDefinitionRegistry({ now: FIXED_NOW });
  const honest = await registry.registerTransformDefinition(
    definitionInputOf('clip', 'tenant-a', { id: ('def' + NUL + 'x') as never }),
  );
  assert.ok(!('error' in honest));
  const hostile = await registry.registerTransformDefinition(
    definitionInputOf('clip', 'tenant-a' + NUL + 'def', { id: 'x' as never }),
  );
  assert.ok(!('error' in hostile));

  assert.equal(honest.version, 1);
  assert.equal(hostile.version, 1, 'the hostile write must not extend the honest chain');
  // EXACT-equality listing: the honest scope lists exactly its own records —
  // a delimiter-laden tenant id never widens another tenant's listing
  // (the pre-fix prefix scan leaked the hostile tenant's records).
  const honestList = await registry.listTransformDefinitions(scopeOf('tenant-a'));
  assert.equal(honestList.length, 1);
  assert.equal(honestList[0]?.id, ('def' + NUL + 'x') as never);
  const hostileList = await registry.listTransformDefinitions(scopeOf('tenant-a' + NUL + 'def'));
  assert.equal(hostileList.length, 1);
  assert.equal(hostileList[0]?.id, 'x' as never);
});

// ---------------------------------------------------------------------------
// Transform discovery — hostile candidate ids + exact-equality listing
// ---------------------------------------------------------------------------

test('W9-B probe: discovery candidate chains and listings stay exact under hostile delimiter-laden tenant ids', async () => {
  const definitions = createInMemoryTransformDefinitionRegistry({ now: FIXED_NOW });
  const capabilities = createInMemoryCapabilityRegistry({ initial: SEED_CAPABILITY_CATALOG });
  const graphs = createInMemoryTransformGraph({ definitions, now: FIXED_NOW });
  const discovery = createInMemoryTransformDiscovery({ definitions, capabilities, graphs, now: FIXED_NOW });
  // Each tenant registers the no-op definition its candidates will cite.
  for (const tenant of ['tenant-a', 'tenant-a' + NUL + 'candidate']) {
    const registered = await definitions.registerTransformDefinition(
      definitionInputOf('no-op-repost', tenant),
    );
    assert.ok(!('error' in registered), `fixture premise: no-op definition registers for ${tenant}`);
  }

  const honest = await discovery.proposeTransformCandidate(knownCandidateInput('tenant-a'));
  assert.ok(!('error' in honest));
  // The hostile tenant proposes the SAME candidate id in its own scope —
  // under the old key it collided with the honest tenant's chain ONLY via
  // delimiter-laden components; the listing leak (prefix scan) was immediate.
  const hostile = await discovery.proposeTransformCandidate(
    knownCandidateInput('tenant-a' + NUL + 'candidate'),
  );
  assert.ok(!('error' in hostile));

  assert.equal(honest.version, 1);
  assert.equal(hostile.version, 1);
  const honestList = await discovery.listTransformCandidates(scopeOf('tenant-a'));
  assert.equal(honestList.length, 1);
  assert.equal(honestList[0]?.tenantId, tenantId('tenant-a'));
  const hostileList = await discovery.listTransformCandidates(scopeOf('tenant-a' + NUL + 'candidate'));
  assert.equal(hostileList.length, 1);
  assert.equal(hostileList[0]?.tenantId, tenantId('tenant-a' + NUL + 'candidate'));
});

// ---------------------------------------------------------------------------
// Transform graph — hostile composite-key collision
// ---------------------------------------------------------------------------

test('W9-B probe: a hostile tenant id containing the old delimiter cannot alias another tenant\'s transform graph', async () => {
  const definitions = createInMemoryTransformDefinitionRegistry({ now: FIXED_NOW });
  const graphs = createInMemoryTransformGraph({ definitions, now: FIXED_NOW });
  const graphInput = (tenant: string, id: string) => ({
    scope: scopeOf(tenant),
    id: id as never,
    nodes: [
      {
        nodeId: 'noop-node',
        definitionId: 'transform.no-op-repost' as never,
        definitionVersion: 1 as Version,
        inputs: [],
        parameterization: {},
      },
    ],
    edges: [],
  });
  for (const tenant of ['tenant-a', 'tenant-a' + NUL + 'graph']) {
    const registered = await definitions.registerTransformDefinition(
      definitionInputOf('no-op-repost', tenant),
    );
    assert.ok(!('error' in registered), `fixture premise: definition registers for ${tenant}`);
  }
  const honest = await graphs.createTransformGraph(graphInput('tenant-a', 'g' + NUL + 'x'));
  assert.ok(!('error' in honest));
  const hostile = await graphs.createTransformGraph(graphInput('tenant-a' + NUL + 'graph', 'x'));
  assert.ok(!('error' in hostile));

  assert.equal(honest.version, 1);
  assert.equal(hostile.version, 1, 'the hostile write must not extend the honest chain');
  const honestLatest = await graphs.getTransformGraph(scopeOf('tenant-a'), ('g' + NUL + 'x') as never);
  assert.ok(honestLatest !== null && !('error' in honestLatest));
  assert.equal(honestLatest.tenantId, tenantId('tenant-a'));
});

// ---------------------------------------------------------------------------
// Human-task store — composite-key collision + exact-equality listing
// ---------------------------------------------------------------------------

const taskRecord = (tenant: string, id: string): LabHumanProductionTask =>
  ({
    id: id as never,
    version: 1,
    tenantId: tenantId(tenant),
    status: 'created',
    createdAt: FIXED_NOW(),
    updatedAt: FIXED_NOW(),
  }) as unknown as LabHumanProductionTask;

test('W9-B probe: a hostile tenant id containing the old delimiter cannot overwrite another tenant\'s task chain or widen its listing', () => {
  const store = createHumanTaskStore(FIXED_NOW);
  // The honest task id CONTAINS the delimiter…
  store.seed(scopeOf('tenant-a'), taskRecord('tenant-a', 'task' + NUL + 'x'));
  // …and the hostile (tenant, id) pair concatenates into the same OLD key,
  // so the pre-fix `chains.set` OVERWROTE the honest chain outright.
  store.seed(scopeOf('tenant-a' + NUL + 'task'), taskRecord('tenant-a' + NUL + 'task', 'x'));

  const honestLatest = store.latestOf('tenant-a', ('task' + NUL + 'x') as never);
  assert.ok(honestLatest !== undefined, 'the honest chain survives the hostile seed');
  assert.equal(honestLatest.tenantId, tenantId('tenant-a'));
  // EXACT-equality listing: the honest scope lists exactly its own tasks.
  assert.deepEqual(
    store.listLatest(scopeOf('tenant-a')).map((record) => record.tenantId),
    [tenantId('tenant-a')],
  );
  assert.deepEqual(
    store.listLatest(scopeOf('tenant-a' + NUL + 'task')).map((record) => record.tenantId),
    [tenantId('tenant-a' + NUL + 'task')],
  );
  // Histories stay per-(tenant, task): a hostile event cannot enter the
  // honest tenant's audit log.
  store.appendEvent(scopeOf('tenant-a' + NUL + 'task'), 'x' as never, {
    kind: 'created',
    taskVersion: 1,
    detail: 'hostile event',
  } as never);
  assert.equal(store.history(scopeOf('tenant-a'), ('task' + NUL + 'x') as never).length, 0);
});

// ---------------------------------------------------------------------------
// Time machine — hostile branch-record composite-key collision
// ---------------------------------------------------------------------------

const tinyScenario = (): LabScenario => ({
  id: 'scenario-tiny' as never,
  version: 1 as Version,
  niche: 'sourdough-baking',
  platform: 'short-video',
  objective: 'qualified-reach',
  context: {},
  budget: { maxCost: { amount: 1, currency: 'USD' }, maxDurationMs: 86_400_000 } as never,
  informationLag: 0,
  corpusVersion: 1 as Version,
  simulatorVersion: 1 as Version,
  rewardVersion: 1 as Version,
});

const genuinePrediction = async (tenant: string, seed: number) => {
  const worldModels = createInMemorySocialWorldModelStore({ now: FIXED_NOW });
  const engine = createInMemorySimulatorEngine({ worldModels, now: FIXED_NOW });
  const registered = await worldModels.registerWorldModel({
    scope: scopeOf(tenant),
    worldModel: {
      id: 'world-probe' as never,
      niche: 'sourdough-baking',
      platform: 'short-video',
      state: { baseAudience: 100, fatigue: 0, competitorShare: 0.1, seasonalFactor: 1 },
      notes: null,
    },
  });
  assert.ok(!('error' in registered));
  const stepped = await engine.simulateStep({
    scope: scopeOf(tenant),
    worldModelId: 'world-probe' as never,
    worldModelVersion: 1,
    scenario: tinyScenario(),
    candidate: {
      strategyRef: `strategy-${tenant}` as never,
      kind: 'content',
      cadencePerWeek: 1,
      novelty: 0.5,
      engagementEffort: 0.5,
    },
    seed,
    step: 0,
  });
  assert.ok(!('error' in stepped));
  return stepped;
};

test('W9-B probe: a hostile tenant id containing the old delimiter cannot mix branch records across tenants', async () => {
  // The id factory mints the collision pair in order: the honest tenant's
  // branch id CONTAINS the delimiter; the hostile tenant id carries its
  // prefix — under the old `${tenant}\u0000${branchId}` key both branch
  // record arrays were ONE shared array.
  const ids = ['br' + NUL + 'c', 'c'];
  const machine = createInMemoryTimeMachine({
    now: FIXED_NOW,
    nextBranchId: () => ids.shift() as TimeMachineBranchId,
  });
  const intervention = { description: 'probe intervention', changedParameters: { cadencePerWeek: 5 } };
  const honestBranch = await machine.createBranch({
    scope: scopeOf('tenant-a'),
    forkPoint: FIXED_NOW(),
    intervention,
  } as CreateBranchInput);
  assert.ok(!('error' in honestBranch));
  const hostileBranch = await machine.createBranch({
    scope: scopeOf('tenant-a' + NUL + 'br'),
    forkPoint: FIXED_NOW(),
    intervention,
  } as CreateBranchInput);
  assert.ok(!('error' in hostileBranch));
  assert.equal(honestBranch.id, 'br' + NUL + 'c');
  assert.equal(hostileBranch.id, 'c');

  const honestPrediction = await genuinePrediction('tenant-a', 3);
  const hostilePrediction = await genuinePrediction('tenant-a' + NUL + 'br', 7);
  const honestRecorded = await machine.recordBranchPrediction({
    scope: scopeOf('tenant-a'),
    branchId: honestBranch.id,
    prediction: honestPrediction,
  });
  assert.ok(!('error' in honestRecorded));
  const hostileRecorded = await machine.recordBranchPrediction({
    scope: scopeOf('tenant-a' + NUL + 'br'),
    branchId: hostileBranch.id,
    prediction: hostilePrediction,
  });
  assert.ok(!('error' in hostileRecorded));

  // Each tenant's branch records hold EXACTLY its own prediction (pre-fix:
  // one shared array — cross-tenant record bleed).
  const honestRecords = await machine.getBranchRecords(scopeOf('tenant-a'), honestBranch.id);
  const hostileRecords = await machine.getBranchRecords(
    scopeOf('tenant-a' + NUL + 'br'),
    hostileBranch.id,
  );
  assert.ok(!('error' in honestRecords) && !('error' in hostileRecords));
  assert.equal(honestRecords.length, 1);
  assert.equal(hostileRecords.length, 1);
  assert.equal(
    (honestRecords[0] as { prediction: { tenantId: TenantId } }).prediction.tenantId,
    tenantId('tenant-a'),
  );
  assert.equal(
    (hostileRecords[0] as { prediction: { tenantId: TenantId } }).prediction.tenantId,
    tenantId('tenant-a' + NUL + 'br'),
  );
});

// ---------------------------------------------------------------------------
// Freeze discipline spot-pins on the lab stores (the W5-A/W6-A class)
// ---------------------------------------------------------------------------

test('W9-B probe: returned lab records stay bit-for-bit immutable against nested mutation attempts', async () => {
  const store = createInMemoryEnsembleStore({ now: FIXED_NOW });
  const record = await store.registerEnsemble({
    scope: scopeOf('tenant-a'),
    ensemble: {
      id: 'ens-freeze-probe' as never,
      niche: 'sourdough-baking',
      platform: 'short-video',
      members: [memberA(), memberB()],
      weightingPolicy: uniformPolicy(),
    },
  });
  assert.ok(!('error' in record));
  const snapshot = JSON.stringify(record);
  assert.throws(() => {
    (record.members[0] as { id: string }).id = 'smuggled';
  }, TypeError);
  assert.throws(() => {
    (record as unknown as { niche: string }).niche = 'smuggled';
  }, TypeError);
  assert.equal(JSON.stringify(record), snapshot);
});
