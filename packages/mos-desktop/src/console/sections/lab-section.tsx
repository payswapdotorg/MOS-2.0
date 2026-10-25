/**
 * The LAB section — the simulation authority's honest reference
 * surface: the Lab law (historical and simulated records are DISTINCT
 * KINDS OF DATA), the Time Machine's three §20 modes, the idea graph,
 * benchmarks, and the calibration chain. Vocabulary renders as
 * REFERENCE, never as live data.
 */

import type { MosConsoleSectionRecord } from '../console-nav.js';
import { SectionScaffold, ReferenceCard, StatusPill, ConsoleCard, HonestyLine } from './shared.js';
import type { MosWorkspaceSnapshot } from '../workspace-store.js';

export interface LabSectionProps {
  readonly section: MosConsoleSectionRecord;
  readonly workspace: MosWorkspaceSnapshot;
}

export function LabSection({ section, workspace }: LabSectionProps) {
  return (
    <SectionScaffold section={section} headerAside={<StatusPill tone="neutral">Reference</StatusPill>}>
      <ReferenceCard
        id="mosc-lab-law"
        title="The Lab law"
        note="What the Lab is and what it never does — the authority's own scope."
        terms={[
          { term: 'Distinct kinds of data', line: 'Historical and simulated records are DISTINCT — everything the simulator produces carries counterfactual: true.' },
          { term: 'No live surfaces', line: 'The Lab never touches live platforms — it produces evidence the planner consumes.' },
          { term: 'Seed-required determinism', line: 'Simulation runs are deterministic and seed-required; every predicted metric carries its §22 uncertainty interval.' },
        ]}
      />
      <ReferenceCard
        id="mosc-lab-time-machine"
        title="The Time Machine's three modes"
        note="The §20 modes every replay walks."
        terms={[
          { term: 'Historical replay', line: 'Observations ≤ T — what actually happened, replays forward.' },
          { term: 'Delayed-information replay', line: 'At T under lag L, only information available by T−L — with the leakage pins that prove it.' },
          { term: 'Counterfactual branches', line: 'Forked worlds under declared interventions — labelled counterfactual, never confused with history.' },
        ]}
      />
      <ReferenceCard
        id="mosc-lab-strategy"
        title="Strategy candidates"
        note="Where a strategy candidate comes from — the accepted origin vocabulary."
        terms={[
          { term: 'hand-designed', line: 'An operator-declared strategy — explicit, inspectable.' },
          { term: 'learned-strategy', line: 'Learned from the recorded evidence, versioned like every other record.' },
          { term: 'organization-search', line: 'Searched over the organization space — the search is itself recorded.' },
        ]}
      />
      <ConsoleCard
        id="mosc-lab-workspace"
        title="This workspace's lab surface"
        note="What the Lab renders from the current workspace records."
      >
        <p className="mosc-line">
          {workspace.missions.length} missions carry objectives the Lab can simulate against; campaign counterfactuals in the
          Ads registry are the Lab's SIMULATION-labelled projections rendered where they are consumed.
        </p>
        <HonestyLine>
          The Lab's own surfaces (idea graph, benchmark directory, calibration status) render through the Agent Console's
          workflow when a simulation run is compiled — this page carries the vocabulary, never fabricated results.
        </HonestyLine>
      </ConsoleCard>
    </SectionScaffold>
  );
}
