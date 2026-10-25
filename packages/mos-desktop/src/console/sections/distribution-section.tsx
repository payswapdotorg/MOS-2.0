/**
 * The DISTRIBUTION section — the delivery authority's honest reference
 * surface: the adapter contract, the per-platform delivery law, and the
 * frozen provider profiles. The typed prerequisite: the surface renders
 * fully when a delivery run is compiled.
 */

import type { MosConsoleSectionRecord } from '../console-nav.js';
import { MOS_SOCIAL_PLATFORMS, type MosWorkspaceSnapshot } from '../workspace-store.js';
import { ConsoleCard, HonestyLine, ReferenceCard, SectionScaffold, StatusPill } from './shared.js';

export interface DistributionSectionProps {
  readonly section: MosConsoleSectionRecord;
  readonly workspace: MosWorkspaceSnapshot;
}

export function DistributionSection({ section, workspace }: DistributionSectionProps) {
  return (
    <SectionScaffold section={section} headerAside={<StatusPill tone="neutral">Reference</StatusPill>}>
      <ReferenceCard
        id="mosc-distribution-contract"
        title="The adapter contract"
        note="How delivery reaches a platform — always through the provider adapter, never around it."
        terms={[
          { term: 'Provider adapters', line: 'Each platform\'s delivery surface is a versioned adapter carrying its frozen profile.' },
          { term: 'Typed refusals', line: 'An operation outside the declared shapes is a typed refusal BEFORE any provider interaction.' },
          { term: 'Fails closed', line: 'An unsupported operation fails closed — never a best-effort post.' },
        ]}
      />
      <ReferenceCard
        id="mosc-distribution-profiles"
        title="The frozen provider profiles"
        note="The five delivery surfaces and their claim bases — the capability matrix in Social renders these verbatim."
        terms={MOS_SOCIAL_PLATFORMS.map((platform) => ({
          term: platform,
          line: 'A frozen profile: capability matrix, auth model, operation shapes, and the evidence basis for every claim.',
        }))}
      />
      <ConsoleCard
        id="mosc-distribution-workspace"
        title="This workspace's distribution surface"
        note="The typed prerequisite, honestly rendered."
      >
        <p className="mosc-line">
          {workspace.posts.filter((post) => post.status === 'SCHEDULED').length} post(s) are SCHEDULED in the queue — delivery
          executes only when the production transport is bound and the run is armed. A delivery run compiled for a mission is
          what renders this surface's working view.
        </p>
        <HonestyLine>
          The scheduler honours the queue only through an armed, compiled delivery run — the queue never self-publishes, and
          this page never fabricates a delivery receipt.
        </HonestyLine>
      </ConsoleCard>
    </SectionScaffold>
  );
}
