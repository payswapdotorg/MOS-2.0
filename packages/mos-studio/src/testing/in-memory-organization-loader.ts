/**
 * DISCLOSED TEST DOUBLE — in-memory organization loader (STUDIO-001).
 *
 * Simulates the `agents` module organization authority (AGT-001/003, not in
 * this base) for contract tests: pre-seeded versioned organizations with
 * declared capabilities, explicit compatibility verdicts computed from the
 * format's declared requirements, and switchable failure modes. Not a
 * production loader; later waves bind this port to the real module.
 *
 * Capability substitution is NOT applied by this double: deciding declared
 * equivalents requires the capabilities module authority (CAP-001) — the
 * double reports missing capabilities regardless of the substitution flag
 * and the verdict stays explicit.
 */

import type {
  OrganizationLoadRequest,
  OrganizationLoadResult,
  StudioOrganizationLoader,
} from "../contracts/organization-loading.js";
import type { CapabilityId, StudioOrganizationId } from "../contracts/refs.js";

/** One seeded organization version. */
export interface InMemoryOrganizationDefinition {
  readonly id: string;
  readonly version: number;
  readonly declaredCapabilities: readonly string[];
}

/** Options controlling the double's behavior. */
export interface InMemoryOrganizationLoaderOptions {
  readonly organizations: readonly InMemoryOrganizationDefinition[];
  /** Simulate loader unavailability (explicit loader-unavailable failure). */
  readonly unavailable?: boolean;
  /** "verdict": ok:true + compatible:false; "error": ok:false incompatible-with-format. */
  readonly incompatibilityDelivery?: "verdict" | "error";
}

/** Create the disclosed in-memory organization loader test double. */
export function createInMemoryOrganizationLoader(
  options: InMemoryOrganizationLoaderOptions,
): StudioOrganizationLoader {
  return {
    async load(request: OrganizationLoadRequest): Promise<OrganizationLoadResult> {
      if (options.unavailable === true) {
        return {
          ok: false,
          error: { kind: "loader-unavailable", reason: "in-memory double configured unavailable" },
        };
      }
      const definition = options.organizations.find(
        (org) =>
          org.id === request.organizationRef.id && org.version === request.organizationRef.version,
      );
      if (definition === undefined) {
        return {
          ok: false,
          error: { kind: "organization-not-found", organizationRef: request.organizationRef },
        };
      }
      const declared = new Set<string>(definition.declaredCapabilities);
      const required = request.formatCompatibility.requiredCapabilities;
      const missing = required.filter((capability) => !declared.has(capability));
      const reasons: string[] = missing.map(
        (capability) => `missing declared capability: ${capability}`,
      );
      const minimum = request.formatCompatibility.minimumOrganizationVersion;
      if (minimum !== undefined && definition.version < minimum) {
        reasons.push(
          `organization version ${definition.version} below format minimum ${minimum}`,
        );
      }
      const compatible = reasons.length === 0;
      const check = { compatible, incompatibilityReasons: reasons };
      if (!compatible && options.incompatibilityDelivery === "error") {
        return { ok: false, error: { kind: "incompatible-with-format", check } };
      }
      return {
        ok: true,
        loaded: {
          organization: {
            id: definition.id as StudioOrganizationId,
            version: definition.version,
          },
          suppliedBy: request.suppliedBy,
          compatibility: check,
          declaredCapabilities: [...definition.declaredCapabilities] as CapabilityId[],
        },
      };
    },
  };
}
