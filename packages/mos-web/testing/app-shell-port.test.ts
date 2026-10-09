/**
 * AppShellPort contract tests (WEB-001 / UX-001) over the DISCLOSED
 * composition double, which derives the shell's chrome view model from the
 * REAL `@mos/identity` repository (CORE-002).
 *
 * Pins: Home and Missions are available sections FIRST (UX-001); later
 * surfaces are explicit `not-yet-available` verdicts naming their backlog
 * dependencies (never placeholder content); tenant context comes from the
 * real identity records; an unknown tenant resolves to NO context (the
 * Missions surface then renders its explicit no-tenant state — spec §31,
 * no existence leaks).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { TenantId } from '@mos/contracts';
import { createInMemoryIdentityRepository } from '../../mos-identity/dist/index.js';
import { createInMemoryAppShellPort } from './in-memory-app-shell.js';
import type { AppShellView } from '../dist/src/ports/app-shell.js';

const tenantId = (value: string): TenantId => value as TenantId;

const expectShellView = async (port: ReturnType<typeof createInMemoryAppShellPort>): Promise<AppShellView> => {
  const result = await port.loadAppShell();
  if ('error' in result) {
    assert.fail(`unexpected app-shell failure: ${result.error}`);
  }
  return result;
};

test('the shell loads its chrome as a view model (async port contract)', async () => {
  const identity = createInMemoryIdentityRepository();
  const tenant = identity.createTenant({ id: tenantId('tenant-a'), name: 'Acme Media' });
  if ('error' in tenant) {
    assert.fail('fixture seed failed');
  }
  const shellView = await expectShellView(
    createInMemoryAppShellPort({ identityRepository: identity, tenantId: 'tenant-a', workspaceId: null }),
  );
  assert.equal(shellView.sections.length, 5);
});

test('Home, Missions and Studio come first and are the available sections', async () => {
  const identity = createInMemoryIdentityRepository();
  identity.createTenant({ id: tenantId('tenant-a'), name: 'Acme Media' });
  const shellView = await expectShellView(
    createInMemoryAppShellPort({ identityRepository: identity, tenantId: 'tenant-a', workspaceId: null }),
  );

  assert.deepEqual(
    shellView.sections.map((section) => section.id),
    ['home', 'missions', 'studio', 'lab', 'connections'],
    'Home and Missions are first (UX-001), Studio third (UX-002); the plan\'s section order follows',
  );
  const home = shellView.sections[0];
  const missions = shellView.sections[1];
  const studio = shellView.sections[2];
  assert.equal(home?.route, '/');
  assert.deepEqual(home?.availability, { kind: 'available' });
  assert.equal(missions?.route, '/missions');
  assert.deepEqual(missions?.availability, { kind: 'available' });
  assert.equal(studio?.route, '/studio');
  assert.deepEqual(
    studio?.availability,
    { kind: 'available' },
    'UX-002 turned the Studio section on — STUDIO-014 is delivered',
  );
});

test('later surfaces are explicit not-yet-available verdicts naming their dependency', async () => {
  const identity = createInMemoryIdentityRepository();
  identity.createTenant({ id: tenantId('tenant-a'), name: 'Acme Media' });
  const shellView = await expectShellView(
    createInMemoryAppShellPort({ identityRepository: identity, tenantId: 'tenant-a', workspaceId: null }),
  );

  for (const section of shellView.sections.slice(3)) {
    assert.equal(section?.availability.kind, 'not-yet-available');
    if (section?.availability.kind === 'not-yet-available') {
      assert.equal(section.availability.dependsOn.length > 0, true);
    }
  }
  const lab = shellView.sections.find((section) => section.id === 'lab');
  assert.equal(lab?.availability.kind === 'not-yet-available' && /UX-003/.test(lab.availability.dependsOn), true);
  const connections = shellView.sections.find((section) => section.id === 'connections');
  assert.equal(
    connections?.availability.kind === 'not-yet-available' && /UX-004/.test(connections.availability.dependsOn),
    true,
  );
});

test('tenant context is derived from the REAL identity records', async () => {
  const identity = createInMemoryIdentityRepository();
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
    createInMemoryAppShellPort({ identityRepository: identity, tenantId: 'tenant-a', workspaceId: 'ws-1' }),
  );
  assert.deepEqual(shellView.tenant, {
    tenantId: tenantId('tenant-a'),
    tenantDisplayName: 'Acme Media',
    workspaceId: 'ws-1' as never,
    workspaceDisplayName: 'Growth Studio',
  });
});

test('a tenant scope without a workspace presents the tenant with no workspace', async () => {
  const identity = createInMemoryIdentityRepository();
  identity.createTenant({ id: tenantId('tenant-a'), name: 'Acme Media' });
  const shellView = await expectShellView(
    createInMemoryAppShellPort({ identityRepository: identity, tenantId: 'tenant-a', workspaceId: null }),
  );
  assert.deepEqual(shellView.tenant, {
    tenantId: tenantId('tenant-a'),
    tenantDisplayName: 'Acme Media',
    workspaceId: null,
    workspaceDisplayName: null,
  });
});

test('an unknown workspace id degrades to a null workspace display name, honestly', async () => {
  const identity = createInMemoryIdentityRepository();
  identity.createTenant({ id: tenantId('tenant-a'), name: 'Acme Media' });
  const shellView = await expectShellView(
    createInMemoryAppShellPort({ identityRepository: identity, tenantId: 'tenant-a', workspaceId: 'ws-missing' }),
  );
  assert.equal(shellView.tenant?.workspaceId, 'ws-missing' as never);
  assert.equal(shellView.tenant?.workspaceDisplayName, null);
});

test('an unknown tenant resolves to NO tenant context (no existence leak)', async () => {
  const identity = createInMemoryIdentityRepository();
  identity.createTenant({ id: tenantId('tenant-a'), name: 'Acme Media' });
  const shellView = await expectShellView(
    createInMemoryAppShellPort({ identityRepository: identity, tenantId: 'tenant-ghost', workspaceId: null }),
  );
  assert.equal(shellView.tenant, null);
});
