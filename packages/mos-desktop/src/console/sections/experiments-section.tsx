/**
 * The EXPERIMENTS section — the strategy authority's honest reference
 * surface: the three-way strategy comparison and the counterfactual
 * baselines. The typed prerequisite: the surface renders fully when a
 * strategy experiment is compiled.
 */

import type { MosConsoleSectionRecord } from '../console-nav.js';
import { ConsoleCard, HonestyLine, ReferenceCard, SectionScaffold, StatusPill } from './shared.js';
import type { MosWorkspaceSnapshot } from '../workspace-store.js';

export interface ExperimentsSectionProps {
  readonly section: MosConsoleSectionRecord;
  readonly workspace: MosWorkspaceSnapshot;
}

export function ExperimentsSection({ section, workspace }: ExperimentsSectionProps) {
  return (
    <SectionScaffold section={section} headerAside={<StatusPill tone="neutral">Reference</StatusPill>}>
      <ReferenceCard
        id="mosc-experiments-comparison"
        title="The three-way strategy comparison"
        note="How the authority compares strategies — the comparison the compose-plan path cites."
        terms={[
          { term: 'hand-designed vs learned vs searched', line: 'A comparison walks the origin vocabulary — hand-designed, learned-strategy, organization-search.' },
          { term: 'Declared interventions', line: 'A comparison forks the world under DECLARED interventions — never a silent variant.' },
          { term: 'Cited by plans', line: 'The planner cites experiment refs; a plan without its experiments is an honest validation failure.' },
        ]}
      />
      <ReferenceCard
        id="mosc-experiments-baselines"
        title="Counterfactual baselines"
        note="The evidence law the experiments stand on."
        terms={[
          { term: 'Counterfactual: true', line: 'Every simulated record carries the literal flag — historical and simulated never blur.' },
          { term: 'Uncertainty intervals', line: 'Every predicted metric carries its §22 interval — a point estimate alone is a validation failure.' },
          { term: 'Leakage pins', line: 'Delayed-information replays carry the pins that PROVE no future information leaked.' },
        ]}
      />
      <ConsoleCard
        id="mosc-experiments-workspace"
        title="This workspace's experiments surface"
        note="The typed prerequisite, honestly rendered."
      >
        <p className="mosc-line">
          The Ads registry's SIMULATION-labelled counterfactuals are the experiments' evidence rendered where they are
          consumed — {workspace.campaigns.filter((campaign) => campaign.counterfactual !== null).length} campaign(s) carry one.
          A strategy experiment compiled for a mission is what renders this surface's working view.
        </p>
        <HonestyLine>
          The experiments surface renders fully when a strategy experiment is compiled — until then this page carries the
          vocabulary and never a fabricated comparison.
        </HonestyLine>
      </ConsoleCard>
    </SectionScaffold>
  );
}
