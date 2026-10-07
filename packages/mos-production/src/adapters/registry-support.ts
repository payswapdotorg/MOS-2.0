/**
 * Shared freeze support for the in-memory production registries (LAB-013 —
 * the W6-C `adapters/registry-support.ts` discipline).
 *
 * Stored records are DEEP-FROZEN snapshots: every nested field of a
 * registered body/definition/organization/execution record is frozen, so a
 * caller cannot corrupt the stored registry state through a returned
 * reference (the nested shallow-freeze defect class found and fixed in
 * W5-A/W6-A — pinned by the registration tests).
 */

/**
 * Recursively freezes one value (arrays item-wise, objects key-wise). Plain
 * data trees only — functions are frozen at the top level and not traversed.
 */
export function deepFreezeRecord<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    for (const item of value) deepFreezeRecord(item);
    return Object.freeze(value);
  }
  for (const key of Object.keys(value as Record<string, unknown>)) {
    deepFreezeRecord((value as Record<string, unknown>)[key]);
  }
  return Object.freeze(value);
}
