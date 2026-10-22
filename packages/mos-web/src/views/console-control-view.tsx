import type { ConsoleIntentDeclaration } from '../ports/console-intents.js';
import type { ConsolePageData } from '../routes/console-page-loading.js';
import { ConsoleIntentForm } from './console-intent-form.js';
import {
  CONSOLE_INTENT_FORM_FIELDS,
  armRunDeclarationFromFormData,
  createRunDeclarationFromFormData,
  grantAnalysisRightsDeclarationFromFormData,
} from './console-intent-form-data.js';

/**
 * The Control mode (the CONSOLE wave, Worker B): the authorization queue
 * (runs in 'compiled' — arm is the approving action), the authorized runs
 * (armed, honestly waiting on the disclosed P2 transport), the tenant's
 * rights grants — and the three declarations this mode owns
 * (grant-analysis-rights, create-run, arm-run — THE approval transition).
 */

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
      <section aria-labelledby="console-queue-title" className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 id="console-queue-title" className="text-base font-semibold text-slate-900">
          Awaiting authorization
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Runs in the 'compiled' lifecycle — nothing executes until the arm declaration's §27
          rights verdict and experiment-binding check pass.
        </p>
        {awaitingAuthorization.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500" data-testid="console-queue-empty">
            No runs awaiting authorization — the approval queue is honest about being empty.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2" data-testid="console-authorization-queue">
            {awaitingAuthorization.map((run) => (
              <li
                key={run.runId}
                className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs"
                data-testid={`console-queue-run-${run.runId}`}
              >
                <p className="font-mono text-slate-800">{run.runId}</p>
                <p className="mt-1 text-slate-500">{run.missionSummary}</p>
                <p className="mt-1 text-[10px] text-slate-500">
                  compiled {run.declaredAt} · strategy <span className="font-mono">{run.strategyId}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="console-authorized-title">
        <h2 id="console-authorized-title" className="text-base font-semibold text-slate-900">
          Authorized runs
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Armed runs — authorized, waiting on the durable job/distribution/measurement transports
          (the disclosed P2 boundary). The console never simulates their execution.
        </p>
        {authorized.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500" data-testid="console-authorized-empty">
            No armed runs yet — an armed run appears here with the experiment it bound.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2" data-testid="console-authorized-runs">
            {authorized.map((run) => (
              <li
                key={run.runId}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs"
                data-testid={`console-authorized-run-${run.runId}`}
              >
                <span className="font-mono text-slate-800">{run.runId}</span>{' '}
                <span className="text-slate-500">· armed {run.authorizedAt}</span>
                <span className="block text-[10px] text-slate-500">
                  experiment <span className="font-mono">{run.experimentId}</span> · waiting on the
                  job-execution-transport (the disclosed P2 boundary)
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="console-grants-title">
        <h2 id="console-grants-title" className="text-base font-semibold text-slate-900">
          Rights grants
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          The permissions this tenant holds, verbatim from the rights authority — the evidence
          path's recording gate resolves against these.
        </p>
        {rightsGrants.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500" data-testid="console-grants-empty">
            No rights grants in this tenant — the evidence path (intelligence recording) needs one.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1 text-xs" data-testid="console-rights-grants">
            {rightsGrants.map((grant) => (
              <li
                key={grant.grantId}
                className="text-slate-500"
                data-testid={`console-grant-${grant.grantId}`}
              >
                <span className="font-mono text-slate-800">{grant.grantId}</span> · {grant.action}{' '}
                · {grant.status} · holder <span className="font-mono">{grant.rightsHolderId}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <ConsoleIntentForm
        summaryLabel="Declare intent: grant analysis rights"
        routedTo="rights-authority"
        disclosureNote="The rights authority validates the declared scope and terms fail-closed; the grant unblocks intelligence recording for the evidence path."
        testId="console-grant-rights-form"
        fields={[
          { name: CONSOLE_INTENT_FORM_FIELDS.grantId, label: 'Rights grant id', kind: 'text', required: true, placeholder: 'e.g. grant-analyze-001' },
          { name: CONSOLE_INTENT_FORM_FIELDS.rightsHolderId, label: 'Rights holder identity id', kind: 'text', required: true, placeholder: 'e.g. identity-operator' },
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
          { name: CONSOLE_INTENT_FORM_FIELDS.strategyId, label: 'Compiled strategy id', kind: 'text', required: true, placeholder: 'e.g. prod003-strategy:plan-1@v1' },
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
          { name: CONSOLE_INTENT_FORM_FIELDS.runId, label: 'Run id (compiled)', kind: 'text', required: true, placeholder: 'e.g. run-plan-1-1' },
          { name: CONSOLE_INTENT_FORM_FIELDS.principalText, label: 'Principal (run right holder)', kind: 'text', required: true, placeholder: 'e.g. identity-operator' },
        ]}
        parse={armRunDeclarationFromFormData}
        onDeclareConsoleIntent={onDeclareConsoleIntent}
      />
    </div>
  );
}
