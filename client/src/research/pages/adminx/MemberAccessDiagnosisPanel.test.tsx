// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApprovedUserAccess } from "@shared/research/approved-user-access";
import type { ApiResult } from "../../lib/api";
import { MemberAccessDiagnosisPanel } from "./MemberAccessDiagnosisPanel";

const api = vi.hoisted(() => ({ inspect: vi.fn(), approve: vi.fn() }));
vi.mock("../../adapters/adminOps", () => ({ inspectApprovedUserAccess: api.inspect, approveCustomerAccess: api.approve }));

const ids = {
  auth: "00000000-0000-4000-8000-000000000001",
  application: "00000000-0000-4000-8000-000000000002",
  member: "00000000-0000-4000-8000-000000000003",
  partner: "00000000-0000-4000-8000-000000000004",
  organization: "00000000-0000-4000-8000-000000000005",
};
const appHref = `/admin/research/applications/${ids.application}`;
const memberHref = `/admin/research/members/${ids.member}`;
const consequence = "Opening this record changes nothing. A separate application decision may send its configured email; it does not approve a partner.";
const fixture = (patch: Partial<ApprovedUserAccess> = {}): ApprovedUserAccess => ({
  schemaVersion: 1, observedAt: "2026-09-05T12:00:00Z", email: "synthetic-one@example.invalid", identityState: "verified",
  authAccounts: [{ authUserId: ids.auth, emailVerified: true, signInRecorded: false }],
  applications: [{ id: ids.application, status: "under_review", href: appHref }],
  members: [{ id: ids.member, status: "pending", authUserId: ids.auth, binding: "verified", href: memberHref }],
  partners: [{ id: ids.partner, memberId: ids.member, role: "member_referral", state: "certification_pending", binding: "verified", missingRequirements: ["admin_certification", "tax_status"] }],
  organizationRelationships: { state: "available", records: [{ organizationId: ids.organization, state: "active", roles: ["organization_member"] }] },
  boundaries: { care: "separate_authority", membershipBillingEnabled: false, customerAccessApproval: "unavailable", partnerLifecycleReview: "unavailable", referralEligibility: "checked_by_referral_authority" },
  nextActions: [{ label: "Review customer application", href: appHref, consequence, notification: "application_email" }],
  ...patch,
});
type Result = ApiResult<{ inspection: ApprovedUserAccess }>;
const success = (inspection = fixture()): Result => ({ kind: "ok", data: { inspection } });
const absent = (): ApprovedUserAccess => fixture({ identityState: "absent", authAccounts: [], applications: [], members: [], partners: [],
  organizationRelationships: { state: "available", records: [] }, nextActions: [] });
let host: HTMLDivElement;
let root: Root;
let token: string;
const render = () => act(async () => { root.render(<StrictMode><MemberAccessDiagnosisPanel token={token} /></StrictMode>); });
const input = () => host.querySelector<HTMLInputElement>('input[type="email"]')!;
async function enter(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input(), value);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const submit = () => act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
async function inspect(email = "synthetic-one@example.invalid") { await enter(email); await submit(); }
const links = () => Array.from(host.querySelectorAll("a")).map((item) => item.getAttribute("href"));
const facts = () => Array.from(host.querySelectorAll("dl > div")).map((item) => [item.querySelector("dt")?.textContent, item.querySelector("dd")?.textContent]);
const deferred = () => {
  let resolve!: (value: Result) => void;
  const promise = new Promise<Result>((done) => { resolve = done; });
  return { promise, resolve };
};

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  token = "synthetic-admin-one"; api.inspect.mockReset().mockResolvedValue(success());
  api.approve.mockReset();
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });

describe("read-only exact-email account diagnosis", () => {
  it("retains the same pending approval request when diagnosis refresh or email editing is attempted", async () => {
    const eligible = absent(); eligible.boundaries.customerAccessApproval = "available";
    eligible.applications = [{ id: ids.application, status: "under_review", href: appHref, updatedAt: eligible.observedAt }];
    api.inspect.mockResolvedValue(success(eligible));
    api.approve.mockResolvedValueOnce({ kind: "unavailable" }).mockResolvedValueOnce({ kind: "ok", data: {
      ok: true, applicationId: ids.application, approvalVersion: 1, state: "approved_customer", delivery: "queued",
      expiresAt: "2026-09-19T12:00:00Z", replayed: true,
    } });
    await render(); await inspect();
    for (const [suffix, value] of [["first", "Customer"], ["last", "Example"], ["reason", "Reviewed account access"]]) {
      await act(async () => {
        const field = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[id$="-${suffix}"]`)!;
        Object.getOwnPropertyDescriptor(field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(field, value);
        field.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
    await act(async () => { host.querySelector('[aria-label="Prepare customer approval"]')!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await act(async () => { Array.from(host.querySelectorAll("button")).find(button => button.textContent === "Approve customer and queue onboarding email")!.click(); });
    expect(api.approve).toHaveBeenCalledTimes(1);
    expect(input().disabled).toBe(true);
    expect(host.textContent).toContain("Diagnosis is locked");
    expect(links()).toEqual([]);
    expect(host.textContent).toContain("Record navigation is paused");
    expect(Array.from(host.querySelectorAll("button")).find(button => button.textContent === "Refresh diagnosis")?.disabled).toBe(true);
    await submit(); await enter("different@example.invalid");
    expect(api.inspect).toHaveBeenCalledTimes(1); expect(api.approve).toHaveBeenCalledTimes(1);
    expect(host.textContent).not.toContain("different@example.invalid");
    await act(async () => { Array.from(host.querySelectorAll("button")).find(button => button.textContent === "Retry the same approval request")!.click(); });
    expect(api.approve.mock.calls[1]).toEqual(api.approve.mock.calls[0]);
    expect(host.textContent).toContain("Customer approval recorded"); expect(input().disabled).toBe(false);
    expect(host.textContent).not.toContain("Diagnosis is locked");
  });

  it("does not inspect on mount, typing, or Strict Mode effects, and never puts email in navigation or storage", async () => {
    const storage = vi.spyOn(Storage.prototype, "setItem");
    const beforeUrl = location.href;
    await render(); await enter("Synthetic-One@Example.Invalid");
    expect(api.inspect).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
    expect(location.href).toBe(beforeUrl);
    expect(links()).toEqual([]);
    expect(input().getAttribute("autocomplete")).toBe("off");
    expect(host.textContent).toContain("no automatic search runs");
    await submit();
    expect(api.inspect).toHaveBeenCalledExactlyOnceWith(token, "synthetic-one@example.invalid");
    expect(storage).not.toHaveBeenCalled();
    expect(location.href).toBe(beforeUrl);
    expect(links().every((href) => !href?.includes("@"))).toBe(true);
  });

  it("shows the server facts, exact local records and unmodified next-step consequences without mutation controls", async () => {
    await render(); await inspect();
    expect(facts()).toEqual(expect.arrayContaining([
      ["Exact email", "synthetic-one@example.invalid"], ["Observed at", "2026-09-05T12:00:00.000Z (UTC)"],
      ["Authentication account ID", ids.auth], ["Email verification", "Verified"], ["Sign-in evidence", "No sign-in recorded"],
      ["Recorded application status", "under_review"], ["Recorded customer status", "pending"], ["Identity binding", "verified"],
      ["Recorded partner role", "member_referral"], ["Recorded partner state", "certification_pending"],
      ["Organization ID", ids.organization], ["Recorded organization roles", "organization_member"],
    ]));
    expect(links()).toEqual([appHref, memberHref, appHref]);
    expect(host.textContent).toContain(consequence);
    expect(host.textContent).toContain("Notification classification: application_email");
    expect(host.textContent).toContain("opening a record sends no email");
    expect(host.textContent).toContain("admin_certification");
    expect(host.textContent).toContain("tax_status");
    expect(host.textContent).toContain("Care has a separate authority");
    expect(host.textContent).toContain("Referral eligibility is checked by the referral authority");
    expect(Array.from(host.querySelectorAll("button")).map((item) => item.textContent)).toEqual(["Refresh diagnosis"]);
    expect(host.textContent).not.toContain("Legacy billing configuration is enabled");
    expect(api.inspect).toHaveBeenCalledTimes(1);
  });

  it.each(["", "incomplete", "synthetic@", "one@example.invalid,two@example.invalid"])("rejects an invalid exact-email query without a read (%s)", async (email) => {
    await render(); await inspect(email);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Enter one valid, complete email address");
    expect(input().getAttribute("aria-invalid")).toBe("true");
    expect(api.inspect).not.toHaveBeenCalled();
  });

  it("keeps observed absence distinct from source unavailability", async () => {
    api.inspect.mockResolvedValue(success(absent())); await render(); await inspect();
    expect(host.textContent).toContain("Identity state: absent");
    expect(host.textContent).toContain("No authentication account found in this inspection");
    expect(host.textContent).toContain("No customer application found in this inspection");
    expect(host.textContent).toContain("No customer record found in this inspection");
    expect(host.textContent).toContain("No partner record found in this inspection");
    expect(host.textContent).toContain("No organization relationships found in this inspection");
    expect(host.textContent).toContain("No next action reported. No permission or completion is inferred");
    expect(host.textContent).not.toContain("Account diagnosis is unavailable");
  });

  it("does not show stale organization records or an empty count when that source is unavailable", async () => {
    api.inspect.mockResolvedValue(success(fixture({ organizationRelationships: { state: "unavailable", records: fixture().organizationRelationships.records } })));
    await render(); await inspect();
    expect(host.textContent).toContain("Their presence or absence is unknown");
    expect(host.textContent).not.toContain(ids.organization);
    expect(host.textContent).not.toContain("No organization relationships found");
  });

  it("shows raw legacy status and separate lifecycle availability without inventing a payment or approval requirement", async () => {
    api.inspect.mockResolvedValue(success(fixture({
      members: [{ ...fixture().members[0], status: "approved_pending_payment", binding: "conflict", authUserId: null }],
      identityState: "conflict", partners: [{ ...fixture().partners[0], missingRequirements: [] }],
      boundaries: { ...fixture().boundaries, membershipBillingEnabled: true, partnerLifecycleReview: "available" },
    })));
    await render(); await inspect();
    expect(facts()).toContainEqual(["Recorded customer status", "approved_pending_payment"]);
    expect(facts()).toContainEqual(["Bound authentication account ID", "No authentication account bound"]);
    expect(facts()).toContainEqual(["Identity binding", "conflict"]);
    expect(host.textContent).toContain("configuration observation, not a payment requirement");
    expect(host.textContent).toContain("No missing requirements reported. This is not a new approval");
    expect(host.textContent).toContain("Available in its separate workflow. No certification or activation is performed");
    expect(host.textContent).not.toContain("Payment required");
  });

  it.each([
    [{ kind: "unauthorized" }, "Your admin session is not authorized"],
    [{ kind: "forbidden", message: "private upstream detail" }, "not permitted to inspect account access"],
    [{ kind: "denied", code: "not_admin", message: "private upstream detail" }, "not permitted to inspect account access"],
    [{ kind: "denied", code: "capability_disabled", message: "private upstream detail" }, "not enabled in this environment"],
    [{ kind: "unavailable" }, "does not mean an account or relationship is absent"],
    [{ kind: "error", message: "private upstream detail" }, "inspection could not be completed safely"],
  ] as const)("clears previous facts for an unsuccessful refresh: %j", async (result, message) => {
    await render(); await inspect();
    expect(host.querySelector('[data-testid="access-inspection-result"]')).not.toBeNull();
    api.inspect.mockResolvedValue(result); await submit();
    expect(host.querySelector('[data-testid="access-inspection-result"]')).toBeNull();
    expect(host.textContent).toContain(message);
    expect(host.textContent).not.toContain("private upstream detail");
    expect(host.textContent).not.toContain("No customer record found");
    expect(links()).toEqual([]);
  });

  it("handles a thrown read without exposing its error and requires another explicit submit to retry", async () => {
    api.inspect.mockRejectedValueOnce(new Error("private upstream detail")).mockResolvedValue(success());
    await render(); await inspect();
    expect(host.textContent).toContain("inspection could not be completed safely");
    expect(host.textContent).not.toContain("private upstream detail");
    expect(api.inspect).toHaveBeenCalledTimes(1);
    await submit(); expect(host.querySelector('[data-testid="access-inspection-result"]')).not.toBeNull();
    expect(api.inspect).toHaveBeenCalledTimes(2);
  });

  it("clears a displayed query synchronously on editing and never auto-runs the new query", async () => {
    await render(); await inspect();
    await enter("synthetic-two@example.invalid");
    expect(host.querySelector('[data-testid="access-inspection-result"]')).toBeNull();
    expect(host.textContent).not.toContain("synthetic-one@example.invalid");
    expect(links()).toEqual([]); expect(api.inspect).toHaveBeenCalledTimes(1);
  });

  it("ignores a late completion across query A → B → A, including identical normalized email", async () => {
    const old = deferred(); const current = deferred();
    api.inspect.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    await render(); await inspect();
    await enter("synthetic-two@example.invalid"); await enter("synthetic-one@example.invalid"); await submit();
    await act(async () => old.resolve(success()));
    expect(host.querySelector('[data-testid="access-inspection-result"]')).toBeNull();
    await act(async () => current.resolve(success(fixture({ observedAt: "2026-09-05T13:00:00Z" }))));
    expect(host.querySelector("time")?.getAttribute("datetime")).toBe("2026-09-05T13:00:00Z");
  });

  it("only publishes the latest explicit reload for an unchanged query", async () => {
    const old = deferred(); const current = deferred();
    api.inspect.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    await render(); await inspect(); await submit();
    await act(async () => current.resolve(success(fixture({ observedAt: "2026-09-05T13:00:00Z" }))));
    await act(async () => old.resolve(success()));
    expect(host.querySelector("time")?.getAttribute("datetime")).toBe("2026-09-05T13:00:00Z");
  });

  it("resets email and results synchronously on an admin principal change and ignores the retired request", async () => {
    const old = deferred(); api.inspect.mockReturnValueOnce(old.promise).mockResolvedValue(success());
    await render(); await inspect();
    token = "synthetic-admin-two"; await render();
    expect(input().value).toBe("");
    expect(host.querySelector('[data-testid="access-inspection-result"]')).toBeNull();
    expect(api.inspect).toHaveBeenCalledTimes(1);
    await act(async () => old.resolve(success()));
    expect(host.querySelector('[data-testid="access-inspection-result"]')).toBeNull();
    await inspect();
    expect(api.inspect).toHaveBeenLastCalledWith("synthetic-admin-two", "synthetic-one@example.invalid");
    token = ""; await render();
    expect(input()).toBeNull(); expect(host.textContent).not.toContain("synthetic-one@example.invalid");
    expect(host.textContent).toContain("Admin sign-in is required");
  });

  it("does not publish a completed request after unmount", async () => {
    const pending = deferred(); api.inspect.mockReturnValueOnce(pending.promise);
    await render(); await inspect();
    await act(async () => root.render(null));
    await act(async () => pending.resolve(success()));
    expect(host.textContent).toBe(""); expect(api.inspect).toHaveBeenCalledTimes(1);
  });

  it("retains a newly entered email after admin A → B and explicitly inspects it with B's token", async () => {
    await render(); await inspect();
    token = "synthetic-admin-two"; await render();
    expect(host.querySelectorAll('input[type="email"]')).toHaveLength(1);
    expect(input().value).toBe("");
    expect(host.querySelector('[data-testid="access-inspection-result"]')).toBeNull();
    await enter("second@fixture.invalid");
    expect(input().value).toBe("second@fixture.invalid");
    await render();
    expect(input().value).toBe("second@fixture.invalid");
    expect(api.inspect).toHaveBeenCalledTimes(1);
    api.inspect.mockResolvedValue(success(fixture({ email: "second@fixture.invalid" })));
    await submit();
    expect(api.inspect).toHaveBeenLastCalledWith("synthetic-admin-two", "second@fixture.invalid");
    expect(api.inspect).toHaveBeenCalledTimes(2);
    expect(input().value).toBe("second@fixture.invalid");
    expect(facts()).toContainEqual(["Exact email", "second@fixture.invalid"]);
    expect(host.textContent).not.toContain("synthetic-one@example.invalid");
  });

  it.each([
    "https://outside.example.invalid/admin", "javascript:alert(1)", "//outside.example.invalid/path",
    `${appHref}?email=synthetic-one%40example.invalid`, "/admin/research/applications/%2e%2e/members",
    "/admin/research/applications/00000000-0000-4000-8000-000000000099",
  ])("does not enable unsafe or identity-mismatched server hrefs (%s)", async (href) => {
    api.inspect.mockResolvedValue(success(fixture({
      applications: [{ ...fixture().applications[0], href }], members: [{ ...fixture().members[0], href }],
      nextActions: [{ ...fixture().nextActions[0], href }],
    })));
    await render(); await inspect();
    expect(links()).toEqual([]);
    expect(host.textContent).not.toContain(href);
    expect(host.textContent).toContain("reported link is outside the allowed local record paths");
  });

  it("allows only the known application entry plus exact returned record links, without email or action execution", async () => {
    api.inspect.mockResolvedValue(success(fixture({ nextActions: [
      { label: "Application entry", href: "/research/apply", consequence: "Server-provided application consequence.", notification: "application_email" },
      { label: "Resolve binding", href: null, consequence: "Server-provided manual review consequence.", notification: "none" },
      { label: "Provision workflow", href: null, consequence: "Server-provided unavailable workflow consequence.", notification: "not_available" },
      { label: "Review customer", href: memberHref, consequence: "Open the exact customer record.", notification: "none" },
    ] })));
    await render(); await inspect();
    expect(links()).toEqual([appHref, memberHref, "/research/apply", memberHref]);
    expect(host.textContent).toContain("No navigation link was provided for this step");
    expect(host.textContent).toContain("notification workflow is not available; no delivery is confirmed");
    expect(api.inspect).toHaveBeenCalledTimes(1);
    for (const link of host.querySelectorAll("a")) expect(link.getAttribute("referrerpolicy")).toBe("no-referrer");
  });

  it("contains narrow layouts and provides labeled, usable controls without a table or extra workflow forms", async () => {
    await render(); await inspect();
    expect(host.querySelectorAll("form")).toHaveLength(1);
    expect(host.querySelector("table")).toBeNull();
    expect(host.querySelector(`label[for="${input().id}"]`)?.textContent).toBe("Exact account email");
    expect(host.querySelector<HTMLElement>('[data-testid="member-access-diagnosis"]')?.style.overflowWrap).toBe("anywhere");
    for (const control of host.querySelectorAll<HTMLElement>("input, button, a, summary")) expect(control.style.minHeight).toBe("44px");
    expect(input().style.width).toBe("100%");
  });
});
