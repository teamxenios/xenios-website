import { z } from "zod";
import type { ReferralLifecycleBinding } from "../../../shared/research/referral-v1";
import { REQUEST_INTENT_KIND, type RequestIntentReceipt } from "../../../shared/research/assisted-order/request-intent";
import {
  requestWorkflowSchema, type RequestWorkflowV1,
} from "../../../shared/research/assisted-order/request-intent-workflow";
import {
  AE_OPERATION_CAPABILITIES, AE_WORKSPACE_SCHEMA_VERSION, AE_WORKSPACE_MAX_CUSTOMERS,
  AE_WORKSPACE_MAX_REQUESTS_PER_CUSTOMER, aeIdentifier, aeInstant, aeRevision,
  aeAssignmentSchema, aeAssignmentHistorySchema, aeFollowupSchema, aeWorkspaceSchema, aeWorkspaceCommandSchema,
  aeCommandReceiptSchema, aeFailureSchema, aeInitialAssignmentCommandSchema,
  type AeAssignment, type AeCommandReceipt, type AeCustomer, type AeFailure, type AeOperationCapability,
  type AeResult, type AeWorkspace, type AeWorkspaceCommand, type AeInitialAssignmentCommand,
} from "../../../shared/research/account-executive/workspace";
import { memberOwnerHash, isVerifiedGuestOwnership, type AeVerifiedGuestOwnership } from "./identity-binding";

export interface AeVerifiedSession {
  authUserId: string;
  purpose: "ordinary" | "recovery";
  sessionId: string;
}
const verifiedSessionSchema = z.object({
  authUserId: aeIdentifier, purpose: z.enum(["ordinary", "recovery"]), sessionId: aeIdentifier,
}).strict();
function ordinarySession(value: unknown): AeVerifiedSession | null {
  const parsed = verifiedSessionSchema.safeParse(value);
  return parsed.success && parsed.data.purpose === "ordinary" ? parsed.data : null;
}

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
  /** Complete scoped canonical audit read; omission is unavailable, never []. */
  assignmentHistory?: AeCustomer["assignmentHistory"];
  contact: { customerAuthUserId: string; displayName: string; email: string; phone: string | null } | null;
  /** A canonical attribution result, never a code/email/name join. A missing
   * binding alone does not prove no referrer; an unresolved referrer never
   * blocks ordinary assignment. This is distinct from original intake input. */
  referral: { state: "recorded"; binding: ReferralLifecycleBinding } | { state: "none" | "unresolved" | "unavailable" };
  requests: readonly { ownerHash: string; receipt: RequestIntentReceipt; workflow: RequestWorkflowV1 | null;
    ownershipEvidence?: AeVerifiedGuestOwnership;
    /** Canonical request-bound input presence only; no raw text/derived match. */
    originalReferralInput?: { requestId: string; state: "recorded" | "none" | "unavailable" } }[];
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
  openFollowupIds: readonly string[];
}
export interface AeWorkspaceAuthorityPort {
  /**
   * Resolve current canonical Auth/purpose/required assurance, staff grant and explicit AE assignment scope
   * BEFORE selecting contacts. Recheck revocation/expiry every call. Return a
   * coherent complete assigned-only snapshot, or a failure; do not cache a
   * positive scope or convert source errors/partial reads into an empty array.
   */
  readAssignedSnapshot(actorAuthUserId: string, at: string, sessionId: string): Promise<AeResult<AeAuthorizedSnapshot>>;
  /**
   * Minimal fresh CURRENT per-customer scope, including on replay. Never load
   * contacts for command authorization. A committed reassign transfers this
   * access: the former assignee's same-command retry is deliberately not_found,
   * even if its response was lost and a broader AE grant is still active.
   * Historical ownership is not a receipt-read or new mutation capability.
   */
  authorizeCustomerOperation(input: {
    actorAuthUserId: string; customerAuthUserId: string; capability: AeOperationCapability; at: string; sessionId: string;
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
    actorAuthUserId: string; at: string; command: AeWorkspaceCommand; sessionId: string;
    expectedAuthority: { scopeId: string; grantId: string; grantRevision: number };
  }): Promise<AeResult<AeAtomicCommandResult>>;
  /** Explicit assigning authority, current target eligibility, uniqueness and
   * durable receipt/audit are one transaction. It grants no directory access. */
  commitInitialAssignment(input: {
    actorAuthUserId: string; sessionId: string; at: string; command: AeInitialAssignmentCommand;
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
  assignmentHistory: aeAssignmentHistorySchema.optional(),
  contact: z.unknown().optional(),
  referral: z.discriminatedUnion("state", [
    z.object({ state: z.literal("recorded"), binding: referralBindingSchema }),
    z.object({ state: z.enum(["none", "unresolved", "unavailable"]) }),
  ]),
  requests: z.array(z.object({ ownerHash: z.string().regex(/^[a-f0-9]{64}$/), receipt: receiptSourceSchema,
    ownershipEvidence: z.unknown().optional(),
    workflow: requestWorkflowSchema.nullable(),
    originalReferralInput: z.object({ requestId: aeIdentifier,
      state: z.enum(["recorded", "none", "unavailable"]) }).optional() })).max(AE_WORKSPACE_MAX_REQUESTS_PER_CUSTOMER),
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
    async read(verifiedSession: unknown): Promise<AeResult<AeWorkspace>> {
      const session = ordinarySession(verifiedSession);
      if (!session) return failed("access_denied");
      const actor = session.authUserId;
      if (!port) return failed("unavailable");
      try {
        const at = instant();
        const response = await port.readAssignedSnapshot(actor, at, session.sessionId);
        if (!response || response.ok !== true) return safeFailure(response);
        const authority = authoritySchema.parse(response.value.authority), completedAt = instant();
        if (!permitted(authority, actor, completedAt, "workspace:read")) return failed("access_denied");
        if (response.value.completeness !== "complete") return failed("unavailable");
        const source = z.array(sourceCustomerSchema).max(AE_WORKSPACE_MAX_CUSTOMERS).parse(response.value.customers);
        const customers: AeCustomer[] = [];
        for (const row of source) {
          const assignment = row.assignment;
          if (assignment.scopeId !== authority.scopeId || assignment.assigneeAuthUserId !== actor) return failed("unavailable");
          let contact: AeCustomer["contact"] = { state: "not_permitted" };
          if (authority.capabilities.includes("customer:contact")) {
            if (row.contact == null) contact = { state: "unavailable" };
            else {
              const item = contactSourceSchema.parse(row.contact);
              if (item.customerAuthUserId !== assignment.customerAuthUserId) return failed("unavailable");
              contact = { state: "available", displayName: item.displayName, email: item.email, phone: item.phone };
            }
          }
          let referral: AeCustomer["referral"] = { state: row.referral.state === "recorded" ? "unavailable" : row.referral.state };
          if (row.referral.state === "recorded") {
            const binding = row.referral.binding;
            if (binding.accountKey !== `auth:${assignment.customerAuthUserId}`) return failed("unavailable");
            referral = { state: "recorded", partnerId: binding.partnerId, boundAt: binding.boundAt,
              availability: binding.availability };
          }
          const requests: AeCustomer["requests"] = [];
          for (const request of row.requests) {
            if (request.ownerHash !== memberOwnerHash(assignment.customerAuthUserId) && !isVerifiedGuestOwnership(request.ownershipEvidence, {
              customerAuthUserId: assignment.customerAuthUserId, requestId: request.receipt.requestId, ownerHash: request.ownerHash,
            })) return failed("unavailable");
            if (request.originalReferralInput && request.originalReferralInput.requestId !== request.receipt.requestId) return failed("unavailable");
            requests.push({ requestId: request.receipt.requestId, publicReference: request.receipt.publicReference,
              receiptStatus: request.receipt.status, submittedAt: request.receipt.createdAt, workflow: request.workflow,
              originalReferralInput: { state: request.originalReferralInput?.state === "recorded" ? "redacted"
                : request.originalReferralInput?.state ?? "unavailable" } });
          }
          customers.push({ assignment, assignmentHistory: row.assignmentHistory ?? { state: "unavailable" },
            contact, referral, requests, followups: row.followups });
        }
        // Output is an explicit shared allowlist. Profile/clinical/line-item/free
        // text columns added to source records cannot become AE response fields.
        const value = aeWorkspaceSchema.parse({ schemaVersion: AE_WORKSPACE_SCHEMA_VERSION,
          actorAuthUserId: actor, scopeId: authority.scopeId, generatedAt: completedAt,
          capabilities: authority.capabilities, customers });
        return { ok: true, value };
      } catch {
        // Never reflect source errors containing customer data or credentials.
        return failed("unavailable");
      }
    },
    async command(verifiedSession: unknown, raw: unknown): Promise<AeResult<AeCommandReceipt>> {
      const session = ordinarySession(verifiedSession);
      if (!session) return failed("access_denied");
      const actor = session.authUserId;
      const parsed = aeWorkspaceCommandSchema.safeParse(raw);
      if (!parsed.success) return failed("invalid_input");
      if (!port) return failed("unavailable");
      try {
        const at = instant(), command = parsed.data;
        const capability = command.kind === "record_followup" ? "followup:record" : "customer:reassign";
        if (command.kind === "reassign" && command.nextAssigneeAuthUserId === actor) return failed("invalid_input");
        const scoped = await port.authorizeCustomerOperation({
          actorAuthUserId: actor, customerAuthUserId: command.customerAuthUserId, capability, at, sessionId: session.sessionId,
        });
        if (!scoped || scoped.ok !== true) return safeFailure(scoped);
        const fresh = authoritySchema.parse(scoped.value.authority), assignmentScope = aeAssignmentSchema.parse(scoped.value.assignment);
        if (!permitted(fresh, actor, instant(), capability)) return failed("access_denied");
        const openFollowupIds = z.array(aeIdentifier).max(100).parse(scoped.value.openFollowupIds);
        if (new Set(openFollowupIds).size !== openFollowupIds.length) return failed("unavailable");
        // Current customer authority precedes receipt lookup too. After a
        // reassignment, do not reopen the former assignee's scope to reconcile
        // an uncertain result; any later reconciliation needs separate authority.
        if (assignmentScope.id !== command.assignmentId || assignmentScope.customerAuthUserId !== command.customerAuthUserId ||
          assignmentScope.scopeId !== fresh.scopeId || assignmentScope.assigneeAuthUserId !== actor) return failed("not_found");
        const response = await port.commitAuthorizedCommand({ actorAuthUserId: actor, at: instant(), command, sessionId: session.sessionId,
          expectedAuthority: { scopeId: fresh.scopeId, grantId: fresh.grantId, grantRevision: fresh.grantRevision } });
        if (!response || response.ok !== true) return safeFailure(response);
        const authority = authoritySchema.parse(response.value.authority);
        const completedAt = instant();
        if (!permitted(authority, actor, completedAt, capability)) return failed("unavailable");
        if (authority.scopeId !== fresh.scopeId || authority.grantId !== fresh.grantId ||
          authority.grantRevision !== fresh.grantRevision) return failed("unavailable");
        const receipt = aeCommandReceiptSchema.parse(response.value.receipt);
        const assignment = receipt.assignment, audit = receipt.audit;
        if (receipt.commandId !== command.commandId || assignment.id !== command.assignmentId ||
          assignment.customerAuthUserId !== command.customerAuthUserId || assignment.scopeId !== authority.scopeId ||
          assignment.revision !== command.expectedRevision + 1 || audit.commandId !== command.commandId ||
          audit.actorAuthUserId !== actor || audit.assignmentId !== command.assignmentId ||
          audit.customerAuthUserId !== command.customerAuthUserId || Date.parse(audit.occurredAt) > Date.parse(completedAt)) {
          return failed("unavailable");
        }
        if (command.kind === "record_followup") {
          const followup = receipt.followup;
          if (receipt.followupTransfers.length !== 0 || assignment.assigneeAuthUserId !== actor || audit.kind !== "followup_recorded" || !followup ||
            followup.assignmentId !== assignment.id || followup.customerAuthUserId !== assignment.customerAuthUserId ||
            followup.ownerAuthUserId !== actor || followup.purpose !== command.purpose ||
            followup.dueAt !== command.dueAt || followup.state !== "open" || followup.createdAt !== audit.occurredAt) return failed("unavailable");
        } else if (assignment.assigneeAuthUserId !== command.nextAssigneeAuthUserId ||
          audit.kind !== "assignment_reassigned" || receipt.followup !== null || command.nextAssigneeAuthUserId === actor ||
          new Set(receipt.followupTransfers.map(row => row.followupId)).size !== openFollowupIds.length ||
          receipt.followupTransfers.length !== openFollowupIds.length || receipt.followupTransfers.some(row =>
            !openFollowupIds.includes(row.followupId) || row.fromOwnerAuthUserId !== actor ||
            row.toOwnerAuthUserId !== command.nextAssigneeAuthUserId || row.auditId !== audit.id || row.occurredAt !== audit.occurredAt)) {
          return failed("unavailable");
        }
        return { ok: true, value: receipt };
      } catch {
        return failed("unavailable");
      }
    },
    async assign(verifiedSession: unknown, raw: unknown): Promise<AeResult<AeCommandReceipt>> {
      const session = ordinarySession(verifiedSession);
      if (!session) return failed("access_denied");
      const command = aeInitialAssignmentCommandSchema.safeParse(raw);
      if (!command.success) return failed("invalid_input");
      if (!port) return failed("unavailable");
      try {
        const response = await port.commitInitialAssignment({ actorAuthUserId: session.authUserId,
          sessionId: session.sessionId, at: instant(), command: command.data });
        if (!response || response.ok !== true) return safeFailure(response);
        const authority = authoritySchema.parse(response.value.authority), at = instant();
        if (!permitted(authority, session.authUserId, at, "customer:assign")) return failed("unavailable");
        const receipt = aeCommandReceiptSchema.parse(response.value.receipt), audit = receipt.audit;
        if (receipt.commandId !== command.data.commandId || receipt.assignment.revision !== 1 ||
          receipt.assignment.customerAuthUserId !== command.data.customerAuthUserId ||
          receipt.assignment.assigneeAuthUserId !== command.data.assigneeAuthUserId ||
          receipt.assignment.scopeId !== authority.scopeId || receipt.followup !== null || receipt.followupTransfers.length !== 0 ||
          audit.commandId !== command.data.commandId || audit.assignmentId !== receipt.assignment.id ||
          audit.customerAuthUserId !== command.data.customerAuthUserId || audit.actorAuthUserId !== session.authUserId ||
          audit.kind !== "assignment_assigned" || Date.parse(audit.occurredAt) > Date.parse(at)) return failed("unavailable");
        return { ok: true, value: receipt };
      } catch { return failed("unavailable"); }
    },
  };
}
