// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { OrderRequestEntry } from "./OrderRequestEntry";
import { REQUEST_INTENT_ATTEMPT_KEY } from "./request-intent-attempt";
import { ASSISTED_ORDER_DRAFT_KEY } from "./draft-store";

const auth = vi.hoisted(() => ({ member: null as null | { id: string }, memberChecking: false,
  memberSessionStatus: "signed_out", recovery: "none" }));
vi.mock("../core", () => ({ useResearch: () => auth }));
vi.mock("./AssistedOrderPage", () => ({ AssistedOrderPage: (props: { embedded?: boolean }) =>
  <div data-testid="legacy-form">{props.embedded ? "embedded" : "standalone"}</div> }));
vi.mock("./RequestIntentEntry", () => ({ RequestIntentEntry: (props: { embedded?: boolean; entryIntent?: { action: string } }) =>
  <div data-testid="mixed-form">{props.embedded ? "embedded" : "standalone"} {props.entryIntent?.action}</div> }));
vi.mock("../early-access/OrderEntryIntentNotice", () => ({ OrderEntryIntentNotice: () => <p>Legacy hint resolver</p> }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement, root: Root;
beforeEach(() => {
  Object.assign(auth, { member: null, memberChecking: false, memberSessionStatus: "signed_out", recovery: "none" });
  window.sessionStorage.clear(); window.history.replaceState(null, "", "/research/early-access/order-request");
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function render(element: React.ReactNode) {
  await act(async () => { root.render(element); });
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
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
    auth.member = { id: "synthetic-a" };
    await render(<OrderRequestEntry mode={{ kind: "mixed" }} />);
    const prior = container.querySelector('[data-testid="mixed-form"]');
    auth.member = { id: "synthetic-b" };
    await render(<OrderRequestEntry mode={{ kind: "mixed" }} />);
    expect(container.querySelector('[data-testid="mixed-form"]')).not.toBe(prior);
    auth.recovery = "active";
    await render(<OrderRequestEntry mode={{ kind: "mixed" }} />);
    expect(container.querySelector('[data-testid="mixed-form"]')).toBeNull();
    expect(container.textContent).toContain("Complete secure account recovery");
  });
});
