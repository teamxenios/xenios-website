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
  FIXTURE_SUPPORT_CASES,
} from "@shared/research/customer-account/fixtures";
import { ORDER_HISTORY_SOURCE_LABELS } from "@shared/research/customer-account/contract";
import { AccountPortalShell } from "../AccountPortalShell";
import { AccountResourceBoundary } from "../resource";
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
    expect(container.textContent).toContain("Research orders");
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
    expect(container.textContent).toContain("count unavailable — order history incomplete");
    expect(container.textContent).toContain("Some order history is currently unavailable.");
    expect(container.textContent).toContain(ORDER_HISTORY_SOURCE_LABELS.xec);
    expect(container.textContent).toContain(ORDER_HISTORY_SOURCE_LABELS.xrr);
    expect(container.textContent).not.toContain("No Research orders are attached");
    expect(container.textContent).toContain("Order history is currently unavailable or incomplete");
  });

  it("declares a provable all-clear only for a current standing over complete history", async () => {
    const data = {
      ...FIXTURE_ACCOUNT_OVERVIEW,
      accountStanding: "current" as const,
      nextAdministrativeAction: null,
      orderHistory: {
        availability: "complete" as const,
        // Complete history is the only state that may carry a numeric
        // authoritative count (Lane 01 contract); it matches FIXTURE_ORDERS.
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
    expect(container.textContent).not.toContain("Some order history is currently unavailable.");
  });

  it("renders Care status unavailable, never not-enrolled, from an unavailable Care source", async () => {
    const data = { ...FIXTURE_ACCOUNT_OVERVIEW, careEnrollment: FIXTURE_CARE_UNAVAILABLE };
    const container = await render(<AccountOverviewView data={data} />);
    expect(container.textContent).toContain("Care status unavailable");
    expect(container.textContent).not.toContain("Not enrolled");
  });

  it("separates Research orders from Care and pharmacy fulfillment", async () => {
    const container = await render(<AccountOrdersView data={FIXTURE_CUSTOMER_ORDERS} />, "/research/account/orders");
    expect(container.textContent).toContain("Research orders");
    expect(container.textContent).toContain("Care / pharmacy");
    expect(container.textContent).toContain("Provider review");
    const tracking = container.querySelector('a[href^="https://tracking.invalid"]');
    expect(tracking?.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("names the disconnected sources behind a partial order history", async () => {
    const container = await render(<AccountOrdersView data={FIXTURE_CUSTOMER_ORDERS} />, "/research/account/orders");
    expect(container.textContent).toContain("Some order history is currently unavailable.");
    expect(container.textContent).toContain(ORDER_HISTORY_SOURCE_LABELS.xec);
    expect(container.textContent).toContain(ORDER_HISTORY_SOURCE_LABELS.xrr);
    expect(container.textContent).not.toContain(ORDER_HISTORY_SOURCE_LABELS.commerce);
  });

  it("renders detail-unavailable orders without a fabricated label or quantity", async () => {
    const detailUnavailable = {
      ...FIXTURE_CUSTOMER_ORDERS.research[0],
      detailAvailability: "unavailable" as const,
      itemLabel: null,
      variantLabel: null,
      quantity: null,
    };
    const container = await render(
      <AccountOrdersView data={{ ...FIXTURE_CUSTOMER_ORDERS, research: [detailUnavailable] }} />,
      "/research/account/orders",
    );
    expect(container.textContent).toContain("Order details unavailable");
    expect(container.textContent).not.toContain("Qty 0");
    expect(container.textContent).not.toContain("Variant recorded with order");
    // The quantity cell states the unknown, never a synthesized 0.
    expect(container.textContent).toContain("—");
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
    expect(container.textContent).toContain("Care status unavailable");
    expect(container.textContent).not.toContain("Not enrolled");
    expect(container.textContent).not.toContain("Not started");
  });

  it("uses the canonical ten-stage Care order and marks only the current step", async () => {
    // The view consumes the FULL enrollment DTO — the same shape the wire
    // carries — never a hand-unwrapped `.status` (P1-6).
    const container = await render(<AccountCareView data={FIXTURE_CARE_ENROLLED} />, "/research/account/care");
    const steps = Array.from(container.querySelectorAll(".care-status-step"));
    expect(steps).toHaveLength(10);
    expect(steps.map((step) => step.querySelector("h3")?.textContent)).toEqual([
      "Account created",
      "Intake needed",
      "Intake submitted",
      "Provider review",
      "Follow-up required",
      "Appointment needed",
      "Provider decision recorded",
      "Pharmacy processing",
      "Shipment",
      "Completed",
    ]);
    expect(container.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
    expect(container.textContent).toContain("Later steps are not guaranteed");
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
});
