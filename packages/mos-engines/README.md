# @mos/engines — MOS v2.0 engine registry + engine adapter contract (ENG-001 / ENG-002)

The engine registry over the `Engine` core contract (`@mos/contracts`) and
spec/mos-engine-policy-v2.0.yaml, plus the narrow `EngineAdapter` invoke
surface (EngineJob → EngineResult) every engine implementation sits
behind. Domain modules (Studio/Lab/production) ask for **capabilities**;
this registry **selects engines**. It is a registry, never a marketplace
authority (AGENTS.md: "Engine Registry ≠ Marketplace").

## Surface

| Export | Kind |
| --- | --- |
| `EngineRegistryPort` | registry port (10 methods; policy budget 12) |
| `createInMemoryEngineRegistry` | in-memory adapter factory (working, not a skeleton) |
| `EngineAdapter` | ENG-002 adapter port (one method: `invoke(job)`) |
| `createTestDoubleEngineAdapter` | **DISCLOSED TEST DOUBLE** demonstrating the adapter contract |
| `EngineRegistryError` | typed error with machine-readable `code` + `details` |
| `ACTIVATION_EVIDENCE_KEYS` | the nine required evidence items, in policy order |
| `TIE_BREAK_ORDER` | the six tie-break dimensions, in policy order |
| `activationFailedChecks`, `missingEvidenceItems` | pure activation-gate functions |
| `compareEngineCandidates`, `deriveLicenseCompatibility`, `firstDifferingDimension` | pure resolution functions |

Runtime export count: 10 (≤ 12 policy budget).

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

One method — `invoke(job: EngineJob): Promise<EngineResult>` — aligned
field-for-field with the EngineJob/EngineResult core contracts (job
carries capabilityId/version, engineId/version, inputArtifactRefs,
parameters, seed, resourceLimits, outputContract; result carries
outputArtifactRefs, metrics, provenance, duration, resourceUsage, cost,
warnings, and the typed `failure` — `null` on success, a full
`EngineJobFailure` on failure, so failed runs stay auditable). Adapters
carry their exact engine identity; the manifest's `adapterRef` records
the adapter identity; the runner (ENG-003, later wave) loads and executes
adapters in the sandbox. `createTestDoubleEngineAdapter` is the
**DISCLOSED TEST DOUBLE**: deterministic, dependency-free, exercises the
contract only — it is never a production engine or provider proof
(AGENTS.md Verification).

## Dependencies

- `@mos/contracts` (workspace) — Engine, EngineJob/EngineResult,
  EngineBenchmark, value types.
- `@mos/capabilities` (workspace) — optional fail-closed wiring of a
  `CapabilityRegistryPort` into `createInMemoryEngineRegistry` (unknown
  capability ids throw `UnknownCapabilityError` at resolution time).
- NOT `@mos/content`: the registry's module-registry dependency entry
  lists it, but it is not on this branch (Worker A, same wave). No
  content import exists; any artifact-shaped needs are typed through the
  `ArtifactRef` core contract in @mos/contracts (frozen-YAML-aligned,
  documented for Tech-Lead reconciliation).
- No `@zcode/*` imports, no engine/provider SDK imports (denylist
  enforced by harness/mos-boundary-check.mjs).

## Limitations / disclosure

- The in-memory adapters are ephemeral scaffolds; persistence-backed
  adapters and central composition-root wiring are TL-owned later waves.
- `EngineRegistryPort.listActivatedEngines` and resolution only ever see
  in-process state; durable activation evidence storage (ENG-004 golden
  corpus wiring) is a later work item. The evidence records here are
  typed data, not verified attestations — the gate validates presence,
  verdicts and manifest consistency.
- Activation evidence is accepted as submitted data (the gate checks
  structure, verdicts and manifest cross-consistency; it cannot
  cryptographically verify the reviews themselves).

## Verification

```bash
pnpm --filter @mos/engines exec tsc --noEmit
pnpm --filter @mos/engines test   # tsc -b && node --test 'dist/**/*.test.js'
pnpm exec oxlint packages/mos-engines
```
