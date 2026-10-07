/**
 * In-memory ProviderSecretStore adapter (INTEG-001 — the DISCLOSED DOUBLE
 * of the substrate secret-store seam).
 *
 * This double escrows NO secret material whatsoever: it stores HANDLE
 * METADATA only (scope, display name, kind, creation time). There is no
 * field, map entry or API surface anywhere in this adapter that holds or
 * returns a credential VALUE — by construction, the double cannot leak
 * what it never had. This is the honest shape of the seam for contract
 * testing; a REAL substrate adapter (cloud secret store / Zcode secret
 * infrastructure) implements the same port, escrows real material at THIS
 * boundary and enforces substrate ACLs on resolution.
 *
 * Determinism: handles are minted from a monotonic per-adapter counter
 * (`credential-<n>`); declare/resolves are pure map operations with no
 * I/O, no timers and no randomness — same call sequence, same handles.
 */

import type { TenantScope, Timestamp } from "@mos/contracts";

import type { CredentialRef } from "../contracts/ids.js";
import type { ProviderSecretStorePort } from "../ports/provider-secret-store.port.js";
import { defaultNow } from "./registry-support.js";

/** Options for the in-memory secret-store double. */
export interface InMemoryProviderSecretStoreOptions {
  /** Injectable clock (deterministic tests). */
  readonly now?: () => string;
}

/** Metadata the double keeps per handle (NO secret material — see docblock). */
interface CredentialMetadata {
  readonly scope: TenantScope;
  readonly displayName: string;
  readonly kind: string;
  readonly createdAt: Timestamp;
}

/**
 * Creates the in-memory {@link ProviderSecretStorePort} double.
 */
export function createInMemoryProviderSecretStore(
  options: InMemoryProviderSecretStoreOptions = {},
): ProviderSecretStorePort {
  const now = options.now ?? defaultNow;
  /** credentialRef → metadata. NO values, ever. */
  const handles = new Map<string, CredentialMetadata>();
  let minted = 0;

  return {
    declare(input: { scope: TenantScope; displayName: string; kind: string }): CredentialRef {
      if (
        input === null ||
        typeof input !== "object" ||
        typeof input.displayName !== "string" ||
        input.displayName.trim().length === 0 ||
        typeof input.kind !== "string" ||
        input.kind.trim().length === 0 ||
        typeof input.scope !== "object" ||
        input.scope === null
      ) {
        // The port is fail-closed even in the double: malformed escrow
        // declarations are typed failures of the seam contract.
        throw new Error(
          "ProviderSecretStorePort.declare: displayName, kind and scope are required non-blank values",
        );
      }
      // STRICT SHAPE: the seam cannot even be HANDED credential material —
      // a caller smuggling a `value`/`secret` property beyond the declared
      // declaration fields is rejected (the runtime twin of the
      // credential-never-in-control-plane pin, enforced at the boundary
      // itself).
      const unexpected = Object.keys(input).filter(
        (key) => key !== "scope" && key !== "displayName" && key !== "kind",
      );
      if (unexpected.length > 0) {
        throw new Error(
          `ProviderSecretStorePort.declare: unexpected field(s) ${unexpected.join(", ")} — the seam declares escrow metadata ONLY; credential material is never accepted here`,
        );
      }
      const ref = `credential-${++minted}` as CredentialRef;
      handles.set(ref as string, {
        scope: input.scope,
        displayName: input.displayName,
        kind: input.kind,
        createdAt: now() as Timestamp,
      });
      return ref;
    },

    resolves(credentialRef: CredentialRef): boolean {
      return typeof credentialRef === "string" && handles.has(credentialRef as string);
    },
  };
}
