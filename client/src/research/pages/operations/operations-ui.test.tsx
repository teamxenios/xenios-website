// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";
import { AffiliatePortal } from "./AffiliatePortal";
import { MitchPortal } from "./MitchPortal";
import { OperationsCommandCenter } from "./OperationsCommandCenter";
import { ProfessionalAccounts } from "./ProfessionalAccounts";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

function render(node: ReactNode): HTMLDivElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(node));
  return container;
}

const metrics = [
  { key: "overdue_acknowledgement", label: "Overdue acknowledgment", value: 3, href: "/mitch?queue=overdue", tone: "danger" as const },
  { key: "low_inventory", label: "Low inventory", value: 4, href: "/inventory?queue=low", tone: "warning" as const },
  { key: "active_affiliates", label: "Active affiliates", value: 9, href: "/partners?status=active", tone: "success" as const },
];

describe("operations UI states and accessibility", () => {
  it("renders linked desktop metrics, one primary action, filters, and the exception table", () => {
    const view = render(
      <OperationsCommandCenter
        metrics={metrics}
        exceptions={[
          {
            id: "exc-1",
            orderReference: "XR-1042",
            kind: "Inventory shortage",
            owner: "Mitch",
            age: "18 min",
            severity: "samuel_decision",
            href: "/exceptions/exc-1",
          },
        ]}
        generatedAt="2026-07-25T16:00:00.000Z"
        priorityHref="/mitch?queue=overdue"
      />,
    );
    expect(view.querySelectorAll(".ops-metric")).toHaveLength(3);
    expect(view.querySelectorAll(".ops-primary")).toHaveLength(1);
    expect(view.querySelector('a[aria-label="Low inventory: 4"]')?.getAttribute("href")).toBe("/inventory?queue=low");
    expect(view.querySelector('input[placeholder*="Inventory"]')).not.toBeNull();
    expect(view.textContent).toContain("Samuel decision");
  });

  it("renders loading, error, empty, and filtered-empty states without blank screens", () => {
    let view = render(
      <OperationsCommandCenter
        metrics={[]}
        exceptions={[]}
        generatedAt="2026-07-25T16:00:00.000Z"
        priorityHref="/"
        loading
      />,
    );
    expect(view.querySelector('[role="status"]')?.textContent).toContain("Loading");
    act(() =>
      root!.render(
        <OperationsCommandCenter
          metrics={[]}
          exceptions={[]}
          generatedAt="2026-07-25T16:00:00.000Z"
          priorityHref="/"
          error="The operations API is unavailable."
        />,
      ),
    );
    expect(view.querySelector('[role="alert"]')?.textContent).toContain("unavailable");
    act(() =>
      root!.render(
        <OperationsCommandCenter
          metrics={[]}
          exceptions={[]}
          generatedAt="2026-07-25T16:00:00.000Z"
          priorityHref="/"
        />,
      ),
    );
    expect(view.textContent).toContain("No queues match");
    expect(view.textContent).toContain("queue is clear");
  });

  it("renders all ten keyboard-operable Mitch queues and one primary row action", () => {
    const view = render(
      <MitchPortal
        rows={[
          {
            id: "ful-1",
            orderReference: "XR-1042",
            recipientInitials: "A. R.",
            destinationZone: "TX-3",
            dueAt: "2026-07-25T22:00:00.000Z",
            fulfillmentState: "awaiting_acknowledgement",
            allocationState: "reserved",
            itemCount: 3,
            openExceptionCount: 0,
            version: 2,
          },
        ]}
        onSecondaryAction={() => undefined}
      />,
    );
    expect(view.querySelectorAll("nav button")).toHaveLength(10);
    expect(view.querySelectorAll(".mitch-card .ops-primary")).toHaveLength(1);
    expect(view.querySelector(".mitch-card .ops-primary")?.textContent).toBe("Acknowledge");
    expect(view.textContent).toContain("Note · Assistance · Escalate");
  });

  it("keeps affiliate dashboard free of customer PII while showing every metric and commission bucket", () => {
    const view = render(
      <AffiliatePortal
        data={{
          state: "active",
          code: "PARTNER1",
          links: [{ id: "link-1", url: "https://x.test/r/signed", campaign: "launch" }],
          campaigns: ["launch"],
          metrics: {
            clicks: 20,
            uniqueVisitors: 15,
            qualifiedSignups: 4,
            orders: 3,
            conversionRate: 0.2,
            eligibleRevenueCents: 50_000,
            refundsCents: 2_000,
            chargebacksCents: 0,
          },
          commission: {
            pendingCents: 1_000,
            approvedCents: 2_000,
            payableCents: 3_000,
            paidCents: 4_000,
            reversedCents: 500,
          },
          payoutHistory: [],
        }}
      />,
    );
    for (const label of ["Clicks", "Unique visitors", "Qualified signups", "Eligible revenue", "Pending commission", "Reversed"]) {
      expect(view.textContent).toContain(label);
    }
    expect(view.textContent?.toLowerCase()).not.toContain("person@example.com");
    expect(view.textContent?.toLowerCase()).not.toContain("customer name");
  });

  it("shows separated professional programs and the no-clinical-economics boundary", () => {
    const view = render(
      <ProfessionalAccounts
        accounts={[
          {
            id: "pro-1",
            accountType: "practitioner",
            organizationName: "Independent Practice",
            programs: ["professional_membership", "directory", "education"],
            state: "active",
            agreementVersion: "pro-v1",
          },
        ]}
      />,
    );
    expect(view.textContent).toContain("professional_membership · directory · education");
    expect(view.textContent).toContain("No default payment for prescriptions, patient referrals, diagnosis");
  });
});
