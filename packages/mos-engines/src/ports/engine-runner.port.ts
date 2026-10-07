/**
 * Engine runner port + sandbox context contracts (ENG-003).
 *
 * Basis: spec/mos-architecture-v2.0.md §11 (engine runner: EngineJob in →
 * EngineResult out; default engine sandbox — no MOS database credentials,
 * no provider credentials, no arbitrary filesystem access, network denied
 * unless explicitly granted, explicit CPU/GPU/memory/time quotas) and
 * spec/mos-engine-policy-v2.0.yaml `runner` (defaultNetwork denied,
 * databaseCredentials none, providerCredentials none, filesystem
 * scoped-artifacts-only, resourceQuotasRequired, timeoutRequired,
 * seedRequiredWhenSupported).
 *
 * THE SANDBOX CONTEXT IS THE ADAPTER'S WHOLE WORLD:
 * - `job`: the EngineJob being executed (already policy-checked);
 * - `network`: the ONLY network capability, fail-closed behind the policy;
 * - `artifacts`: a JOB-SCOPED ArtifactStorePort view (scoped-artifacts-only
 *   filesystem — adapters resolve the job's declared input refs and persist
 *   outputs; arbitrary paths cannot even be expressed);
 * - `quotas`: the granted ResourceLimits for this invocation;
 * - `seed`: the determinism seed (`null` only for non-deterministic engines).
 *
 * There is NO credential surface on this context — structurally. MOS
 * database credentials and provider credentials stay OUTSIDE the sandbox
 * (policy `runner.databaseCredentials/providerCredentials: none`); the
 * compile-time key-set pin and the runtime scans live in
 * sandbox-policy.test.ts. Port files never import @zcode/*
 * (boundary rule PORTS-NO-ZCODE).
 */

import type {
  ArtifactRef,
  ArtifactType,
  EngineJob,
  EngineResult,
  RightsRef,
  TenantId,
  Timestamp,
  ProvenanceRef,
  ResourceLimits,
} from "@mos/contracts";

import type { EngineAdapter } from "./engine-adapter.port.js";

// ---------------------------------------------------------------------------
// Network policy (defaultNetwork: denied)
// ---------------------------------------------------------------------------

/**
 * The effective network policy for one adapter invocation. `'denied'`
 * unless the engine manifest declares `networkAccess:
 * "explicitly-granted"` AND the submission carries an explicit network
 * grant (fail-closed conjunction).
 */
export type NetworkPolicy =
  | { readonly access: "denied" }
  | {
      readonly access: "explicitly-granted";
      readonly allowedHosts: readonly string[];
    };

/**
 * The only network surface an adapter sees. Requests under a denied policy
 * (or to a non-granted host under a granted policy) fail closed with the
 * typed `network-access-denied` / `network-host-not-granted` violation,
 * which the runner converts into the job's typed failure — the run NEVER
 * silently proceeds after a denied network attempt.
 */
export interface SandboxNetworkPort {
  readonly policy: NetworkPolicy;
  /** Fetches `url` under the effective policy; typed fail-closed otherwise. */
  request(url: string): Promise<Uint8Array>;
}

// ---------------------------------------------------------------------------
// Scoped artifact access (filesystem: scoped-artifacts-only)
// ---------------------------------------------------------------------------

/** One resolved artifact: its immutable ref plus the artifact bytes. */
export interface EngineArtifactRecord {
  readonly ref: ArtifactRef;
  readonly bytes: Uint8Array;
  readonly resolvedAt: Timestamp;
}

/** Input for materializing one new engine-generated artifact version. */
export interface PersistArtifactInput {
  /** Tenant scope — REQUIRED (requireTenantScopeOnMutableArtifacts). */
  readonly tenantId: TenantId;
  readonly type: ArtifactType;
  readonly bytes: Uint8Array;
  /** Rights context that travels with the produced ref (spec §6). */
  readonly rightsRef: RightsRef;
  /** Provenance context that travels with the produced ref (spec §6). */
  readonly provenanceRef: ProvenanceRef;
  /** Parent artifact refs (lineage; spec §6 immutable lineage). */
  readonly lineage?: readonly ArtifactRef[];
}

/**
 * Engine-side artifact storage (scoped-artifacts-only filesystem). The
 * runner hands adapters a JOB-SCOPED view over this port: only the job's
 * declared input refs resolve, and only artifacts persisted during the run
 * become visible outputs. Media bytes move through this port, never over
 * the control plane (spec §6/AGENTS.md "Media").
 */
export interface EngineArtifactStorePort {
  /** Resolves one artifact ref, or `undefined` when out of scope/unknown. */
  resolve(ref: ArtifactRef): Promise<EngineArtifactRecord | undefined>;
  /** Materializes one new artifact version and returns its ref. */
  persist(input: PersistArtifactInput): Promise<ArtifactRef>;
}

// ---------------------------------------------------------------------------
// Sandbox context — the adapter's whole world (NO credential surface)
// ---------------------------------------------------------------------------

/**
 * The context every adapter invocation receives. The exact key set is
 * pinned (compile-time + runtime) in sandbox-policy.test.ts: adding any
 * field — in particular any credential-shaped field — fails the build.
 */
export interface EngineSandboxContext {
  readonly job: EngineJob;
  readonly network: SandboxNetworkPort;
  readonly artifacts: EngineArtifactStorePort;
  readonly quotas: ResourceLimits;
  readonly seed: number | null;
}

// ---------------------------------------------------------------------------
// Submission options
// ---------------------------------------------------------------------------

/**
 * Per-submission options. The network grant is the ONLY way an explicitly
 * granted engine manifest ever gets network: without a grant the effective
 * policy stays `'denied'` even for granted manifests (belt and braces).
 */
export interface EngineJobSubmissionOptions {
  readonly networkGrant?: {
    readonly allowedHosts: readonly string[];
  };
}

// ---------------------------------------------------------------------------
// The runner port
// ---------------------------------------------------------------------------

/**
 * Executes EngineJobs inside the policy-faithful sandbox via REGISTERED
 * EngineAdapters (spec §11). Domain modules submit jobs and receive
 * EngineResults — every policy violation is a TYPED FAILURE in the result
 * record (auditable), never a crash, never a silent success.
 *
 * 2 public methods (policy budget 12).
 */
export interface EngineRunnerPort {
  /**
   * Registers the executable adapter for its exact engine identity
   * (`adapter.engineId` + `adapter.engineVersion`). Composition-root
   * wiring: the registry records adapter IDENTITY (`adapterRef`); the
   * runner holds the EXECUTABLE. Duplicate registration for the same
   * identity is a typed error (adapter already registered).
   */
  registerAdapter(adapter: EngineAdapter): void;

  /**
   * Submits one job. Enforces, in order: EngineJob contract shape; engine
   * registration (any REGISTERED version — historical reproducibility);
   * sandbox posture of the manifest; resource-limit validity and adequacy
   * vs the engine's declared ResourceProfile; seed policy
   * (seedRequiredWhenSupported); adapter registration; then executes the
   * adapter with a wall-clock deadline, the network fail-closed seam, the
   * job-scoped artifact store and the global-fetch guard, and finally
   * validates the returned EngineResult (identity echo, usage within the
   * granted quotas, outputs materialized inside the sandbox scope).
   */
  submit(
    job: EngineJob,
    submissionOptions?: EngineJobSubmissionOptions,
  ): Promise<EngineResult>;
}
