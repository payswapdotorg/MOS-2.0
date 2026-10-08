/**
 * In-memory ProviderImplementationRegistry adapter (INTEG-001, layer 2).
 *
 * Working adapter: fail-closed registration (referenced definition must
 * exist IN THE SAME TENANT; `available`/`degraded` statuses require
 * evidence), append-only versioned snapshots (registering with a known
 * in-tenant id appends the next version; recordStatusCorrection appends a
 * status correction), UNKNOWN preserved verbatim in every read (never
 * coerced), tenant-scoped with cross-tenant ≡ unknown.
 *
 * DISCLOSED LIMIT: ephemeral process-local scaffold (no durability claim).
 */

import type { TenantId, Version } from "@mos/contracts";

import type {
  ProviderImplementation,
  ProviderStatusCorrectionInput,
  RegisterProviderImplementationInput,
} from "../contracts/provider-implementation.js";
import { PROVIDER_IMPLEMENTATION_STATUSES } from "../contracts/provider-implementation.js";
import type { ProviderDefinitionId, ProviderImplementationId } from "../contracts/ids.js";
import { IntegrationsError } from "../errors.js";
import type { ProviderDefinitionRegistryPort } from "../ports/provider-definition-registry.port.js";
import type { ProviderImplementationRegistryPort } from "../ports/provider-implementation-registry.port.js";
import {
  assertArray,
  assertExactFields,
  assertFiniteNumber,
  assertNonBlankString,
  assertPlainObject,
  assertVocabularyMember,
  deepFreeze,
  defaultNow,
} from "./registry-support.js";

/** Options for the in-memory provider-implementation registry. */
export interface InMemoryProviderImplementationRegistryOptions {
  /** Layer-1 registry: definitions must resolve here (fail-closed). */
  readonly definitions: ProviderDefinitionRegistryPort;
  /** Injectable clock (deterministic tests). */
  readonly now?: () => string;
}

const INPUT_FIELDS = [
  "id",
  "scope",
  "definitionId",
  "definitionVersion",
  "label",
  "status",
  "statusObservedAt",
  "evidenceRefs",
  "evidenceModel",
  "errorModel",
  "rateLimitObservation",
] as const;

const CORRECTION_FIELDS = [
  "scope",
  "implementationId",
  "status",
  "statusObservedAt",
  "evidenceRefs",
] as const;

const RATE_LIMIT_FIELDS = ["observedAt", "requestsPerWindow", "windowMs"] as const;

/**
 * Creates an in-memory {@link ProviderImplementationRegistryPort} adapter.
 */
export function createInMemoryProviderImplementationRegistry(
  options: InMemoryProviderImplementationRegistryOptions,
): ProviderImplementationRegistryPort {
  const now = options.now ?? defaultNow;
  const definitions = options.definitions;
  /** tenantKey → implementationId → version → frozen record. */
  const byTenant = new Map<string, Map<string, Map<number, ProviderImplementation>>>();
  /** tenantKey → implementationId → insertion order. */
  const order = new Map<string, ProviderImplementationId[]>();
  let minted = 0;

  function layer(tenantId: TenantId): Map<string, Map<number, ProviderImplementation>> {
    const key = tenantId as string;
    let implementations = byTenant.get(key);
    if (implementations === undefined) {
      implementations = new Map<string, Map<number, ProviderImplementation>>();
      byTenant.set(key, implementations);
    }
    return implementations;
  }

  function latestOf(
    tenantId: TenantId,
    implementationId: ProviderImplementationId,
  ): ProviderImplementation | undefined {
    const versions = layer(tenantId).get(implementationId as string);
    if (versions === undefined || versions.size === 0) {
      return undefined;
    }
    const latest = Math.max(...versions.keys());
    return versions.get(latest);
  }

  function validateStatusFields(status: unknown, evidenceRefs: readonly unknown[]): void {
    assertVocabularyMember(status, PROVIDER_IMPLEMENTATION_STATUSES, "status", "provider-implementation");
    assertArray(evidenceRefs, "evidenceRefs", "provider-implementation");
    for (const ref of evidenceRefs) {
      assertNonBlankString(ref, "evidenceRefs[]", "provider-implementation");
    }
    // POSITIVE observation claims need evidence (AGENTS.md: a green claim
    // requires repository-backed evidence). unknown/unavailable may be
    // evidence-free — absence of a claim needs no proof.
    if ((status === "available" || status === "degraded") && evidenceRefs.length === 0) {
      throw new IntegrationsError(
        "invalid-provider-implementation",
        `status "${status}" is a positive observation claim and requires at least one evidence ref`,
        { field: "evidenceRefs", status },
      );
    }
  }

  const registry: ProviderImplementationRegistryPort = {
    register(input: RegisterProviderImplementationInput): ProviderImplementation {
      assertExactFields(input, INPUT_FIELDS, "provider-implementation");
      if (input.scope === undefined || typeof input.scope !== "object") {
        throw new IntegrationsError("invalid-provider-implementation", "scope is required", { field: "scope" });
      }
      assertNonBlankString(input.scope.tenantId, "scope.tenantId", "provider-implementation");
      assertNonBlankString(input.label, "label", "provider-implementation");
      validateStatusFields(input.status, input.evidenceRefs);
      assertPlainObject(input.evidenceModel, "evidenceModel", "provider-implementation");
      assertPlainObject(input.errorModel, "errorModel", "provider-implementation");
      assertPlainObject(input.rateLimitObservation, "rateLimitObservation", "provider-implementation");
      assertExactFields(input.rateLimitObservation as object, RATE_LIMIT_FIELDS, "provider-implementation");
      assertNonBlankString(
        (input.rateLimitObservation as { observedAt: unknown }).observedAt,
        "rateLimitObservation.observedAt",
        "provider-implementation",
      );
      assertFiniteNumber(
        (input.rateLimitObservation as { requestsPerWindow: unknown }).requestsPerWindow,
        "rateLimitObservation.requestsPerWindow",
        0,
        "provider-implementation",
      );
      assertFiniteNumber(
        (input.rateLimitObservation as { windowMs: unknown }).windowMs,
        "rateLimitObservation.windowMs",
        1,
        "provider-implementation",
      );
      if (input.statusObservedAt !== undefined) {
        assertNonBlankString(input.statusObservedAt, "statusObservedAt", "provider-implementation");
      }

      // The referenced definition id + version must exist IN THIS TENANT
      // (cross-tenant ≡ unknown — no existence leaks).
      const definition = definitions.get(
        input.scope.tenantId,
        input.definitionId,
        input.definitionVersion,
      );
      if (definition === undefined) {
        throw new IntegrationsError(
          "unknown-provider-definition-reference",
          `implementation references an unknown provider definition (id or version not registered in this tenant)`,
          { definitionId: input.definitionId as string, definitionVersion: input.definitionVersion as number },
        );
      }

      const tenantKey = input.scope.tenantId as string;
      const implementations = layer(input.scope.tenantId);
      const idKey = (input.id ?? (`provider-implementation-${++minted}` as ProviderImplementationId)) as string;
      const versions = implementations.get(idKey);
      const nextVersion = versions === undefined ? 1 : Math.max(...versions.keys()) + 1;

      // W9-B clone-then-deep-freeze (the sweep's ownership discipline): the
      // stored implementation owns a PRIVATE copy — the caller's scope,
      // evidence/error models and rate-limit observation objects are
      // neither aliased by the stored record nor frozen in place.
      const record: ProviderImplementation = deepFreeze(structuredClone({
        id: idKey as ProviderImplementationId,
        version: nextVersion as Version,
        scope: input.scope,
        // The provider identity is ECHOED from the definition — the source
        // of truth is layer 1, never caller input.
        providerId: definition.providerId,
        definitionId: input.definitionId,
        definitionVersion: input.definitionVersion,
        label: input.label,
        status: input.status,
        statusObservedAt: (input.statusObservedAt ?? now()) as ProviderImplementation["statusObservedAt"],
        evidenceRefs: input.evidenceRefs,
        evidenceModel: input.evidenceModel,
        errorModel: input.errorModel,
        rateLimitObservation: input.rateLimitObservation,
      }));

      if (versions === undefined) {
        implementations.set(idKey, new Map<number, ProviderImplementation>([[nextVersion, record]]));
        const ids = order.get(tenantKey) ?? [];
        ids.push(record.id);
        order.set(tenantKey, ids);
      } else {
        versions.set(nextVersion, record);
      }
      return record;
    },

    get(
      tenantId: TenantId,
      implementationId: ProviderImplementationId,
      version: Version,
    ): ProviderImplementation | undefined {
      return layer(tenantId).get(implementationId as string)?.get(version as number);
    },

    getLatest(tenantId: TenantId, implementationId: ProviderImplementationId): ProviderImplementation | undefined {
      return latestOf(tenantId, implementationId);
    },

    listVersions(tenantId: TenantId, implementationId: ProviderImplementationId): readonly Version[] {
      const versions = layer(tenantId).get(implementationId as string);
      if (versions === undefined) {
        return [];
      }
      return [...versions.keys()].sort((a, b) => a - b) as Version[];
    },

    listForDefinition(
      tenantId: TenantId,
      definitionId: ProviderDefinitionId,
    ): readonly ProviderImplementation[] {
      const ids = order.get(tenantId as string) ?? [];
      const out: ProviderImplementation[] = [];
      for (const id of ids) {
        const latest = latestOf(tenantId, id);
        if (latest === undefined) {
          continue;
        }
        if ((latest.definitionId as string) === (definitionId as string)) {
          out.push(latest);
        }
      }
      return out;
    },

    recordStatusCorrection(input: ProviderStatusCorrectionInput): ProviderImplementation {
      assertExactFields(input, CORRECTION_FIELDS, "provider-implementation");
      if (input.scope === undefined || typeof input.scope !== "object") {
        throw new IntegrationsError("invalid-provider-implementation", "scope is required", { field: "scope" });
      }
      assertNonBlankString(input.scope.tenantId, "scope.tenantId", "provider-implementation");
      validateStatusFields(input.status, input.evidenceRefs);

      const latest = latestOf(input.scope.tenantId, input.implementationId);
      if (latest === undefined) {
        // Cross-tenant ids are indistinguishable from unknown ones (§31).
        throw new IntegrationsError(
          "unknown-provider-implementation",
          "implementation is not registered in this tenant",
          {},
        );
      }

      const versions = layer(input.scope.tenantId).get(input.implementationId as string) as Map<
        number,
        ProviderImplementation
      >;
      const nextVersion = latest.version + 1;
      // APPEND-ONLY: the prior version (with its prior status — possibly
      // `unknown`) stays resolvable; the correction is a NEW immutable
      // snapshot. UNKNOWN is never rewritten in place.
      // W9-B ownership (surgical): the correction preserves every prior
      // field from the prior STORED record (already deep-frozen — the
      // append-only pin's reference-equality discipline), and owns a FROZEN
      // COPY of the caller's evidence refs — the caller's array is never
      // frozen in place and never aliased by the stored record.
      const corrected: ProviderImplementation = deepFreeze({
        ...latest,
        version: nextVersion as Version,
        status: input.status,
        statusObservedAt: (input.statusObservedAt ?? now()) as ProviderImplementation["statusObservedAt"],
        evidenceRefs: Object.freeze([...input.evidenceRefs]),
      });
      versions.set(nextVersion, corrected);
      return corrected;
    },
  };

  return registry;
}
