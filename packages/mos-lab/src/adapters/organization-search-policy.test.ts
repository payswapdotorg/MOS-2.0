import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createInMemoryOrganizationSearch } from './in-memory-organization-search.js';
import type { OrganizationSearchPort } from '../contracts/organization-search.js';
import type { OrganizationSearchResult } from '../contracts/organization-search.js';
import { ensembleStack, FIXED_NOW, reachRewardSpec, scenarioOf, scopeOf } from '../testing/w4a-lab-fixtures.js';
import {
  baselineCandidate,
  composedCandidate,
  cyclicDelegationCandidate,
  handDesignedCandidate,
  missingAssignmentCandidate,
  orgSearchStack,
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
// Budget enforcement (declared budget; fail-closed floor; honest accounting)
// ---------------------------------------------------------------------------

test('a budget below the mandated floor fails closed (§23 requires a generated candidate)', async () => {
  const { search } = await orgSearchStack();
  // Floor = (3 initial + 1 generated) × 2 seeds × 3 steps × 2 members = 48.
  const failure = asError(
    await search.searchOrganizations(
      searchInput(search, { policy: searchPolicy({ maxMemberSteps: 47 }) }),
    ),
  );
  assert.equal(failure.error, 'budget-below-mandated-floor');
  assert.match(failure.message, /48 member steps/);
  // Exactly at the floor the search is admissible.
  const result = asResult(
    await search.searchOrganizations(
      searchInput(search, { policy: searchPolicy({ maxMemberSteps: 48, maxGenerations: 1 }) }),
    ),
  );
  assert.ok(result.comparison.generated.length >= 1);
  assert.ok(result.budget.consumedMemberSteps <= 48);
});

test('budget exhaustion stops the search deterministically with honest accounting', async () => {
  const { search } = await orgSearchStack();
  const input = searchInput(search, {
    policy: searchPolicy({ maxMemberSteps: 120, maxGenerations: 10 }),
  });
  const result = asResult(await search.searchOrganizations(input));
  assert.equal(result.stopping.reason, 'budget-exhausted');
  assert.match(result.stopping.detail, /budget 120 exhausted/);
  assert.ok(result.budget.consumedMemberSteps <= 120);
  // Accounting: consumed is exactly the sum of the evaluations' costs.
  const sum = result.ranked.reduce(
    (total, entry) => total + entry.evaluation.simulatedMemberSteps,
    0,
  );
  assert.equal(result.budget.consumedMemberSteps, sum);
  assert.equal(result.budget.evaluationsExecuted, result.ranked.length);
  assert.equal(result.budget.generatedEvaluated, result.comparison.generated.length);
  assert.equal(result.budget.maxMemberSteps, 120);
  // Determinism of the truncation: the same tight budget reproduces it.
  const repeat = asResult(await search.searchOrganizations(input));
  assert.deepEqual(result, repeat);
});

// ---------------------------------------------------------------------------
// Reward-spec version pinning (§21)
// ---------------------------------------------------------------------------

test('reward spec version is pinned against the scenario rewardVersion', async () => {
  const { search } = await orgSearchStack();
  const failure = asError(
    await search.searchOrganizations(
      searchInput(search, { rewardSpec: reachRewardSpec({ version: 2 }) }),
    ),
  );
  assert.equal(failure.error, 'reward-version-mismatch');
  assert.match(failure.message, /version 2/);
  assert.match(failure.message, /rewardVersion 1/);
});

test('a reward term no ensemble-predicted metric can derive fails closed', async () => {
  const { search } = await orgSearchStack();
  const failure = asError(
    await search.searchOrganizations(
      searchInput(search, {
        rewardSpec: {
          version: 1,
          terms: [
            {
              metric: 'retention',
              weight: 1,
              direction: 'maximize',
              definition: 'a source no predicted metric matches',
              metricSource: 'no-such-metric',
            },
          ],
        },
      }),
    ),
  );
  assert.equal(failure.error, 'reward-term-not-derivable');
  assert.match(failure.message, /no-such-metric/);
});

test('an underlying ensemble evaluation failure surfaces as a typed search failure', async () => {
  const stack = await ensembleStack();
  // A delegating double: version reads pass through, evaluation fails typed.
  const failingEnsemble = {
    getEnsemble: stack.ensemble.getEnsemble.bind(stack.ensemble),
    resolveLatestEnsemble: stack.ensemble.resolveLatestEnsemble.bind(stack.ensemble),
    evaluateEnsemble: () =>
      Promise.resolve({
        error: 'member-evaluation-failed',
        message: 'member m1: underlying engine failure (injected double)',
      } as const),
  };
  const search = createInMemoryOrganizationSearch({ ensemble: failingEnsemble, now: FIXED_NOW });
  const failure = asError(await search.searchOrganizations(searchInput(search)));
  assert.equal(failure.error, 'ensemble-evaluation-failed');
  assert.match(failure.message, /member-evaluation-failed/);
  assert.match(failure.message, /seed/);
});

// ---------------------------------------------------------------------------
// Tenant scoping (§31 fail-closed)
// ---------------------------------------------------------------------------

test('candidates belonging to another tenant fail closed (no cross-tenant search)', async () => {
  const { search } = await orgSearchStack();
  const failure = asError(
    await search.searchOrganizations(
      searchInput(search, {
        candidates: {
          baseline: baselineCandidate(),
          handDesigned: {
            ...handDesignedCandidate(),
            organization: {
              ...handDesignedCandidate().organization,
              tenantId: 'tenant-b' as never,
            },
          },
        },
      }),
    ),
  );
  assert.equal(failure.error, 'tenant-scope-mismatch');
  assert.match(failure.message, /tenant-b/);
});

test('an ensemble invisible in the search tenant fails closed (no existence leak)', async () => {
  const stack = await ensembleStack();
  const search = createInMemoryOrganizationSearch({ ensemble: stack.ensemble, now: FIXED_NOW });
  // Tenant-b candidates under a tenant-b scope: the ensemble (registered
  // under tenant-a) is invisible — cross-tenant reads fail closed.
  const tenantBCandidates = {
    baseline: {
      ...baselineCandidate(),
      organization: { ...baselineCandidate().organization, tenantId: 'tenant-b' as never },
    },
    handDesigned: {
      ...handDesignedCandidate(),
      organization: { ...handDesignedCandidate().organization, tenantId: 'tenant-b' as never },
    },
  };
  const failure = asError(
    await search.searchOrganizations(
      searchInput(search, { scope: scopeOf('tenant-b'), candidates: tenantBCandidates }),
    ),
  );
  assert.equal(failure.error, 'unknown-ensemble');
  const wrongVersion = asError(
    await search.searchOrganizations(searchInput(search, { ensembleVersion: 9 })),
  );
  assert.equal(wrongVersion.error, 'ensemble-version-not-found');
  assert.match(wrongVersion.message, /version 9/);
});

test('a scenario from another niche/platform than the ensemble fails closed', async () => {
  const { search } = await orgSearchStack();
  const failure = asError(
    await search.searchOrganizations(
      searchInput(search, { scenario: scenarioOf({ niche: 'espresso-coffee' }) }),
    ),
  );
  assert.equal(failure.error, 'scenario-ensemble-mismatch');
  assert.match(failure.message, /espresso-coffee/);
});

// ---------------------------------------------------------------------------
// Structural candidate validation (fail-closed, named reasons)
// ---------------------------------------------------------------------------

test('structurally invalid candidates are rejected with named reasons', async () => {
  const { search } = await orgSearchStack();
  const cyclic = asError(
    await search.searchOrganizations(
      searchInput(search, {
        candidates: {
          baseline: baselineCandidate(),
          handDesigned: cyclicDelegationCandidate(),
        },
      }),
    ),
  );
  assert.equal(cyclic.error, 'invalid-candidate-organization');
  assert.match(cyclic.message, /delegation-cycle/);

  const unassigned = asError(
    await search.searchOrganizations(
      searchInput(search, {
        candidates: {
          baseline: baselineCandidate(),
          handDesigned: missingAssignmentCandidate(),
        },
      }),
    ),
  );
  assert.equal(unassigned.error, 'invalid-candidate-organization');
  assert.match(unassigned.message, /missing-model-assignment/);
});

// ---------------------------------------------------------------------------
// Declared stopping (plateau / generation cap)
// ---------------------------------------------------------------------------

test('plateau detection stops the search after the declared window', async () => {
  const { search } = await orgSearchStack();
  const result = asResult(
    await search.searchOrganizations(
      searchInput(search, {
        policy: searchPolicy({
          improvementTolerance: 1e12,
          plateauWindow: 2,
          maxGenerations: 10,
        }),
      }),
    ),
  );
  assert.equal(result.stopping.reason, 'plateau-detected');
  assert.ok(result.stopping.generationsExecuted >= 2);
  assert.match(result.stopping.detail, /improvementTolerance/);
});

test('the generation cap stops the search (declared hard cap)', async () => {
  const { search } = await orgSearchStack();
  const result = asResult(
    await search.searchOrganizations(
      searchInput(search, {
        policy: searchPolicy({ maxGenerations: 1, plateauWindow: 50 }),
      }),
    ),
  );
  assert.equal(result.stopping.reason, 'generation-cap-reached');
  assert.equal(result.stopping.generationsExecuted, 1);
  assert.match(result.stopping.detail, /generation cap 1/);
});

// ---------------------------------------------------------------------------
// Declared pruning rule (interval dominance)
// ---------------------------------------------------------------------------

test("pruning 'none' makes no dominance claims on any ranked entry", async () => {
  const { search } = await orgSearchStack();
  const result = asResult(
    await search.searchOrganizations(
      searchInput(search, { policy: searchPolicy({ pruning: 'none' }) }),
    ),
  );
  for (const entry of result.ranked) {
    assert.equal(entry.provenance.pruned, false);
    assert.equal(entry.provenance.pruningRule, 'none');
  }
});

test("pruning 'interval-dominance' flags candidates certainly worse than the incumbent's worst case", async () => {
  const { search } = await orgSearchStack();
  // A near-zero-budget baseline is certainly worse than the incumbent.
  const result = asResult(
    await search.searchOrganizations(
      searchInput(search, {
        candidates: {
          baseline: baselineCandidate({ budgetAmount: 1 }),
          handDesigned: handDesignedCandidate(),
          additional: [composedCandidate()],
        },
        policy: searchPolicy({ pruning: 'interval-dominance' }),
      }),
    ),
  );
  assert.equal(result.comparison.baseline.provenance.pruned, true);
  // The flag is EXACTLY the declared dominance test for every entry.
  const incumbentEntry = result.ranked[0];
  assert.ok(incumbentEntry !== undefined);
  const incumbentLower = incumbentEntry.evaluation.interval.lower;
  for (const entry of result.ranked) {
    assert.equal(
      entry.provenance.pruned,
      entry.evaluation.interval.upper < incumbentLower,
    );
    assert.equal(entry.provenance.pruningRule, 'interval-dominance');
  }
  // Pruned entries stay RANKED (comparison transparency, never hidden).
  assert.ok(result.ranked.includes(result.comparison.baseline));
});

// ---------------------------------------------------------------------------
// Comparison-mandate guard (the fail-closed net)
// ---------------------------------------------------------------------------

test('the comparison mandate guard is unreachable with an honest budget floor', async () => {
  const { search } = await orgSearchStack();
  // The smallest admissible budget still yields a generated candidate.
  const result = asResult(
    await search.searchOrganizations(
      searchInput(search, {
        policy: searchPolicy({ maxMemberSteps: 48, maxGenerations: 1 }),
      }),
    ),
  );
  assert.ok(result.comparison.generated.length >= 1);
  assert.ok(result.ranked.length >= 4);
});
