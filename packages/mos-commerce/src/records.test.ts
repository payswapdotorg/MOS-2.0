/**
 * COMMERCE-001 — the record battery: provenance-required, fail-closed
 * codes, append-only version chain, tenant isolation (D1/D2), frozen
 * records (D3/D4), port denial with verbatim attribution + zero
 * experiment state.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { TenantId, TenantScope } from "@mos/contracts";
import type { ProductSubjectRef } from "@mos/product-intelligence";
import {
  CommerceDiscoveryService,
  createInMemoryDemandExperimentPort,
} from "./index.js";
import type { DemandTestDeclaration, ProvenanceSource } from "./index.js";

const tenant = "tenant-demo" as TenantId;
const scope: TenantScope = { tenantId: tenant };
const subject = "product/alpha-widget" as ProductSubjectRef;
const citation = {
  /* a CommerceObservationCitation double — the cited external observation */
  observedAt: "2026-10-01T00:00:00.000Z",
  observer: "platform-said",
} as unknown as ProvenanceSource["citation"];
const provenance: ProvenanceSource[] = [
  {
    sourceRef: "pi-record-1@3" as unknown as ProvenanceSource["sourceRef"],
    citation,
  },
];
const demandTest: DemandTestDeclaration = {
  mission: { missionRef: "mission-ref-1" as unknown as DemandTestDeclaration["mission"]["missionRef"], missionVersion: 2 },
  question: "does the alpha widget's audience convert on the new hook?",
  successCriterion: "measured conversion interval excludes zero",
  evidence: ["pi-record-1@3" as unknown as ProvenanceSource["sourceRef"]],
  counterfactualLabeled: false,
};

const makeService = (opts?: { denyWith?: string }) =>
  new CommerceDiscoveryService({
    demandExperimentPort: createInMemoryDemandExperimentPort({
      denyWith: opts?.denyWith,
    }),
    clock: () => "2026-10-11T00:00:00.000Z" as never,
    nextId: (() => {
      let n = 0;
      return () => `cd-${++n}`;
    })(),
  });

test("create: a valid candidate lands with v1, frozen, provenance cited", () => {
  const svc = makeService();
  const r = svc.create({ tenantId: tenant, tenantScope: scope, subject, provenance, demandTest });
  assert.ok(r.ok);
  assert.equal(r.value.version, 1);
  assert.equal(r.value.provenance.length, 1);
  assert.ok(Object.isFrozen(r.value));
  assert.ok(Object.isFrozen(r.value.provenance[0]));
});

test("create: provenance is REQUIRED (fail-closed, specific code)", () => {
  const svc = makeService();
  const r = svc.create({
    tenantId: tenant,
    tenantScope: scope,
    subject,
    provenance: [],
    demandTest,
  });
  assert.ok(!r.ok);
  assert.equal(r.error.code, "PROVENANCE_REQUIRED");
});

test("create: a blank tenant is rejected by the frozen grammar", () => {
  const svc = makeService();
  const r = svc.create({
    tenantId: "" as TenantId,
    tenantScope: { tenantId: "" as TenantId },
    subject,
    provenance,
    demandTest,
  });
  assert.ok(!r.ok);
  assert.equal(r.error.code, "INVALID_TENANT");
});

test("create: a demand test without a mission citation is rejected", () => {
  const svc = makeService();
  const r = svc.create({
    tenantId: tenant,
    tenantScope: scope,
    subject,
    provenance,
    demandTest: { ...demandTest, mission: { missionRef: "" as unknown as DemandTestDeclaration["mission"]["missionRef"], missionVersion: 0 } },
  });
  assert.ok(!r.ok);
  assert.equal(r.error.code, "INVALID_DEMAND_TEST");
});

test("D1/D2: records are tenant-isolated — exact-tenant fetch and listing only", () => {
  const svc = makeService();
  const a = svc.create({ tenantId: tenant, tenantScope: scope, subject, provenance, demandTest });
  assert.ok(a.ok);
  const other = svc.create({
    tenantId: "tenant-other" as TenantId,
    tenantScope: { tenantId: "tenant-other" as TenantId },
    subject,
    provenance,
    demandTest,
  });
  assert.ok(other.ok);
  // tenant-demo sees only its own record
  const got = svc.get(tenant, a.value.id);
  assert.ok(got.ok);
  const cross = svc.get("tenant-other" as TenantId, a.value.id);
  assert.ok(!cross.ok);
  assert.equal(cross.error.code, "NOT_FOUND");
  assert.equal(svc.listForSubject(tenant, subject).length, 1);
});

test("append-only: correct() grows the version chain, never mutates history", () => {
  const svc = makeService();
  const a = svc.create({ tenantId: tenant, tenantScope: scope, subject, provenance, demandTest });
  assert.ok(a.ok);
  const snapshot = JSON.stringify(a.value);
  const c = svc.correct(tenant, a.value.id, "tightened success criterion after review", {
    demandTest: { ...demandTest, successCriterion: "interval excludes zero AND width < 0.2" },
  });
  assert.ok(c.ok);
  assert.equal(c.value.version, 2);
  assert.equal(c.value.corrections.length, 1);
  const correction = c.value.corrections[0]!;
  assert.equal(correction.reason, "tightened success criterion after review");
  assert.deepEqual(correction.changed, ["demandTest"]);
  // the v1 snapshot the caller holds is unchanged
  assert.equal(JSON.stringify(a.value), snapshot);
});

test("correct(): a blank reason is rejected (§30-attributable)", () => {
  const svc = makeService();
  const a = svc.create({ tenantId: tenant, tenantScope: scope, subject, provenance, demandTest });
  assert.ok(a.ok);
  const r = svc.correct(tenant, a.value.id, "   ", {});
  assert.ok(!r.ok);
});

test("demand port: success returns the experiment ref; the double self-labels", async () => {
  const svc = makeService();
  const a = svc.create({ tenantId: tenant, tenantScope: scope, subject, provenance, demandTest });
  assert.ok(a.ok);
  const bound = await svc.bindDemandTest(tenant, a.value.id, { id: "actor-1" } as never);
  assert.ok(bound.ok);
  assert.ok(bound.value.ok);
  assert.equal(bound.value.experimentRef, "test-double:cd-1#v1");
});

test("demand port: denial is verbatim-attributed and appends zero experiment state", async () => {
  const attribution =
    'policy gate denied: rule "no-unbounded-demand-tests" (version 4) — verbatim';
  const svc = makeService({ denyWith: attribution });
  const a = svc.create({ tenantId: tenant, tenantScope: scope, subject, provenance, demandTest });
  assert.ok(a.ok);
  const bound = await svc.bindDemandTest(tenant, a.value.id, { id: "actor-1" } as never);
  assert.ok(bound.ok);
  assert.ok(!bound.value.ok);
  assert.equal(bound.value.error.code, "DEMAND_PORT_DENIED");
  assert.equal(bound.value.error.attribution, attribution);
});

test("the service refuses construction without the declared port seam", () => {
  assert.throws(
    () => new CommerceDiscoveryService({} as never),
    /DemandExperimentPort/,
  );
});
