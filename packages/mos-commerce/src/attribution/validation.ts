/**
 * ATTRIB-001 — fail-closed validation, including THE CAUSALITY GUARD: the
 * frozen effect-language vocabulary scanned over every free-text field.
 * Detection is a typed rejection — attribution language is association
 * language, never effect language.
 */
import { isValidTenantId } from "@mos/contracts";
import type { TenantId } from "@mos/contracts";
import type {
  AttributionBasis,
  AttributionError,
  SocialObservationRef,
} from "./types.js";
import { ATTRIBUTION_BASIS_KINDS } from "./types.js";

const err = (
  code: AttributionError["code"],
  message: string,
): AttributionError => ({ code, message });

const isNonBlank = (s: unknown): s is string =>
  typeof s === "string" && s.trim().length > 0;

/**
 * THE CAUSALITY VOCABULARY — the frozen effect-language patterns. An
 * attribution that says any of these is claiming causation (or a causal
 * mechanism) and is rejected fail-closed. The vocabulary is intentionally
 * broad on the effect side: attribution is association, full stop.
 */
export const CAUSALITY_VOCABULARY_PATTERNS = Object.freeze([
  /\bcaused?\b/i,
  /\bcause of\b/i,
  /\bdrives?\b/i,
  /\bdrove\b/i,
  /\bimpacted?\b/i,
  /\bimpact of\b/i,
  /\bincreased? (?:sales|revenue|conversions?|conversion rate|roi)\b/i,
  /\bboost(?:ed)?\b/i,
  /\broi\b/i,
  /\buplift\b/i,
  /\beattributable (?:to|effect)\b/i,
  /\beffect of\b/i,
  /\bresulted in\b/i,
  /\bconverted\b/i,
  /\bconversion (?:up|gain|lift)\b/i,
  /\binfluenced?\b/i,
]) as readonly RegExp[];

/** The causality guard: fail-closed scan of one free-text field. */
export const validateNoCausalityVocabulary = (
  fieldName: string,
  text: string,
): AttributionError | null => {
  for (const pattern of CAUSALITY_VOCABULARY_PATTERNS) {
    const hit = pattern.exec(text ?? "");
    if (hit) {
      return err(
        "CAUSALITY_VOCABULARY_DETECTED",
        `${fieldName} carries effect language "${hit[0]}" — attribution is association language only (distinct from causality by construction)`,
      );
    }
  }
  return null;
};

export const validateTenantId = (
  tenantId: TenantId,
): AttributionError | null =>
  isValidTenantId(tenantId)
    ? null
    : err("INVALID_TENANT", `invalid tenant id: ${String(tenantId)}`);

export const validateSocialRef = (
  ref: SocialObservationRef,
): AttributionError | null =>
  isNonBlank(ref)
    ? null
    : err(
        "INVALID_SOCIAL_REF",
        "the attribution must cite the social observation authority's own record id (an opaque non-blank ref)",
      );

export const validateCandidate = (
  discoveryId: string,
  version: number,
): AttributionError | null => {
  if (!isNonBlank(discoveryId)) {
    return err(
      "INVALID_CANDIDATE_REF",
      "the attribution must cite a commerce discovery record id",
    );
  }
  if (!Number.isInteger(version) || version < 1) {
    return err(
      "INVALID_CANDIDATE_REF",
      "the attribution must cite an EXACT discovery record version (>= 1)",
    );
  }
  return null;
};

export const validateBasis = (
  basis: AttributionBasis | { kind: string; note: string },
): AttributionError | null => {
  if (!basis || typeof basis !== "object") {
    return err("INVALID_BASIS", "a declared linking basis is required");
  }
  if (
    !ATTRIBUTION_BASIS_KINDS.includes(
      basis.kind as (typeof ATTRIBUTION_BASIS_KINDS)[number],
    )
  ) {
    return err(
      "INVALID_BASIS",
      `unknown basis kind (frozen vocabulary: ${ATTRIBUTION_BASIS_KINDS.join(", ")})`,
    );
  }
  if (!isNonBlank(basis.note)) {
    return err("INVALID_BASIS", "the basis note is required (non-blank)");
  }
  return validateNoCausalityVocabulary("basis.note", basis.note);
};

/** Whole-attribution validation — first failure wins (fail-closed). */
export const validateAttribution = (input: {
  tenantId: TenantId;
  socialObservationRef: SocialObservationRef;
  commerceCandidate: { discoveryId: string; version: number };
  basis: AttributionBasis | { kind: string; note: string };
}): AttributionError | null =>
  validateTenantId(input.tenantId) ??
  validateSocialRef(input.socialObservationRef) ??
  validateCandidate(
    input.commerceCandidate?.discoveryId,
    input.commerceCandidate?.version,
  ) ??
  validateBasis(input.basis);
