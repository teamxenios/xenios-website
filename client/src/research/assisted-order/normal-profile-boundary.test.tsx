// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberInfo, MemberSessionStatus, RecoveryState } from "../core";
import { OrderRequestEntry } from "./OrderRequestEntry";
import { REQUEST_INTENT_ATTEMPT_KEY } from "./request-intent-attempt";

const auth = vi.hoisted(() => ({ member: null as MemberInfo | null, memberToken: null as string | null,
  memberChecking: false, memberSessionStatus: "signed_out" as MemberSessionStatus, recovery: "none" as RecoveryState,
  refreshMember: vi.fn(), signOutMember: vi.fn() }));
vi.mock("../core", () => ({ useResearch: () => auth }));
vi.mock("./RequestIntentEntry", () => ({ RequestIntentEntry: () => <div data-testid="form-stub" /> }));
vi.mock("./RequestIntentForm", () => ({ RequestIntentForm: () => <div data-testid="form-stub" /> }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement, root: Root;
beforeEach(() => {
  Object.assign(auth, { member: null, memberToken: null, memberChecking: false, memberSessionStatus: "signed_out", recovery: "none" });
  vi.clearAllMocks();
  window.sessionStorage.clear(); window.localStorage.clear();
  window.history.replaceState(null, "", "/research/early-access/order-request");
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected network request in controlled fixture"); }));
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function render(element: ReactNode) {
  await act(async () => { root.render(element); });
  for (let index = 0; index < 5; index++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

// Controlled provider projections and child stubs: not real authentication,
// catalog, browser-profile reproduction, request persistence or release proof.
for (const entry of ["door", "private-entry"] as const) {
  describe(`${entry}: normal-profile boundary component fixtures`, () => {
    async function mount() {
      if (entry === "door") await render(<OrderRequestEntry embedded mode={{ kind: "mixed" }} />);
      else {
        const actual = await vi.importActual<typeof import("./RequestIntentEntry")>("./RequestIntentEntry");
        await render(<actual.RequestIntentEntry embedded />);
      }
    }
    it("permits the existing fresh signed-out form boundary", async () => {
      await mount();
      expect(container.querySelector('[data-testid="form-stub"]')).not.toBeNull();
      expect(container.querySelector('[role="alert"]')).toBeNull();
      expect(fetch).not.toHaveBeenCalled();
    });
    it("permits the existing verified member boundary", async () => {
      auth.memberSessionStatus = "authenticated";
      auth.member = { firstName: "Synthetic", status: "active", applicationStatus: "active", cartScope: "a".repeat(64) };
      await mount();
      expect(container.querySelector('[data-testid="form-stub"]')).not.toBeNull();
      expect(container.querySelector('[role="alert"]')).toBeNull();
    });
    it("distinguishes failed verification from password recovery without offering a downgrade", async () => {
      auth.memberSessionStatus = "verification_failed";
      await mount();
      expect(container.querySelector('[role="alert"]')?.textContent).toContain("session could not be verified");
      expect(container.textContent).toContain("does not mean password recovery is required");
      expect(container.textContent).toContain("do not create a replacement until staff check for duplicates");
      expect(container.textContent).not.toContain("Complete secure account recovery");
      expect(container.querySelector('[data-testid="form-stub"]')).toBeNull();
      expect(container.querySelector("button")).toBeNull();
      expect(container.querySelector("a")?.getAttribute("href")).toBe("/support");
    });
    it("retains genuine recovery guidance, including when verification also failed", async () => {
      auth.recovery = "pending"; auth.memberSessionStatus = "verification_failed";
      await mount();
      expect(container.textContent).toContain("Complete secure account recovery");
      expect(container.textContent).not.toContain("does not mean password recovery");
      expect(container.querySelector('[data-testid="form-stub"]')).toBeNull();
    });
    it.each(["verification", "recovery"] as const)("preserves pending continuity and storage during %s refusal", async (state) => {
      const pending = JSON.stringify({ key: "10000000-0000-4000-8000-000000000001", acceptedAt: "2026-10-18T12:00:00Z", state: "in_flight" });
      window.sessionStorage.setItem(REQUEST_INTENT_ATTEMPT_KEY, pending);
      window.localStorage.setItem("synthetic-boundary-sentinel", "unchanged");
      if (state === "verification") auth.memberSessionStatus = "verification_failed";
      else auth.recovery = "pending";
      await mount();
      expect(window.sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBe(pending);
      expect(window.localStorage.getItem("synthetic-boundary-sentinel")).toBe("unchanged");
      expect(auth.refreshMember).not.toHaveBeenCalled(); expect(auth.signOutMember).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
      expect(container.querySelector('[data-testid="form-stub"]')).toBeNull();
    });
  });
}
