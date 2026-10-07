/**
 * MOS OAuth state codec (WEB-001) — the identity-flow plumbing pattern ported
 * from the audited `packages/web/src/auth/oauthStateCodec.ts` (UX substrate
 * audit KEEP table: "identity-flow plumbing independent of the Zai provider;
 * reusable behind MOS identity"). MOS naming, no Zai/Zcode imports.
 *
 * Carried for the Phase 2 MOS identity sign-in surface (browser shell
 * replacement plan §3): the shell will encode/parse OAuth round-trip state
 * and validate post-login return paths with these helpers. It is part of the
 * scaffold's declared surface and is unit-tested, but no sign-in flow exists
 * yet — the shell boots straight into the app sections.
 */

/** State payload for a MOS identity round trip. */
export interface MosOAuthStatePayload {
  readonly nonce: string;
  /** App-internal path to return to after the round trip. */
  readonly appReturnTo?: string;
}

/** Options for {@link resolveSafeMosAppReturnTo}. */
export interface ResolveSafeMosAppReturnToOptions {
  /**
   * The origin absolute return URLs must point back at (open-redirect
   * prevention — the audited codec's `currentOrigin` pattern). Defaults to
   * the runtime `location.origin` when one is resolvable; without a
   * resolvable origin absolute URLs are REJECTED (fail closed).
   */
  readonly currentOrigin?: string;
}

const MOS_APP_RETURN_TO_PREFIXES = ['/', '/missions', '/studio', '/lab', '/connections'];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeBase64Url(value: string): string {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
}

/** Encode a state payload for an outbound identity round trip. */
export function encodeMosOAuthState(payload: MosOAuthStatePayload): string {
  return encodeBase64Url(JSON.stringify(payload));
}

/** Parse round-trip state; `null` for anything malformed or nonce-less. */
export function parseMosOAuthState(state: string): MosOAuthStatePayload | null {
  try {
    const parsed = JSON.parse(decodeBase64Url(state)) as Partial<MosOAuthStatePayload>;
    if (!isNonEmptyString(parsed.nonce)) {
      return null;
    }
    return {
      nonce: parsed.nonce,
      ...(isNonEmptyString(parsed.appReturnTo) ? { appReturnTo: parsed.appReturnTo } : {}),
    };
  } catch {
    return null;
  }
}

function isTrustedAppReturnTo(path: string): boolean {
  if (path.includes('..') || path.includes('\\') || /[&?]/.test(path)) {
    return false;
  }
  return MOS_APP_RETURN_TO_PREFIXES.some((prefix) =>
    prefix === '/' ? path === '/' : path === prefix || path.startsWith(`${prefix}/`),
  );
}

function runtimeLocationOrigin(): string | null {
  const location = globalThis.window?.location ?? globalThis.location;
  const origin = location?.origin;
  return typeof origin === 'string' && origin.length > 0 ? origin : null;
}

/**
 * Resolve a safe app-internal return path from a candidate value: only
 * same-origin app route paths (see {@link MOS_APP_RETURN_TO_PREFIXES}) are
 * trusted; foreign-origin absolute URLs (open redirects), scheme tricks,
 * query strings and traversal are rejected with `null`.
 */
export function resolveSafeMosAppReturnTo(
  value: string | undefined,
  options: ResolveSafeMosAppReturnToOptions = {},
): string | null {
  if (!isNonEmptyString(value)) {
    return null;
  }
  if (value.startsWith('/') && !value.startsWith('//')) {
    return isTrustedAppReturnTo(value) ? value : null;
  }
  // Absolute URLs are reduced to the internal path ONLY when they point back
  // at the current origin (the audited codec pins url.origin === allowedOrigin
  // — a foreign origin with an app-looking path is an open redirect, never a
  // safe return). With no resolvable origin the answer is `null`, not a guess.
  const allowedOrigin = options.currentOrigin ?? runtimeLocationOrigin();
  if (allowedOrigin === null) {
    return null;
  }
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash) {
      return null;
    }
    if (url.origin !== allowedOrigin) {
      return null;
    }
    return isTrustedAppReturnTo(url.pathname) ? url.pathname : null;
  } catch {
    return null;
  }
}
