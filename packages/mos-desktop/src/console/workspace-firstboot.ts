/**
 * The MOS console WORKSPACE SEED (W32 — first boot only; clearly
 * disclosed evaluation records): statuses are THIS store's own
 * lifecycle truth; anything platform-shaped stays SIMULATION-labelled
 * or absent. A quarantined store does NOT re-seed (that would fabricate
 * records the operator may believe existed).
 */

import type {
  MosWorkspacePersisted,
} from './workspace-records.js';
import type {
  MosMissionDirection,
} from './workspace-vocabulary.js';

/** The seed's mutable working shape (assembled, then returned as the frozen persisted document). */
interface MutableWorkspaceSeed {
  schema: 1;
  nextSeq: number;
  missions: MosWorkspacePersisted['missions'];
  posts: MosWorkspacePersisted['posts'];
  campaigns: MosWorkspacePersisted['campaigns'];
  accounts: MosWorkspacePersisted['accounts'];
  events: MosWorkspacePersisted['events'];
  approvals: MosWorkspacePersisted['approvals'];
  tasks: MosWorkspacePersisted['tasks'];
  modelSettings: MosWorkspacePersisted['modelSettings'];
  automations: MosWorkspacePersisted['automations'];
  automationSettings: MosWorkspacePersisted['automationSettings'];
}

/**
 * Build the first-boot seed: 4 missions, 4 posts, 3 campaigns (one per
 * lifecycle rung), 2 approvals (one pending, one decided), 2 recorded
 * agent tasks (W36 — the Tasks surface's evaluation records), 2
 * scheduled automations (W36), and the timeline that records every step.
 */
export function mosWorkspaceFirstbootRecords(): MosWorkspacePersisted {
  const T0 = '2026-10-24T09:00:00.000Z';
  const T1 = '2026-10-24T11:30:00.000Z';
  const T2 = '2026-10-25T08:15:00.000Z';
  const T3 = '2026-10-25T15:45:00.000Z';
  const T4 = '2026-10-26T10:05:00.000Z';
  let nextSeq = 1;
  const persisted: MutableWorkspaceSeed = {
    schema: 1,
    nextSeq: 1,
    missions: [],
    posts: [],
    campaigns: [],
    accounts: [],
    events: [],
    approvals: [],
    tasks: [],
    modelSettings: { disabledModelIds: [] },
    automations: [],
    automationSettings: { keepAwake: false },
  };
  const bump = (): number => {
    const seq = nextSeq;
    nextSeq += 1;
    return seq;
  };
  const event = (kind: string, line: string, at: string): void => {
    const seq = bump();
    persisted.events = [...persisted.events, { id: `evt-${String(seq).padStart(3, '0')}`, seq, kind, line, at }];
  };
  const mission = (
    id: string,
    direction: MosMissionDirection,
    statement: string,
    metric: string,
    target: string,
    horizon: string,
    audience: string,
    constraints: string,
    at: string,
  ): void => {
    const seq = bump();
    persisted.missions = [
      ...persisted.missions,
      { id, seq, direction, statement, metric, target, horizon, audience, constraints, status: 'INTENT_RECORDED', createdAt: at },
    ];
    event('mission-intent-recorded', `Mission declared — "${statement}" (${direction}, reward metric: ${metric})`, at);
  };
  const post = (
    id: string,
    platform: 'youtube' | 'instagram' | 'facebook-pages' | 'tiktok' | 'x',
    missionId: string | null,
    content: string,
    scheduledFor: string | null,
    at: string,
  ): void => {
    const seq = bump();
    persisted.posts = [
      ...persisted.posts,
      { id, seq, platform, missionId, content, status: scheduledFor === null ? 'DRAFT' : 'SCHEDULED', scheduledFor, createdAt: at },
    ];
  };
  const campaign = (
    id: string,
    platform: 'google-ads' | 'meta-ads' | 'tiktok-ads',
    objective: string,
    budget: string,
    dailyCap: string,
    audience: string,
    missionId: string | null,
    status: 'DRAFT' | 'COMPILED' | 'ARMED' | 'HALTED',
    counterfactual: string | null,
    at: string,
  ): void => {
    const seq = bump();
    persisted.campaigns = [
      ...persisted.campaigns,
      { id, seq, platform, objective, budget, dailyCap, audience, missionId, status, counterfactual, measured: null, createdAt: at },
    ];
  };

  event('workspace-opened', 'Workspace opened — the seed records below are evaluation records, clearly disclosed, never platform truth', T0);
  mission('mis-001', 'promote', 'Sell out the Accra pop-up through TikTok teasers', 'qualified-reach', 'Sold-out show — 600 tickets', '3 weeks', 'Accra 18–30, afrobe and night-life audiences', 'No paid boost before the arm gate', T0);
  mission('mis-002', 'grow', 'Grow the label YouTube subscriber base with weekly shorts', 'audience-growth', '+2,500 subscribers', '8 weeks', 'Ghana and diaspora hip-hop heads', 'Organic only — no promotion budget', T0);
  mission('mis-003', 'publish', 'Run the EP release campaign across Instagram and X', 'business-outcome', '10k first-week streams', '4 weeks', 'Existing followers and lookalikes', 'Release-day embargo holds', T1);
  mission('mis-004', 'measure', 'Measure creative fatigue across the Q4 ad mix', 'fatigue', 'Fatigue band quantified per creative', '6 weeks', 'Retargeted audiences', 'Vanity metrics excluded by the guardrail', T1);
  post('pst-001', 'tiktok', 'mis-001', 'Pop-up teaser 01 — the venue reveal. Accra, mark the date. #afrobe #popup', null, T2);
  post('pst-002', 'tiktok', 'mis-001', 'Pop-up teaser 02 — the lineup card drops tomorrow. Who are you coming to see?', '2026-10-27T18:00', T2);
  post('pst-003', 'instagram', 'mis-003', 'EP cover art reveal — presave link in bio. Eight tracks, one story.', null, T2);
  post('pst-004', 'youtube', 'mis-002', 'Shorts: behind the booth at the Accra sessions — 45 seconds, one take.', null, T2);
  event('post-recorded', 'Draft recorded on tiktok — "Pop-up teaser 01 — the venue reveal. Accra, mark the date…"', T2);
  event('post-recorded', 'Post scheduled on tiktok for 2026-10-27T18:00 — "Pop-up teaser 02 — the lineup card drops tomorrow…"', T2);
  campaign('cmp-001', 'tiktok-ads', 'Accra pop-up teasers — TikTok', 'GH₵3,000', 'GH₵250', 'Accra 18–30, afrobe interest', 'mis-001', 'DRAFT', null, T3);
  campaign('cmp-002', 'google-ads', 'Subscriber growth — YouTube pre-roll', 'GH₵5,000', 'GH₵400', 'Ghana hip-hop audiences', 'mis-002', 'COMPILED', 'SIMULATION — the Lab\'s counterfactual projection for GH₵5,000: a reach band of 180k–240k impressions and a conversion band of 0.9%–1.4% to channel visits, labelled simulation, never platform truth.', T3);
  campaign('cmp-003', 'meta-ads', 'EP release retargeting — Meta', 'GH₵2,400', 'GH₵200', 'Presavers and recent viewers', 'mis-003', 'ARMED', 'SIMULATION — the Lab\'s counterfactual projection for GH₵2,400: a 2.1%–3.0% retargeted conversion band, labelled simulation, never platform truth.', T3);
  event('campaign-draft-recorded', 'Campaign drafted — "Accra pop-up teasers — TikTok" (tiktok-ads, budget GH₵3,000, cap GH₵250/day). Nothing spends before the arm gate.', T3);
  event('campaign-compiled', 'Campaign cmp-002 compiled — the arm gate is pending human approval', T3);
  const approvalApproved = { id: 'apv-001', seq: bump(), kind: 'arm-gate' as const, campaignId: 'cmp-003', status: 'APPROVED' as const, decidedAt: T4, createdAt: T3 };
  const approvalPending = { id: 'apv-002', seq: bump(), kind: 'arm-gate' as const, campaignId: 'cmp-002', status: 'PENDING' as const, decidedAt: null, createdAt: T3 };
  persisted.approvals = [approvalApproved, approvalPending];
  event('gate-approved', 'Arm gate approved — campaign cmp-003 is ARMED (workspace record; live spend still awaits a connected ad transport)', T4);

  // W36 — the recorded agent tasks (the Tasks surface's evaluation
  // records: the substrate's task-list row shapes + the conversation's
  // turn shapes, disclosed as workspace drafts that never ran).
  const task = (
    id: string,
    title: string,
    prompt: string,
    modelId: string,
    mode: string,
    planEnabled: boolean,
    pinned: boolean,
    missionId: string | null,
    followUps: MosWorkspacePersisted['tasks'][number]['followUps'],
    createdAt: string,
    updatedAt: string,
  ): void => {
    const seq = bump();
    persisted.tasks = [
      ...persisted.tasks,
      { id, seq, title, prompt, modelId, connectionMode: 'individual', mode, planEnabled, reasoningLevel: 'high', missionId, status: 'DRAFT' as const, createdAt, updatedAt, pinned, archived: false, followUps },
    ];
  };
  task(
    'tsk-001',
    'Diagnose the failing boundary checks',
    'Run the existing checks and diagnose failures',
    'GLM-5.3',
    'build',
    true,
    true,
    null,
    [{ id: 'tsk-fu-001', prompt: 'Start with the boundary harness — report the first failing rule only.', at: T4 }],
    T2,
    T4,
  );
  task(
    'tsk-002',
    'Draft the EP release-day copy set',
    'Draft the release-day announcement copy for Instagram and X, mission rules respected',
    'GLM-5.3-Flash',
    'edit',
    false,
    false,
    'mis-003',
    [],
    T3,
    T3,
  );
  event('agent-task-recorded', 'Task tsk-001 drafted — "Diagnose the failing boundary checks" on GLM-5.3 (build mode · plan). The substrate runs it when an account is connected.', T2);
  event('agent-task-recorded', 'Task tsk-002 drafted — "Draft the EP release-day copy set" on GLM-5.3-Flash (edit mode). The substrate runs it when an account is connected.', T3);
  event('task-follow-up-recorded', 'Follow-up on task tsk-001 — "Start with the boundary harness — report the first failing rule…". A workspace record; the substrate runs it when an account is connected.', T4);
  event('task-pinned', 'Task tsk-001 pinned — the task list\'s Pinned section follows it', T4);

  // W36 — the scheduled automations (the Automations surface's
  // evaluation records; the first prompt is the substrate's own
  // create-in-chat example, verbatim).
  const automation = (
    id: string,
    title: string,
    prompt: string,
    cronExpr: string,
    schedule: string,
    lifecycleStatus: 'active' | 'paused',
    nextRunAt: string | null,
    createdAt: string,
  ): void => {
    const seq = bump();
    persisted.automations = [
      ...persisted.automations,
      { id, seq, title, prompt, cronExpr, schedule, lifecycleStatus, runCount: 0, nextRunAt, lastRunAt: null, createdAt, updatedAt: createdAt },
    ];
  };
  automation(
    'atm-001',
    'Weekday change summary',
    'Every weekday at 9 AM, summarize code changes and follow-ups for this project.',
    '0 9 * * 1-5',
    'Every weekday at 9:00 AM',
    'active',
    '2026-10-27T09:00:00.000Z',
    T3,
  );
  automation(
    'atm-002',
    'Weekly audience report',
    'Every Monday at 8 AM, compile the weekly audience-growth report from the measurement vocabulary — no vanity metrics.',
    '0 8 * * 1',
    'Every Monday at 8:00 AM',
    'paused',
    null,
    T3,
  );
  event('automation-recorded', 'Automation atm-001 (Weekday change summary) recorded — Every weekday at 9:00 AM. The substrate dispatches runs when an account is connected.', T3);
  event('automation-recorded', 'Automation atm-002 (Weekly audience report) recorded — Every Monday at 8:00 AM, paused. The substrate dispatches runs when an account is connected.', T3);

  event('workspace-seeded', 'Seed complete — 4 missions, 4 posts, 3 campaigns, 2 approvals, 2 tasks, 2 automations, this timeline', T4);

  persisted.nextSeq = nextSeq;
  return persisted;
}
