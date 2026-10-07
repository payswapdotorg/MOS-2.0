# @mos/capabilities — MOS v2.0 capability registry (CAP-001)

The capability registry over the `Capability` core contract
(`@mos/contracts`): domain modules (Studio/Lab/production) request
capabilities; engines are selected by the Engine Registry
(`@mos/engines`), never here.

## Surface

| Export | Kind |
| --- | --- |
| `CapabilityRegistryPort` | port interface (6 methods; policy budget 12) |
| `createInMemoryCapabilityRegistry` | in-memory adapter factory (working, not a skeleton) |
| `CapabilityRegistryError` + 4 typed subclasses | fail-closed errors with machine-readable `code` |
| `SEED_CAPABILITY_CATALOG`, `SEED_CAPABILITY_IDS`, `SEED_PROVENANCE_MARKER` | seed catalog fixtures |

## Registry semantics

- **Registration gate is fail-closed:** records must carry every required
  `Capability` field (validated with `@mos/contracts`
  `assertRequiredFields`); invalid records are rejected naming the missing
  fields and register nothing.
- **Records are immutable:** re-registering an existing id+version throws
  `CapabilityAlreadyRegisteredError`; tampering with a stored record throws
  (records are frozen).
- **Version history is preserved:** every registered version stays
  resolvable by (id, version) — `get(id, version)`, `getLatest(id)`,
  `listVersions(id)` (ascending). New versions must append monotonically
  (`CapabilityVersionNotMonotonicError` otherwise) — contracts are
  versioned and old versions are the reference for historical runs.
- **Unknown capabilities fail closed:** `get`/`getLatest` return
  `undefined` and `require` throws `UnknownCapabilityError` naming the
  capability id (and version when pinned). No silent defaults.

## Seed catalog (test fixtures — NOT engine claims)

`SEED_CAPABILITY_CATALOG` registers the 15 capability ids listed as
examples in spec/mos-architecture-v2.0.md §5 (`transcribe_audio`,
`transcribe_video`, `detect_scenes`, `diarize_speakers`,
`rank_clip_candidates`, `segment_person`, `semantic_video_relevance`,
`generate_questions`, `generate_voice`, `animate_avatar`,
`compose_reaction`, `render_timeline`, `realtime_room`, `generate_video`,
`evaluate_content`) as minimal capability CONTRACT instances: minimal
schemas, indicative cost/latency models, and a
`provenance:seed-catalog:<name>@1` marker on every record.

They make **no claim about any engine, model, license or benchmark** —
engine candidacy is a matter for `@mos/engines` manifests and their
activation evidence chains. Production capability records arrive through
capability governance, not this catalog.

## Dependencies

- `@mos/contracts` (workspace) — the only dependency. No `@zcode/*`
  imports, no engine/provider SDKs, no substrate imports.

## Verification

```bash
pnpm --filter @mos/capabilities exec tsc --noEmit
pnpm --filter @mos/capabilities test   # tsc -b && node --test 'dist/**/*.test.js'
pnpm exec oxlint packages/mos-capabilities
```
