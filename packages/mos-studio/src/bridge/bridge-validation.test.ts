/**
 * BRIDGE-001 fail-closed intake validation battery (bridge-validation.ts).
 *
 * Pins the W8-A caller-error discipline (nothing attributable happened →
 * nothing is recorded) over a REAL LAB-016 search result: malformed,
 * unversioned, unprovenance'd and caller-fabricated candidate shapes fail
 * CLOSED TYPED before any authority consultation. Every hostile-shape probe
 * reuses the REAL result's own objects mutated in place (the honest shape is
 * always verified first — the anti-over-strictness discipline).
 *
 * Probe classes: the W9-B hostile-id factory (non-string tenant ids, coerced
 * objects), D5 NaN/±Infinity/negative numerics, the W10-F3 pure-data class
 * (cyclic acceptance criteria), rank/version/provenance pins, tenant and
 * citation cross-checks.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { validateLabToStudioEntry } from "./bridge-validation.js";
import type { ValidatedLabToStudioEntry } from "./bridge-validation.js";
import {
  BRIDGE_SCOPE,
  BRIDGE_TENANT,
  bridgeEntryRequestOf,
  firstStudioCandidateOf,
  runBridgeSearch,
} from "../testing/bridge-fixtures.js";
import type { LabToStudioEntryRequest } from "./contracts/lab-to-studio-entry.js";
import type { RankedCandidateProgram } from "@mos/production";
import type { TenantScope } from "@mos/contracts";

/** The REAL fixture result + its first studio candidate (module-scoped). */
let realResult: Awaited<ReturnType<typeof runBridgeSearch>>;
let realCandidate: RankedCandidateProgram;

test("BRIDGE validation setup: the REAL fixture search produces an enterable candidate", async () => {
  realResult = await runBridgeSearch();
  realCandidate = firstStudioCandidateOf(realResult);
  assert.equal(realCandidate.candidate.modality, "studio");
  assert.ok(realCandidate.candidate.organization !== null);
});

/** The honest request (must ALWAYS validate — pinned first, every file). */
function honestRequest(): LabToStudioEntryRequest {
  assert.ok(realResult !== undefined, "setup must run first");
  return bridgeEntryRequestOf(realResult, realCandidate);
}

/** Validate + assert ok, returning the projection. */
function mustValidate(request: LabToStudioEntryRequest): ValidatedLabToStudioEntry {
  const outcome = validateLabToStudioEntry(request);
  if (!outcome.ok) {
    assert.fail(`honest request failed validation: ${outcome.failure.kind} — ${outcome.failure.reason}`);
  }
  return outcome.value;
}

/** Validate + assert the typed failure kind (and nothing recorded). */
function mustFailWith(request: LabToStudioEntryRequest, kind: string): void {
  const outcome = validateLabToStudioEntry(request);
  assert.ok(!outcome.ok, `expected a typed failure (${kind}), got ok`);
  assert.equal(outcome.failure.kind, kind);
}

// ---------------------------------------------------------------------------
// The honest path (anti-over-strictness: the REAL shape validates)
// ---------------------------------------------------------------------------

test("the honest REAL candidate validates: citation pinned from the search's own data", () => {
  const value = mustValidate(honestRequest());
  assert.equal(value.request.id, realCandidate.request.id);
  assert.equal(value.studioFormatId, "reaction");
  assert.deepEqual(value.organizationCitation, {
    organizationId: "organization:bridge-fixture-duo",
    organizationVersion: 1,
  });
  assert.deepEqual(value.citation.requestRef, {
    id: realCandidate.request.id,
    version: realCandidate.request.version,
  });
  assert.equal(value.citation.rank, realCandidate.rank);
  assert.equal(value.citation.isNoopBaseline, false);
  assert.deepEqual(value.citation.rightsContext, {
    rightsRefs: [...realCandidate.request.rightsContext.rightsRefs],
    consentRefs: [...realCandidate.request.rightsContext.consentRefs],
  });
  assert.equal(value.expectations.counterfactual, true);
  assert.equal(value.expectations.expectedReward, realCandidate.evaluation.expectedReward);
});

test("the declared expectations projection carries every BRIDGE-002 consumption field", () => {
  const value = mustValidate(honestRequest());
  assert.deepEqual(value.expectations, {
    expectedReward: realCandidate.evaluation.expectedReward,
    interval: {
      lower: realCandidate.evaluation.interval.lower,
      upper: realCandidate.evaluation.interval.upper,
    },
    baselineExpectedReward: realCandidate.comparisonToBaseline.baselineExpectedReward,
    expectedRewardDelta: realCandidate.comparisonToBaseline.expectedRewardDelta,
    expectedValueOfDelay: realCandidate.evaluation.expectedValueOfDelay.value,
    disclosure: realCandidate.evaluation.disclosure,
    counterfactual: true,
  });
});

// ---------------------------------------------------------------------------
// Caller-shape failures (nothing recorded — the W8-A discipline)
// ---------------------------------------------------------------------------

test("a LOOKALIKE candidate object (deep-equal, not the result's own entry) is rejected", () => {
  const lookalike = structuredClone(realCandidate);
  const request = bridgeEntryRequestOf(realResult, lookalike as unknown as RankedCandidateProgram);
  mustFailWith(request, "candidate-not-in-result");
});

test("the result's OWN no-op baseline is rejected as not studio-enterable", () => {
  const request = bridgeEntryRequestOf(realResult, realResult.noopBaseline);
  mustFailWith(request, "no-op-baseline-not-studio-enterable");
});

test("a ranked candidate whose program CLAIMS the no-op baseline identity is rejected", () => {
  // The mutated program rides the result's own ranked slot (identity passes)
  // — the no-op claim itself is the typed rejection.
  mustFailWith(
    withCandidateMutation((candidate) => ({ ...candidate, isNoopBaseline: true })),
    "no-op-baseline-not-studio-enterable",
  );
});

test("a missing searchResult / selected shape fails closed as invalid-entry-request", () => {
  mustFailWith(
    { ...honestRequest(), searchResult: undefined as unknown as LabToStudioEntryRequest["searchResult"] },
    "invalid-entry-request",
  );
  mustFailWith(
    { ...honestRequest(), selected: null as unknown as LabToStudioEntryRequest["selected"] },
    "invalid-entry-request",
  );
});

test("hostile NON-STRING tenant ids fail closed (objects/symbols never coerce through)", () => {
  const hostileScopes: unknown[] = [
    { tenantId: {} },
    { tenantId: Symbol("tenant") },
    { tenantId: ["tenant-bridge-001"] },
    { tenantId: { toString: () => "tenant-bridge-001" } },
    { tenantId: "" },
    { tenantId: "   " },
    null,
    "not-a-scope",
  ];
  for (const scope of hostileScopes) {
    const outcome = validateLabToStudioEntry({
      ...honestRequest(),
      scope: scope as TenantScope,
    });
    assert.ok(!outcome.ok, `hostile scope ${JSON.stringify(String(scope))} must fail`);
    assert.equal(outcome.failure.kind, "invalid-entry-request");
    assert.match(outcome.failure.reason, /scope\.tenantId/);
  }
});

test("a hostile NON-STRING actor fails closed (§30 actor is a canonical ref)", () => {
  const outcome = validateLabToStudioEntry({
    ...honestRequest(),
    actor: { identity: "operator-1" } as unknown as LabToStudioEntryRequest["actor"],
  });
  assert.ok(!outcome.ok);
  assert.equal(outcome.failure.kind, "invalid-entry-request");
  assert.match(outcome.failure.reason, /actor/);
});

test("missionVersion/formatVersion must be positive integers (never 'latest', never 0/NaN)", () => {
  for (const missionVersion of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, null, undefined]) {
    const outcome = validateLabToStudioEntry({
      ...honestRequest(),
      missionVersion: missionVersion as number,
    });
    assert.ok(!outcome.ok, `missionVersion ${String(missionVersion)} must fail`);
    assert.equal(outcome.failure.kind, "invalid-entry-request");
  }
  for (const formatVersion of [0, -1, 2.5, Number.NaN, null, undefined]) {
    const outcome = validateLabToStudioEntry({
      ...honestRequest(),
      formatVersion: formatVersion as number,
    });
    assert.ok(!outcome.ok, `formatVersion ${String(formatVersion)} must fail`);
    assert.equal(outcome.failure.kind, "invalid-entry-request");
  }
});

test("the policy citation list: empty, duplicate, unversioned and hostile members fail closed", () => {
  const policyA = { id: "policy:a" as never, version: 1 as never };
  mustFailWith({ ...honestRequest(), policy: [] }, "invalid-entry-request");
  mustFailWith(
    { ...honestRequest(), policy: [policyA, { ...policyA }] },
    "invalid-entry-request",
  );
  mustFailWith(
    { ...honestRequest(), policy: [{ id: "policy:a" as never, version: 0 as never }] },
    "invalid-entry-request",
  );
  mustFailWith(
    { ...honestRequest(), policy: [{ id: "" as never, version: 1 as never }] },
    "invalid-entry-request",
  );
  mustFailWith(
    { ...honestRequest(), policy: [{ id: { rule: 1 } as never, version: 1 as never }] },
    "invalid-entry-request",
  );
});

test("the intake declaration: vocabulary, participant count and script flags fail closed", () => {
  mustFailWith(
    { ...honestRequest(), intake: { ...honestRequest().intake, inputKind: "vibes" as never } },
    "invalid-entry-request",
  );
  mustFailWith(
    { ...honestRequest(), intake: { ...honestRequest().intake, participantCount: 0 } },
    "invalid-entry-request",
  );
  mustFailWith(
    { ...honestRequest(), intake: { ...honestRequest().intake, participantCount: 1.5 } },
    "invalid-entry-request",
  );
  mustFailWith(
    { ...honestRequest(), intake: { ...honestRequest().intake, hasScriptOrQuestionGraph: "yes" as never } },
    "invalid-entry-request",
  );
});

// ---------------------------------------------------------------------------
// Candidate shape failures (malformed / unversioned / unprovenanced)
// ---------------------------------------------------------------------------

/** Re-select the REAL candidate with a mutation applied to its program. */
function withCandidateMutation(
  mutate: (candidate: RankedCandidateProgram["candidate"]) => RankedCandidateProgram["candidate"],
): LabToStudioEntryRequest {
  const mutated = {
    ...realCandidate,
    candidate: mutate({ ...realCandidate.candidate }),
  } as unknown as RankedCandidateProgram;
  // The mutated candidate is NOT the result's own entry → identity check
  // first. To reach the DEEPER checks, swap the result's own ranked slot in
  // place (the result object is the caller's own frame in this test).
  const resultWithSwappedEntry = {
    ...realResult,
    ranked: realResult.ranked.map((entry) => (entry === realCandidate ? mutated : entry)),
  };
  return bridgeEntryRequestOf(resultWithSwappedEntry as unknown as typeof realResult, mutated);
}

test("a candidate without a producing organization fails closed (the no-op shape)", () => {
  mustFailWith(
    withCandidateMutation((candidate) => ({ ...candidate, organization: null })),
    "malformed-candidate",
  );
});

test("an unversioned organization citation fails closed", () => {
  mustFailWith(
    withCandidateMutation((candidate) => ({
      ...candidate,
      organization: { ...candidate.organization!, organizationVersion: 0 as never },
    })),
    "unversioned-candidate",
  );
});

test("an unversioned transform-chain step fails closed", () => {
  mustFailWith(
    withCandidateMutation((candidate) => ({
      ...candidate,
      transformChain: [{ ...candidate.transformChain[0]!, definitionVersion: 0 as never }],
    })),
    "unversioned-candidate",
  );
});

test("a non-studio modality on the result's own slot fails closed", () => {
  mustFailWith(
    withCandidateMutation((candidate) => ({ ...candidate, modality: "human-arena" as never })),
    "candidate-modality-not-studio",
  );
});

test("a missing rank (NaN/0/fractional) fails closed — D5: no numeric reaches a record unguarded", () => {
  for (const rank of [Number.NaN, 0, -1, 1.5, Number.POSITIVE_INFINITY, null]) {
    const mutated = { ...realCandidate, rank: rank as number } as unknown as RankedCandidateProgram;
    const resultWithSwapped = {
      ...realResult,
      ranked: realResult.ranked.map((entry) => (entry === realCandidate ? mutated : entry)),
    };
    const outcome = validateLabToStudioEntry(
      bridgeEntryRequestOf(resultWithSwapped as unknown as typeof realResult, mutated),
    );
    assert.ok(!outcome.ok, `rank ${String(rank)} must fail`);
    assert.equal(outcome.failure.kind, "malformed-candidate");
    assert.match(outcome.failure.reason, /rank/);
  }
});

// ---------------------------------------------------------------------------
// Canonical request cross-checks (the request IS the candidate's own)
// ---------------------------------------------------------------------------

test("the canonical request's scope mismatching the entry scope fails closed (§31)", () => {
  const outcome = validateLabToStudioEntry({
    ...honestRequest(),
    scope: { tenantId: "tenant-other" as never },
  });
  assert.ok(!outcome.ok);
  assert.equal(outcome.failure.kind, "tenant-mismatch");
});

test("a search result from ANOTHER tenant fails closed (the result's own §31 scope)", () => {
  const foreignResult = { ...realResult, tenantId: "tenant-foreign" as never };
  const outcome = validateLabToStudioEntry(
    bridgeEntryRequestOf(foreignResult as unknown as typeof realResult, realCandidate),
  );
  assert.ok(!outcome.ok);
  assert.equal(outcome.failure.kind, "tenant-mismatch");
});

test("the canonical request's format disagreeing with the candidate program fails closed", () => {
  const mutated = {
    ...realCandidate,
    request: { ...realCandidate.request, studioFormat: "audio-podcast" as never },
  } as unknown as RankedCandidateProgram;
  const resultWithSwapped = {
    ...realResult,
    ranked: realResult.ranked.map((entry) => (entry === realCandidate ? mutated : entry)),
  };
  mustFailWith(
    bridgeEntryRequestOf(resultWithSwapped as unknown as typeof realResult, mutated),
    "format-mismatch",
  );
});

test("the canonical request's organization citation disagreeing with the program fails closed", () => {
  const mutated = {
    ...realCandidate,
    request: { ...realCandidate.request, organizationRef: "organization:someone-else" as never },
  } as unknown as RankedCandidateProgram;
  const resultWithSwapped = {
    ...realResult,
    ranked: realResult.ranked.map((entry) => (entry === realCandidate ? mutated : entry)),
  };
  mustFailWith(
    bridgeEntryRequestOf(resultWithSwapped as unknown as typeof realResult, mutated),
    "organization-citation-mismatch",
  );
});

// ---------------------------------------------------------------------------
// Provenance + expectations (D5 finite guards, verbatim disclosure)
// ---------------------------------------------------------------------------

test("an unprovenanced candidate (missing fingerprint/seed/policy version) fails closed", () => {
  const noProvenance = {
    ...realCandidate,
    provenance: undefined,
  } as unknown as RankedCandidateProgram;
  const resultWithSwapped = {
    ...realResult,
    ranked: realResult.ranked.map((entry) => (entry === realCandidate ? noProvenance : entry)),
  };
  mustFailWith(
    bridgeEntryRequestOf(resultWithSwapped as unknown as typeof realResult, noProvenance),
    "unprovenanced-candidate",
  );

  const noSeed = {
    ...realCandidate,
    provenance: { ...realCandidate.provenance, seed: Number.NaN },
  } as unknown as RankedCandidateProgram;
  const resultNoSeed = {
    ...realResult,
    ranked: realResult.ranked.map((entry) => (entry === realCandidate ? noSeed : entry)),
  };
  mustFailWith(
    bridgeEntryRequestOf(resultNoSeed as unknown as typeof realResult, noSeed),
    "unprovenanced-candidate",
  );

  const noOrigin = {
    ...realCandidate,
    provenance: { ...realCandidate.provenance, origin: { fabricated: true } as never },
  } as unknown as RankedCandidateProgram;
  const resultNoOrigin = {
    ...realResult,
    ranked: realResult.ranked.map((entry) => (entry === realCandidate ? noOrigin : entry)),
  };
  mustFailWith(
    bridgeEntryRequestOf(resultNoOrigin as unknown as typeof realResult, noOrigin),
    "unprovenanced-candidate",
  );
});

test("NaN/±Infinity declared expectations fail closed (D5 — nothing reaches a record)", () => {
  for (const hostile of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const mutated = {
      ...realCandidate,
      evaluation: { ...realCandidate.evaluation, expectedReward: hostile },
    } as unknown as RankedCandidateProgram;
    const resultWithSwapped = {
      ...realResult,
      ranked: realResult.ranked.map((entry) => (entry === realCandidate ? mutated : entry)),
    };
    const outcome = validateLabToStudioEntry(
      bridgeEntryRequestOf(resultWithSwapped as unknown as typeof realResult, mutated),
    );
    assert.ok(!outcome.ok, `expectedReward ${String(hostile)} must fail`);
    assert.equal(outcome.failure.kind, "invalid-declared-expectations");
  }
});

test("an inverted prediction interval fails closed", () => {
  const mutated = {
    ...realCandidate,
    evaluation: {
      ...realCandidate.evaluation,
      interval: { lower: 10, upper: 1 },
    },
  } as unknown as RankedCandidateProgram;
  const resultWithSwapped = {
    ...realResult,
    ranked: realResult.ranked.map((entry) => (entry === realCandidate ? mutated : entry)),
  };
  mustFailWith(
    bridgeEntryRequestOf(resultWithSwapped as unknown as typeof realResult, mutated),
    "invalid-declared-expectations",
  );
});

test("a NaN baseline comparison / EV-of-delay fails closed", () => {
  const mutated = {
    ...realCandidate,
    comparisonToBaseline: { ...realCandidate.comparisonToBaseline, expectedRewardDelta: Number.NaN },
  } as unknown as RankedCandidateProgram;
  const resultWithSwapped = {
    ...realResult,
    ranked: realResult.ranked.map((entry) => (entry === realCandidate ? mutated : entry)),
  };
  mustFailWith(
    bridgeEntryRequestOf(resultWithSwapped as unknown as typeof realResult, mutated),
    "invalid-declared-expectations",
  );

  const evdNaN = {
    ...realCandidate,
    evaluation: {
      ...realCandidate.evaluation,
      expectedValueOfDelay: { ...realCandidate.evaluation.expectedValueOfDelay, value: Number.NaN },
    },
  } as unknown as RankedCandidateProgram;
  const resultEvd = {
    ...realResult,
    ranked: realResult.ranked.map((entry) => (entry === realCandidate ? evdNaN : entry)),
  };
  mustFailWith(
    bridgeEntryRequestOf(resultEvd as unknown as typeof realResult, evdNaN),
    "invalid-declared-expectations",
  );
});

// ---------------------------------------------------------------------------
// The W10-F3 class: non-pure-data canonical payloads fail CLOSED TYPED
// ---------------------------------------------------------------------------

test("a CYCLIC acceptance-criteria payload fails closed typed (never an untyped projection crash)", () => {
  const cyclic: unknown[] = [];
  cyclic.push({ criterion: "quality-floor", cyclic });
  const mutated = {
    ...realCandidate,
    request: { ...realCandidate.request, acceptanceCriteria: cyclic as never },
  } as unknown as RankedCandidateProgram;
  const resultWithSwapped = {
    ...realResult,
    ranked: realResult.ranked.map((entry) => (entry === realCandidate ? mutated : entry)),
  };
  mustFailWith(
    bridgeEntryRequestOf(resultWithSwapped as unknown as typeof realResult, mutated),
    "malformed-candidate",
  );
});

test("a THROWING-GETTER delay-policy payload fails closed typed", () => {
  const hostile = {
    get maxWaitMs(): number {
      throw new Error("boom");
    },
  };
  const mutated = {
    ...realCandidate,
    request: { ...realCandidate.request, delayPolicy: hostile as never },
  } as unknown as RankedCandidateProgram;
  const resultWithSwapped = {
    ...realResult,
    ranked: realResult.ranked.map((entry) => (entry === realCandidate ? mutated : entry)),
  };
  mustFailWith(
    bridgeEntryRequestOf(resultWithSwapped as unknown as typeof realResult, mutated),
    "malformed-candidate",
  );
});

test("missing canonical projection fields (objective/capabilities/humanTasks/refs) fail closed", () => {
  const missingObjective = {
    ...realCandidate,
    request: { ...realCandidate.request, objective: undefined },
  } as unknown as RankedCandidateProgram;
  const r1 = {
    ...realResult,
    ranked: realResult.ranked.map((entry) => (entry === realCandidate ? missingObjective : entry)),
  };
  mustFailWith(bridgeEntryRequestOf(r1 as unknown as typeof realResult, missingObjective), "malformed-candidate");

  const missingCapabilities = {
    ...realCandidate,
    request: { ...realCandidate.request, capabilityRequirements: undefined },
  } as unknown as RankedCandidateProgram;
  const r2 = {
    ...realResult,
    ranked: realResult.ranked.map((entry) => (entry === realCandidate ? missingCapabilities : entry)),
  };
  mustFailWith(bridgeEntryRequestOf(r2 as unknown as typeof realResult, missingCapabilities), "malformed-candidate");

  const missingHumanTasks = {
    ...realCandidate,
    request: { ...realCandidate.request, humanTasks: "not-an-array" as never },
  } as unknown as RankedCandidateProgram;
  const r3 = {
    ...realResult,
    ranked: realResult.ranked.map((entry) => (entry === realCandidate ? missingHumanTasks : entry)),
  };
  mustFailWith(bridgeEntryRequestOf(r3 as unknown as typeof realResult, missingHumanTasks), "malformed-candidate");
});

test("an empty rights frame (no explicit grant) fails closed (§27 — no frameless production)", () => {
  const frameless = {
    ...realCandidate,
    request: {
      ...realCandidate.request,
      rightsContext: { rightsRefs: [], consentRefs: [] },
    },
  } as unknown as RankedCandidateProgram;
  const resultWithSwapped = {
    ...realResult,
    ranked: realResult.ranked.map((entry) => (entry === realCandidate ? frameless : entry)),
  };
  mustFailWith(
    bridgeEntryRequestOf(resultWithSwapped as unknown as typeof realResult, frameless),
    "malformed-candidate",
  );
});

test("a hostile budget (NaN amount / missing currency) fails closed (D5 + the policy gate's spend context)", () => {
  const nanBudget = {
    ...realCandidate,
    request: {
      ...realCandidate.request,
      budget: { ...realCandidate.request.budget, maxCost: { amount: Number.NaN, currency: "USD" } as never },
    },
  } as unknown as RankedCandidateProgram;
  const r1 = {
    ...realResult,
    ranked: realResult.ranked.map((entry) => (entry === realCandidate ? nanBudget : entry)),
  };
  mustFailWith(bridgeEntryRequestOf(r1 as unknown as typeof realResult, nanBudget), "malformed-candidate");

  const noCurrency = {
    ...realCandidate,
    request: {
      ...realCandidate.request,
      budget: { ...realCandidate.request.budget, maxCost: { amount: 10, currency: "" } as never },
    },
  } as unknown as RankedCandidateProgram;
  const r2 = {
    ...realResult,
    ranked: realResult.ranked.map((entry) => (entry === realCandidate ? noCurrency : entry)),
  };
  mustFailWith(bridgeEntryRequestOf(r2 as unknown as typeof realResult, noCurrency), "malformed-candidate");
});

test("the validation is pure: the honest request objects are never mutated by validation", () => {
  const before = structuredClone({
    selected: realCandidate,
    result: { id: realResult.id, tenantId: realResult.tenantId },
  });
  mustValidate(honestRequest());
  const after = structuredClone({
    selected: realCandidate,
    result: { id: realResult.id, tenantId: realResult.tenantId },
  });
  assert.deepEqual(before, after);
});

// The hostile-tenant family is pinned end-to-end at the STORE level
// (bridge-entry-store.test.ts) — here the scope grammar itself is pinned:
test("the scope grammar: the honest fixture scope validates unchanged", () => {
  assert.equal(String(BRIDGE_SCOPE.tenantId), BRIDGE_TENANT);
  mustValidate(honestRequest());
});
