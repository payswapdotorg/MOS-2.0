# MOS Architecture Lock v2.0
Status: FROZEN
Revision: 2.0.0

1. ZCode is substrate; MOS is authority.
2. Existing ZCode business services do not become MOS authorities.
3. Every MOS mutable-state authority is unique.
4. Lab, Studio, Agent Runtime and Engine Registry are distinct authorities.
5. No-op/repost is a first-class strategy/transform candidate.
6. Transforms can be atomic, composed or discovered.
7. Discovered transforms require contracts and bounded evaluation before reusable promotion.
8. Transform Pawns use the MOS Agent Body/Instance runtime.
9. No second model router is introduced; model selection remains behind a single model-runtime boundary.
10. Capability and Engine are distinct abstractions.
11. Domain code asks for capabilities, never concrete OSS engines.
12. Engine adapters are replaceable and benchmarked against stable capability contracts.
13. Engine implementation runs behind a narrow sandboxed runner.
14. Artifact lineage is immutable and preserved across every transformation.
15. Raw human media is intermediate unless explicitly accepted as final.
16. OpenTimelineIO may be used as editorial interchange; it is not MOS authority.
17. Content Studio is one runtime with pluggable formats.
18. Initial Studio formats are reaction, audio podcast and video podcast.
19. Studio supports standalone and Lab-invoked sessions.
20. One-person podcasts support voice/text/avatar/prerecorded/generated/hybrid interviewer representations with provenance.
21. Multi-account sessions preserve participant identity, authorization and consent boundaries.
22. Studio can load any compatible user-supplied or Lab-discovered organization.
23. Lab may accept/reject/treat/retry/substitute/abandon Studio outputs.
24. Human production is explicit and economically bounded.
25. Expected value of delay is part of production strategy search.
26. Human waiting may be abandoned when delay cost dominates expected incremental value.
27. Arena is an Integration provider, never a second marketplace.
28. Real publishing/execution remains behind existing MOS Mission/Policy/Rights/Distribution/Integration/Workflow/Execution authorities.
29. Historical evidence and counterfactual predictions are distinct.
30. Time Machine delayed mode forbids future-information leakage.
31. Reward is mission-specific, versioned and business-outcome-first.
32. Ensemble uncertainty/OOD/robustness are deployment prerequisites.
33. Generalist single-agent and hand-designed organization baselines are mandatory.
34. Engine code, model weights and source/data rights are independently reviewed.
35. Public URL accessibility never implies media rights.
36. Prohibited strategies are invalid regardless of simulated reward.
37. Long-running jobs use durable workers, not synchronous HTTP or Vercel Hobby Cron.
38. Engine sandboxes have no database/provider credentials by default.
39. No Studio, Lab, Engine or ZCode service may silently replace another authority.
40. Repository manifests and architecture files are the only topology authority for MOS v2.0.
41. Worker reports, chat context, screenshots and PR descriptions are evidence only.
42. Any architecture change requires an Architecture Change Record in the repo and a manifest revision.
43. CopilotKit, OpenMuse and Code-OSS are not required architectural dependencies.
44. Existing ZCode plugin/MCP mechanisms may be used as substrate adapters only.
45. No direct import of an OSS implementation into MOS domain modules.
46. Contract compatibility and benchmark evidence are required before an engine activation.
47. The final closed-loop proof is required before MOS v2.0 release acceptance.
