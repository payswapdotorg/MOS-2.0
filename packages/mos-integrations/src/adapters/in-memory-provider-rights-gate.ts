/**
 * In-memory ProviderRightsGate adapter (INTEG-001 — the DISCLOSED DOUBLE of
 * the rights-gate seam).
 *
 * What is doubled: the resolution of a {@link RightsContextRef} handle to
 * the underlying explicit rights-grant view (contexts are registered into
 * this double's map). What is REAL: the evaluation itself — the adapter
 * delegates to the injected evaluator, whose canonical implementation is
 * the REAL `evaluateRights` rule of @mos/rights (the pure §27 "rights are
 * evaluated only from explicit grant records" cascade), injected at the
 * testing/composition seam (src/testing/compose-integrations-stack.ts) and
 * at the future production composition root. No rights rule is
 * re-implemented here — there is no second rights authority.
 *
 * The grantee is taken from the CHECK REQUEST (the §30 actor), not from
 * the stored context: a context is a named grant VIEW, and only grants
 * naming the requesting grantee count — the REAL evaluation rule enforces
 * this (stage 3 of its cascade).
 *
 * FAIL-CLOSED: an unresolvable rights context handle — including one
 * registered in ANOTHER tenant — is a DENIAL with reason
 * `rights-context-unresolved`, never a pass-through (§31: no cross-tenant
 * existence leaks).
 *
 * DISCLOSED LIMIT: process-local handle map (no durability claim); the
 * production adapter resolves context refs against the rights authority's
 * real storage through the same port.
 */

import type {
  RightsEvaluationRequest,
  RightsEvaluationResult,
  RightsGrant,
} from "@mos/rights";
import type { TenantScope } from "@mos/contracts";

import type { RightsContextRef } from "../contracts/ids.js";
import type {
  ProviderRightsCheckRequest,
  ProviderRightsGatePort,
  ProviderRightsGateVerdict,
} from "../ports/provider-rights-gate.port.js";
import { defaultNow } from "./registry-support.js";

/**
 * The evaluator this double delegates to — structurally the REAL
 * `evaluateRights` of @mos/rights (injected; never re-implemented here).
 */
export type RightsEvaluator = (request: RightsEvaluationRequest) => RightsEvaluationResult;

/** Options for the in-memory rights gate. */
export interface InMemoryProviderRightsGateOptions {
  /** The REAL evaluation rule (evaluateRights), injected by the composition root. */
  readonly evaluate: RightsEvaluator;
  /** Injectable clock (deterministic tests). */
  readonly now?: () => string;
}

/** One rights context registered into the double: a named explicit-grant view. */
interface RegisteredContext {
  readonly scope: TenantScope;
  readonly grants: readonly RightsGrant[];
}

/** The in-memory rights gate: the ProviderRightsGatePort double + seeding. */
export interface InMemoryProviderRightsGate extends ProviderRightsGatePort {
  /**
   * Registers one rights context into the double and returns its handle
   * (the composition seam's seeding path — the production adapter resolves
   * context refs from real rights-authority storage instead).
   */
  registerRightsContext(input: {
    readonly scope: TenantScope;
    readonly grants: readonly RightsGrant[];
  }): RightsContextRef;
}

/**
 * Creates the in-memory {@link ProviderRightsGatePort} double.
 */
export function createInMemoryProviderRightsGate(
  options: InMemoryProviderRightsGateOptions,
): InMemoryProviderRightsGate {
  const evaluate = options.evaluate;
  const now = options.now ?? defaultNow;
  const contexts = new Map<string, RegisteredContext>();
  let minted = 0;

  return {
    registerRightsContext(input): RightsContextRef {
      const ref = `rights-context-${++minted}` as RightsContextRef;
      contexts.set(ref as string, {
        scope: input.scope,
        grants: input.grants,
      });
      return ref;
    },

    check(request: ProviderRightsCheckRequest): ProviderRightsGateVerdict {
      const context = contexts.get(request.rightsContextRef as string);
      // FAIL-CLOSED: unresolvable handle (or a handle of ANOTHER tenant —
      // indistinguishable) is a denial, never a pass-through.
      if (
        context === undefined ||
        (context.scope.tenantId as string) !== (request.scope.tenantId as string)
      ) {
        return {
          allowed: false,
          denialReason: "rights-context-unresolved",
          grantRef: null,
        };
      }

      // The REAL rule: explicit grants only, deterministic cascade, denial
      // reasons verbatim from the @mos/rights vocabulary. The grantee comes
      // from the request — only grants naming THIS principal count.
      const result: RightsEvaluationResult = evaluate({
        tenantId: request.scope.tenantId,
        grantee: request.grantee,
        action: request.action,
        subjectRef: request.subjectRef,
        grants: context.grants,
        now: now(),
      });
      if (result.verdict === "granted") {
        return { allowed: true, denialReason: null, grantRef: result.grantRef };
      }
      return { allowed: false, denialReason: result.reason, grantRef: null };
    },
  };
}
