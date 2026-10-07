import type { AgentOrganizationRecord } from '@mos/agents';

/**
 * The §23 TWELVE organization search dimensions + the candidate descriptor
 * and twelve-dimension feature fingerprint (LAB-010).
 *
 * Basis: spec/mos-architecture-v2.0.md §23 (search dimensions: number of
 * agents, roles, topology, delegation, communication, memory sharing,
 * critics, tool allocation, model assignment, budget, execution ordering,
 * stopping conditions; ALWAYS compare the generalist single-agent baseline,
 * a hand-designed organization and generated organizations), §5 (an
 * organization is a graph of agent bodies with communication/delegation
 * edges — it can be searched and versioned), lock rule 33 (both baselines
 * are mandatory).
 *
 * DESIGN CALL (disclosed): candidates are `AgentOrganizationRecord`
 * descriptors from `@mos/agents` (registry-allowed dependency — TYPES only;
 * the agents module stays the organization authority). The frozen record
 * expresses NINE of the twelve dimensions structurally (agent count, roles,
 * topology edges, delegation, communication, memory sharing, model
 * assignment, budget, stopping conditions). The remaining THREE (critics,
 * tool allocation, execution ordering) are DECLARED features carried
 * alongside the record — never silently defaulted: every candidate declares
 * all three explicitly.
 */

// ---------------------------------------------------------------------------
// The twelve §23 search dimensions (frozen vocabulary)
// ---------------------------------------------------------------------------

/**
 * The twelve §23 organization search dimensions, in frozen declaration
 * order. Edge kinds map to dimensions: `delegates-to` → delegation,
 * `communicates-with` → communication, `reports-to` → topology (the
 * reporting structure is the topology dimension's own edge kind, so every
 * edge belongs to exactly one dimension).
 */
export type OrganizationSearchDimension =
  | 'agent-count'
  | 'roles'
  | 'topology'
  | 'delegation'
  | 'communication'
  | 'memory-sharing'
  | 'critics'
  | 'tool-allocation'
  | 'model-assignment'
  | 'budget'
  | 'execution-ordering'
  | 'stopping-conditions';

/** The twelve dimensions in frozen declaration order. */
export const ORGANIZATION_SEARCH_DIMENSIONS: readonly OrganizationSearchDimension[] = Object.freeze([
  'agent-count',
  'roles',
  'topology',
  'delegation',
  'communication',
  'memory-sharing',
  'critics',
  'tool-allocation',
  'model-assignment',
  'budget',
  'execution-ordering',
  'stopping-conditions',
] as const);

// ---------------------------------------------------------------------------
// Declared features for the three non-structural dimensions
// ---------------------------------------------------------------------------

/** §23 execution ordering: how the organization's nodes execute (declared). */
export type ExecutionOrderingMode = 'sequential' | 'parallel' | 'staged';

/** One node's tool allocation: the tool refs allocated to that node. */
export interface OrganizationToolAllocationEntry {
  readonly nodeId: string;
  readonly toolRefs: readonly string[];
}

/**
 * §23 tool allocation, declared: which tools are allocated to which nodes.
 * Nodes without an entry have NO allocated tools (an explicit state, not a
 * default — the fingerprint records the full allocation signature).
 */
export interface OrganizationToolAllocation {
  readonly perNode: readonly OrganizationToolAllocationEntry[];
}

/**
 * The three §23 dimensions the frozen `AgentOrganization` record cannot
 * express structurally, declared explicitly on every candidate. All three
 * are REQUIRED — there are no silent defaults.
 */
export interface DeclaredOrganizationFeatures {
  /** §23 critics: the node ids acting as critics (validated ⊆ node ids). */
  readonly criticNodeIds: readonly string[];
  /** §23 tool allocation (validated: node ids exist, tool refs non-blank). */
  readonly toolAllocation: OrganizationToolAllocation;
  /** §23 execution ordering mode. */
  readonly executionOrdering: ExecutionOrderingMode;
}

// ---------------------------------------------------------------------------
// Candidate descriptor
// ---------------------------------------------------------------------------

/** Where a searched candidate came from (§23 comparison mandate). */
export type OrganizationCandidateOrigin =
  | 'generalist-single-agent-baseline'
  | 'hand-designed'
  | 'composed'
  | 'generated';

/**
 * One organization search candidate: an `AgentOrganizationRecord` descriptor
 * (from the @mos/agents registry or composed by the caller) plus the three
 * DECLARED §23 features the record cannot express. Passed BY VALUE — the lab
 * never becomes the organization authority (body/registry resolution stays
 * in @mos/agents; the lab validates structure only, fail-closed).
 */
export interface SearchedOrganizationCandidate {
  readonly organization: AgentOrganizationRecord;
  readonly features: DeclaredOrganizationFeatures;
  readonly origin: OrganizationCandidateOrigin;
}

// ---------------------------------------------------------------------------
// Twelve-dimension feature fingerprint
// ---------------------------------------------------------------------------

/**
 * The per-dimension feature fingerprint: one deterministic string signature
 * per §23 dimension, derived from the candidate (record + declared
 * features). Two candidates with equal fingerprints are THE SAME POINT in
 * the twelve-dimension search space (dedup); the dimensions whose
 * fingerprints differ between parent and child are exactly the dimensions a
 * generation step varied (provenance).
 */
export interface OrganizationFeatureFingerprint {
  readonly 'agent-count': string;
  readonly roles: string;
  readonly topology: string;
  readonly delegation: string;
  readonly communication: string;
  readonly 'memory-sharing': string;
  readonly critics: string;
  readonly 'tool-allocation': string;
  readonly 'model-assignment': string;
  readonly budget: string;
  readonly 'execution-ordering': string;
  readonly 'stopping-conditions': string;
}

// ---------------------------------------------------------------------------
// Compile-time pins
// ---------------------------------------------------------------------------

type Expect<T extends true> = T;
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;

/** The §23 dimension vocabulary has exactly TWELVE members (frozen). */
type _Section23HasExactlyTwelveDimensions = Expect<
  Equal<OrganizationSearchDimension,
  | 'agent-count'
  | 'roles'
  | 'topology'
  | 'delegation'
  | 'communication'
  | 'memory-sharing'
  | 'critics'
  | 'tool-allocation'
  | 'model-assignment'
  | 'budget'
  | 'execution-ordering'
  | 'stopping-conditions'>
>;

/** Every dimension has a fingerprint key (no untracked dimension). */
type _EveryDimensionIsFingerprinted = Expect<
  Equal<keyof OrganizationFeatureFingerprint, OrganizationSearchDimension>
>;

/** Declared features are mandatory (no silently-defaulted dimension). */
type _DeclaredFeaturesAreRequired = Expect<
  Equal<
    keyof DeclaredOrganizationFeatures,
    'criticNodeIds' | 'toolAllocation' | 'executionOrdering'
  >
>;
