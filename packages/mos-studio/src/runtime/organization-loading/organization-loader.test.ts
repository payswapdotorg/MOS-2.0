import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createInMemoryOrganizationSource,
  expandOrganizationSeed,
} from "../../testing/in-memory-organization-source.js";
import {
  createStudioOrganizationLoader,
  validateOrganizationDescriptor,
} from "./studio-organization-loader.js";
import { createReactionFormatPlugin } from "../formats/reaction.js";
import type { OrganizationLoadRequest } from "../../contracts/organization-loading.js";
import type { IdentityRef } from "../../contracts/refs.js";

// ---------------------------------------------------------------------------
// STUDIO-007: versioned organization loader binding (frozen AgentOrganization
// descriptor fields; explicit verdicts; versioned cache; no substitution)
// ---------------------------------------------------------------------------

const SUPPLIER = { kind: "standalone-user" as const, identityRef: "identity-org-user-1" as IdentityRef };

const loadRequest = (id: string, version: number): OrganizationLoadRequest => ({
  organizationRef: { id: id as never, version },
  suppliedBy: SUPPLIER,
  formatCompatibility: createReactionFormatPlugin().organizationCompatibility,
});

test("versioned load serves the full frozen AgentOrganization descriptor and caches by version", async () => {
  const source = createInMemoryOrganizationSource({
    organizations: [
      { id: "org-a", version: 3, declaredCapabilities: ["compose_reaction", "render_timeline"] },
      { id: "org-a", version: 4, declaredCapabilities: ["compose_reaction", "render_timeline"] },
    ],
  });
  const loader = createStudioOrganizationLoader({ source });

  const first = await loader.load(loadRequest("org-a", 3));
  assert.ok(first.ok, `v3 must load: ${JSON.stringify(first)}`);
  // Every frozen AgentOrganization field is present on the descriptor.
  const descriptor = first.loaded.descriptor;
  for (const field of [
    "id",
    "version",
    "nodes",
    "edges",
    "modelAssignments",
    "memoryPolicy",
    "budgetPolicy",
    "terminationPolicy",
    "evaluator",
  ] as const) {
    assert.ok(descriptor[field] !== undefined, `descriptor must carry ${field}`);
  }
  assert.equal(descriptor.version, 3);
  assert.deepEqual(first.loaded.organization, { id: "org-a", version: 3 });

  // Second load of the SAME version: served from the version-keyed cache
  // (the source is not consulted again).
  const second = await loader.load(loadRequest("org-a", 3));
  assert.ok(second.ok);
  assert.equal(second.loaded.descriptor.version, 3);
  assert.equal(source.fetchCount(), 1, "same-version reload must be a cache hit");
  assert.deepEqual(loader.cachedVersions, ["org-a@3"]);

  // A DIFFERENT version goes back to the source (per-version cache entries).
  const v4 = await loader.load(loadRequest("org-a", 4));
  assert.ok(v4.ok && v4.loaded.descriptor.version === 4);
  assert.equal(source.fetchCount(), 2, "new version must hit the source");
  assert.deepEqual(loader.cachedVersions, ["org-a@3", "org-a@4"]);
});

test("incompatible organization yields an explicit verdict with reasons (never a silent swap)", async () => {
  const source = createInMemoryOrganizationSource({
    organizations: [{ id: "org-weak", version: 1, declaredCapabilities: ["render_timeline"] }],
  });
  const loader = createStudioOrganizationLoader({ source });

  const verdict = await loader.load(loadRequest("org-weak", 1));
  assert.ok(verdict.ok, "default delivery is the recorded verdict path");
  assert.equal(verdict.loaded.compatibility.compatible, false);
  const reasons = verdict.loaded.compatibility.incompatibilityReasons;
  assert.ok(reasons.some((r) => r.includes("compose_reaction")), `missing capability named: ${JSON.stringify(reasons)}`);

  // The error delivery style carries the same verdict explicitly.
  const errorLoader = createStudioOrganizationLoader({
    source: createInMemoryOrganizationSource({
      organizations: [{ id: "org-weak", version: 1, declaredCapabilities: [] }],
    }),
    incompatibilityDelivery: "error",
  });
  const asError = await errorLoader.load(loadRequest("org-weak", 1));
  assert.ok(!asError.ok && asError.error.kind === "incompatible-with-format");
  assert.ok(asError.error.check.incompatibilityReasons.length > 0);
});

test("structurally invalid organization descriptors fail loudly with explicit reasons", async () => {
  // Edge referencing a node that does not exist in the descriptor.
  const broken = expandOrganizationSeed({
    id: "org-broken",
    version: 2,
    declaredCapabilities: ["compose_reaction", "render_timeline"],
    nodes: [{ nodeId: "node-1", bodyId: "body-1" as never }],
    edges: [{ fromNodeId: "node-1", toNodeId: "node-ghost", kind: "communication" }],
    modelAssignments: [{ nodeId: "node-1", modelRef: "model-1" as never }],
  });
  const invalid = validateOrganizationDescriptor(broken, { id: "org-broken", version: 2 });
  assert.deepEqual(invalid, [{ kind: "edge-endpoint-not-a-node", nodeId: "node-ghost" }]);

  const source = createInMemoryOrganizationSource({
    organizations: [
      {
        id: "org-broken",
        version: 2,
        declaredCapabilities: ["compose_reaction", "render_timeline"],
        nodes: [{ nodeId: "node-1", bodyId: "body-1" as never }],
        edges: [{ fromNodeId: "node-1", toNodeId: "node-ghost", kind: "communication" }],
        modelAssignments: [{ nodeId: "node-1", modelRef: "model-1" as never }],
      },
    ],
  });
  const loader = createStudioOrganizationLoader({ source });
  const outcome = await loader.load(loadRequest("org-broken", 2));
  assert.ok(!outcome.ok && outcome.error.kind === "invalid-organization");
  assert.ok(outcome.error.reasons.some((r) => r.includes("node-ghost")));
});

test("no silent substitution: an exact version is required — nearby versions are not substitutes", async () => {
  const source = createInMemoryOrganizationSource({
    organizations: [
      { id: "org-v", version: 2, declaredCapabilities: ["compose_reaction", "render_timeline"] },
      { id: "org-v", version: 4, declaredCapabilities: ["compose_reaction", "render_timeline"] },
    ],
  });
  const loader = createStudioOrganizationLoader({ source });

  // v3 is NOT served (v2 and v4 exist) — no fallback to any other version.
  const missing = await loader.load(loadRequest("org-v", 3));
  assert.ok(!missing.ok && missing.error.kind === "organization-not-found");

  // The exact versions that exist still load; the session binds exactly what
  // it asked for (a version change is an explicit NEW session binding).
  const v2 = await loader.load(loadRequest("org-v", 2));
  const v4 = await loader.load(loadRequest("org-v", 4));
  assert.ok(v2.ok && v2.loaded.organization.version === 2);
  assert.ok(v4.ok && v4.loaded.organization.version === 4);
});

test("unavailable source surfaces as an explicit loader-unavailable failure", async () => {
  const loader = createStudioOrganizationLoader({
    source: createInMemoryOrganizationSource({
      organizations: [{ id: "org-x", version: 1, declaredCapabilities: [] }],
      unavailable: true,
    }),
  });
  const outcome = await loader.load(loadRequest("org-x", 1));
  assert.ok(!outcome.ok && outcome.error.kind === "loader-unavailable");
});
