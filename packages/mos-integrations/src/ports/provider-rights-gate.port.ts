/**
 * ProviderRightsGate port (INTEG-001 — the rights gate that precedes every
 * provider call; the backlog's SOCIAL-001 acceptance builds on this
 * structure).
 *
 * Architecture law (spec §27 / AGENTS.md): rights are evaluated ONLY from
 * explicit grant records — never inferred from URL accessibility, provider
 * reachability or account existence. The gate resolves a
 * {@link RightsContextRef} (an opaque handle to the caller's rights frame
 * — the explicit grant view) and evaluates whether an ADEQUATE explicit
 * grant covers THIS grantee performing THIS action on THIS subject, using
 * the @mos/rights vocabulary and evaluation rule.
 *
 * FAIL-CLOSED: an unresolvable rights context handle (including one
 * registered in ANOTHER tenant) is a DENIAL, never a pass-through; a
 * context whose grants do not cover the grantee/action/subject is a
 * denial with the @mos/rights reason, verbatim.
 *
 * This port is the integrations-owned STRUCTURAL seam; real adapter wiring
 * is composition-root work (the disclosed in-memory double delegates
 * evaluation to the REAL `evaluateRights` rule injected at the
 * testing/composition seam — no rights rule is re-implemented here).
 *
 * Port files never import @zcode/* (boundary rule PORTS-NO-ZCODE).
 */

import type { IdentityId, RightsAction, RightsDenialReason, RightsRef } from "@mos/rights";
import type { TenantScope } from "@mos/contracts";

import type { RightsContextRef } from "../contracts/ids.js";

/** Why a provider interaction was denied at the rights gate. */
export type ProviderRightsDenialReason =
  /** The gate could not resolve the rights context handle at all (fail-closed). */
  | "rights-context-unresolved"
  /** The denial reasons of the @mos/rights evaluation rule (verbatim — never reinterpreted). */
  | RightsDenialReason;

/** One rights-gate evaluation request for a provider interaction. */
export interface ProviderRightsCheckRequest {
  /** Tenant scope of the interaction. */
  readonly scope: TenantScope;
  /** The caller's rights frame handle (the explicit grant view to evaluate against). */
  readonly rightsContextRef: RightsContextRef;
  /** The identity principal (the §30 actor) requesting the interaction — grants must name THIS grantee. */
  readonly grantee: IdentityId;
  /** The @mos/rights action being exercised through the provider call. */
  readonly action: RightsAction;
  /**
   * The subject the action applies to (derived by the call surface from
   * the merchant/client instance — grants must NAME it explicitly).
   */
  readonly subjectRef: string;
}

/** The verdict of one rights-gate evaluation. */
export interface ProviderRightsGateVerdict {
  /** Whether an adequate explicit grant covers the interaction. */
  readonly allowed: boolean;
  /** Denial reason, or `null` when allowed. */
  readonly denialReason: ProviderRightsDenialReason | null;
  /** The explicit grant that authorized the interaction, or `null`. */
  readonly grantRef: RightsRef | null;
}

/**
 * The rights gate: fail-closed evaluation of whether a provider
 * interaction is covered by an adequate explicit grant. 1 public method
 * (policy budget: 12).
 */
export interface ProviderRightsGatePort {
  /**
   * Evaluates one interaction against the caller's rights context.
   * Fail-closed: unresolvable context handles and missing grants are
   * denials, never pass-throughs.
   */
  check(request: ProviderRightsCheckRequest): ProviderRightsGateVerdict;
}
