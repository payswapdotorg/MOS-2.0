/**
 * Versioned organization loading contracts for the MOS Content Studio.
 *
 * STUDIO-007 (Wave 2): organization loading moves from the W1-C in-memory
 * loader double toward the real binding — a versioned
 * {@link StudioOrganizationDescriptor} aligned field-for-field with the
 * frozen AgentOrganization contract in `@mos/contracts` (id, version, nodes,
 * edges, modelAssignments, memoryPolicy, budgetPolicy, terminationPolicy,
 * evaluator — RECONCILE-C imports the canonical types, they are NOT mirrored
 * here), produced by an {@link OrganizationSourcePort} that a later wave binds
 * to the real `@mos/agents` organization authority.
 *
 * The Studio NEVER invents, mutates or silently substitutes an organization:
 * it receives an explicit versioned reference from the caller (standalone
 * user or Lab), resolves it through a loader port, and records an explicit
 * compatibility verdict. Incompatibility fails loudly — it is never a silent
 * swap. A version change is an explicit NEW session binding: the loader
 * resolves exactly the requested version and caches by version; it never
 * falls back to another version.
 */

import type {
  AgentOrganization,
  AgentOrganizationEdge,
  AgentOrganizationNode,
  BudgetPolicy,
  EvaluatorRef,
  MemoryPolicy,
  ModelAssignment,
  TerminationPolicy,
  Version,
} from "@mos/contracts";
import type {
  CapabilityId,
  ContractVersion,
  IdentityRef,
  LabCandidateRef,
  StudioOrganizationId,
} from "./refs.js";
import type { OrganizationCompatibility } from "./studio-format.js";

/**
 * Versioned reference to an Agent Organization. The version is mandatory:
 * organizations are searched and versioned (§5), and a session must record
 * exactly which organization version it executed with (§30 observability).
 */
export interface StudioOrganizationRef {
  readonly id: StudioOrganizationId;
  readonly version: ContractVersion;
}

/** Who supplied the organization for a session (§13 entry modes). */
export type OrganizationSupplier =
  | {
      readonly kind: "standalone-user";
      /** Identity of the user who picked the organization. */
      readonly identityRef: IdentityRef;
    }
  | {
      readonly kind: "lab";
      /** Reference to the Lab production candidate that selected the organization. */
      readonly labCandidateRef: LabCandidateRef;
    };

/**
 * A versioned organization descriptor as the Studio consumes it: the CANONICAL
 * frozen `AgentOrganization` contract record (id, version, nodes, edges,
 * modelAssignments, memoryPolicy, budgetPolicy, terminationPolicy,
 * evaluator — imported from `@mos/contracts`) plus the studio-side view of
 * the capabilities the organization's bodies declare. In the real binding
 * (Worker B's `@mos/agents`, same wave, not in this base) the capability set
 * is DERIVED from the node bodies' role contracts by the agents authority;
 * the source port supplies the derived view so compatibility verdicts stay
 * explicit. Future binding documented at {@link OrganizationSourcePort}.
 */
export interface StudioOrganizationDescriptor extends AgentOrganization {
  /** Capabilities the organization's bodies declare (derived by the agents authority). */
  readonly declaredCapabilities: readonly CapabilityId[];
}

/**
 * Source of versioned organization descriptors — the seam a later wave binds
 * to the real `@mos/agents` organization authority (AGT-001/AGT-003). The
 * Studio owns ONLY the loader; it never owns organization storage or search.
 */
export interface OrganizationSourcePort {
  /** Fetch EXACTLY the requested versioned organization (never a substitution). */
  fetch(ref: StudioOrganizationRef): Promise<OrganizationSourceResult>;
}

/** Result of a source fetch (explicit failure kinds; never silent). */
export type OrganizationSourceResult =
  | { readonly ok: true; readonly descriptor: StudioOrganizationDescriptor }
  | { readonly ok: false; readonly error: OrganizationSourceError };

/** Failure modes of an organization source. */
export type OrganizationSourceError =
  | { readonly kind: "organization-not-found"; readonly organizationRef: StudioOrganizationRef }
  | { readonly kind: "source-unavailable"; readonly reason: string };

/**
 * Request to load one exact organization version into a session context.
 * The Studio never guesses an organization: `organizationRef` always comes
 * from the caller (user selection or Lab decision).
 *
 * `formatCompatibility` carries the format's declared organization
 * compatibility (required capabilities, minimum version) so the loader can
 * return an explicit compatibility verdict (never a silent substitution).
 */
export interface OrganizationLoadRequest {
  readonly organizationRef: StudioOrganizationRef;
  readonly suppliedBy: OrganizationSupplier;
  readonly formatCompatibility: OrganizationCompatibility;
}

/** Explicit compatibility verdict after checking an organization against a format. */
export interface OrganizationCompatibilityCheck {
  readonly compatible: boolean;
  /**
   * Human/machine-readable incompatibility reasons when `compatible` is
   * false (missing capabilities, wrong shape, unsupported version...).
   * Present exactly when compatibility fails — the failure is always
   * explicit, never silent.
   */
  readonly incompatibilityReasons: readonly string[];
}

/**
 * A loaded organization, ready to execute a session's production program.
 * Carries the exact versioned identity, the full versioned descriptor and the
 * recorded compatibility verdict for audit (§30).
 */
export interface LoadedStudioOrganization {
  readonly organization: StudioOrganizationRef;
  readonly suppliedBy: OrganizationSupplier;
  readonly compatibility: OrganizationCompatibilityCheck;
  /** The full versioned descriptor (frozen AgentOrganization fields + capabilities view). */
  readonly descriptor: StudioOrganizationDescriptor;
  /** Capabilities the loaded organization declares (from the descriptor). */
  readonly declaredCapabilities: readonly CapabilityId[];
}

/** Result of an organization load attempt. */
export type OrganizationLoadResult =
  | { readonly ok: true; readonly loaded: LoadedStudioOrganization }
  | {
      readonly ok: false;
      readonly error: OrganizationLoadError;
    };

/** Failure modes of organization loading (all explicit, none silent). */
export type OrganizationLoadError =
  | {
      readonly kind: "organization-not-found";
      readonly organizationRef: StudioOrganizationRef;
    }
  | {
      readonly kind: "incompatible-with-format";
      readonly check: OrganizationCompatibilityCheck;
    }
  | {
      readonly kind: "invalid-organization";
      readonly organizationRef: StudioOrganizationRef;
      readonly reasons: readonly string[];
    }
  | {
      readonly kind: "loader-unavailable";
      readonly reason: string;
    };

/**
 * Loader port the Studio runtime consumes. Wave 1 declared this as
 * `StudioOrganizationLoader`; STUDIO-007 renames the intent to
 * `StudioOrganizationLoaderPort` (the alias below keeps older imports
 * source-compatible). The real binding composes any
 * {@link OrganizationSourcePort} through
 * `createStudioOrganizationLoader` (runtime/organization-loading); the
 * studio itself never owns organization storage or search.
 */
export interface StudioOrganizationLoaderPort {
  /** Load exactly the requested versioned organization reference. */
  load(request: OrganizationLoadRequest): Promise<OrganizationLoadResult>;
}

/** Backwards-compatible alias for the W1-C interface name. */
export type StudioOrganizationLoader = StudioOrganizationLoaderPort;

// Canonical organization record members are re-exported for descriptor
// construction at the composition seams (the canonical types themselves live
// in @mos/contracts — imported above, never mirrored).
export type {
  AgentOrganizationEdge,
  AgentOrganizationNode,
  BudgetPolicy,
  MemoryPolicy,
  ModelAssignment,
  TerminationPolicy,
  Version as OrganizationRecordVersion,
};
export type { EvaluatorRef as OrganizationEvaluatorRef };
