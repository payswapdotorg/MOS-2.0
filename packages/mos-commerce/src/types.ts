/**
 * COMMERCE-001 — the commerce-discovery record contracts.
 *
 * Discovery candidates carry PROVENANCE (every candidate cites ≥1
 * product-intelligence record — external commerce observations cited with
 * provenance, never authored) and a DEMAND-TEST DECLARATION whose binding
 * runs through the REAL experiment authority via the declared
 * {@link DemandExperimentPort} seam (registry-exact runtime deps exclude
 * @mos/experiments BY DESIGN — the port speaks citation shapes; the REAL
 * binding is composed TL-side / at the composition root, proven by the
 * compat battery against the REAL authority over dist).
 *
 * The hard boundary (spec: "no listing/order/inventory authority
 * duplication"): this module has NO vocabulary, record kind, or state for
 * orders/inventory/listings — a source-scan pin enforces it. Commerce
 * truth stays external; candidates INFORM, they never transact.
 */
import type {
  ExperimentRef,
  IdentityRef,
  MissionRef,
  TenantId,
  TenantScope,
  Timestamp,
} from "@mos/contracts";
import type {
  CommerceObservationCitation,
  ProductIntelligenceVersionRef,
  ProductSubjectRef,
} from "@mos/product-intelligence";

/** Opaque reference to a commerce-discovery record (this module owns it). */
export type CommerceDiscoveryId = `${string}`;

/**
 * One provenance source: an EXACT product-intelligence record version plus
 * the commerce observation citation it carries. The candidate's evidence is
 * CITED, never authored (fail-closed: a record without resolvable provenance
 * is a typed rejection).
 */
export interface ProvenanceSource {
  /** EXACT version of the cited product-intelligence record (never "latest"). */
  readonly sourceRef: ProductIntelligenceVersionRef;
  /** The external commerce observation the citation carries. */
  readonly citation: CommerceObservationCitation;
}

/**
 * The declared demand test: the citations + expectations the REAL experiment
 * binding resolves. Mirrors the real-experiment binding's caller-frame
 * discipline (every ref resolves to an EXACT version; unresolvable refs are
 * typed failures, never fabrication).
 */
export interface DemandTestDeclaration {
  /** EXACT mission record version the demand-test linkage cites. */
  readonly mission: {
    readonly missionRef: MissionRef;
    readonly missionVersion: number;
  };
  /** The question the demand test is expected to decide (non-blank). */
  readonly question: string;
  /** The declared success criterion (non-blank). */
  readonly successCriterion: string;
  /** The product-intelligence versioned citations backing the expectation. */
  readonly evidence: readonly ProductIntelligenceVersionRef[];
  /**
   * Whether the declared expectation is counterfactual-labeled (forecast
   * bases are; cited evidence bases are not — the §25 literal-pin law).
   */
  readonly counterfactualLabeled: boolean;
}

/** One append-only correction entry (the version chain grows, never mutates). */
export interface CorrectionRecord {
  /** The version this correction produced (previous + 1). */
  readonly version: number;
  readonly at: Timestamp;
  /** §30-attributable reason (non-blank). */
  readonly reason: string;
  /** The fields the correction changed (a subset snapshot, never the whole). */
  readonly changed: ReadonlyArray<string>;
}

/** THE commerce-discovery record: versioned, tenant-scoped, append-only. */
export interface CommerceDiscoveryRecord {
  readonly id: CommerceDiscoveryId;
  readonly tenantId: TenantId;
  readonly tenantScope: TenantScope;
  /** Monotonic version (starts at 1; corrections append). */
  readonly version: number;
  /** The discovered subject (a product-intelligence subject reference). */
  readonly subject: ProductSubjectRef;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
  /** ≥1 provenance sources — the candidate's cited evidence. */
  readonly provenance: readonly ProvenanceSource[];
  readonly demandTest: DemandTestDeclaration;
  readonly corrections: readonly CorrectionRecord[];
}

/** Closed failure vocabulary (frozen below — no open-ended error strings). */
export const COMMERCE_DISCOVERY_ERROR_CODES = Object.freeze([
  "INVALID_TENANT",
  "INVALID_SUBJECT",
  "PROVENANCE_REQUIRED",
  "INVALID_PROVENANCE",
  "INVALID_DEMAND_TEST",
  "DUPLICATE_ID",
  "NOT_FOUND",
  "VERSION_CONFLICT",
  "DEMAND_PORT_DENIED",
] as const);

export type CommerceDiscoveryErrorCode =
  (typeof COMMERCE_DISCOVERY_ERROR_CODES)[number];

/** Fail-closed typed error. Denials carry verbatim attribution when present. */
export interface CommerceDiscoveryError {
  readonly code: CommerceDiscoveryErrorCode;
  readonly message: string;
  /** Verbatim attribution from the denying authority (port denials only). */
  readonly attribution?: string;
}

/**
 * The demand-experiment seam. The REAL implementation adapts the REAL
 * experiment authority (@mos/experiments — a devDep here, composed at the
 * integration root per the hexagonal law); in-package tests use the
 * disclosed in-memory double. The outcome carries the REAL experiment ref
 * on success or a verbatim-attributed denial — never a fabricated
 * experiment id.
 */
export interface DemandExperimentPort {
  bindDemandTest(
    scope: TenantScope,
    actor: IdentityRef,
    record: CommerceDiscoveryRecord,
  ): Promise<DemandExperimentBindingOutcome>;
}

/** Ok/failure pair of the demand-test binding attempt. */
export type DemandExperimentBindingOutcome =
  | {
      readonly ok: true;
      /** The REAL experiment the demand test rides (authority-minted). */
      readonly experimentRef: ExperimentRef;
    }
  | {
      readonly ok: false;
      /** The denial — verbatim attribution from the real authority. */
      readonly error: CommerceDiscoveryError & {
        readonly code: "DEMAND_PORT_DENIED";
      };
    };
