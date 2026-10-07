import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createInMemoryArtifactRepository } from '../adapters/in-memory-artifact-repository.js';
import type { ArtifactRef } from './artifact.js';
import type { RightsGrant, RightsRef } from '@mos/rights';
import type { IdentityId, TenantId } from '@mos/identity';

const tenantId = (value: string): TenantId => value as TenantId;
const identityId = (value: string): IdentityId => value as IdentityId;
const rightsRef = (value: string): RightsRef => value as RightsRef;

const digest = (hex: string) =>
  `sha256:${hex.padEnd(64, '0').slice(0, 64)}` as import('./artifact.js').ContentDigest;
const storageRef = (value: string) => value as import('./artifact.js').StorageRef;
const artifactType = (value: string) => value as import('./artifact.js').ArtifactType;
const artifactId = (value: string) => value as import('./artifact.js').ArtifactId;
const provenanceRef = (value: string) => value as import('@mos/rights').ProvenanceRef;

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

const rightsWith = (...grants: RightsGrant[]) => ({
  getRights: (ref: RightsRef): RightsGrant | null =>
    grants.find((grant) => grant.id === ref) ?? null,
});

test('registered Artifact carries EXACTLY the frozen YAML Artifact fields', () => {
  const repo = createInMemoryArtifactRepository({
    rights: rightsWith(activeGrant('grant-1')),
    now: () => '2026-06-01T00:00:00.000Z',
  });
  const registered = repo.registerArtifact({
    scope: { tenantId: tenantId('tenant-a') },
    artifact: {
      id: artifactId('art-1'),
      type: artifactType('video/mp4'),
      digest: digest('aa'),
      storageRef: storageRef('mem://tenant-a/sha256:aa'),
      provenanceRef: provenanceRef('prov-1'),
      rightsRef: rightsRef('grant-1'),
      lineage: [],
      creationMethod: 'acquisition',
    },
  });
  if ('error' in registered) {
    assert.fail(`unexpected repository error: ${registered.error} — ${registered.message}`);
  }
  // spec/contracts/core-contracts-v2.0.yaml Artifact.required, field-for-field:
  assert.deepEqual(Object.keys(registered).sort(), [
    'creationMethod',
    'digest',
    'id',
    'lineage',
    'provenanceRef',
    'rightsRef',
    'storageRef',
    'tenantId',
    'type',
    'version',
  ]);
});

test('lineage entries carry EXACTLY the frozen YAML ArtifactRef fields', () => {
  const repo = createInMemoryArtifactRepository({
    rights: rightsWith(activeGrant('grant-1')),
    now: () => '2026-06-01T00:00:00.000Z',
  });
  const root = repo.registerArtifact({
    scope: { tenantId: tenantId('tenant-a') },
    artifact: {
      id: artifactId('art-root'),
      type: artifactType('video/mp4'),
      digest: digest('aa'),
      storageRef: storageRef('mem://tenant-a/sha256:aa'),
      provenanceRef: provenanceRef('prov-1'),
      rightsRef: rightsRef('grant-1'),
      lineage: [],
      creationMethod: 'acquisition',
    },
  });
  if ('error' in root) {
    assert.fail(`unexpected repository error: ${root.error} — ${root.message}`);
  }
  const derived = repo.registerArtifact({
    scope: { tenantId: tenantId('tenant-a') },
    artifact: {
      id: artifactId('art-derived'),
      type: artifactType('video/mp4'),
      digest: digest('bb'),
      storageRef: storageRef('mem://tenant-a/sha256:bb'),
      provenanceRef: provenanceRef('prov-2'),
      rightsRef: rightsRef('grant-1'),
      lineage: [
        {
          artifactId: root.id,
          version: root.version,
          tenantId: root.tenantId,
          digest: root.digest,
          type: root.type,
          storageRef: root.storageRef,
          rightsRef: root.rightsRef,
          provenanceRef: root.provenanceRef,
        },
      ],
      creationMethod: 'transform',
    },
  });
  if ('error' in derived) {
    assert.fail(`unexpected repository error: ${derived.error} — ${derived.message}`);
  }

  const parentRef: ArtifactRef | undefined = derived.lineage[0];
  assert.ok(parentRef !== undefined);
  // spec/contracts/core-contracts-v2.0.yaml ArtifactRef.required, field-for-field:
  assert.deepEqual(Object.keys(parentRef).sort(), [
    'artifactId',
    'digest',
    'provenanceRef',
    'rightsRef',
    'storageRef',
    'tenantId',
    'type',
    'version',
  ]);
  assert.equal(parentRef.artifactId, artifactId('art-root'));
});
