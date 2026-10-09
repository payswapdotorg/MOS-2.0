import type { StudioArtifactPackage, StudioArtifactRef } from '@mos/studio';
import { DEMO_TENANT, OTHER_TENANT } from './studio-fixture-sessions.js';
import { artifact, packageVersion } from './studio-fixture-builders.js';

/**
 * REAL-shape artifact-package fixtures (UX-002) — the immutable version
 * chains the disclosed composition double browses: the §14 synthetic-labeled
 * chain (v1 accepted with an engine-generated final; v2 the trim treatment
 * successor awaiting evaluation), the human-only chain (truthful NO-synthetic
 * disclosure), and one cross-tenant package that must never leak (§31).
 * Type-only `@mos/studio` imports (erased at runtime).
 */

const A = artifact;

const REACTION_1_RAW_CAM = A({
  artifactId: 'raw-reaction-cam-1',
  version: 1,
  tenantId: DEMO_TENANT,
  type: 'video',
  stage: 'raw',
  creationMethod: 'human-capture',
  storageRef: 'raw/reaction-cam-1',
});
const REACTION_1_RAW_SOURCE = A({
  artifactId: 'raw-source-import-1',
  version: 1,
  tenantId: DEMO_TENANT,
  type: 'video',
  stage: 'raw',
  creationMethod: 'human-import',
  storageRef: 'raw/source-import-1',
});
const REACTION_1_INTERMEDIATE = A({
  artifactId: 'int-reaction-mix-1',
  version: 1,
  tenantId: DEMO_TENANT,
  type: 'video',
  stage: 'intermediate',
  creationMethod: 'organization-transform',
  storageRef: 'intermediate/reaction-mix-1',
  parents: [REACTION_1_RAW_CAM, REACTION_1_RAW_SOURCE],
});
const REACTION_1_FINAL = A({
  artifactId: 'final-reaction-pip-1',
  version: 1,
  tenantId: DEMO_TENANT,
  type: 'video',
  stage: 'final',
  creationMethod: 'composition',
  storageRef: 'final/reaction-pip-1',
  parents: [REACTION_1_INTERMEDIATE],
});
const REACTION_1_SYNTHETIC_INTRO = A({
  // §14: engine-generated material retains synthetic/generated provenance.
  artifactId: 'final-reaction-intro-1',
  version: 1,
  tenantId: DEMO_TENANT,
  type: 'video',
  stage: 'final',
  creationMethod: 'engine-generated',
  storageRef: 'final/reaction-intro-1',
  parents: [REACTION_1_INTERMEDIATE],
});
const REACTION_2_INTERMEDIATE = A({
  artifactId: 'int-reaction-trim-1',
  version: 1,
  tenantId: DEMO_TENANT,
  type: 'video',
  stage: 'intermediate',
  creationMethod: 'organization-transform',
  storageRef: 'intermediate/reaction-trim-1',
  parents: [REACTION_1_FINAL],
});
const REACTION_2_FINAL = A({
  artifactId: 'final-reaction-pip-2',
  version: 1,
  tenantId: DEMO_TENANT,
  type: 'video',
  stage: 'final',
  creationMethod: 'composition',
  storageRef: 'final/reaction-pip-2',
  parents: [REACTION_2_INTERMEDIATE],
});
const PODCAST_3_RAW = A({
  artifactId: 'raw-podcast-mic-3',
  version: 1,
  tenantId: DEMO_TENANT,
  type: 'audio',
  stage: 'raw',
  creationMethod: 'human-capture',
  storageRef: 'raw/podcast-mic-3',
});
const PODCAST_3_INTERMEDIATE = A({
  artifactId: 'int-podcast-master-1',
  version: 1,
  tenantId: DEMO_TENANT,
  type: 'audio',
  stage: 'intermediate',
  creationMethod: 'organization-transform',
  storageRef: 'intermediate/podcast-master-1',
  parents: [PODCAST_3_RAW],
});
const PODCAST_3_FINAL = A({
  artifactId: 'final-podcast-episode-1',
  version: 1,
  tenantId: DEMO_TENANT,
  type: 'audio',
  stage: 'final',
  creationMethod: 'composition',
  storageRef: 'final/podcast-episode-1',
  parents: [PODCAST_3_INTERMEDIATE],
});
const OTHER_RAW = A({
  artifactId: 'raw-other-cam-1',
  version: 1,
  tenantId: OTHER_TENANT,
  type: 'video',
  stage: 'raw',
  creationMethod: 'human-capture',
  storageRef: 'raw/other-cam-1',
});
const OTHER_FINAL = A({
  artifactId: 'final-other-1',
  version: 1,
  tenantId: OTHER_TENANT,
  type: 'video',
  stage: 'final',
  creationMethod: 'composition',
  storageRef: 'final/other-1',
  parents: [OTHER_RAW],
});

export const FIXTURE_PACKAGES: readonly StudioArtifactPackage[] = Object.freeze([
  // The §14 synthetic-labeled chain: v1 accepted (engine-generated intro +
  // human composition), v2 the immutable trim treatment successor.
  packageVersion({
    id: 'pkg-reaction-1',
    version: 1,
    sessionRef: 'session-reaction-1',
    createdAt: '2026-06-02T10:12:00.000Z',
    tenantId: DEMO_TENANT,
    raw: [REACTION_1_RAW_CAM, REACTION_1_RAW_SOURCE],
    intermediate: [REACTION_1_INTERMEDIATE],
    finals: [REACTION_1_FINAL, REACTION_1_SYNTHETIC_INTRO],
    containsSyntheticMaterial: true,
    consentRefs: ['consent-102', 'consent-103', 'consent-104'],
    allRawArtifactsCovered: true,
    evaluation: {
      status: 'evaluated',
      outcome: 'accepted',
      evaluationRef: 'mos-studio:review:1',
    },
    editGraphVersion: 1,
    otioInterchange: true,
    cost: { currency: 'USD', amount: '12.40' },
    durations: { capture: 720, processing: 3600, total: 4400 },
  }),
  packageVersion({
    id: 'pkg-reaction-1',
    version: 2,
    sessionRef: 'session-reaction-1',
    createdAt: '2026-06-02T11:40:00.000Z',
    tenantId: DEMO_TENANT,
    raw: [REACTION_1_RAW_CAM, REACTION_1_RAW_SOURCE],
    intermediate: [REACTION_1_INTERMEDIATE, REACTION_2_INTERMEDIATE],
    finals: [REACTION_2_FINAL, REACTION_1_SYNTHETIC_INTRO],
    containsSyntheticMaterial: true,
    consentRefs: ['consent-102', 'consent-103', 'consent-104'],
    allRawArtifactsCovered: true,
    // The REAL runtime marks a treatment successor's evaluation
    // treatment-requested while it awaits its own evaluation.
    evaluation: { status: 'pending', outcome: 'treatment-requested' },
    editGraphVersion: 2,
    otioInterchange: true,
    cost: { currency: 'USD', amount: '2.10' },
    durations: { capture: 720, processing: 900, total: 1700 },
  }),
  // The human-only chain: §14 disclosure says NO synthetic material.
  packageVersion({
    id: 'pkg-podcast-3',
    version: 1,
    sessionRef: 'session-podcast-3',
    createdAt: '2026-05-28T15:32:00.000Z',
    tenantId: DEMO_TENANT,
    raw: [PODCAST_3_RAW],
    intermediate: [PODCAST_3_INTERMEDIATE],
    finals: [PODCAST_3_FINAL],
    containsSyntheticMaterial: false,
    consentRefs: ['consent-501', 'consent-502'],
    allRawArtifactsCovered: true,
    evaluation: {
      status: 'evaluated',
      outcome: 'accepted',
      evaluationRef: 'mos-studio:review:7',
    },
    editGraphVersion: 1,
    otioInterchange: false,
    cost: { currency: 'USD', amount: '3.75' },
    durations: { capture: 2400, processing: 1800, total: 4300 },
  }),
  // Cross-tenant package (§31): never listed for the demo scope.
  packageVersion({
    id: 'pkg-other-1',
    version: 1,
    sessionRef: 'session-other-1',
    createdAt: '2026-06-02T10:02:00.000Z',
    tenantId: OTHER_TENANT,
    raw: [OTHER_RAW],
    intermediate: [],
    finals: [OTHER_FINAL],
    containsSyntheticMaterial: false,
    consentRefs: ['consent-other-1', 'consent-other-2'],
    allRawArtifactsCovered: true,
    evaluation: { status: 'evaluated', outcome: 'accepted', evaluationRef: 'mos-studio:review:42' },
    editGraphVersion: 1,
    otioInterchange: false,
    cost: { currency: 'USD', amount: '5.00' },
    durations: { capture: 600, processing: 1200, total: 1900 },
  }),
]);

/** The first artifact of a package pins its tenant (fixture lookup helper). */
export function fixturePackageTenantId(pkg: StudioArtifactPackage): string {
  const first: StudioArtifactRef | undefined = pkg.rawArtifacts[0];
  return String(first?.tenantId ?? '');
}
