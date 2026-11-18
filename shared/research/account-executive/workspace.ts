import { z } from "zod";
import { requestWorkflowSchema } from "../assisted-order/request-intent-workflow";

/** A scoped operational projection, not a new identity, referral or clinical authority. */
export const AE_WORKSPACE_SCHEMA_VERSION = 1 as const;
export const AE_WORKSPACE_INTEGRATION_STAGE = "source_ports_unmounted" as const;
export const AE_WORKSPACE_MAX_CUSTOMERS = 500;
export const AE_WORKSPACE_MAX_REQUESTS_PER_CUSTOMER = 100;
export const aeIdentifier = z.string().uuid();
export const aeInstant = z.string().datetime({ offset: true });
export const aeRevision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);

export const AE_OPERATION_CAPABILITIES = [
  "workspace:read", "customer:contact", "followup:record", "customer:reassign",
] as const;
export type AeOperationCapability = typeof AE_OPERATION_CAPABILITIES[number];

export const aeFailureSchema = z.object({
  ok: z.literal(false),
  code: z.enum(["access_denied", "not_found", "invalid_input", "revision_conflict", "idempotency_conflict", "unavailable"]),
}).strict();
export type AeFailure = z.infer<typeof aeFailureSchema>;
export type AeResult<T> = Readonly<{ ok: true; value: T }> | AeFailure;

const publicReference = z.string().regex(/^XRI-[0-9A-F]{32}$/);
export const aeRequestSummarySchema = z.object({
  requestId: aeIdentifier,
  publicReference,
  receiptStatus: z.literal("pending_review"),
  submittedAt: aeInstant,
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
  z.object({ state: z.enum(["none", "unavailable"]) }).strict(),
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
export const aeCustomerSchema = z.object({
  assignment: aeAssignmentSchema,
  contact: aeContactSchema,
  referral: aeReferralSummarySchema,
  requests: z.array(aeRequestSummarySchema).max(AE_WORKSPACE_MAX_REQUESTS_PER_CUSTOMER),
  followups: z.array(aeFollowupSchema).max(100),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.requests.map(row => row.requestId)).size !== value.requests.length ||
    new Set(value.followups.map(row => row.id)).size !== value.followups.length ||
    value.followups.some(row => row.customerAuthUserId !== value.assignment.customerAuthUserId ||
      row.assignmentId !== value.assignment.id || row.ownerAuthUserId !== value.assignment.assigneeAuthUserId)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Customer scope mismatch." });
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
      row.assignment.assigneeAuthUserId !== value.actorAuthUserId || (!contactsAllowed && row.contact.state !== "not_permitted")) ||
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
export const aeCommandAuditSchema = z.object({
  id: aeIdentifier, commandId: aeIdentifier, actorAuthUserId: aeIdentifier,
  assignmentId: aeIdentifier, customerAuthUserId: aeIdentifier,
  kind: z.enum(["followup_recorded", "assignment_reassigned"]), occurredAt: aeInstant,
}).strict();
export const aeCommandReceiptSchema = z.object({
  commandId: aeIdentifier, replay: z.boolean(), assignment: aeAssignmentSchema,
  followup: aeFollowupSchema.nullable(), audit: aeCommandAuditSchema,
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
export type AeCommandReceipt = z.infer<typeof aeCommandReceiptSchema>;
