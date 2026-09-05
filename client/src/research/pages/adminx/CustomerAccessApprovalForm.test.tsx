// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApprovedUserAccess } from "@shared/research/approved-user-access";
import { CustomerAccessApprovalForm } from "./CustomerAccessApprovalForm";

const api = vi.hoisted(() => ({ approve: vi.fn() }));
vi.mock("../../adapters/adminOps", () => ({ approveCustomerAccess: api.approve }));
const appId = "00000000-0000-4000-8000-000000000001";
const authId = "00000000-0000-4000-8000-000000000002";
const memberId = "00000000-0000-4000-8000-000000000003";
const updatedAt = "2026-09-05T18:00:00Z";
const fixture = (): ApprovedUserAccess => ({ schemaVersion: 1, observedAt: updatedAt,
  email: "customer-a@fixture.invalid", identityState: "absent", authAccounts: [], applications: [], members: [], partners: [],
  organizationRelationships: { state: "unavailable", records: [] },
  boundaries: { care: "separate_authority", membershipBillingEnabled: false, customerAccessApproval: "available",
    partnerLifecycleReview: "unavailable", referralEligibility: "checked_by_referral_authority" }, nextActions: [] });
const app = (status = "under_review") => ({ id: appId, status, updatedAt, href: `/admin/research/applications/${appId}` });
const approved = { ok: true, applicationId: appId, approvalVersion: 2, state: "approved_customer", delivery: "queued",
  expiresAt: "2026-09-19T18:00:00Z", replayed: false };
let host: HTMLDivElement, root: Root, token: string, inspection: ApprovedUserAccess;
const render = () => act(async () => { root.render(<StrictMode><CustomerAccessApprovalForm token={token} inspection={inspection} /></StrictMode>); });
const click = async (text: string) => act(async () => {
  const button = Array.from(host.querySelectorAll("button")).find(item => item.textContent === text);
  expect(button).toBeTruthy(); button!.click();
});
async function fill(suffix: string, value: string) {
  await act(async () => {
    const field = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[id$="-${suffix}"]`)!;
    Object.getOwnPropertyDescriptor(field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const prepare = () => act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
async function details() { await fill("first", "Customer"); await fill("last", "Example"); await fill("reason", "Reviewed approved customer access"); }
const confirm = () => click("Approve customer and queue onboarding email");
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  token = "synthetic-admin-a"; inspection = fixture(); api.approve.mockReset().mockResolvedValue({ kind: "ok", data: approved });
  vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000099");
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });

describe("inspect-bound explicit customer approval", () => {
  it("requires complete details and a separate exact-recipient confirmation before any mutation", async () => {
    const storage = vi.spyOn(Storage.prototype, "setItem"); const beforeUrl = location.href;
    await render(); expect(api.approve).not.toHaveBeenCalled(); await prepare();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Enter a first and last name");
    await details(); expect(api.approve).not.toHaveBeenCalled(); await prepare();
    expect(api.approve).not.toHaveBeenCalled();
    expect(host.textContent).toContain(inspection.email); expect(host.textContent).toContain("queues an onboarding email, which may be sent immediately");
    expect(host.textContent).toContain("Customer Example"); expect(host.textContent).toContain("Reviewed approved customer access");
    await confirm();
    expect(api.approve).toHaveBeenCalledExactlyOnceWith(token, { email: inspection.email, firstName: "Customer", lastName: "Example",
      reason: "Reviewed approved customer access", expectedApplicationId: null, expectedUpdatedAt: null,
      idempotencyKey: "00000000-0000-4000-8000-000000000099" });
    expect(host.textContent).toContain("Customer approval recorded");
    expect(host.textContent).toContain("Onboarding email queued. Delivery and account claim are not confirmed.");
    expect(host.textContent).toContain("No partner, referral, organization or Care access is granted");
    expect(host.querySelector("a")?.getAttribute("href")).toBe(`/admin/research/applications/${appId}`);
    expect(storage).not.toHaveBeenCalled(); expect(location.href).toBe(beforeUrl);
  });
  it.each(["draft", "submitted", "under_review", "more_information_requested", "resubmitted", "approved_pending_payment", "approved_customer", "payment_pending", "expired"])("passes the exact inspected application snapshot for %s", async status => {
    inspection.applications = [app(status)]; await render(); await details(); await prepare(); await confirm();
    expect(api.approve.mock.calls[0][1]).toMatchObject({ expectedApplicationId: appId, expectedUpdatedAt: updatedAt });
  });
  it.each(["active", "paused", "declined", "withdrawn", "approved_sponsored_b2b", "unknown"])("does not offer reapproval for application %s", async status => {
    inspection.applications = [app(status)]; await render(); expect(host.querySelector("form")).toBeNull(); expect(api.approve).not.toHaveBeenCalled();
  });
  it.each(["unavailable", undefined])("fails closed without a provisioned approval boundary %s", async boundary => {
    inspection.boundaries.customerAccessApproval = boundary as never; await render();
    expect(host.textContent).toContain("Customer approval is unavailable"); expect(host.querySelector("button")).toBeNull();
  });
  it.each(["unverified", "conflict"] as const)("does not approve an identity that is %s", async identityState => {
    inspection.identityState = identityState; await render(); expect(host.querySelector("form")).toBeNull();
  });
  it("requires a coherent single verified Auth account", async () => {
    inspection.identityState = "verified"; await render(); expect(host.querySelector("form")).toBeNull();
    inspection = { ...inspection, authAccounts: [{ authUserId: authId, emailVerified: true, signInRecorded: false }] };
    await render(); expect(host.querySelector("form")).not.toBeNull();
  });
  it.each([null, undefined])("does not approve an existing application without exact revision %s", async revision => {
    inspection.applications = [{ ...app(), updatedAt: revision }]; await render(); expect(host.querySelector("form")).toBeNull();
  });
  it("rejects multiple applications and conflicting account records", async () => {
    inspection.applications = [app(), { ...app(), id: authId }]; await render(); expect(host.querySelector("form")).toBeNull();
  });
  it.each(["active", "paused", "cancelled", "closed", "unknown"])("does not reapprove member status %s", async status => {
    inspection.identityState = "verified"; inspection.authAccounts = [{ authUserId: authId, emailVerified: true, signInRecorded: true }];
    inspection.applications = [app()]; inspection.members = [{ id: memberId, authUserId: authId, status, binding: "verified", href: `/admin/research/members/${memberId}` }];
    await render(); expect(host.querySelector("form")).toBeNull();
  });
  it("permits a reviewed pending account only with the existing verified identity binding", async () => {
    inspection.identityState = "verified"; inspection.authAccounts = [{ authUserId: authId, emailVerified: true, signInRecorded: true }];
    inspection.applications = [app()]; inspection.members = [{ id: memberId, authUserId: authId, status: "pending_activation", binding: "verified", href: `/admin/research/members/${memberId}` }];
    await render(); expect(host.querySelector("form")).not.toBeNull();
    inspection = { ...inspection, members: [{ ...inspection.members[0], binding: "conflict" }] };
    await render(); expect(host.querySelector("form")).toBeNull();
  });
  it.each(["pending_activation", "past_due"])("permits an explicitly reviewed %s account with its same active application without automatic approval", async status => {
    inspection.identityState = "verified"; inspection.authAccounts = [{ authUserId: authId, emailVerified: true, signInRecorded: true }];
    inspection.applications = [app("active")]; inspection.members = [{ id: memberId, authUserId: authId, status, binding: "verified", href: `/admin/research/members/${memberId}` }];
    await render(); expect(host.querySelector("form")).not.toBeNull(); expect(api.approve).not.toHaveBeenCalled();
    await details(); await prepare(); expect(api.approve).not.toHaveBeenCalled(); await confirm();
    expect(api.approve.mock.calls[0][1]).toMatchObject({ expectedApplicationId: appId, expectedUpdatedAt: updatedAt, reason: "Reviewed approved customer access" });
  });
  it("does not submit after backing out of confirmation", async () => {
    await render(); await details(); await prepare(); await click("Back to details"); expect(api.approve).not.toHaveBeenCalled();
    expect(host.querySelector("form")).not.toBeNull();
  });
  it("retries an uncertain outcome only with the unchanged payload and idempotency key", async () => {
    api.approve.mockResolvedValueOnce({ kind: "unavailable" }).mockResolvedValueOnce({ kind: "ok", data: { ...approved, replayed: true } });
    await render(); await details(); await prepare(); await confirm();
    expect(host.textContent).toContain("Approval or email queuing may already have occurred");
    expect(host.querySelector("form")).toBeNull(); await click("Retry the same approval request");
    expect(api.approve.mock.calls[1]).toEqual(api.approve.mock.calls[0]);
    expect(host.textContent).toContain("earlier result for this same request");
  });
  it.each(["stale_inspection", "identity_review_required", "idempotency_conflict"])("retains server refusal %s without another action", async code => {
    api.approve.mockResolvedValue({ kind: "denied", code, message: "private upstream detail" });
    await render(); await details(); await prepare(); await confirm();
    expect(host.querySelector('[role="alert"]')).not.toBeNull(); expect(host.textContent).not.toContain("private upstream detail");
    expect(host.querySelector("button")).toBeNull(); expect(host.textContent).not.toContain("Customer approval recorded");
  });
  it("drops an in-flight A response after switching to admin B", async () => {
    let resolve!: (value: unknown) => void; api.approve.mockReturnValue(new Promise(done => { resolve = done; }));
    await render(); await details(); await prepare(); await confirm();
    token = "synthetic-admin-b"; await render();
    expect(host.querySelector<HTMLInputElement>('[id$="-first"]')?.value).toBe("");
    await act(async () => { resolve({ kind: "ok", data: approved }); });
    expect(host.textContent).not.toContain("Customer approval recorded"); expect(api.approve).toHaveBeenCalledTimes(1);
  });
  it("clears confirmation when the inspected recipient changes", async () => {
    await render(); await details(); await prepare(); inspection = { ...fixture(), email: "customer-b@fixture.invalid" }; await render();
    expect(host.textContent).not.toContain("customer-a@fixture.invalid"); expect(host.textContent).not.toContain("Confirm the exact approval");
    expect(host.querySelector<HTMLInputElement>('[id$="-first"]')?.value).toBe(""); expect(api.approve).not.toHaveBeenCalled();
  });
  it("does not render a mutation without the admin token", async () => { token = ""; await render(); expect(host.textContent).toBe(""); });
});
