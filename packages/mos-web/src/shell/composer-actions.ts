import type { ConsoleIntentActionId, ConsoleIntentAuthorityId } from '../ports/console-intents.js';
import type { LabIntentActionId, LabIntentAuthorityId } from '../ports/lab-intents.js';
import type { ConsoleIntentFormParse } from '../views/console-intent-form-data.js';
import type { LabIntentFormParse } from '../views/lab-intent-form-data.js';
import { CONSOLE_INTENT_FORM_FIELDS } from '../views/console-intent-form-data.js';
import { MISSION_INTENT_FORM_FIELDS } from '../views/mission-intent-form-data.js';
import { CONSOLE_INTENT_MODE_BY_ACTION } from '../routes/console-intent-declaration.js';
import { LAB_INTENT_SECTION_BY_ACTION } from '../routes/lab-intent-declaration.js';
import {
  armRunDeclarationFromFormData,
  compileStrategyDeclarationFromFormData,
  composePlanDeclarationFromFormData,
  createExperimentDeclarationFromFormData,
  createRunDeclarationFromFormData,
  grantAnalysisRightsDeclarationFromFormData,
  recordIntelligenceDeclarationFromFormData,
} from '../views/console-intent-form-data.js';
import { LAB_COMPOSER_ACTIONS } from './composer-actions-lab.js';

/**
 * The composer's STATIC action catalog (the §6 P0 universal-composer wave —
 * UXR-WC): every declared write-intent action the product's authorities
 * already expose through the shell's three declare callbacks — 1 mission
 * action, 7 console actions, 8 lab actions — as PRESENTATION data.
 *
 * The catalog mirrors the existing intent forms VERBATIM: the same field
 * names (the shared form-field constants), the same labels, kinds,
 * requiredness, placeholders and JSON-field disclosures the Console, Lab and
 * Missions forms render, plus the same routed-to authority ids and the same
 * FormData parsers. The composer therefore DECLARES the exact same intents
 * the dedicated forms declare — it is an additive entry point, never a
 * parallel vocabulary. No Pay action exists here: no payment authority
 * exists in MOS-2.0, so no Pay entry is rendered (the parity matrix records
 * the absence; nothing is invented).
 *
 * File split note: the eight Research Lab entries live in
 * composer-actions-lab.ts (the ≤400-line managed-file discipline); this file
 * keeps the types, the Mission + Console groups and the lookup helpers.
 */

/** Every declared action id the composer may preload or pick. */
export type ComposerActionId =
  | 'create-mission'
  | ConsoleIntentActionId
  | LabIntentActionId;

/** The composer category (the picker's three groups, display order). */
export type ComposerActionCategory = 'Mission' | 'Console' | 'Research Lab';

/** The shell callback family an action routes through. */
export type ComposerDeclareRoute = 'mission' | 'console' | 'lab';

/** One rendered composer field (the intent forms' field config, verbatim). */
export interface ComposerActionField {
  /** Stable field name — the SHARED form-field constant (same parser input). */
  readonly name: string;
  /** Visible label (verbatim from the owning intent form). */
  readonly label: string;
  /** Rendered control kind (the forms' four kinds + the mission direction select). */
  readonly kind: 'text' | 'number' | 'json' | 'long-text' | 'select';
  /** Whether the declaration requires the field (native `required` semantics). */
  readonly required: boolean;
  /** Placeholder hint (never a defaulted value). */
  readonly placeholder?: string;
  /** For `select` fields: the fixed options (verbatim from the mission form). */
  readonly options?: readonly { readonly value: string; readonly label: string }[];
  /** A declared default the existing form pre-fills (e.g. weight 1, maximize). */
  readonly defaultValue?: string;
}

/** One composer action entry (static presentation data). */
export interface ComposerAction {
  readonly actionId: ComposerActionId;
  /** Action-focused label shown in the picker. */
  readonly label: string;
  /** One-line purpose (the owning form's disclosure, one line). */
  readonly oneLinePurpose: string;
  /** The authority the declaration routes to (verbatim port vocabulary). */
  readonly routedTo: string;
  /** The shell callback family the declaration leaves through. */
  readonly declareRoute: ComposerDeclareRoute;
  /** The picker's group. */
  readonly category: ComposerActionCategory;
  /** The rendered fields, in declaration order (verbatim field configs). */
  readonly fields: readonly ComposerActionField[];
  /** The EXISTING FormData parser for console/lab actions (none for mission). */
  readonly parse?: (form: FormData) => ConsoleIntentFormParse | LabIntentFormParse;
}

const F = CONSOLE_INTENT_FORM_FIELDS;
const M = MISSION_INTENT_FORM_FIELDS;

/** The catalog (16 actions — every declared write-intent the shell exposes). */
export const COMPOSER_ACTIONS: readonly ComposerAction[] = [
  {
    actionId: 'create-mission',
    label: 'Create a mission',
    oneLinePurpose:
      'Declare the objective and reward terms; the Missions authority validates, creates and versions the mission when it executes the intent.',
    routedTo: 'missions-authority',
    declareRoute: 'mission',
    category: 'Mission',
    fields: [
      {
        name: M.objectiveStatement,
        label: 'Objective statement',
        kind: 'long-text',
        required: true,
        placeholder:
          'e.g. Grow qualified reach of the developer audience in Q3 without fatigue or rights risk',
      },
      {
        name: M.termMetric,
        label: 'Metric',
        kind: 'text',
        required: true,
        placeholder:
          'the reward metric id (e.g. qualified-reach) — the Missions surface\u2019s form lists the served vocabulary as a select',
      },
      {
        name: M.termDirection,
        label: 'Direction',
        kind: 'select',
        required: true,
        defaultValue: 'maximize',
        options: [
          { value: 'maximize', label: 'maximize (value term)' },
          { value: 'minimize', label: 'minimize (cost/risk term)' },
        ],
      },
      { name: M.termWeight, label: 'Weight', kind: 'number', required: true, defaultValue: '1' },
      {
        name: M.termDefinition,
        label: 'What counts (precise definition — never defaulted)',
        kind: 'long-text',
        required: true,
      },
    ],
  },
  {
    actionId: 'create-experiment',
    label: 'Create an experiment',
    oneLinePurpose:
      'The experiments authority registers the experiment record; the plan\u2019s expectations cite it and the run arms against its binding.',
    routedTo: 'experiments-authority',
    declareRoute: 'console',
    category: 'Console',
    parse: createExperimentDeclarationFromFormData,
    fields: [
      { name: F.experimentId, label: 'Experiment id', kind: 'text', required: true, placeholder: 'e.g. exp-ghana-001' },
      { name: F.questionText, label: 'The question the experiment decides', kind: 'long-text', required: true },
      { name: F.successCriterionText, label: 'Success criterion', kind: 'long-text', required: true },
      { name: F.hypothesisJson, label: 'Declared hypothesis', kind: 'json', required: true, placeholder: '{}' },
      { name: F.missionRefsText, label: 'Mission refs (comma-separated)', kind: 'text', required: false },
    ],
  },
  {
    actionId: 'grant-analysis-rights',
    label: 'Grant analysis rights',
    oneLinePurpose:
      'The rights authority validates the declared scope and terms fail-closed; the grant unblocks intelligence recording for the evidence path.',
    routedTo: 'rights-authority',
    declareRoute: 'console',
    category: 'Console',
    parse: grantAnalysisRightsDeclarationFromFormData,
    fields: [
      { name: F.grantId, label: 'Rights grant id', kind: 'text', required: true, placeholder: 'e.g. grant-analyze-001' },
      { name: F.rightsHolderId, label: 'Rights holder identity id', kind: 'text', required: true, placeholder: 'e.g. identity-operator' },
      { name: F.actionText, label: 'Granted action', kind: 'text', required: true, placeholder: 'analyze' },
      { name: F.scopeJson, label: 'Rights scope', kind: 'json', required: true, placeholder: '{}' },
      { name: F.termsJson, label: 'Rights terms', kind: 'json', required: true, placeholder: '{}' },
    ],
  },
  {
    actionId: 'record-intelligence',
    label: 'Record product intelligence',
    oneLinePurpose:
      'Recording is rights-gated fail-closed: without a registered grant covering the analyze action, the authority rejects the recording and the verdict says so verbatim.',
    routedTo: 'product-intelligence-authority',
    declareRoute: 'console',
    category: 'Console',
    parse: recordIntelligenceDeclarationFromFormData,
    fields: [
      { name: F.recordId, label: 'Intelligence record id', kind: 'text', required: true, placeholder: 'e.g. intel-ghana-segments' },
      { name: F.subjectJson, label: 'Product subject ref', kind: 'json', required: true, placeholder: '{}' },
      { name: F.contentKindText, label: 'Content kind (fact | metric | observation)', kind: 'text', required: true, placeholder: 'observation' },
      { name: F.contentJson, label: 'Intelligence content', kind: 'json', required: true, placeholder: '{}' },
      { name: F.sourceJson, label: 'Source attribution', kind: 'json', required: true, placeholder: '{"sourceKind":"..."}' },
      { name: F.basisKindText, label: 'Basis (cited-evidence | counterfactual-forecast)', kind: 'text', required: true, placeholder: 'cited-evidence' },
      { name: F.citedCommerceObservationsJson, label: 'Cited commerce observations (required for external sources)', kind: 'json', required: false, placeholder: '[]' },
      { name: F.rightsRef, label: 'Rights ref (the recording gate resolves this)', kind: 'text', required: true, placeholder: 'e.g. grant-analyze-001' },
      { name: F.attributionText, label: 'Attribution note', kind: 'text', required: false },
      { name: F.noteText, label: 'Recorder note', kind: 'text', required: false },
    ],
  },
  {
    actionId: 'compose-plan',
    label: 'Compose the marketing plan',
    oneLinePurpose:
      'The planner composes an evidence-linked, mission-cited plan from the declared platform choices and expectations; every citation must resolve through the product-intelligence authority.',
    routedTo: 'marketing-planner-authority',
    declareRoute: 'console',
    category: 'Console',
    parse: composePlanDeclarationFromFormData,
    fields: [
      { name: F.planId, label: 'Plan chain id', kind: 'text', required: true, placeholder: 'e.g. plan-ghana-launch' },
      { name: F.missionId, label: 'The mission this plan serves (the selected mission)', kind: 'text', required: true, placeholder: 'e.g. mission_demo_1' },
      { name: F.objectiveAlignmentText, label: 'How this plan serves the mission objective', kind: 'long-text', required: true },
      { name: F.platformsJson, label: 'Platform choices', kind: 'json', required: true, placeholder: '[{"platform":"...","rationale":"...","evidence":[{"recordId":"...","version":1}]}]' },
      { name: F.metricExpectationsJson, label: 'Metric expectations', kind: 'json', required: true, placeholder: '[{"metric":"...","expectation":"...","unit":"count","basis":{"kind":"counterfactual-forecast"},"evidence":[{"recordId":"...","version":1}]}]' },
      { name: F.experimentExpectationsJson, label: 'Experiment expectations', kind: 'json', required: true, placeholder: '[{"question":"...","successCriterion":"...","evidence":[{"recordId":"...","version":1}]}]' },
      { name: F.experimentRefsText, label: 'Experiment refs (comma-separated REAL experiment ids)', kind: 'text', required: true, placeholder: 'e.g. exp-001' },
      { name: F.noteText, label: 'Composer note', kind: 'text', required: false },
    ],
  },
  {
    actionId: 'compile-strategy',
    label: 'Compile a plan into a strategy',
    oneLinePurpose:
      'The compiler resolves the plan version, validates the organization against the agents registry, checks the §27 compile right, and produces the phases/delegation/comparators artifact.',
    routedTo: 'strategy-compiler-authority',
    declareRoute: 'console',
    category: 'Console',
    parse: compileStrategyDeclarationFromFormData,
    fields: [
      { name: F.planId, label: 'Plan chain id', kind: 'text', required: true, placeholder: 'the composed plan chain id' },
      { name: F.planVersion, label: 'Plan version (0 = latest)', kind: 'number', required: true, placeholder: '0' },
      { name: F.principalText, label: 'Principal (compile right holder)', kind: 'text', required: true, placeholder: 'e.g. identity-operator' },
    ],
  },
  {
    actionId: 'create-run',
    label: 'Create an automation run',
    oneLinePurpose:
      'The engine instantiates the run in the \u2018compiled\u2019 state — nothing executes; the run waits for authorization in this mode.',
    routedTo: 'automation-engine-authority',
    declareRoute: 'console',
    category: 'Console',
    parse: createRunDeclarationFromFormData,
    fields: [
      { name: F.strategyId, label: 'Compiled strategy id', kind: 'text', required: true, placeholder: 'e.g. prod003-strategy:plan-1@v1' },
    ],
  },
  {
    actionId: 'arm-run',
    label: 'Authorize a run (arm)',
    oneLinePurpose:
      'THE approval transition: the §27 rights verdict decides and the experiment binding must resolve ACTIVE — a denial is relayed verbatim and nothing is armed.',
    routedTo: 'automation-engine-authority',
    declareRoute: 'console',
    category: 'Console',
    parse: armRunDeclarationFromFormData,
    fields: [
      { name: F.runId, label: 'Run id (compiled)', kind: 'text', required: true, placeholder: 'e.g. run-plan-1-1' },
      { name: F.principalText, label: 'Principal (run right holder)', kind: 'text', required: true, placeholder: 'e.g. identity-operator' },
    ],
  },
  // The eight Research Lab entries (verbatim Lab form configs + parsers) —
  // composer-actions-lab.ts (the ≤400-line file discipline).
  ...LAB_COMPOSER_ACTIONS,
];

/** The catalog indexed by action id (every id exactly once). */
export const COMPOSER_ACTIONS_BY_ID: Readonly<Record<ComposerActionId, ComposerAction>> =
  Object.fromEntries(COMPOSER_ACTIONS.map((action) => [action.actionId, action])) as Readonly<
    Record<ComposerActionId, ComposerAction>
  >;

/** The picker's category groups in display order. */
export const COMPOSER_ACTION_CATEGORIES: readonly ComposerActionCategory[] = [
  'Mission',
  'Console',
  'Research Lab',
];

/** The label of an owning surface link (mission/console/lab vocabulary). */
export function composerActionSurfaceLabel(actionId: ComposerActionId): string {
  const route = COMPOSER_ACTIONS_BY_ID[actionId].declareRoute;
  if (route === 'mission') {
    return 'Missions';
  }
  return route === 'console' ? 'Agent Console' : 'Research Lab';
}

/**
 * The app-internal href of the surface that OWNS the action's outcome (the
 * post-declaration soft-navigation targets, verbatim from the existing
 * intent-declaration maps): mission → `/missions`; console → the owning
 * mode; lab → the owning section.
 */
export function composerActionSurfaceHref(actionId: ComposerActionId): string {
  const route = COMPOSER_ACTIONS_BY_ID[actionId].declareRoute;
  if (route === 'mission') {
    return '/missions';
  }
  if (route === 'console') {
    const mode = CONSOLE_INTENT_MODE_BY_ACTION[actionId as ConsoleIntentActionId];
    return `/console?mode=${mode}`;
  }
  const section = LAB_INTENT_SECTION_BY_ACTION[actionId as LabIntentActionId];
  return `/lab?section=${section}`;
}

/** The authority id type helpers re-exported for the receipt card's typing. */
export type { ConsoleIntentAuthorityId, LabIntentAuthorityId };
