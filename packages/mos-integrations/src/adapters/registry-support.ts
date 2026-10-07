/**
 * Shared validation/freeze support for the in-memory integrations
 * registries (INTEG-001).
 *
 * Fail-closed helpers used by every adapter: blank-string guards, plain
 * object guards, closed-vocabulary membership, STRICT-SHAPE validation
 * (the runtime twin of the compile-time exact-keyset pins — a record
 * carrying any property beyond its declared field set is rejected, which
 * is how a smuggled credential-value field is structurally unable to enter
 * the control plane) and deep freezing of stored records.
 */

import { IntegrationsError } from "../errors.js";
import type { IntegrationsErrorCode } from "../errors.js";

/** Which registry layer a validation failure belongs to (selects the code). */
export type RegistryLayer =
  | "provider-definition"
  | "provider-implementation"
  | "merchant-client-instance"
  | "availability-capability"
  | "interaction-request";

/** The `invalid-*` error code of one layer. */
export function invalidCodeOf(layer: RegistryLayer): IntegrationsErrorCode {
  switch (layer) {
    case "provider-definition":
      return "invalid-provider-definition";
    case "provider-implementation":
      return "invalid-provider-implementation";
    case "merchant-client-instance":
      return "invalid-merchant-client-instance";
    case "availability-capability":
      return "invalid-availability-capability";
    case "interaction-request":
      return "invalid-interaction-request";
  }
}

function fail(layer: RegistryLayer, message: string, details: Record<string, unknown>): never {
  throw new IntegrationsError(invalidCodeOf(layer), message, details);
}

/** True when the value is a string that is empty or whitespace-only. */
export function isBlank(value: unknown): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

/** Fails closed when `value` is not a non-blank string. */
export function assertNonBlankString(value: unknown, field: string, layer: RegistryLayer): void {
  if (isBlank(value)) {
    fail(layer, `${field} must be a non-blank string`, { field });
  }
}

/** Fails closed when `value` is not a non-null plain object. */
export function assertPlainObject(value: unknown, field: string, layer: RegistryLayer): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(layer, `${field} must be a plain object`, { field });
  }
}

/** Fails closed when `value` is not an array. */
export function assertArray(value: unknown, field: string, layer: RegistryLayer): void {
  if (!Array.isArray(value)) {
    fail(layer, `${field} must be an array`, { field });
  }
}

/** Fails closed when `value` is not a finite number ≥ `min`. */
export function assertFiniteNumber(value: unknown, field: string, min: number, layer: RegistryLayer): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min) {
    fail(layer, `${field} must be a finite number ≥ ${min}`, { field });
  }
}

/** Fails closed when `value` is not a member of the closed vocabulary. */
export function assertVocabularyMember(
  value: unknown,
  vocabulary: readonly string[],
  field: string,
  layer: RegistryLayer,
): void {
  if (typeof value !== "string" || !vocabulary.includes(value)) {
    fail(layer, `${field} must be one of [${vocabulary.join(", ")}]`, { field, allowed: [...vocabulary] });
  }
}

/**
 * STRICT SHAPE: fails closed listing every property of `input` that is not
 * in `allowedFields`. This is the structural credential-never-in-control-
 * plane guard at the registry boundary: a record carrying `secret`,
 * `accessToken` or any other undeclared property cannot be registered.
 */
export function assertExactFields(
  input: object,
  allowedFields: readonly string[],
  layer: RegistryLayer,
): void {
  const unexpected = Object.keys(input).filter((key) => !allowedFields.includes(key));
  if (unexpected.length > 0) {
    fail(
      layer,
      `${layer} registration carries unexpected field(s): ${unexpected.join(", ")} — records are strict-shape (no extra properties can enter the control plane)`,
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
