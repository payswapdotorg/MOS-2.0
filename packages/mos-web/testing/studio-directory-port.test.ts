/**
 * StudioDirectoryPort contract tests (UX-002) over the DISCLOSED composition
 * double, which adapts REAL-shaped STUDIO-014 fixture records through the
 * shared shape adapter.
 *
 * Pins: the listing covers EVERY §13 lifecycle state with explicit tenant
 * context (§31); cross-tenant sessions never leak (§31); session detail
 * carries §15 multi-account participants with granted/pending/consent-
 * required states, the append-only lifecycle history, §30-attributable
 * review records (quality vs rights/policy rejections distinct), and the
 * §15 live re-resolution verdicts rendered as actionable consent-required
 * states; typed failures are explicit — never guessed data.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { TenantScope } from '@mos/contracts';
import { STUDIO_SESSION_LIFECYCLE_STATES } from '../dist/src/index.js';
import type {
  StudioDirectoryFailure,
  StudioDirectoryPort,
} from '../dist/src/ports/studio-directory.js';
import { createInMemoryStudioSurface } from './in-memory-studio-surface.js';

const DEMO_SCOPE: TenantScope = { tenantId: 'tenant-demo' as never, workspaceId: 'ws_demo' as never };
const OTHER_SCOPE: TenantScope = { tenantId: 'tenant-operator-other' as never };

const directoryOf = (): StudioDirectoryPort => createInMemoryStudioSurface().studioDirectory;

const expectSessions = async (
  port: StudioDirectoryPort,
  scope: TenantScope,
): Promise<Awaited<ReturnType<StudioDirectoryPort['listStudioSessions']>>> => {
  const result = await port.listStudioSessions(scope);
  if (result === null || typeof result !== 'object') {
    assert.fail('the directory must answer');
  }
  return result;
};

test('the directory lists sessions with explicit tenant context (§31)', async () => {
  const result = await expectSessions(directoryOf(), DEMO_SCOPE);
  if ('error' in result) {
    assert.fail(`unexpected failure: ${result.error}`);
  }
  assert.equal(result.length, 11, 'the demo scope sees exactly its fixture sessions');
  for (const session of result) {
    assert.equal(session.tenantId, 'tenant-demo' as never);
    assert.equal(typeof session.sessionId, 'string');
    assert.equal(typeof session.formatId, 'string');
    assert.equal(session.participantCount >= 0, true);
    assert.equal(typeof session.organizationRef.id, 'string');
    assert.equal(session.organizationRef.version >= 1, true);
  }
});

test('the listing covers EVERY §13 lifecycle state (honest variety)', async () => {
  const result = await expectSessions(directoryOf(), DEMO_SCOPE);
  if ('error' in result) {
    assert.fail('unexpected failure');
  }
  const states = new Set(result.map((session) => session.lifecycleState));
  for (const state of STUDIO_SESSION_LIFECYCLE_STATES) {
    assert.equal(states.has(state), true, `the fixture set must exercise ${state}`);
  }
});

test('the listing is ascending by creation (the authority ordering)', async () => {
  const result = await expectSessions(directoryOf(), DEMO_SCOPE);
  if ('error' in result) {
    assert.fail('unexpected failure');
  }
  for (let index = 1; index < result.length; index += 1) {
    const previous = result[index - 1] as { createdAt: string };
    const current = result[index] as { createdAt: string };
    assert.equal(
      previous.createdAt <= current.createdAt,
      true,
      'sessions list ascending by createdAt',
    );
  }
});

test('cross-tenant sessions never leak into another scope (§31)', async () => {
  const demo = await expectSessions(directoryOf(), DEMO_SCOPE);
  const other = await expectSessions(directoryOf(), OTHER_SCOPE);
  if ('error' in demo || 'error' in other) {
    assert.fail('unexpected failure');
  }
  assert.equal(
    demo.some((session) => String(session.sessionId) === 'session-other-1'),
    false,
    'the other tenant session is not in the demo listing',
  );
  assert.equal(other.length, 1);
  assert.equal(String(other[0]?.sessionId), 'session-other-1');
});

test('the packaged session carries its artifact package ref; others show none', async () => {
  const result = await expectSessions(directoryOf(), DEMO_SCOPE);
  if ('error' in result) {
    assert.fail('unexpected failure');
  }
  const packaged = result.find((session) => session.lifecycleState === 'packaged');
  assert.ok(packaged);
  assert.deepEqual(packaged.artifactPackageRef, {
    packageId: 'pkg-reaction-1' as never,
    version: 2 as never,
  });
  const requested = result.find((session) => session.lifecycleState === 'requested');
  assert.ok(requested);
  assert.equal(requested.artifactPackageRef, null);
});

test('session detail carries participants with §15 account boundaries and consent states', async () => {
  const port = directoryOf();
  const detail = await port.loadStudioSessionDetail('session-podcast-1' as never, DEMO_SCOPE);
  if ('error' in detail) {
    assert.fail(`unexpected failure: ${detail.error}`);
  }
  assert.equal(detail.participants.length, 2);
  assert.equal(detail.participants[0]?.consentState, 'granted');
  assert.equal(detail.participants[1]?.consentState, 'pending');
  for (const participant of detail.participants) {
    assert.equal(typeof participant.accountRef, 'string', '§15: the account boundary is explicit');
    assert.equal(typeof participant.identityRef, 'string');
    assert.ok(Array.isArray(participant.consentRefs));
  }
});

test('the multi-account capturing session shows two distinct account boundaries (§15)', async () => {
  const port = directoryOf();
  const detail = await port.loadStudioSessionDetail('session-video-1' as never, DEMO_SCOPE);
  if ('error' in detail) {
    assert.fail('unexpected failure');
  }
  const accounts = new Set(detail.participants.map((participant) => participant.accountRef));
  assert.equal(accounts.size, 2, 'credentials are never merged — two account boundaries');
});

test('§15 live re-resolution failure renders as the actionable consent-required state', async () => {
  const port = directoryOf();
  const detail = await port.loadStudioSessionDetail('session-reaction-4' as never, DEMO_SCOPE);
  if ('error' in detail) {
    assert.fail('unexpected failure');
  }
  assert.equal(detail.consentRequirements.length, 1);
  const requirement = detail.consentRequirements[0];
  assert.ok(requirement);
  assert.equal(requirement.subjectKind, 'imported-source');
  assert.equal(requirement.subjectIdentityRef, 'identity-source-holder-2');
  assert.equal(requirement.artifactId, 'raw-source-import-2');
  assert.deepEqual(requirement.consentRefs, ['consent-603']);
  assert.equal(
    requirement.message.includes('Consent no longer covers processing into artifacts'),
    true,
  );
  // Fail-closed honesty: the refused operator action left NO review record.
  assert.equal(detail.reviews.length, 0);
});

test('session detail reconstructs the append-only lifecycle history', async () => {
  const port = directoryOf();
  const detail = await port.loadStudioSessionDetail('session-podcast-3' as never, DEMO_SCOPE);
  if ('error' in detail) {
    assert.fail('unexpected failure');
  }
  assert.deepEqual(
    detail.transitions.map((transition) => `${transition.from}->${transition.to}`),
    [
      'requested->loading',
      'loading->capturing',
      'capturing->processing',
      'processing->review',
      'review->packaged',
      'packaged->closed',
    ],
  );
  assert.equal(detail.transitions[0]?.reason, 'organization-load-started');
});

test('§30-attributable review records render who/what/when', async () => {
  const port = directoryOf();
  const detail = await port.loadStudioSessionDetail('session-reaction-1' as never, DEMO_SCOPE);
  if ('error' in detail) {
    assert.fail('unexpected failure');
  }
  assert.equal(detail.reviews.length, 1);
  const review = detail.reviews[0];
  assert.ok(review);
  assert.equal(review.outcome, 'accept');
  assert.deepEqual(review.decidedBy, { kind: 'studio-operator', ref: 'identity-operator-1' });
  assert.equal(review.decidedAt, '2026-06-02T10:11:30.000Z');
  assert.equal(review.targetArtifactId, 'final-reaction-pip-1');
  assert.equal(review.rejection, null);
});

test('quality and rights/policy rejections are distinct §19 kinds', async () => {
  const port = directoryOf();
  const quality = await port.loadStudioSessionDetail('session-reaction-5' as never, DEMO_SCOPE);
  const rights = await port.loadStudioSessionDetail('session-podcast-5' as never, DEMO_SCOPE);
  if ('error' in quality || 'error' in rights) {
    assert.fail('unexpected failure');
  }
  const qualityReview = quality.reviews[0];
  const rightsReview = rights.reviews[0];
  assert.ok(qualityReview && rightsReview);
  assert.equal(qualityReview.rejection?.kind, 'quality-rejection');
  assert.equal(qualityReview.rejection?.detail.includes('audio-clarity-floor'), true);
  assert.equal(rightsReview.rejection?.kind, 'rights-policy-rejection');
  assert.equal(rightsReview.rejection?.detail.includes('rights-violation-missing-source-consent'), true);
  assert.deepEqual(rightsReview.decidedBy, { kind: 'lab', ref: 'lab-candidate-77' });
});

test('an unknown session id is the explicit studio-session-not-found failure', async () => {
  const port = directoryOf();
  const result = await port.loadStudioSessionDetail('session-ghost' as never, DEMO_SCOPE);
  if (!('error' in result)) {
    assert.fail('expected a typed failure');
  }
  assert.equal(result.error, 'studio-session-not-found');
});

test('a cross-tenant session id is the SAME miss — no existence leak (§31)', async () => {
  const port = directoryOf();
  const result = await port.loadStudioSessionDetail('session-other-1' as never, DEMO_SCOPE);
  if (!('error' in result)) {
    assert.fail('expected a typed failure');
  }
  assert.equal(result.error, 'studio-session-not-found');
  const failure = result as StudioDirectoryFailure;
  assert.equal(
    typeof failure.message === 'string' && failure.message.includes('session-other-1'),
    true,
  );
});

test('an injected listing failure is the explicit directory-unavailable verdict', async () => {
  const port = createInMemoryStudioSurface({ failListings: true }).studioDirectory;
  const result = await port.listStudioSessions(DEMO_SCOPE);
  if (!('error' in result)) {
    assert.fail('expected a typed failure');
  }
  assert.equal(result.error, 'studio-directory-unavailable');
  assert.equal(result.message.includes('injected'), true);
});
