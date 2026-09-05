import { afterEach, describe, expect, it, vi } from "vitest";
import { inspectApprovedUserAccess, approveCustomerAccess, performPartnerOperation } from "./adminOps";
import type { CustomerApprovalInput } from "@shared/research/approved-customer-access";
import type { ApprovedUserAccess } from "@shared/research/approved-user-access";
import type { PartnerOperation } from "@shared/research/partner-lifecycle";

const inspection: ApprovedUserAccess = {
  schemaVersion: 1, observedAt: "2026-09-05T18:00:00.000Z", email: "customer-a@fixture.invalid", identityState: "absent",
  authAccounts: [], applications: [], members: [], partners: [],
  organizationRelationships: { state: "unavailable", records: [] },
  boundaries: { care: "separate_authority", membershipBillingEnabled: false, customerAccessApproval: "unavailable",
    partnerLifecycleReview: "unavailable", referralEligibility: "checked_by_referral_authority" },
  nextActions: [{ label: "Review requirements", href: null, consequence: "No record was changed.", notification: "none" }],
};
function stub(body: unknown, status = 200, contentType = "application/json") {
  const fetch = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": contentType } }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
afterEach(() => vi.unstubAllGlobals());

describe("read-only approved-user access inspection adapter", () => {
  it("uses canonical exact-email POST body, bearer, and no-store without putting the address in the URL", async () => {
    const fetch = stub({ ok: true, inspection });
    expect(await inspectApprovedUserAccess("synthetic-admin-a", " Customer-A@fixture.invalid ")).toEqual({ kind: "ok", data: { inspection } });
    const [path, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe("/api/admin/research/access/inspect");
    expect(path).not.toContain("customer-a");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ email: "customer-a@fixture.invalid" }));
    expect(init.headers).toMatchObject({ Authorization: "Bearer synthetic-admin-a" });
    expect(init.cache).toBe("no-store");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["", "not-an-email", "one@fixture.invalid,two@fixture.invalid"])("does not send invalid input %s", async email => {
    const fetch = stub({ ok: true, inspection });
    expect(await inspectApprovedUserAccess("synthetic-admin", email)).toMatchObject({ kind: "denied", code: "invalid_input" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not inspect without an admin credential", async () => {
    const fetch = stub({ ok: true, inspection });
    expect(await inspectApprovedUserAccess("", inspection.email)).toEqual({ kind: "unauthorized" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    { ...inspection, email: "customer-b@fixture.invalid" },
    { ...inspection, observedAt: "not-an-observation" },
    { ...inspection, providerMetadata: "unexpected private data" },
    { ...inspection, authAccounts: [{ authUserId: "not-an-id", emailVerified: true, signInRecorded: true }] },
    { ...inspection, organizationRelationships: { state: "unknown", records: [] } },
    null,
  ])("fails closed on mismatched or invalid inspection %j", async malformed => {
    stub({ ok: true, inspection: malformed });
    const result = await inspectApprovedUserAccess("synthetic-admin", inspection.email);
    expect(result).toEqual({ kind: "error", message: "The access inspection could not be verified. Please retry." });
    expect(JSON.stringify(result)).not.toContain("unexpected private data");
  });

  it("requires the successful canonical envelope", async () => {
    stub({ inspection });
    expect((await inspectApprovedUserAccess("synthetic-admin", inspection.email)).kind).toBe("error");
  });

  it.each([401, 403, 400, 503])("retains the canonical denied/unavailable boundary for %i", async status => {
    stub({ ok: false, code: status === 400 ? "invalid_input" : "access_inspection_unavailable" }, status);
    const result = await inspectApprovedUserAccess("synthetic-admin", inspection.email);
    expect(result.kind).toBe(status === 401 ? "unauthorized" : status === 503 ? "unavailable" : "denied");
    expect("data" in result).toBe(false);
  });

  it("does not treat an unpublished HTML endpoint as an empty account", async () => {
    stub({}, 200, "text/html");
    expect(await inspectApprovedUserAccess("synthetic-admin", inspection.email)).toEqual({ kind: "unavailable" });
  });
});

describe("explicit customer approval adapter", () => {
  const input: CustomerApprovalInput = { email: "customer-a@fixture.invalid", firstName: "Customer", lastName: "Example",
    reason: "Reviewed approved customer access", expectedApplicationId: null, expectedUpdatedAt: null,
    idempotencyKey: "approval-fixture-request-0001" };
  const approved = { ok: true, applicationId: "00000000-0000-4000-8000-000000000002", approvalVersion: 1,
    state: "approved_customer", delivery: "queued", expiresAt: "2026-09-19T18:00:00Z", replayed: false };
  it("posts only the strict exact request, explicit bearer and unchanged idempotency key", async () => {
    const fetch = stub(approved);
    expect(await approveCustomerAccess("synthetic-admin", input)).toEqual({ kind: "ok", data: approved });
    const [path, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe("/api/admin/research/access/approve-customer");
    expect(path).not.toContain(input.email);
    expect(init).toMatchObject({ method: "POST", cache: "no-store", body: JSON.stringify(input) });
    expect(init.headers).toMatchObject({ Authorization: "Bearer synthetic-admin" });
  });
  it("does not mutate without the admin credential", async () => {
    const fetch = stub(approved);
    expect(await approveCustomerAccess("", input)).toEqual({ kind: "unauthorized" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    { ...input, email: "invalid" }, { ...input, reason: "short" }, { ...input, firstName: "" },
    { ...input, expectedApplicationId: approved.applicationId }, { ...input, expectedUpdatedAt: "2026-09-05T18:00:00Z" },
    { ...input, idempotencyKey: "short" }, { ...input, role: "admin" },
  ])("rejects malformed or extra approval input without sending %j", async bad => {
    const fetch = stub(approved);
    expect(await approveCustomerAccess("synthetic-admin", bad)).toEqual({ kind: "denied", code: "invalid_input" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    { ...approved, delivery: "delivered" }, { ...approved, state: "active" }, { ...approved, approvalVersion: 0 },
    { ...approved, applicationId: "invalid" }, { ...approved, expiresAt: "later" }, { ...approved, secret: "private" }, { ok: true },
  ])("never confirms malformed or exaggerated success %j", async bad => {
    stub(bad);
    expect((await approveCustomerAccess("synthetic-admin", input)).kind).toBe("error");
  });
  it("binds an existing application result to its exact inspected ID", async () => {
    stub(approved);
    const result = await approveCustomerAccess("synthetic-admin", { ...input,
      expectedApplicationId: "00000000-0000-4000-8000-000000000099", expectedUpdatedAt: "2026-09-05T18:00:00Z" });
    expect(result.kind).toBe("error");
  });
  it("retains the exact current revision and replayed result on a retry", async () => {
    const fetch = stub({ ...approved, replayed: true });
    const retry = { ...input, expectedApplicationId: approved.applicationId, expectedUpdatedAt: "2026-09-05T18:00:00Z" };
    expect(await approveCustomerAccess("synthetic-admin", retry)).toEqual({ kind: "ok", data: { ...approved, replayed: true } });
    const init = fetch.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual(retry);
  });
  it.each(["stale_inspection", "identity_review_required", "idempotency_conflict"])("preserves server refusal %s", async code => {
    stub({ ok: false, code }, 409);
    expect(await approveCustomerAccess("synthetic-admin", input)).toMatchObject({ kind: "denied", code });
  });
  it("does not infer successful approval from an unavailable or HTML API", async () => {
    stub({}, 200, "text/html");
    expect(await approveCustomerAccess("synthetic-admin", input)).toEqual({ kind: "unavailable" });
  });
});

describe("explicit partner lifecycle adapter", () => {
  const operation: PartnerOperation = {
    action: "record_clearance", partnerId: "00000000-0000-4000-8000-000000000003",
    expectedUpdatedAt: "2026-09-05T18:00:00.123456Z", reason: "Reviewed current identity evidence", idempotencyKey: "partner-fixture-request-0001",
    kind: "identity", decision: "verified", evidenceReference: "review:identity-0001", reviewedEvidence: true,
  };
  const success = { ok: true, partnerId: operation.partnerId, memberId: "00000000-0000-4000-8000-000000000002", action: "record_clearance", state: "identity_verification_pending", updatedAt: "2026-09-05T18:00:01Z", replayed: false };
  it("posts the exact selected snapshot and retains the server result", async () => {
    const fetch = stub(success);
    expect(await performPartnerOperation("synthetic-admin", operation, success.memberId)).toEqual({ kind: "ok", data: success });
    const [path, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe("/api/admin/research/partners/operations");
    expect(init.method).toBe("POST"); expect(init.cache).toBe("no-store");
    expect(JSON.parse(String(init.body))).toEqual(operation);
    expect(init.headers).toMatchObject({ Authorization: "Bearer synthetic-admin" });
  });
  it("rejects a result bound to another inspected member or incompatible state", async () => {
    stub({ ...success, memberId: "00000000-0000-4000-8000-000000000099" });
    expect((await performPartnerOperation("synthetic-admin", operation, success.memberId)).kind).toBe("error");
    stub({ ...success, state: "terminated" });
    expect((await performPartnerOperation("synthetic-admin", operation, success.memberId)).kind).toBe("error");
  });
  it("preserves durable denials and never sends without an admin token", async () => {
    const fetch = stub({ ok: false, code: "evidence_conflict" }, 409);
    expect(await performPartnerOperation("synthetic-admin", operation, success.memberId)).toMatchObject({ kind: "denied", code: "evidence_conflict" });
    expect(await performPartnerOperation("", operation, success.memberId)).toEqual({ kind: "unauthorized" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
