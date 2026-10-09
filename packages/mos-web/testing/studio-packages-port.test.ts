/**
 * StudioPackageLibraryPort contract tests (UX-002) over the DISCLOSED
 * composition double (REAL-shaped STUDIO-014 package records through the
 * shared shape adapter).
 *
 * Pins: tenant-scoped package summaries; immutable version chains ascending
 * with treatment successors (§19 — every treatment a NEW linked version);
 * §14 synthetic-provenance disclosure per version AND per final artifact
 * (synthetic visibly labeled, human-only packages say so); §15 consent
 * coverage; §19 evaluation with §30 citation; §12 edit-graph record with
 * OTIO interchange; cross-tenant packages never leak (§31); typed failures
 * explicit.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { TenantScope } from '@mos/contracts';
import type { StudioPackageLibraryPort } from '../dist/src/ports/studio-packages.js';
import { createInMemoryStudioSurface } from './in-memory-studio-surface.js';

const DEMO_SCOPE: TenantScope = { tenantId: 'tenant-demo' as never, workspaceId: 'ws_demo' as never };
const OTHER_SCOPE: TenantScope = { tenantId: 'tenant-operator-other' as never };

const libraryOf = (): StudioPackageLibraryPort => createInMemoryStudioSurface().studioPackages;

test('the library lists tenant-scoped package summaries with chain shapes', async () => {
  const result = await libraryOf().listStudioPackages(DEMO_SCOPE);
  if ('error' in result) {
    assert.fail(`unexpected failure: ${result.error}`);
  }
  assert.equal(result.length, 2);
  const reaction = result.find((summary) => String(summary.packageId) === 'pkg-reaction-1');
  const podcast = result.find((summary) => String(summary.packageId) === 'pkg-podcast-3');
  assert.ok(reaction && podcast);
  assert.equal(reaction.latestVersion, 2);
  assert.equal(reaction.versionCount, 2);
  assert.equal(String(reaction.sessionRef), 'session-reaction-1');
  assert.equal(podcast.latestVersion, 1);
  assert.equal(podcast.versionCount, 1);
});

test('cross-tenant packages never leak into another scope (§31)', async () => {
  const demo = await libraryOf().listStudioPackages(DEMO_SCOPE);
  const other = await libraryOf().listStudioPackages(OTHER_SCOPE);
  if ('error' in demo || 'error' in other) {
    assert.fail('unexpected failure');
  }
  assert.equal(
    demo.some((summary) => String(summary.packageId) === 'pkg-other-1'),
    false,
  );
  assert.equal(other.length, 1);
  assert.equal(String(other[0]?.packageId), 'pkg-other-1');
});

test('the version chain is ascending and immutable (§19 treatment successors)', async () => {
  const chain = await libraryOf().loadStudioPackageChain('pkg-reaction-1' as never, DEMO_SCOPE);
  if ('error' in chain) {
    assert.fail(`unexpected failure: ${chain.error}`);
  }
  assert.deepEqual(chain.versions.map((version) => version.version), [1, 2]);
  // v2 is the trim treatment successor: a NEW final with a parent in the chain.
  const v2 = chain.versions[1];
  assert.ok(v2);
  assert.equal(v2.finalArtifacts[0]?.artifactId, 'final-reaction-pip-2' as never);
  assert.equal(v2.finalArtifacts[0]?.parentCount, 1, 'the successor carries immutable lineage');
  // v1's data is untouched by the successor's existence.
  const v1 = chain.versions[0];
  assert.ok(v1);
  assert.equal(v1.finalArtifacts[0]?.artifactId, 'final-reaction-pip-1' as never);
});

test('§14 synthetic provenance is disclosed per version and per final artifact', async () => {
  const chain = await libraryOf().loadStudioPackageChain('pkg-reaction-1' as never, DEMO_SCOPE);
  if ('error' in chain) {
    assert.fail('unexpected failure');
  }
  const v1 = chain.versions[0];
  assert.ok(v1);
  assert.equal(v1.provenance.containsSyntheticMaterial, true);
  const synthetic = v1.finalArtifacts.find((artifact) => String(artifact.artifactId) === 'final-reaction-intro-1');
  assert.ok(synthetic, 'the engine-generated final artifact is present');
  assert.equal(synthetic.creationMethod, 'engine-generated');
  assert.equal(synthetic.synthetic, true, '§14: synthetic material is labeled synthetic');
  const composed = v1.finalArtifacts.find((artifact) => String(artifact.artifactId) === 'final-reaction-pip-1');
  assert.ok(composed);
  assert.equal(composed.synthetic, false);
  assert.equal(composed.creationMethod, 'composition');
});

test('the human-only package discloses NO synthetic material (§14 truthful both ways)', async () => {
  const chain = await libraryOf().loadStudioPackageChain('pkg-podcast-3' as never, DEMO_SCOPE);
  if ('error' in chain) {
    assert.fail('unexpected failure');
  }
  const v1 = chain.versions[0];
  assert.ok(v1);
  assert.equal(v1.provenance.containsSyntheticMaterial, false);
  assert.equal(v1.finalArtifacts.every((artifact) => artifact.synthetic === false), true);
  assert.equal(v1.finalArtifacts[0]?.creationMethod, 'composition');
});

test('evaluation state carries the §19 outcome and the §30 citation', async () => {
  const chain = await libraryOf().loadStudioPackageChain('pkg-reaction-1' as never, DEMO_SCOPE);
  if ('error' in chain) {
    assert.fail('unexpected failure');
  }
  const v1 = chain.versions[0];
  const v2 = chain.versions[1];
  assert.ok(v1 && v2);
  assert.deepEqual(v1.evaluation, {
    status: 'evaluated',
    outcome: 'accepted',
    evaluationRef: 'mos-studio:review:1',
  });
  assert.deepEqual(v2.evaluation, {
    status: 'pending',
    outcome: 'treatment-requested',
    evaluationRef: null,
  });
});

test('consent coverage and §6 stage structure are visible per version', async () => {
  const chain = await libraryOf().loadStudioPackageChain('pkg-reaction-1' as never, DEMO_SCOPE);
  if ('error' in chain) {
    assert.fail('unexpected failure');
  }
  const v1 = chain.versions[0];
  assert.ok(v1);
  assert.equal(v1.consent.allRawArtifactsCovered, true);
  assert.equal(v1.consent.participantConsentCount, 3);
  assert.deepEqual(v1.artifactCounts, { raw: 2, intermediate: 1, final: 2 });
  assert.equal(v1.transcriptCount, 1);
  assert.equal(v1.provenance.lineageComplete, true);
  assert.equal(v1.provenance.provenanceRefCount, 5);
});

test('the §12 edit-graph record shows the OTIO interchange state', async () => {
  const reaction = await libraryOf().loadStudioPackageChain('pkg-reaction-1' as never, DEMO_SCOPE);
  const podcast = await libraryOf().loadStudioPackageChain('pkg-podcast-3' as never, DEMO_SCOPE);
  if ('error' in reaction || 'error' in podcast) {
    assert.fail('unexpected failure');
  }
  assert.equal(reaction.versions[0]?.editGraph.otioInterchange, true);
  assert.equal(podcast.versions[0]?.editGraph.otioInterchange, false);
  assert.equal(typeof reaction.versions[0]?.editGraph.graphId, 'string');
});

test('cost and duration are carried per version (§30-shaped presentation)', async () => {
  const chain = await libraryOf().loadStudioPackageChain('pkg-reaction-1' as never, DEMO_SCOPE);
  if ('error' in chain) {
    assert.fail('unexpected failure');
  }
  const v1 = chain.versions[0];
  assert.ok(v1);
  assert.deepEqual(v1.cost, { currency: 'USD', amount: '12.40' });
  assert.deepEqual(v1.durationSeconds, { capture: 720, processing: 3600, totalWallClock: 4400 });
});

test('an unknown package id is the explicit studio-package-not-found failure', async () => {
  const result = await libraryOf().loadStudioPackageChain('pkg-ghost' as never, DEMO_SCOPE);
  if (!('error' in result)) {
    assert.fail('expected a typed failure');
  }
  assert.equal(result.error, 'studio-package-not-found');
});

test('a cross-tenant package id is the SAME miss — no existence leak (§31)', async () => {
  const result = await libraryOf().loadStudioPackageChain('pkg-other-1' as never, DEMO_SCOPE);
  if (!('error' in result)) {
    assert.fail('expected a typed failure');
  }
  assert.equal(result.error, 'studio-package-not-found');
});

test('an injected listing failure is the explicit library-unavailable verdict', async () => {
  const result = await createInMemoryStudioSurface({ failListings: true }).studioPackages.listStudioPackages(
    DEMO_SCOPE,
  );
  if (!('error' in result)) {
    assert.fail('expected a typed failure');
  }
  assert.equal(result.error, 'studio-package-library-unavailable');
});
