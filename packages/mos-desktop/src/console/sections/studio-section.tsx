/**
 * The STUDIO section — the production authority's honest reference
 * surface: the content formats, the engine registry law (engines are
 * reached through the registry, never imported), and rights-aware
 * production. The typed prerequisite: the surface renders fully when a
 * production run is compiled.
 */

import type { MosConsoleSectionRecord } from '../console-nav.js';
import { ConsoleCard, HonestyLine, ReferenceCard, SectionScaffold, StatusPill } from './shared.js';
import type { MosWorkspaceSnapshot } from '../workspace-store.js';

export interface StudioSectionProps {
  readonly section: MosConsoleSectionRecord;
  readonly workspace: MosWorkspaceSnapshot;
}

export function StudioSection({ section, workspace }: StudioSectionProps) {
  return (
    <SectionScaffold section={section} headerAside={<StatusPill tone="neutral">Reference</StatusPill>}>
      <ReferenceCard
        id="mosc-studio-formats"
        title="Content formats"
        note="The session formats the Studio produces — the production vocabulary."
        terms={[
          { term: 'reaction', line: 'Reaction-format sessions — the reaction content family.' },
          { term: 'audio-podcast', line: 'Audio podcast sessions — the audio production family.' },
          { term: 'video-podcast', line: 'Video podcast sessions — the full video production family.' },
        ]}
      />
      <ReferenceCard
        id="mosc-studio-engines"
        title="The engine registry law"
        note="How production engines are reached — never imported, never direct."
        terms={[
          { term: 'capability contract', line: 'A production request names its capability through the contract vocabulary.' },
          { term: 'engine registry', line: 'The registry resolves the capability to a registered engine adapter.' },
          { term: 'no SDK imports', line: 'No MOS surface imports an engine SDK directly — the boundary harness enforces it.' },
          { term: 'sandboxed execution', line: 'Engines execute through their adapters, sandboxed, never ambient.' },
        ]}
      />
      <ReferenceCard
        id="mosc-studio-rights"
        title="Rights-aware production"
        note="Production is rights-aware by construction."
        terms={[
          { term: 'Rights gate', line: 'The compile path\'s rights gate blocks a strategy whose rights terms are unresolved.' },
          { term: 'Rights risk', line: 'A first-class reward-metric term (rights-risk) — quantifiable, never hand-waved.' },
        ]}
      />
      <ConsoleCard
        id="mosc-studio-workspace"
        title="This workspace's studio surface"
        note="The typed prerequisite, honestly rendered."
      >
        <p className="mosc-line">
          {workspace.campaigns.filter((campaign) => campaign.status === 'COMPILED' || campaign.status === 'ARMED').length}{' '}
          campaign(s) are past the draft rung; a production run compiled for a mission is what renders the Studio's working
          surface. None is compiled in this workspace yet.
        </p>
        <HonestyLine>
          The Studio renders fully when a production run is compiled — until then this page carries the vocabulary and never a
          fabricated session.
        </HonestyLine>
      </ConsoleCard>
    </SectionScaffold>
  );
}
