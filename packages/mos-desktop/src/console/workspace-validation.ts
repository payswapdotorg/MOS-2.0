/**
 * The MOS console WORKSPACE VALIDATION helpers (W32): the fail-closed
 * input validators every store write walks through — a bad input throws
 * the typed error and the state stays unchanged. Pure functions, no
 * state: the vocabulary tables decide, never the caller's mood.
 */

import {
  MOS_AD_PLATFORMS,
  MOS_MISSION_DIRECTIONS,
  MOS_REWARD_METRIC_VOCABULARY,
  MOS_SOCIAL_PLATFORMS,
  type MosAdPlatformId,
  type MosMissionDirection,
  type MosSocialPlatformId,
} from './workspace-vocabulary.js';
import { MosWorkspaceStoreError } from './workspace-records.js';

/** The objective statement law: trimmed, at least 8 characters. */
export function requireStatement(statement: string): string {
  const trimmed = statement.trim();
  if (trimmed.length < 8) {
    throw new MosWorkspaceStoreError('validation', 'the objective statement needs at least 8 characters');
  }
  return trimmed;
}

/** The direction law: one of the four typed action directions. */
export function requireDirection(direction: string): MosMissionDirection {
  if (!(MOS_MISSION_DIRECTIONS as readonly string[]).includes(direction)) {
    throw new MosWorkspaceStoreError('validation', `unknown mission direction "${direction}"`);
  }
  return direction as MosMissionDirection;
}

/** The metric law: the closed 17-metric vocabulary, never a free-text metric. */
export function requireMetric(metric: string): string {
  const found = MOS_REWARD_METRIC_VOCABULARY.find((entry) => entry.id === metric);
  if (found === undefined) {
    throw new MosWorkspaceStoreError('validation', `unknown reward metric "${metric}" — the vocabulary is closed`);
  }
  return found.id;
}

/** The social platform law: one of the five-platform workspace. */
export function requireSocialPlatform(platform: string): MosSocialPlatformId {
  if (!(MOS_SOCIAL_PLATFORMS as readonly string[]).includes(platform)) {
    throw new MosWorkspaceStoreError('validation', `unknown social platform "${platform}"`);
  }
  return platform as MosSocialPlatformId;
}

/** The ad platform law: one of the paid-promotion catalogue. */
export function requireAdPlatform(platform: string): MosAdPlatformId {
  if (!(MOS_AD_PLATFORMS as readonly string[]).includes(platform)) {
    throw new MosWorkspaceStoreError('validation', `unknown ad platform "${platform}"`);
  }
  return platform as MosAdPlatformId;
}

/** The amount law: explicit and positive — a blank or zero budget never passes. */
export function requirePositiveAmount(raw: string, label: string): string {
  const trimmed = raw.trim();
  const value = Number(trimmed.replace(/[^0-9.]/g, ''));
  if (trimmed.length === 0 || !Number.isFinite(value) || value <= 0) {
    throw new MosWorkspaceStoreError('validation', `the ${label} must be an explicit positive amount`);
  }
  return trimmed;
}
