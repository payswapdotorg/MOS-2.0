# X adapter subtree (SOCIAL-006)

One of the five per-provider adapter subtrees of `@mos/distribution`
(SOCIAL-002..006), each declaring its real platform's publicly-known API
surface **AS DATA** on the W6-C SOCIAL-001 contract and binding to the
`SocialTransportPort` seam through the shared provider binding machinery.

## Disclosure discipline (read first)

Every declaration in `x-profile.ts` is made **conservatively from public
platform knowledge at this codebase's authoring horizon**. The sandbox
performs **no live-platform verification** (no real network — the
transport is the disclosed in-memory double). **No endpoint URLs, no
rate-limit numbers, no error taxonomies are fabricated anywhere in this
subtree** — those specifics are either publicly known and cited below as
*knowledge claims*, or deliberately absent (`unknown` /
observation-pending). Where the platform's support for an MOS operation is
not confidently known, the profile declares `unknown` — never a guessed
`supported`.

## Declared capability matrix (public-knowledge basis per entry)

| MOS operation | Declared | Basis (public knowledge) |
| --- | --- | --- |
| `publish` | **supported** | the platform's public posting API documents text posts and posts carrying image or video media |
| `schedule` | **unknown** | no confidently-known first-party public scheduling surface at the authoring horizon — **observation-pending** (the profile never guesses; third-party schedulers and ads surfaces are not this surface) |
| `read-observations` | **supported** | the platform's public developer API documents public post metrics (impressions, likes, reposts and related reported metrics) |
| `delete` | **supported** | the platform's public developer API documents post deletion |
| `list-restrictions` | **unknown** | no publicly-known per-account restriction-listing surface — **observation-pending** |

## Declared operation shapes (publicly-known operation shapes as DATA)

- `publish` → **text-post**, **image-post**, **video-upload**:
  text+image+video family artifacts presented as any of the closed
  presentation vocabulary (`single-artifact`, `artifact-with-caption`,
  `link-preview`, `text-only`) — links ride inside post text on this
  platform, so the link-preview presentation renders from the text.
  Artifact types with NO family in the closed vocabulary (e.g. audio)
  are unmappable → they fail closed against EVERY shape declaration —
  typed `operation-shape-unsupported` refusal **before any provider
  interaction**.
- `schedule` carries NO shape entry: the matrix declares the operation
  `unknown` (observation-pending), so no schedule shape is declared and
  every schedule attempt is the operation's OWN preserved typed outcome
  (never a guessed scheduling surface).

Artifact type families are matched coarsely by MIME prefix
(`text/*`, `image/*`, `video/*`) — format-level constraints (media
duration limits, codecs) are deliberately not expressed (the platform's
own response remains the authority on acceptance).

## Auth model KIND (as data — never credentials)

`oauth2`, escrowed by the integrations module
(`managedBy: "integrations"` — the W6-C credential discipline: credentials
never enter the distribution control plane; the channel's integrations
instance carries the CredentialRef HANDLE at the transport boundary).

Publicly-known flow kinds declared: `authorization-code-with-pkce` (the
platform operator's OAuth 2.0 user-context authorization surface with
PKCE). Basis: public knowledge of the platform operator's OAuth 2.0
authorization surfaces. No credential values, token values, client
identifiers or secrets appear anywhere in this subtree — structurally (the
profile contract has no such field, compile-time pinned).

## Transport binding (disclosed double)

`createXTransportBinding(options)` wraps the W6-C disclosed in-memory
transport double with the profile above. It self-labels every response
`provider:x-transport-double` so double output can never masquerade as
live X evidence. Inside the subtree, BEFORE any provider interaction is
recorded, it enforces:

1. **Composition isolation** — requests addressed to any other providerId
   are typed `provider-adapter-mismatch` refusals (a per-provider binding
   never serves a foreign provider's channel).
2. **The adapter's own capability declaration** — adapter-level
   fail-closed: an operation this profile declares `unsupported` is a
   typed refusal, `unknown` gets its OWN preserved typed outcome, even if
   a channel registration declares otherwise (defense in depth over the
   channel's registered matrix, which remains the tenant-side gate).
3. **The declared operation shapes** — provider-specific parameters
   validated against the profile DATA (see above), typed refusal on
   mismatch.
4. **Idempotency/replay discipline** — every operation may carry an
   idempotency key; the same key with the same logical parameters REPLAYS
   the recorded provider answer (ONE provider operation recorded for any
   number of retries, `idempotent-replay` warning surfaced on the §30
   record); the same key with different parameters is a typed
   `idempotency-key-conflict` refusal. Callers who omit the key get no
   replay safety (each call is a fresh provider operation — disclosed).
5. **Rate-limit posture observations** — a DECLAREDLY simulated posture
   (when configured with `simulatedRateLimit`) rides ok responses as the
   `rateLimit` observation the adapter runtime types into an immutable
   §30-style record (observedAt + provider refs + self-label). The
   simulated numbers are the double's own, self-labeled — never presented
   as the platform's real rate limits (which are not fabricated here).

`providerOperations()` exposes the provider-operation log — ONE record per
provider interaction (what a real adapter would have sent over the
network); replays and pre-interaction refusals append none.

## Real network = composition-root future work

The real X transport (actual API calls, OAuth2 token handling at the
substrate boundary, real rate-limit/error surfaces observed verbatim)
lands at the same `SocialTransportPort` seam as a composition-root
replacement for this disclosed double. Nothing in this subtree fabricates
provider internals to stand in for it.
