/**
 * BRIDGE-003 — the DECLARED Lab-candidate reader seam (the consumed
 * LAB-017 surface).
 *
 * REGISTRY EXACTNESS (the W6-C/W8-A declared-seam precedent): `@mos/lab`
 * is NOT a registry dependency of the experiments module (registry deps:
 * contracts, missions, production, distribution, jobs), so the lab
 * candidate citation arrives through THIS experiments-owned declared port
 * whose shapes are pinned against the REAL `@mos/lab` shapes at compile
 * time (compat/lab-authority-compat.ts — relative TYPE-ONLY imports, no
 * runtime dependency edge) and proven end-to-end at runtime
 * (compat/experiments-real-stack.test.ts wires the REAL LAB-017 benchmark
 * authority behind this port).
 *
 * THE CONSUMED SEAM (do not re-invent): the selected lab candidate is ONE
 * FROZEN `RobustBenchmarkRecord` entry — the citation names (benchmark id,
 * benchmark record version, candidate key present in that record's
 * `ranked` set). The record carries the per-candidate expected reward +
 * interval + §22 uncertainty + full version provenance. This surface
 * READS those frozen records; it never re-runs, re-ranks or rewrites
 * them, and it NEVER treats their counterfactual numbers as observations
 * (lock rule 29 — pinned in type-pins.ts and re-validated at runtime).
 */

import type { TenantScope, UncertaintySummary } from "@mos/contracts";

// ---------------------------------------------------------------------------
// The citation (what the binding declares about the selected candidate)
// ---------------------------------------------------------------------------

/**
 * The DECLARED citation of the selected LAB-017 benchmark candidate: which
 * frozen benchmark record (id + EXACT version) and which ranked candidate
 * key. Resolves through the injected {@link LabCandidateReaderPort};
 * unresolvable citations fail closed with the typed
 * `lab-candidate-unresolved` (never fabrication).
 */
export interface LabCandidateCitation {
  /** The benchmark record chain id (the lab's `RobustBenchmarkId` value). */
  readonly benchmarkId: string;
  /** The EXACT benchmark record version cited (never "latest"). */
  readonly benchmarkVersion: number;
  /** A candidate key present in that record's `ranked` set. */
  readonly candidateKey: string;
}

// ---------------------------------------------------------------------------
// The counterfactual expectations (lock rule 29 — cited, never evidence)
// ---------------------------------------------------------------------------

/**
 * The candidate's DECLARED EXPECTATIONS copied VERBATIM from the cited
 * frozen benchmark record's per-candidate evaluation. These stay
 * counterfactual FOREVER inside experiment records (§20/§29): only
 * MEASURED platform-said evidence is real. The `counterfactual: true`
 * literal makes the expectations structurally ineligible for any evidence
 * slot (compile-pinned in type-pins.ts, re-validated at runtime).
 */
export interface LabCandidateExpectations {
  /** The candidate evaluation's expected reward (finite). */
  readonly expectedReward: number;
  /** The §22 prediction interval (finite, lower ≤ upper). */
  readonly interval: { readonly lower: number; readonly upper: number };
  /** The §22 uncertainty summary (verbatim). */
  readonly uncertainty: UncertaintySummary;
  /** The reward spec version the prediction was valued under (provenance). */
  readonly rewardSpecVersion: number;
  /** LOCK RULE 29 PIN: a declared lab estimate, never evidence. */
  readonly counterfactual: true;
}

// ---------------------------------------------------------------------------
// The resolved snapshot (the seam's answer)
// ---------------------------------------------------------------------------

/**
 * The resolved LAB-017 candidate snapshot: the citation plus the frozen
 * counterfactual expectation statement and the lab's own disclosure
 * string VERBATIM. The experiments authority records this citation; it
 * never interprets, adjusts or re-values a single number.
 */
export interface LabCandidateSnapshot {
  readonly citation: LabCandidateCitation;
  readonly expectations: LabCandidateExpectations;
  /** The lab record's own honest disclosure string, VERBATIM. */
  readonly disclosure: string;
  /** When the lab benchmarked the candidate (the lab's own stamp). */
  readonly benchmarkedAt: string;
  /**
   * RUNTIME RE-VALIDATION PIN: the seam must serve `counterfactual ===
   * true` expectations — a snapshot whose expectations are not
   * counterfactual-labeled fails closed with
   * `lab-candidate-not-counterfactual` (the LAB-018 double-cast-guard
   * discipline; the adapter is the last line, never the first).
   */
}

// ---------------------------------------------------------------------------
// The port
// ---------------------------------------------------------------------------

/**
 * The declared lab-candidate reader seam. 1 public method (policy budget:
 * 12). `null` when the citation does not resolve in this tenant scope
 * (unknown ≡ cross-tenant, §31 — no existence leaks). The REAL adapter
 * (compat battery) projects the LAB-017 benchmark record's own ranked
 * entry onto the snapshot; the disclosed in-memory double lives in
 * adapters/in-memory-lab-candidate-reader.ts.
 */
export interface LabCandidateReaderPort {
  /**
   * Resolve one cited LAB-017 candidate to its frozen snapshot, or `null`
   * when unknown in this tenant scope. READ ONLY — never re-runs the lab
   * (async: the REAL benchmark authority's record reads are async — the
   * seam matches the consumed surface, zero-drift).
   */
  getLabCandidate(
    scope: TenantScope,
    citation: LabCandidateCitation,
  ): Promise<LabCandidateSnapshot | null>;
}
