/**
 * Public surface of `@mos/lab` (MOS v2.0 LAB-001 scaffold).
 *
 * TYPES ONLY — no runtime exports by design (scaffold). The full reference
 * corpus, feature bundles, idea graph and simulator land in later waves.
 */

export type {
  CorpusId,
  CorpusIngestPort,
  CorpusPortError,
  CorpusPortErrorCode,
  CorpusQueryPort,
  CorpusVersion,
  ReferenceDocument,
  ReferenceDocumentDraft,
  ReferenceDocumentId,
  ReferenceModality,
  RegisterReferenceDocumentInput,
  SnapshotCorpusVersionInput,
} from './contracts/corpus.js';
