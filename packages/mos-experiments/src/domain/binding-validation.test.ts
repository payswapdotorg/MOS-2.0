/**
 * BRIDGE-003 binding-validation tests — the fail-closed request SHAPE
 * validation + the production-citation validation (pure logic).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  bindingRequestShapeViolations,
  productionCitationFailure,
} from "./binding-validation.js";
import {
  experimentBindingRequestFixture,
  EXPERIMENT_SCOPE,
  EXPERIMENT_ACTOR,
} from "../testing/search-fixtures.js";
import type { RealExperimentBindingRequest } from "../contracts/binding-request.js";

const baseRequest = async (): Promise<RealExperimentBindingRequest> =>
  (await experimentBindingRequestFixture()).request;

test("a valid fixture request passes shape validation with zero violations", async () => {
  const violations = bindingRequestShapeViolations(await baseRequest());
  assert.deepEqual(violations, []);
});

test("a missing scope.tenantId is named (§31 fail closed)", async () => {
  const request = { ...(await baseRequest()) } as Record<string, unknown>;
  request.scope = { tenantId: "" };
  const violations = bindingRequestShapeViolations(request as never);
  assert.ok(violations.some((violation) => violation.includes("scope.tenantId")));
});

test("a missing actor is named (§30 fail closed)", async () => {
  const request = { ...(await baseRequest()), actor: "" } as never;
  const violations = bindingRequestShapeViolations(request);
  assert.ok(violations.some((violation) => violation.includes("actor is required")));
});

test("an unversioned lab candidate citation is named (never 'latest')", async () => {
  const request = await baseRequest();
  const broken = { ...request, labCandidate: { ...request.labCandidate, benchmarkVersion: 0 } };
  const violations = bindingRequestShapeViolations(broken);
  assert.ok(violations.some((violation) => violation.includes("benchmarkVersion")));
});

test("an empty policy citation set fails closed (insufficient-policy territory)", async () => {
  const request = await baseRequest();
  const broken = { ...request, policy: [] };
  const violations = bindingRequestShapeViolations(broken);
  assert.ok(violations.some((violation) => violation.includes("non-empty array of exact-version rule citations")));
});

test("an empty rights frame fails closed (§27 — no frameless experiment)", async () => {
  const request = await baseRequest();
  const broken = { ...request, rightsFrame: { rightsRefs: [], consentRefs: [] } };
  const violations = bindingRequestShapeViolations(broken);
  assert.ok(violations.some((violation) => violation.includes("no frameless experiment")));
});

test("an inverted measurement window fails closed", async () => {
  const request = await baseRequest();
  const broken = {
    ...request,
    measurement: {
      ...request.measurement,
      windowStart: request.measurement.windowEnd,
      windowEnd: request.measurement.windowStart,
    },
  };
  const violations = bindingRequestShapeViolations(broken);
  assert.ok(violations.some((violation) => violation.includes("strictly after windowStart")));
});

test("a non-ISO window timestamp fails closed", async () => {
  const request = await baseRequest();
  const broken = {
    ...request,
    measurement: { ...request.measurement, windowEnd: "not-a-timestamp" as never },
  };
  const violations = bindingRequestShapeViolations(broken);
  assert.ok(violations.some((violation) => violation.includes("valid ISO-8601")));
});

test("a blank regime label fails closed (the LAB-018 regime discipline)", async () => {
  const request = await baseRequest();
  const broken = { ...request, measurement: { ...request.measurement, regime: "  " } };
  const violations = bindingRequestShapeViolations(broken);
  assert.ok(violations.some((violation) => violation.includes("regime")));
});

test("a missing expected artifact fails closed (distribution citation)", async () => {
  const request = await baseRequest();
  const broken = {
    ...request,
    distribution: { ...request.distribution, expectedArtifact: { artifactId: "", version: 1 } },
  };
  const violations = bindingRequestShapeViolations(broken);
  assert.ok(violations.some((violation) => violation.includes("expectedArtifact.artifactId")));
});

test("production citation: the fixture request's own entry passes", async () => {
  const request = await baseRequest();
  assert.equal(productionCitationFailure(request), null);
});

test("production citation: a lookalike candidate object fails closed (identity comparison)", async () => {
  const request = await baseRequest();
  const lookalike = structuredClone(request.production.selected);
  const broken = { ...request, production: { ...request.production, selected: lookalike } };
  const failure = productionCitationFailure(broken);
  assert.ok(failure !== null);
  assert.equal(failure.kind, "candidate-not-in-result");
  assert.ok(failure.reason.includes("lookalike"));
});

test("production citation: the no-op baseline is not experiment-bindable", async () => {
  const request = await baseRequest();
  const broken = {
    ...request,
    production: { ...request.production, selected: request.production.searchResult.noopBaseline },
  };
  const failure = productionCitationFailure(broken);
  assert.ok(failure !== null);
  assert.equal(failure.kind, "no-op-baseline-not-experiment-bindable");
});

test("production citation: a lookalike with a foreign tenant fails closed on the mismatch (§31)", async () => {
  const request = await baseRequest();
  const foreign = structuredClone(request.production.selected);
  (foreign as unknown as { request: { scope: { tenantId: string } } }).request.scope.tenantId = "tenant-other";
  const broken = { ...request, production: { ...request.production, selected: foreign } };
  const failure = productionCitationFailure(broken);
  assert.ok(failure !== null);
  // The tenant mismatch is named FIRST (fail-closed ordering) — before the
  // identity comparison even runs.
  assert.equal(failure.kind, "production-tenant-mismatch");
});

test("production citation: a tenant-mismatched IN-RESULT request is named directly", async () => {
  // A mutable clone keeps identity (the clone's own entry) — the tenant
  // mismatch surfaces while the candidate-in-result check still passes.
  const request = await baseRequest();
  const mutableResult = structuredClone(request.production.searchResult);
  const mutableSelected = mutableResult.ranked[0];
  assert.ok(mutableSelected !== undefined);
  (mutableSelected as unknown as { request: { scope: { tenantId: string } } }).request.scope.tenantId = "tenant-other";
  const failure = productionCitationFailure({
    ...request,
    production: { searchResult: mutableResult, selected: mutableSelected },
  });
  assert.ok(failure !== null);
  assert.equal(failure.kind, "production-tenant-mismatch");
});

void EXPERIMENT_SCOPE;
void EXPERIMENT_ACTOR;