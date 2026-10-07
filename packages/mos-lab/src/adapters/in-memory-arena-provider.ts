import type { Timestamp } from '@mos/contracts';
import type {
  ArenaProviderPort,
  ArenaProviderRef,
  ArenaTaskOfferInput,
  ArenaTaskOfferRecord,
  ArenaProviderSeamError,
} from '../contracts/arena-provider-seam.js';

/**
 * Options for {@link createInMemoryArenaProvider}.
 *
 * `providers` is the set of provider refs the double simulates (default:
 * one disclosed arena provider). `decide` overrides the deterministic offer
 * decision (default: every offer is accepted) — used by tests to exercise
 * the declined-offer path. `now` is injectable for deterministic timestamps.
 */
export interface InMemoryArenaProviderOptions {
  readonly providers?: readonly ArenaProviderRef[];
  readonly decide?: (input: ArenaTaskOfferInput) => { readonly accepted: boolean };
  readonly now?: () => Timestamp;
}

const nowDefault = (): Timestamp => new Date().toISOString() as Timestamp;

const DEFAULT_PROVIDER: ArenaProviderRef = Object.freeze({
  providerId: 'arena-provider-double' as ArenaProviderRef['providerId'],
  providerVersion: 1,
});

/**
 * Build the DISCLOSED IN-MEMORY Arena provider double (LAB-014).
 *
 * ⚠ DISCLOSED DOUBLE, NOT A PROVIDER ⚠
 *
 * Zero-I/O, deterministic, process-local: no provider is contacted, no
 * credentials exist, no network is reachable. Every interaction reference
 * this double mints is SELF-LABELED with the `arena-double:` prefix, so
 * double output can never masquerade as live provider evidence (the same
 * discipline as the W5-C integrations transport double). The REAL adapter
 * over @mos/integrations (INTEG-001 — providers resolved, rights/policy
 * gates preceding provider calls) is composition-root wiring; this double
 * exists so the lab's Arena-path contract is testable without the
 * integrations module (which the lab's registry dependencies exclude).
 */
export function createInMemoryArenaProvider(
  options: InMemoryArenaProviderOptions = {},
): ArenaProviderPort {
  const now = options.now ?? nowDefault;
  const providers = options.providers ?? [DEFAULT_PROVIDER];
  const decide = options.decide ?? ((): { readonly accepted: boolean } => ({ accepted: true }));
  let offerCount = 0;

  return {
    async offerHumanProductionTask(
      input: ArenaTaskOfferInput,
    ): Promise<ArenaTaskOfferRecord | ArenaProviderSeamError> {
      const known = providers.some(
        (provider) =>
          provider.providerId === input.provider.providerId &&
          provider.providerVersion === input.provider.providerVersion,
      );
      if (!known) {
        return {
          error: 'provider-unavailable',
          message: `the arena provider double does not simulate this provider: ${String(input.provider.providerId)}@${String(input.provider.providerVersion)}`,
        };
      }
      offerCount += 1;
      const decision = decide(input);
      return Object.freeze({
        provider: Object.freeze({ ...input.provider }),
        taskId: input.taskId,
        accepted: decision.accepted,
        // SELF-LABELED: double interactions are distinguishable by construction.
        interactionRef: `arena-double:offer-${String(offerCount)}`,
        offeredAt: now(),
      });
    },
  };
}
