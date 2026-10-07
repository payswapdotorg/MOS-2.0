# @mos/jobs — MOS v2.0 durable-job authority (JOBS-001)

The durable job/worker path that spec/mos-architecture-v2.0.md §26 makes
MANDATORY for long-running work: Lab runs, media processing, engine
execution, rendering, Studio processing and benchmark jobs. Jobs are
tenant-scoped records (§31) with artifact-ref inputs (never inline
payloads), lifecycle `queued → running → succeeded | failed | cancelled |
timed_out` (+ `dead_lettered`), declared retry policies, retries driven
FROM typed failure records (the ENG-003 `EngineJobFailure` vocabulary is
the model), an append-only immutable event history per job, and full §30
observability on every completion. Module authority: `durable-job`
(spec/mos-module-registry-v2.0.yaml — owner worker-b, dependencies
`[contracts]`).

**No scheduling authority.** There is no cron, no HTTP timer, no
clock-driven dispatch (§26 forbids synchronous HTTP / Hobby-Cron as the
durable scheduling authority). The ONLY dispatch surface is the
work-polling port `JobQueuePort.claimNextRunnable`: workers poll. The one
clock-driven consumer in the package is the DISCLOSED in-memory poller
double (`test-doubles/job-poller-double.ts`) that exists to demonstrate
the consumption model.

## Surface

| Export | Kind |
| --- | --- |
| `DurableJobRecord` + `DurableJobSubmission` / `JobCompletion` / `TypedJobFailure` / `JobRetryPolicy` / `DurableJobInput` / `DurableJobRunInfo` / `DurableJobObservability` / `JobProvenance` / `JobActorAttribution` / `JobSubmitterActor` / `JobWarning` / `JobListQuery` | the durable-job record vocabulary (§26/§30/§31) |
| `DURABLE_JOB_KINDS` / `DURABLE_JOB_STATUSES` / `TERMINAL_JOB_STATUSES` | frozen vocabularies (§26 kinds verbatim; test-pinned) |
| `DurableJobId` / `JobKey` / `LeaseToken` + `durableJobId` / `jobKey` / `leaseToken` | branded ids + builders |
| `DurableJobEvent` (10 event types) + `DURABLE_JOB_EVENT_TYPES` / `DurableJobEventInput` | append-only immutable event history vocabulary |
| `JobQueuePort` / `JobClaim` / `JobClaimRef` / `JobClaimQuery` / `JobMutationOptions` | the work-polling queue port (10 methods; policy budget 12) |
| `DurableJobStorePort` / `ClaimableJobsQuery` | the persistence seam (7 methods; policy budget 12) |
| `RunnerJobEvent` / `RunnerRunObservabilityRecord` / `RunnerJobEventSink` + event types | the ENG-003 runner-seam MIRROR (see Compatibility pin) |
| `createDurableJobQueue` | the queue adapter (MOS-owned domain logic over any store) |
| `createInMemoryDurableJobStore` | **DISCLOSED TEST DOUBLE** — in-memory persistence |
| `createEngineRunnerJobEventBridge` / `EngineRunnerJobEventBridge` / `UnresolvedRunnerEvent` | the ENG-003 runner-seam bridge adapter (§30 actor enrichment) |
| `createJobPollerDouble` / `JobPollerDouble` / `JobPollerTimers` | **DISCLOSED TEST DOUBLE** — clock-driven poller |
| `decideRetry` / `retryDelayMs` / `retryPolicyViolations` / `RetryDecision` | pure retry domain logic |
| `JobQueueError` / `JobQueueErrorCode` | typed errors (7 codes) with machine-readable `details` |

Runtime export count: 11 (4 factories, 3 pure domain functions, 3
branded-id builders, 1 error class) + 4 frozen vocabulary constants. The
12-public-method policy budget applies PER PORT — JobQueuePort 10,
DurableJobStorePort 7.

## Semantics (all test-pinned)

- **Idempotent enqueue** — per `(tenant, jobKey)`: a duplicate submit
  returns the EXISTING record unchanged — no second event, no double
  execution. The key is permanently bound (new work = new key).
- **Leased claims** — `claimNextRunnable` grants a lease (token + expiry):
  two claimers can never hold the same job (the second gets a different
  job or null). FIFO by creation; optional tenant/kind filters;
  backoff-waiting jobs become claimable when their window elapses.
- **Heartbeat / crash recovery** — `renewLease` extends the lease (typed
  `stale-lease` / `lease-expired` failures otherwise). An expired lease
  makes the job claimable again: the reclaim records a `lease-expired`
  event and the crashed worker's stale token fails closed.
- **Typed complete / fail / cancel** — completions carry the §30 facts
  (run id, engine/capability identity + versions, output artifact refs,
  duration, cost, resource usage, warnings, provenance). Failures are
  TYPED records (`code` / `message` / `retriable` / `details` +
  `terminalStatus`); retries are driven from the failure's `retriable`
  flag against the job's declared `maxAttempts` + `backoffScheduleMs`
  (clamped to the last entry). Exhaustion → `dead_lettered` with the FULL
  append-only history preserved. Only queued jobs are cancellable;
  terminal jobs are immutable.
- **Tenant isolation (§31)** — every read/mutation is tenant-scoped;
  foreign-scope access is INDISTINGUISHABLE from unknown (no existence
  leaks). The store keys by `(tenant, id)` — the W3-A cross-tenant
  bleed lesson baked in. Cross-tenant input artifact refs are denied at
  enqueue (the jobs module has no sharing contract).
- **Ownership** — the store deep-CLONES then freezes everything it saves:
  caller-supplied submissions/failures/runner records are never mutated
  or frozen in place; the durable authority copy is always private.
- **Fail-closed validation** — malformed submissions throw typed
  `invalid-job-submission` with named violations (scope, jobKey, §26
  kind, contractVersion, submitter, artifact-ref field completeness,
  parameters, retry policy).

## The §26 job kinds → producing subsystems

| Kind | Produced by (producing subsystem) | Notes |
| --- | --- | --- |
| `lab-run` | mos-lab simulations (Worker A lane: LAB-007..009 world-model ensemble, strategy search) | counterfactual-labeled runs enqueue durable work |
| `media-processing` | content/production media transforms (CORE content artifact pipeline) | inputs/outputs are artifact refs — media never travels over the control plane |
| `engine-execution` | mos-engines ENG-003 runner executions | THE bridge consumer: the runner's JobEventSinkPort events materialize here (see below) |
| `rendering` | Studio rendering surfaces (STUDIO formats: reaction/audio/video podcast) | studio registry topology declares `jobs` as a dependency |
| `studio-processing` | mos-studio session production (Worker C lane) | studio-consumed surface: keep ports narrow and stable |
| `benchmark` | mos-engines ENG-004 golden-corpus benchmarks | benchmark case runs are long-running §26 work |

Future substrate bindings (documented seams): the real durable store
(PostgreSQL-backed MOS authority) and the Zcode task-infra adapter (§26:
"ZCode runtime task infrastructure may provide worker mechanics through an
adapter") both implement `DurableJobStorePort`; the queue and every
consumer stay unchanged. Real adapters MUST serialize the
scan → validate → save claim sequence (see the port's atomicity note).

## The ENG-003 runner-seam bridge (§30 actor enrichment)

`createEngineRunnerJobEventBridge({ queue, scope })` implements the
runner event sink shape and materializes the runner's COMPLETION events
as durable job lifecycle events:

- `job-succeeded` → `completeJob` with the full §30 observability record
  copied from the runner's `EngineRunObservabilityRecord`;
- `job-failed` / `job-timed-out` → `failJob` with the TYPED failure
  (retriable → declared retry; exhaustion → dead-letter).

§30 actor enrichment: the runner attributes its actions to
`"engine-runner"` (the frozen EngineJob shape carries no submitter
identity); the bridge drives the queue mutation with
`executor: "engine-runner"` and the queue enriches it with the
SUBMITTING actor from the job record — the completed attribution reads
`{ executor: "engine-runner", submittedBy: <enqueue-time actor> }`.

Wiring contract: the bridge is constructed per tenant scope; the worker
sets `EngineJob.id = DurableJobRecord.id` (string identity) and submits
with this sink wired as the runner's event sink WHILE HOLDING the claim.
The sink contract is void-returning: the bridge NEVER throws into the
runner — unresolvable events (unknown job, job not held under a claim,
typed queue rejection) are buffered in `conflicts` for the composition
root to drain and alert on.

### Compatibility pin (zero drift, no dependency edge)

The frozen module registry gives `jobs` exactly one dependency —
`contracts` — so the RUNTIME module graph imports only `@mos/contracts`.
The runner event vocabulary is MIRRORED in
`src/contracts/runner-events.ts` (field-for-field, brand-for-brand from
the same `@mos/contracts` brands), and `compat/` pins zero drift against
the real engine package via RELATIVE references (no package.json edge):

- `compat/engines-event-compat.ts` — compile-time mutual assignability
  assertions between the mirror and the REAL `@mos/engines`
  `JobEventSinkPort` vocabulary (compiled by `tsconfig.compat.json` in
  the `test` script);
- `compat/engine-runner-bridge.test.ts` — the runtime half: the REAL
  ENG-003 in-memory runner (built dist) runs with the BUILT bridge wired
  directly as its event sink — success materializes with full §30
  observability + actor enrichment, and a real retriable failure retries
  then dead-letters through the bridge.

## Dependencies

- `@mos/contracts` (runtime, the only registry-declared dependency):
  branded ids, `ArtifactRef`, `TenantScope`, `Version`, engine observability
  types.
- Dev: `@types/node`, `typescript`. The compat directory references
  `../mos-engines` via relative paths (types from source for the pin,
  built dist for the runtime test) — deliberately NOT a package
  dependency.

## Limitations / disclosure

- `createInMemoryDurableJobStore` is a DISCLOSED TEST DOUBLE: process
  -local, ephemeral, never a durability claim. The real durable store +
  Zcode task-infra adapter are future substrate work behind the same
  port.
- `createJobPollerDouble` is a DISCLOSED clock-driven double demonstrating
  the polling consumption model — never a scheduling authority.
- The bridge's synchronous-event wiring matches the in-memory runner
  (events fire inside `submit()`); a real out-of-process runner will emit
  through a transport — the queue's lease semantics already tolerate
  late/stale completions (buffered as conflicts, never crashes).
- `dead_lettered` is a status view over the same tenant-scoped records:
  a future re-drive surface (dead-letter replay) is deliberately not in
  this wave's scope.

## Verification

`pnpm test` (in this package) runs: `tsc -b` → `node --test
'dist/**/*.test.js'` (52 tests: enqueue idempotency, lease double-claim
prevention, backoff-gated retries, dead-letter with full history, cancel,
tenant isolation/no existence leaks, §30 bridge completeness, heartbeat
expiry → reclaim, ownership cloning, vocabulary pins, no-scheduling
-authority pins, poller double) → builds `../mos-engines` →
`tsc -p tsconfig.compat.json` (the compile-time pin) → `node --test
compat/engine-runner-bridge.test.ts` (the real-runner round-trips).
