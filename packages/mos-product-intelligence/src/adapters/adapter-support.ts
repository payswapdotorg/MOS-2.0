/**
 * INTERNAL pure support for the W11-A in-memory product-intelligence
 * adapter. NOT exported from the package index — implementation detail,
 * not surface.
 *
 * Contains the deterministic canonical-JSON serialization + FNV-1a digest
 * (the LAB-017/W10-A bit-for-bit change detector, reused verbatim — never
 * a security claim), and the clone-then-deep-freeze ownership helpers with
 * OWN-PROPERTY-SAFE cloning (`Object.defineProperty` per key, so a
 * `__proto__`-carrying caller payload can never pollute `Object.prototype`
 * through the clone — it persists as an inert own property, the W9-B
 * posture).
 */

// ---------------------------------------------------------------------------
// Deterministic canonical serialization + digest (bit-for-bit immutability)
// ---------------------------------------------------------------------------

/**
 * Canonical JSON serialization: object keys sorted recursively, array order
 * preserved, JSON string escaping, `String(n)` number formatting.
 * Deterministic — structurally identical values serialize identically.
 */
export const canonicalJsonStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') {
    return typeof value === 'string' ? JSON.stringify(value) : String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJsonStringify(entry)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJsonStringify(entry)}`)
    .join(',')}}`;
};

/**
 * Deterministic 32-bit FNV-1a hash of a string (hex, zero-padded) — used
 * ONLY for the record's bit-for-bit immutability digest (a change
 * detector, never a security claim; the LAB-017/production precedent).
 */
export const fnv1aHex = (value: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
};

/** The deterministic digest of one canonical-serialized value. */
export const digestOf = (value: unknown): string => fnv1aHex(canonicalJsonStringify(value));

// ---------------------------------------------------------------------------
// Clone-then-deep-freeze ownership (W9-B D3/F1 + own-property safety)
// ---------------------------------------------------------------------------

/**
 * Recursively clone a JSON-shaped value into fresh structures — the
 * CLONE half of clone-then-deep-freeze: caller-supplied records are never
 * frozen or retained in place, so a stored record can never mutate data
 * the caller still owns (and the caller can never rewrite the stored
 * record by mutating its input objects — the W4-B/W9-B D3 lesson).
 *
 * OWN-PROPERTY-SAFE: each key is defined with `Object.defineProperty`, so
 * a caller payload carrying `__proto__` as an own enumerable key (e.g.
 * from `JSON.parse`) is cloned as an INERT OWN PROPERTY — never through
 * the `__proto__` setter, so `Object.prototype` can never be polluted.
 */
export const cloneDeep = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneDeep(entry)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const copy: Record<string, unknown> = Object.create(Object.getPrototypeOf(value));
    for (const key of Object.keys(value)) {
      Object.defineProperty(copy, key, {
        value: cloneDeep((value as Record<string, unknown>)[key]),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return copy as unknown as T;
  }
  return value;
};

/**
 * Recursively freeze a JSON-shaped value in place — the FREEZE half. Only
 * ever applied to values this adapter OWNS (the clones above), never to
 * caller objects.
 */
export const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.getOwnPropertyNames(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
};

// ---------------------------------------------------------------------------
// Structural helpers (shared by validation + the adapter)
// ---------------------------------------------------------------------------

/** Plain-object check (not array, not null; any prototype is tolerated). */
export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Non-blank string check. */
export const isNonBlankString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

/** String-array check: a non-empty array of non-blank strings. */
export const isNonBlankStringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.length > 0 && value.every((entry) => isNonBlankString(entry));

/** Blank-or-null-or-missing check for optional string fields. */
export const isNullOrNonBlankString = (value: unknown): boolean =>
  value === undefined || value === null || isNonBlankString(value);
