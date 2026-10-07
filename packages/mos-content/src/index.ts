/**
 * Public surface of `@mos/content` (MOS v2.0 CORE-004).
 *
 * Exports the artifact contracts, the repository/graph/storage ports, and the
 * two runtime factories (in-memory repository adapter, in-memory storage test
 * double). No helper constructors, error classes, or internals are exposed.
 *
 * Cross-package usage note: this package imports `@mos/identity` and
 * `@mos/rights` TYPE-ONLY (branded ids, refs, the `RightsRepository` shape
 * used by the injected rights gate). Runtime implementations are injected —
 * the composition root wires a real rights repository at TL integration time
 * (see the package README, "Disclosed limitations").
 */

export type {
  Artifact,
  ArtifactId,
  ArtifactRef,
  ArtifactType,
  ContentDigest,
  CreationMethod,
  ProvenanceRef,
  RightsRef,
  StorageRef,
  TenantId,
  Version,
} from './contracts/artifact.js';

export type {
  ArtifactDraft,
  ArtifactGraph,
  ArtifactRepository,
  ContentRepositoryError,
  ContentRepositoryErrorCode,
  RegisterArtifactInput,
  RegisterArtifactVersionInput,
  RightsSource,
} from './ports/artifact-repository.js';
export type { TenantScope } from '@mos/contracts';

export type {
  ArtifactStorage,
  ArtifactStorageError,
  ArtifactStorageErrorCode,
  PutArtifactContentRequest,
  StoredArtifactContent,
} from './ports/artifact-storage.js';

export type { InMemoryArtifactRepositoryOptions } from './adapters/in-memory-artifact-repository.js';
export type { InMemoryArtifactStorageOptions } from './adapters/in-memory-artifact-storage.js';

export { createInMemoryArtifactRepository } from './adapters/in-memory-artifact-repository.js';
export { createInMemoryArtifactStorage } from './adapters/in-memory-artifact-storage.js';
