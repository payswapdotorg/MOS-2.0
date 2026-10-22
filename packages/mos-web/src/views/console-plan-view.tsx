import type { ConsoleIntentDeclaration } from '../ports/console-intents.js';
import type { ConsolePageData } from '../routes/console-page-loading.js';
import { ConsoleIntentForm } from './console-intent-form.js';
import { CONSOLE_INTENT_FORM_FIELDS, compileStrategyDeclarationFromFormData } from './console-intent-form-data.js';
import { PlanChainDetailView, StrategyDetailView } from './console-detail-views.js';

/**
 * The Plan mode (the CONSOLE wave, Worker B): the mission's plan chains and
 * compiled strategies — summary-first rows (plan id, version, counts) with
 * the FULL record detail behind native details/summary progressive
 * disclosure (platform rationale, expectations with their basis labels,
 * the boundary statement, the digest, the organization/phases/comparators
 * the compiler produced). The agents registry read rides as the secondary
 * context the compiler's organization validation gates against.
 */

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
      <section aria-labelledby="console-plans-title" className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 id="console-plans-title" className="text-base font-semibold text-slate-900">
          Marketing plan chains (MARKETING-001)
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Evidence-linked, mission-cited plans — every platform choice and expectation carries
          citations that resolve through the product-intelligence authority. Open a chain for its
          full record.
        </p>
        {planChains.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500" data-testid="console-plans-empty">
            No plans composed for this mission yet — declare a compose-plan intent from the Direct
            mode once the evidence base resolves.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2" data-testid="console-plan-chains">
            {planChains.map((chain) => (
              <li key={chain.planId}>
                <details
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2"
                  data-testid={`console-plan-chain-${chain.planId}`}
                >
                  <summary className="cursor-pointer select-none text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mos-navy">
                    <span className="font-mono text-slate-800">{chain.planId}</span>
                    <span className="text-slate-500">
                      {' '}
                      · v{chain.latestVersion} · {chain.platforms.length} platforms ·{' '}
                      {chain.metricExpectations.length} metric expectations ·{' '}
                      {chain.experimentExpectations.length} experiment expectations · composed{' '}
                      {chain.composedAt}
                    </span>
                  </summary>
                  <div className="mt-2 border-t border-slate-200 pt-2">
                    <PlanChainDetailView chain={chain} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="console-strategies-title">
        <h2 id="console-strategies-title" className="text-base font-semibold text-slate-900">
          Compiled strategies (PROD-003)
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          The organization, delegation, phases, budgets and comparators the compiler produced from
          a plan version — validated against the agents registry (AGT-003) and gated by the §27
          compile right.
        </p>
        {strategies.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500" data-testid="console-strategies-empty">
            No compiled strategies yet — a composed plan can be compiled into the organization,
            phases and comparators the engine runs.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2" data-testid="console-strategies">
            {strategies.map((strategy) => (
              <li key={strategy.strategyId}>
                <details
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2"
                  data-testid={`console-strategy-${strategy.strategyId}`}
                >
                  <summary className="cursor-pointer select-none text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mos-navy">
                    <span className="font-mono text-slate-800">{strategy.strategyId}</span>
                    <span className="text-slate-500">
                      {' '}
                      · plan {strategy.sourcePlan.planId}@v{strategy.sourcePlan.version} ·{' '}
                      {strategy.organization.roles.length} roles ·{' '}
                      {strategy.organization.delegationEdges.length} delegation edges ·{' '}
                      {strategy.organization.phases.length} phases ·{' '}
                      {strategy.comparators.length} comparators
                    </span>
                  </summary>
                  <div className="mt-2 border-t border-slate-200 pt-2">
                    <StrategyDetailView strategy={strategy} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
      {page.agentsError !== null ? (
        <aside
          role="alert"
          className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800"
          data-testid="console-agents-error"
        >
          The agents registry could not be loaded — the strategy compiler's organization validation
          context is explicitly unavailable rather than fabricated.
        </aside>
      ) : page.agents !== null ? (
        <section aria-labelledby="console-agents-title" data-testid="console-agents-registry">
          <h2 id="console-agents-title" className="text-sm font-semibold text-slate-700">
            The agents registry the compiler validates against
          </h2>
          {page.agents.agentBodies.map((body) => (
            <p
              key={body.bodyId}
              className="mt-1 text-xs"
              data-testid={`console-agent-body-${body.bodyId}`}
            >
              <span className="font-mono text-slate-800">{body.bodyId}</span>
              <span className="text-slate-500">
                {' '}
                · v{body.version} · role {body.role} · {body.capabilitiesCount} capabilities
              </span>
            </p>
          ))}
          {page.agents.organizations.length === 0 ? (
            <p className="mt-1 text-xs text-slate-500" data-testid="console-agents-organizations-empty">
              No registered organizations yet — compilation registers the organization it
              validated; the registry lists what AGT-003 actually holds.
            </p>
          ) : (
            page.agents.organizations.map((organization) => (
              <p
                key={organization.organizationId}
                className="mt-1 text-xs"
                data-testid={`console-agent-organization-${organization.organizationId}`}
              >
                <span className="font-mono text-slate-800">{organization.organizationId}</span>
                <span className="text-slate-500">
                  {' '}
                  · v{organization.version} · {organization.name} · topology{' '}
                  {organization.topology} · {organization.nodesCount} nodes ·{' '}
                  {organization.edgesCount} edges
                </span>
              </p>
            ))
          )}
          {page.agents.bodiesNote !== null ? (
            <p className="mt-1 text-[10px] text-slate-500" data-testid="console-agents-note">
              {page.agents.bodiesNote}
            </p>
          ) : null}
        </section>
      ) : null}
      <ConsoleIntentForm
        summaryLabel="Declare intent: compile a composed plan into a strategy"
        routedTo="strategy-compiler-authority"
        disclosureNote="The compiler resolves the plan version, validates the organization against the agents registry, checks the §27 compile right, and produces the phases/delegation/comparators artifact."
        testId="console-compile-strategy-form"
        fields={[
          { name: CONSOLE_INTENT_FORM_FIELDS.planId, label: 'Plan chain id', kind: 'text', required: true, placeholder: 'the composed plan chain id' },
          { name: CONSOLE_INTENT_FORM_FIELDS.planVersion, label: 'Plan version (0 = latest)', kind: 'number', required: true, placeholder: '0' },
          { name: CONSOLE_INTENT_FORM_FIELDS.principalText, label: 'Principal (compile right holder)', kind: 'text', required: true, placeholder: 'e.g. identity-operator' },
        ]}
        parse={compileStrategyDeclarationFromFormData}
        onDeclareConsoleIntent={onDeclareConsoleIntent}
      />
    </div>
  );
}
