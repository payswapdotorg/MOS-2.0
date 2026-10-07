/**
 * SOCIAL-001: SocialObservation records are AUTHORITATIVE
 * what-the-platform-said records — never invented. Pins:
 * - the recorded metrics are the platform's reported payload VERBATIM
 *   (deep-equal to the transport route data — never adjusted, rounded or
 *   inferred);
 * - `observedAt` is the PLATFORM's timestamp; `recordedAt` is MOS's —
 *   distinct fields, distinct semantics;
 * - every observation is source-attributed (the transport source label +
 *   the platform's own refs) so a disclosed double can never masquerade
 *   as live platform evidence;
 * - an absent observations list = the platform said NOTHING (zero
 *   records, never fabricated defaults);
 * - a malformed platform entry fails the whole invocation and NOTHING is
 *   appended (fail-closed: platform data is never silently dropped);
 * - observation logs are tenant-scoped and append-only;
 * - OBSERVATION PURITY: the observation vocabulary carries no
 *   attribution/causality semantics (ATTRIB-001's later domain) —
 *   structural pin + exported-vocabulary scan.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { IN_MEMORY_SOCIAL_TRANSPORT_SOURCE } from "../adapters/in-memory-social-transport.js";
import { registeredAuroraStack } from "../testing/registered-stack.js";
import { createCountingTransport } from "../testing/counting-transport.js";
import {
  AURORA_TRANSPORT_OUTPUT,
  ACTOR_ONE,
  FIXTURE_NOW,
} from "../testing/fixtures.js";
import type { SocialObservationRecord } from "../contracts/social-record.js";
import * as publicSurface from "../index.js";

const now = () => FIXTURE_NOW;

function readObservations(registered: ReturnType<typeof registeredAuroraStack>, subjectRef?: string) {
  return registered.stack.adapter.readObservations({
    scope: registered.channel.scope,
    channelRef: registered.channel.id,
    actor: ACTOR_ONE,
    rightsContextRef: registered.rightsContextRef,
    ...(subjectRef !== undefined ? { subjectRef } : {}),
  });
}

test("observations platform-said: the recorded metrics are the platform's payload VERBATIM", () => {
  const registered = registeredAuroraStack({ now });
  const result = readObservations(registered, "aurora-post:fixture-1");

  assert.equal(result.outcome, "completed");
  if (result.outcome === "completed") {
    assert.equal(result.output.length, 1);
    const observation = result.output[0] as SocialObservationRecord;
    // EXACTLY what the (fictional) platform said — deep-equal, never
    // adjusted/rounded/inferred.
    assert.deepEqual(
      observation.reported,
      AURORA_TRANSPORT_OUTPUT.observations[0]?.reported,
    );
    assert.equal(observation.subjectRef, AURORA_TRANSPORT_OUTPUT.observations[0]?.subjectRef);
    assert.deepEqual(
      observation.providerRefs,
      AURORA_TRANSPORT_OUTPUT.observations[0]?.providerRefs,
    );
  }
});

test("observations platform-said: observedAt is the PLATFORM's timestamp; recordedAt is MOS's", () => {
  const registered = registeredAuroraStack({ now });
  const result = readObservations(registered);

  assert.equal(result.outcome, "completed");
  if (result.outcome === "completed") {
    const observation = result.output[0] as SocialObservationRecord;
    // The platform said the measurement covers 2026-06-04; MOS recorded
    // it at the fixed clock 2026-06-01 (fixture fiction) — two distinct
    // fields with distinct semantics, never conflated.
    assert.equal(observation.observedAt, "2026-06-04T00:00:00.000Z");
    assert.equal(observation.recordedAt, FIXTURE_NOW);
    assert.notEqual(observation.observedAt, observation.recordedAt);
  }
});

test("observations platform-said: every observation is source-attributed (the double self-labels)", () => {
  const registered = registeredAuroraStack({ now });
  const result = readObservations(registered);

  assert.equal(result.outcome, "completed");
  if (result.outcome === "completed") {
    const observation = result.output[0] as SocialObservationRecord;
    assert.equal(observation.source, IN_MEMORY_SOCIAL_TRANSPORT_SOURCE);
    assert.equal(observation.providerId, registered.channel.providerId);
    assert.deepEqual(observation.providerRefs, ["aurora-insight:fixture-1"]);
    // The §30 record of the reading attempt names the same source.
    assert.equal(result.record.transportSource, IN_MEMORY_SOCIAL_TRANSPORT_SOURCE);
  }
});

test("observations platform-said: an ABSENT observations list = the platform said nothing (never invented)", () => {
  const counting = createCountingTransport({
    send: () => ({ ok: true, output: { note: "platform answered with no metrics" }, warnings: [], source: "empty-platform" }),
  });
  const registered = registeredAuroraStack({ now, transport: counting });

  const result = readObservations(registered);
  assert.equal(result.outcome, "completed");
  if (result.outcome === "completed") {
    assert.equal(result.output.length, 0);
    assert.equal(registered.stack.adapter.listObservations(registered.channel.scope.tenantId).length, 0);
  }
});

test("observations platform-said: a MALFORMED platform entry fails the whole invocation and nothing is appended", () => {
  const counting = createCountingTransport({
    send: () => ({
      ok: true,
      output: {
        observations: [
          { subjectRef: "aurora-post:fixture-1", reported: { impressions: 10 }, observedAt: "2026-06-04T00:00:00.000Z" },
          // A malformed second entry: no observedAt.
          { subjectRef: "aurora-post:fixture-2", reported: { impressions: 20 } },
        ],
      },
      warnings: [],
      source: "malformed-platform",
    }),
  });
  const registered = registeredAuroraStack({ now, transport: counting });

  const result = readObservations(registered);
  assert.equal(result.outcome, "failed");
  if (result.outcome === "failed") {
    assert.equal(result.failure.code, "invalid-platform-response");
    // Fail-closed: NOT EVEN the valid-looking first entry is recorded —
    // platform data is never partially salvaged.
    assert.equal(registered.stack.adapter.listObservations(registered.channel.scope.tenantId).length, 0);
  }
});

test("observations platform-said: the log is APPEND-ONLY — repeated reads accumulate immutable records", () => {
  const registered = registeredAuroraStack({ now });
  readObservations(registered);
  readObservations(registered);

  const listed = registered.stack.adapter.listObservations(registered.channel.scope.tenantId);
  assert.equal(listed.length, 2);
  assert.notEqual(listed[0]?.id, listed[1]?.id);
  // Both are frozen and carry the same platform-said payload.
  assert.throws(() => {
    (listed[0] as unknown as { reported: unknown }).reported = { impressions: 999999 };
  });
  assert.deepEqual(listed[0]?.reported, listed[1]?.reported);
});

test("observations platform-said: OBSERVATION PURITY — no causal/attribution vocabulary (ATTRIB-001 is later)", () => {
  // (a) Structural: the observation record has EXACTLY the platform-said
  //     keyset — there is no field through which a causal claim could
  //     even be expressed (compile-time twin in contracts/type-pins.ts).
  const observation: SocialObservationRecord = {
    id: "social-observation-purity" as never,
    scope: { tenantId: "tenant-purity" as never },
    channelRef: "social-channel-purity" as never,
    providerId: "provider:fixture" as never,
    subjectRef: "post:fixture",
    reported: { impressions: 1 },
    observedAt: "2026-06-04T00:00:00.000Z" as never,
    recordedAt: "2026-06-05T00:00:00.000Z" as never,
    providerRefs: ["insight:fixture"],
    source: "purity-test",
  };
  assert.deepEqual(Object.keys(observation).sort(), [
    "channelRef",
    "id",
    "observedAt",
    "providerId",
    "providerRefs",
    "recordedAt",
    "reported",
    "scope",
    "source",
    "subjectRef",
  ]);

  // (b) Exported-surface scan: no attribution/causality/conversion
  //     semantics in the public vocabulary.
  for (const name of Object.keys(publicSurface)) {
    const lower = name.toLowerCase();
    for (const forbidden of ["attribut", "causal", "causality", "conversion", "convert"]) {
      assert.equal(
        lower.includes(forbidden),
        false,
        `exported identifier "${name}" must not carry ${forbidden} semantics — attribution/causality is ATTRIB-001's later domain`,
      );
    }
  }

  // (c) Source-tree scan: the OBSERVATION record contract mentions no
  //     causal vocabulary in its field surface.
  const SRC_ROOT = fileURLToPath(new URL("../../src/", import.meta.url));
  const contractText = readFileSync(join(SRC_ROOT, "contracts/social-record.ts"), "utf8");
  for (const forbidden of ["attributedTo", "causedBy", "convertedFrom", "conversionRef"]) {
    assert.equal(contractText.includes(forbidden), false);
  }
  // The scan wiring is real: the file exists and names its records.
  assert.ok(contractText.includes("SocialObservationRecord"));
  // (And the sources directory is populated.)
  assert.ok(readdirSync(SRC_ROOT).length > 0);
});

test("observations platform-said: reading a SUBJECT the platform did not report yields only what was said", () => {
  const counting = createCountingTransport({
    send: () => ({
      ok: true,
      output: {
        observations: [
          {
            subjectRef: "aurora-post:fixture-1",
            reported: { impressions: 5 },
            observedAt: "2026-06-04T00:00:00.000Z",
            providerRefs: [],
          },
        ],
      },
      warnings: [],
      source: "subject-filter-test",
    }),
  });
  const registered = registeredAuroraStack({ now, transport: counting });

  // The caller asked about fixture-1; the platform reported fixture-1.
  const result = readObservations(registered, "aurora-post:fixture-1");
  assert.equal(result.outcome, "completed");
  if (result.outcome === "completed") {
    assert.equal(result.output.length, 1);
    // The filter on the log is by the PLATFORM's subject, never invented.
    assert.equal(
      registered.stack.adapter.listObservations(registered.channel.scope.tenantId, {
        subjectRef: "aurora-post:fixture-9",
      }).length,
      0,
    );
    assert.equal(
      registered.stack.adapter.listObservations(registered.channel.scope.tenantId, {
        subjectRef: "aurora-post:fixture-1",
      }).length,
      1,
    );
  }
});
