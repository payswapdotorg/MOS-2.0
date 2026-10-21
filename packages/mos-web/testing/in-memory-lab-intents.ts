import type { TenantScope } from '@mos/contracts';
import type {
  IngestReferenceDocumentDeclaration,
  LabIntentActionId,
  LabIntentAuthorityId,
  LabIntentDeclaration,
  LabIntentFailure,
  LabIntentLedgerRecord,
  LabIntentReceipt,
  LabIntentResult,
  LabIntentsPort,
  LearnStrategyDeclaration,
  RecordCalibrationErrorDeclaration,
  RegisterWorldModelDeclaration,
  RunBenchmarkDeclaration,
  SearchOrganizationsDeclaration,
  SimulateStepDeclaration,
  SnapshotCorpusVersionDeclaration,
} from '../dist/src/ports/lab-intents.js';
import { LAB_INTENT_JSON_INVALID_PREFIX } from '../dist/src/ports/lab-intents.js';

/**
 * In-memory lab-intents double (UX-003 wave 3) — the DISCLOSED testing-seam
 * binding of the Lab write-intent transport.
 *
 * What is REAL here: the intent LEDGER (every declaration recorded with its
 * verdict, tenant-scoped reads), the DECLARED-JSON parsing (real JSON.parse
 * with the named `lab-intent-json-invalid:<field>` failure codes and the
 * object-shape check), and the ingest path's RIGHTS-GATED REJECTION — the
 * fixture world registers no rights grants, so acquisition fails closed
 * EXACTLY like the production composition does with its real corpus store
 * (coherent with the corpus read model showing no new documents).
 *
 * What is FIXTURE-SHAPED: the executed receipts of the other seven paths.
 * The testing lab workspace is built over static REAL-shaped fixture
 * records (not live @mos/lab runtimes), so their authorities cannot really
 * execute here; this double returns authority-shaped receipts whose echoes
 * reference the declared ids (the fixture world's world models, ensembles
 * and benchmark chains are the declared-id vocabulary the demo uses). The
 * PRODUCTION composition (packages/mos-desktop/composition/) binds the
 * same port over the REAL runtimes — receipts there name records the
 * authorities actually wrote.
 */

/** The rights-gate verdict the fixture world always produces (no grants registered). */
const FIXTURE_RIGHTS_REJECTION = {
  error: 'rights-not-granted',
  message:
    'acquisition denied: no explicit, active, tenant-matching rights grant is registered for this rights ref — the corpus authority fails closed',
} as const;

interface RecordedIntent {
  readonly intentId: string;
  readonly scope: TenantScope;
  readonly declaredAt: string;
  readonly result: LabIntentResult;
}

export interface InMemoryLabIntentsOptions {
  /** Injectable clock (deterministic tests). */
  readonly now?: () => string;
  /** The single tenant scope this composition serves (the testing seam's disclosure). */
  readonly scope: TenantScope;
}

export interface InMemoryLabIntents extends LabIntentsPort {
  /** Test observability: the recorded ledger in declaration order. */
  readonly recordedIntents: () => readonly LabIntentLedgerRecord[];
}

/** Parses one declared-JSON field (named failure, never a throw). */
function parseDeclaredJson(
  text: string,
  field: string,
): { ok: true; value: unknown } | { ok: false; failure: LabIntentFailure } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      failure: {
        intentId: '',
        action: 'run-benchmark',
        declaredAt: '',
        routedTo: 'lab-benchmark-authority',
        error: `${LAB_INTENT_JSON_INVALID_PREFIX}:${field}`,
        message: `the declared JSON for ${field} could not be parsed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
    };
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return {
      ok: false,
      failure: {
        intentId: '',
        action: 'run-benchmark',
        declaredAt: '',
        routedTo: 'lab-benchmark-authority',
        error: `${LAB_INTENT_JSON_INVALID_PREFIX}:${field}`,
        message: `the declared JSON for ${field} must be an object (parsed ${
          Array.isArray(value) ? 'an array' : String(value)
        })`,
      },
    };
  }
  return { ok: true, value };
}

const AUTHORITY_BY_ACTION: Readonly<Record<LabIntentActionId, LabIntentAuthorityId>> = {
  'ingest-reference-document': 'lab-corpus-authority',
  'snapshot-corpus-version': 'lab-corpus-authority',
  'register-world-model': 'lab-simulator-authority',
  'simulate-step': 'lab-simulator-authority',
  'search-organizations': 'lab-organization-search-authority',
  'learn-strategy': 'lab-strategy-learning-authority',
  'run-benchmark': 'lab-benchmark-authority',
  'record-calibration-error': 'lab-calibration-authority',
};

/** Builds the executed receipt (the fixture authority echo). */
function receiptOf(
  intentId: string,
  declaration: LabIntentDeclaration,
  declaredAt: string,
  recordId: string,
  recordVersion: number,
  summary: string,
): LabIntentReceipt {
  return {
    intentId,
    action: declaration.action,
    declaredAt,
    routedTo: AUTHORITY_BY_ACTION[declaration.action],
    authorityEcho: { recordId, recordVersion, summary },
  };
}

/** Computes the fixture verdict for one declaration (parse + per-action echo). */
function fixtureVerdictOf(
  declaration: LabIntentDeclaration,
  nextIntentId: () => string,
  now: () => string,
): LabIntentResult {
  const intentId = nextIntentId();
  const declaredAt = now();
  switch (declaration.action) {
    case 'ingest-reference-document': {
      // The rights gate is REAL in both bindings: the fixture world
      // registers no grants, so the corpus authority DENIES — the verdict
      // production would produce for the same declaration.
      return {
        intentId,
        action: declaration.action,
        declaredAt,
        routedTo: 'lab-corpus-authority',
        ...FIXTURE_RIGHTS_REJECTION,
      };
    }
    case 'snapshot-corpus-version': {
      const refs = declaration.documentRefsText
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
      return receiptOf(
        intentId,
        declaration,
        declaredAt,
        `corpus-version-${intentId}`,
        refs.length + 1,
        `snapshot recorded with ${refs.length} document ref${refs.length === 1 ? '' : 's'} in the membership set`,
      );
    }
    case 'register-world-model': {
      const state = parseDeclaredJson(declaration.stateJson, 'stateJson');
      if (!state.ok) {
        return { ...state.failure, intentId, action: declaration.action, declaredAt };
      }
      return receiptOf(
        intentId,
        declaration,
        declaredAt,
        declaration.worldModelId,
        1,
        `world model registered for ${declaration.niche}/${declaration.platform} with the declared state`,
      );
    }
    case 'simulate-step': {
      const scenario = parseDeclaredJson(declaration.scenarioJson, 'scenarioJson');
      if (!scenario.ok) {
        return { ...scenario.failure, intentId, action: declaration.action, declaredAt };
      }
      const candidate = parseDeclaredJson(declaration.candidateJson, 'candidateJson');
      if (!candidate.ok) {
        return { ...candidate.failure, intentId, action: declaration.action, declaredAt };
      }
      return receiptOf(
        intentId,
        declaration,
        declaredAt,
        declaration.worldModelId,
        declaration.worldModelVersion,
        `counterfactual-labeled step ${declaration.step} simulated with seed ${declaration.seed} — the run is recorded as counterfactual evidence, never measured`,
      );
    }
    case 'search-organizations': {
      const scenario = parseDeclaredJson(declaration.scenarioJson, 'scenarioJson');
      if (!scenario.ok) {
        return { ...scenario.failure, intentId, action: declaration.action, declaredAt };
      }
      const rewardSpec = parseDeclaredJson(declaration.rewardSpecJson, 'rewardSpecJson');
      if (!rewardSpec.ok) {
        return { ...rewardSpec.failure, intentId, action: declaration.action, declaredAt };
      }
      const candidates = parseDeclaredJson(declaration.candidatesJson, 'candidatesJson');
      if (!candidates.ok) {
        return { ...candidates.failure, intentId, action: declaration.action, declaredAt };
      }
      const policy = parseDeclaredJson(declaration.policyJson, 'policyJson');
      if (!policy.ok) {
        return { ...policy.failure, intentId, action: declaration.action, declaredAt };
      }
      return receiptOf(
        intentId,
        declaration,
        declaredAt,
        declaration.ensembleId,
        declaration.ensembleVersion,
        `organization search evaluated over the declared candidate set with seed ${declaration.seed}`,
      );
    }
    case 'learn-strategy': {
      const scenario = parseDeclaredJson(declaration.scenarioJson, 'scenarioJson');
      if (!scenario.ok) {
        return { ...scenario.failure, intentId, action: declaration.action, declaredAt };
      }
      const rewardSpec = parseDeclaredJson(declaration.rewardSpecJson, 'rewardSpecJson');
      if (!rewardSpec.ok) {
        return { ...rewardSpec.failure, intentId, action: declaration.action, declaredAt };
      }
      const initialProgram = parseDeclaredJson(declaration.initialProgramJson, 'initialProgramJson');
      if (!initialProgram.ok) {
        return { ...initialProgram.failure, intentId, action: declaration.action, declaredAt };
      }
      const stoppingPolicy = parseDeclaredJson(declaration.stoppingPolicyJson, 'stoppingPolicyJson');
      if (!stoppingPolicy.ok) {
        return { ...stoppingPolicy.failure, intentId, action: declaration.action, declaredAt };
      }
      return receiptOf(
        intentId,
        declaration,
        declaredAt,
        declaration.ensembleId,
        declaration.ensembleVersion,
        `strategy learning ran from the declared initial program with seed ${declaration.seed}`,
      );
    }
    case 'run-benchmark': {
      const scenario = parseDeclaredJson(declaration.scenarioJson, 'scenarioJson');
      if (!scenario.ok) {
        return { ...scenario.failure, intentId, action: declaration.action, declaredAt };
      }
      const candidates = parseDeclaredJson(declaration.candidatesJson, 'candidatesJson');
      if (!candidates.ok) {
        return { ...candidates.failure, intentId, action: declaration.action, declaredAt };
      }
      const rewardSpec = parseDeclaredJson(declaration.rewardSpecJson, 'rewardSpecJson');
      if (!rewardSpec.ok) {
        return { ...rewardSpec.failure, intentId, action: declaration.action, declaredAt };
      }
      const policy = parseDeclaredJson(declaration.policyJson, 'policyJson');
      if (!policy.ok) {
        return { ...policy.failure, intentId, action: declaration.action, declaredAt };
      }
      return receiptOf(
        intentId,
        declaration,
        declaredAt,
        declaration.benchmarkId,
        1,
        `robust benchmark executed over the declared seeds — the no-op baseline is part of the run`,
      );
    }
    case 'record-calibration-error': {
      const prediction = parseDeclaredJson(declaration.predictionJson, 'predictionJson');
      if (!prediction.ok) {
        return { ...prediction.failure, intentId, action: declaration.action, declaredAt };
      }
      const observationRefs = parseDeclaredJson(declaration.observationRefsJson, 'observationRefsJson');
      if (!observationRefs.ok) {
        return { ...observationRefs.failure, intentId, action: declaration.action, declaredAt };
      }
      const rewardSpec = parseDeclaredJson(declaration.rewardSpecJson, 'rewardSpecJson');
      if (!rewardSpec.ok) {
        return { ...rewardSpec.failure, intentId, action: declaration.action, declaredAt };
      }
      const functional = parseDeclaredJson(declaration.functionalJson, 'functionalJson');
      if (!functional.ok) {
        return { ...functional.failure, intentId, action: declaration.action, declaredAt };
      }
      return receiptOf(
        intentId,
        declaration,
        declaredAt,
        declaration.calibrationId,
        1,
        `calibration error recorded against the declared prediction with ${
          (observationRefs.value as readonly unknown[] | null)?.length ?? '?'
        } observation refs`,
      );
    }
  }
}

/** Creates the in-memory lab-intents double. */
export function createInMemoryLabIntents(
  options: InMemoryLabIntentsOptions,
): InMemoryLabIntents {
  const now = options.now ?? (() => new Date().toISOString());
  const scope = options.scope;
  const ledger = new Map<string, RecordedIntent>();
  let sequence = 0;
  const nextIntentId = (): string => {
    sequence += 1;
    return `lab-intent-${String(sequence).padStart(4, '0')}`;
  };

  const record = (declaration: LabIntentDeclaration): LabIntentResult => {
    const result = fixtureVerdictOf(declaration, nextIntentId, now);
    ledger.set(result.intentId, {
      intentId: result.intentId,
      scope,
      declaredAt: result.declaredAt,
      result,
    });
    return result;
  };

  const port: LabIntentsPort = {
    async declareIngestReferenceDocument(
      declaration: IngestReferenceDocumentDeclaration,
    ): Promise<LabIntentResult> {
      return record(declaration);
    },
    async declareSnapshotCorpusVersion(
      declaration: SnapshotCorpusVersionDeclaration,
    ): Promise<LabIntentResult> {
      return record(declaration);
    },
    async declareRegisterWorldModel(
      declaration: RegisterWorldModelDeclaration,
    ): Promise<LabIntentResult> {
      return record(declaration);
    },
    async declareSimulateStep(declaration: SimulateStepDeclaration): Promise<LabIntentResult> {
      return record(declaration);
    },
    async declareSearchOrganizations(
      declaration: SearchOrganizationsDeclaration,
    ): Promise<LabIntentResult> {
      return record(declaration);
    },
    async declareLearnStrategy(declaration: LearnStrategyDeclaration): Promise<LabIntentResult> {
      return record(declaration);
    },
    async declareRunBenchmark(declaration: RunBenchmarkDeclaration): Promise<LabIntentResult> {
      return record(declaration);
    },
    async declareRecordCalibrationError(
      declaration: RecordCalibrationErrorDeclaration,
    ): Promise<LabIntentResult> {
      return record(declaration);
    },
    async loadLabIntentLedgerRecord(
      intentId: string,
      scope: TenantScope,
    ): Promise<LabIntentLedgerRecord | null> {
      const recorded = ledger.get(intentId);
      if (recorded === undefined || recorded.scope.tenantId !== scope.tenantId) {
        // Cross-tenant ids resolve to null — never a leak (spec §31).
        return null;
      }
      return {
        intentId: recorded.intentId,
        action: recorded.result.action,
        declaredAt: recorded.declaredAt,
        routedTo: recorded.result.routedTo,
        outcome: recorded.result,
      };
    },
  };

  return {
    ...port,
    recordedIntents: () =>
      [...ledger.values()]
        .sort((a, b) => (a.declaredAt < b.declaredAt ? -1 : a.declaredAt === b.declaredAt ? 0 : 1))
        .map((recorded) => ({
          intentId: recorded.intentId,
          action: recorded.result.action,
          declaredAt: recorded.declaredAt,
          routedTo: recorded.result.routedTo,
          outcome: recorded.result,
        })),
  };
}
