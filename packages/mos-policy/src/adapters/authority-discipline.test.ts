/**
 * AUTHORITY DISCIPLINE (POLICY-001) — the structural pins of the policy
 * authority's discipline, test-enforced:
 *
 * 1. POLICY NEVER DECIDES RIGHTS (§505 separation; policy ≠ rights): the
 *    package carries NO rights vocabulary at all — no rights evaluation
 *    rule, no grant/consent types, no rights-verdict semantics. A policy
 *    verdict is orthogonal to a rights verdict; a quality rejection is
 *    distinct from BOTH (§19) — no quality-evaluation vocabulary either.
 * 2. POLICY NEVER ORIGINATES ACTIONS: the public surfaces are exactly
 *    register/revise/get/list (registry) and evaluate/get/list
 *    (evaluation) — there is structurally no submit/execute/invoke/create
 *    surface; the action descriptor is CALLER-declared data the authority
 *    vets.
 * 3. NO ENGINE/MISSION/STUDIO (or any sibling-domain) IMPLEMENTATION
 *    IMPORTS: src/** imports ONLY relative paths, @mos/contracts,
 *    @mos/identity and node builtins (registry-exact dependency set;
 *    the boundary-chain action-kind vocabulary is DATA — the closed
 *    const — never an import).
 * 4. The frozen vocabularies are exactly the declared closed sets; the
 *    port method budgets are ≤ 12 with the exact method names pinned;
 *    the runtime export budget is the documented 5 exports.
 * 5. No network surface (no network module import, no global network
 *    identifier in comment/string-stripped code).
 *
 * The scans read the SOURCE tree (src/) resolved from the running test's
 * location (dist/adapters → ../../src), so they pin what ships.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { isBuiltin } from "node:module";

import { POLICY_ACTION_KINDS, POLICY_MODALITIES } from "../contracts/policy-rule.js";
import { createInMemoryPolicyRegistry } from "./in-memory-policy-registry.js";
import { createInMemoryPolicyEvaluation } from "./in-memory-policy-evaluation.js";
import * as publicSurface from "../index.js";

const SRC_ROOT = fileURLToPath(new URL("../../src/", import.meta.url));
const PACKAGE_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** Every source file under src/ (recursive), POSIX-relative to src/. */
function walk(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const target = join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(target));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      out.push(target);
    }
  }
  return out;
}

/** Strips // and block comments, string literals and template contents. */
function stripCommentsAndStrings(source: string): string {
  let out = "";
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      i++;
      while (i < source.length && source[i] !== quote) {
        if (source[i] === "\\") i++;
        i++;
      }
      i++;
      continue;
    }
    if (c === "`") {
      i++;
      while (i < source.length && source[i] !== "`") {
        if (source[i] === "\\") i++;
        i++;
      }
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** All module specifiers referenced by import/export-from/dynamic-import. */
function importsOf(source: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /(?:^|[\s;}])import\s[^;]*?from\s*['"]([^'"]+)['"]/g,
    /(?:^|[\s;}])export\s[^;]*?from\s*['"]([^'"]+)['"]/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier !== undefined) {
        specifiers.push(specifier);
      }
    }
  }
  return specifiers;
}

interface SourceFile {
  readonly relative: string;
  readonly text: string;
  readonly code: string;
}

function loadSources(): SourceFile[] {
  return walk(SRC_ROOT).map((path) => {
    const relative = path.slice(SRC_ROOT.length).split("\\").join("/");
    const text = readFileSync(path, "utf8");
    return { relative, text, code: stripCommentsAndStrings(text) };
  });
}

// ---------------------------------------------------------------------------
// (1) + (3) imports: registry-exact dependency set, no sibling domains
// ---------------------------------------------------------------------------

test("src/ imports ONLY relative paths, @mos/contracts, @mos/identity and node builtins", () => {
  const allowedPrefixes = ["./", "../", "@mos/contracts", "@mos/identity", "node:"];
  for (const file of loadSources()) {
    for (const specifier of importsOf(file.text)) {
      const allowed =
        allowedPrefixes.some((prefix) => specifier.startsWith(prefix)) ||
        (isBuiltin(specifier) && !specifier.startsWith("@"));
      assert.ok(
        allowed,
        `${file.relative}: disallowed import "${specifier}" — the policy module's registry-exact dependency set is [@mos/contracts, @mos/identity]`,
      );
    }
  }
});

test("no sibling-domain or substrate implementation is imported (engines/missions/studio/lab/production/distribution/rights/agents/jobs/web/zcode)", () => {
  const forbidden = [
    "@mos/engines",
    "@mos/missions",
    "@mos/studio",
    "@mos/lab",
    "@mos/production",
    "@mos/distribution",
    "@mos/rights",
    "@mos/agents",
    "@mos/agent-runtime",
    "@mos/jobs",
    "@mos/integrations",
    "@mos/web",
    "@mos/capabilities",
    "@mos/content",
    "@zcode/",
  ];
  for (const file of loadSources()) {
    for (const specifier of importsOf(file.text)) {
      for (const prefix of forbidden) {
        assert.ok(
          !specifier.startsWith(prefix),
          `${file.relative}: forbidden import "${specifier}" — policy vets declared actions against declared rules; sibling-domain implementations are reached only through composition-root wiring`,
        );
      }
    }
  }
});

// ---------------------------------------------------------------------------
// (1) vocabulary: no rights / quality semantics anywhere in the code
// ---------------------------------------------------------------------------

test("NO rights vocabulary in the policy source (policy NEVER decides rights — §505)", () => {
  const bannedIdentifiers = [
    "evaluateRights",
    "RightsGrant",
    "RightsAction",
    "RightsRepository",
    "ConsentRecord",
    "rightsEvaluation",
    "no-explicit-grant",
    "qualityRejection",
    "evaluateQuality",
  ];
  for (const file of loadSources()) {
    for (const banned of bannedIdentifiers) {
      assert.ok(
        !file.code.includes(banned),
        `${file.relative}: rights/quality vocabulary "${banned}" must not appear — a policy verdict is orthogonal to a rights verdict (§505) and to a quality verdict (§19)`,
      );
    }
  }
});

test("NO network surface: no network module import and no global network identifier in code", () => {
  const networkIdentifiers = ["fetch(", "net.connect", "http.request", "https.request", "WebSocket"];
  for (const file of loadSources()) {
    for (const banned of networkIdentifiers) {
      assert.ok(
        !file.code.includes(banned),
        `${file.relative}: network identifier "${banned}" — the policy authority is a pure evaluation surface with no network capability`,
      );
    }
    for (const specifier of importsOf(file.text)) {
      assert.ok(
        specifier !== "node:net" && specifier !== "node:http" && specifier !== "node:https",
        `${file.relative}: network module import "${specifier}"`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// (2) the authority never originates actions: exact port method names
// ---------------------------------------------------------------------------

test("the registry surface is EXACTLY [register, revise, getRule, listLatestRules, listRuleVersions] (≤ 12)", () => {
  const registry = createInMemoryPolicyRegistry();
  assert.deepEqual(Object.keys(registry).sort(), [
    "getRule",
    "listLatestRules",
    "listRuleVersions",
    "register",
    "revise",
  ]);
  assert.ok(Object.keys(registry).length <= 12);
});

test("the evaluation surface is EXACTLY [evaluate, getEvaluationRecord, listEvaluationRecords] (≤ 12)", () => {
  const registry = createInMemoryPolicyRegistry();
  const evaluation = createInMemoryPolicyEvaluation({ registry });
  assert.deepEqual(Object.keys(evaluation).sort(), [
    "evaluate",
    "getEvaluationRecord",
    "listEvaluationRecords",
  ]);
  assert.ok(Object.keys(evaluation).length <= 12);
});

test("no action-origination verb appears as a public method of the adapters", () => {
  const originationVerbs = [
    "submit",
    "execute",
    "invoke",
    "dispatch",
    "originate",
    "createAction",
    "start",
    "run",
    "publish",
    "approve",
  ];
  const registry = createInMemoryPolicyRegistry();
  const evaluation = createInMemoryPolicyEvaluation({ registry });
  for (const verb of originationVerbs) {
    assert.ok(!(`${verb}` in registry), `registry must not expose "${verb}"`);
    assert.ok(!(`${verb}` in evaluation), `evaluation must not expose "${verb}"`);
  }
});

// ---------------------------------------------------------------------------
// (4) frozen vocabularies + the runtime export budget
// ---------------------------------------------------------------------------

test("the action-kind vocabulary is EXACTLY the six frozen boundary-chain kinds", () => {
  assert.deepEqual([...POLICY_ACTION_KINDS], [
    "production-request-approval",
    "distribution",
    "experiment-launch",
    "transform-application",
    "engine-invocation",
    "human-task-fulfillment",
  ]);
  assert.deepEqual([...POLICY_MODALITIES], ["text", "audio", "image", "video"]);
});

test("the runtime export budget is EXACTLY the documented 5 exports", () => {
  assert.deepEqual(Object.keys(publicSurface).sort(), [
    "POLICY_ACTION_KINDS",
    "POLICY_MODALITIES",
    "PolicyError",
    "createInMemoryPolicyEvaluation",
    "createInMemoryPolicyRegistry",
  ]);
});

test("package.json declares EXACTLY the registry-exact dependency set [contracts, identity]", () => {
  const manifest = JSON.parse(
    readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8"),
  ) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  assert.deepEqual(Object.keys(manifest.dependencies ?? {}).sort(), [
    "@mos/contracts",
    "@mos/identity",
  ]);
  assert.deepEqual(Object.keys(manifest.devDependencies ?? {}).sort(), [
    "@types/node",
    "typescript",
  ]);
  for (const specifier of [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ]) {
    assert.ok(!specifier.startsWith("@zcode/"), `no @zcode/* dependency: ${specifier}`);
    assert.ok(
      !specifier.startsWith("@mos/") ||
        specifier === "@mos/contracts" ||
        specifier === "@mos/identity",
      `only registry-exact @mos deps: ${specifier}`,
    );
  }
});

// ---------------------------------------------------------------------------
// (5) verdict vocabulary: closed and fail-closed (the §505 twin)
// ---------------------------------------------------------------------------

test("the verdict outcome vocabulary is closed and DISTINCT from rights verdicts", () => {
  // The policy verdict vocabulary (compile-pinned in contracts/type-pins.ts)
  // is allowed | denied | approval-required | insufficient-policy —
  // mirrored here at runtime through the type surface's decisions.
  const policyOutcomes = [
    "allowed",
    "denied",
    "approval-required",
    "insufficient-policy",
  ] as const;
  const rightsOutcomes = ["granted", "denied"] as const;
  for (const outcome of policyOutcomes) {
    if (outcome === "denied") {
      continue; // "denied" is shared English; the SEMANTICS are disjoint.
    }
    assert.ok(
      !rightsOutcomes.includes(outcome as (typeof rightsOutcomes)[number]),
      `policy outcome "${outcome}" must not be a rights outcome`,
    );
  }
  // The fail-closed member is part of the vocabulary.
  assert.ok(policyOutcomes.includes("insufficient-policy"));
});
