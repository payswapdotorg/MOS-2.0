import type { AppShellView, ShellSectionView, TenantContextView } from '../dist/src/ports/app-shell.js';
import type { MissionsPageData, StudioPageData } from '../dist/src/routes/route-loading.js';
import type {
  CreateMissionIntentDeclaration,
  MissionDetailView,
  MissionSummaryView,
} from '../dist/src/ports/mission-catalog.js';
import type {
  StudioSessionDetailView,
  StudioSessionSummaryView,
} from '../dist/src/ports/studio-directory.js';
import type {
  StudioPackageSummaryView,
  StudioVersionChainView,
} from '../dist/src/ports/studio-packages.js';

/**
 * Shared fixtures for the component render tests (UX-001 / UX-002) — disclosed
 * PRESENTATION doubles: plain view models (the shapes the view ports return),
 * never domain records. Extracted from the original single test file to keep
 * every managed file within the ≤500-line architecture policy.
 */

export const SECTIONS: readonly ShellSectionView[] = [
  { id: 'home', label: 'Home', route: '/', availability: { kind: 'available' } },
  { id: 'missions', label: 'Missions', route: '/missions', availability: { kind: 'available' } },
  { id: 'studio', label: 'Studio', route: '/studio', availability: { kind: 'available' } },
  { id: 'lab', label: 'Lab', route: '/lab', availability: { kind: 'available' } },
  {
    id: 'connections',
    label: 'Connections',
    route: '/connections',
    availability: { kind: 'not-yet-available', dependsOn: 'UX-004 (PROD-001)' },
  },
];

export const TENANT: TenantContextView = {
  tenantId: 'tenant-demo' as never,
  tenantDisplayName: 'Acme Media',
  workspaceId: 'ws_demo' as never,
  workspaceDisplayName: 'Growth Studio',
};

export const noopIntent = (_declaration: CreateMissionIntentDeclaration): void => undefined;

export const shellView = (tenant: AppShellView['tenant']): AppShellView => ({
  sections: SECTIONS,
  tenant,
});

export const MISSION_SUMMARY: MissionSummaryView = {
  missionId: 'mission_demo_1' as never,
  title: 'Grow qualified reach of the developer audience',
  lifecycleState: 'active',
  recordVersion: 2,
  rewardSpecVersion: 2,
  rewardSpecSummary: '2 reward terms · spec v2',
  tenantId: 'tenant-demo' as never,
  workspaceId: null,
  updatedAt: '2026-06-01T00:00:00.000Z',
};

export const MISSION_DETAIL: MissionDetailView = {
  summary: MISSION_SUMMARY,
  objectiveStatement: 'Grow qualified reach of the developer audience in Q3.',
  targetMetrics: [
    { metric: 'qualified-reach', target: '250000', unit: 'count', horizon: '2026-09-30' },
    { metric: 'cost', target: '4000', unit: 'EUR', horizon: null },
  ],
  constraints: [{ kind: 'budget', description: 'Hard ceiling 5000 EUR total.' }],
  transitions: [
    { fromState: 'created', to: 'draft', recordVersion: 1, at: '2026-06-01T00:00:00.000Z' },
    { fromState: 'draft', to: 'active', recordVersion: 2, at: '2026-06-02T00:00:00.000Z' },
  ],
  rewardSpecVersions: [
    {
      specVersion: 1,
      terms: [
        {
          metric: 'qualified-reach',
          direction: 'maximize',
          weight: 1,
          definition: 'Reach among ICP accounts.',
        },
      ],
    },
    {
      specVersion: 2,
      terms: [
        {
          metric: 'qualified-reach',
          direction: 'maximize',
          weight: 0.7,
          definition: 'Reach among ICP accounts.',
        },
        { metric: 'cost', direction: 'minimize', weight: 0.3, definition: 'Total spend.' },
      ],
    },
  ],
  strategyRefs: ['strategy://baseline-noop'],
};

export const missionsPage = (overrides: Partial<MissionsPageData> = {}): MissionsPageData => ({
  scope: { tenantId: 'tenant-demo' as never, workspaceId: 'ws_demo' as never },
  summaries: [MISSION_SUMMARY],
  metricVocabulary: [
    { id: 'qualified-reach', label: 'Qualified reach' },
    { id: 'cost', label: 'Cost' },
  ],
  selected: null,
  selectionError: null,
  intentReceipt: null,
  intentError: null,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Studio view-model fixtures (UX-002 render tests — presentation doubles)
// ---------------------------------------------------------------------------

export const STUDIO_SESSION_SUMMARY: StudioSessionSummaryView = {
  sessionId: 'session-reaction-1' as never,
  tenantId: 'tenant-demo' as never,
  formatId: 'reaction',
  formatVersion: 1,
  lifecycleState: 'packaged',
  createdAt: '2026-06-02T09:00:00.000Z',
  participantCount: 2,
  organizationRef: { id: 'org-reaction-desk', version: 3 },
  artifactPackageRef: { packageId: 'pkg-reaction-1' as never, version: 2 as never },
};

export const STUDIO_SESSION_DETAIL: StudioSessionDetailView = {
  summary: STUDIO_SESSION_SUMMARY,
  transitions: [
    {
      from: 'requested',
      to: 'loading',
      at: '2026-06-02T09:00:05.000Z',
      reason: 'organization-load-started',
    },
    { from: 'loading', to: 'capturing', at: '2026-06-02T09:00:06.000Z', reason: null },
  ],
  participants: [
    {
      participantId: 'participant-operator-1',
      identityRef: 'identity-operator-1',
      accountRef: 'account-op-main',
      roles: ['operator'],
      consentState: 'granted',
      coversCapture: true,
      coversProcessingIntoArtifacts: true,
      consentRefs: ['consent-101'],
    },
    {
      participantId: 'participant-reactor-1',
      identityRef: 'identity-user-1',
      accountRef: 'account-user-media',
      roles: ['subject'],
      consentState: 'granted',
      coversCapture: true,
      coversProcessingIntoArtifacts: true,
      consentRefs: ['consent-102', 'consent-103'],
    },
  ],
  reviews: [
    {
      outcome: 'accept',
      decidedBy: { kind: 'studio-operator', ref: 'identity-operator-1' },
      decidedAt: '2026-06-02T10:11:30.000Z',
      targetArtifactId: 'final-reaction-pip-1',
      rejection: null,
    },
  ],
  consentRequirements: [],
};

export const STUDIO_PACKAGE_SUMMARY: StudioPackageSummaryView = {
  packageId: 'pkg-reaction-1' as never,
  sessionRef: 'session-reaction-1' as never,
  latestVersion: 2,
  versionCount: 2,
};

export const STUDIO_VERSION_CHAIN: StudioVersionChainView = {
  packageId: 'pkg-reaction-1' as never,
  sessionRef: 'session-reaction-1' as never,
  versions: [
    {
      packageId: 'pkg-reaction-1' as never,
      version: 1,
      sessionRef: 'session-reaction-1' as never,
      createdAt: '2026-06-02T10:12:00.000Z',
      evaluation: {
        status: 'evaluated',
        outcome: 'accepted',
        evaluationRef: 'mos-studio:review:1',
      },
      provenance: {
        containsSyntheticMaterial: true,
        lineageComplete: true,
        provenanceRefCount: 5,
      },
      consent: { allRawArtifactsCovered: true, participantConsentCount: 3 },
      finalArtifacts: [
        {
          artifactId: 'final-reaction-pip-1' as never,
          type: 'video',
          stage: 'final',
          creationMethod: 'composition',
          synthetic: false,
          parentCount: 1,
        },
        {
          artifactId: 'final-reaction-intro-1' as never,
          type: 'video',
          stage: 'final',
          creationMethod: 'engine-generated',
          synthetic: true,
          parentCount: 0,
        },
      ],
      artifactCounts: { raw: 2, intermediate: 1, final: 2 },
      transcriptCount: 1,
      editGraph: { graphId: 'edit-pkg-reaction-1', version: 1, otioInterchange: true },
      cost: { currency: 'USD', amount: '12.40' },
      durationSeconds: { capture: 720, processing: 3600, totalWallClock: 4400 },
    },
    {
      packageId: 'pkg-reaction-1' as never,
      version: 2,
      sessionRef: 'session-reaction-1' as never,
      createdAt: '2026-06-02T11:40:00.000Z',
      evaluation: { status: 'pending', outcome: 'treatment-requested', evaluationRef: null },
      provenance: {
        containsSyntheticMaterial: true,
        lineageComplete: true,
        provenanceRefCount: 6,
      },
      consent: { allRawArtifactsCovered: true, participantConsentCount: 3 },
      finalArtifacts: [
        {
          artifactId: 'final-reaction-pip-2' as never,
          type: 'video',
          stage: 'final',
          creationMethod: 'composition',
          synthetic: false,
          parentCount: 1,
        },
        {
          artifactId: 'final-reaction-intro-1' as never,
          type: 'video',
          stage: 'final',
          creationMethod: 'engine-generated',
          synthetic: true,
          parentCount: 1,
        },
      ],
      artifactCounts: { raw: 2, intermediate: 2, final: 2 },
      transcriptCount: 1,
      editGraph: { graphId: 'edit-pkg-reaction-1', version: 2, otioInterchange: true },
      cost: { currency: 'USD', amount: '2.10' },
      durationSeconds: { capture: 720, processing: 900, totalWallClock: 1700 },
    },
  ],
};

export const studioPage = (overrides: Partial<StudioPageData> = {}): StudioPageData => ({
  scope: { tenantId: 'tenant-demo' as never, workspaceId: 'ws_demo' as never },
  sessions: [STUDIO_SESSION_SUMMARY],
  selected: null,
  selectionError: null,
  packages: [STUDIO_PACKAGE_SUMMARY],
  selectedChain: null,
  chainError: null,
  libraryError: null,
  ...overrides,
});
