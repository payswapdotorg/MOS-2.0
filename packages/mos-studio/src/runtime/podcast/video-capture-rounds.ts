/**
 * Video-podcast capture-round helpers (STUDIO-012). Split from
 * `video-podcast-flow.ts` (file-length policy).
 *
 * One capture round records the answering participant's VIDEO take AND audio
 * take (both media are declared required by the video-podcast format; the
 * runtime's device-requirement validation gates each open — an insufficient
 * camera is a typed capture failure). Transcripts derive from the audio
 * takes through the studio-side ArtifactFactoryPort (closed lineage, §6).
 */

import type { StudioSessionId, TenantId } from "../../contracts/refs.js";
import type { InterviewerSessionSummary } from "../../contracts/interviewer-session.js";
import type { StudioArtifactRef, TranscriptRef } from "../../contracts/studio-artifact-package.js";
import type { StudioRuntime } from "../studio-runtime.js";
import type { StudioRuntimeError } from "../errors.js";
import type { StudioCaptureTakeError } from "../capture/studio-capture-session.js";
import type { StudioArtifactFactoryPort } from "../../ports/artifact-factory.js";
import type { VideoPodcastParticipantPlan } from "./video-podcast-plan.js";

/** The outcome of one video+audio capture round. */
export type VideoCaptureRoundOutcome =
  | { readonly ok: true; readonly video: StudioArtifactRef; readonly audio: StudioArtifactRef }
  | {
      readonly ok: false;
      readonly participantId: string;
      readonly error: StudioRuntimeError | StudioCaptureTakeError;
    };

/** The outcome of the transcript derivation. */
export type VideoTranscriptsOutcome =
  | { readonly ok: true; readonly transcripts: readonly TranscriptRef[] }
  | { readonly ok: false; readonly reason: string };

/** One capture round: the answering participant's video take + audio take. */
export async function captureVideoAudioRound(
  runtime: StudioRuntime,
  sessionId: StudioSessionId,
  participant: VideoPodcastParticipantPlan,
): Promise<VideoCaptureRoundOutcome> {
  const openedVideo = await runtime.openCapture(sessionId, {
    participantId: participant.join.participantId,
    mediaKind: "video",
    deviceClass: "camera",
    sourceId: participant.capture.videoSourceId ?? "",
    rightsRef: participant.capture.rightsRef,
    provenanceRef: participant.capture.provenanceRef,
  });
  if (!openedVideo.ok) {
    return { ok: false, participantId: String(participant.join.participantId), error: openedVideo.error };
  }
  const openedAudio = await runtime.openCapture(sessionId, {
    participantId: participant.join.participantId,
    mediaKind: "audio",
    deviceClass: "microphone",
    sourceId: participant.capture.audioSourceId ?? "mic-studio-48k",
    rightsRef: participant.capture.rightsRef,
    provenanceRef: participant.capture.provenanceRef,
  });
  if (!openedAudio.ok) {
    return { ok: false, participantId: String(participant.join.participantId), error: openedAudio.error };
  }
  await openedVideo.value.start();
  const sealedVideo = await openedVideo.value.stop();
  if (!sealedVideo.ok) {
    return { ok: false, participantId: String(participant.join.participantId), error: sealedVideo.error };
  }
  await openedAudio.value.start();
  const sealedAudio = await openedAudio.value.stop();
  if (!sealedAudio.ok) {
    return { ok: false, participantId: String(participant.join.participantId), error: sealedAudio.error };
  }
  return { ok: true, video: sealedVideo.take.artifact, audio: sealedAudio.take.artifact };
}

/** Transcripts of the spoken answers (audio takes → text intermediates). */
export async function buildVideoTranscripts(
  artifactFactory: StudioArtifactFactoryPort,
  tenantId: TenantId,
  sessionId: StudioSessionId,
  audioTakes: readonly StudioArtifactRef[],
  interview: InterviewerSessionSummary,
): Promise<VideoTranscriptsOutcome> {
  const transcripts: TranscriptRef[] = [];
  for (const take of audioTakes) {
    const created = await artifactFactory.createArtifact({
      tenantId,
      type: "text",
      stage: "intermediate",
      creationMethod: "organization-transform",
      storageRef: `mos-studio:video-transcript:${String(sessionId)}:${String(take.artifactId)}` as StudioArtifactRef["storageRef"],
      content: new TextEncoder().encode(
        `video-transcript|${String(sessionId)}|${interview.presentations.map((p) => p.questionText).join(" // ")}`,
      ),
      rightsRef: take.rightsRef,
      provenanceRef: take.provenanceRef,
      parents: [take],
    });
    if (!created.ok) {
      return { ok: false, reason: JSON.stringify(created.error) };
    }
    transcripts.push(Object.freeze({ artifact: created.artifact, language: "en", diarized: true }));
  }
  return { ok: true, transcripts };
}
