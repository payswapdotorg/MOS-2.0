# @mos/integrations — MOS v2.0 provider-integrations authority (INTEG-001)

The connector provider contract of spec/mos-effective-backlog-v2.0.md
INTEG-001: *"Implement provider-definition → implementation →
merchant/client instance → availability capability structure"* with the
acceptance *"capability instances are explicit, provider status/evidence/
UNKNOWN states are preserved, no provider-specific semantics leak into
authorities."* Module authority: `provider-integrations`
(spec/mos-module-registry-v2.0.yaml — owner worker-c, dependencies
`[contracts, capabilities, rights]`).

External providers are NEVER MOS authorities (spec §3): this package owns
the INTEGRATION RECORDS — what a provider is, which concrete
implementations exist and their evidenced status, which merchant/client
identities are bound to them, and which capabilities they explicitly make
available — plus the single call surface through which every provider
interaction happens (rights-gated, §30-recorded). Commerce truth, social
graphs, payment truth all remain EXTERNAL (§25); MOS keeps records and
observations, never the external system's state.

## The four-layer structure

```
ProviderDefinition        (layer 1 — WHAT a provider IS)
  └─ ProviderImplementation     (layer 2 — a concrete versioned implementation,
                                  status + evidence, UNKNOWN first-class)
       ├─ MerchantClientInstance    (layer 3 — tenant binding to a merchant
       │                             identity, CredentialRef HANDLE only)
       └─ AvailabilityCapability    (layer 4 — EXPLICIT capability instance:
                                     capability id + EXACT version + constraints)
```

- **Layer 1 — `ProviderDefinition`** (versioned, tenant-scoped,
  append-only): id, provider identity (DATA), generic kind
  (`PROVIDER_KINDS`), transport contract surface (generic
  `TRANSPORT_KINDS` + the canonical `ConnectorProvider.authentication` /
  `invocationContract` fields), and the DECLARED capability surface —
  every entry explicitly `supported` / `unsupported` / `unknown`
  (parity is never assumed). **Never credentials** — there is no
  credential field at this layer at all.
- **Layer 2 — `ProviderImplementation`** (versioned, append-only): pins
  the exact definition version it implements; carries status
  ∈ `available | unavailable | degraded | unknown` — **UNKNOWN is a
  preserved first-class state, never coerced** (it has its own §30 failure
  code `implementation-status-unknown`), plus `evidenceRefs` (positive
  claims `available`/`degraded` REQUIRE ≥1 evidence ref — fail-closed),
  the canonical `ConnectorProvider` observed posture
  (`evidenceModel`, `errorModel`, `rateLimitObservation`) and the
  provider identity ECHOED from layer 1 (the source of truth). Status
  evolution happens ONLY through append-only corrections.
- **Layer 3 — `MerchantClientInstance`** (versioned, append-only
  rebinds): tenant-scoped named binding of ONE implementation version to
  ONE merchant/client identity. **REFERENCE-ONLY**: the record carries a
  `CredentialRef` — an opaque HANDLE — and NO credential-value surface
  (compile-time exact-keyset pins + runtime strict-shape validation +
  a deep key-scan test). The handle resolves ONLY at the declared
  substrate secret-store seam (`ProviderSecretStorePort`; disclosed
  in-memory double) — §31: credentials remain at integration boundaries.
- **Layer 4 — `AvailabilityCapability`** (versioned, append-only
  corrections): the EXPLICIT capability instance — which capability (id +
  EXACT version, resolving through the REAL `@mos/capabilities`
  vocabulary — unresolvable refs are rejected fail-closed) the
  implementation makes available, with declared constraints. **An
  instance without a capability record provides NOTHING** — availability
  derives ONLY from these records, never from the definition's declared
  surface, never by parity, never by default (test-pinned).

## The call surface — `ProviderInteractionPort` (4 methods; budget 12)

`invoke` runs a five-stage pipeline (each stage's failure is typed,
§30-recorded where attributable, and terminal):

1. **instance resolution** in the caller's tenant (cross-tenant ≡
   unknown, §31 — an unresolvable instance yields the
   `unresolved-instance` outcome with NO audit record: nothing was
   attributable);
2. **rights gate** on the presented `RightsContextRef` — FAIL CLOSED
   without an adequate grant (unknown handle, cross-tenant handle and
   every `@mos/rights` denial reason verbatim; denied interactions never
   reach the transport);
3. **explicit availability** — the bound implementation must carry a
   layer-4 record for the EXACT capability id + version (a definition's
   "supported" declaration is NOT availability);
4. **implementation status gate** — `available` proceeds, `degraded`
   proceeds with a recorded warning, `unavailable` fails, `unknown` fails
   with its own DISTINCT code and is recorded VERBATIM;
5. **transport seam call** — the response self-labels its source, so a
   disclosed in-memory double can never masquerade as live provider
   evidence (AGENTS.md: mocks/doubles can test contracts, never
   production proof).

Plus `listInstanceCapabilities` (the explicit availability resolved
through the capability vocabulary), `listInteractionRecords` and
`getInteractionRecord` (the tenant-scoped §30 audit log).

## Surface

| Export | Kind |
| --- | --- |
| `ProviderDefinition` / `RegisterProviderDefinitionInput` / `TransportContractSurface` / `DeclaredCapabilitySurfaceEntry` + `PROVIDER_KINDS` / `TRANSPORT_KINDS` / `CAPABILITY_SUPPORT_LEVELS` | layer 1 contracts + closed vocabularies |
| `ProviderImplementation` / `RegisterProviderImplementationInput` / `ProviderStatusCorrectionInput` + `PROVIDER_IMPLEMENTATION_STATUSES` | layer 2 contracts + the status vocabulary (UNKNOWN first-class) |
| `MerchantClientInstance` / `RegisterMerchantClientInstanceInput` / `MerchantClientRebindInput` | layer 3 contracts (CredentialRef handle only) |
| `AvailabilityCapability` / `RegisterAvailabilityCapabilityInput` / `AvailabilityConstraint` | layer 4 contracts (explicit capability instances) |
| `ProviderInteractionRequest` / `ProviderInteractionResult` / `ProviderInteractionRecord` / `ProviderInteractionFailure` / `ProviderInteractionWarning` / `InteractionRecordFilter` / `ResolvedInstanceCapability` | the §30 interaction vocabulary |
| `ProviderDefinitionRegistryPort` / `ProviderImplementationRegistryPort` / `MerchantClientInstanceRegistryPort` / `AvailabilityCapabilityRegistryPort` | the four registry ports (5/6/6/5 methods; budget 12) |
| `ProviderInteractionPort` | the call surface (4 methods) |
| `ProviderRightsGatePort` / `ProviderRightsCheckRequest` / `ProviderRightsGateVerdict` / `ProviderRightsDenialReason` | the rights-gate seam (1 method; `@mos/rights` vocabulary) |
| `ProviderSecretStorePort` | the substrate secret-store seam (2 methods; handles only) |
| `ProviderTransportPort` / `ProviderTransportRequest` / `ProviderTransportResponse` | the transport seam (1 method) |
| `ProviderDefinitionId` / `ProviderImplementationId` / `MerchantClientInstanceId` / `AvailabilityCapabilityId` / `ProviderInteractionId` / `CredentialRef` / `RightsContextRef` | branded ids + opaque handles |
| `createInMemoryProviderDefinitionRegistry` / `createInMemoryProviderImplementationRegistry` / `createInMemoryMerchantClientInstanceRegistry` / `createInMemoryAvailabilityCapabilityRegistry` | in-memory registry adapters (working logic; persistence is TL-later) |
| `createInMemoryProviderRightsGate` + `registerRightsContext` | **DISCLOSED DOUBLE** of the rights-gate handle resolution — evaluation delegates to the injected REAL `evaluateRights` |
| `createInMemoryProviderSecretStore` | **DISCLOSED DOUBLE** of the secret-store seam — stores handle metadata ONLY, never secret material |
| `createInMemoryProviderTransportDouble` + `IN_MEMORY_TRANSPORT_SOURCE` | **DISCLOSED DOUBLE** of the transport seam — deterministic, zero-I/O, self-labelling |
| `createInMemoryProviderInteractionPort` / `providerInteractionSubject` | the call-surface runtime + the documented rights-subject derivation |
| `IntegrationsError` / `IntegrationsErrorCode` | typed errors (13 codes) with machine-readable `details` |

Runtime export count: 9 functions (8 factories + 1 pure helper) + 5 frozen
constants + 1 error class — pinned by the authority-discipline test. The
12-public-method policy budget applies PER PORT.

## Registry semantics (all test-pinned)

- **Versioned append-only at every layer** — record versions are
  REGISTRY-ASSIGNED: registering with a fresh id starts at version 1;
  registering with a known in-tenant id appends the next version;
  corrections (`recordStatusCorrection`, `recordRebind`) append new
  immutable versions. Prior versions stay resolvable forever; there is no
  delete/update/patch API on any port.
- **Tenant-scoped with no existence leaks (§31)** — every accessor takes
  the tenant scope; cross-tenant reads are indistinguishable from unknown
  (undefined / empty / the same typed error); the same record id in two
  tenants is two independent records with independent version histories;
  instance names are unique per tenant only; the §30 audit log is
  tenant-isolated; rights contexts do not cross tenants.
- **Fail-closed everywhere** — malformed records, unknown cross-layer
  references, unresolved credential handles, unresolvable capability
  refs, duplicate instance names, positive status claims without
  evidence and malformed interaction requests are typed errors, never
  silent behavior.
- **Strict shape (the credential pin's runtime twin)** — a record
  carrying ANY property beyond its declared field set (e.g. a smuggled
  `secret`) is rejected listing the unexpected fields; the secret-store
  seam rejects escrow declarations carrying credential material.

## Composition seam (src/testing/)

`composeIntegrationsStack` composes the package's registries over the
REAL `@mos/capabilities` registry (seeded with the REAL §5 catalog), the
REAL `evaluateRights` rule of `@mos/rights` (injected into the disclosed
rights-gate double — no rights rule is re-implemented here), and the
disclosed in-memory transport double. RUNTIME IMPORT DISCLOSURE:
`@mos/rights` exports its runtime entry as untranspiled `src/index.ts`,
so the seam imports its BUILT public entrypoint
(`packages/mos-rights/dist/index.js`) by relative path — the W2-C
precedent; the bare specifier replaces it when the sibling exports map is
reconciled. NOT a production composition root.

## Disclosed limits (no production claims)

- The in-memory registries/log are ephemeral process-local scaffolds —
  durable persistence is TL-owned later work behind the same ports.
- The rights-gate double doubles only the handle→grants resolution; the
  production adapter resolves context refs from real rights-authority
  storage.
- The secret-store double escrows NO secret material whatsoever (handle
  metadata only); the real substrate adapter (cloud secret store / Zcode
  secret infrastructure) lands at the same seam.
- **No real network.** The transport seam is a declared port; the shipped
  adapter performs zero I/O (pinned by a no-network structural test) and
  every response self-labels `in-memory-transport-double` so double output
  can never masquerade as live provider evidence.
- Provider specifics live in DATA: no real provider/vendor name appears
  anywhere in this package (fixtures are fictional — aurora-social,
  beacon-pay), and the fictional names appear only in the disclosed
  data/composition seams (test-pinned).

## Future seams (documented, not built here)

- Real transport adapters (HTTP/GraphQL/websocket stacks per provider
  DATA route tables) — composition-root work behind `ProviderTransportPort`.
- Durable registry/audit-log stores behind the four registry ports.
- SOCIAL-001..006 (distribution) build their provider-neutral adapter
  contract and capability matrix ON this structure; NOTIFY-001 provider
  adapters and COMMERCE-001 discovery consume it too.
