import { z } from "zod";
import { requestWorkflowSchema } from "../assisted-order/request-intent-workflow";

/** A scoped operational projection, not a new identity, referral or clinical authority. */
export const AE_WORKSPACE_SCHEMA_VERSION = 1 as const;
export const AE_WORKSPACE_INTEGRATION_STAGE = "canonical_adapter_unmounted" as const;
export const AE_WORKSPACE_MAX_CUSTOMERS = 500;
export const AE_WORKSPACE_MAX_REQUESTS_PER_CUSTOMER = 100;
export const aeIdentifier = z.string().uuid().transform(value => value.toLowerCase());
export const aeInstant = z.string().datetime({ offset: true });
export const aeRevision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);

export const AE_OPERATION_CAPABILITIES = [
  "workspace:read", "customer:contact", "followup:record", "customer:reassign", "customer:assign",
] as const;
export type AeOperationCapability = typeof AE_OPERATION_CAPABILITIES[number];

export const aeFailureSchema = z.object({
  ok: z.literal(false),
  code: z.enum(["access_denied", "not_found", "invalid_input", "revision_conflict", "idempotency_conflict", "unavailable"]),
}).strict();
export type AeFailure = z.infer<typeof aeFailureSchema>;
export type AeResult<T> = Readonly<{ ok: true; value: T }> | AeFailure;

const publicReference = z.string().regex(/^XRI-[0-9A-F]{32}$/);
/** Presence metadata only. Raw intake text is outside the AE projection. */
export const aeOriginalReferralInputSchema = z.object({
  state: z.enum(["redacted", "none", "unavailable"]),
}).strict();
export const aeRequestSummarySchema = z.object({
  requestId: aeIdentifier,
  publicReference,
  receiptStatus: z.literal("pending_review"),
  submittedAt: aeInstant,
  originalReferralInput: aeOriginalReferralInputSchema,
  workflow: requestWorkflowSchema.nullable(),
}).strict().superRefine((value, ctx) => {
  if (value.publicReference !== `XRI-${value.requestId.replaceAll("-", "").toUpperCase()}` ||
    (value.workflow && (value.workflow.requestId !== value.requestId || value.workflow.publicReference !== value.publicReference))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Request identity mismatch." });
  }
});

export const aeContactSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("available"), displayName: z.string().trim().min(1).max(200),
    email: z.string().email().max(254), phone: z.string().trim().min(1).max(40).nullable() }).strict(),
  z.object({ state: z.enum(["not_permitted", "unavailable"]) }).strict(),
]);
export const aeReferralSummarySchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("recorded"), partnerId: aeIdentifier, boundAt: aeInstant,
    availability: z.enum(["ready", "revoked", "expired", "partner_inactive", "self_referral"]) }).strict(),
  z.object({ state: z.enum(["none", "unresolved", "unavailable"]) }).strict(),
]);

export const AE_FOLLOWUP_PURPOSES = ["contact_customer", "request_status_followup", "documentation_followup"] as const;
export const aeFollowupSchema = z.object({
  id: aeIdentifier, customerAuthUserId: aeIdentifier, assignmentId: aeIdentifier,
  ownerAuthUserId: aeIdentifier, purpose: z.enum(AE_FOLLOWUP_PURPOSES), dueAt: aeInstant,
  state: z.enum(["open", "completed"]), createdAt: aeInstant,
}).strict();
export const aeAssignmentSchema = z.object({
  id: aeIdentifier, scopeId: aeIdentifier, customerAuthUserId: aeIdentifier,
  assigneeAuthUserId: aeIdentifier, revision: aeRevision,
}).strict();
export const aeAssignmentHistoryEventSchema = z.object({
  id: aeIdentifier, assignmentId: aeIdentifier, scopeId: aeIdentifier, customerAuthUserId: aeIdentifier,
  revision: aeRevision, actorAuthUserId: aeIdentifier, assigneeAuthUserId: aeIdentifier,
  previousAssigneeAuthUserId: aeIdentifier.nullable(), kind: z.enum(["assigned", "reassigned"]), occurredAt: aeInstant,
}).strict().superRefine((value, ctx) => {
  if ((value.kind === "assigned" && value.previousAssigneeAuthUserId !== null) ||
    (value.kind === "reassigned" && (value.previousAssigneeAuthUserId === null ||
      value.previousAssigneeAuthUserId === value.assigneeAuthUserId))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid assignment event." });
  }
});
export const aeAssignmentHistorySchema = z.discriminatedUnion("state", [
  // An available source is a complete scoped audit read, not inferred from the
  // current assignment. Larger/partial histories need a separately scoped pager.
  z.object({ state: z.literal("available"), events: z.array(aeAssignmentHistoryEventSchema).max(100) }).strict(),
  z.object({ state: z.literal("unavailable") }).strict(),
]);
export const aeCustomerSchema = z.object({
  assignment: aeAssignmentSchema,
  assignmentHistory: aeAssignmentHistorySchema,
  contact: aeContactSchema,
  referral: aeReferralSummarySchema,
  requests: z.array(aeRequestSummarySchema).max(AE_WORKSPACE_MAX_REQUESTS_PER_CUSTOMER),
  followups: z.array(aeFollowupSchema).max(100),
}).strict().superRefine((value, ctx) => {
  const history = value.assignmentHistory.state === "available" ? value.assignmentHistory.events : [];
  if (new Set(value.requests.map(row => row.requestId)).size !== value.requests.length ||
    new Set(value.followups.map(row => row.id)).size !== value.followups.length ||
    value.followups.some(row => row.customerAuthUserId !== value.assignment.customerAuthUserId ||
      row.assignmentId !== value.assignment.id || (row.ownerAuthUserId !== value.assignment.assigneeAuthUserId &&
        (row.state !== "completed" || !history.some(event => event.assigneeAuthUserId === row.ownerAuthUserId))))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Customer scope mismatch." });
  }
  if ((history.length > 0 && history[0].kind !== "assigned") ||
    new Set(history.map(row => row.id)).size !== history.length || history.some((row, index) =>
    row.assignmentId !== value.assignment.id || row.scopeId !== value.assignment.scopeId ||
    row.customerAuthUserId !== value.assignment.customerAuthUserId || row.revision > value.assignment.revision ||
    (index > 0 && (row.revision <= history[index - 1].revision ||
      Date.parse(row.occurredAt) < Date.parse(history[index - 1].occurredAt) ||
      row.previousAssigneeAuthUserId !== history[index - 1].assigneeAuthUserId))) ||
    (history.length > 0 && history[history.length - 1].assigneeAuthUserId !== value.assignment.assigneeAuthUserId)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Assignment history scope mismatch." });
  }
});
export const aeWorkspaceSchema = z.object({
  schemaVersion: z.literal(AE_WORKSPACE_SCHEMA_VERSION),
  actorAuthUserId: aeIdentifier,
  scopeId: aeIdentifier,
  generatedAt: aeInstant,
  capabilities: z.array(z.enum(AE_OPERATION_CAPABILITIES)).max(AE_OPERATION_CAPABILITIES.length),
  customers: z.array(aeCustomerSchema).max(AE_WORKSPACE_MAX_CUSTOMERS),
}).strict().superRefine((value, ctx) => {
  const contactsAllowed = value.capabilities.includes("customer:contact");
  if (!value.capabilities.includes("workspace:read") || new Set(value.capabilities).size !== value.capabilities.length ||
    new Set(value.customers.map(row => row.assignment.customerAuthUserId)).size !== value.customers.length ||
    new Set(value.customers.map(row => row.assignment.id)).size !== value.customers.length ||
    value.customers.some(row => row.assignment.scopeId !== value.scopeId ||
      row.assignment.assigneeAuthUserId !== value.actorAuthUserId || (!contactsAllowed && row.contact.state !== "not_permitted") ||
      (row.assignmentHistory.state === "available" && row.assignmentHistory.events.some(event =>
        Date.parse(event.occurredAt) > Date.parse(value.generatedAt)))) ||
    new Set(value.customers.flatMap(row => row.requests.map(request => request.requestId))).size !==
      value.customers.reduce((count, row) => count + row.requests.length, 0) ||
    new Set(value.customers.flatMap(row => row.followups.map(task => task.id))).size !==
      value.customers.reduce((count, row) => count + row.followups.length, 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Workspace scope mismatch." });
  }
});

const commandBase = {
  commandId: aeIdentifier, assignmentId: aeIdentifier, customerAuthUserId: aeIdentifier,
  expectedRevision: aeRevision.max(Number.MAX_SAFE_INTEGER - 1),
};
export const aeWorkspaceCommandSchema = z.discriminatedUnion("kind", [
  z.object({ ...commandBase, kind: z.literal("record_followup"), purpose: z.enum(AE_FOLLOWUP_PURPOSES), dueAt: aeInstant }).strict(),
  z.object({ ...commandBase, kind: z.literal("reassign"), nextAssigneeAuthUserId: aeIdentifier }).strict(),
]);
export const aeInitialAssignmentCommandSchema = z.object({
  commandId: aeIdentifier, customerAuthUserId: aeIdentifier, assigneeAuthUserId: aeIdentifier,
}).strict();
export const aeGuestClaimCommandSchema = z.object({ commandId: aeIdentifier, requestId: aeIdentifier }).strict();
export const aeGuestClaimReceiptSchema = z.object({ requestId: aeIdentifier, claimId: aeIdentifier, replay: z.boolean() }).strict();
export const aeCommandAuditSchema = z.object({
  id: aeIdentifier, commandId: aeIdentifier, actorAuthUserId: aeIdentifier,
  assignmentId: aeIdentifier, customerAuthUserId: aeIdentifier,
  kind: z.enum(["followup_recorded", "assignment_reassigned", "assignment_assigned"]), occurredAt: aeInstant,
}).strict();
/** Reassignment moves open tasks only, in the same audited transaction.
 * Completed tasks keep their historical owner and require scoped history. */
export const aeFollowupTransferSchema = z.object({
  followupId: aeIdentifier, fromOwnerAuthUserId: aeIdentifier, toOwnerAuthUserId: aeIdentifier,
  auditId: aeIdentifier, occurredAt: aeInstant,
}).strict();
export const aeCommandReceiptSchema = z.object({
  commandId: aeIdentifier, replay: z.boolean(), assignment: aeAssignmentSchema,
  followup: aeFollowupSchema.nullable(), audit: aeCommandAuditSchema,
  followupTransfers: z.array(aeFollowupTransferSchema).max(100),
}).strict();
export const aeWorkspaceEnvelopeSchema = z.union([
  z.object({ ok: z.literal(true), value: aeWorkspaceSchema }).strict(), aeFailureSchema,
]);
export const aeCommandEnvelopeSchema = z.union([
  z.object({ ok: z.literal(true), value: aeCommandReceiptSchema }).strict(), aeFailureSchema,
]);

export type AeWorkspace = z.infer<typeof aeWorkspaceSchema>;
export type AeCustomer = z.infer<typeof aeCustomerSchema>;
export type AeAssignment = z.infer<typeof aeAssignmentSchema>;
export type AeWorkspaceCommand = z.infer<typeof aeWorkspaceCommandSchema>;
export type AeInitialAssignmentCommand = z.infer<typeof aeInitialAssignmentCommandSchema>;
export type AeCommandReceipt = z.infer<typeof aeCommandReceiptSchema>;
