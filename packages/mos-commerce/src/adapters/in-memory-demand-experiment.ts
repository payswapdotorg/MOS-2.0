/**
 * COMMERCE-001 — the DISCLOSED in-memory demand-experiment double.
 *
 * Self-labeling: every experiment ref this double mints carries the
 * `test-double:` prefix so test artifacts can never masquerade as
 * authority-minted refs. The REAL adapter for the seam is composed at the
 * integration root over @mos/experiments (proven by the compat battery).
 */
import type { ExperimentRef, IdentityRef } from "@mos/contracts";
import type {
  CommerceDiscoveryRecord,
  DemandExperimentBindingOutcome,
  DemandExperimentPort,
} from "../types.js";

export interface InMemoryDemandExperimentDoubleOptions {
  /**
   * Deterministic denial mode: when set, every binding is denied with this
   * verbatim attribution (the fail-closed path under test).
   */
  readonly denyWith?: string;
}

export const createInMemoryDemandExperimentPort = (
  options: InMemoryDemandExperimentDoubleOptions = {},
): DemandExperimentPort => {
  const bound = new Set<string>();
  return {
    async bindDemandTest(
      _scope: Parameters<DemandExperimentPort["bindDemandTest"]>[0],
      _actor: IdentityRef,
      record: CommerceDiscoveryRecord,
    ): Promise<DemandExperimentBindingOutcome> {
      if (options.denyWith !== undefined) {
        return {
          ok: false,
          error: {
            code: "DEMAND_PORT_DENIED",
            message: "the demand experiment port denied the binding",
            attribution: options.denyWith,
          },
        };
      }
      const experimentRef = `test-double:${record.id}#v${record.version}` as ExperimentRef;
      bound.add(experimentRef);
      return { ok: true, experimentRef };
    },
  };
};
