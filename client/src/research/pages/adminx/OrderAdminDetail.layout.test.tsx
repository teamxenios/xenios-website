// @vitest-environment jsdom
// DOM regression for the scoped layout choices. Actual pixel geometry is
// qualified separately by native-closeout-browser.mjs against the built SPA.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

const fixture = vi.hoisted(() => ({ data: {} as Record<string, unknown> }));
vi.mock("./auth", () => ({
  fmtDate: (value: string) => value,
  fmtDateTime: (value: string) => value,
  useAdminResource: () => ({ state: "ready", data: fixture.data, reload() {} }),
}));
vi.mock("./AdminResearchHome", () => ({
  AdminScreen: ({ children }: { children: (token: string) => ReactNode }) => children("preview-token"),
  AdminBoundary: ({ children }: { children: ReactNode }) => children,
}));

import QuestionsAdmin from "./QuestionsAdmin";
import OrdersAdmin from "./OrdersAdmin";
import OrderAdminDetail from "./OrderAdminDetail";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove(); root = undefined; container = undefined;
});
async function render(element: ReactNode) {
  container = document.createElement("div"); document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(element));
  return container;
}

describe("native operations responsive layout choices", () => {
  for (const [name, element, data] of [
    ["questions", <QuestionsAdmin />, { questions: [{ id: "question-one", member_email: "synthetic@preview.invalid", topic: "General", status: "pending", asked_at: "2026-09-21", last_activity_at: null }] }],
    ["orders", <OrdersAdmin />, { orders: [{ orderId: "order-one", memberId: "member-one", state: "payment_captured", totalCents: 1000, capturedAmountCents: 1000, placedAt: "2026-09-21" }] }],
  ] as const) {
    it(`${name} gives tabs and row links explicit 44px minimum targets`, async () => {
      fixture.data = data;
      const view = await render(element);
      const wrapper = view.firstElementChild!;
      expect(wrapper.classList.contains("[&_.ra-tabs_button]:min-h-11")).toBe(true);
      expect(wrapper.classList.contains("[&_.ra-tabs_button]:min-w-11")).toBe(true);
      const link = view.querySelector("tbody a")!;
      for (const name of ["inline-flex", "min-h-11", "min-w-11", "items-center"]) expect(link.classList.contains(name)).toBe(true);
      expect(view.querySelector('[role="tablist"]')).not.toBeNull();
      expect(view.querySelector('[role="tab"][tabindex="0"]')).not.toBeNull();
    });
  }

  it("contains wide detail tables inside zero-minimum grid tracks and uses canonical inputs", async () => {
    fixture.data = { order: {
      orderId: "order-with-an-intentionally-long-reference-for-small-screens", memberId: "member-one", state: "payment_captured",
      totalCents: 1000, capturedAmountCents: 1000, placedAt: "2026-09-21", updatedAt: "2026-09-21",
      shippingCents: 0, storeCreditAppliedCents: 0, reviewTriggers: [],
      lines: [{ sku: "SYNTHETIC", displayName: "Synthetic item", quantity: 1, lineTotalCents: 1000 }],
      shipmentsSource: "available", shipments: [{ owner: "xenios", status: "pending", carrier: null, trackingNumber: null }],
      availableActions: ["record_tracking", "cancel"],
    } };
    const view = await render(<OrderAdminDetail />);
    for (const grid of [view.firstElementChild!, view.querySelector('[data-testid="order-summary"]')!.parentElement!]) {
      expect(grid.classList.contains("min-w-0")).toBe(true);
      expect(grid.classList.contains("grid-cols-1")).toBe(true);
    }
    for (const section of view.querySelectorAll("section")) expect(section.classList.contains("min-w-0")).toBe(true);
    const scrollRegions = view.querySelectorAll('.ra-table-wrap[role="region"][tabindex="0"]');
    expect(scrollRegions).toHaveLength(2);
    for (const region of scrollRegions) {
      expect(region.getAttribute("aria-label")).toBeTruthy();
      expect(region.classList.contains("focus-visible:outline-2")).toBe(true);
    }
    const inputs = view.querySelectorAll("input");
    expect(inputs).toHaveLength(3);
    for (const input of inputs) {
      expect(input.classList.contains("input-field")).toBe(true);
      expect(input.classList.contains("input")).toBe(false);
      expect(input.closest("label")?.classList.contains("max-w-full")).toBe(true);
    }
    expect((view.querySelector('[data-testid="order-id"]') as HTMLElement).style.overflowWrap).toBe("anywhere");
  });
});
