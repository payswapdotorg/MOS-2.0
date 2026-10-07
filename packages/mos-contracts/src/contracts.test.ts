/**
 * CONTRACT VALIDATION TEST (CORE-001) — runtime cross-check.
 *
 * Asserts that:
 *  (a) every contract of spec/contracts/core-contracts-v2.0.yaml is
 *      represented in the exported CONTRACT_REQUIRED_FIELDS constant,
 *  (b) every required field appears, exactly, in YAML order — cross-checked
 *      against the vendored JSON fixture hand-derived from the frozen YAML,
 *  (c) the runtime guards (hasRequiredFields / assertRequiredFields)
 *      behave fail-closed,
 *  (d) the projection is frozen and versioned.
 *
 * The compile-time half of the validation (existence + non-optionality of
 * every required field in the TypeScript projection) lives in
 * src/type-tests.ts and runs on every `tsc --noEmit` / `tsc -b`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import fixture from "./fixtures/core-contracts-required-fields.json" with { type: "json" };

import {
  CONTRACT_NAMES,
  CONTRACT_REQUIRED_FIELDS,
  assertRequiredFields,
  getRequiredFields,
  hasRequiredFields,
} from "./contract-required-fields.js";
import { CONTRACT_MANIFEST_VERSION } from "./contracts-by-name.js";
import type { Capability } from "./capability.js";

const fixtureContracts = fixture.contracts as Readonly<
  Record<string, readonly string[]>
>;

test("every YAML contract is represented in CONTRACT_REQUIRED_FIELDS", () => {
  const yamlNames = Object.keys(fixtureContracts);
  assert.equal(yamlNames.length, 25);
  assert.deepEqual([...CONTRACT_NAMES], yamlNames);
  assert.deepEqual(Object.keys(CONTRACT_REQUIRED_FIELDS), yamlNames);
});

test("every required field appears, exactly, in YAML order", () => {
  for (const [name, fields] of Object.entries(fixtureContracts)) {
    assert.deepEqual(
      CONTRACT_REQUIRED_FIELDS[name as keyof typeof CONTRACT_REQUIRED_FIELDS],
      fields,
      `field drift for contract ${name}`,
    );
  }
});

test("no extra contracts and no extra fields were invented", () => {
  for (const name of CONTRACT_NAMES) {
    const projected = getRequiredFields(name);
    const yaml = fixtureContracts[name];
    assert.ok(yaml !== undefined, `contract ${name} missing from fixture`);
    assert.equal(projected.length, yaml.length);
    for (const field of projected) {
      assert.ok(
        yaml.includes(field),
        `field ${field} of ${name} is not in the frozen YAML`,
      );
    }
  }
});

test("the vendored fixture is self-consistent with the frozen manifest", () => {
  assert.equal(fixture.specVersion, "2.0");
  assert.equal(fixture.status, "FROZEN");
  assert.equal(fixture.contractCount, 25);
  assert.equal(fixture.contractCount, Object.keys(fixtureContracts).length);
  assert.equal(CONTRACT_MANIFEST_VERSION, fixture.specVersion);
});

test("CONTRACT_REQUIRED_FIELDS is frozen", () => {
  assert.ok(Object.isFrozen(CONTRACT_REQUIRED_FIELDS));
  assert.ok(Object.isFrozen(CONTRACT_NAMES));
});

test("getRequiredFields fails closed for unknown contract names", () => {
  assert.throws(
    () => getRequiredFields("NotAContract" as never),
    /Unknown core contract name/,
  );
});

test("hasRequiredFields detects a complete capability record", () => {
  const capability: Capability = {
    id: "capability:transcribe_audio" as Capability["id"],
    version: 1 as Capability["version"],
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    evaluator: "evaluator:asr-quality@1" as Capability["evaluator"],
    costModel: { basis: "per-minute", amount: 0.006, currency: "USD" },
    latencyModel: { p50Ms: 2000, p95Ms: 5000, p99Ms: 9000 },
    provenance: "provenance:capability:1" as Capability["provenance"],
  };
  assert.equal(hasRequiredFields(capability, "Capability"), true);
  assert.doesNotThrow(() => assertRequiredFields(capability, "Capability"));
});

test("hasRequiredFields fails closed on missing fields and unknown contracts", () => {
  const incomplete = {
    id: "capability:x",
    version: 1,
    // inputSchema, outputSchema, evaluator, costModel, latencyModel, provenance missing
  };
  assert.equal(hasRequiredFields(incomplete, "Capability"), false);
  assert.throws(
    () => assertRequiredFields(incomplete, "Capability"),
    /Capability is missing required fields: inputSchema, outputSchema, evaluator, costModel, latencyModel, provenance/,
  );
  assert.equal(hasRequiredFields({}, "NotAContract" as never), false);
  assert.throws(
    () => assertRequiredFields({}, "NotAContract" as never),
    /Unknown core contract name/,
  );
});

test("every contract surface passes its own guard on a minimal engine-shaped record", () => {
  // Spot-check a second family end-to-end: a full Engine record must pass
  // the guard, and dropping `license` (the three-layer §29 record) must
  // fail closed with that field named.
  const engineRecord = {
    id: "engine:openclip@1",
    version: 1,
    capabilityIds: ["capability:semantic_video_relevance"],
    adapterRef: "adapter:openclip@1",
    inputContract: { type: "object" },
    outputContract: { type: "object" },
    resources: { cpuCores: 2, gpuUnits: 1, memoryMb: 4096, timeoutMs: 60000 },
    deterministic: true,
    license: {
      code: { identifier: "MIT", status: "cleared" },
      model: { identifier: "CC-BY-4.0", status: "cleared" },
      data: { identifier: "CC-BY-4.0", status: "cleared" },
    },
    security: {
      sandboxed: true,
      networkAccess: "denied",
      filesystemScope: "scoped-artifacts-only",
      databaseCredentials: "none",
      providerCredentials: "none",
    },
    provenance: "provenance:engine:1",
    benchmark: {
      id: "benchmark:openclip-1",
      capabilityVersion: 1,
      engineVersion: 1,
      benchmarkCorpusRef: "corpus:golden@3",
      evaluatorVersion: 1,
      metrics: { score: 0.87 },
      cost: { amount: 0.002, currency: "USD" },
      latency: 900,
      licenseStatus: "cleared",
      result: "passed",
    },
  };
  assert.equal(hasRequiredFields(engineRecord, "Engine"), true);
  const { license: _dropped, ...withoutLicense } = engineRecord;
  assert.equal(hasRequiredFields(withoutLicense, "Engine"), false);
  assert.throws(
    () => assertRequiredFields(withoutLicense, "Engine"),
    /Engine is missing required fields: license/,
  );
});
