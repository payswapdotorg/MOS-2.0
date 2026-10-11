/**
 * Distribution Binding Lifecycle view presentation (UX-004, over PROD-001)
 * — §13 badges, resolvable-only refs, gate attribution with the SOCIAL-001
 * zero-transport discipline, platform-said health (HEALTH-001), durable job
 * linkage (§26). PRESENTATION ONLY: pure formatting of view-model verdicts.
 */
import type {
  DistributionBindingsVm,
  DistributionBindingVm,
  ResolvableRef,
  GateOutcomeVm,
} from '../../ports/connections-views.js';

export function renderLifecycleBadge(b: DistributionBindingVm): string {
  return `lifecycle: ${b.lifecycleStage}`;
}

export function renderRef<T>(ref: ResolvableRef<T>): string {
  return ref.resolvable ? ref.label : `unresolved-ref (${ref.kind}): ${ref.reason}`;
}

export function renderGate(gate: GateOutcomeVm): string {
  if (gate.kind === 'denied') {
    return `rights: DENIED by rule "${gate.namedRule}" — ${gate.denialReason}; transport calls occurred: ${gate.transportCallsOccurred} (denial preceded transport — SOCIAL-001)`;
  }
  if (gate.kind === 'granted') {
    return `rights: GRANTED via "${gate.namedGrantOrConsent}" — ${gate.grantReason}`;
  }
  return `gate error (${gate.authority}/${gate.errorKind}) — rendered fail-closed, no outcome asserted`;
}

export function renderDurable(b: DistributionBindingVm): string {
  if (b.durableSegment === null) return 'durable segment: none (no job linkage claimed)';
  const d = b.durableSegment;
  const events = d.recentEvents.map((e) => `${e.kind}@${e.occurredAt}`).join(', ');
  return `durable segment: claim=${d.claim} job=${d.jobId} state=${d.lastObservedState} events[${events}]`;
}

export function renderHealth(b: DistributionBindingVm): string[] {
  return b.healthObservations.map(
    (h) =>
      `health: platform-said (source: ${h.sourceAttribution}) confidence=${h.confidence}` +
      (h.restrictionTyping ? ` restriction=${h.restrictionTyping}` : '') +
      (h.rateLimitPosture ? ` rate-limit=${h.rateLimitPosture}` : '') +
      ` observed=${h.observedAt}`,
  );
}

export function renderBinding(b: DistributionBindingVm): string[] {
  const lines = [
    `binding ${b.bindingId} — ${renderLifecycleBadge(b)}`,
    `  productionRequest: ${renderRef(b.productionRequestRef)}`,
    `  tenant: ${b.tenantContext}`,
    `  artifacts: ${b.artifactSetVersions
      .map((a) =>
        a.resolvable ? `${a.artifactLabel}@${a.version}` : `${a.artifactLabel}: unresolved (${a.reason})`,
      )
      .join(', ')}`,
    `  ${renderGate(b.rightsGate)}`,
    `  policy verdict: ${b.policyVerdict.outcome} (${b.policyVerdict.namedConstraint}) ref=${renderRef(b.policyVerdict.verdictRef)}`,
    `  ${renderDurable(b)}`,
    ...renderHealth(b).map((h) => '  ' + h),
  ];
  return lines;
}

export function renderBindings(vm: DistributionBindingsVm): string[] {
  const lines = [
    `authority: ${vm.authority} (social-distribution — distinct from provider-integrations)`,
    `bindings: ${vm.availability.kind === 'available' ? String(vm.bindings.length) : `unavailable: ${vm.availability.reason}`}`,
  ];
  for (const b of vm.bindings) lines.push(...renderBinding(b));
  return lines;
}
