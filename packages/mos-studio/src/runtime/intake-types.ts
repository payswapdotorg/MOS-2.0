/**
 * Session intake input types of the Studio runtime (STUDIO-001).
 *
 * Every input the runtime accepts is fully explicit: the ProductionRequest
 * entry mode supplies the read-only request view + intake facts; the
 * standalone entry mode supplies the user's intent. The runtime never
 * guesses an input kind, source rights state or participant plan (§13/§14,
 * never-silent-swap discipline).
 */

import type {
  CaptureDeviceClass,
  CaptureMediaKind,
} from "../contracts/capture.js";
import type { OrganizationSupplier, StudioOrganizationRef } from "../contracts/organization-loading.js";
import type {
  AccountRef,
  ArtifactId,
  ConsentRef,
  DeviceRef,
  IdentityRef,
  MoneyAmount,
  ProvenanceRef,
  RightsRef,
  SessionParticipantId,
  SessionParticipantRole,
  TenantId,
  Timestamp,
  AcceptanceCriteriaRef,
  DelayPolicyRef,
  ReturnContractRef,
  StrategyRef,
  TransformGraphRef,
  ProductionRequestId,
  StorageRef,
} from "../contracts/refs.js";
import type {
  SessionIntakeForValidation,
  StudioFormatVersion,
  StudioInputKind,
} from "../contracts/studio-format.js";
import type {
  StudioProductionBudget,
  StudioProductionRequestView,
} from "../contracts/studio-session.js";
import type { StudioArtifactRef, TranscriptRef, ConversationGraphRef, EditGraphRef } from "../contracts/studio-artifact-package.js";
import type { StudioDecisionActor, StudioOutputReviewOutcome, StudioRejection } from "../contracts/treatment.js";

/** Standalone entry intent (§13): user creates a session without a Lab request. */
export interface StandaloneSessionIntent {
  readonly supplier: Extract<OrganizationSupplier, { kind: "standalone-user" }>;
  readonly tenantId: TenantId;
  readonly format: StudioFormatVersion;
  readonly inputKind: StudioInputKind;
  /** The user's intent text (objective). */
  readonly intent: string;
  /** Source material to react to / work from (required for intent-with-source-material). */
  readonly sourceArtifacts?: readonly {
    readonly artifactId: ArtifactId;
    readonly rightsCleared: boolean;
  }[];
  readonly organizationRef: StandaloneSessionIntentOrganizationRefInput;
  /** Planned participant count, when known (validated at intake if provided). */
  readonly plannedParticipants?: number;
  readonly budget?: StudioProductionBudget;
  readonly deadline?: Timestamp | null;
}

/** Organization reference supplied by the standalone user. */
export interface StandaloneSessionIntentOrganizationRefInput {
  readonly id: string;
  readonly version: number;
}

/** Session creation input: Lab/production request OR standalone intent. */
export type CreateStudioSessionInput =
  | {
      readonly kind: "production-request";
      readonly request: StudioProductionRequestView;
      readonly supplier: OrganizationSupplier;
      readonly tenantId: TenantId;
      /**
       * Explicit intake facts for format validation (input kind, source
       * rights state, planned participant count). The runtime never guesses
       * these from the request.
       */
      readonly intake: SessionIntakeForValidation;
    }
  | {
      readonly kind: "standalone-intent";
      readonly intent: StandaloneSessionIntent;
    };

/**
 * Request to join one participant to a session (§15 — every field separate).
 *
 * STUDIO-006: consent coverage is NO LONGER caller-asserted. The caller
 * supplies identity/consent REFERENCES only; the runtime resolves them
 * through the REAL identity + rights authorities behind the studio ports
 * (ParticipantIdentityPort / ParticipantConsentPort) and derives the coverage
 * verdicts. No participant credentials are ever supplied or stored — the
 * account boundary is referenced, never merged.
 */
export interface JoinParticipantRequest {
  readonly participantId: SessionParticipantId;
  readonly identityRef: IdentityRef;
  readonly accountBoundary: { readonly accountId: AccountRef; readonly deviceRef?: DeviceRef };
  readonly roles: readonly SessionParticipantRole[];
  readonly grantedActions: readonly string[];
  readonly grant: { readonly grantedBy: IdentityRef; readonly expiresAt?: Timestamp };
  /** Consent record refs covering this participant's contribution (resolved live). */
  readonly consent: {
    readonly consentRefs: readonly ConsentRef[];
  };
}

/** Request to open a capture bound to a session participant (STUDIO-005). */
export interface OpenCaptureRequest {
  readonly participantId: SessionParticipantId;
  readonly mediaKind: CaptureMediaKind;
  readonly deviceClass: CaptureDeviceClass;
  readonly sourceId: string;
  /** Rights context covering the captured contribution (explicit, §27). */
  readonly rightsRef: RightsRef;
  /** Provenance record labeling this capture (explicit, §30). */
  readonly provenanceRef: ProvenanceRef;
  /** Storage namespace for takes (default: studio session namespace). */
  readonly targetStorage?: StorageRef;
}

/**
 * Request to import one source/reference artifact into a session as an
 * ACQUIRED INPUT (STUDIO-009; §6 pipeline stage "reference → acquired input";
 * §16 reaction production reacts to rights-cleared source material).
 *
 * The import is RIGHTS-GATED on the format's declarations
 * (`captureRequirements.allowsMediaImport` +
 * `inputRequirements.requiresRightsClearedSources`): an uncleared source is
 * a TYPED failure, never silently admitted (§27 — public URL accessibility
 * never implies media rights). Consent refs cover the source's contribution
 * to the packaged output (§15/§27) and the optional holder identity lets the
 * §15 live re-resolution at operator actions (STUDIO-014) re-check the
 * source holder's consent at the NEXT operator action after a revocation.
 */
export interface ImportSourceArtifactRequest {
  /** The artifact id of the acquired input (must be non-blank). */
  readonly artifactId: ArtifactId;
  /** Media type of the source content (coarse studio classification). */
  readonly type: "audio" | "video" | "image" | "text" | "timeline" | "graph";
  /** Where the source bytes live (object/media storage ref — never inline). */
  readonly storageRef: StorageRef;
  /** Content bytes for digest computation (disclosed double seam). */
  readonly content?: Uint8Array;
  /** Whether the source's rights context clears it for this production (§27). */
  readonly rightsCleared: boolean;
  /** Rights context reference covering the source (explicit, never inferred). */
  readonly rightsRef: RightsRef;
  /** Provenance record reference labeling the source (§30). */
  readonly provenanceRef: ProvenanceRef;
  /** Consent records covering the source's contribution to the output (§15/§27). */
  readonly consentRefs?: readonly ConsentRef[];
  /**
   * STUDIO-014 (§15/§27): the identity of the source's consenting holder.
   * Recorded with the raw coverage entry so operator actions re-resolve the
   * source consent live (a revoked source consent surfaces at the next
   * operator action, never silently passes).
   */
  readonly sourceHolderIdentityRef?: IdentityRef;
}

/** Processing output produced through the loaded organization (§6/§17). */
export interface StudioProcessingOutput {
  readonly intermediateArtifacts: readonly StudioArtifactRef[];
  readonly finalArtifacts: readonly StudioArtifactRef[];
  readonly transcriptRefs?: readonly TranscriptRef[];
  /**
   * STUDIO-011: the REAL conversation graph the organization derived the
   * processing from (question/answer nodes from the adaptive interview). When
   * absent the packaged output synthesizes the session-scoped reference
   * (formats without an adaptive-interview conversation).
   */
  readonly conversationGraphRef?: ConversationGraphRef;
  /**
   * STUDIO-013: the REAL recorded edit graph of the composition — REQUIRED
   * for packaging (the authority fails closed with
   * `edit-graph-ref-required` when a session packages without one; the W1-C
   * synthesized placeholder is gone).
   */
  readonly editGraphRef?: EditGraphRef;
  /**
   * Declared processing cost (finite, non-negative, one currency — the
   * W9-B D5 guard rejects NaN/Infinity/negative amounts at intake AND at
   * packaging).
   */
  readonly additionalCost?: MoneyAmount;
  /** Declared processing seconds (finite, non-negative — W9-B D5 guard). */
  readonly processingSeconds?: number;
}

/** Review submission input (§19 outcomes). */
export interface SubmitReviewInput {
  readonly targetArtifactId: string;
  readonly outcome: StudioOutputReviewOutcome;
  readonly rejection?: StudioRejection;
  readonly decidedBy: StudioDecisionActor;
}

const STANDALONE_SCOPE = "studio:standalone" as const;
const standaloneRef = (kind: string): string => `mos-studio:standalone:${kind}`;

/**
 * Materialize the standalone intent into a studio-side request view.
 *
 * DISCLOSED (Wave 1 reconciliation): the `production` module (CORE-004) is
 * not in this base, so the standalone flow materializes the request view
 * studio-side. Cross-authority refs (strategy, transform graph, acceptance
 * criteria, delay policy, rights context, return contract) carry explicit
 * studio-namespaced placeholder identities that a later wave replaces with
 * real refs from the landed modules — they are opaque ids, never business
 * data.
 */
export function materializeStandaloneRequest(
  intent: StandaloneSessionIntent,
  nextRequestId: () => string,
): StudioProductionRequestView {
  return {
    id: nextRequestId() as ProductionRequestId,
    version: 1,
    scope: STANDALONE_SCOPE,
    objective: intent.intent,
    sourceArtifacts: intent.sourceArtifacts?.map((s) => s.artifactId) ?? [],
    strategyRef: standaloneRef("strategy") as StrategyRef,
    transformGraphRef: standaloneRef("transform-graph") as TransformGraphRef,
    organizationRef: {
      id: intent.organizationRef.id as StudioOrganizationRef["id"],
      version: intent.organizationRef.version,
    },
    studioFormat: intent.format,
    capabilityRequirements: [],
    humanTasks: [],
    acceptanceCriteria: standaloneRef("acceptance") as AcceptanceCriteriaRef,
    budget: intent.budget ?? { limit: { currency: "USD", amount: "0.00" } },
    deadline: intent.deadline ?? null,
    delayPolicy: standaloneRef("delay-policy") as DelayPolicyRef,
    rightsContext: standaloneRef("rights-context") as RightsRef,
    returnContract: standaloneRef("return-contract") as ReturnContractRef,
  };
}
