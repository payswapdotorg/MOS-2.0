import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { ArtifactRef, Timestamp } from '@mos/contracts';
import { createInMemoryArenaProvider } from './in-memory-arena-provider.js';
import {
  createInMemoryHumanProductionTask,
  type InMemoryHumanProductionTaskOptions,
} from './in-memory-human-production-task.js';
import type {
  HumanProductionTaskError,
  HumanProductionTaskPort,
  LabHumanProductionTask,
} from '../contracts/human-production-task.js';
import type { ArenaProviderRef } from '../contracts/arena-provider-seam.js';
import { FIXED_NOW, artifactRef, scopeOf } from '../testing/w5a-transform-fixtures.js';
import { arenaProviderRef, humanTaskInput } from '../testing/w6a-lab-fixtures.js';

type TaskResult = Awaited<ReturnType<HumanProductionTaskPort['offerHumanProductionTask']>>;

const asRecord = (result: TaskResult): LabHumanProductionTask => {
  if ('error' in result) {
    assert.fail(`unexpected task error: ${result.error} — ${result.message}`);
  }
  return result;
};

const asError = (result: TaskResult): HumanProductionTaskError => {
  assert.ok('error' in result, `expected a typed failure, got a record: ${String(result)}`);
  return result;
};

/** FIXED_NOW is 2026-06-15; deadlines before it are overdue, after it are live. */
const OVERDUE_DEADLINE = '2026-06-10T12:00:00.000Z' as Timestamp;
const LIVE_DEADLINE = '2026-06-20T12:00:00.000Z' as Timestamp;

const tasksWithArena = (
  arena?: InMemoryHumanProductionTaskOptions['arena'],
  now: () => Timestamp = FIXED_NOW,
): HumanProductionTaskPort => createInMemoryHumanProductionTask({ ...(arena === undefined ? {} : { arena }), now });

const offerArena = (tasks: HumanProductionTaskPort, taskId: LabHumanProductionTask['id'], provider: ArenaProviderRef = arenaProviderRef()) =>
  tasks.offerHumanProductionTask(scopeOf('tenant-a'), taskId, { kind: 'arena-provider', provider });

// ---------------------------------------------------------------------------
// The Arena provider path — through the PORT SEAM only
// ---------------------------------------------------------------------------

test('the Arena path goes through the wired ArenaProviderPort seam and the interaction is recorded', async () => {
  const tasks = tasksWithArena(createInMemoryArenaProvider({ now: FIXED_NOW }));
  const created = asRecord(await tasks.createHumanProductionTask(humanTaskInput()));
  const offered = asRecord(await offerArena(tasks, created.id));
  assert.equal(offered.status, 'offered');
  assert.deepEqual(offered.fulfillmentPath, { kind: 'arena-provider', provider: arenaProviderRef() });
  const history = await tasks.listHumanProductionTaskHistory(scopeOf('tenant-a'), created.id);
  const offeredEvent = history.find((event) => event.kind === 'offered');
  assert.ok(offeredEvent !== undefined);
  assert.ok(offeredEvent.arenaOffer !== undefined);
  // SELF-LABELED double interactions can never masquerade as live evidence.
  assert.match(offeredEvent.arenaOffer.interactionRef, /^arena-double:offer-/);
  assert.equal(offeredEvent.arenaOffer.accepted, true);
  assert.deepEqual(offeredEvent.arenaOffer.provider, arenaProviderRef());
});

test('offering to the Arena path without a wired seam fails closed (arena-provider-required)', async () => {
  const tasks = tasksWithArena();
  const created = asRecord(await tasks.createHumanProductionTask(humanTaskInput()));
  const failure = asError(await offerArena(tasks, created.id));
  assert.equal(failure.error, 'arena-provider-required');
  assert.match(failure.message, /composition-root/);
  // The task stays created; the failed attempt is still recorded in history.
  const current = await tasks.getHumanProductionTask(scopeOf('tenant-a'), created.id);
  assert.ok(current !== null);
  assert.equal(current.status, 'created');
  assert.deepEqual(
    (await tasks.listHumanProductionTaskHistory(scopeOf('tenant-a'), created.id)).map((event) => event.kind),
    ['created'],
  );
});

test('an Arena provider DECLINE fails closed with the interaction recorded (never silent)', async () => {
  const tasks = tasksWithArena(
    createInMemoryArenaProvider({ decide: () => ({ accepted: false }), now: FIXED_NOW }),
  );
  const created = asRecord(await tasks.createHumanProductionTask(humanTaskInput()));
  const failure = asError(await offerArena(tasks, created.id));
  assert.equal(failure.error, 'arena-provider-declined');
  const history = await tasks.listHumanProductionTaskHistory(scopeOf('tenant-a'), created.id);
  const rejected = history.find((event) => event.kind === 'arena-offer-rejected');
  assert.ok(rejected !== undefined);
  assert.ok(rejected.arenaOffer !== undefined);
  assert.equal(rejected.arenaOffer.accepted, false);
  assert.match(rejected.arenaOffer.interactionRef, /^arena-double:offer-/);
  // The task stays created — the decline is not an offer.
  const current = await tasks.getHumanProductionTask(scopeOf('tenant-a'), created.id);
  assert.ok(current !== null);
  assert.equal(current.status, 'created');
});

test('an Arena SEAM failure (unavailable provider) fails closed with the interaction recorded', async () => {
  const tasks = tasksWithArena(createInMemoryArenaProvider({ now: FIXED_NOW }));
  const created = asRecord(await tasks.createHumanProductionTask(humanTaskInput()));
  const unknownProvider: ArenaProviderRef = {
    providerId: 'arena-provider-unknown' as ArenaProviderRef['providerId'],
    providerVersion: 3,
  };
  const failure = asError(await offerArena(tasks, created.id, unknownProvider));
  assert.equal(failure.error, 'arena-offer-failed');
  assert.match(failure.message, /provider-unavailable/);
  const history = await tasks.listHumanProductionTaskHistory(scopeOf('tenant-a'), created.id);
  assert.equal(
    history.some((event) => event.kind === 'arena-offer-rejected' && /provider-unavailable/.test(event.detail)),
    true,
  );
});

test('a malformed fulfillment path fails closed at offer time', async () => {
  const tasks = tasksWithArena(createInMemoryArenaProvider({ now: FIXED_NOW }));
  const created = asRecord(await tasks.createHumanProductionTask(humanTaskInput()));
  const badKind = asError(
    await tasks.offerHumanProductionTask(scopeOf('tenant-a'), created.id, { kind: 'crowdsourcing' } as never),
  );
  assert.equal(badKind.error, 'invalid-input');
  const badCollaborator = asError(
    await tasks.offerHumanProductionTask(scopeOf('tenant-a'), created.id, {
      kind: 'authorized-collaborator',
      collaboratorRef: ' ' as never,
    }),
  );
  assert.equal(badCollaborator.error, 'invalid-input');
  const badProvider = asError(
    await tasks.offerHumanProductionTask(scopeOf('tenant-a'), created.id, {
      kind: 'arena-provider',
      provider: { providerId: '' as never, providerVersion: 0 },
    }),
  );
  assert.equal(badProvider.error, 'invalid-input');
});

// ---------------------------------------------------------------------------
// Human output: INTERMEDIATE artifact references (lock rule 15)
// ---------------------------------------------------------------------------

test('delivery returns INTERMEDIATE artifact refs — cross-tenant and malformed refs fail closed', async () => {
  const tasks = tasksWithArena();
  const created = asRecord(await tasks.createHumanProductionTask(humanTaskInput()));
  await tasks.offerHumanProductionTask(scopeOf('tenant-a'), created.id, { kind: 'project-owner' });
  await tasks.acceptHumanProductionTask(scopeOf('tenant-a'), created.id);
  const crossTenant = asError(
    await tasks.deliverHumanProductionTask(scopeOf('tenant-a'), created.id, {
      scope: scopeOf('tenant-a'),
      artifactRefs: [artifactRef('human-output', { tenant: 'tenant-b' })],
    }),
  );
  assert.equal(crossTenant.error, 'invalid-input');
  assert.match(crossTenant.message, /cross-tenant/);
  const malformed = asError(
    await tasks.deliverHumanProductionTask(scopeOf('tenant-a'), created.id, {
      scope: scopeOf('tenant-a'),
      artifactRefs: [{ tenantId: scopeOf('tenant-a').tenantId } as unknown as ArtifactRef],
    }),
  );
  assert.equal(malformed.error, 'invalid-input');
  assert.match(malformed.message, /artifactId/);
  const empty = asError(
    await tasks.deliverHumanProductionTask(scopeOf('tenant-a'), created.id, {
      scope: scopeOf('tenant-a'),
      artifactRefs: [],
    }),
  );
  assert.equal(empty.error, 'invalid-input');
  assert.match(empty.message, /non-empty/);
  // A legal delivery records the refs on the version AND the event.
  const delivered = asRecord(
    await tasks.deliverHumanProductionTask(scopeOf('tenant-a'), created.id, {
      scope: scopeOf('tenant-a'),
      artifactRefs: [artifactRef('human-output-1'), artifactRef('human-output-2')],
    }),
  );
  assert.equal(delivered.deliveredArtifactRefs?.length, 2);
  const history = await tasks.listHumanProductionTaskHistory(scopeOf('tenant-a'), created.id);
  const deliveredEvent = history.find((event) => event.kind === 'delivered');
  assert.ok(deliveredEvent !== undefined);
  assert.equal(deliveredEvent.artifactRefs?.length, 2);
});

test('delivery after the deadline fails closed with deadline-expired', async () => {
  const tasks = tasksWithArena();
  const created = asRecord(
    await tasks.createHumanProductionTask(humanTaskInput('tenant-a', { deadlineAt: OVERDUE_DEADLINE })),
  );
  await tasks.offerHumanProductionTask(scopeOf('tenant-a'), created.id, { kind: 'project-owner' });
  await tasks.acceptHumanProductionTask(scopeOf('tenant-a'), created.id);
  const failure = asError(
    await tasks.deliverHumanProductionTask(scopeOf('tenant-a'), created.id, {
      scope: scopeOf('tenant-a'),
      artifactRefs: [artifactRef('late-output')],
    }),
  );
  assert.equal(failure.error, 'deadline-expired');
  assert.match(failure.message, /2026-06-10/);
});

// ---------------------------------------------------------------------------
// Deadline expiry → abandonment (FIRST-CLASS, recorded)
// ---------------------------------------------------------------------------

test('abandonOverdue fails closed BEFORE expiry (not-overdue)', async () => {
  const tasks = tasksWithArena();
  const created = asRecord(
    await tasks.createHumanProductionTask(humanTaskInput('tenant-a', { deadlineAt: LIVE_DEADLINE })),
  );
  const failure = asError(await tasks.abandonOverdueHumanProductionTask(scopeOf('tenant-a'), created.id));
  assert.equal(failure.error, 'not-overdue');
});

test('deadline expiry abandons the task and records the outcome + yielded substitute', async () => {
  const tasks = tasksWithArena();
  const created = asRecord(
    await tasks.createHumanProductionTask(humanTaskInput('tenant-a', { deadlineAt: OVERDUE_DEADLINE })),
  );
  await tasks.offerHumanProductionTask(scopeOf('tenant-a'), created.id, { kind: 'project-owner' });
  await tasks.acceptHumanProductionTask(scopeOf('tenant-a'), created.id);
  const abandoned = asRecord(await tasks.abandonOverdueHumanProductionTask(scopeOf('tenant-a'), created.id));
  assert.equal(abandoned.status, 'abandoned');
  assert.ok(abandoned.abandonment !== null);
  assert.equal(abandoned.abandonment.cause, 'deadline-expiry');
  assert.equal(abandoned.abandonment.originalPath !== null, true);
  assert.deepEqual(abandoned.abandonment.originalPath, { kind: 'project-owner' });
  // The ordered substitute list yields the next UNTRIED path (the
  // collaborator is preference 1; project-owner was tried).
  assert.deepEqual(abandoned.abandonment.substitutePath, {
    kind: 'authorized-collaborator',
    collaboratorRef: 'identity:collaborator-1' as never,
  });
  assert.equal(abandoned.abandonment.abandonedAt, FIXED_NOW());
  // The switch is recorded in the event log, never silent.
  const history = await tasks.listHumanProductionTaskHistory(scopeOf('tenant-a'), created.id);
  const abandonedEvent = history.find((event) => event.kind === 'abandoned');
  assert.ok(abandonedEvent !== undefined);
  assert.deepEqual(abandonedEvent.substitutePath, {
    kind: 'authorized-collaborator',
    collaboratorRef: 'identity:collaborator-1' as never,
  });
  assert.match(abandonedEvent.detail, /deadline-expiry/);
  // Terminal: nothing further is legal.
  const further = asError(await tasks.acceptHumanProductionTask(scopeOf('tenant-a'), created.id));
  assert.equal(further.error, 'illegal-lifecycle-transition');
});

test('overdue abandonment with NO substitutes records substitutePath null (plain abandonment)', async () => {
  const tasks = tasksWithArena();
  const created = asRecord(
    await tasks.createHumanProductionTask(
      humanTaskInput('tenant-a', {
        deadlineAt: OVERDUE_DEADLINE,
        substitutes: { ordered: [] },
      }),
    ),
  );
  const abandoned = asRecord(await tasks.abandonOverdueHumanProductionTask(scopeOf('tenant-a'), created.id));
  assert.equal(abandoned.status, 'abandoned');
  assert.ok(abandoned.abandonment !== null);
  assert.equal(abandoned.abandonment.cause, 'deadline-expiry');
  assert.equal(abandoned.abandonment.substitutePath, null);
});

// ---------------------------------------------------------------------------
// Substitute semantics: ordered + recorded, never silent
// ---------------------------------------------------------------------------

test('a substitute switch records original + substitute + reason (ordered preference list)', async () => {
  const tasks = tasksWithArena();
  const created = asRecord(await tasks.createHumanProductionTask(humanTaskInput()));
  // Offer to preference-2 (project-owner) first.
  await tasks.offerHumanProductionTask(scopeOf('tenant-a'), created.id, { kind: 'project-owner' });
  const abandoned = asRecord(
    await tasks.abandonHumanProductionTask(scopeOf('tenant-a'), created.id, {
      scope: scopeOf('tenant-a'),
      reason: 'owner unavailable this week',
      selectSubstitute: true,
    }),
  );
  assert.equal(abandoned.status, 'abandoned');
  assert.ok(abandoned.abandonment !== null);
  assert.equal(abandoned.abandonment.cause, 'substitute-switch');
  assert.equal(abandoned.abandonment.reason, 'owner unavailable this week');
  assert.deepEqual(abandoned.abandonment.originalPath, { kind: 'project-owner' });
  assert.deepEqual(abandoned.abandonment.substitutePath, {
    kind: 'authorized-collaborator',
    collaboratorRef: 'identity:collaborator-1' as never,
  });
});

test('the substitute list yields in PREFERENCE ORDER (untried paths only)', async () => {
  const tasks = tasksWithArena();
  // Offer to preference-1 (collaborator): the untried next is preference-2.
  const created = asRecord(await tasks.createHumanProductionTask(humanTaskInput()));
  await tasks.offerHumanProductionTask(scopeOf('tenant-a'), created.id, {
    kind: 'authorized-collaborator',
    collaboratorRef: 'identity:collaborator-1' as never,
  });
  const abandoned = asRecord(
    await tasks.abandonHumanProductionTask(scopeOf('tenant-a'), created.id, {
      scope: scopeOf('tenant-a'),
      reason: 'collaborator declined',
      selectSubstitute: true,
    }),
  );
  assert.deepEqual(abandoned.abandonment?.substitutePath, { kind: 'project-owner' });
});

test('no untried substitute available → no-substitute-available (the caller decides)', async () => {
  const tasks = tasksWithArena();
  const created = asRecord(
    await tasks.createHumanProductionTask(
      humanTaskInput('tenant-a', {
        substitutes: { ordered: [{ preference: 1, path: { kind: 'project-owner' } }] },
      }),
    ),
  );
  await tasks.offerHumanProductionTask(scopeOf('tenant-a'), created.id, { kind: 'project-owner' });
  const failure = asError(
    await tasks.abandonHumanProductionTask(scopeOf('tenant-a'), created.id, {
      scope: scopeOf('tenant-a'),
      reason: 'want a substitute',
      selectSubstitute: true,
    }),
  );
  assert.equal(failure.error, 'no-substitute-available');
  // The task is untouched: abandonment did not happen.
  const current = await tasks.getHumanProductionTask(scopeOf('tenant-a'), created.id);
  assert.ok(current !== null);
  assert.equal(current.status, 'offered');
});

test('plain abandonment (caller decision) records the cause and no substitute', async () => {
  const tasks = tasksWithArena();
  const created = asRecord(await tasks.createHumanProductionTask(humanTaskInput()));
  const abandoned = asRecord(
    await tasks.abandonHumanProductionTask(scopeOf('tenant-a'), created.id, {
      scope: scopeOf('tenant-a'),
      reason: 'strategy changed — the contribution is no longer worth waiting for',
    }),
  );
  assert.ok(abandoned.abandonment !== null);
  assert.equal(abandoned.abandonment.cause, 'caller-decision');
  assert.equal(abandoned.abandonment.substitutePath, null);
  assert.equal(abandoned.abandonment.originalPath, null);
  // A blank reason is rejected — abandonment is never silent.
  const created2 = asRecord(
    await tasks.createHumanProductionTask(humanTaskInput('tenant-a', { id: 'human-task.blank-reason' })),
  );
  const blank = asError(
    await tasks.abandonHumanProductionTask(scopeOf('tenant-a'), created2.id, {
      scope: scopeOf('tenant-a'),
      reason: '  ',
    }),
  );
  assert.equal(blank.error, 'invalid-input');
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

test('deterministic lifecycle: fixed clock yields bit-identical task + event records', async () => {
  const run = async (): Promise<string> => {
    const tasks = tasksWithArena(createInMemoryArenaProvider({ now: FIXED_NOW }));
    const created = asRecord(await tasks.createHumanProductionTask(humanTaskInput()));
    await offerArena(tasks, created.id);
    await tasks.acceptHumanProductionTask(scopeOf('tenant-a'), created.id);
    await tasks.deliverHumanProductionTask(scopeOf('tenant-a'), created.id, {
      scope: scopeOf('tenant-a'),
      artifactRefs: [artifactRef('human-output-1')],
    });
    const evaluated = asRecord(
      await tasks.evaluateHumanProductionTask(scopeOf('tenant-a'), created.id, {
        scope: scopeOf('tenant-a'),
        verdict: 'accepted',
        note: 'deterministic',
      }),
    );
    const history = await tasks.listHumanProductionTaskHistory(scopeOf('tenant-a'), created.id);
    return JSON.stringify({ evaluated, history });
  };
  assert.equal(await run(), await run());
});
