/**
 * Audio-podcast transcript helper (STUDIO-011). Split from
 * `audio-podcast-flow.ts` (file-length policy — the same split the
 * video-podcast flow made into `video-capture-rounds.ts`).
 *
 * Transcripts of the interview answers derive from the raw audio takes
 * through the studio-side ArtifactFactoryPort (closed lineage, §6: every
 * transcript's parents = its raw take; §14 labels travel on the artifact
 * references the conversation graph is later derived from).
 */

import type { StudioSessionId, TenantId } from "../../contracts/refs.js";
import type { InterviewerSessionSummary } from "../../contracts/interviewer-session.js";
import type { StudioArtifactRef, TranscriptRef } from "../../contracts/studio-artifact-package.js";
import type { StudioArtifactFactoryPort } from "../../ports/artifact-factory.js";

/** The outcome of the audio-podcast transcript derivation. */
export type AudioTranscriptsOutcome =
  | { readonly ok: true; readonly transcripts: readonly TranscriptRef[] }
  | { readonly ok: false; readonly reason: string };

/** Transcripts of the spoken answers (raw audio takes → text intermediates). */
export async function buildAudioTranscripts(
  artifactFactory: StudioArtifactFactoryPort,
  tenantId: TenantId,
  sessionId: StudioSessionId,
  rawTakes: readonly StudioArtifactRef[],
  interview: InterviewerSessionSummary,
): Promise<AudioTranscriptsOutcome> {
  const transcripts: TranscriptRef[] = [];
  for (const raw of rawTakes) {
    const created = await artifactFactory.createArtifact({
      tenantId,
      type: "text",
      stage: "intermediate",
      creationMethod: "organization-transform",
      storageRef: `mos-studio:transcript:${String(sessionId)}:${String(raw.artifactId)}` as StudioArtifactRef["storageRef"],
      content: new TextEncoder().encode(
        `transcript|${String(interview.sessionId)}|${interview.presentations.map((p) => p.questionText).join(" // ")}`,
      ),
      rightsRef: raw.rightsRef,
      provenanceRef: raw.provenanceRef,
      parents: [raw],
    });
    if (!created.ok) {
      return { ok: false, reason: JSON.stringify(created.error) };
    }
    transcripts.push(Object.freeze({ artifact: created.artifact, language: "en", diarized: true }));
  }
  return { ok: true, transcripts };
}
