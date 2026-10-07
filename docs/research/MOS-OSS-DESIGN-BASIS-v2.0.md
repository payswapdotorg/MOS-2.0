# MOS OSS Design Basis v2.0
Status: RESEARCH BASIS, not architecture authority
Research date: 2026-10-07

The architecture uses open source as replaceable implementation inventory rather than as business authority.

## Editorial / timeline

OpenTimelineIO provides an API/interchange representation for editorial cut information and references external media. Its plugin system is useful as an interoperability pattern. The upstream project is Apache-2.0. See:
- https://github.com/AcademySoftwareFoundation/OpenTimelineIO
- https://github.com/AcademySoftwareFoundation/OpenTimelineIO-Plugins

MOS decision:
- use OTIO as optional/primary editorial interchange;
- keep MOS Production Graph authoritative;
- do not store business semantics only in OTIO.

## Media rendering

FFmpeg supports broad media operations. Its licensing is mixed: most files are LGPLv2.1+ while optional GPLv2+ components exist. Exact configure/build settings must therefore be recorded.

MOS decision:
- expose media-render capability;
- FFmpeg is an adapter/engine;
- do not allow uncontrolled GPL components into a distribution marked compatible with a permissive target posture.

## Scene detection

PySceneDetect is a Python/OpenCV scene detection library and is BSD-3-Clause. It can serve as a scene-boundary engine.

MOS decision:
- candidate engine for scene-detection;
- benchmark against any later scene detector.

## Speech analysis

WhisperX is BSD-2-Clause at the repository/code level and provides ASR, word-level timestamps and diarization-oriented functionality. Its issue history also illustrates why model-level licensing must be reviewed separately from code licensing.

MOS decision:
- candidate ASR/alignment engine;
- model/checkpoint license reviewed independently.

## Semantic video/image-text

OpenCLIP's repository is MIT-licensed. It is useful for multimodal embeddings and semantic relevance scoring. This does not imply every checkpoint or upstream-derived component has identical licensing.

MOS decision:
- candidate semantic ranking/embedding engine;
- model/checkpoint review required.

## Segmentation

SAM 2 currently identifies code/checkpoints under Apache-2.0 in its README/setup metadata, while the project also ships third-party assets with their own licenses. Each bundled distribution must therefore retain third-party inventory.

MOS decision:
- candidate segmentation engine;
- package-level notice generation required.

## Realtime

LiveKit server is Apache-2.0; mediasoup is ISC.

MOS decision:
- both are replaceable realtime-provider candidates behind RealtimeRoom capability;
- no Studio code may assume either provider.

## General model candidates

InternVideo and V-JEPA-family systems can be evaluated for temporal video representations. They remain research candidates until exact revisions, model licenses, resources and benchmark results are recorded in the Engine Registry.

## Lessons adopted from OSS

1. Plugin/adapter architectures should be first-class.
2. Interchange representations should separate content description from media bytes.
3. Engine implementations should be independently benchmarkable.
4. Large ML dependencies should live outside the TypeScript domain core.
5. License metadata is part of runtime eligibility, not an afterthought.

External project claims do not override MOS contracts, rights, security or topology.
