import type { ConsoleIntentDeclaration } from '../ports/console-intents.js';
import type { ConsolePageData } from '../routes/console-page-loading.js';
import { ConsoleIntentForm } from './console-intent-form.js';
import {
  CONSOLE_INTENT_FORM_FIELDS,
  armRunDeclarationFromFormData,
  compileStrategyDeclarationFromFormData,
  composePlanDeclarationFromFormData,
  createExperimentDeclarationFromFormData,
  createRunDeclarationFromFormData,
  grantAnalysisRightsDeclarationFromFormData,
  recordIntelligenceDeclarationFromFormData,
} from './console-intent-form-data.js';

/**
 * The Agent Console per-mode content renderers (the CONSOLE wave,
 * foundation skeleton) — the five working modes' center-region content.
 * Worker B deepens these into the full premium UX (structured detail
 * renderers, the contextual inspector, responsive drawers); this
 * foundation wires every mode's honest states and the intent forms each
 * mode owns. Presentation-only: every value renders from the page model;
 * every write is a DECLARED intent through the console-intents port.
 */

// ---------------------------------------------------------------------------
// Per-mode content (foundation renderers — Worker B deepens these)
// ---------------------------------------------------------------------------

export function DirectModeContent({
  page,
  onDeclareConsoleIntent,
  missionId,
}: {
  readonly page: Extract<ConsolePageData, { readonly mode: 'direct' }>;
  readonly onDeclareConsoleIntent: (declaration: ConsoleIntentDeclaration) => void;
  readonly missionId: string | null;
}) {
  const { readiness, standings } = page.data;
  return (
    <div className="flex flex-col gap-4" data-testid="console-mode-direct">
      <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2" data-testid="console-direct-readiness">
        <dt className="text-slate-500">Intelligence records</dt>
        <dd className="font-mono text-slate-200">{readiness.intelligenceRecords}</dd>
        <dt className="text-slate-500">Rights grants</dt>
        <dd className="font-mono text-slate-200">{readiness.rightsGrants}</dd>
        <dt className="text-slate-500">Experiments</dt>
        <dd className="font-mono text-slate-200">{readiness.experiments}</dd>
        <dt className="text-slate-500">Plans</dt>
        <dd className="font-mono text-slate-200">{readiness.plans}</dd>
        <dt className="text-slate-500">Runs (awaiting authorization / armed)</dt>
        <dd className="font-mono text-slate-200">
          {standings.runsAwaitingAuthorization} / {standings.runsArmed}
        </dd>
      </dl>
      {missionId !== null ? (
        <ConsoleIntentForm
          summaryLabel="Declare intent: compose the mission's marketing plan"
          routedTo="marketing-planner-authority"
          disclosureNote="The planner composes an evidence-linked, mission-cited plan from the declared platform choices and expectations; every citation must resolve through the product-intelligence authority."
          testId="console-compose-plan-form"
          fields={[
            { name: CONSOLE_INTENT_FORM_FIELDS.planId, label: 'Plan chain id', kind: 'text', required: true, placeholder: 'e.g. plan-ghana-launch' },
            { name: CONSOLE_INTENT_FORM_FIELDS.objectiveAlignmentText, label: 'How this plan serves the mission objective', kind: 'long-text', required: true },
            { name: CONSOLE_INTENT_FORM_FIELDS.platformsJson, label: 'Platform choices', kind: 'json', required: true, placeholder: '[{"platform":"...","rationale":"...","evidence":[{"recordId":"...","version":1}]}]' },
            { name: CONSOLE_INTENT_FORM_FIELDS.metricExpectationsJson, label: 'Metric expectations', kind: 'json', required: true, placeholder: '[{"metric":"...","expectation":"...","unit":"count","basis":{"kind":"counterfactual-forecast"},"evidence":[{"recordId":"...","version":1}]}]' },
            { name: CONSOLE_INTENT_FORM_FIELDS.experimentExpectationsJson, label: 'Experiment expectations', kind: 'json', required: true, placeholder: '[{"question":"...","successCriterion":"...","evidence":[{"recordId":"...","version":1}]}]' },
            { name: CONSOLE_INTENT_FORM_FIELDS.experimentRefsText, label: 'Experiment refs (comma-separated REAL experiment ids)', kind: 'text', required: true, placeholder: 'e.g. exp-001' },
            { name: CONSOLE_INTENT_FORM_FIELDS.noteText, label: 'Composer note', kind: 'text', required: false },
          ]}
          parse={composePlanDeclarationFromFormData}
          onDeclareConsoleIntent={onDeclareConsoleIntent}
        />
      ) : null}
    </div>
  );
}

export function PlanModeContent({
  page,
  onDeclareConsoleIntent,
}: {
  readonly page: Extract<ConsolePageData, { readonly mode: 'plan' }>;
  readonly onDeclareConsoleIntent: (declaration: ConsoleIntentDeclaration) => void;
}) {
  const { planChains, strategies } = page.data;
  return (
    <div className="flex flex-col gap-4" data-testid="console-mode-plan">
      {planChains.length === 0 ? (
        <p className="text-xs text-slate-400" data-testid="console-plans-empty">
          No plans composed for this mission yet — declare a compose-plan intent from the Direct
          mode once the evidence base resolves.
        </p>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="console-plan-chains">
          {planChains.map((chain) => (
            <li key={chain.planId} className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-xs">
              <p className="font-mono text-slate-200">{chain.planId} · v{chain.latestVersion}</p>
              <p className="mt-1 text-slate-400">{chain.objectiveAlignment}</p>
              <p className="mt-1 text-[10px] text-slate-500">
                {chain.platforms.length} platforms · {chain.metricExpectations.length} metric
                expectations · {chain.experimentExpectations.length} experiment expectations ·
                composed {chain.composedAt}
              </p>
            </li>
          ))}
        </ul>
      )}
      {strategies.length === 0 ? (
        <p className="text-xs text-slate-400" data-testid="console-strategies-empty">
          No compiled strategies yet — a composed plan can be compiled into the organization,
          phases and comparators the engine runs.
        </p>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="console-strategies">
          {strategies.map((strategy) => (
            <li key={strategy.strategyId} className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-xs">
              <p className="font-mono text-slate-200">{strategy.strategyId}</p>
              <p className="mt-1 text-slate-400">{strategy.missionSummary}</p>
              <p className="mt-1 text-[10px] text-slate-500">
                plan {strategy.sourcePlan.planId}@v{strategy.sourcePlan.version} ·{' '}
                {strategy.organization.roles.length} roles ·{' '}
                {strategy.organization.delegationEdges.length} delegation edges ·{' '}
                {strategy.organization.phases.length} phases ·{' '}
                {strategy.comparators.length} comparators
              </p>
            </li>
          ))}
        </ul>
      )}
      <ConsoleIntentForm
        summaryLabel="Declare intent: compile a composed plan into a strategy"
        routedTo="strategy-compiler-authority"
        disclosureNote="The compiler resolves the plan version, validates the organization against the agents registry, checks the §27 compile right, and produces the phases/delegation/comparators artifact."
        testId="console-compile-strategy-form"
        fields={[
          { name: CONSOLE_INTENT_FORM_FIELDS.planId, label: 'Plan chain id', kind: 'text', required: true },
          { name: CONSOLE_INTENT_FORM_FIELDS.planVersion, label: 'Plan version (0 = latest)', kind: 'number', required: true, placeholder: '0' },
          { name: CONSOLE_INTENT_FORM_FIELDS.principalText, label: 'Principal (compile right holder)', kind: 'text', required: true },
        ]}
        parse={compileStrategyDeclarationFromFormData}
        onDeclareConsoleIntent={onDeclareConsoleIntent}
      />
    </div>
  );
}

export function ResearchModeContent({
  page,
  onDeclareConsoleIntent,
}: {
  readonly page: Extract<ConsolePageData, { readonly mode: 'research' }>;
  readonly onDeclareConsoleIntent: (declaration: ConsoleIntentDeclaration) => void;
}) {
  const { intelligenceRecords, experiments, labLinks } = page.data;
  return (
    <div className="flex flex-col gap-4" data-testid="console-mode-research">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold text-slate-300">The Lab workspace</p>
        <div className="flex flex-wrap gap-2" data-testid="console-lab-links">
          {labLinks.map((link) => (
            <a key={link.href} href={link.href} className="rounded-md border border-slate-800 px-2 py-1 text-xs text-sky-400 underline-offset-2 hover:underline">
              {link.label}
            </a>
          ))}
        </div>
      </div>
      {intelligenceRecords.length === 0 ? (
        <p className="text-xs text-slate-400" data-testid="console-intelligence-empty">
          No intelligence records in this tenant yet — the evidence path needs a rights grant
          before records can be recorded.
        </p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="console-intelligence-records">
          {intelligenceRecords.map((record) => (
            <li key={`${record.recordId}-${record.version}`} className="rounded-md border border-slate-800 bg-slate-900/40 px-3 py-2 text-xs">
              <span className="font-mono text-slate-200">{record.recordId}@v{record.version}</span>{' '}
              <span className="text-slate-500">· {record.contentKind} · {record.basis}</span>
              <span className="block text-[10px] text-slate-500">rights: {record.rightsStatus} · recorded {record.recordedAt}</span>
            </li>
          ))}
        </ul>
      )}
      {experiments.length === 0 ? (
        <p className="text-xs text-slate-400" data-testid="console-experiments-empty">
          No experiments yet — a plan's expectations arm against a REAL experiment record.
        </p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="console-experiments">
          {experiments.map((experiment) => (
            <li key={experiment.experimentId} className="rounded-md border border-slate-800 bg-slate-900/40 px-3 py-2 text-xs">
              <span className="font-mono text-slate-200">{experiment.experimentId}</span>{' '}
              <span className="text-slate-500">· {experiment.status}</span>
              <span className="block text-[10px] text-slate-500">{experiment.question}</span>
            </li>
          ))}
        </ul>
      )}
      <ConsoleIntentForm
        summaryLabel="Declare intent: create a REAL experiment"
        routedTo="experiments-authority"
        disclosureNote="The experiments authority registers the experiment record; the plan's expectations cite it and the run arms against its binding."
        testId="console-create-experiment-form"
        fields={[
          { name: CONSOLE_INTENT_FORM_FIELDS.experimentId, label: 'Experiment id', kind: 'text', required: true, placeholder: 'e.g. exp-ghana-001' },
          { name: CONSOLE_INTENT_FORM_FIELDS.questionText, label: 'The question the experiment decides', kind: 'long-text', required: true },
          { name: CONSOLE_INTENT_FORM_FIELDS.successCriterionText, label: 'Success criterion', kind: 'long-text', required: true },
          { name: CONSOLE_INTENT_FORM_FIELDS.hypothesisJson, label: 'Declared hypothesis', kind: 'json', required: true, placeholder: '{}' },
          { name: CONSOLE_INTENT_FORM_FIELDS.missionRefsText, label: 'Mission refs (comma-separated)', kind: 'text', required: false },
        ]}
        parse={createExperimentDeclarationFromFormData}
        onDeclareConsoleIntent={onDeclareConsoleIntent}
      />
      <ConsoleIntentForm
        summaryLabel="Declare intent: record product intelligence"
        routedTo="product-intelligence-authority"
        disclosureNote="Recording is rights-gated fail-closed: without a registered grant covering the analyze action, the authority rejects the recording and the verdict says so verbatim."
        testId="console-record-intelligence-form"
        fields={[
          { name: CONSOLE_INTENT_FORM_FIELDS.recordId, label: 'Intelligence record id', kind: 'text', required: true, placeholder: 'e.g. intel-ghana-segments' },
          { name: CONSOLE_INTENT_FORM_FIELDS.subjectJson, label: 'Product subject ref', kind: 'json', required: true, placeholder: '{}' },
          { name: CONSOLE_INTENT_FORM_FIELDS.contentKindText, label: 'Content kind (fact | metric | observation)', kind: 'text', required: true, placeholder: 'observation' },
          { name: CONSOLE_INTENT_FORM_FIELDS.contentJson, label: 'Intelligence content', kind: 'json', required: true, placeholder: '{}' },
          { name: CONSOLE_INTENT_FORM_FIELDS.sourceJson, label: 'Source attribution', kind: 'json', required: true, placeholder: '{"sourceKind":"..."}' },
          { name: CONSOLE_INTENT_FORM_FIELDS.basisKindText, label: 'Basis (cited-evidence | counterfactual-forecast)', kind: 'text', required: true, placeholder: 'cited-evidence' },
          { name: CONSOLE_INTENT_FORM_FIELDS.citedCommerceObservationsJson, label: 'Cited commerce observations (required for external sources)', kind: 'json', required: false, placeholder: '[]' },
          { name: CONSOLE_INTENT_FORM_FIELDS.rightsRef, label: 'Rights ref (the recording gate resolves this)', kind: 'text', required: true },
          { name: CONSOLE_INTENT_FORM_FIELDS.attributionText, label: 'Attribution note', kind: 'text', required: false },
          { name: CONSOLE_INTENT_FORM_FIELDS.noteText, label: 'Recorder note', kind: 'text', required: false },
        ]}
        parse={recordIntelligenceDeclarationFromFormData}
        onDeclareConsoleIntent={onDeclareConsoleIntent}
      />
    </div>
  );
}

export function ResultsModeContent({
  page,
}: {
  readonly page: Extract<ConsolePageData, { readonly mode: 'results' }>;
}) {
  const { runs, artifacts } = page.data;
  return (
    <div className="flex flex-col gap-4" data-testid="console-mode-results">
      {runs.length === 0 ? (
        <p className="text-xs text-slate-400" data-testid="console-runs-empty">
          No runs yet — a compiled strategy instantiates a run that waits for authorization in
          the Control mode.
        </p>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="console-runs">
          {runs.map((run) => (
            <li key={run.runId} className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-xs">
              <p className="font-mono text-slate-200">{run.runId}</p>
              <p className="mt-1 text-slate-400">{run.missionSummary}</p>
              <p className="mt-1 text-[10px] text-slate-500">
                lifecycle {run.lifecycle} · budget {run.ledger.spent}/{run.ledger.ceiling}{' '}
                {run.ledger.currency} · steps {run.stepCount}/{run.maxSteps} ·{' '}
                {run.trail.length} trail events
              </p>
              {run.waitingOn !== null ? (
                <p className="mt-1 text-[10px] text-amber-300/80" data-testid={`console-run-waiting-${run.runId}`}>
                  Waiting on {run.waitingOn}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {artifacts.length === 0 ? (
        <p className="text-xs text-slate-400" data-testid="console-artifacts-empty">
          No durable artifacts yet — plans and strategies appear here as inspectable records.
        </p>
      ) : (
        <ul className="flex flex-col gap-1 text-xs" data-testid="console-artifacts">
          {artifacts.map((artifact) => (
            <li key={`${artifact.kind}-${artifact.id}-${artifact.version}`} className="text-slate-400">
              <span className="font-mono text-slate-200">{artifact.id}@v{artifact.version}</span>{' '}
              · {artifact.kind}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ControlModeContent({
  page,
  onDeclareConsoleIntent,
}: {
  readonly page: Extract<ConsolePageData, { readonly mode: 'control' }>;
  readonly onDeclareConsoleIntent: (declaration: ConsoleIntentDeclaration) => void;
}) {
  const { awaitingAuthorization, authorized, rightsGrants } = page.data;
  return (
    <div className="flex flex-col gap-4" data-testid="console-mode-control">
      {awaitingAuthorization.length === 0 ? (
        <p className="text-xs text-slate-400" data-testid="console-queue-empty">
          No runs awaiting authorization — the approval queue is honest about being empty.
        </p>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="console-authorization-queue">
          {awaitingAuthorization.map((run) => (
            <li key={run.runId} className="rounded-lg border border-amber-900/60 bg-amber-950/20 p-3 text-xs">
              <p className="font-mono text-slate-200">{run.runId}</p>
              <p className="mt-1 text-slate-400">{run.missionSummary}</p>
              <p className="mt-1 text-[10px] text-slate-500">
                compiled {run.declaredAt} · strategy {run.strategyId}
              </p>
            </li>
          ))}
        </ul>
      )}
      {authorized.length > 0 ? (
        <ul className="flex flex-col gap-2" data-testid="console-authorized-runs">
          {authorized.map((run) => (
            <li key={run.runId} className="rounded-md border border-slate-800 bg-slate-900/40 px-3 py-2 text-xs">
              <span className="font-mono text-slate-200">{run.runId}</span>{' '}
              <span className="text-slate-500">· armed {run.authorizedAt}</span>
              <span className="block text-[10px] text-slate-500">
                experiment {run.experimentId} · waiting on the job-execution transport (the
                disclosed P2 boundary)
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {rightsGrants.length === 0 ? (
        <p className="text-xs text-slate-400" data-testid="console-grants-empty">
          No rights grants in this tenant — the evidence path (intelligence recording) needs one.
        </p>
      ) : (
        <ul className="flex flex-col gap-1 text-xs" data-testid="console-rights-grants">
          {rightsGrants.map((grant) => (
            <li key={grant.grantId} className="text-slate-400">
              <span className="font-mono text-slate-200">{grant.grantId}</span> · {grant.action}{' '}
              · {grant.status} · holder {grant.rightsHolderId}
            </li>
          ))}
        </ul>
      )}
      <ConsoleIntentForm
        summaryLabel="Declare intent: grant analysis rights"
        routedTo="rights-authority"
        disclosureNote="The rights authority validates the declared scope and terms fail-closed; the grant unblocks intelligence recording for the evidence path."
        testId="console-grant-rights-form"
        fields={[
          { name: CONSOLE_INTENT_FORM_FIELDS.grantId, label: 'Rights grant id', kind: 'text', required: true, placeholder: 'e.g. grant-analyze-001' },
          { name: CONSOLE_INTENT_FORM_FIELDS.rightsHolderId, label: 'Rights holder identity id', kind: 'text', required: true },
          { name: CONSOLE_INTENT_FORM_FIELDS.actionText, label: 'Granted action', kind: 'text', required: true, placeholder: 'analyze' },
          { name: CONSOLE_INTENT_FORM_FIELDS.scopeJson, label: 'Rights scope', kind: 'json', required: true, placeholder: '{}' },
          { name: CONSOLE_INTENT_FORM_FIELDS.termsJson, label: 'Rights terms', kind: 'json', required: true, placeholder: '{}' },
        ]}
        parse={grantAnalysisRightsDeclarationFromFormData}
        onDeclareConsoleIntent={onDeclareConsoleIntent}
      />
      <ConsoleIntentForm
        summaryLabel="Declare intent: create an automation run"
        routedTo="automation-engine-authority"
        disclosureNote="The engine instantiates the run in the 'compiled' state — nothing executes; the run waits for authorization in this mode."
        testId="console-create-run-form"
        fields={[
          { name: CONSOLE_INTENT_FORM_FIELDS.strategyId, label: 'Compiled strategy id', kind: 'text', required: true },
        ]}
        parse={createRunDeclarationFromFormData}
        onDeclareConsoleIntent={onDeclareConsoleIntent}
      />
      <ConsoleIntentForm
        summaryLabel="Authorize a run (arm)"
        routedTo="automation-engine-authority"
        disclosureNote="THE approval transition: the §27 rights verdict decides and the experiment binding must resolve ACTIVE — a denial is relayed verbatim and nothing is armed."
        testId="console-arm-run-form"
        fields={[
          { name: CONSOLE_INTENT_FORM_FIELDS.runId, label: 'Run id (compiled)', kind: 'text', required: true },
          { name: CONSOLE_INTENT_FORM_FIELDS.principalText, label: 'Principal (run right holder)', kind: 'text', required: true },
        ]}
        parse={armRunDeclarationFromFormData}
        onDeclareConsoleIntent={onDeclareConsoleIntent}
      />
    </div>
  );
}


/** The props every mode content renderer shares. */
export interface ModeContentProps {
  readonly page: ConsolePageData;
  readonly onDeclareConsoleIntent: (declaration: ConsoleIntentDeclaration) => void;
  readonly missionId: string | null;
}

/** Dispatches the working mode's content renderer (the center region). */
export function ConsoleViewModeContent({
  page,
  onDeclareConsoleIntent,
  missionId,
}: ModeContentProps) {
  switch (page.mode) {
    case 'direct':
      return (
        <DirectModeContent page={page} onDeclareConsoleIntent={onDeclareConsoleIntent} missionId={missionId} />
      );
    case 'plan':
      return <PlanModeContent page={page} onDeclareConsoleIntent={onDeclareConsoleIntent} />;
    case 'research':
      return <ResearchModeContent page={page} onDeclareConsoleIntent={onDeclareConsoleIntent} />;
    case 'results':
      return <ResultsModeContent page={page} />;
    case 'control':
      return <ControlModeContent page={page} onDeclareConsoleIntent={onDeclareConsoleIntent} />;
  }
}
