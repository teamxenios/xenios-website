import { describe, expect, it, vi } from "vitest";
import type { BusinessInquiryInput, BusinessInquiryRecord } from "@shared/research/business-inquiry";
import { createSupabaseBusinessInquiryRepository } from "./business-inquiry-supabase";

// Synthetic contract fixtures only; this suite makes no PostgreSQL or permission-rehearsal claim.
const actor = "00000000-0000-4000-8000-000000000001";
const id = "00000000-0000-4000-8000-000000000002";
const organizationId = "00000000-0000-4000-8000-000000000003";
const assignedTo = "00000000-0000-4000-8000-000000000004";
const commandId = "00000000-0000-4000-8000-000000000005";
const other = "00000000-0000-4000-8000-000000000006";
const enquiry: BusinessInquiryInput = {
  contactName: "Example Operator", contactEmail: "operator@example.test", organizationName: "Example Clinic",
  organizationType: "clinic", location: "Austin", categories: ["research"], selections: [],
  packagingPreference: "not_sure", siteCount: 1, replenishment: "not_sure", services: [],
};
const receipt = {
  reference: `BE-${"A".repeat(24)}`, receivedAt: "2026-11-18T12:00:00.000Z",
  state: "needs_human_review" as const, replayed: false,
};
const record: BusinessInquiryRecord = {
  id, reference: receipt.reference, receivedAt: receipt.receivedAt, provenance: "web", category: "b2b_organization",
  state: "needs_human_review", revision: 1, assignedTo: null, organizationId,
  policyVersion: "business-enquiry-v1", enquiry,
};
const command = { ownerHash: "a".repeat(64), attemptHash: "b".repeat(64), enquiry, actorId: null, organizationId: null };
function setup(data: unknown = receipt) {
  const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> => ({ data, error: null }));
  return { rpc, repository: createSupabaseBusinessInquiryRepository({ rpc }) };
}

describe("business enquiry Supabase RPC adapter", () => {
  it("submits only the hashed binding, payload and trusted optional identity using the exact RPC contract", async () => {
    const { rpc, repository } = setup();
    expect(await repository.submit(command)).toEqual(receipt);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("research_business_inquiry_submit", {
      p_owner_hash: command.ownerHash, p_attempt_hash: command.attemptHash, p_payload: enquiry,
      p_actor_id: null, p_organization_id: null,
    });
  });
  it("preserves a committed replay receipt without manufacturing a new reference", async () => {
    const { repository } = setup({ ...receipt, replayed: true });
    expect(await repository.submit({ ...command, actorId: actor, organizationId })).toEqual({ ...receipt, replayed: true });
  });
  it("passes the staff pagination cursor and returns the validated page", async () => {
    const page = { items: [record], nextBefore: id };
    const { rpc, repository } = setup(page);
    expect(await repository.list(actor, other)).toEqual(page);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("research_business_inquiry_list", { p_actor_id: actor, p_before: other });
  });
  it("reads one requested record without a public-reference lookup", async () => {
    const { rpc, repository } = setup(record);
    expect(await repository.read(actor, id)).toEqual(record);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("research_business_inquiry_read", { p_actor_id: actor, p_id: id });
  });
  it("passes an idempotent revision-checked assignment and preserves its replay indicator", async () => {
    const result = { id, revision: 2, assignedTo, replayed: true };
    const { rpc, repository } = setup(result);
    expect(await repository.assign(actor, id, { commandId, expectedRevision: 1, assignedTo })).toEqual(result);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("research_business_inquiry_assign", {
      p_actor_id: actor, p_id: id, p_command_id: commandId, p_expected_revision: 1, p_assigned_to: assignedTo,
    });
  });
  it("passes the verified organization separately from actor and pagination", async () => {
    const page = { items: [record], nextBefore: null };
    const { rpc, repository } = setup(page);
    expect(await repository.listOrganization(actor, organizationId, null)).toEqual(page);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("research_business_inquiry_org_list", {
      p_actor_id: actor, p_organization_id: organizationId, p_before: null,
    });
  });
  it.each(["invalid_request", "not_permitted", "not_found", "conflict", "not_ready"] as const)(
    "maps only the exact SQL %s refusal without diagnostics", async (code) => {
      const { rpc, repository } = setup();
      rpc.mockResolvedValueOnce({ data: null, error: {
        message: `business_inquiry_${code}`, details: "private@example.test", hint: "private diagnostic",
      } });
      await expect(repository.submit(command)).rejects.toMatchObject({ code, message: code });
    },
  );
  it("maps a rejected transport promise without leaking its text", async () => {
    const { rpc, repository } = setup();
    rpc.mockRejectedValueOnce(new Error("private@example.test and provider secret"));
    await expect(repository.submit(command)).rejects.toMatchObject({ code: "unavailable", message: "unavailable" });
  });
  it("maps a thrown known SQL refusal through the same closed vocabulary", async () => {
    const { rpc, repository } = setup();
    rpc.mockRejectedValueOnce({ message: "business_inquiry_conflict", details: "private diagnostic" });
    await expect(repository.submit(command)).rejects.toMatchObject({ code: "conflict", message: "conflict" });
  });
  it("does not recognize a substring or SQL code alone as authoritative refusal", async () => {
    const { rpc, repository } = setup();
    rpc.mockResolvedValueOnce({ data: receipt, error: { message: "private@example.test business_inquiry_conflict", code: "P0001" } });
    await expect(repository.submit(command)).rejects.toMatchObject({ code: "unavailable" });
  });
  it.each([
    null,
    { ...receipt, replayed: "false" },
    { ...receipt, state: "approved" },
    { ...receipt, internalOwnerHash: "private" },
  ])("rejects a malformed or overbroad receipt: %j", async (data) => {
    const { repository } = setup(data);
    await expect(repository.submit(command)).rejects.toMatchObject({ code: "unavailable" });
  });
  it("rejects a malformed record instead of stripping private extra fields", async () => {
    const { repository } = setup({ ...record, internalNotes: "private" });
    await expect(repository.read(actor, id)).rejects.toMatchObject({ code: "unavailable" });
  });
  it("rejects a well-shaped record for another enquiry", async () => {
    const { repository } = setup({ ...record, id: other });
    await expect(repository.read(actor, id)).rejects.toMatchObject({ code: "unavailable" });
  });
  it("rejects malformed pagination rather than presenting an empty queue", async () => {
    const { repository } = setup({ items: [], nextBefore: "invalid" });
    await expect(repository.list(actor, null)).rejects.toMatchObject({ code: "unavailable" });
  });
  it("rejects an oversized page", async () => {
    const { repository } = setup({ items: Array.from({ length: 51 }, () => record), nextBefore: id });
    await expect(repository.list(actor, null)).rejects.toMatchObject({ code: "unavailable" });
  });
  it.each([
    { id, revision: 2, assignedTo, replayed: "true" },
    { id: other, revision: 2, assignedTo, replayed: false },
    { id, revision: 2, assignedTo: other, replayed: false },
  ])("rejects a malformed or mismatched assignment result: %j", async (data) => {
    const { repository } = setup(data);
    await expect(repository.assign(actor, id, { commandId, expectedRevision: 1, assignedTo })).rejects.toMatchObject({ code: "unavailable" });
  });
  it.each([null, other])("rejects cross-organization rows with organizationId %s", async (returnedOrganization) => {
    const { repository } = setup({ items: [{ ...record, organizationId: returnedOrganization }], nextBefore: null });
    await expect(repository.listOrganization(actor, organizationId, null)).rejects.toMatchObject({ code: "unavailable" });
  });
});
