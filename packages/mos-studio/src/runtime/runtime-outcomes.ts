/**
 * Public value/type surface of the Studio runtime (STUDIO-001).
 *
 * Split out of `studio-runtime.ts` to keep every managed file under the
 * 500-line policy limit: the runtime class keeps the logic, this file holds
 * the dependency bundle and the per-method success value shapes that the
 * package index re-exports.
 */

import type { Timestamp } from "../contracts/refs.js";
import type { SessionParticipant, StudioSession } from "../contracts/studio-session.js";
import type { StudioArtifactPackage, StudioArtifactRef } from "../contracts/studio-artifact-package.js";
import type { OutputTreatmentResult, StudioOutputReview, StudioOutputTreatmentPort } from "../contracts/treatment.js";
import type { StudioOrganizationLoader } from "../contracts/organization-loading.js";
import type { StudioArtifactFactoryPort } from "../ports/artifact-factory.js";
import type { ParticipantConsentPort } from "../ports/participant-consent.js";
import type { ParticipantIdentityPort } from "../ports/participant-identity.js";
import type { FormatRegistry } from "./format-registry.js";
import type { CaptureSourcePort } from "./capture/capture-source-port.js";

/** Dependencies the runtime is composed from (all studio-owned ports). */
export interface StudioRuntimeDeps {
  readonly formatRegistry: FormatRegistry;
  readonly organizationLoader: StudioOrganizationLoader;
  readonly artifactFactory: StudioArtifactFactoryPort;
  readonly treatmentExecutor: StudioOutputTreatmentPort;
  readonly captureSourcePort: CaptureSourcePort;
  /**
   * STUDIO-006: the REAL identity + rights authorities behind the studio's
   * narrow participant ports (identity/rights remain the authorities; the
   * studio only consumes them).
   */
  readonly participantIdentityPort: ParticipantIdentityPort;
  readonly participantConsentPort: ParticipantConsentPort;
  /** Injectable clock (default: real UTC ISO timestamps). */
  readonly clock?: () => Timestamp;
  /** Injectable id source (default: crypto.randomUUID). */
  readonly idFactory?: () => string;
}

/** Successful createSession outcome value. */
export interface CreatedSessionValue {
  readonly session: StudioSession;
}

/** Successful loadOrganization outcome value. */
export interface LoadedOrganizationValue {
  readonly session: StudioSession;
}

/** Successful joinParticipant outcome value. */
export interface JoinedParticipantValue {
  readonly session: StudioSession;
  readonly participant: SessionParticipant;
}

/** Successful submitReview outcome value. */
export interface ReviewHandledValue {
  readonly session: StudioSession;
  readonly review: StudioOutputReview;
  /** Present when the review accepted the output (assembled package version). */
  readonly package?: StudioArtifactPackage;
}

/** Successful importSourceArtifact outcome value (STUDIO-009). */
export interface ImportedSourceValue {
  readonly session: StudioSession;
  /** The imported acquired-input artifact version (stage `raw`, §6). */
  readonly source: StudioArtifactRef;
}

/** Successful applyTreatment outcome value. */
export interface TreatmentAppliedValue {
  readonly session: StudioSession;
  readonly result: OutputTreatmentResult;
  /** New package version when the treatment ran against a packaged session. */
  readonly package?: StudioArtifactPackage;
}

/** Simple session-snapshot outcome value shared by several methods. */
export interface SessionSnapshotValue {
  readonly session: StudioSession;
}
