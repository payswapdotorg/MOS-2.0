/**
 * In-memory ProviderInteractionPort adapter (INTEG-001 — the call surface
 * runtime).
 *
 * THE single surface through which provider interactions happen. Pipeline
 * (each stage's failure is typed, §30-recorded where attributable, and
 * terminal):
 * 1. resolve the instance IN THE CALLER'S TENANT — cross-tenant ≡ unknown
 *    (§31 no existence leaks; an unresolvable instance yields the
 *    `unresolved-instance` outcome with NO audit record: nothing was
 *    attributable — disclosed);
 * 2. RIGHTS GATE on the presented RightsContextRef (fail-closed: denied
 *    interactions never reach the transport — the backlog's
 *    "rights/policy gates precede provider calls" acceptance);
 * 3. EXPLICIT availability check: the bound implementation must carry an
 *    AvailabilityCapability record for the EXACT capability id + version
 *    (a definition's "supported" declaration is NOT availability);
 * 4. implementation status gate: available proceeds; degraded proceeds
 *    with a warning; unavailable fails with its own code; UNKNOWN fails
 *    with its own DISTINCT code and is recorded VERBATIM (never coerced);
 * 5. transport seam call — its response self-labels the source.
 *
 * Every attributable attempt appends an immutable §30 record to the
 * tenant-scoped audit log; there is no unrecorded path past stage 1.
 *
 * DISCLOSED LIMIT: the audit log is an ephemeral in-memory append-only log
 * (durable persistence is TL-owned later work — the port is unchanged).
 */

import type { TenantId, Timestamp } from "@mos/contracts";
import type { CapabilityRegistryPort } from "@mos/capabilities";
import type { IdentityId } from "@mos/rights";

import type {
  InteractionRecordFilter,
  ProviderInteractionFailure,
  ProviderInteractionRecord,
  ProviderInteractionRequest,
  ProviderInteractionResult,
  ProviderInteractionWarning,
  ResolvedInstanceCapability,
} from "../contracts/interaction.js";
import type {
  MerchantClientInstanceId,
  ProviderInteractionId,
  RightsContextRef,
} from "../contracts/ids.js";
import type { MerchantClientInstance } from "../contracts/merchant-client-instance.js";
import type { ProviderImplementation } from "../contracts/provider-implementation.js";
import { IntegrationsError } from "../errors.js";
import type { AvailabilityCapabilityRegistryPort } from "../ports/availability-capability-registry.port.js";
import type { MerchantClientInstanceRegistryPort } from "../ports/merchant-client-instance-registry.port.js";
import type { ProviderImplementationRegistryPort } from "../ports/provider-implementation-registry.port.js";
import type { ProviderInteractionPort } from "../ports/provider-interaction.port.js";
import type { ProviderRightsGatePort } from "../ports/provider-rights-gate.port.js";
import type { ProviderTransportPort } from "../ports/provider-transport.port.js";
import {
  assertExactFields,
  assertNonBlankString,
  assertPlainObject,
  assertVocabularyMember,
  deepFreeze,
  defaultNow,
} from "./registry-support.js";

/** Options for the in-memory provider-interaction runtime. */
export interface InMemoryProviderInteractionOptions {
  /** Layer-3 registry: instances resolve here (tenant-scoped). */
  readonly instances: MerchantClientInstanceRegistryPort;
  /** Layer-2 registry: the bound implementation version resolves here. */
  readonly implementations: ProviderImplementationRegistryPort;
  /** Layer-4 registry: the ONLY source of availability. */
  readonly availability: AvailabilityCapabilityRegistryPort;
  /** The @mos/capabilities vocabulary: capability refs resolve here. */
  readonly capabilities: CapabilityRegistryPort;
  /** The rights gate: fail-closed verdicts precede every transport call. */
  readonly rightsGate: ProviderRightsGatePort;
  /** The transport seam (disclosed in-memory double in this wave). */
  readonly transport: ProviderTransportPort;
  /** Injectable clock (deterministic tests). */
  readonly now?: () => string;
  /** Injectable request-id factory (deterministic tests). */
  readonly idFactory?: () => ProviderInteractionId;
}

const REQUEST_FIELDS = [
  "scope",
  "instanceId",
  "capabilityId",
  "capabilityVersion",
  "actor",
  "rightsContextRef",
  "rightsAction",
  "parameters",
] as const;

/**
 * The closed @mos/rights `RightsAction` union as a RUNTIME vocabulary (the
 * type is exported type-only). The request type pins the union at compile
 * time; this list is its runtime twin — an untyped caller smuggling a
 * bogus action string fails closed here instead of silently falling
 * through the rights evaluation to an `action-not-covered` denial.
 */
const RIGHTS_ACTIONS = ["use", "transform", "distribute", "derive", "analyze"] as const;

/**
 * Derives the rights SUBJECT of one interaction from the merchant/client
 * instance: the merchant's external account boundary when one is named,
 * otherwise the instance identity. Grants must NAME this subject
 * explicitly (§27) — the derivation is deterministic and documented.
 */
export function providerInteractionSubject(instance: MerchantClientInstance): string {
  return instance.externalAccount !== undefined
    ? (instance.externalAccount as string)
    : `merchant-client-instance:${instance.id as string}`;
}

/**
 * Creates the in-memory {@link ProviderInteractionPort} runtime.
 */
export function createInMemoryProviderInteractionPort(
  options: InMemoryProviderInteractionOptions,
): ProviderInteractionPort {
  const now = options.now ?? defaultNow;
  const instances = options.instances;
  const implementations = options.implementations;
  const availability = options.availability;
  const capabilities = options.capabilities;
  const rightsGate = options.rightsGate;
  const transport = options.transport;
  /** tenantKey → append-only audit log (insertion = time order). */
  const auditLog = new Map<string, ProviderInteractionRecord[]>();
  let minted = 0;
  const nextId =
    options.idFactory ?? (() => `provider-interaction-${++minted}` as ProviderInteractionId);

  function validateRequest(request: ProviderInteractionRequest): void {
    assertExactFields(request, REQUEST_FIELDS, "interaction-request");
    if (request.scope === undefined || typeof request.scope !== "object") {
      throw new IntegrationsError("invalid-interaction-request", "scope is required", { field: "scope" });
    }
    assertNonBlankString(request.scope.tenantId, "scope.tenantId", "interaction-request");
    assertNonBlankString(request.instanceId, "instanceId", "interaction-request");
    assertNonBlankString(request.capabilityId, "capabilityId", "interaction-request");
    if (
      typeof request.capabilityVersion !== "number" ||
      !Number.isInteger(request.capabilityVersion) ||
      request.capabilityVersion < 1
    ) {
      throw new IntegrationsError("invalid-interaction-request", "capabilityVersion must be an integer ≥ 1", {
        field: "capabilityVersion",
      });
    }
    assertNonBlankString(request.actor, "actor", "interaction-request");
    assertNonBlankString(request.rightsContextRef, "rightsContextRef", "interaction-request");
    assertVocabularyMember(request.rightsAction, RIGHTS_ACTIONS, "rightsAction", "interaction-request");
    assertPlainObject(request.parameters, "parameters", "interaction-request");
  }

  function appendRecord(record: ProviderInteractionRecord): void {
    const key = record.scope.tenantId as string;
    const log = auditLog.get(key) ?? [];
    log.push(record);
    auditLog.set(key, log);
  }

  function buildRecord(
    base: {
      readonly id: ProviderInteractionId;
      readonly scope: ProviderInteractionRequest["scope"];
      readonly instance: MerchantClientInstance;
      readonly implementation: ProviderImplementation;
      readonly capabilityId: ProviderInteractionRequest["capabilityId"];
      readonly capabilityVersion: ProviderInteractionRequest["capabilityVersion"];
      readonly actor: ProviderInteractionRequest["actor"];
      readonly rightsContextRef: RightsContextRef;
      readonly startedAt: string;
    },
    failure: ProviderInteractionFailure | null,
    warnings: readonly ProviderInteractionWarning[],
    transportSource: string,
  ): ProviderInteractionRecord {
    const completedAt = now();
    const durationMs = Math.max(0, Date.parse(completedAt) - Date.parse(base.startedAt));
    return deepFreeze({
      id: base.id,
      scope: base.scope,
      instanceId: base.instance.id,
      providerId: base.implementation.providerId,
      implementationId: base.implementation.id,
      implementationVersion: base.implementation.version,
      implementationStatus: base.implementation.status,
      capabilityId: base.capabilityId,
      capabilityVersion: base.capabilityVersion,
      actor: base.actor,
      rightsContextRef: base.rightsContextRef,
      startedAt: base.startedAt as Timestamp,
      durationMs,
      failure,
      warnings,
      transportSource,
    });
  }

  const runtime: ProviderInteractionPort = {
    invoke(request: ProviderInteractionRequest): ProviderInteractionResult {
      validateRequest(request);

      // Stage 1 — instance resolution IN THE CALLER'S TENANT. Cross-tenant
      // is indistinguishable from nonexistent (§31); an unresolvable
      // instance yields the unresolved-instance outcome with NO audit
      // record (nothing was attributable — disclosed).
      const instance = instances.getLatest(request.scope.tenantId, request.instanceId);
      if (instance === undefined) {
        return {
          outcome: "unresolved-instance",
          failure: {
            code: "unknown-merchant-client-instance",
            message: "merchant/client instance is not registered in this tenant",
            retriable: false,
          },
        };
      }

      // The implementation record bound to this instance version. Instance
      // registrations/rebinds validate existence and implementations are
      // append-only, so this resolves by construction; a violation of that
      // invariant by an exotic injected registry is a typed integrity
      // error, never a silent guess.
      const implementation = implementations.get(
        request.scope.tenantId,
        instance.implementationId,
        instance.implementationVersion,
      );
      if (implementation === undefined) {
        throw new IntegrationsError(
          "unknown-provider-implementation",
          "instance binding references an implementation version that is not registered in this tenant (registry integrity violation)",
          {},
        );
      }

      const startedAt = now();
      const base = {
        id: nextId(),
        scope: request.scope,
        instance,
        implementation,
        capabilityId: request.capabilityId,
        capabilityVersion: request.capabilityVersion,
        actor: request.actor,
        rightsContextRef: request.rightsContextRef,
        startedAt,
      };

      // Stage 2 — RIGHTS GATE precedes the provider call (fail-closed).
      // The §30 actor is the rights GRANTEE. Brand bridge (the package's
      // single documented one): the canonical contracts `IdentityRef` and
      // the rights authority's `IdentityId` brand the same runtime string
      // principal; the cast crosses the brand, never a value boundary.
      const verdict = rightsGate.check({
        scope: request.scope,
        rightsContextRef: request.rightsContextRef,
        grantee: request.actor as unknown as IdentityId,
        action: request.rightsAction,
        subjectRef: providerInteractionSubject(instance),
      });
      if (!verdict.allowed) {
        const failure: ProviderInteractionFailure = {
          code: "rights-gate-denied",
          message: `rights gate denied the interaction (${verdict.denialReason})`,
          retriable: false,
          details: { denialReason: verdict.denialReason },
        };
        const record = buildRecord(base, failure, [], "rights-gate");
        appendRecord(record);
        return { outcome: "failed", record, failure };
      }

      // Stage 3 — EXPLICIT availability: only layer-4 records count (a
      // definition's "supported" declaration is NOT availability; an
      // instance without a capability record provides NOTHING).
      const explicitAvailabilities = availability.listForImplementation(
        request.scope.tenantId,
        instance.implementationId,
      );
      const availabilityRecord = explicitAvailabilities.find(
        (record) =>
          (record.capabilityId as string) === (request.capabilityId as string) &&
          (record.capabilityVersion as number) === (request.capabilityVersion as number),
      );
      if (
        availabilityRecord === undefined ||
        capabilities.get(request.capabilityId, request.capabilityVersion) === undefined
      ) {
        const failure: ProviderInteractionFailure = {
          code: "capability-not-available-on-instance",
          message:
            "no explicit availability capability record covers this capability (id + version) on the bound implementation — declared support is not availability",
          retriable: false,
          details: {
            capabilityId: request.capabilityId as string,
            capabilityVersion: request.capabilityVersion as number,
          },
        };
        const record = buildRecord(base, failure, [], "availability-gate");
        appendRecord(record);
        return { outcome: "failed", record, failure };
      }

      // Stage 4 — implementation status gate. UNKNOWN fails with its OWN
      // code and is recorded VERBATIM (never coerced to unavailable).
      if (implementation.status === "unavailable" || implementation.status === "unknown") {
        const failure: ProviderInteractionFailure = {
          code:
            implementation.status === "unavailable"
              ? "implementation-status-unavailable"
              : "implementation-status-unknown",
          message: `the bound implementation version records status "${implementation.status}"`,
          retriable: false,
          details: { status: implementation.status },
        };
        const record = buildRecord(base, failure, [], "status-gate");
        appendRecord(record);
        return { outcome: "failed", record, failure };
      }
      const warnings: ProviderInteractionWarning[] = [];
      if (implementation.status === "degraded") {
        warnings.push({
          code: "implementation-degraded",
          message:
            'the bound implementation version records status "degraded" — the call proceeds with this warning',
        });
      }
      if (availabilityRecord.constraints.length > 0) {
        warnings.push({
          code: "availability-constraints-declared",
          message: `the availability carries declared constraints: ${availabilityRecord.constraints
            .map((constraint) => constraint.kind)
            .join(", ")}`,
        });
      }

      // Stage 5 — the transport seam.
      const response = transport.send({
        requestId: base.id,
        scope: request.scope,
        providerId: implementation.providerId,
        implementationId: implementation.id,
        capabilityId: request.capabilityId,
        capabilityVersion: request.capabilityVersion,
        instanceId: instance.id,
        credentialRef: instance.credentialRef,
        parameters: request.parameters,
      });
      if (response.ok) {
        const record = buildRecord(base, null, [...warnings, ...response.warnings], response.source);
        appendRecord(record);
        return { outcome: "completed", record, output: response.output };
      }
      const record = buildRecord(base, response.failure, warnings, response.source);
      appendRecord(record);
      return { outcome: "failed", record, failure: response.failure };
    },

    listInstanceCapabilities(
      tenantId: TenantId,
      instanceId: MerchantClientInstanceId,
    ): readonly ResolvedInstanceCapability[] {
      const instance = instances.getLatest(tenantId, instanceId);
      if (instance === undefined) {
        // Cross-tenant ≡ unknown — indistinguishable (§31).
        throw new IntegrationsError(
          "unknown-merchant-client-instance",
          "instance is not registered in this tenant",
          {},
        );
      }
      const out: ResolvedInstanceCapability[] = [];
      for (const record of availability.listForImplementation(tenantId, instance.implementationId)) {
        const capability = capabilities.get(record.capabilityId, record.capabilityVersion);
        if (capability === undefined) {
          // An availability whose capability record does not resolve in
          // the vocabulary provides NOTHING — excluded.
          continue;
        }
        out.push({ availability: record, capability });
      }
      return out;
    },

    listInteractionRecords(
      tenantId: TenantId,
      filter: InteractionRecordFilter = {},
    ): readonly ProviderInteractionRecord[] {
      const log = auditLog.get(tenantId as string) ?? [];
      const out = log.filter(
        (record) =>
          (filter.instanceId === undefined || (record.instanceId as string) === (filter.instanceId as string)) &&
          (filter.capabilityId === undefined || (record.capabilityId as string) === (filter.capabilityId as string)) &&
          (filter.actor === undefined || (record.actor as string) === (filter.actor as string)) &&
          (filter.failureCode === undefined || record.failure?.code === filter.failureCode),
      );
      if (filter.limit !== undefined && Number.isInteger(filter.limit) && filter.limit >= 0) {
        return out.slice(0, filter.limit);
      }
      return out;
    },

    getInteractionRecord(
      tenantId: TenantId,
      interactionId: ProviderInteractionId,
    ): ProviderInteractionRecord | undefined {
      return (auditLog.get(tenantId as string) ?? []).find(
        (record) => (record.id as string) === (interactionId as string),
      );
    },
  };

  return runtime;
}
