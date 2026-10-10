# @mos/experiments — BRIDGE-003: the real-experiment/evidence/learning authority

MOS v2.0 · `spec/mos-architecture-v2.0.md` §24 (the real-world boundary
chain's final segments: → Evidence/Measurement/Experiment →
Learning/Calibration) · registry authority `real-experiment-evidence-learning`
· owner worker-c · dependencies `[contracts, missions, production,
distribution, jobs]` EXACT (the FROZEN registry's topology; the package.json
matches — the TL re-pins the frozen manifest/registry at merge).

A selected LAB-017 benchmark candidate becomes a REAL MOS experiment through
the §24 chain's final assembly, and the experiment's outcome feeds the
LAB-018 calibration authority through its declared boundary.

## The law this package implements

- **EXPERIMENT ≠ LAB (§3, the forbidden-duplication pin)**: this authority
  records REAL experiments and their platform-said evidence. It NEVER
  simulates, never re-runs the Lab's simulators, never treats simulated
  predictions as observations. The lab candidate's counterfactual
  expectations (`counterfactual: true` literal) stay counterfactual FOREVER
  inside experiment records; only MEASURED platform-said evidence is real
  (`counterfactual: false` literal). Pinned compile-time
  (`src/contracts/type-pins.ts` + the compat pins) AND runtime (label
  re-validation, purity guards, exported-vocabulary scans).
- **One authority, append-only**: versioned tenant-scoped append-only
  records (experiments, evidence, outcomes, binding audits) with
  deterministic digest sealing and bit-for-bit integrity verification. No
  update/delete surface exists anywhere on the port.
- **Gate ordering at binding creation (§24, the BRIDGE-001 pattern)**:
  candidate resolvable → mission linkage → policy verdict → rights frame →
  production request → distribution binding → experiment record. A denial
  at any stage means ZERO experiment state; every attributable failure
  appends EXACTLY ONE §30 audit record with the authority's denial
  attribution VERBATIM; caller-error shapes record NOTHING.
- **Durable execution (§26)**: the lifecycle
  `created → running → measured → analysed → closed | abandoned` rides the
  REAL `@mos/jobs` `JobQueuePort` for the long-running measurement segment
  (leased claims, typed retriable window retries with the declared backoff,
  §30-enriched job events). No synchronous-HTTP durable claims.
- **The learning/calibration feed (by reference)**: the outcome citations
  (`ExperimentOutcomeObservation` — structurally exactly the lab's
  `HistoricalObservation`) are exposed read-only for the LAB-018
  `RealityObservationReaderPort` boundary. NO second calibration authority,
  NO writes into lab state.

## The frozen RealExperimentBinding contract projection

`canonicalRealExperimentBinding(record)` projects one experiment record
version onto the CORE-001 frozen contract (required: id, labCandidateRef,
missionRef, productionRequestRef, policyRef, rightsRef, distributionRef,
experimentRef, evidenceRef) — every ref resolving to an EXACT version of
the underlying authority record (version pins ride the record's segments;
`labCandidateRef` = `benchmark:<id>:v<version>:<key>`, the LAB-018
labRunRef-encoding precedent; `distributionRef` =
`social-publication:<publicationId>`). Unresolvable refs are typed
failures, NEVER fabrication.

## Public surface (the 12-method `RealExperimentAuthorityPort`)

| Method | Kind | What it does |
| --- | --- | --- |
| `createBinding` | write | the gate-ordered §24 chain (the ONLY experiment-state minting path) |
| `advanceMeasurement` | write | the durable segment runner under a REAL queue claim |
| `analyse` | write | appends the outcome record over the latest measured evidence |
| `closeExperiment` | write | terminal closure: `closed` or the FIRST-CLASS `abandoned` (§18 snapshot) |
| `getExperiment` / `listExperiments` | read | experiment chain reads (exact-tenant, §31) |
| `getEvidence` / `listEvidenceVersions` | read | the evidence chain reads |
| `getOutcome` / `getOutcomeObservation` | read | the outcome record + the LAB-018 boundary projection |
| `listBindingAudits` | read | the §30 binding-attempt audit log (exact-tenant) |
| `verifyExperimentIntegrity` | read | the digest-sealed bit-for-bit verification |

## Package map

```
src/contracts/     the typed surfaces: ids, boundary vocabulary, the
                   lab-candidate seam (the consumed LAB-017 surface), the
                   authority seams (mission/policy/rights/distribution/jobs),
                   the binding request + failure model, the experiment
                   record family + the frozen projection, the evidence +
                   outcome families, the port, the compile-time pins
src/domain/        pure logic: digest (canonical JSON + FNV-1a), binding
                   validation (fail-closed shapes + production-citation
                   identity checks), evidence folding (window selection +
                   verbatim citations + §22 uncertainty), outcome analysis
                   (observed metric means + the LAB-018 projection)
src/store/         the append-only versioned tenant-scoped stores
                   (W9-B D1–D5 by construction)
src/adapters/      the disclosed in-memory authority + the disclosed gate
                   doubles (the REAL authority twins live in the compat
                   battery) + the durable lifecycle cores
src/testing/       deterministic fixtures + the REAL distribution adapter
compat/            the zero-drift compile-time pins + the REAL-stack
                   runtime battery (missions/production/distribution/jobs/
                   lab/policy/rights REAL twins — the MARKETING-001/
                   BRIDGE-001 compat pattern, disclosed)
```

## The declared seams (registry exactness)

`@mos/lab`, `@mos/policy` and `@mos/rights` are NOT registry dependencies
of this module — they sit behind experiments-owned declared ports
(`LabCandidateReaderPort`, `ExperimentPolicyGatePort`,
`ExperimentRightsGatePort`) whose shapes are compat-pinned against the REAL
authority shapes (compile-time, `compat/lab-authority-compat.ts`) and
proven end-to-end at runtime (`compat/experiments-real-stack.test.ts`,
which wires the REAL LAB-017 benchmark, the REAL policy evaluation, the
REAL rights repository and the REAL distribution stack behind the same
ports). The five registry dependencies are imported directly:
`@mos/contracts` (shared vocabulary), `@mos/missions` (the mission linkage
gate), `@mos/production` (the REAL search result/canonical request
citation), `@mos/distribution` (the platform-said observation surfaces),
`@mos/jobs` (the durable queue).

## The disclosed durable-job kind mapping (§26)

The frozen six-kind §26 vocabulary lives in worker-b's `mos-jobs` subtree
(out of this package's subtree) and carries no `experiment` kind. Among
the frozen kinds, the experiment's long-running measurement/analysis
segment is structurally an EVALUATION job over reality — the closest
frozen kind is `benchmark`; the mapping is declared here
(`EXPERIMENT_JOB_KIND`, test-pinned) with the full experiment identity
riding the job key (`experiment:<experimentId>`) + parameters.
**Central-file note for the TL**: a dedicated `experiment` §26 kind should
be pinned by the jobs owner at the next registry re-pin.

## The measurement discipline (what is real)

- Evidence = REAL `@mos/distribution` platform-said observations, cited by
  reference, carried VERBATIM (MOS never invents, adjusts, rounds or infers
  a single number — the SOCIAL-001 observation purity discipline) + the
  declared measurement window.
- The analysis computes plainly-derived observed metric means (arithmetic
  means of the numeric members of the platform-reported payloads — the
  LAB-008 observed-domain discipline) and cites the counterfactual
  expectation + the §21 mission reward spec VERBATIM. The experiments
  authority NEVER computes reward — the valuation and prediction error are
  the LAB-018 authority's domain, fed by reference.
- Abandonment is first-class: reason + summary + derived citations (the
  latest evidence version, the job's own status echo) — the §18 auditable
  path, preserved forever through the append-only versions.

## DISCLOSED limitations

- The in-memory stores/authority are the disclosed doubles of this wave
  (deterministic, no IO, injectable clocks/id factories); the REAL durable
  persistence adapters are a later central composition concern — the port
  surface stays unchanged.
- The compat battery's REAL twins: `@mos/lab`, `@mos/policy`,
  `@mos/rights` runtime imports use RELATIVE BUILT-DIST paths (their
  exports maps default to untranspiled `src/`, which plain Node ESM cannot
  execute); `@mos/missions` likewise. No runtime dependency of this
  package is created and no lockfile change is made (the established
  MARKETING-001/BRIDGE-001 compat pattern).
- On a store rejection after a successful job completion (a core-defect
  class), the measured evidence IS appended and the job's own append-only
  history carries the discrepancy — disclosed in
  `src/adapters/measurement-core.ts`; the worker resolves the job through
  the queue's dead-letter path.

## Commands

```bash
pnpm typecheck   # tsc -b
pnpm lint        # oxlint
pnpm test        # dist battery + builds lab/policy/rights + compat battery
```
