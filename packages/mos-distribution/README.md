# @mos/distribution — MOS v2.0 social-distribution authority (SOCIAL-001 + SOCIAL-002..006)

The social adapter contract + capability matrix of
spec/mos-effective-backlog-v2.0.md SOCIAL-001: *"Build provider-neutral
social adapter contract and capability matrix"* with the acceptance
*"capability parity is never assumed; every provider declares
supported/unsupported/unknown capabilities; rights/policy gates precede
provider calls."* W7-C adds the five provider adapters of SOCIAL-002..006
(YouTube / Instagram / Facebook Pages / TikTok / X) as ISOLATED adapter
subtrees behind the same contract (see below). Module authority:
`social-distribution` (spec/mos-module-registry-v2.0.yaml — owner
worker-c, dependencies `[contracts, content, rights, integrations]`;
the registry's `policy` dependency is a DECLARED SEAM only — the policy
package does not exist yet, TL topology decision documented in
MOS2-WAVE5-HARVEST: the gate's contract shape is frozen here as
`SocialPolicyGatePort`, the disclosed in-memory double stands in at
testing/composition seams, and no policy rule is authored in this
package).

Social platforms are NEVER MOS authorities (spec §3): this package owns
the DISTRIBUTION RECORDS — the provider-neutral surface of what a social
platform interaction can be, the channels tenants declare on social
platforms, the platform-said observations/restrictions those platforms
report, and the §30 audit trail of every attributable attempt. MOS
records what platforms SAID, never invents it, and never transforms an
observation into a causal claim (attribution/causality separation is
ATTRIB-001's later domain — the observation record is structurally pure).

## The provider-neutral social surface — `SocialAdapterPort` (11 methods; budget 12)

Five operations, each typed with input contracts carrying CONTENT
ARTIFACT REFS (never inline media bytes in the control plane — §6 /
AGENTS.md "Media") and output records carrying PLATFORM REFS + observed
posture (what the platform said, never what MOS wishes it had said):

- **`publish`** — publish one content artifact ref (`ArtifactRef` of
  `@mos/content`: artifactId/version/digest/storageRef/rightsRef/
  provenanceRef — references only) with a DECLARED presentation
  (`DeclaredSocialPresentation`: generic kind + small control-plane
  data);
- **`schedule`** — publish + time (a platform-confirmed FUTURE
  publication; the record distinguishes the requested go-live time from
  the platform-confirmed one — they may differ);
- **`readObservations`** — read platform-reported metrics as AUTHORITATIVE
  what-the-platform-said `SocialObservationRecord`s;
- **`delete`** — retract one platform post (platform-confirmed;
  retractions APPEND immutable records, they never edit the publication
  log);
- **`listRestrictions`** — read the platform's observed restrictions.

Plus six tenant-scoped append-only log reads: `listPublications`,
`listObservations`, `listRestrictionRecords`, `listRateLimitObservations`
(the transport-observed rate-limit posture log — W7-C),
`listDistributionRecords` (the §30 audit log) and `getDistributionRecord`.

Every operation request may carry an optional **idempotency key** naming
ONE logical provider operation (W7-C): the provider transport bindings
replay the recorded provider answer for a retried logical operation (ONE
provider operation recorded for any number of retries — replay-safe) and
refuse the same key with changed parameters as a typed
`idempotency-key-conflict`. Callers who omit the key get no replay safety
(each call is a fresh provider operation — disclosed).

### The five-stage pipeline (each failure typed, §30-recorded where attributable, terminal)

1. **channel resolution** in the caller's tenant (cross-tenant ≡
   unknown, §31 — an unresolvable channel yields the
   `unresolved-channel` outcome with NO audit record: nothing was
   attributable — the W5-C precedent);
2. **rights gate** on the presented `RightsContextRef` — FAIL CLOSED
   without an adequate grant (every `@mos/rights` denial reason
   VERBATIM; the evaluation is the REAL injected `evaluateRights`, never
   re-implemented; denied interactions never reach the policy gate, the
   capability matrix or the transport — test-pinned by send counting);
3. **policy gate** through the declared `SocialPolicyGatePort` seam —
   FAIL CLOSED (a request matching no policy rule is DENIED with
   `no-matching-policy`; there is no permissive default);
4. **capability matrix** — the channel's declared surface is the whole
   surface: undeclared operation → typed refusal
   (`operation-not-declared`); declared `unsupported` → typed refusal
   (`operation-unsupported`); declared UNKNOWN → its OWN preserved
   outcome (`operation-support-unknown`), recorded VERBATIM, never
   coerced to unsupported;
5. **transport seam call** — the response self-labels its source, and
   the platform-said payload is typed FAIL-CLOSED (never invented: a
   response missing the refs/timestamps an operation requires is a typed
   `invalid-platform-response` failure; absent observation/restriction
   lists are the one honest default — "the platform said nothing").

Every attributable attempt appends an immutable §30 record
(`SocialDistributionRecord`: request id, provider ref, capability
invoked — operation + the matrix declaration that governed it —, actor,
duration, failure/warnings, the rights frame presented, the cited
policy ref, the honest transport-source label) to the tenant-scoped
audit log; there is no unrecorded path past channel resolution.

## The capability matrix — parity is never assumed

Every social channel declares, per operation, a
`SocialProviderCapability` whose `support` is the INTEG-001
provider-contract vocabulary (`CapabilitySupportLevel` imported from
`@mos/integrations` — a registry-allowed dependency of distribution):
`supported` / `unsupported` / `unknown`. The declaration is
provider-authored DATA; it is the OPERATIVE surface for whether the
operation can be invoked through the channel. The canonical
`SocialAdapter.capabilityMatrix: Record<string, boolean>` projection
(`projectCapabilityMatrix`) maps supported→true and unsupported→false
and DELIBERATELY omits `unknown` — it has no honest boolean; the TYPED
matrix is authoritative (a boolean projection of `unknown` would coerce
a preserved-first-class state).

## The SocialChannel record

A versioned, tenant-scoped, append-only registry record declaring one
tenant distribution channel on a social platform: the platform identity
(DATA — the code never branches on it), the INTEGRATIONS binding (a
layer-3 `MerchantClientInstanceId` of `@mos/integrations`, validated
fail-closed at registration to resolve IN THE SAME TENANT — the link
that carries the credential HANDLE at the transport boundary, never a
credential value), the optional external account boundary, and the
DECLARED capability matrix. Channels NEVER carry credentials (there is
no such field). A corrected matrix is a NEW channel version (append-only;
the latest version governs invocations; prior versions stay resolvable).

## Seams (declared ports; disclosed doubles where this wave ships them)

| Seam | Port | This wave |
| --- | --- | --- |
| Channel registry | `SocialChannelRegistryPort` (5 methods) | in-memory working adapter (persistence TL-later) |
| Rights gate | `SocialRightsGatePort` (1 method) | **DISCLOSED DOUBLE** of the handle→grants resolution; the evaluation delegates to the injected REAL `evaluateRights` (`@mos/rights`) |
| Policy gate | `SocialPolicyGatePort` (1 method) | **DECLARED SEAM + DISCLOSED DOUBLE** — the frozen contract shape for the future `@mos/policy` authority (fail-closed; no-matching-policy denial) |
| Transport | `SocialTransportPort` (1 method) | **DISCLOSED DOUBLE** — deterministic, zero-I/O, self-labelling (`in-memory-social-transport-double`); real adapters (SOCIAL-002..006) land at the same seam |

The rights SUBJECT of each operation is a documented deterministic
derivation (`socialArtifactSubject` — grants must NAME the artifact
being distributed, §27; `socialChannelSubject` — the channel's external
account boundary or identity), and the @mos/rights ACTION is a frozen
operation mapping (`SOCIAL_OPERATION_RIGHTS_ACTIONS`: publishing
operations exercise `distribute`; observation operations exercise
`analyze`).

## SOCIAL-002..006 — the five provider adapter subtrees (W7-C)

`src/adapters/providers/{youtube,instagram,facebook-pages,tiktok,x}/` —
five ISOLATED adapter subtrees, each declaring its real platform's
publicly-known API surface **AS DATA** (a `SocialProviderProfile`) on the
SOCIAL-001 contract and binding to the `SocialTransportPort` seam through
the shared provider binding machinery
(`adapters/provider-transport-binding.ts`). Subpath exports
`@mos/distribution/providers/<provider>` are the composition surface —
the provider-neutral package index deliberately carries NO provider
specifics (test-pinned, extended per provider in W7-C).

Each profile declares (validated fail-closed by
`validateSocialProviderProfile`):

- a **capability matrix** — EXACTLY one entry per closed-vocabulary
  operation, `supported`/`unsupported`/`unknown`, declared CONSERVATIVELY
  from public platform knowledge; where support is not confidently
  known the profile declares `unknown` (observation-pending) — never a
  guessed `supported`;
- the **auth model KIND** — the canonical `AuthenticationModel`
  (`oauth2`, `managedBy: "integrations"`) plus the publicly-known flow
  kinds (`authorization-code` / `authorization-code-with-pkce` /
  `device`): a KIND declaration as data, NEVER credentials (there is
  structurally no credential field on a profile — compile-time pinned);
- **operation shapes** — the coarse, publicly-known shapes of the
  platform's publishing surface (video-upload vs image-post vs
  image-carousel vs text-post vs link-preview-post), the artifact type
  families they accept (coarse MIME families), and the presentation
  kinds they accept — provider-specific parameters validated INSIDE the
  subtree: a request outside the declared shapes is a typed
  `operation-shape-unsupported` refusal BEFORE any provider interaction;
- the **evidence basis** — where the declarations come from, what is
  deliberately UNKNOWN, and that nothing is fabricated.

**NO FABRICATED PROVIDER INTERNALS** (the frozen acceptance): no
endpoint URLs, no rate-limit numbers, no error taxonomies are invented
anywhere — those specifics are either publicly known and cited in the
subtree README's claim basis, or deliberately absent
(UNKNOWN/observation-pending). Each subtree README documents every
claim's basis in full. The transport remains the disclosed in-memory
double (real network transport is composition-root future work at the
same seam).

**Adapter-level fail-closed (defense in depth):** the binding enforces
its OWN profile declaration before any provider interaction — an
operation the profile declares `unsupported` is a typed refusal
(`operation-unsupported-at-adapter`), `unknown` gets its OWN preserved
typed outcome (`operation-support-unknown-at-adapter`), EVEN IF a
channel registration declares otherwise. Composition isolation: a
per-provider binding refuses to serve another provider's request
(`provider-adapter-mismatch`).

**Replay/idempotency + rate-limit observations are explicit:** the
binding deduplicates provider operations on
(tenant, channel, operation, idempotency-key) — a retried logical
operation REPLAYS the recorded provider answer (ONE provider operation
recorded for any number of retries, `idempotent-replay` warning on the
§30 record); the same key with different parameters is a typed
`idempotency-key-conflict` refusal. A DECLAREDLY simulated rate-limit
posture (when configured with `simulatedRateLimit`) rides ok responses
as the `rateLimit` observation the adapter runtime types into an
immutable §30-style `SocialRateLimitObservationRecord` (observedAt +
provider refs + the honest self-label — the double's own fictional
numbers, never presented as the platform's real rate limits, which are
never invented). A malformed transport-reported posture is a WARNING
(`rate-limit-observation-untypable`) — never silently dropped, never
fatal to the completed interaction.

`providerOperations()` on each binding exposes the provider-operation
log — ONE record per provider interaction (what a real adapter would
have sent over the network); replays and pre-interaction refusals append
none.

## Registry semantics (all test-pinned)

- **Versioned append-only** — record versions are REGISTRY-ASSIGNED:
  registering with a fresh id starts at version 1; registering with a
  known in-tenant id appends the next version. No delete/update/patch
  API anywhere (publications, observations, restrictions, retractions
  and §30 records are immutable appended records).
- **Tenant-scoped with no existence leaks (§31)** — every accessor takes
  the tenant scope; cross-tenant reads are indistinguishable from
  unknown; the same channel id in two tenants is two independent records
  with independent version histories; channel names are unique per
  tenant only; every log is tenant-isolated; rights contexts and policy
  rules never cross tenants.
- **Fail-closed everywhere** — malformed requests/registrations, unknown
  integrations bindings, duplicate matrix entries, out-of-vocabulary
  support levels/presentation kinds, smuggled extra fields (the
  strict-shape guard that structurally keeps media bytes and credential
  fields out of the control plane) are typed errors, never silent
  behavior.
- **Platform-said purity** — the observation record's keyset is
  compile-time pinned; there is no field through which a causal claim
  could even be expressed (ATTRIB-001's later domain).

## Composition seam (src/testing/)

`composeDistributionStack` composes the channel registry, rights gate,
policy gate, transport double and adapter runtime over the REAL
`@mos/integrations` registries (the channel's `instanceRef` binding
resolves through the ACTUAL integrations authority vocabulary) and the
REAL `evaluateRights` rule of `@mos/rights` (injected into the disclosed
rights-gate double — no rights rule is re-implemented here). RUNTIME
IMPORT DISCLOSURE (the W5-C precedent): `@mos/rights` and
`@mos/integrations` resolve their bare specifiers to untranspiled
sources in some waves, so the seam imports their BUILT public
entrypoints (`dist/index.js`) by relative path — the same public
surfaces the bare specifiers resolve to after `tsc -b`. NOT a production
composition root.

## Disclosed limits (no production claims)

- The in-memory registries/logs are ephemeral process-local scaffolds —
  durable persistence is TL-owned later work behind the same ports.
- The rights-gate double doubles only the handle→grants resolution; the
  production adapter resolves context refs from real rights-authority
  storage through the same port.
- The policy-gate double is a stand-in for the future `@mos/policy`
  authority (registered DATA rules, fail-closed no-match denial); the
  seam's contract shape is frozen and the double retires when the
  authority lands.
- **No real network.** The transport seam is a declared port; the
  shipped adapter performs zero I/O (pinned by a no-network structural
  test) and every response self-labels so double output can never
  masquerade as live platform evidence. The five provider transport
  bindings are disclosed doubles over the same seam (real network
  transport is composition-root future work).
- Provider specifics live in DATA: the five real platform names appear
  ONLY inside their own `src/adapters/providers/<provider>/` subtrees
  (never in the shared authority-facing surfaces, never in another
  provider's subtree — test-pinned, extended per provider in W7-C);
  every other real vendor name is forbidden everywhere in the package
  source; fictional fixture providers (aurora-social, cinder-social,
  dune-social, ember-social) appear only in the disclosed
  data/composition seams (test-pinned).
- The schedule/retraction logs have no dedicated read method yet — the
  operations' outputs + the §30 audit log cover this wave's evidence;
  the retrieval surface grows with later SOCIAL items within the ≤12
  method budget.

## Future seams (documented, not built here)

- The REAL network transports of the five provider adapters (actual API
  calls, OAuth2 token handling at the substrate boundary, real
  rate-limit/error surfaces observed verbatim) behind
  `SocialTransportPort` as composition-root replacements for the
  disclosed doubles; provider profiles then tighten from
  conservative/UNKNOWN declarations to OBSERVED postures.
- The policy authority's real gate behind `SocialPolicyGatePort`.
- HEALTH-001 (platform health / distribution anomaly) consumes the
  restriction observations — observable-only, provider-confirmed vs
  suspected separated.
- ATTRIB-001 (social-to-commerce attribution) consumes the observation
  records as ITS input — the causal layer stays out of this package.
- Durable registry/log stores behind the same ports; executing
  platform-confirmed schedules through the durable-jobs authority.
