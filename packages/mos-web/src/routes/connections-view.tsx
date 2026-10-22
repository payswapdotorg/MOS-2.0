import type { ConnectionsPageData } from './route-loading.js';
import type {
  CapabilityMatrixEntryVm,
  ProviderDefinitionVm,
  DistributionBindingVm,
  ResolvableRef,
} from '../ports/connections-views.js';
import {
  renderCapabilityCell,
  renderAvailability,
} from '../views/connections/provider-directory-view.js';
import {
  renderGate,
  renderDurable,
  renderRef,
  renderHealth,
} from '../views/connections/binding-lifecycle-view.js';
import { SummaryLayer, DisclosureItem } from '../views/disclosure/disclosure-primitive.js';
import { buildConnectionsSummary } from '../views/disclosure/surface-summaries.js';

/**
 * The Connections surface (UX-004): the read-side view over TWO DISTINCT
 * authorities (spec §3 — never fused): the provider directory
 * (@mos/integrations, the INTEG-001 four-layer machinery) and the
 * distribution binding lifecycle (@mos/distribution, PROD-001). UNKNOWN
 * capabilities render as UNKNOWN (never coerced); denied gates show ZERO
 * transport calls occurred; health renders platform-said, source-attributed
 * with CONFIRMED/SUSPECTED typed separately; durable segments show job
 * state, never spinners; refs render resolvable-only (unresolvable = typed
 * failure). NO connections actions exist here: binding, gating and
 * credentialing are authority actions this surface never performs or fakes.
 */

function CapabilityMatrixView({
  entries,
  testId,
}: {
  readonly entries: ReadonlyArray<CapabilityMatrixEntryVm>;
  readonly testId: string;
}) {
  return (
    <ul className="mt-1 flex flex-col gap-0.5" data-testid={testId}>
      {entries.map((entry) => (
        <li key={entry.capability} className="text-xs text-slate-500">
          <span className="text-slate-700">{entry.capability}</span>:{' '}
          <span
            className={
              entry.status === 'unknown'
                ? 'rounded bg-amber-50 px-1 py-0.5 text-amber-800'
                : 'text-slate-500'
            }
          >
            {renderCapabilityCell(entry)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ImplementationRefView({ ref }: { readonly ref: ResolvableRef<unknown> }) {
  return ref.resolvable ? (
    <span className="text-slate-500">→ {ref.target !== null && typeof ref.target === 'object' && 'implementationLabel' in (ref.target as Record<string, unknown>) ? String((ref.target as Record<string, unknown>).implementationLabel) : ref.label}</span>
  ) : (
    <span className="rounded bg-rose-100 px-1 py-0.5 text-rose-200/90" role="note">
      ref-failure: {ref.reason}
    </span>
  );
}

function ProviderCard({
  provider,
  selected,
}: {
  readonly provider: ProviderDefinitionVm;
  readonly selected: boolean;
}) {
  return (
    <li
      className={`rounded-lg border p-4 ${selected ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white'}`}
      data-testid={`connections-provider-${provider.providerId}`}
    >
      <DisclosureItem
        id={`ux005-provider-${provider.providerId}`}
        defaultOpen={selected}
        summary={
          <span>
        <h3 className="inline text-sm font-semibold text-slate-900">
          <a
            href={`/connections?provider=${provider.providerId}`}
            className="underline decoration-slate-600 underline-offset-2 hover:decoration-slate-300"
            aria-current={selected ? 'page' : undefined}
            data-testid={`connections-provider-link-${provider.providerId}`}
          >
            {provider.providerLabel}
          </a>{' '}
          <span className="font-normal text-slate-500">[{provider.providerKind}]</span>
        </h3>{' '}
        <span className="text-xs text-slate-500">
          authority: {provider.authority} · {renderAvailability(provider.availability)}
        </span>
          </span>
        }
      >
      {provider.implementations.map((impl) => (
        <div key={impl.implementationId} className="mt-3">
          <p className="text-xs text-slate-700" data-testid={`connections-impl-${impl.implementationId}`}>
            {impl.implementationLabel} ({impl.implementationId}) — status={impl.status}
            {impl.transports.length > 0
              ? ` · transports[${impl.transports
                  .map((t) => `${t.transport}=${t.available ? 'available' : 'unavailable'}`)
                  .join(', ')}]`
              : ''}
          </p>
          <CapabilityMatrixView
            entries={impl.capabilityMatrix}
            testId={`connections-capabilities-${impl.implementationId}`}
          />
        </div>
      ))}
      {provider.clientInstances.map((instance) => (
        <p key={instance.instanceId} className="mt-2 text-xs text-slate-500">
          {instance.merchantLabel} ({instance.instanceId}){' '}
          <ImplementationRefView ref={instance.implementationRef} /> · tenant={instance.scopedToTenant}
        </p>
      ))}
      </DisclosureItem>
    </li>
  );
}

function BindingRow({
  binding,
  selected,
}: {
  readonly binding: DistributionBindingVm;
  readonly selected: boolean;
}) {
  const collapsed = (
    <span>
      <h3 className="inline text-sm font-semibold text-slate-900">
        <a
          href={`/connections?binding=${binding.bindingId}`}
          className="underline decoration-slate-600 underline-offset-2 hover:decoration-slate-300"
          aria-current={selected ? 'page' : undefined}
          data-testid={`connections-binding-link-${binding.bindingId}`}
        >
          binding {binding.bindingId}
        </a>
      </h3>{' '}
      <span className="text-xs text-slate-500" data-testid={`connections-binding-lifecycle-${binding.bindingId}`}>
        lifecycle: {binding.lifecycleStage} · tenant: {binding.tenantContext}
      </span>
    </span>
  );
  return (
    <li
      className={`rounded-lg border p-4 ${selected ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white'}`}
      data-testid={`connections-binding-${binding.bindingId}`}
    >
      <DisclosureItem
        id={`ux005-binding-${binding.bindingId}`}
        defaultOpen={selected}
        summary={collapsed}>
        <BindingLifecycleDetailView binding={binding} />
      </DisclosureItem>
    </li>
  );
}

function BindingLifecycleDetailView({ binding }: { readonly binding: DistributionBindingVm }) {
  const lines = renderHealth(binding);
  return (
    <aside
      className="rounded-lg border border-slate-300 bg-white p-4"
      aria-label={`binding ${binding.bindingId} lifecycle detail`}
      data-testid={`connections-binding-detail-${binding.bindingId}`}
    >
      <h3 className="text-sm font-semibold text-slate-900">
        Binding {binding.bindingId} — lifecycle detail
      </h3>
      <dl className="mt-2 grid grid-cols-1 gap-1 text-xs text-slate-500 sm:grid-cols-[max-content_1fr]">
        <dt className="text-slate-500">lifecycle</dt>
        <dd data-testid="connections-detail-lifecycle">lifecycle: {binding.lifecycleStage}</dd>
        <dt className="text-slate-500">productionRequest</dt>
        <dd data-testid="connections-detail-production-request">
          {renderRef(binding.productionRequestRef)}
        </dd>
        <dt className="text-slate-500">artifacts</dt>
        <dd data-testid="connections-detail-artifacts">
          {binding.artifactSetVersions
            .map((a) =>
              a.resolvable ? `${a.artifactLabel}@${a.version}` : `${a.artifactLabel}: unresolved (${a.reason})`,
            )
            .join(', ') || 'none recorded'}
        </dd>
        <dt className="text-slate-500">rights gate</dt>
        <dd data-testid="connections-detail-gate">{renderGate(binding.rightsGate)}</dd>
        <dt className="text-slate-500">policy verdict</dt>
        <dd data-testid="connections-detail-policy">
          {binding.policyVerdict.outcome} ({binding.policyVerdict.namedConstraint}) ref=
          {renderRef(binding.policyVerdict.verdictRef)}
        </dd>
        <dt className="text-slate-500">durable segment</dt>
        <dd data-testid="connections-detail-durable">{renderDurable(binding)}</dd>
        <dt className="text-slate-500">health (platform-said)</dt>
        <dd>
          <ul className="flex flex-col gap-0.5" data-testid="connections-detail-health">
            {lines.length > 0 ? (
              lines.map((line) => (
                <li key={line}>{line}</li>
              ))
            ) : (
              <li>no health observations recorded — none fabricated</li>
            )}
          </ul>
        </dd>
      </dl>
    </aside>
  );
}

export function ConnectionsView({ data }: { readonly data: ConnectionsPageData }) {
  const selectedProvider =
    data.selectedProviderId === null
      ? null
      : (data.data.directory.providers.find((p) => p.providerId === data.selectedProviderId) ?? null);
  const selectedBinding =
    data.selectedBindingId === null
      ? null
      : (data.data.bindings.bindings.find((b) => b.bindingId === data.selectedBindingId) ?? null);

  const confirmedCount = data.data.bindings.bindings.flatMap((b) => b.healthObservations).filter(
    (h) => h.confidence === 'CONFIRMED',
  ).length;
  const suspectedCount = data.data.bindings.bindings.flatMap((b) => b.healthObservations).filter(
    (h) => h.confidence === 'SUSPECTED',
  ).length;
  const unknownCapabilityCount = data.data.directory.providers.flatMap((p) =>
    p.implementations.flatMap((i) => i.capabilityMatrix),
  ).filter((c) => c.status === 'unknown').length;
  const summary = buildConnectionsSummary({
    providerCount: data.data.directory.providers.length,
    confirmedCount,
    suspectedCount,
    unknownCapabilityCount,
  });

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-bold">Connections</h1>
        <p className="mt-1 text-sm text-slate-500">
          Provider integrations and distribution bindings — two DISTINCT authorities observed
          read-side: the provider directory (provider-integrations) and the distribution binding
          lifecycle (social-distribution). The surface presents what the authorities report,
          including UNKNOWN states and typed failures — never placeholders.
        </p>
        <p className="mt-1 text-xs text-slate-500" data-testid="connections-authorities-note">
          authority: {data.data.directory.authority} · authority: {data.data.bindings.authority} —
          never fused
        </p>
      </header>

      <SummaryLayer
        surface="connections"
        headline={summary.headline}
        stats={summary.stats}
        honestyLabels={summary.honestyLabels}
      />

      <section aria-labelledby="connections-directory-title">
        <h2 id="connections-directory-title" className="text-base font-semibold text-slate-900">
          Provider directory
        </h2>
        <p className="mb-3 mt-1 text-xs text-slate-500">
          The four-layer machinery (INTEG-001): provider definitions → implementations →
          merchant/client instances → availability. Capability matrices keep UNKNOWN states
          preserved — never coerced to supported or unsupported.
        </p>
        <p className="mb-3 text-xs text-slate-500" data-testid="connections-directory-verdict">
          directory: {renderAvailability(data.data.directory.availability)}
        </p>
        <ul className="flex flex-col gap-3" data-testid="connections-providers-list">
          {data.data.directory.providers.map((provider) => (
            <ProviderCard
              key={provider.providerId}
              provider={provider}
              selected={selectedProvider !== null && selectedProvider.providerId === provider.providerId}
            />
          ))}
        </ul>
      </section>

      <section aria-labelledby="connections-bindings-title">
        <h2 id="connections-bindings-title" className="text-base font-semibold text-slate-900">
          Distribution bindings
        </h2>
        <p className="mb-3 mt-1 text-xs text-slate-500">
          The binding lifecycle (PROD-001): §13 badges draft → gated → executing → observed →
          closed | retracted | abandoned; gate verdicts with verbatim authority attribution; a
          denial shows ZERO transport calls occurred; durable segments show job state.
        </p>
        <p className="mb-3 text-xs text-slate-500" data-testid="connections-bindings-verdict">
          bindings:{' '}
          {data.data.bindings.availability.kind === 'available'
            ? String(data.data.bindings.bindings.length)
            : `unavailable: ${data.data.bindings.availability.reason}`}
        </p>
        <ul className="flex flex-col gap-3" data-testid="connections-bindings-list">
          {data.data.bindings.bindings.map((binding) => (
            <BindingRow
              key={binding.bindingId}
              binding={binding}
              selected={selectedBinding !== null && selectedBinding.bindingId === binding.bindingId}
            />
          ))}
        </ul>
      </section>

      {data.selectedBindingId !== null && selectedBinding === null ? (
        <aside
          role="alert"
          className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-xs text-amber-800"
          data-testid="connections-binding-selection-error"
        >
          The selected binding does not exist in this tenant scope (or does not exist at all — the
          shell cannot tell and will not guess).
        </aside>
      ) : null}
    </div>
  );
}
