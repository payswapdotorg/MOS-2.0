# @mos/jobs — MOS v2.0 durable-job authority (JOBS-001) + notification delivery plane (NOTIFY-001)

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

The **notification delivery plane** (NOTIFY-001) lives in this package
by the MOS2-WAVE5-HARVEST TL topology decision (no notify module exists
in the frozen registry): durable, tenant-scoped, append-only
NotificationRecords with declarative semantic kinds, identity-ref
recipients, REFERENCE-ONLY subjects (artifact/task/mission refs — never
inline content), dedup-key idempotency (the same logical notification
submitted twice yields ONE record), lifecycle `queued → delivered |
failed | suppressed`, delivery attempts as RECORDED §30 events through a
declared provider transport seam (immutable receipts on success, typed
retries with declared backoff otherwise, terminal failure on
exhaustion), suppression at recipient or record level as a FIRST-CLASS
recorded outcome with a reason — and, structurally test-pinned, NO
task/workflow duplication: no claim/lease/execute semantics anywhere on
notifications (see “The no-task-engine discipline”).

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
| `NotificationRecord` + `NotificationSubmission` / `NotificationSubject` / `NotificationReceipt` / `RecipientSuppression` / `NotificationSuppressionInfo` / `NotificationAttemptObservability` / `TypedNotificationFailure` / `NotificationRetryPolicy` / `NotificationListQuery` / actor aliases | the notification-plane record vocabulary (NOTIFY-001, §30/§31) |
| `NOTIFICATION_KINDS` / `NOTIFICATION_STATUSES` / `TERMINAL_NOTIFICATION_STATUSES` / `NOTIFICATION_EVENT_TYPES` / `NOTIFICATION_DELIVERY_FAILURE_CODES` | frozen vocabularies (declarative kinds; test-pinned) |
| `NotificationId` / `NotificationDedupKey` / `DeliveryAttemptId` / `NotificationReceiptId` / `ProviderAckRef` + builders | notification-plane branded ids + builders |
| `NotificationEvent` (5 event types) + `NotificationEventInput` | append-only immutable notification event history vocabulary |
| `NotificationDeliveryPort` / `NotificationDeliveryResult` / `DeliveryAttemptOptions` | the notification plane's consumer surface (11 methods; policy budget 12) |
| `NotificationProviderPort` / `NotificationDeliveryRequest` / `NotificationProviderResponse` | the declared transport seam (1 method; §30 provider ref + self-labeling responses) |
| `NotificationStorePort` | the notification persistence seam (11 methods; policy budget 12) |
| `createNotificationDeliveryPlane` | the plane adapter (MOS-owned domain logic over any store + provider seam) |
| `createInMemoryNotificationStore` | **DISCLOSED TEST DOUBLE** — in-memory notification persistence |
| `createInMemoryNotificationProviderDouble` / `InMemoryNotificationRoute` | **DISCLOSED TEST DOUBLE** — deterministic self-labeling transport |
| `decideNotificationRetry` / `notificationRetryDelayMs` / `notificationSubmissionViolations` / `NotificationRetryDecision` | pure notification-plane domain logic |
| `NotificationPlaneError` / `NotificationPlaneErrorCode` | typed errors (7 codes) with machine-readable `details` |

Runtime export count: 32 (7 factories, 8 pure domain functions, 8
branded-id builders, 2 error classes, 1 compat builder helper group)
plus 9 frozen vocabulary constants — see the table rows above. The
12-public-method policy budget applies PER PORT — JobQueuePort 10,
DurableJobStorePort 7, NotificationDeliveryPort 11,
NotificationStorePort 11, NotificationProviderPort 1.

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

## The notification plane (NOTIFY-001)

`createNotificationDeliveryPlane({ store, provider, clock, now, ... })`
builds the plane over any `NotificationStorePort` persistence seam and
any `NotificationProviderPort` transport seam. Semantics (all
test-pinned):

- **Dedup idempotency** — per `(tenant, dedupKey)`: the SAME logical
  notification submitted twice yields ONE record; the duplicate submit
  returns the EXISTING record (no second event, no second delivery),
  whatever its status — the key is permanently bound (new notification =
  new key).
- **Declarative kinds** — `mission-event` / `task-assignment` /
  `task-reminder` / `rights-event` / `system-alert`: SEMANTIC categories
  of what happened, never provider/transport specifics. The recipient is
  an `IdentityRef` from the `@mos/contracts` vocabulary; the subject is
  REFERENCES ONLY (artifact refs, human-production-task refs, mission
  refs — never inline content; cross-tenant artifact refs are denied at
  enqueue, §31).
- **Delivery attempts are RECORDED §30 EVENTS** —
  `recordDeliveryAttempt(scope, id, { executor })` performs ONE attempt
  through the injected provider seam and appends exactly one immutable
  event carrying request id (the attempt id), provider ref, actor
  attribution (executor + submitting actor), duration, failure/warnings
  and the transport self-label. Success mints the immutable receipt and
  terminates the record as `delivered`.
- **Receipts (proof-of-delivery surface)** — every successful delivery
  produces an immutable receipt: delivered-at, provider ref, the
  provider's ack ref when it returns one, transport label. Receipts are
  stored once, never updated or deleted, deep-frozen at the store
  boundary, re-readable by receipt id or by notification (both
  tenant-scoped, no existence leaks).
- **Failed delivery → typed reason + declared retry backoff → terminal
  failure** — provider failures are TYPED records over the closed code
  vocabulary (`provider-rejected` permanent / `provider-transport-failed`
  transient). Retriable failures re-queue with the DECLARED backoff
  (the job queue's `JobRetryPolicy` shape, the SHARED `retryDelayMs`
  implementation — zero drift); the next attempt is gated until the
  window elapses (typed `delivery-backoff-not-elapsed`). Declared
  retry-policy EXHAUSTION and non-retriable failures terminate as
  `failed` with the typed failure recorded on the record and in the
  `delivery-failed` event (exhaustion flagged).
- **Suppression is a FIRST-CLASS recorded outcome, never a silent
  drop** — `suppressRecipient(scope, recipient, reason, by)` activates
  the tenant-scoped rule; every FUTURE enqueue for that recipient is
  CREATED with status `suppressed` carrying the rule's reason (events:
  `enqueued` + `suppressed`; the record is readable and listed).
  `suppressNotification(scope, id, reason, by)` suppresses one QUEUED
  notification at record level (terminal records are immutable — typed
  `notification-not-suppressible`). `liftRecipientSuppression` affects
  only future notifications; already-suppressed records stay
  suppressed. Suppression reasons and attributions are validated
  non-empty (typed `invalid-suppression`).
- **Tenant isolation (§31)** — every read/mutation is tenant-scoped;
  foreign-scope access is INDISTINGUISHABLE from unknown (no existence
  leaks). The store keys by `(tenant, id)` / `(tenant, dedupKey)` /
  `(tenant, recipient)` — the W3-A cross-tenant bleed lesson baked in.
- **Ownership** — the store deep-CLONES then freezes everything it
  saves: caller-supplied submissions/subjects/failures are never mutated
  or frozen in place.
- **Determinism** — all stamps come from injectable clocks (ISO +
  epoch-ms), ids from injectable factories; the shipped provider double
  is a pure function of (request, routes). Identical stacks produce
  bit-identical records/events/receipts (pinned).

### The no-task-engine discipline (acceptance core, test-pinned)

The notification plane CONSUMES the durable-record discipline
(idempotency, typed failures, retry, terminal failure, append-only
history) as a parallel narrow surface — it does NOT re-implement
jobs/tasks. Pinned four ways in
`src/adapters/notification-no-task-engine.test.ts`:

1. **Vocabulary scan** — the notification-plane sources (comments and
   strings stripped) contain NO claim/lease/execute/poll/dispatch/
   cancel/heartbeat/renew/work-unit tokens;
2. **Method-set pin** — `NotificationDeliveryPort` exposes exactly the
   eleven declared methods; none is a claim/lease/execute/poll/
   dispatch/cancel surface;
3. **Record-shape pin** — the record vocabulary has no lease/claim/
   token/worker fields and the lifecycle has NO in-flight/running state
   (a failed attempt re-queues; the record is never held);
4. **Semantic pin** — one `recordDeliveryAttempt` call appends exactly
   ONE event (the attempt IS the event) and no plane return value ever
   carries a token-bearing claim object. The durable JOB queue keeps its
   own surface untouched (no notify method — pinned).

### The provider transport seam (disclosed double)

`NotificationProviderPort` is the declared transport seam: ONE method
`deliver(request) → response` plus the binding's declared `providerId`
(§30 provider ref — DATA through the `@mos/contracts` `ProviderId`
vocabulary, the same family the INTEG-001 provider-contract module
owns; this package never imports `mos-integrations`). Every response
SELF-LABELS its `source` — copied onto the §30 attempt record and the
receipt — so double output can never masquerade as live provider
evidence. The shipped `createInMemoryNotificationProviderDouble` is a
DISCLOSED deterministic double (no I/O, pure function of
(request, routes), attempt-indexed DATA routes). REAL provider
bindings (email/push/webhook adapters over the provider-contract
vocabulary) are composition-root work behind the same port.

## Dependencies

- `@mos/contracts` (runtime, the only registry-declared dependency):
  branded ids, `ArtifactRef`, `TenantScope`, `Version`, engine observability
  types, and for the notification plane `IdentityRef` / `MissionRef` /
  `HumanProductionTaskId` / `ProviderId` (the provider-contract vocabulary
  seam — TYPE-level alignment only, no `mos-integrations` import).
- Dev: `@types/node`, `typescript`. The compat directory references
  `../mos-engines` via relative paths (types from source for the pin,
  built dist for the runtime test) — deliberately NOT a package
  dependency.

## Limitations / disclosure

- `createInMemoryDurableJobStore` is a DISCLOSED TEST DOUBLE: process
  -local, ephemeral, never a durability claim. The real durable store +
  Zcode task-infra adapter are future substrate work behind the same
  port.
- `createInMemoryNotificationStore` is the same class of DISCLOSED
  double for the notification plane (process-local, ephemeral — never a
  durability claim); the real store binds behind `NotificationStorePort`.
- `createInMemoryNotificationProviderDouble` is a DISCLOSED transport
  double: deterministic, no I/O, self-labeling every response
  (`in-memory-notification-provider-double`). Real email/push/webhook
  provider bindings over the INTEG-001 provider-contract vocabulary are
  composition-root work — the plane never claims live delivery evidence.
- Recipient-suppression rule changes are upserts (one active rule per
  (tenant, recipient); re-suppressing replaces the reason). The durable
  audit trail of WHO was suppressed and WHY lives on the notification
  records' `suppressed` events + suppression info — the rule itself is
  current-state, not history.
- A notification delivered is terminal (exactly one receipt per
  notification in this wave); re-delivery / multi-transport fan-out is a
  future surface if the composition root needs it.
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
'dist/**/*.test.js'` (101 tests: the 52 JOBS-001 tests — enqueue
idempotency, lease double-claim prevention, backoff-gated retries,
dead-letter with full history, cancel, tenant isolation/no existence
leaks, §30 bridge completeness, heartbeat expiry → reclaim, ownership
cloning, vocabulary pins, no-scheduling-authority pins, poller double —
plus 49 NOTIFY-001 tests: dedup idempotency incl. after delivery,
reference-only subjects, fail-closed validation, tenant/workspace
scoping, receipt immutability + completeness incl. null/custom ack refs,
§30 attempt completeness + executor attribution, retriable failure →
declared backoff + gating → retry → success, retry exhaustion +
non-retriable terminal failures, terminal immutability, recipient +
record suppression with reasons, lifting, dedup interplay, the four-way
no-task-engine structural pin, determinism with injectable clocks) →
builds `../mos-engines` → `tsc -p tsconfig.compat.json` (the
compile-time pin) → `node --test compat/engine-runner-bridge.test.ts`
(the real-runner round-trips).
