/**
 * Production program search (LAB-016, §7) — the core behavioral battery:
 * the structurally-present no-op baseline, canonical ProductionRequest
 * completeness (assertRequiredFields pinned), sixteen-dimension variation
 * recorded in provenance, determinism, budget enforcement, §22 uncertainty
 * carried through ranking + pruning, version-pinned component provenance,
 * §24 boundary labeling, tenant scoping and the no-op-never-parent pin.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { assertRequiredFields } from "@mos/contracts";

import { PROGRAM_SEARCH_DIMENSIONS } from "./contracts/program-dimensions.js";
import { NO_OP_PROGRAM_REFS } from "./contracts/program-candidate.js";
import type { ProductionProgramSearchResult } from "./contracts/program-search-result.js";
import type { RankedCandidateProgram } from "./contracts/program-search-result.js";
import type { ProgramEvaluationPort } from "./ports/program-evaluation.port.js";
import type { ProgramDelayTerms } from "./contracts/program-candidate.js";
import {
  composeProgramSearchStack,
  fixtureSearchInput,
  handDesignedProgram,
  PROGRAM_SCOPE_BETA,
  PROGRAM_TENANT_ALPHA,
} from "./testing/compose-program-search-stack.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type SearchResult = ProductionProgramSearchResult;
type SearchFailure = { readonly error: string; readonly message: string };
type SearchOutcome = SearchResult | SearchFailure;

const asResult = (value: SearchOutcome): SearchResult => {
  if ("error" in value) {
    assert.fail(`expected a search result, got ${JSON.stringify(value)}`);
  }
  return value;
};

const asFailure = (value: SearchOutcome): SearchFailure => {
  if (!("error" in value)) {
    assert.fail(`expected a typed failure, got a result with ${value.ranked.length} entries`);
  }
  return value;
};

const runSearch = async (
  overrides: Parameters<typeof fixtureSearchInput>[0] = {},
  stackOptions: Parameters<typeof composeProgramSearchStack>[0] = {},
): Promise<SearchResult> => {
  const stack = composeProgramSearchStack(stackOptions);
  return asResult(await stack.search.searchPrograms(fixtureSearchInput(overrides)));
};

const runFailure = async (
  overrides: Parameters<typeof fixtureSearchInput>[0] = {},
  stackOptions: Parameters<typeof composeProgramSearchStack>[0] = {},
): Promise<SearchFailure> => {
  const stack = composeProgramSearchStack(stackOptions);
  return asFailure(await stack.search.searchPrograms(fixtureSearchInput(overrides)));
};

/** A controllable evaluation seam double (deterministic, disclosed). */
const rewardByNovelty = (
  slope: number,
  disagreement: number,
): ProgramEvaluationPort => ({
  async evaluateProgram(request) {
    const { action, delayTerms } = request;
    const reward = slope * action.novelty;
    return Object.freeze({
      expectedReward: reward,
      interval: Object.freeze({
        lower: reward - disagreement,
        upper: reward + disagreement,
      }),
      disagreementHalfWidth: disagreement,
      uncertainty: Object.freeze({ level: "moderate" }),
      expectedValueOfDelay: Object.freeze({
        value: delayTermsEv(delayTerms),
        interval: Object.freeze({
          lower: delayTermsEv(delayTerms) - disagreement,
          upper: delayTermsEv(delayTerms) + disagreement,
        }),
      }),
      ensembleId: "ensemble:controlled-test",
      ensembleVersion: 7,
      simulatorVersion: 3,
      rewardSpecVersion: 2,
      counterfactual: true,
      disclosure: "disclosed-synthetic-ensemble-evaluation",
    });
  },
});

const delayTermsEv = (terms: ProgramDelayTerms): number =>
  terms.successProbability * terms.expectedIncrementalValue -
  terms.delayCost -
  terms.acquisitionCost;

/** The MUTATED generated entries (parent ≠ null — excludes the seed root). */
const generated = (result: SearchResult): readonly RankedCandidateProgram[] =>
  result.ranked.filter(
    (entry) =>
      entry.provenance.origin === "generated" &&
      entry.provenance.parentFingerprint !== null,
  );

const MUTABLE_DIMENSIONS: readonly string[] = PROGRAM_SEARCH_DIMENSIONS.filter(
  (dimension) => dimension !== "source-reference" && dimension !== "no-op-repost",
);

// ---------------------------------------------------------------------------
// The frozen sixteen-dimension vocabulary
// ---------------------------------------------------------------------------

test("the §7 dimension vocabulary is frozen at exactly SIXTEEN members in declaration order", () => {
  assert.equal(PROGRAM_SEARCH_DIMENSIONS.length, 16);
  assert.deepEqual(PROGRAM_SEARCH_DIMENSIONS, [
    "source-reference",
    "no-op-repost",
    "transform-chain",
    "transform-parameters",
    "production-modality",
    "organization",
    "pawn-agents",
    "model-assignment",
    "engine-portfolio",
    "human-participation",
    "capability-acquisition",
    "quality-thresholds",
    "cost",
    "latency",
    "expected-value-of-delay",
    "stopping-substitution-policy",
  ]);
});

// ---------------------------------------------------------------------------
// The no-op baseline (§7: ALWAYS a valid baseline — structurally present)
// ---------------------------------------------------------------------------

test("every search result carries the no-op baseline — ranked AND as the dedicated field", async () => {
  const result = await runSearch();
  assert.equal(result.noopBaseline.candidate.isNoopBaseline, true);
  assert.ok(result.ranked.some((entry) => entry.candidate.isNoopBaseline));
  assert.ok(
    result.ranked.some((entry) => entry === result.noopBaseline),
    "the baseline IS one of the ranked entries (the same object)",
  );
});

test("the no-op baseline is the empty-chain repost with zero delay terms by construction", async () => {
  const result = await runSearch();
  const baseline = result.noopBaseline.candidate;
  assert.deepEqual(baseline.transformChain, []);
  assert.equal(baseline.organization, null);
  assert.deepEqual(baseline.pawnAgents, []);
  assert.deepEqual(baseline.modelAssignments, []);
  assert.deepEqual(baseline.enginePortfolio, []);
  assert.deepEqual(baseline.humanTasks, []);
  assert.deepEqual(baseline.capabilityAcquisition, []);
  assert.equal(baseline.budget.maxCost.amount, 0);
  assert.equal(baseline.expectedDurationMs, 0);
  assert.equal(baseline.delayPolicy.maxWaitMs, 0);
  assert.equal(baseline.delayExpectation.estimatedWaitMs, 0);
  assert.equal(
    baseline.delayExpectation.provenance.kind,
    "declared-assumption",
  );
  const request = result.noopBaseline.request;
  assert.equal(request.transformGraphRef, NO_OP_PROGRAM_REFS.transformGraphRef);
  assert.equal(request.organizationRef, NO_OP_PROGRAM_REFS.organizationRef);
  assert.equal(request.studioFormat, NO_OP_PROGRAM_REFS.studioFormat);
  assert.deepEqual(request.humanTasks, []);
  assert.deepEqual(request.capabilityRequirements, []);
  assert.equal(request.acceptanceCriteria.length, 1);
  assert.match(
    request.acceptanceCriteria[0]?.description ?? "",
    /verbatim repost/,
  );
});

test("every ranked candidate declares its comparison against the no-op baseline", async () => {
  const result = await runSearch();
  const baselineReward = result.noopBaseline.evaluation.expectedReward;
  for (const entry of result.ranked) {
    assert.equal(
      entry.comparisonToBaseline.baselineExpectedReward,
      baselineReward,
    );
    assert.equal(
      entry.comparisonToBaseline.expectedRewardDelta,
      entry.evaluation.expectedReward - baselineReward,
    );
    const own = entry.evaluation.interval;
    const base = result.noopBaseline.evaluation.interval;
    assert.equal(
      entry.comparisonToBaseline.intervalOverlapWithBaseline.overlaps,
      own.lower <= base.upper && base.lower <= own.upper,
    );
  }
});

test("a caller-supplied candidate may NEVER claim the no-op baseline (typed rejection)", async () => {
  const stack = composeProgramSearchStack();
  const impostor = handDesignedProgram({ isNoopBaseline: true });
  const failure = await stack.search.searchPrograms(
    fixtureSearchInput({ handDesigned: [{ candidate: impostor }] }),
  );
  assert.equal(asFailure(failure).error, "caller-claimed-no-op-baseline");
});

test("the no-op baseline is NEVER a generation parent (even when it tops the ranking)", async () => {
  // Hostile evaluation: the no-op (novelty 0) scores the HIGHEST reward.
  const result = await runSearch(
    {},
    { evaluationOverride: rewardByNovelty(-10, 0.05) },
  );
  assert.equal(result.noopBaseline.rank, 1);
  assert.equal(result.ranked[0], result.noopBaseline);
  const baselineFingerprint = result.noopBaseline.provenance.fingerprint;
  for (const entry of generated(result)) {
    assert.equal(entry.candidate.isNoopBaseline, false);
    assert.notDeepEqual(entry.provenance.parentFingerprint, baselineFingerprint);
  }
});

// ---------------------------------------------------------------------------
// Canonical CORE-001 ProductionRequest completeness (pinned)
// ---------------------------------------------------------------------------

test("every ranked candidate composes a contract-complete canonical ProductionRequest", async () => {
  const input = fixtureSearchInput({
    handDesigned: [{ candidate: handDesignedProgram() }],
  });
  const stack = composeProgramSearchStack();
  const result = asResult(await stack.search.searchPrograms(input));
  assert.ok(result.ranked.length >= 3);
  for (const entry of result.ranked) {
    // The frozen required-field manifest, checked on EVERY composed request.
    assert.doesNotThrow(() =>
      assertRequiredFields(entry.request, "ProductionRequest"),
    );
    // Composed FROM the search input (the GIVEN dimensions).
    assert.deepEqual(entry.request.scope, input.scope);
    assert.equal(entry.request.objective, input.objective);
    assert.equal(entry.request.strategyRef, input.strategyRef);
    assert.deepEqual(entry.request.sourceArtifacts, input.sourceArtifactRefs);
    assert.deepEqual(entry.request.rightsContext, input.rightsContext);
    assert.deepEqual(entry.request.returnContract, input.returnContract);
    // Composed FROM the candidate's declared dimensions.
    assert.deepEqual(
      entry.request.humanTasks.map((task) => task as string),
      entry.candidate.humanTasks.map((task) => task as string),
    );
    assert.equal(entry.request.deadline, entry.candidate.deadline);
    assert.deepEqual(entry.request.delayPolicy, entry.candidate.delayPolicy);
    assert.deepEqual(entry.request.budget, entry.candidate.budget);
    assert.equal(
      entry.request.capabilityRequirements.length,
      entry.candidate.capabilityAcquisition.length,
    );
    if (!entry.candidate.isNoopBaseline) {
      assert.equal(entry.request.studioFormat, entry.candidate.studioFormat);
      assert.equal(
        entry.request.organizationRef,
        entry.candidate.organization?.organizationId,
      );
      assert.ok(
        entry.request.transformGraphRef.startsWith("program-graph:"),
        "the synthesized transform-graph citation",
      );
      assert.equal(entry.request.acceptanceCriteria.length, 1);
      assert.equal(
        entry.request.acceptanceCriteria[0]?.evaluator,
        entry.candidate.qualityThresholds.evaluatorRef,
      );
    }
  }
  const handDesignedEntry = result.ranked.find(
    (entry) => entry.provenance.origin === "hand-designed",
  );
  assert.ok(handDesignedEntry !== undefined);
  assert.deepEqual(handDesignedEntry.candidate, handDesignedProgram());
});

test("caller-supplied candidates are cloned — the caller's object is never frozen or mutated", async () => {
  const candidate = handDesignedProgram();
  const result = await runSearch({
    handDesigned: [{ candidate }],
  });
  assert.equal(Object.isFrozen(candidate), false);
  assert.equal(Object.isFrozen(result.ranked[0]?.candidate), true);
});

// ---------------------------------------------------------------------------
// Sixteen-dimension variation recorded (provenance)
// ---------------------------------------------------------------------------

test("provenance records the varied dimensions: synthesized entries declare all sixteen, mutated entries exactly their fingerprint diff", async () => {
  const result = await runSearch({
    handDesigned: [{ candidate: handDesignedProgram() }],
  });
  for (const entry of result.ranked) {
    if (entry.provenance.origin === "generated" && entry.provenance.parentFingerprint !== null) {
      // A MUTATED generated candidate: the recorded varied dimensions are
      // EXACTLY the dimensions whose fingerprints differ from the parent's
      // (the operator's primary dimension plus any coherence dimensions
      // rebuilt with it — the honest provenance, pinned).
      const parent = entry.provenance.parentFingerprint;
      const diff = PROGRAM_SEARCH_DIMENSIONS.filter(
        (dimension) => parent[dimension] !== entry.provenance.fingerprint[dimension],
      );
      assert.deepEqual(
        entry.provenance.variedDimensions,
        diff,
        "variedDimensions == the fingerprint diff vs the parent",
      );
      assert.ok(diff.length >= 1);
      for (const dimension of diff) {
        assert.ok(
          MUTABLE_DIMENSIONS.includes(dimension),
          `varied dimension '${dimension}' is a mutable dimension`,
        );
      }
      assert.ok(
        typeof entry.provenance.generationIndex === "number" &&
          entry.provenance.generationIndex >= 1,
      );
    } else {
      // A SYNTHESIZED or caller-declared entry: every dimension explicit
      // (the no-op baseline, the generation-root seed program, and every
      // hand-designed candidate declare all sixteen).
      assert.deepEqual(
        entry.provenance.variedDimensions,
        [...PROGRAM_SEARCH_DIMENSIONS],
        `${entry.provenance.origin} entry declares all sixteen dimensions`,
      );
      assert.equal(entry.provenance.parentFingerprint, null);
      assert.equal(entry.provenance.generationIndex, null);
    }
  }
});

test("the search explores the §7 dimension space (union of varied dimensions across generations)", async () => {
  // Include a hand-designed program carrying an llm-flavored pawn WITH a
  // model assignment so the incumbent's generation 1 can vary the
  // model-assignment dimension too (deterministic incumbency: the
  // hand-designed program outscores the synthesized seed program).
  const llmProgram = handDesignedProgram({
    pawnAgents: ["reaction-composition", "quality-critic", "podcast-interviewer"],
    modelAssignments: [
      { pawnKind: "podcast-interviewer", modelRef: "mos-model:pawn-default" as never },
    ],
  });
  const result = await runSearch({
    handDesigned: [{ candidate: llmProgram }],
  });
  const variedUnion = new Set<string>();
  for (const entry of generated(result)) {
    for (const dimension of entry.provenance.variedDimensions) {
      variedUnion.add(dimension);
    }
  }
  const missing = MUTABLE_DIMENSIONS.filter((d) => !variedUnion.has(d));
  assert.deepEqual(
    missing,
    [],
    "every mutable §7 dimension is varied by some generated candidate",
  );
});

test("per-candidate fingerprints cover all sixteen dimensions and dedup the search space", async () => {
  const result = await runSearch();
  for (const entry of result.ranked) {
    const fingerprint = entry.provenance.fingerprint;
    assert.deepEqual(
      Object.keys(fingerprint).sort(),
      [...PROGRAM_SEARCH_DIMENSIONS].sort(),
    );
    assert.ok(fingerprint["source-reference"].startsWith("src:"));
  }
  const keys = result.ranked.map((entry) =>
    PROGRAM_SEARCH_DIMENSIONS.map((d) => entry.provenance.fingerprint[d]).join("||"),
  );
  assert.equal(new Set(keys).size, keys.length, "no duplicate candidates");
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

test("the search is deterministic given (inputs, seed, policy version)", async () => {
  const input = fixtureSearchInput({
    handDesigned: [{ candidate: handDesignedProgram() }],
  });
  const first = asResult(
    await composeProgramSearchStack().search.searchPrograms(input),
  );
  const second = asResult(
    await composeProgramSearchStack().search.searchPrograms(input),
  );
  assert.deepEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(second)));
});

test("different seeds produce different searches (the seed is load-bearing)", async () => {
  const first = await runSearch({ seed: 20260601 });
  const second = await runSearch({ seed: 20260602 });
  assert.notEqual(first.id, second.id);
  assert.notDeepEqual(
    first.ranked.map((entry) => entry.evaluation.expectedReward),
    second.ranked.map((entry) => entry.evaluation.expectedReward),
  );
});

// ---------------------------------------------------------------------------
// Budget enforcement
// ---------------------------------------------------------------------------

test("a budget below the mandated floor fails closed with the typed code", async () => {
  const failure = await runFailure({
    budget: { maxCandidateEvaluations: 2, maxIterations: 4 },
  });
  assert.equal(failure.error, "budget-below-mandated-floor");
  assert.match(failure.message, /mandate/);
});

test("an exhausted evaluation budget bounds the search and is recorded", async () => {
  const result = await runSearch({
    budget: { maxCandidateEvaluations: 3, maxIterations: 4 },
  });
  assert.equal(result.stopping.reason, "budget-exhausted");
  assert.equal(result.budget.maxCandidateEvaluations, 3);
  assert.equal(result.budget.evaluationsConsumed, 3);
  assert.ok(result.budget.evaluationsConsumed <= result.budget.maxCandidateEvaluations);
  assert.equal(result.budget.generatedEvaluated, 1);
  assert.ok(result.budget.seamEvaluationsConsumed >= result.budget.evaluationsConsumed);
});

test("the iteration cap bounds the search when the budget is generous", async () => {
  const result = await runSearch({
    budget: { maxCandidateEvaluations: 200, maxIterations: 1 },
  });
  assert.equal(result.stopping.reason, "iteration-cap-reached");
  assert.equal(result.stopping.generationsExecuted, 1);
  assert.ok(result.budget.evaluationsConsumed <= 200);
});

test("a plateau stops the search with the declared window (budget generous)", async () => {
  const result = await runSearch({
    budget: { maxCandidateEvaluations: 200, maxIterations: 4 },
    policy: {
      ...fixtureSearchInput().policy,
      improvementTolerance: 1e9,
    },
  });
  assert.equal(result.stopping.reason, "plateau-detected");
  assert.equal(result.stopping.generationsExecuted, 2);
  assert.match(result.stopping.detail, /consecutive non-improving/);
});

// ---------------------------------------------------------------------------
// §22 uncertainty carried through ranking + pruning
// ---------------------------------------------------------------------------

test("every candidate carries its §22 uncertainty set through the ranking", async () => {
  const result = await runSearch();
  for (const entry of result.ranked) {
    const { expectedReward, interval, seedRobustness, disagreementHalfWidth } =
      entry.evaluation;
    assert.ok(Number.isFinite(expectedReward));
    assert.ok(interval.lower <= expectedReward && expectedReward <= interval.upper);
    assert.ok(disagreementHalfWidth >= 0);
    assert.equal(seedRobustness.seeds.length, result.policy.seedCount);
    assert.equal(seedRobustness.perSeedExpected.length, result.policy.seedCount);
    assert.ok(seedRobustness.spread >= seedRobustness.halfSpread * 2 - 1e-9);
    assert.ok(entry.evaluation.seamEvaluationsConsumed >= result.policy.seedCount);
  }
  // Deterministic ranking order: expected reward DESC.
  const rewards = result.ranked.map((entry) => entry.evaluation.expectedReward);
  const sorted = [...rewards].sort((a, b) => b - a);
  assert.deepEqual(rewards, sorted);
  // Ranks are 1-based and contiguous.
  assert.deepEqual(
    result.ranked.map((entry) => entry.rank),
    result.ranked.map((_, index) => index + 1),
  );
});

test("interval overlap with the leader is declared on every non-leader entry", async () => {
  const result = await runSearch();
  assert.equal(result.ranked[0]?.intervalOverlapWithLeader, null);
  const leader = result.ranked[0];
  assert.ok(leader !== undefined);
  for (const entry of result.ranked.slice(1)) {
    assert.ok(entry.intervalOverlapWithLeader !== null);
    const own = entry.evaluation.interval;
    const lead = leader.evaluation.interval;
    assert.equal(
      entry.intervalOverlapWithLeader?.overlaps,
      own.lower <= lead.upper && lead.lower <= own.upper,
    );
    assert.ok((entry.intervalOverlapWithLeader?.note ?? "").length > 0);
  }
});

test("interval-dominance pruning marks certainly-worse entries but keeps them RANKED", async () => {
  // reward = 10·novelty ± 0.05: the no-op (novelty 0) is certainly worse
  // than any program candidate with novelty > 0.01.
  const result = await runSearch(
    {},
    { evaluationOverride: rewardByNovelty(10, 0.05) },
  );
  const leader = result.ranked[0];
  assert.ok(leader !== undefined);
  assert.equal(leader.provenance.pruned, false);
  const pruned = result.ranked.filter((entry) => entry.provenance.pruned);
  assert.ok(pruned.length >= 1, "at least the no-op baseline is pruned");
  assert.equal(result.noopBaseline.provenance.pruned, true);
  for (const entry of pruned) {
    assert.ok(
      entry.evaluation.interval.upper < leader.evaluation.interval.lower,
      "a pruned entry's interval upper bound is strictly below the leader's lower bound",
    );
    assert.ok(
      result.ranked.includes(entry),
      "a pruned entry stays RANKED (comparison transparency)",
    );
  }
  assert.equal(result.policy.pruning, "interval-dominance");
});

test("pruning 'none' never marks entries pruned", async () => {
  const input = fixtureSearchInput();
  const result = await runSearch({
    policy: { ...input.policy, pruning: "none" },
  });
  for (const entry of result.ranked) {
    assert.equal(entry.provenance.pruned, false);
    assert.equal(entry.provenance.pruningRule, "none");
  }
});

// ---------------------------------------------------------------------------
// Version-pinned component provenance
// ---------------------------------------------------------------------------

test("every candidate's provenance pins the evaluation surfaces, policy and seed", async () => {
  const input = fixtureSearchInput();
  const result = await runSearch(input);
  for (const entry of result.ranked) {
    assert.equal(entry.provenance.ensembleId, "ensemble:program-search-double");
    assert.equal(entry.provenance.ensembleVersion, 1);
    assert.equal(entry.provenance.simulatorVersion, 1);
    assert.equal(entry.provenance.rewardSpecVersion, 1);
    assert.equal(entry.provenance.policyVersion, input.policy.version);
    assert.equal(entry.provenance.seed, input.seed);
    assert.deepEqual(entry.provenance.evaluationSeeds.length, input.policy.seedCount);
    assert.equal(typeof entry.provenance.searchedAt, "string");
  }
});

test("candidate components are version-pinned refs that resolve through the seams", async () => {
  const stack = composeProgramSearchStack();
  const input = fixtureSearchInput();
  const result = asResult(await stack.search.searchPrograms(input));
  const catalog = await stack.doubles.catalog.listPromotedTransforms(input.scope);
  const organizations = await stack.doubles.organizations.listOrganizations(input.scope);
  for (const entry of result.ranked) {
    for (const step of entry.candidate.transformChain) {
      const resolved = await stack.doubles.transforms.resolve(
        input.scope,
        step.definitionId,
        step.definitionVersion,
      );
      assert.ok(resolved !== null, `step ${step.definitionId as string} resolves exactly`);
      assert.notEqual(resolved.kind, "no-op-repost");
      assert.ok(catalog.some((d) => d.id === step.definitionId && d.version === step.definitionVersion));
    }
    if (entry.candidate.organization !== null) {
      assert.ok(
        organizations.some(
          (o) =>
            o.id === entry.candidate.organization?.organizationId &&
            o.version === entry.candidate.organization?.organizationVersion,
        ),
        "the organization citation resolves at its EXACT version",
      );
    }
    for (const binding of entry.candidate.enginePortfolio) {
      assert.ok(
        input.policy.engineVocabulary.some(
          (b) =>
            b.capabilityId === binding.capabilityId &&
            b.capabilityVersion === binding.capabilityVersion &&
            b.engineId === binding.engineId &&
            b.engineVersion === binding.engineVersion,
        ),
        "engine bindings are exact-version registry vocabulary entries",
      );
    }
    for (const assignment of entry.candidate.modelAssignments) {
      assert.ok(
        input.policy.modelVocabulary.includes(assignment.modelRef),
        "model assignments are declared DATA refs from the single-boundary vocabulary",
      );
    }
  }
});

// ---------------------------------------------------------------------------
// §24 boundary labeling (never a deployment decision)
// ---------------------------------------------------------------------------

test("the search output is a §24-labeled counterfactual candidate set, never a deployment decision", async () => {
  const result = await runSearch();
  assert.equal(result.counterfactual, true);
  assert.equal(result.disclosure, "program-search-over-disclosed-synthetic-evaluation");
  assert.match(result.labOnly, /never a deployment decision/);
  assert.match(result.labOnly, /§24/);
  for (const entry of result.ranked) {
    assert.equal(entry.evaluation.counterfactual, true);
    assert.equal(entry.evaluation.disclosure, "ensemble-evaluated-simulation-estimate");
  }
  assert.equal(result.tenantId, PROGRAM_TENANT_ALPHA);
});

// ---------------------------------------------------------------------------
// Tenant scoping
// ---------------------------------------------------------------------------

test("the search is tenant-scoped: a beta-tenant search sees ONLY the beta vocabulary", async () => {
  const input = fixtureSearchInput({ scope: PROGRAM_SCOPE_BETA });
  const stack = composeProgramSearchStack();
  const result = asResult(await stack.search.searchPrograms(input));
  assert.equal(result.tenantId, PROGRAM_SCOPE_BETA.tenantId);
  for (const entry of result.ranked) {
    if (!entry.candidate.isNoopBaseline) {
      for (const step of entry.candidate.transformChain) {
        assert.equal(step.definitionId as string, "transform:beta-only");
      }
      assert.equal(
        entry.candidate.organization?.organizationId,
        "organization:fixture-beta",
      );
    }
  }
  // The seam listings themselves are tenant-scoped.
  const alphaTransforms = await stack.doubles.catalog.listPromotedTransforms(
    fixtureSearchInput().scope,
  );
  const betaTransforms = await stack.doubles.catalog.listPromotedTransforms(PROGRAM_SCOPE_BETA);
  assert.equal(alphaTransforms.length, 4);
  assert.equal(betaTransforms.length, 1);
  const alphaOrgs = await stack.doubles.organizations.listOrganizations(
    fixtureSearchInput().scope,
  );
  const betaOrgs = await stack.doubles.organizations.listOrganizations(PROGRAM_SCOPE_BETA);
  assert.equal(alphaOrgs.length, 2);
  assert.equal(betaOrgs.length, 1);
});

test("a hand-designed candidate citing a foreign tenant's surfaces fails closed (indistinguishable from unknown)", async () => {
  const stack = composeProgramSearchStack();
  const citingForeignOrg = handDesignedProgram({
    organization: {
      organizationId: "organization:fixture-beta",
      organizationVersion: 1 as never,
    },
  });
  const failure = await stack.search.searchPrograms(
    fixtureSearchInput({ handDesigned: [{ candidate: citingForeignOrg }] }),
  );
  assert.equal(asFailure(failure).error, "organization-unresolved");
});

// ---------------------------------------------------------------------------
// Seams fail closed on unresolvable refs
// ---------------------------------------------------------------------------

test("an empty chain-eligible catalog fails closed (transform-unresolved)", async () => {
  const failure = await runFailure({ scope: { tenantId: "tenant:gamma" as never } });
  assert.equal(failure.error, "transform-unresolved");
  assert.match(failure.message, /no chain-eligible/);
});

test("an empty organization listing fails closed (organization-unresolved)", async () => {
  const stack = composeProgramSearchStack();
  stack.doubles.transforms.register({
    id: "transform:gamma-only" as never,
    tenantId: "tenant:gamma" as never,
    version: 1 as never,
    kind: "crop-reframe",
    inputTypes: ["video"],
    outputTypes: ["video"],
    parameters: { type: "object" },
    capabilityRequirements: [{ capabilityId: "reframe_video" as never, version: 1 as never }],
    evaluator: "evaluator:transform/gamma" as never,
    costModel: { basis: "per-invocation", amount: 0.1, currency: "USD" },
    latencyModel: { p50Ms: 1_000, p95Ms: 4_000, p99Ms: 9_000 },
    rightsRequirements: [],
    policyRequirements: [],
    lineageRules: [],
  });
  const failure = await stack.search.searchPrograms(
    fixtureSearchInput({ scope: { tenantId: "tenant:gamma" as never } }),
  );
  assert.equal(asFailure(failure).error, "organization-unresolved");
});

test("a rejecting evaluation seam fails closed (evaluation-failed)", async () => {
  const rejecting: ProgramEvaluationPort = {
    async evaluateProgram() {
      throw new Error("the seam double rejected this evaluation");
    },
  };
  const failure = await runFailure({}, { evaluationOverride: rejecting });
  assert.equal(failure.error, "evaluation-failed");
  assert.match(failure.message, /rejected the candidate/);
});

// ---------------------------------------------------------------------------
// The §2 first-class variable: EV of delay (LAB-015 carried)
// ---------------------------------------------------------------------------

test("the EV of delay is carried as a first-class §22-labeled dimension on every candidate", async () => {
  const result = await runSearch();
  for (const entry of result.ranked) {
    const ev = entry.evaluation.expectedValueOfDelay;
    assert.ok(Number.isFinite(ev.value));
    assert.ok(ev.interval.lower <= ev.value && ev.value <= ev.interval.upper);
    // The documented ev-delay-1 shape on the zero-term no-op baseline.
    if (entry.candidate.isNoopBaseline) {
      assert.equal(ev.value, 0);
    }
  }
  const seedEv = result.noopBaseline.provenance.evaluationSeeds;
  assert.ok(seedEv.length >= 2, "seed robustness requires at least two seeds");
});
