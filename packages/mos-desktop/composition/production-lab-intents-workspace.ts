import type {
  ArtifactRef,
  ProvenanceRef,
  RightsRef,
  TenantScope,
  Timestamp,
  Version,
} from '@mos/contracts';
import type {
  IngestReferenceDocumentDeclaration,
  LabIntentsPort,
  RegisterWorldModelDeclaration,
  SimulateStepDeclaration,
  SnapshotCorpusVersionDeclaration,
} from '@mos/web';
import type {
  LabScenario,
} from '@mos/contracts';
import type {
  ReferenceDocumentId,
  ReferenceModality,
  SocialWorldModelId,
  SocialWorldModelState,
  StrategyActionCandidate,
} from '@mos/lab';
import type { ProductionLabWorkspaceRuntime } from './production-lab-workspace.js';
import {
  missingInputFailure,
  parseDeclaredJson,
  splitCommaList,
} from './production-lab-intents-parse.js';
import { failureOf, receiptOf, type IntentLedger } from './production-lab-intents-core.js';

/**
 * The WORKSPACE half of the PRODUCTION lab-intents binding — the four
 * declare methods routed to the REAL LAB-001..005 workspace runtimes
 * (LAB-001 rights-gated ingestion + snapshots, LAB-004 world-model
 * registration, LAB-005 seeded simulator steps). Assembled into the port
 * by production-lab-intents.ts.
 *
 * HONEST COMPOSITION (the underivable-field disclosure):
 *  - `ingest`'s `ArtifactRef` — the declaration carries the artifact ID,
 *    the acquisition rights/provenance refs and the scope's tenant only.
 *    The artifact reference is composed as the DECLARED reference:
 *    version pinned to 1, a `declared-unverified:` digest and a
 *    `declared:` storage ref (VISIBLY not authority-verified values), and
 *    the 'reference-document' coarse type. With no rights grant
 *    registered the corpus authority DENIES before anything persists, so
 *    these values reach a stored record only behind a real grant — and
 *    they can never be mistaken for content-authority digests/addresses.
 *  - `snapshot`'s `corpusId` (the append-only version namespace) is
 *    structurally ABSENT from the declaration and not derivable — the
 *    verdict is the named `lab-intent-missing-input` failure, honestly
 *    ledgered with the declared attempt, never a fabricated namespace.
 */

/** Shared dependencies of the workspace declare-method group. */
export interface WorkspaceIntentDeps {
  readonly scope: TenantScope;
  readonly ledger: IntentLedger;
  readonly labWorkspaceRuntime: ProductionLabWorkspaceRuntime;
}

/**
 * The DECLARED artifact reference (the ingest disclosure — see the file
 * docblock): composed from the declared artifact id + the scope's tenant +
 * the declaration's own rights/provenance refs, with version pinned to 1
 * and VISIBLY declared (never authority-verified) digest/storage values.
 */
const declaredArtifactRef = (
  declaration: IngestReferenceDocumentDeclaration,
  scope: TenantScope,
): ArtifactRef => ({
  artifactId: declaration.artifactId as ArtifactRef['artifactId'],
  version: 1 as Version,
  tenantId: scope.tenantId,
  digest: `declared-unverified:${declaration.artifactId}` as ArtifactRef['digest'],
  type: 'reference-document',
  storageRef: `declared:${scope.tenantId}/${declaration.artifactId}` as ArtifactRef['storageRef'],
  rightsRef: declaration.rightsRef as RightsRef,
  provenanceRef: declaration.provenanceRef as ProvenanceRef,
});

/** Build the four workspace declare methods over the REAL runtimes. */
export function createWorkspaceLabIntentMethods(deps: WorkspaceIntentDeps): Pick<
  LabIntentsPort,
  | 'declareIngestReferenceDocument'
  | 'declareSnapshotCorpusVersion'
  | 'declareRegisterWorldModel'
  | 'declareSimulateStep'
> {
  const scope = deps.scope;
  const ledger = deps.ledger;
  const runtimes = deps.labWorkspaceRuntime;

  return {
    async declareIngestReferenceDocument(
      declaration: IngestReferenceDocumentDeclaration,
    ): ReturnType<LabIntentsPort['declareIngestReferenceDocument']> {
      const identity = ledger.nextIdentity('ingest-reference-document');
      const result = await runtimes.corpus.ingestReferenceDocument({
        scope,
        document: {
          id: declaration.documentId as ReferenceDocumentId,
          niche: declaration.niche,
          platform: declaration.platform,
          modality: declaration.modality as ReferenceModality,
          artifact: declaredArtifactRef(declaration, scope),
          sourceRefs: splitCommaList(declaration.sourceRefsText),
          acquiredAt: declaration.acquiredAt as Timestamp,
          rightsRef: declaration.rightsRef as RightsRef,
          provenanceRef: declaration.provenanceRef as ProvenanceRef,
        },
      });
      if ('error' in result) {
        return ledger.record(identity, failureOf(identity, result));
      }
      return ledger.record(
        identity,
        receiptOf(
          identity,
          result.id,
          result.version,
          `reference document ${result.id} ingested at version ${result.version} for ${result.niche}/${result.platform} — the artifact reference is the declared one (digest/storage declared-unverified), rights-cleared by ${declaration.rightsRef}`,
        ),
      );
    },

    async declareSnapshotCorpusVersion(
      declaration: SnapshotCorpusVersionDeclaration,
    ): ReturnType<LabIntentsPort['declareSnapshotCorpusVersion']> {
      void declaration;
      const identity = ledger.nextIdentity('snapshot-corpus-version');
      // The corpus contract's SnapshotCorpusVersionInput REQUIRES corpusId
      // (the append-only version namespace); the declaration carries only
      // the membership set, and a corpus namespace is not derivable from
      // scope/tenant fields or sequential ids — the honest verdict is the
      // named missing-input failure, ledgered with the declared attempt.
      return ledger.record(
        identity,
        missingInputFailure(
          identity,
          'corpusId',
          'the corpus snapshot declaration carries no corpus id (corpusId) — the append-only version namespace the snapshot belongs to is a required corpus-authority field this composition cannot derive from the declared membership set',
        ),
      );
    },

    async declareRegisterWorldModel(
      declaration: RegisterWorldModelDeclaration,
    ): ReturnType<LabIntentsPort['declareRegisterWorldModel']> {
      const identity = ledger.nextIdentity('register-world-model');
      const state = parseDeclaredJson(identity, declaration.stateJson, 'stateJson', 'object');
      if (!state.ok) {
        return ledger.record(identity, state.failure);
      }
      const result = await runtimes.worldModels.registerWorldModel({
        scope,
        worldModel: {
          id: declaration.worldModelId as SocialWorldModelId,
          niche: declaration.niche,
          platform: declaration.platform,
          state: state.value as SocialWorldModelState,
          notes: declaration.notesText.trim() === '' ? null : declaration.notesText,
        },
      });
      if ('error' in result) {
        return ledger.record(identity, failureOf(identity, result));
      }
      return ledger.record(
        identity,
        receiptOf(
          identity,
          result.id,
          result.worldModelVersion,
          `world model ${result.id} registered at version ${result.worldModelVersion} for ${result.niche}/${result.platform} — a synthetic-parametric model, counterfactual, never observed reality`,
        ),
      );
    },

    async declareSimulateStep(
      declaration: SimulateStepDeclaration,
    ): ReturnType<LabIntentsPort['declareSimulateStep']> {
      const identity = ledger.nextIdentity('simulate-step');
      const scenario = parseDeclaredJson(identity, declaration.scenarioJson, 'scenarioJson', 'object');
      if (!scenario.ok) {
        return ledger.record(identity, scenario.failure);
      }
      const candidate = parseDeclaredJson(identity, declaration.candidateJson, 'candidateJson', 'object');
      if (!candidate.ok) {
        return ledger.record(identity, candidate.failure);
      }
      const result = await runtimes.simulator.simulateStep({
        scope,
        worldModelId: declaration.worldModelId as SocialWorldModelId,
        worldModelVersion: declaration.worldModelVersion,
        scenario: scenario.value as LabScenario,
        candidate: candidate.value as StrategyActionCandidate,
        seed: declaration.seed,
        step: declaration.step,
      });
      if ('error' in result) {
        return ledger.record(identity, failureOf(identity, result));
      }
      return ledger.record(
        identity,
        receiptOf(
          identity,
          result.id,
          result.version,
          `counterfactual step ${result.step} simulated with seed ${result.seed} against world model ${declaration.worldModelId} v${declaration.worldModelVersion} — a synthetic prediction with its §22 uncertainty envelope, never measured evidence`,
        ),
      );
    },
  };
}
