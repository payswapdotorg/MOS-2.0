/**
 * WORKSPACE STORE pins (W32 — the payswap browserWorkspaceStore law):
 * the honest vocabulary (17 metrics, the capability matrix, the provider
 * catalogue), the first-boot seed, the fail-closed validation writes,
 * the arm-gate cascade (the REAL decision), the provider setup records,
 * and the persistence round-trip through the injected storage adapter.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MOS_AD_PLATFORMS,
  MOS_PROVIDER_CATALOGUE,
  MOS_REWARD_METRIC_VOCABULARY,
  MOS_SOCIAL_CAPABILITY_MATRIX,
  MOS_SOCIAL_PLATFORMS,
  MOS_WORKSPACE_STORE_KEY,
  MosWorkspaceStoreError,
  createMosWorkspaceStore,
} from '../dist/console/workspace-store.js';

/** An in-memory storage adapter (the localStorage double for tests). */
function memoryStorage(initial = new Map<string, string>()) {
  return {
    getItem: (key: string) => initial.get(key) ?? null,
    setItem: (key: string, value: string) => {
      initial.set(key, value);
    },
    removeItem: (key: string) => {
      initial.delete(key);
    },
  };
}

const FIXED_CLOCK = () => '2026-10-26T12:00:00.000Z';

function seededStore() {
  return createMosWorkspaceStore({ storage: memoryStorage(), clock: FIXED_CLOCK });
}

test('the reward vocabulary is the closed 17-metric list', () => {
  assert.equal(MOS_REWARD_METRIC_VOCABULARY.length, 17);
  assert.equal(MOS_REWARD_METRIC_VOCABULARY[0]?.id, 'business-outcome');
  assert.equal(MOS_REWARD_METRIC_VOCABULARY[16]?.id, 'operational-risk');
});

test('the social capability matrix carries the five platforms with honest verdicts', () => {
  assert.deepEqual(
    MOS_SOCIAL_CAPABILITY_MATRIX.map((row) => row.platform),
    [...MOS_SOCIAL_PLATFORMS],
  );
  const youtube = MOS_SOCIAL_CAPABILITY_MATRIX[0];
  assert.ok(youtube !== undefined, 'the matrix leads with YouTube');
  if (youtube === undefined) return;
  assert.equal(youtube.platform, 'youtube');
  assert.equal(youtube.verdicts.find((verdict) => verdict.operation === 'publish')?.support, 'supported');
  assert.equal(
    youtube.verdicts.find((verdict) => verdict.operation === 'list-restrictions')?.support,
    'unknown',
  );
  // unknown is a first-class verdict across the whole matrix
  for (const row of MOS_SOCIAL_CAPABILITY_MATRIX) {
    for (const verdict of row.verdicts) {
      assert.ok(
        verdict.support === 'supported' || verdict.support === 'unknown' || verdict.support === 'unsupported',
      );
      assert.ok(verdict.note.length > 0, 'every verdict carries its claim-basis note');
    }
  }
});

test('the provider catalogue carries the 8 providers (5 social + 3 ads) with expected domains', () => {
  assert.equal(MOS_PROVIDER_CATALOGUE.length, 8);
  assert.equal(MOS_PROVIDER_CATALOGUE[0]?.id, 'youtube');
  assert.equal(MOS_PROVIDER_CATALOGUE[0]?.expectedDomain, 'accounts.google.com');
  const social = MOS_PROVIDER_CATALOGUE.filter((entry) => entry.kind === 'social');
  const ads = MOS_PROVIDER_CATALOGUE.filter((entry) => entry.kind === 'ads');
  assert.equal(social.length, 5);
  assert.equal(ads.length, 3);
  assert.deepEqual(ads.map((entry) => entry.id), [...MOS_AD_PLATFORMS]);
});

test('the first-boot seed lands the disclosed evaluation records', () => {
  const store = seededStore();
  const snapshot = store.getSnapshot();
  assert.equal(snapshot.missions.length, 4);
  assert.equal(snapshot.posts.length, 4);
  assert.equal(snapshot.campaigns.length, 3);
  assert.equal(snapshot.approvals.length, 2);
  // W36: the Tasks surface's evaluation records (one pinned, one with a
  // follow-up turn) + the Automations records (one active, one paused).
  assert.equal(snapshot.tasks.length, 2);
  assert.equal(snapshot.tasks.filter((task) => task.pinned).length, 1);
  assert.equal(snapshot.tasks.reduce((total, task) => total + task.followUps.length, 0), 1);
  assert.equal(snapshot.automations.length, 2);
  assert.equal(snapshot.automations.filter((automation) => automation.lifecycleStatus === 'active').length, 1);
  assert.equal(snapshot.automations.filter((automation) => automation.lifecycleStatus === 'paused').length, 1);
  assert.ok(snapshot.events.length >= 9, 'the seed timeline is populated');
  // The three lifecycle rungs are all present in the registry.
  assert.ok(snapshot.campaigns.some((campaign) => campaign.status === 'DRAFT'));
  assert.ok(snapshot.campaigns.some((campaign) => campaign.status === 'COMPILED'));
  assert.ok(snapshot.campaigns.some((campaign) => campaign.status === 'ARMED'));
  // One pending arm gate, one decided.
  assert.equal(snapshot.approvals.filter((approval) => approval.status === 'PENDING').length, 1);
  assert.equal(snapshot.approvals.filter((approval) => approval.status === 'APPROVED').length, 1);
  // The seed honesty: workspace-opened + workspace-seeded events exist.
  assert.ok(snapshot.events.some((event) => event.kind === 'workspace-opened'));
  assert.ok(snapshot.events.some((event) => event.kind === 'workspace-seeded'));
  // The seed's task + automation events are on the timeline.
  assert.ok(snapshot.events.some((event) => event.kind === 'agent-task-recorded'));
  assert.ok(snapshot.events.some((event) => event.kind === 'automation-recorded'));
});

test('the seed is idempotent across reloads (persisted, not re-seeded)', () => {
  const backing = new Map<string, string>();
  const first = createMosWorkspaceStore({ storage: memoryStorage(backing), clock: FIXED_CLOCK });
  const missionCount = first.getSnapshot().missions.length;
  first.recordMissionIntent({
    direction: 'grow',
    statement: 'Grow the newsletter through the X channel',
    metric: 'audience-growth',
    target: '+1,000 subscribers',
    horizon: '4 weeks',
    audience: 'Existing readers',
    constraints: '',
  });
  const grown = first.getSnapshot().missions.length;
  // A second store over the SAME storage reloads the grown snapshot.
  const second = createMosWorkspaceStore({ storage: memoryStorage(backing), clock: FIXED_CLOCK });
  assert.equal(second.getSnapshot().missions.length, grown);
  assert.notEqual(grown, missionCount);
});

test('recordMissionIntent validates fail-closed (statement, direction, metric, target)', () => {
  const store = createMosWorkspaceStore({ storage: memoryStorage(), clock: FIXED_CLOCK, seed: false });
  const base = {
    direction: 'promote',
    statement: 'Sell out the Accra pop-up',
    metric: 'qualified-reach',
    target: '600 tickets',
    horizon: '3 weeks',
    audience: 'Accra 18–30',
    constraints: '',
  };
  store.recordMissionIntent(base);
  assert.equal(store.getSnapshot().missions.length, 1);

  const short = { ...base, statement: 'short' };
  assert.throws(() => store.recordMissionIntent(short), MosWorkspaceStoreError);
  const badDirection = { ...base, direction: 'explode' };
  assert.throws(() => store.recordMissionIntent(badDirection), MosWorkspaceStoreError);
  const badMetric = { ...base, metric: 'likes' };
  assert.throws(() => store.recordMissionIntent(badMetric), MosWorkspaceStoreError);
  const noTarget = { ...base, target: '  ' };
  assert.throws(() => store.recordMissionIntent(noTarget), MosWorkspaceStoreError);
  // The failed writes left the state unchanged (fail-closed).
  assert.equal(store.getSnapshot().missions.length, 1);
  assert.equal(store.getSnapshot().events.filter((event) => event.kind === 'mission-intent-recorded').length, 1);
});

test('recordPostDraft validates the platform and content; schedulePost moves DRAFT → SCHEDULED', () => {
  const store = createMosWorkspaceStore({ storage: memoryStorage(), clock: FIXED_CLOCK, seed: false });
  const post = store.recordPostDraft({
    platform: 'tiktok',
    missionId: null,
    content: 'Pop-up teaser — the venue reveal',
    scheduledFor: null,
  });
  assert.equal(post.status, 'DRAFT');
  assert.throws(() =>
    store.recordPostDraft({ platform: 'myspace', missionId: null, content: 'no such platform', scheduledFor: null }),
    MosWorkspaceStoreError,
  );
  assert.throws(() =>
    store.recordPostDraft({ platform: 'tiktok', missionId: null, content: 'thin', scheduledFor: null }),
    MosWorkspaceStoreError,
  );
  assert.throws(() =>
    store.recordPostDraft({ platform: 'tiktok', missionId: 'mis-999', content: 'link must be real', scheduledFor: null }),
    MosWorkspaceStoreError,
  );
  const scheduled = store.schedulePost(post.id, '2026-10-27T18:00');
  assert.equal(scheduled.status, 'SCHEDULED');
  assert.equal(scheduled.scheduledFor, '2026-10-27T18:00');
  assert.throws(() => store.schedulePost('pst-999', '2026-10-27T18:00'), MosWorkspaceStoreError);
});

test('the campaign lifecycle: draft → compile (gate opens) → approve (ARMED cascade)', () => {
  const store = createMosWorkspaceStore({ storage: memoryStorage(), clock: FIXED_CLOCK, seed: false });
  const mission = store.recordMissionIntent({
    direction: 'promote',
    statement: 'Sell out the Accra pop-up through TikTok teasers',
    metric: 'qualified-reach',
    target: '600 tickets',
    horizon: '3 weeks',
    audience: 'Accra 18–30',
    constraints: '',
  });
  const campaign = store.recordCampaignDraft({
    platform: 'tiktok-ads',
    objective: 'Accra pop-up teasers — TikTok',
    budget: 'GH₵3,000',
    dailyCap: 'GH₵250',
    audience: 'Accra 18–30',
    missionId: mission.id,
  });
  assert.equal(campaign.status, 'DRAFT');
  assert.equal(campaign.counterfactual, null);

  const compiled = store.compileCampaign(campaign.id);
  assert.equal(compiled.status, 'COMPILED');
  assert.ok(compiled.counterfactual?.startsWith('SIMULATION'), 'the counterfactual is SIMULATION-labelled');

  const gate = store.getSnapshot().approvals.find(
    (approval) => approval.campaignId === campaign.id && approval.status === 'PENDING',
  );
  assert.ok(gate, 'compiling opened the arm gate');

  const decided = store.decideApproval(gate.id, 'approve');
  assert.equal(decided.status, 'APPROVED');
  const armed = store.getSnapshot().campaigns.find((entry) => entry.id === campaign.id);
  assert.equal(armed?.status, 'ARMED');
  // The cascade wrote the timeline events (compiled + approved).
  const kinds = store.getSnapshot().events.map((event) => event.kind);
  assert.ok(kinds.includes('campaign-compiled'));
  assert.ok(kinds.includes('gate-approved'));
});

test('the denial is relayed verbatim and does NOT arm the campaign', () => {
  const store = seededStore();
  const pending = store.getSnapshot().approvals.find((approval) => approval.status === 'PENDING');
  assert.ok(pending);
  const decided = store.decideApproval(pending.id, 'deny');
  assert.equal(decided.status, 'DENIED');
  const campaign = store.getSnapshot().campaigns.find((entry) => entry.id === pending.campaignId);
  assert.equal(campaign?.status, 'COMPILED', 'the campaign stays un-armed after a denial');
  assert.ok(store.getSnapshot().events.some((event) => event.kind === 'gate-denied'));
  // A decided gate cannot be re-decided (fail-closed).
  assert.throws(() => store.decideApproval(pending.id, 'approve'), MosWorkspaceStoreError);
});

test('campaign intake validates fail-closed (platform, budget, cap)', () => {
  const store = createMosWorkspaceStore({ storage: memoryStorage(), clock: FIXED_CLOCK, seed: false });
  const base = {
    platform: 'meta-ads',
    objective: 'EP release retargeting',
    budget: 'GH₵2,400',
    dailyCap: 'GH₵200',
    audience: 'Presavers',
    missionId: null,
  };
  store.recordCampaignDraft(base);
  assert.throws(() => store.recordCampaignDraft({ ...base, platform: 'print-ads' }), MosWorkspaceStoreError);
  assert.throws(() => store.recordCampaignDraft({ ...base, budget: '' }), MosWorkspaceStoreError);
  assert.throws(() => store.recordCampaignDraft({ ...base, budget: 'zero' }), MosWorkspaceStoreError);
  assert.throws(() => store.recordCampaignDraft({ ...base, dailyCap: 'free' }), MosWorkspaceStoreError);
  assert.equal(store.getSnapshot().campaigns.length, 1);
});

test('beginProviderSetup records SETUP_REQUIRED honestly and idempotently', () => {
  const store = createMosWorkspaceStore({ storage: memoryStorage(), clock: FIXED_CLOCK, seed: false });
  const account = store.beginProviderSetup('youtube');
  assert.equal(account.status, 'SETUP_REQUIRED');
  const again = store.beginProviderSetup('youtube');
  assert.equal(again.id, account.id, 'the second request is idempotent');
  assert.throws(() => store.beginProviderSetup('myspace'), MosWorkspaceStoreError);
  assert.equal(store.getSnapshot().accounts.length, 1);
  assert.ok(store.getSnapshot().events.some((event) => event.kind === 'provider-setup-requested'));
});

test('a corrupt snapshot is quarantined and the store starts EMPTY (never re-seeded)', () => {
  const backing = new Map<string, string>([
    [MOS_WORKSPACE_STORE_KEY, '{"schema":2,"nextSeq":"broken"'],
  ]);
  const store = createMosWorkspaceStore({ storage: memoryStorage(backing), clock: FIXED_CLOCK });
  const snapshot = store.getSnapshot();
  assert.equal(snapshot.missions.length, 0);
  assert.equal(store.quarantineEntries().length, 1);
  assert.ok(store.quarantineEntries()[0]?.rawExcerpt.includes('"schema":2'));
  assert.ok(store.quarantineEntries()[0]?.reason.includes('failed validation'));
});

test('the health report carries the durability class and the live counts', () => {
  const store = seededStore();
  const health = store.health();
  assert.equal(health.durability, 'BROWSER_PROFILE');
  assert.equal(health.key, MOS_WORKSPACE_STORE_KEY);
  assert.equal(health.missionCount, 4);
  assert.equal(health.campaignCount, 3);
  assert.equal(health.quarantinedCount, 0);
});

test('the timeline reads oldest-first and is capped (the append-only ledger)', () => {
  const store = seededStore();
  const events = store.getSnapshot().events;
  for (let index = 1; index < events.length; index += 1) {
    const before = events[index - 1];
    const after = events[index];
    assert.ok(before !== undefined && after !== undefined, 'both timeline neighbours exist');
    if (before === undefined || after === undefined) return;
    assert.ok(before.seq < after.seq, 'events read in seq order');
  }
  assert.ok(events.length <= 60, 'the snapshot caps the tail at 60 events');
});

/* --------------------------------------------------------------------
 * W35 — the emerged surfaces' writes: agent task records + model list
 * settings + the pre-W35 snapshot migration
 * -------------------------------------------------------------------- */

test('recordAgentTask records the composer submit honestly (task DRAFT + timeline event)', () => {
  const store = createMosWorkspaceStore({ storage: memoryStorage(), clock: FIXED_CLOCK, seed: false });
  const task = store.recordAgentTask({
    title: 'Help me understand and run this repository',
    prompt: 'Help me understand and run this repository',
    modelId: 'GLM-5.3',
    connectionMode: 'individual',
    mode: 'build',
    planEnabled: false,
    reasoningLevel: 'high',
    missionId: null,
  });
  assert.equal(task.status, 'DRAFT');
  assert.equal(task.id, 'tsk-001');
  assert.equal(task.modelId, 'GLM-5.3');
  const snapshot = store.getSnapshot();
  assert.equal(snapshot.tasks.length, 1);
  assert.equal(snapshot.tasks[0]?.id, task.id);
  assert.ok(snapshot.events.some((event) => event.kind === 'agent-task-recorded'));
  assert.equal(store.health().taskCount, 1);
  // The mission context must name a real mission (fail-closed).
  assert.throws(() =>
    store.recordAgentTask({
      title: 'x',
      prompt: 'linked to nothing',
      modelId: 'GLM-5.3',
      connectionMode: 'individual',
      mode: 'build',
      planEnabled: false,
      reasoningLevel: 'high',
      missionId: 'mis-999',
    }),
    MosWorkspaceStoreError,
  );
});

test('recordAgentTask validates fail-closed (prompt, title, model, mode, connection)', () => {
  const store = createMosWorkspaceStore({ storage: memoryStorage(), clock: FIXED_CLOCK, seed: false });
  const base = {
    title: 'Summarize the week',
    prompt: 'Summarize the week across the running channels',
    modelId: 'GLM-5.3',
    connectionMode: 'individual',
    mode: 'build',
    planEnabled: false,
    reasoningLevel: 'high',
    missionId: null,
  };
  store.recordAgentTask(base);
  assert.throws(() => store.recordAgentTask({ ...base, prompt: 'no' }), MosWorkspaceStoreError);
  assert.throws(() => store.recordAgentTask({ ...base, title: '  ' }), MosWorkspaceStoreError);
  assert.throws(() => store.recordAgentTask({ ...base, modelId: 'gpt-9' }), MosWorkspaceStoreError);
  assert.throws(() => store.recordAgentTask({ ...base, connectionMode: 'enterprise' }), MosWorkspaceStoreError);
  assert.throws(() => store.recordAgentTask({ ...base, mode: 'chaos' }), MosWorkspaceStoreError);
  assert.equal(store.getSnapshot().tasks.length, 1);
});

test('setModelDisabled persists the model-list workspace record (toggle + idempotence)', () => {
  const store = createMosWorkspaceStore({ storage: memoryStorage(), clock: FIXED_CLOCK, seed: false });
  assert.deepEqual(store.getSnapshot().modelSettings.disabledModelIds, []);
  store.setModelDisabled('GLM-4V-Flash', true);
  assert.deepEqual(store.getSnapshot().modelSettings.disabledModelIds, ['GLM-4V-Flash']);
  // Idempotent repeat: no duplicate, no event.
  store.setModelDisabled('GLM-4V-Flash', true);
  assert.deepEqual(store.getSnapshot().modelSettings.disabledModelIds, ['GLM-4V-Flash']);
  store.setModelDisabled('GLM-5.1', true);
  store.setModelDisabled('GLM-4V-Flash', false);
  assert.deepEqual(store.getSnapshot().modelSettings.disabledModelIds, ['GLM-5.1']);
  assert.ok(store.getSnapshot().events.some((event) => event.kind === 'model-list-changed'));
  assert.throws(() => store.setModelDisabled('gpt-9', true), MosWorkspaceStoreError);
  // The write round-trips through the storage adapter.
  const roundTripped = createMosWorkspaceStore({ storage: memoryStorage(new Map([['x', 'ignored'], [MOS_WORKSPACE_STORE_KEY, JSON.stringify({ ...store.getSnapshot(), schema: 1, nextSeq: 10 })]])), clock: FIXED_CLOCK, seed: false });
  assert.ok(roundTripped.getSnapshot().modelSettings.disabledModelIds.includes('GLM-5.1'));
});

test('a pre-W35 v1 snapshot (no tasks / modelSettings) loads with honest defaults', () => {
  const legacy = {
    schema: 1,
    nextSeq: 12,
    missions: [
      { id: 'mis-001', seq: 1, direction: 'promote', statement: 'Legacy mission', metric: 'qualified-reach', target: 't', horizon: 'h', audience: 'a', constraints: '', status: 'INTENT_RECORDED', createdAt: FIXED_CLOCK() },
    ],
    posts: [],
    campaigns: [],
    accounts: [],
    events: [],
    approvals: [],
  };
  const backing = new Map<string, string>([[MOS_WORKSPACE_STORE_KEY, JSON.stringify(legacy)]]);
  const store = createMosWorkspaceStore({ storage: memoryStorage(backing), clock: FIXED_CLOCK });
  const snapshot = store.getSnapshot();
  assert.equal(snapshot.missions.length, 1);
  assert.deepEqual(snapshot.tasks, []);
  assert.deepEqual(snapshot.modelSettings.disabledModelIds, []);
  assert.deepEqual(snapshot.automations, []);
  assert.equal(snapshot.automationSettings.keepAwake, false);
  assert.equal(store.quarantineEntries().length, 0, 'the legacy snapshot is NOT quarantined');
  // A present-but-malformed tasks field still fails closed.
  const malformed = new Map<string, string>([
    [MOS_WORKSPACE_STORE_KEY, JSON.stringify({ ...legacy, tasks: 'not-an-array' })],
  ]);
  const quarantined = createMosWorkspaceStore({ storage: memoryStorage(malformed), clock: FIXED_CLOCK });
  assert.equal(quarantined.quarantineEntries().length, 1);
  assert.equal(quarantined.getSnapshot().missions.length, 0, 'the malformed snapshot starts EMPTY');
});

/* --------------------------------------------------------------------
 * W36 — the Tasks surface's workspace decisions + the Automations
 * records + the pre-W36 snapshot migration
 * -------------------------------------------------------------------- */

function bareTaskInput() {
  return {
    title: 'Diagnose the failing boundary checks',
    prompt: 'Run the existing checks and diagnose failures',
    modelId: 'GLM-5.3',
    connectionMode: 'individual',
    mode: 'build',
    planEnabled: true,
    reasoningLevel: 'high',
    missionId: null,
  } as const;
}

function taskStore() {
  return createMosWorkspaceStore({ storage: memoryStorage(), clock: FIXED_CLOCK, seed: false });
}

test('setTaskPinned toggles the pin workspace decision (event + idempotence)', () => {
  const store = taskStore();
  const created = store.recordAgentTask({
    title: 'Diagnose',
    prompt: 'Run the existing checks and diagnose failures',
    modelId: 'GLM-5.3',
    connectionMode: 'individual',
    mode: 'build',
    planEnabled: false,
    reasoningLevel: 'high',
    missionId: null,
  });
  assert.equal(created.pinned, false);
  const pinned = store.setTaskPinned(created.id, true);
  assert.equal(pinned.pinned, true);
  assert.ok(store.getSnapshot().events.some((event) => event.kind === 'task-pinned'));
  // Idempotent repeat: no state change, no duplicate event.
  const eventsBefore = store.getSnapshot().events.length;
  store.setTaskPinned(created.id, true);
  assert.equal(store.getSnapshot().events.length, eventsBefore);
  store.setTaskPinned(created.id, false);
  assert.equal(store.getSnapshot().tasks[0]?.pinned, false);
  assert.throws(() => store.setTaskPinned('tsk-999', true), MosWorkspaceStoreError);
});

test('setTaskArchived moves the record between the active list and the Archived view', () => {
  const store = taskStore();
  const created = store.recordAgentTask({
    title: 'Diagnose',
    prompt: 'Run the existing checks and diagnose failures',
    modelId: 'GLM-5.3',
    connectionMode: 'individual',
    mode: 'build',
    planEnabled: false,
    reasoningLevel: 'high',
    missionId: null,
  });
  const archived = store.setTaskArchived(created.id, true);
  assert.equal(archived.archived, true);
  assert.ok(store.getSnapshot().events.some((event) => event.kind === 'task-archived'));
  // The record is KEPT (the honest archive: removed from the active list, not deleted).
  assert.equal(store.getSnapshot().tasks.length, 1);
  const restored = store.setTaskArchived(created.id, false);
  assert.equal(restored.archived, false);
  assert.throws(() => store.setTaskArchived('tsk-999', true), MosWorkspaceStoreError);
});

test('renameTask keeps the operator\'s own title verbatim (trim + cap + fail-closed)', () => {
  const store = taskStore();
  const created = store.recordAgentTask(bareTaskInput());
  const renamed = store.renameTask(created.id, '  Boundary harness first pass  ');
  assert.equal(renamed.title, 'Boundary harness first pass');
  assert.ok(store.getSnapshot().events.some((event) => event.kind === 'task-renamed'));
  assert.throws(() => store.renameTask(created.id, '   '), MosWorkspaceStoreError);
  assert.throws(() => store.renameTask(created.id, 'x'.repeat(201)), MosWorkspaceStoreError);
  assert.throws(() => store.renameTask('tsk-999', 'nope'), MosWorkspaceStoreError);
});

test('appendTaskFollowUp appends the conversation turn + bumps updatedAt (the honest write)', () => {
  const store = taskStore();
  const created = store.recordAgentTask(bareTaskInput());
  assert.equal(created.updatedAt, created.createdAt);
  const later = '2026-11-01T09:00:00.000Z';
  const updated = store.appendTaskFollowUp(created.id, 'Start with the boundary harness — report the first failing rule only.', later);
  assert.equal(updated.followUps.length, 1);
  assert.equal(updated.followUps[0]?.prompt, 'Start with the boundary harness — report the first failing rule only.');
  assert.equal(updated.followUps[0]?.at, later);
  assert.equal(updated.updatedAt, later);
  assert.ok(store.getSnapshot().events.some((event) => event.kind === 'task-follow-up-recorded'));
  // The second follow-up stacks oldest-first.
  const second = store.appendTaskFollowUp(created.id, 'Now the second rule.', '2026-11-01T09:05:00.000Z');
  assert.equal(second.followUps.length, 2);
  assert.equal(second.followUps[0]?.prompt.startsWith('Start with'), true);
  // Validation: too-thin prompts and unknown tasks fail closed.
  assert.throws(() => store.appendTaskFollowUp(created.id, 'no'), MosWorkspaceStoreError);
  assert.throws(() => store.appendTaskFollowUp('tsk-999', 'a real prompt'), MosWorkspaceStoreError);
});

test('the automation lifecycle: pause/continue, the honest run request, delete, keep-awake', () => {
  const store = seededStore(); // atm-001 active, atm-002 paused
  const snapshot = store.getSnapshot();
  const active = snapshot.automations.find((automation) => automation.id === 'atm-001');
  const paused = snapshot.automations.find((automation) => automation.id === 'atm-002');
  assert.ok(active !== undefined && paused !== undefined);

  // Pause: the lifecycle decision flips — the nextRunAt RECORD stays
  // (schedule math truth; the badge hides it by status, a Continue
  // restores it untouched).
  const pausedAtm = store.setAutomationPaused('atm-001', true);
  assert.equal(pausedAtm.lifecycleStatus, 'paused');
  assert.notEqual(pausedAtm.nextRunAt, null, 'the schedule record survives the pause');
  assert.ok(store.getSnapshot().events.some((event) => event.kind === 'automation-lifecycle-changed'));
  // Continue: resumes with the schedule record intact.
  const continued = store.setAutomationPaused('atm-001', false);
  assert.equal(continued.lifecycleStatus, 'active');
  assert.notEqual(continued.nextRunAt, null);

  // The honest run request: runCount NEVER moves (no dispatch without the
  // substrate account) — lastRunAt carries the request time.
  const runRequested = store.requestAutomationRun('atm-001');
  assert.equal(runRequested.runCount, 0);
  assert.notEqual(runRequested.lastRunAt, null);
  assert.ok(store.getSnapshot().events.some((event) => event.kind === 'automation-run-requested'));

  // Delete removes the record + the event says it cannot be undone.
  const deleted = store.deleteAutomation('atm-002');
  assert.equal(deleted.id, 'atm-002');
  assert.equal(store.getSnapshot().automations.length, 1);
  assert.ok(store.getSnapshot().events.some((event) => event.kind === 'automation-deleted'));
  assert.throws(() => store.deleteAutomation('atm-002'), MosWorkspaceStoreError);
  assert.throws(() => store.setAutomationPaused('atm-999', true), MosWorkspaceStoreError);

  // Keep-awake: the workspace settings record + idempotence.
  assert.equal(store.getSnapshot().automationSettings.keepAwake, false);
  store.setAutomationKeepAwake(true);
  assert.equal(store.getSnapshot().automationSettings.keepAwake, true);
  assert.ok(store.getSnapshot().events.some((event) => event.kind === 'automation-keep-awake-changed'));
  const eventsBefore = store.getSnapshot().events.length;
  store.setAutomationKeepAwake(true);
  assert.equal(store.getSnapshot().events.length, eventsBefore, 'the idempotent repeat notifies nobody');

  // The health report carries the automations count.
  assert.equal(store.health().automationCount, 1);
});

test('a pre-W36 v1 snapshot (W35-era tasks, no automations) migrates with honest defaults', () => {
  const legacy = {
    schema: 1,
    nextSeq: 40,
    missions: [],
    posts: [],
    campaigns: [],
    accounts: [],
    events: [],
    approvals: [],
    tasks: [
      {
        id: 'tsk-001',
        seq: 30,
        title: 'Legacy W35 task',
        prompt: 'Run the existing checks',
        modelId: 'GLM-5.3',
        connectionMode: 'individual',
        mode: 'build',
        planEnabled: false,
        reasoningLevel: 'high',
        missionId: null,
        status: 'DRAFT',
        createdAt: '2026-10-20T09:00:00.000Z',
        // No updatedAt / pinned / archived / followUps — the W35 shape.
      },
    ],
    modelSettings: { disabledModelIds: ['GLM-5.1'] },
    // No automations / automationSettings — the W35 shape.
  };
  const backing = new Map<string, string>([[MOS_WORKSPACE_STORE_KEY, JSON.stringify(legacy)]]);
  const store = createMosWorkspaceStore({ storage: memoryStorage(backing), clock: FIXED_CLOCK });
  const snapshot = store.getSnapshot();
  assert.equal(store.quarantineEntries().length, 0, 'the W35-era snapshot is NOT quarantined');
  assert.equal(snapshot.tasks.length, 1);
  assert.equal(snapshot.tasks[0]?.updatedAt, '2026-10-20T09:00:00.000Z', 'updatedAt defaults to createdAt');
  assert.equal(snapshot.tasks[0]?.pinned, false);
  assert.equal(snapshot.tasks[0]?.archived, false);
  assert.deepEqual(snapshot.tasks[0]?.followUps, []);
  assert.deepEqual(snapshot.modelSettings.disabledModelIds, ['GLM-5.1'], 'the W35 field survives');
  assert.deepEqual(snapshot.automations, []);
  assert.equal(snapshot.automationSettings.keepAwake, false);

  // Present-but-malformed W36 fields still fail closed.
  const malformed = new Map<string, string>([
    [MOS_WORKSPACE_STORE_KEY, JSON.stringify({ ...legacy, automations: 'not-an-array' })],
  ]);
  const quarantined = createMosWorkspaceStore({ storage: memoryStorage(malformed), clock: FIXED_CLOCK });
  assert.equal(quarantined.quarantineEntries().length, 1);
  assert.equal(quarantined.getSnapshot().tasks.length, 0, 'the malformed snapshot starts EMPTY');

  const malformedTask = new Map<string, string>([
    [MOS_WORKSPACE_STORE_KEY, JSON.stringify({ ...legacy, automations: [], tasks: [{ ...legacy.tasks[0], pinned: 'yes' }] })],
  ]);
  const quarantinedTask = createMosWorkspaceStore({ storage: memoryStorage(malformedTask), clock: FIXED_CLOCK });
  assert.equal(quarantinedTask.quarantineEntries().length, 1, 'a malformed pinned field fails closed');
});
