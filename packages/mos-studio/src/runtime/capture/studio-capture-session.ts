/**
 * Studio capture session (STUDIO-005).
 *
 * One open capture bound to exactly one Studio session and one CONSENTED
 * participant (§15: attribution through per-participant bindings — never a
 * merged credential). Created only by the Studio runtime after it has
 * verified participant consent (§27); completing a take emits a RAW artifact
 * reference with provenance labeling (stage `raw`, creation method
 * `human-capture`, explicit rights + provenance refs) back into the session.
 *
 * The bytes themselves never cross this interface: the take returns a
 * storage ref + digest, and the artifact reference is created through the
 * studio-side artifact factory port (AGENTS.md "Media").
 */

import type { CapturedMediaReceipt } from "../../contracts/capture.js";
import type {
  ConsentRef,
  RightsRef,
  StorageRef,
  StudioSessionId,
  TenantId,
} from "../../contracts/refs.js";
import type { StudioArtifactRef } from "../../contracts/studio-artifact-package.js";
import type { StudioArtifactFactoryPort } from "../../ports/artifact-factory.js";
import type { CaptureSourceDescriptor, CaptureSourcePort } from "./capture-source-port.js";

/** Where a completed take is recorded inside the Studio session. */
export interface RawArtifactRecorder {
  onRawArtifact(input: {
    readonly sessionId: StudioSessionId;
    readonly artifact: StudioArtifactRef;
    readonly receipt: CapturedMediaReceipt;
    readonly consentRefs: readonly ConsentRef[];
  }): void;
}

/** A completed capture take: device receipt plus the emitted raw artifact ref. */
export interface StudioCaptureTakeResult {
  readonly receipt: CapturedMediaReceipt;
  readonly artifact: StudioArtifactRef;
}

/** Failure modes of sealing a take. */
export type StudioCaptureTakeError =
  | { readonly kind: "artifact-factory-failed"; readonly reason: string }
  | { readonly kind: "take-not-started" }
  | { readonly kind: "take-already-sealed" };

/** Result of `stop()` on a Studio capture session. */
export type StudioCaptureTakeOutcome =
  | { readonly ok: true; readonly take: StudioCaptureTakeResult }
  | { readonly ok: false; readonly error: StudioCaptureTakeError };

/** Dependencies needed to run a capture session bound to studio state. */
export interface StudioCaptureSessionDeps {
  readonly captureSourcePort: CaptureSourcePort;
  readonly artifactFactory: StudioArtifactFactoryPort;
  readonly recorder: RawArtifactRecorder;
  readonly source: CaptureSourceDescriptor;
  readonly targetStorage: StorageRef;
  readonly sessionId: StudioSessionId;
  readonly tenantId: TenantId;
  readonly takeLabel: string;
  readonly consentRefs: readonly ConsentRef[];
  readonly rightsRef: RightsRef;
  readonly provenanceRef: StudioArtifactRef["provenanceRef"];
  readonly capturedBy: CapturedMediaReceipt["capturedBy"];
  readonly maxTakeSeconds?: number;
}

/**
 * A capture session bound to a studio session + consented participant.
 * Start/stop map to the underlying raw capture handle; `stop()` seals the
 * take, materializes the raw artifact ref and records it into the session.
 */
export class StudioCaptureSession {
  private readonly deps: StudioCaptureSessionDeps;
  private handle: Awaited<ReturnType<CaptureSourcePort["openRawCapture"]>> | null = null;
  private sealed = false;

  constructor(deps: StudioCaptureSessionDeps) {
    this.deps = deps;
  }

  /** The studio session this capture is bound to. */
  get sessionId(): StudioSessionId {
    return this.deps.sessionId;
  }

  /** The participant attribution stamped on the emitted receipt. */
  get capturedBy(): CapturedMediaReceipt["capturedBy"] {
    return this.deps.capturedBy;
  }

  async start(): Promise<void> {
    if (this.sealed) {
      throw new Error("studio capture: session already sealed");
    }
    this.handle = await this.deps.captureSourcePort.openRawCapture({
      source: this.deps.source,
      maxTakeSeconds: this.deps.maxTakeSeconds,
      targetStorage: this.deps.targetStorage,
      takeLabel: this.deps.takeLabel,
      capturedBy: this.deps.capturedBy,
    });
    await this.handle.start();
  }

  /** Seal the take and emit the raw artifact ref with provenance labeling. */
  async stop(): Promise<StudioCaptureTakeOutcome> {
    if (this.handle === null) {
      return { ok: false, error: { kind: "take-not-started" } };
    }
    if (this.sealed) {
      return { ok: false, error: { kind: "take-already-sealed" } };
    }
    const receipt = await this.handle.stop();
    this.sealed = true;
    const creation = await this.deps.artifactFactory.createArtifact({
      tenantId: this.deps.tenantId,
      type: receipt.mediaKind === "audio" ? "audio" : "video",
      stage: "raw",
      creationMethod: "human-capture",
      storageRef: receipt.storageRef,
      precomputedDigest: receipt.digest,
      rightsRef: this.deps.rightsRef,
      provenanceRef: this.deps.provenanceRef,
      parents: [],
    });
    if (!creation.ok) {
      return {
        ok: false,
        error: { kind: "artifact-factory-failed", reason: JSON.stringify(creation.error) },
      };
    }
    this.deps.recorder.onRawArtifact({
      sessionId: this.deps.sessionId,
      artifact: creation.artifact,
      receipt,
      consentRefs: this.deps.consentRefs,
    });
    return { ok: true, take: { receipt, artifact: creation.artifact } };
  }

  async abort(): Promise<void> {
    this.sealed = true;
    await this.handle?.abort();
  }
}

/** Factory (used by the runtime; exported for tests of the binding itself). */
export function createStudioCaptureSession(deps: StudioCaptureSessionDeps): StudioCaptureSession {
  return new StudioCaptureSession(deps);
}
