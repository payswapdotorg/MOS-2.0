/**
 * DISCLOSED TEST DOUBLE — in-memory organization SOURCE (STUDIO-007).
 *
 * Serves versioned {@link StudioOrganizationDescriptor} records (frozen
 * AgentOrganization fields) for contract tests. This is the THIN source the
 * REAL studio loader (runtime/organization-loading) consumes; it replaces the
 * W1-C loader double — all compatibility/validation/caching logic now lives
 * in the real loader, and only the descriptor SOURCE is doubled. A later wave
 * binds the source port to the real `@mos/agents` organization authority
 * (AGT-001/AGT-003); the descriptors below are structurally aligned to that
 * contract so the binding is a drop-in replacement of this module.
 *
 * Seeds with only {id, version, declaredCapabilities} are expanded into a
 * structurally valid descriptor deterministically (one node, no edges, one
 * model assignment, session memory policy, zero budgets, a bounded
 * termination policy, an evaluator ref). Seeds may override every structural
 * field to build deliberately-invalid descriptors for failure tests.
 */

import type {
  OrganizationSourcePort,
  OrganizationSourceResult,
  StudioOrganizationDescriptor,
  StudioOrganizationRef,
} from "../contracts/organization-loading.js";
import type {
  AgentOrganizationEdge,
  AgentOrganizationNode,
  BudgetPolicy,
  MemoryPolicy,
  ModelAssignment,
  OrganizationEvaluatorRef,
  OrganizationRecordVersion,
} from "../contracts/organization-loading.js";
import type { CapabilityId, StudioOrganizationId } from "../contracts/refs.js";

/** One seeded organization version. */
export interface InMemoryOrganizationSeed {
  readonly id: string;
  readonly version: number;
  readonly declaredCapabilities: readonly string[];
  /** Overrides for the structural AgentOrganization fields (failure tests). */
  readonly nodes?: readonly AgentOrganizationNode[];
  readonly edges?: readonly AgentOrganizationEdge[];
  readonly modelAssignments?: readonly ModelAssignment[];
  readonly memoryPolicy?: MemoryPolicy;
  readonly budgetPolicy?: BudgetPolicy;
  readonly terminationPolicy?: { readonly maxIterations: number; readonly timeoutMs: number };
  readonly evaluator?: string;
}

/** Options controlling the double's behavior. */
export interface InMemoryOrganizationSourceOptions {
  readonly organizations: readonly InMemoryOrganizationSeed[];
  /** Simulate source unavailability (explicit source-unavailable failure). */
  readonly unavailable?: boolean;
}

/** Expand one seed into a complete versioned descriptor (deterministic). */
export function expandOrganizationSeed(seed: InMemoryOrganizationSeed): StudioOrganizationDescriptor {
  const nodeId = `${seed.id}-node-1`;
  return {
    id: seed.id as StudioOrganizationId,
    version: seed.version as OrganizationRecordVersion,
    nodes: seed.nodes ?? [
      { nodeId, bodyId: `${seed.id}-body-1` as AgentOrganizationNode["bodyId"] },
    ],
    edges: seed.edges ?? [],
    modelAssignments: seed.modelAssignments ?? [
      { nodeId, modelRef: `${seed.id}-model-1` as ModelAssignment["modelRef"] },
    ],
    memoryPolicy: seed.memoryPolicy ?? { scope: "session" },
    budgetPolicy: seed.budgetPolicy ?? {
      organization: { maxCost: { amount: 0, currency: "USD" }, maxDurationMs: 0 },
      perNode: { maxCost: { amount: 0, currency: "USD" }, maxDurationMs: 0 },
    },
    terminationPolicy: seed.terminationPolicy ?? { maxIterations: 1, timeoutMs: 3_600_000 },
    evaluator: (seed.evaluator ?? `${seed.id}-evaluator`) as OrganizationEvaluatorRef,
    declaredCapabilities: [...seed.declaredCapabilities] as CapabilityId[],
  };
}

/** Create the disclosed in-memory organization source test double. */
export function createInMemoryOrganizationSource(
  options: InMemoryOrganizationSourceOptions,
): OrganizationSourcePort & {
  /** Number of fetch() calls served (cache-behavior evidence for tests). */
  readonly fetchCount: () => number;
} {
  const descriptors = new Map<string, StudioOrganizationDescriptor>();
  for (const seed of options.organizations) {
    descriptors.set(`${seed.id}@${seed.version}`, expandOrganizationSeed(seed));
  }
  let fetches = 0;
  return {
    async fetch(ref: StudioOrganizationRef): Promise<OrganizationSourceResult> {
      fetches += 1;
      if (options.unavailable === true) {
        return {
          ok: false,
          error: { kind: "source-unavailable", reason: "in-memory source configured unavailable" },
        };
      }
      const descriptor = descriptors.get(`${ref.id}@${ref.version}`);
      // EXACT version match only — a nearby version is NOT a substitute.
      if (descriptor === undefined) {
        return { ok: false, error: { kind: "organization-not-found", organizationRef: ref } };
      }
      return { ok: true, descriptor };
    },
    fetchCount: () => fetches,
  };
}
