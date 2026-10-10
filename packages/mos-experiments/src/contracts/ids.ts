/**
 * BRIDGE-003 experiments-owned record identifiers.
 *
 * Branded-string discipline (the @mos/contracts value-types precedent): the
 * canonical cross-authority refs (`LabCandidateRef`, `MissionRef`,
 * `PolicyRef`, `RightsRef`, `DistributionRef`, `ExperimentRef`,
 * `EvidenceRef`) are imported from `@mos/contracts` — they are shared
 * vocabulary, never re-branded here. The identifiers below are the
 * experiments authority's OWN record identities.
 *
 * CHAIN IDENTITY DESIGN (documented): one experiment owns exactly ONE
 * binding, ONE evidence chain and ONE outcome chain — minted together by
 * the binding act (a binding that did not fully resolve mints nothing).
 * The three chains therefore share the experiment id as their chain
 * identity; each record family keeps its own branded id view so a record
 * id can never occupy another family's slot by accident.
 */

declare const experimentIdBrand: unique symbol;
declare const experimentAuditIdBrand: unique symbol;
declare const experimentObservationIdBrand: unique symbol;

/**
 * Unique identifier of one real experiment (and, by the 1:1 construction,
 * of its binding, its evidence chain and its outcome chain). Record
 * versions append per (tenant, experiment id).
 */
export type ExperimentId = string & {
  readonly [experimentIdBrand]: true;
};

/**
 * Unique identifier of one binding-attempt audit record (the §30 record an
 * attributable gate denial appends). Audit records are single-version
 * immutable records, not chains.
 */
export type ExperimentAuditId = string & {
  readonly [experimentAuditIdBrand]: true;
};

/**
 * Unique identifier of one outcome observation — the citation the LAB-018
 * calibration authority's reality reader resolves. Deterministically
 * derived from the experiment id (`exp-obs:<experimentId>`), versioned with
 * the outcome record it projects.
 */
export type ExperimentObservationId = string & {
  readonly [experimentObservationIdBrand]: true;
};

/** Deterministic outcome-observation id of one experiment (documented derivation). */
export const experimentObservationIdOf = (experimentId: ExperimentId): ExperimentObservationId =>
  `exp-obs:${experimentId as string}` as ExperimentObservationId;

/** Deterministic client job key of one experiment's durable measurement job. */
export const experimentJobKeyOf = (experimentId: ExperimentId): string =>
  `experiment:${experimentId as string}`;
