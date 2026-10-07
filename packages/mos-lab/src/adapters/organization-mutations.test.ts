import assert from 'node:assert/strict';
import { test } from 'node:test';

import { organizationMutationsOf } from './organization-mutations.js';
import {
  organizationCandidateFaults,
  organizationFeatureFingerprint,
} from './organization-features.js';
import { ORGANIZATION_SEARCH_DIMENSIONS } from '../contracts/organization-features.js';
import type { OrganizationFeatureFingerprint } from '../contracts/organization-features.js';
import {
  composedCandidate,
  handDesignedCandidate,
  baselineCandidate,
  searchPolicy,
} from '../testing/w5b-lab-fixtures.js';

/**
 * LAB-010 mutation-operator coverage: every one of the twelve §23 dimensions
 * has a working mutation, every mutant stays a structurally valid
 * organization, and each mutation changes EXACTLY the dimensions whose
 * fingerprints differ (structural side effects are honest and recorded).
 */

const fingerprintOf = (candidate: ReturnType<typeof handDesignedCandidate>): OrganizationFeatureFingerprint =>
  organizationFeatureFingerprint(candidate);

const dimensionsChangedBetween = (
  parent: OrganizationFeatureFingerprint,
  child: OrganizationFeatureFingerprint,
): readonly string[] =>
  ORGANIZATION_SEARCH_DIMENSIONS.filter(
    (dimension) => (parent as unknown as Record<string, string>)[dimension] !== (child as unknown as Record<string, string>)[dimension],
  );

test('mutations exist for every one of the twelve §23 dimensions', () => {
  const policy = searchPolicy();
  // A single-agent organization CANNOT have edges (self-edges are rejected),
  // so the three edge dimensions are legitimately absent for the baseline.
  const EDGE_DIMENSIONS: readonly string[] = ['topology', 'delegation', 'communication'];
  for (const parent of [baselineCandidate(), handDesignedCandidate(), composedCandidate()]) {
    const mutations = organizationMutationsOf(parent, policy, 1);
    const dimensions = new Set(mutations.map((mutation) => mutation.dimension));
    for (const dimension of ORGANIZATION_SEARCH_DIMENSIONS) {
      const singleAgent = parent.organization.nodes.length === 1;
      const expected = singleAgent && EDGE_DIMENSIONS.includes(dimension) ? false : true;
      assert.ok(
        dimensions.has(dimension) === expected,
        `mutation coverage mismatch for dimension ${dimension} (nodes: ${parent.organization.nodes.length})`,
      );
    }
    // Every mutant is a structurally valid organization.
    for (const mutation of mutations) {
      assert.deepEqual(
        organizationCandidateFaults(mutation.candidate),
        [],
        `mutant ${mutation.candidate.organization.id} must be structurally valid`,
      );
      assert.equal(mutation.candidate.origin, 'generated');
      assert.ok(mutation.moveIndex >= 0);
    }
    // Generated ids are unique within the move set.
    const ids = mutations.map((mutation) => mutation.candidate.organization.id);
    assert.equal(new Set(ids).size, ids.length);
  }
});

test('each dimension mutation changes exactly its own fingerprint signature', () => {
  const policy = searchPolicy();
  const parent = handDesignedCandidate();
  const parentFingerprint = fingerprintOf(parent);
  const mutations = organizationMutationsOf(parent, policy, 1);

  const byDimension = new Map<string, ReturnType<typeof fingerprintOf>>();
  for (const mutation of mutations) {
    if (!byDimension.has(mutation.dimension)) {
      byDimension.set(mutation.dimension, organizationFeatureFingerprint(mutation.candidate));
    }
  }
  // Single-signature dimensions: the mutation changes ONLY that dimension.
  const singleSignature: readonly [string, string][] = [
    ['roles', 'roles'],
    ['topology', 'topology'],
    ['delegation', 'delegation'],
    ['communication', 'communication'],
    ['memory-sharing', 'memory-sharing'],
    ['critics', 'critics'],
    ['tool-allocation', 'tool-allocation'],
    ['model-assignment', 'model-assignment'],
    ['budget', 'budget'],
    ['execution-ordering', 'execution-ordering'],
    ['stopping-conditions', 'stopping-conditions'],
  ];
  for (const [dimension, key] of singleSignature) {
    const child = byDimension.get(dimension);
    assert.ok(child !== undefined, `expected a mutation for ${dimension}`);
    assert.notEqual(
      (parentFingerprint as unknown as Record<string, string>)[key],
      (child as unknown as Record<string, string>)[key],
      `${dimension} mutation must change the ${key} signature`,
    );
    assert.deepEqual(
      dimensionsChangedBetween(parentFingerprint, child as OrganizationFeatureFingerprint),
      [key],
      `${dimension} mutation must change ONLY the ${key} signature`,
    );
  }
  // agent-count: +1 node also grows the model-assignment signature (honest).
  const agentCountChild = byDimension.get('agent-count');
  assert.ok(agentCountChild !== undefined);
  assert.deepEqual(
    dimensionsChangedBetween(parentFingerprint, agentCountChild),
    ['agent-count', 'model-assignment'],
  );
});

test('delegation mutations keep delegation acyclic and functional; budgets stay consistent', () => {
  const policy = searchPolicy();
  let parent = composedCandidate();
  // Iterate several generations of delegation mutations: each mutant must
  // remain valid (acyclic + functional delegation, perNode <= org budget).
  for (let generation = 1; generation <= 4; generation += 1) {
    const mutations = organizationMutationsOf(parent, policy, generation);
    for (const mutation of mutations) {
      const org = mutation.candidate.organization;
      for (const node of org.nodes) {
        const outgoing = org.edges.filter(
          (edge) => edge.kind === 'delegates-to' && edge.fromNodeId === node.nodeId,
        );
        assert.ok(outgoing.length <= 1, 'delegation must stay functional (<= 1 outgoing)');
      }
      assert.ok(org.budgetPolicy.perNode.maxCost.amount <= org.budgetPolicy.organization.maxCost.amount);
      assert.ok(
        org.budgetPolicy.perNode.maxDurationMs <= org.budgetPolicy.organization.maxDurationMs,
      );
      assert.ok(org.terminationPolicy.maxIterations >= 1);
      assert.deepEqual(organizationCandidateFaults(mutation.candidate), []);
    }
    const delegationMutation = mutations.find((m) => m.dimension === 'delegation');
    if (delegationMutation === undefined) {
      break;
    }
    parent = delegationMutation.candidate;
  }
});

test('mutation generation is deterministic (same parent + policy → identical move set)', () => {
  const policy = searchPolicy();
  const parent = handDesignedCandidate();
  const first = organizationMutationsOf(parent, policy, 1);
  const second = organizationMutationsOf(parent, policy, 1);
  assert.deepEqual(first, second);
  // The generation index participates in the generated identity.
  const later = organizationMutationsOf(parent, policy, 2);
  assert.notDeepEqual(first, later);
});

test('node id generation never collides, even after add/remove cycles', () => {
  const policy = searchPolicy();
  let parent = handDesignedCandidate();
  for (let generation = 1; generation <= 3; generation += 1) {
    const mutations = organizationMutationsOf(parent, policy, generation);
    const agentCountRemoval = mutations.find(
      (m) => m.dimension === 'agent-count' && m.candidate.organization.nodes.length < parent.organization.nodes.length,
    );
    const agentCountAddition = mutations.find(
      (m) => m.dimension === 'agent-count' && m.candidate.organization.nodes.length > parent.organization.nodes.length,
    );
    if (agentCountRemoval !== undefined) {
      parent = agentCountRemoval.candidate;
    } else if (agentCountAddition !== undefined) {
      parent = agentCountAddition.candidate;
    } else {
      break;
    }
    const ids = parent.organization.nodes.map((node) => node.nodeId);
    assert.equal(new Set(ids).size, ids.length);
    assert.deepEqual(organizationCandidateFaults(parent), []);
  }
});
