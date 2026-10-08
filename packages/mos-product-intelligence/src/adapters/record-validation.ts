/**
 * INTERNAL fail-closed structural validation for the W11-A
 * product-intelligence record input. NOT exported from the package index.
 *
 * Validation order (mirrored by the adapter's record path):
 * 1. the request object + scope + identifiers;
 * 2. the content union (per-kind: fact statement / metric with the D5
 *    finite-number guard / observation narrative; evidence refs >= 1);
 * 3. the explicit source attribution (source-kind vocabulary, refs >= 1);
 * 4. the basis literal re-validation (cited-external-evidence ⇒
 *    `counterfactual === false`; counterfactual-forecast ⇒
 *    `counterfactual === true` — the runtime double-cast guard over the
 *    compile-time literal pins, lock rule 29 pattern);
 * 5. source/basis coherence (a forecast-model source cannot produce cited
 *    external evidence; an external-commerce-system source is an observed
 *    source, never a forecast — §25);
 * 6. commerce citations (provenance fields; non-empty when the source kind
 *    is `external-commerce-system`);
 * 7. the optional string fields.
 *
 * The rights gate runs separately AFTER this passes (adapters/rights-gate.ts).
 */

import type { RecordProductIntelligenceInput } from '../ports/product-intelligence-port.js';
import { productIntelligenceFailure } from '../ports/product-intelligence-port.js';
import {
  PRODUCT_INTELLIGENCE_KINDS,
  PRODUCT_INTELLIGENCE_SOURCE_KINDS,
} from '../contracts/records.js';
import {
  isNonBlankString,
  isNonBlankStringArray,
  isNullOrNonBlankString,
  isPlainObject,
} from './adapter-support.js';

/** Validate the record request structurally; `null` = valid. */
export const validateProductIntelligenceRequest = (
  input: RecordProductIntelligenceInput,
): ReturnType<typeof productIntelligenceFailure> | null => {
  // ---- 1. request object + scope + identifiers ----
  if (!isPlainObject(input)) {
    return productIntelligenceFailure(
      'invalid-input',
      'the record request must be a plain object',
    );
  }
  if (!isPlainObject(input.scope) || !isNonBlankString(input.scope.tenantId)) {
    return productIntelligenceFailure(
      'invalid-input',
      'input.scope must carry a non-blank tenantId (§31 — no ambient tenant)',
    );
  }
  if (!isNonBlankString(input.id)) {
    return productIntelligenceFailure('invalid-input', 'input.id must be a non-blank string');
  }
  if (!isNonBlankString(input.subject)) {
    return productIntelligenceFailure(
      'invalid-input',
      'input.subject must be a non-blank product subject ref',
    );
  }
  if (!isNonBlankString(input.recordedBy)) {
    return productIntelligenceFailure(
      'invalid-input',
      'input.recordedBy must be a non-blank identity id',
    );
  }

  // ---- 2. the content union ----
  const content = input.content;
  if (!isPlainObject(content) || !isNonBlankString(content.kind)) {
    return productIntelligenceFailure(
      'invalid-input',
      'input.content must carry a non-blank kind',
    );
  }
  if (!PRODUCT_INTELLIGENCE_KINDS.includes(content.kind as never)) {
    return productIntelligenceFailure(
      'invalid-input',
      `input.content.kind "${String(content.kind)}" is not in the frozen product-intelligence vocabulary`,
    );
  }
  const evidenceFault = (): ReturnType<typeof productIntelligenceFailure> | null =>
    isNonBlankStringArray(content.evidenceRefs)
      ? null
      : productIntelligenceFailure(
          'invalid-input',
          'content.evidenceRefs must be a non-empty array of non-blank strings — an evidence-linked record with no evidence is a fabrication, not intelligence',
        );
  if (content.kind === 'product-fact') {
    if (!isNonBlankString(content.statement)) {
      return productIntelligenceFailure(
        'invalid-input',
        'product-fact content requires a non-blank statement',
      );
    }
    const fault = evidenceFault();
    if (fault !== null) {
      return fault;
    }
  } else if (content.kind === 'product-metric') {
    if (!isNonBlankString(content.metric)) {
      return productIntelligenceFailure(
        'invalid-input',
        'product-metric content requires a non-blank metric name',
      );
    }
    if (typeof content.value !== 'number' || !Number.isFinite(content.value)) {
      // W9-B D5: no NaN/Infinity can ever enter a stored record, whatever
      // produced the value upstream.
      return productIntelligenceFailure(
        'non-finite-metric-value',
        `product-metric "${String(content.metric)}" carries a non-finite value (${String(content.value)}) — never recorded`,
      );
    }
    if (!isNonBlankString(content.unit)) {
      return productIntelligenceFailure(
        'invalid-input',
        'product-metric content requires a non-blank unit',
      );
    }
    if (content.window !== undefined && content.window !== null && !isNonBlankString(content.window)) {
      return productIntelligenceFailure(
        'invalid-input',
        'product-metric content window must be a non-blank string or null',
      );
    }
    const fault = evidenceFault();
    if (fault !== null) {
      return fault;
    }
  } else {
    if (!isNonBlankString(content.narrative)) {
      return productIntelligenceFailure(
        'invalid-input',
        'product-observation content requires a non-blank narrative',
      );
    }
    const fault = evidenceFault();
    if (fault !== null) {
      return fault;
    }
  }

  // ---- 3. the explicit source attribution ----
  const source = input.source;
  if (!isPlainObject(source) || !isNonBlankString(source.sourceKind)) {
    return productIntelligenceFailure(
      'invalid-input',
      'input.source must carry a non-blank sourceKind',
    );
  }
  if (!PRODUCT_INTELLIGENCE_SOURCE_KINDS.includes(source.sourceKind as never)) {
    return productIntelligenceFailure(
      'invalid-input',
      `source.sourceKind "${String(source.sourceKind)}" is not in the frozen source vocabulary`,
    );
  }
  if (!isNonBlankStringArray(source.sourceRefs)) {
    return productIntelligenceFailure(
      'invalid-input',
      'source.sourceRefs must be a non-empty array of non-blank strings — intelligence without explicit source attribution is unverifiable',
    );
  }

  // ---- 4. the basis literal re-validation (runtime double-cast guard) ----
  const basis = input.basis;
  if (!isPlainObject(basis) || !isNonBlankString(basis.basis)) {
    return productIntelligenceFailure(
      'invalid-input',
      'input.basis must carry a non-blank basis',
    );
  }
  if (basis.basis === 'cited-external-evidence') {
    if (basis.counterfactual !== false) {
      return productIntelligenceFailure(
        'invalid-input',
        'a cited-external-evidence basis must carry counterfactual === false — the runtime double-cast guard over the compile-time literal pin',
      );
    }
    if (!isNonBlankString(basis.observedAt)) {
      return productIntelligenceFailure(
        'invalid-input',
        'a cited-external-evidence basis requires a non-blank observedAt timestamp',
      );
    }
  } else if (basis.basis === 'counterfactual-forecast') {
    if (basis.counterfactual !== true) {
      return productIntelligenceFailure(
        'invalid-input',
        'a counterfactual-forecast basis must carry counterfactual === true — §25 requires forecasts to be explicitly counterfactual-labeled',
      );
    }
    if (!isNonBlankString(basis.methodNote)) {
      return productIntelligenceFailure(
        'invalid-input',
        'a counterfactual-forecast basis requires a non-blank methodNote naming the method (no invented precision)',
      );
    }
  } else {
    return productIntelligenceFailure(
      'invalid-input',
      `input.basis "${String(basis.basis)}" is not a declared basis`,
    );
  }

  // ---- 5. source/basis coherence (§25) ----
  if (source.sourceKind === 'forecast-model' && basis.basis !== 'counterfactual-forecast') {
    return productIntelligenceFailure(
      'invalid-input',
      'a forecast-model source cannot produce cited-external-evidence basis — forecasts are counterfactual by construction (§25)',
    );
  }
  if (source.sourceKind === 'external-commerce-system' && basis.basis !== 'cited-external-evidence') {
    return productIntelligenceFailure(
      'invalid-input',
      'an external-commerce-system source reports OBSERVED commerce data (cited-external-evidence basis) — it is never a forecast authority (§25: commerce truth is external and observed, not projected here)',
    );
  }

  // ---- 6. commerce citations ----
  const citations = input.citedCommerceObservations ?? [];
  if (!Array.isArray(citations)) {
    return productIntelligenceFailure(
      'invalid-input',
      'citedCommerceObservations must be an array of commerce observation citations',
    );
  }
  for (const citation of citations) {
    if (
      !isPlainObject(citation) ||
      !isNonBlankString(citation.observationRef) ||
      !isNonBlankString(citation.observedAspect) ||
      !isNonBlankString(citation.sourceSystem) ||
      !isNonBlankString(citation.observedAt)
    ) {
      return productIntelligenceFailure(
        'invalid-input',
        'every cited commerce observation requires non-blank observationRef, observedAspect, sourceSystem and observedAt — citations without provenance are not citations',
      );
    }
  }
  if (source.sourceKind === 'external-commerce-system' && citations.length === 0) {
    return productIntelligenceFailure(
      'commerce-citation-required',
      'a record sourced from an external-commerce-system must cite at least one commerce observation with provenance — §25: external commerce data enters ONLY as a citation, never as bare unattributed values',
    );
  }

  // ---- 7. the remaining fields ----
  if (!isNonBlankString(input.rightsRef)) {
    return productIntelligenceFailure(
      'invalid-input',
      'input.rightsRef must be a non-blank rights ref (the analysis is recorded under an explicit grant)',
    );
  }
  if (!isNullOrNonBlankString(input.attribution)) {
    return productIntelligenceFailure(
      'invalid-input',
      'input.attribution must be null or a non-blank string',
    );
  }
  if (!isNullOrNonBlankString(input.note)) {
    return productIntelligenceFailure('invalid-input', 'input.note must be null or a non-blank string');
  }
  return null;
};
