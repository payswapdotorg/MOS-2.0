/**
 * Shared validation/freeze support for the in-memory distribution
 * registries and the adapter runtime (SOCIAL-001 — the INTEG-001 support
 * discipline).
 *
 * Fail-closed helpers used by every adapter: blank-string guards, plain
 * object guards, closed-vocabulary membership, STRICT-SHAPE validation
 * (the runtime twin of the compile-time exact-keyset pins — a request or
 * record carrying any property beyond its declared field set is
 * rejected, which is how a smuggled media-bytes or credential field is
 * structurally unable to enter the control plane) and deep freezing of
 * stored records.
 */

import { DistributionError } from "../errors.js";
import type { DistributionErrorCode } from "../errors.js";

/** Which surface a validation failure belongs to (selects the code). */
export type DistributionSurface =
  | "social-channel"
  | "social-request"
  | "provider-profile"
  | "distribution-composition";

/** The `invalid-*` error code of one surface. */
export function invalidCodeOf(surface: DistributionSurface): DistributionErrorCode {
  switch (surface) {
    case "social-channel":
      return "invalid-social-channel";
    case "social-request":
      return "invalid-social-request";
    case "provider-profile":
      return "invalid-provider-profile";
    case "distribution-composition":
      return "invalid-distribution-composition";
  }
}

function fail(surface: DistributionSurface, message: string, details: Record<string, unknown>): never {
  throw new DistributionError(invalidCodeOf(surface), message, details);
}

/** True when the value is a string that is empty or whitespace-only. */
export function isBlank(value: unknown): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

/** Fails closed when `value` is not a non-blank string. */
export function assertNonBlankString(value: unknown, field: string, surface: DistributionSurface): void {
  if (isBlank(value)) {
    fail(surface, `${field} must be a non-blank string`, { field });
  }
}

/** Fails closed when `value` is not a non-null plain object. */
export function assertPlainObject(value: unknown, field: string, surface: DistributionSurface): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(surface, `${field} must be a plain object`, { field });
  }
}

/** Fails closed when `value` is not an array. */
export function assertArray(value: unknown, field: string, surface: DistributionSurface): void {
  if (!Array.isArray(value)) {
    fail(surface, `${field} must be an array`, { field });
  }
}

/** Fails closed when `value` is not a member of the closed vocabulary. */
export function assertVocabularyMember(
  value: unknown,
  vocabulary: readonly string[],
  field: string,
  surface: DistributionSurface,
): void {
  if (typeof value !== "string" || !vocabulary.includes(value)) {
    fail(surface, `${field} must be one of [${vocabulary.join(", ")}]`, { field, allowed: [...vocabulary] });
  }
}

/**
 * Fails closed when `value` is not a string that parses as an ISO-8601
 * timestamp (finite `Date.parse`).
 */
export function assertIsoTimestamp(value: unknown, field: string, surface: DistributionSurface): void {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    fail(surface, `${field} must be an ISO-8601 timestamp string`, { field });
  }
}

/**
 * STRICT SHAPE: fails closed listing every property of `input` that is
 * not in `allowedFields`. This is the structural artifact-ref-only guard
 * at the request boundary: a request carrying `mediaBytes`, `base64`,
 * `secret` or any other undeclared property cannot be invoked.
 */
export function assertExactFields(
  input: object,
  allowedFields: readonly string[],
  surface: DistributionSurface,
): void {
  const unexpected = Object.keys(input).filter((key) => !allowedFields.includes(key));
  if (unexpected.length > 0) {
    fail(
      surface,
      `${surface} carries unexpected field(s): ${unexpected.join(", ")} — requests and records are strict-shape (no extra properties can enter the control plane)`,
      { unexpectedFields: [...unexpected], allowedFields: [...allowedFields] },
    );
  }
}

/** Deep-freezes a stored record and everything reachable through it. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

/** Default wall clock (injectable in every adapter for determinism). */
export function defaultNow(): string {
  return new Date().toISOString();
}
