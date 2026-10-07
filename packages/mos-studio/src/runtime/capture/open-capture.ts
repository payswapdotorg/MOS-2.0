/**
 * Capture opening for the Studio runtime (STUDIO-005 wiring).
 *
 * Extracted from `studio-runtime.ts` (file-length policy): performs the
 * per-request capture gates — participant lookup, consent verification
 * (§27), role capability, source enumeration/validation against the format's
 * device requirement — and constructs the {@link StudioCaptureSession} bound
 * to the session + consented participant. All failures are explicit typed
 * errors; the raw-artifact recorder folds completed takes back into the
 * session draft.
 */

import type { StorageRef, StudioSessionId, TenantId } from "../../contracts/refs.js";
import type { StudioSessionRecord } from "../session-state.js";
import type { OpenCaptureRequest } from "../intake-types.js";
import type { StudioRuntimeError } from "../errors.js";
import { recordRawArtifact } from "../session-state.js";
import { deriveCaptureRole, findDeviceRequirement, maxTakeFor } from "../intake-validation.js";
import { findParticipant } from "../participant-intake.js";
import type { StudioArtifactFactoryPort } from "../../ports/artifact-factory.js";
import type { CaptureSourceDescriptor, CaptureSourcePort } from "./capture-source-port.js";
import { createStudioCaptureSession, type StudioCaptureSession } from "./studio-capture-session.js";

/**
 * Open a capture bound to `record`'s session and the consented participant
 * named by `request`, using the runtime's capture source port and artifact
 * factory. Returns the live capture session or an explicit failure.
 */
export async function openCaptureForSession(
  record: StudioSessionRecord,
  request: OpenCaptureRequest,
  ports: {
    readonly captureSourcePort: CaptureSourcePort;
    readonly artifactFactory: StudioArtifactFactoryPort;
  },
): Promise<{ ok: true; capture: StudioCaptureSession } | { ok: false; error: StudioRuntimeError }> {
  const participantResult = findParticipant(record, request.participantId);
  if ("error" in participantResult) {
    return { ok: false, error: participantResult.error };
  }
  const participant = participantResult.participant;
  if (record.formatPlugin.provenanceRequirements.requiresConsentRefsOnRawCapture) {
    if (!participant.consent.coversCapture || participant.consent.consentRefs.length === 0) {
      return { ok: false, error: { kind: "consent-required-for-capture", participantId: request.participantId } };
    }
  }
  if (request.rightsRef.length === 0 || request.provenanceRef.length === 0) {
    return { ok: false, error: { kind: "missing-rights-or-provenance-ref", participantId: request.participantId } };
  }
  const captureRole = deriveCaptureRole(participant);
  if (captureRole === undefined) {
    return {
      ok: false,
      error: { kind: "participant-cannot-capture", participantId: request.participantId, roles: [...participant.roles] },
    };
  }
  const sources: readonly CaptureSourceDescriptor[] = await ports.captureSourcePort.enumerateSources();
  const source = sources.find((entry) => entry.sourceId === request.sourceId);
  if (source === undefined) {
    return { ok: false, error: { kind: "capture-source-not-found", sourceId: request.sourceId } };
  }
  const requirement = findDeviceRequirement(record.formatPlugin, request.mediaKind, request.deviceClass);
  if (requirement === undefined) {
    return {
      ok: false,
      error: {
        kind: "capture-source-insufficient",
        sourceId: request.sourceId,
        reasons: [`format "${record.formatPlugin.id}" declares no ${request.deviceClass} slot for ${request.mediaKind}`],
      },
    };
  }
  const validation = ports.captureSourcePort.validateSource(source, requirement);
  if (!validation.ok) {
    return { ok: false, error: { kind: "capture-source-insufficient", sourceId: request.sourceId, reasons: validation.reasons } };
  }
  const sessionId: StudioSessionId = record.sessionId;
  const captureSession = createStudioCaptureSession({
    captureSourcePort: ports.captureSourcePort,
    artifactFactory: ports.artifactFactory,
    recorder: {
      onRawArtifact: (event) => {
        recordRawArtifact(record, {
          artifact: event.artifact,
          receipt: event.receipt,
          consentRefs: event.consentRefs,
          capturedByParticipantId: request.participantId,
        });
      },
    },
    source,
    targetStorage: request.targetStorage ?? (`mos-studio:capture:${sessionId}` as StorageRef),
    sessionId,
    tenantId: record.tenantId as TenantId,
    takeLabel: `${sessionId}-${request.participantId}`,
    consentRefs: participant.consent.consentRefs,
    rightsRef: request.rightsRef,
    provenanceRef: request.provenanceRef,
    capturedBy: Object.freeze({
      participantId: request.participantId,
      role: captureRole,
      deviceRef: participant.accountBoundary.deviceRef,
      consentRefs: participant.consent.consentRefs,
    }),
    maxTakeSeconds: maxTakeFor(record.formatPlugin, request.mediaKind),
  });
  return { ok: true, capture: captureSession };
}
