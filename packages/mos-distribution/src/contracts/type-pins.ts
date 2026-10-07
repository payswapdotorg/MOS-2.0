/**
 * Compile-time structural pins for the distribution contracts (SOCIAL-001
 * + the SOCIAL-002..006 provider-profile extension).
 *
 * TYPE-LEVEL assertions only — they emit no runtime code and fail `tsc`
 * (therefore every build and test run) the moment a contract drifts. The
 * runtime twins of these pins (strict-shape request validation,
 * provider-name scans, no-network scans) live in the *.test.ts files.
 *
 * Pins:
 * 1. ARTIFACT-REF-INPUTS (never inline media): PublishSocialPostInput,
 *    ScheduleSocialPostInput, SocialTransportRequest and
 *    SocialPublicationRecord/SocialScheduleRecord have EXACTLY the pinned
 *    keysets — the artifact travels as the canonical ArtifactRef and no
 *    field can carry media bytes.
 * 2. OBSERVATION PURITY (ATTRIB-001 separation): SocialObservationRecord
 *    has EXACTLY the pinned keyset — there is no causal/attribution
 *    field through which an observation could become a causal claim.
 * 3. Opaque handles: plain strings are not assignable to PlatformPostRef
 *    or any distribution record id.
 * 4. UNKNOWN preservation: the capability-matrix support vocabulary
 *    (imported INTEG-001 vocabulary) keeps `unknown` first-class —
 *    distinct from `unsupported`.
 * 5. The rights/policy gate precedence surface: every operation input
 *    extends SocialOperationRequest (carries the RightsContextRef).
 * 6. W7-C provider-profile pins: SocialProviderProfile,
 *    SocialProviderAuthDeclaration, SocialOperationShapeDeclaration and
 *    SocialRateLimitObservationRecord have EXACTLY the pinned keysets —
 *    the auth model is the canonical AuthenticationModel (a KIND
 *    declaration; there is NO credential field on a profile), and the
 *    rate-limit record is pure observed posture (no causal semantics).
 */

import type { AuthenticationModel, JsonObject } from "@mos/contracts";
import type { ArtifactRef } from "@mos/content";
import type { CapabilitySupportLevel } from "@mos/integrations";

import type {
  DeleteSocialPostInput,
  ListSocialRestrictionsInput,
  PublishSocialPostInput,
  ReadSocialObservationsInput,
  ScheduleSocialPostInput,
  SocialOperationRequest,
} from "./social-operation.js";
import type {
  SocialObservationRecord,
  SocialPublicationRecord,
  SocialRestrictionRecord,
  SocialRetractionRecord,
  SocialScheduleRecord,
} from "./social-record.js";
import type {
  PlatformPostRef,
  SocialChannelId,
  SocialDistributionId,
  SocialObservationId,
} from "./ids.js";
import type { SocialDistributionRecord } from "./distribution-record.js";
import type { SocialTransportRequest } from "../ports/social-transport.port.js";
import type {
  SocialOperationShapeDeclaration,
  SocialProviderAuthDeclaration,
  SocialProviderProfile,
} from "./provider-profile.js";
import type { SocialRateLimitObservationRecord } from "./social-rate-limit.js";

/** Compile-time assertion helper: the expression must resolve to `true`. */
export type Expect<T extends true> = T;

/** Strict type equality (the CORE-001 type-test helper). */
export type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;

/** True when the keyset of `T` is exactly `K` (no more, no fewer). */
export type ExactKeyset<T, K> = Equal<keyof T, K>;

// --- (1) artifact-ref inputs: no media-value surface anywhere --------------

type _PublishInputKeyset = Expect<
  ExactKeyset<
    PublishSocialPostInput,
    "scope" | "channelRef" | "actor" | "rightsContextRef" | "idempotencyKey" | "artifact" | "presentation"
  >
>;

type _ScheduleInputKeyset = Expect<
  ExactKeyset<
    ScheduleSocialPostInput,
    "scope" | "channelRef" | "actor" | "rightsContextRef" | "idempotencyKey" | "artifact" | "presentation" | "scheduledAt"
  >
>;

type _ReadObservationsInputKeyset = Expect<
  ExactKeyset<
    ReadSocialObservationsInput,
    "scope" | "channelRef" | "actor" | "rightsContextRef" | "idempotencyKey" | "subjectRef"
  >
>;

type _DeleteInputKeyset = Expect<
  ExactKeyset<
    DeleteSocialPostInput,
    "scope" | "channelRef" | "actor" | "rightsContextRef" | "idempotencyKey" | "postRef"
  >
>;

type _ListRestrictionsInputKeyset = Expect<
  ExactKeyset<
    ListSocialRestrictionsInput,
    "scope" | "channelRef" | "actor" | "rightsContextRef" | "idempotencyKey"
  >
>;

type _PublicationRecordKeyset = Expect<
  ExactKeyset<
    SocialPublicationRecord,
    | "id"
    | "scope"
    | "channelRef"
    | "providerId"
    | "artifact"
    | "presentation"
    | "postRef"
    | "publishedAt"
    | "recordedAt"
    | "source"
  >
>;

type _ScheduleRecordKeyset = Expect<
  ExactKeyset<
    SocialScheduleRecord,
    | "id"
    | "scope"
    | "channelRef"
    | "providerId"
    | "artifact"
    | "presentation"
    | "requestedAt"
    | "scheduledAt"
    | "scheduleRef"
    | "recordedAt"
    | "source"
  >
>;

// --- (2) observation purity: no causal/attribution field -------------------

type _ObservationRecordKeyset = Expect<
  ExactKeyset<
    SocialObservationRecord,
    | "id"
    | "scope"
    | "channelRef"
    | "providerId"
    | "subjectRef"
    | "reported"
    | "observedAt"
    | "recordedAt"
    | "providerRefs"
    | "source"
  >
>;

type _RetractionRecordKeyset = Expect<
  ExactKeyset<
    SocialRetractionRecord,
    "id" | "scope" | "channelRef" | "providerId" | "postRef" | "retractedAt" | "recordedAt" | "source"
  >
>;

type _RestrictionRecordKeyset = Expect<
  ExactKeyset<
    SocialRestrictionRecord,
    "id" | "scope" | "channelRef" | "providerId" | "observedAt" | "description" | "recordedAt" | "source"
  >
>;

type _DistributionRecordKeyset = Expect<
  ExactKeyset<
    SocialDistributionRecord,
    | "id"
    | "scope"
    | "channelRef"
    | "providerId"
    | "operation"
    | "operationSupport"
    | "actor"
    | "rightsContextRef"
    | "policyRef"
    | "startedAt"
    | "durationMs"
    | "failure"
    | "warnings"
    | "transportSource"
  >
>;

type _TransportRequestKeyset = Expect<
  ExactKeyset<
    SocialTransportRequest,
    | "requestId"
    | "scope"
    | "providerId"
    | "channelRef"
    | "instanceRef"
    | "operation"
    | "parameters"
    | "idempotencyKey"
  >
>;

// --- (3) opaque handles + record ids: plain strings are not them ------------

type _PlainStringIsNotAPostRef = Expect<
  Equal<string extends PlatformPostRef ? true : false, false>
>;
type _PlainStringIsNotAChannelId = Expect<
  Equal<string extends SocialChannelId ? true : false, false>
>;
type _PlainStringIsNotADistributionId = Expect<
  Equal<string extends SocialDistributionId ? true : false, false>
>;
type _PlainStringIsNotAnObservationId = Expect<
  Equal<string extends SocialObservationId ? true : false, false>
>;

// --- (4) UNKNOWN is a first-class support level ------------------------------

type _UnknownIsAMemberOfTheSupportVocabulary = Expect<
  Equal<"unknown" extends CapabilitySupportLevel ? true : false, true>
>;
type _UnknownAndUnsupportedAreDistinct = Expect<
  Equal<Equal<"unknown", "unsupported">, false>
>;

// --- (5) every operation input carries the rights frame ---------------------

type _PublishCarriesRightsFrame = Expect<
  Equal<PublishSocialPostInput extends SocialOperationRequest ? true : false, true>
>;
type _ScheduleCarriesRightsFrame = Expect<
  Equal<ScheduleSocialPostInput extends SocialOperationRequest ? true : false, true>
>;
type _ReadObservationsCarriesRightsFrame = Expect<
  Equal<ReadSocialObservationsInput extends SocialOperationRequest ? true : false, true>
>;
type _DeleteCarriesRightsFrame = Expect<
  Equal<DeleteSocialPostInput extends SocialOperationRequest ? true : false, true>
>;
type _ListRestrictionsCarriesRightsFrame = Expect<
  Equal<ListSocialRestrictionsInput extends SocialOperationRequest ? true : false, true>
>;

// The publish input's artifact IS the canonical content artifact ref (type
// identity, not a structural twin — the W2-A reconciliation).
type _ArtifactIsCanonical = Expect<
  Equal<PublishSocialPostInput["artifact"], ArtifactRef>
>;

// --- (6) W7-C provider-profile pins ------------------------------------------

type _ProviderProfileKeyset = Expect<
  ExactKeyset<
    SocialProviderProfile,
    "providerId" | "displayName" | "capabilityMatrix" | "auth" | "operationShapes" | "evidenceBasis"
  >
>;

type _ProviderAuthDeclarationKeyset = Expect<
  ExactKeyset<SocialProviderAuthDeclaration, "model" | "flows" | "basis">
>;

type _OperationShapeDeclarationKeyset = Expect<
  ExactKeyset<
    SocialOperationShapeDeclaration,
    "operation" | "shapes" | "acceptedArtifactTypeFamilies" | "acceptedPresentationKinds" | "basis" | "note"
  >
>;

// The profile's auth model IS the canonical AuthenticationModel (a KIND
// declaration — and that canonical shape has NO credential-value field).
type _ProfileAuthModelIsCanonical = Expect<
  Equal<SocialProviderAuthDeclaration["model"], AuthenticationModel>
>;
type _AuthModelKeyset = Expect<ExactKeyset<AuthenticationModel, "kind" | "managedBy">>;

type _RateLimitObservationRecordKeyset = Expect<
  ExactKeyset<
    SocialRateLimitObservationRecord,
    | "id"
    | "scope"
    | "channelRef"
    | "providerId"
    | "operation"
    | "posture"
    | "observed"
    | "observedAt"
    | "providerRefs"
    | "recordedAt"
    | "source"
  >
>;

// The rate-limit observation record's payload is the canonical JsonObject
// (verbatim platform-said data, structurally pure of causal semantics).
type _RateLimitObservedIsCanonicalJson = Expect<
  Equal<SocialRateLimitObservationRecord["observed"], JsonObject>
>;
