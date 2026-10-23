/**
 * AppShellPort contract tests (WEB-001 / UX-001; wave-24 target-design
 * conversion) over the DISCLOSED composition double, which derives the
 * shell's chrome view model from the REAL `@mos/identity` and
 * `@mos/missions` repositories (CORE-002).
 *
 * Pins: Home and Missions are available sections FIRST (UX-001); the
 * target-design rail order (Research Lab third, Agent Console fourth,
 * Studio fifth, Measurement sixth); later surfaces are explicit
 * `not-yet-available` verdicts naming their backlog dependencies (never
 * placeholder content); tenant context comes from the real identity
 * records; an unknown tenant resolves to NO context (the Missions surface
 * then renders its explicit no-tenant state — spec §31, no existence
 * leaks); the mission-activity status and recent-missions rail are derived
 * from the REAL missions repository (empty is a real state; the badge is
 * honest about what the authority holds).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { TenantId } from '@mos/contracts';
import { createInMemoryIdentityRepository } from '../../mos-identity/dist/index.js';
import { createInMemoryMissionRepository } from '../../mos-missions/dist/index.js';
import { createInMemoryAppShellPort } from './in-memory-app-shell.js';
import type { AppShellView } from '../dist/src/ports/app-shell.js';

const tenantId = (value: string): TenantId => value as TenantId;

const makeShell = (resolvedTenantId: string, workspaceIdValue: string | null = null) => {
  const identity = createInMemoryIdentityRepository();
  const missions = createInMemoryMissionRepository();
  identity.createTenant({ id: tenantId('tenant-a'), name: 'Acme Media' });
  return createInMemoryAppShellPort({
    identityRepository: identity,
    missionRepository: missions,
    scope: { tenantId: tenantId(resolvedTenantId) },
    tenantId: resolvedTenantId,
    workspaceId: workspaceIdValue,
  });
};

const seedMission = (
  missionId: string,
  statement: string,
): ReturnType<typeof createInMemoryMissionRepository> => {
  const missions = createInMemoryMissionRepository();
  const created = missions.createMission({
    scope: { tenantId: tenantId('tenant-a') },
    id: missionId as never,
    objective: {
      statement,
      targetMetrics: [
        { metric: 'qualified-reach', target: '10000', unit: 'count', horizon: null },
      ],
      constraints: [],
    } as never,
    rewardSpec: {
      version: 1,
      terms: [
        { metric: 'qualified-reach', weight: 1, direction: 'maximize', definition: 'Reach.' },
      ],
    } as never,
  });
  if ('error' in created) {
    assert.fail(`fixture seed failed: ${created.message}`);
  }
  return missions;
};

const makeShellWithMissions = (missions: ReturnType<typeof createInMemoryMissionRepository>) => {
  const identity = createInMemoryIdentityRepository();
  identity.createTenant({ id: tenantId('tenant-a'), name: 'Acme Media' });
  return createInMemoryAppShellPort({
    identityRepository: identity,
    missionRepository: missions,
    scope: { tenantId: tenantId('tenant-a') },
    tenantId: 'tenant-a',
    workspaceId: null,
  });
};

const expectShellView = async (port: ReturnType<typeof createInMemoryAppShellPort>): Promise<AppShellView> => {
  const result = await port.loadAppShell();
  if ('error' in result) {
    assert.fail(`unexpected app-shell failure: ${result.error}`);
  }
  return result;
};

test('the shell loads its chrome as a view model (async port contract)', async () => {
  const shellView = await expectShellView(makeShell('tenant-a'));
  assert.equal(shellView.sections.length, 11);
});

test('the §5 target-design rail order holds: lab third, console fourth, then the not-yet group, then the promoted routes', async () => {
  const shellView = await expectShellView(makeShell('tenant-a'));

  assert.deepEqual(
    shellView.sections.map((section) => section.id),
    [
      'home',
      'missions',
      'lab',
      'console',
      'social',
      'studio',
      'distribution',
      'experiments',
      'measurement',
      'connections',
      'notifications',
    ],
    'Home and Missions first (UX-001), Research Lab third and Agent Console fourth (the target-design rail order), Social Media fifth (the §8 social workspace), Studio sixth, then the honest not-yet-available group (Distribution + Experiments are NEW rows, §5 UXR-WC), Measurement & Learning relabeled, and the promoted Connections + Activity & Approvals routes last',
  );
  const home = shellView.sections[0];
  const missions = shellView.sections[1];
  const lab = shellView.sections[2];
  const consoleSection = shellView.sections[3];
  const social = shellView.sections[4];
  const studio = shellView.sections[5];
  assert.equal(home?.route, '/');
  assert.deepEqual(home?.availability, { kind: 'available' });
  assert.equal(missions?.route, '/missions');
  assert.deepEqual(missions?.availability, { kind: 'available' });
  assert.equal(lab?.label, 'Research Lab');
  assert.equal(lab?.route, '/lab');
  assert.deepEqual(lab?.availability, { kind: 'available' });
  assert.equal(consoleSection?.route, '/console');
  assert.deepEqual(
    consoleSection?.availability,
    { kind: 'available' },
    'the CONSOLE wave turned the Agent Console section on — the operational center',
  );
  assert.equal(social?.label, 'Social Media');
  assert.equal(social?.route, '/social');
  assert.deepEqual(social?.availability, { kind: 'available' }, 'the §8 social workspace is on');
  assert.equal(studio?.route, '/studio');
  assert.deepEqual(
    studio?.availability,
    { kind: 'available' },
    'UX-002 turned the Studio section on — STUDIO-014 is delivered',
  );
});

test('Measurement & Learning is an explicit not-yet-available verdict naming its dependency', async () => {
  const shellView = await expectShellView(makeShell('tenant-a'));

  const measurement = shellView.sections.find((section) => section.id === 'measurement');
  assert.ok(measurement, 'the target design\'s Measurement section is presented');
  assert.equal(measurement?.label, 'Measurement & Learning');
  assert.equal(measurement?.availability.kind, 'not-yet-available');
  assert.equal(
    typeof measurement?.availability.kind === 'string' && measurement.availability.kind === 'not-yet-available'
      ? 'dependsOn' in measurement.availability && measurement.availability.dependsOn.includes('UX-007')
      : false,
    true,
    'the unavailable verdict names what it waits on',
  );
});

test('the NEW Distribution and Experiments rail rows are honest not-yet-available verdicts (§5, no dead links)', async () => {
  const shellView = await expectShellView(makeShell('tenant-a'));

  for (const id of ['distribution', 'experiments'] as const) {
    const section = shellView.sections.find((candidate) => candidate.id === id);
    assert.ok(section, `${id} is presented in the rail`);
    assert.equal(section?.availability.kind, 'not-yet-available', `${id} is not yet available`);
    if (section?.availability.kind === 'not-yet-available') {
      assert.equal(
        section.availability.dependsOn.includes('no') && section.availability.dependsOn.includes('read models'),
        true,
        `${id}'s verdict names the unbound read models`,
      );
    }
  }
});

test('tenant context is derived from the REAL identity records', async () => {
  const identity = createInMemoryIdentityRepository();
  const missions = createInMemoryMissionRepository();
  identity.createTenant({ id: tenantId('tenant-a'), name: 'Acme Media' });
  const workspace = identity.createWorkspace({
    scope: { tenantId: tenantId('tenant-a') },
    id: 'ws-1' as never,
    name: 'Growth Studio',
  });
  if ('error' in workspace) {
    assert.fail('fixture seed failed');
  }

  const shellView = await expectShellView(
    createInMemoryAppShellPort({
      identityRepository: identity,
      missionRepository: missions,
      scope: { tenantId: tenantId('tenant-a'), workspaceId: 'ws-1' as never },
      tenantId: 'tenant-a',
      workspaceId: 'ws-1',
    }),
  );
  assert.deepEqual(shellView.tenant, {
    tenantId: tenantId('tenant-a'),
    tenantDisplayName: 'Acme Media',
    workspaceId: 'ws-1' as never,
    workspaceDisplayName: 'Growth Studio',
  });
});

test('a tenant scope without a workspace presents the tenant with no workspace', async () => {
  const shellView = await expectShellView(makeShell('tenant-a'));
  assert.deepEqual(shellView.tenant, {
    tenantId: tenantId('tenant-a'),
    tenantDisplayName: 'Acme Media',
    workspaceId: null,
    workspaceDisplayName: null,
  });
});

test('an unknown workspace id degrades to a null workspace display name, honestly', async () => {
  const shellView = await expectShellView(makeShell('tenant-a', 'ws-missing'));
  assert.equal(shellView.tenant?.workspaceId, 'ws-missing' as never);
  assert.equal(shellView.tenant?.workspaceDisplayName, null);
});

test('an unknown tenant resolves to NO tenant context (no existence leak)', async () => {
  const shellView = await expectShellView(makeShell('tenant-ghost'));
  assert.equal(shellView.tenant, null);
});

test('the mission-activity badge reads the REAL missions repository honestly', async () => {
  // No missions: the badge honestly says no active mission.
  const emptyShell = await expectShellView(makeShellWithMissions(createInMemoryMissionRepository()));
  assert.deepEqual(emptyShell.missionStatus, { active: false });
  assert.deepEqual(emptyShell.recentMissions, [], 'no missions means an empty recent list — a real state');

  // One ACTIVE mission: the badge flips to active.
  const missions = seedMission('mission-a', 'Grow qualified reach of the developer audience.');
  const activated = missions.activateMission({ tenantId: tenantId('tenant-a') }, 'mission-a' as never);
  if ('error' in activated) {
    assert.fail(`fixture seed failed: ${activated.message}`);
  }
  const activeShell = await expectShellView(makeShellWithMissions(missions));
  assert.deepEqual(activeShell.missionStatus, { active: true });
});

test('the recent-missions rail is derived from the REAL repository, view-shaped', async () => {
  const missions = createInMemoryMissionRepository();
  for (const [id, statement] of [
    ['mission-one', 'Run the MOS demo mission end to end.'],
    ['mission-two', 'Measure the closed-loop improvement on the demo program.'],
  ] as const) {
    const created = missions.createMission({
      scope: { tenantId: tenantId('tenant-a') },
      id: id as never,
      objective: {
        statement,
        targetMetrics: [
          { metric: 'qualified-reach', target: '10000', unit: 'count', horizon: null },
        ],
        constraints: [],
      } as never,
      rewardSpec: {
        version: 1,
        terms: [
          { metric: 'qualified-reach', weight: 1, direction: 'maximize', definition: 'Reach.' },
        ],
      } as never,
    });
    if ('error' in created) {
      assert.fail(`fixture seed failed: ${created.message}`);
    }
  }
  const shellView = await expectShellView(makeShellWithMissions(missions));
  assert.equal(shellView.recentMissions.length, 2);
  for (const mission of shellView.recentMissions) {
    assert.equal(mission.route.startsWith('/console?mission='), true, 'rail entries open the console workspace');
  }
  assert.deepEqual(
    shellView.recentMissions.map((mission) => mission.missionId).sort(),
    ['mission-one', 'mission-two'],
  );
});
