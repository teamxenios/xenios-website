import { describe, expect, it } from "vitest";

import { invoicePathFor, loadEarlyAccessInvoice } from "./earlyAccessOrder";
import type { ApiResult } from "../lib/api";

function respond<T>(result: ApiResult<T>) {
  return async <R>(_path: string): Promise<ApiResult<R>> => result as unknown as ApiResult<R>;
}

function invoiceBody(overrides: Record<string, unknown> = {}) {
  return {
    invoice: {
      invoiceNumber: "XEA-INV-0001",
      orderNumber: "XEA-0000000000000001",
      issuedAt: "2026-08-04T12:00:00.000Z",
      status: "issued",
      lines: [],
      subtotalCents: 16_800,
      discountCents: 3_360,
      discountLabel: "3-Unit Research Bundle",
      payableTotalCents: 13_440,
      currency: "USD",
      paymentReference: "XEA-REF-0000000000000001",
      instructions: ["Send by Zelle"],
      ...overrides,
    },
  };
}

describe("invoice adapter", () => {
  it("encodes the order number into the path", () => {
    expect(invoicePathFor("XEA-1")).toBe("/api/research/early-access/orders/XEA-1/invoice");
    expect(invoicePathFor("a/b")).toContain("a%2Fb");
  });

  it("carries the server's amounts across without touching them", async () => {
    const load = await loadEarlyAccessInvoice("XEA-1", respond({ kind: "ok", data: invoiceBody() }));
    expect(load.kind).toBe("ok");
    if (load.kind !== "ok") return;
    expect(load.invoice.subtotalCents).toBe(16_800);
    expect(load.invoice.discountCents).toBe(3_360);
    expect(load.invoice.payableTotalCents).toBe(13_440);
    expect(load.invoice.paymentReference).toBe("XEA-REF-0000000000000001");
  });

  it("refuses an invoice with no payment reference", async () => {
    // Without it a customer's transfer cannot be matched to their order. A
    // payment screen with a blank reference invites money that arrives attached
    // to nobody, which is worse than a screen that says it could not load.
    for (const paymentReference of ["", "   ", undefined, null, 42]) {
      const load = await loadEarlyAccessInvoice(
        "XEA-1",
        respond({ kind: "ok", data: invoiceBody({ paymentReference }) }),
      );
      expect(load.kind, `accepted reference ${JSON.stringify(paymentReference)}`).toBe("unreadable");
    }
  });

  it.each([
    ["a string total", { payableTotalCents: "13440" }],
    ["a fractional total", { payableTotalCents: 13_440.5 }],
    ["a zero total", { payableTotalCents: 0 }],
    ["a negative subtotal", { subtotalCents: -1 }],
    ["a negative discount", { discountCents: -1 }],
    ["no currency", { currency: "" }],
  ])("refuses an invoice with %s", async (_label, patch) => {
    const load = await loadEarlyAccessInvoice(
      "XEA-1",
      respond({ kind: "ok", data: invoiceBody(patch) }),
    );
    expect(load.kind).toBe("unreadable");
  });

  it("separates locked, missing and broken from each other", async () => {
    expect((await loadEarlyAccessInvoice("XEA-1", respond({ kind: "unauthorized" }))).kind).toBe(
      "locked",
    );
    expect((await loadEarlyAccessInvoice("XEA-1", respond({ kind: "unavailable" }))).kind).toBe(
      "missing",
    );
    expect(
      (await loadEarlyAccessInvoice("XEA-1", respond({ kind: "error", message: "down" }))).kind,
    ).toBe("error");
    expect((await loadEarlyAccessInvoice("XEA-1", respond({ kind: "ok", data: {} }))).kind).toBe(
      "unreadable",
    );
  });

  it("keeps a null discount label rather than inventing one", async () => {
    const load = await loadEarlyAccessInvoice(
      "XEA-1",
      respond({ kind: "ok", data: invoiceBody({ discountLabel: "" }) }),
    );
    expect(load.kind).toBe("ok");
    if (load.kind === "ok") expect(load.invoice.discountLabel).toBeNull();
  });
});
