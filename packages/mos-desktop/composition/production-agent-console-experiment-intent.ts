import type { ConsoleIntentsPort } from '@mos/web';
import type { TenantScope } from '@mos/contracts';
import type { MissionRepository } from '@mos/missions';
import type { MarketingBenchmarkPort } from '@mos/lab';
import type { RightsRepository } from '../../mos-rights/dist/index.js';
import type {
  DistributionObservationSource,
  ExperimentPolicyGatePort,
  ExperimentRightsGatePort,
  LabCandidateReaderPort,
  RealExperimentAuthorityPort,
  RealExperimentBindingFailure,
  RealExperimentBindingRequest,
  RealExperimentBindingOutcome,
} from '../../mos-experiments/dist/index.js';
import { createInMemoryRealExperimentAuthority } from '../../mos-experiments/dist/index.js';
import type { SocialPublicationRecord } from '../../mos-distribution/dist/index.js';
import type { JobQueuePort } from '../../mos-jobs/dist/index.js';
import { createDurableJobQueue, createInMemoryDurableJobStore } from '../../mos-jobs/dist/index.js';
import {
  createInMemoryPolicyEvaluation,
  createInMemoryPolicyRegistry,
} from '../../mos-policy/dist/index.js';
import {
  consoleFailureOf,
  consoleReceiptOf,
  type ConsoleBindingState,
  type RuntimeVerdict,
} from './production-agent-console-core.js';
import {
  CONSOLE_OPERATOR_PRINCIPAL,
  registerDeclaredPublication,
  type ConsoleExperimentsRuntime,
} from './production-agent-console-experiments.js';
import {
  finiteNumber,
  isPlainObject,
  missingInputFailure,
  nonBlankString,
  objectArray,
  parseDeclaredJson,
  stringArray,
} from './production-agent-console-parse.js';

/**
 * The create-experiment declare method (split from
 * production-agent-console-experiments.ts to respect the 400-line managed
 * file budget): the REAL BRIDGE-003 binding chain — the declared hypothesis
 * frame (lab candidate citation, policy citations, rights frame, production
 * search result + selected candidate, distribution citation, measurement
 * window) becomes a RealExperimentBindingRequest and the authority's own
 * gate-ordered §24 chain decides; every failure kind + reason is relayed
 * VERBATIM.
 */

/** Build the create-experiment declare method over the REAL authority. */
export function createExperimentIntentMethods(
  state: ConsoleBindingState,
): Pick<ConsoleIntentsPort, 'declareCreateExperiment'> {
  return {
    async declareCreateExperiment(declaration) {
      const identity = state.ledger.nextIdentity('create-experiment');

      const missionRefs = declaration.missionRefsText
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
      if (missionRefs.length === 0) {
        return state.ledger.record(
          identity,
          missingInputFailure(
            identity,
            'missionRefsText',
            'the real-experiment binding requires a mission linkage — the declaration carries no mission ref (the §24 Mission segment is a required binding-request field this composition cannot derive)',
          ),
        );
      }
      const frame = parseDeclaredJson(identity, declaration.hypothesisJson, 'hypothesisJson', 'object');
      if (!frame.ok) {
        return state.ledger.record(identity, frame.failure);
      }
      const frameObject = frame.value as Record<string, unknown>;
      const labCandidateFrame = isPlainObject(frameObject.labCandidate)
        ? frameObject.labCandidate
        : undefined;
      const policyFrame = objectArray(frameObject, 'policy');
      const rightsFrameFrame = isPlainObject(frameObject.rightsFrame)
        ? frameObject.rightsFrame
        : undefined;
      const productionFrame = isPlainObject(frameObject.production)
        ? frameObject.production
        : undefined;
      const distributionFrame = isPlainObject(frameObject.distribution)
        ? frameObject.distribution
        : undefined;
      const measurementFrame = isPlainObject(frameObject.measurement)
        ? frameObject.measurement
        : undefined;
      if (
        labCandidateFrame === undefined ||
        policyFrame === undefined ||
        policyFrame.length === 0 ||
        rightsFrameFrame === undefined ||
        productionFrame === undefined ||
        distributionFrame === undefined ||
        measurementFrame === undefined
      ) {
        return state.ledger.record(
          identity,
          missingInputFailure(
            identity,
            'hypothesisJson',
            'the declared binding citation frame is incomplete — labCandidate, policy (non-empty), rightsFrame, production, distribution and measurement are all required segments of the real-experiment binding request',
          ),
        );
      }
      const rightsRefs = stringArray(rightsFrameFrame, 'rightsRefs') ?? [];
      const searchResult = isPlainObject(productionFrame.searchResult)
        ? productionFrame.searchResult
        : undefined;
      if (rightsRefs.length === 0 || searchResult === undefined) {
        return state.ledger.record(
          identity,
          missingInputFailure(
            identity,
            'hypothesisJson',
            'the declared rights frame carries no rights refs, or the production citation carries no search result — both are required binding-request segments (§27: no frameless experiment)',
          ),
        );
      }
      const ranked = Array.isArray(searchResult.ranked)
        ? (searchResult.ranked as readonly unknown[])
        : [];
      const selectedRank = finiteNumber(productionFrame, 'selectedRank') ?? 0;
      // The parsed result's OWN ranked entry (an identity member — the
      // authority's lookalike-rejection stays honest).
      const selected = ranked[selectedRank - 1];

      const expectedArtifact = isPlainObject(distributionFrame.expectedArtifact)
        ? distributionFrame.expectedArtifact
        : undefined;
      const publicationId = nonBlankString(distributionFrame, 'publicationId');
      if (expectedArtifact === undefined || publicationId === undefined) {
        return state.ledger.record(
          identity,
          missingInputFailure(
            identity,
            'hypothesisJson',
            'the declared distribution citation must carry a publicationId and an expectedArtifact {artifactId, version} — the REAL publication record is the authority for what was distributed',
          ),
        );
      }

      // The mission linkage: the LATEST record version through the REAL
      // repository (the same latest-at-the-seam resolution compose-plan uses;
      // an unresolvable mission cites version 0 and the authority's own
      // mission-unresolved verdict names it).
      const missionRecord = state.missionRepository.getMission(missionRefs[0] as never);
      const missionVersion = missionRecord === null ? 0 : missionRecord.version;

      // Register the DECLARED publication (disclosed seam state) BEFORE the
      // binding resolves it.
      registerDeclaredPublication({
        scope: state.scope,
        now: state.now,
        log: state.experimentsRuntime.declaredPublications,
        citation: {
          publicationId,
          expectedArtifact: {
            artifactId: String(expectedArtifact.artifactId ?? ''),
            version: Number(expectedArtifact.version ?? 0),
          },
          channelRef:
            nonBlankString(distributionFrame, 'channelRef') ?? 'channel:console-declared',
          providerId:
            nonBlankString(distributionFrame, 'providerId') ?? 'provider:console-declared',
          postRef: nonBlankString(distributionFrame, 'postRef') ?? 'post:console-declared',
          publishedAt: nonBlankString(distributionFrame, 'publishedAt') ?? state.now(),
          rightsRef: rightsRefs[0] ?? '',
        },
      });

      const request: RealExperimentBindingRequest = {
        scope: state.scope,
        actor: CONSOLE_OPERATOR_PRINCIPAL,
        labCandidate: {
          benchmarkId: String(labCandidateFrame.benchmarkId ?? ''),
          benchmarkVersion: Number(labCandidateFrame.benchmarkVersion ?? 0),
          candidateKey: String(labCandidateFrame.candidateKey ?? ''),
        },
        mission: { missionRef: missionRefs[0] as never, missionVersion },
        policy: policyFrame.map((entry) => ({
          id: String(entry.id ?? '') as never,
          version: Number(entry.version ?? 0) as never,
        })),
        rightsFrame: {
          rightsRefs: rightsRefs.map((ref) => ref as never),
          consentRefs: (stringArray(rightsFrameFrame, 'consentRefs') ?? []).map(
            (ref) => ref as never,
          ),
        },
        production: { searchResult, selected } as never,
        distribution: {
          publicationId,
          expectedArtifact: {
            artifactId: String(expectedArtifact.artifactId ?? ''),
            version: Number(expectedArtifact.version ?? 0),
          },
        },
        measurement: {
          windowStart: (nonBlankString(measurementFrame, 'windowStart') ?? state.now()) as never,
          windowEnd: (nonBlankString(measurementFrame, 'windowEnd') ?? state.now()) as never,
          niche: nonBlankString(measurementFrame, 'niche') ?? 'device-local',
          regime: nonBlankString(measurementFrame, 'regime') ?? 'baseline',
        },
      };

      const outcome = await state.experimentsRuntime.createBindingWithDeclaredId(
        declaration.experimentId,
        request,
      );

      if (!outcome.ok) {
        const failure: RealExperimentBindingFailure = outcome.error;
        const verdict: RuntimeVerdict = {
          error: failure.kind,
          message: failure.reason,
        };
        return state.ledger.record(identity, consoleFailureOf(identity, verdict));
      }
      const experiment = outcome.value.experiment;
      state.experimentAnnotations.set(String(experiment.id), {
        question: declaration.questionText,
        successCriterion: declaration.successCriterionText,
      });
      return state.ledger.record(
        identity,
        consoleReceiptOf(identity, {
          recordId: String(experiment.id),
          recordVersion: experiment.version,
          lifecycleState: experiment.status,
          summary:
            `experiment ${String(experiment.id)} bound (v${experiment.version}, ${experiment.status}) — mission ${missionRefs[0]}@v${missionVersion}, the durable measurement job ${outcome.value.jobId} enqueued; the question it decides: ${declaration.questionText} (success criterion: ${declaration.successCriterionText})`,
        }),
      );
    },
  };
}
