// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssistedOrderCatalogItem } from "@shared/research/assisted-order/contract";
import { OrderEntryIntentNotice } from "./OrderEntryIntentNotice";
import { loadOrderEntryIntent, orderEntryIntentFromSearch, type OrderEntryIntentResolution } from "./orderEntryIntent";

vi.mock("./orderEntryIntent", async (importOriginal) => ({
  ...await importOriginal<typeof import("./orderEntryIntent")>(),
  loadOrderEntryIntent: vi.fn(),
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const intent = orderEntryIntentFromSearch("?family=research_vials&slug=alpha&variant=mov_alpha&qty=100&intent=buy_now")!;
const item = { productName: "Current canonical Alpha", specification: "10 mg" } as AssistedOrderCatalogItem;
let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.mocked(loadOrderEntryIntent).mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });
async function render(overrides: Partial<ComponentProps<typeof OrderEntryIntentNotice>> = {}) {
  await act(async () => root.render(<OrderEntryIntentNotice intent={intent} enabled {...overrides} />));
}

describe("OrderEntryIntentNotice", () => {
  it("does not read a catalog or advertise assisted access before capability is enabled", async () => {
    await render({ enabled: false, showAssistedAction: true });
    expect(loadOrderEntryIntent).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Complete access before reviewing");
    expect(host.querySelector("a")).toBeNull();
    await render({ intent: null });
    expect(host.textContent).toBe("");
  });

  it("shows only the server-resolved product facts and an explicit retained assisted link", async () => {
    vi.mocked(loadOrderEntryIntent).mockResolvedValue({ kind: "matched", item, quantity: 100 });
    await render({ showAssistedAction: true });
    expect(host.textContent).toContain("Current canonical Alpha — 10 mg");
    expect(host.textContent).toContain("Requested quantity: 100");
    expect(host.textContent).toContain("Opening this link does not add products, place an order, or charge you");
    expect(host.textContent).not.toContain("mov_alpha");
    const link = host.querySelector("a")!;
    expect(link.getAttribute("href")).toBe("/research/early-access/order-request?family=research_vials&slug=alpha&variant=mov_alpha&qty=100&intent=buy_now");
    expect(link.style.minHeight).toBe("44px");
    expect(link.style.whiteSpace).toBe("normal");
  });

  it.each(["missing", "ambiguous", "unavailable", "quantity_unavailable"] as const)("retains %s intent without inventing a product or adding anything", async (kind) => {
    vi.mocked(loadOrderEntryIntent).mockResolvedValue({ kind });
    await render();
    expect(host.textContent).toContain("choose an available product and quantity below");
    expect(host.textContent).toContain("Requested quantity: 100");
    expect(host.textContent).not.toMatch(/Current canonical Alpha|mov_alpha/);
    expect(host.querySelector("button")).toBeNull();
  });

  it("routes both requested and server-resolved Care only to Care", async () => {
    vi.mocked(loadOrderEntryIntent).mockResolvedValue({ kind: "care" });
    await render({ showAssistedAction: true });
    expect(host.querySelector("a")?.getAttribute("href")).toBe("/care/schedule");
    expect(host.textContent).toContain("cannot be added to a Research request");
    expect(host.textContent).not.toContain("Requested quantity");
    await render({ intent: { ...intent, action: "CARE" }, enabled: false, showAssistedAction: true });
    expect(host.querySelector("a")?.getAttribute("href")).toBe("/care/schedule");
  });

  it("fails a read honestly and does not render a stale result after a selection change", async () => {
    let finish!: (value: OrderEntryIntentResolution) => void;
    vi.mocked(loadOrderEntryIntent).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }))
      .mockRejectedValueOnce(new Error("unavailable"));
    const onResolved = vi.fn();
    await render({ onResolved });
    await render({ intent: { ...intent, slug: "other" }, onResolved });
    await act(async () => finish({ kind: "matched", item, quantity: 100 }));
    expect(host.textContent).not.toContain("Current canonical Alpha");
    expect(host.textContent).toContain("choose an available product");
    expect(onResolved).toHaveBeenCalledExactlyOnceWith({ kind: "unavailable" });
  });
});
