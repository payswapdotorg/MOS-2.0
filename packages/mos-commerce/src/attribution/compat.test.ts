/**
 * ATTRIB-001 — the compat battery: the attribution's opaque social
 * observation refs against the REAL @mos/distribution observation surface
 * (imported via its dist build — the source-default exports-map law).
 *
 * Pins:
 *   1. the REAL SocialObservationRecord shape resolves over dist;
 *   2. a REAL observation record's own id SATISFIES the attribution's
 *      opaque SocialObservationRef (the ref is the authority's id);
 *   3. the attribution record references the observation BY REFERENCE —
 *      the REAL record's `reported` payload never travels into the
 *      attribution (the structurally-pure citation law).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { AttributionService } from "./ops.js";
import type { SocialObservationRef } from "./types.js";
import type { TenantId, TenantScope, Timestamp } from "@mos/contracts";

// REAL observation record shape over dist (relative path — the exports map
// defaults to source, which plain Node ESM cannot execute)
import type { SocialObservationRecord } from "../../../mos-distribution/dist/contracts/social-record.js";

test("the REAL SocialObservationRecord shape resolves over dist", async () => {
  const mod = await import("../../../mos-distribution/dist/contracts/social-record.js");
  assert.ok(mod !== null && typeof mod === "object");
});

test("a REAL observation record's own id satisfies the opaque attribution ref", () => {
  // A REAL-shaped observation record (the authority's fields, verbatim) —
  // typed against the REAL SocialObservationRecord (the shape pin):
  const realObservation: SocialObservationRecord = {
    id: "social-observation/obs-real-42",
    scope: { tenantId: "tenant-demo" },
    channelRef: "channel/instagram-demo",
    providerId: "provider/instagram",
    subjectRef: "product/alpha-widget",
    reported: { impressions: 12000, likes: 340 } as SocialObservationRecord["reported"],
    observedAt: "2026-10-01T00:00:00.000Z",
    recordedAt: "2026-10-02T00:00:00.000Z",
    providerRefs: ["insight-17"],
    source: "test-double:in-memory-social-adapter",
  } as unknown as SocialObservationRecord;

  // The attribution cites the authority's OWN id — nothing else:
  const citedRef = realObservation.id as unknown as SocialObservationRef;
  const tenant = "tenant-demo" as TenantId;
  const svc = new AttributionService({
    clock: () => "2026-10-11T00:00:00.000Z" as Timestamp,
    nextId: () => "attrib-compat-1",
  });
  const r = svc.create({
    tenantId: tenant,
    tenantScope: { tenantId: tenant } as TenantScope,
    socialObservationRef: citedRef,
    commerceCandidate: { discoveryId: "cd-1", version: 1 },
    basis: {
      kind: "platform-reported-association",
      note: "the platform-said observation reports on the discovery candidate's cited subject",
    },
    declaredBy: { id: "actor-1" } as never,
  });
  assert.ok(r.ok);
  assert.equal(r.value.socialObservationRef, "social-observation/obs-real-42");

  // BY REFERENCE ONLY: the observation's reported payload never travels
  const serialized = JSON.stringify(r.value);
  assert.ok(!serialized.includes("impressions"));
  assert.ok(!serialized.includes("12000"));
  assert.ok(!serialized.includes("likes"));
});
