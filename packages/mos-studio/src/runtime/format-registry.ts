/**
 * Pluggable format registry (STUDIO-002).
 *
 * Architecture: ONE Studio runtime, MANY formats (§13; policy
 * `formatsMustBePluggable: true`). A format is a declared descriptor + hooks
 * (a `StudioFormatPlugin` carrying every required aspect of the frozen
 * `StudioFormat` contract); the registry accepts any COMPLETE plugin at
 * runtime — including formats the Studio was never built around — and
 * rejects malformed plugins FAIL-CLOSED with enumerated reasons. Registration
 * never silently upgrades, replaces or re-registers an existing format
 * id+version.
 *
 * Formats bring NO engines, providers or workflow machinery: they are data +
 * validation hooks inside the single runtime (dependency matrix: studio is
 * forbidden workflow/experiment/publisher authority).
 */

import type { FormatCaptureRequirements } from "../contracts/capture.js";
import type { InterviewerRequirements } from "../contracts/interviewer.js";
import type {
  EvaluationHookDescriptor,
  FormatEvaluationHooks,
  FormatInputRequirements,
  FormatOutputContract,
  FormatParticipantModel,
  FormatProvenanceRequirements,
  OrganizationCompatibility,
  OrganizationDecisionPoint,
  StudioFormatId,
  StudioFormatPlugin,
} from "../contracts/studio-format.js";
import type { ContractVersion } from "../contracts/refs.js";

const INPUT_KINDS = new Set([
  "complete-script",
  "question-list",
  "intent",
  "intent-with-source-material",
]);
const PARTICIPANT_ROLES = new Set(["interviewer", "subject", "operator", "observer"]);
const REPRESENTATION_KINDS = new Set(["voice", "text", "avatar", "prerecorded", "generated", "hybrid"]);
const DEVICE_CLASSES = new Set(["microphone", "camera", "screen-capture"]);
const MEDIA_KINDS = new Set(["audio", "video"]);
const ARTIFACT_TYPES = new Set(["audio", "video", "image", "text", "timeline", "graph"]);
const HOOK_STAGES = new Set(["post-capture", "post-processing", "final-candidate", "pre-package"]);

/** Result of a registration attempt. */
export type FormatRegistrationResult =
  | { readonly ok: true; readonly plugin: StudioFormatPlugin }
  | { readonly ok: false; readonly reasons: readonly string[] };

/** Failure modes of format resolution. */
export type FormatResolutionError =
  | { readonly kind: "format-not-registered"; readonly formatId: StudioFormatId }
  | {
      readonly kind: "format-version-not-registered";
      readonly formatId: StudioFormatId;
      readonly version: ContractVersion;
      readonly availableVersions: readonly ContractVersion[];
    };

/** Result of resolving a format (by id, optionally pinned to a version). */
export type FormatResolutionResult =
  | { readonly ok: true; readonly plugin: StudioFormatPlugin }
  | { readonly ok: false; readonly error: FormatResolutionError };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const isStringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string" && entry.length > 0);
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";
const isPositiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1;

function validateArrayOf(value: unknown, universe: Set<string>, label: string, errors: string[]): void {
  if (!isStringArray(value)) {
    errors.push(`${label}: expected a non-empty array of non-empty strings`);
    return;
  }
  for (const entry of value) {
    if (!universe.has(entry)) {
      errors.push(`${label}: unknown entry "${entry}"`);
    }
  }
  if (value.length === 0) {
    errors.push(`${label}: must not be empty`);
  }
}

function validateDecisionPoints(value: unknown, errors: string[]): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    errors.push("organizationDecisionPoints: expected an array when present");
    return;
  }
  value.forEach((point: unknown, index: number) => {
    if (!isObject(point)) {
      errors.push(`organizationDecisionPoints[${index}]: expected an object`);
      return;
    }
    const candidate = point as Partial<OrganizationDecisionPoint>;
    if (typeof candidate.pointId !== "string" || candidate.pointId.length === 0) {
      errors.push(`organizationDecisionPoints[${index}].pointId: expected a non-empty string`);
    }
    if (typeof candidate.description !== "string" || candidate.description.length === 0) {
      errors.push(`organizationDecisionPoints[${index}].description: expected a non-empty string`);
    }
    if (candidate.decidedBy !== "organization") {
      errors.push(`organizationDecisionPoints[${index}].decidedBy: must be "organization" (§16)`);
    }
  });
}

/**
 * Validate plugin completeness against every required `StudioFormat` aspect.
 * Returns the enumerated reasons when the plugin is malformed — callers
 * reject fail-closed instead of guessing defaults.
 */
export function validateFormatPlugin(plugin: unknown): readonly string[] {
  const errors: string[] = [];
  if (!isObject(plugin)) {
    return ["plugin: expected an object"];
  }
  if (typeof plugin.id !== "string" || plugin.id.length === 0) {
    errors.push("id: expected a non-empty string");
  }
  if (!isPositiveInteger(plugin.version)) {
    errors.push("version: expected a positive integer");
  }
  if (typeof plugin.validateSessionInput !== "function") {
    errors.push("validateSessionInput: expected a function");
  }

  const input = plugin.inputRequirements as Partial<FormatInputRequirements> | undefined;
  if (!isObject(input)) {
    errors.push("inputRequirements: expected an object");
  } else {
    validateArrayOf(input.acceptedInputs, INPUT_KINDS, "inputRequirements.acceptedInputs", errors);
    if (!isBoolean(input.requiresRightsClearedSources)) {
      errors.push("inputRequirements.requiresRightsClearedSources: expected a boolean");
    }
    if (!isBoolean(input.generatesScriptFromIntent)) {
      errors.push("inputRequirements.generatesScriptFromIntent: expected a boolean");
    }
  }

  const model = plugin.participantModel as Partial<FormatParticipantModel> | undefined;
  if (!isObject(model)) {
    errors.push("participantModel: expected an object");
  } else {
    const minimum = model.minimumParticipants;
    const maximum = model.maximumParticipants;
    if (!isPositiveInteger(minimum)) {
      errors.push("participantModel.minimumParticipants: expected a positive integer");
    }
    if (!isPositiveInteger(maximum)) {
      errors.push("participantModel.maximumParticipants: expected a positive integer");
    } else if (isPositiveInteger(minimum) && maximum < minimum) {
      errors.push("participantModel.maximumParticipants: must be >= minimumParticipants");
    }
    validateArrayOf(model.allowedRoles, PARTICIPANT_ROLES, "participantModel.allowedRoles", errors);
    if (!isBoolean(model.supportsMultiAccount)) {
      errors.push("participantModel.supportsMultiAccount: expected a boolean");
    }
  }

  const capture = plugin.captureRequirements as Partial<FormatCaptureRequirements> | undefined;
  if (!isObject(capture)) {
    errors.push("captureRequirements: expected an object");
  } else {
    for (const key of ["audio", "video"] as const) {
      const section = capture[key] as Partial<{ required: unknown; devices: unknown; maxTakeSeconds: unknown }> | undefined;
      if (!isObject(section)) {
        errors.push(`captureRequirements.${key}: expected an object`);
        continue;
      }
      if (!isBoolean(section.required)) {
        errors.push(`captureRequirements.${key}.required: expected a boolean`);
      }
      if (!Array.isArray(section.devices)) {
        errors.push(`captureRequirements.${key}.devices: expected an array`);
      } else {
        section.devices.forEach((device: unknown, index: number) => {
          if (!isObject(device)) {
            errors.push(`captureRequirements.${key}.devices[${index}]: expected an object`);
            return;
          }
          if (!MEDIA_KINDS.has(String(device.mediaKind))) {
            errors.push(`captureRequirements.${key}.devices[${index}].mediaKind: expected "audio" | "video"`);
          }
          if (!DEVICE_CLASSES.has(String(device.deviceClass))) {
            errors.push(`captureRequirements.${key}.devices[${index}].deviceClass: unknown device class`);
          }
        });
      }
    }
    if (!isBoolean(capture.allowsMediaImport)) {
      errors.push("captureRequirements.allowsMediaImport: expected a boolean");
    }
  }

  const interviewer = plugin.interviewerRequirements as Partial<InterviewerRequirements> | undefined;
  if (!isObject(interviewer)) {
    errors.push("interviewerRequirements: expected an object");
  } else {
    if (!Array.isArray(interviewer.supportedRepresentations)) {
      errors.push("interviewerRequirements.supportedRepresentations: expected an array (may be empty)");
    } else {
      for (const kind of interviewer.supportedRepresentations) {
        if (!REPRESENTATION_KINDS.has(String(kind))) {
          errors.push(`interviewerRequirements.supportedRepresentations: unknown kind "${String(kind)}"`);
        }
      }
    }
    if (!isBoolean(interviewer.requiresAdaptiveQuestionGraph)) {
      errors.push("interviewerRequirements.requiresAdaptiveQuestionGraph: expected a boolean");
    }
    if (!isBoolean(interviewer.requiresHumanParticipant)) {
      errors.push("interviewerRequirements.requiresHumanParticipant: expected a boolean");
    }
    if (!isBoolean(interviewer.requiresSyntheticDisclosure)) {
      errors.push("interviewerRequirements.requiresSyntheticDisclosure: expected a boolean");
    }
  }

  const compat = plugin.organizationCompatibility as Partial<OrganizationCompatibility> | undefined;
  if (!isObject(compat)) {
    errors.push("organizationCompatibility: expected an object");
  } else {
    if (!isStringArray(compat.requiredCapabilities)) {
      errors.push("organizationCompatibility.requiredCapabilities: expected an array of capability ids");
    }
    if (!isBoolean(compat.allowsCapabilitySubstitution)) {
      errors.push("organizationCompatibility.allowsCapabilitySubstitution: expected a boolean");
    }
    if (
      compat.minimumOrganizationVersion !== undefined &&
      !isPositiveInteger(compat.minimumOrganizationVersion)
    ) {
      errors.push("organizationCompatibility.minimumOrganizationVersion: expected a positive integer");
    }
  }

  const output = plugin.outputContract as Partial<FormatOutputContract> | undefined;
  if (!isObject(output)) {
    errors.push("outputContract: expected an object");
  } else {
    validateArrayOf(output.finalArtifactTypes, ARTIFACT_TYPES, "outputContract.finalArtifactTypes", errors);
    if (!isBoolean(output.allowsMultipleFinalCandidates)) {
      errors.push("outputContract.allowsMultipleFinalCandidates: expected a boolean");
    }
  }

  const provenance = plugin.provenanceRequirements as Partial<FormatProvenanceRequirements> | undefined;
  if (!isObject(provenance)) {
    errors.push("provenanceRequirements: expected an object");
  } else {
    for (const key of ["requiresSyntheticDisclosure", "requiresConsentRefsOnRawCapture", "requiresEngineVersionRecording"] as const) {
      if (!isBoolean(provenance[key])) {
        errors.push(`provenanceRequirements.${key}: expected a boolean`);
      }
    }
  }

  const hooks = plugin.evaluationHooks as Partial<FormatEvaluationHooks> | undefined;
  if (!isObject(hooks)) {
    errors.push("evaluationHooks: expected an object");
  } else if (!Array.isArray(hooks.hooks)) {
    errors.push("evaluationHooks.hooks: expected an array");
  } else {
    (hooks.hooks as unknown[]).forEach((hook: unknown, index: number) => {
      const candidate = hook as Partial<EvaluationHookDescriptor> | undefined;
      if (!isObject(candidate)) {
        errors.push(`evaluationHooks.hooks[${index}]: expected an object`);
        return;
      }
      if (!HOOK_STAGES.has(String(candidate.stage))) {
        errors.push(`evaluationHooks.hooks[${index}].stage: unknown stage`);
      }
      if (typeof candidate.evaluatorCapability !== "string" || candidate.evaluatorCapability.length === 0) {
        errors.push(`evaluationHooks.hooks[${index}].evaluatorCapability: expected a non-empty string`);
      }
      if (!isBoolean(candidate.blocking)) {
        errors.push(`evaluationHooks.hooks[${index}].blocking: expected a boolean`);
      }
    });
  }

  validateDecisionPoints(plugin.organizationDecisionPoints, errors);
  return errors;
}

/**
 * The format registry. One instance per Studio runtime; registering a
 * complete plugin is a runtime operation — pluggability is live, not
 * compile-time.
 */
export class FormatRegistry {
  private readonly byKey = new Map<string, StudioFormatPlugin>();
  private readonly byId = new Map<string, StudioFormatPlugin[]>();

  /** Register a plugin. Fail-closed: malformed or duplicate plugins are rejected with reasons. */
  register(plugin: unknown): FormatRegistrationResult {
    const errors = validateFormatPlugin(plugin);
    if (errors.length > 0) {
      return { ok: false, reasons: errors };
    }
    const complete = plugin as StudioFormatPlugin;
    const key = `${complete.id}@${complete.version}`;
    if (this.byKey.has(key)) {
      return { ok: false, reasons: [`duplicate format version: ${key} is already registered`] };
    }
    this.byKey.set(key, complete);
    const versions = this.byId.get(complete.id) ?? [];
    versions.push(complete);
    this.byId.set(complete.id, versions);
    return { ok: true, plugin: complete };
  }

  /**
   * Resolve a format: exact version when pinned, latest registered version
   * otherwise. Unknown ids/versions resolve to explicit errors — never a
   * fallback to another format.
   */
  resolve(formatId: StudioFormatId, version?: ContractVersion): FormatResolutionResult {
    const versions = this.byId.get(formatId);
    if (versions === undefined || versions.length === 0) {
      return { ok: false, error: { kind: "format-not-registered", formatId } };
    }
    if (version === undefined) {
      const latest = [...versions].sort((a, b) => b.version - a.version)[0] as StudioFormatPlugin;
      return { ok: true, plugin: latest };
    }
    const pinned = versions.find((plugin) => plugin.version === version);
    if (pinned === undefined) {
      return {
        ok: false,
        error: {
          kind: "format-version-not-registered",
          formatId,
          version,
          availableVersions: versions.map((plugin) => plugin.version),
        },
      };
    }
    return { ok: true, plugin: pinned };
  }

  /** Registered format id@version pairs (observability). */
  list(): readonly { formatId: StudioFormatId; version: ContractVersion }[] {
    return [...this.byKey.values()].map((plugin) => ({
      formatId: plugin.id,
      version: plugin.version,
    }));
  }
}

/** Create an empty registry. */
export function createFormatRegistry(): FormatRegistry {
  return new FormatRegistry();
}
