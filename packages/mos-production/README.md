# @mos/production

MOS v2.0 production authority — **LAB-013 Transform Pawn Agents** (Wave 7)
+ **LAB-016 Production Program Search** (Wave 8) (Worker B,
Agent/Engine/Production Backend lane). Authority: `production` per
`spec/mos-module-registry-v2.0.yaml` (deps: `[contracts, content, rights,
policy]` — `@mos/policy` does not exist yet on main, so this slice imports
the registry dependencies that exist: `@mos/contracts`, `@mos/content`,
`@mos/rights`; disclosed below).

## What this package provides (§9 — pawns ARE specialized Agent Instances)

### The ten §9 transform pawn bodies (`TRANSFORM_PAWN_BODIES`)

Clip Selection, Hook Extraction, Reaction Composition, Podcast Interviewer,
Question Designer, Scene/Layout, Editor, Caption, Dubbing, Quality Critic —
each a **REAL `AgentBody`** (the frozen 14-field CORE-001 contract) plus a
transform-domain role contract (`TransformPawnRoleContract`):

- `servedTransformKinds` — the frozen thirteen §5 kinds the pawn serves
  (fail-closed at execution: a task citing an unserved kind is a typed
  caller error);
- `servedCapabilities` — identical to the canonical body's `capabilities`
  (validated at registration; the two halves describe one pawn);
- `engineTools` — deterministic engine tool bindings
  (`engine-tool:{engineId}@{v}:{capabilityId}@{v}` derived tool refs — tool
  refs are DATA; every invocation goes through the runner);
- `modelFlavor` — **eight deterministic pawns** (engine invocations only, NO
  model binding — ever, test-pinned) and **two llm-flavored pawns**
  (podcast-interviewer: pure agent execution; question-designer: engine
  invocation + agent execution in ONE record — the composite path).

Bodies are registered through the agent-stack body-registry seam
(`registerPawnBody`) — a disclosed in-memory registry instance at the
composition/testing seam (sibling sources are never edited).

### `PawnExecutionPort` — lifecycle + execution (10 methods)

`instantiatePawn` (a REAL agent instance through the instance-registry
seam: `instantiated` state, subset-checked tool/capability bindings) →
`bindPawnModel` (LLM-flavored pawns ONLY, delegated to the registry seam
which owns THE single model boundary; deterministic pawns are REFUSED with
`no-model-binding-for-deterministic-pawn` — §9 pinned) → `executePawn` →
`releasePawn`. Executions are recorded append-only with full §30
observability:

- caller errors (malformed task, unknown instance/transform/artifact/org
  citation, missing engine quotas) are THROWN typed and append NO record —
  they never became production actions;
- production-action failures (unbound llm instance, rights denial, typed
  engine failure, non-completed agent finish) are RECORDED on failed
  records — a failure is data, not an absence.

Execution order is fixed: instance → transform (exact version, fail-closed)
→ artifacts (digest/type-validated through the artifact-source seam) →
organization citation (fail-closed) → **rights gate PRECEDES every engine
and agent invocation** (the REAL injected `evaluateRights` rule; verbatim
denial reasons; pinned) → engine jobs through the runner seam → agent
execution through the executor seam (llm-flavored only) → record.

### The mirrored seams (disclosed design decision)

The frozen module registry does NOT make `agents`, `agent-runtime`,
`engines` or `lab` production dependencies, so the runtime module graph of
this package cannot import them. Their surfaces are **mirrored port seams**
in `src/ports/`:

| Seam | Mirrors | Methods |
| --- | --- | --- |
| `PawnBodyRegistryPort` | `@mos/agents` `AgentBodyRegistryPort` | 5 |
| `PawnInstanceRegistryPort` | `@mos/agent-runtime` `AgentInstanceRegistry` | 5 |
| `PawnModelRuntimePort` | **THE single** `ModelRuntimePort` boundary | 1 |
| `PawnInstanceExecutorPort` | `InstanceExecutorPort` | 1 |
| `PawnEngineRunnerPort` | `@mos/engines` `EngineRunnerPort.submit` | 1 |
| `PawnTransformSourcePort` | `@mos/lab` transform-definition registry (one-line delegation) | 1 |
| `PawnArtifactSourcePort` | `@mos/content` `ArtifactRepository.getArtifact` (one-line delegation) | 1 |
| `PawnRightsGatePort` | the REAL `evaluateRights` rule (injected) | 1 |

`compat/agent-stack-compat.ts`, `compat/engine-runner-compat.ts` and
`compat/transform-source-compat.ts` (compiled by `tsconfig.compat.json` in
the `test` script) pin the seams **mutually assignable** with the REAL
packages — zero adapters, zero drift; `compat/pawn-real-stack.test.ts` runs
whole pawn lifecycles through the REAL sibling packages wired behind the
seams (real body registry, real model boundary + instance registry +
substrate executor over its own disclosed double, real engine runner with
the disclosed test-double adapter — including a configured typed failure
passing through VERBATIM — real lab transform registry via the one-line
delegation, real rights repository + rule, real content repository).

### NO SECOND RUNTIME / NO MODEL ROUTER (§9 hard rule — structurally pinned)

`src/no-second-runtime.test.ts` scans every non-test source (comments and
string contents stripped):

1. **vocabulary ban** — no model-selection/router vocabulary
   (`selectModel`, `chooseModel`, `pickModel`, `resolveModel`,
   `modelRouter`, `fallbackModel`, `router`);
2. **single `bindModel` call-site** — exactly one, in the instance-registry
   seam double (the mirror of the real registry's single call-site);
3. **`modelRef` file-set pin** — the token appears only in the reviewed
   seam/record/composition files;
4. **single executor call-site** — `.execute(` appears only in the
   execution run (the executor seam);
5. **single engine path** — `.submit(` appears only in the execution run
   (the runner seam); `EngineAdapter`/`registerAdapter` never appear in
   code (no adapter surface, no runner bypass);
6. **registry-exact imports** — every bare `@mos/*` import is one of the
   frozen production registry dependencies that exist;
7. **exact exported runtime surface** + **port method budgets**
   (PawnExecutionPort 10, organization port 3, every seam ≤ 12);
8. **lockfile discipline** — the `pnpm-lock.yaml` importer carries exactly
   the registry-exact dependency set.

### `TransformPawnOrganizationPort` — multi-pawn composition (3 methods)

Composes a canonical `AgentOrganization` (the `@mos/contracts` §5 types,
reused verbatim — compose, never re-implement) from pawn citations:
registered kinds only, unique node ids, typed edges, acyclic `delegates-to`
subgraph, **deterministic nodes carry NO model assignment** (a typed
rejection — §9) while **llm-flavored nodes carry exactly one** (the
assignment is DATA resolved at the boundary). Registered append-only
(revision appends version + 1; prior versions stay resolvable
bit-for-bit), tenant-scoped, deep-frozen records, every named rejection
reason at once.

## LAB-016 — Production Program Search (§7: the Lab searches the FULL
production program, not only ideas)

### `ProductionProgramSearchPort` — `searchPrograms` (1 method)

`searchPrograms(mission/scope refs, source artifact refs, search policy,
budget, seed)` → a **RANKED, uncertainty-labeled, counterfactual candidate
set**. Every ranked candidate carries:

- a **`CandidateProgram`** — the SIXTEEN §7 dimensions as explicit typed
  data (`source-reference` is GIVEN by the input; `no-op-repost` is the
  synthesized baseline; transform chain + parameters from the promoted-
  transform catalog seam; production modality; organization citation;
  pawn agents from the ten §9 bodies; model assignments as DATA refs from
  the single-boundary vocabulary — declared, NEVER resolved here; engine
  portfolio at exact versions; LAB-014 human task refs by reference;
  capability acquisition with coverage; quality thresholds; cost; latency;
  the §18 delay terms with provenance-cited expectations; stopping/
  substitution policy);
- a **canonical CORE-001 `ProductionRequest`** — the frozen contract's
  required fields composed from (candidate, input),
  `assertRequiredFields`-checked at composition time so completeness holds
  BY CONSTRUCTION (test-pinned anyway);
- a **§22-labeled evaluation** through the `ProgramEvaluationPort` seam —
  expected reward + interval + ensemble disagreement + seed robustness +
  **the §2 EV of delay** (computed BY the seam under the declared
  `ev-delay-1` shape — the search itself never computes a delay EV);
- **provenance** — the dimensions varied (EXACTLY the sixteen-dimension
  fingerprint diff vs the parent — the honest provenance), the fingerprint,
  the parent fingerprint, generation index, policy version, seed,
  evaluation seeds, and the evaluation-surface version pins
  (ensemble/simulator/reward-spec);
- the **declared comparison against the no-op baseline** (§7: comparisons
  are against the always-present baseline) and the interval overlap with
  the rank-1 leader.

**THE NO-OP BASELINE IS STRUCTURALLY PRESENT ON EVERY RESULT** (`noopBaseline`
is a required field, not an array slot that could be empty — §7/lock rule 5):
the empty-chain repost with zero delay terms, never a generation parent,
never claimable by a caller (typed rejection).

The **declared search policy** (versioned, deterministic given (inputs,
seed, policy version)) carries every vocabulary the mutation operators
cycle through (presets, modalities, models, engines, quality ladder,
budget scale, duration/wait ladders, retry cap), the pruning rule
(`none` | `interval-dominance` — pruned entries STAY RANKED, comparison
transparency) and the stopping rules (budget floor, plateau window,
iteration cap). The search loop is the W5-B generation discipline applied
to program candidates: mutants of the incumbent in frozen §7 dimension
order, deduplicated by sixteen-dimension fingerprint, evaluated while the
budget allows, best improving mutant (above `improvementTolerance`)
becomes incumbent.

**§24 BOUNDARY (pinned on every record):** the output is a ranked
lab-labeled candidate set — `counterfactual: true`, the disclosure
strings, and the `labOnly` statement — **never a deployment decision**;
the real-experiment boundary is untouched.

### The three lab-side seams (the W7-B pattern — disclosed)

The frozen module registry does NOT make `lab` or `agents` a production
dependency, so the lab-side inputs arrive through DECLARED PORT SEAMS with
DISCLOSED in-memory doubles (`src/adapters/`):

- **`ProgramTransformCatalogPort`** (1 method) — the LAB-011/012 promoted-
  transform vocabulary listing. The REAL `@mos/lab`
  `TransformDefinitionRegistry.listTransformDefinitions` satisfies it with
  a ONE-LINE DELEGATION (compat-pinned); the no-op-repost KIND is filtered
  from the chain vocabulary (the no-op path is the EMPTY-chain baseline,
  never a chain step — pinned).
- **`ProgramOrganizationSourcePort`** (1 method) — the LAB-010-style
  organization descriptor listing (canonical organization field set + the
  two declared §23 features `criticNodeIds`/`executionOrdering`). REAL
  `@mos/agents` organization registry records + LAB-010 declared features
  compose into the descriptor (compat-pinned); tenant-scoped.
- **`ProgramEvaluationPort`** (1 method) — the LAB-007-style §22 evaluation
  surface: one (action, delayTerms, seed) → expected reward + interval +
  disagreement + the §2 EV of delay + surface version pins. The REAL lab
  ensemble prediction + the REAL LAB-015 `ev-delay-1` computation satisfy
  it behind the documented composition-root mapping
  (compat/program-search-compat.ts pins the wiring type-checks;
  compat/program-real-stack.test.ts RUNS the search against the REAL lab
  registry + REAL agents organizations + REAL lab ensemble + REAL delay
  authority).

The evaluation double's synthetic action mapping is DOCUMENTED (never a
claim about real production performance): the no-op baseline maps to the
LAB-004 first-class `no-op` action kind — the ZERO-KNOB action (cadence 0,
novelty 0, engagement 0; a no-op produces no activity).

### Canonical drops (documented — the W6-A/W7-A precedent)

The candidate's pawn agents / model assignments / engine portfolio /
acquisition modes / stopping-substitution policy / declared delay
expectations have no field on the frozen `ProductionRequest` contract —
they stay on the candidate record (the composition root binds them when a
real execution is requested). The synthesized transform-graph/
organization/format citation refs of the no-op baseline
(`NO_OP_PROGRAM_REFS`) are DECLARED SYNTHETIC refs — the composition root
rebinds them for real executions.

## Disclosed limitations

- The agent-stack/runner/transform-source/program-search implementations
  shipped here are **DISCLOSED in-memory doubles** (`src/adapters/`): same
  fail-closed semantics, no durability, no substrate. The composition root
  swaps the REAL `@mos/agents` / `@mos/agent-runtime` / `@mos/engines` /
  `@mos/lab` adapters in behind the same port types (compat-proven). Never
  represent the doubles as the real runtime. The program EVALUATION double
  is a self-labeling deterministic synthetic response function — its
  reward numbers are NOT claims about real production performance.
- `@mos/rights` and `@mos/content` are TYPE-ONLY imports in `src/`; the
  REAL authorities (in-memory rights repository + `evaluateRights`, the
  in-memory artifact repository) are wired at the testing/composition seam
  (`src/testing/compose-pawn-stack.ts`) by relative dist path — the
  W5-C/W6-C runtime-import precedent; bare specifiers once the exports maps
  are reconciled.
- Engine identities in the pawn bodies' tool bindings are
  **fictional-but-plausible citations** (tool refs are data; the runner
  resolves engines that are ACTUALLY registered — the compat test
  registers matching manifests + the disclosed double adapter so real jobs
  flow).
- `@mos/policy` (a frozen registry dependency) does not exist yet; the
  policyRequirements of transform definitions are carried as structural
  references only. No policy surface is invented here.
- The §30 `evaluation` carries the body's declared evaluator ref plus
  recorded engine metrics; computed evaluation of outputs is later-wave
  work behind that declared evaluator.
- Durable execution history/organization storage is later-wave work behind
  the same ports.
- Program search is an IN-MEMORY, single-process search (deterministic
  hill-climb over the sixteen dimensions — no invented sophistication);
  the composed `ProductionRequest`s cite SYNTHESIZED transform-graph refs
  (`program-graph:<hash>`) that the composition root rebinds to real
  LAB-011 TransformGraph versions at execution time. Durable search
  history + real-execution binding are later-wave work behind the same
  port. The search results are LAB-LABELED COUNTERFACTUAL candidate sets
  (§24) — executing one goes through the owning authorities (Mission →
  Policy/Rights → Production/Studio → …), never this surface.

## Scripts

`pnpm --filter @mos/production build | test | lint | typecheck`

The `test` script = build + `node --test dist/**` (94 tests) + sibling
builds + compat typecheck + compat real-stack tests (10 tests).
