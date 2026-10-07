import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createInMemoryOrganizationSearch } from './in-memory-organization-search.js';
import { organizationCandidateFaults, organizationFeatureFingerprint } from './organization-features.js';
import type { OrganizationSearchPort } from '../contracts/organization-search.js';
import type { OrganizationSearchResult } from '../contracts/organization-search.js';
import type { SearchedOrganizationCandidate } from '../contracts/organization-features.js';
import { ORGANIZATION_SEARCH_DIMENSIONS } from '../contracts/organization-features.js';
import { ensembleStack, FIXED_NOW, reachRewardSpec, scopeOf } from '../testing/w4a-lab-fixtures.js';
import {
  baselineCandidate,
  composedCandidate,
  handDesignedCandidate,
  orgSearchStack,
  registryBackedHandDesigned,
  searchInput,
  searchPolicy,
} from '../testing/w5b-lab-fixtures.js';

type SearchResult = Awaited<ReturnType<OrganizationSearchPort['searchOrganizations']>>;

const asResult = (result: SearchResult): OrganizationSearchResult => {
  if ('error' in result) {
    assert.fail(`unexpected search error: ${result.error} — ${result.message}`);
  }
  return result;
};

const asError = (result: SearchResult): { error: string; message: string } => {
  assert.ok('error' in result, `expected a typed failure, got: ${String(result)}`);
  return result;
};

// ---------------------------------------------------------------------------
// §23 THE COMPARISON MANDATE (test-pinned)
// ---------------------------------------------------------------------------

test('the §23 comparison mandate: every result carries baseline + hand-designed + generated', async () => {
  const { search } = await orgSearchStack();
  const result = asResult(await search.searchOrganizations(searchInput(search)));

  assert.equal(result.comparison.baseline.candidate.origin, 'generalist-single-agent-baseline');
  assert.equal(result.comparison.baseline.candidate.organization.nodes.length, 1);
  assert.equal(result.comparison.handDesigned.candidate.origin, 'hand-designed');
  assert.ok(
    result.comparison.generated.length >= 1,
    'the result must include search-generated organizations',
  );
  for (const entry of result.comparison.generated) {
    assert.equal(entry.candidate.origin, 'generated');
  }
  // The three origins partition the ranked set exactly.
  const origins = result.ranked.map((entry) => entry.candidate.origin);
  assert.equal(origins.filter((o) => o === 'generalist-single-agent-baseline').length, 1);
  assert.equal(origins.filter((o) => o === 'hand-designed').length, 1);
  assert.equal(origins.filter((o) => o === 'composed').length, 1);
  assert.equal(
    origins.filter((o) => o === 'generated').length,
    result.comparison.generated.length,
  );
  assert.equal(result.ranked.length, result.budget.evaluationsExecuted);
});

test('missing baseline or hand-designed candidates fail closed (typed mandate failures)', async () => {
  const { search } = await orgSearchStack();
  const base = searchInput(search);

  const missingBaseline = await search.searchOrganizations({
    ...base,
    candidates: { ...base.candidates, baseline: undefined } as never,
  });
  assert.equal(asError(missingBaseline).error, 'missing-required-candidate');
  assert.match(asError(missingBaseline).message, /candidates\.baseline/);

  const missingHandDesigned = await search.searchOrganizations({
    ...base,
    candidates: { ...base.candidates, handDesigned: undefined } as never,
  });
  assert.equal(asError(missingHandDesigned).error, 'missing-required-candidate');
  assert.match(asError(missingHandDesigned).message, /candidates\.handDesigned/);
});

test('a multi-node "baseline" is not a generalist single-agent baseline (fail-closed)', async () => {
  const { search } = await orgSearchStack();
  const base = searchInput(search);
  const failure = asError(
    await search.searchOrganizations({
      ...base,
      candidates: { ...base.candidates, baseline: handDesignedCandidate() },
    }),
  );
  assert.equal(failure.error, 'baseline-not-single-agent');
  assert.match(failure.message, /SINGLE-agent/);
});

test('the search consumes genuine @mos/agents registry-grade organization records', async () => {
  const stack = await ensembleStack();
  const search = createInMemoryOrganizationSearch({ ensemble: stack.ensemble, now: FIXED_NOW });
  const registryBacked = registryBackedHandDesigned();
  const base = searchInput(search);
  const result = asResult(
    await search.searchOrganizations({
      ...base,
      candidates: {
        baseline: base.candidates.baseline,
        handDesigned: registryBacked.candidate,
        additional: [composedCandidate()],
      },
    }),
  );
  // The registry-resolved record (frozen by the agents registry) round-trips
  // through the search — same evaluation as the by-value template.
  const handDesigned = result.comparison.handDesigned;
  assert.equal(handDesigned.candidate.organization.id, 'org-hand-designed');
  assert.equal(handDesigned.candidate.organization.version, 2);
  assert.deepEqual(
    handDesigned.provenance.fingerprint,
    organizationFeatureFingerprint({
      organization: registryBacked.candidate.organization,
      features: registryBacked.candidate.features,
      origin: 'hand-designed',
    } satisfies SearchedOrganizationCandidate),
  );
});

// ---------------------------------------------------------------------------
// Determinism (same candidates + seed + policy + world-model versions)
// ---------------------------------------------------------------------------

test('determinism: same inputs + seed → bit-identical search result', async () => {
  const { search } = await orgSearchStack();
  const input = searchInput(search);
  const first = asResult(await search.searchOrganizations(input));
  const second = asResult(await search.searchOrganizations(input));
  assert.deepEqual(first, second);
});

test('determinism: fresh stacks (fresh ensemble instances) → bit-identical search result', async () => {
  const firstStack = await ensembleStack();
  const secondStack = await ensembleStack();
  const firstSearch = createInMemoryOrganizationSearch({ ensemble: firstStack.ensemble, now: FIXED_NOW });
  const secondSearch = createInMemoryOrganizationSearch({ ensemble: secondStack.ensemble, now: FIXED_NOW });
  const first = asResult(await firstSearch.searchOrganizations(searchInput(firstSearch)));
  const second = asResult(await secondSearch.searchOrganizations(searchInput(secondSearch)));
  assert.deepEqual(first, second);
});

test('determinism: a different seed changes the search trace (seed-required search)', async () => {
  const { search } = await orgSearchStack();
  const first = asResult(await search.searchOrganizations(searchInput(search)));
  const second = asResult(
    await search.searchOrganizations(searchInput(search, { seed: 999_999 })),
  );
  assert.notEqual(first.id, second.id);
  assert.notDeepEqual(first.ranked.map((e) => e.evaluation.expectedReward), second.ranked.map((e) => e.evaluation.expectedReward));
});

// ---------------------------------------------------------------------------
// Twelve-dimension provenance (no silent defaults)
// ---------------------------------------------------------------------------

test('every candidate records ALL TWELVE §23 dimensions (caller-supplied: fully declared)', async () => {
  const { search } = await orgSearchStack();
  const result = asResult(await search.searchOrganizations(searchInput(search)));
  assert.equal(ORGANIZATION_SEARCH_DIMENSIONS.length, 12);
  for (const entry of result.ranked) {
    assert.deepEqual(Object.keys(entry.provenance.fingerprint).sort(), [...ORGANIZATION_SEARCH_DIMENSIONS].sort());
  }
  const baseline = result.comparison.baseline;
  const handDesigned = result.comparison.handDesigned;
  assert.deepEqual(baseline.provenance.variedDimensions, ORGANIZATION_SEARCH_DIMENSIONS);
  assert.deepEqual(handDesigned.provenance.variedDimensions, ORGANIZATION_SEARCH_DIMENSIONS);
  // The baseline and the hand-designed org differ in the search space.
  assert.notDeepEqual(baseline.provenance.fingerprint, handDesigned.provenance.fingerprint);
});

test('generated candidates record exactly the dimensions the generation varied', async () => {
  const { search } = await orgSearchStack();
  const result = asResult(await search.searchOrganizations(searchInput(search)));
  const generated = result.comparison.generated;
  assert.ok(generated.length >= 1);
  for (const entry of generated) {
    assert.ok(entry.provenance.generationIndex !== null);
    assert.ok(entry.provenance.generationIndex >= 1);
    assert.ok(entry.provenance.parentFingerprint !== null);
    const varied = entry.provenance.variedDimensions;
    assert.ok(varied.length >= 1, 'a generated candidate must record at least one varied dimension');
    for (const dimension of varied) {
      assert.ok(
        (ORGANIZATION_SEARCH_DIMENSIONS as readonly string[]).includes(dimension),
        `unknown dimension recorded: ${String(dimension)}`,
      );
    }
    // Every recorded varied dimension actually differs in the fingerprint.
    const parentFp = entry.provenance.parentFingerprint as unknown as Record<string, string>;
    const childFp = entry.provenance.fingerprint as unknown as Record<string, string>;
    for (const dimension of varied) {
      assert.notEqual(parentFp[dimension], childFp[dimension]);
    }
    // Generated candidates stay structurally valid organizations.
    assert.deepEqual(organizationCandidateFaults(entry.candidate), []);
  }
  // The search space over the twelve dimensions is genuinely explored: the
  // generated set spans several distinct dimensions.
  const variedSet = new Set<string>();
  for (const entry of generated) {
    for (const dimension of entry.provenance.variedDimensions) {
      variedSet.add(dimension);
    }
  }
  assert.ok(variedSet.size >= 4, `expected several dimensions explored, got ${variedSet.size}`);
});

test('provenance pins the simulator/ensemble/reward versions that evaluated each candidate', async () => {
  const { search, registered } = await orgSearchStack();
  const result = asResult(await search.searchOrganizations(searchInput(search)));
  for (const entry of result.ranked) {
    assert.equal(entry.provenance.simulatorVersion, 1);
    assert.equal(entry.provenance.ensembleId, 'ensemble-reach');
    assert.equal(entry.provenance.ensembleVersion, registered.version);
    assert.deepEqual(
      entry.provenance.memberWorldModelVersions,
      registered.members.map((member) => member.worldModelVersion),
    );
    assert.equal(entry.provenance.rewardSpecVersion, 1);
    assert.equal(entry.provenance.seed, 424_242);
    assert.equal(entry.provenance.evaluationSeeds.length, 2);
    assert.equal(entry.provenance.horizonSteps, 3);
    assert.equal(entry.provenance.searchedAt, FIXED_NOW());
  }
});

// ---------------------------------------------------------------------------
// Uncertainty carried through ranking (§22)
// ---------------------------------------------------------------------------

test('every ranked entry carries the §22 set; ranking is uncertainty-aware with declared overlap', async () => {
  const { search } = await orgSearchStack();
  const result = asResult(await search.searchOrganizations(searchInput(search)));
  assert.ok(result.ranked.length >= 4);
  let previousExpected = Number.POSITIVE_INFINITY;
  for (const entry of result.ranked) {
    const { evaluation } = entry;
    assert.ok(Number.isFinite(evaluation.expectedReward));
    assert.ok(evaluation.interval.lower <= evaluation.expectedReward);
    assert.ok(evaluation.expectedReward <= evaluation.interval.upper);
    assert.ok(evaluation.disagreementHalfWidth >= 0);
    assert.equal(evaluation.seedRobustness.seeds.length, 2);
    assert.equal(evaluation.seedRobustness.perSeedExpected.length, 2);
    assert.ok(evaluation.seedRobustness.halfSpread >= 0);
    assert.ok(['in-coverage', 'out-of-declared-coverage', 'partially-undeclared'].includes(evaluation.ood.status));
    assert.equal(evaluation.calibration.status, 'not-calibrated');
    assert.ok(evaluation.simulatedMemberSteps > 0);
    // Expected reward descends monotonically (the declared comparator).
    assert.ok(evaluation.expectedReward <= previousExpected);
    previousExpected = evaluation.expectedReward;
    if (entry.rank === 1) {
      assert.equal(entry.intervalOverlapWithLeader, null);
    } else {
      assert.ok(entry.intervalOverlapWithLeader !== null);
      assert.equal(typeof entry.intervalOverlapWithLeader?.overlaps, 'boolean');
      assert.match(entry.intervalOverlapWithLeader?.note ?? '', /overlap/);
    }
  }
  // The overlap flags are honest: they equal the interval intersection test.
  const leader = result.ranked[0] as { evaluation: { interval: { lower: number; upper: number } } };
  for (const entry of result.ranked.slice(1)) {
    const expectedOverlap =
      entry.evaluation.interval.lower <= leader.evaluation.interval.upper &&
      leader.evaluation.interval.lower <= entry.evaluation.interval.upper;
    assert.equal(entry.intervalOverlapWithLeader?.overlaps, expectedOverlap);
  }
  // Deterministic tie-break surface: the comparator fields are all present.
  assert.equal(typeof result.ranked[0]?.rank, 'number');
  assert.ok(result.ranked.every((entry) => typeof entry.candidate.organization.id === 'string'));
  assert.equal(leader.evaluation.interval.lower, (result.ranked[0] as { evaluation: { interval: { lower: number; upper: number } } }).evaluation.interval.lower);
  assert.equal(leader.evaluation.interval.upper, (result.ranked[0] as { evaluation: { interval: { lower: number; upper: number } } }).evaluation.interval.upper);
});

test('candidate stopping policy caps the simulated horizon (stopping conditions are evaluation-active)', async () => {
  const { search } = await orgSearchStack();
  const result = asResult(await search.searchOrganizations(searchInput(search)));
  const baseline = result.comparison.baseline;
  // Baseline maxIterations 4 >= policy horizon 3 → full horizon.
  assert.equal(baseline.evaluation.effectiveHorizonSteps, 3);
  assert.equal(
    baseline.evaluation.simulatedMemberSteps,
    2 * 3 * result.comparison.baseline.provenance.memberWorldModelVersions.length,
  );
});

// ---------------------------------------------------------------------------
// Counterfactual labeling (lock rule 29) + §24 boundary
// ---------------------------------------------------------------------------

test('every output is counterfactual-labeled with the §24 lab-only statement', async () => {
  const { search } = await orgSearchStack();
  const result = asResult(await search.searchOrganizations(searchInput(search)));
  assert.equal(result.counterfactual, true);
  assert.equal(result.disclosure, 'organization-search-over-disclosed-synthetic-simulation');
  assert.match(result.labOnly, /never a deployment decision/);
  assert.equal(result.tenantId, scopeOf('tenant-a').tenantId);
  for (const entry of result.ranked) {
    assert.equal(entry.evaluation.counterfactual, true);
    assert.equal(entry.evaluation.disclosure, 'ensemble-evaluated-simulation-estimate');
    assert.match(entry.evaluation.uncertainty.note ?? '', /NOT ground truth/);
  }
});

test('the ranking admits the caller-supplied additional composed candidates too', async () => {
  const { search } = await orgSearchStack();
  const base = searchInput(search);
  const withoutAdditional = {
    ...base,
    candidates: { baseline: base.candidates.baseline, handDesigned: base.candidates.handDesigned },
  };
  const result = asResult(await search.searchOrganizations(withoutAdditional));
  assert.ok(!result.ranked.some((entry) => entry.candidate.origin === 'composed'));
  assert.ok(result.ranked.length >= 3);
  assert.ok(result.budget.evaluationsExecuted < asResult(await search.searchOrganizations(base)).budget.evaluationsExecuted);
});

test('search policy structural validation fails closed with named fields', async () => {
  const { search } = await orgSearchStack();
  const base = searchInput(search);
  const cases: readonly [Partial<ReturnType<typeof searchPolicy>>, RegExp][] = [
    [{ seedCount: 1 }, /seedCount/],
    [{ budgetScaleFactor: 1 }, /budgetScaleFactor/],
    [{ roleVocabulary: [] }, /roleVocabulary/],
    [{ maxGenerations: 0 }, /maxGenerations/],
    [{ evaluationReferences: { ...searchPolicy().evaluationReferences, fullBudgetAmount: 0 } }, /evaluationReferences/],
  ];
  for (const [overrides, pattern] of cases) {
    const failure = asError(
      await search.searchOrganizations(searchInput(search, { policy: searchPolicy(overrides) })),
    );
    assert.equal(failure.error, 'invalid-input');
    assert.match(failure.message, pattern);
  }
  const badSeed = asError(await search.searchOrganizations({ ...base, seed: Number.NaN }));
  assert.equal(badSeed.error, 'invalid-input');
  const badSpec = asError(
    await search.searchOrganizations(searchInput(search, { rewardSpec: { ...reachRewardSpec(), terms: [] } })),
  );
  assert.equal(badSpec.error, 'invalid-input');
});

test('caller data is never mutated or frozen in place (ownership semantics)', async () => {
  const { search } = await orgSearchStack();
  const baseline = baselineCandidate();
  const handDesigned = handDesignedCandidate();
  const input = searchInput(search, {
    candidates: { baseline, handDesigned, additional: [] },
  });
  await search.searchOrganizations(input);
  assert.equal(Object.isFrozen(baseline.organization), false);
  assert.equal(Object.isFrozen(baseline.organization.nodes[0]), false);
  assert.equal(Object.isFrozen(handDesigned.organization.budgetPolicy), false);
  assert.equal(Object.isFrozen(input.candidates.baseline.features), false);
});
