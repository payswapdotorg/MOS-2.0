// UX-005 criterion 2 — pure summary builders over the EXISTING page models.
// Presentation-only: no ports touched; route-loading.ts untouched.
//
// PLAN C RECONCILIATION (TL battery): the emission's §A–§D assumptions were
// resolved by moving EVERY count extraction to the call sites (the route
// views own the mapping from the REAL page models — MissionsPageData
// summaries, StudioPageData sessions/packages, LabPageData
// benchmarks/calibrationChains, ConnectionsPageData directory/bindings);
// these builders accept pre-extracted primitives only.
import { LAB_COUNTERFACTUAL_LABEL, LAB_MEASURED_LABEL } from '../lab-presentation.js';

export interface SurfaceSummaryModel {
  readonly headline: string;
  readonly stats: ReadonlyArray<{
    label: string;
    value: string;
    tone?: 'neutral' | 'positive' | 'caution' | 'negative';
  }>;
  readonly honestyLabels: readonly string[];
}

export function buildMissionsSummary(input: {
  readonly missionCount: number;
  readonly openCount: number;
  readonly tenantLabel: string;
}): SurfaceSummaryModel {
  return {
    headline: `${input.missionCount} mission(s) in the catalog — ${input.openCount} open.`,
    stats: [
      { label: 'missions', value: String(input.missionCount) },
      { label: 'open', value: String(input.openCount) },
    ],
    // tenant context is an honesty label (§31) — always visible.
    honestyLabels: [`Tenant: ${input.tenantLabel}`],
  };
}

export function buildStudioSummary(input: {
  readonly packageCount: number;
  readonly consentPendingCount: number;
}): SurfaceSummaryModel {
  return {
    headline: `${input.packageCount} package(s); ${input.consentPendingCount} awaiting consent.`,
    stats: [
      { label: 'packages', value: String(input.packageCount) },
      { label: 'consent pending', value: String(input.consentPendingCount), tone: 'caution' },
    ],
    honestyLabels: ['Consent state is shown per package — never assumed.'],
  };
}

export function buildLabSummary(input: {
  readonly measuredCount: number;
  readonly counterfactualCount: number;
}): SurfaceSummaryModel {
  return {
    headline: `${input.measuredCount} measured run(s); ${input.counterfactualCount} counterfactual baseline(s).`,
    stats: [
      { label: LAB_MEASURED_LABEL, value: String(input.measuredCount) },
      { label: LAB_COUNTERFACTUAL_LABEL, value: String(input.counterfactualCount) },
    ],
    // The Lab law (§20/§24): both labels visible at EVERY disclosure level.
    honestyLabels: [LAB_COUNTERFACTUAL_LABEL, LAB_MEASURED_LABEL, 'Counterfactual is never presented as measured.'],
  };
}

export function buildConnectionsSummary(input: {
  readonly providerCount: number;
  readonly confirmedCount: number;
  readonly suspectedCount: number;
  readonly unknownCapabilityCount: number;
}): SurfaceSummaryModel {
  return {
    headline: `${input.providerCount} provider(s) across two authorities.`,
    stats: [
      { label: 'providers', value: String(input.providerCount) },
      { label: 'CONFIRMED health', value: String(input.confirmedCount), tone: 'positive' },
      { label: 'SUSPECTED health', value: String(input.suspectedCount), tone: 'caution' },
      { label: 'UNKNOWN capabilities', value: String(input.unknownCapabilityCount), tone: 'caution' },
    ],
    // UX-004 honesty set: platform-said typing, UNKNOWN preservation,
    // zero-transport denial attribution — never hidden by disclosure.
    honestyLabels: [
      'Health is platform-said, typed CONFIRMED or SUSPECTED.',
      'Unknown capabilities stay UNKNOWN — never guessed.',
      'Denials carry their attribution, including zero-transport.',
    ],
  };
}
