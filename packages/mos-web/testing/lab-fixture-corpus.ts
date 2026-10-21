import type { ArtifactRef, StrategyRef, TenantId, Timestamp } from '@mos/contracts';
import type {
  CorpusVersionFixture,
  FeatureBundleFixture,
  FeatureKindRequirementFixture,
  IdeaEdgeFixture,
  IdeaNodeFixture,
  ReferenceDocumentFixture,
} from './lab-fixture-workspace-shapes.js';
import { REACH_SCENARIO } from './lab-fixture-support.js';

/**
 * REAL-shaped LAB-001/002/003 fixture RECORDS (the Lab workspace composition
 * seam): the reference-first corpus chain (documents + append-only version
 * snapshots), the multimodal feature bundles with their DECLARED capability
 * requirements, and the Idea Graph (derivation-mandatory nodes + typed
 * weighted versioned edges).
 *
 * Coherence pins (the workspace hangs together with the LAB-017 fixtures):
 * the corpus chain `corpus-sourdough-eu` reaches version 6 — exactly the
 * `corpusVersion` `scenario-reach-sourdough` pins — and the idea/graph
 * records cite these documents, so derivation chains trace back to real
 * acquired artifact references.
 *
 * Cross-tenant isolation (§31): `tenant-other` holds its own corpus chain
 * and idea node; the doubles never leak them into the demo scope.
 */

const T0: TenantId = 'tenant-demo' as never;
const T_OTHER: TenantId = 'tenant-other' as never;

/** Build an acquired content artifact reference (reference-first). */
const artifactRefOf = (
  artifactId: string,
  version: number,
  tenantId: string,
  type: string,
): ArtifactRef => ({
  artifactId: artifactId as never,
  version: version as never,
  tenantId: tenantId as never,
  digest: `sha256-${artifactId}-${version}` as never,
  type: type as never,
  storageRef: `mos-object-store://${tenantId}/${artifactId}` as never,
  rightsRef: `rights:${artifactId}` as never,
  provenanceRef: `provenance:${artifactId}` as never,
});

const ts = (day: string): Timestamp => `2026-${day}T12:00:00.000Z` as never;

// ——— LAB-001: the reference documents ———

/** The demo tenant's acquired reference documents (reference-first). */
export const FIXTURE_REFERENCE_DOCUMENTS: readonly ReferenceDocumentFixture[] = [
  {
    id: 'doc-sd-001' as never,
    version: 1 as never,
    tenantId: T0,
    niche: 'sourdough-baking',
    platform: 'short-video',
    modality: 'video',
    artifact: artifactRefOf('art-sd-001', 1, 'tenant-demo', 'video-clip'),
    sourceRefs: ['https://example.org/hb-post/crumb-timelapse'],
    acquiredAt: ts('01-12'),
    rightsRef: 'rights:art-sd-001' as never,
    provenanceRef: 'provenance:acq-sd-001' as never,
  },
  {
    id: 'doc-sd-002' as never,
    version: 1 as never,
    tenantId: T0,
    niche: 'sourdough-baking',
    platform: 'short-video',
    modality: 'text',
    artifact: artifactRefOf('art-sd-002', 1, 'tenant-demo', 'post-text'),
    sourceRefs: ['https://example.org/hb-post/cadence-comments'],
    acquiredAt: ts('01-26'),
    rightsRef: 'rights:art-sd-002' as never,
    provenanceRef: 'provenance:acq-sd-002' as never,
  },
  {
    id: 'doc-sd-003' as never,
    version: 1 as never,
    tenantId: T0,
    niche: 'sourdough-baking',
    platform: 'short-video',
    modality: 'image',
    artifact: artifactRefOf('art-sd-003', 1, 'tenant-demo', 'still-image'),
    sourceRefs: ['https://example.org/hb-gallery/crumb-boards'],
    acquiredAt: ts('02-09'),
    rightsRef: 'rights:art-sd-003' as never,
    provenanceRef: 'provenance:acq-sd-003' as never,
  },
  {
    id: 'doc-sd-004' as never,
    version: 1 as never,
    tenantId: T0,
    niche: 'sourdough-baking',
    platform: 'short-video',
    modality: 'structured',
    artifact: artifactRefOf('art-sd-004', 2, 'tenant-demo', 'analytics-export'),
    sourceRefs: ['https://example.org/hb-analytics/weekly-reach'],
    acquiredAt: ts('02-23'),
    rightsRef: 'rights:art-sd-004' as never,
    provenanceRef: 'provenance:acq-sd-004' as never,
  },
  {
    id: 'doc-sd-005' as never,
    version: 1 as never,
    tenantId: T0,
    niche: 'sourdough-baking',
    platform: 'short-video',
    modality: 'mixed',
    artifact: artifactRefOf('art-sd-005', 1, 'tenant-demo', 'post-thread'),
    sourceRefs: ['https://example.org/hb-post/launch-week-thread'],
    acquiredAt: ts('03-09'),
    rightsRef: 'rights:art-sd-005' as never,
    provenanceRef: 'provenance:acq-sd-005' as never,
  },
  {
    id: 'doc-other-901' as never,
    version: 1 as never,
    tenantId: T_OTHER,
    niche: 'home-espresso',
    platform: 'short-video',
    modality: 'video',
    artifact: artifactRefOf('art-other-901', 1, 'tenant-other', 'video-clip'),
    sourceRefs: ['https://example.org/espresso/pulls'],
    acquiredAt: ts('03-02'),
    rightsRef: 'rights:art-other-901' as never,
    provenanceRef: 'provenance:acq-other-901' as never,
  },
];

// ——— LAB-001: the append-only corpus version snapshots ———

/** The demo tenant's corpus chains (append-only snapshot history). */
export const FIXTURE_CORPUS_VERSIONS: readonly CorpusVersionFixture[] = [
  {
    corpusId: 'corpus-sourdough-eu' as never,
    version: 5 as never,
    tenantId: T0,
    documentRefs: ['doc-sd-001', 'doc-sd-002', 'doc-sd-003'] as never[],
    createdAt: ts('02-15'),
    notes: 'v5: first three acquired references snapshot for feature computation',
  },
  {
    corpusId: 'corpus-sourdough-eu' as never,
    version: 6 as never,
    tenantId: T0,
    documentRefs: ['doc-sd-001', 'doc-sd-002', 'doc-sd-003', 'doc-sd-004', 'doc-sd-005'] as never[],
    createdAt: ts('03-15'),
    notes: 'v6: adds the analytics export and the launch-week thread — the version scenario-reach-sourdough pins',
  },
  {
    corpusId: 'corpus-other-espresso' as never,
    version: 1 as never,
    tenantId: T_OTHER,
    documentRefs: ['doc-other-901'] as never[],
    createdAt: ts('03-05'),
    notes: null,
  },
];

// ——— LAB-002: the feature bundles + declared requirements ———

/** The demo tenant's feature bundles (computed references + scalar manifests). */
export const FIXTURE_FEATURE_BUNDLES: readonly FeatureBundleFixture[] = [
  {
    id: 'fbundle-sd-001' as never,
    version: 1 as never,
    tenantId: T0,
    documentId: 'doc-sd-002' as never,
    features: [
      {
        kind: 'text-embedding',
        artifact: artifactRefOf('art-fb-001', 1, 'tenant-demo', 'feature-embedding'),
        metadata: { dimensionCount: 768, modelFamily: 'text-embed-v3', trackLength: 0 },
      },
    ],
    provenanceRef: 'provenance:feat-sd-001' as never,
    createdAt: ts('02-16'),
    detachedAt: null,
  },
  {
    id: 'fbundle-sd-002' as never,
    version: 2 as never,
    tenantId: T0,
    documentId: 'doc-sd-001' as never,
    features: [
      {
        kind: 'video-features',
        artifact: artifactRefOf('art-fb-002', 2, 'tenant-demo', 'feature-track'),
        metadata: { dimensionCount: 512, modelFamily: 'video-track-v2', trackLength: 1380 },
      },
      {
        kind: 'audio-features',
        artifact: artifactRefOf('art-fb-003', 1, 'tenant-demo', 'feature-track'),
        metadata: { dimensionCount: 128, modelFamily: 'audio-track-v1', trackLength: 1380 },
      },
    ],
    provenanceRef: 'provenance:feat-sd-002' as never,
    createdAt: ts('02-17'),
    detachedAt: null,
  },
  {
    id: 'fbundle-sd-003' as never,
    version: 1 as never,
    tenantId: T0,
    documentId: 'doc-sd-003' as never,
    features: [
      {
        kind: 'image-features',
        artifact: artifactRefOf('art-fb-004', 1, 'tenant-demo', 'feature-grid'),
        metadata: { dimensionCount: 2048, modelFamily: 'image-grid-v1', trackLength: 0 },
      },
    ],
    provenanceRef: 'provenance:feat-sd-003' as never,
    createdAt: ts('02-18'),
    detachedAt: null,
  },
  {
    id: 'fbundle-sd-000' as never,
    version: 2 as never,
    tenantId: T0,
    documentId: 'doc-sd-004' as never,
    features: [
      {
        kind: 'structured-features',
        artifact: artifactRefOf('art-fb-005', 1, 'tenant-demo', 'feature-table'),
        metadata: { dimensionCount: 24, modelFamily: 'table-feats-v1', trackLength: 0 },
      },
    ],
    provenanceRef: 'provenance:feat-sd-000' as never,
    createdAt: ts('02-24'),
    detachedAt: ts('03-01'),
  },
];

/**
 * The DECLARED capability requirements per feature kind (LAB-002
 * declaration-only surface; ids from the @mos/capabilities §5 seed catalog).
 */
export const FIXTURE_FEATURE_REQUIREMENTS: readonly FeatureKindRequirementFixture[] = [
  { kind: 'text-embedding', capability: { capabilityId: 'transcribe_audio' as never, version: 1 as never } },
  { kind: 'image-features', capability: { capabilityId: 'semantic_video_relevance' as never, version: 1 as never } },
  { kind: 'audio-features', capability: { capabilityId: 'transcribe_audio' as never, version: 1 as never } },
  { kind: 'video-features', capability: { capabilityId: 'detect_scenes' as never, version: 1 as never } },
  { kind: 'structured-features', capability: { capabilityId: 'rank_clip_candidates' as never, version: 1 as never } },
];

// ——— LAB-003: the Idea Graph ———

/** The demo tenant's idea nodes (derivation-mandatory, versioned). */
export const FIXTURE_IDEA_NODES: readonly IdeaNodeFixture[] = [
  {
    id: 'idea-001' as never,
    version: 2 as never,
    tenantId: T0,
    statement:
      'Short sourdough clips that show the crumb structure sustain watch-through better than process narration.',
    embeddingRef: artifactRefOf('art-idea-001', 1, 'tenant-demo', 'feature-embedding'),
    derivation: { documents: ['doc-sd-001', 'doc-sd-003'] as never[], featureBundles: [] },
    provenanceRef: 'provenance:idea-001' as never,
    createdAt: ts('02-20'),
  },
  {
    id: 'idea-002' as never,
    version: 1 as never,
    tenantId: T0,
    statement:
      'Posting cadence above five clips a week visibly fatigues the home-baker audience.',
    embeddingRef: null,
    derivation: { documents: ['doc-sd-004'] as never[], featureBundles: ['fbundle-sd-001'] as never[] },
    provenanceRef: 'provenance:idea-002' as never,
    createdAt: ts('02-26'),
  },
  {
    id: 'idea-003' as never,
    version: 1 as never,
    tenantId: T0,
    statement:
      'Evening posts outperform morning posts in the EU home-baker niche.',
    embeddingRef: null,
    derivation: { documents: ['doc-sd-002'] as never[], featureBundles: [] },
    provenanceRef: 'provenance:idea-003' as never,
    createdAt: ts('02-27'),
  },
  {
    id: 'idea-004' as never,
    version: 1 as never,
    tenantId: T0,
    statement:
      'Audience fatigue measurably recovers after a ten-day posting pause.',
    embeddingRef: null,
    derivation: { documents: ['doc-sd-004', 'doc-sd-005'] as never[], featureBundles: [] },
    provenanceRef: 'provenance:idea-004' as never,
    createdAt: ts('03-10'),
  },
  {
    id: 'idea-005' as never,
    version: 1 as never,
    tenantId: T0,
    statement:
      'Combining a crumb close-up with a short voiceover raises completion on cold audiences.',
    embeddingRef: null,
    derivation: { documents: ['doc-sd-001'] as never[], featureBundles: ['fbundle-sd-002'] as never[] },
    provenanceRef: 'provenance:idea-005' as never,
    createdAt: ts('03-11'),
  },
  {
    id: 'idea-006' as never,
    version: 1 as never,
    tenantId: T0,
    statement:
      'Competitor starter-kit launches steal qualified reach during launch weeks.',
    embeddingRef: null,
    derivation: { documents: ['doc-sd-005'] as never[], featureBundles: [] },
    provenanceRef: 'provenance:idea-006' as never,
    createdAt: ts('03-12'),
  },
  {
    id: 'idea-other-901' as never,
    version: 1 as never,
    tenantId: T_OTHER,
    statement: 'Espresso shot videos trend on weekend mornings.',
    embeddingRef: null,
    derivation: { documents: ['doc-other-901'] as never[], featureBundles: [] },
    provenanceRef: 'provenance:idea-other-901' as never,
    createdAt: ts('03-13'),
  },
];

/** The demo tenant's typed, weighted, versioned idea edges. */
export const FIXTURE_IDEA_EDGES: readonly IdeaEdgeFixture[] = [
  {
    id: 'iedge-001' as never,
    version: 1 as never,
    tenantId: T0,
    fromNodeId: 'idea-003' as never,
    toNodeId: 'idea-001' as never,
    kind: 'derives-from',
    weight: 0.6,
    createdAt: ts('02-27'),
  },
  {
    id: 'iedge-002' as never,
    version: 1 as never,
    tenantId: T0,
    fromNodeId: 'idea-004' as never,
    toNodeId: 'idea-002' as never,
    kind: 'contradicts',
    weight: -0.7,
    createdAt: ts('03-10'),
  },
  {
    id: 'iedge-003' as never,
    version: 1 as never,
    tenantId: T0,
    fromNodeId: 'idea-005' as never,
    toNodeId: 'idea-001' as never,
    kind: 'combines-with',
    weight: 0.8,
    createdAt: ts('03-11'),
  },
  {
    id: 'iedge-004' as never,
    version: 2 as never,
    tenantId: T0,
    fromNodeId: 'idea-005' as never,
    toNodeId: 'idea-002' as never,
    kind: 'derives-from',
    weight: 0.5,
    createdAt: ts('03-12'),
  },
  {
    id: 'iedge-005' as never,
    version: 1 as never,
    tenantId: T0,
    fromNodeId: 'idea-006' as never,
    toNodeId: 'idea-005' as never,
    kind: 'competes-with',
    weight: -0.3,
    createdAt: ts('03-12'),
  },
  {
    id: 'iedge-006' as never,
    version: 1 as never,
    tenantId: T0,
    fromNodeId: 'idea-002' as never,
    toNodeId: 'idea-001' as never,
    kind: 'supports',
    weight: 0.4,
    createdAt: ts('03-13'),
  },
];

/** The corpus scenario pin the fixtures align with (exported for the double). */
export const CORPUS_SCENARIO_PIN = {
  scenarioRef: REACH_SCENARIO.id as string,
  corpusId: 'corpus-sourdough-eu',
  corpusVersion: 6,
} as const;

/** A strategy ref helper reused by the simulator fixtures. */
export const strategyRefOf = (raw: string): StrategyRef => raw as never;
