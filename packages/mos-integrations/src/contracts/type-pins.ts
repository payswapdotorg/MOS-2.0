/**
 * Compile-time structural pins for the integrations contracts (INTEG-001).
 *
 * TYPE-LEVEL assertions only — they emit no runtime code and fail `tsc`
 * (therefore every build and test run) the moment a contract drifts. The
 * runtime twins of these pins (strict-shape registration validation,
 * provider-name scans, no-network scans) live in the *.test.ts files.
 *
 * Pins:
 * 1. CREDENTIAL-NEVER-IN-CONTROL-PLANE: MerchantClientInstance,
 *    ProviderDefinition, ProviderInteractionRecord and
 *    ProviderTransportRequest have EXACTLY the pinned keysets — no field
 *    can carry a credential value (the only credential-adjacent surface is
 *    the opaque CredentialRef handle).
 * 2. CredentialRef and RightsContextRef are opaque branded handles: a
 *    plain string is NOT assignable to them.
 * 3. The implementation status vocabulary preserves `unknown` first-class
 *    (it is a member of the union, distinct from `unavailable`).
 */

import type { Branded } from "@mos/contracts";

import type { AvailabilityCapability } from "./availability-capability.js";
import type { ProviderInteractionRecord } from "./interaction.js";
import type { MerchantClientInstance } from "./merchant-client-instance.js";
import type { ProviderDefinition } from "./provider-definition.js";
import type { ProviderImplementation } from "./provider-implementation.js";
import type {
  CredentialRef,
  ProviderInteractionId,
  RightsContextRef,
} from "./ids.js";
import type { ProviderTransportRequest } from "../ports/provider-transport.port.js";

/** Compile-time assertion helper: the expression must resolve to `true`. */
export type Expect<T extends true> = T;

/** Strict type equality (the CORE-001 type-test helper). */
export type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;

/** True when the keyset of `T` is exactly `K` (no more, no fewer). */
export type ExactKeyset<T, K> = Equal<keyof T, K>;

// --- (1) exact keysets: no credential-value surface anywhere ----------------

type _MerchantClientInstanceKeyset = Expect<
  ExactKeyset<
    MerchantClientInstance,
    | "id"
    | "version"
    | "scope"
    | "name"
    | "merchantIdentity"
    | "externalAccount"
    | "implementationId"
    | "implementationVersion"
    | "credentialRef"
    | "createdAt"
  >
>;

type _ProviderDefinitionKeyset = Expect<
  ExactKeyset<
    ProviderDefinition,
    | "id"
    | "version"
    | "scope"
    | "providerId"
    | "displayName"
    | "kind"
    | "transport"
    | "declaredCapabilities"
    | "externalAccount"
  >
>;

type _ProviderImplementationKeyset = Expect<
  ExactKeyset<
    ProviderImplementation,
    | "id"
    | "version"
    | "scope"
    | "providerId"
    | "definitionId"
    | "definitionVersion"
    | "label"
    | "status"
    | "statusObservedAt"
    | "evidenceRefs"
    | "evidenceModel"
    | "errorModel"
    | "rateLimitObservation"
  >
>;

type _AvailabilityCapabilityKeyset = Expect<
  ExactKeyset<
    AvailabilityCapability,
    "id" | "version" | "scope" | "implementationId" | "capabilityId" | "capabilityVersion" | "constraints" | "createdAt"
  >
>;

type _ProviderInteractionRecordKeyset = Expect<
  ExactKeyset<
    ProviderInteractionRecord,
    | "id"
    | "scope"
    | "instanceId"
    | "providerId"
    | "implementationId"
    | "implementationVersion"
    | "implementationStatus"
    | "capabilityId"
    | "capabilityVersion"
    | "actor"
    | "rightsContextRef"
    | "startedAt"
    | "durationMs"
    | "failure"
    | "warnings"
    | "transportSource"
  >
>;

type _ProviderTransportRequestKeyset = Expect<
  ExactKeyset<
    ProviderTransportRequest,
    | "requestId"
    | "scope"
    | "providerId"
    | "implementationId"
    | "capabilityId"
    | "capabilityVersion"
    | "instanceId"
    | "credentialRef"
    | "parameters"
  >
>;

// --- (2) opaque handles: plain strings are not handles ----------------------

type _CredentialRefIsOpaque = Expect<
  Equal<CredentialRef, Branded<string, "CredentialRef">>
>;
type _RightsContextRefIsOpaque = Expect<
  Equal<RightsContextRef, Branded<string, "RightsContextRef">>
>;
type _InteractionIdIsOpaque = Expect<
  Equal<ProviderInteractionId, Branded<string, "ProviderInteractionId">>
>;

// A plain (unbranded) string is not assignable to any handle type: if the
// brand were ever dropped (CredentialRef = string), these pins fail.

type _PlainStringIsNotACredentialRef = Expect<
  Equal<string extends CredentialRef ? true : false, false>
>;
type _PlainStringIsNotARightsContextRef = Expect<
  Equal<string extends RightsContextRef ? true : false, false>
>;
type _PlainStringIsNotAnInteractionId = Expect<
  Equal<string extends ProviderInteractionId ? true : false, false>
>;

// --- (3) UNKNOWN is a first-class status ------------------------------------

type _UnknownIsAMemberOfTheStatusVocabulary = Expect<
  Equal<"unknown" extends ProviderImplementation["status"] ? true : false, true>
>;
type _UnknownAndUnavailableAreDistinctStatuses = Expect<
  Equal<Equal<"unknown", "unavailable">, false>
>;
