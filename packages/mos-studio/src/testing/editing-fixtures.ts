/**
 * STUDIO-008 editing test fixtures (W8-C) — convenience builders for
 * editing-session inputs, org choices, contributors and source packages.
 *
 * Disclosed test data: the organization/transform citations name the
 * DISCLOSED composition-seam registrations of compose-editing-stack.ts (a
 * fictional-but-plausible editor organization and remix transform), never
 * any real provider or platform.
 */

import type { TransformId, Version } from "@mos/contracts";

import type { RightsRepository } from "@mos/rights";
import { bridge } from "./participant-authority-adapters.js";
import { studioSessionConsentSubject } from "../ports/participant-consent.js";

import type {
  EditingContributor,
  EditingSessionInput,
  OrganizationEditChoice,
} from "../contracts/editing-composition.js";
import type { StudioOrganizationRef } from "../contracts/organization-loading.js";
import type {
  ConsentRef,
  IdentityRef,
  ProvenanceRef,
  RightsRef,
  StudioSessionId,
  TenantId,
  Timestamp,
} from "../contracts/refs.js";
import type {
  StudioArtifactPackage,
  StudioArtifactRef,
} from "../contracts/studio-artifact-package.js";
import type { StudioFormatPlugin } from "../contracts/studio-format.js";
import type { StudioArtifactFactoryPort } from "../ports/artifact-factory.js";

/** The editing transform citation the stack registers (the editor pawn serves `remix`). */
export const EDITING_TRANSFORM_APPLICATION = {
  definitionId: "transform:studio-editing" as TransformId,
  definitionVersion: 1 as Version,
};

/** The editing organization registered as a transform pawn organization (an editor node). */
export const EDITING_ORGANIZATION_REF: StudioOrganizationRef = {
  id: "org:studio-editing" as StudioOrganizationRef["id"],
  version: 1,
};

/** The tenant the disclosed editing composition seam registers its fixtures under. */
export const EDITING_STACK_TENANT = "tenant-studio-editing" as TenantId;

/** The disclosed editing principal the seam provisions derived-work coverage for. */
export const EDITING_PRINCIPAL = "identity:studio-editor";

/** The engine resource grant the editing sessions carry (§11: explicit quotas). */
export const EDITING_ENGINE_RESOURCE_LIMITS = {
  cpuCores: 2,
  gpuUnits: 1,
  memoryMb: 512,
  timeoutMs: 120_000,
} as const;

/** Convenience: a standard editing session input skeleton over a package source. */
export function editingSessionInputOverPackage(
  partial: {
    readonly tenantId?: TenantId;
    readonly formatPlugin: StudioFormatPlugin;
    readonly artifactPackage: StudioArtifactPackage;
    readonly choices: readonly OrganizationEditChoice[];
    readonly contributors?: readonly EditingContributor[];
    readonly actorPrincipalId?: string;
    readonly seed?: number;
  },
): EditingSessionInput {
  return {
    formatPlugin: partial.formatPlugin,
    source: { kind: "package", artifactPackage: partial.artifactPackage },
    organization: EDITING_ORGANIZATION_REF,
    choices: partial.choices,
    actor: {
      kind: "identity",
      principalId: partial.actorPrincipalId ?? "identity:studio-editor",
    },
    seed: partial.seed ?? 42,
    transformApplication: EDITING_TRANSFORM_APPLICATION,
    engineResourceLimits: { ...EDITING_ENGINE_RESOURCE_LIMITS },
    contributors: partial.contributors,
  };
}

/** Convenience: one org choice at a declared point with its operations. */
export function editingChoice(
  choiceId: string,
  decisionPointId: string,
  selectedOption: string,
  operations: readonly OrganizationEditChoice["operations"][number][],
  at: Timestamp,
): OrganizationEditChoice {
  return { choiceId, decisionPointId, selectedOption, operations, decidedAt: at };
}

/** Convenience: contributor construction with branded refs. */
export function editingContributor(
  identity: string,
  consentRefs: readonly string[],
): EditingContributor {
  return {
    participantIdentityRef: identity as IdentityRef,
    consentRefs: consentRefs.map((ref) => ref as ConsentRef),
  };
}

/** Convenience: assembles a minimal source package record over given artifacts (test fixture). */
export function buildEditingSourcePackage(
  input: {
    readonly tenantId: TenantId;
    readonly sessionId: string;
    readonly packageId: string;
    readonly rawArtifacts: readonly StudioArtifactRef[];
    readonly intermediateArtifacts: readonly StudioArtifactRef[];
    readonly finalArtifacts: readonly StudioArtifactRef[];
    readonly consentRefs?: readonly ConsentRef[];
  },
  now: () => Timestamp,
): StudioArtifactPackage {
  const all = [...input.rawArtifacts, ...input.intermediateArtifacts, ...input.finalArtifacts];
  return Object.freeze({
    id: input.packageId as StudioArtifactPackage["id"],
    version: 1,
    sessionRef: input.sessionId as StudioSessionId,
    rawArtifacts: Object.freeze([...input.rawArtifacts]),
    intermediateArtifacts: Object.freeze([...input.intermediateArtifacts]),
    finalArtifacts: Object.freeze([...input.finalArtifacts]),
    transcriptRefs: Object.freeze([]),
    conversationGraphRef: Object.freeze({
      graphId: `mos-studio:conversation-graph:${input.sessionId}` as StudioArtifactPackage["conversationGraphRef"]["graphId"],
      version: 1,
      derivedFrom: Object.freeze([]),
    }),
    editGraphRef: Object.freeze({
      graphId: `mos-studio:edit-graph:${input.sessionId}` as StudioArtifactPackage["editGraphRef"]["graphId"],
      version: 1,
      otioInterchange: false,
    }),
    provenance: Object.freeze({
      provenanceRefs: Object.freeze([...new Set(all.map((artifact) => artifact.provenanceRef))]),
      lineageComplete: [...input.intermediateArtifacts, ...input.finalArtifacts].every(
        (artifact) => artifact.parentArtifactRefs.length > 0,
      ),
      containsSyntheticMaterial: all.some((artifact) => artifact.creationMethod === "engine-generated"),
    }),
    consent: Object.freeze({
      participantConsentRefs: Object.freeze([...(input.consentRefs ?? [])]),
      allRawArtifactsCovered: (input.consentRefs ?? []).length > 0,
    }),
    evaluation: Object.freeze({ status: "evaluated" as const, outcome: "accepted" as const }),
    cost: Object.freeze({ total: { currency: "USD", amount: "1.00" } }),
    duration: Object.freeze({ captureSeconds: 60, processingSeconds: 30, totalWallClockSeconds: 90 }),
    createdAt: now(),
  });
}

/** Convenience default rights ref for editing source fixtures. */
export const EDITING_SOURCE_RIGHTS_REF = "rights:studio-editing-source" as RightsRef;

// ---------------------------------------------------------------------------
// REAL session-consent seeding (the §15 gate input)
// ---------------------------------------------------------------------------


/**
 * Records one REAL session-scoped consent for an editing contributor
 * through the REAL `@mos/rights` repository and returns its canonical
 * `ConsentRef`. The subject is the studio session the edited source
 * belongs to (the same derivation the participant-consent port reads).
 */
export function recordEditingSessionConsent(
  repository: RightsRepository,
  input: {
    readonly tenantId: TenantId;
    readonly identityRef: string;
    readonly sessionId: string;
    /** Defaults to the full studio gate pair `["use", "transform"]`. */
    readonly actions?: readonly ("use" | "transform" | string)[];
  },
): ConsentRef {
  const ref = bridge<never>(`consent:studio-editing-${input.identityRef}-${input.sessionId}`);
  const recorded = repository.recordConsent({
    scope: bridge<never>({ tenantId: String(input.tenantId) }),
    id: ref,
    participantRef: bridge<never>(input.identityRef),
    purpose: `studio editing session ${input.sessionId}`,
    actions: (input.actions ?? ["use", "transform"]) as never,
    subjectRefs: [studioSessionConsentSubject(input.sessionId as StudioSessionId)],
  });
  if (recorded !== null && "error" in recorded) {
    throw new Error(`real rights repository rejected the seeded consent: ${JSON.stringify(recorded)}`);
  }
  return bridge<ConsentRef>(ref);
}

/**
 * Convenience: creates one disclosed editing source artifact through the
 * stack's shared factory (human-capture, root of the editing lineage) — the
 * `createSourceArtifact` handle of compose-editing-stack delegates here.
 */
export async function buildEditingSourceArtifact(
  artifactFactory: StudioArtifactFactoryPort,
  input: {
    readonly tenantId: TenantId;
    readonly type: StudioArtifactRef["type"];
    readonly stage: StudioArtifactRef["stage"];
    readonly content: string;
    readonly rightsRef?: string;
  },
): Promise<StudioArtifactRef> {
  const creation = await artifactFactory.createArtifact({
    tenantId: input.tenantId,
    type: input.type,
    stage: input.stage,
    creationMethod: "human-capture",
    storageRef: `storage:studio-editing/${input.content}` as StudioArtifactRef["storageRef"],
    content: new TextEncoder().encode(input.content),
    rightsRef: (input.rightsRef ?? EDITING_SOURCE_RIGHTS_REF) as RightsRef,
    provenanceRef: "provenance:studio-editing-source" as ProvenanceRef,
    parents: [],
  });
  if (!creation.ok) {
    throw new Error(`editing stack source artifact rejected: ${JSON.stringify(creation.error)}`);
  }
  return creation.artifact;
}
