// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminCrmSupplierOperationsSnapshot } from "@shared/research/admin-crm-supplier-operations";
import { AdminCrmSupplierOperationsWorkspace } from "./CrmSupplierOperations";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

async function render(snapshot: AdminCrmSupplierOperationsSnapshot, onQueue = vi.fn()) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(<AdminCrmSupplierOperationsWorkspace snapshot={snapshot} onQueue={onQueue} />));
  return { view: container, onQueue };
}

const at = "2026-08-12T12:00:00.000Z";

const snapshot: AdminCrmSupplierOperationsSnapshot = {
  generatedAt: at,
  trustDial: "ask",
  buyerQueue: [{
    buyerId: "buyer_1", displayName: "Avery Buyer", email: "avery@example.com", buyerType: "b2b",
    organizationId: "org_1", stage: "quote_requested", ownerLabel: "Samuel", nextAction: "Confirm purchase volume", lastActivityAt: at,
  }],
  organizations: [{
    organizationId: "org_1", legalName: "North Star Performance LLC", accountState: "commercial_review", buyerCount: 2,
    ownerLabel: "Samuel", paymentTermsLabel: "Net 15 proposed", openInvoiceCents: 125000, currency: "USD", updatedAt: at,
  }],
  customers: [{
    customerId: "customer_1", displayName: "Avery Buyer", email: "avery@example.com", organizationId: "org_1",
    accountState: "active", orderCount: 3, openInvoiceCount: 1, openExceptionCount: 0, lastOrderAt: at,
    lastContactAt: at, tags: ["wholesale", "repeat buyer"],
  }],
  availabilityReviews: [{
    reviewId: "availability_1", productId: "product_1", productLabel: "Recovery Bundle", requestedUnits: 20,
    availableUnits: null, supplierId: "supplier_1", supplierLabel: "Verified Supplier", state: "awaiting_supplier", evidenceUpdatedAt: null,
  }],
  priceReviews: [{
    reviewId: "price_1", productId: "product_1", productLabel: "Recovery Bundle", currency: "USD",
    currentUnitCents: 12900, proposedUnitCents: 11900, sourceCostCents: 6300, state: "founder_review", requestedAt: at,
  }],
  invoices: [{
    invoiceId: "invoice_1", orderId: "order_1", customerId: "customer_1", customerLabel: "Avery Buyer",
    invoiceNumber: "XRI-1001", amountCents: 125000, currency: "USD", invoiceState: "issued",
    paymentState: "reported", dueAt: at, updatedAt: at,
  }],
  supplierAssignments: [{
    assignmentId: "assignment_1", orderId: "order_1", orderReference: "XRO-1001", supplierId: "supplier_1",
    supplierLabel: "Verified Supplier", state: "proposed", lineCount: 2, targetShipAt: at, updatedAt: at,
  }],
  fulfillment: [{
    fulfillmentId: "fulfillment_1", orderId: "order_1", orderReference: "XRO-1001", supplierLabel: "Verified Supplier",
    state: "shipped", carrier: "UPS", trackingNumber: "1ZTEST", lastTrackingAt: at, targetShipAt: at,
  }],
  exceptions: [{
    exceptionId: "exception_1", domain: "tracking", referenceId: "fulfillment_1", title: "Carrier scan is overdue",
    severity: "high", state: "open", ownerLabel: "Operations", openedAt: at, dueAt: at,
  }],
  audit: [{
    auditId: "audit_1", actorLabel: "Samuel", action: "supplier_assignment", targetType: "order", targetId: "order_1",
    outcome: "approval_required", reason: "Inventory evidence needs review", occurredAt: at,
  }],
  intake: [{
    intakeId: "mail_1", sourceAddress: "research@xeniostechnology.com", senderAddress: "procurement@example.com",
    subject: "Need a wholesale quote", category: "b2b_organization", urgency: "routine", state: "needs_human_review",
    linkedType: null, linkedId: null, receivedAt: at,
  }],
};

describe("AdminCrmSupplierOperationsWorkspace", () => {
  it("renders every Pack 05 lane without rebuilding the existing command center or supplier portal", async () => {
    const { view } = await render(snapshot);
    for (const id of [
      "buyer-queue", "organizations", "customer-360", "availability", "price", "invoice-payment",
      "supplier-assignment", "fulfillment-tracking", "exceptions", "research-intake", "audit",
    ]) {
      expect(view.querySelector(`[data-testid="section-${id}"]`), id).not.toBeNull();
    }
    const body = view.textContent ?? "";
    expect(body).toContain("Avery Buyer");
    expect(body).toContain("North Star Performance LLC");
    expect(body).toContain("XRI-1001");
    expect(body).toContain("research@ intake bridge");
    expect(body).toContain("does not replace the existing Mitch Portal");
    expect(body).not.toContain("Operations Command Center");
  });

  it("queues a supplier assignment with an explicit human-review reason", async () => {
    const onQueue = vi.fn();
    const { view } = await render(snapshot, onQueue);
    const button = view.querySelector('[data-testid="queue-supplier_assignment-assignment_1"]') as HTMLButtonElement;
    await act(async () => button.click());
    expect(onQueue).toHaveBeenCalledWith(
      "supplier_assignment",
      "supplier_assignment",
      "assignment_1",
      expect.stringContaining("Human approval"),
    );
  });

  it("disables every consequential action when the Trust Dial is never", async () => {
    const onQueue = vi.fn();
    const { view } = await render({ ...snapshot, trustDial: "never" }, onQueue);
    const buttons = Array.from(view.querySelectorAll('[data-testid^="queue-"]')) as HTMLButtonElement[];
    expect(buttons.length).toBeGreaterThan(8);
    expect(buttons.every((button) => button.disabled && button.textContent === "Disabled by Trust Dial")).toBe(true);
  });

  it("filters buyer, organization, and customer records without changing operational queues", async () => {
    const { view } = await render(snapshot);
    const search = view.querySelector('input[type="search"]') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(search, "missing identity");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(view.querySelector('[data-testid="section-buyer-queue"]')?.textContent).toContain("Nothing is waiting");
    expect(view.querySelector('[data-testid="section-organizations"]')?.textContent).toContain("Nothing is waiting");
    expect(view.querySelector('[data-testid="section-customer-360"]')?.textContent).toContain("Nothing is waiting");
    expect(view.querySelector('[data-testid="section-availability"]')?.textContent).toContain("Recovery Bundle");
  });
});
