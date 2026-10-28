/**
 * The MOS BROWSER presentation vocabulary (W39 — the substrate's
 * embedded browser pane, EMERGED as a native MOS console surface).
 *
 * WHAT THIS HOLDS (pure data + pure functions, dependency-free — the
 * node test runner consumes it through the package's built dist):
 *
 * 1. THE COPY VOCABULARY — the substrate's own browser locale strings
 *    held verbatim (packages/ui/src/i18n/locales/en-US.ts, the
 *    `browser.*` keys): the address placeholder, Back/Forward/Refresh,
 *    the More menu, the invalid-URL and load-failure lines, the empty
 *    state, the guest-failure and load-error states. MOS renders the
 *    substrate's words, never its own paraphrase.
 * 2. THE URL SEMANTICS — the substrate's address-bar normalization
 *    (embeddedBrowserHelpers.ts) replicated function-for-function: the
 *    localhost/private-network/port heuristics that default scheme-less
 *    local input to HTTP while public hostnames stay HTTPS-first, the
 *    allowed-protocol whitelist (http/https/file/about/data), the
 *    disallowed-explicit-protocol rejection, and the system-browser
 *    openable set (http/https/file only).
 * 3. THE GUEST LIFECYCLE FACTS — the browser state shape (canGoBack/
 *    Forward, currentUrl, the error fields, isReady, title), the
 *    recoverable guest-exit reasons (in-place rebuild only for the
 *    Chromium-terminated cases, never launch failures), the
 *    safeWebviewCall lifecycle-race swallow, and the certificate error
 *    code band.
 * 4. THE MOS CONSTANTS — the guest key the pane reports to the
 *    substrate's main process (`browserViewAttachGuest`), the workspace
 *    scope, and the webview partition (the substrate's own persistent
 *    embedded-browser profile — cookies and site data are shared with
 *    the substrate's built-in browser by design).
 */

/* --------------------------------------------------------------------
 * 1. The copy vocabulary (the substrate's en-US browser strings,
 *    verbatim — see packages/ui/src/i18n/locales/en-US.ts).
 * -------------------------------------------------------------------- */

export const MOS_BROWSER_ADDRESS_PLACEHOLDER = 'Enter a URL and press Enter';
export const MOS_BROWSER_BACK_TITLE = 'Back';
export const MOS_BROWSER_FORWARD_TITLE = 'Forward';
export const MOS_BROWSER_RELOAD_TITLE = 'Refresh';
export const MOS_BROWSER_MORE_TITLE = 'More browser actions';
export const MOS_BROWSER_OPEN_EXTERNAL_LABEL = 'Open in default browser';
export const MOS_BROWSER_DEVTOOLS_LABEL = 'Open DevTools';
export const MOS_BROWSER_INVALID_URL_MESSAGE =
  'Only http, https, file, about, and data URLs are supported';
export function mosBrowserLoadFailedMessage(detail: string): string {
  return `Failed to load page: ${detail}`;
}
export const MOS_BROWSER_EMPTY_LINE = 'Paste or type a URL to open a page.';
export const MOS_BROWSER_GUEST_FAILED_TITLE = 'The built-in browser failed to start';
export const MOS_BROWSER_GUEST_FAILED_DESCRIPTION =
  'The browser process exited before it could display the page. You can retry after checking the system environment.';
export function mosBrowserGuestFailedDetail(reason: string, exitCode: number): string {
  return `Renderer: ${reason} (exit code ${exitCode})`;
}
export const MOS_BROWSER_GUEST_FAILED_RETRY = 'Retry browser';
export const MOS_BROWSER_LOAD_ERROR_TITLE = 'This page could not be opened';
export const MOS_BROWSER_LOAD_ERROR_RETRY = 'Reload';

/* The honest scope notes (the MOS pane's own disclosures — what the
 * substrate's chat-workbench browser pane has that this native pane
 * deliberately does not take). */
export const MOS_BROWSER_ELEMENT_PICKER_NOTE =
  'Element picking ("Select page element for chat") stays with the chat workbench — it needs a mounted conversation, which arrives with a connected substrate account.';
export const MOS_BROWSER_RESPONSIVE_NOTE =
  'The free-size viewport stays with the chat workbench browser pane; the MOS pane browses at the pane natural size.';
export const MOS_BROWSER_TABS_NOTE =
  'One tab: the MOS pane is the substrate built-in browser surfaced as a single pane — the tab strip stays with the chat workbench.';

/* The receipt templates (the honest echo law — every write says what it
 * actually did, never what the substrate did). */
export function mosBrowserUrlRecordedReceipt(url: string): string {
  return `RECORDED — ${url} is the workspace browser record now. The pane restores it on the next visit; the substrate account is not involved.`;
}
export function mosBrowserGuestAttachedReceipt(guestKey: string): string {
  return `GUEST ATTACHED — the substrate’s own main process holds the CDP session for this tab (${guestKey}). Authorized browser control arrives with a connected substrate account; this pane never auto-drives a page.`;
}
export function mosBrowserGuestUnavailableReceipt(): string {
  return 'UNAVAILABLE — the substrate preload’s browser bridge is not reachable from this renderer; the pane records the URL but cannot attach the guest.';
}

/* --------------------------------------------------------------------
 * 2. The URL semantics (the substrate's embeddedBrowserHelpers,
 *    replicated function-for-function — the boundary law forbids the
 *    @zcode/ui import, so the semantics live here as pinned truth).
 * -------------------------------------------------------------------- */

export const MOS_BROWSER_DEFAULT_URL = 'about:blank';

const ALLOWED_BROWSER_PROTOCOLS = new Set(['about:', 'data:', 'file:', 'http:', 'https:']);

const URL_PROTOCOL_RE = /^[a-zA-Z][a-zA-Z\d+.-]*:/;
const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;

export function isAllowedBrowserUrl(url: string): boolean {
  try {
    return ALLOWED_BROWSER_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

/** The system default browser accepts Web + file URLs only (never the inline protocols). */
export function isDefaultBrowserOpenableUrl(url: string): boolean {
  try {
    const protocol = new URL(url).protocol;
    return protocol === 'http:' || protocol === 'https:' || protocol === 'file:';
  } catch {
    return false;
  }
}

function hasAllowedExplicitProtocol(input: string): boolean {
  const protocol = input.match(URL_PROTOCOL_RE)?.[0].toLowerCase();
  return protocol ? ALLOWED_BROWSER_PROTOCOLS.has(protocol) : false;
}

function hasDisallowedExplicitProtocol(input: string): boolean {
  const match = input.match(URL_PROTOCOL_RE);
  if (!match) {
    return false;
  }

  const protocol = match[0].toLowerCase();
  if (ALLOWED_BROWSER_PROTOCOLS.has(protocol)) {
    return false;
  }

  return !/^\d{1,5}(?:$|[/?#])/.test(input.slice(match[0].length));
}

function normalizeBareIpv6LoopbackInput(input: string): string {
  if (input === '::1') {
    return '[::1]';
  }

  if (/^::1(?=[:/?#])/.test(input)) {
    return `[::1]${input.slice(3)}`;
  }

  return input;
}

function parseSchemeLessUrl(input: string): URL | null {
  try {
    const normalizedInput = normalizeBareIpv6LoopbackInput(input);
    return new URL(
      normalizedInput.startsWith('//') ? `http:${normalizedInput}` : `http://${normalizedInput}`,
    );
  } catch {
    return null;
  }
}

function getSchemeLessExplicitPort(input: string): string | null {
  const normalizedInput = normalizeBareIpv6LoopbackInput(input);
  const withoutLeadingSlashes = normalizedInput.startsWith('//')
    ? normalizedInput.slice(2)
    : normalizedInput;
  const authority = withoutLeadingSlashes.split(/[/?#]/, 1)[0] ?? '';
  const hostWithPort = authority.split('@').at(-1) ?? authority;

  if (hostWithPort.startsWith('[')) {
    return hostWithPort.match(/^\[[^\]]+\]:(\d+)$/)?.[1] ?? null;
  }

  const portMatch = hostWithPort.match(/:(\d+)$/);
  if (!portMatch) {
    return null;
  }

  const host = hostWithPort.slice(0, portMatch.index);
  return host.includes(':') ? null : (portMatch[1] ?? null);
}

function parseIpv4Address(host: string): [number, number, number, number] | null {
  if (!IPV4_RE.test(host)) {
    return null;
  }

  const octets = host.split('.').map((part) => Number(part));
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return null;
  }

  return octets as [number, number, number, number];
}

function isLocalhostName(host: string): boolean {
  return host === 'localhost' || host === 'localhost.localdomain' || host.endsWith('.localhost');
}

function isLocalDevelopmentHost(host: string): boolean {
  const normalizedHost = host.toLowerCase().replace(/^\[(.*)]$/, '$1');
  if (
    isLocalhostName(normalizedHost) ||
    normalizedHost === '::1' ||
    normalizedHost === '0:0:0:0:0:0:0:1' ||
    normalizedHost.endsWith('.local') ||
    normalizedHost.endsWith('.test')
  ) {
    return true;
  }

  const ipv4 = parseIpv4Address(normalizedHost);
  if (!ipv4) {
    return false;
  }

  const [first, second, third, fourth] = ipv4;
  return (
    first === 127 ||
    (first === 0 && second === 0 && third === 0 && fourth === 0) ||
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254)
  );
}

function shouldPreferHttpForSchemeLessUrl(parsed: URL, explicitPort: string | null): boolean {
  if (isLocalDevelopmentHost(parsed.hostname)) {
    return true;
  }

  if (explicitPort && explicitPort !== '443') {
    return true;
  }

  return false;
}

function inferBrowserUrl(input: string): string {
  const normalizedInput = normalizeBareIpv6LoopbackInput(input);
  const parsed = parseSchemeLessUrl(normalizedInput);
  const protocol =
    parsed && shouldPreferHttpForSchemeLessUrl(parsed, getSchemeLessExplicitPort(normalizedInput))
      ? 'http'
      : 'https';
  return normalizedInput.startsWith('//')
    ? `${protocol}:${normalizedInput}`
    : `${protocol}://${normalizedInput}`;
}

/** Normalize an address-bar input to a loadable URL (null = not allowed). */
export function normalizeMosBrowserUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  if (hasDisallowedExplicitProtocol(trimmed)) {
    return null;
  }

  const url = hasAllowedExplicitProtocol(trimmed) ? trimmed : inferBrowserUrl(trimmed);
  return isAllowedBrowserUrl(url) ? url : null;
}

/** The address-bar display form (about:blank renders empty, like the substrate). */
export function displayMosBrowserUrl(url: string): string {
  return url === MOS_BROWSER_DEFAULT_URL ? '' : url;
}

/* --------------------------------------------------------------------
 * 3. The guest lifecycle facts (the substrate's state shape + the
 *    lifecycle-race swallow + the recoverable-exit set).
 * -------------------------------------------------------------------- */

export interface MosBrowserGuestFailure {
  readonly exitCode: number;
  readonly reason: string;
}

export interface MosBrowserState {
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
  readonly currentUrl: string;
  readonly errorMessage: string | null;
  /** The main-frame Chromium net error code (certificate guidance depends on it). */
  readonly loadErrorCode: number | null;
  /** The process-level failure (the guest never painted) — distinct from a load error. */
  readonly guestFailure: MosBrowserGuestFailure | null;
  readonly isLoading: boolean;
  readonly isReady: boolean;
  readonly title: string;
}

export const INITIAL_MOS_BROWSER_STATE: MosBrowserState = {
  canGoBack: false,
  canGoForward: false,
  currentUrl: MOS_BROWSER_DEFAULT_URL,
  errorMessage: null,
  loadErrorCode: null,
  guestFailure: null,
  isLoading: false,
  isReady: false,
  title: '',
};

/** A fresh browser state (the entry resets to it on guest rebuilds). */
export function initialMosBrowserState(): MosBrowserState {
  return { ...INITIAL_MOS_BROWSER_STATE };
}

const RECOVERABLE_BROWSER_GUEST_EXIT_REASONS = new Set([
  'abnormal-exit',
  'killed',
  'crashed',
  'oom',
  'memory-eviction',
]);

/** Only Chromium-terminated guests rebuild in place; launch failures must not loop. */
export function isRecoverableMosBrowserGuestExitReason(reason: string): boolean {
  return RECOVERABLE_BROWSER_GUEST_EXIT_REASONS.has(reason);
}

/** Chromium certificate error code band (ERR_CERT_* — the honest guidance gate). */
const CERTIFICATE_LOAD_ERROR_CODE_MIN = -217;
const CERTIFICATE_LOAD_ERROR_CODE_MAX = -200;

export function isCertificateMosBrowserLoadErrorCode(
  code: number | null | undefined,
): boolean {
  if (typeof code !== 'number') return false;
  return code >= CERTIFICATE_LOAD_ERROR_CODE_MIN && code <= CERTIFICATE_LOAD_ERROR_CODE_MAX;
}

const WEBVIEW_DETACHED_ERROR_FRAGMENTS = [
  'must be attached to the DOM',
  'Render frame was disposed',
] as const;

function isWebviewDetachedError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (!message) {
    return false;
  }
  return WEBVIEW_DETACHED_ERROR_FRAGMENTS.some((fragment) => message.includes(fragment));
}

/**
 * Run one webview synchronous call: the pre-attach / frame-disposed
 * lifecycle races swallow to the fallback (they are expected churn, not
 * errors); everything else still throws.
 */
export function safeMosWebviewCall<T>(
  call: () => T,
  fallback: T,
  onDetached?: (error: unknown) => void,
): T {
  try {
    return call();
  } catch (error) {
    if (isWebviewDetachedError(error)) {
      onDetached?.(error);
      return fallback;
    }
    throw error;
  }
}

/* --------------------------------------------------------------------
 * 4. The MOS constants (the guest-report contract).
 * -------------------------------------------------------------------- */

/**
 * The guest key this pane reports to the substrate's main process.
 * An unknown key takes the substrate's documented legacy path: an
 * unclaimed, user-scoped tab record the main process can later hand to
 * an authorized agent session (the §8 guided-browser journeys).
 */
export const MOS_BROWSER_GUEST_KEY = 'mos-browser-human';

/** The workspace scope the attach reports (the substrate's user-tab scope). */
export const MOS_BROWSER_WORKSPACE_KEY = 'mos';

/**
 * The webview partition — the substrate's own persistent embedded-browser
 * profile. The MOS pane deliberately shares the substrate built-in
 * browser's site data: it is the same built-in browser, surfaced natively.
 */
export const MOS_BROWSER_PARTITION = 'persist:zcode-embedded-browser';
