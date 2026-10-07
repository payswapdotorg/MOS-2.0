# @mos/production

MOS v2.0 production authority, first slice — **LAB-013 Transform Pawn
Agents** (Worker B, Agent/Engine/Production Backend lane). Authority:
`production` per `spec/mos-module-registry-v2.0.yaml` (deps:
`[contracts, content, rights, policy]` — `@mos/policy` does not exist yet on
main, so this slice imports the registry dependencies that exist:
`@mos/contracts`, `@mos/content`, `@mos/rights`; disclosed below).

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

## Disclosed limitations

- The agent-stack/runner/transform-source implementations shipped here are
  **DISCLOSED in-memory doubles** (`src/adapters/`): same fail-closed
  semantics, no durability, no substrate. The composition root swaps the
  REAL `@mos/agents` / `@mos/agent-runtime` / `@mos/engines` / `@mos/lab`
  adapters in behind the same port types (compat-proven). Never represent
  the doubles as the real runtime.
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

## Scripts

`pnpm --filter @mos/production build | test | lint | typecheck`

The `test` script = build + `node --test dist/**` (57 tests) + sibling
builds + compat typecheck + compat real-stack test (5 tests).
