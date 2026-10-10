/**
 * Deterministic canonical serialization + digest (the LAB-017 discipline,
 * re-declared locally — `@mos/lab` is NOT a registry dependency of this
 * module, so the technique is re-implemented here verbatim).
 *
 * Canonical JSON: object keys sorted recursively, array order preserved,
 * JSON string escaping, `String(n)` number formatting — structurally
 * identical values serialize identically. The 32-bit FNV-1a hex digest is
 * a CHANGE DETECTOR (bit-for-bit record immutability verification), never
 * a security claim (the production stableTagOf precedent).
 */

/** Canonical JSON serialization (deterministic over value structure). */
export const canonicalJsonStringify = (value: unknown): string => {
  if (value === null || typeof value !== "object") {
    return typeof value === "string" ? JSON.stringify(value) : String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJsonStringify(entry)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJsonStringify(entry)}`)
    .join(",")}}`;
};

/** Deterministic 32-bit FNV-1a hash of a string (hex, zero-padded). */
export const fnv1aHex = (value: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
};

/** The deterministic digest of one canonical-serialized value. */
export const digestOf = (value: unknown): string => fnv1aHex(canonicalJsonStringify(value));

/** ISO-8601 timestamp validity (the injectable-clock discipline: strings stay strings). */
export const isValidIsoTimestamp = (value: string): boolean => {
  if (typeof value !== "string" || value.length === 0) {
    return false;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
};
