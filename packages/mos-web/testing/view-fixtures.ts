import type { AppShellView, ShellSectionView, TenantContextView } from '../dist/src/ports/app-shell.js';
import type { MissionsPageData } from '../dist/src/routes/route-loading.js';
import type {
  CreateMissionIntentDeclaration,
  MissionDetailView,
  MissionSummaryView,
} from '../dist/src/ports/mission-catalog.js';

/**
 * Shared fixtures for the component render tests (UX-001) — disclosed
 * PRESENTATION doubles: plain view models (the shapes the view ports return),
 * never domain records. Extracted from the original single test file to keep
 * every managed file within the ≤500-line architecture policy.
 */

export const SECTIONS: readonly ShellSectionView[] = [
  { id: 'home', label: 'Home', route: '/', availability: { kind: 'available' } },
  { id: 'missions', label: 'Missions', route: '/missions', availability: { kind: 'available' } },
  {
    id: 'studio',
    label: 'Studio',
    route: '/studio',
    availability: { kind: 'not-yet-available', dependsOn: 'UX-002 (STUDIO-014)' },
  },
  {
    id: 'lab',
    label: 'Lab',
    route: '/lab',
    availability: { kind: 'not-yet-available', dependsOn: 'UX-003 (LAB-017)' },
  },
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
