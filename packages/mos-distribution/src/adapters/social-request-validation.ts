/**
 * Social adapter request validation (SOCIAL-001) — the STRICT-SHAPE guard
 * at the call-surface boundary.
 *
 * Every operation input is validated fail-closed BEFORE the pipeline runs:
 * exact field sets (a request carrying any property beyond its declared
 * field set is rejected — the structural artifact-ref-only guard: a
 * smuggled `mediaBytes`/`base64`/credential field cannot enter the control
 * plane), closed vocabularies (presentation kinds, rights actions), and
 * full artifact-REF validation (all reference fields present and
 * well-formed — references only, there is no media-value field).
 *
 * Internal helpers (not exported from the package index — the call
 * surface is the public contract).
 */

import type { ArtifactRef } from "@mos/content";

import type {
  DeclaredSocialPresentation,
  DeleteSocialPostInput,
  ListSocialRestrictionsInput,
  PublishSocialPostInput,
  ReadSocialObservationsInput,
  ScheduleSocialPostInput,
  SocialOperationRequest,
} from "../contracts/social-operation.js";
import { SOCIAL_PRESENTATION_KINDS } from "../contracts/social-operation.js";
import { DistributionError } from "../errors.js";
import {
  assertExactFields,
  assertNonBlankString,
  assertPlainObject,
  assertVocabularyMember,
} from "./registry-support.js";

const BASE_REQUEST_FIELDS = ["scope", "channelRef", "actor", "rightsContextRef"] as const;
const PUBLISH_FIELDS = [...BASE_REQUEST_FIELDS, "artifact", "presentation"] as const;
const SCHEDULE_FIELDS = [...PUBLISH_FIELDS, "scheduledAt"] as const;
const READ_OBSERVATIONS_FIELDS = [...BASE_REQUEST_FIELDS, "subjectRef"] as const;
const DELETE_FIELDS = [...BASE_REQUEST_FIELDS, "postRef"] as const;
const LIST_RESTRICTIONS_FIELDS = [...BASE_REQUEST_FIELDS] as const;

const ARTIFACT_REF_FIELDS = [
  "artifactId",
  "version",
  "tenantId",
  "digest",
  "type",
  "storageRef",
  "rightsRef",
  "provenanceRef",
] as const;

const PRESENTATION_FIELDS = ["kind", "caption", "parameters"] as const;

/** The runtime @mos/rights action union (runtime twin of the frozen mapping). */
export const RIGHTS_ACTIONS = ["use", "transform", "distribute", "derive", "analyze"] as const;

function validateBase(request: SocialOperationRequest, fields: readonly string[]): void {
  assertExactFields(request, fields, "social-request");
  if (request.scope === undefined || typeof request.scope !== "object") {
    throw new DistributionError("invalid-social-request", "scope is required", { field: "scope" });
  }
  assertNonBlankString(request.scope.tenantId, "scope.tenantId", "social-request");
  assertNonBlankString(request.channelRef, "channelRef", "social-request");
  assertNonBlankString(request.actor, "actor", "social-request");
  assertNonBlankString(request.rightsContextRef, "rightsContextRef", "social-request");
}

function validateArtifact(value: unknown): ArtifactRef {
  assertPlainObject(value, "artifact", "social-request");
  assertExactFields(value as object, ARTIFACT_REF_FIELDS, "social-request");
  const artifact = value as ArtifactRef;
  assertNonBlankString(artifact.artifactId, "artifact.artifactId", "social-request");
  if (typeof artifact.version !== "number" || !Number.isInteger(artifact.version) || artifact.version < 1) {
    throw new DistributionError("invalid-social-request", "artifact.version must be an integer ≥ 1", {
      field: "artifact.version",
    });
  }
  assertNonBlankString(artifact.tenantId, "artifact.tenantId", "social-request");
  assertNonBlankString(artifact.digest, "artifact.digest", "social-request");
  assertNonBlankString(artifact.type, "artifact.type", "social-request");
  assertNonBlankString(artifact.storageRef, "artifact.storageRef", "social-request");
  assertNonBlankString(artifact.rightsRef, "artifact.rightsRef", "social-request");
  assertNonBlankString(artifact.provenanceRef, "artifact.provenanceRef", "social-request");
  return artifact;
}

function validatePresentation(value: unknown): DeclaredSocialPresentation {
  assertPlainObject(value, "presentation", "social-request");
  assertExactFields(value as object, PRESENTATION_FIELDS, "social-request");
  const presentation = value as DeclaredSocialPresentation;
  assertVocabularyMember(presentation.kind, SOCIAL_PRESENTATION_KINDS, "presentation.kind", "social-request");
  if (presentation.caption !== undefined) {
    assertNonBlankString(presentation.caption, "presentation.caption", "social-request");
  }
  if (presentation.parameters !== undefined) {
    assertPlainObject(presentation.parameters, "presentation.parameters", "social-request");
  }
  return presentation;
}

/** The validated payload of an artifact-carrying operation. */
export interface ValidatedArtifactPayload {
  readonly artifact: ArtifactRef;
  readonly presentation: DeclaredSocialPresentation;
}

/** Validates one `publish` request (strict shape + artifact ref + presentation). */
export function validatePublishRequest(request: PublishSocialPostInput): ValidatedArtifactPayload {
  validateBase(request, PUBLISH_FIELDS);
  const artifact = validateArtifact(request.artifact);
  const presentation = validatePresentation(request.presentation);
  return { artifact, presentation };
}

/** Validates one `schedule` request (publish + a parseable go-live timestamp). */
export function validateScheduleRequest(request: ScheduleSocialPostInput): ValidatedArtifactPayload {
  validateBase(request, SCHEDULE_FIELDS);
  const artifact = validateArtifact(request.artifact);
  const presentation = validatePresentation(request.presentation);
  if (typeof request.scheduledAt !== "string" || !Number.isFinite(Date.parse(request.scheduledAt))) {
    throw new DistributionError("invalid-social-request", "scheduledAt must be an ISO-8601 timestamp string", {
      field: "scheduledAt",
    });
  }
  return { artifact, presentation };
}

/** Validates one `read-observations` request (optional non-blank subject ref). */
export function validateReadObservationsRequest(request: ReadSocialObservationsInput): void {
  validateBase(request, READ_OBSERVATIONS_FIELDS);
  if (request.subjectRef !== undefined) {
    assertNonBlankString(request.subjectRef, "subjectRef", "social-request");
  }
}

/** Validates one `delete` request (non-blank platform post ref — data, never resolved). */
export function validateDeleteRequest(request: DeleteSocialPostInput): void {
  validateBase(request, DELETE_FIELDS);
  assertNonBlankString(request.postRef, "postRef", "social-request");
}

/** Validates one `list-restrictions` request (base frame only). */
export function validateListRestrictionsRequest(request: ListSocialRestrictionsInput): void {
  validateBase(request, LIST_RESTRICTIONS_FIELDS);
}
