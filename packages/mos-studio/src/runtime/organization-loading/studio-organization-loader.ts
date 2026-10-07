/**
 * The Studio organization loader (STUDIO-007) — REAL studio-side loading
 * logic over an {@link OrganizationSourcePort}.
 *
 * Responsibilities (all studio-owned; the organization AUTHORITY stays with
 * the future `@mos/agents` module behind the source port):
 * - resolve EXACTLY the requested (id, version) — never a substitution, never
 *   a silent fallback to another version (a version change is an explicit new
 *   session binding);
 * - validate the descriptor's frozen AgentOrganization structure (nodes,
 *   edges, modelAssignments, policies, evaluator) — invalid descriptors fail
 *   loudly with explicit reasons;
 * - compute the compatibility verdict from the format's declared requirements
 *   (required capabilities, minimum organization version) against the
 *   descriptor's declared capabilities;
 * - cache resolved descriptors BY VERSION (exact-version cache; a different
 *   version always goes back to the source).
 *
 * The W1-C in-memory loader double is superseded by this loader plus a thin
 * disclosed in-memory SOURCE double (testing/in-memory-organization-source).
 */

import type { OrganizationCompatibility } from "../../contracts/studio-format.js";
import type {
  OrganizationLoadRequest,
  OrganizationLoadResult,
  OrganizationSourcePort,
  StudioOrganizationDescriptor,
  StudioOrganizationLoaderPort,
} from "../../contracts/organization-loading.js";

/** Options for {@link createStudioOrganizationLoader}. */
export interface StudioOrganizationLoaderOptions {
  readonly source: OrganizationSourcePort;
  /**
   * How an incompatible organization is delivered (both are LOUD — the
   * session fails either way): "verdict" (default) returns ok:true with the
   * recorded incompatible verdict; "error" returns ok:false with the
   * `incompatible-with-format` error carrying the same verdict.
   */
  readonly incompatibilityDelivery?: "verdict" | "error";
}

/** Why a descriptor failed structural validation (explicit, machine-readable). */
export type OrganizationInvalidReason =
  | { readonly kind: "missing-field"; readonly field: string }
  | { readonly kind: "empty-nodes" }
  | { readonly kind: "edge-endpoint-not-a-node"; readonly nodeId: string }
  | { readonly kind: "assignment-node-not-a-node"; readonly nodeId: string }
  | { readonly kind: "version-mismatch"; readonly expected: number; readonly actual: number }
  | { readonly kind: "id-mismatch"; readonly expected: string; readonly actual: string };

/** Validate the frozen AgentOrganization structure of one descriptor. */
export function validateOrganizationDescriptor(
  descriptor: StudioOrganizationDescriptor,
  expected: { readonly id: string; readonly version: number },
): readonly OrganizationInvalidReason[] {
  const reasons: OrganizationInvalidReason[] = [];
  if (descriptor.nodes === undefined || descriptor.nodes === null) {
    reasons.push({ kind: "missing-field", field: "nodes" });
  } else if (descriptor.nodes.length === 0) {
    reasons.push({ kind: "empty-nodes" });
  }
  if (descriptor.edges === undefined || descriptor.edges === null) {
    reasons.push({ kind: "missing-field", field: "edges" });
  }
  if (descriptor.modelAssignments === undefined || descriptor.modelAssignments === null) {
    reasons.push({ kind: "missing-field", field: "modelAssignments" });
  }
  if (descriptor.memoryPolicy === undefined || descriptor.memoryPolicy === null) {
    reasons.push({ kind: "missing-field", field: "memoryPolicy" });
  }
  if (descriptor.budgetPolicy === undefined || descriptor.budgetPolicy === null) {
    reasons.push({ kind: "missing-field", field: "budgetPolicy" });
  }
  if (descriptor.terminationPolicy === undefined || descriptor.terminationPolicy === null) {
    reasons.push({ kind: "missing-field", field: "terminationPolicy" });
  }
  if (descriptor.evaluator === undefined || descriptor.evaluator === null) {
    reasons.push({ kind: "missing-field", field: "evaluator" });
  }
  if (reasons.length > 0) {
    return reasons;
  }
  const nodeIds = new Set(descriptor.nodes.map((node) => node.nodeId));
  for (const edge of descriptor.edges) {
    if (!nodeIds.has(edge.fromNodeId)) {
      reasons.push({ kind: "edge-endpoint-not-a-node", nodeId: edge.fromNodeId });
    }
    if (!nodeIds.has(edge.toNodeId)) {
      reasons.push({ kind: "edge-endpoint-not-a-node", nodeId: edge.toNodeId });
    }
  }
  for (const assignment of descriptor.modelAssignments) {
    if (!nodeIds.has(assignment.nodeId)) {
      reasons.push({ kind: "assignment-node-not-a-node", nodeId: assignment.nodeId });
    }
  }
  if (descriptor.id !== expected.id) {
    reasons.push({ kind: "id-mismatch", expected: expected.id, actual: String(descriptor.id) });
  }
  if (descriptor.version !== expected.version) {
    reasons.push({ kind: "version-mismatch", expected: expected.version, actual: descriptor.version });
  }
  return reasons;
}

/** Compute the compatibility verdict of a descriptor against a format's declared requirements. */
export function checkOrganizationCompatibility(
  descriptor: StudioOrganizationDescriptor,
  compatibility: OrganizationCompatibility,
): { readonly compatible: boolean; readonly incompatibilityReasons: readonly string[] } {
  const declared = new Set<string>(descriptor.declaredCapabilities);
  const reasons: string[] = compatibility.requiredCapabilities
    .filter((capability) => !declared.has(capability))
    .map((capability) => `missing declared capability: ${capability}`);
  const minimum = compatibility.minimumOrganizationVersion;
  if (minimum !== undefined && descriptor.version < minimum) {
    reasons.push(
      `organization version ${descriptor.version} below format minimum ${minimum}`,
    );
  }
  return { compatible: reasons.length === 0, incompatibilityReasons: reasons };
}

const describeInvalid = (reason: OrganizationInvalidReason): string => {
  switch (reason.kind) {
    case "missing-field":
      return `missing frozen AgentOrganization field: ${reason.field}`;
    case "empty-nodes":
      return "organization declares no nodes";
    case "edge-endpoint-not-a-node":
      return `edge references unknown node: ${reason.nodeId}`;
    case "assignment-node-not-a-node":
      return `model assignment references unknown node: ${reason.nodeId}`;
    case "id-mismatch":
      return `descriptor id "${reason.actual}" does not match requested "${reason.expected}"`;
    case "version-mismatch":
      return `descriptor version ${reason.actual} does not match requested ${reason.expected}`;
  }
};

/**
 * Create the Studio organization loader bound to a source port.
 *
 * The returned loader additionally exposes `cachedVersions` for cache
 * observability in tests (the consumed interface stays
 * {@link StudioOrganizationLoaderPort}).
 */
export function createStudioOrganizationLoader(
  options: StudioOrganizationLoaderOptions,
): StudioOrganizationLoaderPort & {
  /** Cache keys resolved so far, in resolution order (`id@version`). */
  readonly cachedVersions: readonly string[];
} {
  const cache = new Map<string, StudioOrganizationDescriptor>();
  const cacheOrder: string[] = [];
  const keyOf = (id: string, version: number): string => `${id}@${version}`;
  const delivery = options.incompatibilityDelivery ?? "verdict";

  return {
    async load(request: OrganizationLoadRequest): Promise<OrganizationLoadResult> {
      const ref = request.organizationRef;
      const key = keyOf(ref.id, ref.version);
      let descriptor = cache.get(key);
      if (descriptor === undefined) {
        const fetched = await options.source.fetch(ref);
        if (!fetched.ok) {
          if (fetched.error.kind === "source-unavailable") {
            return { ok: false, error: { kind: "loader-unavailable", reason: fetched.error.reason } };
          }
          return { ok: false, error: { kind: "organization-not-found", organizationRef: ref } };
        }
        descriptor = fetched.descriptor;
        cache.set(key, descriptor);
        cacheOrder.push(key);
      }
      const invalidReasons = validateOrganizationDescriptor(descriptor, {
        id: ref.id,
        version: ref.version,
      });
      if (invalidReasons.length > 0) {
        // An invalid descriptor is a loud failure — it is never silently
        // skipped, substituted, or treated as usable.
        return {
          ok: false,
          error: {
            kind: "invalid-organization",
            organizationRef: ref,
            reasons: invalidReasons.map(describeInvalid),
          },
        };
      }
      const check = checkOrganizationCompatibility(descriptor, request.formatCompatibility);
      const loaded = {
        organization: { id: ref.id, version: ref.version },
        suppliedBy: request.suppliedBy,
        compatibility: check,
        descriptor,
        declaredCapabilities: [...descriptor.declaredCapabilities],
      };
      if (!check.compatible && delivery === "error") {
        return { ok: false, error: { kind: "incompatible-with-format", check } };
      }
      return { ok: true, loaded };
    },
    get cachedVersions(): readonly string[] {
      return [...cacheOrder];
    },
  };
}
