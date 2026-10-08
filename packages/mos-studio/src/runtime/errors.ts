/**
 * Typed result-union failure surface of the Studio runtime (STUDIO-001).
 *
 * Style follows packages/mos-identity: no thrown error classes, every
 * failure is an explicit typed variant so callers must narrow. All failures
 * are LOUD by design — the Studio never silently substitutes a format,
 * organization, participant or artifact (architecture policy
 * `forbidSecondAuthorities`, studio specialRules, WORKER-CONTRACT "keep
 * tenant/rights/provenance boundaries explicit").
 */

import type { FormatInputRejectionReason } from "../contracts/studio-format.js";
import type {
  OrganizationLoadError,
  StudioOrganizationRef,
} from "../contracts/organization-loading.js";
import type { ArtifactId, IdentityRef, SessionParticipantId, StudioSessionId } from "../contracts/refs.js";
import type { StudioSessionLifecycleState } from "../contracts/studio-session.js";
import type { OutputTreatmentRequest, RightsPolicyRejection } from "../contracts/treatment.js";

/** Every failure the Studio runtime can return. */
export type StudioRuntimeError =
  | { readonly kind: "session-not-found"; readonly sessionId: StudioSessionId }
  | {
      readonly kind: "format-not-registered";
      readonly formatId: string;
      readonly version?: number;
    }
  | {
      readonly kind: "invalid-session-input";
      readonly reasons: readonly FormatInputRejectionReason[];
    }
  | {
      readonly kind: "invalid-lifecycle-transition";
      readonly from: StudioSessionLifecycleState;
      readonly to: StudioSessionLifecycleState;
      readonly attemptedBy: string;
    }
  | {
      readonly kind: "operation-not-allowed-in-state";
      readonly operation: string;
      readonly state: StudioSessionLifecycleState;
    }
  | {
      readonly kind: "consent-required-for-join";
      readonly participantId: SessionParticipantId;
      readonly detail: "missing-consent-refs" | "capture-not-covered";
    }
  | {
      readonly kind: "consent-required-for-processing";
      readonly participantId: SessionParticipantId;
    }
  | {
      readonly kind: "consent-required-for-capture";
      readonly participantId: SessionParticipantId;
    }
  | {
      /** STUDIO-006 (§15): the referenced identity principal does not exist in the identity authority. */
      readonly kind: "participant-identity-unknown";
      readonly participantId: SessionParticipantId;
      readonly identityRef: IdentityRef;
    }
  | {
      /** STUDIO-006 (§15): the identity holds no active workspace membership in the session tenant. */
      readonly kind: "participant-not-authorized";
      readonly participantId: SessionParticipantId;
      readonly identityRef: IdentityRef;
    }
  | {
      readonly kind: "participant-not-found";
      readonly participantId: SessionParticipantId;
      readonly sessionId: StudioSessionId;
    }
  | {
      readonly kind: "duplicate-participant";
      readonly participantId: SessionParticipantId;
      readonly sessionId: StudioSessionId;
    }
  | {
      readonly kind: "participant-count-out-of-range";
      readonly count: number;
      readonly minimum: number;
      readonly maximum: number;
    }
  | {
      readonly kind: "role-not-allowed-by-format";
      readonly roles: readonly string[];
      readonly allowedRoles: readonly string[];
    }
  | {
      readonly kind: "participant-cannot-capture";
      readonly participantId: SessionParticipantId;
      readonly roles: readonly string[];
    }
  | {
      readonly kind: "rejection-kind-mismatch";
      readonly outcome: string;
      readonly expectedRejectionKind: string;
      readonly actualRejectionKind: string;
    }
  | {
      readonly kind: "organization-load-failed";
      readonly organizationRef: StudioOrganizationRef;
      readonly error: OrganizationLoadError;
    }
  | {
      readonly kind: "organization-incompatible";
      readonly organizationRef: StudioOrganizationRef;
      readonly incompatibilityReasons: readonly string[];
    }
  | {
      readonly kind: "organization-not-loaded";
      readonly sessionId: StudioSessionId;
    }
  | {
      readonly kind: "capture-source-not-found";
      readonly sourceId: string;
    }
  | {
      /** STUDIO-009 (§6 acquired-input stage): the format forbids media import. */
      readonly kind: "import-not-allowed-by-format";
      readonly formatId: string;
    }
  | {
      /** STUDIO-009 (§16/§27): the imported source declares uncleared rights — fail closed. */
      readonly kind: "source-rights-not-cleared";
      readonly sourceRef: ArtifactId;
    }
  | {
      /** STUDIO-009 (§27/§30): an import must carry explicit rights + provenance refs. */
      readonly kind: "missing-source-rights-or-provenance-ref";
      readonly sourceRef: ArtifactId;
    }
  | {
      readonly kind: "capture-source-insufficient";
      readonly sourceId: string;
      readonly reasons: readonly string[];
    }
  | {
      readonly kind: "missing-rights-or-provenance-ref";
      readonly participantId: SessionParticipantId;
    }
  | {
      readonly kind: "invalid-processing-output";
      readonly reasons: readonly string[];
    }
  | {
      readonly kind: "review-target-not-found";
      readonly artifactId: string;
    }
  | {
      readonly kind: "unsupported-review-outcome";
      readonly outcome: string;
      readonly reason: string;
    }
  | {
      readonly kind: "treatment-target-not-found";
      readonly artifactId: string;
    }
  | {
      readonly kind: "treatment-failed";
      readonly request: OutputTreatmentRequest;
      readonly failure:
        | { readonly kind: "execution-failure"; readonly reason: string }
        | { readonly kind: "rights-policy-rejection"; readonly rejection: RightsPolicyRejection };
    }
  | { readonly kind: "package-not-assembled"; readonly sessionId: StudioSessionId };

/** Ok/failure pair used by every runtime method. */
export type StudioRuntimeOutcome<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: StudioRuntimeError };
