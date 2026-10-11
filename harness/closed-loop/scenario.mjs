// PROD-004 — scenario setup: the single deterministic world the loop drives.
// Everything here is FIXED (seeds, clocks, fixtures) so two consecutive runs
// produce identical transcripts (determinism clause).

import {
  fixedClock, seededRng, createInMemoryTransportDouble, createInMemoryJobQueueDouble,
} from './ports.mjs';

export const TENANT = 'tenant-prod004';
export const PROOF_SEED = 20250616;

/** Build the whole scenario runtime (wired through resolve() in clauses). */
export function createScenario() {
  const clock = fixedClock();
  const rng = seededRng(PROOF_SEED);
  const transportDouble = createInMemoryTransportDouble();
  const jobQueueDouble = createInMemoryJobQueueDouble();

  // Fixed corpus — reference-first, no fabricated provenance: every document
  // carries an external reference URI (the only provenance the content
  // authority is allowed to record for reference material).
  const corpusDocuments = [
    { id: 'doc-ref-payments-101', kind: 'reference', title: 'Payments operations primer', referenceUri: 'https://example.org/refs/payments-101' },
    { id: 'doc-ref-growth-101', kind: 'reference', title: 'Growth loops primer', referenceUri: 'https://example.org/refs/growth-101' },
    { id: 'doc-ref-podcast-101', kind: 'reference', title: 'Audio storytelling primer', referenceUri: 'https://example.org/refs/podcast-101' },
    { id: 'doc-ref-org-101', kind: 'reference', title: 'Delegation topologies primer', referenceUri: 'https://example.org/refs/org-101' },
  ];

  // The declared mission (typed shape; authoritative record created via the
  // missions repository inside clause 1 — nothing here is a seeded "result").
  const missionDraft = {
    tenant: TENANT,
    title: 'PROD-004 closed-loop demonstration mission',
    objective: 'Grow podcast engagement for a reference-first payments education audience',
    successCriteria: [{ metric: 'audience_engagement', comparator: 'increases' }],
    constraints: { budget: 1000, deadlineSteps: 40 },
  };

  // The prohibited strategy (clause 21): a social operation outside the
  // rights actions vocabulary — the distribution authority must refuse it.
  const prohibitedStrategyDraft = {
    tenant: TENANT,
    title: 'PROHIBITED: unsanctioned mass-DM blast',
    socialOperations: [{ op: 'UNSANCTIONED_BULK_DM', targets: 10_000 }],
  };

  // Deterministic lab world: measurement error responds monotonically to the
  // calibrated model-assignment parameter, so the second-run improvement is
  // MEASURED, not asserted by fiat. Base error 0.42.
  const labWorld = {
    baseError: 0.42,
    appliedCorrection: 0,
    /** Ground-truth engagement signal for a run under a given assignment. */
    trueEngagement(assignment) {
      const err = Math.max(0, this.baseError - this.appliedCorrection);
      return 1 - err * (assignment === 'calibrated' ? 0.5 : 1);
    },
  };

  return {
    tenant: TENANT,
    clock, rng, transportDouble, jobQueueDouble,
    corpusDocuments, missionDraft, prohibitedStrategyDraft, labWorld,
    /** Fresh per-run measurement ledger (clause 18/20 evidence). */
    measurements: [],
    /** Fresh per-run job ids, so zero-side-effect assertions are scoped. */
    jobIdsBeforeClause21: [],
  };
}
