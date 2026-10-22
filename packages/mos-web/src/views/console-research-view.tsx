import type { ConsoleIntentDeclaration } from '../ports/console-intents.js';
import type { ConsolePageData } from '../routes/console-page-loading.js';
import { ConsoleIntentForm } from './console-intent-form.js';
import {
  CONSOLE_INTENT_FORM_FIELDS,
  createExperimentDeclarationFromFormData,
  recordIntelligenceDeclarationFromFormData,
} from './console-intent-form-data.js';

/**
 * The Research mode (the CONSOLE wave, Worker B): the mission's evidence
 * base — the §25 product-intelligence records (each with its VERBATIM basis
 * label and rights status) and the REAL experiments the plans cite and the
 * runs arm against — plus the Lab links and the two declarations this mode
 * owns (create-experiment, record-intelligence).
 */

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
      <section aria-labelledby="console-lab-links-title">
        <h2 id="console-lab-links-title" className="text-base font-semibold text-slate-900">
          The Lab workspace
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          The Marketing Engineering Lab stays at /lab (its own workspace); these links open its
          research sections.
        </p>
        <div className="mt-2 flex flex-wrap gap-2" data-testid="console-lab-links">
          {labLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-md border border-slate-200 px-2 py-1 text-xs text-mos-navy underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mos-navy"
            >
              {link.label}
            </a>
          ))}
        </div>
      </section>
      <section aria-labelledby="console-intelligence-title" className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 id="console-intelligence-title" className="text-base font-semibold text-slate-900">
          Product intelligence (§25)
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          The append-only, rights-gated evidence base the plan citations resolve against — each
          record carries its basis label and rights status verbatim.
        </p>
        {intelligenceRecords.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500" data-testid="console-intelligence-empty">
            No intelligence records in this tenant yet — the evidence path needs a rights grant
            before records can be recorded.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2" data-testid="console-intelligence-records">
            {intelligenceRecords.map((record) => (
              <li
                key={`${record.recordId}-${record.version}`}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs"
                data-testid={`console-intelligence-record-${record.recordId}`}
              >
                <span className="font-mono text-slate-800">
                  {record.recordId}@v{record.version}
                </span>{' '}
                <span className="text-slate-500">· {record.contentKind} · basis </span>
                <span
                  className={
                    record.basis === 'counterfactual-forecast'
                      ? 'text-amber-700'
                      : 'text-emerald-700'
                  }
                  data-testid={`console-intelligence-basis-${record.recordId}`}
                >
                  {record.basis}
                </span>
                {record.basis === 'counterfactual-forecast' ? (
                  <span className="text-amber-700"> (declared forecast, never measured)</span>
                ) : null}
                <span className="block text-[10px] text-slate-500">
                  rights: {record.rightsStatus} · recorded {record.recordedAt}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="console-experiments-title">
        <h2 id="console-experiments-title" className="text-base font-semibold text-slate-900">
          Experiments
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          The REAL experiment records the plans cite and the runs arm against — binding status
          verbatim from the experiments authority.
        </p>
        {experiments.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500" data-testid="console-experiments-empty">
            No experiments yet — a plan's expectations arm against a REAL experiment record.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2" data-testid="console-experiments">
            {experiments.map((experiment) => (
              <li
                key={experiment.experimentId}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs"
                data-testid={`console-experiment-${experiment.experimentId}`}
              >
                <span className="font-mono text-slate-800">{experiment.experimentId}</span>{' '}
                <span className="text-slate-500">· {experiment.status}</span>
                <span className="block text-[10px] text-slate-500">{experiment.question}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
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
          { name: CONSOLE_INTENT_FORM_FIELDS.rightsRef, label: 'Rights ref (the recording gate resolves this)', kind: 'text', required: true, placeholder: 'e.g. grant-analyze-001' },
          { name: CONSOLE_INTENT_FORM_FIELDS.attributionText, label: 'Attribution note', kind: 'text', required: false },
          { name: CONSOLE_INTENT_FORM_FIELDS.noteText, label: 'Recorder note', kind: 'text', required: false },
        ]}
        parse={recordIntelligenceDeclarationFromFormData}
        onDeclareConsoleIntent={onDeclareConsoleIntent}
      />
    </div>
  );
}
