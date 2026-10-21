import type {
  IngestReferenceDocumentDeclaration,
  LabIntentDeclaration,
  LearnStrategyDeclaration,
  RecordCalibrationErrorDeclaration,
  RegisterWorldModelDeclaration,
  RunBenchmarkDeclaration,
  SearchOrganizationsDeclaration,
  SimulateStepDeclaration,
  SnapshotCorpusVersionDeclaration,
} from '../ports/lab-intents.js';

/**
 * Lab intent form field names + FormData parsers (UX-003 wave 3).
 *
 * Uncontrolled-by-design, mirroring the mission intent form: the browser
 * owns input state, `required` attributes carry the minimal presentation
 * validation, and the parsers below fold FormData into the typed
 * declarations the shell hands to the lab-intents port. The DECLARED-JSON
 * fields (scenario, reward spec, candidates, policies, world state,
 * observation refs) are passed through as text — the composition seam
 * parses them against the real contract shapes and a parse failure comes
 * back as a named ledger verdict, never a client-side guess.
 *
 * The parsers refuse to guess: a missing required scalar produces
 * `lab-intent-missing-input` (defense in depth behind native `required`),
 * and numbers parse strictly (finite where the contract requires finite).
 */

/** Shared form-field name constants (stable names for tests + e2e). */
export const LAB_INTENT_FORM_FIELDS = {
  documentId: 'lab-intent-document-id',
  niche: 'lab-intent-niche',
  platform: 'lab-intent-platform',
  modality: 'lab-intent-modality',
  artifactId: 'lab-intent-artifact-id',
  sourceRefsText: 'lab-intent-source-refs',
  acquiredAt: 'lab-intent-acquired-at',
  rightsRef: 'lab-intent-rights-ref',
  provenanceRef: 'lab-intent-provenance-ref',
  documentRefsText: 'lab-intent-document-refs',
  worldModelId: 'lab-intent-world-model-id',
  notesText: 'lab-intent-notes',
  stateJson: 'lab-intent-state-json',
  worldModelVersion: 'lab-intent-world-model-version',
  seed: 'lab-intent-seed',
  step: 'lab-intent-step',
  scenarioJson: 'lab-intent-scenario-json',
  candidateJson: 'lab-intent-candidate-json',
  ensembleId: 'lab-intent-ensemble-id',
  ensembleVersion: 'lab-intent-ensemble-version',
  rewardSpecJson: 'lab-intent-reward-spec-json',
  candidatesJson: 'lab-intent-candidates-json',
  policyJson: 'lab-intent-policy-json',
  initialProgramJson: 'lab-intent-initial-program-json',
  stoppingPolicyJson: 'lab-intent-stopping-policy-json',
  benchmarkId: 'lab-intent-benchmark-id',
  seedsText: 'lab-intent-seeds',
  calibrationId: 'lab-intent-calibration-id',
  predictionJson: 'lab-intent-prediction-json',
  observationRefsJson: 'lab-intent-observation-refs-json',
  functionalJson: 'lab-intent-functional-json',
  noteText: 'lab-intent-note',
} as const;

/** A parse refusal: the shell never guesses a declaration. */
export type LabIntentFormParse =
  | { readonly ok: true; readonly declaration: LabIntentDeclaration }
  | { readonly ok: false; readonly code: string; readonly message: string };

// ---------------------------------------------------------------------------
// FormData helpers
// ---------------------------------------------------------------------------

/** Reads one form value as trimmed text ('' when absent). */
function textOf(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Splits a comma-separated text field's PARSE (kept for the parser test:
 * the declared-JSON fields pass through as text; comma lists stay text
 * because the authority splits them itself with its own named codes).
 */
export function splitCommaRefs(text: string): string[] {
  return text
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/** Parses a strictly-required scalar (finite number). */
function numberField(form: FormData, name: string): number | null {
  const text = textOf(form, name);
  const parsed = Number(text);
  if (text === '' || !Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

function missing(field: string): LabIntentFormParse {
  return {
    ok: false,
    code: 'lab-intent-missing-input',
    message: `the form field ${field} is required and was not carried by the submission`,
  };
}

// ---------------------------------------------------------------------------
// Per-action parsers
// ---------------------------------------------------------------------------

/** Parses the ingest-reference-document declaration. */
export function ingestDeclarationFromFormData(form: FormData): LabIntentFormParse {
  const documentId = textOf(form, LAB_INTENT_FORM_FIELDS.documentId);
  if (documentId === '') return missing(LAB_INTENT_FORM_FIELDS.documentId);
  const niche = textOf(form, LAB_INTENT_FORM_FIELDS.niche);
  if (niche === '') return missing(LAB_INTENT_FORM_FIELDS.niche);
  const platform = textOf(form, LAB_INTENT_FORM_FIELDS.platform);
  if (platform === '') return missing(LAB_INTENT_FORM_FIELDS.platform);
  const modality = textOf(form, LAB_INTENT_FORM_FIELDS.modality);
  if (modality === '') return missing(LAB_INTENT_FORM_FIELDS.modality);
  const artifactId = textOf(form, LAB_INTENT_FORM_FIELDS.artifactId);
  if (artifactId === '') return missing(LAB_INTENT_FORM_FIELDS.artifactId);
  const acquiredAt = textOf(form, LAB_INTENT_FORM_FIELDS.acquiredAt);
  if (acquiredAt === '') return missing(LAB_INTENT_FORM_FIELDS.acquiredAt);
  const rightsRef = textOf(form, LAB_INTENT_FORM_FIELDS.rightsRef);
  if (rightsRef === '') return missing(LAB_INTENT_FORM_FIELDS.rightsRef);
  const provenanceRef = textOf(form, LAB_INTENT_FORM_FIELDS.provenanceRef);
  if (provenanceRef === '') return missing(LAB_INTENT_FORM_FIELDS.provenanceRef);
  const declaration: IngestReferenceDocumentDeclaration = {
    action: 'ingest-reference-document',
    documentId,
    niche,
    platform,
    modality,
    artifactId,
    sourceRefsText: textOf(form, LAB_INTENT_FORM_FIELDS.sourceRefsText),
    acquiredAt,
    rightsRef,
    provenanceRef,
  };
  return { ok: true, declaration };
}

/** Parses the snapshot-corpus-version declaration (refs may be empty: version of an empty set). */
export function snapshotDeclarationFromFormData(form: FormData): LabIntentFormParse {
  const declaration: SnapshotCorpusVersionDeclaration = {
    action: 'snapshot-corpus-version',
    documentRefsText: textOf(form, LAB_INTENT_FORM_FIELDS.documentRefsText),
  };
  return { ok: true, declaration };
}

/** Parses the register-world-model declaration. */
export function registerWorldModelDeclarationFromFormData(form: FormData): LabIntentFormParse {
  const worldModelId = textOf(form, LAB_INTENT_FORM_FIELDS.worldModelId);
  if (worldModelId === '') return missing(LAB_INTENT_FORM_FIELDS.worldModelId);
  const niche = textOf(form, LAB_INTENT_FORM_FIELDS.niche);
  if (niche === '') return missing(LAB_INTENT_FORM_FIELDS.niche);
  const platform = textOf(form, LAB_INTENT_FORM_FIELDS.platform);
  if (platform === '') return missing(LAB_INTENT_FORM_FIELDS.platform);
  const stateJson = textOf(form, LAB_INTENT_FORM_FIELDS.stateJson);
  if (stateJson === '') return missing(LAB_INTENT_FORM_FIELDS.stateJson);
  const declaration: RegisterWorldModelDeclaration = {
    action: 'register-world-model',
    worldModelId,
    niche,
    platform,
    notesText: textOf(form, LAB_INTENT_FORM_FIELDS.notesText),
    stateJson,
  };
  return { ok: true, declaration };
}

/** Parses the simulate-step declaration. */
export function simulateStepDeclarationFromFormData(form: FormData): LabIntentFormParse {
  const worldModelId = textOf(form, LAB_INTENT_FORM_FIELDS.worldModelId);
  if (worldModelId === '') return missing(LAB_INTENT_FORM_FIELDS.worldModelId);
  const worldModelVersion = numberField(form, LAB_INTENT_FORM_FIELDS.worldModelVersion);
  if (worldModelVersion === null) return missing(LAB_INTENT_FORM_FIELDS.worldModelVersion);
  const seed = numberField(form, LAB_INTENT_FORM_FIELDS.seed);
  if (seed === null) return missing(LAB_INTENT_FORM_FIELDS.seed);
  const step = numberField(form, LAB_INTENT_FORM_FIELDS.step);
  if (step === null) return missing(LAB_INTENT_FORM_FIELDS.step);
  const scenarioJson = textOf(form, LAB_INTENT_FORM_FIELDS.scenarioJson);
  if (scenarioJson === '') return missing(LAB_INTENT_FORM_FIELDS.scenarioJson);
  const candidateJson = textOf(form, LAB_INTENT_FORM_FIELDS.candidateJson);
  if (candidateJson === '') return missing(LAB_INTENT_FORM_FIELDS.candidateJson);
  const declaration: SimulateStepDeclaration = {
    action: 'simulate-step',
    worldModelId,
    worldModelVersion,
    seed,
    step,
    scenarioJson,
    candidateJson,
  };
  return { ok: true, declaration };
}

/** Parses the search-organizations declaration. */
export function searchOrganizationsDeclarationFromFormData(form: FormData): LabIntentFormParse {
  const ensembleId = textOf(form, LAB_INTENT_FORM_FIELDS.ensembleId);
  if (ensembleId === '') return missing(LAB_INTENT_FORM_FIELDS.ensembleId);
  const ensembleVersion = numberField(form, LAB_INTENT_FORM_FIELDS.ensembleVersion);
  if (ensembleVersion === null) return missing(LAB_INTENT_FORM_FIELDS.ensembleVersion);
  const seed = numberField(form, LAB_INTENT_FORM_FIELDS.seed);
  if (seed === null) return missing(LAB_INTENT_FORM_FIELDS.seed);
  const scenarioJson = textOf(form, LAB_INTENT_FORM_FIELDS.scenarioJson);
  if (scenarioJson === '') return missing(LAB_INTENT_FORM_FIELDS.scenarioJson);
  const rewardSpecJson = textOf(form, LAB_INTENT_FORM_FIELDS.rewardSpecJson);
  if (rewardSpecJson === '') return missing(LAB_INTENT_FORM_FIELDS.rewardSpecJson);
  const candidatesJson = textOf(form, LAB_INTENT_FORM_FIELDS.candidatesJson);
  if (candidatesJson === '') return missing(LAB_INTENT_FORM_FIELDS.candidatesJson);
  const policyJson = textOf(form, LAB_INTENT_FORM_FIELDS.policyJson);
  if (policyJson === '') return missing(LAB_INTENT_FORM_FIELDS.policyJson);
  const declaration: SearchOrganizationsDeclaration = {
    action: 'search-organizations',
    ensembleId,
    ensembleVersion,
    seed,
    scenarioJson,
    rewardSpecJson,
    candidatesJson,
    policyJson,
  };
  return { ok: true, declaration };
}

/** Parses the learn-strategy declaration. */
export function learnStrategyDeclarationFromFormData(form: FormData): LabIntentFormParse {
  const ensembleId = textOf(form, LAB_INTENT_FORM_FIELDS.ensembleId);
  if (ensembleId === '') return missing(LAB_INTENT_FORM_FIELDS.ensembleId);
  const ensembleVersion = numberField(form, LAB_INTENT_FORM_FIELDS.ensembleVersion);
  if (ensembleVersion === null) return missing(LAB_INTENT_FORM_FIELDS.ensembleVersion);
  const seed = numberField(form, LAB_INTENT_FORM_FIELDS.seed);
  if (seed === null) return missing(LAB_INTENT_FORM_FIELDS.seed);
  const scenarioJson = textOf(form, LAB_INTENT_FORM_FIELDS.scenarioJson);
  if (scenarioJson === '') return missing(LAB_INTENT_FORM_FIELDS.scenarioJson);
  const rewardSpecJson = textOf(form, LAB_INTENT_FORM_FIELDS.rewardSpecJson);
  if (rewardSpecJson === '') return missing(LAB_INTENT_FORM_FIELDS.rewardSpecJson);
  const initialProgramJson = textOf(form, LAB_INTENT_FORM_FIELDS.initialProgramJson);
  if (initialProgramJson === '') return missing(LAB_INTENT_FORM_FIELDS.initialProgramJson);
  const stoppingPolicyJson = textOf(form, LAB_INTENT_FORM_FIELDS.stoppingPolicyJson);
  if (stoppingPolicyJson === '') return missing(LAB_INTENT_FORM_FIELDS.stoppingPolicyJson);
  const declaration: LearnStrategyDeclaration = {
    action: 'learn-strategy',
    ensembleId,
    ensembleVersion,
    seed,
    scenarioJson,
    rewardSpecJson,
    initialProgramJson,
    stoppingPolicyJson,
  };
  return { ok: true, declaration };
}

/** Parses the run-benchmark declaration (empty candidate set is valid: the no-op baseline). */
export function runBenchmarkDeclarationFromFormData(form: FormData): LabIntentFormParse {
  const benchmarkId = textOf(form, LAB_INTENT_FORM_FIELDS.benchmarkId);
  if (benchmarkId === '') return missing(LAB_INTENT_FORM_FIELDS.benchmarkId);
  const scenarioJson = textOf(form, LAB_INTENT_FORM_FIELDS.scenarioJson);
  if (scenarioJson === '') return missing(LAB_INTENT_FORM_FIELDS.scenarioJson);
  const candidatesJson = textOf(form, LAB_INTENT_FORM_FIELDS.candidatesJson);
  if (candidatesJson === '') return missing(LAB_INTENT_FORM_FIELDS.candidatesJson);
  const rewardSpecJson = textOf(form, LAB_INTENT_FORM_FIELDS.rewardSpecJson);
  if (rewardSpecJson === '') return missing(LAB_INTENT_FORM_FIELDS.rewardSpecJson);
  const policyJson = textOf(form, LAB_INTENT_FORM_FIELDS.policyJson);
  if (policyJson === '') return missing(LAB_INTENT_FORM_FIELDS.policyJson);
  const seedsText = textOf(form, LAB_INTENT_FORM_FIELDS.seedsText);
  const declaration: RunBenchmarkDeclaration = {
    action: 'run-benchmark',
    benchmarkId,
    seedsText,
    scenarioJson,
    candidatesJson,
    rewardSpecJson,
    policyJson,
  };
  return { ok: true, declaration };
}

/** Parses the record-calibration-error declaration. */
export function recordCalibrationErrorDeclarationFromFormData(form: FormData): LabIntentFormParse {
  const calibrationId = textOf(form, LAB_INTENT_FORM_FIELDS.calibrationId);
  if (calibrationId === '') return missing(LAB_INTENT_FORM_FIELDS.calibrationId);
  const predictionJson = textOf(form, LAB_INTENT_FORM_FIELDS.predictionJson);
  if (predictionJson === '') return missing(LAB_INTENT_FORM_FIELDS.predictionJson);
  const observationRefsJson = textOf(form, LAB_INTENT_FORM_FIELDS.observationRefsJson);
  if (observationRefsJson === '') return missing(LAB_INTENT_FORM_FIELDS.observationRefsJson);
  const rewardSpecJson = textOf(form, LAB_INTENT_FORM_FIELDS.rewardSpecJson);
  if (rewardSpecJson === '') return missing(LAB_INTENT_FORM_FIELDS.rewardSpecJson);
  const functionalJson = textOf(form, LAB_INTENT_FORM_FIELDS.functionalJson);
  if (functionalJson === '') return missing(LAB_INTENT_FORM_FIELDS.functionalJson);
  const declaration: RecordCalibrationErrorDeclaration = {
    action: 'record-calibration-error',
    calibrationId,
    predictionJson,
    observationRefsJson,
    rewardSpecJson,
    functionalJson,
    noteText: textOf(form, LAB_INTENT_FORM_FIELDS.noteText),
  };
  return { ok: true, declaration };
}
