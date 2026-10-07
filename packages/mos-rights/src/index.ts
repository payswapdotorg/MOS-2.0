/**
 * Public surface of `@mos/rights` (MOS v2.0 CORE-003).
 *
 * Exports the domain/port/evaluation types plus exactly two runtime exports:
 * the in-memory repository factory and the pure `evaluateRights` function.
 * No helper constructors, error classes, or internals are exposed.
 *
 * Cross-package usage note: sibling MOS packages are expected to import this
 * package TYPE-ONLY (`import type { ... } from '@mos/rights'`) and receive
 * runtime implementations through injection (hexagonal ports). Runtime
 * cross-import of workspace packages whose exports default to `./src/index.ts`
 * does not resolve under plain Node ESM (internal `.js` specifiers), so the
 * composition root wires adapters at TL integration time.
 */

export type { ConsentRecord, ConsentScope } from './domain/consent.js';
export type {
  ConsentRecordId,
  ConsentRef,
  IdentityId,
  ProvenanceRecordId,
  ProvenanceRef,
  RightsGrantId,
  RightsRef,
  TenantId,
} from './domain/ids.js';
export type {
  ProvenanceActor,
  ProvenanceCreationMethod,
  ProvenanceRecord,
} from './domain/provenance.js';
export type { RightsAction, RightsGrant, RightsScope, RightsTerms } from './domain/rights-grant.js';
export type {
  GrantRightsInput,
  RecordConsentInput,
  RecordProvenanceInput,
  RightsRepository,
  RightsRepositoryError,
  RightsRepositoryErrorCode,
} from './ports/rights-repository.js';
export type { TenantScope } from '@mos/identity';
export type {
  RightsDenialReason,
  RightsEvaluationRequest,
  RightsEvaluationResult,
} from './evaluation/rights-evaluation.js';
export type { InMemoryRightsRepositoryOptions } from './adapters/in-memory-rights-repository.js';

export { evaluateRights } from './evaluation/rights-evaluation.js';
export { createInMemoryRightsRepository } from './adapters/in-memory-rights-repository.js';
