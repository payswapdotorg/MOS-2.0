/**
 * Provider Directory view presentation (UX-004) — the four-layer machinery
 * (definitions → implementations → merchant/client instances →
 * availability), browsing INTEG-001's real shapes. UNKNOWN capabilities
 * render as UNKNOWN. PRESENTATION ONLY: these pure formatting helpers
 * render verdicts the view port already carried — nothing here decides or
 * computes provider state.
 */
import type {
  ProviderDirectoryVm,
  ProviderDefinitionVm,
  ProviderImplementationLayerVm,
  CapabilityMatrixEntryVm,
} from '../../ports/connections-views.js';

export function renderCapabilityCell(entry: CapabilityMatrixEntryVm): string {
  // UNKNOWN PRESERVED — never coerced (criterion 3, pinned by test).
  if (entry.status === 'unknown') return `unknown — not claimed (${entry.statusNote})`;
  return entry.status;
}

export function renderAvailability(
  a: ProviderDirectoryVm['availability'],
): string {
  return a.kind === 'available'
    ? 'available'
    : `unavailable: ${a.reason} — verdict shown, no placeholder`;
}

export function renderProviderHeading(p: ProviderDefinitionVm): string {
  return `${p.providerLabel} [${p.providerKind}] — authority: ${p.authority}`;
}

export function renderImplementation(
  impl: ProviderImplementationLayerVm,
): string {
  const transports = impl.transports
    .map((t) => `${t.transport}=${t.available ? 'available' : 'unavailable'}`)
    .join(', ');
  const caps = impl.capabilityMatrix.map(renderCapabilityCell).join(' | ');
  return `${impl.implementationLabel} (${impl.implementationId}) status=${impl.status} transports[${transports}] capabilities[${caps}]`;
}

export function renderClientInstance(
  instance: ProviderDirectoryVm['providers'][number]['clientInstances'][number],
): string {
  const impl = instance.implementationRef.resolvable
    ? `→ ${instance.implementationRef.target.implementationLabel}`
    : `→ ref-failure: ${instance.implementationRef.reason}`;
  return `${instance.merchantLabel} (${instance.instanceId}) ${impl} tenant=${instance.scopedToTenant}`;
}

export function renderDirectory(vm: ProviderDirectoryVm): string[] {
  const lines: string[] = [
    `authority: ${vm.authority} (provider-integrations — distinct from distribution)`,
    `directory: ${renderAvailability(vm.availability)}`,
  ];
  for (const p of vm.providers) {
    lines.push(renderProviderHeading(p));
    for (const impl of p.implementations) lines.push('  ' + renderImplementation(impl));
    for (const c of p.clientInstances) lines.push('  ' + renderClientInstance(c));
  }
  return lines;
}
