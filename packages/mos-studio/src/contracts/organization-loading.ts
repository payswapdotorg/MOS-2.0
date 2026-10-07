/**
 * Versioned organization loading contracts for the MOS Content Studio.
 *
 * STUDIO-001 interface spike — TYPES ONLY (no runtime implementation).
 *
 * Basis: spec/mos-architecture-v2.0.md §13 (two entry modes: standalone user
 * creation and Lab-invoked production; the Studio loads the organization
 * supplied by the caller), architecture policy specialRules.studio
 * (`organizationMustBeVersioned: true`), architecture-lock #22 ("Studio can
 * load any compatible user-supplied or Lab-discovered organization"), and
 * WORKER-CONTRACT-V2.0.md Studio rules ("Studio may load any compatible
 * versioned organization explicitly supplied by caller").
 *
 * The Studio NEVER invents, mutates or silently substitutes an organization:
 * it receives an explicit versioned reference from the caller (standalone
 * user or Lab), resolves it through a loader port, and records an explicit
 * compatibility verdict. Incompatibility fails loudly — it is never a silent
 * swap.
 *
 * Backlog: STUDIO-007 (Organization Loader) implements against these types.
 */

import type {
  CapabilityId,
  ContractVersion,
  IdentityRef,
  LabCandidateRef,
  StudioOrganizationId,
} from "./refs.js";

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
 * Request to load one exact organization version into a session context.
 * The Studio never guesses an organization: `organizationRef` always comes
 * from the caller (user selection or Lab decision).
 */
export interface OrganizationLoadRequest {
  readonly organizationRef: StudioOrganizationRef;
  readonly suppliedBy: OrganizationSupplier;
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
 * Carries the exact versioned identity plus the recorded compatibility
 * verdict for audit (§30).
 */
export interface LoadedStudioOrganization {
  readonly organization: StudioOrganizationRef;
  readonly suppliedBy: OrganizationSupplier;
  readonly compatibility: OrganizationCompatibilityCheck;
  /** Capabilities the loaded organization declares it can provide. */
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
      readonly kind: "loader-unavailable";
      readonly reason: string;
    };

/**
 * Loader port the Studio runtime consumes (types only). Wave 1 binds this to
 * the `agents` module's organization authority through an adapter; the
 * Studio itself never owns organization storage or search.
 */
export interface StudioOrganizationLoader {
  /** Load exactly the requested versioned organization reference. */
  load(request: OrganizationLoadRequest): Promise<OrganizationLoadResult>;
}
