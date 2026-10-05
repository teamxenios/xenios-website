// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSubscription } from "../adapters/commerce";
import { PERSISTENT_CART_QUANTITY_MAX } from "@shared/research/persistent-cart";
import { ProductSubscriptionCreate, type SubscriptionProductForReview } from "./ProductSubscriptionCreate";

vi.mock("../adapters/commerce", () => ({ createSubscription: vi.fn() }));
const product: SubscriptionProductForReview = { sku: "SYNTHETIC-RUO-01", displayName: "Synthetic research product",
  variantLabel: "Synthetic exact variant", subscriptionEligible: true, purchasable: true,
  priceCents: 1250, currency: "USD", priceVersion: "synthetic-price-v1" };
let host: HTMLDivElement;
let root: Root;
let token: string | null;
function render(p: SubscriptionProductForReview | null = product, commerceEnabled = true) {
  act(() => root.render(<ProductSubscriptionCreate memberToken={token} product={p} commerceEnabled={commerceEnabled} />));
}
function change(selector: string, value: string) {
  const node = host.querySelector<HTMLInputElement | HTMLSelectElement>(selector)!;
  act(() => {
    const proto = node.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(node, value);
    node.dispatchEvent(new Event(node.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
}
function review() { act(() => host.querySelector<HTMLInputElement>('[type="checkbox"]')!.click()); }
async function submit() { await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }
const text = () => host.textContent ?? "";
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks(); token = "synthetic-customer";
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe("product subscription request form", () => {
  it.each([30, 60, 90])("reviews exact product, quantity and %i-day intent, and ends pending without payment", async (days) => {
    vi.mocked(createSubscription).mockResolvedValue({ kind: "ok", data: { subscription: {
      subscriptionId: "synthetic-saved", version: 1, sku: product.sku, displayName: product.displayName,
      state: "pending", quantity: PERSISTENT_CART_QUANTITY_MAX, frequencyDays: days as 30 | 60 | 90, nextChargeAt: null, nextShipmentAt: null,
    } } });
    render(); change('[type="number"]', String(PERSISTENT_CART_QUANTITY_MAX)); change("select", String(days)); review();
    expect(text()).toContain("Synthetic exact variant");
    expect(text()).toContain(`Product subtotal per delivery: USD ${(12.5 * PERSISTENT_CART_QUANTITY_MAX).toFixed(2)}`);
    await submit(); await submit();
    expect(createSubscription).toHaveBeenCalledTimes(1);
    expect(createSubscription).toHaveBeenCalledWith(token, { sku: product.sku, quantity: PERSISTENT_CART_QUANTITY_MAX, frequencyDays: days, priceVersion: product.priceVersion });
    expect(text()).toContain("Subscription request saved. It is pending");
    expect(text()).toContain("Payment setup is not available here");
    expect(text()).toContain("This is not a completed purchase");
  });

  it.each(["0", String(PERSISTENT_CART_QUANTITY_MAX + 1), "100", "1.5", ""])('blocks invalid quantity "%s" without a POST', async (quantity) => {
    render(); change('[type="number"]', quantity); review(); await submit();
    expect(createSubscription).not.toHaveBeenCalled();
  });

  it("requires fresh review after changing schedule or quantity", async () => {
    render(); review(); change("select", "60"); await submit();
    expect(createSubscription).not.toHaveBeenCalled();
    review(); change('[type="number"]', "2"); await submit();
    expect(createSubscription).not.toHaveBeenCalled();
  });

  it.each([null, { ...product, subscriptionEligible: false }, { ...product, purchasable: false },
    { ...product, priceVersion: null }, { ...product, priceCents: null }])("renders no create form without an eligible exact offer", (p) => {
    render(p); expect(host.querySelector("form")).toBeNull();
    expect(text()).toContain("A subscription offer is not available");
    expect(createSubscription).not.toHaveBeenCalled();
  });

  it("refuses submission while commerce is dark or signed out", async () => {
    render(product, false); await submit(); expect(createSubscription).not.toHaveBeenCalled();
    token = null; render(); await submit(); expect(createSubscription).not.toHaveBeenCalled();
  });

  it("preserves quantity/frequency on explicit refusal without exposing internal reason", async () => {
    vi.mocked(createSubscription).mockResolvedValue({ kind: "denied", code: "capability_disabled", message: "Durable CAS missing" });
    render(); change('[type="number"]', "3"); change("select", "90"); review(); await submit();
    expect(host.querySelector<HTMLInputElement>('[type="number"]')!.value).toBe("3");
    expect(host.querySelector<HTMLSelectElement>("select")!.value).toBe("90");
    expect(text()).toContain("no subscription was created by this attempt");
    expect(text()).not.toContain("CAS"); expect(text()).not.toContain("request saved");
  });

  it.each([{ kind: "error", message: "connection lost" }, { kind: "unavailable" }] as const)("locks ambiguous $kind outcomes against blind retry", async (result) => {
    vi.mocked(createSubscription).mockResolvedValue(result);
    render(); review(); await submit(); await submit();
    expect(createSubscription).toHaveBeenCalledTimes(1);
    expect(text()).toContain("could not confirm whether your request was saved");
    expect(host.querySelector("a")?.getAttribute("href")).toBe("/research/member/subscriptions");
  });

  it("absorbs double submit and discards a late result after principal change", async () => {
    let finish!: (value: Awaited<ReturnType<typeof createSubscription>>) => void;
    vi.mocked(createSubscription).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(); review(); await submit(); await submit();
    expect(createSubscription).toHaveBeenCalledTimes(1);
    token = "different-customer"; render();
    await act(async () => finish({ kind: "ok", data: { subscription: { subscriptionId: "previous-customer-id" } as never } }));
    expect(text()).not.toContain("previous-customer-id");
    expect(text()).not.toContain("request saved");
    expect(host.querySelector<HTMLInputElement>('[type="checkbox"]')!.checked).toBe(false);
  });

  it("clears stale review but preserves the retry guard when the exact variant or price changes", async () => {
    vi.mocked(createSubscription).mockResolvedValue({ kind: "unavailable" });
    render(); review(); await submit();
    render({ ...product, sku: "SYNTHETIC-RUO-02", variantLabel: "Another variant", priceVersion: "synthetic-price-v2" });
    expect(text()).toContain("A request was already submitted from this page");
    expect(host.querySelector<HTMLInputElement>('[type="checkbox"]')!.checked).toBe(false);
    await submit(); expect(createSubscription).toHaveBeenCalledTimes(1);
  });

  it.each(["token", "metadata"])("preserves an uncertain attempt across %s refresh", async (refresh) => {
    vi.mocked(createSubscription).mockResolvedValue({ kind: "unavailable" });
    render(); review(); await submit();
    if (refresh === "token") token = "rotated-token-same-customer";
    render(refresh === "metadata" ? { ...product, displayName: "Updated display name" } : product);
    await submit();
    expect(text()).toContain("A request was already submitted from this page");
    expect(createSubscription).toHaveBeenCalledTimes(1);
  });

  it("does not unlock an in-flight create on token rotation and same-SKU metadata refresh", async () => {
    let finish!: (value: Awaited<ReturnType<typeof createSubscription>>) => void;
    vi.mocked(createSubscription).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(); review(); await submit();
    token = "rotated-token"; render({ ...product, priceVersion: "new-display-version" });
    await submit();
    await act(async () => finish({ kind: "unavailable" }));
    await submit();
    expect(createSubscription).toHaveBeenCalledTimes(1);
    expect(text()).toContain("A request was already submitted from this page");
  });
});
