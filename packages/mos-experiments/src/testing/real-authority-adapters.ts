/**
 * REAL authority adapters behind the BRIDGE-003 declared seams — the
 * experiments testing composition (the STUDIO-006 / BRIDGE-001
 * real-participant-authorities precedent).
 *
 * The REAL `@mos/missions` repository satisfies the mission seam
 * STRUCTURALLY (its own `getMission` — the binding core performs the §31
 * cross-tenant ≡ unknown narrowing itself), and the REAL `@mos/jobs`
 * queue is injected directly (a registry dep, no adapter needed).
 *
 * - `createRealDistributionObservationSource`: the REAL
 *   `@mos/distribution` `SocialAdapterPort` surfaces behind the
 *   distribution seam — `getPublication` is an exact-id find over the
 *   tenant-scoped append-only publication log (the log is the authority;
 *   the adapter only finds, never invents), `listObservations` is the
 *   platform-said observation log read.
 *
 * The REAL `@mos/lab` benchmark reader, the REAL `@mos/policy` evaluation
 * gate and the REAL `@mos/rights` frame gate are NOT registry dependencies
 * of this module — their REAL twins live in the compat battery
 * (compat/experiments-real-stack.test.ts, relative-import wiring, the
 * MARKETING-001/BRIDGE-001 compat pattern, disclosed). The authorities
 * remain the authorities; these adapters translate, they never invent.
 */

import type { SocialAdapterPort } from "@mos/distribution";
import type { TenantId } from "@mos/contracts";

import type { DistributionObservationSource } from "../contracts/authority-seams.js";

// ---------------------------------------------------------------------------
// The REAL distribution adapter (the platform-said surfaces)
// ---------------------------------------------------------------------------

/** Options of {@link createRealDistributionObservationSource}. */
export interface RealDistributionObservationSourceOptions {
  /** The REAL `@mos/distribution` adapter (the SOCIAL-001 port instance). */
  readonly adapter: SocialAdapterPort;
}

/**
 * The REAL distribution observation source: `getPublication` finds the
 * platform-confirmed publication by exact id over the tenant-scoped
 * append-only publication log (documented: the log is the authority, the
 * adapter only finds); `listObservations` reads the platform-said
 * observation log. Every read is recorded for the invocation-counting
 * assertions (gate-ordering tests).
 */
export function createRealDistributionObservationSource(
  options: RealDistributionObservationSourceOptions,
): DistributionObservationSource & {
  /** Test inspection: every publication read, in order. */
  readonly publicationReads: readonly { readonly tenantId: string; readonly publicationId: string }[];
  /** Test inspection: every observation read, in order. */
  readonly observationReads: readonly { readonly tenantId: string; readonly subjectRef?: string }[];
} {
  const publicationReads: { tenantId: string; publicationId: string }[] = [];
  const observationReads: { tenantId: string; subjectRef?: string }[] = [];
  return {
    getPublication(tenantId: TenantId, publicationId: string) {
      publicationReads.push({ tenantId: String(tenantId), publicationId });
      const publications = options.adapter.listPublications(tenantId);
      const publication = publications.find(
        (candidate) => String(candidate.id) === String(publicationId),
      );
      return publication === undefined ? undefined : structuredClone(publication);
    },
    listObservations(tenantId: TenantId, filter?: { subjectRef?: string }) {
      observationReads.push({ tenantId: String(tenantId), subjectRef: filter?.subjectRef });
      const observations = options.adapter.listObservations(tenantId, filter);
      return observations.map((observation) => structuredClone(observation));
    },
    publicationReads,
    observationReads,
  };
}
