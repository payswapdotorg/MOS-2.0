/**
 * Fail-closed notification submission validation (NOTIFY-001) — pure logic.
 *
 * Every enqueue is validated with NAMED reasons (the typed-failure
 * discipline of the sibling registries): tenant scope, dedup key,
 * declarative kind vocabulary, contract version, submitting actor,
 * recipient identity ref, reference-only subject (artifact refs
 * field-complete AND tenant-consistent — §31 fail-closed: the jobs
 * module has no sharing contract, so cross-tenant subject refs are
 * denied) and the declared retry policy. No clocks, no IO.
 */

import type { NotificationSubmission } from "../contracts/notification.js";
import { NOTIFICATION_KINDS } from "../contracts/notification.js";
import { retryPolicyViolations } from "./retry-policy.js";

/** The frozen ArtifactRef field set (structural fail-closed check). */
const ARTIFACT_REF_REQUIRED_FIELDS = [
  "artifactId",
  "version",
  "tenantId",
  "digest",
  "type",
  "storageRef",
  "rightsRef",
  "provenanceRef",
] as const;

/** Validates a submitter actor record (user / service / agent). */
function isValidSubmitter(actor: unknown): boolean {
  if (actor === null || typeof actor !== "object") {
    return false;
  }
  const kind = (actor as { kind?: unknown }).kind;
  if (kind === "user") {
    return typeof (actor as { identityRef?: unknown }).identityRef === "string";
  }
  if (kind === "service") {
    return typeof (actor as { name?: unknown }).name === "string";
  }
  if (kind === "agent") {
    return typeof (actor as { instanceRef?: unknown }).instanceRef === "string";
  }
  return false;
}

/** Validates the reference-only subject (three ref lists, never inline content). */
function subjectViolations(
  subject: unknown,
  tenantId: string,
): string[] {
  const violations: string[] = [];
  if (subject === null || typeof subject !== "object") {
    return ["subject must be a NotificationSubject record"];
  }
  const lists: readonly [string, unknown][] = [
    ["subject.artifactRefs", (subject as { artifactRefs?: unknown }).artifactRefs],
    ["subject.taskRefs", (subject as { taskRefs?: unknown }).taskRefs],
    ["subject.missionRefs", (subject as { missionRefs?: unknown }).missionRefs],
  ];
  for (const [label, list] of lists) {
    if (!Array.isArray(list)) {
      violations.push(`${label} must be an array`);
    }
  }
  const artifactRefs = (subject as { artifactRefs?: unknown }).artifactRefs;
  if (Array.isArray(artifactRefs)) {
    artifactRefs.forEach((ref, index) => {
      if (ref === null || typeof ref !== "object") {
        violations.push(`subject.artifactRefs[${index}] must be an object`);
        return;
      }
      for (const field of ARTIFACT_REF_REQUIRED_FIELDS) {
        if ((ref as Record<string, unknown>)[field] === undefined) {
          violations.push(
            `subject.artifactRefs[${index}] is missing ArtifactRef field '${field}'`,
          );
          break;
        }
      }
      // §31 fail-closed: cross-tenant subject refs are denied.
      if (
        typeof (ref as Record<string, unknown>).tenantId === "string"
        && (ref as Record<string, unknown>).tenantId !== tenantId
      ) {
        violations.push(
          `subject.artifactRefs[${index}] belongs to a different tenant than the notification scope`,
        );
      }
    });
  }
  const taskRefs = (subject as { taskRefs?: unknown }).taskRefs;
  if (Array.isArray(taskRefs)) {
    taskRefs.forEach((ref, index) => {
      if (typeof ref !== "string" || ref === "") {
        violations.push(`subject.taskRefs[${index}] must be a non-empty task id`);
      }
    });
  }
  const missionRefs = (subject as { missionRefs?: unknown }).missionRefs;
  if (Array.isArray(missionRefs)) {
    missionRefs.forEach((ref, index) => {
      if (typeof ref !== "string" || ref === "") {
        violations.push(`subject.missionRefs[${index}] must be a non-empty mission ref`);
      }
    });
  }
  return violations;
}

/** Every named reason the submission is invalid (empty = valid). */
export function notificationSubmissionViolations(
  submission: NotificationSubmission,
): readonly string[] {
  const violations: string[] = [];
  if (
    submission === null
    || typeof submission !== "object"
    || submission.scope === null
    || typeof submission.scope !== "object"
    || typeof (submission.scope as { tenantId?: unknown }).tenantId !== "string"
    || (submission.scope as { tenantId?: unknown }).tenantId === ""
  ) {
    violations.push("scope.tenantId must be a non-empty string");
    return violations;
  }
  if (typeof submission.dedupKey !== "string" || submission.dedupKey === "") {
    violations.push("dedupKey must be a non-empty string");
  }
  if (!NOTIFICATION_KINDS.includes(submission.kind)) {
    violations.push(
      `kind must be one of the declarative kinds: ${NOTIFICATION_KINDS.join(", ")}`,
    );
  }
  if (
    typeof submission.contractVersion !== "number"
    || !Number.isInteger(submission.contractVersion)
    || submission.contractVersion < 1
  ) {
    violations.push("contractVersion must be an integer >= 1");
  }
  if (!isValidSubmitter(submission.submittedBy)) {
    violations.push("submittedBy must be a user/service/agent actor record");
  }
  if (typeof submission.recipient !== "string" || submission.recipient === "") {
    violations.push("recipient must be a non-empty identity ref");
  }
  violations.push(
    ...subjectViolations(
      submission.subject,
      (submission.scope as { tenantId: string }).tenantId,
    ),
  );
  if (submission.retryPolicy === null || typeof submission.retryPolicy !== "object") {
    violations.push("retryPolicy must be a NotificationRetryPolicy record");
  } else {
    violations.push(...retryPolicyViolations(submission.retryPolicy));
  }
  return violations;
}
