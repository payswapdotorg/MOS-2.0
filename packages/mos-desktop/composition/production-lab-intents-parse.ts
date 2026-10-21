import type { LabIntentActionId, LabIntentAuthorityId, LabIntentFailure } from '@mos/web';

/**
 * DECLARED-JSON parse helpers for the PRODUCTION lab-intents binding
 * (production-lab-intents.ts) — the shell-side half of the UX-003 wave 3
 * transport.
 *
 * The port's declarations carry contract-structured objects (the scenario,
 * reward spec, candidate set, policies, world state, prediction ref,
 * observation refs, error functional) as DECLARED JSON TEXT. This module
 * parses that text with the REAL `JSON.parse` and checks the parsed value's
 * TOP-LEVEL JSON kind against the kind the port's declaration type names
 * (object or array) — a syntax failure or a kind mismatch is a NAMED
 * shell-side failure code (`lab-intent-json-invalid:<field>`), never a
 * crash and never a silently-defaulted value. Deeper shape validation is
 * NOT done here: the lab authority owns it and answers with its own named
 * vocabularies, which the binding relays VERBATIM.
 *
 * The two shell-side code literals are redeclared here (typed to their
 * exact literal types) because `@mos/web`'s package-name runtime export is
 * not node-executable at the composition seam (its exports map points the
 * runtime condition at untranspiled src — the disclosed sibling-dist
 * discipline every composition file follows). The production-lab-intents
 * test imports the REAL built constants and pins these literals against
 * them, so a drift in @mos/web fails the battery instead of shipping.
 */

/**
 * The parse-failure code prefix — pinned to @mos/web's exported constant
 * (`LAB_INTENT_JSON_INVALID_PREFIX`, 'lab-intent-json-invalid').
 */
export const LAB_INTENT_JSON_INVALID_PREFIX: 'lab-intent-json-invalid' = 'lab-intent-json-invalid';

/**
 * The missing-input code — pinned to @mos/web's exported constant
 * (`LAB_INTENT_MISSING_INPUT`, 'lab-intent-missing-input'). Used for
 * contract fields the declaration STRUCTURALLY does not carry and the
 * composition cannot honestly derive (the port's defense-in-depth
 * vocabulary; the forms are the primary required-field gate).
 */
export const LAB_INTENT_MISSING_INPUT: 'lab-intent-missing-input' = 'lab-intent-missing-input';

/**
 * The identity every failure verdict carries — allocated per declaration
 * by the binding (sequential intent id, the declared action, the ISO-8601
 * declaration timestamp, the authority the intent was routed to).
 */
export interface IntentIdentity {
  readonly intentId: string;
  readonly action: LabIntentActionId;
  readonly declaredAt: string;
  readonly routedTo: LabIntentAuthorityId;
}

/** The JSON kind a declaration's JSON text must parse into. */
export type DeclaredJsonKind = 'object' | 'array';

/** One declared-JSON field parse: a value, or a completed failure verdict. */
export type DeclaredJsonParse =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly failure: LabIntentFailure };

/**
 * Parse one declared-JSON field. Failures are named
 * `lab-intent-json-invalid:<field>` with the parser's own message relayed
 * verbatim (or a kind message when the parsed value's top-level JSON kind
 * is not the one the port's declaration type names). Never throws.
 */
export function parseDeclaredJson(
  identity: IntentIdentity,
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
      failure: {
        intentId: identity.intentId,
        action: identity.action,
        declaredAt: identity.declaredAt,
        routedTo: identity.routedTo,
        error: `${LAB_INTENT_JSON_INVALID_PREFIX}:${field}`,
        message: `the declared JSON for ${field} could not be parsed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
    };
  }
  const parsedKind = Array.isArray(value) ? 'array' : value !== null && typeof value === 'object' ? 'object' : 'other';
  if (parsedKind !== kind) {
    const describe =
      value === null
        ? 'null'
        : Array.isArray(value)
          ? 'an array'
          : typeof value;
    return {
      ok: false,
      failure: {
        intentId: identity.intentId,
        action: identity.action,
        declaredAt: identity.declaredAt,
        routedTo: identity.routedTo,
        error: `${LAB_INTENT_JSON_INVALID_PREFIX}:${field}`,
        message: `the declared JSON for ${field} must parse to ${kind === 'array' ? 'an array' : 'an object'} (parsed ${describe})`,
      },
    };
  }
  return { ok: true, value };
}

/**
 * The named missing-input verdict: a contract field the declaration
 * structurally does not carry and the composition cannot honestly derive
 * (the only derivable values are scope/tenant fields and sequential ids).
 */
export function missingInputFailure(
  identity: IntentIdentity,
  field: string,
  message: string,
): LabIntentFailure {
  return {
    intentId: identity.intentId,
    action: identity.action,
    declaredAt: identity.declaredAt,
    routedTo: identity.routedTo,
    error: LAB_INTENT_MISSING_INPUT,
    message,
  };
}

/**
 * Split one comma-separated text field into its trimmed, non-empty
 * entries. An empty (or blank-only) text yields an EMPTY list — no
 * fabricated entries; the authority's own validation decides what an
 * empty list means (the corpus requires at least one non-blank source
 * ref and fails closed with its named code).
 */
export function splitCommaList(text: string): string[] {
  return text
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * Split one comma-separated seed text into numbers. Blank entries are
 * dropped (an empty seed text yields NO seeds — never a fabricated 0);
 * non-numeric entries parse to `NaN`, which the authority's finite-seed
 * validation rejects with its own named code, relayed verbatim.
 */
export function splitCommaNumbers(text: string): number[] {
  return splitCommaList(text).map((entry) => Number(entry));
}
