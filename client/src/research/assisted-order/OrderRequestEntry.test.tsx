// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { OrderRequestEntry } from "./OrderRequestEntry";
import type { MemberInfo, MemberSessionStatus, RecoveryState } from "../core";
import { REQUEST_INTENT_ATTEMPT_KEY } from "./request-intent-attempt";
import { ASSISTED_ORDER_DRAFT_KEY } from "./draft-store";

const auth = vi.hoisted(() => ({ member: null as MemberInfo | null, memberToken: null as string | null, memberChecking: false,
  memberSessionStatus: "signed_out" as MemberSessionStatus, recovery: "none" as RecoveryState }));
vi.mock("../core", () => ({ useResearch: () => auth }));
vi.mock("./AssistedOrderPage", () => ({ AssistedOrderPage: (props: { embedded?: boolean }) =>
  <div data-testid="legacy-form">{props.embedded ? "embedded" : "standalone"}</div> }));
vi.mock("./RequestIntentEntry", () => ({ RequestIntentEntry: (props: { embedded?: boolean; entryIntent?: { action: string } }) =>
  <div data-testid="mixed-form">{props.embedded ? "embedded" : "standalone"} {props.entryIntent?.action}</div> }));
vi.mock("./RequestIntentForm", () => ({ RequestIntentForm: () => <div data-testid="private-form">Volatile form boundary</div> }));
vi.mock("../early-access/OrderEntryIntentNotice", () => ({ OrderEntryIntentNotice: () => <p>Legacy hint resolver</p> }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement, root: Root;
beforeEach(() => {
  Object.assign(auth, { member: null, memberToken: null, memberChecking: false, memberSessionStatus: "signed_out", recovery: "none" });
  window.sessionStorage.clear(); window.history.replaceState(null, "", "/research/early-access/order-request");
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function render(element: React.ReactNode) {
  await act(async () => { root.render(element); });
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}
function member(cartScope?: string): MemberInfo {
  return { firstName: "Synthetic", status: "active", applicationStatus: "active", cartScope };
}
describe("actual front-door selection and preservation (child form boundary stubs)", () => {
  it("selects legacy only from the exact explicit-off response at the standalone door", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503,
      json: async () => ({ enabled: false, error: "request_intent_disabled" }) })));
    await render(<OrderRequestEntry />);
    expect(container.querySelector('[data-testid="legacy-form"]')?.textContent).toBe("standalone");
  });
  it("renders the enabled standalone mixed door without reviving legacy checkout", async () => {
    await render(<OrderRequestEntry mode={{ kind: "mixed" }} />);
    expect(container.querySelector('[data-testid="mixed-form"]')?.textContent?.trim()).toBe("standalone");
    expect(container.querySelector('[data-testid="legacy-form"]')).toBeNull();
  });
  it("keeps unknown standalone readiness closed instead of substituting legacy", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503,
      json: async () => ({ enabled: false, error: "request_intent_unavailable" }) })));
    await render(<OrderRequestEntry />);
    expect(container.querySelector('[data-testid="request-door-held"]')).toBeTruthy();
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/research/support");
    expect(container.querySelector('[data-testid="legacy-form"]')).toBeNull();
  });
  it("routes the enabled embedded door and clinical hint to mixed, not the old Care redirect", async () => {
    await render(<OrderRequestEntry embedded mode={{ kind: "mixed" }}
      entryIntent={{ family: "clinical_formulations_503a", slug: "synthetic", variantId: "source-1", quantity: 2, action: "CARE" }} />);
    expect(container.querySelector('[data-testid="mixed-form"]')?.textContent).toBe("embedded CARE");
    expect(container.textContent).not.toContain("Legacy hint resolver");
  });
  it("does not unmount volatile work when readiness props change mid-attempt", async () => {
    await render(<OrderRequestEntry mode={{ kind: "mixed" }} />);
    const node = container.querySelector('[data-testid="mixed-form"]');
    await render(<OrderRequestEntry mode={{ kind: "legacy" }} />);
    expect(container.querySelector('[data-testid="mixed-form"]')).toBe(node);
    expect(container.querySelector('[data-testid="legacy-form"]')).toBeNull();
  });
  it("restores a mixed marker despite off mode without clearing or converting it", async () => {
    const raw = JSON.stringify({ key: "10000000-0000-4000-8000-000000000001",
      acceptedAt: "2026-10-14T12:00:00Z", state: "in_flight" });
    window.sessionStorage.setItem(REQUEST_INTENT_ATTEMPT_KEY, raw);
    await render(<OrderRequestEntry mode={{ kind: "legacy" }} />);
    expect(container.querySelector('[data-testid="mixed-form"]')).toBeTruthy();
    expect(window.sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBe(raw);
  });
  it("restores the existing legacy attempt even when mixed is enabled", async () => {
    const raw = JSON.stringify({ idempotencyKey: "original-key", acceptedAt: "original-stamp",
      attemptState: "in_flight", selections: [], step: "review", generalNotes: "" });
    window.sessionStorage.setItem(ASSISTED_ORDER_DRAFT_KEY, raw);
    await render(<OrderRequestEntry mode={{ kind: "mixed" }} />);
    expect(container.querySelector('[data-testid="legacy-form"]')).toBeTruthy();
    expect(window.sessionStorage.getItem(ASSISTED_ORDER_DRAFT_KEY)).toBe(raw);
    expect(container.textContent).toContain("do not submit a replacement");
  });
  it("does not carry a mounted owner form across account changes or account recovery", async () => {
    auth.memberSessionStatus = "authenticated";
    auth.member = member("a".repeat(64));
    await render(<OrderRequestEntry mode={{ kind: "mixed" }} />);
    const prior = container.querySelector('[data-testid="mixed-form"]');
    auth.member = member("b".repeat(64));
    await render(<OrderRequestEntry mode={{ kind: "mixed" }} />);
    expect(container.querySelector('[data-testid="mixed-form"]')).not.toBe(prior);
    auth.recovery = "pending";
    await render(<OrderRequestEntry mode={{ kind: "mixed" }} />);
    expect(container.querySelector('[data-testid="mixed-form"]')).toBeNull();
    expect(container.textContent).toContain("Complete secure account recovery");
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/research/support");
  });
});

for (const entry of ["door", "private-entry"] as const) {
  describe(`${entry} canonical member namespace (form boundary stubs, not live identity proof)`, () => {
    const selector = entry === "door" ? '[data-testid="mixed-form"]' : '[data-testid="private-form"]';
    async function mount() {
      if (entry === "door") await render(<OrderRequestEntry mode={{ kind: "mixed" }} />);
      else {
        const { RequestIntentEntry } = await vi.importActual<typeof import("./RequestIntentEntry")>("./RequestIntentEntry");
        await render(<RequestIntentEntry embedded />);
      }
    }
    it("keeps the canonical public support continuation during account recovery", async () => {
      auth.memberSessionStatus = "authenticated"; auth.member = member("a".repeat(64));
      auth.recovery = "pending";
      await mount();
      expect(container.textContent).toContain("Complete secure account recovery");
      expect(container.querySelector(selector)).toBeNull();
      expect(container.querySelector("a")?.getAttribute("href")).toBe("/research/support");
    });
    it("retains a confirmed owner across token-only refresh and remounts for another canonical scope", async () => {
      auth.memberSessionStatus = "authenticated";
      auth.member = member("a".repeat(64)); auth.memberToken = "synthetic-first";
      await mount();
      const original = container.querySelector(selector);
      expect(original).not.toBeNull();
      // This models a confirmed-owner rerender, not a guarantee through an auth checking/unmount phase.
      auth.member = member("a".repeat(64)); auth.memberToken = "synthetic-refreshed";
      await mount(); expect(container.querySelector(selector)).toBe(original);
      auth.member = member("b".repeat(64));
      await mount(); expect(container.querySelector(selector)).not.toBeNull();
      expect(container.querySelector(selector)).not.toBe(original);
    });
    it("removes a prior owner's form and refuses missing, malformed or unconfirmed member namespaces", async () => {
      auth.memberSessionStatus = "authenticated"; auth.member = member("a".repeat(64));
      await mount(); expect(container.querySelector(selector)).not.toBeNull();
      for (const value of [member(), member(""), member("synthetic-invalid"), null]) {
        auth.member = value;
        await mount();
        expect(container.querySelector(selector)).toBeNull();
        expect(container.querySelector('[data-testid="legacy-form"]')).toBeNull();
        expect(container.textContent).toContain("Your account could not be confirmed");
        expect(container.querySelector("a")?.getAttribute("href")).toBe("/research/support");
      }
    });
    it("remounts when leaving the confirmed member for the signed-out early-access boundary", async () => {
      auth.memberSessionStatus = "authenticated"; auth.member = member("a".repeat(64));
      await mount(); const original = container.querySelector(selector);
      expect(original).not.toBeNull();
      auth.member = null; auth.memberToken = null; auth.memberSessionStatus = "signed_out";
      await mount();
      expect(container.querySelector(selector)).not.toBeNull();
      expect(container.querySelector(selector)).not.toBe(original);
    });
  });
}
