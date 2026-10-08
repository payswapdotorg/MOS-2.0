import assert from "node:assert/strict";
import { test } from "node:test";

import {
  composeTestRuntime,
  runtimeAuthoritiesOf,
  runtimePackagingOf,
  TEST_ORGANIZATION,
} from "../testing/compose-runtime-for-tests.js";
import { createInMemorySessionDirectory } from "../testing/in-memory-session-directory.js";
import {
  OPERATOR,
  TENANT,
  captureRawTake,
  mustOk,
  participantJoin,
  recordedEditGraphRefOf,
  seedDefaultSubjectConsent,
  standaloneIntent,
  buildProcessingArtifacts,
  driveToPackaged,
} from "../testing/test-fixtures.js";
import type { StudioRuntime } from "./studio-runtime.js";
import type { StudioSessionView } from "./session-state.js";
import type { StudioArtifactRef } from "../contracts/studio-artifact-package.js";
import type { SubmitReviewInput } from "./intake-types.js";
import type { IdentityRef, StudioSessionId, TenantId } from "../contracts/refs.js";

// ---------------------------------------------------------------------------
// STUDIO-014: the standalone studio product surface — the operator runs
// sessions → capture → compose → package → REVIEW/ACCEPT entirely inside the
// studio's own authority surface. The session directory (observation port —
// NO new runtime method), package browsing with immutable versions through
// the ONE packaging authority, review/accept decisions recorded
// §30-attributably, and §15 LIVE consent re-resolution at every operator
// action (a revoked consent surfaces at the NEXT operator action, never
// silently passes). The no-publish discipline stands (no-publish.test.ts).
// ---------------------------------------------------------------------------

const OTHER_TENANT = "tenant-operator-other" as TenantId;
const SOURCE_HOLDER = "identity-source-holder-1" as IdentityRef;

/** Drive one session to the review state over a runtime with a directory attached. */
async function driveToReviewWithDirectory(): Promise<{
  readonly runtime: StudioRuntime;
  readonly sessionId: StudioSessionId;
  readonly finals: readonly StudioArtifactRef[];
  readonly directory: ReturnType<typeof createInMemorySessionDirectory>;
  readonly view: () => StudioSessionView | undefined;
}> {
  const directory = createInMemorySessionDirectory();
  const composed = composeTestRuntime({ sessionDirectory: directory });
  const created = await mustOk(composed.runtime.createSession(standaloneIntent()), "create");
  const sessionId = created.session.id;
  // Seed the REAL authorities for the default subject (the same discipline
  // every drive fixture applies): joinParticipant fail-closes on an unknown
  // identity, and the default join refs must point at REAL consent records.
  seedDefaultSubjectConsent(composed.authorities, sessionId);
  await mustOk(composed.runtime.loadOrganization(sessionId), "load");
  await mustOk(composed.runtime.joinParticipant(sessionId, participantJoin()), "join");
  const rawArtifact = await captureRawTake(composed.runtime, sessionId, {});
  const { intermediate, finals } = await buildProcessingArtifacts(composed.artifactFactory, [rawArtifact]);
  await mustOk(composed.runtime.beginProcessing(sessionId), "beginProcessing");
  await mustOk(
    composed.runtime.completeProcessing(sessionId, {
      intermediateArtifacts: intermediate,
      finalArtifacts: finals,
      transcriptRefs: [{ artifact: intermediate[0] as StudioArtifactRef, language: "en-US", diarized: true }],
      editGraphRef: recordedEditGraphRefOf(sessionId),
    }),
    "completeProcessing",
  );
  return {
    runtime: composed.runtime,
    sessionId,
    finals,
    directory,
    view: () => composed.runtime.getSession(sessionId),
  };
}

test("STUDIO-014 session directory: the runtime publishes a summary on EVERY state change; listing is exact-tenant", async () => {
  const directory = createInMemorySessionDirectory();
  const composed = composeTestRuntime({ sessionDirectory: directory });
  const created = await mustOk(composed.runtime.createSession(standaloneIntent()), "create");
  const sessionId = created.session.id;
  // Seed the REAL authorities for the default subject (see above).
  seedDefaultSubjectConsent(composed.authorities, sessionId);

  // A second session under ANOTHER tenant: the listing must stay per-tenant
  // (W9-B D2 exact-tenant equality — never widened). NOTE: standaloneIntent
  // spreads overrides INSIDE the intent — the tenant override is flat.
  const other = await mustOk(
    composed.runtime.createSession(standaloneIntent({ tenantId: OTHER_TENANT })),
    "create other",
  );

  await mustOk(composed.runtime.loadOrganization(sessionId), "load");
  await mustOk(composed.runtime.joinParticipant(sessionId, participantJoin()), "join");
  const rawArtifact = await captureRawTake(composed.runtime, sessionId, {});
  const { intermediate, finals } = await buildProcessingArtifacts(composed.artifactFactory, [rawArtifact]);
  await mustOk(composed.runtime.beginProcessing(sessionId), "beginProcessing");
  await mustOk(
    composed.runtime.completeProcessing(sessionId, {
      intermediateArtifacts: intermediate,
      finalArtifacts: finals,
      transcriptRefs: [{ artifact: intermediate[0] as StudioArtifactRef, language: "en-US", diarized: true }],
      editGraphRef: recordedEditGraphRefOf(sessionId),
    }),
    "completeProcessing",
  );
  const accepted = await mustOk(
    composed.runtime.submitReview(sessionId, {
      targetArtifactId: (finals[0] as StudioArtifactRef).artifactId,
      outcome: "accept",
      decidedBy: OPERATOR,
    } satisfies SubmitReviewInput),
    "accept",
  );
  assert.equal(accepted.session.lifecycle.state, "packaged");

  // The observation trail records a summary on every mutation — creation,
  // lifecycle transitions, the join, the package attachment.
  const states = directory.recordedSummaries
    .filter((summary) => String(summary.sessionRef) === String(sessionId))
    .map((summary) => summary.lifecycleState);
  assert.deepEqual(states, [
    "requested",
    "loading",
    "capturing",
    "capturing", // participant join (summary republished)
    "processing",
    "review",
    "review", // the package attachment (version bump while still in review)
    "packaged",
  ]);
  // The latest summary carries the full operator-facing projection.
  const latest = directory.getSessionSummary({ tenantId: TENANT }, sessionId);
  assert.ok(latest !== undefined);
  assert.equal(latest.lifecycleState, "packaged");
  assert.equal(latest.formatId, "reaction");
  assert.equal(latest.participantCount, 1);
  assert.equal(latest.organizationRef.id, TEST_ORGANIZATION.id);
  assert.deepEqual(latest.artifactPackageRef, {
    packageId: accepted.package?.id,
    version: accepted.package?.version,
  });
  // Exact-tenant listing: the other tenant's session is NOT in tenant-001's list.
  const listed = directory.listSessionSummaries({ tenantId: TENANT });
  assert.equal(listed.length, 1);
  assert.equal(String(listed[0]?.sessionRef), String(sessionId));
  const otherListed = directory.listSessionSummaries({ tenantId: OTHER_TENANT });
  assert.equal(otherListed.length, 1);
  assert.equal(String(otherListed[0]?.sessionRef), String(other.session.id));
  // No existence leak across tenants.
  assert.equal(directory.getSessionSummary({ tenantId: OTHER_TENANT }, sessionId), undefined);
  // The published summaries are frozen projections (W9-B D3).
  assert.throws(() => {
    (latest as unknown as { lifecycleState: string }).lifecycleState = "hijacked";
  }, TypeError);
});

test("STUDIO-014 package browsing: immutable versions through the ONE authority the runtime composes through", async () => {
  const { runtime, sessionId, finals } = await driveToPackaged();
  const v1 = (await runtime.getSession(sessionId))?.packages[0];
  assert.ok(v1 !== undefined);

  // The treatment composes the successor version through the SAME authority.
  const treated = await mustOk(
    runtime.applyTreatment(sessionId, {
      sessionId,
      targetArtifact: finals[0] as StudioArtifactRef,
      treatment: "trim",
      requestedBy: OPERATOR,
      requestedAt: "2026-01-04T00:00:00.000Z" as never,
    }),
    "applyTreatment",
  );
  const v2 = treated.package;
  assert.ok(v2 !== undefined);
  assert.equal(v2.version, 2);

  // The authority the runtime composes through IS the operator browsing
  // surface: summaries with latestVersion/versionCount, ascending chains,
  // exact-version reads, historical versions never rewritten.
  const scope = { tenantId: TENANT };
  const summaries = runtimePackagingOf(runtime).listPackages(scope, { sessionRef: sessionId });
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0]?.latestVersion, 2);
  assert.equal(summaries[0]?.versionCount, 2);
  const chain = runtimePackagingOf(runtime).listPackageVersions(scope, v1.id);
  assert.deepEqual(chain.map((pkg) => pkg.version), [1, 2]);
  assert.deepEqual(runtimePackagingOf(runtime).getArtifactPackage(scope, v1.id, 1), v1);
  assert.equal(runtimePackagingOf(runtime).getArtifactPackage(scope, v1.id)?.version, 2);
  // The historical v1 is bit-for-bit unchanged by the successor composition.
  assert.deepEqual(runtimePackagingOf(runtime).getArtifactPackage(scope, v1.id, 1), chain[0]);
});

test("STUDIO-014 review/accept is §30-attributable: the decision + its evaluation citation are recorded append-only", async () => {
  const { runtime, sessionId } = await driveToPackaged();
  const view = runtime.getSession(sessionId);
  assert.ok(view !== undefined);
  // The review decision: WHO decided, WHAT was decided, WHEN — recorded once.
  assert.equal(view.reviews.length, 1);
  const review = view.reviews[0];
  assert.ok(review !== undefined);
  assert.deepEqual(review.decidedBy, OPERATOR);
  assert.ok(String(review.decidedAt).length > 0);
  assert.equal(review.outcome, "accept");
  // The packaged version's evaluation cites the review record (§19/§30).
  const pkg = view.packages[0];
  assert.ok(pkg !== undefined);
  assert.equal(pkg.evaluation.status, "evaluated");
  assert.equal(pkg.evaluation.outcome, "accepted");
  assert.equal(pkg.evaluation.evaluationRef, "mos-studio:review:1");
  // The lifecycle transitions stay append-only and attributable.
  const transitions = view.session.lifecycle.transitions.map((t) => `${t.from}->${t.to}`);
  assert.deepEqual(transitions, [
    "requested->loading",
    "loading->capturing",
    "capturing->processing",
    "processing->review",
    "review->packaged",
  ]);
});

test("STUDIO-014 §15 live re-resolution: a participant's revoked consent surfaces at the NEXT operator action (accept refused, review not recorded)", async () => {
  const { runtime, sessionId, finals, view } = await driveToReviewWithDirectory();
  // Revoke the subject's PROCESSING consent in the REAL rights authority —
  // the join-time snapshot stays frozen, the live resolution must bite.
  const { authorities } = composeRuntimeOf(runtime);
  authorities.revokeSessionConsent(TENANT, "consent-2" as never);

  const refused = await runtime.submitReview(sessionId, {
    targetArtifactId: (finals[0] as StudioArtifactRef).artifactId,
    outcome: "accept",
    decidedBy: OPERATOR,
  } satisfies SubmitReviewInput);
  assert.ok(!refused.ok, "the accept must be refused after the consent revocation");
  assert.equal(refused.error.kind, "consent-required-for-operator-action");
  const error = refused.error as {
    readonly subjectKind: string;
    readonly subjectIdentityRef: string;
  };
  assert.equal(error.subjectKind, "participant");
  assert.equal(error.subjectIdentityRef, "identity-user-1");
  // Fail-closed: the review was NOT recorded and the session stays in review.
  assert.equal(view()?.reviews.length, 0);
  assert.equal(view()?.session.lifecycle.state, "review");
  // request-treatment (forward-moving) is refused the same way.
  const treatmentRefused = await runtime.submitReview(sessionId, {
    targetArtifactId: (finals[0] as StudioArtifactRef).artifactId,
    outcome: "request-treatment",
    decidedBy: OPERATOR,
  } satisfies SubmitReviewInput);
  assert.ok(!treatmentRefused.ok);
  assert.equal(treatmentRefused.error.kind, "consent-required-for-operator-action");
  // A terminal rejection stays decidable: the operator can always END a
  // compromised session explicitly (wind-down moves nothing forward).
  const rejected = await mustOk(
    runtime.submitReview(sessionId, {
      targetArtifactId: (finals[0] as StudioArtifactRef).artifactId,
      outcome: "reject-quality",
      rejection: { kind: "quality-rejection", reasons: ["compromised consent"] } as never,
      decidedBy: OPERATOR,
    } satisfies SubmitReviewInput),
    "reject-quality",
  );
  assert.equal(rejected.session.lifecycle.state, "failed");
});

test("STUDIO-014 §15 live re-resolution: an imported source holder's revoked consent surfaces at the accept (subjectKind imported-source)", async () => {
  const directory = createInMemorySessionDirectory();
  const composed = composeTestRuntime({ sessionDirectory: directory });
  const created = await mustOk(composed.runtime.createSession(standaloneIntent()), "create");
  const sessionId = created.session.id;
  // Seed the REAL authorities for the default subject (see above) BEFORE the
  // imported source's own holder identity + consent ride the session.
  seedDefaultSubjectConsent(composed.authorities, sessionId);
  await mustOk(composed.runtime.loadOrganization(sessionId), "load");
  await mustOk(composed.runtime.joinParticipant(sessionId, participantJoin()), "join");

  // The §6 acquired input: a rights-cleared imported source whose consenting
  // HOLDER identity is recorded with the coverage entry (STUDIO-014 seam).
  composed.authorities.ensureIdentity({ tenantId: TENANT, identityRef: SOURCE_HOLDER });
  const sourceConsent = composed.authorities.recordSessionConsent({
    tenantId: TENANT,
    identityRef: SOURCE_HOLDER,
    sessionId,
    actions: ["use", "transform"],
  });
  const imported = await mustOk(
    composed.runtime.importSourceArtifact(sessionId, {
      artifactId: "source-video-1" as never,
      type: "video",
      storageRef: "storage:operator/imported-source" as never,
      rightsCleared: true,
      rightsRef: "rights-source-1" as never,
      provenanceRef: "provenance-source-1" as never,
      consentRefs: [sourceConsent],
      sourceHolderIdentityRef: SOURCE_HOLDER,
    }),
    "importSourceArtifact",
  );
  assert.equal(imported.source.stage, "raw");
  assert.equal(imported.source.creationMethod, "human-import");

  const rawArtifact = await captureRawTake(composed.runtime, sessionId, {});
  const { intermediate, finals } = await buildProcessingArtifacts(composed.artifactFactory, [rawArtifact]);
  await mustOk(composed.runtime.beginProcessing(sessionId), "beginProcessing");
  await mustOk(
    composed.runtime.completeProcessing(sessionId, {
      intermediateArtifacts: intermediate,
      finalArtifacts: finals,
      transcriptRefs: [{ artifact: intermediate[0] as StudioArtifactRef, language: "en-US", diarized: true }],
      editGraphRef: recordedEditGraphRefOf(sessionId),
    }),
    "completeProcessing",
  );

  // Revoke the SOURCE HOLDER's consent — the import-time coverage snapshot
  // stays recorded, but the live re-resolution at the operator action must
  // surface it (the imported source rides the packaged output).
  composed.authorities.revokeSessionConsent(TENANT, sourceConsent);
  const refused = await composed.runtime.submitReview(sessionId, {
    targetArtifactId: (finals[0] as StudioArtifactRef).artifactId,
    outcome: "accept",
    decidedBy: OPERATOR,
  } satisfies SubmitReviewInput);
  assert.ok(!refused.ok, "the accept must be refused after the source holder's revocation");
  assert.equal(refused.error.kind, "consent-required-for-operator-action");
  const error = refused.error as {
    readonly subjectKind: string;
    readonly subjectIdentityRef: string;
  };
  assert.equal(error.subjectKind, "imported-source");
  assert.equal(error.subjectIdentityRef, String(SOURCE_HOLDER));
  assert.equal(composed.runtime.getSession(sessionId)?.reviews.length, 0);
  assert.equal(composed.runtime.getSession(sessionId)?.session.lifecycle.state, "review");
});

test("STUDIO-014 §15 live re-resolution: a treatment after a revocation is refused — no successor version is composed", async () => {
  const { runtime, sessionId, finals } = await driveToPackaged();
  const { authorities } = composeRuntimeOf(runtime);
  // Revoke the subject's processing consent AFTER the session packaged.
  authorities.revokeSessionConsent(TENANT, "consent-2" as never);
  const refused = await runtime.applyTreatment(sessionId, {
    sessionId,
    targetArtifact: finals[0] as StudioArtifactRef,
    treatment: "trim",
    requestedBy: OPERATOR,
    requestedAt: "2026-01-04T00:00:00.000Z" as never,
  });
  assert.ok(!refused.ok, "the treatment must be refused after the revocation");
  assert.equal(refused.error.kind, "consent-required-for-operator-action");
  // Fail-closed: NO successor version was composed, the package chain and
  // the session state are unchanged.
  const view = runtime.getSession(sessionId);
  assert.ok(view !== undefined);
  assert.equal(view.packages.length, 1);
  assert.equal(view.treatments.length, 0);
  assert.equal(view.session.lifecycle.state, "packaged");
});

test("STUDIO-014 operator surface coherence: the session view exposes the §15 coverage projection the re-resolution rides on", async () => {
  const directory = createInMemorySessionDirectory();
  const composed = composeTestRuntime({ sessionDirectory: directory });
  const created = await mustOk(composed.runtime.createSession(standaloneIntent()), "create");
  const sessionId = created.session.id;
  // Seed the REAL authorities for the default subject (see above).
  seedDefaultSubjectConsent(composed.authorities, sessionId);
  await mustOk(composed.runtime.loadOrganization(sessionId), "load");
  await mustOk(composed.runtime.joinParticipant(sessionId, participantJoin()), "join");
  const rawArtifact = await captureRawTake(composed.runtime, sessionId, {});

  const view = composed.runtime.getSession(sessionId);
  assert.ok(view !== undefined);
  // The coverage projection: the captured raw artifact's entry names its
  // consenting holder (the capturing participant) + its consent refs.
  assert.equal(view.rawArtifactConsentEntries.length, 1);
  const entry = view.rawArtifactConsentEntries[0];
  assert.ok(entry !== undefined);
  assert.equal(entry.artifactId, String(rawArtifact.artifactId));
  assert.deepEqual(entry.consentRefs, ["consent-1" as never, "consent-2" as never]);
  assert.equal(String(entry.holderIdentityRef), "identity-user-1");
  // The projection is frozen (W9-B D3).
  assert.throws(() => {
    (entry as unknown as { consentRefs: string[] }).consentRefs = [];
  }, TypeError);
});

// ——— Helpers: reach the composition handles the runtime was composed with ———

/** The packaging authority + REAL authorities of a runtime composed by the fixtures. */
function composeRuntimeOf(runtime: StudioRuntime): {
  readonly packaging: import("../ports/artifact-packaging.port.js").StudioArtifactPackagingPort;
  readonly authorities: import("../testing/real-participant-authorities.js").RealParticipantAuthorities;
} {
  return { packaging: runtimePackagingOf(runtime), authorities: runtimeAuthoritiesOf(runtime) };
}

test("STUDIO-014 fixture wiring (internal): the handles reachable through a runtime ARE its composed handles", () => {
  // The operator-surface tests above reach the packaging authority + the
  // REAL rights authorities THROUGH the runtime instance
  // (runtimePackagingOf / composeRuntimeOf). This pin keeps that lookup
  // honest: the handles reachable from a fixture-composed runtime are
  // exactly the composition's own instances — no parallel authority could
  // ever answer the lookup.
  const composed = composeTestRuntime();
  assert.equal(runtimePackagingOf(composed.runtime), composed.packaging);
  assert.equal(runtimeAuthoritiesOf(composed.runtime), composed.authorities);
});
