/**
 * In-memory pawn rights gate (LAB-013) — the DISCLOSED DOUBLE of the
 * rights-gate seam.
 *
 * What is doubled: the resolution of the tenant's explicit-grant view (a
 * process-local map — the production adapter resolves grants from the
 * rights authority's storage through the same port). What is REAL: the
 * evaluation itself — the adapter delegates to the injected evaluator,
 * whose canonical implementation is the REAL `evaluateRights` rule of
 * @mos/rights (§27: rights are evaluated ONLY from explicit grant records;
 * injected at the testing/composition seam, never re-implemented here —
 * there is no second rights authority).
 *
 * The gate evaluates ONE rights subject per input artifact (the frozen
 * operation mapping for pawn execution: the `transform` action over the
 * input artifact ids) and fails closed on the FIRST verbatim denial.
 * Grants registered in ANOTHER tenant never evaluate (per-tenant views).
 */

import type { RightsEvaluationRequest, RightsEvaluationResult, RightsGrant } from "@mos/rights";
import type { TenantScope } from "@mos/contracts";

import type {
  PawnRightsCheckRequest,
  PawnRightsGatePort,
  PawnRightsGateVerdict,
} from "../ports/rights-gate.port.js";

/**
 * The evaluator this double delegates to — structurally the REAL
 * `evaluateRights` of @mos/rights (injected; never re-implemented here).
 */
export type PawnRightsEvaluator = (request: RightsEvaluationRequest) => RightsEvaluationResult;

/** Options for the in-memory pawn rights gate. */
export interface InMemoryPawnRightsGateOptions {
  /** The REAL evaluation rule (evaluateRights), injected by the composition root. */
  readonly evaluate: PawnRightsEvaluator;
  /** Injectable clock for expiry evaluation (deterministic tests). */
  readonly now?: () => string;
}

/** The in-memory rights gate (plus its grant-view registration surface). */
export interface InMemoryPawnRightsGate extends PawnRightsGatePort {
  /** Registers the explicit-grant view of one tenant (replaces the view). */
  registerGrantView(scope: TenantScope, grants: readonly RightsGrant[]): void;
}

/** Creates the in-memory {@link PawnRightsGatePort} double. */
export function createInMemoryPawnRightsGate(
  options: InMemoryPawnRightsGateOptions,
): InMemoryPawnRightsGate {
  const now = options.now ?? (() => new Date().toISOString());
  /** tenantId → the tenant's complete explicit-grant view. */
  const grantViews = new Map<string, readonly RightsGrant[]>();

  const gate: InMemoryPawnRightsGate = {
    registerGrantView(scope: TenantScope, grants: readonly RightsGrant[]): void {
      grantViews.set(scope.tenantId as string, Object.freeze([...grants]));
    },
    check(request: PawnRightsCheckRequest): PawnRightsGateVerdict {
      const grants = grantViews.get(request.scope.tenantId as string) ?? [];
      let subjectsEvaluated = 0;
      let citedGrantRef: string | null = null;
      for (const subjectRef of request.subjectRefs) {
        subjectsEvaluated += 1;
        const result = options.evaluate({
          tenantId: request.scope.tenantId,
          grantee: request.grantee as RightsEvaluationRequest["grantee"],
          action: request.action,
          subjectRef,
          grants,
          now: now(),
        });
        if (result.verdict === "denied") {
          return {
            allowed: false,
            denialReason: result.reason,
            grantRef: null,
            subjectsEvaluated,
          };
        }
        citedGrantRef = citedGrantRef ?? result.grantRef ?? null;
      }
      return {
        allowed: true,
        denialReason: null,
        grantRef: citedGrantRef,
        subjectsEvaluated,
      };
    },
  };
  return gate;
}
