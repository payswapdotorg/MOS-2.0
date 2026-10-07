/**
 * AUTHORITY DISCIPLINE (INTEG-001 acceptance): "no provider-specific
 * semantics leak into authorities" — the package exposes PROVIDER-NEUTRAL
 * contracts only; provider specifics live in ProviderDefinition DATA, not
 * code. Structural pins:
 * - no REAL provider/vendor name appears anywhere in the package source
 *   (not even in test data — fixtures use fictional providers);
 * - the FICTIONAL fixture provider names appear ONLY in the disclosed
 *   data/composition seams (testing/**, *.test.ts) — never in the
 *   authority-facing surfaces (contracts/, ports/, adapters/, errors,
 *   index);
 * - NO network capability: no network module import and no global network
 *   identifier in comment/string-stripped code (the transport seam is a
 *   declared port; the shipped adapter is a disclosed deterministic
 *   in-memory double);
 * - transport determinism: the double is a pure function of
 *   (request, routes) — bit-for-bit reproducible;
 * - port method budgets ≤ 12 and the runtime export budget of the public
 *   surface (the documented 9 functions + 5 constants + 1 error class).
 *
 * The scans read the SOURCE tree (src/) resolved from the running test's
 * location (dist/adapters → ../../src), so they pin what ships, not what
 * was compiled.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { composeIntegrationsStack } from "../testing/compose-integrations-stack.js";
import { registeredAuroraStack, standardInvokeRequest } from "../testing/registered-stack.js";
import {
  createInMemoryProviderTransportDouble,
  IN_MEMORY_TRANSPORT_SOURCE,
} from "./in-memory-provider-transport.js";
import type { ProviderTransportRequest } from "../ports/provider-transport.port.js";
import * as publicSurface from "../index.js";

const SRC_ROOT = fileURLToPath(new URL("../../src/", import.meta.url));

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

interface SourceFile {
  readonly path: string;
  readonly relative: string;
  readonly text: string;
  readonly isTest: boolean;
  readonly isDataSeam: boolean;
  readonly isAuthorityFacing: boolean;
}

function loadSources(): SourceFile[] {
  return walk(SRC_ROOT).map((path) => {
    const relative = path.slice(SRC_ROOT.length).split("\\").join("/");
    const isTest = relative.endsWith(".test.ts");
    const isDataSeam = relative.startsWith("testing/");
    return {
      path,
      relative,
      text: readFileSync(path, "utf8"),
      isTest,
      isDataSeam,
      isAuthorityFacing: !isTest && !isDataSeam,
    };
  });
}

/**
 * Strips // and block comments, string literals and template contents —
 * the residual text is identifiers/punctuation only (a conservative
 * code-only view; identifiers like `fetch` survive, data does not).
 */
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
      i++;
      while (i < source.length && source[i] !== c) {
        if (source[i] === "\\") i++;
        i++;
      }
      i++;
      out += " ";
      continue;
    }
    if (c === "`") {
      i++;
      while (i < source.length && source[i] !== "`") i++;
      i++;
      out += " ";
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

test("authority discipline: no REAL provider/vendor name appears anywhere in the package source", () => {
  const sources = loadSources();
  assert.ok(sources.length >= 25, `expected the full source tree, found ${sources.length}`);
  // NOTE: this test file itself is EXCLUDED — the denylist below must name
  // the names to forbid them; every OTHER file (authority-facing, data
  // seam, and test) is scanned.
  const scanned = sources.filter(
    (file) => !file.relative.endsWith("adapters/authority-discipline.test.ts"),
  );
  const realProviderNames = [
    "you" + "tube",
    "insta" + "gram",
    "face" + "book",
    "tik" + "tok",
    "twit" + "ter",
    "str" + "ipe",
    "pay" + "pal",
    "open" + "ai",
    "anthro" + "pic",
    "sla" + "ck",
    "twi" + "lio",
    "shop" + "ify",
    "drop" + "box",
    "spot" + "ify",
    "az" + "ure",
    "goo" + "gle",
    "a" + "ws",
  ];
  for (const file of scanned) {
    const lower = file.text.toLowerCase();
    for (const name of realProviderNames) {
      const pattern = new RegExp(`\\b${name}\\b`, "i");
      assert.equal(
        pattern.test(lower),
        false,
        `${file.relative}: real provider name "${name}" must not appear — provider specifics live in DATA, never in code`,
      );
    }
  }
});

test("authority discipline: the FICTIONAL fixture providers appear ONLY in the disclosed data/composition seams", () => {
  const sources = loadSources();
  const fictionalNames = ["aurora", "beacon"];
  for (const file of sources) {
    if (!file.isAuthorityFacing) {
      continue;
    }
    const lower = file.text.toLowerCase();
    for (const name of fictionalNames) {
      assert.equal(
        lower.includes(name),
        false,
        `${file.relative}: fixture provider name "${name}" leaked into an authority-facing surface — provider data belongs in testing/ fixtures and test files only`,
      );
    }
  }
  // And they DO appear in the data seams (the scan is wired correctly).
  const dataSeams = sources.filter((file) => !file.isAuthorityFacing);
  assert.ok(
    dataSeams.some((file) => file.text.toLowerCase().includes("aurora")),
    "expected the fixtures to name the fictional provider",
  );
});

test("authority discipline: the public export surface carries NO provider-name identifier", () => {
  const exportedNames = Object.keys(publicSurface);
  for (const name of exportedNames) {
    assert.match(name, /^[A-Za-z][A-Za-z0-9_]*$/);
    assert.doesNotMatch(
      name,
      /(AURORA|BEACON|YOUTUBE|INSTAGRAM|FACEBOOK|TIKTOK|TWITTER|STRIPE|PAYPAL|OPENAI|ANTHROPIC|SLACK|TWILIO|SHOPIFY|DROPBOX|SPOTIFY|GOOGLE|AWS|AZURE)/,
      `exported identifier "${name}" must be provider-neutral`,
    );
    // Camel-case runtime exports likewise.
    assert.doesNotMatch(
      name,
      /(aurora|beacon|youtube|instagram|facebook|tiktok|twitter|stripe|paypal|openai|anthropic|slack|twilio|shopify|dropbox|spotify|google|aws|azure)/i,
      `exported identifier "${name}" must be provider-neutral`,
    );
  }
  // The exported vocabulary is provider-neutral by construction: kinds are
  // generic categories, transports are generic seams, statuses are states.
  assert.deepEqual([...publicSurface.PROVIDER_KINDS].includes("social-platform"), true);
  assert.deepEqual([...publicSurface.TRANSPORT_KINDS].includes("http-rest"), true);
  assert.deepEqual([...publicSurface.PROVIDER_IMPLEMENTATION_STATUSES].includes("unknown"), true);
});

test("authority discipline: NO NETWORK — no network module import, no global network identifier in code", () => {
  const sources = loadSources();
  const networkModules = [
    "node:http",
    "node:https",
    "node:net",
    "node:tls",
    "node:dns",
    "node:dgram",
    "undici",
    "axios",
    "node-fetch",
    "https:",
    "http:",
  ];
  const networkGlobals = [
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
    /\bWebSocket\b/,
    /\bnet\.connect\b/,
    /\btls\.connect\b/,
    /\bdns\.lookup\b/,
  ];
  for (const file of sources) {
    for (const module of networkModules) {
      assert.equal(
        file.text.includes(`from "${module}"`),
        false,
        `${file.relative}: network module import "${module}" is forbidden — the transport seam is a declared port with a disclosed in-memory double`,
      );
      assert.equal(
        file.text.includes(`import("${module}")`),
        false,
        `${file.relative}: dynamic network import is forbidden`,
      );
    }
    const codeOnly = stripCommentsAndStrings(file.text);
    for (const pattern of networkGlobals) {
      assert.equal(
        pattern.test(codeOnly),
        false,
        `${file.relative}: network identifier ${pattern} is forbidden in code`,
      );
    }
  }
});

test("authority discipline: the transport double is DETERMINISTIC — a pure function of (request, routes)", () => {
  const request: ProviderTransportRequest = {
    requestId: "provider-interaction-determinism" as never,
    scope: { tenantId: "tenant-determinism" as never },
    providerId: "provider:aurora-social" as never,
    implementationId: "provider-implementation:1" as never,
    capabilityId: "transcribe_audio" as never,
    capabilityVersion: 1 as never,
    instanceId: "merchant-client-instance:1" as never,
    credentialRef: "credential-1" as never,
    parameters: { audio: "storage:fixture" },
  };

  // Same double, same routes → bit-for-bit identical responses.
  const routes = {
    "provider:aurora-social": {
      kind: "ok",
      output: { fictional: "payload" },
      warnings: [{ code: "w", message: "m" }],
    },
  } as const;
  const double = createInMemoryProviderTransportDouble({ routes });
  const first = double.send(request);
  const second = double.send(request);
  assert.deepEqual(first, second);

  // A FRESH double with the same routes → identical again (no ambient
  // state, no randomness, no clock).
  const fresh = createInMemoryProviderTransportDouble({ routes });
  assert.deepEqual(fresh.send(request), first);

  // The default (unrouted) echo is deterministic too, and self-labels.
  const unrouted = createInMemoryProviderTransportDouble();
  const echoOne = unrouted.send({ ...request, providerId: "provider:unknown-fictional" as never });
  const echoTwo = unrouted.send({ ...request, providerId: "provider:unknown-fictional" as never });
  assert.deepEqual(echoOne, echoTwo);
  assert.equal(echoOne.ok && echoOne.source, IN_MEMORY_TRANSPORT_SOURCE);

  // Failure routes normalize to transport-failed deterministically.
  const failing = createInMemoryProviderTransportDouble({
    routes: { "provider:aurora-social": { kind: "fail", message: "fictional outage" } },
  });
  const failureOne = failing.send(request);
  const failureTwo = failing.send(request);
  assert.deepEqual(failureOne, failureTwo);
  assert.equal(failureOne.ok ? "" : failureOne.failure.code, "transport-failed");
});

test("authority discipline: every port stays within the ≤12-method budget", () => {
  const stack = composeIntegrationsStack({ now: () => "2026-06-01T00:00:00.000Z" });
  const ports: ReadonlyArray<readonly [string, object]> = [
    ["ProviderDefinitionRegistryPort", stack.definitions],
    ["ProviderImplementationRegistryPort", stack.implementations],
    ["MerchantClientInstanceRegistryPort", stack.instances],
    ["AvailabilityCapabilityRegistryPort", stack.availability],
    ["ProviderInteractionPort", stack.interactions],
    ["ProviderRightsGatePort", stack.rightsGate],
    ["ProviderSecretStorePort", stack.secrets],
    ["ProviderTransportPort", stack.transport],
    ["CapabilityRegistryPort (injected vocabulary)", stack.capabilities],
  ];
  for (const [name, port] of ports) {
    const methods = Object.keys(port).filter((key) => typeof (port as Record<string, unknown>)[key] === "function");
    assert.ok(
      methods.length > 0 && methods.length <= 12,
      `${name}: ${methods.length} public methods (budget 12)`,
    );
  }
});

test("authority discipline: the public-surface runtime export budget (9 functions + 5 constants + 1 error class)", () => {
  const entries = Object.entries(publicSurface);
  const classes = entries.filter(
    ([, value]) => typeof value === "function" && value.prototype instanceof Error,
  );
  const functions = entries.filter(
    ([, value]) => typeof value === "function" && !(value.prototype instanceof Error),
  );
  // Constants: the 4 frozen vocabulary objects + the transport-source label string.
  const constants = entries.filter(
    ([, value]) =>
      (typeof value === "object" && value !== null) ||
      (typeof value === "string" && /^[a-z0-9-]+$/.test(value)),
  );
  assert.equal(functions.length, 9);
  assert.equal(classes.length, 1);
  assert.equal(constants.length, 5);
  // Everything else is type-only (erased at runtime).
  assert.equal(entries.length, 15);
});

test("authority discipline: the composition seam composes REAL vocabulary + REAL rights rule + disclosed doubles (wiring pinned)", () => {
  const registered = registeredAuroraStack({ now: () => "2026-06-01T00:00:00.000Z" });
  const { stack } = registered;

  // The REAL @mos/capabilities registry is the vocabulary (seed catalog).
  assert.ok(stack.capabilities.getLatest("transcribe_audio" as never));
  assert.equal(stack.capabilities.listCapabilityIds().length >= 15, true);

  // The rights gate delegates to the REAL evaluateRights rule — the
  // verdict vocabulary is @mos/rights', never re-implemented (pinned by
  // the fail-closed battery; here: an adequate grant completes).
  const result = stack.interactions.invoke(standardInvokeRequest(registered));
  assert.equal(result.outcome, "completed");

  // The transport is the disclosed double and says so on every record.
  if (result.outcome === "completed") {
    assert.equal(result.record.transportSource, IN_MEMORY_TRANSPORT_SOURCE);
  }
});

test("authority discipline: §3 — external providers are NEVER MOS authorities (the package owns provider INTEGRATION records only)", () => {
  // The exported surface carries provider REGISTRY + INTERACTION
  // vocabulary only: no mission/policy/experiment/production authority
  // vocabulary leaks INTO this package (authority discipline runs both
  // ways — this package is the provider-integrations authority and claims
  // nothing else).
  const exportedNames = Object.keys(publicSurface).map((name) => name.toLowerCase());
  for (const forbidden of ["mission", "experiment", "production", "policy", "workflow", "publisher"]) {
    assert.equal(
      exportedNames.some((name) => name.includes(forbidden)),
      false,
      `exported surface must not carry ${forbidden} semantics`,
    );
  }
  // Commerce truth remains external (§25): no commerce/order/listing
  // authority vocabulary either.
  for (const forbidden of ["commerce", "order", "listing", "inventory"]) {
    assert.equal(
      exportedNames.some((name) => name.includes(forbidden)),
      false,
      `exported surface must not carry ${forbidden} semantics`,
    );
  }
});
