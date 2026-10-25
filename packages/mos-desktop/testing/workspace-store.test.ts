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
