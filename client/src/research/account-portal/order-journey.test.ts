import { describe, expect, it } from "vitest";
import { ORDER_FULFILLMENT_DISPLAY_STATES, ORDER_PAYMENT_DISPLAY_STATES, type CustomerOrdersDto, type OrderSummaryDto } from "@shared/research/customer-account/contract";
import { FIXTURE_CUSTOMER_ORDERS } from "@shared/research/customer-account/fixtures";
import { accountOrderGuidance, resolveAccountOrder } from "./order-journey";

const row = (patch: Partial<OrderSummaryDto> = {}): OrderSummaryDto => ({
  reference: "SYNTHETIC-1", recordKind: "order", placedAt: "2026-09-07T00:00:00Z", detailAvailability: "available",
  itemLabel: "Synthetic item", variantLabel: null, quantity: 2, paymentState: "paid", fulfillmentState: "processing",
  trackingUrl: null, lotCoaAvailable: false, ...patch,
});
const data = (research: readonly OrderSummaryDto[] = [row()]): CustomerOrdersDto => ({
  ...FIXTURE_CUSTOMER_ORDERS, research, carePharmacy: [],
  history: { availability: "complete", authoritativeRecordCount: research.length,
    sources: { commerce: { connected: true, complete: true }, xea: { connected: true, complete: true },
      xec: { connected: true, complete: true }, xrr: { connected: true, complete: true } } },
});

describe("server-projected account order resolution", () => {
  it.each(["XRR-1", "XEA-1", "XEC-1", "XO-1", "OTHER-1"])("never infers record kind or authority from %s", reference => {
    const record = row({ reference, recordKind: "unknown" });
    expect(resolveAccountOrder(data([record]), reference)).toEqual({ kind: "record", record });
  });

  it("requires exact case-sensitive matching and does not normalize prefixes or references", () => {
    expect(resolveAccountOrder(data(), "synthetic-1")).toEqual({ kind: "absent", definitive: true });
    expect(resolveAccountOrder(data(), "SYNTHETIC")).toEqual({ kind: "absent", definitive: true });
    expect(resolveAccountOrder(data(), " SYNTHETIC-1 ")).toEqual({ kind: "absent", definitive: false });
    expect(resolveAccountOrder(data(), "SYNTHETIC-1?token=secret")).toEqual({ kind: "absent", definitive: false });
  });

  it("refuses duplicate exact references even when the rows agree", () => {
    expect(resolveAccountOrder(data([row(), row()]), "SYNTHETIC-1")).toEqual({ kind: "ambiguous" });
    expect(resolveAccountOrder(data([row(), row({ paymentState: "unpaid" })]), "SYNTHETIC-1")).toEqual({ kind: "ambiguous" });
  });

  it("duplicate unrelated references also prevent a definitive missing-record claim", () => {
    expect(resolveAccountOrder(data([row(), row()]), "MISSING")).toEqual({ kind: "absent", definitive: false });
  });

  it("keeps a known exact record usable in partial history without claiming completeness", () => {
    const value = data();
    const partial = { ...value, history: { ...value.history, availability: "partial", authoritativeRecordCount: null } };
    expect(resolveAccountOrder(partial, "SYNTHETIC-1").kind).toBe("record");
    expect(resolveAccountOrder(partial, "MISSING")).toEqual({ kind: "absent", definitive: false });
  });

  it.each([
    undefined, null, { availability: "complete", authoritativeRecordCount: 1 },
    { ...data().history, authoritativeRecordCount: 2 },
    { ...data().history, authoritativeRecordCount: "1" },
    { ...data().history, sources: { ...data().history.sources, xrr: { connected: false, complete: false } } },
    { ...data().history, sources: { ...data().history.sources, xrr: { connected: true, complete: false } } },
    { ...data().history, availability: "unavailable", authoritativeRecordCount: null },
  ])("missing or inconsistent source evidence cannot prove absence: %j", history => {
    expect(resolveAccountOrder({ ...data(), history }, "MISSING")).toEqual({ kind: "absent", definitive: false });
  });

  it.each([
    null, {}, { research: null }, { research: [null] },
    { ...data(), research: [{ ...row(), reference: "../foreign" }] },
    { ...data(), research: [{ ...row(), itemLabel: { private: true } }] },
    { ...data(), research: [{ ...row(), recordKind: "paid_order" }] },
    { ...data(), research: [{ ...row(), quantity: "2" }] },
    { ...data(), research: [{ ...row(), paymentState: "approved" }] },
    { ...data(), research: [{ ...row(), fulfillmentState: "promised" }] },
    { ...data(), research: [{ ...row(), lotCoaAvailable: "true" }] },
    { ...data(), research: [{ ...row(), trackingUrl: { url: "https://fixture.invalid" } }] },
  ])("fails closed for unreadable consumed fields: %j", value => {
    expect(resolveAccountOrder(value, "SYNTHETIC-1")).toEqual({ kind: "unavailable" });
  });
});

describe("independent payment and fulfillment next-step guidance", () => {
  it.each(ORDER_FULFILLMENT_DISPLAY_STATES)("never treats fulfillment %s as payment evidence", fulfillmentState => {
    const result = accountOrderGuidance(row({ fulfillmentState, paymentState: "unknown" }));
    expect(result.payment).toContain("Payment status is unavailable");
    expect(result.fulfillment.title).toBeTruthy(); expect(result.fulfillment.detail).toBeTruthy();
  });

  it.each(ORDER_PAYMENT_DISPLAY_STATES)("never treats payment %s as shipment evidence", paymentState => {
    const result = accountOrderGuidance(row({ paymentState, fulfillmentState: "unknown", trackingUrl: "https://carrier.fixture.invalid/track/1" }));
    expect(result.fulfillment.title).toBe("Fulfillment status unavailable");
    expect(result.trackingUrl).toBeNull(); expect(result.payment).toBeTruthy();
  });

  it.each(["unfulfilled", "processing", "cancelled", "exception", "unknown"] as const)("a URL alone cannot turn %s into shipment", fulfillmentState => {
    expect(accountOrderGuidance(row({ fulfillmentState, trackingUrl: "https://carrier.fixture.invalid/track/1" })).trackingUrl).toBeNull();
  });

  it.each(["shipped", "delivered"] as const)("allows only the recorded safe tracking URL for %s", fulfillmentState => {
    const url = "https://carrier.fixture.invalid/track/1";
    expect(accountOrderGuidance(row({ fulfillmentState, trackingUrl: url })).trackingUrl).toBe(url);
    for (const bad of [null, "javascript:alert(1)", "http://carrier.fixture.invalid/track", "https://user:password@carrier.fixture.invalid/track"]) {
      expect(accountOrderGuidance(row({ fulfillmentState, trackingUrl: bad })).trackingUrl).toBeNull();
    }
  });

  it("cancellation does not promise a refund; an unpaid request does not offer automatic payment", () => {
    const cancelled = accountOrderGuidance(row({ fulfillmentState: "cancelled" }));
    expect(cancelled.fulfillment.detail).toContain("does not establish whether a payment or refund occurred");
    const unpaid = accountOrderGuidance(row({ recordKind: "request", paymentState: "unpaid" }));
    expect(unpaid.payment).toContain("does not start or authorize a payment");
  });
});
