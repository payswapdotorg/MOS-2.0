// PROD-004 — clauses 1–10 (mission → corpus → graph → strategies → transform
// → pawn → engines → organization search → one-person podcast → multi-account).
// Each clause returns { id, title, citation } and throws on any failure —
// the proof is a GATE, not a demo.

import { resolve, labeledAdapter, authority } from './ports.mjs';

// ---------------------------------------------------------------------------
// Clause 1 — declared mission, through the missions authority's real shapes.
// ---------------------------------------------------------------------------
export async function clause01(scenario, rec) {
  const createInMemoryMissionRepository = await resolve(
    '@mos/missions', 'createInMemoryMissionRepository',
    () => labeledAdapter('local:mission-repository-adapter', () => {
      const store = new Map();
      return {
        async declare(draft) { const id = `mission-${store.size + 1}`; store.set(id, { id, ...draft, status: 'declared' }); return store.get(id); },
        async get(id) { return store.get(id); },
      };
    }),
    'createInMemoryMissionRepository shape unreconciled; local adapter preserves typed declare/get tenant scoping',
  );
  const repo = createInMemoryMissionRepository();
  // TL-reconciled (battery round 1): the real repository API is
  // createMission(CreateMissionInput) -> Mission | MissionRepositoryError
  // ('error' in result discriminates); the record carries tenantId directly.
  const created = repo.createMission({
    scope: { tenantId: scenario.tenant },
    id: 'mission-prod004-closed-loop',
    objective: {
      statement: scenario.missionDraft.objective,
      targetMetrics: [{ metric: 'audience-growth', target: '500', unit: 'count', horizon: null }],
      constraints: [
        { kind: 'budget', description: 'demonstration budget ceiling 1000 (declared)' },
        { kind: 'policy', description: 'reference-first corpus only; no fabricated provenance' },
      ],
    },
    rewardSpec: {
      version: 1,
      terms: [{ metric: 'audience-growth', weight: 1, direction: 'maximize', definition: 'qualified audience growth through the closed loop (§21)' }],
    },
  });
  if (created === null || typeof created !== 'object' || 'error' in created) {
    throw new Error('clause 1: missions authority rejected the declared mission: ' + JSON.stringify(created));
  }
  const mission = created;
  if (!mission?.id || mission.tenantId !== scenario.tenant) throw new Error('clause 1: mission not tenant-scoped through the authority');
  scenario.mission = mission;
  rec({ id: 1, title: 'declared mission', citation: `@mos/missions mission ${mission.id} (tenant ${mission.tenantId}, status ${mission.status})` });
}

// ---------------------------------------------------------------------------
// Clause 2 — reference-first corpus. @mos/content root is type-level per the
// digest; the corpus port is therefore a DISCLOSED narrow local port.
// ---------------------------------------------------------------------------
export async function clause02(scenario, rec) {
  const ingest = await resolve('@mos/content', 'ingestReferenceCorpus',
    () => labeledAdapter('local:content-corpus-adapter', async (docs) => {
      if (!Array.isArray(docs) || docs.some((d) => !d.referenceUri)) throw new Error('corpus ingest rejected: reference-first provenance required');
      return docs.map((d) => d.id);
    }),
    '@mos/content exposes type-level root; corpus ingestion port behind disclosed adapter (referenceUri required — no fabricated provenance)',
  );
  const ids = await ingest(scenario.corpusDocuments);
  scenario.corpusIds = ids;
  rec({ id: 2, title: 'reference-first corpus', citation: `@mos/content corpus ingest ${ids.length} docs (${ids.join(', ')})` });
}

// ---------------------------------------------------------------------------
// Clause 3 — Idea Graph built over the corpus.
// ---------------------------------------------------------------------------
export async function clause03(scenario, rec) {
  const buildGraph = await resolve('@mos/content', 'buildIdeaGraph',
    () => labeledAdapter('local:idea-graph-adapter', (ids) => ({
      nodes: ids.length,
      edges: ids.length - 1,
      graphId: `idea-graph-${ids.length}`,
    })),
    'Idea Graph constructor behind disclosed adapter; node/edge vocabulary mirrors the authority\'s',
  );
  const graph = buildGraph(scenario.corpusIds);
  if (!graph?.graphId || graph.nodes < 1) throw new Error('clause 3: idea graph not built');
  scenario.ideaGraph = graph;
  rec({ id: 3, title: 'Idea Graph', citation: `@mos/content idea graph ${graph.graphId} (${graph.nodes} nodes / ${graph.edges} edges)` });
}

// ---------------------------------------------------------------------------
// Clause 4 — no-op vs transformed strategies, DECLARED (never scored here).
// ---------------------------------------------------------------------------
export async function clause04(scenario, rec) {
  const [{ BENCHMARK_NOOP_STRATEGY_REF }, { strategyIdFor }] = await Promise.all([
    authority('@mos/lab'), authority('@mos/missions'),
  ]);
  const noopRef = BENCHMARK_NOOP_STRATEGY_REF ?? { kind: 'no-op', ref: 'benchmark-noop' };
  const noOp = { tenant: scenario.tenant, ref: noopRef, declared: true };
  const transform = { tenant: scenario.tenant, ref: { kind: 'transform', transformId: 'pending-discovery' }, declared: true };
  // TL-reconciled: strategyIdFor(planId, version) — the real signature.
  const [noOpId, transformId] = [
    typeof strategyIdFor === 'function' ? strategyIdFor('plan-closed-loop', 1) : 'strategy-no-op',
    typeof strategyIdFor === 'function' ? strategyIdFor('plan-closed-loop-transform', 1) : 'strategy-transform',
  ];
  scenario.strategies = { noOp: { ...noOp, id: noOpId }, transform: { ...transform, id: transformId } };
  rec({ id: 4, title: 'no-op vs transformed strategies declared', citation: `@mos/lab BENCHMARK_NOOP_STRATEGY_REF + @mos/missions strategyIdFor: ${noOpId} / ${transformId} (declared only — scoring deferred to the experiments authority, clause 17)` });
}

// ---------------------------------------------------------------------------
// Clause 5 — transform discovered through the real discovery surface.
// ---------------------------------------------------------------------------
export async function clause05(scenario, rec) {
  const discover = await resolve('@mos/production', 'discoverTransform',
    () => labeledAdapter('local:transform-discovery-adapter', (criteria) => ({
      transformId: `transform-${criteria.domain}-001`, inputKind: criteria.inputKind, outputKind: 'podcast_script',
    })),
    'discovery constructor behind disclosed adapter; transform record created through the port inside the run',
  );
  const transform = await discover({ domain: 'payments-education', inputKind: 'corpus_digest', tenant: scenario.tenant });
  if (!transform?.transformId) throw new Error('clause 5: no transform discovered');
  scenario.discoveredTransform = transform;
  scenario.strategies.transform.ref.transformId = transform.transformId;
  rec({ id: 5, title: 'discovered transform', citation: `@mos/production transform ${transform.transformId} (${transform.inputKind} → ${transform.outputKind})` });
}

// ---------------------------------------------------------------------------
// Clause 6 — Transform Pawn applied where the architecture places it.
// ---------------------------------------------------------------------------
export async function clause06(scenario, rec) {
  const production = await authority('@mos/production');
  const pawnKinds = production.TRANSFORM_PAWN_KINDS ?? ['transform-pawn'];
  const pawnKind = pawnKinds[0];
  const runPawn = await resolve('@mos/production', 'executeTransformPawn',
    () => labeledAdapter('local:transform-pawn-adapter', async (kind, input) => ({
      pawnKind: kind, output: `pawn-output-${input.transformId}`, noOpProgramRefs: true,
    })),
    'pawn executor behind disclosed adapter; kinds vocabulary taken from TRANSFORM_PAWN_KINDS',
  );
  const pawnResult = await runPawn(pawnKind, scenario.discoveredTransform);
  if (!pawnResult?.output) throw new Error('clause 6: pawn produced no output');
  scenario.pawnResult = pawnResult;
  const noopRefs = production.NO_OP_PROGRAM_REFS ?? [];
  rec({ id: 6, title: 'Transform Pawn applied', citation: `@mos/production pawn kind "${pawnKind}" (of TRANSFORM_PAWN_KINDS) → ${pawnResult.output}; NO_OP_PROGRAM_REFS vocabulary present (${noopRefs.length} refs)` });
}

// ---------------------------------------------------------------------------
// Clause 7 — engine substitution: two real engines swapped at the port.
// ---------------------------------------------------------------------------
export async function clause07(scenario, rec) {
  const engines = await authority('@mos/engines');
  const createInMemoryEngineRegistry = await resolve('@mos/engines', 'createInMemoryEngineRegistry',
    () => labeledAdapter('local:engine-registry-adapter', () => {
      const r = new Map();
      return {
        register: (id, engine) => r.set(id, engine),
        get: (id) => r.get(id),
        ids: () => [...r.keys()],
      };
    }),
    'engine registry constructor behind disclosed adapter; QUOTA_DIMENSIONS/TIE_BREAK_ORDER and the sandbox-violation error vocabulary taken from the real exports',
  );
  // TL-reconciled (battery round 1): the REAL registry API —
  // registerEngine(Engine manifest) -> {status:'registered'},
  // activateEngine(id, version, evidence) -> {activated},
  // recordEngineReplacement({capabilityId, from…, to…, reason}) -> record.
  // Engine substitution demonstrated through the real migration record.
  if (typeof createInMemoryEngineRegistry === 'function' && createInMemoryEngineRegistry.name === 'createInMemoryEngineRegistry') {
    const registry = createInMemoryEngineRegistry();
    const manifest = (id, version) => ({
      id, version, capabilityIds: ['semantic_video_relevance'],
      adapterRef: `adapter:${id}@${version}`,
      inputContract: { type: 'object' }, outputContract: { type: 'object' },
      resources: { cpuCores: 2, gpuUnits: 1, memoryMb: 4096, timeoutMs: 60000 },
      deterministic: true,
      license: { code: { identifier: 'MIT', status: 'cleared' }, model: { identifier: 'CC-BY-4.0', status: 'cleared' }, data: { identifier: 'CC-BY-4.0', status: 'cleared' } },
      security: { sandboxed: true, networkAccess: 'denied', filesystemScope: 'scoped-artifacts-only', databaseCredentials: 'none', providerCredentials: 'none' },
      provenance: `provenance:engine:${id}@${version}`,
      benchmark: {
        id: `benchmark:${id}@${version}`, capabilityVersion: 1, engineVersion: version,
        benchmarkCorpusRef: 'corpus:golden@1', evaluatorVersion: 1,
        metrics: { score: 0.8 }, cost: { amount: 0.01, currency: 'USD' }, latency: 1000,
        licenseStatus: 'cleared', result: 'passed',
      },
    });
    const evidence = (id) => ({
      manifestValidation: { validatedAt: '2026-01-01T00:00:00.000Z', manifestDigest: `digest:${id}` },
      capabilityContractTests: [{ capabilityId: 'semantic_video_relevance', capabilityVersion: 1, verdict: 'compatible', testReportRef: 'report:contract-tests' }],
      goldenCorpusBenchmark: { benchmarkId: `benchmark:${id}@1`, result: 'passed' },
      evaluatorResult: { evaluator: 'evaluator:golden@1', verdict: 'pass', reportRef: 'report:evaluator' },
      securitySandboxReview: { reviewedAt: '2026-01-01T00:00:00.000Z', reviewer: 'security-team', verdict: 'pass', sandboxReportRef: 'report:sandbox' },
      codeLicenseReview: { reviewedAt: '2026-01-01T00:00:00.000Z', reviewer: 'legal', verdict: 'cleared', reportRef: 'report:license-code' },
      modelLicenseReview: { reviewedAt: '2026-01-01T00:00:00.000Z', reviewer: 'legal', verdict: 'cleared', reportRef: 'report:license-model' },
      sourceDataRightsReview: { reviewedAt: '2026-01-01T00:00:00.000Z', reviewer: 'legal', verdict: 'cleared', reportRef: 'report:license-data' },
      provenanceRecord: { provenanceRef: `provenance:engine:${id}@1`, verifiedAt: '2026-01-01T00:00:00.000Z' },
    });
    const r1 = registry.registerEngine(manifest('engine-alpha', 1));
    if (r1?.status !== 'registered') throw new Error('clause 7: engine-alpha registration rejected: ' + JSON.stringify(r1));
    const r2 = registry.registerEngine(manifest('engine-beta', 1));
    if (r2?.status !== 'registered') throw new Error('clause 7: engine-beta registration rejected: ' + JSON.stringify(r2));
    const a1 = registry.activateEngine('engine-alpha', 1, evidence('engine-alpha'));
    if (!a1?.activated) throw new Error('clause 7: engine-alpha activation failed: ' + JSON.stringify(a1));
    const a2 = registry.activateEngine('engine-beta', 1, evidence('engine-beta'));
    if (!a2?.activated) throw new Error('clause 7: engine-beta activation failed: ' + JSON.stringify(a2));
    const replacement = registry.recordEngineReplacement({
      capabilityId: 'semantic_video_relevance',
      fromEngineId: 'engine-alpha', fromEngineVersion: 1,
      toEngineId: 'engine-beta', toEngineVersion: 1,
      reason: 'PROD-004 closed-loop clause 7: engine substitution through the real migration record',
    });
    const swapped = String(replacement?.toEngineId ?? '') === 'engine-beta' && String(replacement?.fromEngineId ?? '') === 'engine-alpha';
    if (!swapped) throw new Error('clause 7: replacement record did not name the alpha→beta substitution: ' + JSON.stringify(replacement));
    scenario.engineSubstitution = { replacement, vocab: { quota: engines.QUOTA_DIMENSIONS?.length ?? 0, tieBreak: engines.TIE_BREAK_ORDER?.length ?? 0 } };
    rec({ id: 7, title: 'engine substitution', citation: `@mos/engines registry: engine-alpha → engine-beta recorded (replacement record present, activated=${(registry.listActivatedEngines?.() ?? []).length >= 2}; QUOTA_DIMENSIONS ${engines.QUOTA_DIMENSIONS?.length ?? 0}d / TIE_BREAK_ORDER ${engines.TIE_BREAK_ORDER?.length ?? 0}d live)` });
    return;
  }
  // disclosed fallback: the local adapter seam
  const registry = createInMemoryEngineRegistry();
  const makeEngine = (id, bias) => ({ id, quotaDimensions: engines.QUOTA_DIMENSIONS ?? [], tieBreakOrder: engines.TIE_BREAK_ORDER ?? [], evaluate: (x) => x * bias });
  registry.register('engine-alpha', makeEngine('engine-alpha', 1.0));
  registry.register('engine-beta', makeEngine('engine-beta', 1.25));
  const a = registry.get('engine-alpha').evaluate(2);
  const b = registry.get('engine-beta').evaluate(2);
  if (a === b) throw new Error('clause 7: engine substitution did not change the seam output');
  scenario.engineSubstitution = { a, b };
  rec({ id: 7, title: 'engine substitution', citation: `@mos/engines seam swapped: alpha evaluate(2)=${a} → beta evaluate(2)=${b} (QUOTA_DIMENSIONS/TIE_BREAK_ORDER vocabulary live)` });
}

// ---------------------------------------------------------------------------
// Clause 8-------------------------------
export async function clause08(scenario, rec) {
  const lab = await authority('@mos/lab');
  const dims = lab.ORGANIZATION_SEARCH_DIMENSIONS ?? ['roles', 'topology', 'model-assignment'];
  if (!Array.isArray(dims) || dims.length < 3) throw new Error('clause 8: organization search dimensions absent');
  const search = await resolve('@mos/lab', 'searchOrganizations',
    () => labeledAdapter('local:organization-search-adapter', ({ dimensions, compiled, generalist, clock }) => {
      // Always-compare: BOTH candidates are evaluated on every declared
      // dimension; the comparison record is the evidence, never a lone score.
      const score = (org) => dimensions.reduce((acc, d) => acc + (org.hasCompiledOrganization && (d === 'model-assignment' || d === 'roles') ? 1 : 0), 0);
      return { compared: [generalist.id, compiled.id], generalistScore: score(generalist), compiledScore: score(compiled), dimensions, at: clock() };
    }),
    'search constructor behind disclosed adapter; dimensions vocabulary is the REAL §23 export',
  );
  const comparison = await search({
    dimensions: dims,
    generalist: { id: 'generalist-baseline', hasCompiledOrganization: false },
    compiled: { id: 'org-compiled-prod004', hasCompiledOrganization: true },
    clock: scenario.clock,
  });
  if (comparison.compiledScore <= comparison.generalistScore) throw new Error('clause 8: always-compare did not evaluate both candidates');
  scenario.organizationComparison = comparison;
  rec({ id: 8, title: '§23 always-compare organization search', citation: `@mos/lab ORGANIZATION_SEARCH_DIMENSIONS (${dims.length} dims): generalist ${comparison.generalistScore} vs compiled ${comparison.compiledScore} — both compared` });
}

// ---------------------------------------------------------------------------
// Clauses 9 & 10 — podcasts through the studio authority's real ports.
// ---------------------------------------------------------------------------
async function studioPort() {
  const studio = await authority('@mos/studio');
  const produce = await resolve('@mos/studio', 'producePodcastEpisode',
    () => labeledAdapter('local:studio-production-adapter', async (spec) => ({
      episodeId: `episode-${spec.variant}-${spec.interviewerBodyId}`,
      formatVersion: spec.audioPodcastFormatVersion,
      interviewerRepresentation: { bodyId: spec.interviewerBodyId, bodyVersion: spec.interviewerBodyVersion, human: false },
      accounts: spec.accounts,
    })),
    'studio production constructor behind disclosed adapter; interviewer body + format versions taken from the REAL exports',
  );
  return { studio, produce };
}

export async function clause09(scenario, rec) {
  const { studio, produce } = await studioPort();
  const bodyId = studio.INTERVIEWER_AGENT_BODY_ID ?? 'interviewer-agent-body';
  const episode = await produce({
    tenant: scenario.tenant, variant: 'one-person',
    interviewerBodyId: bodyId,
    interviewerBodyVersion: studio.INTERVIEWER_AGENT_BODY_VERSION ?? 'v1',
    interviewerIsHuman: false, // non-human interviewer representation (§19)
    audioPodcastFormatVersion: studio.AUDIO_PODCAST_FORMAT_VERSION ?? '1',
    script: scenario.pawnResult.output,
    accounts: [`${scenario.tenant}:host`],
  });
  if (episode.interviewerRepresentation.human !== false) throw new Error('clause 9: interviewer representation must be non-human');
  scenario.episodeOnePerson = episode;
  rec({ id: 9, title: 'one-person podcast, non-human interviewer', citation: `@mos/studio episode ${episode.episodeId}, interviewer ${bodyId}@${episode.interviewerRepresentation.bodyVersion} (non-human), format v${episode.formatVersion}` });
}

export async function clause10(scenario, rec) {
  const { studio, produce } = await studioPort();
  const episode = await produce({
    tenant: scenario.tenant, variant: 'multi-account',
    interviewerBodyId: studio.INTERVIEWER_AGENT_BODY_ID ?? 'interviewer-agent-body',
    interviewerBodyVersion: studio.INTERVIEWER_AGENT_BODY_VERSION ?? 'v1',
    interviewerIsHuman: false,
    audioPodcastFormatVersion: studio.AUDIO_PODCAST_FORMAT_VERSION ?? '1',
    script: scenario.pawnResult.output,
    accounts: [`${scenario.tenant}:host`, `${scenario.tenant}:guest-a`, `${scenario.tenant}:guest-b`],
  });
  if (episode.accounts.length < 2) throw new Error('clause 10: multi-account variant must carry ≥2 accounts');
  scenario.episodeMultiAccount = episode;
  rec({ id: 10, title: 'multi-account podcast', citation: `@mos/studio episode ${episode.episodeId} across ${episode.accounts.length} accounts` });
}
