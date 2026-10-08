// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSubscription } from "../adapters/commerce";
import { PERSISTENT_CART_QUANTITY_MAX } from "@shared/research/persistent-cart";
import { SUBSCRIPTION_FREQUENCIES } from "@shared/research/commerce";
import { ProductSubscriptionCreate, type SubscriptionProductForReview } from "./ProductSubscriptionCreate";

vi.mock("../adapters/commerce", () => ({ createSubscription: vi.fn() }));
const product: SubscriptionProductForReview = { sku: "SYNTHETIC-RUO-01", displayName: "Synthetic research product",
  variantLabel: "Synthetic exact variant", subscriptionEligible: true, purchasable: true,
  priceCents: 1250, currency: "USD", priceVersion: "synthetic-price-v1" };
let host: HTMLDivElement;
let root: Root;
let token: string | null;
function render(p: SubscriptionProductForReview | null = product, commerceEnabled = true, visible = true) {
  act(() => root.render(<ProductSubscriptionCreate memberToken={token} product={p} commerceEnabled={commerceEnabled} visible={visible} />));
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
const pending = (subscriptionId = "synthetic-saved") => ({ kind: "ok" as const, data: { subscription: {
  subscriptionId, version: 1, sku: product.sku, displayName: product.displayName, state: "pending" as const,
  quantity: 1, frequencyDays: 30 as const, nextChargeAt: null, nextShipmentAt: null,
} } });
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks(); token = "synthetic-customer";
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
    expect(text()).toContain("Subscription request saved. It is pending, with no payment or shipment scheduled.");
    expect(text()).toContain("Payment setup is not available here. This is not a completed purchase.");
    expect(text()).not.toMatch(/subscription (?:is active|activated)|payment (?:received|complete)|shipment (?:created|confirmed)/i);
    expect(host.querySelector("fieldset")?.disabled).toBe(true);
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
    expect(text()).toContain("A subscription offer is not available for this product.");
    expect(text()).not.toMatch(/recurring deliveries|Unit price|per delivery|Every \d+ days/);
    expect(createSubscription).not.toHaveBeenCalled();
  });

  it("shows a closed status without a review form while commerce is dark", () => {
    render(product, false);
    expect(text()).toContain("Product subscription requests are not open.");
    expect(text()).not.toMatch(/recurring deliveries|Unit price|Choose your schedule/);
    expect(host.querySelector("form")).toBeNull();
    expect(createSubscription).not.toHaveBeenCalled();
  });

  it("shows the missing-account state without exposing the supplied private offer", () => {
    token = null; render();
    expect(text()).toContain("Sign in to review a product subscription.");
    expect(text()).not.toContain(product.sku);
    expect(host.querySelector("form")).toBeNull();
    expect(createSubscription).not.toHaveBeenCalled();
  });

  it("does not imply signing in unlocks an absent offer", () => {
    token = null; render(null, false);
    expect(text()).toContain("A subscription offer is not available for this product.");
    expect(text()).not.toContain("Sign in to review");
    expect(host.querySelector("form")).toBeNull();
    expect(createSubscription).not.toHaveBeenCalled();
  });

  it("uses the canonical quantity band and frequency options only for a reviewable offer", () => {
    render();
    expect(host.querySelector<HTMLInputElement>('[type="number"]')?.max).toBe(String(PERSISTENT_CART_QUANTITY_MAX));
    expect(Array.from(host.querySelectorAll("option"), option => Number(option.value))).toEqual(SUBSCRIPTION_FREQUENCIES);
    expect(text()).toContain("Unit price: USD 12.50");
    render({ ...product, currency: "EUR", priceCents: 2468, priceVersion: "synthetic-eur-v2" });
    expect(text()).toContain("Unit price: EUR 24.68");
    expect(text()).not.toContain("USD 12.50");
  });

  it("preserves quantity/frequency on explicit refusal without exposing internal reason", async () => {
    vi.mocked(createSubscription).mockResolvedValue({ kind: "denied", code: "capability_disabled", message: "Durable CAS missing" });
    render(); change('[type="number"]', "3"); change("select", "90"); review(); await submit();
    expect(host.querySelector<HTMLInputElement>('[type="number"]')!.value).toBe("3");
    expect(host.querySelector<HTMLSelectElement>("select")!.value).toBe("90");
    expect(text()).toContain("Product subscription requests are not available. Your selections remain here; no subscription was created by this attempt.");
    expect(text()).not.toContain("CAS"); expect(text()).not.toContain("request saved");
    expect(host.querySelector("fieldset")?.disabled).toBe(false);
    vi.mocked(createSubscription).mockResolvedValue({ kind: "denied", code: "quantity_invalid" });
    await submit();
    expect(createSubscription).toHaveBeenCalledTimes(2);
    expect(text()).toContain(`Choose a whole-number quantity from 1 to ${PERSISTENT_CART_QUANTITY_MAX}.`);
  });

  it.each([{ kind: "error", message: "connection lost" }, { kind: "unavailable" }] as const)("locks ambiguous $kind outcomes against blind retry", async (result) => {
    vi.mocked(createSubscription).mockResolvedValue(result);
    render(); review(); await submit(); await submit();
    expect(createSubscription).toHaveBeenCalledTimes(1);
    expect(text()).toContain("could not confirm whether your request was saved");
    expect(text()).not.toMatch(/no subscription was created|nothing was saved|request was declined/);
    expect(host.querySelector("fieldset")?.disabled).toBe(true);
    expect(host.querySelector("a")?.getAttribute("href")).toBe("/research/member/subscriptions");
  });

  it("keeps a rejected mutation promise uncertain and locked", async () => {
    vi.mocked(createSubscription).mockRejectedValue(new Error("synthetic lost response"));
    render(); review(); await submit(); await submit();
    expect(createSubscription).toHaveBeenCalledTimes(1);
    expect(text()).toContain("We could not confirm whether your request was saved.");
    expect(text()).not.toContain("synthetic lost response");
    expect(text()).not.toContain("no subscription was created");
    expect(host.querySelector("fieldset")?.disabled).toBe(true);
  });

  it("blocks two synchronous submit events before a response arrives", async () => {
    let finish!: (value: Awaited<ReturnType<typeof createSubscription>>) => void;
    vi.mocked(createSubscription).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(); review();
    await act(async () => {
      const form = host.querySelector("form")!;
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(createSubscription).toHaveBeenCalledTimes(1);
    expect(text()).toContain("Submitting request...");
    await act(async () => finish(pending()));
    expect(text()).toContain("Subscription request saved.");
  });

  it("absorbs double submit and discards a late result after principal change", async () => {
    let finish!: (value: Awaited<ReturnType<typeof createSubscription>>) => void;
    vi.mocked(createSubscription).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(); review(); await submit(); await submit();
    expect(createSubscription).toHaveBeenCalledTimes(1);
    token = "different-customer"; render();
    await act(async () => finish(pending("previous-customer-id")));
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

  it.each(["product", "token", "hidden", "capability"])("a late refusal cannot unlock or overwrite the newer %s view", async (changeScope) => {
    let finish!: (value: Awaited<ReturnType<typeof createSubscription>>) => void;
    vi.mocked(createSubscription).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(); review(); await submit();
    let next = product;
    if (changeScope === "product") next = { ...product, sku: "SYNTHETIC-NEW", displayName: "New product" };
    if (changeScope === "token") token = "synthetic-new-principal";
    if (changeScope === "hidden") render(null, false, false);
    if (changeScope === "capability") render(product, false);
    render(next);
    await act(async () => finish({ kind: "denied", code: "capability_disabled" }));
    expect(text()).not.toContain("no subscription was created by this attempt");
    expect(text()).toContain("A request was already submitted from this page.");
    expect(host.querySelector("fieldset")?.disabled).toBe(true);
    await submit(); expect(createSubscription).toHaveBeenCalledTimes(1);
  });

  it("retains the uncertain lock while the inner view unmounts for detail loading", async () => {
    vi.mocked(createSubscription).mockResolvedValue({ kind: "unavailable" });
    render(); review(); await submit();
    render(null, false, false);
    expect(host.textContent).toBe("");
    token = "synthetic-rotated";
    render({ ...product, sku: "SYNTHETIC-OTHER", priceVersion: "synthetic-v2" });
    expect(host.querySelector("fieldset")?.disabled).toBe(true);
    await submit(); expect(createSubscription).toHaveBeenCalledTimes(1);
    expect(text()).toContain("A request was already submitted from this page.");
    expect(text()).not.toContain("no subscription was created");
  });

  it("discards a saved response for the old product and keeps the newer view locked", async () => {
    let finish!: (value: Awaited<ReturnType<typeof createSubscription>>) => void;
    vi.mocked(createSubscription).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(); review(); await submit();
    render({ ...product, sku: "SYNTHETIC-NEW", displayName: "New product" });
    await act(async () => finish(pending("old-product-private-reference")));
    expect(text()).toContain("New product");
    expect(text()).not.toContain("old-product-private-reference");
    expect(text()).not.toContain("Subscription request saved.");
    await submit(); expect(createSubscription).toHaveBeenCalledTimes(1);
  });

  it("discards a late saved response after the whole owner unmounts", async () => {
    let finish!: (value: Awaited<ReturnType<typeof createSubscription>>) => void;
    vi.mocked(createSubscription).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(); review(); await submit();
    act(() => root.render(null));
    await act(async () => finish(pending("unmounted-private-reference")));
    expect(host.textContent).toBe("");
    expect(createSubscription).toHaveBeenCalledTimes(1);
  });

  it("clears a saved private receipt on sign-out without unlocking the attempt", async () => {
    vi.mocked(createSubscription).mockResolvedValue(pending("private-saved-reference"));
    render(); review(); await submit();
    expect(text()).toContain("private-saved-reference");
    token = null; render();
    expect(text()).not.toContain("private-saved-reference");
    expect(text()).not.toContain("Subscription request saved.");
    expect(host.querySelector("form")).toBeNull();
    token = "synthetic-new-account"; render();
    expect(host.querySelector("fieldset")?.disabled).toBe(true);
    await submit(); expect(createSubscription).toHaveBeenCalledTimes(1);
  });
});
