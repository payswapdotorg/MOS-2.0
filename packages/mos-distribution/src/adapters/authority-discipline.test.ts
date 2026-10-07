/**
 * AUTHORITY DISCIPLINE (SOCIAL-001 / §3, extended per provider in W7-C —
 * SOCIAL-002..006): social platforms are NEVER MOS authorities — MOS
 * records what platforms report, never invents it; the distribution
 * authority exposes PROVIDER-NEUTRAL contracts only and provider
 * specifics live in DATA, not code. Structural pins:
 * - the FIVE real provider names (W7-C adapter subtrees) appear ONLY
 *   inside their own `src/adapters/providers/<provider>/` subtree — never
 *   in the shared authority-facing surfaces (contracts/, ports/, shared
 *   adapters, errors, index) and never in another provider's subtree
 *   (cross-subtree isolation); each subtree names ONLY its own platform;
 * - every OTHER real vendor name is forbidden EVERYWHERE in the package
 *   source (not even in test data — fixtures use fictional providers:
 *   aurora-social / cinder-social / dune-social);
 * - the FICTIONAL fixture provider names appear ONLY in the disclosed
 *   data/composition seams (testing/**, *.test.ts) — never in the
 *   authority-facing surfaces (contracts/, ports/, adapters/ runtime,
 *   errors, index);
 * - NO network capability: no network module import and no global network
 *   identifier in comment/string-stripped code (the transport seam is a
 *   declared port; the shipped adapter is a disclosed deterministic
 *   in-memory double);
 * - transport determinism: the double is a pure function of
 *   (request, routes) — bit-for-bit reproducible;
 * - port method budgets ≤ 12 and the runtime export budget of the public
 *   surface (the documented 14 functions + 10 constants + 1 error class —
 *   W8-C added the HEALTH-001 surface exports);
 * - the package claims the social-distribution authority ONLY: no other
 *   authority's vocabulary leaks into the exported surface.
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

import { registeredAuroraStack } from "../testing/registered-stack.js";
import { standardPublishRequest } from "../testing/registered-stack.js";
import {
  createInMemorySocialTransportDouble,
  IN_MEMORY_SOCIAL_TRANSPORT_SOURCE,
} from "./in-memory-social-transport.js";
import type { SocialTransportRequest } from "../ports/social-transport.port.js";
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

test("authority discipline: the FIVE real provider names appear ONLY inside their own adapter subtrees (W7-C)", () => {
  const sources = loadSources();
  assert.ok(sources.length >= 40, `expected the full source tree, found ${sources.length}`);
  // NOTE: this test file itself is EXCLUDED — the discipline's tokens are
  // named here to forbid them elsewhere; every OTHER file (authority-
  // facing, data seam, and test) is scanned.
  const scanned = sources.filter(
    (file) => !file.relative.endsWith("adapters/authority-discipline.test.ts"),
  );
  // The five W7-C adapter subtrees and the token that names each platform.
  // Each provider's own name lives as DATA inside its subtree — provider
  // composition happens there; every OTHER file must stay token-free.
  const subtrees: ReadonlyArray<{ readonly subtree: string; readonly token: string }> = [
    { subtree: "adapters/providers/youtube", token: "you" + "tube" },
    { subtree: "adapters/providers/instagram", token: "insta" + "gram" },
    { subtree: "adapters/providers/facebook-pages", token: "face" + "book" },
    { subtree: "adapters/providers/tiktok", token: "tik" + "tok" },
    { subtree: "adapters/providers/x", token: "provi" + "der:x" },
  ];
  for (const file of scanned) {
    const lower = file.text.toLowerCase();
    for (const { subtree, token } of subtrees) {
      const ownSubtree = file.relative.startsWith(`${subtree}/`);
      if (ownSubtree) {
        // A provider's own token belongs in its own subtree.
        continue;
      }
      const appears = token.includes(":")
        ? lower.includes(token)
        : new RegExp(`\\b${token}\\b`, "i").test(lower);
      assert.equal(
        appears,
        false,
        `${file.relative}: provider token "${token}" must not appear outside its adapter subtree — provider specifics never leak into authority-facing surfaces`,
      );
    }
  }
  // The scan is wired: every subtree exists, carries sources, and names
  // its own platform (self-containment — the profiles are subtree DATA).
  for (const { subtree, token } of subtrees) {
    const subtreeFiles = scanned.filter((file) => file.relative.startsWith(`${subtree}/`));
    assert.ok(subtreeFiles.length >= 4, `expected the ${subtree} subtree sources`);
    assert.ok(
      subtreeFiles.some((file) => file.text.toLowerCase().includes(token)),
      `expected the ${subtree} subtree to name its own platform (scan wiring)`,
    );
  }
});

test("authority discipline: no provider subtree carries ANOTHER provider's token (cross-subtree isolation)", () => {
  const sources = loadSources();
  const subtrees: ReadonlyArray<{ readonly subtree: string; readonly token: string }> = [
    { subtree: "adapters/providers/youtube", token: "you" + "tube" },
    { subtree: "adapters/providers/instagram", token: "insta" + "gram" },
    { subtree: "adapters/providers/facebook-pages", token: "face" + "book" },
    { subtree: "adapters/providers/tiktok", token: "tik" + "tok" },
    { subtree: "adapters/providers/x", token: "provi" + "der:x" },
  ];
  for (const { subtree } of subtrees) {
    const subtreeFiles = sources.filter((file) => file.relative.startsWith(`${subtree}/`));
    assert.ok(subtreeFiles.length >= 4, `expected the ${subtree} subtree sources`);
    for (const file of subtreeFiles) {
      const lower = file.text.toLowerCase();
      const foreign = subtrees.filter(
        (other) => other.subtree !== subtree && lower.includes(other.token),
      );
      assert.equal(
        foreign.length,
        0,
        `${file.relative}: carries another provider's token (${foreign.map((entry) => entry.subtree).join(", ")}) — provider subtrees are isolated`,
      );
    }
  }
});

test("authority discipline: no OTHER real vendor name appears anywhere in the package source", () => {
  const sources = loadSources();
  // Vendors OTHER than the five adapter-subtree platforms are forbidden
  // EVERYWHERE — including inside the provider subtrees: each subtree may
  // name ONLY its own platform (operator/vendor names included).
  const scanned = sources.filter(
    (file) => !file.relative.endsWith("adapters/authority-discipline.test.ts"),
  );
  const realVendorNames = [
    "twit" + "ter",
    "x" + ".com",
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
    for (const name of realVendorNames) {
      const pattern = new RegExp(`\\b${name}\\b`, "i");
      assert.equal(
        pattern.test(lower),
        false,
        `${file.relative}: real vendor name "${name}" must not appear — provider specifics live in DATA, never in code`,
      );
    }
  }
});

test("authority discipline: the FICTIONAL fixture providers appear ONLY in the disclosed data/composition seams", () => {
  const sources = loadSources();
  const fictionalNames = ["aurora", "cinder", "dune"];
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
      /(AURORA|CINDER|DUNE|YOUTUBE|INSTAGRAM|FACEBOOK|TIKTOK|TWITTER|STRIPE|PAYPAL|OPENAI|ANTHROPIC|SLACK|TWILIO|SHOPIFY|DROPBOX|SPOTIFY|GOOGLE|AWS|AZURE)/,
      `exported identifier "${name}" must be provider-neutral`,
    );
    // Camel-case runtime exports likewise.
    assert.doesNotMatch(
      name,
      /(aurora|cinder|dune|youtube|instagram|facebook|tiktok|twitter|stripe|paypal|openai|anthropic|slack|twilio|shopify|dropbox|spotify|google|aws|azure)/i,
      `exported identifier "${name}" must be provider-neutral`,
    );
  }
  // The exported vocabulary is provider-neutral by construction: the
  // operations are generic interaction categories and the support levels
  // are the INTEG-001 vocabulary with `unknown` preserved first-class.
  assert.ok([...publicSurface.SOCIAL_OPERATIONS].includes("read-observations"));
  assert.ok([...publicSurface.SOCIAL_PRESENTATION_KINDS].includes("artifact-with-caption"));
  assert.deepEqual(publicSurface.SOCIAL_OPERATION_RIGHTS_ACTIONS.publish, "distribute");
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
  const request: SocialTransportRequest = {
    requestId: "social-distribution-determinism" as never,
    scope: { tenantId: "tenant-determinism" as never },
    providerId: "provider:aurora-social" as never,
    channelRef: "social-channel-determinism" as never,
    instanceRef: "merchant-client-instance-determinism" as never,
    operation: "publish",
    parameters: { artifact: { artifactId: "artifact-determinism" } },
  };

  // Same double, same routes → bit-for-bit identical responses.
  const routes = {
    "provider:aurora-social": {
      kind: "ok",
      output: { postRef: "fictional-post:1", publishedAt: "2026-06-01T00:00:05.000Z" },
      warnings: [{ code: "w", message: "m" }],
    },
  } as const;
  const double = createInMemorySocialTransportDouble({ routes });
  const first = double.send(request);
  const second = double.send(request);
  assert.deepEqual(first, second);

  // A FRESH double with the same routes → identical again (no ambient
  // state, no randomness, no clock).
  const fresh = createInMemorySocialTransportDouble({ routes });
  assert.deepEqual(fresh.send(request), first);

  // The default (unrouted) echo is deterministic too, and self-labels.
  const unrouted = createInMemorySocialTransportDouble();
  const echoOne = unrouted.send({ ...request, providerId: "provider:unknown-fictional" as never });
  const echoTwo = unrouted.send({ ...request, providerId: "provider:unknown-fictional" as never });
  assert.deepEqual(echoOne, echoTwo);
  assert.equal(echoOne.ok && echoOne.source, IN_MEMORY_SOCIAL_TRANSPORT_SOURCE);

  // Failure routes normalize to transport-failed deterministically.
  const failing = createInMemorySocialTransportDouble({
    routes: { "provider:aurora-social": { kind: "fail", message: "fictional outage" } },
  });
  const failureOne = failing.send(request);
  const failureTwo = failing.send(request);
  assert.deepEqual(failureOne, failureTwo);
  assert.equal(failureOne.ok ? "" : failureOne.failure.code, "transport-failed");
});

test("authority discipline: every port stays within the ≤12-method budget", () => {
  const registered = registeredAuroraStack({ now: () => "2026-06-01T00:00:00.000Z" });
  const { stack } = registered;
  const ports: ReadonlyArray<readonly [string, object]> = [
    ["SocialAdapterPort", stack.adapter],
    ["SocialChannelRegistryPort", stack.channels],
    ["SocialRightsGatePort", stack.rightsGate],
    ["SocialPolicyGatePort", stack.policyGate],
    ["SocialTransportPort", stack.transport],
    [
      "MerchantClientInstanceRegistryPort (injected integrations binding)",
      stack.integrations.instances,
    ],
  ];
  for (const [name, port] of ports) {
    const methods = Object.keys(port).filter((key) => typeof (port as Record<string, unknown>)[key] === "function");
    assert.ok(
      methods.length > 0 && methods.length <= 12,
      `${name}: ${methods.length} public methods (budget 12)`,
    );
  }
});

test("authority discipline: the public-surface runtime export budget (14 functions + 10 constants + 1 error class)", () => {
  const entries = Object.entries(publicSurface);
  const classes = entries.filter(
    ([, value]) => typeof value === "function" && value.prototype instanceof Error,
  );
  const functions = entries.filter(
    ([, value]) => typeof value === "function" && !(value.prototype instanceof Error),
  );
  // Constants: the 7 frozen social vocabulary objects (operations,
  // presentation kinds, rights-action mapping, operation shapes, artifact
  // type families, auth flow kinds, rate-limit postures) + the
  // transport-source label string (W7-C added the provider-profile/
  // rate-limit vocabularies) + the 2 HEALTH-001 vocabularies (the closed
  // observation-kind list + the DECLARED derivation-rule documentation
  // record — W8-C).
  const constants = entries.filter(
    ([, value]) =>
      (typeof value === "object" && value !== null) ||
      (typeof value === "string" && /^[a-z0-9-]+$/.test(value)),
  );
  assert.equal(functions.length, 14);
  assert.equal(classes.length, 1);
  assert.equal(constants.length, 10);
  // Everything else is type-only (erased at runtime).
  assert.equal(entries.length, 25);
});

test("authority discipline: the composition seam composes REAL integrations + the REAL rights rule + disclosed doubles (wiring pinned)", () => {
  const registered = registeredAuroraStack({ now: () => "2026-06-01T00:00:00.000Z" });
  const { stack } = registered;

  // The REAL @mos/integrations four-layer binding is the channel's
  // instanceRef resolution authority (registry-allowed real import).
  assert.ok(stack.integrations.instances.getLatest(registered.channel.scope.tenantId, registered.instance.id));
  assert.equal(registered.instance.credentialRef !== undefined, true);

  // The rights gate delegates to the REAL evaluateRights rule — the
  // verdict vocabulary is @mos/rights', never re-implemented (pinned by
  // the fail-closed battery; here: an adequate grant completes).
  const result = stack.adapter.publish(standardPublishRequest(registered));
  assert.equal(result.outcome, "completed");

  // The transport is the disclosed double and says so on every record.
  if (result.outcome === "completed") {
    assert.equal(result.record.transportSource, IN_MEMORY_SOCIAL_TRANSPORT_SOURCE);
    assert.equal(result.output.source, IN_MEMORY_SOCIAL_TRANSPORT_SOURCE);
  }
});

test("authority discipline: §3 — social platforms are NEVER MOS authorities (the package owns distribution RECORDS only)", () => {
  // The exported surface carries social DISTRIBUTION vocabulary only: no
  // other authority's semantics leaks INTO this package (authority
  // discipline runs both ways — this package is the social-distribution
  // authority and claims nothing else; "policy" appears only as the
  // DECLARED gate seam's frozen contract shape, never as an authority).
  const exportedNames = Object.keys(publicSurface).map((name) => name.toLowerCase());
  for (const forbidden of ["mission", "experiment", "lab", "studio", "workflow", "engine"]) {
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
  // And no task/job/notification plane duplication (the durable-jobs
  // authority owns that; distribution never becomes a scheduler engine —
  // schedules are platform-confirmed RECORDS).
  for (const forbidden of ["task", "job", "notify", "queue"]) {
    assert.equal(
      exportedNames.some((name) => name.includes(forbidden)),
      false,
      `exported surface must not carry ${forbidden} semantics`,
    );
  }
});
