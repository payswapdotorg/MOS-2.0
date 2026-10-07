/**
 * Shared substrate-adapter errors.
 *
 * MOS v2.0 (W0-B / BOOT-003).
 * NOT a port file: support module used by adapters. May be imported from
 * anywhere inside this package (relative imports only; never `@zcode/*` —
 * that allowlist applies to `src/adapters/**` entry imports).
 */

/**
 * Thrown by disclosed interface-stage adapter skeletons (W0-B) and by any
 * adapter operation whose substrate binding does not exist yet.
 *
 * This error existing is a FEATURE of the substrate firewall: it makes
 * "not implemented yet" an explicit, machine-checkable runtime state
 * instead of a silent stub that pretends to work. Skeletons throwing this
 * error must never be represented as working adapters.
 */
export class SubstrateAdapterNotBoundError extends Error {
  readonly code = "MOS_SUBSTRATE_ADAPTER_NOT_BOUND";
  /** Name of the MOS port whose substrate binding is missing. */
  readonly portName: string;
  /** Follow-up Work Item that will bind this port to the substrate. */
  readonly bindingWorkItem: string;

  constructor(portName: string, bindingWorkItem: string, detail: string) {
    super(
      `${portName} adapter is not bound to the ZCode substrate yet. ` +
        `Interface-stage skeleton (W0-B / BOOT-003). Binding scheduled for ` +
        `${bindingWorkItem}. ${detail}`,
    );
    this.name = "SubstrateAdapterNotBoundError";
    this.portName = portName;
    this.bindingWorkItem = bindingWorkItem;
  }
}
