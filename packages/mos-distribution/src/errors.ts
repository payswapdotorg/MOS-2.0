/**
 * Typed distribution errors (SOCIAL-001).
 *
 * One error class carrying a machine-readable `code` + structured
 * `details` (the JOBS-001/INTEG-001 typed-failure discipline). These are
 * SYNCHRONOUS construction/validation failures (malformed requests,
 * invalid channel registrations, unknown cross-references) — the adapter
 * call surface's OPERATIONAL failures are typed RESULT values, never
 * thrown (see contracts/distribution-record.ts).
 *
 * Foreign-tenant scope is INDISTINGUISHABLE from unknown (§31 no
 * existence leaks): an unknown-social-channel LOOKUP is a typed result,
 * not an error; an unknown reference inside a REGISTRATION is a typed
 * error naming the field, never a silent guess.
 */

/** Machine-readable error codes of the distribution registries + call surface validation. */
export type DistributionErrorCode =
  // Channel registry
  | "invalid-social-channel"
  | "unknown-merchant-client-instance-reference"
  | "duplicate-social-channel"
  | "unknown-social-channel"
  // Adapter call surface request validation
  | "invalid-social-request"
  // Provider profile validation (SOCIAL-002..006)
  | "invalid-provider-profile"
  // Composition
  | "invalid-distribution-composition";

/** Typed distribution failure. */
export class DistributionError extends Error {
  readonly code: DistributionErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: DistributionErrorCode,
    message: string,
    details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = "DistributionError";
    this.code = code;
    this.details = details;
  }
}
