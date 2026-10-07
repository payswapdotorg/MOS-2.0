/**
 * Registration of the three initial Studio formats (STUDIO-002).
 *
 * Frozen manifest `studioFormats`: reaction, audio-podcast, video-podcast.
 * Each format is a concrete plugin descriptor registered into a caller-owned
 * {@link FormatRegistry}. Registration results are returned — never thrown —
 * so callers can fail loudly on an unexpected rejection.
 */

import type { FormatRegistry, FormatRegistrationResult } from "../format-registry.js";
import { createFormatRegistry } from "../format-registry.js";
import { createReactionFormatPlugin } from "./reaction.js";
import { createAudioPodcastFormatPlugin } from "./audio-podcast.js";
import { createVideoPodcastFormatPlugin } from "./video-podcast.js";

/** The three initial format ids (frozen manifest `studioFormats`). */
export const INITIAL_STUDIO_FORMAT_IDS = ["reaction", "audio-podcast", "video-podcast"] as const;

/** Register all three initial formats into a registry. */
export function registerInitialStudioFormats(registry: FormatRegistry): readonly FormatRegistrationResult[] {
  return [
    registry.register(createReactionFormatPlugin()),
    registry.register(createAudioPodcastFormatPlugin()),
    registry.register(createVideoPodcastFormatPlugin()),
  ];
}

/** Convenience: a registry with the three initial formats already registered. */
export function createFormatRegistryWithInitialFormats(): FormatRegistry {
  const registry = createFormatRegistry();
  registerInitialStudioFormats(registry);
  return registry;
}
