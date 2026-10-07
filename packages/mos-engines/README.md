# @mos/engines — MOS v2.0 engine registry + adapter contract + runner sandbox + benchmark + replacement proof (ENG-001..ENG-005)

The engine registry over the `Engine` core contract (`@mos/contracts`) and
spec/mos-engine-policy-v2.0.yaml, the narrow `EngineAdapter` invoke surface
(EngineJob + sandbox context → EngineResult) every engine implementation
sits behind, the policy-faithful engine runner sandbox (ENG-003), the
golden-corpus benchmark stack (ENG-004) wired into the activation gate, and
the engine replacement/rollback proof (ENG-005). Domain modules
(Studio/Lab/production) ask for **capabilities**; this registry **selects
engines** and the runner **executes them sandboxed**. It is a registry,
never a marketplace authority (AGENTS.md: "Engine Registry ≠ Marketplace").

## Surface

| Export | Kind |
| --- | --- |
| `EngineRegistryPort` | registry port (10 methods; policy budget 12) |
| `createInMemoryEngineRegistry` | in-memory registry adapter factory (working, not a skeleton) |
| `EngineAdapter` | ENG-002 adapter port (one method: `invoke(job, context)`) |
| `EngineRunnerPort` / `EngineSandboxContext` / `NetworkPolicy` / `SandboxNetworkPort` / `EngineArtifactStorePort` | ENG-003 runner + sandbox contracts |
| `createInMemoryEngineRunner` | in-memory runner sandbox factory (ENG-003) |
| `JobEventSinkPort` + lifecycle/`EngineRunObservabilityRecord` event types | the durable-job SEAM (§30 observability) |
| `BenchmarkCorpus` / `BenchmarkCorpusRegistryPort` / `BenchmarkRunnerPort` / `BenchmarkEvaluatorPort` | ENG-004 golden-corpus + benchmark contracts |
| `createInMemoryBenchmarkRunner` / `createInMemoryBenchmarkCorpusRegistry` | in-memory benchmark adapters |
| `goldenCorpusEvidenceFromBenchmark` / `benchmarkRecordViolations` / `worstLicenseReviewStatus` | pure ENG-004 → ENG-001 evidence wiring |
| `QUOTA_DIMENSIONS` + sandbox-policy pure functions | the ENG-003 enforcement core |
| `createTestDoubleEngineAdapter` / `createSandboxAwareTestAdapter` / `createInMemoryArtifactStore` / `createInMemoryJobEventSink` / `createDisclosedBenchmarkEvaluator` | **DISCLOSED TEST DOUBLES** |
| `EngineRegistryError` / `EngineSandboxViolationError` / `BenchmarkError` | typed errors with machine-readable `code` + `details` |
| `ACTIVATION_EVIDENCE_KEYS` / `TIE_BREAK_ORDER` + activation/resolution functions | ENG-001 pure domain |

Runtime export count: 23 (9 factories, 3 error classes, 3 frozen
constants, 8 pure domain functions). The 12-public-method policy budget
applies PER PORT — every port here stays ≤ 3 methods (EngineRegistryPort
10, EngineRunnerPort 2, BenchmarkCorpusRegistryPort 3,
BenchmarkEvaluatorPort 1, BenchmarkRunnerPort 1, JobEventSinkPort 1,
EngineArtifactStorePort 2, SandboxNetworkPort 1, EngineAdapter 1).

## Fail-closed activation gate (ENG-001)

An engine version activates ONLY with the complete evidence chain of
spec/mos-engine-policy-v2.0.yaml `activation.required`:

```
manifestValidation, capabilityContractTests, goldenCorpusBenchmark,
evaluatorResult, securitySandboxReview, codeLicenseReview,
modelLicenseReview, sourceDataRightsReview, provenanceRecord
```

Missing items → `activated: false` with `missingEvidence` naming every
missing key (an empty submission is rejected naming all nine). Present but
non-concluding evidence → `failedChecks` naming each failed check
(`evaluatorResult:not-passed`, `codeLicenseReview:not-cleared`,
`capabilityContractTests:missing:<capabilityId>`, …). The manifest itself
is also gated (forbidden-list encoding): unsandboxed execution, injected
provider/database credentials, a blocked license layer, or a benchmark
record that is not `passed` / not for this engine version / not the one
the evidence cites — all reject activation by name. Nothing ever
activates partially or silently.

## Deterministic resolution — EXACTLY the policy order

`resolveCapability(capabilityId, { tenantId?, tenantOverride? })` ranks
activated, contract-compatible, license-compatible engines by

```
contractCompatibility → licenseCompatibility → benchmarkScore →
cost → latency → engineId
```

- `contractCompatibility` comes from the engine's activation-evidence
  contract tests (`compatible` > `degraded`; `incompatible` engines are
  excluded entirely, not ranked last).
- `licenseCompatibility` is the worst of the three §29 layers
  (code / model / data): any blocked layer excludes the engine;
  any review-required layer ranks it `restricted` (below `compatible`,
  above nothing else).
- `benchmarkScore` = `benchmark.metrics.score` (higher wins), `cost` =
  `benchmark.cost.amount` (lower wins), `latency` = `benchmark.latency`
  (lower wins), `engineId` is the final total order (lexicographically
  lower wins; same engine id with several activated versions resolves to
  the HIGHER version — the documented deterministic completion).
- `EngineResolution.candidates` carries the full ranked audit trail and
  `decidedBy` names the dimension that decided the winner.

Tenant overrides pin one engine version for one tenant without touching
the default lane (fail-closed on unregistered/inactive/mismatched
targets).

## Silent replacement forbidden; rollback; historical reproducibility

- A resolution whose winner's engine ID differs from the recorded
  assignment fails closed (`silent-engine-replacement`) naming both
  engines — migration requires `recordEngineReplacement(...)`, after
  which assignments carry `via: "explicit-replacement"`. When the
  recorded assignment's engine is no longer ACTIVE (explicit
  deactivation / rollback by an operator), resolution still refuses a
  silent fallback and fails closed with the dedicated
  `assigned-engine-inactive` code — the remediation is an explicit
  replacement record, a rollback, or re-activation.
- Same-engine version changes are explicit too (`via:
  "engine-version-bump"`); activating a new version deactivates the old
  one (benchmark-before-promotion).
- `rollbackEngineVersion(engineId, toVersion)` re-points the active
  version; the target must carry a previously ACCEPTED evidence chain
  (rollback can never bypass the activation gate).
- Every registered version stays resolvable via `getEngine(id, version)`
  regardless of activation status — historical runs keep their exact
  engine identity (oldEngineMustRemainReproducibleForHistoricalRuns).
- `modelIdentity` is carried per run in `EngineResult.provenance`
  (modelIdentityRecordedPerRun — encoded in @mos/contracts
  `RunProvenance`).

## EngineAdapter contract (ENG-002)

One method — `invoke(job: EngineJob, context: EngineSandboxContext):
Promise<EngineResult>` — aligned field-for-field with the
EngineJob/EngineResult core contracts (job carries capabilityId/version,
engineId/version, inputArtifactRefs, parameters, seed, resourceLimits,
outputContract; result carries outputArtifactRefs, metrics, provenance,
duration, resourceUsage, cost, warnings, and the typed `failure` — `null`
on success, a full `EngineJobFailure` on failure, so failed runs stay
auditable). Adapters carry their exact engine identity; the manifest's
`adapterRef` records the adapter identity; the runner loads and executes
adapters in the sandbox. `createTestDoubleEngineAdapter` is the
**DISCLOSED TEST DOUBLE** for the bare contract;
`createSandboxAwareTestAdapter` is the **DISCLOSED** context-aware double
that genuinely uses the sandbox (resolves inputs, persists outputs,
attempts network, violates quotas, hangs).

## Engine runner sandbox (ENG-003)

`createInMemoryEngineRunner({ registry, artifactStore, eventSink?, clock?,
now?, timers?, fetchImpl? })` → `EngineRunnerPort`
(`registerAdapter(adapter)` + `submit(job, submissionOptions?)`), executing
jobs via registered adapters under every rule of
spec/mos-engine-policy-v2.0.yaml `runner` and architecture §11:

- **Resource quotas** (`resourceQuotasRequired`): the job's
  `resourceLimits` must be finite/positive (`invalid-resource-limits`,
  named dimensions) and may not under-grant the engine manifest's declared
  profile (`resource-quota-below-engine-requirements`, named dimensions).
  Over-quota REPORTED usage after the run → typed
  `resource-quota-exceeded` failure, outputs discarded, run stays
  auditable.
- **Timeout** (`timeoutRequired`): every job has a wall-clock deadline; a
  hanging adapter → `timed_out` lifecycle with partial metrics
  (`engine-job-timeout`) and the deadline timer always cancelled on
  completion.
- **Network** (`defaultNetwork: denied`): the effective policy is the
  fail-closed conjunction of an `explicitly-granted` manifest AND an
  explicit submission `networkGrant` (non-empty host list). Requests go
  ONLY through `context.network` (host-scoped); the ambient `fetch` is
  replaced by a denied stub for the whole invocation (re-entrant guard) —
  violations become the job's typed failure, never crashes.
- **Credentials** (`databaseCredentials/providerCredentials: none`): the
  sandbox context structurally has NO credential surface — exact key-set +
  credential-vocabulary pins compile-time in sandbox-policy.test.ts and
  runtime in the runner tests; the ENG-002 double also fails closed on
  credential-shaped context keys. Manifests declaring injected credentials
  or unsandboxed execution cannot run at all (gate mirrored at execution
  time).
- **Filesystem** (`scoped-artifacts-only`): adapters see a JOB-SCOPED
  artifact store — only the job's declared input refs and artifacts
  persisted during the run resolve (out-of-scope ≡ unknown, no existence
  leaks); arbitrary paths cannot be expressed. The runner validates every
  output was materialized inside the sandbox scope
  (`unscoped-output-artifact`).
- **Seed** (`seedRequiredWhenSupported`): deterministic engines refuse
  unseeded jobs (`seed-required`); non-deterministic engines refuse seeded
  ones (`seed-not-supported`).
- **Lifecycle + §30 observability**: `queued → running → succeeded |
  failed | timed_out` emitted through the `JobEventSinkPort` SEAM; every
  completion event carries the full §30 record (run id, capability/engine
  versions, actor, artifact refs, duration, resourceUsage, cost,
  warnings, failure, provenance).
- **Result validation**: identity echo (job id + provenance must name the
  submitted job's exact engine/capability identity), contract shape,
  quotas, output scope — rogue adapter results are rejected by name.

DISCLOSED LIMIT: the in-memory runner enforces the POLICY CONTRACT
in-process (quota accounting, the timeout race, the network seam + fetch
guard); a production runner isolates engines in separate processes
(OS-enforced quotas). Durable job persistence is the mos-jobs module's
later-wave responsibility — `JobEventSinkPort` is the declared seam.

## Golden corpus / engine benchmark (ENG-004)

- **`BenchmarkCorpus`**: versioned golden corpora stored as ARTIFACT REFS
  (inputs + expected outputs) + scalar metadata — no media bytes in the
  control plane (spec §6/AGENTS.md "Media"). Registered through
  `BenchmarkCorpusRegistryPort` (immutable, exact-version retrieval,
  fail-closed validation).
- **`BenchmarkRunnerPort.run(corpus, engineId+version, evaluator, seed,
  resourceLimits)`**: every corpus case becomes a REAL EngineJob through
  the ENG-003 sandbox (the benchmark exercises the exact production
  execution path), the outputs are scored by the deterministic
  `BenchmarkEvaluatorPort`, and the outcome freezes into the canonical
  `EngineBenchmark` record [id, capabilityVersion, engineVersion,
  benchmarkCorpusRef, evaluatorVersion, metrics, cost, latency,
  licenseStatus, result]. Deterministic: same corpus + engine + seed →
  the same record.
- **Activation-gate wiring**: `goldenCorpusEvidenceFromBenchmark(record)`
  converts a COMPLETE `EngineBenchmark` into `goldenCorpusBenchmark`
  evidence (incomplete records throw `incomplete-benchmark-record` naming
  every missing field — they can never back an activation); a
  complete-but-failed benchmark becomes evidence the gate rejects by name.
- **Evaluators are doubles here**: `createDisclosedBenchmarkEvaluator`
  (modes: `digest-exact` — bit-for-bit golden reproduction; and
  `contract-shape` — capability-level type/count goldens that let
  different implementations of the same contract pass). Real quality
  evaluators are a §5 capability concern (AGENTS.md Verification: doubles
  test contracts, not production quality).

## Engine replacement / rollback — the ENG-005 proof

The repeatable acceptance evidence lives in
`src/adapters/engine-replacement-proof.test.ts` and
`src/adapters/engine-rollback-proof.test.ts` (harness:
`src/fixtures/replacement-proof-harness.ts`). The documented scenario,
step by step:

1. **Incumbent promotion** — engine A is promoted through the honest
   sequence: candidate registration (pending benchmark) → REAL
   golden-corpus benchmark through the sandbox → production manifest
   embedding the frozen `EngineBenchmark` record → activation with
   evidence derived from that record → executable adapter registration.
2. **The domain caller runs on A** — `executeCapability` asks the registry
   for the CAPABILITY (never an engine), builds the job from the
   resolution, submits it through the sandbox. Written ONCE.
3. **Candidate B arrives** — its candidate registration CANNOT activate
   before a passed benchmark (`benchmark:not-passed` +
   `goldenCorpusBenchmark:not-passed`, by name — benchmarkBeforePromotion).
   B passes the golden corpus (contract-shape goldens: a genuinely
   different implementation satisfies the same capability contract) and is
   promoted through the same sequence.
4. **The swap is explicit** — resolution fails closed
   (`silent-engine-replacement`, both engines named) until
   `recordEngineReplacement(a→b)`; then THE SAME CALLER CODE runs on
   engine B, its job differing only in engine identity
   (stableCapabilityContract pinned: same capability ids + output
   contract; same parameters/seed/inputs).
5. **History keeps A's identity** — the frozen historical result still
   names engine A@1 + its model identity; the retired version stays
   registered/resolvable; re-submitting the EXACT historical job still
   executes through A and reproduces the original outputs bit for bit
   (oldEngineMustRemainReproducibleForHistoricalRuns,
   modelIdentityRecordedPerRun).
6. **Rollback** — return-to-incumbent across engine ids: deactivating B
   fails resolution closed (`assigned-engine-inactive`), an explicit b→a
   record unblocks it, the same caller runs on A again. Same-engine
   rollback by version: a promoted B@2 is rolled back to B@1 via
   `rollbackEngineVersion` (accepted-evidence-chain target only), the same
   caller runs on B@1, and B@2 stays registered + reproducible for
   historical runs (rollbackByEngineVersion).

Design note (disclosed): the manifest's `benchmark` field and the
activation evidence are operator-submitted records; the gate validates
presence, verdicts and manifest/evidence consistency but cannot
cryptographically verify the benchmark provenance. The proof harness
therefore runs the benchmark FOR REAL against a candidate registration
under a candidate id, and the production manifest embeds the frozen record
that run produced (the record honestly names the candidate evaluation
registration; the gate cross-checks its engine VERSION, result and cited
identity).

## Dependencies

- `@mos/contracts` (workspace) — Engine, EngineJob/EngineResult,
  EngineBenchmark, ArtifactRef, value types.
- `@mos/capabilities` (workspace) — optional fail-closed wiring of a
  `CapabilityRegistryPort` into `createInMemoryEngineRegistry` (unknown
  capability ids throw `UnknownCapabilityError` at resolution time).
- NOT `@mos/content` (deliberate): the module-registry dependency entry
  lists it, but engines only need artifact SHAPES — typed through the
  `ArtifactRef` core contract in @mos/contracts. No @mos/content import
  exists (documented for Tech-Lead reconciliation).
- No `@zcode/*` imports, no engine/provider SDK imports (denylist
  enforced by harness/mos-boundary-check.mjs).

## Limitations / disclosure

- The in-memory adapters are ephemeral scaffolds; persistence-backed
  adapters and central composition-root wiring are TL-owned later waves.
- Activation evidence is accepted as submitted data (the gate checks
  structure, verdicts and manifest cross-consistency; it cannot
  cryptographically verify the reviews or benchmark provenance
  themselves).
- The in-memory runner enforces sandbox policy in-process; OS-level
  process isolation is the production runner's concern (same policy
  contract).
- The benchmark evaluator and all engine adapters in tests are DISCLOSED
  test doubles — no production engine/model/license/benchmark claims
  (AGENTS.md Verification).

## Verification

```bash
pnpm --filter @mos/engines exec tsc --noEmit
pnpm --filter @mos/engines test   # tsc -b && node --test 'dist/**/*.test.js'
pnpm exec oxlint packages/mos-engines
```
