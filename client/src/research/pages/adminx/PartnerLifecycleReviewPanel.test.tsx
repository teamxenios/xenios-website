// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApprovedUserAccess } from "@shared/research/approved-user-access";
import PartnerLifecycleReviewPanel from "./PartnerLifecycleReviewPanel";

const mocks = vi.hoisted(() => ({ perform: vi.fn() }));
vi.mock("../../adapters/adminOps", () => ({ performPartnerOperation: mocks.perform }));

const memberId = "00000000-0000-4000-8000-000000000002";
const authId = "00000000-0000-4000-8000-000000000001";
const partnerId = "00000000-0000-4000-8000-000000000003";
const requirements = { agreements: [{ key: "partner_agreement", version: "1.0.0" }], trainingModules: [{ key: "security", version: "1.0.0" }] };
const base = (partners: ApprovedUserAccess["partners"] = []): ApprovedUserAccess => ({
  schemaVersion: 1, observedAt: "2026-09-05T00:00:00Z", email: "admin-test@example.invalid", identityState: "verified",
  authAccounts: [{ authUserId: authId, emailVerified: true, signInRecorded: true }], applications: [],
  members: [{ id: memberId, status: "active", authUserId: authId, binding: "verified", href: `/admin/research/members/${memberId}` }],
  partners, partnerRequirements: requirements,
  organizationRelationships: { state: "available", records: [] },
  boundaries: { care: "separate_authority", membershipBillingEnabled: false, customerAccessApproval: "available", partnerLifecycleReview: "available", referralEligibility: "checked_by_referral_authority" },
  nextActions: [],
});
const partner = (): ApprovedUserAccess["partners"][number] => ({ id: partnerId, memberId, role: "affiliate", state: "application", binding: "verified", updatedAt: "2026-09-05T00:00:00.123456Z", missingRequirements: [] });

let root: Root; let host: HTMLDivElement;
const render = (inspection: ApprovedUserAccess) => act(async () => root.render(<PartnerLifecycleReviewPanel token="admin-token" inspection={inspection} onPendingChange={vi.fn()} />));
const button = (text: string) => Array.from(host.querySelectorAll("button")).find(item => item.textContent === text)!;
function setValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  mocks.perform.mockReset();
  vi.stubGlobal("crypto", { randomUUID: vi.fn().mockReturnValue("operation-key-0001") });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

describe("admin partner lifecycle review", () => {
  it("prepares only one verified active customer and does not imply activation", async () => {
    mocks.perform.mockResolvedValue({ kind: "ok", data: { ok: true, partnerId, memberId, action: "prepare", state: "application", updatedAt: "2026-09-05T00:00:00Z", replayed: false } });
    await render(base());
    const fields = Array.from(host.querySelectorAll<HTMLInputElement>("input"));
    setValue(fields[0], "Synthetic Partner LLC");
    const reason = host.querySelector<HTMLTextAreaElement>("textarea")!; setValue(reason, "Reviewed current partner request");
    await act(async () => button("Review partner preparation").click());
    expect(host.textContent).toContain("No certification or activation is included");
    await act(async () => button("Confirm preparation").click());
    expect(mocks.perform).toHaveBeenCalledWith("admin-token", expect.objectContaining({ action: "prepare", memberId, role: "member_referral", idempotencyKey: "operation-key-0001" }), memberId);
    expect(host.textContent).toContain("Partner application prepared");
  });

  it("retains the exact selected operation and key across an uncertain response", async () => {
    mocks.perform.mockResolvedValueOnce({ kind: "error", message: "unconfirmed" }).mockResolvedValueOnce({ kind: "ok", data: { ok: true, partnerId, memberId, action: "record_clearance", state: "identity_verification_pending", updatedAt: "2026-09-05T00:00:01Z", replayed: true } });
    await render(base([partner()]));
    const fields = Array.from(host.querySelectorAll<HTMLInputElement>("input"));
    setValue(fields[0], "review:synthetic-1");
    const reason = host.querySelector<HTMLTextAreaElement>("textarea")!; setValue(reason, "Reviewed identity document");
    const checkbox = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!; await act(async () => checkbox.click());
    await act(async () => button("Review operation").click()); await act(async () => button("Confirm operation").click());
    expect(host.textContent).toContain("Retry this same request");
    await act(async () => button("Retry same operation").click());
    expect(mocks.perform).toHaveBeenCalledTimes(2);
    expect(mocks.perform.mock.calls[0][1]).toEqual(mocks.perform.mock.calls[1][1]);
    expect(mocks.perform.mock.calls[0][1]).toMatchObject({ expectedUpdatedAt: partner().updatedAt, idempotencyKey: "operation-key-0001", reviewedEvidence: true });
    expect(host.textContent).toContain("The earlier operation result was recovered");
  });
});
