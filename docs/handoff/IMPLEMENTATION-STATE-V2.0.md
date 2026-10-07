# MOS v2.0 Implementation State

Repository: payswapdotorg/MOS-2.0
Architecture: 2.0 FROZEN
Status: Phase 2 core+engines COMPLETE (ENG-001..005); Phase 3 Lab at LAB-001..009; Phase 4 Studio at STUDIO-001..007 + 010/011; durable jobs + mos-web presentation shell + UX-001 delivered. 629 tests green across 13 MOS packages + substrate @ Wave 4 TL acceptance.

## Verified substrate baseline

- ZCode-derived main commit observed: 29628c9acdb81b703bbd4080c207a0e7ce5e276e
- ZCode version: 3.14.3
- Existing root architecture-policy.yaml is ZCode's legacy managed-module policy and is not MOS v2.0 topology authority.
- New MOS topology authority is spec/mos-architecture-policy-v2.0.yaml and the paired module registry.

## MOS v2.0

☑ BOOT-001 (TL-verified 2026-10-07: substrate inventory committed at cac7987 — verified fork baseline 29628c9 / ZCode 3.14.3; all nine inventory source paths confirmed present in fork; keep/adapt/legacy classification with substrate firewall rules; no MOS business authority assigned to ZCode service code. Residual note: packages/{formal-proof,model-option-map,provider,provider-node,zcode-cua,zcode-server-cli} are not individually enumerated — classified under existing adapt/contain rows; to be re-verified at BOOT-003 boundary-test time.)
☑ BOOT-002 (TL-verified 2026-10-07: all governance deliverables present and machine-readable in-repo — manifests/spec yaml+json parse clean; module registry + architecture policy + worker contract + acceptance gates + source-of-truth rules all committed at cac7987. Workers were dispatched with repository-only context and required no external/chat context, satisfying the BOOT-002 acceptance criterion.)
☑ BOOT-003 (TL-verified 2026-10-07 @ merge 173a87e: packages/zcode-substrate-adapters with six narrow ports + working object-storage adapter + rpc facade + disclosed AGT-001..003 skeletons; harness/mos-boundary-check.mjs enforces 4 rules — self-test 12/12 fixtures, real-tree scan clean across mos-identity/mos-studio/zcode-substrate-adapters; 30/30 node:test; tsc+oxlint green. Prerequisite: build @zcode/rpc dist once (gitignored) before typechecking the adapters package.)
☑ STUDIO-001 interface spike + UX substrate audit (TL-verified 2026-10-07 @ merge 173a87e: packages/mos-studio types-only spike matching core-contracts-v2.0.yaml required fields; docs/architecture/UX-SUBSTRATE-AUDIT-v1.md with cited file paths; tsc+oxlint green. STUDIO-001 full runtime remains ☐ in Wave 1.)

☑ CORE-001 (TL-verified 2026-10-07 @ merge 0868fa3: packages/mos-contracts — full TypeScript projection of all 25 frozen contracts, 3-layer validation: satisfies-keyof const + compile-time type tests + vendored YAML-derived JSON fixture cross-check; 9/9 tests)
☑ CORE-002 (packages/mos-identity — domain types + repository port + in-memory adapter; 25/25 tests, tenant isolation + append-only revocation verified @ f3e8004; import reconciliation to @mos/contracts tracked in Wave 2 RECONCILE)
☑ CORE-003 (packages/mos-rights — grants/consent/provenance, append-only revocation, URL-never-implies-rights test-pinned; 29/29 tests)
☑ CORE-004 (packages/mos-content — immutable versioned artifacts + lineage graph + rights gate + in-package storage port; 22/22 tests)
☑ CORE-005 (packages/mos-missions — structured objectives + versioned mission-specific reward specs + lifecycle; 8/8 tests)
☑ AGT-001 (packages/mos-agents — AgentBody 14-field frozen-contract-pinned registry, immutable versions, capability ref validation)
☑ AGT-002 (packages/mos-agent-runtime — AgentInstance lifecycle + ModelRuntimePort as THE single model boundary; no-second-router structurally pinned by six tests; InstanceExecutorPort over substrate AgentRuntimePort with disclosed double; real ZCode binding = future)
☑ AGT-003 (packages/mos-agents — AgentOrganization versioned immutable registry, typed delegation edges, budget/memory/termination policies, 19 named validation rejections)
☑ CAP-001 (packages/mos-capabilities — registry port + in-memory adapter, version history preserved, fail-closed unknowns, §5 seed fixtures; 8/8 tests)
☑ ENG-001 (packages/mos-engines — fail-closed 9-item activation evidence gate, deterministic policy tie-break with one-dimension tests, tenant overrides, silent-replacement forbidden, historical resolvability + rollback)
☑ ENG-002 (EngineAdapter invoke contract EngineJob→EngineResult + disclosed test double)
☑ ENG-003 (TL-verified @ Wave 3 merge: EngineRunnerPort sandbox — resource quotas with 3 typed-failure tiers, wall-clock timeout with partial metrics, network denied-by-default fail-closed (manifest×grant conjunction, host-scoped seam + ambient-fetch guard), NO credential surface on the adapter context (compile-time + runtime pins), scoped-artifacts-only filesystem via job-scoped artifact store, seed policy per manifest, queued→running→succeeded|failed|timed_out lifecycle + §30 observability records via JobEventSinkPort durable-job seam; EngineAdapter.invoke now carries the sandbox context)
☑ ENG-004 (TL-verified @ Wave 3 merge: versioned immutable BenchmarkCorpus records (artifact refs + metadata only); BenchmarkRunnerPort runs every corpus case as a REAL EngineJob through the ENG-003 sandbox; frozen canonical EngineBenchmark records; goldenCorpusEvidenceFromBenchmark wiring into the ENG-001 activation gate (incomplete/failed records rejected by name); determinism pinned)
☑ ENG-005 (TL-verified @ Wave 3 merge: replacement/rollback proof as repeatable integration tests — domain-style caller written once asks for the CAPABILITY; candidate cannot activate before passing the golden corpus (pinned); silent swap refused; explicit a→b record; same caller code runs on B; historical runs retain engine A identity + model identity and re-execute bit-for-bit through retired A; rollback cross-id fail-closed + by-version; 93/93 mos-engines tests)

☑ LAB-001 (corpus runtime: rights-gated ingestion, append-only CorpusVersion snapshots, tenant-scoped queries; 29 tests in mos-lab)
☑ LAB-002 (FeatureBundle registry + FeatureComputationPort requirement declaration)
☑ LAB-003 (Idea Graph: derivation-mandatory nodes, typed weighted versioned edges, chain tracing)
☑ LAB-004 (TL-verified @ Wave 3 merge: SocialWorldModelStore append-only versioned chains + SimulatorEnginePort deterministic seed-REQUIRED → counterfactual-labeled SocialSimulationResult with §22 UncertaintySummary + per-metric envelopes; synthetic-response-function disclosure on every result; in-memory adapter disclosed deterministic double)
☑ LAB-005 (TL-verified @ Wave 3 merge: DynamicsModelStore versioned tenant-scoped population records + DynamicsStepPort — monotone fatigue, audience growth/decay, competitive displacement, signed novelty; no-op first-class)
☑ LAB-006 (TL-verified @ Wave 3 merge: TimeMachinePort with the three §20 modes — historical replay ≤ T; delayed-information replay ≤ T−L with adversarial leakage-prevention pins (1ms boundary probe, shuffled append order); counterfactual branching with machine-assigned ids, auditable lineage, runtime counterfactual re-validation; append-only immutable deep-frozen history; HistoricalObservation vs SimulationPrediction type+label separation per lock rules 29/30 with compile-time pins; cross-tenant branch-record bleed defect found+fixed (keyed per tenant+branch, adversarial test); 66/66 mos-lab tests)
☑ LAB-007 (TL-verified @ Wave 4 merge: EnsemblePort — versioned tenant-scoped append-only ensembles, empty/single structurally rejected, explicit versioned weighting with NO silent defaults, aggregate interval forced to cover member spread; full computable §22 set: expected value, interval, per-metric disagreement, OOD-vs-declared-coverage flag, multi-seed robustness, calibration placeholder provenance-declared to LAB-018; outputs counterfactual-labeled)
☑ LAB-008 (TL-verified @ Wave 4 merge: OffPolicyEvaluationPort — candidate + ensemble + Time Machine mode-2 history (≤ T−L lag spy-pinned) + versioned mission-compatible reward spec → estimated reward + documented finite-sample interval (ope-hoeffding-additive-v1) + §24 simulated-estimate disclosure; insufficient-history explicit verdict; reward version-mismatch fail-closed; mixed-spec defect found+fixed in member-level reward computation)
☑ LAB-009 (TL-verified @ Wave 4 merge: StrategyLearningPort — simulation-experience-only, declared stopping policy (budget floor/plateau window/iteration cap), full learning trace with cost dimensions, counterfactual-labeled candidates with complete version provenance, seed-required bit-identical determinism pinned incl. fresh stacks)
☐ LAB-010..018 (next waves — LAB-010/011 ready)

☑ STUDIO-001 (runtime: session lifecycle, multi-account consent gates, treatment version chains, no-publish asserted 4 ways; 32/32 tests incl. 002+005)
☑ STUDIO-002 (pluggable format framework + three initial format descriptors; reaction exposes §16 org decision points, no hard-coded layout)
☑ STUDIO-005 (capture ports + disclosed in-memory double)
☑ STUDIO-003 (intent → versioned script/question graphs with §14 synthetic provenance + deterministic adaptive sequencer + InterviewerAgentPort)
☑ STUDIO-004 (TL-verified @ Wave 3 merge: InterviewerAgentBindingPort — interviewer is a REAL AgentInstance (body registered in @mos/agents) bound through the single model boundary (bind(scope, instanceId), 2 args, no preference) and EXECUTED via the REAL InstanceExecutorPort with audit traces; adaptive loop over declared branch graphs; §14 provenance labels end-to-end; mid-session representation switching preserves session+provenance; studio no-model-selection pinned 4 ways)
☑ STUDIO-006 (REAL @mos/identity + @mos/rights bindings behind studio ports; §15 multi-account, live consent re-resolution, credentials never merged)
☑ STUDIO-007 (versioned organization loader over frozen AgentOrganization descriptors, compatibility verdicts, no silent substitution)
☑ STUDIO-010 (TL-verified @ Wave 3 merge: podcast format plugins v2 registered in FormatRegistry with full StudioFormat facets + §16-style organization edit decision points (podcast-edit-points, podcast-edit-pacing, participant-framing — no concrete choices encoded, pinned))
☑ STUDIO-011 (TL-verified @ Wave 3 merge: audio-podcast end-to-end — createSession → loadOrganization → join through REAL §15 authorities → adaptive interview with one capture round per Q/A → transcripts via ArtifactFactoryPort → conversation graph (Q/A nodes w/ provenance + agent traces) → edit graph (org decisions recorded, undeclared points rejected) → packaged StudioArtifactPackage with REAL graph refs; one-person synthetic-labeled + multi-account consent gates + treatment → new immutable version; 70/70 mos-studio tests)
☐ STUDIO-008..014 (008 gated on LAB-013 → LAB-012 → LAB-010/011; wave 5 targets LAB-010/011)

☑ WEB-001 (TL-verified @ Wave 4 merge: packages/mos-web — Vite React shell per BROWSER-SHELL-REPLACEMENT-PLAN (pre-paint theme seed, error boundary, bootstrap-error screen, /ws+/api dev proxy), zero @zcode/* imports, presentation-only authority (src imports @mos/contracts types + own view ports only; domain imports only in testing/composition seam outside src/); vite build + serve HTTP 200 verified at harvest; 126 mos-web tests incl. structural presentation-only pins + headless-browser evidence)
☑ UX-001 (TL-verified @ Wave 4 merge: MOS Home narrates the §2 complete loop (10 stages + 4 cooperating loops); Missions list/detail via MissionCatalogPort view port (lifecycle states, reward-spec versions, tenant context); create-mission INTENT through the port only — composition double records it; responsive, accessible, keyboard navigable; honest ReceiptUnavailablePanel for unresolvable receipts)
☐ UX-002..006 (gated: UX-002 on STUDIO-014, UX-003 on LAB-017, UX-004 on PROD-001)

☐ BRIDGE-001..003
☐ PROD-001..004

☑ JOBS-001 (TL-verified @ Wave 4 merge: packages/mos-jobs — DurableJobRecord per §26/§30/§31 (six §26 kinds, artifact-ref inputs, lifecycle queued→running→succeeded|failed|cancelled|timed_out→dead_lettered, injectable clocks); JobQueuePort 10 methods — idempotent enqueue by client job key, FIFO leased claims (two claimers one wins), heartbeat renew, typed complete/fail/cancel, retries FROM typed failures with declared backoff, dead-letter with full append-only history, no existence leaks; JobEventSinkPort bridge with §30 actor enrichment; no scheduling authority (claimNextRunnable only; poller disclosed double); zero-drift compat pin vs real @mos/engines incl. real-runner runtime round-trip; ENG-003 defect fixed: adapter-resolved typed failures no longer complete as succeeded — 52+2 mos-jobs tests)

## Source-of-truth rule

This file records implementation evidence. It does not define architecture or dependencies.

A green Work Item requires:
source + tests + runtime + browser/deployment evidence as applicable.

No chat transcript, worker report or screenshot can override a repository contradiction.

## Reconciliation debt
- RESOLVED 2026-10-07 (Wave 2): all packages import canonical @mos/contracts types; remaining local types are documented package-specific extensions.
