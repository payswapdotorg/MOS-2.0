import assert from "node:assert/strict";
import { test } from "node:test";

import type { TenantId } from "../contracts/refs.js";
import type { StudioArtifactRef } from "../contracts/studio-artifact-package.js";
import {
  TENANT,
  createSessionReadyForCapture,
  mustArtifact,
  mustOk,
  participantJoin,
  captureRawTake,
} from "../testing/test-fixtures.js";

// ---------------------------------------------------------------------------
// STUDIO-001: processing output validation (lineage, stages, tenant, contract)
// ---------------------------------------------------------------------------

test("invalid processing outputs are rejected: orphan lineage, wrong stage, tenant mismatch, contract type", async () => {
  const { runtime, artifactFactory, sessionId } = await createSessionReadyForCapture();
  await mustOk(runtime.joinParticipant(sessionId, participantJoin()), "join");
  const rawArtifact = await captureRawTake(runtime, sessionId, {});
  await mustOk(runtime.beginProcessing(sessionId), "beginProcessing");

  // Parentless final (raw human output never silently final §6/§16).
  const orphan = await mustArtifact(
    artifactFactory.createArtifact({
      tenantId: TENANT,
      type: "video",
      stage: "final",
      creationMethod: "composition",
      storageRef: "mos-studio:orphan" as never,
      content: new TextEncoder().encode("orphan"),
      rightsRef: "rights-1" as never,
      provenanceRef: "prov-1" as never,
      parents: [],
    }),
    "orphan creation",
  );
  const orphanResult = await runtime.completeProcessing(sessionId, {
    intermediateArtifacts: [],
    finalArtifacts: [orphan],
  });
  assert.ok(!orphanResult.ok && orphanResult.error.kind === "invalid-processing-output");
  assert.ok((orphanResult.error as { reasons: readonly string[] }).reasons.some((r) => r.includes("parentless final")));

  // Unknown parent lineage.
  const ghostParent = { ...rawArtifact, artifactId: "art-ghost" as never };
  const ghost = await runtime.completeProcessing(sessionId, {
    intermediateArtifacts: [],
    finalArtifacts: [
      { ...orphan, parentArtifactRefs: [ghostParent] },
    ],
  });
  assert.ok(!ghost.ok && (ghost.error as { reasons: readonly string[] }).reasons.some((r) => r.includes("unknown parent")));

  // Tenant mismatch (§31): the factory itself refuses cross-tenant parents...
  const factoryCrossTenant = await artifactFactory.createArtifact({
    tenantId: "tenant-other" as never,
    type: "video",
    stage: "intermediate",
    creationMethod: "organization-transform",
    storageRef: "mos-studio:foreign" as never,
    content: new TextEncoder().encode("foreign"),
    rightsRef: "rights-1" as never,
    provenanceRef: "prov-1" as never,
    parents: [rawArtifact],
  });
  assert.ok(
    !factoryCrossTenant.ok && factoryCrossTenant.error.kind === "invalid-lineage",
    `factory must reject cross-tenant parents: ${JSON.stringify(factoryCrossTenant)}`,
  );
  // ...and the runtime rejects a foreign-tenant artifact in the output regardless.
  const foreignRef = {
    ...rawArtifact,
    artifactId: "art-foreign" as never,
    tenantId: "tenant-other" as TenantId,
    stage: "final",
  } as StudioArtifactRef;
  const foreignResult = await runtime.completeProcessing(sessionId, {
    intermediateArtifacts: [],
    finalArtifacts: [foreignRef],
  });
  assert.ok(
    !foreignResult.ok && (foreignResult.error as { reasons: readonly string[] }).reasons.some((r) => r.includes("tenant mismatch")),
    `runtime must reject foreign-tenant artifacts: ${JSON.stringify(foreignResult)}`,
  );

  // Wrong output type for the format contract (reaction: video/timeline finals).
  const badType = await mustArtifact(
    artifactFactory.createArtifact({
      tenantId: TENANT,
      type: "text",
      stage: "final",
      creationMethod: "composition",
      storageRef: "mos-studio:badtype" as never,
      content: new TextEncoder().encode("badtype"),
      rightsRef: "rights-1" as never,
      provenanceRef: "prov-1" as never,
      parents: [rawArtifact],
    }),
    "badtype creation",
  );
  const badTypeResult = await runtime.completeProcessing(sessionId, {
    intermediateArtifacts: [],
    finalArtifacts: [badType],
  });
  assert.ok(!badTypeResult.ok && (badTypeResult.error as { reasons: readonly string[] }).reasons.some((r) => r.includes("not in format output contract")));

  // Stage mismatch: an intermediate artifact submitted as final.
  const intermediateArtifact = await mustArtifact(
    artifactFactory.createArtifact({
      tenantId: TENANT,
      type: "video",
      stage: "intermediate",
      creationMethod: "organization-transform",
      storageRef: "mos-studio:inter-ok" as never,
      content: new TextEncoder().encode("inter-ok"),
      rightsRef: "rights-1" as never,
      provenanceRef: "prov-1" as never,
      parents: [rawArtifact],
    }),
    "intermediate creation",
  );
  const stageMixup = await runtime.completeProcessing(sessionId, {
    intermediateArtifacts: [],
    finalArtifacts: [intermediateArtifact],
  });
  assert.ok(!stageMixup.ok && (stageMixup.error as { reasons: readonly string[] }).reasons.some((r) => r.includes('stage "intermediate" must be "final"')));

  // Session still in processing — nothing half-applied.
  assert.equal(runtime.getSession(sessionId)?.session.lifecycle.state, "processing");
});
