import type { TenantId, TenantScope } from '@mos/contracts';

/**
 * Lab next-steps bridge view port (UX-003, over the §24 real-world
 * boundary — the DECLARED authorized path).
 *
 * The Lab workspace's Next Steps section: the bridge between a selected
 * Lab candidate and REALITY. Spec §24 prescribes exactly one authorized
 * path —
 *
 *   Lab candidate → Mission → Policy/Rights/Assets → Production/Studio →
 *   Distribution/Integration → Workflow/Execution → platform →
 *   Evidence/Measurement/Experiment → Learning/Calibration —
 *
 * and this port surfaces that path as DECLARED, presentation-only
 * descriptions of the MOS authorities that gate each step. It NEVER
 * performs a step: creating missions, requesting production, distributing,
 * running experiments and recording learning are the owning authorities'
 * actions, reached through their own surfaces (the Missions surface for
 * mission creation; Production/Studio/Distribution/Experiment through the
 * MOS authorities behind them). NO BYPASS: the bridge names WHICH
 * authority gates the next step and what it will require — it does not
 * offer a shortcut around the boundary, and it states plainly that no
 * real-experiment binding exists yet when none does (the Lab cannot and
 * does not fabricate one).
 *
 * View port discipline as `lab-benchmark.ts`: presentation-shaped view
 * models, importing only `@mos/contracts` types; composition OUTSIDE
 * `src/`. The candidate inventory the bridge presents is derived from the
 * records the OTHER lab view ports already list (benchmark candidates,
 * learned strategies, organization search leaders, promoted transforms) —
 * projection only, never creative.
 */

/** One step of the §24 authorized path (the frozen ordering). */
export interface LabBridgeStepView {
  /** 1-based position in the §24 path (declaration order). */
  readonly position: number;
  /** The path stage id (presentation key of the frozen §24 sequence). */
  readonly stageId:
    | 'lab-candidate'
    | 'mission'
    | 'policy-rights-assets'
    | 'production-studio'
    | 'distribution-integration'
    | 'workflow-execution'
    | 'platform'
    | 'evidence-measurement-experiment'
    | 'learning-calibration';
  /** Presentation label of the step. */
  readonly label: string;
  /**
   * The MOS AUTHORITY that gates this step (the module that owns the
   * decision — e.g. the Missions authority for mission creation). This is
   * the anti-bypass pin: the bridge names the gatekeeper, never performs
   * the step.
   */
  readonly gatingAuthority: string;
  /**
   * What the gating authority will require at this step (declared
   * description — verbatim facts of the authorized workflow, never
   * invented requirements).
   */
  readonly requires: string;
  /**
   * The MOS surface route where this step is performed, when one exists
   * in this shell (e.g. `/missions`); null when the step's surface is not
   * a web-shell surface (the platform itself, the evidence pipeline).
   */
  readonly surfaceRoute: string | null;
}

/** Which lab authority produced the candidate being handed off. */
export type LabBridgeCandidateKindView =
  | 'benchmark-candidate'
  | 'learned-strategy'
  | 'organization-candidate'
  | 'promoted-transform';

/** One lab candidate the bridge can describe the handoff for. */
export interface LabBridgeCandidateView {
  /** Stable bridge selection id (`<kind>:<authority id>`). */
  readonly handoffId: string;
  readonly kind: LabBridgeCandidateKindView;
  /** The candidate's own id in its producing authority. */
  readonly candidateRef: string;
  /** Presentation label (the candidate's own label, or its id). */
  readonly label: string;
  /** The lab authority that produced/evaluated the candidate. */
  readonly producedBy: string;
  /**
   * §20/§24 PIN: relayed verbatim — every lab candidate is a
   * simulation-derived selection input, never deployment evidence.
   */
  readonly counterfactual: true;
}

/**
 * The DECLARED handoff description for one selected Lab candidate: the
 * §24 path steps with the authority that gates each, the candidate's
 * selection facts, and the honest state of the real-experiment binding —
 * `binding: null` states plainly that NO real experiment has been bound
 * to this candidate yet (the boundary has not been crossed; the bridge
 * never implies otherwise).
 */
export interface LabCandidateHandoffView {
  readonly candidate: LabBridgeCandidateView;
  /** The §24 authorized path, in frozen declaration order. */
  readonly path: readonly LabBridgeStepView[];
  /**
   * The real-experiment binding state: `null` = no binding exists (the
   * honest un-crossed boundary); when one exists it names the bound
   * mission/production/experiment refs (the Experiment authority's own
   * record — relayed, never created here).
   */
  readonly binding: {
    readonly missionRef: string;
    readonly productionRequestRef: string;
    readonly experimentRef: string;
    readonly evidenceRef: string;
  } | null;
  /**
   * §24 note carried verbatim on the handoff: lab output informs
   * SELECTION; the real-experiment boundary is the only path to
   * reality-grade proof.
   */
  readonly labOnly: string;
}

/** Typed failure shapes for the bridge port. */
export type LabBridgeFailure =
  | { readonly error: 'lab-bridge-unavailable'; readonly message: string }
  | { readonly error: 'lab-handoff-not-found'; readonly message: string };

/**
 * The declared Lab next-steps bridge view surface (read-only, 2 methods ≤
 * 12 policy budget). Async by design; unknown and cross-tenant handoff
 * ids are the SAME explicit miss (§31, no existence leak).
 */
export interface LabBridgeViewPort {
  /**
   * The §24 authorized path (all steps, frozen order) plus every lab
   * candidate visible in the tenant scope that the bridge can describe a
   * handoff for — the Next Steps section's directory.
   */
  loadLabBridgeDirectory(
    scope: TenantScope,
  ): Promise<{ readonly tenantId: TenantId; readonly path: readonly LabBridgeStepView[]; readonly candidates: readonly LabBridgeCandidateView[] } | LabBridgeFailure>;

  /**
   * The DECLARED handoff description for ONE selected lab candidate.
   * `lab-handoff-not-found` for unknown/cross-tenant ids (no existence
   * leak across tenants, §31).
   */
  loadCandidateHandoff(
    handoffId: string,
    scope: TenantScope,
  ): Promise<LabCandidateHandoffView | LabBridgeFailure>;
}
