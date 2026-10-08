import type {
  CalibrationErrorFunctional,
  RecordCalibrationErrorInput,
} from '../contracts/online-calibration.js';
import { CALIBRATION_ERROR_FUNCTIONAL_V1 } from '../contracts/online-calibration.js';
import type {
  DeriveCalibrationContextInput,
  OnlineCalibrationError,
} from '../contracts/online-calibration-port.js';
import type { HistoricalObservation } from '../contracts/evidence.js';
import { validateRewardSpec } from './reward-computation.js';
import { calibrationFailure } from './calibration-support.js';

/**
 * INTERNAL structural validation for the LAB-018 in-memory online
 * calibration adapter. NOT exported from the package index —
 * implementation detail, not surface. Extracted from the adapter in the
 * W10-A recovery audit to respect the managed-file line budget (the
 * W3-A/W5-A/W9-A split precedent).
 *
 * Every check is FAIL-CLOSED with a named typed code; a failed validation
 * appends NO record and NO context. The validation order mirrors the
 * adapter's historical step order so failure codes stay stable.
 */

const isBlank = (value: string): boolean => value.trim().length === 0;

/**
 * Validate one `recordCalibrationError` request structurally: scope /
 * calibrationId / prediction ref (benchmark id, EXACT benchmark version
 * integer >= 1, candidate key) / observationRefs (non-empty, non-blank,
 * DISTINCT — a doubled observation would silently double-weight the
 * observed mean) / reward spec (the shared-mission objective validator) /
 * the DECLARED error functional (must equal the frozen v1) / note.
 */
export const validateCalibrationErrorRequest = (
  input: RecordCalibrationErrorInput,
): OnlineCalibrationError | null => {
  if (input === null || typeof input !== 'object') {
    return calibrationFailure('invalid-input', 'the calibration request must be an object');
  }
  if (input.scope === null || typeof input.scope !== 'object') {
    return calibrationFailure('invalid-input', 'scope must be an object');
  }
  if (typeof input.calibrationId !== 'string' || isBlank(input.calibrationId)) {
    return calibrationFailure('invalid-input', 'calibrationId must be a non-empty string');
  }
  if (input.prediction === null || typeof input.prediction !== 'object') {
    return calibrationFailure('invalid-input', 'prediction must be an object');
  }
  if (
    typeof input.prediction.benchmarkId !== 'string' ||
    isBlank(input.prediction.benchmarkId)
  ) {
    return calibrationFailure(
      'invalid-input',
      'prediction.benchmarkId must be a non-empty string',
    );
  }
  if (
    !Number.isInteger(input.prediction.benchmarkVersion) ||
    input.prediction.benchmarkVersion < 1
  ) {
    return calibrationFailure(
      'invalid-input',
      'prediction.benchmarkVersion must be an integer >= 1 (the EXACT frozen record version)',
    );
  }
  if (
    typeof input.prediction.candidateKey !== 'string' ||
    isBlank(input.prediction.candidateKey)
  ) {
    return calibrationFailure(
      'invalid-input',
      'prediction.candidateKey must be a non-empty string',
    );
  }
  if (!Array.isArray(input.observationRefs) || input.observationRefs.length === 0) {
    return calibrationFailure(
      'invalid-input',
      'observationRefs must be a non-empty array (at least one declared reality observation)',
    );
  }
  const seenRefs = new Set<string>();
  for (const ref of input.observationRefs) {
    if (typeof ref !== 'string' || isBlank(ref)) {
      return calibrationFailure(
        'invalid-input',
        'observationRefs entries must be non-empty strings',
      );
    }
    if (seenRefs.has(ref)) {
      return calibrationFailure(
        'duplicate-observation-ref',
        `observation ref "${ref}" is declared twice — a doubled observation would silently double-weight the observed mean`,
      );
    }
    seenRefs.add(ref);
  }
  const specFault = validateRewardSpec(input.rewardSpec);
  if (specFault !== null) {
    return calibrationFailure('invalid-input', specFault);
  }
  const functionalFault = validateErrorFunctional(input.functional);
  if (functionalFault !== null) {
    return functionalFault;
  }
  if (input.note !== undefined && input.note !== null && typeof input.note !== 'string') {
    return calibrationFailure('invalid-input', 'note must be a string or null');
  }
  return null;
};

/** Validate the DECLARED error functional against the frozen v1 vocabulary. */
const validateErrorFunctional = (
  functional: CalibrationErrorFunctional,
): OnlineCalibrationError | null => {
  if (
    functional === null ||
    typeof functional !== 'object' ||
    functional.id !== CALIBRATION_ERROR_FUNCTIONAL_V1.id ||
    functional.version !== CALIBRATION_ERROR_FUNCTIONAL_V1.version
  ) {
    return calibrationFailure(
      'unsupported-error-functional',
      `the declared error functional must be ${CALIBRATION_ERROR_FUNCTIONAL_V1.id} v${CALIBRATION_ERROR_FUNCTIONAL_V1.version} (got: ${String(functional?.id)} v${String(functional?.version)})`,
    );
  }
  if (
    functional.note === undefined ||
    functional.note === null ||
    typeof functional.note !== 'string' ||
    isBlank(functional.note)
  ) {
    return calibrationFailure(
      'invalid-input',
      'functional.note must be a non-empty rationale string',
    );
  }
  return null;
};

/**
 * Observation CONSISTENCY over the resolved reality observations: every
 * observation must carry a non-blank regime label (mandatory provenance),
 * all must share ONE regime (silently pooling regimes would corrupt the
 * §22 novelty/regime-risk provenance) and ONE niche/platform context (the
 * observed mean must pool one context).
 */
export const checkObservationConsistency = (
  resolved: readonly HistoricalObservation[],
): OnlineCalibrationError | null => {
  const first = resolved[0] as HistoricalObservation;
  const regime0 = first.regime;
  if (regime0 === undefined || regime0 === null || isBlank(regime0)) {
    return calibrationFailure(
      'observation-regime-missing',
      `observation "${first.id}" carries no regime label — the regime the reality check was taken under is mandatory provenance`,
    );
  }
  for (const observation of resolved) {
    if (
      observation.regime === undefined ||
      observation.regime === null ||
      isBlank(observation.regime)
    ) {
      return calibrationFailure(
        'observation-regime-missing',
        `observation "${observation.id}" carries no regime label — every cited observation must declare the regime it was taken under`,
      );
    }
    if (observation.regime !== regime0) {
      return calibrationFailure(
        'observation-regime-mismatch',
        `observations "${first.id}" (regime "${regime0}") and "${observation.id}" (regime "${observation.regime}") mix regimes — silently pooling regimes would corrupt the §22 novelty/regime-risk provenance`,
      );
    }
    if (observation.niche !== first.niche || observation.platform !== first.platform) {
      return calibrationFailure(
        'observation-context-mismatch',
        `observation "${observation.id}" (${observation.niche}/${observation.platform}) does not share the context of "${first.id}" (${first.niche}/${first.platform}) — the observed mean must pool one niche/platform context`,
      );
    }
  }
  return null;
};

/** Validate one `deriveCalibrationContext` request structurally. */
export const validateCalibrationContextRequest = (
  input: DeriveCalibrationContextInput,
): OnlineCalibrationError | null => {
  if (input === null || typeof input !== 'object') {
    return calibrationFailure('invalid-input', 'the context derivation request must be an object');
  }
  if (input.scope === null || typeof input.scope !== 'object') {
    return calibrationFailure('invalid-input', 'scope must be an object');
  }
  if (typeof input.benchmarkId !== 'string' || isBlank(input.benchmarkId)) {
    return calibrationFailure('invalid-input', 'benchmarkId must be a non-empty string');
  }
  return null;
};
