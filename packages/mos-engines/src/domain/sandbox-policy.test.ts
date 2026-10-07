/**
 * Sandbox policy tests (ENG-003) — the pure enforcement core, plus the
 * STRUCTURAL no-credential-surface pins for the adapter sandbox context.
 *
 * The compile-time pins (Expect/Equal, mirroring @mos/contracts'
 * type-tests.ts pattern) fail `tsc -b`/`tsc --noEmit` the moment anyone
 * adds a field to EngineSandboxContext — in particular any
 * credential-shaped field — because the exact key set is pinned and no
 * key may match the credential vocabulary.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type {
  EngineJob,
  ResourceLimits,
  ResourceUsage,
} from "@mos/contracts";

import type { EngineSandboxContext } from "../ports/engine-runner.port.js";
import {
  effectiveNetworkPolicy,
  invalidResourceLimits,
  manifestPostureViolations,
  quotaDeficitAgainstManifest,
  QUOTA_DIMENSIONS,
  seedPolicyViolation,
  usageQuotaViolations,
} from "./sandbox-policy.js";

// ---------------------------------------------------------------------------
// Compile-time structural pins: the sandbox context has NO credential
// surface (policy runner.databaseCredentials/providerCredentials: none).
// ---------------------------------------------------------------------------

/** Compile-time assertion helper: the expression must resolve to `true`. */
type Expect<T extends true> = T;

/** Strict type equality. */
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;

/** The exact key set of the sandbox context — nothing may be added. */
type _SandboxContextExactKeys = Expect<
  Equal<
    keyof EngineSandboxContext,
    "job" | "network" | "artifacts" | "quotas" | "seed"
  >
>;

/** The credential-shaped key vocabulary (lowercase forms; the exact-key
 * pin above catches ANY new field regardless of name, and the runtime
 * scan in in-memory-engine-runner.test.ts is case-insensitive). */
type CredentialKeyOf<T> = {
  readonly [K in keyof T & string]: K extends
    | `${string}credential${string}`
    | `${string}secret${string}`
    | `${string}token${string}`
    | `${string}password${string}`
    | `${string}apikey${string}`
    | `${string}privatekey${string}`
    ? K
    : never;
}[keyof T & string];

/** True only when NO key of T is credential-shaped. */
type HasNoCredentialSurface<T> = [CredentialKeyOf<T>] extends [never]
  ? true
  : false;

/** No context field may ever be credential-shaped. */
type _SandboxContextHasNoCredentialSurface = Expect<
  HasNoCredentialSurface<EngineSandboxContext>
>;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const LIMITS: ResourceLimits = {
  cpuCores: 2,
  gpuUnits: 1,
  memoryMb: 4096,
  timeoutMs: 60000,
};

const MANIFEST_RESOURCES = { ...LIMITS };

test("QUOTA_DIMENSIONS covers the four ResourceLimits dimensions exactly", () => {
  assert.deepEqual([...QUOTA_DIMENSIONS], [
    "cpuCores",
    "gpuUnits",
    "memoryMb",
    "timeoutMs",
  ]);
});

test("invalidResourceLimits names non-positive and non-finite dimensions", () => {
  assert.deepEqual(
    invalidResourceLimits({ ...LIMITS, cpuCores: 0 }),
    ["cpuCores"],
  );
  assert.deepEqual(
    invalidResourceLimits({ ...LIMITS, memoryMb: -1, timeoutMs: Number.NaN }),
    ["memoryMb", "timeoutMs"],
  );
  assert.deepEqual(
    invalidResourceLimits({ ...LIMITS, gpuUnits: Number.POSITIVE_INFINITY }),
    ["gpuUnits"],
  );
  assert.deepEqual(invalidResourceLimits(LIMITS), []);
});

test("quotaDeficitAgainstManifest names dimensions the job under-grants", () => {
  assert.deepEqual(
    quotaDeficitAgainstManifest(
      { ...LIMITS, memoryMb: 2048 },
      { ...MANIFEST_RESOURCES, memoryMb: 4096 },
    ),
    ["memoryMb"],
  );
  // Granting MORE than the engine requires is allowed (never a deficit).
  assert.deepEqual(
    quotaDeficitAgainstManifest(
      { ...LIMITS, cpuCores: 8 },
      MANIFEST_RESOURCES,
    ),
    [],
  );
  assert.deepEqual(
    quotaDeficitAgainstManifest(LIMITS, MANIFEST_RESOURCES),
    [],
  );
});

test("seed policy: deterministic engines require seeds; others reject them", () => {
  const deterministicJob: Pick<EngineJob, "seed"> = { seed: null };
  assert.equal(
    seedPolicyViolation({ deterministic: true }, deterministicJob),
    "seed-required",
  );
  assert.equal(
    seedPolicyViolation({ deterministic: true }, { seed: 42 }),
    null,
  );
  assert.equal(
    seedPolicyViolation({ deterministic: false }, { seed: 42 }),
    "seed-not-supported",
  );
  assert.equal(
    seedPolicyViolation({ deterministic: false }, { seed: null }),
    null,
  );
});

test("effective network policy: denied unless manifest AND grant align", () => {
  const security = (networkAccess: "denied" | "explicitly-granted") => ({
    sandboxed: true,
    networkAccess,
    filesystemScope: "scoped-artifacts-only" as const,
    databaseCredentials: "none" as const,
    providerCredentials: "none" as const,
  });
  const grantedManifest = { security: security("explicitly-granted") };
  const deniedManifest = { security: security("denied") };

  // Default: denied, whatever the manifest says, without an explicit grant.
  assert.deepEqual(effectiveNetworkPolicy(deniedManifest, undefined), {
    access: "denied",
  });
  assert.deepEqual(effectiveNetworkPolicy(grantedManifest, undefined), {
    access: "denied",
  });
  // A grant alone does not help a denied manifest.
  assert.deepEqual(
    effectiveNetworkPolicy(deniedManifest, {
      networkGrant: { allowedHosts: ["weights.example"] },
    }),
    { access: "denied" },
  );
  // An empty host grant stays denied (fail-closed conjunction).
  assert.deepEqual(
    effectiveNetworkPolicy(grantedManifest, {
      networkGrant: { allowedHosts: [] },
    }),
    { access: "denied" },
  );
  // Manifest + non-empty grant → explicitly granted with the host list.
  assert.deepEqual(
    effectiveNetworkPolicy(grantedManifest, {
      networkGrant: { allowedHosts: ["weights.example"] },
    }),
    { access: "explicitly-granted", allowedHosts: ["weights.example"] },
  );
});

test("manifest posture violations mirror the activation forbidden list", () => {
  const security = (overrides: {
    sandboxed?: boolean;
    databaseCredentials?: "none" | "injected";
    providerCredentials?: "none" | "injected";
  }) => ({
    sandboxed: true,
    networkAccess: "denied" as const,
    filesystemScope: "scoped-artifacts-only" as const,
    databaseCredentials: "none" as const,
    providerCredentials: "none" as const,
    ...overrides,
  });
  assert.deepEqual(manifestPostureViolations({ security: security({}) }), []);
  assert.deepEqual(
    manifestPostureViolations({ security: security({ sandboxed: false }) }),
    ["engine-not-sandboxed"],
  );
  assert.deepEqual(
    manifestPostureViolations({
      security: security({ databaseCredentials: "injected" }),
    }),
    ["database-credentials-forbidden"],
  );
  assert.deepEqual(
    manifestPostureViolations({
      security: security({
        sandboxed: false,
        databaseCredentials: "injected",
        providerCredentials: "injected",
      }),
    }),
    [
      "engine-not-sandboxed",
      "database-credentials-forbidden",
      "provider-credentials-forbidden",
    ],
  );
});

test("usage quota violations: reported usage must fit the granted window", () => {
  const usage: ResourceUsage = {
    cpuCoreSeconds: 1,
    gpuUnitSeconds: 0,
    memoryMbSeconds: 4096,
  };
  // 1 cpu-second over a 1s window with 2 granted cores: fine.
  assert.deepEqual(usageQuotaViolations(usage, LIMITS, 1000), []);
  // 4096 MB·s over 1s with 4096 MB granted: exactly at the limit: fine.
  assert.deepEqual(usageQuotaViolations(usage, LIMITS, 1000), []);
  // 3 cpu-seconds with 2 granted cores over 1s: violation, named.
  assert.deepEqual(
    usageQuotaViolations({ ...usage, cpuCoreSeconds: 3 }, LIMITS, 1000),
    ["cpuCoreSeconds"],
  );
  // A longer window legitimately allows more core-seconds.
  assert.deepEqual(
    usageQuotaViolations({ ...usage, cpuCoreSeconds: 3 }, LIMITS, 2000),
    [],
  );
  // Memory and gpu dimensions are named too.
  assert.deepEqual(
    usageQuotaViolations(
      { cpuCoreSeconds: 0, gpuUnitSeconds: 2, memoryMbSeconds: 0 },
      LIMITS,
      1000,
    ),
    ["gpuUnitSeconds"],
  );
  assert.deepEqual(
    usageQuotaViolations(
      { cpuCoreSeconds: 0, gpuUnitSeconds: 0, memoryMbSeconds: 8192 },
      LIMITS,
      1000,
    ),
    ["memoryMbSeconds"],
  );
  // Zero wall-clock collapses the window to zero.
  assert.deepEqual(
    usageQuotaViolations({ cpuCoreSeconds: 0.001, gpuUnitSeconds: 0, memoryMbSeconds: 0 }, LIMITS, 0),
    ["cpuCoreSeconds"],
  );
});
