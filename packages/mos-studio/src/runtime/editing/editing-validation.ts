/**
 * Edit-choice / composition-operation validation (STUDIO-008) — the W3-C
 * org-decision pin EXTENDED to the editing surface.
 *
 * Fail-closed discipline (enumerated typed failures, never silent):
 * - a choice referencing an edit decision point the format plugin did NOT
 *   declare is rejected (`choice-point-not-declared`) — the studio never
 *   accepts org decisions for points it never exposed (§16: the org
 *   decides at DECLARED points only);
 * - a composition operation whose kind is outside the closed vocabulary is
 *   rejected (`unknown-edit-kind`);
 * - malformed choices/operations (blank ids, empty inputs, non-object
 *   parameters, duplicate ids) are rejected with enumerated reasons;
 * - an operation input that does not resolve in the edited source is
 *   rejected (`operation-input-not-in-source`);
 * - a source from another tenant is rejected (`cross-tenant-source`, §31).
 */

import type { StudioArtifactRef } from "../../contracts/studio-artifact-package.js";
import type {
  EditingCompositionFailure,
  EditingSessionInput,
  EditingSourceInput,
  OrganizationEditChoice,
} from "../../contracts/editing-composition.js";
import { EDIT_COMPOSITION_KINDS } from "../../contracts/editing-composition.js";
import type { StudioFormatPlugin } from "../../contracts/studio-format.js";
import type { TenantId } from "../../contracts/refs.js";
import type { ParticipantConsentPort } from "../../ports/participant-consent.js";
import type { TenantScope } from "@mos/contracts";

/** Structural issues of one org edit choice (enumerated reasons). */
function editChoiceIssues(choice: OrganizationEditChoice): string[] {
  const reasons: string[] = [];
  if (typeof choice?.choiceId !== "string" || choice.choiceId.trim().length === 0) {
    reasons.push("choiceId must be a non-blank string");
  }
  if (typeof choice?.decisionPointId !== "string" || choice.decisionPointId.trim().length === 0) {
    reasons.push("decisionPointId must be a non-blank string");
  }
  if (typeof choice?.selectedOption !== "string" || choice.selectedOption.trim().length === 0) {
    reasons.push("selectedOption must be a non-blank string");
  }
  if (!Array.isArray(choice?.operations)) {
    reasons.push("operations must be an array");
  }
  if (choice?.decidedAt === undefined) {
    reasons.push("decidedAt must be present");
  }
  return reasons;
}

/** Structural issues of one composition operation (enumerated reasons). */
function compositionOperationIssues(operation: {
  readonly operationId?: unknown;
  readonly kind?: unknown;
  readonly inputArtifactRefs?: unknown;
  readonly parameters?: unknown;
}): string[] {
  const reasons: string[] = [];
  if (typeof operation?.operationId !== "string" || operation.operationId.trim().length === 0) {
    reasons.push("operationId must be a non-blank string");
  }
  if (!Array.isArray(operation?.inputArtifactRefs) || operation.inputArtifactRefs.length === 0) {
    reasons.push("inputArtifactRefs must be a non-empty array");
  }
  if (
    operation?.parameters === null ||
    typeof operation?.parameters !== "object" ||
    Array.isArray(operation?.parameters)
  ) {
    reasons.push("parameters must be a JSON object");
  }
  return reasons;
}

/** The editable artifact universe of the source: every artifact version an operation may cite as input. */
export function editableSourceArtifacts(source: EditingSourceInput): readonly StudioArtifactRef[] {
  if (source.kind === "package") {
    return [
      ...source.artifactPackage.rawArtifacts,
      ...source.artifactPackage.intermediateArtifacts,
      ...source.artifactPackage.finalArtifacts,
    ];
  }
  return [...source.intermediates];
}

/** The session ref the edited source belongs to (consent-subject anchor, §15). */
export function editingSourceSessionRef(source: EditingSourceInput): string {
  return source.kind === "package" ? String(source.artifactPackage.sessionRef) : String(source.sessionRef);
}

/** The raw artifacts of the source (consent-gate scope, §15/§27). */
export function editingSourceRawArtifacts(source: EditingSourceInput): readonly StudioArtifactRef[] {
  return source.kind === "package" ? [...source.artifactPackage.rawArtifacts] : [];
}

/**
 * Validates the org's edit choices against the format's declared decision
 * points (the W3-C pin extended) and the closed edit-kind vocabulary.
 * Returns the typed failure or `null` when every choice is valid.
 */
export function validateEditChoices(
  formatPlugin: StudioFormatPlugin,
  choices: readonly OrganizationEditChoice[],
): EditingCompositionFailure | null {
  const declaredPointIds = (formatPlugin.organizationDecisionPoints ?? []).map((point) => point.pointId);
  const seenChoiceIds = new Set<string>();
  const seenPointIds = new Set<string>();
  const seenOperationIds = new Set<string>();
  for (const choice of choices) {
    const choiceIssues = editChoiceIssues(choice);
    if (choiceIssues.length > 0) {
      return {
        kind: "edit-choice-malformed",
        choiceId: String(choice?.choiceId),
        reasons: choiceIssues,
      };
    }
    if (seenChoiceIds.has(choice.choiceId)) {
      return {
        kind: "edit-choice-malformed",
        choiceId: choice.choiceId,
        reasons: ["choiceId is recorded more than once"],
      };
    }
    seenChoiceIds.add(choice.choiceId);
    if (!declaredPointIds.includes(choice.decisionPointId)) {
      return {
        kind: "choice-point-not-declared",
        decisionPointId: choice.decisionPointId,
        declaredPointIds,
      };
    }
    if (seenPointIds.has(choice.decisionPointId)) {
      return {
        kind: "edit-choice-malformed",
        choiceId: choice.choiceId,
        reasons: [
          `decisionPointId ${choice.decisionPointId} is decided more than once — one org choice per declared point per editing session (§16)`,
        ],
      };
    }
    seenPointIds.add(choice.decisionPointId);
    for (const operation of choice.operations) {
      const operationIssues = compositionOperationIssues(operation);
      if (operationIssues.length > 0) {
        return {
          kind: "edit-choice-malformed",
          choiceId: choice.choiceId,
          reasons: [`operation ${String(operation?.operationId)}: ${operationIssues.join("; ")}`],
        };
      }
      if (seenOperationIds.has(operation.operationId)) {
        return {
          kind: "edit-choice-malformed",
          choiceId: choice.choiceId,
          reasons: [`operationId ${operation.operationId} is declared more than once`],
        };
      }
      seenOperationIds.add(operation.operationId);
      if (!EDIT_COMPOSITION_KINDS.includes(operation.kind)) {
        return {
          kind: "unknown-edit-kind",
          operationId: operation.operationId,
          editKind: String(operation.kind),
          knownKinds: EDIT_COMPOSITION_KINDS,
        };
      }
    }
  }
  return null;
}

/**
 * Validates that every operation input resolves in the edited source and
 * carries the caller's tenant scope. Returns the typed failure or `null`.
 */
export function validateOperationInputs(
  source: EditingSourceInput,
  choices: readonly OrganizationEditChoice[],
  scopeTenantId: TenantId,
): EditingCompositionFailure | null {
  const universe = editableSourceArtifacts(source);
  const known = new Set(universe.map((artifact) => `${artifact.artifactId}@${artifact.version}`));
  for (const artifact of universe) {
    if (String(artifact.tenantId) !== String(scopeTenantId)) {
      return {
        kind: "cross-tenant-source",
        sourceTenantId: String(artifact.tenantId),
        scopeTenantId: String(scopeTenantId),
      };
    }
  }
  for (const choice of choices) {
    for (const operation of choice.operations) {
      for (const input of operation.inputArtifactRefs) {
        if (!known.has(`${input.artifactId}@${input.version}`)) {
          return {
            kind: "operation-input-not-in-source",
            operationId: operation.operationId,
            artifactId: String(input.artifactId),
          };
        }
        if (String(input.tenantId) !== String(scopeTenantId)) {
          return {
            kind: "cross-tenant-source",
            sourceTenantId: String(input.tenantId),
            scopeTenantId: String(scopeTenantId),
          };
        }
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// The full editing-session validation gate (Phase 1 of the session flow)
// ---------------------------------------------------------------------------

/**
 * The complete Phase-1 gate of one editing session: seed shape, the §11
 * engine-resource grant shape, the org choices against the format's declared
 * decision points, the closed edit-kind vocabulary, operation inputs
 * resolving in the edited source, tenant scoping, and the §15 multi-account
 * consent gate (every contributor must hold processing consent before any
 * composition runs). Returns the typed failure or `null` when the session
 * may compose — NO session record exists for these failures (no production
 * action ran).
 */
export async function validateEditingSessionGate(
  scope: TenantScope,
  input: EditingSessionInput,
  participantConsentPort: ParticipantConsentPort,
): Promise<EditingCompositionFailure | null> {
  if (typeof input.seed !== "number" || !Number.isFinite(input.seed)) {
    return { kind: "invalid-seed", seed: input.seed };
  }
  const limits = input.engineResourceLimits;
  if (
    limits === null ||
    typeof limits !== "object" ||
    !Number.isFinite(limits.cpuCores) ||
    limits.cpuCores <= 0 ||
    !Number.isFinite(limits.gpuUnits) ||
    limits.gpuUnits < 0 ||
    !Number.isFinite(limits.memoryMb) ||
    limits.memoryMb <= 0 ||
    !Number.isFinite(limits.timeoutMs) ||
    limits.timeoutMs <= 0
  ) {
    return {
      kind: "invalid-engine-resource-limits",
      reason:
        "cpuCores > 0, gpuUnits ≥ 0, memoryMb > 0, timeoutMs > 0 are required (§11 explicit quotas)",
    };
  }
  const choiceFailure = validateEditChoices(input.formatPlugin, input.choices);
  if (choiceFailure !== null) {
    return choiceFailure;
  }
  const inputFailure = validateOperationInputs(input.source, input.choices, scope.tenantId);
  if (inputFailure !== null) {
    return inputFailure;
  }
  const rawArtifacts = editingSourceRawArtifacts(input.source);
  const contributors = input.contributors ?? [];
  if (rawArtifacts.length > 0 && contributors.length === 0) {
    return { kind: "consent-contributors-required", rawArtifactCount: rawArtifacts.length };
  }
  const sourceSessionRef =
    input.source.kind === "package" ? input.source.artifactPackage.sessionRef : input.source.sessionRef;
  for (const contributor of contributors) {
    const resolution = await participantConsentPort.resolveParticipantConsent({
      tenantId: scope.tenantId,
      sessionId: sourceSessionRef,
      participantIdentityRef: contributor.participantIdentityRef,
      consentRefs: contributor.consentRefs,
    });
    if (!resolution.coversProcessingIntoArtifacts) {
      return {
        kind: "consent-not-covering-processing",
        participantIdentityRef: String(contributor.participantIdentityRef),
      };
    }
  }
  return null;
}
