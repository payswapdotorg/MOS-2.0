/**
 * Provider profile validation + operation-shape checking (SOCIAL-002..006)
 * — the SHARED, provider-neutral machinery every per-provider adapter
 * subtree drives with ITS profile DATA.
 *
 * `validateSocialProviderProfile` is the fail-closed guard for a provider
 * profile declaration: exact field sets at every level, closed
 * vocabularies (operations, support levels, shapes, artifact type
 * families, presentation kinds, auth flow kinds), ONE matrix entry per
 * closed-vocabulary operation (the conservative posture: every operation
 * is declared explicitly — never parity, never a default), shape entries
 * REQUIRED for the artifact-carrying operations declared supported, and
 * the auth model KIND as the canonical `AuthenticationModel` with
 * `managedBy: "integrations"` (the W6-C credential discipline: credentials
 * escrow at the integration boundary, never in the distribution control
 * plane — there is structurally no credential field on a profile).
 *
 * `checkProviderOperationSupport` + `checkProviderOperationShapes` are the
 * two checks a provider transport binding runs INSIDE its subtree before
 * any provider interaction: the ADAPTER's own capability declaration
 * (adapter-level fail-closed — defense in depth over the channel's
 * registered matrix) and the declared operation shapes (a request outside
 * the provider's documented shapes is a typed refusal before any provider
 * operation is recorded).
 *
 * Internal helpers (not exported from the package index — the call surface
 * is the public contract).
 */

import { DistributionError } from "../errors.js";
import type { SocialDistributionFailure } from "../contracts/distribution-record.js";
import type { SocialOperation } from "../contracts/social-operation.js";
import { SOCIAL_OPERATIONS } from "../contracts/social-operation.js";
import { SOCIAL_PRESENTATION_KINDS } from "../contracts/social-operation.js";
import type { SocialPresentationKind } from "../contracts/social-operation.js";
import type { SocialProviderCapability } from "../contracts/social-operation.js";
import type {
  SocialArtifactTypeFamily,
  SocialOperationShape,
  SocialOperationShapeDeclaration,
  SocialProviderProfile,
} from "../contracts/provider-profile.js";
import {
  SOCIAL_ARTIFACT_TYPE_FAMILIES,
  SOCIAL_AUTH_FLOW_KINDS,
  SOCIAL_OPERATION_SHAPES,
  socialArtifactTypeFamily,
} from "../contracts/provider-profile.js";
import {
  assertArray,
  assertExactFields,
  assertNonBlankString,
  assertPlainObject,
  assertVocabularyMember,
  deepFreeze,
} from "./registry-support.js";

const PROFILE_FIELDS = [
  "providerId",
  "displayName",
  "capabilityMatrix",
  "auth",
  "operationShapes",
  "evidenceBasis",
] as const;
const AUTH_DECLARATION_FIELDS = ["model", "flows", "basis"] as const;
const AUTH_MODEL_FIELDS = ["kind", "managedBy"] as const;
const SHAPE_DECLARATION_FIELDS = [
  "operation",
  "shapes",
  "acceptedArtifactTypeFamilies",
  "acceptedPresentationKinds",
  "basis",
  "note",
] as const;
const MATRIX_ENTRY_FIELDS = ["operation", "support", "note"] as const;

const SUPPORT_LEVELS = ["supported", "unsupported", "unknown"] as const;
const SHAPE_OPERATIONS = ["publish", "schedule"] as const;

function invalid(message: string, details: Record<string, unknown>): never {
  throw new DistributionError("invalid-provider-profile", message, details);
}

/** Validates one capability-matrix entry (exact shape + closed vocabulary). */
function validateMatrixEntry(entry: unknown): SocialProviderCapability {
  assertPlainObject(entry, "capabilityMatrix entry", "provider-profile");
  assertExactFields(entry as object, MATRIX_ENTRY_FIELDS, "provider-profile");
  const capability = entry as SocialProviderCapability;
  assertVocabularyMember(capability.operation, SOCIAL_OPERATIONS, "capabilityMatrix.operation", "provider-profile");
  assertVocabularyMember(capability.support, SUPPORT_LEVELS, "capabilityMatrix.support", "provider-profile");
  if (capability.note !== undefined) {
    assertNonBlankString(capability.note, "capabilityMatrix.note", "provider-profile");
  }
  return capability;
}

/**
 * Validates one operation-shape declaration (exact shape, closed
 * vocabularies, non-empty accepted sets). Duplicates inside any of the
 * three sets are rejected (a declaration states its surface exactly).
 */
function validateShapeDeclaration(entry: unknown): SocialOperationShapeDeclaration {
  assertPlainObject(entry, "operationShapes entry", "provider-profile");
  assertExactFields(entry as object, SHAPE_DECLARATION_FIELDS, "provider-profile");
  const declaration = entry as SocialOperationShapeDeclaration;
  assertVocabularyMember(declaration.operation, SHAPE_OPERATIONS, "operationShapes.operation", "provider-profile");
  assertArray(declaration.shapes, "operationShapes.shapes", "provider-profile");
  if (declaration.shapes.length === 0) {
    invalid("an operation-shape declaration must carry at least one shape", { field: "operationShapes.shapes" });
  }
  for (const shape of declaration.shapes) {
    assertVocabularyMember(shape, SOCIAL_OPERATION_SHAPES, "operationShapes.shapes", "provider-profile");
  }
  if (new Set(declaration.shapes as readonly string[]).size !== declaration.shapes.length) {
    invalid("operation-shape declarations carry duplicate shapes", { field: "operationShapes.shapes" });
  }
  assertArray(declaration.acceptedArtifactTypeFamilies, "operationShapes.acceptedArtifactTypeFamilies", "provider-profile");
  if (declaration.acceptedArtifactTypeFamilies.length === 0) {
    invalid("an operation-shape declaration must accept at least one artifact type family", {
      field: "operationShapes.acceptedArtifactTypeFamilies",
    });
  }
  for (const family of declaration.acceptedArtifactTypeFamilies) {
    assertVocabularyMember(
      family,
      SOCIAL_ARTIFACT_TYPE_FAMILIES,
      "operationShapes.acceptedArtifactTypeFamilies",
      "provider-profile",
    );
  }
  if (
    new Set(declaration.acceptedArtifactTypeFamilies as readonly string[]).size !==
    declaration.acceptedArtifactTypeFamilies.length
  ) {
    invalid("operation-shape declarations carry duplicate artifact type families", {
      field: "operationShapes.acceptedArtifactTypeFamilies",
    });
  }
  assertArray(declaration.acceptedPresentationKinds, "operationShapes.acceptedPresentationKinds", "provider-profile");
  if (declaration.acceptedPresentationKinds.length === 0) {
    invalid("an operation-shape declaration must accept at least one presentation kind", {
      field: "operationShapes.acceptedPresentationKinds",
    });
  }
  for (const kind of declaration.acceptedPresentationKinds) {
    assertVocabularyMember(kind, SOCIAL_PRESENTATION_KINDS, "operationShapes.acceptedPresentationKinds", "provider-profile");
  }
  if (
    new Set(declaration.acceptedPresentationKinds as readonly string[]).size !==
    declaration.acceptedPresentationKinds.length
  ) {
    invalid("operation-shape declarations carry duplicate presentation kinds", {
      field: "operationShapes.acceptedPresentationKinds",
    });
  }
  assertNonBlankString(declaration.basis, "operationShapes.basis", "provider-profile");
  if (declaration.note !== undefined) {
    assertNonBlankString(declaration.note, "operationShapes.note", "provider-profile");
  }
  return declaration;
}

/**
 * Validates a provider profile declaration fail-closed and returns it
 * DEEP-FROZEN (a profile is immutable DATA). Requirements beyond the
 * field-level guards:
 * - the capability matrix carries EXACTLY ONE entry per closed-vocabulary
 *   operation (all five — the conservative posture; parity is never
 *   assumed, and no operation is silently undeclared);
 * - the auth model is the canonical `AuthenticationModel` with
 *   `managedBy: "integrations"` (credentials escrow at the integration
 *   boundary — never in the distribution control plane);
 * - every artifact-carrying operation (publish/schedule) the matrix
 *   declares `supported` carries a shape entry; duplicate shape entries
 *   per operation are rejected.
 */
export function validateSocialProviderProfile(profile: unknown): SocialProviderProfile {
  assertPlainObject(profile, "providerProfile", "provider-profile");
  assertExactFields(profile as object, PROFILE_FIELDS, "provider-profile");
  const candidate = profile as SocialProviderProfile;

  assertNonBlankString(candidate.providerId, "providerProfile.providerId", "provider-profile");
  assertNonBlankString(candidate.displayName, "providerProfile.displayName", "provider-profile");
  assertNonBlankString(candidate.evidenceBasis, "providerProfile.evidenceBasis", "provider-profile");

  // --- capability matrix: exactly one entry per closed-vocabulary operation
  assertArray(candidate.capabilityMatrix, "providerProfile.capabilityMatrix", "provider-profile");
  const entries = candidate.capabilityMatrix.map(validateMatrixEntry);
  const declaredOperations = new Set(entries.map((entry) => entry.operation as string));
  for (const operation of SOCIAL_OPERATIONS) {
    if (!declaredOperations.has(operation)) {
      invalid("a provider profile must declare EVERY closed-vocabulary operation (the conservative posture)", {
        field: "providerProfile.capabilityMatrix",
        missingOperation: operation,
      });
    }
  }
  if (entries.length !== SOCIAL_OPERATIONS.length) {
    invalid("a provider profile capability matrix carries duplicate operation entries", {
      field: "providerProfile.capabilityMatrix",
    });
  }

  // --- auth declaration: the canonical KIND-as-data model, no credential surface
  assertPlainObject(candidate.auth, "providerProfile.auth", "provider-profile");
  assertExactFields(candidate.auth as object, AUTH_DECLARATION_FIELDS, "provider-profile");
  const auth = candidate.auth;
  assertPlainObject(auth.model, "providerProfile.auth.model", "provider-profile");
  assertExactFields(auth.model as object, AUTH_MODEL_FIELDS, "provider-profile");
  assertNonBlankString(auth.model.kind, "providerProfile.auth.model.kind", "provider-profile");
  if (auth.model.managedBy !== "integrations") {
    invalid("a social provider profile's credentials are escrowed by the integrations module (managedBy: integrations)", {
      field: "providerProfile.auth.model.managedBy",
      actual: auth.model.managedBy,
    });
  }
  assertArray(auth.flows, "providerProfile.auth.flows", "provider-profile");
  if (auth.flows.length === 0) {
    invalid("a provider profile must declare at least one publicly-known auth flow kind", {
      field: "providerProfile.auth.flows",
    });
  }
  for (const flow of auth.flows) {
    assertVocabularyMember(flow, SOCIAL_AUTH_FLOW_KINDS, "providerProfile.auth.flows", "provider-profile");
  }
  if (new Set(auth.flows as readonly string[]).size !== auth.flows.length) {
    invalid("provider profile auth flow kinds carry duplicates", { field: "providerProfile.auth.flows" });
  }
  assertNonBlankString(auth.basis, "providerProfile.auth.basis", "provider-profile");

  // --- operation shapes: required for supported publish/schedule; unique per operation
  assertArray(candidate.operationShapes, "providerProfile.operationShapes", "provider-profile");
  const shapeDeclarations = candidate.operationShapes.map(validateShapeDeclaration);
  const shapeOperations = new Set(shapeDeclarations.map((entry) => entry.operation as string));
  if (shapeOperations.size !== shapeDeclarations.length) {
    invalid("provider profile operation-shape declarations carry duplicate operations", {
      field: "providerProfile.operationShapes",
    });
  }
  for (const entry of entries) {
    if (
      (entry.operation === "publish" || entry.operation === "schedule") &&
      entry.support === "supported" &&
      !shapeOperations.has(entry.operation)
    ) {
      invalid(
        "an artifact-carrying operation the matrix declares supported MUST carry an operation-shape declaration",
        { field: "providerProfile.operationShapes", operation: entry.operation },
      );
    }
  }

  return deepFreeze({
    providerId: candidate.providerId,
    displayName: candidate.displayName,
    capabilityMatrix: deepFreeze(entries.map((entry) => deepFreeze({ ...entry }))),
    auth: deepFreeze({
      model: deepFreeze({ ...auth.model }),
      flows: deepFreeze([...auth.flows]),
      basis: auth.basis,
    }),
    operationShapes: deepFreeze(
      shapeDeclarations.map((entry) =>
        deepFreeze({
          operation: entry.operation,
          shapes: deepFreeze([...entry.shapes]),
          acceptedArtifactTypeFamilies: deepFreeze([...entry.acceptedArtifactTypeFamilies]),
          acceptedPresentationKinds: deepFreeze([...entry.acceptedPresentationKinds]),
          basis: entry.basis,
          ...(entry.note !== undefined ? { note: entry.note } : {}),
        }),
      ),
    ),
    evidenceBasis: candidate.evidenceBasis,
  });
}

// ---------------------------------------------------------------------------
// The two in-subtree operation checks a provider transport binding runs
// ---------------------------------------------------------------------------

/** The typed outcome of one provider-level operation check. */
export type ProviderOperationCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly refusal: SocialDistributionFailure };

/**
 * Checks an operation against the ADAPTER'S OWN capability declaration
 * (adapter-level fail-closed — defense in depth over the channel's
 * registered matrix): declared unsupported → typed refusal; declared
 * unknown → its OWN preserved typed outcome (never coerced to unsupported);
 * undeclared → typed refusal (a validated profile always declares all
 * five, so this branch is defensive).
 */
export function checkProviderOperationSupport(
  profile: SocialProviderProfile,
  operation: SocialOperation,
): ProviderOperationCheck {
  const declaration = profile.capabilityMatrix.find((entry) => entry.operation === operation);
  if (declaration === undefined) {
    return {
      ok: false,
      refusal: {
        code: "operation-unsupported-at-adapter",
        message:
          "the provider profile declares no entry for this operation — the adapter's declared surface is the whole surface",
        retriable: false,
        details: { operation, profileMissingDeclaration: operation },
      },
    };
  }
  if (declaration.support === "supported") {
    return { ok: true };
  }
  const unknown = declaration.support === "unknown";
  return {
    ok: false,
    refusal: {
      code: unknown ? "operation-support-unknown-at-adapter" : "operation-unsupported-at-adapter",
      message: `the provider profile declares this operation "${declaration.support}"${
        declaration.note !== undefined ? ` (${declaration.note})` : ""
      }`,
      retriable: false,
      details: { operation, declaredSupport: declaration.support },
    },
  };
}

/**
 * Checks one artifact-carrying operation's parameters against the
 * profile's DECLARED operation shapes: the artifact's coarse type family
 * AND the declared presentation kind must both be accepted members of the
 * operation's shape declaration. Anything outside the declared shapes —
 * including artifact types with no family in the closed vocabulary — is a
 * typed `operation-shape-unsupported` refusal BEFORE any provider
 * interaction. Operations without artifact parameters (read-observations,
 * delete, list-restrictions) carry no shape constraints this wave.
 */
export function checkProviderOperationShapes(
  profile: SocialProviderProfile,
  operation: SocialOperation,
  artifactType: unknown,
  presentationKind: unknown,
): ProviderOperationCheck {
  if (operation !== "publish" && operation !== "schedule") {
    return { ok: true };
  }
  const declaration = profile.operationShapes.find((entry) => entry.operation === operation);
  if (declaration === undefined) {
    return {
      ok: false,
      refusal: {
        code: "operation-shape-unsupported",
        message:
          "the provider profile declares no operation shapes for this operation — nothing is in the declared shape set",
        retriable: false,
        details: { operation, declaredShapes: [] },
      },
    };
  }
  const family: SocialArtifactTypeFamily | null =
    typeof artifactType === "string" ? socialArtifactTypeFamily(artifactType) : null;
  const kind = typeof presentationKind === "string" ? (presentationKind as SocialPresentationKind) : undefined;
  const familyAccepted = family !== null && declaration.acceptedArtifactTypeFamilies.includes(family);
  const kindAccepted = kind !== undefined && declaration.acceptedPresentationKinds.includes(kind);
  if (familyAccepted && kindAccepted) {
    return { ok: true };
  }
  const refusal: SocialDistributionFailure = {
    code: "operation-shape-unsupported",
    message:
      "the request is outside the provider profile's declared operation shapes — a typed refusal before any provider interaction",
    retriable: false,
    details: {
      operation,
      declaredShapes: [...declaration.shapes] as readonly SocialOperationShape[],
      acceptedArtifactTypeFamilies: [...declaration.acceptedArtifactTypeFamilies],
      acceptedPresentationKinds: [...declaration.acceptedPresentationKinds],
      ...(typeof artifactType === "string" ? { artifactType } : {}),
      ...(family !== null ? { artifactFamily: family } : {}),
      ...(kind !== undefined ? { presentationKind: kind } : {}),
    },
  };
  return { ok: false, refusal };
}
