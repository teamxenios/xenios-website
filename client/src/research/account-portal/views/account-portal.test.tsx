// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FIXTURE_ACCOUNT_OVERVIEW,
  FIXTURE_CARE_ENROLLED,
  FIXTURE_CARE_UNAVAILABLE,
  FIXTURE_CUSTOMER_ORDERS,
  FIXTURE_DOCUMENTS,
  FIXTURE_MEMBERSHIP_MANUAL,
  FIXTURE_MEMBERSHIP_NONE,
  FIXTURE_SUPPORT_CASES,
} from "@shared/research/customer-account/fixtures";
import {
  ORDER_HISTORY_SOURCE_LABELS,
  type CareEnrollmentDto,
  type CarePharmacyHistoryAvailabilityDto,
  type CustomerAccountResult,
  type CustomerOrdersDto,
  type MembershipDto,
} from "@shared/research/customer-account/contract";
import { AccountPortalShell } from "../AccountPortalShell";
import {
  AccountResourceBoundary,
  accountDeniedSignInHref,
  useAccountResource,
} from "../resource";
import { AccountCareView } from "./CareView";
import { AccountDocumentsView } from "./DocumentsView";
import { AccountOrdersView } from "./OrdersView";
import { AccountOverviewView } from "./OverviewView";
import { AccountSubscriptionView } from "./SubscriptionView";
import { AccountSupportView } from "./SupportView";

const mounted: Root[] = [];

async function render(element: ReactElement, path = "/research/account") {
  const reactEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  reactEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  const root = createRoot(container);
  mounted.push(root);
  const memory = memoryLocation({ path, static: true });
  await act(async () => root.render(<Router hook={memory.hook}>{element}</Router>));
  return container;
}

async function enterValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  await act(async () => {
    setter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function ordersWithCareHistory(
  carePharmacyHistory: CarePharmacyHistoryAvailabilityDto,
  carePharmacy = FIXTURE_CUSTOMER_ORDERS.carePharmacy,
): CustomerOrdersDto {
  return {
    ...FIXTURE_CUSTOMER_ORDERS,
    carePharmacy,
    carePharmacyHistory,
  };
}

afterEach(async () => {
  while (mounted.length) {
    const root = mounted.pop();
    if (root) await act(async () => root.unmount());
  }
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe("customer account portal views", () => {
  it("renders the account overview while withholding staff attribution", async () => {
    const data = {
      ...FIXTURE_ACCOUNT_OVERVIEW,
      partnerAttribution: { sourcePartner: "internal_partner_fixture", relationshipOwner: "Internal Owner Fixture" },
    } as const;
    const container = await render(<AccountOverviewView data={data} />);
    expect(container.textContent).toContain("Xenios membership");
    expect(container.textContent).toContain("Care enrollment");
    expect(container.textContent).toContain("Research commerce history");
    expect(container.textContent).toContain("does not guarantee treatment");
    expect(container.textContent).not.toContain("internal_partner_fixture");
    expect(container.textContent).not.toContain("Internal Owner Fixture");
  });

  it("never renders a green all-clear or a counted zero over incomplete sources", async () => {
    const data = {
      ...FIXTURE_ACCOUNT_OVERVIEW,
      accountStanding: "indeterminate" as const,
      nextAdministrativeAction: null,
      researchOrders: [],
    };
    const container = await render(<AccountOverviewView data={data} />);
    expect(container.textContent).toContain("some account information is currently unavailable");
    expect(container.textContent).not.toContain("up to date");
    expect(container.textContent).toContain("Status unavailable");
    // The open-orders count is unknown over a partial history, never 0.
    expect(container.textContent).toContain("count unavailable — commerce history incomplete");
    expect(container.textContent).toContain("Some commerce history is currently unavailable.");
    expect(container.textContent).toContain(ORDER_HISTORY_SOURCE_LABELS.xec);
    expect(container.textContent).toContain(ORDER_HISTORY_SOURCE_LABELS.xrr);
    expect(container.textContent).not.toContain("No Research commerce records are attached");
    expect(container.textContent).toContain("Commerce history is currently unavailable or incomplete");
  });

  it("declares a provable all-clear only for a current standing over complete history", async () => {
    const data = {
      ...FIXTURE_ACCOUNT_OVERVIEW,
      accountStanding: "current" as const,
      nextAdministrativeAction: null,
      orderHistory: {
        availability: "complete" as const,
        authoritativeRecordCount: 2,
        sources: {
          commerce: { connected: true, complete: true },
          xea: { connected: true, complete: true },
          xec: { connected: true, complete: true },
          xrr: { connected: true, complete: true },
        },
      },
    };
    const container = await render(<AccountOverviewView data={data} />);
    expect(container.textContent).toContain("Your account is up to date.");
    expect(container.textContent).not.toContain("count unavailable");
    expect(container.textContent).not.toContain("Some commerce history is currently unavailable.");
  });

  it("does not contradict a positive authoritative count when overview rows are absent", async () => {
    const data = {
      ...FIXTURE_ACCOUNT_OVERVIEW,
      researchOrders: [],
      orderHistory: {
        availability: "complete" as const,
        authoritativeRecordCount: 2,
        sources: {
          commerce: { connected: true, complete: true },
          xea: { connected: true, complete: true },
          xec: { connected: true, complete: true },
          xrr: { connected: true, complete: true },
        },
      },
    };
    const container = await render(<AccountOverviewView data={data} />);
    expect(container.textContent).toContain("authoritative source reports commerce records");
    expect(container.textContent).not.toContain("No Research commerce records are attached");
  });

  it("renders Care status unavailable, never not-enrolled, from an unavailable Care source", async () => {
    const data = { ...FIXTURE_ACCOUNT_OVERVIEW, careEnrollment: FIXTURE_CARE_UNAVAILABLE };
    const container = await render(<AccountOverviewView data={data} />);
    expect(container.textContent).toContain("Care status is managed through the provider/Tebra workflow.");
    expect(container.textContent).not.toContain("Not enrolled");
  });

  it("renders saved-interest vocabulary without inventing pharmacy or catalog lanes", async () => {
    const data = {
      ...FIXTURE_ACCOUNT_OVERVIEW,
      productInterests: [
        {
          interestKey: "pending-synthetic",
          displayLabel: "Pending synthetic interest",
          availability: "pending_activation" as const,
          recordedAt: "2026-08-20T00:00:00.000Z",
        },
        {
          interestKey: "unavailable-synthetic",
          displayLabel: "Unavailable synthetic interest",
          availability: "unavailable" as const,
          recordedAt: "2026-08-20T00:00:00.000Z",
        },
      ],
    };
    const container = await render(<AccountOverviewView data={data} />);
    expect(container.textContent).toContain("Pending activation");
    expect(container.textContent).toContain("Unavailable synthetic interest");
    expect(container.textContent).not.toContain("Pharmacy activation pending");
    expect(container.textContent).not.toContain("Request-only / Pending activation");
  });

  it("does not infer a Care stage for an enrolled overview with no recorded stage", async () => {
    const careEnrollment = {
      sourceState: "available" as const,
      enrolled: true,
      status: { stage: null, neutralSummary: null, updatedAt: null },
      pharmacyState: "none" as const,
    };
    const container = await render(
      <AccountOverviewView data={{ ...FIXTURE_ACCOUNT_OVERVIEW, careEnrollment }} />,
    );
    expect(container.textContent).toContain("No stage recorded");
    expect(container.textContent).not.toContain("Not started");
  });

  it("separates Research commerce records from Care and pharmacy fulfillment", async () => {
    const container = await render(<AccountOrdersView data={FIXTURE_CUSTOMER_ORDERS} />, "/research/account/orders");
    expect(container.textContent).toContain("Research commerce history");
    expect(container.textContent).toContain("Care / pharmacy");
    expect(container.textContent).toContain("Provider review");
    const tracking = container.querySelector('a[href^="https://tracking.invalid"]');
    expect(tracking?.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("names the disconnected sources behind a partial order history", async () => {
    const container = await render(<AccountOrdersView data={FIXTURE_CUSTOMER_ORDERS} />, "/research/account/orders");
    expect(container.textContent).toContain("Some commerce history is currently unavailable.");
    expect(container.textContent).toContain("Partial history · total unavailable");
    expect(container.textContent).not.toContain("2 records");
    expect(container.textContent).toContain(ORDER_HISTORY_SOURCE_LABELS.xec);
    expect(container.textContent).toContain(ORDER_HISTORY_SOURCE_LABELS.xrr);
    expect(container.textContent).not.toContain(ORDER_HISTORY_SOURCE_LABELS.commerce);
  });

  it("renders an authoritative empty Research history as numeric zero", async () => {
    const completeEmpty = {
      ...FIXTURE_CUSTOMER_ORDERS,
      research: [],
      history: {
        availability: "complete" as const,
        authoritativeRecordCount: 0,
        sources: {
          commerce: { connected: true, complete: true },
          xea: { connected: true, complete: true },
          xec: { connected: true, complete: true },
          xrr: { connected: true, complete: true },
        },
      },
    };
    const container = await render(<AccountOrdersView data={completeEmpty} />);
    const researchSection = container.querySelector("#research-orders-heading")?.closest("section");
    expect(researchSection?.textContent).toContain("0 records");
    expect(researchSection?.textContent).toContain("No Research commerce records are attached");
    expect(researchSection?.textContent).not.toContain("count unavailable");
  });

  it("does not call an unavailable Research history empty or numeric zero", async () => {
    const unavailable = {
      ...FIXTURE_CUSTOMER_ORDERS,
      research: [],
      history: {
        availability: "unavailable" as const,
        authoritativeRecordCount: null,
        sources: {
          commerce: { connected: false, complete: false },
          xea: { connected: false, complete: false },
          xec: { connected: false, complete: false },
          xrr: { connected: false, complete: false },
        },
      },
    };
    const container = await render(<AccountOrdersView data={unavailable} />);
    expect(container.textContent).toContain("History unavailable");
    expect(container.textContent).not.toContain("0 records");
    expect(container.textContent).not.toContain("No Research commerce records are attached");
  });

  it("does not contradict a positive authoritative count when rows are absent", async () => {
    const completeWithoutRows = {
      ...FIXTURE_CUSTOMER_ORDERS,
      research: [],
      history: {
        availability: "complete" as const,
        authoritativeRecordCount: 2,
        sources: {
          commerce: { connected: true, complete: true },
          xea: { connected: true, complete: true },
          xec: { connected: true, complete: true },
          xrr: { connected: true, complete: true },
        },
      },
    };
    const container = await render(<AccountOrdersView data={completeWithoutRows} />);
    expect(container.textContent).toContain("2 records");
    expect(container.textContent).toContain("authoritative source reports commerce records");
    expect(container.textContent).not.toContain("No Research commerce records are attached");
  });

  it("renders an authoritative empty Care/pharmacy history as numeric zero", async () => {
    const container = await render(
      <AccountOrdersView data={ordersWithCareHistory(
        { availability: "available", authoritativeRecordCount: 0 },
        [],
      )} />,
      "/research/account/orders",
    );
    const careSection = container.querySelector("#care-fulfillment-heading")?.closest("section");
    expect(careSection?.querySelector('[data-testid="ra-badge"]')?.textContent).toBe("0 records");
    expect(careSection?.textContent).toContain("0 records");
    expect(careSection?.textContent).toContain("No Care or pharmacy fulfillment records are attached");
    expect(careSection?.textContent).not.toContain("total unavailable");
    expect(careSection?.textContent).not.toContain("cannot report a definitive zero");
  });

  it("renders known Care/pharmacy rows as partial without inventing a total", async () => {
    const container = await render(
      <AccountOrdersView data={ordersWithCareHistory({
        availability: "partial",
        authoritativeRecordCount: null,
      })} />,
      "/research/account/orders",
    );
    const careSection = container.querySelector("#care-fulfillment-heading")?.closest("section");
    expect(careSection?.querySelector('[data-testid="ra-badge"]')?.textContent)
      .toBe("Partial history · total unavailable");
    expect(careSection?.textContent).toContain("Partial history · total unavailable");
    expect(careSection?.textContent).toContain("Care fulfillment record");
    expect(careSection?.textContent).toContain("known records only");
    expect(careSection?.textContent).not.toMatch(/\b1 records?\b/);
  });

  it("does not turn an unavailable Care-history source into a definitive zero", async () => {
    const container = await render(
      <AccountOrdersView data={ordersWithCareHistory(
        { availability: "unavailable", authoritativeRecordCount: null },
        [],
      )} />,
      "/research/account/orders",
    );
    const careSection = container.querySelector("#care-fulfillment-heading")?.closest("section");
    expect(careSection?.querySelector('[data-testid="ra-badge"]')?.textContent).toBe("History unavailable");
    expect(careSection?.textContent).toContain("History unavailable");
    expect(careSection?.textContent).toContain("provider/Tebra workflow");
    expect(careSection?.textContent).toContain("cannot report a definitive zero");
    expect(careSection?.textContent).not.toContain("0 records");
    expect(careSection?.textContent).not.toContain("No Care or pharmacy fulfillment records");
  });

  it("keeps an authoritative Care count distinct from a partial row projection", async () => {
    const container = await render(
      <AccountOrdersView data={ordersWithCareHistory({
        availability: "available",
        authoritativeRecordCount: 2,
      })} />,
      "/research/account/orders",
    );
    const careSection = container.querySelector("#care-fulfillment-heading")?.closest("section");
    expect(careSection?.querySelector('[data-testid="ra-badge"]')?.textContent).toBe("2 records");
    expect(careSection?.textContent).toContain("2 records");
    expect(careSection?.textContent).toContain("does not match the authoritative source count");
    expect(careSection?.textContent).not.toContain("1 record");
  });

  it("renders detail-unavailable commerce records without a fabricated label or quantity", async () => {
    const detailUnavailable = {
      ...FIXTURE_CUSTOMER_ORDERS.research[0],
      detailAvailability: "unavailable" as const,
      itemLabel: null,
      variantLabel: null,
      quantity: 7,
    };
    const container = await render(
      <AccountOrdersView data={{ ...FIXTURE_CUSTOMER_ORDERS, research: [detailUnavailable] }} />,
      "/research/account/orders",
    );
    expect(container.textContent).toContain("Commerce-record details unavailable");
    expect(container.textContent).not.toContain("Qty 0");
    expect(container.textContent).not.toContain("Qty 7");
    expect(container.textContent).not.toContain("Variant recorded with order");
    const quantityRow = Array.from(container.querySelectorAll(".account-data-label"))
      .find((label) => label.textContent === "Quantity")?.parentElement;
    expect(quantityRow?.textContent).toContain("Not available");
    expect(quantityRow?.textContent).not.toContain("7");
  });

  it("renders manual membership billing separately from Care enrollment", async () => {
    const container = await render(
      <AccountSubscriptionView data={{
        subscription: { membership: FIXTURE_MEMBERSHIP_MANUAL, careEnrollment: FIXTURE_CARE_ENROLLED },
        billingDocuments: FIXTURE_DOCUMENTS.filter((document) => document.kind === "receipt"),
      }} />,
      "/research/account/subscription",
    );
    expect(container.textContent).toContain("Manual / offline");
    expect(container.textContent).toContain("Care enrollment is not a medication subscription");
    expect(container.querySelector('a[href="/research/account/support"]')).not.toBeNull();
  });

  it("treats a legacy renewal timestamp as compatibility-only evidence", async () => {
    // @ts-expect-error Intentionally exercise a pre-contract runtime payload.
    const legacyMembership: MembershipDto = {
      state: FIXTURE_MEMBERSHIP_MANUAL.state,
      billing: FIXTURE_MEMBERSHIP_MANUAL.billing,
      planLabel: FIXTURE_MEMBERSHIP_MANUAL.planLabel,
      nextRenewalAt: "2030-01-01",
      manageUrl: FIXTURE_MEMBERSHIP_MANUAL.manageUrl,
      manualBilling: FIXTURE_MEMBERSHIP_MANUAL.manualBilling,
    };
    const container = await render(
      <AccountSubscriptionView data={{
        subscription: {
          membership: legacyMembership,
          careEnrollment: FIXTURE_CARE_ENROLLED,
        },
        billingDocuments: [],
      }} />,
      "/research/account/subscription",
    );
    expect(container.textContent).toContain("Renewal schedule unavailable");
    expect(container.textContent).not.toContain("No renewal is scheduled");
    expect(container.textContent).not.toContain("Not scheduled");
  });

  it("distinguishes unavailable receipt history from a proven empty history", async () => {
    const unavailable = await render(
      <AccountSubscriptionView data={{
        subscription: { membership: FIXTURE_MEMBERSHIP_MANUAL, careEnrollment: FIXTURE_CARE_ENROLLED },
        billingDocuments: null,
      }} />,
      "/research/account/subscription",
    );
    expect(unavailable.textContent).toContain("Billing-document history is currently unavailable");
    expect(unavailable.textContent).not.toContain("No membership receipts");
  });

  it("renders an authoritative no-membership state without inventing a billing pathway", async () => {
    const subscription = await render(
      <AccountSubscriptionView data={{
        subscription: { membership: FIXTURE_MEMBERSHIP_NONE, careEnrollment: FIXTURE_CARE_ENROLLED },
        billingDocuments: [],
      }} />,
      "/research/account/subscription",
    );
    expect(subscription.textContent).toContain("No active membership");
    expect(subscription.textContent).toContain("No billing method");
    expect(subscription.textContent).not.toContain("Membership data unavailable");
    expect(subscription.textContent).not.toContain("Manual / offline");

    const overview = await render(
      <AccountOverviewView data={{ ...FIXTURE_ACCOUNT_OVERVIEW, membership: FIXTURE_MEMBERSHIP_NONE }} />,
    );
    expect(overview.textContent).toContain("No billing relationship");
    expect(overview.textContent).not.toContain("Manual / offline");
  });

  it("renders billing-none independently from active membership access", async () => {
    const activeWithoutBilling = {
      ...FIXTURE_MEMBERSHIP_MANUAL,
      state: "active" as const,
      billing: "none" as const,
      manualBilling: true,
      manageUrl: "https://billing.stripe.com/p/synthetic-session",
    };
    const subscription = await render(
      <AccountSubscriptionView data={{
        subscription: { membership: activeWithoutBilling, careEnrollment: FIXTURE_CARE_ENROLLED },
        billingDocuments: [],
      }} />,
      "/research/account/subscription",
    );
    expect(subscription.textContent).toContain("No billing method");
    expect(subscription.textContent).not.toContain("Manual / offline");
    expect(subscription.querySelector('a[href^="https://billing.stripe.com/"]')).toBeNull();

    const overview = await render(
      <AccountOverviewView data={{ ...FIXTURE_ACCOUNT_OVERVIEW, membership: activeWithoutBilling }} />,
    );
    expect(overview.textContent).toContain("No billing relationship");
    expect(overview.textContent).not.toContain("Manual / offline");
    expect(overview.querySelector('a[href^="https://billing.stripe.com/"]')).toBeNull();
  });

  it("keeps billing management available when billing evidence outlives access", async () => {
    const endedAccessWithBilling = {
      ...FIXTURE_MEMBERSHIP_NONE,
      billing: "past_due" as const,
      manualBilling: false,
      manageUrl: "https://billing.stripe.com/p/synthetic-session",
    };
    const subscription = await render(
      <AccountSubscriptionView data={{
        subscription: { membership: endedAccessWithBilling, careEnrollment: FIXTURE_CARE_ENROLLED },
        billingDocuments: [],
      }} />,
      "/research/account/subscription",
    );
    expect(subscription.querySelector('a[href="https://billing.stripe.com/p/synthetic-session"]')?.textContent)
      .toContain("Open billing management");

    const overview = await render(
      <AccountOverviewView data={{ ...FIXTURE_ACCOUNT_OVERVIEW, membership: endedAccessWithBilling }} />,
    );
    expect(overview.querySelector('a[href="https://billing.stripe.com/p/synthetic-session"]')?.textContent)
      .toContain("Open billing management");
  });

  it("renders disputed billing through the canonical presentation, never as current", async () => {
    const container = await render(
      <AccountSubscriptionView data={{
        subscription: { membership: { ...FIXTURE_MEMBERSHIP_MANUAL, billing: "disputed" }, careEnrollment: FIXTURE_CARE_ENROLLED },
        billingDocuments: [],
      }} />,
      "/research/account/subscription",
    );
    expect(container.textContent).toContain("Disputed — attention required");
    expect(container.textContent).not.toContain("Current");
    const badge = Array.from(container.querySelectorAll(".ra-badge")).find(
      (element) => element.textContent?.includes("Disputed"),
    );
    expect(badge?.className).toContain("ra-badge-danger");
  });

  it("renders an unrecognized billing value as neutral unavailable, never green", async () => {
    const membership = {
      ...FIXTURE_MEMBERSHIP_MANUAL,
      billing: "future_wire_state" as (typeof FIXTURE_MEMBERSHIP_MANUAL)["billing"],
    };
    const container = await render(
      <AccountSubscriptionView data={{
        subscription: { membership, careEnrollment: FIXTURE_CARE_ENROLLED },
        billingDocuments: [],
      }} />,
      "/research/account/subscription",
    );
    expect(container.textContent).toContain("Billing status unavailable");
    expect(container.textContent).not.toContain("Current");
    const badge = Array.from(container.querySelectorAll(".ra-badge")).find(
      (element) => element.textContent?.includes("Billing"),
    );
    expect(badge?.className).toContain("ra-badge-neutral");
  });

  it("a subscription payload without a Care source renders no enrollment claim", async () => {
    const container = await render(
      <AccountSubscriptionView data={{
        subscription: { membership: FIXTURE_MEMBERSHIP_MANUAL, careEnrollment: FIXTURE_CARE_UNAVAILABLE },
        billingDocuments: [],
      }} />,
      "/research/account/subscription",
    );
    expect(container.textContent).toContain("Care status is managed through the provider/Tebra workflow.");
    expect(container.textContent).not.toContain("Not enrolled");
    expect(container.textContent).not.toContain("Not started");
  });

  it("does not infer a Care stage for an enrolled subscription with no recorded stage", async () => {
    const careEnrollment = {
      sourceState: "available" as const,
      enrolled: true,
      status: { stage: null, neutralSummary: null, updatedAt: null },
      pharmacyState: "none" as const,
    };
    const container = await render(
      <AccountSubscriptionView data={{
        subscription: { membership: FIXTURE_MEMBERSHIP_MANUAL, careEnrollment },
        billingDocuments: [],
      }} />,
      "/research/account/subscription",
    );
    expect(container.textContent).toContain("No stage recorded");
    expect(container.textContent).not.toContain("Not started");
  });

  it("renders only the authorized current Care stage without inventing prior history", async () => {
    // The view consumes the FULL enrollment DTO — the same shape the wire
    // carries — never a hand-unwrapped `.status` (P1-6).
    const container = await render(<AccountCareView data={FIXTURE_CARE_ENROLLED} />, "/research/account/care");
    expect(container.querySelector("#care-current-heading")?.textContent).toBe("Provider review");
    expect(container.querySelector(".care-status-timeline")).toBeNull();
    expect(container.textContent).not.toContain("Recorded");
    expect(container.textContent).not.toContain("Account created");
    expect(container.textContent).not.toContain("Intake submitted");
    expect(container.textContent).toContain("A later state is never implied before its source records it.");
  });

  it("does not turn a late ordinal Care stage into evidence for every earlier stage", async () => {
    const completedStage: CareEnrollmentDto = {
      sourceState: "available",
      enrolled: true,
      pharmacyState: "none",
      status: {
        stage: "completed",
        updatedAt: "2026-08-27T00:00:00.000Z",
        neutralSummary: null,
      },
    };
    const container = await render(<AccountCareView data={completedStage} />, "/research/account/care");
    expect(container.querySelector("#care-current-heading")?.textContent).toBe("Completed");
    expect(container.textContent).not.toContain("Recorded");
    expect(container.textContent).not.toContain("Account created");
    expect(container.textContent).not.toContain("Provider review");
    expect(container.textContent).not.toContain("Pharmacy processing");
    expect(container.textContent).toContain("Account creation, intake submission, provider review, a provider decision, pharmacy processing, shipment, and completion are separate states.");
  });

  it("renders an honest not-started Care state from a CONNECTED source", async () => {
    const container = await render(
      <AccountCareView
        data={{ sourceState: "available", enrolled: false, status: { stage: null, updatedAt: null, neutralSummary: null }, pharmacyState: "none" }}
      />,
    );
    expect(container.textContent).toContain("Care not started");
    expect(container.querySelector(".care-status-timeline")).toBeNull();
  });

  it("an enrollment with no recorded stage says so distinctly, never a fabricated timeline", async () => {
    const container = await render(
      <AccountCareView
        data={{ sourceState: "available", enrolled: true, status: { stage: null, updatedAt: null, neutralSummary: null }, pharmacyState: "none" }}
      />,
    );
    // Stage-missing is NOT the same fact as source-unavailable (P1-D).
    expect(container.textContent).toContain("No operational stage is recorded yet.");
    expect(container.textContent).not.toContain("Care status unavailable");
    expect(container.querySelector(".care-status-timeline")).toBeNull();
  });

  it("an unavailable Care source renders no enrollment claim at all", async () => {
    const container = await render(<AccountCareView data={FIXTURE_CARE_UNAVAILABLE} />);
    expect(container.textContent).toContain("Care status unavailable");
    expect(container.textContent).not.toContain("Care not started");
    expect(container.textContent).not.toContain("Not enrolled");
    expect(container.querySelector(".care-status-timeline")).toBeNull();
  });

  it("downloads documents only through the injected authenticated action", async () => {
    const onDownload = vi.fn(async () => "ok" as const);
    const container = await render(<AccountDocumentsView documents={FIXTURE_DOCUMENTS} onDownload={onDownload} />);
    const button = container.querySelector("button");
    await act(async () => button?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onDownload).toHaveBeenCalledWith(FIXTURE_DOCUMENTS[0].downloadPath);
    expect(container.querySelector(`a[href="${FIXTURE_DOCUMENTS[0].downloadPath}"]`)).toBeNull();
  });

  it("provides a labelled support form without direct mail or third-party actions", async () => {
    const onSubmit = vi.fn(async () => ({
      kind: "ok" as const,
      data: {
        id: "case-synthetic",
        category: "account" as const,
        subject: "Synthetic request",
        state: "open" as const,
        lastUpdateAt: "2026-08-26T00:00:00.000Z",
        responseExpectation: "A response expectation will appear after routing.",
      },
    }));
    const container = await render(<AccountSupportView cases={FIXTURE_SUPPORT_CASES} onSubmit={onSubmit} />);
    expect(container.querySelector('label[for="support-category"]')).not.toBeNull();
    expect(container.querySelector('label[for="support-description"]')).not.toBeNull();
    expect(container.querySelector('a[href^="mailto:"]')).toBeNull();
    await enterValue(container.querySelector<HTMLInputElement>("#support-subject")!, "Synthetic request");
    await enterValue(
      container.querySelector<HTMLTextAreaElement>("#support-description")!,
      "Please review this synthetic account request.",
    );
    const form = container.querySelector("form");
    await act(async () => form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("Your support request was recorded");
    expect(container.textContent).toContain("Synthetic request");
  });
});

describe("account portal shell landmarks", () => {
  it("provides exactly one main landmark for the bare-chrome account routes", async () => {
    const container = await render(
      <AccountPortalShell title="Synthetic title" lead="Synthetic lead">
        <p>synthetic body</p>
      </AccountPortalShell>,
    );
    // The account routes render bare (layout returns bare children), so the
    // shell's main is the page's ONLY main landmark (P2-2).
    document.body.append(container);
    try {
      expect(document.querySelectorAll("main")).toHaveLength(1);
      expect(document.querySelector("main")?.className).toContain("account-page-body");
    } finally {
      container.remove();
    }
  });
});

describe("account resource states", () => {
  function ResourceHarness({
    loader,
  }: {
    loader: (token: string | null) => Promise<CustomerAccountResult<string>>;
  }) {
    const snapshot = useAccountResource(loader, null);
    return <AccountResourceBoundary snapshot={snapshot}>{(data) => <p>{data}</p>}</AccountResourceBoundary>;
  }

  it.each([
    [{ state: "loading" } as const, "Opening your private account"],
    [{ state: "denied", reason: "auth_required" } as const, "Account access is required"],
    [{ state: "error" } as const, "Your account could not be loaded"],
  ])("renders %s as a first-class state", async (snapshot, expected) => {
    const container = await render(<AccountResourceBoundary snapshot={snapshot}>{() => <p>ready</p>}</AccountResourceBoundary>);
    expect(container.textContent).toContain(expected);
    expect(container.textContent).not.toContain("ready");
  });

  it("renders ready data", async () => {
    const container = await render(<AccountResourceBoundary snapshot={{ state: "ready", data: "ready data" }}>{(data) => <p>{data}</p>}</AccountResourceBoundary>);
    expect(container.textContent).toContain("ready data");
  });

  it("moves a rejected loader into the explicit error state", async () => {
    const loader = vi.fn<(token: string | null) => Promise<CustomerAccountResult<string>>>()
      .mockRejectedValue(new Error("synthetic loader failure"));
    const container = await render(<ResourceHarness loader={loader} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(loader).toHaveBeenCalledWith(null);
    expect(container.textContent).toContain("Your account could not be loaded");
    expect(container.textContent).not.toContain("Opening your private account");
  });

  describe("denied sign-in returnTo", () => {
    it.each([
      "/research/account",
      "/research/account/orders",
      "/research/account/subscription",
      "/research/account/care",
      "/research/account/documents",
      "/research/account/support",
    ])("preserves the exact registered static account path %s", (path) => {
      const href = accountDeniedSignInHref(path);
      expect(href).toBe(
        `/research/sign-in?returnTo=${encodeURIComponent(path)}`,
      );
      expect(
        new URLSearchParams(href.split("?", 2)[1]).get("returnTo"),
      ).toBe(path);
    });

    it.each([
      "https://outside.invalid/research/account",
      "//outside.invalid/research/account",
      "/research/accounting",
      "/research/account.example/orders",
      "/research/member/security",
      "/care",
      "/research/ACCOUNT/orders",
      "/research/account/orders/../support",
      "/research/account/orders/%2fetc",
      "/research/account/orders\\outside",
      " /research/account/orders",
      "/research/account/orders ",
      "not a path",
      "",
    ])("rejects external, cross-boundary, lookalike, or malformed input %s", (path) => {
      expect(accountDeniedSignInHref(path)).toBe("/research/sign-in");
    });

    it.each([
      "/research/account/orders?access_token=synthetic-secret",
      "/research/account/orders?returnTo=https://outside.invalid",
      "/research/account/orders#synthetic-token",
      "/research/account/orders?code=synthetic#fragment",
    ])("rejects direct query or fragment input without leaking it: %s", (path) => {
      const href = accountDeniedSignInHref(path);
      expect(href).toBe("/research/sign-in");
      expect(href).not.toMatch(/token|secret|outside|code|fragment/i);
    });

    it("copies only window.location.pathname from a denied account page", async () => {
      const previous = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.history.replaceState(
        null,
        "",
        "/research/account/orders?access_token=synthetic-secret#synthetic-fragment",
      );
      try {
        const container = await render(
          <AccountResourceBoundary
            snapshot={{ state: "denied", reason: "auth_required" }}
          >
            {() => <p>ready</p>}
          </AccountResourceBoundary>,
        );
        const href = container
          .querySelector<HTMLAnchorElement>("[data-testid=\"account-denied\"] a")
          ?.getAttribute("href");
        expect(href).toBe(
          "/research/sign-in?returnTo=%2Fresearch%2Faccount%2Forders",
        );
        expect(href).not.toMatch(/token|secret|fragment/i);
      } finally {
        window.history.replaceState(null, "", previous || "/");
      }
    });

    // Lead composed the extension routes atomically (protected manifest,
    // router, layout recognizer, member return-to), so every one of the nine
    // static destinations plus the case-preserved opaque detail path returns
    // through sign-in path-only. The closed set below proves the manifest did
    // not widen into a prefix allowance.
    it.each([
      "/research/account/profile",
      "/research/account/security",
      "/research/account/interests",
      "/research/account/orders/XRR-Fixture_01",
    ])("returns a composed extension destination path-only through sign-in: %s", (path) => {
      expect(accountDeniedSignInHref(path)).toBe(
        `/research/sign-in?returnTo=${encodeURIComponent(path)}`,
      );
    });

    it.each([
      "/research/account/orders/:reference",
      "/research/account/orders/XRR%2DFixture",
      "/research/account/orders/XRR-Fixture_01/extra",
      "/research/Account/orders/XRR-Fixture_01",
      "/research/account/claim-history",
      "/research/account/organizations/abc",
      "/research/account/nonexistent",
    ])("keeps a parked, templated, encoded, or nested account destination closed: %s", (path) => {
      expect(accountDeniedSignInHref(path)).toBe("/research/sign-in");
    });
  });
});
