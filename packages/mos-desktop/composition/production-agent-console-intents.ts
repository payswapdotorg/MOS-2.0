import type { IdentityId } from '../../mos-identity/dist/index.js';
import type { ConsoleIntentsPort } from '@mos/web';
import type {
  ExperimentExpectationInput,
  MetricExpectationInput,
  PlatformChoiceInput,
  PlatformRole,
} from '@mos/missions';
import type {
  ProductIntelligenceBasis,
  ProductIntelligenceContent,
  RecordProductIntelligenceInput,
} from '../../mos-product-intelligence/dist/index.js';
import type { GrantRightsInput, RightsTerms } from '../../mos-rights/dist/index.js';
import type { DeclaredMetricView, DeclaredPlatformView, PlanLinkage } from './production-agent-console-plan-bridge.js';
import { CONSOLE_OPERATOR_PRINCIPAL } from './production-agent-console-experiments.js';
import {
  consoleFailureOf,
  consoleReceiptOf,
  type ConsoleBindingState,
  type RuntimeVerdict,
} from './production-agent-console-core.js';
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
 * The evidence-path intents of the PRODUCTION Agent-Console binding (the
 * CONSOLE wave, Worker C): grant-analysis-rights (the REAL §27 rights
 * repository), record-intelligence (the REAL §25 product-intelligence
 * authority — its rights gate fails closed NATURALLY) and compose-plan
 * (the REAL MARKETING-001 planner). Assembled into the port by
 * production-agent-console.ts.
 *
 * DECLARED-JSON contracts (documented; parse failures are the named
 * `console-intent-json-invalid:<field>` codes, deeper shape failures are
 * the REAL authorities' own vocabularies relayed verbatim):
 *  - `scopeJson` → `{ subjectRefs: string[], sourceRefs: string[] }` — the
 *    granted subjects + the sources backing the grant (the granted ACTION
 *    is the declared `actionText`; the rights vocabulary validates it);
 *  - `termsJson` → the REAL `RightsTerms` shape
 *    ({ attributionRequired, commercialUseAllowed, derivationAllowed, notes });
 *  - `subjectJson` → a JSON string (the product subject ref);
 *  - `contentJson` → the REAL content union fields PLUS a `basis` sibling
 *    carrying the §25 basis detail ({ observedAt } for cited evidence,
 *    { methodNote } for a counterfactual forecast) — the basis detail is
 *    evidence metadata the operator declares with the content, never a
 *    composition-invented timestamp;
 *  - `sourceJson` → the REAL source attribution
 *    ({ sourceKind, sourceRefs });
 *  - `platformsJson` → the planner's `PlatformChoiceInput[]` PLUS the
 *    declared compile dimensions per entry (role, channels,
 *    declaredProductionDays, declaredCostPerAction, modelPreference?);
 *  - `metricExpectationsJson` → the planner's
 *    `MetricExpectationInput[]` PLUS the declared measurement dimensions
 *    per entry (platformId, window { opensAt, closesAt }).
 *
 * The content-kind vocabulary mapping (disclosed): the shell's
 * `fact | metric | observation` maps onto the authority's frozen
 * `product-fact | product-metric | product-observation` kinds.
 */

/** The console's content-kind vocabulary → the authority's frozen kinds. */
const CONTENT_KIND_BY_TEXT: Readonly<Record<string, string>> = {
  fact: 'product-fact',
  metric: 'product-metric',
  observation: 'product-observation',
};

/** The §25 basis composed from the declared basis-kind text + detail. */
const basisOf = (
  basisKindText: string,
  detail: Record<string, unknown> | undefined,
): ProductIntelligenceBasis | null => {
  if (basisKindText === 'cited-evidence') {
    const observedAt = detail === undefined ? undefined : nonBlankString(detail, 'observedAt');
    if (observedAt === undefined) {
      return null;
    }
    return { basis: 'cited-external-evidence', counterfactual: false, observedAt: observedAt as never };
  }
  if (basisKindText === 'counterfactual-forecast') {
    const methodNote = detail === undefined ? undefined : nonBlankString(detail, 'methodNote');
    if (methodNote === undefined) {
      return null;
    }
    return { basis: 'counterfactual-forecast', counterfactual: true, methodNote };
  }
    return null;
};

// ---------------------------------------------------------------------------
// grant-analysis-rights — the REAL rights repository
// ---------------------------------------------------------------------------

/** Build the grant-analysis-rights declare method over the REAL repository. */
export function createGrantRightsIntentMethods(
  state: ConsoleBindingState,
): Pick<ConsoleIntentsPort, 'declareGrantAnalysisRights'> {
  return {
    async declareGrantAnalysisRights(declaration) {
      const identity = state.ledger.nextIdentity('grant-analysis-rights');

      const scope = parseDeclaredJson(identity, declaration.scopeJson, 'scopeJson', 'object');
      if (!scope.ok) {
        return state.ledger.record(identity, scope.failure);
      }
      const scopeObject = isPlainObject(scope.value) ? scope.value : {};
      const terms = parseDeclaredJson(identity, declaration.termsJson, 'termsJson', 'object');
      if (!terms.ok) {
        return state.ledger.record(identity, terms.failure);
      }
      const termsObject = isPlainObject(terms.value) ? terms.value : {};

      const input: GrantRightsInput = {
        scope: state.scope,
        id: declaration.grantId as never,
        grantee: declaration.rightsHolderId as IdentityId,
        actions: [declaration.actionText as never],
        subjectRefs: (stringArray(scopeObject, 'subjectRefs') ?? []) as readonly string[],
        sourceRefs: (stringArray(scopeObject, 'sourceRefs') ?? []) as readonly string[],
        terms: {
          attributionRequired: termsObject.attributionRequired === true,
          commercialUseAllowed: termsObject.commercialUseAllowed === true,
          derivationAllowed: termsObject.derivationAllowed === true,
          notes: (nonBlankString(termsObject, 'notes') as string | null) ?? null,
        } satisfies RightsTerms,
        expiresAt: null,
      };
      const result = state.rightsRepository.grantRights(input);
      if ('error' in result) {
        const verdict: RuntimeVerdict = { error: result.error, message: result.message };
        return state.ledger.record(identity, consoleFailureOf(identity, verdict));
      }
      return state.ledger.record(
        identity,
        consoleReceiptOf(identity, {
          recordId: String(result.id),
          recordVersion: result.version,
          summary:
            `rights grant ${String(result.id)} recorded (v${result.version}, active) — action ${declaration.actionText} granted to ${declaration.rightsHolderId} over ${result.scope.subjectRefs.length} subject ref(s) cited by ${result.sourceRefs.length} source(s)`,
        }),
      );
    },
  };
}

// ---------------------------------------------------------------------------
// record-intelligence — the REAL §25 authority (rights-gated fail-closed)
// ---------------------------------------------------------------------------

/** Build the record-intelligence declare method over the REAL authority. */
export function createRecordIntelligenceIntentMethods(
  state: ConsoleBindingState,
): Pick<ConsoleIntentsPort, 'declareRecordIntelligence'> {
  return {
    async declareRecordIntelligence(declaration) {
      const identity = state.ledger.nextIdentity('record-intelligence');

      const subject = parseDeclaredJson(identity, declaration.subjectJson, 'subjectJson', 'string');
      if (!subject.ok) {
        return state.ledger.record(identity, subject.failure);
      }
      const content = parseDeclaredJson(identity, declaration.contentJson, 'contentJson', 'object');
      if (!content.ok) {
        return state.ledger.record(identity, content.failure);
      }
      const source = parseDeclaredJson(identity, declaration.sourceJson, 'sourceJson', 'object');
      if (!source.ok) {
        return state.ledger.record(identity, source.failure);
      }
      const contentObject = isPlainObject(content.value) ? content.value : {};
      const sourceObject = isPlainObject(source.value) ? source.value : {};
      // The DECLARED basis detail rides the content JSON as the `basis`
      // sibling ({ observedAt } | { methodNote }).
      const basisDetail = isPlainObject(contentObject.basis) ? contentObject.basis : undefined;
      const basis = basisOf(declaration.basisKindText, basisDetail);
      if (basis === null) {
        return state.ledger.record(
          identity,
          missingInputFailure(
            identity,
            'basis',
            `the declared basis ${declaration.basisKindText} requires a declared basis detail in the content JSON's "basis" sibling (${declaration.basisKindText === 'cited-evidence' ? 'observedAt' : 'methodNote'}) — the composition never invents evidence timestamps or forecast methods`,
          ),
        );
      }
      if (basis === undefined) {
        return state.ledger.record(
          identity,
          consoleFailureOf(identity, {
            error: 'invalid-input',
            message: `basis ${declaration.basisKindText} is not in the vocabulary (cited-evidence | counterfactual-forecast)`,
          }),
        );
      }
      const contentKind = CONTENT_KIND_BY_TEXT[declaration.contentKindText] ?? declaration.contentKindText;
      const { basis: _basisDetail, ...contentFields } = contentObject;
      const composedContent = {
        ...contentFields,
        kind: contentKind,
      } as ProductIntelligenceContent;

      const commerce = parseDeclaredJson(
        identity,
        declaration.citedCommerceObservationsJson === '' ? '[]' : declaration.citedCommerceObservationsJson,
        'citedCommerceObservationsJson',
        'array',
      );
      if (!commerce.ok) {
        return state.ledger.record(identity, commerce.failure);
      }

      const input: RecordProductIntelligenceInput = {
        scope: state.scope,
        id: declaration.recordId as never,
        subject: String(subject.value) as never,
        content: composedContent,
        source: {
          sourceKind: (nonBlankString(sourceObject, 'sourceKind') ?? '') as never,
          sourceRefs: (stringArray(sourceObject, 'sourceRefs') ?? []) as readonly string[],
        },
        basis,
        citedCommerceObservations: commerce.value as readonly never[],
        rightsRef: declaration.rightsRef as never,
        attribution: declaration.attributionText.trim() === '' ? null : declaration.attributionText,
        recordedBy: CONSOLE_OPERATOR_PRINCIPAL as unknown as IdentityId,
        note: declaration.noteText.trim() === '' ? null : declaration.noteText,
      };
      const result = await state.productIntelligence.recordProductIntelligence(input);
      if ('error' in result) {
        // The REAL §25 gate's own codes, VERBATIM (no-explicit-grant,
        // analyze-action-not-granted, cited-ref-not-covered-by-grant, ...).
        const verdict: RuntimeVerdict = { error: result.error, message: result.message };
        return state.ledger.record(identity, consoleFailureOf(identity, verdict));
      }
      return state.ledger.record(
        identity,
        consoleReceiptOf(identity, {
          recordId: String(result.id),
          recordVersion: result.version,
          summary:
            `intelligence record ${String(result.id)}@v${result.version} recorded (${String(result.kind)}, ${result.basis.basis}) under rights ref ${String(result.rightsRef)} — evidence-linked, append-only`,
        }),
      );
    },
  };
}

// ---------------------------------------------------------------------------
// compose-plan — the REAL MARKETING-001 planner
// ---------------------------------------------------------------------------

/** Build the compose-plan declare method over the REAL planner. */
export function createComposePlanIntentMethods(
  state: ConsoleBindingState,
): Pick<ConsoleIntentsPort, 'declareComposePlan'> {
  return {
    async declareComposePlan(declaration) {
      const identity = state.ledger.nextIdentity('compose-plan');

      const platforms = parseDeclaredJson(identity, declaration.platformsJson, 'platformsJson', 'array');
      if (!platforms.ok) {
        return state.ledger.record(identity, platforms.failure);
      }
      const metricExpectations = parseDeclaredJson(
        identity,
        declaration.metricExpectationsJson,
        'metricExpectationsJson',
        'array',
      );
      if (!metricExpectations.ok) {
        return state.ledger.record(identity, metricExpectations.failure);
      }
      const experimentExpectations = parseDeclaredJson(
        identity,
        declaration.experimentExpectationsJson,
        'experimentExpectationsJson',
        'array',
      );
      if (!experimentExpectations.ok) {
        return state.ledger.record(identity, experimentExpectations.failure);
      }
      const platformEntries = (platforms.value as readonly unknown[]).filter(isPlainObject);
      const metricEntries = (metricExpectations.value as readonly unknown[]).filter(isPlainObject);
      const experimentEntries = (experimentExpectations.value as readonly unknown[]).filter(
        isPlainObject,
      );
      const experimentRefs = declaration.experimentRefsText
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
      if (experimentRefs.length === 0) {
        return state.ledger.record(
          identity,
          missingInputFailure(
            identity,
            'experimentRefsText',
            'the plan linkage requires at least one REAL experiment ref — the declared experiment refs name the experiments the plan\'s expectations are decided by (the D7 linkage)',
          ),
        );
      }

      // The mission citation: resolved to the LATEST record version through
      // the REAL repository (an unresolvable mission cites version 0 and the
      // planner's own mission-citation-unresolvable verdict names it).
      const missionRecord = state.missionRepository.getMission(declaration.missionId as never);
      const recordVersion = missionRecord === null ? 0 : missionRecord.version;

      const evidenceOf = (entry: Record<string, unknown>): readonly { recordId: string; version: number }[] =>
        (Array.isArray(entry.evidence) ? entry.evidence : [])
          .filter(isPlainObject)
          .map((citation) => ({
            recordId: String(citation.recordId ?? ''),
            version: Number(citation.version ?? 0),
          }));

      const platformInputs: readonly PlatformChoiceInput[] = platformEntries.map((entry) => ({
        platform: String(entry.platform ?? '') as never,
        rationale: String(entry.rationale ?? ''),
        evidence: evidenceOf(entry) as never,
      }));
      const metricInputs: readonly MetricExpectationInput[] = metricEntries.map((entry) => ({
        metric: String(entry.metric ?? '') as never,
        expectation: String(entry.expectation ?? ''),
        unit: String(entry.unit ?? ''),
        // The DECLARED §25 basis passes through AS-IS — the planner's own
        // structural validation owns it (the runtime double-cast guard over
        // the literal pins; a malformed basis rejects with the planner's
        // own invalid-input, verbatim).
        basis: (isPlainObject(entry.basis) ? entry.basis : {}) as never,
        evidence: evidenceOf(entry) as never,
      }));
      const experimentInputs: readonly ExperimentExpectationInput[] = experimentEntries.map((entry) => ({
        question: String(entry.question ?? ''),
        successCriterion: String(entry.successCriterion ?? ''),
        evidence: evidenceOf(entry) as never,
      }));

      const result = await state.marketingPlanner.composeMarketingPlan({
        scope: state.scope,
        id: declaration.planId as never,
        mission: { missionId: declaration.missionId as never, recordVersion },
        objectiveAlignment: declaration.objectiveAlignmentText,
        platforms: platformInputs,
        metricExpectations: metricInputs,
        experimentExpectations: experimentInputs,
        composedBy: CONSOLE_OPERATOR_PRINCIPAL,
        note: declaration.noteText.trim() === '' ? null : declaration.noteText,
      });
      if ('error' in result) {
        // The planner's own codes, VERBATIM (mission-citation-unresolvable,
        // mission-not-plannable, evidence-citation-unresolvable,
        // duplicate-marketing-plan, invalid-input, ...).
        const verdict: RuntimeVerdict = { error: result.error, message: result.message };
        return state.ledger.record(identity, consoleFailureOf(identity, verdict));
      }

      // On success, ALSO record the DECLARED experiment linkage + the
      // declared compile dimensions in the plan-linkage ledger (D7).
      const platformViews = new Map<string, DeclaredPlatformView>();
      for (const entry of platformEntries) {
        const platformId = String(entry.platform ?? '');
        const role = nonBlankString(entry, 'role') as PlatformRole | undefined;
        const channels = stringArray(entry, 'channels');
        const days = finiteNumber(entry, 'declaredProductionDays');
        const cost = finiteNumber(entry, 'declaredCostPerAction');
        if (role !== undefined && channels !== undefined && days !== undefined && cost !== undefined) {
          platformViews.set(platformId, {
            role,
            channels,
            declaredProductionDays: days,
            declaredCostPerAction: cost,
            ...(nonBlankString(entry, 'modelPreference') !== undefined
              ? { modelPreference: nonBlankString(entry, 'modelPreference') }
              : {}),
          });
        }
      }
      const metricViews = new Map<string, DeclaredMetricView>();
      for (const entry of metricEntries) {
        const metricId = String(entry.metric ?? '');
        const platformId = nonBlankString(entry, 'platformId');
        const window = isPlainObject(entry.window) ? (entry.window as Record<string, unknown>) : undefined;
        const opensAt = window === undefined ? undefined : nonBlankString(window, 'opensAt');
        const closesAt = window === undefined ? undefined : nonBlankString(window, 'closesAt');
        if (platformId !== undefined && opensAt !== undefined && closesAt !== undefined) {
          metricViews.set(metricId, { platformId, window: { opensAt, closesAt } });
        }
      }
      const linkage: PlanLinkage = { experimentRefs, platformViews, metricViews };
      state.planLinkage.record(declaration.planId, linkage);

      return state.ledger.record(
        identity,
        consoleReceiptOf(identity, {
          recordId: String(result.id),
          recordVersion: result.version,
          summary:
            `marketing plan ${String(result.id)}@v${result.version} composed for mission ${declaration.missionId}@v${recordVersion} — ${platformInputs.length} platform(s), ${metricInputs.length} metric expectation(s), ${experimentInputs.length} experiment expectation(s), ${experimentRefs.length} declared experiment ref(s)`,
        }),
      );
    },
  };
}
