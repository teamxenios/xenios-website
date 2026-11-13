// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { OrderEstimateRow } from "./OrderEstimateRow";
import { money } from "./wizard-state";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// The estimated-total row on the order-request page and the confirmation.
// With no catalog-derived estimate (quote-only), the row is absent rather
// than reading "Estimated priced total: Price on request".

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
});
function render(estimate: number | null, variant: "summary" | "facts") {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(variant === "facts" ? <dl><OrderEstimateRow estimate={estimate} variant="facts" /></dl> : <OrderEstimateRow estimate={estimate} variant="summary" testId="order-estimate" />));
  return host;
}

describe("OrderEstimateRow", () => {
  it("renders nothing without an estimate", () => {
    expect(render(null, "summary").textContent).toBe("");
    act(() => root!.unmount()); root = null; host?.remove();
    expect(render(null, "facts").querySelector("dt")).toBeNull();
  });

  it("renders today's summary row with an estimate", () => {
    const el = render(9_800, "summary");
    expect(el.querySelector(".xenios-order-total span")?.textContent).toBe("Estimated priced total");
    expect(el.querySelector('[data-testid="order-estimate"]')?.textContent).toBe(money(9_800));
  });

  it("renders today's facts row with an estimate", () => {
    const el = render(9_800, "facts");
    expect(el.querySelector("dt")?.textContent).toBe("Estimated priced total");
    expect(el.querySelector("dd")?.textContent).toBe(money(9_800));
  });
});
