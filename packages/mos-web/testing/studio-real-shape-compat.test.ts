/**
 * Studio REAL-shape compat battery (UX-002) — the node-only zero-drift pin
 * between the web surface's view models and the REAL studio authority.
 *
 * The browser composition double feeds REAL-shaped fixture data through the
 * shared shape adapter because the REAL studio runtime imports `node:crypto`
 * and cannot run inside the browser bundle. THIS battery closes the loop on
 * the node side: it composes the REAL `@mos/studio` runtime from the
 * package's EXPORTED surfaces (createStudioRuntime + the disclosed in-memory
 * port doubles + composeRealParticipantAuthorities over the REAL
 * `@mos/identity` / `@mos/rights` repositories + createStudioPackagingAuthority
 * + createInMemorySessionDirectory — the STUDIO-014 operator surfaces),
 * drives a full session lifecycle (create → load → join → capture →
 * process → review-accept → package v1 → treatment → package v2), and feeds
 * the RUNTIME'S OWN OUTPUTS through the same adapter the double uses. The
 * view models the shell renders are therefore proven against the authority,
 * not just against fixtures.
 *
 * It also proves the §15 read-side: a consent REVOCATION in the REAL rights
 * authority flips the adapter's participant state to `consent-required`
 * exactly when the runtime's own operator gate refuses with the typed
 * `consent-required-for-operator-action` failure.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { TenantScope } from '@mos/contracts';
import {
  createInMemoryArtifactFactory,
  createInMemoryCaptureSourcePort,
  createInMemoryOrganizationSource,
  createInMemorySessionDirectory,
  createInMemoryTreatmentExecutor,
  createFormatRegistryWithInitialFormats,
  createStudioOrganizationLoader,
  createStudioPackagingAuthority,
  createStudioRuntime,
  composeRealParticipantAuthorities,
} from '../../mos-studio/dist/index.js';
import type {
  CreateStudioSessionInput,
  RealParticipantAuthorities,
  StudioArtifactPackagingPort,
  StudioArtifactRef,
  StudioRuntime,
  StudioSessionView,
  SubmitReviewInput,
  Timestamp,
} from '@mos/studio';
import {
  packageChainViewOf,
  packageSummaryViewOf,
  sessionDetailViewOf,
  sessionSummaryViewOf,
  type StudioSessionDetailSource,
} from './studio-shape-adapter.js';

// ——— Deterministic clock + id factories (the composeTestRuntime discipline) ———

function createDeterministicClock(baseEpochMs: number): () => Timestamp {
  let tick = 0;
  return () => new Date(baseEpochMs + tick++ * 1000).toISOString() as Timestamp;
}

function createDeterministicIdFactory(prefix: string): () => string {
  let counter = 0;
  return () => `t-${prefix}-${String(++counter).padStart(4, '0')}`;
}

const COMPAT_TENANT = 'tenant-compat-ux002' as never;
const OTHER_TENANT = 'tenant-compat-other' as never;
const COMPAT_SCOPE: TenantScope = { tenantId: COMPAT_TENANT };
const USER = 'identity-user-1' as never;
const OPERATOR = { kind: 'studio-operator', identityRef: 'identity-operator-1' } as const;

/** The organization descriptor the initial reaction format accepts. */
const COMPAT_ORGANIZATION = {
  id: 'org-compat-reaction-desk',
  version: 1,
  declaredCapabilities: [
    'compose_reaction',
    'render_timeline',
    'transcribe_audio',
    'mix_audio',
    'compose_video',
    'evaluate_content',
  ],
} as const;

interface ComposedCompatStack {
  readonly runtime: StudioRuntime;
  readonly authorities: RealParticipantAuthorities;
  /** THE canonical packaging authority the runtime composes through (STUDIO-013/014). */
  readonly packaging: StudioArtifactPackagingPort;
  readonly directory: ReturnType<typeof createInMemorySessionDirectory>;
  readonly artifactFactory: ReturnType<typeof createInMemoryArtifactFactory>;
  readonly sessionId: string;
  readonly captureConsent: string;
  readonly processingConsent: string;
  readonly finals: readonly StudioArtifactRef[];
}

async function mustOk<T>(
  outcome: Promise<{ ok: true; value: T } | { ok: false; error: unknown }> | { ok: true; value: T } | { ok: false; error: unknown },
  label: string,
): Promise<T> {
  const resolved = await outcome;
  if (!('ok' in resolved) || !resolved.ok) {
    assert.fail(`${label}: expected ok, got ${JSON.stringify(resolved)}`);
  }
  return (resolved as { ok: true; value: T }).value;
}

async function mustTake<T>(
  outcome: Promise<{ ok: true; take: T } | { ok: false }>,
  label: string,
): Promise<T> {
  const resolved = await outcome;
  if (!resolved.ok) {
    assert.fail(`${label}: expected ok, got ${JSON.stringify(resolved)}`);
  }
  return (resolved as { ok: true; take: T }).take;
}

async function mustArtifact(
  outcome: Promise<{ ok: true; artifact: StudioArtifactRef } | { ok: false; error: unknown }>,
  label: string,
): Promise<StudioArtifactRef> {
  const resolved = await outcome;
  if (!resolved.ok) {
    assert.fail(`${label}: expected ok, got ${JSON.stringify(resolved)}`);
  }
  return resolved.artifact;
}

/**
 * Compose the REAL runtime from EXPORTED surfaces and drive one reaction
 * session all the way to a treated package v2 (§13 standalone flow + §19
 * treatment). The final artifacts include one ENGINE-GENERATED item so the
 * §14 synthetic disclosure is exercised against the real packaging
 * authority's own derivation.
 */
async function composeAndDriveRealStudioSession(): Promise<ComposedCompatStack> {
  const clock = createDeterministicClock(Date.UTC(2026, 5, 2, 9, 0, 0));
  const authorities = composeRealParticipantAuthorities({ now: clock });
  const artifactFactory = createInMemoryArtifactFactory({
    idFactory: createDeterministicIdFactory('art'),
  });
  const packaging = createStudioPackagingAuthority({ now: clock });
  const directory = createInMemorySessionDirectory();
  const runtime = createStudioRuntime({
    formatRegistry: createFormatRegistryWithInitialFormats(),
    organizationLoader: createStudioOrganizationLoader({
      source: createInMemoryOrganizationSource({ organizations: [COMPAT_ORGANIZATION] }),
    }),
    artifactFactory,
    treatmentExecutor: createInMemoryTreatmentExecutor({ artifactFactory, clock }),
    captureSourcePort: createInMemoryCaptureSourcePort({ now: clock, fixedTakeSeconds: 42 }),
    participantIdentityPort: authorities.participantIdentityPort,
    participantConsentPort: authorities.participantConsentPort,
    packaging,
    sessionDirectory: directory,
    clock,
    idFactory: createDeterministicIdFactory('id'),
  });

  const created = await mustOk(
    runtime.createSession({
      kind: 'standalone-intent',
      intent: {
        supplier: { kind: 'standalone-user', identityRef: USER },
        tenantId: COMPAT_TENANT,
        format: { formatId: 'reaction' as never, version: 1 },
        inputKind: 'intent-with-source-material',
        intent: 'React to the source video with honest first-impression commentary',
        sourceArtifacts: [{ artifactId: 'artifact-src-1' as never, rightsCleared: true }],
        organizationRef: { id: COMPAT_ORGANIZATION.id, version: COMPAT_ORGANIZATION.version },
        plannedParticipants: 1,
      },
    } satisfies CreateStudioSessionInput),
    'createSession',
  );
  const sessionId = String(created.session.id);

  authorities.ensureIdentity({ tenantId: COMPAT_TENANT, identityRef: USER });
  const captureConsent = String(
    authorities.recordSessionConsent({
      tenantId: COMPAT_TENANT,
      identityRef: USER,
      sessionId: sessionId as never,
      actions: ['use'],
    }),
  );
  const processingConsent = String(
    authorities.recordSessionConsent({
      tenantId: COMPAT_TENANT,
      identityRef: USER,
      sessionId: sessionId as never,
      actions: ['transform'],
    }),
  );

  await mustOk(runtime.loadOrganization(sessionId as never), 'loadOrganization');
  await mustOk(
    runtime.joinParticipant(sessionId as never, {
      participantId: 'participant-1' as never,
      identityRef: USER,
      accountBoundary: { accountId: 'account-A' as never, deviceRef: 'device-A1' as never },
      roles: ['subject'],
      grantedActions: ['capture', 'review'],
      grant: { grantedBy: USER },
      consent: { consentRefs: [captureConsent as never, processingConsent as never] },
    }),
    'joinParticipant',
  );

  const opened = await mustOk(
    runtime.openCapture(sessionId as never, {
      participantId: 'participant-1' as never,
      mediaKind: 'audio',
      deviceClass: 'microphone',
      sourceId: 'mic-studio-48k',
      rightsRef: 'rights-context-1' as never,
      provenanceRef: 'provenance-capture-1' as never,
    }),
    'openCapture',
  );
  await opened.start();
  const sealed = await mustTake(opened.stop(), 'capture stop');
  const rawArtifact = sealed.artifact;

  const intermediate = await mustArtifact(
    artifactFactory.createArtifact({
      tenantId: rawArtifact.tenantId,
      type: rawArtifact.type,
      stage: 'intermediate',
      creationMethod: 'organization-transform',
      storageRef: `mos-studio:intermediate:${String(rawArtifact.artifactId)}` as never,
      content: new TextEncoder().encode(`intermediate|${String(rawArtifact.artifactId)}`),
      rightsRef: rawArtifact.rightsRef,
      provenanceRef: 'provenance-org-1' as never,
      parents: [rawArtifact],
    }),
    'intermediate creation',
  );
  const composedFinal = await mustArtifact(
    artifactFactory.createArtifact({
      tenantId: rawArtifact.tenantId,
      type: 'video',
      stage: 'final',
      creationMethod: 'composition',
      storageRef: 'mos-studio:final:composed' as never,
      content: new TextEncoder().encode('final|composed'),
      rightsRef: rawArtifact.rightsRef,
      provenanceRef: 'provenance-org-1' as never,
      parents: [intermediate],
    }),
    'final composition',
  );
  const syntheticFinal = await mustArtifact(
    artifactFactory.createArtifact({
      tenantId: rawArtifact.tenantId,
      type: 'video',
      stage: 'final',
      creationMethod: 'engine-generated',
      storageRef: 'mos-studio:final:synthetic-intro' as never,
      content: new TextEncoder().encode('final|synthetic-intro'),
      rightsRef: rawArtifact.rightsRef,
      provenanceRef: 'provenance-org-1' as never,
      // §6: a final is a composition over the organization's intermediate —
      // engine-generated finals carry their lineage parents too.
      parents: [intermediate],
    }),
    'final synthetic intro (§14)',
  );
  const finals = [composedFinal, syntheticFinal];

  await mustOk(runtime.beginProcessing(sessionId as never), 'beginProcessing');
  await mustOk(
    runtime.completeProcessing(sessionId as never, {
      intermediateArtifacts: [intermediate],
      finalArtifacts: finals,
      transcriptRefs: [{ artifact: intermediate, language: 'en-US', diarized: true }],
      editGraphRef: {
        graphId: `mos-studio:edit-graph:${sessionId}` as never,
        version: 1,
        otioInterchange: true,
      },
    }),
    'completeProcessing',
  );
  const accepted = await mustOk(
    runtime.submitReview(sessionId as never, {
      targetArtifactId: String(composedFinal.artifactId),
      outcome: 'accept',
      decidedBy: OPERATOR,
    } satisfies SubmitReviewInput),
    'submitReview accept',
  );
  assert.ok(accepted.package, 'the accept packaged v1');
  await mustOk(
    runtime.applyTreatment(sessionId as never, {
      sessionId: sessionId as never,
      targetArtifact: composedFinal,
      treatment: 'trim',
      requestedBy: OPERATOR,
      requestedAt: '2026-06-02T11:00:00.000Z' as never,
    }),
    'applyTreatment',
  );

  return {
    runtime,
    authorities,
    packaging,
    directory,
    artifactFactory,
    sessionId,
    captureConsent,
    processingConsent,
    finals,
  };
}

/** Project the REAL session view into the adapter's declared source shape. */
function detailSourceOf(
  stack: ComposedCompatStack,
  view: StudioSessionView,
  holderResolutions: StudioSessionDetailSource['holderResolutions'],
): StudioSessionDetailSource {
  return {
    summary: stack.directory
      .listSessionSummaries(COMPAT_SCOPE)
      .find((summary) => String(summary.sessionRef) === stack.sessionId) as never,
    lifecycle: {
      state: view.session.lifecycle.state,
      transitions: view.session.lifecycle.transitions,
    },
    participants: view.participants.map((participant) => ({
      participantId: String(participant.participantId),
      identityRef: String(participant.identityRef),
      accountRef: String(participant.accountBoundary.accountId),
      roles: [...participant.roles],
      consentRefs: participant.consent.consentRefs.map(String),
      coversCapture: participant.consent.coversCapture,
      coversProcessingIntoArtifacts: participant.consent.coversProcessingIntoArtifacts,
    })),
    reviews: view.reviews,
    consentEntries: view.rawArtifactConsentEntries.map((entry) => ({
      artifactId: entry.artifactId,
      consentRefs: entry.consentRefs,
      holderIdentityRef: entry.holderIdentityRef,
    })),
    holderResolutions,
  };
}

test('compat: the REAL directory summaries adapt into the exact view shapes the shell renders', async () => {
  const stack = await composeAndDriveRealStudioSession();
  const summaries = stack.directory.listSessionSummaries(COMPAT_SCOPE);
  assert.equal(summaries.length, 1);
  const view = sessionSummaryViewOf(summaries[0] as never);
  assert.equal(String(view.sessionId), stack.sessionId);
  assert.equal(view.tenantId, COMPAT_TENANT);
  assert.equal(view.formatId, 'reaction');
  assert.equal(view.formatVersion, 1);
  assert.equal(view.lifecycleState, 'packaged');
  assert.equal(view.participantCount, 1);
  assert.deepEqual(view.organizationRef, { id: COMPAT_ORGANIZATION.id, version: 1 });
  assert.deepEqual(view.artifactPackageRef, { packageId: view.artifactPackageRef?.packageId, version: 2 });
});

test('compat: the REAL session detail adapts with §15 granted consent and the §30 review record', async () => {
  const stack = await composeAndDriveRealStudioSession();
  const sessionView = stack.runtime.getSession(stack.sessionId as never);
  assert.ok(sessionView, 'the runtime exposes the session view');
  const liveResolution = await stack.authorities.participantConsentPort.resolveParticipantConsent({
    tenantId: COMPAT_TENANT,
    sessionId: stack.sessionId as never,
    participantIdentityRef: USER,
    consentRefs: [stack.captureConsent as never, stack.processingConsent as never],
  });
  const detail = sessionDetailViewOf(
    detailSourceOf(stack, sessionView, [
      {
        holderIdentityRef: String(USER),
        coversProcessingIntoArtifacts: liveResolution.coversProcessingIntoArtifacts,
      },
    ]),
  );
  assert.equal(detail.summary.lifecycleState, 'packaged');
  assert.deepEqual(
    detail.transitions.map((transition) => `${transition.from}->${transition.to}`),
    [
      'requested->loading',
      'loading->capturing',
      'capturing->processing',
      'processing->review',
      'review->packaged',
    ],
    'the append-only lifecycle history adapts verbatim',
  );
  assert.equal(detail.participants.length, 1);
  const participant = detail.participants[0] as { consentState: string; accountRef: string };
  assert.equal(participant.consentState, 'granted', 'live resolution covers processing');
  assert.equal(participant.accountRef, 'account-A', '§15: the account boundary adapts');
  assert.equal(detail.consentRequirements.length, 0);
  // §30: the accept decision is attributable through the adapter.
  assert.equal(detail.reviews.length, 1);
  const review = detail.reviews[0] as { outcome: string; decidedBy: { kind: string; ref: string } };
  assert.equal(review.outcome, 'accept');
  assert.deepEqual(review.decidedBy, { kind: 'studio-operator', ref: 'identity-operator-1' });
});

test('compat: a REAL §15 revocation flips the adapter to consent-required exactly when the runtime gate refuses', async () => {
  const stack = await composeAndDriveRealStudioSession();
  // Revoke the participant's PROCESSING consent in the REAL rights authority.
  stack.authorities.revokeSessionConsent(COMPAT_TENANT, stack.processingConsent as never);

  // 1. The runtime's own operator gate now refuses with the typed failure
  //    (the session is packaged, so the forward-moving action is the
  //    treatment — exactly the STUDIO-014 discipline).
  const refused = await stack.runtime.applyTreatment(stack.sessionId as never, {
    sessionId: stack.sessionId as never,
    targetArtifact: stack.finals[0] as StudioArtifactRef,
    treatment: 'trim',
    requestedBy: OPERATOR,
    requestedAt: '2026-06-02T12:00:00.000Z' as never,
  });
  assert.equal(refused.ok, false);
  assert.equal(
    (refused as { readonly error: { readonly kind: string } }).error.kind,
    'consent-required-for-operator-action',
    'the REAL authority refuses the forward-moving action',
  );

  // 2. The read-side adapter shows the SAME verdict as an actionable state.
  const sessionView = stack.runtime.getSession(stack.sessionId as never);
  assert.ok(sessionView);
  const liveResolution = await stack.authorities.participantConsentPort.resolveParticipantConsent({
    tenantId: COMPAT_TENANT,
    sessionId: stack.sessionId as never,
    participantIdentityRef: USER,
    consentRefs: [stack.captureConsent as never, stack.processingConsent as never],
  });
  assert.equal(liveResolution.coversProcessingIntoArtifacts, false, 'the live resolution bites');
  const detail = sessionDetailViewOf(
    detailSourceOf(stack, sessionView, [
      {
        holderIdentityRef: String(USER),
        coversProcessingIntoArtifacts: liveResolution.coversProcessingIntoArtifacts,
      },
    ]),
  );
  const participant = detail.participants[0] as { consentState: string };
  assert.equal(participant.consentState, 'consent-required');
  assert.equal(detail.consentRequirements.length, 1);
  const requirement = detail.consentRequirements[0] as { subjectKind: string; subjectIdentityRef: string };
  assert.equal(requirement.subjectKind, 'participant');
  assert.equal(requirement.subjectIdentityRef, String(USER));
});

test('compat: the REAL packaging authority browses into the exact chain/summary shapes (§19 + §14)', async () => {
  const stack = await composeAndDriveRealStudioSession();
  const packaging = stack.packaging;
  const summaries = packaging.listPackages(COMPAT_SCOPE);
  assert.equal(summaries.length, 1);
  const summaryView = packageSummaryViewOf(summaries[0] as never);
  assert.equal(summaryView.latestVersion, 2);
  assert.equal(summaryView.versionCount, 2);
  assert.equal(String(summaryView.sessionRef), stack.sessionId);

  const chain = packageChainViewOf(packaging.listPackageVersions(COMPAT_SCOPE, summaries[0]!.packageId));
  assert.deepEqual(chain.versions.map((version) => version.version), [1, 2]);
  const v1 = chain.versions[0] as { evaluation: { outcome: string; evaluationRef: string | null }; provenance: { containsSyntheticMaterial: boolean }; consent: { allRawArtifactsCovered: boolean } };
  assert.equal(v1.evaluation.outcome, 'accepted');
  assert.equal(v1.evaluation.evaluationRef, 'mos-studio:review:1', '§30 citation adapts verbatim');
  assert.equal(v1.consent.allRawArtifactsCovered, true, '§15 coverage adapts verbatim');
  // §14: the REAL authority derived containsSyntheticMaterial from the
  // engine-generated final — the adapter relays it, and the per-artifact
  // label marks the synthetic final.
  assert.equal(v1.provenance.containsSyntheticMaterial, true);
  const v1Full = chain.versions[0]!;
  const syntheticArtifact = v1Full.finalArtifacts.find(
    (artifact) => artifact.creationMethod === 'engine-generated',
  );
  assert.ok(syntheticArtifact, 'the engine-generated final is in the REAL package');
  assert.equal(syntheticArtifact.synthetic, true);
  const v2 = chain.versions[1] as { evaluation: { status: string; outcome: string } };
  assert.equal(v2.evaluation.status, 'pending');
  assert.equal(v2.evaluation.outcome, 'treatment-requested', 'the REAL successor evaluation state');
});

test('compat: exact-tenant listing over the REAL directory (§31, no existence leaks)', async () => {
  const stack = await composeAndDriveRealStudioSession();
  // A second session under ANOTHER tenant through the SAME runtime.
  const other = await mustOk(
    stack.runtime.createSession({
      kind: 'standalone-intent',
      intent: {
        supplier: { kind: 'standalone-user', identityRef: 'identity-user-other' as never },
        tenantId: OTHER_TENANT,
        format: { formatId: 'reaction' as never, version: 1 },
        inputKind: 'intent-with-source-material',
        intent: 'Another tenant reacts to something else entirely.',
        sourceArtifacts: [{ artifactId: 'artifact-src-other' as never, rightsCleared: true }],
        organizationRef: { id: COMPAT_ORGANIZATION.id, version: COMPAT_ORGANIZATION.version },
        plannedParticipants: 1,
      },
    } satisfies CreateStudioSessionInput),
    'createSession other tenant',
  );
  const compatListed = stack.directory
    .listSessionSummaries(COMPAT_SCOPE)
    .map(sessionSummaryViewOf);
  const otherListed = stack.directory
    .listSessionSummaries({ tenantId: OTHER_TENANT })
    .map(sessionSummaryViewOf);
  assert.equal(cCompatCount(compatListed, stack.sessionId), 1);
  assert.equal(cCompatCount(compatListed, String(other.session.id)), 0, 'no cross-tenant leak');
  assert.equal(otherListed.length, 1);
  assert.equal(String(otherListed[0]?.sessionId), String(other.session.id));
  for (const view of compatListed) {
    assert.equal(view.tenantId, COMPAT_TENANT);
  }
});

function cCompatCount(
  views: readonly { sessionId: unknown }[],
  sessionId: string,
): number {
  return views.filter((view) => String(view.sessionId) === sessionId).length;
}
