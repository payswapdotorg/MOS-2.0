/**
 * SocialPolicyGate port (SOCIAL-001) — the DECLARED policy-gate seam of
 * the distribution call surface.
 *
 * TL TOPOLOGY DECISION (documented in MOS2-WAVE5-HARVEST): the policy
 * package does not exist yet, so the policy gate is a DECLARED PORT SEAM
 * whose CONTRACT SHAPE IS FROZEN HERE — the future policy authority
 * (@mos/policy) implements this port; until then the disclosed in-memory
 * double (adapters/in-memory-social-policy-gate.ts) stands in at the
 * testing/composition seams only. The seam is NOT a policy authority: no
 * policy rule is authored here, and the double is disclosed as a double
 * (never a production policy engine).
 *
 * FAIL-CLOSED DISCIPLINE (test-pinned): a request matching NO policy rule
 * is DENIED (`no-matching-policy`) — exactly like the rights cascade's
 * `no-explicit-grant`. There is no permissive default; permission must
 * come from an explicit policy record.
 *
 * The verdict cites a canonical `PolicyRef` (the frozen CORE-001
 * vocabulary) — the policy authority mints real refs later; the double
 * carries the refs its registered rules name.
 */

import type { IdentityRef, PolicyRef, TenantScope } from "@mos/contracts";
import type { ArtifactRef } from "@mos/content";

import type { DeclaredSocialPresentation, SocialOperation } from "../contracts/social-operation.js";

/** One policy evaluation the adapter runtime requests before a provider call. */
export interface SocialPolicyCheckRequest {
  /** Tenant scope of the operation (policy is tenant-scoped). */
  readonly scope: TenantScope;
  /** §30 actor — the principal whose operation the policy governs. */
  readonly actor: IdentityRef;
  /** Which social operation is being attempted. */
  readonly operation: SocialOperation;
  /** The derived subject reference (artifact or channel — documented derivations). */
  readonly subjectRef: string;
  /** The artifact being distributed, when the operation distributes one. */
  readonly artifact?: ArtifactRef;
  /** The declared presentation, when the operation declares one. */
  readonly presentation?: DeclaredSocialPresentation;
}

/** The fail-closed verdict of one social policy check. */
export interface SocialPolicyVerdict {
  readonly decision: "permitted" | "denied";
  /** The policy denial reason (the future policy authority's vocabulary; `null` when permitted). */
  readonly denialReason: string | null;
  /** The policy record the verdict cites, or `null` (the authority mints these later). */
  readonly policyRef: PolicyRef | null;
}

/** The declared policy-gate seam. 1 public method (policy budget: 12). */
export interface SocialPolicyGatePort {
  /**
   * Evaluates one social policy request — FAIL CLOSED: a request matching
   * no policy rule is denied, never permitted by default.
   */
  check(request: SocialPolicyCheckRequest): SocialPolicyVerdict;
}
