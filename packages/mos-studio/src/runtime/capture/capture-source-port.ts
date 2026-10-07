/**
 * Audio/video capture source port (STUDIO-005).
 *
 * The Studio consumes capture through this declared port: enumerate
 * available sources, validate a source against a format's device
 * requirement, and open a raw capture that returns a device receipt.
 *
 * Wave 1 binding: a DISCLOSED in-memory test double
 * (./in-memory-capture-source.ts) — it synthesizes deterministic bytes and
 * computes real sha-256 digests but is NOT real device capture. Real
 * bindings arrive with the web/desktop shells (browser media APIs behind the
 * platform port) in later waves.
 *
 * Basis: §13 (capture stage), §15 (each capture source binds to exactly one
 * participant account boundary; credentials never merged), §6/AGENTS "Media"
 * (captured bytes go to object/media storage; only refs + digests cross the
 * control plane), §27 (capture may not start without participant
 * authorization/consent — enforced by the runtime before a handle opens).
 */

import type {
  CaptureDeviceRequirement,
  CaptureMediaKind,
  CaptureParticipantBinding,
  CapturedMediaReceipt,
} from "../../contracts/capture.js";
import type { DurationSeconds, StorageRef } from "../../contracts/refs.js";

/** One enumerable capture source (device) as seen through the port. */
export interface CaptureSourceDescriptor {
  readonly sourceId: string;
  readonly mediaKind: CaptureMediaKind;
  readonly deviceClass: CaptureSourceDescriptorDeviceClass;
  readonly label: string;
  /** Measured characteristics used to validate against format requirements. */
  readonly characteristics: {
    readonly sampleRateHz?: number;
    readonly channelCount?: number;
    readonly resolution?: string;
    readonly frameRate?: number;
  };
}

/** Device classes a source can expose (aligned with contracts/capture.ts). */
export type CaptureSourceDescriptorDeviceClass = "microphone" | "camera" | "screen-capture";

/** Result of validating a source against a device requirement. */
export type CaptureSourceValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly reasons: readonly string[] };

/** Parameters for opening one raw capture take. */
export interface RawCaptureParams {
  readonly source: CaptureSourceDescriptor;
  /** Declared maximum take length (guidance surfaced to the capture UX). */
  readonly maxTakeSeconds?: DurationSeconds;
  /** Storage destination for the captured bytes (object/media storage ref). */
  readonly targetStorage: StorageRef;
  /** Stable label folded into the storage ref (session + participant + take). */
  readonly takeLabel: string;
  /** Participant binding stamped onto the emitted receipt (§15 attribution). */
  readonly capturedBy: CaptureParticipantBinding;
}

/** An open raw capture take. */
export interface RawCaptureHandle {
  start(): Promise<void>;
  /** Stop and seal the take; returns the device receipt (digest + storage ref). */
  stop(): Promise<CapturedMediaReceipt>;
  abort(): Promise<void>;
}

/**
 * The capture source port consumed by the Studio runtime.
 * Implementations enumerate/validate/open; they never decide consent — the
 * runtime refuses to open a capture for a participant without verified
 * consent BEFORE any handle is created (§27).
 */
export interface CaptureSourcePort {
  enumerateSources(): Promise<readonly CaptureSourceDescriptor[]>;
  validateSource(source: CaptureSourceDescriptor, requirement: CaptureDeviceRequirement): CaptureSourceValidation;
  openRawCapture(params: RawCaptureParams): Promise<RawCaptureHandle>;
}
