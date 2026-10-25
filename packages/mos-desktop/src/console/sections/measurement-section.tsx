/**
 * The MEASUREMENT section — the evidence authority's honest reference
 * surface: the 17-metric reward vocabulary (the closed list), the
 * vanity-metric guardrail, and the calibration chain. The typed
 * prerequisite: the surface renders fully when a measurement run is
 * compiled.
 */

import type { MosConsoleSectionRecord } from '../console-nav.js';
import { MOS_REWARD_METRIC_VOCABULARY, type MosWorkspaceSnapshot } from '../workspace-store.js';
import { ConsoleCard, HonestyLine, ReferenceCard, SectionScaffold, StatusPill } from './shared.js';

export interface MeasurementSectionProps {
  readonly section: MosConsoleSectionRecord;
  readonly workspace: MosWorkspaceSnapshot;
}

export function MeasurementSection({ section, workspace }: MeasurementSectionProps) {
  return (
    <SectionScaffold section={section} headerAside={<StatusPill tone="neutral">Reference</StatusPill>}>
      <ReferenceCard
        id="mosc-measurement-vocabulary"
        title="The reward vocabulary"
        note="The closed 17-metric list the measurement rungs evaluate against — the same vocabulary the mission intake selects from."
        terms={MOS_REWARD_METRIC_VOCABULARY.map((metric) => ({
          term: metric.label,
          line: `A first-class reward term (${metric.id}) — measurable, weighted, and never a vanity metric.`,
        }))}
      />
      <ReferenceCard
        id="mosc-measurement-guardrail"
        title="The vanity-metric guardrail"
        note="What measurement refuses — the guardrail is the point."
        terms={[
          { term: 'No vanity metrics', line: 'Raw impressions and follower counts are not reward terms — qualified reach and audience growth are.' },
          { term: 'Uncertainty with every estimate', line: 'A predicted metric without its interval is a validation failure, not a rounding choice.' },
          { term: 'Fatigue is measurable', line: 'Creative fatigue is a first-class term — the guardrail keeps it quantified, never vibes.' },
        ]}
      />
      <ReferenceCard
        id="mosc-measurement-calibration"
        title="The calibration chain"
        note="How predictions earn trust — calibration is the chain from simulation to observation."
        terms={[
          { term: 'Calibration status', line: 'Every simulator surface carries its calibration state — uncalibrated predictions say so.' },
          { term: 'Observation comparison', line: 'Observations replay against predictions under the Time Machine\'s historical mode.' },
          { term: 'Versioned world models', line: 'The social world models are versioned and disclosed as synthetic — parametric, never live data.' },
        ]}
      />
      <ConsoleCard
        id="mosc-measurement-workspace"
        title="This workspace's measurement surface"
        note="The typed prerequisite, honestly rendered."
      >
        <p className="mosc-line">
          {workspace.missions.length} mission(s) declare reward terms from the vocabulary; measured results stay absent until a
          live transport carries observations — the campaigns honestly render "measured: none". A measurement run compiled for
          a mission is what renders this surface's working view.
        </p>
        <HonestyLine>
          The measurement surface renders fully when a measurement run is compiled — until then this page carries the
          vocabulary and never a fabricated number.
        </HonestyLine>
      </ConsoleCard>
    </SectionScaffold>
  );
}
