// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_OPERATIONAL_CONTROL_AREAS,
  type AdminCrmSupplierOperationsSnapshot,
  type AdminOperationsCollectionMap,
  type AdminOperationsSource,
  type AdminOperationsSourceKey,
} from "@shared/research/admin-crm-supplier-operations";
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

function available<Key extends AdminOperationsSourceKey>(
  key: Key,
  items: Array<AdminOperationsCollectionMap[Key]>,
): AdminOperationsSource<AdminOperationsCollectionMap[Key]> {
  return {
    availability: "available",
    code: null,
    message: `${key} source is available.`,
    provenance: `admin_ops.${key}`,
    checkedAt: at,
    items,
  };
}

function unavailable<Key extends AdminOperationsSourceKey>(
  key: Key,
): AdminOperationsSource<AdminOperationsCollectionMap[Key]> {
  return {
    availability: "unavailable",
    code: "source_not_configured",
    message: `${key} source is unavailable in this environment.`,
    provenance: `admin_ops.${key}`,
    checkedAt: at,
    items: null,
  };
}

const snapshot: AdminCrmSupplierOperationsSnapshot = {
  generatedAt: at,
  trustDial: "ask",
  sources: {
    buyerQueue: available("buyerQueue", [{
      buyerId: "buyer_1", displayName: "Avery Example", email: "avery@example.test", buyerType: "b2b",
      organizationId: "org_1", stage: "quote_requested", ownerLabel: "Operations", nextAction: "Confirm purchase volume", lastActivityAt: at,
    }]),
    organizations: available("organizations", [{
      organizationId: "org_1", legalName: "North Star Example LLC", accountState: "commercial_review", buyerCount: 2,
      ownerLabel: "Operations", paymentTermsLabel: "Net 15 proposed", openInvoiceCents: 125000, currency: "USD", updatedAt: at,
    }]),
    customers: available("customers", [{
      customerId: "customer_1", displayName: "Avery Example", email: "avery@example.test", organizationId: "org_1",
      accountState: "active", orderCount: 3, openInvoiceCount: 1, openExceptionCount: 0, lastOrderAt: at,
      lastContactAt: at, tags: ["wholesale", "repeat buyer"],
    }]),
    availabilityReviews: available("availabilityReviews", [{
      reviewId: "availability_1", productId: "product_1", productLabel: "Synthetic Recovery Bundle", requestedUnits: 20,
      availableUnits: null, supplierId: "supplier_1", supplierLabel: "Example Supplier", state: "awaiting_supplier", evidenceUpdatedAt: null,
    }]),
    priceReviews: available("priceReviews", [{
      reviewId: "price_1", productId: "product_1", productLabel: "Synthetic Recovery Bundle", currency: "USD",
      currentUnitCents: 12900, proposedUnitCents: 11900, sourceCostCents: 6300, state: "founder_review", requestedAt: at,
    }]),
    invoices: available("invoices", [{
      invoiceId: "invoice_1", orderId: "order_1", customerId: "customer_1", customerLabel: "Avery Example",
      invoiceNumber: "XRI-EXAMPLE-1001", amountCents: 125000, currency: "USD", invoiceState: "issued",
      paymentState: "reported", dueAt: at, updatedAt: at,
    }]),
    supplierAssignments: available("supplierAssignments", [{
      assignmentId: "assignment_1", orderId: "order_1", orderReference: "XRO-EXAMPLE-1001", supplierId: "supplier_1",
      supplierLabel: "Example Supplier", state: "proposed", lineCount: 2, targetShipAt: at, updatedAt: at,
    }]),
    fulfillment: available("fulfillment", [{
      fulfillmentId: "fulfillment_1", orderId: "order_1", orderReference: "XRO-EXAMPLE-1001", supplierLabel: "Example Supplier",
      state: "shipped", carrier: "Example Carrier", trackingNumber: "SYNTHETIC-TRACKING", lastTrackingAt: at, targetShipAt: at,
    }]),
    returnsReships: available("returnsReships", [{
      requestId: "return_1", orderId: "order_1", orderReference: "XRO-EXAMPLE-1001", requestType: "return",
      state: "reviewing", reason: "Synthetic package condition review", ownerLabel: "Operations", dueAt: at,
      nextAction: "Verify the synthetic evidence.", updatedAt: at,
    }]),
    supportCases: available("supportCases", [{
      caseId: "case_1", referenceId: "order_1", subject: "Synthetic delivery question", priority: "priority",
      state: "investigating", slaState: "due_soon", ownerLabel: "Support", dueAt: at,
      nextAction: "Review the synthetic carrier evidence.", openedAt: at, updatedAt: at,
    }]),
    reports: available("reports", [{
      reportId: "report_1", label: "Synthetic operations review", periodLabel: "Example period", state: "ready",
      exceptionCount: 1, generatedAt: at, nextAction: "Review with an authorized operator.",
    }]),
    exceptions: available("exceptions", [{
      exceptionId: "exception_1", domain: "tracking", referenceId: "fulfillment_1", title: "Synthetic carrier scan is overdue",
      severity: "high", state: "open", ownerLabel: "Operations", openedAt: at, dueAt: at,
    }]),
    controls: available("controls", ADMIN_OPERATIONAL_CONTROL_AREAS.map((area) => ({
      area,
      label: area.replaceAll("_", " "),
      state: "unknown" as const,
      summary: "Evidence is not yet connected.",
      ownerLabel: null,
      dueAt: null,
      nextAction: "Connect the authoritative evidence source.",
      evidenceUpdatedAt: null,
    }))),
    audit: available("audit", [{
      auditId: "audit_1", actorLabel: "Operations", action: "supplier_assignment", targetType: "order", targetId: "order_1",
      outcome: "approval_required", reason: "Inventory evidence needs review", occurredAt: at,
    }]),
    intake: available("intake", [{
      intakeId: "mail_1", sourceAddress: "research@xeniostechnology.com", senderAddress: "procurement@example.test",
      subject: "Synthetic wholesale quote request", category: "b2b_organization", urgency: "routine", state: "needs_human_review",
      linkedType: null, linkedId: null, receivedAt: at,
    }]),
  },
};

describe("AdminCrmSupplierOperationsWorkspace", () => {
  it("renders every operations lane and all canonical control areas", async () => {
    const { view } = await render(snapshot);
    for (const id of [
      "buyer-queue", "organizations", "customer-360", "availability", "price", "invoice-payment",
      "supplier-assignment", "fulfillment-tracking", "returns-reships", "support-cases", "operating-controls",
      "operations-reports", "exceptions", "research-intake", "audit",
    ]) {
      expect(view.querySelector(`[data-testid="section-${id}"]`), id).not.toBeNull();
    }
    for (const area of ADMIN_OPERATIONAL_CONTROL_AREAS) {
      expect(view.querySelector(`[data-testid="control-${area}"]`), area).not.toBeNull();
    }
    const body = view.textContent ?? "";
    expect(body).toContain("Avery Example");
    expect(body).toContain("North Star Example LLC");
    expect(body).toContain("XRI-EXAMPLE-1001");
    expect(body).toContain("does not replace the existing Mitch Portal");
    expect(body).not.toContain("unmounted integration slice");
  });

  it("records a supplier review request with an explicit human-review reason", async () => {
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

  it("disables every review request when the Trust Dial is never", async () => {
    const onQueue = vi.fn();
    const { view } = await render({ ...snapshot, trustDial: "never" }, onQueue);
    const buttons = Array.from(view.querySelectorAll('[data-testid^="queue-"]')) as HTMLButtonElement[];
    expect(buttons.length).toBeGreaterThan(8);
    expect(buttons.every((button) => button.disabled && button.textContent === "Disabled by Trust Dial")).toBe(true);
  });

  it("never renders unavailable evidence as zero or an empty queue", async () => {
    const changed: AdminCrmSupplierOperationsSnapshot = {
      ...snapshot,
      sources: { ...snapshot.sources, invoices: unavailable("invoices") },
    };
    const { view } = await render(changed);
    const section = view.querySelector('[data-testid="section-invoice-payment"]')!;
    expect(section.textContent).toContain("Source unavailable");
    expect(section.textContent).toContain("invoices source is unavailable");
    expect(section.textContent).not.toContain("0 items");
    expect(section.textContent).not.toContain("No records to show");
    const operationsMetric = Array.from(view.querySelectorAll('[data-testid="ra-metric"]'))
      .find((metric) => metric.textContent?.includes("Operations work"));
    expect(operationsMetric?.textContent).toContain("—");
  });

  it("labels partial evidence as visible records with an unknown total", async () => {
    const source = snapshot.sources.organizations;
    if (source.availability === "unavailable") throw new Error("fixture");
    const changed: AdminCrmSupplierOperationsSnapshot = {
      ...snapshot,
      sources: {
        ...snapshot.sources,
        organizations: {
          ...source,
          availability: "partial",
          code: "source_partial",
          message: "organizations source returned partial evidence.",
        },
      },
    };
    const { view } = await render(changed);
    const section = view.querySelector('[data-testid="section-organizations"]')!;
    expect(section.textContent).toContain("1 visible · total unknown");
    expect(section.textContent).toContain("Visible records are shown");
  });

  it("shows an authoritative empty state only for an available source", async () => {
    const changed: AdminCrmSupplierOperationsSnapshot = {
      ...snapshot,
      sources: { ...snapshot.sources, buyerQueue: available("buyerQueue", []) },
    };
    const { view } = await render(changed);
    const section = view.querySelector('[data-testid="section-buyer-queue"]')!;
    expect(section.textContent).toContain("0 items");
    expect(section.textContent).toContain("No records to show");
  });

  it("labels filtered zero as no matches without overwriting authoritative source counts", async () => {
    const { view } = await render(snapshot);
    const search = view.querySelector('input[type="search"]') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(search, "missing identity");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    for (const id of ["buyer-queue", "organizations", "customer-360"]) {
      const section = view.querySelector(`[data-testid="section-${id}"]`)!;
      expect(section.textContent).toContain("0 matches · 1 source item");
      expect(section.textContent).toContain("No matching records");
      expect(section.textContent).not.toContain("0 items");
      expect(section.textContent).not.toContain("No records to show");
    }
    expect(view.querySelector('[data-testid="section-availability"]')?.textContent).toContain("Synthetic Recovery Bundle");
  });

  it("keeps available empty sources authoritative when a nonempty filter is entered", async () => {
    const changed: AdminCrmSupplierOperationsSnapshot = {
      ...snapshot,
      sources: {
        ...snapshot.sources,
        buyerQueue: available("buyerQueue", []),
        organizations: available("organizations", []),
        customers: available("customers", []),
      },
    };
    const { view } = await render(changed);
    const search = view.querySelector('input[type="search"]') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(search, "missing identity");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    for (const id of ["buyer-queue", "organizations", "customer-360"]) {
      const section = view.querySelector(`[data-testid="section-${id}"]`)!;
      expect(section.textContent).toContain("0 items");
      expect(section.textContent).toContain("No records to show");
      expect(section.textContent).not.toContain("0 matches");
      expect(section.textContent).not.toContain("No matching records");
      expect(section.textContent).not.toContain("Clear or change it to see the source rows");
    }
  });

  it("keeps a filtered partial-source zero explicitly non-authoritative", async () => {
    const source = snapshot.sources.organizations;
    if (source.availability === "unavailable") throw new Error("fixture");
    const changed: AdminCrmSupplierOperationsSnapshot = {
      ...snapshot,
      sources: {
        ...snapshot.sources,
        organizations: {
          ...source,
          availability: "partial",
          code: "source_partial",
          message: "organizations source returned partial evidence.",
        },
      },
    };
    const { view } = await render(changed);
    const search = view.querySelector('input[type="search"]') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(search, "missing identity");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const section = view.querySelector('[data-testid="section-organizations"]')!;
    expect(section.textContent).toContain("0 visible matches · 1 visible source row · total unknown");
    expect(section.textContent).toContain("No visible records match this filter");
    expect(section.textContent).toContain("authoritative total remains unknown");
    expect(section.textContent).not.toContain("0 items");
  });
});
