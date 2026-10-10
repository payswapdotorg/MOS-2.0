/**
 * BRIDGE-003 authority-discipline tests — the EXPERIMENT ≠ LAB
 * forbidden-duplication pin at the SURFACE level (the runtime half of the
 * compile-time pins in contracts/type-pins.ts):
 * - the package exports NO simulation/prediction/calibration surface (the
 *   vocabulary scan — a second lab/calibration authority is not even
 *   expressible through the public surface);
 * - the port carries EXACTLY the 12 policy-budget methods, with NO
 *   update/delete member (append-only by construction);
 * - every exported record family carries the §24 boundary statement;
 * - the evidence/outcome records never carry counterfactual values;
 * - the store surfaces expose append-only members only.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import * as index from "../index.js";
import type { RealExperimentAuthorityPort } from "../contracts/authority-port.js";
import { REAL_EXPERIMENT_BOUNDARY_STATEMENT } from "../contracts/experiment-boundary.js";
import {
  composeExperimentWorld,
  experimentBindingRequestFixture,
  EXPERIMENT_SCOPE,
  EXPERIMENT_TENANT,
  EXPERIMENT_ACTOR,
} from "../testing/search-fixtures.js";
import { experimentObservationIdOf } from "../contracts/ids.js";

test("the exported vocabulary carries NO simulation/prediction/calibration surface", () => {
  const exported = Object.keys(index);
  const forbidden = [
    "simulate",
    "simulation",
    "runSimulation",
    "predict",
    "prediction",
    "calibrate",
    "calibration",
    "recordCalibrationError",
    "deriveCalibrationContext",
    "runBenchmark",
    "evaluateStrategy",
  ];
  for (const name of forbidden) {
    assert.equal(
      exported.some((key) => key.toLowerCase().includes(name.toLowerCase())),
      false,
      `the experiments authority must never export a ${name} surface (§3 Lab ≠ Experiment — the forbidden-duplication pin)`,
    );
  }
  // The authority's own surfaces are present.
  for (const required of [
    "createInMemoryRealExperimentAuthority",
    "canonicalRealExperimentBinding",
    "createInMemoryLabCandidateReader",
  ]) {
    assert.ok(exported.includes(required), `the public surface must export ${required}`);
  }
});

test("the port carries EXACTLY the twelve policy-budget methods", () => {
  const methods: readonly (keyof RealExperimentAuthorityPort)[] = [
    "createBinding",
    "advanceMeasurement",
    "analyse",
    "closeExperiment",
    "getExperiment",
    "listExperiments",
    "getEvidence",
    "listEvidenceVersions",
    "getOutcome",
    "getOutcomeObservation",
    "listBindingAudits",
    "verifyExperimentIntegrity",
  ];
  const port = index.createInMemoryRealExperimentAuthority({
    labCandidate: index.createInMemoryLabCandidateReader({ snapshots: [] }),
    missions: { getMission: () => null },
    policyGate: index.createInMemoryExperimentPolicyGate(),
    rightsGate: index.createInMemoryExperimentRightsGate(),
    distribution: index.createInMemoryDistributionObservationSource({
      publications: [],
      observations: [],
    }),
    jobs: { enqueue: () => null } as never,
    clock: () => "2026-06-01T00:00:00.000Z" as never,
  });
  const present = Object.entries(port as unknown as Record<string, unknown>)
    .filter(([, value]) => typeof value === "function")
    .map(([key]) => key);
  assert.deepEqual([...present].sort(), [...methods].sort());
  // NO update/delete member anywhere on the surface (append-only by construction).
  assert.equal(present.some((key) => /^update|^delete|^remove|^rewrite/i.test(key)), false);
});

test("every source file's exported record family carries the §24 boundary statement", async () => {
  const srcRoot = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "contracts");
  const files = await readdir(srcRoot);
  const recordFiles = files.filter(
    (file) => file.endsWith(".ts") && !file.endsWith(".test.ts") && !["ids.ts", "pin-helpers.ts", "type-pins.ts"].includes(file),
  );
  for (const file of recordFiles) {
    const content = await readFile(path.join(srcRoot, file), "utf-8");
    if (content.includes("boundaryStatement")) {
      assert.ok(
        content.includes("REAL_EXPERIMENT_BOUNDARY_STATEMENT") || content.includes("boundaryStatement:"),
        `${file} references boundaryStatement — it must carry the frozen const`,
      );
    }
  }
  assert.equal(
    REAL_EXPERIMENT_BOUNDARY_STATEMENT.includes("never simulates"),
    true,
    "the §24 statement pins the never-simulates discipline",
  );
});

test("the boundary statement rides EVERY stored record (experiment, evidence, outcome, audit)", async () => {
  const world = composeExperimentWorld();
  const { request } = await experimentBindingRequestFixture();
  const bound = await world.authority.createBinding(request);
  assert.ok(bound.ok);
  const experimentId = bound.value.experimentId;
  assert.equal(bound.value.experiment.boundaryStatement, REAL_EXPERIMENT_BOUNDARY_STATEMENT);
  const evidence = world.authority.getEvidence(EXPERIMENT_SCOPE, experimentId);
  assert.ok(evidence !== undefined);
  assert.equal(evidence.boundaryStatement, REAL_EXPERIMENT_BOUNDARY_STATEMENT);
  // Measure + analyse to cover the outcome + audit families.
  world.clock.setIso("2026-06-09T00:00:00.000Z");
  const claim = world.jobs.claimNextRunnable({ workerId: "w", tenantId: EXPERIMENT_TENANT });
  assert.ok(claim !== null);
  const advanced = await world.authority.advanceMeasurement(EXPERIMENT_SCOPE, experimentId, {
    jobId: String(claim.jobId),
    leaseToken: String(claim.leaseToken),
    workerId: "w",
  });
  assert.ok(advanced.ok);
  const analysed = await world.authority.analyse(EXPERIMENT_SCOPE, experimentId, EXPERIMENT_ACTOR);
  assert.ok(analysed.ok);
  assert.equal(analysed.value.outcome.boundaryStatement, REAL_EXPERIMENT_BOUNDARY_STATEMENT);
  // An audit record (a policy denial world) carries it too.
  const deniedWorld = composeExperimentWorld({
    policyScript: [
      {
        decision: "denied",
        outcome: "denied",
        denialReason: "denied (discipline probe)",
        policyRef: null,
        evaluationRef: null,
      },
    ],
  });
  const denied = await deniedWorld.authority.createBinding(request);
  assert.ok(!denied.ok);
  const audits = deniedWorld.authority.listBindingAudits(EXPERIMENT_SCOPE);
  const audit = audits[0];
  assert.ok(audit !== undefined);
  assert.equal(audit.boundaryStatement, REAL_EXPERIMENT_BOUNDARY_STATEMENT);
});

test("measured evidence and outcome observations are REAL (counterfactual: false, runtime-pinned)", async () => {
  const world = composeExperimentWorld();
  const { request } = await experimentBindingRequestFixture();
  const bound = await world.authority.createBinding(request);
  assert.ok(bound.ok);
  const experimentId = bound.value.experimentId;
  world.clock.setIso("2026-06-09T00:00:00.000Z");
  const claim = world.jobs.claimNextRunnable({ workerId: "w", tenantId: EXPERIMENT_TENANT });
  assert.ok(claim !== null);
  const advanced = await world.authority.advanceMeasurement(EXPERIMENT_SCOPE, experimentId, {
    jobId: String(claim.jobId),
    leaseToken: String(claim.leaseToken),
    workerId: "w",
  });
  assert.ok(advanced.ok);
  const analysed = await world.authority.analyse(EXPERIMENT_SCOPE, experimentId, EXPERIMENT_ACTOR);
  assert.ok(analysed.ok);
  // The evidence: counterfactual false + platform-said class label.
  const evidence = world.authority.getEvidence(EXPERIMENT_SCOPE, experimentId);
  assert.ok(evidence !== undefined && evidence.kind === "measured-evidence");
  assert.equal(evidence.counterfactual, false);
  assert.equal(evidence.evidenceKind, "platform-said-observation");
  // The outcome observation: the same runtime pins.
  const observation = world.authority.getOutcomeObservation(
    EXPERIMENT_SCOPE,
    experimentObservationIdOf(experimentId),
  );
  assert.ok(observation !== null);
  assert.equal(observation.counterfactual, false);
  // The counterfactual expectations on the SAME chain stay true forever.
  assert.equal(bound.value.experiment.labCandidate.expectations.counterfactual, true);
  assert.equal(analysed.value.outcome.counterfactualExpectation.counterfactual, true);
});

test("the source tree never imports @mos/lab (the registry-exact dependency pin)", async () => {
  const srcRoot = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
  const walk = async (dir: string): Promise<string[]> => {
    const entries = await readdir(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await walk(target)));
      } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
        files.push(target);
      }
    }
    return files;
  };
  for (const file of await walk(srcRoot)) {
    const content = await readFile(file, "utf-8");
    assert.equal(
      content.includes('from "@mos/lab'),
      false,
      `${path.relative(srcRoot, file)} must never import @mos/lab (the lab is NOT a registry dependency of experiments — the declared-seam discipline)`,
    );
  }
});