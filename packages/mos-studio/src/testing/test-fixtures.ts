/**
 * Shared fixtures/helpers for the Studio runtime node:test suites
 * (STUDIO-001). Test-support code only — compiled with the package but
 * never exported from the package index.
 */

import assert from "node:assert/strict";

import type { StudioRuntime } from "../runtime/studio-runtime.js";
import type { CreateStudioSessionInput, JoinParticipantRequest, OpenCaptureRequest, StandaloneSessionIntent } from "../runtime/intake-types.js";
import type { StudioRuntimeOutcome } from "../runtime/errors.js";
import { composeTestRuntime, TEST_ORGANIZATION } from "./compose-runtime-for-tests.js";
import type { RealParticipantAuthorities } from "./real-participant-authorities.js";
import type { StudioArtifactRef } from "../contracts/studio-artifact-package.js";
import type { EditGraphRef } from "../contracts/studio-artifact-package.js";
import type { StudioArtifactCreationResult } from "../ports/artifact-factory.js";
import type { StudioCaptureTakeOutcome, StudioCaptureTakeResult } from "../runtime/capture/studio-capture-session.js";
import type { ConsentRef, EditGraphId, IdentityRef, StudioFormatId, StudioSessionId, TenantId } from "../contracts/refs.js";

// ——— Branded refs cast once; deterministic ids come from the test runtime ———

export const TENANT = "tenant-001" as TenantId;
export const USER = "identity-user-1" as IdentityRef;
export const consentRef = (n: number): ConsentRef => `consent-${n}` as ConsentRef;

export const OPERATOR = { kind: "studio-operator", identityRef: "identity-operator-1" } as const;

export const standaloneIntent = (overrides: Record<string, unknown> = {}): CreateStudioSessionInput => ({
  kind: "standalone-intent" as const,
  intent: {
    supplier: { kind: "standalone-user" as const, identityRef: USER },
    tenantId: TENANT,
    format: { formatId: "reaction" as StudioFormatId, version: 1 },
    inputKind: "intent-with-source-material" as const,
    intent: "React to the source video with honest first-impression commentary",
    sourceArtifacts: [{ artifactId: "artifact-src-1" as never, rightsCleared: true }],
    organizationRef: { id: TEST_ORGANIZATION.id, version: TEST_ORGANIZATION.version },
    plannedParticipants: 1,
    ...overrides,
  } as StandaloneSessionIntent,
});

/**
 * Request-shaped join fixture. Consent coverage is NOT part of the shape
 * anymore (STUDIO-006): the refs passed here must reference REAL records in
 * the composed rights authority — `createSessionReadyForCapture` seeds the
 * default `consent-1` (capture/use) + `consent-2` (processing/transform)
 * records for the default subject identity, and scenario tests seed their
 * own records through `authorities.recordSessionConsent`.
 */
export const participantJoin = (overrides: Partial<JoinParticipantRequest> = {}): JoinParticipantRequest => ({
  participantId: "participant-1" as never,
  identityRef: USER,
  accountBoundary: { accountId: "account-A" as never, deviceRef: "device-A1" as never },
  roles: ["subject"],
  grantedActions: ["capture", "review"],
  grant: { grantedBy: USER },
  consent: {
    consentRefs: [consentRef(1), consentRef(2)],
  },
  ...overrides,
});

// ——— Assertion helpers ———

export async function mustOk<T>(
  outcome: Promise<StudioRuntimeOutcome<T>> | StudioRuntimeOutcome<T>,
  label: string,
): Promise<T> {
  const resolved = await outcome;
  assert.equal(resolved.ok, true, `${label}: expected ok, got ${JSON.stringify(resolved)}`);
  return (resolved as { ok: true; value: T }).value;
}

export async function mustArtifact(
  outcome: Promise<StudioArtifactCreationResult> | StudioArtifactCreationResult,
  label: string,
): Promise<StudioArtifactRef> {
  const resolved = await outcome;
  assert.equal(resolved.ok, true, `${label}: expected ok, got ${JSON.stringify(resolved)}`);
  return (resolved as { ok: true; artifact: StudioArtifactRef }).artifact;
}

export async function mustTake(
  outcome: Promise<StudioCaptureTakeOutcome> | StudioCaptureTakeOutcome,
  label: string,
): Promise<StudioCaptureTakeResult> {
  const resolved = await outcome;
  assert.equal(resolved.ok, true, `${label}: expected ok, got ${JSON.stringify(resolved)}`);
  return (resolved as { ok: true; take: StudioCaptureTakeResult }).take;
}

// ——— Scenario drivers ———

/**
 * Seed the REAL authorities (STUDIO-006) for the default subject identity:
 * tenant + workspace + identity + ACTIVE membership, then two REAL
 * session-scoped consent records (`use` for capture, `transform` for
 * processing). Returns the refs so manual compositions can pass them on.
 */
export function seedDefaultSubjectConsent(
  authorities: RealParticipantAuthorities,
  sessionId: StudioSessionId,
): { readonly captureConsent: ConsentRef; readonly processingConsent: ConsentRef } {
  authorities.ensureIdentity({ tenantId: TENANT, identityRef: USER });
  const captureConsent = authorities.recordSessionConsent({
    tenantId: TENANT,
    identityRef: USER,
    sessionId,
    actions: ["use"],
  });
  const processingConsent = authorities.recordSessionConsent({
    tenantId: TENANT,
    identityRef: USER,
    sessionId,
    actions: ["transform"],
  });
  return { captureConsent, processingConsent };
}

/**
 * Create a standalone-intent session, load the organization (→ capturing)
 * and seed the REAL participant authorities for the default subject. The
 * deterministic ids of a freshly composed authority are `consent-1` and
 * `consent-2` — asserted so the `participantJoin()` default refs always
 * point at REAL rights records (no caller-asserted consent anywhere).
 */
export async function createSessionReadyForCapture() {
  const composed = composeTestRuntime();
  const created = await mustOk(composed.runtime.createSession(standaloneIntent()), "createSession");
  const sessionId = created.session.id;
  await mustOk(composed.runtime.loadOrganization(sessionId), "loadOrganization");
  const { captureConsent, processingConsent } = seedDefaultSubjectConsent(composed.authorities, sessionId);
  assert.deepEqual(
    [captureConsent, processingConsent],
    [consentRef(1), consentRef(2)],
    "participantJoin() default refs must be the seeded REAL consent records",
  );
  return { ...composed, sessionId };
}

/** Join participant-1 and capture one audio take; returns the raw artifact. */
export async function captureRawTake(
  runtime: StudioRuntime,
  sessionId: StudioSessionId,
  request: Partial<OpenCaptureRequest>,
): Promise<StudioArtifactRef> {
  const opened = await mustOk(
    runtime.openCapture(sessionId, {
      participantId: "participant-1" as never,
      mediaKind: "audio",
      deviceClass: "microphone",
      sourceId: "mic-studio-48k",
      rightsRef: "rights-context-1" as never,
      provenanceRef: "provenance-capture-1" as never,
      ...request,
    }),
    "openCapture",
  );
  await opened.start();
  const sealed = await mustTake(opened.stop(), "capture stop");
  return sealed.artifact;
}

/** Create organization-produced artifacts through the SHARED factory (closed lineage §6). */
export async function buildProcessingArtifacts(
  artifactFactory: Awaited<ReturnType<typeof composeTestRuntime>>["artifactFactory"],
  rawArtifacts: readonly StudioArtifactRef[],
): Promise<{
  intermediate: StudioArtifactRef[];
  finals: StudioArtifactRef[];
}> {
  const intermediate: StudioArtifactRef[] = [];
  for (const raw of rawArtifacts) {
    const created = await mustArtifact(
      artifactFactory.createArtifact({
        tenantId: raw.tenantId,
        type: raw.type,
        stage: "intermediate",
        creationMethod: "organization-transform",
        storageRef: `mos-studio:intermediate:${raw.artifactId}` as never,
        content: new TextEncoder().encode(`intermediate|${raw.artifactId}`),
        rightsRef: raw.rightsRef,
        provenanceRef: "provenance-org-1" as never,
        parents: [raw],
      }),
      "intermediate creation",
    );
    intermediate.push(created);
  }
  const finals: StudioArtifactRef[] = [];
  for (const parent of intermediate) {
    const created = await mustArtifact(
      artifactFactory.createArtifact({
        tenantId: parent.tenantId,
        type: "video",
        stage: "final",
        creationMethod: "composition",
        storageRef: `mos-studio:final:${parent.artifactId}` as never,
        content: new TextEncoder().encode(`final|${parent.artifactId}`),
        rightsRef: parent.rightsRef,
        provenanceRef: "provenance-org-1" as never,
        parents: [parent],
      }),
      "final creation",
    );
    finals.push(created);
  }
  return { intermediate, finals };
}

/**
 * A REAL recorded edit-graph ref for the runtime-level scenario drivers
 * (STUDIO-013): the org's composition decisions arrive as caller-supplied
 * recorded data (the W3-C/W8-C disclosed discipline) — the runtime-level
 * tests supply the recorded graph ref `completeProcessing` cites, exactly
 * like the format flows cite the W8-C editing session's recorded graph.
 */
export function recordedEditGraphRefOf(sessionId: StudioSessionId, version = 1): EditGraphRef {
  return Object.freeze({
    graphId: `mos-studio:edit-graph:${String(sessionId)}` as EditGraphId,
    version,
    otioInterchange: false,
  });
}

/** Drive a session to the review state: join → capture → process → complete. */
export async function driveToReview() {
  const { runtime, artifactFactory, sessionId } = await createSessionReadyForCapture();
  await mustOk(runtime.joinParticipant(sessionId, participantJoin()), "join");
  const rawArtifact = await captureRawTake(runtime, sessionId, {});
  const { intermediate, finals } = await buildProcessingArtifacts(artifactFactory, [rawArtifact]);
  await mustOk(runtime.beginProcessing(sessionId), "beginProcessing");
  await mustOk(
    runtime.completeProcessing(sessionId, {
      intermediateArtifacts: intermediate,
      finalArtifacts: finals,
      transcriptRefs: [
        {
          artifact: intermediate[0] as StudioArtifactRef,
          language: "en-US",
          diarized: true,
        },
      ],
      editGraphRef: recordedEditGraphRefOf(sessionId),
    }),
    "completeProcessing",
  );
  return { runtime, artifactFactory, sessionId, rawArtifact, intermediate, finals };
}

/** Drive a session to packaged (review accepted) and return the v1 package. */
export async function driveToPackaged() {
  const { runtime, sessionId, finals } = await driveToReview();
  const accepted = await mustOk(
    runtime.submitReview(sessionId, {
      targetArtifactId: (finals[0] as StudioArtifactRef).artifactId,
      outcome: "accept",
      decidedBy: OPERATOR,
    }),
    "accept",
  );
  return { runtime, sessionId, finals, package: accepted.package as NonNullable<typeof accepted.package> };
}
