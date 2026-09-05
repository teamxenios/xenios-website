import { afterEach, describe, expect, it, vi } from "vitest";
import { inspectApprovedUserAccess } from "./adminOps";
import type { ApprovedUserAccess } from "@shared/research/approved-user-access";

const inspection: ApprovedUserAccess = {
  schemaVersion: 1, observedAt: "2026-09-05T18:00:00.000Z", email: "customer-a@fixture.invalid", identityState: "absent",
  authAccounts: [], applications: [], members: [], partners: [],
  organizationRelationships: { state: "unavailable", records: [] },
  boundaries: { care: "separate_authority", membershipBillingEnabled: false,
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
