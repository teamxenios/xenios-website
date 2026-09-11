import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CheckoutQuoteSnapshot, ShippingQuoteRequest } from "@shared/research/commerce-api";
import type { ShippingQuote } from "@shared/research/commerce";
import { CURRENT_CHECKOUT_CREDIT_POLICY } from "@shared/research/checkout-credit-policy";
import { isCheckoutQuoteSnapshot, quoteShipping } from "./commerce";

const NOW = Date.parse("2026-09-10T12:00:00.000Z");
const EXPIRES = "2026-09-10T12:05:00.000Z";
const request: ShippingQuoteRequest = {
  destination: { line1: "1 Synthetic Way", line2: "Unit 2", city: "Austin", state: "TX", postalCode: "78701", country: "US" },
  service: "standard",
};

function snapshot(): CheckoutQuoteSnapshot {
  return {
    quote: { kind: "configured_fallback", service: "standard", amountCents: 1295,
      estimatedDeliveryRange: null, disclosure: "Configured shipping rate; no carrier delivery promise." },
    subtotalCents: 10000,
    checkoutConsent: { policyVersion: CURRENT_CHECKOUT_CREDIT_POLICY.version, totalCents: 8795, appliedCents: 2500 },
    expiresAt: EXPIRES,
  };
}

function stubFetch(status: number, body: unknown, contentType = "application/json") {
  const cancel = vi.fn(async () => {});
  const fetch = vi.fn(async (_url: string, _init: RequestInit) => ({
    status, ok: status >= 200 && status < 300,
    headers: new Headers({ "content-type": contentType }),
    body: { cancel },
    json: async () => body,
  }));
  vi.stubGlobal("fetch", fetch);
  return { fetch, cancel };
}

beforeEach(() => { vi.spyOn(Date, "now").mockReturnValue(NOW); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("isCheckoutQuoteSnapshot", () => {
  it("accepts the current complete snapshot with or without its positive wire marker", () => {
    expect(CURRENT_CHECKOUT_CREDIT_POLICY.version).toBe("all-available-items-v1");
    expect(isCheckoutQuoteSnapshot(snapshot(), "standard", NOW)).toBe(true);
    expect(isCheckoutQuoteSnapshot({ ok: true, ...snapshot() }, "standard", NOW)).toBe(true);
    expect(isCheckoutQuoteSnapshot(snapshot())).toBe(true);
  });

  it.each<ShippingQuote["service"]>(["standard", "expedited_2day", "next_day", "same_day", "temperature_controlled"])(
    "accepts the exact live service %s without changing its delivery range", service => {
      const value = snapshot();
      value.quote = { ...value.quote, kind: "live_carrier_quote", service, estimatedDeliveryRange: { earliestDays: 0, latestDays: 3 } };
      expect(isCheckoutQuoteSnapshot(value, service, NOW)).toBe(true);
      value.quote.estimatedDeliveryRange = null;
      expect(isCheckoutQuoteSnapshot(value, service, NOW)).toBe(true);
    },
  );

  it("accepts an explicit zero-day carrier range without inventing a promise", () => {
    const value = snapshot();
    value.quote = { ...value.quote, kind: "live_carrier_quote", estimatedDeliveryRange: { earliestDays: 0, latestDays: 0 } };
    expect(isCheckoutQuoteSnapshot(value, "standard", NOW)).toBe(true);
  });

  it.each([
    { subtotal: 0, shipping: 0, applied: 0, total: 0 },
    { subtotal: 10000, shipping: 1295, applied: 0, total: 11295 },
    { subtotal: 10000, shipping: 1295, applied: 10000, total: 1295 },
    { subtotal: Number.MAX_SAFE_INTEGER, shipping: 0, applied: 0, total: Number.MAX_SAFE_INTEGER },
    { subtotal: Number.MAX_SAFE_INTEGER, shipping: 0, applied: Number.MAX_SAFE_INTEGER, total: 0 },
  ])("accepts exact safe arithmetic $subtotal + $shipping - $applied = $total without an added ceiling", ({ subtotal, shipping, applied, total }) => {
    const value = snapshot();
    value.subtotalCents = subtotal;
    value.quote.amountCents = shipping;
    value.checkoutConsent = { ...value.checkoutConsent, appliedCents: applied, totalCents: total };
    expect(isCheckoutQuoteSnapshot(value, "standard", NOW)).toBe(true);
  });

  it.each([undefined, null, true, false, 0, "snapshot", [], {}, { ok: true }, { quote: {} }])("refuses incomplete/non-object input %#", value => {
    expect(isCheckoutQuoteSnapshot(value, "standard", NOW)).toBe(false);
  });

  it.each([false, undefined, null, 1, "true"])("refuses a present non-true wire marker %#", ok => {
    expect(isCheckoutQuoteSnapshot({ ...snapshot(), ok }, "standard", NOW)).toBe(false);
  });

  const requiredFields: Array<[string, string]> = [
    ...["quote", "subtotalCents", "checkoutConsent", "expiresAt"].map(field => ["snapshot", field] as [string, string]),
    ...["kind", "service", "amountCents", "estimatedDeliveryRange", "disclosure"].map(field => ["quote", field] as [string, string]),
    ...["policyVersion", "totalCents", "appliedCents"].map(field => ["checkoutConsent", field] as [string, string]),
  ];
  it.each(requiredFields)("requires own %s.%s, not a missing or inherited value", (section, field) => {
    const value = snapshot() as unknown as Record<string, unknown>;
    const target = section === "snapshot" ? value : value[section] as Record<string, unknown>;
    const original = target[field];
    delete target[field];
    expect(isCheckoutQuoteSnapshot(value, "standard", NOW)).toBe(false);
    Object.setPrototypeOf(target, { [field]: original });
    expect(isCheckoutQuoteSnapshot(value, "standard", NOW)).toBe(false);
  });

  const invalidCents = [undefined, null, "1000", -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1];
  for (const field of ["subtotalCents", "amountCents", "totalCents", "appliedCents"] as const) {
    it.each(invalidCents)(`refuses invalid ${field} %# without coercion`, amount => {
      const value = snapshot() as unknown as Record<string, unknown>;
      const target = field === "subtotalCents" ? value : value[field === "amountCents" ? "quote" : "checkoutConsent"] as Record<string, unknown>;
      target[field] = amount;
      expect(isCheckoutQuoteSnapshot(value, "standard", NOW)).toBe(false);
    });
  }

  it("refuses gross overflow even when subtracting credit gives a safe payable", () => {
    const value = snapshot();
    value.subtotalCents = Number.MAX_SAFE_INTEGER;
    value.quote.amountCents = 1;
    value.checkoutConsent.appliedCents = 1;
    value.checkoutConsent.totalCents = Number.MAX_SAFE_INTEGER;
    expect(isCheckoutQuoteSnapshot(value, "standard", NOW)).toBe(false);
  });

  it("refuses credit that would cover shipping even if the payable arithmetic balances", () => {
    const value = snapshot();
    value.checkoutConsent.appliedCents = 10001;
    value.checkoutConsent.totalCents = 1294;
    expect(isCheckoutQuoteSnapshot(value, "standard", NOW)).toBe(false);
  });

  it("refuses a changed payable or applied amount rather than silently repairing it", () => {
    const total = snapshot(); total.checkoutConsent.totalCents += 1;
    const applied = snapshot(); applied.checkoutConsent.appliedCents += 1;
    expect(isCheckoutQuoteSnapshot(total, "standard", NOW)).toBe(false);
    expect(isCheckoutQuoteSnapshot(applied, "standard", NOW)).toBe(false);
  });

  it.each(["", "all-available-items-v2", "requested-v1", " all-available-items-v1", null, 1])("refuses unrecognized policy %#", policyVersion => {
    const value = snapshot();
    expect(isCheckoutQuoteSnapshot({ ...value, checkoutConsent: { ...value.checkoutConsent, policyVersion } }, "standard", NOW)).toBe(false);
  });

  it.each([
    { kind: "carrier" }, { kind: null }, { service: "express" }, { service: "STANDARD" },
    { disclosure: null }, { disclosure: "" }, { disclosure: "   " }, { disclosure: "hidden\u0000value" }, { disclosure: "hidden\u007fvalue" },
  ])("refuses invalid shipping shape %#", patch => {
    const value = snapshot();
    expect(isCheckoutQuoteSnapshot({ ...value, quote: { ...value.quote, ...patch } }, undefined, NOW)).toBe(false);
  });

  it("binds the quote to the requested service", () => {
    expect(isCheckoutQuoteSnapshot(snapshot(), "next_day", NOW)).toBe(false);
  });

  it.each([
    undefined, [], "1-3", {}, { earliestDays: 1 }, { latestDays: 3 },
    { earliestDays: -1, latestDays: 3 }, { earliestDays: 1, latestDays: -1 },
    { earliestDays: 3, latestDays: 1 }, { earliestDays: 0.5, latestDays: 3 },
    { earliestDays: 1, latestDays: Number.POSITIVE_INFINITY }, { earliestDays: "1", latestDays: 3 },
  ])("refuses malformed or inverted carrier ranges %#", estimatedDeliveryRange => {
    const value = snapshot();
    expect(isCheckoutQuoteSnapshot({ ...value, quote: { ...value.quote, kind: "live_carrier_quote", estimatedDeliveryRange } }, "standard", NOW)).toBe(false);
  });

  it("does not accept a carrier window on a configured fallback", () => {
    const value = snapshot();
    value.quote.estimatedDeliveryRange = { earliestDays: 1, latestDays: 3 };
    expect(isCheckoutQuoteSnapshot(value, "standard", NOW)).toBe(false);
  });

  it.each([
    undefined, null, "", "not-a-date", new Date(EXPIRES),
    "2026-09-10", "2026-09-10T12:05:00Z", "2026-09-10T12:05:00.000+00:00",
    "2027-02-30T12:05:00.000Z", "2026-09-10T25:05:00.000Z",
    "2026-09-10T12:00:00.000Z", "2026-09-10T11:59:59.999Z",
  ])("refuses malformed, noncanonical or non-future expiry %#", expiresAt => {
    expect(isCheckoutQuoteSnapshot({ ...snapshot(), expiresAt }, "standard", NOW)).toBe(false);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.MAX_VALUE])("refuses unusable clock %#", now => {
    expect(isCheckoutQuoteSnapshot(snapshot(), "standard", now)).toBe(false);
  });

  it("becomes invalid at expiry without mutating the displayed snapshot", () => {
    const value = snapshot(); const before = structuredClone(value);
    expect(isCheckoutQuoteSnapshot(value, "standard", Date.parse(EXPIRES) - 1)).toBe(true);
    expect(isCheckoutQuoteSnapshot(value, "standard", Date.parse(EXPIRES))).toBe(false);
    expect(value).toEqual(before);
  });
});

describe("quoteShipping consent boundary through the real fetch adapter", () => {
  it("keeps the endpoint, bearer, method, cache, credentials and exact request payload", async () => {
    const { fetch } = stubFetch(200, { ok: true, ...snapshot() });
    expect(await quoteShipping("synthetic-member-a", request)).toEqual({ kind: "ok", data: snapshot() });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("/api/research/shipping/quote", {
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json", Authorization: "Bearer synthetic-member-a" },
      body: JSON.stringify(request),
    });
  });

  it("does not add authentication when the caller supplies no token", async () => {
    const { fetch } = stubFetch(401, { code: "member_required" });
    expect(await quoteShipping(null, request)).toEqual({ kind: "unauthorized", code: "member_required" });
    expect(fetch.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ headers: { "Content-Type": "application/json" } }));
  });

  it("projects only allowed fields and returns independent nested objects", async () => {
    const expected = snapshot();
    expected.quote.kind = "live_carrier_quote";
    expected.quote.estimatedDeliveryRange = { earliestDays: 1, latestDays: 3 };
    const body = Object.freeze({ ok: true, ...expected, privateNote: "synthetic internal value",
      quote: Object.freeze({ ...expected.quote, carrierCredential: "synthetic internal value",
        estimatedDeliveryRange: Object.freeze({ ...expected.quote.estimatedDeliveryRange, internalRoute: "synthetic internal value" }) }),
      checkoutConsent: Object.freeze({ ...expected.checkoutConsent, balanceSource: "synthetic internal value" }),
    });
    const before = JSON.stringify(body);
    stubFetch(200, body);
    const result = await quoteShipping("synthetic-member-a", request);
    expect(result).toEqual({ kind: "ok", data: expected });
    expect(JSON.stringify(body)).toBe(before);
    if (result.kind !== "ok") throw new Error("Expected validated snapshot");
    expect(result.data).not.toBe(body);
    expect(result.data.quote).not.toBe(body.quote);
    expect(result.data.checkoutConsent).not.toBe(body.checkoutConsent);
    expect(result.data.quote.estimatedDeliveryRange).not.toBe(body.quote.estimatedDeliveryRange);
    result.data.quote.estimatedDeliveryRange!.earliestDays = 2;
    result.data.checkoutConsent.appliedCents = 0;
    expect(body.quote.estimatedDeliveryRange.earliestDays).toBe(1);
    expect(body.checkoutConsent.appliedCents).toBe(2500);
  });

  it.each([{}, { ok: true }, { ok: true, quote: {} }, { ...snapshot(), expiresAt: "2026-09-10T12:00:00.000Z" },
    { ...snapshot(), subtotalCents: "10000", message: "synthetic private error" },
    { ...snapshot(), checkoutConsent: { ...snapshot().checkoutConsent, policyVersion: "unreviewed-policy" } },
  ])("turns malformed positive body %# into static unavailable", async body => {
    stubFetch(200, body);
    expect(await quoteShipping("synthetic-member-a", request)).toEqual({ kind: "unavailable" });
  });

  it("refuses a well-formed quote for a different requested service", async () => {
    stubFetch(200, { ok: true, ...snapshot() });
    expect(await quoteShipping("synthetic-member-a", { ...request, service: "next_day" })).toEqual({ kind: "unavailable" });
  });

  it("checks expiry after the asynchronous response, not only when requesting", async () => {
    stubFetch(200, snapshot());
    const pending = quoteShipping("synthetic-member-a", request);
    vi.mocked(Date.now).mockReturnValue(Date.parse(EXPIRES));
    expect(await pending).toEqual({ kind: "unavailable" });
  });

  it.each([
    [200, { ok: false, code: "commerce_disabled", message: "Not enabled." }, { kind: "denied", code: "commerce_disabled", message: "Not enabled." }],
    [400, { ok: false, code: "shipping_service_unavailable" }, { kind: "denied", code: "shipping_service_unavailable", message: undefined }],
    [401, { code: "recovery_session" }, { kind: "unauthorized", code: "recovery_session" }],
    [403, { code: "commerce_disabled", message: "Not enabled." }, { kind: "denied", code: "commerce_disabled", message: "Not enabled." }],
    [403, { message: "Members only." }, { kind: "forbidden", message: "Members only." }],
    [404, { message: "Not available." }, { kind: "unavailable" }],
    [501, { message: "Not implemented." }, { kind: "unavailable" }],
    [503, { message: "Not available." }, { kind: "unavailable" }],
    [500, { code: "server_failure", message: "Please retry." }, { kind: "error", code: "server_failure", message: "Please retry." }],
  ] as const)("preserves the existing negative envelope for HTTP %s", async (status, body, expected) => {
    stubFetch(status, body);
    expect(await quoteShipping("synthetic-member-a", request)).toEqual(expected);
  });

  it("preserves HTML/unpublished and network failure semantics", async () => {
    const html = stubFetch(200, "<html>Unavailable</html>", "text/html");
    expect(await quoteShipping("synthetic-member-a", request)).toEqual({ kind: "unavailable" });
    expect(html.cancel).toHaveBeenCalledOnce();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("synthetic transport failure"); }));
    expect(await quoteShipping("synthetic-member-a", request)).toEqual({ kind: "error", message: "The connection failed. Please try again." });
  });
});
