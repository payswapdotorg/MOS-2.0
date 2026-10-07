/**
 * @mos/studio — MOS v2.0 Content Studio contracts.
 *
 * STUDIO-001 interface spike: exported TypeScript types ONLY. There is no
 * runtime implementation, no constants, and no side effects in this package.
 *
 * Contract alignment: spec/contracts/core-contracts-v2.0.yaml
 * (StudioSession, StudioFormat, StudioArtifactPackage, ProductionRequest
 * consumption view). Architecture basis: spec/mos-architecture-v2.0.md
 * §13–§19. See packages/mos-studio/README.md for the full mapping.
 */

export type * from "./contracts/refs.js";
export type * from "./contracts/capture.js";
export type * from "./contracts/interviewer.js";
export type * from "./contracts/organization-loading.js";
export type * from "./contracts/studio-artifact-package.js";
export type * from "./contracts/studio-format.js";
export type * from "./contracts/studio-session.js";
export type * from "./contracts/treatment.js";
