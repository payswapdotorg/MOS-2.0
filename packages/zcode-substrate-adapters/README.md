# @mos/substrate-adapters

MOS v2.0 substrate adapter firewall — **W0-B / BOOT-003** (Wave 0).

Narrow MOS-owned ports over the ZCode substrate, the adapters behind them,
and the boundary rules that make the firewall real. Authority chain:
`spec/mos-architecture-v2.0.md` §4 → `spec/mos-module-registry-v2.0.yaml`
(substrate block) → `spec/mos-architecture-policy-v2.0.yaml` →
`harness/mos-boundary-rules.json` (machine-readable rules enforced by the
harness).

## What is REAL vs interface-stage

### Real and working (usable today)

| Surface | Evidence |
|---|---|
| `ObjectStoragePort` + in-memory adapter (`createInMemoryObjectStorage`) | content-addressed (`sha256:<hex>`) digests, scoped refs, idempotent puts, digest verification on read, buffer isolation — 30 green `node:test` assertions |
| `ObjectStoragePort` + file adapter (`createFileObjectStorage(rootDir)`) | same contract, persisted under `rootDir/<scope>/<digest[0:2]>/<digest>` with atomic writes, restart-stable, tamper-detecting |
| `RpcPort` facade (`createZcodeChannelRpcPort(channel)`) | thin type-level facade over `@zcode/rpc` `IChannel`: `request` → `channel.call` (+ caller-side timeout), `onNotification` → `channel.listen`. Only a TYPE-ONLY import from the allowlisted entry `@zcode/rpc`; zero runtime substrate dependency |
| Boundary harness (`harness/mos-boundary-check.mjs`) | zero-dependency static import firewall; 12 self-test fixtures (one per rule + clean + tokenizer-resistance cases); real-tree scan passes clean on this package |

This object-storage adapter is the Wave 1+ building block for artifact
storage references (`spec/mos-architecture-v2.0.md` "Media": object-store
references instead of control-plane media transport; CORE-004 Artifact
records `digest` + `storageRef` fields that resolve through this port).

### Interface-stage (ports only + disclosed skeletons — NOT working adapters)

`SubstrateAdapterNotBoundError` is thrown on construction AND on every
method (including when construction is bypassed via `Object.create` —
defense in depth). These must never be represented as working adapters.

| Skeleton | Port | Binding work item |
|---|---|---|
| `UnboundAgentRuntimeAdapter` | `AgentRuntimePort` | **AGT-002** (Agent Instance / Model Boundary; consumes AGT-001 Agent Body) |
| `UnboundSessionEventsAdapter` | `SessionEventsPort` | **AGT-003** (Agent Organization) |
| `UnboundPermissionsAdapter` | `PermissionsPort` | **AGT-001** (Agent Body) |
| `UnboundToolsAdapter` | `ToolsPort` | **AGT-001** (Agent Body) |

Every error message carries `code = "MOS_SUBSTRATE_ADAPTER_NOT_BOUND"`,
the port name, the binding work item and the `W0-B / BOOT-003` stage
marker.

## Boundary rules (enforced)

Run from the repository root:

```bash
node harness/mos-boundary-check.mjs            # scan the real tree
node harness/mos-boundary-check.mjs --self-test # fixture self-test
pnpm run mos:boundary                           # same, via root script
```

Rules (machine-readable in `harness/mos-boundary-rules.json`):

1. **MOS-DOMAIN-IMPORT-BOUNDARY** — `packages/mos-*` files may import ONLY
   relative paths, `@mos/*` and node builtins (`node:` prefixed or bare
   builtin name). Any `@zcode/*` import there is a violation.
2. **ZCODE-ADAPTER-ONLY-IMPORTS** — ONLY
   `packages/zcode-substrate-adapters/src/adapters/**` may import
   `@zcode/*`, and only the exact entry names `@zcode/rpc`,
   `@zcode/shared`, `@zcode/client`, `@zcode/server`, `@zcode/services`,
   `@zcode/ui`, `@zcode/provider`. Deep imports (e.g.
   `@zcode/rpc/dist/internal`) and non-allowlisted entries (e.g.
   `@zcode/web`) are violations. Files outside the adapters root importing
   `@zcode/*` violate this rule even in domain packages — dual reporting
   with rule 1 is intentional.
3. **MOS-NO-ENGINE-SDK** — no MOS-managed package may import engine/provider
   SDKs (denylist in the rules JSON: openclip, whisperx, ffmpeg,
   @ffmpeg-installer, fluent-ffmpeg, pyscenedetect, sam2, livekit,
   mediasoup, opentimelineio, internvideo, vjepa, comfyui, remotion, openai,
   anthropic, @google, @aws-sdk, stripe). Engines are reached via capability
   contract → engine registry → engine adapter → sandbox.
4. **PORTS-NO-ZCODE** — `src/ports/**` files never import `@zcode/*` in any
   managed package; only adapters may.

Static-analysis limits (disclosed): the harness is a lightweight tokenizer
(comments/strings/templates/regex-literal aware), not a full parser.
Computed (non-literal) dynamic import specifiers are invisible to it; a
parser-based upgrade is a Tech-Lead follow-up. Matching is by package
root (scope/name), never substring.

## Development

```bash
pnpm --filter @mos/substrate-adapters exec tsc --noEmit   # typecheck
pnpm --filter @mos/substrate-adapters test                 # node --test (30 tests)
```

Notes:
- `@zcode/rpc` must have its (gitignored) `dist/` declarations built once
  (`pnpm --filter @zcode/rpc exec tsc`) for the facade's type-only import
  to resolve; this is the same product the root `pnpm typecheck` emits for
  `packages/rpc`.
- No new external dependencies were added: the package depends only on the
  workspace link `@zcode/rpc` (type-level) plus dev-time `typescript` and
  `@types/node` (both already in the lockfile).
- Export budget: 6 port modules + 8 symbols beyond the ports (3 adapter
  factories, 4 skeletons, 1 error class) — within the 12-symbol policy
  budget; every port file is well under the 400-line contract limit.
