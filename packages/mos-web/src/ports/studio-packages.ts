import type {
  ArtifactId,
  CreationMethod,
  StudioArtifactPackageId,
  StudioSessionId,
  TenantScope,
} from '@mos/contracts';

/**
 * Studio package-library view port (UX-002, over STUDIO-014).
 *
 * The Studio surface's READ side over the standalone studio product's
 * immutable package browsing: tenant-scoped package summaries and the full
 * append-only version chain of one package — every version's §14 synthetic
 * provenance disclosure (synthetic content is VISIBLY labeled synthetic),
 * its §15 consent coverage, its §19 evaluation state with the §30-attributable
 * review citation, its artifact lineage counts and its §6 stage structure.
 *
 * The studio NEVER publishes (architecture §13, lock #28): this surface has
 * NO publish action and shows hand-off state only — packages are handed off
 * through ports to the Lab / distribution authorities. The standing
 * disclosure lives in the presentation data (`STUDIO_HANDOFF_NOTE`).
 *
 * View port discipline as `studio-directory.ts`: view models re-declared
 * from the STUDIO-014 `StudioArtifactPackagingPort` browsing shapes,
 * importing only `@mos/contracts` types; composition OUTSIDE `src/`.
 */

/** Artifact pipeline stage as presented (§6: raw → intermediate → final). */
export type StudioArtifactStageView = 'raw' | 'intermediate' | 'final';

/**
 * One packaged artifact as labeled for §14 provenance disclosure. The
 * creation method is the canonical vocabulary, shown verbatim; `synthetic`
 * marks engine-generated material (§14: generated material retains its
 * synthetic/generated provenance — visibly labeled, never laundered).
 */
export interface StudioArtifactLabelView {
  readonly artifactId: ArtifactId;
  /** Media/type classification (audio, video, image, text, timeline, graph). */
  readonly type: string;
  readonly stage: StudioArtifactStageView;
  /** How this artifact came to exist (canonical CreationMethod vocabulary). */
  readonly creationMethod: CreationMethod;
  /** True only for engine-generated material (the §14 synthetic label). */
  readonly synthetic: boolean;
  /** Parent artifact versions (immutable lineage, §6). */
  readonly parentCount: number;
}

/** §19 evaluation state of one package version as presented. */
export interface StudioPackageEvaluationView {
  readonly status: 'pending' | 'evaluated';
  /**
   * The distinct outcome kinds — a quality rejection is never conflated with
   * a rights/policy rejection (§19).
   */
  readonly outcome:
    | 'accepted'
    | 'quality-rejected'
    | 'rights-policy-rejected'
    | 'treatment-requested'
    | 'not-applicable';
  /** §30 citation of the evaluation/review record, when one exists. */
  readonly evaluationRef: string | null;
}

/** §14 provenance summary of one package version as presented. */
export interface StudioPackageProvenanceView {
  /** True when any packaged material is synthetic/generated (must stay disclosed). */
  readonly containsSyntheticMaterial: boolean;
  /** True only when every artifact's full parent lineage is recorded (§6). */
  readonly lineageComplete: boolean;
  /** Provenance records covering the package's artifact versions. */
  readonly provenanceRefCount: number;
}

/** §15/§27 consent coverage of one package version as presented. */
export interface StudioPackageConsentView {
  /** True only when every raw artifact is covered by at least one consent record. */
  readonly allRawArtifactsCovered: boolean;
  /** Consent records from contributing participants. */
  readonly participantConsentCount: number;
}

/** One immutable version of a studio artifact package, as browsed. */
export interface StudioPackageVersionView {
  readonly packageId: StudioArtifactPackageId;
  /** Append-only chain position (treatments compose version+1, §19). */
  readonly version: number;
  readonly sessionRef: StudioSessionId;
  /** ISO-8601 timestamp this version was composed. */
  readonly createdAt: string;
  readonly evaluation: StudioPackageEvaluationView;
  readonly provenance: StudioPackageProvenanceView;
  readonly consent: StudioPackageConsentView;
  /** §14 labels of the final artifacts (synthetic marks visible per artifact). */
  readonly finalArtifacts: readonly StudioArtifactLabelView[];
  /** Artifact counts per §6 stage (raw / intermediate / final). */
  readonly artifactCounts: {
    readonly raw: number;
    readonly intermediate: number;
    readonly final: number;
  };
  /** Transcripts included in the package. */
  readonly transcriptCount: number;
  /** The recorded edit graph (§12 — OTIO interchange shown when exported). */
  readonly editGraph: {
    readonly graphId: string;
    readonly version: number;
    readonly otioInterchange: boolean;
  };
  /** Production cost of this version's composition. */
  readonly cost: { readonly currency: string; readonly amount: string };
  /** Production durations in seconds. */
  readonly durationSeconds: {
    readonly capture: number;
    readonly processing: number;
    readonly totalWallClock: number;
  };
}

/** One package as it appears in the library listing. */
export interface StudioPackageSummaryView {
  readonly packageId: StudioArtifactPackageId;
  readonly sessionRef: StudioSessionId;
  /** Latest composed version (append-only chain length ≥ 1). */
  readonly latestVersion: number;
  /** How many immutable versions the chain holds. */
  readonly versionCount: number;
}

/**
 * The full version chain of one package, ascending — the immutable artifact
 * lineage made visible: every treatment composed a NEW linked version and
 * predecessors are never rewritten (§19).
 */
export interface StudioVersionChainView {
  readonly packageId: StudioArtifactPackageId;
  readonly sessionRef: StudioSessionId;
  /** Immutable versions in ascending chain order (v1 → v2 → …). */
  readonly versions: readonly StudioPackageVersionView[];
}

/** Typed failure shapes for the package library port. */
export type StudioPackageLibraryFailure =
  | { readonly error: 'studio-package-library-unavailable'; readonly message: string }
  | { readonly error: 'studio-package-not-found'; readonly message: string };

/**
 * The declared Studio package-library view surface (read-only browsing; no
 * publish actions — hand-off state only). Async by design: the production
 * binding is a service call.
 */
export interface StudioPackageLibraryPort {
  /**
   * Summaries of every artifact package the studio composed in one tenant
   * scope (§31 — cross-tenant packages are never listed or leaked).
   */
  listStudioPackages(
    scope: TenantScope,
  ): Promise<readonly StudioPackageSummaryView[] | StudioPackageLibraryFailure>;

  /**
   * The full immutable version chain of one package, or
   * `studio-package-not-found` for unknown/cross-tenant ids.
   */
  loadStudioPackageChain(
    packageId: StudioArtifactPackageId,
    scope: TenantScope,
  ): Promise<StudioVersionChainView | StudioPackageLibraryFailure>;
}
