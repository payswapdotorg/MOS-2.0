import type { ConsoleIntentDeclaration } from '../ports/console-intents.js';
import type { ConsolePageData } from '../routes/console-page-loading.js';
import { ConsoleIntentForm } from './console-intent-form.js';
import { CONSOLE_INTENT_FORM_FIELDS, composePlanDeclarationFromFormData } from './console-intent-form-data.js';

/**
 * The Direct mode (the CONSOLE wave, Worker B): the mission's standing
 * directive — where the authorized path currently resolves (readiness),
 * where the workflow stands (plans/strategies/runs counts), and the
 * compose-plan declaration the Direct mode owns. Every count is a REAL
 * record count the authorities hold; nothing here is progress theater.
 */

const META = 'text-[10px] text-slate-500';

export function DirectModeContent({
  page,
  onDeclareConsoleIntent,
  missionId,
}: {
  readonly page: Extract<ConsolePageData, { readonly mode: 'direct' }>;
  readonly onDeclareConsoleIntent: (declaration: ConsoleIntentDeclaration) => void;
  readonly missionId: string | null;
}) {
  const { readiness, standings, mission } = page.data;
  const missionSelected = missionId !== null && mission.missionId !== '';
  return (
    <div className="flex flex-col gap-4" data-testid="console-mode-direct">
      <section
        aria-labelledby="console-direct-standings-title"
        className="rounded-lg border border-slate-200 bg-white p-4"
      >
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Work stream</p>
        <h2 id="console-direct-standings-title" className="mt-1 text-base font-semibold text-slate-900">
          Where the mission stands
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Honest counts of the REAL records the authorities hold for{' '}
          {missionSelected ? (
            <span className="font-mono text-slate-700">{mission.missionId}</span>
          ) : (
            'the whole tenant — select a mission from the rail to scope this'
          )}
          .
        </p>
        <dl
          className="mt-2 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2"
          data-testid="console-direct-standings"
        >
          <dt className="text-slate-500">Plans composed</dt>
          <dd className="font-mono text-slate-800">{standings.plansCount}</dd>
          <dt className="text-slate-500">Strategies compiled</dt>
          <dd className="font-mono text-slate-800">{standings.strategiesCount}</dd>
          <dt className="text-slate-500">Runs</dt>
          <dd className="font-mono text-slate-800">{standings.runsCount}</dd>
          <dt className="text-slate-500">Runs awaiting authorization</dt>
          <dd className="font-mono text-slate-800">{standings.runsAwaitingAuthorization}</dd>
          <dt className="text-slate-500">Runs armed</dt>
          <dd className="font-mono text-slate-800">{standings.runsArmed}</dd>
          <dt className="text-slate-500">Runs in other lifecycle states</dt>
          <dd className="font-mono text-slate-800">{standings.runsOther}</dd>
        </dl>
      </section>
      <section aria-labelledby="console-direct-readiness-title">
        <h2 id="console-direct-readiness-title" className="text-base font-semibold text-slate-900">
          The authorized path — what currently resolves
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          mission → rights grant → intelligence → experiment → plan → strategy → run → approval.
          Each number below is what the owning authority actually holds; a zero is an honest gap,
          never a hidden one.
        </p>
        <dl
          className="mt-2 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2"
          data-testid="console-direct-readiness"
        >
          <dt className="text-slate-500">Intelligence records</dt>
          <dd className="font-mono text-slate-800">{readiness.intelligenceRecords}</dd>
          <dt className="text-slate-500">Rights grants</dt>
          <dd className="font-mono text-slate-800">{readiness.rightsGrants}</dd>
          <dt className="text-slate-500">Experiments</dt>
          <dd className="font-mono text-slate-800">{readiness.experiments}</dd>
          <dt className="text-slate-500">Plans</dt>
          <dd className="font-mono text-slate-800">{readiness.plans}</dd>
        </dl>
        {readiness.rightsGrants === 0 ? (
          <p className="mt-2 text-xs text-amber-700" data-testid="console-direct-readiness-note">
            No rights grant yet — recording intelligence is denied fail-closed until the Control
            mode's grant-analysis-rights intent executes.
          </p>
        ) : null}
      </section>
      <section aria-labelledby="console-direct-direct-the-work-title" className="flex flex-col gap-3">
        <p id="console-direct-direct-the-work-title" className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Direct the work</p>
        {missionSelected ? (
          <ConsoleIntentForm
          summaryLabel="Declare intent: compose the mission's marketing plan"
          routedTo="marketing-planner-authority"
          disclosureNote="The planner composes an evidence-linked, mission-cited plan from the declared platform choices and expectations; every citation must resolve through the product-intelligence authority."
          testId="console-compose-plan-form"
          fields={[
            { name: CONSOLE_INTENT_FORM_FIELDS.planId, label: 'Plan chain id', kind: 'text', required: true, placeholder: 'e.g. plan-ghana-launch' },
            { name: CONSOLE_INTENT_FORM_FIELDS.missionId, label: 'The mission this plan serves (the selected mission)', kind: 'text', required: true, placeholder: 'e.g. mission_demo_1' },
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
      ) : (
        <p className="text-xs text-slate-500" data-testid="console-direct-form-none">
          No mission selected — the compose-plan declaration needs a mission context. Select a
          mission from the rail, or create one from the Missions surface.
        </p>
      )}
      <p className={META} data-testid="console-direct-waiting-note">
        After a plan composes, the Plan mode compiles it into the organization, phases and
        comparators the engine runs — and the Control mode owns the authorization gate.
      </p>
      </section>
    </div>
  );
}
