import type {
  ProvenanceRef,
  RightsRef,
  StudioArtifactPackageId,
  StudioSessionId,
  TenantId,
  Timestamp,
} from '@mos/contracts';
import type {
  StudioArtifactPackage,
  StudioArtifactRef,
  StudioArtifactStage,
  StudioArtifactType,
  StudioOutputReview,
} from '@mos/studio';

/**
 * REAL-shape fixture builders for the Studio surface (UX-002) — compact,
 * type-pinned constructors for the STUDIO-014 record shapes the disclosed
 * composition double feeds. Split from the original single fixtures file to
 * respect the ≤400-line managed-file lint budget. Type-only `@mos/studio`
 * imports (erased at runtime; the studio package never enters the browser
 * bundle).
 */

export const sessionRef = (id: string): StudioSessionId => id as StudioSessionId;
export const packageRef = (id: string): StudioArtifactPackageId => id as StudioArtifactPackageId;
export const ts = (value: string): Timestamp => value as Timestamp;

/** Build a REAL-shaped studio artifact ref (compact fixture helper). */
export function artifact(input: {
  readonly artifactId: string;
  readonly version: number;
  readonly tenantId: TenantId;
  readonly type: StudioArtifactType;
  readonly stage: StudioArtifactStage;
  readonly creationMethod: StudioArtifactRef['creationMethod'];
  readonly storageRef: string;
  readonly parents?: readonly StudioArtifactRef[];
}): StudioArtifactRef {
  return Object.freeze({
    artifactId: input.artifactId as never,
    version: input.version as never,
    tenantId: input.tenantId,
    digest: `sha256:fixture:${input.artifactId}:v${input.version}` as never,
    type: input.type,
    storageRef: `mos-studio:fixture:${input.storageRef}` as never,
    rightsRef: `rights-${input.artifactId}` as RightsRef,
    provenanceRef: `provenance-${input.artifactId}` as ProvenanceRef,
    stage: input.stage,
    parentArtifactRefs: Object.freeze([...(input.parents ?? [])]),
    creationMethod: input.creationMethod,
  });
}

/** Build a REAL-shaped §30 review record (compact fixture helper). */
export function review(input: {
  readonly sessionId: string;
  readonly target: StudioArtifactRef;
  readonly outcome: StudioOutputReview['outcome'];
  readonly decidedBy: StudioOutputReview['decidedBy'];
  readonly decidedAt: string;
  readonly rejection?: StudioOutputReview['rejection'];
}): StudioOutputReview {
  return Object.freeze({
    sessionId: sessionRef(input.sessionId),
    targetArtifact: input.target,
    outcome: input.outcome,
    rejection: input.rejection,
    decidedBy: input.decidedBy,
    decidedAt: ts(input.decidedAt),
  });
}

export const OPERATOR_ACTOR: StudioOutputReview['decidedBy'] = Object.freeze({
  kind: 'studio-operator',
  identityRef: 'identity-operator-1',
});
export const STANDALONE_USER_ACTOR: StudioOutputReview['decidedBy'] = Object.freeze({
  kind: 'standalone-user',
  identityRef: 'identity-user-2',
});
export const LAB_ACTOR: StudioOutputReview['decidedBy'] = Object.freeze({
  kind: 'lab',
  labCandidateRef: 'lab-candidate-77',
});

/** One append-only lifecycle transition (compact fixture helper). */
export function T(
  from: string,
  to: string,
  at: string,
  reason?: string,
): {
  readonly from: never;
  readonly to: never;
  readonly at: string;
  readonly reason?: string;
} {
  return Object.freeze({
    from: from as never,
    to: to as never,
    at,
    ...(reason === undefined ? {} : { reason }),
  });
}

/** Build one REAL-shaped immutable package version (compact fixture helper). */
export function packageVersion(input: {
  readonly id: string;
  readonly version: number;
  readonly sessionRef: string;
  readonly createdAt: string;
  readonly tenantId: TenantId;
  readonly raw: readonly StudioArtifactRef[];
  readonly intermediate: readonly StudioArtifactRef[];
  readonly finals: readonly StudioArtifactRef[];
  readonly containsSyntheticMaterial: boolean;
  readonly consentRefs: readonly string[];
  readonly allRawArtifactsCovered: boolean;
  readonly evaluation: StudioArtifactPackage['evaluation'];
  readonly editGraphVersion: number;
  readonly otioInterchange: boolean;
  readonly cost: { readonly currency: string; readonly amount: string };
  readonly durations: {
    readonly capture: number;
    readonly processing: number;
    readonly total: number;
  };
}): StudioArtifactPackage {
  const transcriptArtifact = input.intermediate[0] as StudioArtifactRef;
  const transcript = Object.freeze({
    artifact: transcriptArtifact,
    language: 'en-US',
    diarized: true,
  });
  return Object.freeze({
    id: packageRef(input.id),
    version: input.version,
    sessionRef: sessionRef(input.sessionRef),
    rawArtifacts: Object.freeze([...input.raw]),
    intermediateArtifacts: Object.freeze([...input.intermediate]),
    finalArtifacts: Object.freeze([...input.finals]),
    transcriptRefs: Object.freeze([transcript]),
    conversationGraphRef: Object.freeze({
      graphId: `conv-${input.id}-v${input.version}` as never,
      version: 1,
      derivedFrom: Object.freeze([transcript]),
    }),
    editGraphRef: Object.freeze({
      graphId: `edit-${input.id}` as never,
      version: input.editGraphVersion,
      otioInterchange: input.otioInterchange,
    }),
    provenance: Object.freeze({
      provenanceRefs: Object.freeze([
        ...input.raw.map((a) => a.provenanceRef),
        ...input.intermediate.map((a) => a.provenanceRef),
        ...input.finals.map((a) => a.provenanceRef),
      ]),
      lineageComplete: true,
      containsSyntheticMaterial: input.containsSyntheticMaterial,
    }),
    consent: Object.freeze({
      participantConsentRefs: Object.freeze([...input.consentRefs] as never[]),
      allRawArtifactsCovered: input.allRawArtifactsCovered,
    }),
    evaluation: Object.freeze(input.evaluation),
    cost: Object.freeze({
      total: Object.freeze({ currency: input.cost.currency, amount: input.cost.amount }),
    }),
    duration: Object.freeze({
      captureSeconds: input.durations.capture,
      processingSeconds: input.durations.processing,
      totalWallClockSeconds: input.durations.total,
    }),
    createdAt: ts(input.createdAt),
  });
}
