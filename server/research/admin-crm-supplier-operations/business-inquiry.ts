import { createHash } from "node:crypto";
import { z } from "zod";
import {
  businessInquiryAssignmentSchema, businessInquiryInputSchema,
  type BusinessInquiryAssignment, type BusinessInquiryAssignmentResult, type BusinessInquiryInput,
  type BusinessInquiryPage, type BusinessInquiryReceipt, type BusinessInquiryRecord,
} from "@shared/research/business-inquiry";

export type BusinessInquiryFailure = "invalid_request" | "not_permitted" | "not_found" |
  "conflict" | "not_ready" | "unavailable";
export class BusinessInquiryRefusal extends Error {
  constructor(readonly code: BusinessInquiryFailure) { super(code); }
}
export interface BusinessInquirySubmitCommand {
  ownerHash: string;
  attemptHash: string;
  enquiry: BusinessInquiryInput;
  actorId: string | null;
  organizationId: string | null;
}
export interface BusinessInquiryRepository {
  submit(command: BusinessInquirySubmitCommand): Promise<BusinessInquiryReceipt>;
  list(actorId: string, before: string | null): Promise<BusinessInquiryPage>;
  read(actorId: string, id: string): Promise<BusinessInquiryRecord>;
  assign(actorId: string, id: string, command: BusinessInquiryAssignment): Promise<BusinessInquiryAssignmentResult>;
  listOrganization(actorId: string, organizationId: string, before: string | null): Promise<BusinessInquiryPage>;
}

/** Root resolves this from an authenticated server session, never from request JSON/referral/email. */
export interface BusinessInquirySubmissionContext {
  ownerContext: string;
  actorId?: string;
  organizationId?: string;
}
const uuid = z.string().uuid();
const attempt = z.string().regex(/^[A-Za-z0-9_-]{24,128}$/);
const hash = (domain: string, value: string) => createHash("sha256").update(`${domain}\0${value}`).digest("hex");
function id(value: unknown): string {
  const parsed = uuid.safeParse(value);
  if (!parsed.success) throw new BusinessInquiryRefusal("invalid_request");
  return parsed.data;
}
function cursor(value: unknown): string | null {
  return value === null || value === undefined ? null : id(value);
}

export class BusinessInquiryService {
  constructor(private readonly repository: BusinessInquiryRepository) {}

  async submit(context: BusinessInquirySubmissionContext, attemptKey: unknown, input: unknown): Promise<BusinessInquiryReceipt> {
    const parsed = businessInquiryInputSchema.safeParse(input);
    const key = attempt.safeParse(attemptKey);
    if (!parsed.success || !key.success) throw new BusinessInquiryRefusal("invalid_request");
    // Opaque binding must come from the Root-owned, signed/secure server context.
    if (typeof context.ownerContext !== "string" || context.ownerContext.length < 32 || context.ownerContext.length > 512) {
      throw new BusinessInquiryRefusal("not_permitted");
    }
    if (Boolean(context.actorId) !== Boolean(context.organizationId)) throw new BusinessInquiryRefusal("not_permitted");
    return this.repository.submit({
      ownerHash: hash("business-inquiry-owner-v1", context.ownerContext),
      attemptHash: hash("business-inquiry-attempt-v1", key.data),
      enquiry: parsed.data,
      actorId: context.actorId ? id(context.actorId) : null,
      organizationId: context.organizationId ? id(context.organizationId) : null,
    });
  }

  list(actorId: string, before?: unknown): Promise<BusinessInquiryPage> {
    return this.repository.list(id(actorId), cursor(before));
  }
  read(actorId: string, inquiryId: unknown): Promise<BusinessInquiryRecord> {
    return this.repository.read(id(actorId), id(inquiryId));
  }
  assign(actorId: string, inquiryId: unknown, input: unknown): Promise<BusinessInquiryAssignmentResult> {
    const command = businessInquiryAssignmentSchema.safeParse(input);
    if (!command.success) throw new BusinessInquiryRefusal("invalid_request");
    return this.repository.assign(id(actorId), id(inquiryId), command.data);
  }
  listOrganization(actorId: string, organizationId: unknown, before?: unknown): Promise<BusinessInquiryPage> {
    return this.repository.listOrganization(id(actorId), id(organizationId), cursor(before));
  }
}
