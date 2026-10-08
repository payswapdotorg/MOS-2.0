/**
 * TENANT-ID GRAMMAR ENFORCEMENT BATTERY (W11-B) — the authority choke point.
 *
 * Pins docs/architecture/TENANT-ID-GRAMMAR-ACR-v1.md §3/§5 at the REAL
 * `createTenant` seam of the in-memory identity adapter:
 *
 *  - valid ids are accepted (the happy path never regressed);
 *  - every W9-B D1/D2 attack shape is REJECTED at the authority with the
 *    typed `invalid-tenant-id` error (fail-closed, nothing recorded) —
 *    `:`, `::`, `|`, NUL, empty, whitespace, uppercase, unicode, underscore,
 *    over-length, leading hyphen;
 *  - the rejection is §30-attributable: machine-readable code + a message
 *    that names the grammar and the ACR;
 *  - grammar precedes the duplicate check (the authority never re-admits an
 *    invalid id, not even one equal to a grandfathered row) and precedes the
 *    blank-name check;
 *  - reads NEVER validate ids (grandfathering-compatible: a hostile id at
 *    read time is a plain miss — no existence leak, no error);
 *  - grandfathered (pre-grammar) tenants keep resolving forever: getTenant,
 *    createWorkspace, listWorkspaces, grantMembership all keep working under
 *    legacy hostile ids, the stored rows are immutable, and a failed
 *    re-create attempt never evicts them.
 *
 * The ADAPTER-layer half of the defense (JSON-array composite keys,
 * exact-equality listings under hostile ids cast directly at adapters,
 * bypassing identity) is pinned by the w9b/w10b probe batteries in the
 * sibling packages — two independent layers, both load-bearing. See ACR §6.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createInMemoryIdentityRepository } from './in-memory-identity-repository.js';
import type { IdentityId, MembershipId, TenantId, WorkspaceId } from '../domain/ids.js';
import type { IdentityRepositoryError } from '../ports/identity-repository.js';

const tenantId = (value: string): TenantId => value as TenantId;
const workspaceId = (value: string): WorkspaceId => value as WorkspaceId;
const identityId = (value: string): IdentityId => value as IdentityId;
const membershipId = (value: string): MembershipId => value as MembershipId;

const expectRejected = (
  result: unknown,
  label: string,
): IdentityRepositoryError => {
  if (!('error' in (result as object))) {
    assert.fail(`${label}: expected a typed rejection, got: ${JSON.stringify(result)}`);
  }
  return result as IdentityRepositoryError;
};

test('W11-B: valid tenant ids are accepted at the authority choke point', () => {
  const repo = createInMemoryIdentityRepository();
  const valid = [
    'a',
    '0',
    'tenant-a',
    't1',
    'lab-018-tenant',
    'a'.repeat(64),
    '9lives',
    'tenant-with-hyphens',
  ];
  for (const id of valid) {
    const created = repo.createTenant({ id: tenantId(id), name: `name-${id.slice(0, 8)}` });
    if ('error' in created) {
      assert.fail(`expected valid id to be accepted: ${JSON.stringify(id)} — ${created.message}`);
    }
    assert.equal(created.id, id);
    assert.equal(repo.getTenant(tenantId(id))?.id, id);
  }
});

test('W11-B: every D1/D2 attack shape is rejected at the authority with typed invalid-tenant-id', () => {
  const repo = createInMemoryIdentityRepository();
  // Every delimiter actually used by a W9-B fixed composite-key surface, plus
  // the degenerate/confusion shapes the grammar also collapses.
  const hostile = [
    'tenant:a', // ':' — mos-engines/mos-jobs composite-key delimiter
    'a::b', // '::' — engines assignment-lane key delimiter
    'a|b', // '|' — distribution replay-ledger delimiter
    'a\u0000b', // NUL — lab/integrations/production composite-key delimiter
    'tenant-a\u0000x', // the exact W9-B hostile-id-factory shape
    '\u0000tenant', // leading NUL
    '', // empty
    ' ', // whitespace only
    'a b', // inner space
    'a\tb', // tab
    ' tenant-a', // leading space
    'tenant-a ', // trailing space
    'A', // uppercase
    'Tenant-A', // mixed case
    'TENANT-A', // full uppercase
    'ténant', // latin-1 diacritic
    '租户', // CJK
    'tenant🙂', // astral-plane emoji
    'tenant_demo', // underscore (the migrated mos-web demo shape)
    '-a', // leading hyphen
    'a'.repeat(65), // over-length
    'a'.repeat(1000), // absurdly over-length
  ];
  for (const id of hostile) {
    const rejected = expectRejected(
      repo.createTenant({ id: tenantId(id), name: 'Hostile Tenant' }),
      `id ${JSON.stringify(id)}`,
    );
    assert.equal(rejected.error, 'invalid-tenant-id', `typed code for ${JSON.stringify(id)}`);
    // Nothing recorded: the rejected id never became a tenant.
    assert.equal(repo.getTenant(tenantId(id)), null, `nothing recorded for ${JSON.stringify(id)}`);
  }
  // The store is not polluted by the rejections: a conforming create works.
  const ok = repo.createTenant({ id: tenantId('tenant-clean'), name: 'Clean' });
  assert.ok(!('error' in ok));
});

test('W11-B: the rejection is §30-attributable — machine-readable code, message names the grammar and the ACR', () => {
  const repo = createInMemoryIdentityRepository();
  const rejected = expectRejected(
    repo.createTenant({ id: tenantId('tenant:a'), name: 'Hostile' }),
    'colon id',
  );
  assert.equal(rejected.error, 'invalid-tenant-id');
  assert.match(rejected.message, /\^\[a-z0-9\]\[a-z0-9-\]\{0,63\}\$/);
  assert.match(rejected.message, /TENANT-ID-GRAMMAR-ACR-v1\.md/);
  // The offending id is embedded JSON-escaped (a NUL shows as \u0000 — the
  // record never carries a raw control character).
  const nulRejected = expectRejected(
    repo.createTenant({ id: tenantId('a\u0000b'), name: 'Hostile' }),
    'NUL id',
  );
  assert.match(nulRejected.message, /a\\u0000b/);
});

test('W11-B: grammar precedes the duplicate check — a conforming id still gets duplicate-tenant, a hostile id never re-enters', () => {
  const repo = createInMemoryIdentityRepository();
  const first = repo.createTenant({ id: tenantId('tenant-a'), name: 'First' });
  assert.ok(!('error' in first));
  // Conforming re-create: the duplicate discipline is unchanged.
  const duplicate = expectRejected(
    repo.createTenant({ id: tenantId('tenant-a'), name: 'Second' }),
    'conforming duplicate',
  );
  assert.equal(duplicate.error, 'duplicate-tenant');
  // Hostile id that happens to collide with nothing: grammar rejection.
  const hostile = expectRejected(
    repo.createTenant({ id: tenantId('tenant-a:evil'), name: 'Hostile' }),
    'hostile collision shape',
  );
  assert.equal(hostile.error, 'invalid-tenant-id');
});

test('W11-B: grammar precedes the blank-name check (order pinned)', () => {
  const repo = createInMemoryIdentityRepository();
  // Hostile id + blank name → the grammar rejection wins (fail closed on the
  // authority key first).
  const hostile = expectRejected(
    repo.createTenant({ id: tenantId('a:b'), name: '   ' }),
    'hostile id + blank name',
  );
  assert.equal(hostile.error, 'invalid-tenant-id');
  // Valid id + blank name → the pre-existing blank-name discipline is unchanged.
  const blank = expectRejected(
    repo.createTenant({ id: tenantId('tenant-a'), name: '   ' }),
    'blank name',
  );
  assert.equal(blank.error, 'invalid-input');
});

test('W11-B: reads never validate ids — a hostile id at read time is a plain miss (grandfathering-compatible, no existence leak)', () => {
  const repo = createInMemoryIdentityRepository();
  const ok = repo.createTenant({ id: tenantId('tenant-a'), name: 'A' });
  assert.ok(!('error' in ok));
  // Hostile scopes at read time answer like any unknown scope: null / empty,
  // never an error, never a leak.
  assert.equal(repo.getTenant(tenantId('a\u0000b')), null);
  assert.equal(repo.getTenant(tenantId('tenant-a:evil')), null);
  assert.deepEqual(repo.listWorkspaces({ tenantId: tenantId('a\u0000b') }), []);
  // And the conforming tenant is unaffected by hostile reads.
  assert.equal(repo.getTenant(tenantId('tenant-a'))?.name, 'A');
});

test('W11-B: grandfathered tenants keep resolving forever (append-only discipline — never rewrite history)', () => {
  const repo = createInMemoryIdentityRepository({
    grandfatheredTenants: [
      { id: tenantId('legacy\u0000tenant'), name: 'Legacy NUL Tenant' },
      { id: tenantId('legacy::colon'), name: 'Legacy Colon Tenant' },
      { id: tenantId('Legacy_Upper'), name: 'Legacy Upper Tenant' },
    ],
  });
  // All three legacy rows resolve verbatim.
  assert.equal(repo.getTenant(tenantId('legacy\u0000tenant'))?.name, 'Legacy NUL Tenant');
  assert.equal(repo.getTenant(tenantId('legacy::colon'))?.name, 'Legacy Colon Tenant');
  assert.equal(repo.getTenant(tenantId('Legacy_Upper'))?.name, 'Legacy Upper Tenant');

  // Workspaces + memberships still work under legacy scopes.
  const ws = repo.createWorkspace({
    scope: { tenantId: tenantId('legacy\u0000tenant') },
    id: workspaceId('ws-legacy'),
    name: 'Legacy Workspace',
  });
  assert.ok(!('error' in ws), `legacy workspace create must succeed: ${JSON.stringify(ws)}`);
  const user = repo.upsertIdentity({ id: identityId('identity-legacy'), displayName: 'Ada', kind: 'user' });
  assert.ok(!('error' in user));
  const granted = repo.grantMembership({
    scope: { tenantId: tenantId('legacy\u0000tenant') },
    id: membershipId('membership-legacy'),
    workspaceId: workspaceId('ws-legacy'),
    identityId: identityId('identity-legacy'),
    role: 'owner',
  });
  assert.ok(!('error' in granted), `legacy membership grant must succeed: ${JSON.stringify(granted)}`);
  assert.equal(repo.listWorkspaces({ tenantId: tenantId('legacy\u0000tenant') }).length, 1);
  assert.equal(
    repo.listMemberships({ tenantId: tenantId('legacy\u0000tenant'), workspaceId: workspaceId('ws-legacy') }).length,
    1,
  );

  // A re-create attempt with a legacy id fails GRAMMAR-FIRST — the authority
  // never re-admits an invalid id…
  const reCreate = expectRejected(
    repo.createTenant({ id: tenantId('legacy\u0000tenant'), name: 'Re-admission Attempt' }),
    'legacy re-create',
  );
  assert.equal(reCreate.error, 'invalid-tenant-id');
  // …and the failed attempt never evicted or rewrote the stored legacy row.
  const survivor = repo.getTenant(tenantId('legacy\u0000tenant'));
  assert.ok(survivor, 'the legacy row survives the failed re-create attempt');
  assert.equal(survivor.name, 'Legacy NUL Tenant');
  assert.equal(survivor.version, 1);

  // New tenants created AFTER the grandfathered seeds still enforce.
  const hostile = expectRejected(
    repo.createTenant({ id: tenantId('a|b'), name: 'Hostile' }),
    'new hostile create after grandfathering',
  );
  assert.equal(hostile.error, 'invalid-tenant-id');
  const clean = repo.createTenant({ id: tenantId('tenant-new'), name: 'New' });
  assert.ok(!('error' in clean));
});

test('W11-B: the w9b/w10b hostile-id probes stay valid — hostile ids remain REPRESENTABLE at the adapter layer (two independent layers)', () => {
  // The grammar gates the AUTHORITY (createTenant). It does not — and must
  // not — make hostile ids unrepresentable in the type system: a hostile
  // caller can still hand a delimiter-laden TenantScope to any adapter.
  // Layer 2 (the adapters' own injective-key/equality discipline, pinned by
  // the w9b/w10b probe batteries in engines/jobs/lab/integrations/
  // distribution/production/studio) stays load-bearing. This probe pins the
  // identity-side contract of that split: reads accept hostile scopes as
  // plain misses (above) and the authority never stores them — so a hostile
  // id that reaches an adapter can only have bypassed identity, exactly the
  // attack shape the w9b/w10b batteries defend.
  const repo = createInMemoryIdentityRepository();
  const hostileScope = { tenantId: tenantId('tenant-a\u0000x') } as const;
  // No error, no existence leak, no stored record — the identity authority
  // holds NOTHING under the hostile id…
  assert.equal(repo.getTenant(hostileScope.tenantId), null);
  assert.deepEqual(repo.listWorkspaces({ tenantId: hostileScope.tenantId }), []);
  // …and creating it is the one operation that fails closed, typed.
  const rejected = expectRejected(
    repo.createTenant({ id: hostileScope.tenantId, name: 'Never' }),
    'hostile create',
  );
  assert.equal(rejected.error, 'invalid-tenant-id');
});
