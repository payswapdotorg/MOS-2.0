/**
 * The AGENT CONSOLE section — the operator console's honest reference
 * surface: the seven-path write-intent workflow (one path per authority
 * transition, arm-run last), the five working modes, and the typed halt
 * law. Vocabulary renders as REFERENCE, never as live data.
 */

import type { MosConsoleSectionRecord } from '../console-nav.js';
import { ConsoleCard, HonestyLine, ReferenceCard, SectionScaffold, StatusPill } from './shared.js';
import type { MosWorkspaceSnapshot } from '../workspace-store.js';

export interface ConsoleSectionProps {
  readonly section: MosConsoleSectionRecord;
  readonly workspace: MosWorkspaceSnapshot;
}

export function ConsoleSection({ section, workspace }: ConsoleSectionProps) {
  return (
    <SectionScaffold section={section} headerAside={<StatusPill tone="neutral">Reference</StatusPill>}>
      <ReferenceCard
        id="mosc-console-workflow"
        title="The seven-path write-intent workflow"
        note="Every operator write walks one of the seven paths — each routes to its owning authority, and the receipts carry the authority's verdict verbatim."
        terms={[
          { term: '1 · create-experiment', line: 'The Experiments authority — declares a strategy experiment.' },
          { term: '2 · grant-analysis-rights', line: 'The Rights authority — grants the analysis scope an experiment needs.' },
          { term: '3 · record-intelligence', line: 'The Product Intelligence authority — records the content intelligence plans cite.' },
          { term: '4 · compose-plan', line: 'The Missions authority\'s MARKETING-001 planner — cites intelligence versions and experiment refs.' },
          { term: '5 · compile-strategy', line: 'The PROD-003 compiler — rights gate, organization validation, experiment binding verification.' },
          { term: '6 · create-run', line: 'The PROD-004 engine — the run lands COMPILED, awaiting authorization.' },
          { term: '7 · arm-run', line: 'The PROD-004 arm() — THE human authorization transition. The denial is relayed verbatim.' },
        ]}
      />
      <ReferenceCard
        id="mosc-console-modes"
        title="The five working modes"
        note="The console's center-region surfaces — one renderer per mode, every value from the page model."
        terms={[
          { term: 'direct', line: 'Direct operation — the operator drives a single authority path.' },
          { term: 'plan', line: 'Planning view — the composed plan with its cited intelligence and experiments.' },
          { term: 'research', line: 'Research view — the recorded intelligence the planner consumes.' },
          { term: 'results', line: 'Results view — the measured evidence, never the vanity metrics.' },
          { term: 'control', line: 'Control view — the arm gates and typed halts, the human transitions.' },
        ]}
      />
      <ConsoleCard
        id="mosc-console-workspace"
        title="This workspace's console surface"
        note="What the console renders from the current workspace records."
      >
        <p className="mosc-line">
          The arm gate for this workspace's campaigns renders in Activity — {workspace.approvals.filter((approval) => approval.status === 'PENDING').length}{' '}
          gate(s) pending, {workspace.approvals.filter((approval) => approval.status === 'APPROVED').length} approved. The
          full seven-path console (plans, compiled strategies, runs) renders through the substrate workbench's task surfaces —
          the New Task entry in the Agent Workbench group is the honest door to it.
        </p>
        <HonestyLine>
          After ARMED, a run waits for the durable job, distribution, and measurement transports — the console presents that
          waiting state honestly; it never simulates execution.
        </HonestyLine>
      </ConsoleCard>
    </SectionScaffold>
  );
}
