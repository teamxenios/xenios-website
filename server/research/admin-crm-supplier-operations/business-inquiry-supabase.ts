import { z } from "zod";
import {
  businessInquiryAssignmentResultSchema, businessInquiryPageSchema,
  businessInquiryReceiptSchema, businessInquiryRecordSchema,
} from "@shared/research/business-inquiry";
import {
  BusinessInquiryRefusal, type BusinessInquiryFailure, type BusinessInquiryRepository,
} from "./business-inquiry";

/** Root supplies the existing privileged client; this adapter constructs no credentials or client. */
export interface BusinessInquiryRpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}

const SQL_FAILURES: Readonly<Record<string, BusinessInquiryFailure>> = {
  business_inquiry_invalid_request: "invalid_request",
  business_inquiry_not_permitted: "not_permitted",
  business_inquiry_not_found: "not_found",
  business_inquiry_conflict: "conflict",
  business_inquiry_not_ready: "not_ready",
};

function databaseRefusal(error: unknown): BusinessInquiryRefusal {
  const message = error && typeof error === "object" && "message" in error ? error.message : undefined;
  const code = typeof message === "string" && Object.hasOwn(SQL_FAILURES, message)
    ? SQL_FAILURES[message] : "unavailable";
  return new BusinessInquiryRefusal(code);
}

export function createSupabaseBusinessInquiryRepository(client: BusinessInquiryRpcClient): BusinessInquiryRepository {
  async function call<T>(name: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
    let response: { data: unknown; error: unknown };
    try {
      response = await client.rpc(name, args);
    } catch (error) {
      throw databaseRefusal(error);
    }
    if (!response || typeof response !== "object") throw new BusinessInquiryRefusal("unavailable");
    if (response.error !== null) throw databaseRefusal(response.error);
    const parsed = schema.safeParse(response.data);
    if (!parsed.success) throw new BusinessInquiryRefusal("unavailable");
    return parsed.data;
  }

  return {
    submit: (command) => call("research_business_inquiry_submit", {
      p_owner_hash: command.ownerHash,
      p_attempt_hash: command.attemptHash,
      p_payload: command.enquiry,
      p_actor_id: command.actorId,
      p_organization_id: command.organizationId,
    }, businessInquiryReceiptSchema),
    list: (actorId, before) => call("research_business_inquiry_list", {
      p_actor_id: actorId, p_before: before,
    }, businessInquiryPageSchema),
    async read(actorId, id) {
      const record = await call("research_business_inquiry_read", {
        p_actor_id: actorId, p_id: id,
      }, businessInquiryRecordSchema);
      if (record.id !== id) throw new BusinessInquiryRefusal("unavailable");
      return record;
    },
    async assign(actorId, id, command) {
      const result = await call("research_business_inquiry_assign", {
        p_actor_id: actorId, p_id: id, p_command_id: command.commandId,
        p_expected_revision: command.expectedRevision, p_assigned_to: command.assignedTo,
      }, businessInquiryAssignmentResultSchema);
      if (result.id !== id || result.assignedTo !== command.assignedTo) {
        throw new BusinessInquiryRefusal("unavailable");
      }
      return result;
    },
    async listOrganization(actorId, organizationId, before) {
      const page = await call("research_business_inquiry_org_list", {
        p_actor_id: actorId, p_organization_id: organizationId, p_before: before,
      }, businessInquiryPageSchema);
      if (page.items.some((record) => record.organizationId !== organizationId)) {
        throw new BusinessInquiryRefusal("unavailable");
      }
      return page;
    },
  };
}
