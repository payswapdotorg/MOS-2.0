import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createInMemoryArtifactRepository } from './in-memory-artifact-repository.js';
import type {
  ArtifactGraph,
  ArtifactRepository,
  RegisterArtifactVersionInput,
} from '../ports/artifact-repository.js';
import type { Artifact, ArtifactId, ArtifactRef, ArtifactType, StorageRef } from '../contracts/artifact.js';
import type { ProvenanceRef, RightsGrant, RightsRef } from '@mos/rights';
import type { IdentityId, TenantId } from '@mos/identity';

const tenantId = (value: string): TenantId => value as TenantId;
const identityId = (value: string): IdentityId => value as IdentityId;
const rightsRef = (value: string): RightsRef => value as RightsRef;
const provenanceRef = (value: string): ProvenanceRef => value as ProvenanceRef;
const artifactId = (value: string): ArtifactId => value as ArtifactId;
const artifactType = (value: string): ArtifactType => value as ArtifactType;
const storageRef = (value: string): StorageRef => value as StorageRef;

const digest = (hex: string): ReturnType<typeof sha> => sha(hex);
const sha = (hex: string) => `sha256:${hex.padEnd(64, '0').slice(0, 64)}` as Artifact['digest'];
/** Valid lowercase-hex digest material derived from an arbitrary string. */
const hexOf = (value: string): string =>
  [...value]
    .map((ch) => ch.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('')
    .padEnd(64, '0')
    .slice(0, 64);

const NOW = '2026-06-01T00:00:00.000Z';

const activeGrant = (id: string, overrides: Partial<RightsGrant> = {}): RightsGrant => ({
  id: rightsRef(id),
  tenantId: tenantId('tenant-a'),
  version: 1,
  scope: {
    actions: ['use', 'transform'],
    subjectRefs: ['https://cdn.example.com/video-123.mp4'],
  },
  grantee: identityId('identity-1'),
  sourceRefs: ['license://creator-v2/doc-9'],
  terms: {
    attributionRequired: true,
    commercialUseAllowed: false,
    derivationAllowed: false,
    notes: null,
  },
  grantedAt: '2026-01-01T00:00:00.000Z',
  expiresAt: null,
  revokedAt: null,
  ...overrides,
});

/**
 * DISCLOSED STRUCTURAL TEST DOUBLE for the injected rights source: implements
 * the `Pick<RightsRepository, 'getRights'>` view consumed by the adapter's
 * rights gate. A real `@mos/rights` repository satisfies the same shape at
 * the composition root; @mos/rights is imported type-only in this package.
 */
const rightsWith = (...grants: RightsGrant[]) => ({
  getRights: (ref: RightsRef): RightsGrant | null =>
    grants.find((grant) => grant.id === ref) ?? null,
});

const repoWith = (grants: RightsGrant[]) =>
  createInMemoryArtifactRepository({ rights: rightsWith(...grants), now: () => NOW });

const draft = (overrides: {
  id: string;
  lineage?: readonly ArtifactRef[];
  type?: string;
  storageRef?: string;
  digestHex?: string;
  rights?: string;
  provenance?: string;
}) => {
  const digestHex = overrides.digestHex ?? hexOf(overrides.id);
  return {
    id: artifactId(overrides.id),
    type: artifactType(overrides.type ?? 'video/mp4'),
    digest: digest(digestHex),
    storageRef: storageRef(
      overrides.storageRef ?? `mem://tenant-a/${digest(digestHex)}`,
    ),
    provenanceRef: provenanceRef(overrides.provenance ?? `prov-${overrides.id}`),
    rightsRef: rightsRef(overrides.rights ?? 'grant-1'),
    lineage: overrides.lineage ?? [],
    creationMethod: 'transform' as const,
  };
};

const refOf = (artifact: Artifact): ArtifactRef => ({
  artifactId: artifact.id,
  version: artifact.version,
  tenantId: artifact.tenantId,
  digest: artifact.digest,
  type: artifact.type,
  storageRef: artifact.storageRef,
  rightsRef: artifact.rightsRef,
  provenanceRef: artifact.provenanceRef,
});

const register = (
  repo: ArtifactRepository & ArtifactGraph,
  input: Parameters<ArtifactRepository['registerArtifact']>[0],
): Artifact => {
  const result = repo.registerArtifact(input);
  if ('error' in result) {
    assert.fail(`unexpected repository error: ${result.error} — ${result.message}`);
  }
  return result;
};

test('registration round-trips a frozen version-1 record', () => {
  const repo = repoWith([activeGrant('grant-1')]);
  const record = register(repo, {
    scope: { tenantId: tenantId('tenant-a') },
    artifact: draft({ id: 'art-1' }),
  });
  assert.equal(record.version, 1);
  assert.equal(record.tenantId, tenantId('tenant-a'));
  assert.deepEqual(record.lineage, []);
  assert.ok(Object.isFrozen(record));
  assert.ok(Object.isFrozen(record.lineage));

  const fetched = repo.getArtifact({ tenantId: tenantId('tenant-a') }, artifactId('art-1'));
  assert.ok(fetched !== null);
  assert.deepEqual(fetched, record);
  assert.equal(repo.getArtifact({ tenantId: tenantId('tenant-a') }, artifactId('nope')), null);
});

test('CRITICAL: registration is denied with no-explicit-grant when the rightsRef resolves to nothing', () => {
  const repo = repoWith([activeGrant('grant-other')]);
  // The storageRef is a perfectly public, reachable-looking URL — and the
  // gate still denies: URL accessibility NEVER implies rights (CORE-004).
  const denied = repo.registerArtifact({
    scope: { tenantId: tenantId('tenant-a') },
    artifact: draft({
      id: 'art-public',
      storageRef: 'https://cdn.example.com/public-video.mp4',
      rights: 'grant-missing',
    }),
  });
  assert.ok('error' in denied);
  assert.equal(denied.error, 'no-explicit-grant');
  assert.match(denied.message, /never implies rights/);
  assert.equal(repo.getArtifact({ tenantId: tenantId('tenant-a') }, artifactId('art-public')), null);
});

test('CRITICAL: revoked and expired grants deny registration', () => {
  const repo = repoWith([
    activeGrant('grant-revoked', { revokedAt: '2026-02-01T00:00:00.000Z', version: 2 }),
    activeGrant('grant-expired', { expiresAt: '2026-05-01T00:00:00.000Z' }),
    activeGrant('grant-foreign', { tenantId: tenantId('tenant-b') }),
    activeGrant('grant-ok'),
  ]);

  const revoked = repo.registerArtifact({
    scope: { tenantId: tenantId('tenant-a') },
    artifact: draft({ id: 'art-r', rights: 'grant-revoked' }),
  });
  assert.ok('error' in revoked && revoked.error === 'rights-grant-revoked');

  const expired = repo.registerArtifact({
    scope: { tenantId: tenantId('tenant-a') },
    artifact: draft({ id: 'art-e', rights: 'grant-expired' }),
  });
  assert.ok('error' in expired && expired.error === 'rights-grant-expired');

  const foreign = repo.registerArtifact({
    scope: { tenantId: tenantId('tenant-a') },
    artifact: draft({ id: 'art-f', rights: 'grant-foreign' }),
  });
  assert.ok('error' in foreign && foreign.error === 'rights-grant-tenant-mismatch');

  // Same input with the ACTIVE grant passes: the explicit grant is the
  // difference, never the storageRef's accessibility.
  const ok = repo.registerArtifact({
    scope: { tenantId: tenantId('tenant-a') },
    artifact: draft({
      id: 'art-ok',
      storageRef: 'https://cdn.example.com/public-video.mp4',
      rights: 'grant-ok',
    }),
  });
  assert.ok(!('error' in ok));
});

test('version chains: new versions link predecessors; old versions never mutate', () => {
  const repo = repoWith([activeGrant('grant-1')]);
  const v1 = register(repo, {
    scope: { tenantId: tenantId('tenant-a') },
    artifact: draft({ id: 'art-1', digestHex: '11' }),
  });
  const v1Snapshot = { ...v1, lineage: v1.lineage.map((ref) => ({ ...ref })) };

  const versionInput: RegisterArtifactVersionInput = {
    scope: { tenantId: tenantId('tenant-a') },
    id: artifactId('art-1'),
    type: artifactType('video/mp4'),
    digest: digest('22'),
    storageRef: storageRef(`mem://tenant-a/${digest('22')}`),
    provenanceRef: provenanceRef('prov-art-1-v2'),
    rightsRef: rightsRef('grant-1'),
    additionalParents: [],
    creationMethod: 'transform',
  };
  const v2 = repo.registerArtifactVersion(versionInput);
  if ('error' in v2) {
    assert.fail(`unexpected repository error: ${v2.error} — ${v2.message}`);
  }
  assert.equal(v2.version, 2);
  assert.deepEqual(v2.lineage, [refOf(v1)]);

  // The predecessor record is byte-identical to its pre-registration snapshot.
  const fetchedV1 = repo.getArtifact({ tenantId: tenantId('tenant-a') }, artifactId('art-1'), 1);
  assert.ok(fetchedV1 !== null);
  assert.deepEqual(fetchedV1, v1Snapshot);

  // Latest-version lookup returns v2; explicit version lookup still hits v1.
  const latest = repo.getArtifact({ tenantId: tenantId('tenant-a') }, artifactId('art-1'));
  assert.ok(latest !== null && latest.version === 2);
  assert.equal(repo.listArtifacts({ tenantId: tenantId('tenant-a') }).length, 1);

  // Later versions are descendants of earlier versions (chain is lineage).
  const descendants = repo.getDescendants({ tenantId: tenantId('tenant-a') }, artifactId('art-1'), 1);
  assert.ok(!('error' in descendants));
  assert.deepEqual(descendants.map((ref) => ref.version), [2]);
});

test('mutating a returned record is impossible (frozen by construction)', () => {
  const repo = repoWith([activeGrant('grant-1')]);
  const record = register(repo, {
    scope: { tenantId: tenantId('tenant-a') },
    artifact: draft({ id: 'art-1' }),
  });
  assert.throws(() => {
    (record as { digest?: string }).digest = 'sha256:00';
  }, /Cannot assign to read only property/);
  assert.throws(() => {
    (record.lineage as unknown as { push: (x: unknown) => number }).push(refOf(record));
  }, /Cannot add property/);
});

test('the port exposes no update/delete: the runtime method set is exactly the port', () => {
  const repo = repoWith([activeGrant('grant-1')]);
  assert.deepEqual(Object.keys(repo).sort(), [
    'getAncestors',
    'getArtifact',
    'getDescendants',
    'listArtifacts',
    'registerArtifact',
    'registerArtifactVersion',
  ]);
});

test('lineage a→b→c: ancestors and descendants are transitive and deterministic', () => {
  const repo = repoWith([activeGrant('grant-1')]);
  const a = register(repo, {
    scope: { tenantId: tenantId('tenant-a') },
    artifact: { ...draft({ id: 'art-a', digestHex: 'aa' }), creationMethod: 'acquisition' },
  });
  const b = register(repo, {
    scope: { tenantId: tenantId('tenant-a') },
    artifact: { ...draft({ id: 'art-b', digestHex: 'bb' }), lineage: [refOf(a)] },
  });
  const c = register(repo, {
    scope: { tenantId: tenantId('tenant-a') },
    artifact: {
      ...draft({ id: 'art-c', digestHex: 'cc' }),
      lineage: [refOf(b)],
      creationMethod: 'composition',
    },
  });

  const ancestorsOfC = repo.getAncestors({ tenantId: tenantId('tenant-a') }, c.id);
  assert.ok(!('error' in ancestorsOfC));
  assert.deepEqual(ancestorsOfC.map((ref) => ref.artifactId), [
    artifactId('art-a'),
    artifactId('art-b'),
  ]);

  const ancestorsOfB = repo.getAncestors({ tenantId: tenantId('tenant-a') }, b.id);
  assert.ok(!('error' in ancestorsOfB));
  assert.deepEqual(ancestorsOfB.map((ref) => ref.artifactId), [artifactId('art-a')]);

  const ancestorsOfA = repo.getAncestors({ tenantId: tenantId('tenant-a') }, a.id);
  assert.ok(!('error' in ancestorsOfA));
  assert.deepEqual(ancestorsOfA, []);

  const descendantsOfA = repo.getDescendants({ tenantId: tenantId('tenant-a') }, a.id);
  assert.ok(!('error' in descendantsOfA));
  assert.deepEqual(descendantsOfA.map((ref) => ref.artifactId), [
    artifactId('art-b'),
    artifactId('art-c'),
  ]);

  const descendantsOfC = repo.getDescendants({ tenantId: tenantId('tenant-a') }, c.id);
  assert.ok(!('error' in descendantsOfC));
  assert.deepEqual(descendantsOfC, []);
});

test('diamond lineage is deduplicated in ancestor queries', () => {
  const repo = repoWith([activeGrant('grant-1')]);
  const a = register(repo, {
    scope: { tenantId: tenantId('tenant-a') },
    artifact: draft({ id: 'art-a', digestHex: 'aa' }),
  });
  const b = register(repo, {
    scope: { tenantId: tenantId('tenant-a') },
    artifact: { ...draft({ id: 'art-b', digestHex: 'bb' }), lineage: [refOf(a)] },
  });
  const c = register(repo, {
    scope: { tenantId: tenantId('tenant-a') },
    artifact: { ...draft({ id: 'art-c', digestHex: 'cc' }), lineage: [refOf(a)] },
  });
  const d = register(repo, {
    scope: { tenantId: tenantId('tenant-a') },
    artifact: {
      ...draft({ id: 'art-d', digestHex: 'dd' }),
      lineage: [refOf(b), refOf(c)],
      creationMethod: 'composition',
    },
  });

  const ancestors = repo.getAncestors({ tenantId: tenantId('tenant-a') }, d.id);
  assert.ok(!('error' in ancestors));
  // a appears once despite being reachable through both b and c.
  assert.deepEqual(
    ancestors.map((ref) => ref.artifactId),
    [artifactId('art-a'), artifactId('art-b'), artifactId('art-c')],
  );
});

test('unknown parents and cross-tenant parents are rejected', () => {
  const repo = repoWith([activeGrant('grant-1')]);
  const unknownParent = repo.registerArtifact({
    scope: { tenantId: tenantId('tenant-a') },
    artifact: {
      ...draft({ id: 'art-x' }),
      lineage: [
        {
          artifactId: artifactId('art-ghost'),
          version: 1 as ArtifactRef['version'],
          tenantId: tenantId('tenant-a'),
          digest: digest('ff'),
          type: artifactType('video/mp4'),
          storageRef: storageRef('mem://tenant-a/x'),
          rightsRef: rightsRef('grant-1'),
          provenanceRef: provenanceRef('prov-x'),
        },
      ],
    },
  });
  assert.ok('error' in unknownParent && unknownParent.error === 'unknown-parent');

  // Register a tenant-B artifact in the SAME repository, then try to use it
  // as a parent for a tenant-A artifact.
  const repoBoth = repoWith([
    activeGrant('grant-1'),
    activeGrant('grant-b', { tenantId: tenantId('tenant-b') }),
  ]);
  const foreign = register(repoBoth, {
    scope: { tenantId: tenantId('tenant-b') },
    artifact: draft({ id: 'art-b-only', rights: 'grant-b' }),
  });
  const crossTenant = repoBoth.registerArtifact({
    scope: { tenantId: tenantId('tenant-a') },
    artifact: { ...draft({ id: 'art-y' }), lineage: [refOf(foreign)] },
  });
  assert.ok('error' in crossTenant && crossTenant.error === 'cross-tenant-reference');
});

test('duplicate artifact ids are rejected; drafts with bad digests are invalid-input', () => {
  const repo = repoWith([activeGrant('grant-1')]);
  assert.ok(
    !('error' in register(repo, { scope: { tenantId: tenantId('tenant-a') }, artifact: draft({ id: 'art-1' }) })),
  );
  const duplicate = repo.registerArtifact({
    scope: { tenantId: tenantId('tenant-a') },
    artifact: draft({ id: 'art-1' }),
  });
  assert.ok('error' in duplicate && duplicate.error === 'duplicate-artifact');

  const badDigest = repo.registerArtifact({
    scope: { tenantId: tenantId('tenant-a') },
    artifact: draft({ id: 'art-bad', digestHex: 'not-hex' }),
  });
  assert.ok('error' in badDigest && badDigest.error === 'invalid-input');

  const blankRef = repo.registerArtifact({
    scope: { tenantId: tenantId('tenant-a') },
    artifact: { ...draft({ id: 'art-blank' }), storageRef: storageRef('   ') },
  });
  assert.ok('error' in blankRef && blankRef.error === 'invalid-input');
});

test('tenant scoping: cross-tenant reads miss silently; lists never leak', () => {
  const repo = repoWith([activeGrant('grant-1')]);
  const record = register(repo, {
    scope: { tenantId: tenantId('tenant-a') },
    artifact: draft({ id: 'art-1' }),
  });

  // Cross-tenant read is indistinguishable from unknown (no existence leak).
  assert.equal(repo.getArtifact({ tenantId: tenantId('tenant-b') }, record.id), null);
  assert.deepEqual(repo.listArtifacts({ tenantId: tenantId('tenant-b') }), []);
  assert.deepEqual(repo.listArtifacts({ tenantId: tenantId('tenant-unknown') }), []);

  const graphMiss = repo.getAncestors({ tenantId: tenantId('tenant-b') }, record.id);
  assert.ok('error' in graphMiss && graphMiss.error === 'artifact-not-found');

  // Extending another tenant's artifact chain is an explicit denial.
  const crossExtend = repo.registerArtifactVersion({
    scope: { tenantId: tenantId('tenant-b') },
    id: artifactId('art-1'),
    type: artifactType('video/mp4'),
    digest: digest('22'),
    storageRef: storageRef('mem://tenant-b/x'),
    provenanceRef: provenanceRef('prov-x'),
    rightsRef: rightsRef('grant-1'),
    additionalParents: [],
    creationMethod: 'transform',
  });
  assert.ok('error' in crossExtend && crossExtend.error === 'cross-tenant-reference');
});

test('object-store refs: records carry storageRef STRINGS, never media bytes', () => {
  const repo = repoWith([activeGrant('grant-1')]);
  const record = register(repo, {
    scope: { tenantId: tenantId('tenant-a') },
    artifact: {
      ...draft({ id: 'art-1' }),
      storageRef: storageRef('https://objects.example.com/tenant-a/clip-77.mp4'),
    },
  });
  assert.equal(typeof record.storageRef, 'string');
  // No byte array ever appears anywhere in the record tree.
  const serialized = JSON.stringify(record);
  assert.match(serialized, /storageRef/);
  assert.ok(!serialized.includes('Uint8Array'));
  assert.ok(record.lineage.every((ref) => typeof ref.storageRef === 'string'));
});

test('raw human capture enters the graph as a first-class record (never silently final)', () => {
  const repo = repoWith([activeGrant('grant-1')]);
  const raw = register(repo, {
    scope: { tenantId: tenantId('tenant-a') },
    artifact: {
      ...draft({ id: 'art-raw', digestHex: 'ab' }),
      storageRef: storageRef('mem://tenant-a/capture-session-77.wav'),
      creationMethod: 'raw-capture',
    },
  });
  assert.equal(raw.creationMethod, 'raw-capture');
  assert.deepEqual(raw.lineage, []);

  const treated = repo.registerArtifactVersion({
    scope: { tenantId: tenantId('tenant-a') },
    id: artifactId('art-raw'),
    type: artifactType('audio/wav'),
    digest: digest('cd'),
    storageRef: storageRef('mem://tenant-a/treated.wav'),
    provenanceRef: provenanceRef('prov-treated'),
    rightsRef: rightsRef('grant-1'),
    additionalParents: [],
    creationMethod: 'transform',
  });
  if ('error' in treated) {
    assert.fail(`unexpected repository error: ${treated.error} — ${treated.message}`);
  }
  // The raw capture is preserved as the predecessor of its treatment.
  assert.deepEqual(treated.lineage.map((ref) => ref.version), [1]);
  assert.ok(!('error' in repo.getAncestors({ tenantId: tenantId('tenant-a') }, artifactId('art-raw'))));
});
