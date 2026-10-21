import type { TenantId, Timestamp, Transform, TransformId } from '@mos/contracts';
import type {
  TransformCandidateFixture,
  TransformDefinitionFixture,
  TransformGateEvidenceEntryFixture,
  TransformGraphFixture,
  TransformPromotionAttemptFixture,
} from './lab-fixture-strategy-shapes.js';

/**
 * REAL-shaped LAB-011/012 fixture RECORDS (the Lab workspace composition
 * seam): the VERSIONED transform definitions across the thirteen frozen §5
 * kinds (no-op/repost FIRST-CLASS with a real zero-capability definition;
 * human-contribution/hybrid declaring human participation), the append-only
 * transform graph (a declarative DAG over artifact refs), and the §8
 * discovery candidates with THE SEVEN PROMOTION GATES' explicit evidence
 * log + the promotion-attempt audit trail (a PROMOTED candidate, a
 * gate-5-rejected composed candidate, and a REVISED discovered candidate
 * whose earlier evidence went STALE).
 */

const T0: TenantId = 'tenant-demo' as never;
const T_OTHER: TenantId = 'tenant-other' as never;

const ts = (day: string): Timestamp => `2026-${day}T12:00:00.000Z` as never;
const tid = (raw: string): TransformId => raw as never;

const cost = (amount: number) => ({ basis: 'per-invocation' as const, amount, currency: 'EUR' });
const latency = (p50: number) => ({ p50Ms: p50, p95Ms: p50 * 3, p99Ms: p50 * 5 });

// ——— LAB-011: the transform definitions (thirteen §5 kinds, versioned) ———

const definitionOf = (
  id: string,
  version: number,
  kind: TransformDefinitionFixture['kind'],
  inputName: string,
  acceptedTypes: readonly string[],
  outputTypes: readonly string[],
  capabilityRequirements: Transform['capabilityRequirements'],
  humanParticipation: boolean,
  requiresRights: boolean,
  tenantId: TenantId = T0,
): TransformDefinitionFixture => ({
  id: tid(id),
  version: version as never,
  inputTypes: [...acceptedTypes],
  outputTypes: [...outputTypes],
  parameters: { type: 'object', properties: {}, required: [] } as never,
  capabilityRequirements,
  evaluator: `evaluator:${id}` as never,
  costModel: cost(0.02),
  latencyModel: latency(4000),
  rightsRequirements: requiresRights ? [`rights:${id}-source`] as never[] : [],
  policyRequirements: requiresRights ? [`policy:${id}-derivative`] as never[] : [],
  lineageRules: ['lineage:record-parents-on-output'],
  tenantId,
  kind,
  inputConstraint: {
    name: inputName,
    acceptedTypes,
    acceptedModalities: ['video'],
    minInputs: 1,
    maxInputs: Math.max(2, acceptedTypes.length),
    requiresRights,
  },
  outputContract: { outputTypes, outputCount: 1 },
  humanParticipation,
  createdAt: ts('02-10'),
});

export const FIXTURE_TRANSFORM_DEFINITIONS: readonly TransformDefinitionFixture[] = [
  definitionOf(
    'def-noop-repost',
    1,
    'no-op-repost',
    'original-source-only',
    ['video-clip'],
    ['video-clip'],
    [],
    false,
    false,
  ),
  definitionOf(
    'def-clip-short',
    2,
    'clip',
    'clip-source-video',
    ['video-clip'],
    ['video-clip'],
    [{ capabilityId: 'detect_scenes' as never, version: 1 as never }],
    false,
    true,
  ),
  definitionOf(
    'def-anime-stylize',
    1,
    'stylization-anime',
    'stylize-source-video',
    ['video-clip'],
    ['video-clip'],
    [{ capabilityId: 'generate_video' as never, version: 1 as never }],
    false,
    true,
  ),
  definitionOf(
    'def-reaction-pip',
    1,
    'reaction',
    'reaction-source-plus-human',
    ['video-clip'],
    ['video-clip'],
    [{ capabilityId: 'compose_reaction' as never, version: 1 as never }],
    true,
    true,
  ),
  definitionOf(
    'def-podcast-highlights',
    1,
    'podcast',
    'podcast-source-audio',
    ['audio-episode'],
    ['audio-clip'],
    [
      { capabilityId: 'transcribe_audio' as never, version: 1 as never },
      { capabilityId: 'rank_clip_candidates' as never, version: 1 as never },
    ],
    false,
    true,
  ),
  definitionOf(
    'def-remix-compilation',
    1,
    'remix',
    'remix-multi-source',
    ['video-clip'],
    ['video-clip'],
    [{ capabilityId: 'render_timeline' as never, version: 1 as never }],
    false,
    true,
  ),
  definitionOf(
    'def-other-transcode',
    1,
    'crop-reframe',
    'foreign-crop',
    ['video-clip'],
    ['video-clip'],
    [{ capabilityId: 'detect_scenes' as never, version: 1 as never }],
    false,
    true,
    T_OTHER,
  ),
];

// ——— LAB-011: the append-only transform graphs ———

const artRef = (id: string): TransformGraphFixture['nodes'][number]['inputs'][number] => ({
  artifactId: id as never,
  version: 1 as never,
  tenantId: T0,
  digest: `sha256-${id}` as never,
  type: 'video-clip' as never,
  storageRef: `mos-object-store://tenant-demo/${id}` as never,
  rightsRef: `rights:${id}` as never,
  provenanceRef: `provenance:${id}` as never,
});

export const FIXTURE_TRANSFORM_GRAPHS: readonly TransformGraphFixture[] = [
  {
    id: 'graph-reaction-pipeline' as never,
    version: 1 as never,
    tenantId: T0,
    nodes: [
      {
        nodeId: 'node-clip',
        definitionId: tid('def-clip-short'),
        definitionVersion: 2 as never,
        inputs: [artRef('art-sd-001')],
        parameterization: { clipLengthSeconds: 22 } as never,
      },
      {
        nodeId: 'node-reaction',
        definitionId: tid('def-reaction-pip'),
        definitionVersion: 1 as never,
        inputs: [artRef('art-reaction-source')],
        parameterization: { pipPosition: 'bottom-right' } as never,
      },
      {
        nodeId: 'node-compose',
        definitionId: tid('def-remix-compilation'),
        definitionVersion: 1 as never,
        inputs: [],
        parameterization: { layout: 'pip' } as never,
      },
    ],
    edges: [
      { edgeId: 'edge-1', fromNodeId: 'node-clip', toNodeId: 'node-reaction' },
      { edgeId: 'edge-2', fromNodeId: 'node-reaction', toNodeId: 'node-compose' },
    ],
    createdAt: ts('03-12'),
  },
  {
    id: 'graph-repost-flow' as never,
    version: 1 as never,
    tenantId: T0,
    nodes: [
      {
        nodeId: 'node-noop',
        definitionId: tid('def-noop-repost'),
        definitionVersion: 1 as never,
        inputs: [artRef('art-sd-005')],
        parameterization: {} as never,
      },
    ],
    edges: [],
    createdAt: ts('03-13'),
  },
];

// ——— LAB-012: the discovery candidates + the seven §8 gates ———

const engineBenchmarkOf = (id: string, result: 'passed' | 'failed') => ({
  id: id as never,
  capabilityVersion: 1 as never,
  engineVersion: 2 as never,
  benchmarkCorpusRef: `corpus:${id}` as never,
  evaluatorVersion: 1 as never,
  metrics: { latencyP50Ms: 4000 } as never,
  cost: { amount: 0.02, currency: 'EUR' } as never,
  latency: 4000 as never,
  licenseStatus: 'approved' as never,
  result,
});

const proposedContractOf = (
  kind: TransformDefinitionFixture['kind'],
  capabilities: Transform['capabilityRequirements'],
  humanParticipation: boolean,
) => ({
  kind,
  inputConstraint: {
    name: `${kind}-declared-input`,
    acceptedTypes: ['video-clip'],
    acceptedModalities: ['video'],
    minInputs: 1,
    maxInputs: 2,
    requiresRights: true,
  },
  outputContract: { outputTypes: ['video-clip'], outputCount: 1 },
  parameters: { type: 'object', properties: {}, required: [] } as never,
  capabilityRequirements: capabilities,
  humanParticipation,
  evaluator: `evaluator:cand-${kind}` as never,
  costModel: cost(0.02),
  latencyModel: latency(4000),
  rightsRequirements: [`rights:cand-${kind}`] as never[],
  policyRequirements: [`policy:cand-${kind}`],
  lineageRules: ['lineage:record-parents-on-output'],
});

/** Candidate 1: KNOWN, all seven gates recorded at v1, PROMOTED. */
export const FIXTURE_TRANSFORM_CANDIDATES: readonly TransformCandidateFixture[] = [
  {
    id: 'cand-known-clip' as never,
    version: 1,
    tenantId: T0,
    origin: 'known',
    citation: { kind: 'known', definitionId: tid('def-clip-short'), definitionVersion: 2 },
    derivation: {
      ideaNodeIds: ['idea-001'] as never[],
      featureBundleIds: ['fbundle-sd-002'] as never[],
      corpusId: 'corpus-sourdough-eu' as never,
      corpusVersion: 6,
      learnedStrategyCandidateIds: [],
      organizationSearchResultIds: [],
      provenanceRef: 'provenance:cand-known-clip' as never,
    },
    proposedContract: proposedContractOf('clip', [{ capabilityId: 'detect_scenes' as never, version: 1 as never }], false),
    targetDefinitionId: tid('def-clip-short'),
    createdAt: ts('03-14'),
  },
  {
    id: 'cand-composed-reaction' as never,
    version: 1,
    tenantId: T0,
    origin: 'composed',
    citation: {
      kind: 'composed',
      graphId: 'graph-reaction-pipeline' as never,
      graphVersion: 1,
      members: [
        { definitionId: tid('def-clip-short'), definitionVersion: 2 },
        { definitionId: tid('def-reaction-pip'), definitionVersion: 1 },
        { definitionId: tid('def-remix-compilation'), definitionVersion: 1 },
      ],
    },
    derivation: {
      ideaNodeIds: ['idea-005'] as never[],
      featureBundleIds: [],
      corpusId: 'corpus-sourdough-eu' as never,
      corpusVersion: 6,
      learnedStrategyCandidateIds: [],
      organizationSearchResultIds: ['orgsearch-reach-1'] as never[],
      provenanceRef: 'provenance:cand-composed-reaction' as never,
    },
    proposedContract: proposedContractOf('hybrid', [{ capabilityId: 'compose_reaction' as never, version: 1 as never }], true),
    targetDefinitionId: tid('def-reaction-pipeline'),
    createdAt: ts('03-15'),
  },
  {
    id: 'cand-discovered-anime' as never,
    version: 2,
    tenantId: T0,
    origin: 'discovered',
    citation: null,
    derivation: {
      ideaNodeIds: ['idea-005', 'idea-003'] as never[],
      featureBundleIds: ['fbundle-sd-002'] as never[],
      corpusId: 'corpus-sourdough-eu' as never,
      corpusVersion: 6,
      learnedStrategyCandidateIds: ['learned-remix-2'] as never[],
      organizationSearchResultIds: [],
      provenanceRef: 'provenance:cand-discovered-anime' as never,
    },
    proposedContract: proposedContractOf('stylization-anime', [{ capabilityId: 'generate_video' as never, version: 1 as never }], false),
    targetDefinitionId: tid('def-anime-stylize-next'),
    createdAt: ts('03-16'),
  },
  {
    id: 'cand-other-901' as never,
    version: 1,
    tenantId: T_OTHER,
    origin: 'known',
    citation: { kind: 'known', definitionId: tid('def-other-transcode'), definitionVersion: 1 },
    derivation: {
      ideaNodeIds: [] as never[],
      featureBundleIds: [] as never[],
      corpusId: 'corpus-other-espresso' as never,
      corpusVersion: 1,
      learnedStrategyCandidateIds: [],
      organizationSearchResultIds: [],
      provenanceRef: 'provenance:cand-other-901' as never,
    },
    proposedContract: proposedContractOf('crop-reframe', [{ capabilityId: 'detect_scenes' as never, version: 1 as never }], false),
    targetDefinitionId: tid('def-other-transcode'),
    createdAt: ts('03-17'),
  },
];

/** The append-only gate-evidence log (entries cite EXACT candidate versions). */
export const FIXTURE_TRANSFORM_GATE_EVIDENCE: readonly TransformGateEvidenceEntryFixture[] = [
  // cand-known-clip @ v1 — ALL SEVEN gates recorded.
  {
    entryId: 'ge-001',
    candidateId: 'cand-known-clip' as never,
    candidateVersion: 1,
    evidence: {
      gate: 'contract-validation',
      validated: { kind: 'clip', inputConstraintName: 'clip-declared-input', outputTypes: ['video-clip'], humanParticipation: false },
    },
    recordedAt: ts('03-14'),
  },
  {
    entryId: 'ge-002',
    candidateId: 'cand-known-clip' as never,
    candidateVersion: 1,
    evidence: { gate: 'capability-feasibility', resolvedRequirements: [{ capabilityId: 'detect_scenes' as never, version: 1 as never }] },
    recordedAt: ts('03-14'),
  },
  {
    entryId: 'ge-003',
    candidateId: 'cand-known-clip' as never,
    candidateVersion: 1,
    evidence: {
      gate: 'rights-policy-feasibility',
      rightsRequirements: ['rights:cand-clip'] as never[],
      policyRequirements: ['policy:cand-clip'],
      evaluation: 'structural-declaration-only',
    },
    recordedAt: ts('03-14'),
  },
  {
    entryId: 'ge-004',
    candidateId: 'cand-known-clip' as never,
    candidateVersion: 1,
    evidence: {
      gate: 'evaluator',
      evaluatorRef: 'evaluator:cand-clip' as never,
      inputSchema: { type: 'object', properties: { video: { type: 'string' } }, required: ['video'] } as never,
      outputSchema: { type: 'object', properties: { verdict: { type: 'string' } }, required: ['verdict'] } as never,
    },
    recordedAt: ts('03-14'),
  },
  {
    entryId: 'ge-005',
    candidateId: 'cand-known-clip' as never,
    candidateVersion: 1,
    evidence: { gate: 'bounded-benchmark-evidence', benchmark: engineBenchmarkOf('bench-engine-clip', 'passed') },
    recordedAt: ts('03-14'),
  },
  {
    entryId: 'ge-006',
    candidateId: 'cand-known-clip' as never,
    candidateVersion: 1,
    evidence: { gate: 'immutable-version', candidateVersion: 1, promotionPath: 'registry-append-only' },
    recordedAt: ts('03-14'),
  },
  { entryId: 'ge-007', candidateId: 'cand-known-clip' as never, candidateVersion: 1, evidence: { gate: 'provenance' }, recordedAt: ts('03-14') },
  // cand-composed-reaction @ v1 — six gates recorded; gate 5 evidence is a
  // COMPLETE-but-FAILED benchmark (attaches, fails promotion by name).
  {
    entryId: 'ge-101',
    candidateId: 'cand-composed-reaction' as never,
    candidateVersion: 1,
    evidence: {
      gate: 'contract-validation',
      validated: { kind: 'hybrid', inputConstraintName: 'hybrid-declared-input', outputTypes: ['video-clip'], humanParticipation: true },
    },
    recordedAt: ts('03-15'),
  },
  {
    entryId: 'ge-102',
    candidateId: 'cand-composed-reaction' as never,
    candidateVersion: 1,
    evidence: { gate: 'capability-feasibility', resolvedRequirements: [{ capabilityId: 'compose_reaction' as never, version: 1 as never }] },
    recordedAt: ts('03-15'),
  },
  {
    entryId: 'ge-103',
    candidateId: 'cand-composed-reaction' as never,
    candidateVersion: 1,
    evidence: {
      gate: 'rights-policy-feasibility',
      rightsRequirements: ['rights:cand-hybrid'] as never[],
      policyRequirements: ['policy:cand-hybrid'],
      evaluation: 'structural-declaration-only',
    },
    recordedAt: ts('03-15'),
  },
  {
    entryId: 'ge-104',
    candidateId: 'cand-composed-reaction' as never,
    candidateVersion: 1,
    evidence: {
      gate: 'evaluator',
      evaluatorRef: 'evaluator:cand-hybrid' as never,
      inputSchema: { type: 'object', properties: { video: { type: 'string' } }, required: ['video'] } as never,
      outputSchema: { type: 'object', properties: { verdict: { type: 'string' } }, required: ['verdict'] } as never,
    },
    recordedAt: ts('03-15'),
  },
  {
    entryId: 'ge-105',
    candidateId: 'cand-composed-reaction' as never,
    candidateVersion: 1,
    evidence: { gate: 'bounded-benchmark-evidence', benchmark: engineBenchmarkOf('bench-engine-hybrid', 'failed') },
    recordedAt: ts('03-15'),
  },
  { entryId: 'ge-106', candidateId: 'cand-composed-reaction' as never, candidateVersion: 1, evidence: { gate: 'provenance' }, recordedAt: ts('03-15') },
  // cand-discovered-anime @ v1 (now STALE — the candidate is at v2): four gates.
  {
    entryId: 'ge-201',
    candidateId: 'cand-discovered-anime' as never,
    candidateVersion: 1,
    evidence: {
      gate: 'contract-validation',
      validated: { kind: 'stylization-anime', inputConstraintName: 'stylization-anime-declared-input', outputTypes: ['video-clip'], humanParticipation: false },
    },
    recordedAt: ts('03-16'),
  },
  {
    entryId: 'ge-202',
    candidateId: 'cand-discovered-anime' as never,
    candidateVersion: 1,
    evidence: { gate: 'capability-feasibility', resolvedRequirements: [{ capabilityId: 'generate_video' as never, version: 1 as never }] },
    recordedAt: ts('03-16'),
  },
  { entryId: 'ge-203', candidateId: 'cand-discovered-anime' as never, candidateVersion: 1, evidence: { gate: 'provenance' }, recordedAt: ts('03-16') },
  { entryId: 'ge-204', candidateId: 'cand-discovered-anime' as never, candidateVersion: 1, evidence: { gate: 'immutable-version', candidateVersion: 1, promotionPath: 'registry-append-only' }, recordedAt: ts('03-16') },
  // cand-discovered-anime @ v2 (fresh): two gates re-recorded after revision.
  {
    entryId: 'ge-211',
    candidateId: 'cand-discovered-anime' as never,
    candidateVersion: 2,
    evidence: {
      gate: 'contract-validation',
      validated: { kind: 'stylization-anime', inputConstraintName: 'stylization-anime-declared-input', outputTypes: ['video-clip'], humanParticipation: false },
    },
    recordedAt: ts('03-18'),
  },
  {
    entryId: 'ge-212',
    candidateId: 'cand-discovered-anime' as never,
    candidateVersion: 2,
    evidence: { gate: 'capability-feasibility', resolvedRequirements: [{ capabilityId: 'generate_video' as never, version: 1 as never }] },
    recordedAt: ts('03-18'),
  },
];

/** The append-only promotion-attempt audit trail. */
export const FIXTURE_TRANSFORM_PROMOTION_ATTEMPTS: readonly TransformPromotionAttemptFixture[] = [
  {
    attempt: 1,
    candidateId: 'cand-known-clip' as never,
    candidateVersion: 1,
    outcome: 'promoted',
    failedGate: null,
    reason: 'all seven §8 gates passed in order; the candidate froze at v1 and appended as def-clip-short v2',
    definitionId: tid('def-clip-short'),
    definitionVersion: 2,
    attemptedAt: ts('03-14'),
  },
  {
    attempt: 1,
    candidateId: 'cand-composed-reaction' as never,
    candidateVersion: 1,
    outcome: 'rejected',
    failedGate: 'bounded-benchmark-evidence',
    reason: 'the attached engine benchmark record is complete but its result is "failed" — promotion fails closed at gate 5',
    definitionId: null,
    definitionVersion: null,
    attemptedAt: ts('03-15'),
  },
  {
    attempt: 1,
    candidateId: 'cand-discovered-anime' as never,
    candidateVersion: 1,
    outcome: 'rejected',
    failedGate: 'rights-policy-feasibility',
    reason: 'the declared rights/policy evidence under-declared what the proposed contract requires',
    definitionId: null,
    definitionVersion: null,
    attemptedAt: ts('03-17'),
  },
];
