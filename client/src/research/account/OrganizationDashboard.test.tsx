// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { OrganizationDashboardDto } from "@shared/research/account-identity";
import { OrganizationDashboardView } from "./OrganizationDashboard";

vi.mock("./api", () => ({
  updateBusinessProfile: vi.fn(),
  inviteOrganizationUser: vi.fn(),
  requestOrderAgain: vi.fn(),
  getOrganizationDashboard: vi.fn(),
}));

const data: OrganizationDashboardDto = {
  organization: {
    id: "e26bc7de-86df-4e70-8e82-964e3671d71c",
    slug: "roman-digital",
    legalName: "Roman Digital",
    displayName: "Roman Digital",
    status: "active",
    roles: ["organization_owner", "business_buyer"],
    passwordChangeRequired: false,
  },
  profile: {
    legalName: "Roman Digital",
    displayName: "Roman Digital",
    purchasingEmail: "info@romanhealthcollective.com",
    billingEmail: "billing@romandigital.io",
    phone: null,
    taxIdLast4: null,
    purchaseOrderRequired: false,
    billingAddress: null,
    shippingAddress: null,
  },
  users: [{
    membershipId: "member-1",
    email: "info@romanhealthcollective.com",
    roles: ["organization_owner", "business_buyer"],
    state: "active",
    boundAt: "2026-08-12T12:00:00.000Z",
  }],
  orders: [{
    ownership: { organizationId: "e26bc7de-86df-4e70-8e82-964e3671d71c", basis: "verified_customer_claim" },
    source: "early_access_placement",
    sourceOrderId: "placement-1",
    orderNumber: "XEA-0001",
    state: "delivered",
    placedAt: "2026-08-01T12:00:00.000Z",
    totalCents: 12500,
    currency: "usd",
    lines: [{ sku: "ROMAN-1", displayName: "Roman Digital research order", quantity: 2, lineTotalCents: 12500 }],
    invoice: { invoiceNumber: "XEI-0001", status: "paid", issuedAt: "2026-08-01T12:00:00.000Z", totalCents: 12500, currency: "usd" },
    payments: [{ status: "settled", amountCents: 12500, currency: "usd", recordedAt: "2026-08-01T12:01:00.000Z", referenceLabel: "Payment recorded" }],
    tracking: [{ carrier: "UPS", trackingNumber: "1Z999", status: "delivered", updatedAt: "2026-08-04T12:00:00.000Z" }],
    canRequestAgain: true,
  }],
  requests: [{
    requestId: "request-1",
    organizationId: "e26bc7de-86df-4e70-8e82-964e3671d71c",
    source: "early_access_placement",
    sourceOrderId: "placement-1",
    state: "reviewing",
    requestedAt: "2026-08-10T12:00:00.000Z",
    note: "Same quantities",
  }],
  openRequestAgainCount: 0,
};

describe("organization buyer dashboard", () => {
  it("shows business, billing/shipping, team, order, invoice, tracking, and request-again surfaces", async () => {
    const reactEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    reactEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    const memory = memoryLocation({ path: "/research/account/organizations/e26bc7de-86df-4e70-8e82-964e3671d71c", static: true });
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(<Router hook={memory.hook}><OrganizationDashboardView data={data} onProfileSaved={() => undefined} /></Router>));
    const html = container.innerHTML;
    for (const expected of [
      "Business profile",
      "Billing address",
      "Shipping address",
      "Orders and invoices",
      "XEA-0001",
      "XEI-0001",
      "Payments",
      "Payment recorded",
      "1Z999",
      "Request again",
      "Requests and reorders",
      "Same quantities",
      "Organization users",
      "info@romanhealthcollective.com",
      "Add a user",
    ]) expect(html).toContain(expected);
    await act(async () => root.unmount());
    delete reactEnvironment.IS_REACT_ACT_ENVIRONMENT;
  });
});
