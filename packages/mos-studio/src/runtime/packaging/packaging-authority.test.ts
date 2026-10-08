import assert from "node:assert/strict";
import { test } from "node:test";

import { createStudioPackagingAuthority } from "./packaging-authority.js";
import { createInMemoryArtifactFactory } from "../../testing/in-memory-artifact-factory.js";
import { createDeterministicIdFactory } from "../../testing/compose-runtime-for-tests.js";
import type {
  SessionPackageCompositionInput,
  SuccessorPackageCompositionInput,
} from "../../contracts/artifact-packaging.js";
import type {
  StudioArtifactRef,
  TranscriptRef,
} from "../../contracts/studio-artifact-package.js";
import type {
  ConsentRef,
  EditGraphId,
  MoneyAmount,
  ProvenanceRef,
  StudioArtifactPackageId,
  StudioSessionId,
  TenantId,
  Timestamp,
} from "../../contracts/refs.js";

// ---------------------------------------------------------------------------
// STUDIO-013: the canonical packaging authority battery — the fail-closed
// probe per missing contract-required field class, immutable append-only
// versioned packages, truthful provenance/consent consolidation (incl.
// imported sources), root→final lineage traceability, and the W9-B
// disciplines by construction (D1/D2 exact-tenant keys, D3
// clone-then-deep-freeze, D5 finite-number guards).
// ---------------------------------------------------------------------------

const TENANT_A = "tenant-authority-a" as TenantId;
const TENANT_B = "tenant-authority-b" as TenantId;
const SCOPE_A = { tenantId: TENANT_A };
const SCOPE_B = { tenantId: TENANT_B };
const SESSION = "sess-authority-1" as StudioSessionId;
const PACKAGE_ID = "pkg-authority-1" as StudioArtifactPackageId;

/** The artifact universe one valid composition needs (closed lineage §6). */
async function buildUniverse(tenantId: TenantId): Promise<{
  readonly raw: StudioArtifactRef;
  readonly imported: StudioArtifactRef;
  readonly intermediate: StudioArtifactRef;
  readonly final: StudioArtifactRef;
  readonly transcript: TranscriptRef;
  readonly factory: ReturnType<typeof createInMemoryArtifactFactory>;
}> {
  const factory = createInMemoryArtifactFactory({ idFactory: createDeterministicIdFactory("art") });
  const make = async (
    suffix: string,
    input: Partial<Parameters<typeof factory.createArtifact>[0]> & {
      readonly stage: StudioArtifactRef["stage"];
      readonly creationMethod: StudioArtifactRef["creationMethod"];
      readonly parents: readonly StudioArtifactRef[];
    },
  ): Promise<StudioArtifactRef> => {
    const created = await factory.createArtifact({
      tenantId,
      type: "audio",
      storageRef: `storage:authority/${suffix}` as never,
      content: new TextEncoder().encode(`authority|${suffix}`),
      rightsRef: `rights-${suffix}` as never,
      provenanceRef: `provenance-${suffix}` as ProvenanceRef,
      ...input,
    } as Parameters<typeof factory.createArtifact>[0]);
    assert.ok(created.ok, `artifact ${suffix} must be created: ${JSON.stringify(created)}`);
    return created.artifact;
  };
  const raw = await make("raw-take", { stage: "raw", creationMethod: "human-capture", parents: [] });
  const imported = await make("imported-source", { stage: "raw", creationMethod: "human-capture", parents: [] });
  const intermediate = await make("intermediate", {
    stage: "intermediate",
    creationMethod: "organization-transform",
    parents: [raw],
  });
  const final = await make("final", {
    stage: "final",
    creationMethod: "composition",
    parents: [intermediate, imported],
  });
  const transcriptArtifact = await make("transcript", {
    stage: "intermediate",
    creationMethod: "organization-transform",
    parents: [raw],
  });
  return {
    raw,
    imported,
    intermediate,
    final,
    transcript: { artifact: transcriptArtifact, language: "en-US", diarized: true },
    factory,
  };
}

/** A COMPLETE session-draft input (every override narrows exactly one probe). */
function validSessionInput(
  universe: Awaited<ReturnType<typeof buildUniverse>>,
  overrides: Partial<SessionPackageCompositionInput> = {},
): SessionPackageCompositionInput {
  return {
    sessionRef: SESSION,
    packageId: PACKAGE_ID,
    rawArtifacts: [universe.raw, universe.imported],
    intermediateArtifacts: [universe.intermediate],
    finalArtifacts: [universe.final],
    transcriptRefs: [universe.transcript],
    editGraphRef: {
      graphId: "mos-studio:edit-graph:authority-1" as EditGraphId,
      version: 1,
      otioInterchange: false,
    },
    rawArtifactConsent: new Map<string, { consentRefs: readonly ConsentRef[] }>([
      [String(universe.raw.artifactId), { consentRefs: ["consent-capture-1" as ConsentRef] }],
      [String(universe.imported.artifactId), { consentRefs: ["consent-source-1" as ConsentRef] }],
    ]),
    participantConsentRefs: ["consent-capture-1" as ConsentRef, "consent-source-1" as ConsentRef],
    costLines: [{ currency: "USD", amount: "1.25" }],
    captureSeconds: 42,
    processingSeconds: 30,
    sessionCreatedAt: "2026-01-01T00:00:00.000Z" as Timestamp,
    composedAt: "2026-01-01T00:10:00.000Z" as Timestamp,
    evaluation: { status: "evaluated", outcome: "accepted" },
    ...overrides,
  };
}

test("STUDIO-013 happy path: a complete session draft composes with every contract-required field populated", async () => {
  const authority = createStudioPackagingAuthority();
  const universe = await buildUniverse(TENANT_A);
  const outcome = authority.composeSessionPackage(SCOPE_A, validSessionInput(universe));
  assert.ok(outcome.ok, `composition must succeed: ${JSON.stringify(outcome)}`);
  const pkg = outcome.package;
  assert.equal(pkg.id, PACKAGE_ID);
  assert.equal(pkg.version, 1);
  assert.equal(pkg.sessionRef, SESSION);
  assert.equal(pkg.rawArtifacts.length, 2);
  assert.equal(pkg.intermediateArtifacts.length, 1);
  assert.equal(pkg.finalArtifacts.length, 1);
  assert.equal(pkg.transcriptRefs.length, 1);
  assert.equal(pkg.provenance.lineageComplete, true);
  assert.equal(pkg.consent.allRawArtifactsCovered, true);
  assert.deepEqual(pkg.consent.participantConsentRefs, ["consent-capture-1", "consent-source-1"]);
  assert.equal(pkg.evaluation.status, "evaluated");
  assert.equal(pkg.evaluation.outcome, "accepted");
  assert.deepEqual(pkg.cost.total, { currency: "USD", amount: "1.25" });
  assert.equal(pkg.duration.captureSeconds, 42);
  assert.equal(pkg.duration.processingSeconds, 30);
  assert.equal(pkg.duration.totalWallClockSeconds, 600);
  assert.equal(pkg.editGraphRef.graphId, "mos-studio:edit-graph:authority-1");
  // §14 truthful synthetic disclosure: all human-capture/organization-transform
  // material → containsSyntheticMaterial stays false.
  assert.equal(pkg.provenance.containsSyntheticMaterial, false);
});

test("STUDIO-013 fail-closed: raw-artifacts-required — a package without raw artifacts is refused", async () => {
  const authority = createStudioPackagingAuthority();
  const universe = await buildUniverse(TENANT_A);
  const outcome = authority.composeSessionPackage(SCOPE_A, validSessionInput(universe, { rawArtifacts: [] }));
  assert.ok(!outcome.ok);
  assert.deepEqual(outcome.failure, { kind: "raw-artifacts-required", sessionRef: SESSION });
});

test("STUDIO-013 fail-closed: transcripts-required — a package without transcripts is refused", async () => {
  const authority = createStudioPackagingAuthority();
  const universe = await buildUniverse(TENANT_A);
  const outcome = authority.composeSessionPackage(SCOPE_A, validSessionInput(universe, { transcriptRefs: [] }));
  assert.ok(!outcome.ok);
  assert.deepEqual(outcome.failure, { kind: "transcripts-required", sessionRef: SESSION });
});

test("STUDIO-013 fail-closed: edit-graph-ref-required — the W1-C synthesized placeholder is gone (absent OR blank)", async () => {
  const authority = createStudioPackagingAuthority();
  const universe = await buildUniverse(TENANT_A);
  const absent = authority.composeSessionPackage(
    SCOPE_A,
    validSessionInput(universe, { editGraphRef: undefined }),
  );
  assert.ok(!absent.ok);
  assert.deepEqual(absent.failure, { kind: "edit-graph-ref-required", sessionRef: SESSION });
  const blank = authority.composeSessionPackage(
    SCOPE_A,
    validSessionInput(universe, {
      editGraphRef: { graphId: "  " as EditGraphId, version: 1, otioInterchange: false },
    }),
  );
  assert.ok(!blank.ok);
  assert.deepEqual(blank.failure, { kind: "edit-graph-ref-required", sessionRef: SESSION });
});

test("STUDIO-013 fail-closed: provenance-incomplete — every artifact must carry a provenance ref (§30)", async () => {
  const authority = createStudioPackagingAuthority();
  const universe = await buildUniverse(TENANT_A);
  const unprovenanced: StudioArtifactRef = { ...universe.intermediate, provenanceRef: "" as ProvenanceRef };
  const outcome = authority.composeSessionPackage(
    SCOPE_A,
    validSessionInput(universe, { intermediateArtifacts: [unprovenanced] }),
  );
  assert.ok(!outcome.ok);
  assert.equal(outcome.failure.kind, "provenance-incomplete");
  assert.deepEqual(
    (outcome.failure as { artifactIds: readonly string[] }).artifactIds,
    [String(universe.intermediate.artifactId)],
  );
});

test("STUDIO-013 fail-closed: lineage-incomplete — intermediates/finals without parents break closed lineage (§6)", async () => {
  const authority = createStudioPackagingAuthority();
  const universe = await buildUniverse(TENANT_A);
  const orphan: StudioArtifactRef = { ...universe.intermediate, parentArtifactRefs: [] };
  const outcome = authority.composeSessionPackage(
    SCOPE_A,
    validSessionInput(universe, { intermediateArtifacts: [orphan] }),
  );
  assert.ok(!outcome.ok);
  assert.equal(outcome.failure.kind, "lineage-incomplete");
});

test("STUDIO-013 fail-closed: lineage-untraceable — finals must trace root→final to a raw artifact IN the package (§6)", async () => {
  const authority = createStudioPackagingAuthority();
  const universe = await buildUniverse(TENANT_A);
  // A final whose only parent is an intermediate that is NOT carried in the
  // package: the chain dead-ends outside the package — untraceable.
  const outside = await universe.factory.createArtifact({
    tenantId: TENANT_A,
    type: "audio",
    stage: "intermediate",
    creationMethod: "organization-transform",
    storageRef: "storage:authority/outside" as never,
    content: new TextEncoder().encode("authority|outside"),
    rightsRef: "rights-outside" as never,
    provenanceRef: "provenance-outside" as ProvenanceRef,
    parents: [universe.raw],
  });
  assert.ok(outside.ok);
  const untraceable: StudioArtifactRef = {
    ...universe.final,
    parentArtifactRefs: [(outside as { artifact: StudioArtifactRef }).artifact],
  };
  const outcome = authority.composeSessionPackage(
    SCOPE_A,
    validSessionInput(universe, { finalArtifacts: [untraceable] }),
  );
  assert.ok(!outcome.ok);
  assert.equal(outcome.failure.kind, "lineage-untraceable");
  assert.deepEqual(
    (outcome.failure as { artifactIds: readonly string[] }).artifactIds,
    [String(universe.final.artifactId)],
  );
});

test("STUDIO-013 fail-closed: consent-coverage-incomplete — every raw artifact (INCLUDING imported sources) needs consent coverage (§15/§27)", async () => {
  const authority = createStudioPackagingAuthority();
  const universe = await buildUniverse(TENANT_A);
  // The imported source's coverage entry is missing — the uncovered list
  // names exactly the imported artifact (never silently packaged).
  const outcome = authority.composeSessionPackage(
    SCOPE_A,
    validSessionInput(universe, {
      rawArtifactConsent: new Map<string, { consentRefs: readonly ConsentRef[] }>([
        [String(universe.raw.artifactId), { consentRefs: ["consent-capture-1" as ConsentRef] }],
      ]),
    }),
  );
  assert.ok(!outcome.ok);
  assert.equal(outcome.failure.kind, "consent-coverage-incomplete");
  assert.deepEqual(
    (outcome.failure as { uncoveredRawArtifactIds: readonly string[] }).uncoveredRawArtifactIds,
    [String(universe.imported.artifactId)],
  );
  assert.equal(
    (outcome.failure as { participantConsentRefsPresent: boolean }).participantConsentRefsPresent,
    true,
  );
  // No participant consent refs at all is the same failure with the flag off.
  const noParticipants = authority.composeSessionPackage(
    SCOPE_A,
    validSessionInput(universe, { participantConsentRefs: [] }),
  );
  assert.ok(!noParticipants.ok);
  assert.equal(noParticipants.failure.kind, "consent-coverage-incomplete");
  assert.equal(
    (noParticipants.failure as { participantConsentRefsPresent: boolean }).participantConsentRefsPresent,
    false,
  );
});

test("STUDIO-013 fail-closed: evaluation-required — a missing OR unknown evaluation record is refused (§19)", async () => {
  const authority = createStudioPackagingAuthority();
  const universe = await buildUniverse(TENANT_A);
  const absent = authority.composeSessionPackage(
    SCOPE_A,
    validSessionInput(universe, { evaluation: undefined }),
  );
  assert.ok(!absent.ok);
  assert.deepEqual(absent.failure, { kind: "evaluation-required", sessionRef: SESSION });
  const unknown = authority.composeSessionPackage(
    SCOPE_A,
    validSessionInput(universe, {
      evaluation: { status: "not-a-status" as never, outcome: "accepted" },
    }),
  );
  assert.ok(!unknown.ok);
  assert.deepEqual(unknown.failure, { kind: "evaluation-required", sessionRef: SESSION });
});

test("STUDIO-013 fail-closed (W9-B D5): cost-invalid — NaN/negative/unparseable amounts and mixed currencies are refused", async () => {
  const authority = createStudioPackagingAuthority();
  const universe = await buildUniverse(TENANT_A);
  for (const badAmount of ["NaN", "-1.00", "1.2e3", "abc", ""]) {
    const outcome = authority.composeSessionPackage(
      SCOPE_A,
      validSessionInput(universe, { costLines: [{ currency: "USD", amount: badAmount }] }),
    );
    assert.ok(!outcome.ok, `amount "${badAmount}" must fail closed`);
    assert.equal(outcome.failure.kind, "cost-invalid");
  }
  const mixed = authority.composeSessionPackage(
    SCOPE_A,
    validSessionInput(universe, {
      costLines: [
        { currency: "USD", amount: "1.00" },
        { currency: "EUR", amount: "2.00" },
      ],
    }),
  );
  assert.ok(!mixed.ok);
  assert.equal(mixed.failure.kind, "cost-invalid");
  assert.ok(
    (mixed.failure as { reasons: readonly string[] }).reasons.some((reason) =>
      reason.includes("one currency"),
    ),
  );
});

test("STUDIO-013 fail-closed (W9-B D5): duration-invalid — NaN/Infinity/negative durations are refused", async () => {
  const authority = createStudioPackagingAuthority();
  const universe = await buildUniverse(TENANT_A);
  for (const [label, overrides] of [
    ["captureSeconds NaN", { captureSeconds: Number.NaN }],
    ["captureSeconds -1", { captureSeconds: -1 }],
    ["processingSeconds Infinity", { processingSeconds: Number.POSITIVE_INFINITY }],
    ["processingSeconds -5", { processingSeconds: -5 }],
  ] as const) {
    const outcome = authority.composeSessionPackage(SCOPE_A, validSessionInput(universe, overrides));
    assert.ok(!outcome.ok, `${label} must fail closed`);
    assert.equal(outcome.failure.kind, "duration-invalid");
  }
});

test("STUDIO-013 immutable versions: composing again appends v2 (treatment → NEW version); v1 stays bit-for-bit resolvable", async () => {
  const authority = createStudioPackagingAuthority();
  const universe = await buildUniverse(TENANT_A);
  const v1 = authority.composeSessionPackage(SCOPE_A, validSessionInput(universe));
  assert.ok(v1.ok);
  // The treatment-successor shape: same package id, predecessor = v1.
  const v2 = authority.composeSessionPackage(
    SCOPE_A,
    validSessionInput(universe, { predecessor: v1.package }),
  );
  assert.ok(v2.ok, `the successor version must compose: ${JSON.stringify(v2)}`);
  assert.equal(v2.package.id, v1.package.id);
  assert.equal(v2.package.version, 2);
  // The historical version is never rewritten: re-read is bit-for-bit stable.
  const reread = authority.getArtifactPackage(SCOPE_A, PACKAGE_ID, 1);
  assert.ok(reread !== undefined);
  assert.deepEqual(reread, v1.package);
  assert.deepEqual(authority.listPackageVersions(SCOPE_A, PACKAGE_ID).map((pkg) => pkg.version), [1, 2]);
  // The append-only store refuses an in-place rewrite: composing the SAME
  // version again is impossible by construction (version always advances),
  // and the version-conflict guard pins the discipline at registration.
  const v3 = authority.composeSessionPackage(
    SCOPE_A,
    validSessionInput(universe, { predecessor: v1.package }),
  );
  assert.ok(v3.ok);
  assert.equal(v3.package.version, 3);
  assert.deepEqual(authority.listPackageVersions(SCOPE_A, PACKAGE_ID).map((pkg) => pkg.version), [1, 2, 3]);
});

test("STUDIO-013 (W9-B D3): clone-then-deep-freeze — the caller's draft artifacts are never aliased; stored packages reject mutation", async () => {
  const authority = createStudioPackagingAuthority();
  const universe = await buildUniverse(TENANT_A);
  const draftFinal = { ...universe.final };
  const outcome = authority.composeSessionPackage(
    SCOPE_A,
    validSessionInput(universe, { finalArtifacts: [draftFinal] }),
  );
  assert.ok(outcome.ok);
  // Mutating the CALLER's draft after composition cannot reach the store.
  (draftFinal as { artifactId: string }).artifactId = "mutated-artifact-id";
  const reread = authority.getArtifactPackage(SCOPE_A, PACKAGE_ID);
  assert.ok(reread !== undefined);
  assert.equal(reread.finalArtifacts[0]?.artifactId, String(universe.final.artifactId));
  // The stored/returned package is deeply frozen — mutation throws in strict mode.
  assert.throws(() => {
    (reread as unknown as { version: number }).version = 99;
  }, TypeError);
  assert.throws(() => {
    (reread.finalArtifacts[0] as unknown as { artifactId: string }).artifactId = "hijack";
  }, TypeError);
  // Re-reads stay bit-for-bit stable (no in-place rewrite ever happened).
  assert.deepEqual(authority.getArtifactPackage(SCOPE_A, PACKAGE_ID), reread);
});

test("STUDIO-013 (W9-B D1/D2): exact-tenant store — tenant B never sees tenant A's packages; ids never widen across tenants", async () => {
  const authority = createStudioPackagingAuthority();
  const universeA = await buildUniverse(TENANT_A);
  const composed = authority.composeSessionPackage(SCOPE_A, validSessionInput(universeA));
  assert.ok(composed.ok);
  // Tenant B: nothing visible, nothing resolvable.
  assert.deepEqual(authority.listPackages(SCOPE_B), []);
  assert.equal(authority.getArtifactPackage(SCOPE_B, PACKAGE_ID), undefined);
  assert.deepEqual(authority.listPackageVersions(SCOPE_B, PACKAGE_ID), []);
  assert.deepEqual(authority.storeInspection.tenants, [String(TENANT_A)]);
  // The SAME package id under tenant B composes its OWN independent v1.
  const universeB = await buildUniverse(TENANT_B);
  const forB = authority.composeSessionPackage(SCOPE_B, validSessionInput(universeB));
  assert.ok(forB.ok);
  assert.equal(forB.package.version, 1);
  assert.deepEqual(authority.storeInspection.tenants.sort(), [String(TENANT_A), String(TENANT_B)]);
  // Tenant A's chain is untouched by tenant B's composition.
  assert.deepEqual(
    authority.listPackageVersions(SCOPE_A, PACKAGE_ID).map((pkg) => pkg.version),
    [1],
  );
});

test("STUDIO-013 provenance consolidation: §14 truthful synthetic disclosure derived per source kind; refs deduped", async () => {
  const authority = createStudioPackagingAuthority();
  const universe = await buildUniverse(TENANT_A);
  // One ENGINE-GENERATED intermediate rides the package → the synthetic
  // disclosure flips true (truthful per source kind, never blanket).
  const generated = await universe.factory.createArtifact({
    tenantId: TENANT_A,
    type: "audio",
    stage: "intermediate",
    creationMethod: "engine-generated",
    storageRef: "storage:authority/generated" as never,
    content: new TextEncoder().encode("authority|generated"),
    rightsRef: "rights-generated" as never,
    provenanceRef: "provenance-generated" as ProvenanceRef,
    parents: [universe.raw],
  });
  assert.ok(generated.ok);
  const outcome = authority.composeSessionPackage(
    SCOPE_A,
    validSessionInput(universe, {
      intermediateArtifacts: [universe.intermediate, (generated as { artifact: StudioArtifactRef }).artifact],
    }),
  );
  assert.ok(outcome.ok);
  assert.equal(outcome.package.provenance.containsSyntheticMaterial, true);
  // Provenance refs consolidated across ALL artifacts, deduplicated, §30.
  const expectedRefs = new Set(
    [universe.raw, universe.imported, universe.intermediate, universe.final, universe.transcript.artifact, (generated as { artifact: StudioArtifactRef }).artifact]
      .map((artifact) => String(artifact.provenanceRef))
      .concat([String((generated as { artifact: StudioArtifactRef }).artifact.provenanceRef)]),
  );
  assert.deepEqual(
    new Set(outcome.package.provenance.provenanceRefs.map(String)),
    expectedRefs,
  );
});

test("STUDIO-013 successor composition: editing sessions compose NEW immutable versions through the ONE authority", async () => {
  const authority = createStudioPackagingAuthority();
  const universe = await buildUniverse(TENANT_A);
  const first = authority.composeSessionPackage(SCOPE_A, validSessionInput(universe));
  assert.ok(first.ok);
  const sourcePackage = first.package;
  const successor = authority.composeSuccessorVersion(SCOPE_A, {
    source: { kind: "package", artifactPackage: sourcePackage },
    operationOutputs: [universe.intermediate],
    finalArtifact: universe.final,
    graph: { graphId: "mos-studio:edit-graph:authority-2" as EditGraphId, version: 1, otioInterchange: false },
    newPackageId: "pkg-ignored" as StudioArtifactPackageId,
    completedAt: "2026-01-01T01:00:00.000Z" as Timestamp,
    startedAt: "2026-01-01T00:50:00.000Z" as Timestamp,
    cost: { currency: "USD", amount: 0.05 },
    contributors: [
      { participantIdentityRef: "identity-holder-1" as never, consentRefs: ["consent-capture-1" as ConsentRef] },
    ],
  });
  assert.ok(successor.ok, `the successor must compose: ${JSON.stringify(successor)}`);
  const v2 = successor.package;
  // Same package id at version+1 over a packaged source; the predecessor is
  // never mutated and stays resolvable.
  assert.equal(v2.id, sourcePackage.id);
  assert.equal(v2.version, sourcePackage.version + 1);
  assert.deepEqual(authority.getArtifactPackage(SCOPE_A, PACKAGE_ID, 1), sourcePackage);
  // The successor inherits raw artifacts/transcripts/consent from the
  // predecessor and carries the new edit-graph ref + operation outputs.
  assert.deepEqual(v2.rawArtifacts, sourcePackage.rawArtifacts);
  assert.deepEqual(v2.transcriptRefs, sourcePackage.transcriptRefs);
  assert.equal(v2.editGraphRef.graphId, "mos-studio:edit-graph:authority-2");
  assert.ok(v2.intermediateArtifacts.some((artifact) => artifact.artifactId === universe.intermediate.artifactId));
  assert.deepEqual(
    new Set(v2.consent.participantConsentRefs.map(String)),
    new Set(["consent-capture-1", "consent-source-1"]),
  );

  // Over INTERMEDIATES (no packaged predecessor): a NEW package id at v1.
  const fresh = authority.composeSuccessorVersion(SCOPE_A, {
    source: { kind: "intermediates", sessionRef: SESSION, intermediates: [universe.raw] },
    operationOutputs: [universe.intermediate],
    finalArtifact: universe.final,
    graph: { graphId: "mos-studio:edit-graph:authority-3" as EditGraphId, version: 1, otioInterchange: false },
    newPackageId: "pkg-edit-fresh-1" as StudioArtifactPackageId,
    completedAt: "2026-01-01T02:00:00.000Z" as Timestamp,
    startedAt: "2026-01-01T01:50:00.000Z" as Timestamp,
    cost: { currency: "USD", amount: 0.02 },
    contributors: [
      { participantIdentityRef: "identity-holder-1" as never, consentRefs: ["consent-capture-1" as ConsentRef] },
    ],
  });
  assert.ok(fresh.ok);
  assert.equal(fresh.package.id, "pkg-edit-fresh-1");
  assert.equal(fresh.package.version, 1);
  assert.equal(fresh.package.sessionRef, SESSION);
});

test("STUDIO-013 successor fail-closed: blank edit-graph ref, non-finite cost and unprovenanced outputs are typed failures", async () => {
  const authority = createStudioPackagingAuthority();
  const universe = await buildUniverse(TENANT_A);
  const first = authority.composeSessionPackage(SCOPE_A, validSessionInput(universe));
  assert.ok(first.ok);
  const base: SuccessorPackageCompositionInput = {
    source: { kind: "package", artifactPackage: first.package },
    operationOutputs: [universe.intermediate],
    finalArtifact: universe.final,
    graph: { graphId: "mos-studio:edit-graph:authority-4" as EditGraphId, version: 1, otioInterchange: false },
    newPackageId: "pkg-authority-4" as StudioArtifactPackageId,
    completedAt: "2026-01-01T03:00:00.000Z" as Timestamp,
    startedAt: "2026-01-01T02:50:00.000Z" as Timestamp,
    cost: { currency: "USD", amount: 0.05 },
    contributors: [],
  };
  const noGraph = authority.composeSuccessorVersion(SCOPE_A, {
    ...base,
    graph: { graphId: "" as EditGraphId, version: 1, otioInterchange: false },
  });
  assert.ok(!noGraph.ok);
  assert.equal(noGraph.failure.kind, "edit-graph-ref-required");
  const badCost = authority.composeSuccessorVersion(SCOPE_A, {
    ...base,
    cost: { currency: "USD", amount: Number.NaN },
  });
  assert.ok(!badCost.ok);
  assert.equal(badCost.failure.kind, "cost-invalid");
  const unprovenanced = authority.composeSuccessorVersion(SCOPE_A, {
    ...base,
    operationOutputs: [{ ...universe.intermediate, provenanceRef: "" as ProvenanceRef }],
  });
  assert.ok(!unprovenanced.ok);
  assert.equal(unprovenanced.failure.kind, "provenance-incomplete");
  // Nothing was registered by any failed probe: the chain stays at v1.
  assert.deepEqual(
    authority.listPackageVersions(SCOPE_A, PACKAGE_ID).map((pkg) => pkg.version),
    [1],
  );
});

test("STUDIO-013 browsing surface: tenant summaries, session filters, exact-version reads", async () => {
  const authority = createStudioPackagingAuthority();
  const universe = await buildUniverse(TENANT_A);
  const otherSession = "sess-authority-2" as StudioSessionId;
  const first = authority.composeSessionPackage(SCOPE_A, validSessionInput(universe));
  assert.ok(first.ok);
  const second = authority.composeSessionPackage(
    SCOPE_A,
    validSessionInput(universe, {
      sessionRef: otherSession,
      packageId: "pkg-authority-2" as StudioArtifactPackageId,
    }),
  );
  assert.ok(second.ok);
  const treated = authority.composeSessionPackage(
    SCOPE_A,
    validSessionInput(universe, { predecessor: first.package }),
  );
  assert.ok(treated.ok);
  assert.equal(treated.package.version, 2);

  const summaries = authority.listPackages(SCOPE_A);
  assert.deepEqual(
    summaries
      .map((summary) => [summary.packageId, summary.latestVersion, summary.versionCount])
      .sort(),
    [
      [String(PACKAGE_ID), 2, 2],
      ["pkg-authority-2", 1, 1],
    ],
  );
  const bySession = authority.listPackages(SCOPE_A, { sessionRef: otherSession });
  assert.equal(bySession.length, 1);
  assert.equal(bySession[0]?.packageId, "pkg-authority-2");
  // Exact-version read vs latest read.
  assert.equal(authority.getArtifactPackage(SCOPE_A, PACKAGE_ID, 1)?.version, 1);
  assert.equal(authority.getArtifactPackage(SCOPE_A, PACKAGE_ID)?.version, 2);
  assert.equal(authority.getArtifactPackage(SCOPE_A, PACKAGE_ID, 99), undefined);
});

test("STUDIO-013 cost consolidation: multi-line same-currency decimal sums without float drift", async () => {
  const authority = createStudioPackagingAuthority();
  const universe = await buildUniverse(TENANT_A);
  const costLines: readonly MoneyAmount[] = [
    { currency: "USD", amount: "0.10" },
    { currency: "USD", amount: "0.20" },
    { currency: "USD", amount: "0.055" },
  ];
  const outcome = authority.composeSessionPackage(SCOPE_A, validSessionInput(universe, { costLines }));
  assert.ok(outcome.ok);
  // 0.10 + 0.20 + 0.055 = 0.355 — exact decimal arithmetic at max scale.
  assert.equal(outcome.package.cost.total.amount, "0.355");
  assert.equal(outcome.package.cost.total.currency, "USD");
});
