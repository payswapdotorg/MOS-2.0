/**
 * ATTRIB-001 — the attribution battery: distinct-from-causality (the
 * guard, positive AND negative), references-authoritative-observations
 * (opaque refs only — the observation payload never travels), tenant
 * isolation (D1/D2), append-only corrections, frozen vocabularies.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { TenantId, TenantScope } from "@mos/contracts";
import {
  ATTRIBUTION_BASIS_KINDS,
  ATTRIBUTION_ERROR_CODES,
  AttributionService,
} from "./index.js";
import type { SocialObservationRef } from "./index.js";

const tenant = "tenant-demo" as TenantId;
const scope: TenantScope = { tenantId: tenant };
const socialRef = "social-observation/obs-771" as SocialObservationRef;
const candidate = { discoveryId: "cd-1", version: 3 };
const declaredBy = { id: "actor-1" } as never;

const makeService = () =>
  new AttributionService({
    clock: () => "2026-10-11T00:00:00.000Z" as never,
    nextId: (() => {
      let n = 0;
      return () => `attrib-${++n}`;
    })(),
  });

const goodBasis = {
  kind: "platform-reported-association",
  note: "the platform-said observation reports on the same subject the discovery candidate cites",
};

test("create: a valid attribution lands at v1, frozen, association-only", () => {
  const svc = makeService();
  const r = svc.create({
    tenantId: tenant,
    tenantScope: scope,
    socialObservationRef: socialRef,
    commerceCandidate: candidate,
    basis: goodBasis,
    declaredBy,
  });
  assert.ok(r.ok);
  assert.equal(r.value.version, 1);
  assert.ok(Object.isFrozen(r.value));
  assert.ok(Object.isFrozen(r.value.basis));
});

test("THE CAUSALITY GUARD: effect language in the basis note is a typed rejection", () => {
  const svc = makeService();
  const r = svc.create({
    tenantId: tenant,
    tenantScope: scope,
    socialObservationRef: socialRef,
    commerceCandidate: candidate,
    basis: { kind: "platform-reported-association", note: "this post increased sales of the subject" },
    declaredBy,
  });
  assert.ok(!r.ok);
  assert.equal(r.error.code, "CAUSALITY_VOCABULARY_DETECTED");
  assert.match(r.error.message, /increased sales/);
});

test("THE CAUSALITY GUARD: more effect vocabulary classes are rejected", () => {
  const svc = makeService();
  for (const note of [
    "the observation caused the conversion",
    "the post drove revenue",
    "ROI uplift attributable to the campaign",
    "the effect of the post resulted in conversions",
  ]) {
    const r = svc.create({
      tenantId: tenant,
      tenantScope: scope,
      socialObservationRef: socialRef,
      commerceCandidate: candidate,
      basis: { kind: "platform-reported-association", note },
      declaredBy,
    });
    assert.ok(!r.ok, `expected rejection for: ${note}`);
    assert.equal(r.error.code, "CAUSALITY_VOCABULARY_DETECTED", note);
  }
});

test("THE CAUSALITY GUARD: association language passes", () => {
  const svc = makeService();
  const r = svc.create({
    tenantId: tenant,
    tenantScope: scope,
    socialObservationRef: socialRef,
    commerceCandidate: candidate,
    basis: {
      kind: "platform-reported-association",
      note: "platform-reported co-occurrence of the subject across the observation window",
    },
    declaredBy,
  });
  assert.ok(r.ok);
});

test("the basis-kind vocabulary is frozen and closed", () => {
  const svc = makeService();
  const r = svc.create({
    tenantId: tenant,
    tenantScope: scope,
    socialObservationRef: socialRef,
    commerceCandidate: candidate,
    basis: { kind: "causal-effect", note: "association note" },
    declaredBy,
  });
  assert.ok(!r.ok);
  assert.equal(r.error.code, "INVALID_BASIS");
  assert.deepEqual([...ATTRIBUTION_BASIS_KINDS], ["platform-reported-association"]);
  assert.ok(Object.isFrozen(ATTRIBUTION_BASIS_KINDS));
});

test("references-authoritative-observations: the record carries ONLY the opaque ref", () => {
  const svc = makeService();
  const r = svc.create({
    tenantId: tenant,
    tenantScope: scope,
    socialObservationRef: socialRef,
    commerceCandidate: candidate,
    basis: goodBasis,
    declaredBy,
  });
  assert.ok(r.ok);
  // the observation's reported payload must NOT travel into the attribution
  const record = r.value as unknown as Record<string, unknown>;
  assert.equal(record.socialObservationRef, socialRef);
  assert.ok(!("reported" in record));
  assert.ok(!("metrics" in record));
  const serialized = JSON.stringify(record);
  assert.ok(!serialized.includes("impressions"), "no observation payload copied");
  assert.ok(!serialized.includes("12000"), "no observation payload copied");
});

test("candidate citations require an EXACT version", () => {
  const svc = makeService();
  const r = svc.create({
    tenantId: tenant,
    tenantScope: scope,
    socialObservationRef: socialRef,
    commerceCandidate: { discoveryId: "cd-1", version: 0 },
    basis: goodBasis,
    declaredBy,
  });
  assert.ok(!r.ok);
  assert.equal(r.error.code, "INVALID_CANDIDATE_REF");
});

test("a blank social ref is rejected (the observation must be cited)", () => {
  const svc = makeService();
  const r = svc.create({
    tenantId: tenant,
    tenantScope: scope,
    socialObservationRef: "" as SocialObservationRef,
    commerceCandidate: candidate,
    basis: goodBasis,
    declaredBy,
  });
  assert.ok(!r.ok);
  assert.equal(r.error.code, "INVALID_SOCIAL_REF");
});

test("D1/D2: attributions are tenant-isolated (exact-tenant only)", () => {
  const svc = makeService();
  const a = svc.create({
    tenantId: tenant,
    tenantScope: scope,
    socialObservationRef: socialRef,
    commerceCandidate: candidate,
    basis: goodBasis,
    declaredBy,
  });
  assert.ok(a.ok);
  const cross = svc.get("tenant-other" as TenantId, a.value.id);
  assert.ok(!cross.ok);
  assert.equal(cross.error.code, "NOT_FOUND");
  assert.equal(svc.listForObservation(tenant, socialRef).length, 1);
  assert.equal(
    svc.listForObservation("tenant-other" as TenantId, socialRef).length,
    0,
  );
  assert.equal(svc.listForCandidate(tenant, "cd-1").length, 1);
});

test("append-only: corrections grow the chain; cited refs are immutable", () => {
  const svc = makeService();
  const a = svc.create({
    tenantId: tenant,
    tenantScope: scope,
    socialObservationRef: socialRef,
    commerceCandidate: candidate,
    basis: goodBasis,
    declaredBy,
  });
  assert.ok(a.ok);
  const snapshot = JSON.stringify(a.value);
  const c = svc.correct(tenant, a.value.id, declaredBy, "tightened the association note", {
    basis: {
      kind: "platform-reported-association",
      note: "platform-reported co-occurrence, narrowed to the declared window",
    },
  });
  assert.ok(c.ok);
  assert.equal(c.value.version, 2);
  assert.equal(c.value.corrections.length, 1);
  const correction = c.value.corrections[0]!;
  assert.equal(correction.reason, "tightened the association note");
  assert.deepEqual(correction.changed, ["basis"]);
  assert.equal(JSON.stringify(a.value), snapshot);
});

test("corrections pass the causality guard too (reason + new note)", () => {
  const svc = makeService();
  const a = svc.create({
    tenantId: tenant,
    tenantScope: scope,
    socialObservationRef: socialRef,
    commerceCandidate: candidate,
    basis: goodBasis,
    declaredBy,
  });
  assert.ok(a.ok);
  const bad = svc.correct(tenant, a.value.id, declaredBy, "the note drove conversions", {});
  assert.ok(!bad.ok);
  assert.equal(bad.error.code, "CAUSALITY_VOCABULARY_DETECTED");
});

test("the error vocabulary is frozen and closed", () => {
  assert.deepEqual([...ATTRIBUTION_ERROR_CODES], [
    "INVALID_TENANT",
    "INVALID_SOCIAL_REF",
    "INVALID_CANDIDATE_REF",
    "INVALID_BASIS",
    "CAUSALITY_VOCABULARY_DETECTED",
    "DUPLICATE_ID",
    "NOT_FOUND",
  ]);
  assert.ok(Object.isFrozen(ATTRIBUTION_ERROR_CODES));
});
