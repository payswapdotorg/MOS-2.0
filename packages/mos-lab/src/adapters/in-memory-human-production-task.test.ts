import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertRequiredFields } from '@mos/contracts';
import type { ArtifactRef } from '@mos/contracts';
import { canonicalHumanProductionTaskView } from '../contracts/human-production-task.js';
import type {
  CreateHumanProductionTaskInput,
  HumanProductionTaskError,
  HumanProductionTaskPort,
  LabHumanProductionTask,
} from '../contracts/human-production-task.js';
import type { HumanProductionTaskFieldName } from '../contracts/human-task-fields.js';
import { TASK_FIELDS } from './human-task-field-validation.js';
import { createInMemoryHumanProductionTask } from './in-memory-human-production-task.js';
import { FIXED_NOW, artifactRef, scopeOf } from '../testing/w5a-transform-fixtures.js';
import { humanTaskInput } from '../testing/w6a-lab-fixtures.js';

type CreateResult = Awaited<ReturnType<HumanProductionTaskPort['createHumanProductionTask']>>;
type TaskResult = Awaited<ReturnType<HumanProductionTaskPort['acceptHumanProductionTask']>>;

const asRecord = (result: CreateResult | TaskResult): LabHumanProductionTask => {
  if ('error' in result) {
    assert.fail(`unexpected task error: ${result.error} — ${result.message}`);
  }
  return result;
};

const asError = (result: CreateResult | TaskResult): HumanProductionTaskError => {
  assert.ok('error' in result, `expected a typed failure, got a record: ${String(result)}`);
  return result;
};

/** The input-object key for each of the twelve §17 field names. */
const FIELD_KEYS: Record<HumanProductionTaskFieldName, keyof CreateHumanProductionTaskInput> = {
  objective: 'objective',
  'source-reference': 'sourceReference',
  'script-or-questions': 'scriptOrQuestions',
  'capture-instructions': 'captureInstructions',
  'target-modality': 'targetModality',
  'required-artifacts': 'requiredArtifacts',
  consent: 'consent',
  rights: 'rights',
  evaluator: 'evaluator',
  deadline: 'deadline',
  'delay-economics': 'delayEconomics',
  'acceptable-substitutes': 'acceptableSubstitutes',
};

/** One malformed value per field (the named-failure sweep). */
const MALFORMED: Record<HumanProductionTaskFieldName, (input: CreateHumanProductionTaskInput) => CreateHumanProductionTaskInput> = {
  objective: (input) => ({ ...input, objective: { statement: '   ', successCriteria: ['ok'] } }),
  'source-reference': (input) => ({ ...input, sourceReference: { artifactRefs: [] } }),
  'script-or-questions': (input) => ({ ...input, scriptOrQuestions: { kind: 'script', beats: [] } }),
  'capture-instructions': (input) => ({ ...input, captureInstructions: { brief: '  ', requirements: [] } }),
  'target-modality': (input) => ({ ...input, targetModality: { modality: 'smell' as never } }),
  'required-artifacts': (input) => ({ ...input, requiredArtifacts: { artifacts: [] } }),
  consent: (input) => ({ ...input, consent: { consentRef: '  ' as never, scope: 'on-camera' } }),
  rights: (input) => ({ ...input, rights: { rightsRefs: [] } }),
  evaluator: (input) => ({
    ...input,
    evaluator: { evaluatorRef: 'evaluator:x@1' as never, inputSchema: { type: 'object' }, outputSchema: 'not-an-object' as never },
  }),
  deadline: (input) => ({ ...input, deadline: { deadlineAt: 'next tuesday' as never } }),
  'delay-economics': (input) => ({
    ...input,
    delayEconomics: { ...input.delayEconomics, declaration: 'guaranteed-outcome' as never },
  }),
  'acceptable-substitutes': (input) => ({
    ...input,
    acceptableSubstitutes: { ordered: [{ preference: 0, path: { kind: 'project-owner' } }] },
  }),
};

// ---------------------------------------------------------------------------
// Creation: the complete twelve-field §17 package
// ---------------------------------------------------------------------------

test('a COMPLETE twelve-field §17 task package creates a versioned, tenant-scoped record', async () => {
  const tasks = createTaskPort();
  const task = asRecord(await tasks.createHumanProductionTask(humanTaskInput()));
  assert.equal(task.version, 1);
  assert.equal(task.status, 'created');
  assert.equal(task.tenantId, scopeOf('tenant-a').tenantId);
  assert.equal(task.fulfillmentPath, null);
  assert.equal(task.deliveredArtifactRefs, null);
  assert.equal(task.evaluation, null);
  assert.equal(task.abandonment, null);
  assert.equal(task.createdAt, FIXED_NOW());
  // Every one of the twelve fields is present and typed.
  assert.equal(task.objective.statement, 'Record a reaction to the source clip for the reaction-format strategy');
  assert.equal(task.sourceReference.artifactRefs.length, 1);
  assert.equal(task.scriptOrQuestions.kind, 'script');
  assert.equal(task.captureInstructions.brief.length > 0, true);
  assert.equal(task.targetModality.modality, 'video');
  assert.equal(task.requiredArtifacts.artifacts[0]?.artifactType, 'video/mp4');
  assert.equal(task.consent.consentRef, 'consent:reaction-1');
  assert.equal(task.rights.rightsRefs.length, 1);
  assert.equal(task.evaluator.evaluatorRef, 'evaluator:lab:human-task@1');
  assert.equal(task.deadline.deadlineAt, '2026-06-20T12:00:00.000Z');
  assert.equal(task.delayEconomics.declaration, 'declared-expectations');
  assert.equal(task.acceptableSubstitutes.ordered.length, 2);
});

test('the canonical CORE-001 HumanProductionTask projection satisfies the frozen contract', async () => {
  const tasks = createTaskPort();
  const task = asRecord(await tasks.createHumanProductionTask(humanTaskInput()));
  const view = canonicalHumanProductionTaskView(task);
  assertRequiredFields(view, 'HumanProductionTask');
  assert.equal(view.objective, task.objective.statement);
  assert.deepEqual(view.sourceRefs, task.sourceReference.artifactRefs);
  assert.equal(task.scriptOrQuestions.kind, 'script');
  if (task.scriptOrQuestions.kind === 'script') {
    assert.deepEqual(view.scriptOrQuestions, task.scriptOrQuestions.beats);
  }
  assert.equal(view.captureBrief, task.captureInstructions.brief);
  assert.equal(view.targetOutput.modality, 'video');
  assert.deepEqual(view.targetOutput.requiredArtifactTypes, ['video/mp4']);
  assert.equal(view.rightsConsent, task.consent.consentRef);
  assert.equal(view.evaluator, task.evaluator.evaluatorRef);
  assert.equal(view.deadline, task.deadline.deadlineAt);
  assert.deepEqual(view.expectedValueOfWaiting, task.delayEconomics.expectedIncrementalValue);
});

test('a QUESTIONS-variant package creates identically (script OR questions)', async () => {
  const tasks = createTaskPort();
  const task = asRecord(
    await tasks.createHumanProductionTask(
      humanTaskInput('tenant-a', {
        scriptOrQuestions: { kind: 'questions', questions: ['What surprised you?', 'What is the takeaway?'] },
      }),
    ),
  );
  assert.equal(task.scriptOrQuestions.kind, 'questions');
});

// ---------------------------------------------------------------------------
// TWELVE-FIELD COMPLETENESS: missing or malformed field → named failure
// ---------------------------------------------------------------------------

test('EVERY one of the twelve fields is validated: a MISSING field fails closed NAMING the field', async () => {
  assert.deepEqual(TASK_FIELDS, [
    'objective',
    'source-reference',
    'script-or-questions',
    'capture-instructions',
    'target-modality',
    'required-artifacts',
    'consent',
    'rights',
    'evaluator',
    'deadline',
    'delay-economics',
    'acceptable-substitutes',
  ]);
  for (const field of TASK_FIELDS) {
    const tasks = createTaskPort();
    const complete = humanTaskInput();
    const key = FIELD_KEYS[field];
    assert.ok(key !== undefined);
    const { [key]: _removed, ...withoutField } = complete;
    void _removed;
    const failure = asError(await tasks.createHumanProductionTask(withoutField as CreateHumanProductionTaskInput));
    assert.equal(failure.error, 'invalid-task-field', `field ${field}: expected invalid-task-field`);
    assert.equal(failure.field, field, `field ${field}: the failure must NAME the field`);
  }
});

test('EVERY one of the twelve fields is validated: a MALFORMED value fails closed NAMING the field', async () => {
  for (const field of TASK_FIELDS) {
    const tasks = createTaskPort();
    const malform = MALFORMED[field];
    assert.ok(malform !== undefined);
    const failure = asError(await tasks.createHumanProductionTask(malform(humanTaskInput())));
    assert.equal(failure.error, 'invalid-task-field', `field ${field}: expected invalid-task-field`);
    assert.equal(failure.field, field, `field ${field}: the failure must NAME the field`);
  }
});

test('consent and rights are validated STRUCTURALLY (blank refs, non-array lists)', async () => {
  const tasks = createTaskPort();
  const blankScope = asError(
    await tasks.createHumanProductionTask({
      ...humanTaskInput(),
      consent: { consentRef: 'consent:reaction-1' as never, scope: ' ' },
    }),
  );
  assert.equal(blankScope.error, 'invalid-task-field');
  assert.equal(blankScope.field, 'consent');
  const notArray = asError(
    await tasks.createHumanProductionTask({
      ...humanTaskInput(),
      rights: { rightsRefs: 'rights:source-clip-grant' as never },
    }),
  );
  assert.equal(notArray.error, 'invalid-task-field');
  assert.equal(notArray.field, 'rights');
});

test('delay economics carry the pinned declared-expectations disclosure (§2 first-class variable)', async () => {
  const tasks = createTaskPort();
  const outOfRange = asError(
    await tasks.createHumanProductionTask({
      ...humanTaskInput(),
      delayEconomics: { ...humanTaskInput().delayEconomics, successProbability: 1.5 },
    }),
  );
  assert.equal(outOfRange.error, 'invalid-task-field');
  assert.equal(outOfRange.field, 'delay-economics');
  const negativeWait = asError(
    await tasks.createHumanProductionTask({
      ...humanTaskInput(),
      delayEconomics: { ...humanTaskInput().delayEconomics, expectedWaitMs: -1 },
    }),
  );
  assert.equal(negativeWait.error, 'invalid-task-field');
  assert.equal(negativeWait.field, 'delay-economics');
});

test('acceptable substitutes are an ORDERED preference list (strictly ascending)', async () => {
  const tasks = createTaskPort();
  const failure = asError(
    await tasks.createHumanProductionTask(
      humanTaskInput('tenant-a', {
        substitutes: {
          ordered: [
            { preference: 2, path: { kind: 'authorized-collaborator', collaboratorRef: 'identity:c-1' as never } },
            { preference: 2, path: { kind: 'project-owner' } },
          ],
        },
      }),
    ),
  );
  assert.equal(failure.error, 'invalid-task-field');
  assert.equal(failure.field, 'acceptable-substitutes');
  assert.match(failure.message, /strictly ascending/);
});

test('source artifact refs must be complete canonical refs in the task\'s own tenant scope', async () => {
  const tasks = createTaskPort();
  const crossTenant = asError(
    await tasks.createHumanProductionTask({
      ...humanTaskInput('tenant-a'),
      sourceReference: { artifactRefs: [artifactRef('reaction-source', { tenant: 'tenant-b' })] },
    }),
  );
  assert.equal(crossTenant.error, 'invalid-task-field');
  assert.equal(crossTenant.field, 'source-reference');
  assert.match(crossTenant.message, /another tenant scope/);
  const malformed = asError(
    await tasks.createHumanProductionTask({
      ...humanTaskInput('tenant-a'),
      sourceReference: { artifactRefs: [{ tenantId: scopeOf('tenant-a').tenantId } as unknown as ArtifactRef] },
    }),
  );
  assert.equal(malformed.error, 'invalid-task-field');
  assert.equal(malformed.field, 'source-reference');
  assert.match(malformed.message, /artifactId/);
});

// ---------------------------------------------------------------------------
// Id / tenant discipline
// ---------------------------------------------------------------------------

test('duplicate task ids are rejected per tenant scope', async () => {
  const tasks = createTaskPort();
  asRecord(await tasks.createHumanProductionTask(humanTaskInput()));
  const failure = asError(await tasks.createHumanProductionTask(humanTaskInput()));
  assert.equal(failure.error, 'duplicate-task');
});

test('blank task ids are invalid input', async () => {
  const tasks = createTaskPort();
  const failure = asError(
    await tasks.createHumanProductionTask({ ...humanTaskInput(), id: '  ' as never }),
  );
  assert.equal(failure.error, 'invalid-input');
});

test('tasks are tenant-scoped: unknown and cross-tenant are indistinguishable on reads', async () => {
  const tasks = createTaskPort();
  const task = asRecord(await tasks.createHumanProductionTask(humanTaskInput()));
  assert.equal(await tasks.getHumanProductionTask(scopeOf('tenant-b'), task.id), null);
  assert.deepEqual(await tasks.listHumanProductionTasks(scopeOf('tenant-b')), []);
  assert.deepEqual(await tasks.listHumanProductionTaskHistory(scopeOf('tenant-b'), task.id), []);
  // The same task id is independently creatable in another tenant.
  const other = asRecord(await tasks.createHumanProductionTask(humanTaskInput('tenant-b')));
  assert.equal(other.tenantId, scopeOf('tenant-b').tenantId);
  assert.equal((await tasks.listHumanProductionTasks(scopeOf('tenant-a'))).length, 1);
  assert.equal((await tasks.listHumanProductionTasks(scopeOf('tenant-b'))).length, 1);
});

// ---------------------------------------------------------------------------
// Lifecycle: the legal happy path + append-only versions + history
// ---------------------------------------------------------------------------

test('the legal lifecycle: created → offered → in-progress → delivered → evaluated → completed', async () => {
  const tasks = createTaskPort();
  const created = asRecord(await tasks.createHumanProductionTask(humanTaskInput()));
  const createdSnapshot = JSON.stringify(created);
  const offered = asRecord(
    await tasks.offerHumanProductionTask(scopeOf('tenant-a'), created.id, { kind: 'project-owner' }),
  );
  assert.equal(offered.status, 'offered');
  assert.deepEqual(offered.fulfillmentPath, { kind: 'project-owner' });
  const inProgress = asRecord(await tasks.acceptHumanProductionTask(scopeOf('tenant-a'), offered.id));
  assert.equal(inProgress.status, 'in-progress');
  const delivered = asRecord(
    await tasks.deliverHumanProductionTask(scopeOf('tenant-a'), inProgress.id, {
      scope: scopeOf('tenant-a'),
      artifactRefs: [artifactRef('human-output-1')],
    }),
  );
  assert.equal(delivered.status, 'delivered');
  assert.equal(delivered.deliveredArtifactRefs?.length, 1);
  const evaluated = asRecord(
    await tasks.evaluateHumanProductionTask(scopeOf('tenant-a'), delivered.id, {
      scope: scopeOf('tenant-a'),
      verdict: 'accepted',
      note: 'meets the objective criteria',
    }),
  );
  assert.equal(evaluated.status, 'completed');
  assert.equal(evaluated.evaluation?.verdict, 'accepted');
  // Append-only versions: every prior version stays resolvable bit-for-bit.
  const v1 = await tasks.getHumanProductionTask(scopeOf('tenant-a'), created.id, 1);
  assert.ok(v1 !== null);
  assert.equal(JSON.stringify(v1), createdSnapshot);
  const latest = await tasks.getHumanProductionTask(scopeOf('tenant-a'), created.id);
  assert.ok(latest !== null);
  assert.equal(latest.version, 5);
  assert.equal(await tasks.getHumanProductionTask(scopeOf('tenant-a'), created.id, 99), null);
  // The append-only history records every transition in order.
  const history = await tasks.listHumanProductionTaskHistory(scopeOf('tenant-a'), created.id);
  assert.deepEqual(
    history.map((event) => event.kind),
    ['created', 'offered', 'accepted', 'delivered', 'evaluated'],
  );
  assert.deepEqual(
    history.map((event) => event.taskVersion),
    [1, 2, 3, 4, 5],
  );
  assert.deepEqual(
    history.map((event) => event.seq),
    [1, 2, 3, 4, 5],
  );
  assert.ok(history.every((event) => event.recordedAt === FIXED_NOW()));
});

test('the §2 retry loop: a treatment-requested evaluation can be re-delivered', async () => {
  const tasks = createTaskPort();
  const task = asRecord(await tasks.createHumanProductionTask(humanTaskInput()));
  await tasks.offerHumanProductionTask(scopeOf('tenant-a'), task.id, { kind: 'project-owner' });
  await tasks.acceptHumanProductionTask(scopeOf('tenant-a'), task.id);
  await tasks.deliverHumanProductionTask(scopeOf('tenant-a'), task.id, {
    scope: scopeOf('tenant-a'),
    artifactRefs: [artifactRef('human-output-1')],
  });
  const treated = asRecord(
    await tasks.evaluateHumanProductionTask(scopeOf('tenant-a'), task.id, {
      scope: scopeOf('tenant-a'),
      verdict: 'treatment-requested',
      note: 're-record with better lighting',
    }),
  );
  assert.equal(treated.status, 'evaluated');
  const redelivered = asRecord(
    await tasks.deliverHumanProductionTask(scopeOf('tenant-a'), task.id, {
      scope: scopeOf('tenant-a'),
      artifactRefs: [artifactRef('human-output-2')],
    }),
  );
  assert.equal(redelivered.status, 'delivered');
  assert.equal(redelivered.version, 6);
});

test('ILLEGAL lifecycle transitions fail closed with named statuses', async () => {
  const tasks = createTaskPort();
  const created = asRecord(await tasks.createHumanProductionTask(humanTaskInput()));
  // accept from 'created'
  const acceptEarly = asError(await tasks.acceptHumanProductionTask(scopeOf('tenant-a'), created.id));
  assert.equal(acceptEarly.error, 'illegal-lifecycle-transition');
  // deliver from 'created'
  const deliverEarly = asError(
    await tasks.deliverHumanProductionTask(scopeOf('tenant-a'), created.id, {
      scope: scopeOf('tenant-a'),
      artifactRefs: [artifactRef('human-output-1')],
    }),
  );
  assert.equal(deliverEarly.error, 'illegal-lifecycle-transition');
  // evaluate from 'created'
  const evaluateEarly = asError(
    await tasks.evaluateHumanProductionTask(scopeOf('tenant-a'), created.id, {
      scope: scopeOf('tenant-a'),
      verdict: 'accepted',
      note: 'nothing delivered yet',
    }),
  );
  assert.equal(evaluateEarly.error, 'illegal-lifecycle-transition');
  // offer twice
  await tasks.offerHumanProductionTask(scopeOf('tenant-a'), created.id, { kind: 'project-owner' });
  const offerAgain = asError(
    await tasks.offerHumanProductionTask(scopeOf('tenant-a'), created.id, { kind: 'project-owner' }),
  );
  assert.equal(offerAgain.error, 'illegal-lifecycle-transition');
  // accept twice
  await tasks.acceptHumanProductionTask(scopeOf('tenant-a'), created.id);
  const acceptAgain = asError(await tasks.acceptHumanProductionTask(scopeOf('tenant-a'), created.id));
  assert.equal(acceptAgain.error, 'illegal-lifecycle-transition');
  // unknown task: unknown and cross-tenant indistinguishable
  const unknown = asError(await tasks.acceptHumanProductionTask(scopeOf('tenant-b'), created.id));
  assert.equal(unknown.error, 'task-not-found');
});

test('terminal statuses admit no further transitions (completed)', async () => {
  const tasks = createTaskPort();
  const task = asRecord(await tasks.createHumanProductionTask(humanTaskInput()));
  await tasks.offerHumanProductionTask(scopeOf('tenant-a'), task.id, { kind: 'project-owner' });
  await tasks.acceptHumanProductionTask(scopeOf('tenant-a'), task.id);
  await tasks.deliverHumanProductionTask(scopeOf('tenant-a'), task.id, {
    scope: scopeOf('tenant-a'),
    artifactRefs: [artifactRef('human-output-1')],
  });
  await tasks.evaluateHumanProductionTask(scopeOf('tenant-a'), task.id, {
    scope: scopeOf('tenant-a'),
    verdict: 'accepted',
    note: 'done',
  });
  const deliver = asError(
    await tasks.deliverHumanProductionTask(scopeOf('tenant-a'), task.id, {
      scope: scopeOf('tenant-a'),
      artifactRefs: [artifactRef('human-output-2')],
    }),
  );
  assert.equal(deliver.error, 'illegal-lifecycle-transition');
  const abandon = asError(
    await tasks.abandonHumanProductionTask(scopeOf('tenant-a'), task.id, {
      scope: scopeOf('tenant-a'),
      reason: 'changed my mind',
    }),
  );
  assert.equal(abandon.error, 'illegal-lifecycle-transition');
});

// ---------------------------------------------------------------------------
// Surface discipline
// ---------------------------------------------------------------------------

test('the human production task port exposes exactly ten methods (≤12 policy budget)', async () => {
  const tasks = createTaskPort();
  const methods = Object.keys(tasks).sort();
  assert.deepEqual(methods, [
    'abandonHumanProductionTask',
    'abandonOverdueHumanProductionTask',
    'acceptHumanProductionTask',
    'createHumanProductionTask',
    'deliverHumanProductionTask',
    'evaluateHumanProductionTask',
    'getHumanProductionTask',
    'listHumanProductionTaskHistory',
    'listHumanProductionTasks',
    'offerHumanProductionTask',
  ]);
  assert.ok(methods.length <= 12);
});

test('created task records and lifecycle events are deep-frozen', async () => {
  const tasks = createTaskPort();
  const task = asRecord(await tasks.createHumanProductionTask(humanTaskInput()));
  assert.ok(Object.isFrozen(task));
  assert.ok(Object.isFrozen(task.objective));
  assert.ok(Object.isFrozen(task.delayEconomics));
  assert.ok(Object.isFrozen(task.acceptableSubstitutes));
  const history = await tasks.listHumanProductionTaskHistory(scopeOf('tenant-a'), task.id);
  assert.ok(Object.isFrozen(history[0]));
  assert.throws(() => {
    (task as { mutable?: boolean }).mutable = true;
  });
});

test('LIFECYCLE-APPENDED versions are deep-frozen NESTED too (the W5-A nested-freeze lesson)', async () => {
  const tasks = createTaskPort();
  const created = asRecord(await tasks.createHumanProductionTask(humanTaskInput()));
  const createdSnapshot = JSON.stringify(created);
  const offered = asRecord(
    await tasks.offerHumanProductionTask(scopeOf('tenant-a'), created.id, { kind: 'project-owner' }),
  );
  // Every nested field of an appended version is frozen — mutating through
  // the returned record can never corrupt the STORED version.
  assert.ok(Object.isFrozen(offered));
  assert.ok(Object.isFrozen(offered.objective));
  assert.ok(Object.isFrozen(offered.sourceReference));
  assert.ok(Object.isFrozen(offered.scriptOrQuestions));
  assert.ok(Object.isFrozen(offered.captureInstructions));
  assert.ok(Object.isFrozen(offered.targetModality));
  assert.ok(Object.isFrozen(offered.requiredArtifacts));
  assert.ok(Object.isFrozen(offered.consent));
  assert.ok(Object.isFrozen(offered.rights));
  assert.ok(Object.isFrozen(offered.evaluator));
  assert.ok(Object.isFrozen(offered.deadline));
  assert.ok(Object.isFrozen(offered.delayEconomics));
  assert.ok(Object.isFrozen(offered.acceptableSubstitutes));
  assert.ok(Object.isFrozen(offered.fulfillmentPath));
  assert.throws(() => {
    (offered.objective as { statement?: string }).statement = 'MUTATED';
  });
  const stored = await tasks.getHumanProductionTask(scopeOf('tenant-a'), created.id);
  assert.ok(stored !== null);
  assert.notEqual(stored.objective.statement, 'MUTATED');
  // The stored v1 is bit-for-bit untouched by the lifecycle append.
  const v1 = await tasks.getHumanProductionTask(scopeOf('tenant-a'), created.id, 1);
  assert.ok(v1 !== null);
  assert.equal(JSON.stringify(v1), createdSnapshot);
  // Delivered + abandoned versions: the delivered refs and the abandonment
  // record (with its nested paths) are frozen too.
  await tasks.acceptHumanProductionTask(scopeOf('tenant-a'), created.id);
  const delivered = asRecord(
    await tasks.deliverHumanProductionTask(scopeOf('tenant-a'), created.id, {
      scope: scopeOf('tenant-a'),
      artifactRefs: [artifactRef('human-output-1')],
    }),
  );
  assert.ok(Object.isFrozen(delivered.deliveredArtifactRefs));
  assert.ok(Object.isFrozen(delivered.deliveredArtifactRefs?.[0]));
  const abandonedTask = asRecord(
    await tasks.createHumanProductionTask(humanTaskInput('tenant-a', { id: 'human-task.freeze-abandon' })),
  );
  await tasks.offerHumanProductionTask(scopeOf('tenant-a'), abandonedTask.id, { kind: 'project-owner' });
  const abandoned = asRecord(
    await tasks.abandonHumanProductionTask(scopeOf('tenant-a'), abandonedTask.id, {
      scope: scopeOf('tenant-a'),
      reason: 'nested-freeze pin',
    }),
  );
  assert.ok(abandoned.abandonment !== null);
  assert.ok(Object.isFrozen(abandoned.abandonment));
  assert.ok(abandoned.abandonment.originalPath !== null);
  assert.ok(Object.isFrozen(abandoned.abandonment.originalPath));
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const createTaskPort = (): HumanProductionTaskPort =>
  createInMemoryHumanProductionTask({ now: FIXED_NOW });
