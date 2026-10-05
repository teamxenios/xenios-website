import { afterEach, describe, expect, it, vi } from "vitest";
import { createSubscription, type CreateSubscriptionRequest } from "./commerce";

const input: CreateSubscriptionRequest = { sku: "SYNTHETIC-RUO-01", quantity: 2, frequencyDays: 60, priceVersion: "synthetic-price-v1" };
const pending = { subscriptionId: "synthetic-sub-1", version: 1, sku: input.sku,
  displayName: "Synthetic research product", state: "pending", quantity: 2,
  frequencyDays: 60, nextChargeAt: null, nextShipmentAt: null };
function respond(body: unknown, status = 200) {
  return vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json" },
  })));
}
afterEach(() => vi.unstubAllGlobals());

describe("canonical subscription creation boundary", () => {
  it("sends only four intent fields with canonical auth and same-origin cookies, then projects a pending receipt", async () => {
    respond({ ok: true, subscription: { ...pending, paymentProviderReference: "must-not-leak", memberId: "foreign" } });
    const malicious = { ...input, paymentProviderReference: "browser-assertion", memberId: "foreign",
      shippingAddressRef: "unverified", state: "active", priceCents: 1, affiliateId: "chosen-partner" };
    expect(await createSubscription("synthetic-token", malicious)).toEqual({ kind: "ok", data: { subscription: pending } });
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/research/subscriptions");
    expect(init).toMatchObject({ method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { Authorization: "Bearer synthetic-token" } });
    expect(JSON.parse(String(init?.body))).toEqual(input);
  });

  it("refuses an absent principal before making a request", async () => {
    respond({ ok: true, subscription: pending });
    expect(await createSubscription(null, input)).toEqual({ kind: "unauthorized" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    undefined, {}, { ...pending, state: "active" }, { ...pending, sku: "OTHER" },
    { ...pending, quantity: 1 }, { ...pending, frequencyDays: 90 },
    { ...pending, nextChargeAt: "2027-01-01" }, { ...pending, nextShipmentAt: "2027-01-01" },
    { ...pending, version: 2 }, { ...pending, subscriptionId: " " }, { ...pending, displayName: null },
  ])("treats a malformed, mismatched or consequential success as unconfirmed: %j", async (subscription) => {
    respond({ ok: true, subscription });
    expect(await createSubscription("synthetic-token", input)).toMatchObject({ kind: "error", code: "subscription_result_unconfirmed" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("requires the success envelope", async () => {
    respond({ subscription: pending });
    expect(await createSubscription("synthetic-token", input)).toMatchObject({ kind: "error" });
  });

  it.each([400, 403])("preserves an explicit HTTP %i canonical refusal without retry", async (status) => {
    respond({ ok: false, code: "capability_disabled", message: "Internal persistence reason" }, status);
    expect(await createSubscription("synthetic-token", input)).toMatchObject({ kind: "denied", code: "capability_disabled" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
