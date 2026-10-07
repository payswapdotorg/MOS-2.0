/**
 * Audio/video capture contracts for the MOS Content Studio.
 *
 * STUDIO-001 interface spike — TYPES ONLY (no runtime implementation).
 *
 * Basis: spec/mos-architecture-v2.0.md §13 (Content Studio: standalone and
 * Lab entry modes both reach a `capture` stage), §15 (a session may span
 * multiple authorized MOS accounts/devices — each capture source is bound to
 * exactly one participant account boundary; credentials are never merged),
 * §6 (raw capture is an artifact-graph stage; large media moves through
 * object/media storage refs, never control-plane RPC), §27 (participant
 * contributions require explicit authorization/consent — capture may not
 * start without it).
 *
 * Backlog: STUDIO-005 (Audio/Video Capture) implements against these types.
 */

import type {
  ConsentRef,
  DeviceRef,
  DurationSeconds,
  SessionParticipantId,
  StorageRef,
  ContentDigest,
  Timestamp,
} from "./refs.js";

/** Media kinds the Studio can capture. */
export type CaptureMediaKind = "audio" | "video";

/** Capture device classes a format may require. */
export type CaptureDeviceClass = "microphone" | "camera" | "screen-capture";

/**
 * Device-level requirement for one media kind. Deliberately abstract: the
 * browser/desktop shell resolves concrete devices; the Studio contract only
 * states what quality/class of source is acceptable.
 */
export interface CaptureDeviceRequirement {
  readonly deviceClass: CaptureDeviceClass;
  readonly mediaKind: CaptureMediaKind;
  /** Minimum acceptable sample rate in Hz for audio sources. */
  readonly sampleRateHz?: number;
  /** Minimum acceptable resolution (e.g. 1280x720) for video sources. */
  readonly resolutionMin?: string;
  /** Minimum acceptable frame rate for video sources. */
  readonly frameRateMin?: number;
  /** Minimum acceptable channel count for audio sources. */
  readonly channelCount?: number;
}

/** Audio capture requirements declared by a format. */
export interface AudioCaptureRequirements {
  readonly required: boolean;
  readonly devices: readonly CaptureDeviceRequirement[];
  /** Maximum acceptable single-take length, when bounded by the format. */
  readonly maxTakeSeconds?: DurationSeconds;
}

/** Video capture requirements declared by a format. */
export interface VideoCaptureRequirements {
  readonly required: boolean;
  readonly devices: readonly CaptureDeviceRequirement[];
  readonly maxTakeSeconds?: DurationSeconds;
}

/** Combined capture requirements carried by a {@link ./studio-format.ts!StudioFormat StudioFormat}. */
export interface FormatCaptureRequirements {
  readonly audio: AudioCaptureRequirements;
  readonly video: VideoCaptureRequirements;
  /**
   * Whether the format can proceed with imported pre-existing media instead
   * of live capture (e.g. a prerecorded source or an uploaded take). Import
   * is still capture from the artifact-graph perspective: it produces a raw
   * artifact with rights/consent refs (§6: public URLs do not imply rights).
   */
  readonly allowsMediaImport: boolean;
}

/** Roles a participant can hold for a capture source. */
export type CaptureParticipantRole = "interviewer" | "subject" | "operator";

/**
 * Binding of one capture source to one session participant. Multi-account
 * sessions (§15) express "who is recording what" exclusively through these
 * bindings: every captured stream is attributable to exactly one
 * participant, one account boundary and one consent scope.
 */
export interface CaptureParticipantBinding {
  readonly participantId: SessionParticipantId;
  readonly role: CaptureParticipantRole;
  readonly deviceRef?: DeviceRef;
  /** Consent records covering THIS capture (must be present before capture starts). */
  readonly consentRefs: readonly ConsentRef[];
}

/** A fully specified capture plan for one session (types only; no scheduler). */
export interface CapturePlan {
  readonly mediaKind: CaptureMediaKind;
  readonly deviceRequirements: readonly CaptureDeviceRequirement[];
  readonly participantBindings: readonly CaptureParticipantBinding[];
  /** Captured bytes go to object/media storage; only refs cross the control plane. */
  readonly targetStorage: StorageRef;
}

/** Receipt for one completed capture take — becomes a RAW artifact (§6). */
export interface CapturedMediaReceipt {
  readonly mediaKind: CaptureMediaKind;
  readonly capturedBy: CaptureParticipantBinding;
  readonly durationSeconds: DurationSeconds;
  readonly storageRef: StorageRef;
  readonly digest: ContentDigest;
  readonly capturedAt: Timestamp;
}
