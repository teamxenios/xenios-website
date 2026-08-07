import { describe, expect, it, vi } from "vitest";
import { placeEarlyAccessOrder } from "./earlyAccessCheckout";
const input = { idempotencyKey: "xea_1234567890123456", productId: "PEX-001", variantId: "VAR-1", quantity: 1, expectedUnitPriceCents: 3350, expectedCurrency: "USD", contact: { email: "buyer@example.com", phone: "+1 512 555 0100" }, shipTo: { recipientName: "Samuel Boadu", line1: "1 Main", line2: null, city: "Austin", region: "TX", postalCode: "78701", country: "US" } };
describe("Early Access checkout adapter", () => {
  it("sends only the server order contract and preserves the echoed price guard", async () => {
    const request = vi.fn(async (_path: string, init?: RequestInit) => new Response(JSON.stringify({ ok: true, replayed: false, order: { orderNumber: "XEA-1" } }), { status: 201, headers: { "Content-Type": "application/json" } }));
    const result = await placeEarlyAccessOrder(input, request as typeof fetch);
    expect(result.ok).toBe(true);
    const body = JSON.parse(String(request.mock.calls[0]?.[1]?.body));
    expect(body).toEqual(input);
    expect(body.customerRef).toBeUndefined();
    expect(body.totalCents).toBeUndefined();
  });
  it("surfaces the server price-change refusal without creating a client total", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ ok: false, code: "PRICE_CHANGED", unitPriceCents: 3350 }), { status: 409, headers: { "Content-Type": "application/json" } }));
    const result = await placeEarlyAccessOrder(input, request as typeof fetch);
    expect(result).toMatchObject({ ok: false, status: 409, code: "PRICE_CHANGED" });
  });
});
