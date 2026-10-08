/**
 * BRIDGE-001 shared validation guards + the compile-pinned studio input-kind
 * vocabulary (extracted from bridge-validation.ts — the file-length policy,
 * behavior-identical).
 *
 * The guards are the W9-B hostile-shape hardening: canonical refs must be
 * STRING PRIMITIVES (never coerced objects/symbols), numerics must be finite
 * (D5), and opaque-ref projection payloads must be PURE DATA (the W10-F3
 * discipline — cyclic or throwing payloads fail closed typed, never crash
 * untyped inside a projection).
 */

import type { StudioInputKind } from "../contracts/studio-format.js";

// ---------------------------------------------------------------------------
// Small shared guards
// ---------------------------------------------------------------------------

/** A plain data record (not null, not an array). */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A positive (≥ 1) finite integer. */
export const isPositiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && Number.isFinite(value) && value >= 1;

/** A finite number (W9-B D5 guard — NaN/±Infinity fail closed). */
export const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** A non-blank string. */
export const nonBlank = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

/**
 * A CANONICAL branded-string ref (a non-blank `string` PRIMITIVE — never an
 * object/symbol whose `String()` coercion would silently pass, the hostile-id
 * hardening of the W9-B D1/D2 discipline).
 */
export const isCanonicalStringRef = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

/**
 * Pure-data serializability of one canonical request value (the W10-F3
 * discipline): the opaque-ref projections JSON-encode the canonical
 * acceptance/delay/rights/return data verbatim — a cyclic structure, a
 * throwing getter or any other non-serializable payload must fail CLOSED
 * TYPED at validation, never crash untyped deep inside the projection.
 */
export const isPureData = (value: unknown): boolean => {
  try {
    JSON.stringify(value);
    return true;
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// The studio input-kind vocabulary (COMPILED from the exported source — the
// no-drift discipline: the tuple is pinned to EXACTLY the REAL
// `StudioInputKind` union members, so a vocabulary change in
// contracts/studio-format.ts fails THIS file's compilation until the intake
// gate is updated deliberately)
// ---------------------------------------------------------------------------

/** Compile-time assertion helper: the expression must resolve to `true`. */
type Expect<T extends true> = T;

/** Every REAL `StudioInputKind` member, in declaration order (compile-pinned). */
const STUDIO_INPUT_KIND_VOCABULARY = [
  "complete-script",
  "question-list",
  "intent",
  "intent-with-source-material",
] as const satisfies readonly StudioInputKind[];

/** Compile-time pin: the tuple covers the vocabulary exactly (no drift). */
type ExhaustiveInputKinds =
  StudioInputKind extends (typeof STUDIO_INPUT_KIND_VOCABULARY)[number]
    ? (typeof STUDIO_INPUT_KIND_VOCABULARY)[number] extends StudioInputKind
      ? true
      : never
    : never;
type _InputKindVocabularyIsExact = Expect<ExhaustiveInputKinds>;

/** The intake gate's closed input-kind set (compiled from the vocabulary). */
export const INPUT_KINDS = new Set<string>(STUDIO_INPUT_KIND_VOCABULARY);
