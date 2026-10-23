import type { LabIntentFormParse } from '../views/lab-intent-form-data.js';
import { LAB_INTENT_FORM_FIELDS } from '../views/lab-intent-form-data.js';
import {
  ingestDeclarationFromFormData,
  learnStrategyDeclarationFromFormData,
  recordCalibrationErrorDeclarationFromFormData,
  registerWorldModelDeclarationFromFormData,
  runBenchmarkDeclarationFromFormData,
  searchOrganizationsDeclarationFromFormData,
  simulateStepDeclarationFromFormData,
  snapshotDeclarationFromFormData,
} from '../views/lab-intent-form-data.js';
import type { ComposerAction } from './composer-actions.js';

/**
 * The composer catalog's RESEARCH LAB group (the §6 P0 universal-composer
 * wave — UXR-WC): the eight declared Lab write intents, split out of
 * composer-actions.ts to keep every managed file within the ≤400-line
 * discipline. The entries mirror the Lab intent forms VERBATIM — the same
 * shared field names (`LAB_INTENT_FORM_FIELDS`), labels, kinds,
 * requiredness and placeholders the Lab section forms render, plus the same
 * routed-to authority ids and the SAME FormData parsers
 * (views/lab-intent-form-data.ts) — so the composer declares the exact
 * intents the dedicated Lab forms declare. No entry here executes anything.
 */

const L = LAB_INTENT_FORM_FIELDS;

/** The Research Lab group of the composer action catalog (8 actions). */
export const LAB_COMPOSER_ACTIONS: readonly ComposerAction[] = [
  {
    actionId: 'ingest-reference-document',
    label: 'Acquire a reference document',
    oneLinePurpose:
      'Acquisition requires an explicit, active, tenant-matching rights grant — with none registered the authority DENIES and the rejection says so.',
    routedTo: 'lab-corpus-authority',
    declareRoute: 'lab',
    category: 'Research Lab',
    parse: ingestDeclarationFromFormData,
    fields: [
      { name: L.documentId, label: 'Document id', kind: 'text', required: true, placeholder: 'e.g. doc-refs-001' },
      { name: L.niche, label: 'Niche', kind: 'text', required: true, placeholder: 'e.g. developer-marketing' },
      { name: L.platform, label: 'Platform', kind: 'text', required: true, placeholder: 'e.g. mastodon' },
      { name: L.modality, label: 'Modality (authority vocabulary)', kind: 'text', required: true, placeholder: 'e.g. text' },
      { name: L.artifactId, label: 'Artifact id', kind: 'text', required: true },
      { name: L.sourceRefsText, label: 'Source refs (comma-separated)', kind: 'text', required: false },
      { name: L.acquiredAt, label: 'Acquired at (ISO-8601)', kind: 'text', required: true, placeholder: 'e.g. 2026-10-21T12:00:00Z' },
      { name: L.rightsRef, label: 'Rights ref (the acquisition gate resolves this)', kind: 'text', required: true },
      { name: L.provenanceRef, label: 'Provenance ref', kind: 'text', required: true },
    ],
  },
  {
    actionId: 'snapshot-corpus-version',
    label: 'Snapshot a corpus version',
    oneLinePurpose:
      'The snapshot\u2019s membership is the declared document refs — duplicates are the authority\u2019s to reject by name; an empty set is a valid version.',
    routedTo: 'lab-corpus-authority',
    declareRoute: 'lab',
    category: 'Research Lab',
    parse: snapshotDeclarationFromFormData,
    fields: [
      { name: L.documentRefsText, label: 'Document refs (comma-separated membership set)', kind: 'text', required: false },
    ],
  },
  {
    actionId: 'register-world-model',
    label: 'Register a world-model version',
    oneLinePurpose:
      'Registration appends to the model\u2019s append-only chain; the declared state becomes the new version and prior versions stay citable.',
    routedTo: 'lab-simulator-authority',
    declareRoute: 'lab',
    category: 'Research Lab',
    parse: registerWorldModelDeclarationFromFormData,
    fields: [
      { name: L.worldModelId, label: 'World model id', kind: 'text', required: true, placeholder: 'e.g. wm-social-reach' },
      { name: L.niche, label: 'Niche', kind: 'text', required: true, placeholder: 'e.g. developer-marketing' },
      { name: L.platform, label: 'Platform', kind: 'text', required: true, placeholder: 'e.g. mastodon' },
      { name: L.notesText, label: 'Notes (optional)', kind: 'long-text', required: false },
      { name: L.stateJson, label: 'World-model state (declared JSON)', kind: 'json', required: true },
    ],
  },
  {
    actionId: 'simulate-step',
    label: 'Step the simulation once',
    oneLinePurpose:
      'The step runs against the exact declared world-model version; the recorded run is counterfactual-labeled evidence over the pinned model — never presented as a measured outcome.',
    routedTo: 'lab-simulator-authority',
    declareRoute: 'lab',
    category: 'Research Lab',
    parse: simulateStepDeclarationFromFormData,
    fields: [
      { name: L.worldModelId, label: 'World model id', kind: 'text', required: true, placeholder: 'e.g. wm-social-reach' },
      { name: L.worldModelVersion, label: 'World model version (exact pin)', kind: 'number', required: true },
      { name: L.seed, label: 'Seed (determinism pin)', kind: 'number', required: true },
      { name: L.step, label: 'Step (time horizon)', kind: 'number', required: true },
      { name: L.scenarioJson, label: 'Scenario (declared JSON)', kind: 'json', required: true, placeholder: 'the full LabScenario JSON — version pins + objective + budget' },
      { name: L.candidateJson, label: 'Candidate action (declared JSON)', kind: 'json', required: true },
    ],
  },
  {
    actionId: 'search-organizations',
    label: 'Run an organization search',
    oneLinePurpose:
      'The search requires a FROZEN ensemble under the declared id+version; the §23 three-way comparison (generalist baseline + hand-designed + generated) is recorded by the authority, never composed here.',
    routedTo: 'lab-organization-search-authority',
    declareRoute: 'lab',
    category: 'Research Lab',
    parse: searchOrganizationsDeclarationFromFormData,
    fields: [
      { name: L.ensembleId, label: 'Ensemble id (frozen)', kind: 'text', required: true, placeholder: 'e.g. ensemble-reach-primary' },
      { name: L.ensembleVersion, label: 'Ensemble version (frozen pin)', kind: 'number', required: true },
      { name: L.seed, label: 'Seed (determinism pin)', kind: 'number', required: true },
      { name: L.scenarioJson, label: 'Scenario (declared JSON)', kind: 'json', required: true, placeholder: 'the full LabScenario JSON — version pins + objective + budget' },
      { name: L.rewardSpecJson, label: 'Reward spec (declared JSON)', kind: 'json', required: true },
      { name: L.candidatesJson, label: 'Candidate set (declared JSON)', kind: 'json', required: true },
      { name: L.policyJson, label: 'Search policy (declared JSON)', kind: 'json', required: true },
    ],
  },
  {
    actionId: 'learn-strategy',
    label: 'Learn a strategy candidate',
    oneLinePurpose:
      'Learning iterates under the declared stopping policy and records its full trace; the resulting candidate is counterfactual-labeled with its evaluation provenance — never presented as a measured outcome.',
    routedTo: 'lab-strategy-learning-authority',
    declareRoute: 'lab',
    category: 'Research Lab',
    parse: learnStrategyDeclarationFromFormData,
    fields: [
      { name: L.ensembleId, label: 'Ensemble id (frozen)', kind: 'text', required: true, placeholder: 'e.g. ensemble-reach-primary' },
      { name: L.ensembleVersion, label: 'Ensemble version (frozen pin)', kind: 'number', required: true },
      { name: L.seed, label: 'Seed (determinism pin)', kind: 'number', required: true },
      { name: L.scenarioJson, label: 'Scenario (declared JSON)', kind: 'json', required: true, placeholder: 'the full LabScenario JSON — version pins + objective + budget' },
      { name: L.rewardSpecJson, label: 'Reward spec (declared JSON)', kind: 'json', required: true },
      { name: L.initialProgramJson, label: 'Initial program (declared JSON)', kind: 'json', required: true },
      { name: L.stoppingPolicyJson, label: 'Stopping policy (declared JSON)', kind: 'json', required: true },
    ],
  },
  {
    actionId: 'run-benchmark',
    label: 'Run a robust benchmark',
    oneLinePurpose:
      'The benchmark authority evaluates the declared candidate set over the declared seeds under the declared robustness policy; every number it records is counterfactual-labeled, never measured.',
    routedTo: 'lab-benchmark-authority',
    declareRoute: 'lab',
    category: 'Research Lab',
    parse: runBenchmarkDeclarationFromFormData,
    fields: [
      { name: L.benchmarkId, label: 'Benchmark id', kind: 'text', required: true, placeholder: 'e.g. bench-reach-v1' },
      { name: L.seedsText, label: 'Seeds (comma-separated determinism pins)', kind: 'text', required: true, placeholder: 'e.g. 1, 2, 3' },
      { name: L.scenarioJson, label: 'Scenario (declared JSON)', kind: 'json', required: true, placeholder: 'the full LabScenario JSON — version pins + objective + budget' },
      { name: L.candidatesJson, label: 'Candidate set (declared JSON)', kind: 'json', required: true, placeholder: '[] is valid — the no-op baseline still runs' },
      { name: L.rewardSpecJson, label: 'Reward spec (declared JSON)', kind: 'json', required: true },
      { name: L.policyJson, label: 'Robustness policy (declared JSON)', kind: 'json', required: true },
    ],
  },
  {
    actionId: 'record-calibration-error',
    label: 'Record a calibration error',
    oneLinePurpose:
      'Recording resolves the DECLARED prediction against a frozen LAB-017 benchmark record; the joined observations are measured boundary-chain reality — never lab-simulated data.',
    routedTo: 'lab-calibration-authority',
    declareRoute: 'lab',
    category: 'Research Lab',
    parse: recordCalibrationErrorDeclarationFromFormData,
    fields: [
      { name: L.calibrationId, label: 'Calibration id', kind: 'text', required: true, placeholder: 'e.g. calib-reach-1' },
      { name: L.predictionJson, label: 'Prediction (declared JSON)', kind: 'json', required: true },
      { name: L.observationRefsJson, label: 'Observation refs (declared JSON)', kind: 'json', required: true, placeholder: 'JSON array of observation refs — at least one, distinct' },
      { name: L.rewardSpecJson, label: 'Reward spec (declared JSON)', kind: 'json', required: true },
      { name: L.functionalJson, label: 'Error functional (declared JSON)', kind: 'json', required: true },
      { name: L.noteText, label: 'Note (optional)', kind: 'long-text', required: false },
    ],
  },
];
