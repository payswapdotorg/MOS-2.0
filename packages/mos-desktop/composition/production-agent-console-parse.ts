import type {
  ConsoleIntentActionId,
  ConsoleIntentAuthorityId,
  ConsoleIntentFailure,
} from '@mos/web';

/**
 * DECLARED-JSON + declared-shape helpers for the PRODUCTION Agent-Console
 * binding (the CONSOLE wave, Worker C) — the shell-side half of the
 * write-intent transport (the wave-21 production-lab-intents-parse.ts
 * pattern exactly).
 *
 * The port's declarations carry contract-structured objects (rights scopes
 * and terms, intelligence subject/content/source/basis, plan platform
 * choices + metric + experiment expectations, the experiment hypothesis /
 * binding citation frame) as DECLARED JSON TEXT. This module parses that
 * text with the REAL `JSON.parse` and checks the parsed value's TOP-LEVEL
 * JSON kind against the kind the binding's documented contract names — a
 * syntax failure or a kind mismatch is a NAMED shell-side failure code
 * (`console-intent-json-invalid:<field>`), never a crash and never a
 * silently-defaulted value. Deeper shape validation is NOT done here: the
 * REAL authority owns it and answers with its own named vocabularies,
 * which the binding relays VERBATIM.
 *
 * The two shell-side code literals are redeclared here (typed to their
 * exact literal types) because `@mos/web`'s package-name runtime export is
 * not node-executable at the composition seam (its exports map points the
 * runtime condition at untranspiled src — the disclosed sibling-dist
 * discipline every composition file follows). The
 * production-agent-console test imports the REAL built constants and pins
 * these literals against them, so a drift in @mos/web fails the battery
 * instead of shipping.
 */

/**
 * The parse-failure code prefix — pinned to @mos/web's exported constant
 * (`CONSOLE_INTENT_JSON_INVALID_PREFIX`, 'console-intent-json-invalid').
 */
export const CONSOLE_INTENT_JSON_INVALID_PREFIX: 'console-intent-json-invalid' =
  'console-intent-json-invalid';

/**
 * The missing-input code — pinned to @mos/web's exported constant
 * (`CONSOLE_INTENT_MISSING_INPUT`, 'console-intent-missing-input').
 */
export const CONSOLE_INTENT_MISSING_INPUT: 'console-intent-missing-input' =
  'console-intent-missing-input';

/**
 * The identity every failure verdict carries — allocated per declaration
 * by the binding (sequential intent id, the declared action, the ISO-8601
 * declaration timestamp, the authority the intent was routed to).
 */
export interface ConsoleIntentIdentity {
  readonly intentId: string;
  readonly action: ConsoleIntentActionId;
  readonly declaredAt: string;
  readonly routedTo: ConsoleIntentAuthorityId;
}

/** The JSON kind a declaration's JSON text must parse into. */
export type DeclaredJsonKind = 'object' | 'array' | 'string';

/** One declared-JSON field parse: a value, or a completed failure verdict. */
export type DeclaredJsonParse =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly failure: ConsoleIntentFailure };

/**
 * Parse one declared-JSON field. Failures are named
 * `console-intent-json-invalid:<field>` with the parser's own message
 * relayed verbatim (or a kind message when the parsed value's top-level
 * JSON kind is not the one the binding's contract names). Never throws.
 */
export function parseDeclaredJson(
  identity: ConsoleIntentIdentity,
  text: string,
  field: string,
  kind: DeclaredJsonKind,
): DeclaredJsonParse {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      failure: jsonInvalid(identity, field, `could not be parsed: ${
        error instanceof Error ? error.message : String(error)
      }`),
    };
  }
  const parsedKind = Array.isArray(value)
    ? 'array'
    : value !== null && typeof value === 'object'
      ? 'object'
      : typeof value === 'string'
        ? 'string'
        : 'other';
  if (parsedKind !== kind) {
    const describe =
      value === null
        ? 'null'
        : Array.isArray(value)
          ? 'an array'
          : typeof value;
    return {
      ok: false,
      failure: jsonInvalid(
        identity,
        field,
        `must parse to ${kind === 'array' ? 'an array' : kind === 'string' ? 'a JSON string' : 'an object'} (parsed ${describe})`,
      ),
    };
  }
  return { ok: true, value };
}

/** The named `console-intent-json-invalid:<field>` failure. */
export function jsonInvalid(
  identity: ConsoleIntentIdentity,
  field: string,
  detail: string,
): ConsoleIntentFailure {
  return {
    intentId: identity.intentId,
    action: identity.action,
    declaredAt: identity.declaredAt,
    routedTo: identity.routedTo,
    error: `${CONSOLE_INTENT_JSON_INVALID_PREFIX}:${field}`,
    message: `the declared JSON for ${field} ${detail}`,
  };
}

/**
 * The named missing-input verdict: a contract field the declaration
 * structurally does not carry and the composition cannot honestly derive
 * (the only derivable values are scope/tenant fields and sequential ids).
 */
export function missingInputFailure(
  identity: ConsoleIntentIdentity,
  field: string,
  message: string,
): ConsoleIntentFailure {
  return {
    intentId: identity.intentId,
    action: identity.action,
    declaredAt: identity.declaredAt,
    routedTo: identity.routedTo,
    error: CONSOLE_INTENT_MISSING_INPUT,
    message,
  };
}

/**
 * Split one comma-separated text field into its trimmed, non-empty
 * entries. An empty (or blank-only) text yields an EMPTY list — no
 * fabricated entries; the REAL authority's own validation decides what an
 * empty list means (the experiments binding requires a mission ref and
 * the planner's gates fail closed with their named codes).
 */
export function splitCommaList(text: string): string[] {
  return text
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/** True when the value is a plain (non-array, non-null) object. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A non-blank string read from a parsed object field, or `undefined`. */
export function nonBlankString(
  value: Record<string, unknown>,
  field: string,
): string | undefined {
  const raw = value[field];
  return typeof raw === 'string' && raw.trim().length > 0 ? raw : undefined;
}

/** A finite number read from a parsed object field, or `undefined`. */
export function finiteNumber(
  value: Record<string, unknown>,
  field: string,
): number | undefined {
  const raw = value[field];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined;
}

/** A string-array read from a parsed object field, or `undefined`. */
export function stringArray(
  value: Record<string, unknown>,
  field: string,
): readonly string[] | undefined {
  const raw = value[field];
  return Array.isArray(raw) && raw.every((entry) => typeof entry === 'string')
    ? (raw as readonly string[])
    : undefined;
}

/** An object-array read from a parsed object field, or `undefined`. */
export function objectArray(
  value: Record<string, unknown>,
  field: string,
): readonly Record<string, unknown>[] | undefined {
  const raw = value[field];
  return Array.isArray(raw) && raw.every((entry) => isPlainObject(entry))
    ? (raw as readonly Record<string, unknown>[])
    : undefined;
}
