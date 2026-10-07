/**
 * The W6-C distribution PolicyGatePort seam, satisfied by the policy
 * authority (POLICY-001) — the disclosed composition-seam adapter.
 *
 * ZERO-DRIFT MIRROR (the W2-B substrate mirror pattern, per the W8-A
 * assignment): `@mos/distribution` is NOT a registry dependency of the
 * policy module (registry deps are exactly [contracts, identity]), so
 * the seam's FROZEN contract shape — declared by W6-C in
 * packages/mos-distribution/src/ports/social-policy-gate.port.ts — is
 * MIRRORED here as `DistributionPolicyCheckRequest` /
 * `DistributionPolicyVerdict` / `DistributionPolicyGatePort`, and pinned
 * MUTUALLY ASSIGNABLE against the REAL distribution port types at
 * compile time in compat/distribution-policy-gate-compat.ts (relative
 * type-only imports — no runtime dependency is created), plus a RUNTIME
 * half in compat/distribution-policy-gate.test.ts that wires this gate
 * into the REAL distribution pipeline. Zero drift is therefore enforced
 * by the compiler on every build; the real composition-root wiring is
 * TL-later work.
 *
 * Translation (documented, deterministic):
 * - the seam request maps to a policy evaluation with actionKind
 *   `distribution`, the seam's subjectRef as the action subject and the
 *   seam's actor/scope frame; modalities are derived from the DECLARED
 *   presentation/artifact type by a coarse documented mapping (never
 *   content inference — the W5-A discipline); the seam carries NO spend
 *   or deadline context (disclosed — matched budget/deadline constraints
 *   therefore fail closed);
 * - the policy refs consulted are, by default, the tenant's LATEST
 *   rules whose declared scope governs `distribution` (registration
 *   order) — the composition seam's binding decision; the real
 *   composition root may inject any exact-version ref set;
 * - verdict mapping: allowed → permitted (citing the allowing rule's
 *   canonical PolicyRef); denied → denied with the authority's
 *   attribution detail VERBATIM (naming the rule + constraint);
 *   approval-required → denied naming the approver role (the seam has
 *   NO pending state — an action requiring approval is not permitted to
 *   proceed now; documented design call); insufficient-policy → denied
 *   `insufficient-policy` (FAIL CLOSED — the authority's own vocabulary
 *   surfaced verbatim, the fail-closed twin of the W6-C double's
 *   `no-matching-policy`); evaluation caller errors → denied with the
 *   typed reason verbatim (the gate is TOTAL — it never throws into the
 *   distribution pipeline, and never permits on error).
 */

import type { ArtifactRef, IdentityRef, JsonObject, PolicyRef, TenantScope } from "@mos/contracts";

import type { PolicyRegistryPort } from "../ports/policy-registry.port.js";
import type { PolicyEvaluationPort } from "../ports/policy-evaluation.port.js";
import type { PolicyEvaluationRequest, PolicyRuleVersionRef } from "../contracts/policy-evaluation.js";
import { PolicyError } from "../errors.js";
import type { PolicyModality, PolicyRule } from "../contracts/policy-rule.js";

// ---------------------------------------------------------------------------
// The MIRRORED frozen W6-C seam shape (compat-pinned — zero drift)
// ---------------------------------------------------------------------------

/**
 * The closed social-operation vocabulary of the W6-C seam (mirror of the
 * distribution `SOCIAL_OPERATIONS` const — identical literals).
 */
export const DISTRIBUTION_SEAM_OPERATIONS = Object.freeze([
  "publish",
  "schedule",
  "read-observations",
  "delete",
  "list-restrictions",
] as const);

/** One of the {@link DISTRIBUTION_SEAM_OPERATIONS} entries. */
export type DistributionSeamOperation = (typeof DISTRIBUTION_SEAM_OPERATIONS)[number];

/**
 * The closed presentation-kind vocabulary of the W6-C seam (mirror of
 * the distribution `SOCIAL_PRESENTATION_KINDS` const).
 */
export const DISTRIBUTION_SEAM_PRESENTATION_KINDS = Object.freeze([
  "single-artifact",
  "artifact-with-caption",
  "link-preview",
  "text-only",
] as const);

/** One of the {@link DISTRIBUTION_SEAM_PRESENTATION_KINDS} entries. */
export type DistributionSeamPresentationKind =
  (typeof DISTRIBUTION_SEAM_PRESENTATION_KINDS)[number];

/**
 * The declared presentation of the W6-C seam (mirror of the distribution
 * `DeclaredSocialPresentation` — small control-plane data, never media).
 */
export interface DistributionSeamPresentation {
  readonly kind: DistributionSeamPresentationKind;
  readonly caption?: string;
  readonly parameters?: JsonObject;
}

/**
 * One policy evaluation the distribution runtime requests before a
 * provider call (MIRROR of the distribution `SocialPolicyCheckRequest`).
 */
export interface DistributionPolicyCheckRequest {
  /** Tenant scope of the operation (policy is tenant-scoped). */
  readonly scope: TenantScope;
  /** §30 actor — the principal whose operation the policy governs. */
  readonly actor: IdentityRef;
  /** Which social operation is being attempted. */
  readonly operation: DistributionSeamOperation;
  /** The derived subject reference (artifact or channel — documented derivations). */
  readonly subjectRef: string;
  /** The artifact being distributed, when the operation distributes one. */
  readonly artifact?: ArtifactRef;
  /** The declared presentation, when the operation declares one. */
  readonly presentation?: DistributionSeamPresentation;
}

/**
 * The fail-closed verdict of one distribution policy check (MIRROR of
 * the distribution `SocialPolicyVerdict`).
 */
export interface DistributionPolicyVerdict {
  readonly decision: "permitted" | "denied";
  /** The policy denial reason (the policy authority's vocabulary; `null` when permitted). */
  readonly denialReason: string | null;
  /** The policy record the verdict cites, or `null` (the canonical PolicyRef). */
  readonly policyRef: PolicyRef | null;
}

/** The W6-C policy-gate seam (MIRROR of the distribution `SocialPolicyGatePort`). */
export interface DistributionPolicyGatePort {
  /**
   * Evaluates one distribution policy request — FAIL CLOSED: a request
   * matching no policy rule is denied, never permitted by default.
   */
  check(request: DistributionPolicyCheckRequest): DistributionPolicyVerdict;
}

// ---------------------------------------------------------------------------
// The adapter (satisfies the mirrored seam over the REAL evaluation port)
// ---------------------------------------------------------------------------

/** Options for {@link createDistributionPolicyGate}. */
export interface DistributionPolicyGateOptions {
  /** The rule registry (default policy resolution lists its latest rules). */
  readonly registry: PolicyRegistryPort;
  /** The evaluation port (the REAL policy authority surface). */
  readonly evaluation: PolicyEvaluationPort;
  /**
   * Overrides the default policy resolution — the composition-root
   * wiring seam. Default: the tenant's LATEST rules whose declared scope
   * governs `distribution`, in registration order.
   */
  readonly resolvePolicy?: (
    request: DistributionPolicyCheckRequest,
  ) => readonly PolicyRuleVersionRef[];
}

/** The policy authority's W6-C seam adapter (extends the mirrored port). */
export interface DistributionPolicyGate extends DistributionPolicyGatePort {}

/**
 * The coarse DECLARED-type modality mapping (documented — never content
 * inference): a text-only presentation is text; otherwise the artifact's
 * declared MIME type family decides; undeclared families leave the
 * modality context undeclared (matched modality constraints fail closed).
 */
function derivedModalities(
  request: DistributionPolicyCheckRequest,
): readonly PolicyModality[] | undefined {
  if (request.presentation?.kind === "text-only") {
    return ["text"];
  }
  const type = request.artifact?.type;
  if (typeof type !== "string") {
    return undefined;
  }
  if (type.startsWith("video/")) {
    return ["video"];
  }
  if (type.startsWith("audio/")) {
    return ["audio"];
  }
  if (type.startsWith("image/")) {
    return ["image"];
  }
  if (type.startsWith("text/")) {
    return ["text"];
  }
  return undefined;
}

/** Default resolution: the tenant's latest distribution-scoped rules, registration order. */
function defaultResolvePolicy(
  registry: PolicyRegistryPort,
  request: DistributionPolicyCheckRequest,
): readonly PolicyRuleVersionRef[] {
  return registry
    .listLatestRules(request.scope, { actionKind: "distribution" })
    .map((rule: PolicyRule) => ({ id: rule.id, version: rule.version }));
}

/** Maps the policy authority's verdict onto the W6-C seam verdict. */
function toSeamVerdict(
  result: ReturnType<PolicyEvaluationPort["evaluate"]>,
): DistributionPolicyVerdict {
  const verdict = result.verdict;
  switch (verdict.outcome) {
    case "allowed":
      return {
        decision: "permitted",
        denialReason: null,
        policyRef: verdict.byRule.id,
      };
    case "denied":
      return {
        decision: "denied",
        denialReason: `policy-denied: ${verdict.deniedBy.detail}`,
        policyRef: verdict.deniedBy.rule.id,
      };
    case "approval-required":
      return {
        decision: "denied",
        denialReason: `approval-required: ${verdict.approverRole} must approve (rule ${verdict.byRule.id}@v${verdict.byRule.version}) — the distribution gate has no pending state; obtain approval and retry`,
        policyRef: verdict.byRule.id,
      };
    case "insufficient-policy":
      return {
        decision: "denied",
        denialReason: "insufficient-policy",
        policyRef: null,
      };
  }
}

/** Fail-closed verdict for evaluation caller errors (the gate is TOTAL). */
function evaluationErrorVerdict(error: PolicyError): DistributionPolicyVerdict {
  return {
    decision: "denied",
    denialReason: `policy-evaluation-error: ${error.message}`,
    policyRef: null,
  };
}

/**
 * Creates the policy authority's adapter for the W6-C distribution
 * PolicyGatePort seam (the composition-seam wiring; the compat battery
 * pins it against the REAL distribution port — zero drift).
 */
export function createDistributionPolicyGate(
  options: DistributionPolicyGateOptions,
): DistributionPolicyGate {
  const resolvePolicy =
    options.resolvePolicy ?? ((request) => defaultResolvePolicy(options.registry, request));

  return {
    check(request: DistributionPolicyCheckRequest): DistributionPolicyVerdict {
      try {
        const policyEvaluationRequest: PolicyEvaluationRequest = {
          scope: request.scope,
          actor: request.actor,
          policy: resolvePolicy(request),
          action: {
            actionKind: "distribution",
            subjectRef: request.subjectRef,
            modalities: derivedModalities(request),
          },
        };
        const result = options.evaluation.evaluate(policyEvaluationRequest);
        return toSeamVerdict(result);
      } catch (error) {
        // TOTAL + FAIL CLOSED: a typed caller/wiring error denies — the
        // gate never throws into the distribution pipeline and never
        // permits on error.
        if (error instanceof PolicyError) {
          return evaluationErrorVerdict(error);
        }
        return {
          decision: "denied",
          denialReason: `policy-evaluation-error: ${error instanceof Error ? error.message : String(error)}`,
          policyRef: null,
        };
      }
    },
  };
}
