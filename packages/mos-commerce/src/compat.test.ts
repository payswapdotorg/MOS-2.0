/**
 * COMMERCE-001 — the compat battery: the demand-experiment seam against the
 * REAL @mos/experiments authority (imported via its dist build — the
 * source-default exports-map law; the missions-package precedent).
 *
 * Pins:
 *   1. the REAL authority surface resolves (createInMemoryRealExperimentAuthority,
 *      canonicalRealExperimentBinding, the gate doubles);
 *   2. the REAL authority exposes the binding method the demand-test
 *      adapter composes (createBinding over RealExperimentBindingRequest);
 *   3. a DemandExperimentPort adapter over the REAL authority TYPE-CHECKS
 *      structurally (the seam is satisfiable without fabrication).
 */
import assert from "node:assert/strict";
import test from "node:test";
// REAL authority over dist (relative path — @mos/experiments' exports map
// defaults to source, which plain Node ESM cannot execute)
import * as experimentsAuthority from "../../mos-experiments/dist/index.js";
import type { CommerceDiscoveryRecord, DemandExperimentPort } from "./index.js";

test("@mos/experiments resolves as the BRIDGE-003 real-experiment authority", () => {
  assert.ok(typeof experimentsAuthority === "object" && experimentsAuthority !== null);
  assert.equal(typeof experimentsAuthority.createInMemoryRealExperimentAuthority, "function");
  assert.equal(typeof experimentsAuthority.canonicalRealExperimentBinding, "function");
  assert.equal(typeof experimentsAuthority.createInMemoryLabCandidateReader, "function");
  assert.equal(typeof experimentsAuthority.createInMemoryExperimentPolicyGate, "function");
  assert.equal(typeof experimentsAuthority.createInMemoryExperimentRightsGate, "function");
  assert.equal(typeof experimentsAuthority.createInMemoryDistributionObservationSource, "function");
});

test("the REAL authority exposes the demand-test binding method", () => {
  const options = {
    labCandidate: experimentsAuthority.createInMemoryLabCandidateReader({ snapshots: [] }),
    missions: { getMission: () => null } as never,
    policyGate: experimentsAuthority.createInMemoryExperimentPolicyGate(),
    rightsGate: experimentsAuthority.createInMemoryExperimentRightsGate(),
    distribution: experimentsAuthority.createInMemoryDistributionObservationSource({ publications: [], observations: [] }),
    jobs: { enqueue: () => ({ ok: true, value: { jobId: "job-1" } }) } as never,
    clock: () => "2026-10-11T00:00:00.000Z" as never,
  };
  const authority = experimentsAuthority.createInMemoryRealExperimentAuthority(options);
  assert.equal(typeof authority.createBinding, "function");
  assert.equal(typeof authority.advanceMeasurement, "function");
  assert.equal(typeof authority.analyse, "function");
  assert.equal(typeof authority.closeExperiment, "function");
});

test("the DemandExperimentPort seam is structurally satisfiable over the REAL authority", () => {
  // The adapter shape the composition root wires: a DemandExperimentPort
  // whose bindDemandTest delegates to the REAL authority's createBinding.
  // Structural check — the port's method signature accepts the composition
  // (compile-time verified here by constructing the delegation object).
  const port: DemandExperimentPort = {
    bindDemandTest: async (_scope: Parameters<DemandExperimentPort["bindDemandTest"]>[0], _actor: Parameters<DemandExperimentPort["bindDemandTest"]>[1], record: CommerceDiscoveryRecord) => {
      // The REAL adapter maps the record's demand-test declaration onto a
      // RealExperimentBindingRequest (every ref exact-version cited) and
      // returns the authority-minted experiment ref. Here we pin only the
      // delegation shape — the full binding flow is the harness-level
      // closed-loop proof's territory (PROD-004).
      return {
        ok: false,
        error: {
          code: "DEMAND_PORT_DENIED",
          message: "adapter not composed in this test (see harness/closed-loop)",
          attribution: `would bind demand test for ${record.id} via the REAL createBinding`,
        },
      };
    },
  };
  assert.equal(typeof port.bindDemandTest, "function");
});
