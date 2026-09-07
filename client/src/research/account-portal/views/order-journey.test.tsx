// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CustomerOrdersDto, OrderSummaryDto } from "@shared/research/customer-account/contract";
import { FIXTURE_CUSTOMER_ORDERS } from "@shared/research/customer-account/fixtures";
import { AccountOrderDetailView } from "./OrderDetailView";

const row = (patch: Partial<OrderSummaryDto> = {}): OrderSummaryDto => ({
  reference: "XRR-SYNTHETIC-1", recordKind: "request", placedAt: "2026-09-07T00:00:00Z", detailAvailability: "available",
  itemLabel: "Synthetic private item", variantLabel: "Synthetic variant", quantity: 2, paymentState: "paid", fulfillmentState: "processing",
  trackingUrl: null, lotCoaAvailable: false, ...patch,
});
const data = (research: readonly OrderSummaryDto[] = [row()]): CustomerOrdersDto => ({ ...FIXTURE_CUSTOMER_ORDERS, research });
function render(value = data(), reference = "XRR-SYNTHETIC-1") {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(<AccountOrderDetailView data={value} reference={reference} />);
  return host;
}

describe("account detail fulfillment review surface", () => {
  it("shows separate server facts and a static support path without any payment or fulfillment mutation", () => {
    const fetcher = vi.spyOn(globalThis, "fetch");
    const host = render();
    expect(host.textContent).toContain("Member-scoped request");
    expect(host.textContent).toContain("Payment is recorded. It does not establish shipment");
    expect(host.textContent).toContain("Processing does not confirm dispatch or delivery");
    expect(host.textContent).toContain("Opening support does not create a payment, shipment, refund, or Care request");
    expect(host.querySelector('a[href="/research/account/support"]')).not.toBeNull();
    expect(host.querySelector("form,button,input")).toBeNull(); expect(fetcher).not.toHaveBeenCalled();
    expect(host.innerHTML).not.toMatch(/href="[^"]*(email=|token=|reference=)/);
    fetcher.mockRestore();
  });

  it("never displays either duplicate exact record or its tracking/doc actions", () => {
    const host = render(data([row({ lotCoaAvailable: true }), row({ itemLabel: "Other private item" })]));
    expect(host.textContent).toContain("ambiguous");
    expect(host.textContent).toContain("No record was selected");
    expect(host.textContent).not.toMatch(/Synthetic private item|Other private item|Payment: Paid/);
    expect(host.querySelector('a[href="/research/account/documents"]')).toBeNull();
  });

  it("a malformed record produces an unavailable state rather than a crash or guessed actions", () => {
    const host = render(data([{ ...row(), lotCoaAvailable: "yes" } as unknown as OrderSummaryDto]));
    expect(host.textContent).toContain("could not be read safely");
    expect(host.textContent).not.toContain("Synthetic private item");
    expect(host.querySelector('a[href="/research/account/documents"]')).toBeNull();
  });

  it("a missing record from partial history is not definitively absent", () => {
    const host = render(data(), "MISSING");
    expect(host.textContent).toContain("not a definitive not-found result");
    expect(host.textContent).not.toContain("No commerce record with this exact reference is attached");
  });

  it.each(["unknown", "processing", "exception", "cancelled"] as const)("withholds tracking despite a URL for %s, preserving payment uncertainty", fulfillmentState => {
    const host = render(data([row({ fulfillmentState, paymentState: "unknown", trackingUrl: "https://carrier.fixture.invalid/private" })]));
    expect(host.textContent).toContain("Payment status is unavailable");
    expect(host.textContent).toContain("A shipment tracking action is not available");
    expect(host.querySelector('a[target="_blank"]')).toBeNull();
    expect(host.innerHTML).not.toContain("carrier.fixture.invalid");
  });

  it("uses recorded shipment tracking without inventing a payment or ETA", () => {
    const host = render(data([row({ fulfillmentState: "shipped", paymentState: "unknown", trackingUrl: "https://carrier.fixture.invalid/track/1" })]));
    const tracking = host.querySelector('a[href="https://carrier.fixture.invalid/track/1"]');
    expect(tracking?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(tracking?.getAttribute("target")).toBe("_blank");
    expect(host.textContent).toContain("does not establish a delivery date");
    expect(host.textContent).toContain("Payment status is unavailable");
  });

  it("unavailable detail does not reveal supplied stale line labels or invent quantity", () => {
    const host = render(data([row({ detailAvailability: "unavailable" })]));
    expect(host.textContent).not.toContain("Synthetic private item");
    expect(host.textContent).not.toContain("Synthetic variant");
    expect(host.textContent).toContain("Commerce-record detail unavailable");
  });

  it("unknown record kind stays generic even with an XRR prefix and escaped label text", () => {
    const host = render(data([row({ recordKind: "unknown", itemLabel: "<script>synthetic</script>" })]));
    expect(host.textContent).toContain("Member-scoped commerce record");
    expect(host.querySelector("script")).toBeNull();
    expect(host.textContent).not.toContain("Member-scoped request");
  });
});
