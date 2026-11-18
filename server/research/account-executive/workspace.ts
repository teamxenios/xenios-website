import { z } from "zod";
import type { ReferralLifecycleBinding } from "../../../shared/research/referral-v1";
import { REQUEST_INTENT_KIND, type RequestIntentReceipt } from "../../../shared/research/assisted-order/request-intent";
import {
  requestWorkflowSchema, type RequestWorkflowV1,
} from "../../../shared/research/assisted-order/request-intent-workflow";
import {
  AE_OPERATION_CAPABILITIES, AE_WORKSPACE_SCHEMA_VERSION, AE_WORKSPACE_MAX_CUSTOMERS,
  AE_WORKSPACE_MAX_REQUESTS_PER_CUSTOMER, aeIdentifier, aeInstant, aeRevision,
  aeAssignmentSchema, aeFollowupSchema, aeWorkspaceSchema, aeWorkspaceCommandSchema,
  aeCommandReceiptSchema, aeFailureSchema,
  type AeAssignment, type AeCommandReceipt, type AeCustomer, type AeFailure, type AeOperationCapability,
  type AeResult, type AeWorkspace, type AeWorkspaceCommand,
} from "../../../shared/research/account-executive/workspace";

/**
 * These are server adapter contracts, not grants. No production adapter, route,
 * database, customer store or role assignment is installed by this module.
 * Existing affiliate/research_rep membership alone must never produce one.
 */
export interface AeOperationAuthority {
  actorAuthUserId: string;
  scopeId: string;
  grantId: string;
  grantRevision: number;
  active: boolean;
  validFrom: string;
  validUntil: string;
  capabilities: readonly AeOperationCapability[];
}
export interface AeAssignedCustomerSource {
  assignment: AeAssignment;
  contact: { customerAuthUserId: string; displayName: string; email: string; phone: string | null } | null;
  /** A successful canonical Referral V1 read, never a code/email/name join. */
  referral: { state: "recorded"; binding: ReferralLifecycleBinding } | { state: "none" | "unavailable" };
  requests: readonly { ownerAuthUserId: string; receipt: RequestIntentReceipt; workflow: RequestWorkflowV1 | null }[];
  followups: readonly z.infer<typeof aeFollowupSchema>[];
}
export interface AeAuthorizedSnapshot {
  authority: AeOperationAuthority;
  completeness: "complete";
  customers: readonly AeAssignedCustomerSource[];
}
export interface AeAtomicCommandResult {
  authority: AeOperationAuthority;
  receipt: AeCommandReceipt;
}
export interface AeCustomerOperationScope {
  authority: AeOperationAuthority;
  assignment: AeAssignment;
}
export interface AeWorkspaceAuthorityPort {
  /**
   * Resolve current canonical Auth/staff grant + explicit AE assignment scope
   * BEFORE selecting contacts. Recheck revocation/expiry every call. Return a
   * coherent complete assigned-only snapshot, or a failure; do not cache a
   * positive scope or convert source errors/partial reads into an empty array.
   */
  readAssignedSnapshot(actorAuthUserId: string, at: string): Promise<AeResult<AeAuthorizedSnapshot>>;
  /** Minimal fresh per-customer scope; never load contacts for command authorization. */
  authorizeCustomerOperation(input: {
    actorAuthUserId: string; customerAuthUserId: string; capability: AeOperationCapability; at: string;
  }): Promise<AeResult<AeCustomerOperationScope>>;
  /**
   * One durable transaction must resolve fresh actor/customer/target authority,
   * lock assignment revision, deduplicate actor+commandId (exact payload replay
   * only), perform the operation and append its audit. Recheck permissions on
   * replay too. Assignment and referral ownership are SEPARATE: never update
   * ReferralV1 binding.partnerId, link/touch lineage, or commission economics.
   * No email/clinical/workflow transition is implied. Validate the receipt before
   * committing. There is intentionally no permissive or in-memory fallback.
   */
  commitAuthorizedCommand(input: {
    actorAuthUserId: string; at: string; command: AeWorkspaceCommand;
    expectedAuthority: { scopeId: string; grantId: string; grantRevision: number };
  }): Promise<AeResult<AeAtomicCommandResult>>;
}

const authoritySchema = z.object({
  actorAuthUserId: aeIdentifier, scopeId: aeIdentifier, grantId: aeIdentifier, grantRevision: aeRevision,
  active: z.boolean(), validFrom: aeInstant, validUntil: aeInstant,
  capabilities: z.array(z.enum(AE_OPERATION_CAPABILITIES)).max(AE_OPERATION_CAPABILITIES.length),
}).strict().refine(value => new Set(value.capabilities).size === value.capabilities.length &&
  Date.parse(value.validUntil) > Date.parse(value.validFrom));
const receiptSourceSchema = z.object({
  kind: z.literal(REQUEST_INTENT_KIND), requestId: aeIdentifier,
  publicReference: z.string(), status: z.literal("pending_review"), createdAt: aeInstant,
});
const referralBindingSchema = z.object({
  accountKey: z.string().regex(/^auth:[0-9a-f-]{36}$/), partnerId: aeIdentifier,
  linkId: aeIdentifier, touchId: aeIdentifier, boundAt: aeInstant,
  revisionId: aeIdentifier.optional(), effectiveAt: aeInstant.optional(),
  source: z.enum(["capture", "admin_transfer"]).optional(),
  availability: z.enum(["ready", "revoked", "expired", "partner_inactive", "self_referral"]),
}).refine(value => (value.revisionId === undefined) === (value.effectiveAt === undefined) &&
  (value.revisionId === undefined) === (value.source === undefined) &&
  (value.effectiveAt === undefined || Date.parse(value.effectiveAt) >= Date.parse(value.boundAt)));
const sourceCustomerSchema = z.object({
  assignment: aeAssignmentSchema,
  contact: z.unknown().optional(),
  referral: z.discriminatedUnion("state", [
    z.object({ state: z.literal("recorded"), binding: referralBindingSchema }),
    z.object({ state: z.enum(["none", "unavailable"]) }),
  ]),
  requests: z.array(z.object({ ownerAuthUserId: aeIdentifier, receipt: receiptSourceSchema,
    workflow: requestWorkflowSchema.nullable() })).max(AE_WORKSPACE_MAX_REQUESTS_PER_CUSTOMER),
  followups: z.array(aeFollowupSchema).max(100),
});
const contactSourceSchema = z.object({ customerAuthUserId: aeIdentifier,
  displayName: z.string().trim().min(1).max(200), email: z.string().email().max(254),
  phone: z.string().trim().min(1).max(40).nullable() });
const failed = (code: AeFailure["code"]): AeFailure => ({ ok: false, code });
function safeFailure(value: unknown): AeFailure {
  const parsed = aeFailureSchema.safeParse(value);
  return parsed.success ? parsed.data : failed("unavailable");
}
function permitted(authority: AeOperationAuthority, actor: string, at: string, capability: AeOperationCapability): boolean {
  const now = Date.parse(at);
  return authority.actorAuthUserId === actor && authority.active &&
    Date.parse(authority.validFrom) <= now && now < Date.parse(authority.validUntil) &&
    authority.capabilities.includes(capability);
}

export function createAeWorkspaceService(port: AeWorkspaceAuthorityPort | null, clock: () => number = Date.now) {
  function instant(): string { return new Date(clock()).toISOString(); }
  return {
    async read(actorAuthUserId: unknown): Promise<AeResult<AeWorkspace>> {
      const actor = aeIdentifier.safeParse(actorAuthUserId);
      if (!actor.success) return failed("access_denied");
      if (!port) return failed("unavailable");
      try {
        const at = instant();
        const response = await port.readAssignedSnapshot(actor.data, at);
        if (!response || response.ok !== true) return safeFailure(response);
        const authority = authoritySchema.parse(response.value.authority), completedAt = instant();
        if (!permitted(authority, actor.data, completedAt, "workspace:read")) return failed("access_denied");
        if (response.value.completeness !== "complete") return failed("unavailable");
        const source = z.array(sourceCustomerSchema).max(AE_WORKSPACE_MAX_CUSTOMERS).parse(response.value.customers);
        const customers: AeCustomer[] = [];
        for (const row of source) {
          const assignment = row.assignment;
          if (assignment.scopeId !== authority.scopeId || assignment.assigneeAuthUserId !== actor.data) return failed("unavailable");
          let contact: AeCustomer["contact"] = { state: "not_permitted" };
          if (authority.capabilities.includes("customer:contact")) {
            if (row.contact == null) contact = { state: "unavailable" };
            else {
              const item = contactSourceSchema.parse(row.contact);
              if (item.customerAuthUserId !== assignment.customerAuthUserId) return failed("unavailable");
              contact = { state: "available", displayName: item.displayName, email: item.email, phone: item.phone };
            }
          }
          let referral: AeCustomer["referral"] = { state: row.referral.state === "none" ? "none" : "unavailable" };
          if (row.referral.state === "recorded") {
            const binding = row.referral.binding;
            if (binding.accountKey !== `auth:${assignment.customerAuthUserId}`) return failed("unavailable");
            referral = { state: "recorded", partnerId: binding.partnerId, boundAt: binding.boundAt,
              availability: binding.availability };
          }
          const requests: AeCustomer["requests"] = [];
          for (const request of row.requests) {
            if (request.ownerAuthUserId !== assignment.customerAuthUserId) return failed("unavailable");
            requests.push({ requestId: request.receipt.requestId, publicReference: request.receipt.publicReference,
              receiptStatus: request.receipt.status, submittedAt: request.receipt.createdAt, workflow: request.workflow });
          }
          customers.push({ assignment, contact, referral, requests, followups: row.followups });
        }
        // Output is an explicit shared allowlist. Profile/clinical/line-item/free
        // text columns added to source records cannot become AE response fields.
        const value = aeWorkspaceSchema.parse({ schemaVersion: AE_WORKSPACE_SCHEMA_VERSION,
          actorAuthUserId: actor.data, scopeId: authority.scopeId, generatedAt: completedAt,
          capabilities: authority.capabilities, customers });
        return { ok: true, value };
      } catch {
        // Never reflect source errors containing customer data or credentials.
        return failed("unavailable");
      }
    },
    async command(actorAuthUserId: unknown, raw: unknown): Promise<AeResult<AeCommandReceipt>> {
      const actor = aeIdentifier.safeParse(actorAuthUserId);
      if (!actor.success) return failed("access_denied");
      const parsed = aeWorkspaceCommandSchema.safeParse(raw);
      if (!parsed.success) return failed("invalid_input");
      if (!port) return failed("unavailable");
      try {
        const at = instant(), command = parsed.data;
        const capability = command.kind === "record_followup" ? "followup:record" : "customer:reassign";
        if (command.kind === "reassign" && command.nextAssigneeAuthUserId === actor.data) return failed("invalid_input");
        const scoped = await port.authorizeCustomerOperation({
          actorAuthUserId: actor.data, customerAuthUserId: command.customerAuthUserId, capability, at,
        });
        if (!scoped || scoped.ok !== true) return safeFailure(scoped);
        const fresh = authoritySchema.parse(scoped.value.authority), assignmentScope = aeAssignmentSchema.parse(scoped.value.assignment);
        if (!permitted(fresh, actor.data, instant(), capability)) return failed("access_denied");
        if (assignmentScope.id !== command.assignmentId || assignmentScope.customerAuthUserId !== command.customerAuthUserId ||
          assignmentScope.scopeId !== fresh.scopeId || assignmentScope.assigneeAuthUserId !== actor.data) return failed("not_found");
        const response = await port.commitAuthorizedCommand({ actorAuthUserId: actor.data, at: instant(), command,
          expectedAuthority: { scopeId: fresh.scopeId, grantId: fresh.grantId, grantRevision: fresh.grantRevision } });
        if (!response || response.ok !== true) return safeFailure(response);
        const authority = authoritySchema.parse(response.value.authority);
        const completedAt = instant();
        if (!permitted(authority, actor.data, completedAt, capability)) return failed("access_denied");
        if (authority.scopeId !== fresh.scopeId || authority.grantId !== fresh.grantId ||
          authority.grantRevision !== fresh.grantRevision) return failed("unavailable");
        const receipt = aeCommandReceiptSchema.parse(response.value.receipt);
        const assignment = receipt.assignment, audit = receipt.audit;
        if (receipt.commandId !== command.commandId || assignment.id !== command.assignmentId ||
          assignment.customerAuthUserId !== command.customerAuthUserId || assignment.scopeId !== authority.scopeId ||
          assignment.revision !== command.expectedRevision + 1 || audit.commandId !== command.commandId ||
          audit.actorAuthUserId !== actor.data || audit.assignmentId !== command.assignmentId ||
          audit.customerAuthUserId !== command.customerAuthUserId || Date.parse(audit.occurredAt) > Date.parse(completedAt)) {
          return failed("unavailable");
        }
        if (command.kind === "record_followup") {
          const followup = receipt.followup;
          if (assignment.assigneeAuthUserId !== actor.data || audit.kind !== "followup_recorded" || !followup ||
            followup.assignmentId !== assignment.id || followup.customerAuthUserId !== assignment.customerAuthUserId ||
            followup.ownerAuthUserId !== actor.data || followup.purpose !== command.purpose ||
            followup.dueAt !== command.dueAt || followup.state !== "open" || followup.createdAt !== audit.occurredAt) return failed("unavailable");
        } else if (assignment.assigneeAuthUserId !== command.nextAssigneeAuthUserId ||
          audit.kind !== "assignment_reassigned" || receipt.followup !== null || command.nextAssigneeAuthUserId === actor.data) {
          return failed("unavailable");
        }
        return { ok: true, value: receipt };
      } catch {
        return failed("unavailable");
      }
    },
  };
}
