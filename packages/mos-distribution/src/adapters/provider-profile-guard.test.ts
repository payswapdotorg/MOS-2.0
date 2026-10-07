/**
 * Provider profile guard (SOCIAL-002..006 shared battery, part 1) — the
 * fail-closed declaration guard `validateSocialProviderProfile`, exercised
 * with FICTIONAL provider DATA (the ember-social fixture of the data
 * seam): the machinery is DATA-driven and provider-neutral; the five REAL
 * platform profiles are pinned per subtree by their own batteries.
 *
 * Pins: a valid minimal profile validates and returns DEEP-FROZEN data;
 * malformed declarations are rejected FAIL-CLOSED with the typed
 * `invalid-provider-profile` error naming the field — missing/duplicate
 * matrix entries (the conservative posture: every closed-vocabulary
 * operation is declared exactly once, parity never assumed),
 * out-of-vocabulary support levels, a NON-integrations credential escrow
 * (managedBy must be integrations — the W6-C credential discipline),
 * empty/duplicate/out-of-vocabulary auth flow kinds, a supported
 * artifact-carrying operation without a shape entry, duplicate shape
 * entries per operation, duplicate set members, empty shape sets,
 * out-of-vocabulary shapes/families/kinds, and smuggled extra fields
 * (the strict-shape guard that structurally keeps credential values out
 * of a profile declaration).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { SocialProviderProfile } from "../contracts/provider-profile.js";
import { DistributionError } from "../errors.js";
import { validateSocialProviderProfile } from "./provider-profile-validation.js";
import { EMBER_PROVIDER_ID, emberProfile } from "../testing/ember-social-fixture.js";

test("provider profile guard: a MINIMAL valid fictional profile validates and returns DEEP-FROZEN data", () => {
  const validated = validateSocialProviderProfile(emberProfile());
  assert.equal(validated.providerId, EMBER_PROVIDER_ID);
  assert.equal(validated.capabilityMatrix.length, 5);
  // Deep-frozen DATA: mutation attempts throw (a profile is immutable).
  assert.throws(() => {
    (validated as { displayName?: string }).displayName = "mutated";
  }, /not extensible|cannot add|read only/i);
  assert.throws(() => {
    (validated.auth as { flows?: unknown }).flows = ["device"];
  }, /not extensible|cannot add|read only/i);
  assert.throws(() => {
    (validated.operationShapes[0] as { shapes?: unknown }).shapes = ["text-post"];
  }, /not extensible|cannot add|read only/i);
});

test("provider profile guard: rejects a profile MISSING an operation entry (the conservative posture)", () => {
  const missing = emberProfile({
    capabilityMatrix: [
      { operation: "publish", support: "supported" },
      { operation: "schedule", support: "unsupported" },
      { operation: "read-observations", support: "unknown" },
      { operation: "delete", support: "unknown" },
    ] as unknown as SocialProviderProfile["capabilityMatrix"],
  });
  assert.throws(
    () => validateSocialProviderProfile(missing),
    (error: unknown) => {
      assert.ok(error instanceof DistributionError);
      assert.equal(error.code, "invalid-provider-profile");
      assert.equal(error.details.missingOperation, "list-restrictions");
      return true;
    },
  );
});

test("provider profile guard: rejects DUPLICATE operation entries (parity is never assumed)", () => {
  const duplicated = emberProfile({
    capabilityMatrix: [
      { operation: "publish", support: "supported" },
      { operation: "publish", support: "unsupported" },
      { operation: "schedule", support: "unsupported" },
      { operation: "read-observations", support: "unknown" },
      { operation: "delete", support: "unknown" },
      { operation: "list-restrictions", support: "unknown" },
    ] as unknown as SocialProviderProfile["capabilityMatrix"],
  });
  assert.throws(
    () => validateSocialProviderProfile(duplicated),
    (error: unknown) => {
      assert.ok(error instanceof DistributionError);
      assert.equal(error.code, "invalid-provider-profile");
      return true;
    },
  );
});

test("provider profile guard: rejects out-of-vocabulary support levels", () => {
  const badSupport = emberProfile({
    capabilityMatrix: [
      { operation: "publish", support: "maybe" },
      { operation: "schedule", support: "unsupported" },
      { operation: "read-observations", support: "unknown" },
      { operation: "delete", support: "unknown" },
      { operation: "list-restrictions", support: "unknown" },
    ] as unknown as SocialProviderProfile["capabilityMatrix"],
  });
  assert.throws(
    () => validateSocialProviderProfile(badSupport),
    (error: unknown) => {
      assert.ok(error instanceof DistributionError);
      assert.equal(error.code, "invalid-provider-profile");
      return true;
    },
  );
});

test("provider profile guard: rejects a NON-integrations credential escrow (managedBy must be integrations)", () => {
  const callerEscrow = emberProfile({
    auth: {
      model: { kind: "oauth2", managedBy: "caller" },
      flows: ["authorization-code"],
      basis: "fictional fixture basis",
    },
  });
  assert.throws(
    () => validateSocialProviderProfile(callerEscrow),
    (error: unknown) => {
      assert.ok(error instanceof DistributionError);
      assert.equal(error.code, "invalid-provider-profile");
      // Credentials escrow at the integration boundary — never elsewhere.
      assert.equal(error.details.field, "providerProfile.auth.model.managedBy");
      return true;
    },
  );
});

test("provider profile guard: rejects EMPTY, DUPLICATE and out-of-vocabulary auth flow kinds", () => {
  const empty = emberProfile({
    auth: {
      model: { kind: "oauth2", managedBy: "integrations" },
      flows: [],
      basis: "fictional fixture basis",
    },
  });
  assert.throws(() => validateSocialProviderProfile(empty), DistributionError);

  const duplicated = emberProfile({
    auth: {
      model: { kind: "oauth2", managedBy: "integrations" },
      flows: ["authorization-code", "authorization-code"],
      basis: "fictional fixture basis",
    },
  });
  assert.throws(() => validateSocialProviderProfile(duplicated), DistributionError);

  const invented = emberProfile({
    auth: {
      model: { kind: "oauth2", managedBy: "integrations" },
      flows: ["invented-flow-kind" as never],
      basis: "fictional fixture basis",
    },
  });
  assert.throws(() => validateSocialProviderProfile(invented), DistributionError);
});

test("provider profile guard: rejects a SUPPORTED artifact-carrying operation without a shape entry", () => {
  const shapeless = emberProfile({ operationShapes: [] as unknown as SocialProviderProfile["operationShapes"] });
  assert.throws(
    () => validateSocialProviderProfile(shapeless),
    (error: unknown) => {
      assert.ok(error instanceof DistributionError);
      assert.equal(error.code, "invalid-provider-profile");
      assert.equal(error.details.operation, "publish");
      return true;
    },
  );
});

test("provider profile guard: rejects duplicate shape entries per operation and duplicate set members", () => {
  const duplicateOperation = emberProfile({
    operationShapes: [
      {
        operation: "publish",
        shapes: ["video-upload"],
        acceptedArtifactTypeFamilies: ["video"],
        acceptedPresentationKinds: ["single-artifact"],
        basis: "fictional fixture basis",
      },
      {
        operation: "publish",
        shapes: ["image-post"],
        acceptedArtifactTypeFamilies: ["image"],
        acceptedPresentationKinds: ["artifact-with-caption"],
        basis: "fictional fixture basis",
      },
    ] as unknown as SocialProviderProfile["operationShapes"],
  });
  assert.throws(() => validateSocialProviderProfile(duplicateOperation), DistributionError);

  const duplicateShape = emberProfile({
    operationShapes: [
      {
        operation: "publish",
        shapes: ["video-upload", "video-upload"],
        acceptedArtifactTypeFamilies: ["video"],
        acceptedPresentationKinds: ["single-artifact"],
        basis: "fictional fixture basis",
      },
    ] as unknown as SocialProviderProfile["operationShapes"],
  });
  assert.throws(() => validateSocialProviderProfile(duplicateShape), DistributionError);
});

test("provider profile guard: rejects EMPTY shape sets, out-of-vocabulary shapes/families/kinds, and smuggled fields", () => {
  const emptyShapes = emberProfile({
    operationShapes: [
      {
        operation: "publish",
        shapes: [],
        acceptedArtifactTypeFamilies: ["video"],
        acceptedPresentationKinds: ["single-artifact"],
        basis: "fictional fixture basis",
      },
    ] as unknown as SocialProviderProfile["operationShapes"],
  });
  assert.throws(() => validateSocialProviderProfile(emptyShapes), DistributionError);

  const inventedShape = emberProfile({
    operationShapes: [
      {
        operation: "publish",
        shapes: ["hologram-post"],
        acceptedArtifactTypeFamilies: ["video"],
        acceptedPresentationKinds: ["single-artifact"],
        basis: "fictional fixture basis",
      },
    ] as unknown as SocialProviderProfile["operationShapes"],
  });
  assert.throws(() => validateSocialProviderProfile(inventedShape), DistributionError);

  const inventedFamily = emberProfile({
    operationShapes: [
      {
        operation: "publish",
        shapes: ["video-upload"],
        acceptedArtifactTypeFamilies: ["hologram" as never],
        acceptedPresentationKinds: ["single-artifact"],
        basis: "fictional fixture basis",
      },
    ] as unknown as SocialProviderProfile["operationShapes"],
  });
  assert.throws(() => validateSocialProviderProfile(inventedFamily), DistributionError);

  const inventedKind = emberProfile({
    operationShapes: [
      {
        operation: "publish",
        shapes: ["video-upload"],
        acceptedArtifactTypeFamilies: ["video"],
        acceptedPresentationKinds: ["volumetric" as never],
        basis: "fictional fixture basis",
      },
    ] as unknown as SocialProviderProfile["operationShapes"],
  });
  assert.throws(() => validateSocialProviderProfile(inventedKind), DistributionError);

  // A smuggled extra field is rejected (the strict-shape guard — a
  // credential-value field cannot enter a profile declaration).
  const smuggled = {
    ...emberProfile(),
    apiKey: "invented-secret",
  } as unknown as SocialProviderProfile;
  assert.throws(
    () => validateSocialProviderProfile(smuggled),
    (error: unknown) => {
      assert.ok(error instanceof DistributionError);
      assert.equal(error.code, "invalid-provider-profile");
      return true;
    },
  );
});
