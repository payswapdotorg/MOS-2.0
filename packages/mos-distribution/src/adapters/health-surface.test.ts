/**
 * HEALTH-001 — Platform Health / Distribution Anomaly.
 *
 * Acceptance (spec/mos-effective-backlog-v2.0.md): "observable-only health;
 * provider-confirmed restriction distinguished from
 * suspected_distribution_anomaly; compliant maneuvers only."
 *
 * Pins:
 * - the CONFIRMED-vs-SUSPECTED distinction is TYPED and never conflated:
 *   the closed observation-kind vocabulary is exactly the two; the kind is
 *   queryable; the per-provider summary counts them SEPARATELY; a
 *   suspected anomaly NEVER projects onto the canonical observed-health
 *   record (only the provider-CONFIRMED restriction does — the distinction
 *   holds through the canonical PlatformHealthObservation surface);
 * - provider-confirmed restrictions arrive from the W6-C list-restrictions
 *   surface (a REAL restriction record pulled through the REAL in-memory
 *   adapter stack feeds this surface — shapes line up end-to-end) and are
 *   recorded VERBATIM with the exact restriction-record citation;
 * - suspected anomalies are DERIVED records citing one of the DECLARED,
 *   DOCUMENTED derivation rules with the rule's required inputs — an
 *   undeclared rule or malformed inputs are typed rejections and NOTHING
 *   is recorded (never invented);
 * - the PURE derivation functions return the derivation input on a true
 *   suspicion and `null` on the honest negative;
 * - OBSERVABLE-ONLY discipline (§3): the health surface source carries NO
 *   maneuver vocabulary and the port exposes ONLY the 5 record/query
 *   methods (≤12) — no pause/switch/throttle/remediation surface exists;
 * - the canonical projection satisfies the W0 frozen required-field index
 *   (assertRequiredFields) and carries `maneuvers: []` (no maneuver
 *   applied or declared by this surface);
 * - tenant scoping (§31): observations, logs and summaries are
 *   tenant-scoped; cross-tenant reads are indistinguishable from unknown;
 *   a cross-tenant restriction record is a typed scope-mismatch failure.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { assertRequiredFields } from "@mos/contracts";
import type { AccountRef, ProviderId, TenantScope, Timestamp } from "@mos/contracts";

import { createInMemoryHealthSurface } from "./in-memory-health-surface.js";
import type { InMemoryHealthSurfaceOptions } from "./in-memory-health-surface.js";
import {
  deriveMetricDecline,
  deriveObservationAbsence,
  providerIdOf,
} from "../domain/health-derivations.js";
import {
  HEALTH_DERIVATION_RULES,
  HEALTH_OBSERVATION_KINDS,
  platformHealthProjectionOf,
} from "../contracts/health-record.js";
import type {
  HealthObservation,
  ProviderConfirmedRestrictionObservation,
  SuspectedDistributionAnomalyObservation,
} from "../contracts/health-record.js";
import type { SocialRestrictionRecord } from "../contracts/social-record.js";
import type { HealthSurfacePort } from "../ports/health-surface.port.js";
import type { SocialChannelId, SocialObservationId } from "../contracts/ids.js";
import { registeredAuroraStack } from "../testing/registered-stack.js";
import { ACTOR_ONE, FIXTURE_NOW, SCOPE_ALPHA } from "../testing/fixtures.js";
import * as publicSurface from "../index.js";

const NOW = FIXTURE_NOW;
const SCOPE = SCOPE_ALPHA;
const FOREIGN_SCOPE = { tenantId: "tenant-foreign-health" as TenantScope["tenantId"] } as TenantScope;
const PROVIDER = "provider:aurora-social" as ProviderId;
const CHANNEL = "social-channel-health-1" as SocialChannelId;

/** Deterministic clock/id factory for reproducible records. */
function surface(options: InMemoryHealthSurfaceOptions = {}): HealthSurfacePort {
  let minted = 0;
  return createInMemoryHealthSurface({
    now: () => NOW,
    idFactory: () => `health-observation-${++minted}` as never,
    ...options,
  });
}

/** A well-formed restriction record (the W6-C list-restrictions output shape). */
function restrictionRecord(overrides: Partial<SocialRestrictionRecord> = {}): SocialRestrictionRecord {
  return {
    id: "social-restriction-1" as SocialRestrictionRecord["id"],
    scope: SCOPE,
    channelRef: CHANNEL,
    providerId: PROVIDER,
    observedAt: "2026-06-01T00:00:00.000Z" as Timestamp,
    description: "fictional rate window: 25 posts per 24h",
    recordedAt: "2026-06-01T00:00:01.000Z" as Timestamp,
    source: "in-memory-social-transport-double",
    ...overrides,
  };
}

/** The observation-absence derivation input (declared rule, valid inputs). */
function absenceDerivation() {
  return {
    ruleId: "observation-absence" as const,
    channelRef: CHANNEL,
    windowMs: 3_600_000,
    evaluatedAt: "2026-06-04T00:00:00.000Z" as Timestamp,
    examinedObservationIds: [] as readonly SocialObservationId[],
  };
}

// ---------------------------------------------------------------------------
// The typed confirmed-vs-suspected distinction
// ---------------------------------------------------------------------------

test("health: the observation-kind vocabulary is exactly the two TYPED kinds (never conflated)", () => {
  assert.deepEqual(HEALTH_OBSERVATION_KINDS, ["provider-confirmed-restriction", "suspected-distribution-anomaly"]);
  assert.ok(Object.isFrozen(HEALTH_OBSERVATION_KINDS));
  // Compile-time pins: the union members are distinct types — a confirmed
  // record is NOT assignable to the suspected shape and vice versa.
  const confirmed: ProviderConfirmedRestrictionObservation = {
    kind: "provider-confirmed-restriction",
    id: "health-observation-x" as never,
    scope: SCOPE,
    providerId: PROVIDER,
    channelRef: CHANNEL,
    restrictionRef: "social-restriction-1" as never,
    observedAt: "2026-06-01T00:00:00.000Z" as Timestamp,
    description: "fictional rate window",
    recordedAt: NOW,
    source: "in-memory-social-transport-double",
  };
  const suspected: SuspectedDistributionAnomalyObservation = {
    kind: "suspected-distribution-anomaly",
    id: "health-observation-y" as never,
    scope: SCOPE,
    providerId: PROVIDER,
    channelRef: CHANNEL,
    derivation: { ...absenceDerivation(), documented: HEALTH_DERIVATION_RULES["observation-absence"].documented },
    suspectedAt: "2026-06-04T00:00:00.000Z" as Timestamp,
    recordedAt: NOW,
    source: "health-derivation:observation-absence",
  };
  const union: HealthObservation =
    confirmed.kind === "provider-confirmed-restriction" ? confirmed : suspected;
  assert.ok(union !== undefined);
});

test("health: a provider-CONFIRMED restriction records VERBATIM with the exact citation", () => {
  const health = surface();
  const outcome = health.recordConfirmedRestriction(SCOPE, { restriction: restrictionRecord() });
  assert.ok(outcome.ok, JSON.stringify(outcome));
  if (!outcome.ok) return;
  const observation = outcome.observation;
  assert.equal(observation.kind, "provider-confirmed-restriction");
  assert.ok(Object.isFrozen(observation), "the recorded observation is frozen (immutable)");
  if (observation.kind === "provider-confirmed-restriction") {
    assert.equal(observation.restrictionRef, "social-restriction-1");
    assert.equal(observation.description, "fictional rate window: 25 posts per 24h");
    assert.equal(observation.providerId, PROVIDER);
    assert.equal(observation.channelRef, CHANNEL);
    assert.equal(observation.observedAt, "2026-06-01T00:00:00.000Z");
    // §30: recordedAt (MOS) is distinct from observedAt (platform-reported).
    assert.equal(observation.recordedAt, NOW);
    assert.equal(observation.source, "in-memory-social-transport-double");
    assert.deepEqual(observation.scope, SCOPE);
  }
});

test("health: a REAL restriction record from the W6-C list-restrictions surface feeds this surface end-to-end", () => {
  const registered = registeredAuroraStack({ now: () => NOW });
  const result = registered.stack.adapter.listRestrictions({
    scope: registered.channel.scope,
    channelRef: registered.channel.id,
    actor: ACTOR_ONE,
    rightsContextRef: registered.rightsContextRef,
  });
  assert.equal(result.outcome, "completed");
  if (result.outcome !== "completed") return;
  const restriction = result.output[0];
  assert.ok(restriction, "the aurora fixture stack returned the platform-said restriction");

  const health = surface();
  const outcome = health.recordConfirmedRestriction(registered.channel.scope, { restriction });
  assert.ok(outcome.ok, JSON.stringify(outcome));
  if (!outcome.ok) return;
  const observation = outcome.observation;
  assert.equal(observation.kind, "provider-confirmed-restriction");
  if (observation.kind === "provider-confirmed-restriction") {
    assert.equal(observation.restrictionRef, restriction.id);
    assert.equal(observation.description, restriction.description);
    assert.equal(observation.observedAt, restriction.observedAt);
    assert.equal(observation.providerId, restriction.providerId);
    assert.equal(observation.channelRef, restriction.channelRef);
  }
});

test("health: a SUSPECTED anomaly records ONLY with a DECLARED derivation rule + its required inputs", () => {
  const health = surface();
  const outcome = health.recordSuspectedAnomaly(SCOPE, {
    derivation: absenceDerivation(),
    providerId: PROVIDER,
    source: "health-derivation:observation-absence",
  });
  assert.ok(outcome.ok, JSON.stringify(outcome));
  if (!outcome.ok) return;
  const observation = outcome.observation;
  assert.equal(observation.kind, "suspected-distribution-anomaly");
  assert.ok(Object.isFrozen(observation));
  if (observation.kind === "suspected-distribution-anomaly") {
    // The DECLARED derivation is carried with its DOCUMENTED text verbatim.
    assert.equal(observation.derivation.ruleId, "observation-absence");
    assert.equal(observation.derivation.documented, HEALTH_DERIVATION_RULES["observation-absence"].documented);
    assert.equal(observation.derivation.windowMs, 3_600_000);
    assert.deepEqual(observation.derivation.examinedObservationIds, []);
    assert.equal(observation.channelRef, CHANNEL);
    assert.equal(observation.suspectedAt, "2026-06-04T00:00:00.000Z");
    assert.equal(observation.recordedAt, NOW);
    assert.equal(observation.source, "health-derivation:observation-absence");
  }
});

test("health: an UNDECLARED derivation rule is a typed rejection — nothing recorded (never invented)", () => {
  const health = surface();
  const outcome = health.recordSuspectedAnomaly(SCOPE, {
    derivation: { ruleId: "gut-feeling", channelRef: CHANNEL } as never,
    providerId: PROVIDER,
    source: "some-analyzer",
  });
  assert.ok(!outcome.ok);
  if (!outcome.ok) {
    assert.equal(outcome.failure.kind, "undeclared-derivation-rule");
    if (outcome.failure.kind === "undeclared-derivation-rule") {
      assert.equal(outcome.failure.ruleId, "gut-feeling");
      assert.deepEqual(outcome.failure.declaredRuleIds, ["observation-absence", "metric-decline-window"]);
    }
  }
  assert.equal(health.listHealthObservations(SCOPE).length, 0);
});

test("health: malformed derivation inputs are typed rejections with enumerated reasons — nothing recorded", () => {
  const health = surface();
  // observation-absence with a non-positive window.
  const badWindow = health.recordSuspectedAnomaly(SCOPE, {
    derivation: { ...absenceDerivation(), windowMs: 0 },
    providerId: PROVIDER,
    source: "analyzer",
  });
  assert.ok(!badWindow.ok);
  if (!badWindow.ok) {
    assert.equal(badWindow.failure.kind, "derivation-inputs-invalid");
    if (badWindow.failure.kind === "derivation-inputs-invalid") {
      assert.equal(badWindow.failure.ruleId, "observation-absence");
      assert.ok(badWindow.failure.reasons.some((reason) => reason.includes("windowMs")));
    }
  }
  // metric-decline-window with fewer than the required two observations.
  const shortDecline = health.recordSuspectedAnomaly(SCOPE, {
    derivation: {
      ruleId: "metric-decline-window" as const,
      channelRef: CHANNEL,
      metricKey: "impressions",
      observationIds: ["social-observation-1" as SocialObservationId],
      evaluatedAt: NOW,
    },
    providerId: PROVIDER,
    source: "analyzer",
  });
  assert.ok(!shortDecline.ok);
  if (!shortDecline.ok) {
    assert.equal(shortDecline.failure.kind, "derivation-inputs-invalid");
  }
  assert.equal(health.listHealthObservations(SCOPE).length, 0);
});

test("health: a malformed restriction record is a typed rejection with enumerated reasons", () => {
  const health = surface();
  const outcome = health.recordConfirmedRestriction(SCOPE, {
    restriction: restrictionRecord({ description: "   " }),
  });
  assert.ok(!outcome.ok);
  if (!outcome.ok) {
    assert.equal(outcome.failure.kind, "restriction-malformed");
    if (outcome.failure.kind === "restriction-malformed") {
      assert.ok(outcome.failure.reasons.some((reason) => reason.includes("description")));
    }
  }
  assert.equal(health.listHealthObservations(SCOPE).length, 0);
});

// ---------------------------------------------------------------------------
// The pure derivation functions (documented derivations — never invented)
// ---------------------------------------------------------------------------

test("health: deriveObservationAbsence returns the derivation on absence and null when observations exist", () => {
  const channelObservation = {
    id: "social-observation-1" as SocialObservationId,
    scope: SCOPE,
    channelRef: CHANNEL,
    providerId: PROVIDER,
    subjectRef: "post-1",
    reported: { impressions: 1523 },
    observedAt: "2026-06-04T00:00:00.000Z" as Timestamp,
    recordedAt: NOW,
    providerRefs: [],
    source: "transport",
  };
  // In-window observation exists → NO suspicion (the honest negative).
  const healthy = deriveObservationAbsence({
    channelRef: CHANNEL,
    observations: [channelObservation],
    windowMs: 3_600_000,
    evaluatedAt: "2026-06-04T00:00:30.000Z" as Timestamp,
  });
  assert.equal(healthy, null);
  // No in-window observation for the channel → the derivation input.
  const absent = deriveObservationAbsence({
    channelRef: CHANNEL,
    observations: [{ ...channelObservation, channelRef: "social-channel-other" as SocialChannelId }],
    windowMs: 3_600_000,
    evaluatedAt: "2026-06-04T00:00:30.000Z" as Timestamp,
  });
  assert.ok(absent);
  assert.equal(absent?.ruleId, "observation-absence");
  assert.equal(absent?.channelRef, CHANNEL);
  assert.deepEqual(absent?.examinedObservationIds, []);
  // An out-of-window observation is equally absent.
  const stale = deriveObservationAbsence({
    channelRef: CHANNEL,
    observations: [
      { ...channelObservation, observedAt: "2026-06-01T00:00:00.000Z" as Timestamp },
    ],
    windowMs: 3_600_000,
    evaluatedAt: "2026-06-04T00:00:30.000Z" as Timestamp,
  });
  assert.equal(stale?.ruleId, "observation-absence");
});

test("health: deriveMetricDecline detects a monotonic decline and returns null otherwise", () => {
  const observationAt = (id: string, impressions: number, at: string) => ({
    id: id as SocialObservationId,
    scope: SCOPE,
    channelRef: CHANNEL,
    providerId: PROVIDER,
    subjectRef: "post-1",
    reported: { impressions },
    observedAt: at as Timestamp,
    recordedAt: NOW,
    providerRefs: [],
    source: "transport",
  });
  const declining = [
    observationAt("social-observation-1", 1500, "2026-06-04T00:00:00.000Z"),
    observationAt("social-observation-2", 900, "2026-06-04T00:10:00.000Z"),
    observationAt("social-observation-3", 400, "2026-06-04T00:20:00.000Z"),
  ];
  const suspicion = deriveMetricDecline({
    channelRef: CHANNEL,
    metricKey: "impressions",
    observations: declining,
    evaluatedAt: NOW,
  });
  assert.ok(suspicion);
  assert.equal(suspicion?.ruleId, "metric-decline-window");
  assert.equal(suspicion?.metricKey, "impressions");
  assert.deepEqual(suspicion?.observationIds, [
    "social-observation-1",
    "social-observation-2",
    "social-observation-3",
  ]);
  // A recovery breaks the monotonic decline → NO suspicion.
  const recovering = [
    ...declining.slice(0, 2),
    observationAt("social-observation-3", 1200, "2026-06-04T00:20:00.000Z"),
  ];
  assert.equal(
    deriveMetricDecline({
      channelRef: CHANNEL,
      metricKey: "impressions",
      observations: recovering,
      evaluatedAt: NOW,
    }),
    null,
  );
  // providerIdOf: the single-provider helper.
  assert.equal(providerIdOf(declining), PROVIDER);
  assert.equal(providerIdOf([...declining, { ...declining[0]!, providerId: "provider:other" as ProviderId }]), null);
});

// ---------------------------------------------------------------------------
// Queries: the distinction is queryable; summaries count separately
// ---------------------------------------------------------------------------

test("health: the kind filter queries the TYPED distinction; summaries count confirmed vs suspected SEPARATELY", () => {
  const health = surface();
  const confirmed = health.recordConfirmedRestriction(SCOPE, { restriction: restrictionRecord() });
  const confirmed2 = health.recordConfirmedRestriction(SCOPE, {
    restriction: restrictionRecord({
      id: "social-restriction-2" as SocialRestrictionRecord["id"],
      providerId: "provider:other-fictional" as ProviderId,
    }),
  });
  const suspected = health.recordSuspectedAnomaly(SCOPE, {
    derivation: absenceDerivation(),
    providerId: PROVIDER,
    source: "health-derivation:observation-absence",
  });
  assert.ok(confirmed.ok && confirmed2.ok && suspected.ok);

  const all = health.listHealthObservations(SCOPE);
  assert.equal(all.length, 3, "append-only ascending log");
  assert.deepEqual(
    all.map((observation) => observation.kind),
    [
      "provider-confirmed-restriction",
      "provider-confirmed-restriction",
      "suspected-distribution-anomaly",
    ],
  );
  // The kind filter returns ONLY the requested kind.
  const confirmedOnly = health.listHealthObservations(SCOPE, { kind: "provider-confirmed-restriction" });
  assert.equal(confirmedOnly.length, 2);
  assert.ok(confirmedOnly.every((observation) => observation.kind === "provider-confirmed-restriction"));
  const suspectedOnly = health.listHealthObservations(SCOPE, { kind: "suspected-distribution-anomaly" });
  assert.equal(suspectedOnly.length, 1);
  assert.ok(suspectedOnly.every((observation) => observation.kind === "suspected-distribution-anomaly"));
  // Provider + channel filters compose with the kind filter.
  assert.equal(health.listHealthObservations(SCOPE, { providerId: PROVIDER }).length, 2);
  assert.equal(health.listHealthObservations(SCOPE, { channelRef: CHANNEL }).length, 3);

  // The per-provider summary counts the two kinds SEPARATELY (never one score).
  const summaries = health.summarizeHealth(SCOPE);
  assert.equal(summaries.length, 2);
  const aurora = summaries.find((summary) => summary.providerId === PROVIDER);
  const other = summaries.find((summary) => summary.providerId === "provider:other-fictional");
  assert.ok(aurora && other);
  assert.equal(aurora?.confirmedRestrictionCount, 1);
  assert.equal(aurora?.suspectedAnomalyCount, 1);
  assert.equal(other?.confirmedRestrictionCount, 1);
  assert.equal(other?.suspectedAnomalyCount, 0);
  // Channel-narrowed summary.
  const narrowed = health.summarizeHealth(SCOPE, { channelRef: "social-channel-elsewhere" as SocialChannelId });
  assert.equal(narrowed.length, 0);

  // getHealthObservation resolves by exact id.
  const byId = health.getHealthObservation(SCOPE, confirmed.observation.id);
  assert.equal(byId?.kind, "provider-confirmed-restriction");
  assert.equal(health.getHealthObservation(SCOPE, "health-observation-missing" as never), undefined);
});

// ---------------------------------------------------------------------------
// Observable-only discipline (§3) + the canonical projection
// ---------------------------------------------------------------------------

test("health: observable-only — the port exposes ONLY the 5 record/query methods (≤12, no maneuver surface)", () => {
  const health = surface();
  const methods = Object.keys(health).filter(
    (key) => typeof (health as unknown as Record<string, unknown>)[key] === "function",
  );
  assert.deepEqual(methods.sort(), [
    "getHealthObservation",
    "listHealthObservations",
    "recordConfirmedRestriction",
    "recordSuspectedAnomaly",
    "summarizeHealth",
  ]);
  assert.ok(methods.length <= 12);
  // The exported surface carries the health vocabulary and NO maneuver identifier.
  for (const name of Object.keys(publicSurface)) {
    assert.doesNotMatch(
      name,
      /pause|throttle|switch|remediat|mitigat|resume|blacklist|blocklist|ban|circuit/i,
      `exported identifier "${name}" must carry no maneuver authority`,
    );
  }
});

test("health: observable-only — the health surface SOURCE carries no maneuver vocabulary (§3)", () => {
  // Resolved from the running test's location (dist/adapters → ../../src),
  // so the scan pins what SHIPS in the source tree.
  const SRC_ROOT = fileURLToPath(new URL("../../src/", import.meta.url));
  const healthFiles = [
    join(SRC_ROOT, "contracts/health-record.ts"),
    join(SRC_ROOT, "ports/health-surface.port.ts"),
    join(SRC_ROOT, "adapters/in-memory-health-surface.ts"),
    join(SRC_ROOT, "domain/health-derivations.ts"),
  ];
  // The health surface source files exist (the scan is wired correctly).
  const dirEntries = readdirSync(join(SRC_ROOT, "contracts"));
  assert.ok(dirEntries.includes("health-record.ts"));

  /** Strips comments and string/template contents (code identifiers only). */
  function strip(source: string): string {
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

  for (const file of healthFiles) {
    const code = strip(readFileSync(file, "utf8"));
    for (const forbidden of [
      /\bpause[A-Z]\w*/,
      /\bthrottle\w*/,
      /\bresume[A-Z]\w*/,
      /\bremediat\w*/i,
      /\bmitigat\w*/i,
      /\bcircuitBreaker\b/,
      /\bblacklist\w*/i,
    ]) {
      assert.equal(
        forbidden.test(code),
        false,
        `${file}: health surface code carries maneuver vocabulary ${forbidden}`,
      );
    }
  }
});

test("health: the canonical projection satisfies the frozen PlatformHealthObservation required fields", () => {
  const health = surface();
  const outcome = health.recordConfirmedRestriction(SCOPE, { restriction: restrictionRecord() });
  assert.ok(outcome.ok);
  if (!outcome.ok) return;
  const observation = outcome.observation;
  assert.equal(observation.kind, "provider-confirmed-restriction");
  if (observation.kind !== "provider-confirmed-restriction") return;

  const projection = platformHealthProjectionOf({
    observation,
    accountRef: "external-account:aurora-1" as AccountRef,
  });
  // The W0 frozen required-field index (assertRequiredFields throws naming
  // every missing field).
  assertRequiredFields(projection, "PlatformHealthObservation");
  assert.equal(projection.healthState, "restricted");
  assert.equal(projection.confidence, 1);
  assert.equal(projection.provider, PROVIDER);
  assert.equal(projection.accountRef, "external-account:aurora-1");
  assert.deepEqual(projection.observableSignals, ["provider-confirmed-restriction"]);
  assert.equal(projection.uncertainty.level, "low");
  // OBSERVABLE-ONLY: the projection declares NO maneuver (compliant
  // maneuvers are the owning authorities' decisions, never this surface's).
  assert.deepEqual(projection.maneuvers, []);
  assert.ok(Object.isFrozen(projection));
});

// ---------------------------------------------------------------------------
// Tenant scoping (§31)
// ---------------------------------------------------------------------------

test("health: tenant scoping — observations, logs and summaries are invisible across tenants", () => {
  const health = surface();
  const confirmed = health.recordConfirmedRestriction(SCOPE, { restriction: restrictionRecord() });
  assert.ok(confirmed.ok);
  // Cross-tenant reads are indistinguishable from unknown (§31).
  assert.equal(health.getHealthObservation(FOREIGN_SCOPE, confirmed.observation.id), undefined);
  assert.equal(health.getHealthObservation(FOREIGN_SCOPE, "health-observation-missing" as never), undefined);
  assert.deepEqual(health.listHealthObservations(FOREIGN_SCOPE), []);
  assert.deepEqual(health.summarizeHealth(FOREIGN_SCOPE), []);
  // A foreign tenant CAN record its own observations (independent log).
  const foreignRecord = health.recordConfirmedRestriction(FOREIGN_SCOPE, {
    restriction: restrictionRecord({
      id: "social-restriction-foreign" as SocialRestrictionRecord["id"],
      scope: FOREIGN_SCOPE,
    }),
  });
  assert.ok(foreignRecord.ok);
  assert.equal(health.listHealthObservations(FOREIGN_SCOPE).length, 1);
  assert.equal(health.listHealthObservations(SCOPE).length, 1);
});

test("health: a restriction record from ANOTHER tenant scope is a typed scope-mismatch failure", () => {
  const health = surface();
  const outcome = health.recordConfirmedRestriction(SCOPE, {
    restriction: restrictionRecord({ scope: FOREIGN_SCOPE }),
  });
  assert.ok(!outcome.ok);
  if (!outcome.ok) {
    assert.equal(outcome.failure.kind, "health-scope-mismatch");
  }
  assert.equal(health.listHealthObservations(SCOPE).length, 0);
});
