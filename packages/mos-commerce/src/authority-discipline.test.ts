/**
 * COMMERCE-001 — the authority-discipline battery:
 *   1. registry-exact import scan (runtime deps ONLY [contracts, missions,
 *      product-intelligence]; @mos/experiments appears ONLY in tests);
 *   2. the no-commerce-vocabulary scan (no listing/order/inventory state —
 *      the hard boundary of the acceptance clause);
 *   3. the frozen error-vocabulary pin.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, "..");
const srcDir = join(packageRoot, "src");

const listTsFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...listTsFiles(full));
    } else if (name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
};

const nonTestSources = listTsFiles(srcDir).filter((f) => !f.endsWith(".test.ts"));

test("registry-exact import discipline: runtime deps are contracts/missions/product-intelligence only", () => {
  const allowed = new Set([
    "@mos/contracts",
    "@mos/missions",
    "@mos/product-intelligence",
  ]);
  const importRe = /(?:^|\n)\s*import\s+(?:type\s+)?[^'"]*?from\s+["']([^"']+)["']/g;
  for (const file of nonTestSources) {
    const text = readFileSync(file, "utf-8");
    for (const match of text.matchAll(importRe)) {
      const spec = match[1] as string;
      if (spec.startsWith(".") || spec.startsWith("node:")) continue;
      assert.ok(
        allowed.has(spec),
        `${file}: non-registry runtime import "${spec}" (allowed: ${[...allowed].join(", ")})`,
      );
    }
  }
});

test("@mos/experiments is referenced ONLY by test surfaces (the devDep law)", () => {
  for (const file of nonTestSources) {
    const text = readFileSync(file, "utf-8");
    // strip comments — the DISCLOSURE legitimately names the devDep law
    const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    assert.ok(
      !code.includes("@mos/experiments") &&
        !code.includes("mos-experiments/"),
      `${file}: non-test source references @mos/experiments (experiments is a devDep — type/compat surfaces only)`,
    );
  }
});

test("no listing/order/inventory commerce-vocabulary anywhere in the authority", () => {
  // Words that would signal an order/inventory/listing authority forming.
  // ("order" as sort-order is avoided in this package's vocabulary by
  // construction; the scan stays strict on purpose.)
  const forbidden =
    /\b(?:order|orders|inventory|listing|listings|cart|checkout|sku|stock|shipment|purchase)\b/i;
  for (const file of nonTestSources) {
    const text = readFileSync(file, "utf-8");
    // strip comments (the boundary STATEMENTS legitimately say "no
    // listing/order/inventory authority" — the scan pins the code, not
    // the disclosure)
    const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    const hit = forbidden.exec(code);
    assert.ok(
      hit === null,
      `${file}: commerce-vocabulary hit "${hit?.[0]}" — this authority cites, it never transacts`,
    );
  }
});

test("the error vocabulary is frozen and closed", async () => {
  const mod = await import("./index.js");
  assert.deepEqual(mod.COMMERCE_DISCOVERY_ERROR_CODES, [
    "INVALID_TENANT",
    "INVALID_SUBJECT",
    "PROVENANCE_REQUIRED",
    "INVALID_PROVENANCE",
    "INVALID_DEMAND_TEST",
    "DUPLICATE_ID",
    "NOT_FOUND",
    "VERSION_CONFLICT",
    "DEMAND_PORT_DENIED",
  ]);
  assert.ok(Object.isFrozen(mod.COMMERCE_DISCOVERY_ERROR_CODES));
});

test("the public runtime surface is exactly the three documented exports", async () => {
  const mod = await import("./index.js");
  const runtimeKeys = Object.keys(mod).sort();
  assert.deepEqual(runtimeKeys, [
    "COMMERCE_DISCOVERY_ERROR_CODES",
    "CommerceDiscoveryService",
    "commerceDiscoveryIdDefault",
    "commerceDiscoveryNowDefault",
    "createInMemoryDemandExperimentPort",
  ]);
});
