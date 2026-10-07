# MOS Architecture v2.0
Status: FROZEN
Repository: payswapdotorg/MOS-2.0
Layered on: ZCode substrate fork
Architecture authority: this document
Machine-readable authorities:
- spec/mos-frozen-manifest-v2.0.json
- spec/mos-module-registry-v2.0.yaml
- spec/mos-architecture-policy-v2.0.yaml
- spec/mos-engine-policy-v2.0.yaml
- spec/mos-engine-catalog-v2.0.yaml
- spec/contracts/core-contracts-v2.0.yaml
- spec/mos-effective-backlog-v2.0.md
- spec/mos-module-dependency-matrix-v2.0.md

## 1. Product thesis

MOS is a marketing-engineering operating system. It takes a declared business/social goal and can discover, simulate, produce, test, measure and improve a marketing program.

The system is not a coding assistant with marketing features. The inherited ZCode codebase is a substrate for transport, UI, sessions, permissions, tools, agent execution, eventing, background work and packaging. MOS owns the business/domain authorities above it.

Non-negotiable rule:

> ZCode is infrastructure. MOS is the authority.

Inherited ZCode domain semantics must be contained behind adapters and may not become MOS business authorities.

## 2. Complete loop

User/company
→ mission / business goal
→ Marketing Engineering Lab
→ broad reference-first corpus
→ multimodal features + Idea Graph
→ idea + transform search
→ strategy search
→ Agent Organization search
→ capability/engine search
→ production program
→ Content Studio and/or automated production
→ artifact graph
→ quality / rights / policy
→ Lab accept / treat / reject / retry / substitute / abandon
→ existing MOS real-experiment authorities
→ real measurement
→ learning
→ simulator/model calibration
→ next run.

Four cooperating loops:
1. Mission loop: goal → strategy → execution → outcome.
2. Production loop: request → production → treatment → artifact.
3. Learning loop: observations → model → simulation → real experiment → calibration.
4. Engine loop: capability → engine candidates → benchmark → activation → replacement.

## 3. Authority model

Exactly one authority owns each category of mutable business state.

MOS authorities:
- Identity / Tenant / Workspace
- Mission
- Policy
- Rights / Consent / Provenance
- Content Artifact
- Production
- Distribution
- Integration
- Experiment
- Evidence / Measurement
- Learning
- Lab
- Studio
- Agent Runtime
- Engine Registry
- Durable Job

ZCode-derived infrastructure is never promoted to a competing MOS business authority.

Forbidden authority duplication:
- Lab != Experiment
- Studio != Workflow
- Studio != Publisher
- Studio != Rights/Policy
- Lab != Workflow/Execution
- Agent Runtime != Strategy Engine
- Engine Registry != Marketplace
- Organization != Workflow Engine
- Capability Provider != Marketplace
- Engine != Capability Authority

## 4. ZCode substrate boundary

The fork currently contains the ZCode v3.14.3 substrate and should preserve strong primitives for:
- RPC / WebSocket / remote transport
- shared UI
- web and desktop shells
- session lifecycle/eventing
- AgentRuntime
- permissions
- tool execution/scheduling
- dynamic workflow infrastructure
- MCP/skills/plugin mechanics
- background execution
- artifact storage ports
- packaging/build/release.

These are substrate capabilities, not MOS domain authorities.

All MOS domain code MUST consume ZCode infrastructure through narrow adapters/ports. MOS domain code MUST NOT import large ZCode runtime internals directly unless that import is explicitly allowlisted in the MOS module registry.

ZCode coding-specific capabilities remain available as substrate where useful but are out of the MOS critical business model.

## 5. Core abstractions

### Capability
What the system can do.

Examples:
- transcribe_audio
- transcribe_video
- detect_scenes
- diarize_speakers
- rank_clip_candidates
- segment_person
- semantic_video_relevance
- generate_questions
- generate_voice
- animate_avatar
- compose_reaction
- render_timeline
- realtime_room
- generate_video
- evaluate_content.

### Engine
A replaceable implementation of one or more capabilities.

Every engine has:
- immutable identity/version;
- capability declarations;
- input/output contract;
- adapter;
- resource profile;
- deterministic/seed behavior;
- quality evaluator(s);
- provenance;
- license metadata;
- model-weight/data-license metadata where applicable;
- network policy;
- security sandbox;
- benchmark evidence;
- activation status.

### Transform
A requested content operation. It may be:
- no-op/repost;
- clip;
- crop/reframe;
- remix;
- compilation;
- reaction;
- podcast;
- translation/dubbing;
- voiceover;
- stylization/anime;
- AI-generated content;
- human contribution;
- hybrid composition.

A transform is a contract, not an engine.

### Production Graph
The executable production program for producing a target artifact.

It can contain:
- inputs;
- transformations;
- human tasks;
- capability calls;
- engine selections;
- agent organization nodes;
- review gates;
- branching;
- acceptance criteria;
- budgets;
- stopping rules.

### Agent Body
Reusable MOS-owned role/tool/permission/memory contract.

### Agent Instance
Agent Body + selected model via the existing model/runtime boundary + tools/capabilities.

### Agent Organization
A graph of Agent Bodies/Instances and communication/delegation edges. It can be searched and versioned.

### Content Studio
The interactive AI+Human production environment. It is also a production actuator for the Lab.

### Artifact Graph
Immutable lineage graph from references/raw inputs through transformations to outputs.

## 6. Artifact graph

Every artifact is versioned and lineage-preserving.

Conceptual:
reference
→ acquired/authorized input
→ raw capture
→ transform
→ intermediate artifact
→ composition
→ final candidate.

Artifact metadata includes:
- artifact id/version
- tenant/workspace
- MIME/type
- content digest
- duration/dimensions
- storage reference
- rights/consent reference
- provenance
- parent artifact refs
- creation method
- creator/actor
- production request/session
- transform/engine versions.

Raw human capture is never silently treated as final.

Large media bytes are handled through object/media storage ports, not control-plane RPC payloads.

## 7. Production search

The Lab searches the full production program, not only ideas.

Candidate dimensions:
- source/reference;
- no-op/repost;
- transform chain;
- transform parameters;
- production modality;
- organization;
- pawn agents;
- model assignment;
- engine portfolio;
- human participation;
- capability acquisition;
- quality thresholds;
- cost;
- latency;
- expected value of delay;
- stopping/substitution policy.

The no-op path is always a valid baseline.

## 8. Transform discovery

Transforms may be:
- known;
- composed from known transforms;
- discovered as a new candidate.

A discovered transform is not automatically production-ready. Promotion requires:
1. contract validation;
2. capability feasibility;
3. rights/policy feasibility;
4. evaluator;
5. bounded benchmark evidence;
6. immutable version;
7. provenance.

Examples:
- source clip → human reaction → PIP composition;
- source video → anime stylization;
- source podcast → semantic highlights → short clips;
- source idea → AI interviewer → one-person video podcast;
- no-op original repost.

## 9. Transform Pawn Agents

Transform Pawns are specialized Agent Instances.

Examples:
- Clip Selection Pawn
- Hook Extraction Pawn
- Reaction Composition Pawn
- Podcast Interviewer Pawn
- Question Designer Pawn
- Scene/Layout Pawn
- Editor Pawn
- Caption Pawn
- Dubbing Pawn
- Quality Critic Pawn.

A pawn may invoke deterministic engines and does not need to be an LLM.

No pawn may introduce a second agent runtime or model router.

## 10. Engine registry

Studio/Lab/production code asks for capabilities, not concrete OSS libraries.

Example:
Capability = semantic_video_relevance.

Engine candidates:
- OpenCLIP
- InternVideo
- V-JEPA-family implementation
- proprietary engine.

The selected engine is resolved by the Engine Registry using:
- compatibility;
- benchmark quality;
- cost;
- latency;
- resources;
- license policy;
- provenance;
- tenant constraints.

Engine replacement therefore does not require Studio/Lab domain code changes.

## 11. Engine runner

External engines run behind a narrow EngineRunner contract.

EngineJob:
- capability id/version
- engine id/version
- input artifact refs
- parameters
- seed
- resource limits
- output contract.

EngineResult:
- output artifact refs
- metrics
- provenance
- duration
- resource usage/cost
- warnings
- failure.

Default engine sandbox:
- no MOS database credentials;
- no provider credentials;
- no arbitrary filesystem access;
- network denied unless explicitly granted;
- explicit CPU/GPU/memory/time quotas.

## 12. Editorial interoperability

OpenTimelineIO is the default editorial interchange representation for timelines/cuts where compatible.

MOS Production Graph remains canonical.

OTIO is an interoperability layer for cut/timeline information and external media references, not the MOS production authority.

Rendering remains an engine capability and can be implemented by FFmpeg, MLT or future engines behind the same capability contract.

## 13. Content Studio

Content Studio has one runtime with pluggable formats.

Initial formats:
- reaction
- audio podcast
- video podcast.

Two entry modes:
- standalone user creation;
- Lab-invoked production.

Standalone:
intent/script → format → production graph → capture → processing → review → artifact package.

Lab:
production candidate → Studio request → loaded organization → capture/processing → artifact package → Lab evaluation.

Studio does not publish directly.

## 14. Script and interview system

Studio accepts:
- complete script;
- question list;
- intent;
- intent + source material.

Intent-only generation produces a versioned script/question graph with provenance.

For one-person podcasts the interviewer can be:
- voice;
- voice + text;
- avatar;
- prerecorded interviewer;
- generated interviewer;
- hybrid.

Adaptive follow-up questions can be selected from a declared question/branch graph based on answers.

Generated interviewer material retains synthetic/generated provenance.

## 15. Multi-account Studio sessions

A production session may span multiple authorized MOS accounts/devices.

Each participant retains:
- identity;
- account boundary;
- authorization;
- participation grant;
- consent;
- contribution provenance.

Credentials are never merged.

## 16. Reaction production

Raw reaction capture enters the selected organization as an intermediate artifact.

The learned production organization may choose:
- bottom-left PIP;
- source first, reaction second;
- alternating source/reaction;
- source clip then response;
- other learned timing/layout.

These are production-program variables, not universal Studio hard-codes.

## 17. Human production and Arena

If a strategy requires a human contribution, the Lab creates a Human Production Task:
- objective;
- source/reference;
- script/questions;
- capture instructions;
- target modality;
- required artifacts;
- consent/rights;
- evaluator;
- deadline;
- delay economics;
- acceptable substitutes.

Possible fulfillment:
- project owner;
- authorized collaborator;
- Arena/provider.

Arena is a provider through Integration, never a second MOS marketplace.

Human output returns to the Studio/organization as an intermediate artifact.

## 18. Production bottleneck economics

Waiting is a decision variable.

Track:
- expected incremental value;
- estimated wait;
- delay cost;
- acquisition cost;
- probability of success;
- quality impact;
- alternative paths.

The Lab may:
- wait;
- retry;
- substitute engine;
- substitute capability/provider;
- switch organization;
- switch transform;
- reduce scope;
- proceed without human;
- abandon.

Abandoned branches remain auditable and may be learning data.

## 19. Studio output evaluation

The Lab can:
- accept;
- reject quality;
- reject strategy;
- request treatment;
- require human action;
- switch organization;
- switch transform;
- switch engine;
- accept alternate output;
- abandon.

Every treatment creates a new immutable linked artifact/output version.

A quality rejection is distinct from a Rights/Policy rejection.

## 20. Lab simulation and learning

The Lab implements:
- reference-first corpus;
- multimodal features;
- Idea Graph;
- social world model;
- user/creator/competition dynamics;
- Time Machine;
- response/world-model ensemble;
- offline/off-policy evaluation;
- sequential simulator learning;
- organization search;
- production-program search;
- robust benchmark;
- real experiment bridge;
- calibration.

Historical fact and counterfactual model output must remain distinct.

Time Machine modes:
1. historical replay;
2. delayed-information replay;
3. counterfactual branching.

At T under lag L, the agent sees only information available by T-L.

## 21. Reward

Reward is mission-specific and versioned.

It can combine:
- business outcome;
- qualified reach;
- retention;
- audience growth;
- qualified traffic;
- conversion;
- revenue/contribution;
- cost;
- latency;
- human/engine acquisition cost;
- rights/policy risk;
- fatigue;
- quality;
- operational risk.

Vanity metrics never silently replace the declared objective.

## 22. Uncertainty

Before deployment-ready selection:
- use ensemble models;
- report expected value;
- uncertainty interval;
- model disagreement;
- OOD distance;
- calibration;
- novelty/regime risk;
- seed robustness.

Simulator outputs are never treated as ground truth.

## 23. Agent organization search

Search dimensions:
- number of agents;
- roles;
- topology;
- delegation;
- communication;
- memory sharing;
- critics;
- tool allocation;
- model assignment;
- budget;
- execution ordering;
- stopping conditions.

Always compare:
- generalist single-agent baseline;
- hand-designed organization;
- generated organizations.

## 24. Real-world boundary

A selected candidate becomes a real MOS experiment through:
Lab candidate
→ Mission
→ Policy/Rights/Assets
→ Production/Studio
→ Distribution/Integration
→ Workflow/Execution
→ platform
→ Evidence/Measurement/Experiment
→ Learning/Calibration.

Lab/Studio never call social providers directly.

## 25. Product intelligence and commerce

Product Intelligence can inform marketing planning but remains a separate authority.

Commerce truth remains external authority through the existing commerce domain.

The Lab may simulate or forecast commerce outcomes but cannot turn simulated orders/inventory into authoritative state.

## 26. Durable jobs

Long-running:
- Lab runs;
- media processing;
- engine execution;
- rendering;
- Studio processing;
- benchmark jobs

must use a durable job/worker path.

Do not use synchronous HTTP requests or Vercel Hobby Cron as the durable scheduling authority.

ZCode runtime task infrastructure may provide worker mechanics through an adapter.

## 27. Security and rights

Public URLs do not imply rights.

Every media acquisition/transform step must carry rights/provenance context.

Engine sandboxes do not receive credentials by default.

Participant contributions require explicit authorization/consent data.

Disallowed strategies:
- fake engagement;
- coordinated inauthentic behavior;
- anti-abuse bypass;
- impersonation;
- fabricated testimonials;
- deceptive attribution;
- rights circumvention.

## 28. OSS replacement policy

An OSS project can only be adopted through an Engine Adapter.

Required sequence:
candidate discovery
→ source/license/model/data review
→ adapter contract
→ contract tests
→ golden corpus benchmark
→ evaluator result
→ security review
→ compatibility record
→ activation.

No domain module may import an OSS implementation directly.

OSS is replaceable. Contracts are not.

## 29. License model

Three layers must be reviewed separately:
1. code license;
2. model/checkpoint license;
3. source/data/content rights.

Engine manifests record all three.

Commercial compatibility cannot be inferred from the code license alone.

## 30. Observability

Every Lab/Studio/Engine production action records:
- request/run/session id;
- contract version;
- actor;
- organization version;
- engine version;
- capability version;
- artifact refs;
- cost/latency;
- failure/warning;
- provenance;
- evaluation result.

## 31. Multi-tenancy

All mutable MOS artifacts are tenant/workspace scoped.

Cross-tenant references are denied unless an explicit public/authorized sharing contract exists.

Credentials are least-privilege and remain at integration boundaries.

## 32. Repository architecture governance

Repository-as-source-of-truth rules:
- this architecture and its machine-readable manifests define topology;
- implementation-state never defines architecture;
- backlog does not override architecture;
- worker prompts do not define contracts;
- generated graphs are projections;
- chat/context is not an authority;
- a completed claim requires source/tests/runtime evidence.

The Tech Lead must reconcile source against these files before every release/harvest.

## 33. Definition of done

MOS v2.0 is complete only when one end-to-end proof demonstrates:
- declared mission;
- broad reference-first corpus;
- Idea Graph;
- no-op versus transformed strategies;
- discovered transform;
- Transform Pawn;
- engine substitution;
- organization search;
- one-person podcast with non-human interviewer representation;
- multi-account podcast;
- reaction with raw human input treated by an organization;
- Studio rejection → treatment;
- human task package;
- delay-based branch abandonment;
- zero-human alternative;
- robust simulation;
- bounded real experiment;
- real measurement;
- calibration;
- second improved run.

The implementation is not complete merely because individual Studio, Lab or engine components run.
