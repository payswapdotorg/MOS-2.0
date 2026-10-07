/**
 * Shared support for the in-memory policy adapters (POLICY-001).
 *
 * Ownership discipline (the W4-B clone-then-freeze precedent): stored
 * records are CLONED and then DEEP-FROZEN — the caller's input objects
 * are never mutated and never frozen in place, and the returned records
 * are immutable at every nesting level (the W5-A/W6-A nested-freeze
 * lesson, applied from the start). The default wall clock is injectable
 * everywhere for determinism.
 */

/** Deep-freezes a value and everything reachable through it. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

/** Clones then deep-freezes (ownership: caller data is never frozen in place). */
export function freezeClone<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

/** Default wall clock (injectable in every adapter for determinism). */
export function defaultNow(): string {
  return new Date().toISOString();
}
