import { z } from "zod";

export const ACCOUNT_LIFECYCLE_PROTOCOL = "account-lifecycle/v1" as const;
export const ACCOUNT_LIFECYCLE_API = "/api/research/account-lifecycle";
export const lifecycleUuid = z.string().uuid().refine(value => value === value.toLowerCase() && value !== "00000000-0000-0000-0000-000000000000");
export const lifecycleDigest = z.string().regex(/^[a-f0-9]{64}$/u);
export const lifecycleVersion = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const lifecycleInstant = z.string().max(27).refine(value => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/u.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 19) === value.slice(0, 19);
});
export function lifecycleMicros(value: string): bigint {
  const canonical = lifecycleInstant.parse(value), fraction = canonical.slice(19, -1).replace(/^\./u, "");
  return BigInt(Date.parse(canonical.slice(0, 19) + ".000Z")) * 1000n + BigInt(fraction.padEnd(6, "0") || "0");
}
export const lifecycleBlocker = z.enum([
  "recent_auth_required", "assurance_unavailable", "admin_authority_unavailable", "policy_unavailable", "policy_changed",
  "preview_expired", "attempt_conflict", "version_conflict", "dependency_unknown", "legal_hold", "clinical_retention",
  "financial_retention", "last_owner_review", "shared_staff_review", "guard_coverage_unavailable", "unsupported_graph",
  "erasure_authority_unavailable", "auth_fk_unresolved", "storage_ownership_unresolved", "provider_unqualified",
  "provider_outcome_unknown", "replay_cleanup_unproven",
]);
export type LifecycleBlocker = z.infer<typeof lifecycleBlocker>;
const axis = z.enum(["not_started", "pending", "verified", "retained", "unknown", "blocked", "not_applicable"]);
export const lifecycleProgress = z.object({ application: axis, providerSessions: axis, eligibleData: axis, retainedData: axis, authIdentity: axis }).strict();
export const lifecyclePreview = z.object({ digest: lifecycleDigest, expiresAt: lifecycleInstant,
  policyRevision: lifecycleDigest, coverageRevision: lifecycleDigest }).strict();
export const lifecycleEnvelope = z.object({
  protocol: z.literal(ACCOUNT_LIFECYCLE_PROTOCOL), operationId: lifecycleUuid.nullable(), version: lifecycleVersion.nullable(),
  state: z.enum(["confirmation_required", "closing", "blocked", "auth_deletion_pending", "auth_outcome_unknown",
    "completed_with_retention", "completed", "withdrawn_before_close", "unavailable"]),
  progress: lifecycleProgress, preview: lifecyclePreview.nullable(), blockers: z.array(lifecycleBlocker).max(22),
  nextAction: z.enum(["confirm", "reauthenticate", "wait", "authorized_review", "none"]),
}).strict().superRefine((value, ctx) => {
  const invalid = () => ctx.addIssue({ code: "custom", message: "Inconsistent lifecycle state" });
  if (new Set(value.blockers).size !== value.blockers.length) invalid();
  if (value.operationId === null || value.version === null) {
    if (value.operationId !== null || value.version !== null || value.state !== "unavailable" || value.preview !== null
      || !value.blockers.length || !["authorized_review", "reauthenticate"].includes(value.nextAction)
      || JSON.stringify(value.progress) !== JSON.stringify({ application: "not_started", providerSessions: "not_started",
        eligibleData: "unknown", retainedData: "unknown", authIdentity: "not_started" })) invalid();
  } else if (value.state === "unavailable") invalid();
  if (value.state === "confirmation_required" && (!value.preview || value.blockers.length || value.nextAction !== "confirm"
    || value.progress.application !== "not_started")) invalid();
  if (value.state === "auth_outcome_unknown" && (value.progress.application !== "verified" || value.progress.authIdentity !== "unknown"
    || !value.blockers.includes("provider_outcome_unknown") || !["wait", "authorized_review"].includes(value.nextAction))) invalid();
  if (value.state === "auth_deletion_pending" && (value.progress.application !== "verified" || value.progress.authIdentity !== "pending"
    || !["verified", "not_applicable"].includes(value.progress.providerSessions)
    || !["verified", "not_applicable"].includes(value.progress.eligibleData)
    || !["retained", "not_applicable"].includes(value.progress.retainedData) || value.blockers.length)) invalid();
  if (value.state === "completed" || value.state === "completed_with_retention") {
    if (value.progress.application !== "verified" || value.progress.authIdentity !== "verified"
      || !["verified", "not_applicable"].includes(value.progress.providerSessions)
      || !["verified", "not_applicable"].includes(value.progress.eligibleData) || value.blockers.length || value.nextAction !== "none"
      || value.progress.retainedData !== (value.state === "completed" ? "not_applicable" : "retained")) invalid();
  }
});
export type AccountLifecycleEnvelope = z.infer<typeof lifecycleEnvelope>;
export function unavailableLifecycle(blocker: LifecycleBlocker): AccountLifecycleEnvelope {
  return { protocol: ACCOUNT_LIFECYCLE_PROTOCOL, operationId: null, version: null, state: "unavailable",
    progress: { application: "not_started", providerSessions: "not_started", eligibleData: "unknown", retainedData: "unknown", authIdentity: "not_started" },
    preview: null, blockers: [blocker], nextAction: blocker === "recent_auth_required" ? "reauthenticate" : "authorized_review" };
}
export const lifecycleAdminReason = z.enum(["privacy_request", "security_response", "authorized_admin_closure"]);
export const lifecycleIssueBody = z.object({ retryKey: z.string().regex(/^[a-zA-Z0-9_-]{16,128}$/u) }).strict();
export const lifecycleCarrier = z.string().min(32).max(4096).regex(/^[A-Za-z0-9._~-]+$/u);
export const lifecycleIssuedReply = z.object({ protocol: z.literal(ACCOUNT_LIFECYCLE_PROTOCOL), attemptCarrier: lifecycleCarrier, expiresAt: lifecycleInstant }).strict();
export const lifecyclePrepareBody = z.object({ attemptCarrier: lifecycleCarrier }).strict();
export const lifecycleConfirmBody = z.object({ operationId: lifecycleUuid, previewDigest: lifecycleDigest,
  expectedVersion: lifecycleVersion, confirm: z.literal(true) }).strict();
export const lifecycleErrorReply = z.object({ protocol: z.literal(ACCOUNT_LIFECYCLE_PROTOCOL),
  code: z.enum(["authentication_required", "forbidden", "invalid_input", "attempt_conflict", "version_conflict", "outcome_uncertain"]) }).strict();
export type LifecycleErrorCode = z.infer<typeof lifecycleErrorReply>["code"];
