/**
 * DISCLOSED TEST DOUBLE — in-memory capture source port (STUDIO-005).
 *
 * This adapter is an in-memory simulation for contract tests. It synthesizes
 * deterministic media bytes per take and computes REAL sha-256 digests, but
 * it does NOT capture from any audio/video device. It must never be
 * represented as live device capture or production evidence (AGENTS.md
 * "Verification": mocks test contracts, not production claims).
 *
 * Real capture bindings arrive with the browser/desktop shells in later
 * waves.
 */

import { createHash } from "node:crypto";
import type {
  CaptureDeviceRequirement,
  CaptureMediaKind,
  CapturedMediaReceipt,
} from "../../contracts/capture.js";
import type { DurationSeconds, Timestamp } from "../../contracts/refs.js";
import type {
  CaptureSourceDescriptor,
  CaptureSourcePort,
  CaptureSourceValidation,
  RawCaptureHandle,
  RawCaptureParams,
} from "./capture-source-port.js";

/** Options for the in-memory double. */
export interface InMemoryCaptureSourceOptions {
  /** Injectable clock (default: real wall clock) — receipts carry `capturedAt`. */
  readonly now?: () => Timestamp;
  /** Fixed take duration (default: elapsed time between start and stop). */
  readonly fixedTakeSeconds?: DurationSeconds;
}

const STANDARD_SOURCES: readonly CaptureSourceDescriptor[] = [
  {
    sourceId: "mic-studio-48k",
    mediaKind: "audio",
    deviceClass: "microphone",
    label: "Studio microphone (48 kHz stereo)",
    characteristics: { sampleRateHz: 48_000, channelCount: 2 },
  },
  {
    sourceId: "mic-built-in-low",
    mediaKind: "audio",
    deviceClass: "microphone",
    label: "Built-in microphone (8 kHz mono)",
    characteristics: { sampleRateHz: 8_000, channelCount: 1 },
  },
  {
    sourceId: "cam-hd-720",
    mediaKind: "video",
    deviceClass: "camera",
    label: "HD camera (720p 30fps)",
    characteristics: { resolution: "1280x720", frameRate: 30 },
  },
  {
    sourceId: "cam-low-360",
    mediaKind: "video",
    deviceClass: "camera",
    label: "Low-grade camera (360p 15fps)",
    characteristics: { resolution: "640x360", frameRate: 15 },
  },
  {
    sourceId: "screen-1080",
    mediaKind: "video",
    deviceClass: "screen-capture",
    label: "Screen capture (1080p 30fps)",
    characteristics: { resolution: "1920x1080", frameRate: 30 },
  },
];

function parseResolution(resolution: string): { width: number; height: number } | undefined {
  const match = /^(?<width>\d+)x(?<height>\d+)$/.exec(resolution);
  if (match?.groups === undefined) {
    return undefined;
  }
  return { width: Number(match.groups.width), height: Number(match.groups.height) };
}

/** Create the disclosed in-memory capture source test double. */
export function createInMemoryCaptureSourcePort(
  options: InMemoryCaptureSourceOptions = {},
): CaptureSourcePort & { readonly sources: readonly CaptureSourceDescriptor[] } {
  const now = options.now ?? (() => new Date().toISOString() as Timestamp);
  let takeCounter = 0;

  const validateSource = (
    source: CaptureSourceDescriptor,
    requirement: CaptureDeviceRequirement,
  ): CaptureSourceValidation => {
    const reasons: string[] = [];
    if (source.mediaKind !== requirement.mediaKind) {
      reasons.push(`media kind mismatch: source is "${source.mediaKind}", requirement wants "${requirement.mediaKind}"`);
    }
    if (source.deviceClass !== requirement.deviceClass) {
      reasons.push(`device class mismatch: source is "${source.deviceClass}", requirement wants "${requirement.deviceClass}"`);
    }
    if (
      requirement.sampleRateHz !== undefined &&
      (source.characteristics.sampleRateHz ?? 0) < requirement.sampleRateHz
    ) {
      reasons.push(
        `sample rate too low: source offers ${source.characteristics.sampleRateHz ?? 0} Hz, requirement wants >= ${requirement.sampleRateHz} Hz`,
      );
    }
    if (
      requirement.channelCount !== undefined &&
      (source.characteristics.channelCount ?? 0) < requirement.channelCount
    ) {
      reasons.push(
        `channel count too low: source offers ${source.characteristics.channelCount ?? 0}, requirement wants >= ${requirement.channelCount}`,
      );
    }
    if (requirement.resolutionMin !== undefined) {
      const want = parseResolution(requirement.resolutionMin);
      const have = source.characteristics.resolution === undefined ? undefined : parseResolution(source.characteristics.resolution);
      if (want === undefined) {
        reasons.push(`requirement resolution "${requirement.resolutionMin}" is not WxH parseable`);
      } else if (have === undefined) {
        reasons.push(`source exposes no resolution, requirement wants >= ${requirement.resolutionMin}`);
      } else if (have.width * have.height < want.width * want.height) {
        reasons.push(
          `resolution too low: source offers ${source.characteristics.resolution}, requirement wants >= ${requirement.resolutionMin}`,
        );
      }
    }
    if (
      requirement.frameRateMin !== undefined &&
      (source.characteristics.frameRate ?? 0) < requirement.frameRateMin
    ) {
      reasons.push(
        `frame rate too low: source offers ${source.characteristics.frameRate ?? 0} fps, requirement wants >= ${requirement.frameRateMin} fps`,
      );
    }
    return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
  };

  return {
    sources: STANDARD_SOURCES,
    async enumerateSources(): Promise<readonly CaptureSourceDescriptor[]> {
      return STANDARD_SOURCES;
    },
    validateSource,
    async openRawCapture(params: RawCaptureParams): Promise<RawCaptureHandle> {
      const takeIndex = ++takeCounter;
      let startedAt: Timestamp | null = null;
      let sealed = false;
      return {
        async start(): Promise<void> {
          if (sealed) {
            throw new Error("in-memory capture: take already sealed");
          }
          startedAt = now();
        },
        async stop(): Promise<CapturedMediaReceipt> {
          if (sealed || startedAt === null) {
            throw new Error("in-memory capture: stop() before start()");
          }
          sealed = true;
          const stoppedAt = now();
          const durationSeconds =
            options.fixedTakeSeconds !== undefined
              ? options.fixedTakeSeconds
              : Math.max(1, Math.round((Date.parse(stoppedAt) - Date.parse(startedAt)) / 1000));
          // Deterministic synthetic bytes: no real device is involved.
          const mediaKind: CaptureMediaKind = params.source.mediaKind;
          const synthesized = new TextEncoder().encode(
            `in-memory-capture|${params.source.sourceId}|${params.takeLabel}|${takeIndex}|${mediaKind}|${durationSeconds}s`,
          );
          const digest = `sha256:${createHash("sha256").update(synthesized).digest("hex")}` as CapturedMediaReceipt["digest"];
          const storageRef = `${params.targetStorage}/takes/${params.takeLabel}-${takeIndex}` as CapturedMediaReceipt["storageRef"];
          return Object.freeze({
            mediaKind,
            capturedBy: params.capturedBy,
            durationSeconds,
            storageRef,
            digest,
            capturedAt: stoppedAt,
          });
        },
        async abort(): Promise<void> {
          sealed = true;
        },
      };
    },
  };
}
