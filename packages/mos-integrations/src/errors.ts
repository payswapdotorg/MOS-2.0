/**
 * Typed integrations-registry errors (INTEG-001).
 *
 * One error class carrying a machine-readable `code` + structured
 * `details` (the JOBS-001 typed-failure discipline; four registries and
 * one call surface share the vocabulary). Fail-closed everywhere: malformed
 * records, unknown cross-references (foreign-tenant scope is
 * INDISTINGUISHABLE from unknown — §31 no existence leaks), unresolved
 * credential handles, unresolvable capability refs, duplicate instance
 * names and malformed interaction requests are typed errors, never silent
 * behavior.
 *
 * Record versions are REGISTRY-ASSIGNED (append-only snapshots: fresh ids
 * start at version 1, known ids append the next version), so duplicate
 * id+version collisions and non-monotonic versions are structurally
 * impossible — there are no such codes.
 */

/** Machine-readable error codes of the integrations registries. */
export type IntegrationsErrorCode =
  // Layer 1 — provider definitions
  | "invalid-provider-definition"
  // Layer 2 — provider implementations
  | "invalid-provider-implementation"
  | "unknown-provider-definition-reference"
  | "unknown-provider-implementation"
  // Layer 3 — merchant/client instances
  | "invalid-merchant-client-instance"
  | "unknown-provider-implementation-reference"
  | "unresolved-credential-ref"
  | "duplicate-merchant-client-instance"
  | "unknown-merchant-client-instance"
  // Layer 4 — availability capabilities
  | "invalid-availability-capability"
  | "unknown-capability-reference"
  | "unknown-availability-capability"
  // Call surface
  | "invalid-interaction-request";

/** Typed integrations-registry failure. */
export class IntegrationsError extends Error {
  readonly code: IntegrationsErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: IntegrationsErrorCode,
    message: string,
    details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = "IntegrationsError";
    this.code = code;
    this.details = details;
  }
}
