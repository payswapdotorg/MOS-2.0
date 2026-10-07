/**
 * In-memory SocialAdapterPort runtime (SOCIAL-001) — THE call surface.
 *
 * The single surface through which social platform interactions happen.
 * The five-stage pipeline (channel resolution → rights gate → policy
 * gate → capability matrix → transport + platform-said typing) lives in
 * ./social-pipeline.ts; the request validation lives in
 * ./social-request-validation.ts; the tenant-scoped append-only logs
 * live in ./social-record-logs.ts. This module wires them together and
 * implements the port's ten methods — one per operation, each typed with
 * artifact-ref inputs (never inline media) and platform-said output
 * records (never invented).
 *
 * Every attributable attempt appends an immutable §30 record to the
 * tenant-scoped audit log; there is no unrecorded path past channel
 * resolution. Platform-confirmed outputs (publications, schedules,
 * retractions, observations, restrictions) are appended immutably to
 * their tenant-scoped logs — there is no mutation API anywhere.
 *
 * DISCLOSED LIMITS: the logs are ephemeral in-memory append-only logs
 * (durable persistence is TL-owned later work — the port is unchanged);
 * the schedule/retraction logs have no dedicated read method yet (the
 * operations' outputs + the §30 audit log cover this wave's evidence;
 * the retrieval surface grows with SOCIAL-002..006 within the ≤12
 * method budget).
 */

import type { TenantId } from "@mos/contracts";

import type {
  DeleteSocialPostInput,
  ListSocialRestrictionsInput,
  PublishSocialPostInput,
  ReadSocialObservationsInput,
  ScheduleSocialPostInput,
} from "../contracts/social-operation.js";
import { socialArtifactSubject, socialChannelSubject } from "../contracts/social-operation.js";
import type {
  SocialDistributionRecordFilter,
} from "../contracts/distribution-record.js";
import type {
  SocialObservationFilter,
  SocialObservationRecord,
  SocialPublicationFilter,
  SocialRestrictionFilter,
  SocialRestrictionRecord,
  SocialRetractionRecord,
} from "../contracts/social-record.js";
import type {
  SocialObservationId,
  SocialPublicationId,
  SocialRetractionId,
  SocialRestrictionId,
  SocialScheduleId,
  SocialDistributionId,
} from "../contracts/ids.js";
import { DistributionError } from "../errors.js";
import type { SocialAdapterPort } from "../ports/social-adapter.port.js";
import type { SocialChannelRegistryPort } from "../ports/social-channel-registry.port.js";
import type { SocialPolicyGatePort } from "../ports/social-policy-gate.port.js";
import type { SocialRightsGatePort } from "../ports/social-rights-gate.port.js";
import type { SocialTransportPort } from "../ports/social-transport.port.js";
import {
  parseObservations,
  parsePublication,
  parseRestrictions,
  parseRetraction,
  parseSchedule,
} from "./platform-response.js";
import type { PlatformRecordContext } from "./platform-response.js";
import { createSocialPipeline } from "./social-pipeline.js";
import type { PlatformTypingArgs, PlatformTypingResult, SocialPipeline } from "./social-pipeline.js";
import { createSocialRecordLogStore } from "./social-record-logs.js";
import type { SocialRecordLogStore } from "./social-record-logs.js";
import {
  validateDeleteRequest,
  validateListRestrictionsRequest,
  validatePublishRequest,
  validateReadObservationsRequest,
  validateScheduleRequest,
} from "./social-request-validation.js";
import type { ValidatedArtifactPayload } from "./social-request-validation.js";
import { defaultNow } from "./registry-support.js";

/** Options for the in-memory social adapter runtime. */
export interface InMemorySocialAdapterOptions {
  /** The channel registry: channels resolve here (tenant-scoped). */
  readonly channels: SocialChannelRegistryPort;
  /** The rights gate: fail-closed verdicts precede every provider call. */
  readonly rightsGate: SocialRightsGatePort;
  /** The declared policy-gate seam (fail-closed; disclosed double in this wave). */
  readonly policyGate: SocialPolicyGatePort;
  /** The transport seam (disclosed in-memory double in this wave). */
  readonly transport: SocialTransportPort;
  /** Injectable clock (deterministic tests). */
  readonly now?: () => string;
  /** Injectable §30 request-id factory (deterministic tests). */
  readonly idFactory?: () => SocialDistributionId;
}

/**
 * Creates the in-memory {@link SocialAdapterPort} runtime.
 */
export function createInMemorySocialAdapter(
  options: InMemorySocialAdapterOptions,
): SocialAdapterPort {
  const now = options.now ?? defaultNow;
  const channels = options.channels;
  const rightsGate = options.rightsGate;
  const policyGate = options.policyGate;
  const transport = options.transport;

  if (channels === undefined || rightsGate === undefined || policyGate === undefined || transport === undefined) {
    throw new DistributionError(
      "invalid-distribution-composition",
      "the adapter runtime requires all four declared seams (channels, rightsGate, policyGate, transport) — fail-closed composition",
      {},
    );
  }

  const logs: SocialRecordLogStore = createSocialRecordLogStore();
  let minted = 0;
  const nextId = options.idFactory ?? (() => `social-distribution-${++minted}` as SocialDistributionId);
  const nextPublicationId = () => `social-publication-${++minted}` as SocialPublicationId;
  const nextScheduleId = () => `social-schedule-${++minted}` as SocialScheduleId;
  const nextRetractionId = () => `social-retraction-${++minted}` as SocialRetractionId;
  const nextObservationId = () => `social-observation-${++minted}` as SocialObservationId;
  const nextRestrictionId = () => `social-restriction-${++minted}` as SocialRestrictionId;

  const pipeline: SocialPipeline = createSocialPipeline({
    channels,
    rightsGate,
    policyGate,
    transport,
    logs,
    now,
    nextId,
  });

  /** Publishes (or schedules) one artifact through the full pipeline. */
  function artifactOperation<TOutput>(
    request: PublishSocialPostInput | ScheduleSocialPostInput,
    operation: "publish" | "schedule",
    validated: ValidatedArtifactPayload,
    parameters: { readonly artifact: unknown; readonly presentation: unknown; readonly scheduledAt?: string },
    typeOutput: (context: PlatformRecordContext, args: PlatformTypingArgs) => PlatformTypingResult<TOutput>,
  ) {
    // The artifact travels as its REFERENCE inside the small
    // control-plane parameters (never media bytes — structurally pinned;
    // the values are the frozen plain-JSON ref objects).
    return pipeline.run<TOutput>(
      request,
      operation,
      () => socialArtifactSubject(validated.artifact),
      { artifact: validated.artifact, presentation: validated.presentation },
      (context) =>
        pipeline.transportStage(context, request, operation, parameters, (args) =>
          typeOutput(pipeline.platformContext(context, args), args),
        ),
    );
  }

  const runtime: SocialAdapterPort = {
    publish(request: PublishSocialPostInput) {
      const validated = validatePublishRequest(request);
      return artifactOperation(
        request,
        "publish",
        validated,
        { artifact: validated.artifact, presentation: validated.presentation },
        (context, args) => {
          const parsed = parsePublication(
            args.output,
            context,
            validated.artifact,
            validated.presentation,
            nextPublicationId,
          );
          if (!parsed.ok) {
            return { ok: false, failure: parsed.failure };
          }
          return {
            ok: true,
            value: parsed.value,
            append: () => {
              logs.appendPublication(parsed.value);
            },
          };
        },
      );
    },

    schedule(request: ScheduleSocialPostInput) {
      const validated = validateScheduleRequest(request);
      return artifactOperation(
        request,
        "schedule",
        validated,
        { artifact: validated.artifact, presentation: validated.presentation, scheduledAt: request.scheduledAt },
        (context, args) => {
          const parsed = parseSchedule(
            args.output,
            context,
            validated.artifact,
            validated.presentation,
            request.scheduledAt,
            nextScheduleId,
          );
          if (!parsed.ok) {
            return { ok: false, failure: parsed.failure };
          }
          return {
            ok: true,
            value: parsed.value,
            append: () => {
              logs.appendSchedule(parsed.value);
            },
          };
        },
      );
    },

    readObservations(request: ReadSocialObservationsInput) {
      validateReadObservationsRequest(request);
      return pipeline.run<readonly SocialObservationRecord[]>(
        request,
        "read-observations",
        (channel) => socialChannelSubject(channel),
        {},
        (context) =>
          pipeline.transportStage(
            context,
            request,
            "read-observations",
            request.subjectRef !== undefined ? { subjectRef: request.subjectRef } : {},
            (args) => {
              const parsed = parseObservations(args.output, pipeline.platformContext(context, args), nextObservationId);
              if (!parsed.ok) {
                return { ok: false, failure: parsed.failure };
              }
              return {
                ok: true,
                value: parsed.value,
                append: () => {
                  for (const record of parsed.value) {
                    logs.appendObservation(record);
                  }
                },
              };
            },
          ),
      );
    },

    delete(request: DeleteSocialPostInput) {
      validateDeleteRequest(request);
      return pipeline.run<SocialRetractionRecord>(
        request,
        "delete",
        (channel) => socialChannelSubject(channel),
        {},
        (context) =>
          pipeline.transportStage(context, request, "delete", { postRef: request.postRef as string }, (args) => {
            const parsed = parseRetraction(
              args.output,
              pipeline.platformContext(context, args),
              request.postRef,
              nextRetractionId,
            );
            if (!parsed.ok) {
              return { ok: false, failure: parsed.failure };
            }
            return {
              ok: true,
              value: parsed.value,
              append: () => {
                logs.appendRetraction(parsed.value);
              },
            };
          }),
      );
    },

    listRestrictions(request: ListSocialRestrictionsInput) {
      validateListRestrictionsRequest(request);
      return pipeline.run<readonly SocialRestrictionRecord[]>(
        request,
        "list-restrictions",
        (channel) => socialChannelSubject(channel),
        {},
        (context) =>
          pipeline.transportStage(context, request, "list-restrictions", {}, (args) => {
            const parsed = parseRestrictions(args.output, pipeline.platformContext(context, args), nextRestrictionId);
            if (!parsed.ok) {
              return { ok: false, failure: parsed.failure };
            }
            return {
              ok: true,
              value: parsed.value,
              append: () => {
                for (const record of parsed.value) {
                  logs.appendRestriction(record);
                }
              },
            };
          }),
      );
    },

    listPublications(tenantId: TenantId, filter?: SocialPublicationFilter) {
      return logs.listPublications(tenantId, filter);
    },

    listObservations(tenantId: TenantId, filter?: SocialObservationFilter) {
      return logs.listObservations(tenantId, filter);
    },

    listRestrictionRecords(tenantId: TenantId, filter?: SocialRestrictionFilter) {
      return logs.listRestrictionRecords(tenantId, filter);
    },

    listDistributionRecords(tenantId: TenantId, filter?: SocialDistributionRecordFilter) {
      return logs.listDistributionRecords(tenantId, filter);
    },

    getDistributionRecord(tenantId: TenantId, distributionId: SocialDistributionId) {
      return logs.getDistributionRecord(tenantId, distributionId);
    },
  };

  return runtime;
}
