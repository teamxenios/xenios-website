import { describe, expect, it } from "vitest";
import { ASSISTED_ORDER_MAX_LINES } from "@shared/research/assisted-order/contract";
import { readAssistedRequestHistory, readMemberOrderRequests } from "./request-read";

const source = { connected: true, complete: true };
const request = () => ({
  kind: "assisted_request", requestId: "11111111-1111-4111-8111-111111111111",
  publicReference: "XRR-20260921-ABCDEF1234", status: "submitted",
  createdAt: "2026-09-21T12:00:00Z", updatedAt: "2026-09-21T12:00:00Z",
  estimatedTotalCents: null, currency: "USD", trackingReference: null,
  lines: [{ productName: "Synthetic requested material", specification: null, quantity: 1, lineEstimateCents: null }],
});

describe("assisted requests remain a separately verified history projection", () => {
  it("keeps nullable estimates and strips unrelated private/payment/carrier fields", () => {
    const row = request();
    expect(readAssistedRequestHistory([{ ...row, paymentCaptured: true, privateNote: "NOT-FOR-VIEW", carrier: "Invented",
      lines: [{ ...row.lines[0], privateCost: 42 }] }], source)).toEqual({ requests: [row], source });
  });
  it("preserves true zero estimates instead of converting them to missing prices", () => {
    const row = { ...request(), estimatedTotalCents: 0, lines: [{ ...request().lines[0], lineEstimateCents: 0 }] };
    expect(readAssistedRequestHistory([row], source)?.requests).toEqual([row]);
  });
  it("accepts the server's 500-character tracking bound and rejects 501", () => {
    const row = { ...request(), trackingReference: "T".repeat(500) };
    expect(readAssistedRequestHistory([row], source)?.requests[0].trackingReference).toBe(row.trackingReference);
    expect(readAssistedRequestHistory([{ ...row, trackingReference: "T".repeat(501) }], source)).toBeNull();
  });
  it("distinguishes connected empty, partial, unavailable, and legacy missing evidence", () => {
    expect(readAssistedRequestHistory([], source)).toEqual({ requests: [], source });
    expect(readAssistedRequestHistory([request()], { connected: true, complete: false })?.source.complete).toBe(false);
    expect(readAssistedRequestHistory([], { connected: false, complete: false })?.source.connected).toBe(false);
    expect(readAssistedRequestHistory(undefined, source)).toBeNull();
    expect(readMemberOrderRequests({ ok: true, orders: [] })).toBeNull();
    expect(readMemberOrderRequests({ ok: true, orders: [], requests: [request()], requestsSource: source })?.requests).toHaveLength(1);
  });
  it.each([
    { kind: "order" }, { requestId: "../private" }, { publicReference: "XEA-20260921-ABCDEF1234" },
    { status: "payment_captured" }, { createdAt: "yesterday" }, { updatedAt: "invalid" },
    { estimatedTotalCents: -1 }, { estimatedTotalCents: 0.5 }, { estimatedTotalCents: "0" },
    { currency: "EUR" }, { trackingReference: "https://example.invalid/\nprivate" }, { lines: [] },
    { lines: [{ ...request().lines[0], quantity: 0 }] }, { lines: [{ ...request().lines[0], lineEstimateCents: undefined }] },
  ])("rejects malformed or cross-lineage request evidence (%j)", (patch) => {
    expect(readAssistedRequestHistory([{ ...request(), ...patch }], source)).toBeNull();
  });
  it("rejects duplicates, oversized windows, inconsistent source claims, and malformed collections", () => {
    expect(readAssistedRequestHistory([request(), request()], source)).toBeNull();
    expect(readAssistedRequestHistory(Array(101).fill(request()), source)).toBeNull();
    expect(readAssistedRequestHistory([{ ...request(), lines: Array(ASSISTED_ORDER_MAX_LINES).fill(request().lines[0]) }], source)?.requests[0].lines).toHaveLength(ASSISTED_ORDER_MAX_LINES);
    expect(readAssistedRequestHistory([{ ...request(), lines: Array(ASSISTED_ORDER_MAX_LINES + 1).fill(request().lines[0]) }], source)).toBeNull();
    expect(readAssistedRequestHistory([], { connected: false, complete: true })).toBeNull();
    expect(readAssistedRequestHistory([request()], { connected: false, complete: false })).toBeNull();
    expect(readAssistedRequestHistory(null, source)).toBeNull();
  });
});
