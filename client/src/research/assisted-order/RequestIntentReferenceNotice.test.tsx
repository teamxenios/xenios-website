// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberInfo, MemberSessionStatus, RecoveryState } from "../core";

const auth = vi.hoisted(() => ({
  member: null as MemberInfo | null,
  memberToken: null,
  memberChecking: false,
  memberSessionStatus: "signed_out" as MemberSessionStatus,
  recovery: "none" as RecoveryState,
}));
vi.mock("../core", () => ({ useResearch: () => auth }));
vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return { ...actual, loadAssistedOrderStatus: vi.fn() };
});
vi.mock("./assisted-order.css", () => ({ default: {} }));

import { loadAssistedOrderStatus } from "./api";
import { AssistedOrderConfirmationPage } from "./AssistedOrderConfirmationPage";
import { AssistedOrderStatusPage } from "./AssistedOrderStatusPage";
import { RequestIntentReferenceNotice } from "./RequestIntentReferenceNotice";
import { rememberConfirmedReceipt, REQUEST_INTENT_RECEIPT_RECORD_KEY } from "./request-intent-continuation";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const receipt = {
  kind: "unapproved_selection_request" as const, requestId: "30000000-0000-4000-8000-000000000001",
  publicReference: "XRI-30000000000040008000000000000001", status: "pending_review" as const, createdAt: "2026-10-14T12:00:00.000Z",
};
const scopeA = "a".repeat(64);
const scopeB = "b".repeat(64);
const memberA: MemberInfo = { firstName: "Synthetic", status: "active", applicationStatus: "active", cartScope: scopeA };
const verifiedA = { member: memberA, memberChecking: false, memberSessionStatus: "authenticated", recovery: "none" } as const;
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  Object.assign(auth, verifiedA);
  sessionStorage.clear(); vi.mocked(loadAssistedOrderStatus).mockReset();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => root.unmount()); host.remove(); sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});
function hrefs() { return [...host.querySelectorAll("a")].map((anchor) => anchor.getAttribute("href") ?? ""); }
function expectNoSecretOrStatusClaim() {
  expect(host.textContent).not.toMatch(/paid|shipped|approved|expired|not valid|Confirmation unavailable|Request received/i);
  for (const href of hrefs()) expect(href).not.toMatch(/token|\.token|status=|key=/i);
  expect(host.querySelector('[data-testid="assisted-order-customer-progress"]')).toBeNull();
}

describe("review-request reference pages", () => {
  it("states what a review request covers on each variant, without asking the customer to submit again", async () => {
    for (const [variant, confirmedHere] of [["confirmation", true], ["confirmation", false], ["status", false]] as const) {
      sessionStorage.clear();
      if (confirmedHere) rememberConfirmedReceipt(sessionStorage, scopeA, receipt);
      await act(async () => root.render(<RequestIntentReferenceNotice key={variant + String(confirmedHere)}
        reference={receipt.publicReference} variant={variant} />));
      expect(host.textContent).toContain("A review request saves the requested items only. It does not approve treatment, create a prescription, collect payment or place a supplier order.");
      expect(host.textContent).not.toContain("Submit for review");
    }
  });
  it("confirmation route: states a tab-confirmed reference as saved, with reference-carrying support links", async () => {
    rememberConfirmedReceipt(sessionStorage, scopeA, receipt);
    window.history.replaceState({}, "", "/research/early-access/order-request/confirmation/" + receipt.publicReference);
    await act(async () => root.render(<AssistedOrderConfirmationPage />));
    expect(host.querySelector('[data-testid="request-intent-reference-confirmation"]')).not.toBeNull();
    expect(host.querySelector("h1")?.textContent).toBe("Request saved for review");
    expect(host.textContent).toContain(receipt.publicReference);
    expect(host.textContent).toContain("confirmed in this browser tab");
    expect(host.textContent).toContain("Nothing was sent again.");
    expect(host.textContent).toContain("not an order, approval or payment");
    const links = hrefs();
    expect(links).toContain("/research/early-access/order-request");
    expect(links).toContain("/research/support");
    const mailto = links.find((href) => href.startsWith("mailto:"))!;
    expect(mailto.startsWith("mailto:research@xeniostechnology.com?")).toBe(true);
    expect(decodeURIComponent(mailto)).toContain("Quick Order request " + receipt.publicReference);
    expect(host.querySelectorAll("h1")).toHaveLength(1);
    expectNoSecretOrStatusClaim();
  });
  it("confirmation route: never claims a save from the URL alone", async () => {
    window.history.replaceState({}, "", "/research/early-access/order-request/confirmation/" + receipt.publicReference);
    await act(async () => root.render(<AssistedOrderConfirmationPage />));
    expect(host.querySelector("h1")?.textContent).toBe("Request reference");
    expect(host.textContent).toContain(receipt.publicReference);
    expect(host.textContent).toContain("does not confirm that a request was saved");
    expect(host.textContent).not.toContain("saved for review");
    expectNoSecretOrStatusClaim();
  });
  it("confirmation route: a different tab-confirmed reference is not borrowed", async () => {
    rememberConfirmedReceipt(sessionStorage, scopeA, receipt);
    const other = "XRI-30000000000040008000000000000002";
    window.history.replaceState({}, "", "/research/early-access/order-request/confirmation/" + other);
    await act(async () => root.render(<AssistedOrderConfirmationPage />));
    expect(host.textContent).toContain(other);
    expect(host.textContent).not.toContain(receipt.publicReference);
    expect(host.textContent).toContain("does not confirm that a request was saved");
  });
  it("confirmation route: legacy references keep their existing unavailable screen", async () => {
    window.history.replaceState({}, "", "/research/early-access/order-request/confirmation/XRR-20260819-ABCDEF1234");
    await act(async () => root.render(<AssistedOrderConfirmationPage />));
    expect(host.textContent).toContain("Confirmation unavailable");
    expect(host.querySelector('[data-testid^="request-intent-reference-"]')).toBeNull();
  });
  it("status route: says online status is unavailable instead of calling the reference invalid, and reads nothing", async () => {
    window.history.replaceState({}, "", "/research/early-access/order-request/" + receipt.publicReference);
    await act(async () => root.render(<AssistedOrderStatusPage />));
    expect(host.querySelector('[data-testid="request-intent-reference-status"]')).not.toBeNull();
    expect(host.querySelector("h1")?.textContent).toBe("Request status");
    expect(host.textContent).toContain("Online status is not available for review requests");
    expect(host.textContent).toContain(receipt.publicReference);
    expect(loadAssistedOrderStatus).not.toHaveBeenCalled();
    expectNoSecretOrStatusClaim();
  });
  it("status route: a tab-confirmed reference is reported as confirmed here too", async () => {
    rememberConfirmedReceipt(sessionStorage, scopeA, receipt);
    window.history.replaceState({}, "", "/research/early-access/order-request/" + receipt.publicReference);
    await act(async () => root.render(<AssistedOrderStatusPage />));
    expect(host.textContent).toContain("confirmed in this browser tab");
    expect(loadAssistedOrderStatus).not.toHaveBeenCalled();
  });
  it.each([
    { variant: "confirmation", segment: "confirmation/", Page: AssistedOrderConfirmationPage },
    { variant: "status", segment: "", Page: AssistedOrderStatusPage },
  ])("$variant route removes stored confirmation when the verified principal changes on the same URL", async ({ segment, Page }) => {
    rememberConfirmedReceipt(sessionStorage, scopeA, receipt);
    const read = vi.spyOn(Storage.prototype, "getItem");
    const displayedTime = new Date(receipt.createdAt).toLocaleString();
    window.history.replaceState({}, "", "/research/early-access/order-request/" + segment + receipt.publicReference);
    const render = () => act(async () => root.render(<Page />));
    await render();
    expect(host.textContent).toContain(displayedTime);

    const unverifiedStates: Partial<typeof auth>[] = [
      { memberChecking: true },
      { memberSessionStatus: "checking" },
      { memberSessionStatus: "verification_failed" },
      { memberSessionStatus: "signed_out", member: null },
      { recovery: "pending" },
      { member: { ...memberA, cartScope: "early-access-session" } },
      { member: null },
    ];
    const expectUrlOnly = () => {
      expect(host.textContent).toContain(receipt.publicReference);
      expect(host.textContent).toContain("does not confirm that a request was saved");
      expect(host.textContent).not.toContain("Request saved for review");
      expect(host.textContent).not.toContain(displayedTime);
    };
    for (const state of unverifiedStates) {
      Object.assign(auth, verifiedA, state);
      read.mockClear();
      await render();
      expectUrlOnly();
      expect(read).not.toHaveBeenCalledWith(REQUEST_INTENT_RECEIPT_RECORD_KEY);
    }

    Object.assign(auth, verifiedA);
    await render();
    expect(host.textContent).toContain(displayedTime);
    Object.assign(auth, { member: { ...memberA, cartScope: scopeB } });
    await render();
    expectUrlOnly();
    expect(loadAssistedOrderStatus).not.toHaveBeenCalled();
  });
  it("renders the notice without storage access", async () => {
    vi.spyOn(window, "sessionStorage", "get").mockImplementation((): Storage => {
      throw new DOMException("Storage denied", "SecurityError");
    });
    await act(async () => root.render(<RequestIntentReferenceNotice reference={receipt.publicReference} variant="confirmation" />));
    expect(host.textContent).toContain("does not confirm that a request was saved");
  });
  it("treats a retyped lower-case review reference as the same reference on both routes", async () => {
    rememberConfirmedReceipt(sessionStorage, scopeA, receipt);
    window.history.replaceState({}, "", "/research/early-access/order-request/confirmation/" + receipt.publicReference.toLowerCase());
    await act(async () => root.render(<AssistedOrderConfirmationPage />));
    expect(host.textContent).toContain(receipt.publicReference);
    expect(host.textContent).toContain("confirmed in this browser tab");
    expect(host.textContent).not.toContain("Confirmation unavailable");
    window.history.replaceState({}, "", "/research/early-access/order-request/" + receipt.publicReference.toLowerCase());
    await act(async () => root.render(<AssistedOrderStatusPage />));
    expect(host.textContent).toContain("Online status is not available for review requests");
    expect(host.textContent).not.toContain("not valid or has expired");
    expect(loadAssistedOrderStatus).not.toHaveBeenCalled();
  });
});
