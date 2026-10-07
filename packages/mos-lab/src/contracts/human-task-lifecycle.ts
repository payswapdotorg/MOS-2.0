import type {
  ArtifactRef,
  HumanProductionTaskId,
  IdentityRef,
  TenantScope,
  Timestamp,
} from '@mos/contracts';
import type { ArenaProviderRef, ArenaTaskOfferRecord } from './arena-provider-seam.js';

/**
 * Human production task LIFECYCLE contracts (LAB-014, §17).
 *
 * Basis: spec/mos-architecture-v2.0.md §17 (fulfillment: project owner /
 * authorized collaborator / Arena provider; human output returns as an
 * INTERMEDIATE artifact), §2 (the complete loop — accept/treat/retry/
 * substitute/abandon, with abandonment FIRST-CLASS), §18 (delay economics:
 * waiting is a decision variable; abandoned branches remain auditable),
 * architecture lock rules 15 (raw human media is intermediate unless
 * explicitly accepted as final) and 27 (Arena is an Integration provider).
 */

/** The three §17 fulfillment paths. */
export type HumanFulfillmentPath =
  | { readonly kind: 'project-owner' }
  | { readonly kind: 'authorized-collaborator'; readonly collaboratorRef: IdentityRef }
  | { readonly kind: 'arena-provider'; readonly provider: ArenaProviderRef };

/** The task lifecycle: created → offered → in-progress → delivered → evaluated → completed | abandoned. */
export type HumanTaskStatus =
  | 'created'
  | 'offered'
  | 'in-progress'
  | 'delivered'
  | 'evaluated'
  | 'completed'
  | 'abandoned';

/** The Lab's evaluation verdict on a delivered human output (§19 vocabulary). */
export type HumanTaskEvaluationVerdict =
  | 'accepted'
  | 'rejected-quality'
  | 'rejected-strategy'
  | 'treatment-requested';

/** The recorded evaluation of one delivery (the evaluator ref is on the task). */
export interface HumanTaskEvaluation {
  readonly verdict: HumanTaskEvaluationVerdict;
  readonly note: string;
  readonly evaluatedAt: Timestamp;
}

/** Why a task was abandoned (§2/§18: abandonment is first-class, never silent). */
export type HumanTaskAbandonmentCause =
  | 'deadline-expiry'
  | 'substitute-switch'
  | 'caller-decision';

/** One entry of the ordered substitute preference list (§17). */
export interface HumanTaskSubstitute {
  /** 1-based preference order (strictly ascending across the list). */
  readonly preference: number;
  readonly path: HumanFulfillmentPath;
}

/**
 * The abandonment record — always terminal. When the ordered substitute
 * list yielded the next fulfillment path, the switch is RECORDED here
 * (original + substitute + reason), never silent.
 */
export interface HumanTaskAbandonment {
  readonly cause: HumanTaskAbandonmentCause;
  readonly reason: string;
  /** The fulfillment path being abandoned (null if never offered). */
  readonly originalPath: HumanFulfillmentPath | null;
  /** The substitute path the ordered list yielded (null when none). */
  readonly substitutePath: HumanFulfillmentPath | null;
  readonly abandonedAt: Timestamp;
}

/** Deliver a task's human output as INTERMEDIATE artifact refs (never inline content). */
export interface DeliverHumanTaskInput {
  readonly scope: TenantScope;
  /** The delivered human output — intermediate artifact references, non-empty. */
  readonly artifactRefs: readonly ArtifactRef[];
}

/** Evaluate a delivered task (the verdict; the evaluator ref is on the task). */
export interface EvaluateHumanTaskInput {
  readonly scope: TenantScope;
  readonly verdict: HumanTaskEvaluationVerdict;
  readonly note: string;
}

/** Abandon a task (caller-decision or substitute switch). */
export interface AbandonHumanTaskInput {
  readonly scope: TenantScope;
  readonly reason: string;
  /** Select the next untried substitute from the ordered preference list. */
  readonly selectSubstitute?: boolean;
}

/** The append-only lifecycle event kinds. */
export type HumanTaskEventKind =
  | 'created'
  | 'offered'
  | 'arena-offer-rejected'
  | 'accepted'
  | 'delivered'
  | 'evaluated'
  | 'abandoned';

/**
 * One APPEND-ONLY lifecycle event: every transition and every Arena
 * interaction is recorded — switches, deliveries and provider outcomes are
 * never silent. Events are immutable; the log is the task's audit trail.
 */
export interface HumanTaskLifecycleEvent {
  /** Deterministic 1-based sequence within the task's history. */
  readonly seq: number;
  readonly taskId: HumanProductionTaskId;
  /** The task version this event produced. */
  readonly taskVersion: number;
  readonly kind: HumanTaskEventKind;
  readonly detail: string;
  /** The recorded Arena interaction ('offered' / 'arena-offer-rejected' events). */
  readonly arenaOffer?: ArenaTaskOfferRecord;
  /** The intermediate artifact references ('delivered' events). */
  readonly artifactRefs?: readonly ArtifactRef[];
  /** The evaluation verdict ('evaluated' events). */
  readonly verdict?: HumanTaskEvaluationVerdict;
  /** The substitute path yielded at abandonment ('abandoned' events). */
  readonly substitutePath?: HumanFulfillmentPath;
  readonly recordedAt: Timestamp;
}
