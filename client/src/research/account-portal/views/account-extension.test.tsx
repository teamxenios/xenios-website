// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { afterEach, describe, expect, it } from "vitest";
import {
  FIXTURE_ACCOUNT_OVERVIEW,
  FIXTURE_CUSTOMER_ORDERS,
} from "@shared/research/customer-account/fixtures";
import type {
  CustomerOrdersDto,
  OrderSummaryDto,
  ProductInterestDto,
} from "@shared/research/customer-account/contract";
import { AccountPortalShell } from "../AccountPortalShell";
import {
  ACCOUNT_PORTAL_EXTENSION_ROUTES,
  accountOrderDetailPath,
  decodeAccountOrderReference,
  isAccountOrderDetailPath,
} from "../routes";
import { AccountInterestsView } from "./InterestsView";
import { AccountOrderDetailView } from "./OrderDetailView";
import { AccountProfileView } from "./ProfileView";
import { AccountSecurityView } from "./SecurityView";

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

function ordersWithRecordKind(
  recordKind: OrderSummaryDto["recordKind"],
  reference: string,
): CustomerOrdersDto {
  return {
    ...FIXTURE_CUSTOMER_ORDERS,
    research: [{ ...FIXTURE_CUSTOMER_ORDERS.research[1], reference, recordKind }],
  };
}

afterEach(async () => {
  while (mounted.length) {
    const root = mounted.pop();
    if (root) await act(async () => root.unmount());
  }
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe("account portal extension routes", () => {
  it("exports the exact protected additions and admits only a bounded reference segment", () => {
    expect(ACCOUNT_PORTAL_EXTENSION_ROUTES).toEqual({
      orderDetail: "/research/account/orders/:reference",
      profile: "/research/account/profile",
      security: "/research/account/security",
      interests: "/research/account/interests",
    });
    expect(accountOrderDetailPath("XRR-exact_one.2")).toBe(
      "/research/account/orders/XRR-exact_one.2",
    );
    expect(decodeAccountOrderReference("XRR-exact_one.2")).toBe("XRR-exact_one.2");
    expect(isAccountOrderDetailPath("/research/account/orders/XRR-exact_one.2?from=list")).toBe(true);
    expect(isAccountOrderDetailPath("/RESEARCH/ACCOUNT/ORDERS/XRR-exact_one.2")).toBe(false);
    expect(isAccountOrderDetailPath("/research/account/orders/nested/reference")).toBe(false);
    expect(isAccountOrderDetailPath("/research/account/orders/XRR%2Fescaped")).toBe(false);
    expect(isAccountOrderDetailPath("/research/account/orders/%E0%A4%A")).toBe(false);
    expect(isAccountOrderDetailPath("/research/account/orders/%2E%2E")).toBe(false);
    expect(accountOrderDetailPath("")).toBe("/research/account/orders");
    expect(accountOrderDetailPath("..")).toBe("/research/account/orders");
    expect(accountOrderDetailPath("XRR unsafe/segment")).toBe("/research/account/orders");
    expect(decodeAccountOrderReference("%E0%A4%A")).toBe("");
  });

  it("exposes every account area and keeps Commerce active on a detail path", async () => {
    const container = await render(
      <AccountPortalShell title="Route fixture" lead="Route fixture lead">
        <p>Body</p>
      </AccountPortalShell>,
      "/research/account/orders/XRR-FIXTURE",
    );
    const navigation = container.querySelector('nav[aria-label="Account areas"]');
    expect(navigation?.querySelectorAll("a")).toHaveLength(10);
    expect(navigation?.querySelector('a[href="/research/member/catalog"]')?.textContent).toBe("Browse products");
    expect(navigation?.textContent).toContain("Interests");
    expect(navigation?.textContent).toContain("Commerce");
    expect(navigation?.textContent).toContain("Profile");
    expect(navigation?.textContent).toContain("Security");
    expect(navigation?.querySelector('a[href="/research/account/orders"]')?.getAttribute("aria-current"))
      .toBe("page");
    expect(container.querySelector("a")?.getAttribute("href")).toBe("#account-main-content");
    expect(container.querySelector("main")?.id).toBe("account-main-content");
    expect(document.title).toBe("Route fixture | Xenios Research");
  });
});

describe("account portal extension views", () => {
  it("keeps an XRR-looking record neutral when recordKind is unknown", async () => {
    const reference = "XRR-LOOKS-LIKE-A-REQUEST";
    const data = ordersWithRecordKind("unknown", reference);
    const container = await render(
      <AccountOrderDetailView data={data} reference={reference} />,
    );
    expect(container.textContent).toContain(reference);
    expect(container.textContent).toContain("Member-scoped commerce record");
    expect(container.textContent).toContain("Recorded");
    expect(container.textContent).not.toContain("Member-scoped request");
    expect(container.textContent).not.toContain("Requested");
    expect(container.textContent).not.toContain("Member-scoped order");
    expect(container.textContent).toContain("Payment: Paid");
    expect(container.textContent).toContain("Fulfillment: Shipped");
    expect(container.textContent).toContain("neither is inferred from the reference format");
    expect(container.textContent).not.toContain("assisted request");
    expect(container.querySelector('a[href^="https://tracking.invalid"]')?.getAttribute("rel"))
      .toBe("noopener noreferrer");
  });

  it("uses explicit recordKind even when the opaque reference suggests another lane", async () => {
    const explicitOrderReference = "XRR-EXPLICIT-ORDER";
    const explicitRequestReference = "XO-EXPLICIT-REQUEST";
    const orderContainer = await render(
      <AccountOrderDetailView
        data={ordersWithRecordKind("order", explicitOrderReference)}
        reference={explicitOrderReference}
      />,
    );
    const requestContainer = await render(
      <AccountOrderDetailView
        data={ordersWithRecordKind("request", explicitRequestReference)}
        reference={explicitRequestReference}
      />,
    );

    expect(orderContainer.textContent).toContain("Member-scoped order");
    expect(orderContainer.textContent).toContain("Placed");
    expect(orderContainer.textContent).not.toContain("Member-scoped request");
    expect(requestContainer.textContent).toContain("Member-scoped request");
    expect(requestContainer.textContent).toContain("Requested");
    expect(requestContainer.textContent).not.toContain("Member-scoped order");
  });

  it("does not report a definitive miss when commerce history is incomplete", async () => {
    const container = await render(
      <AccountOrderDetailView data={FIXTURE_CUSTOMER_ORDERS} reference="UNKNOWN-FIXTURE" />,
    );
    expect(container.textContent).toContain("not currently visible");
    expect(container.textContent).toContain("not a definitive not-found result");
    expect(container.textContent).not.toContain("No commerce record with this exact reference");
  });

  it("reports only an account-scoped miss when the commerce history is complete", async () => {
    const complete = {
      ...FIXTURE_CUSTOMER_ORDERS,
      history: {
        ...FIXTURE_CUSTOMER_ORDERS.history,
        availability: "complete" as const,
        authoritativeRecordCount: FIXTURE_CUSTOMER_ORDERS.research.length,
        sources: {
          commerce: { connected: true, complete: true },
          xea: { connected: true, complete: true },
          xec: { connected: true, complete: true },
          xrr: { connected: true, complete: true },
        },
      },
    };
    const container = await render(
      <AccountOrderDetailView data={complete} reference="UNKNOWN-FIXTURE" />,
    );
    expect(container.textContent).toContain("No commerce record with this exact reference is attached to this account");
    expect(container.textContent).not.toContain("different account");
  });

  it("does not report a definitive miss when an authoritative count exceeds visible rows", async () => {
    const countWithoutRows = {
      ...FIXTURE_CUSTOMER_ORDERS,
      research: [],
      history: {
        ...FIXTURE_CUSTOMER_ORDERS.history,
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
    const container = await render(
      <AccountOrderDetailView data={countWithoutRows} reference="UNKNOWN-FIXTURE" />,
    );
    expect(container.textContent).toContain("not currently visible");
    expect(container.textContent).toContain("not a definitive not-found result");
    expect(container.textContent).not.toContain("No commerce record with this exact reference");
  });

  it("keeps profile read-only and routes changes through private support", async () => {
    const container = await render(<AccountProfileView data={FIXTURE_ACCOUNT_OVERVIEW} />);
    expect(container.textContent).toContain("Test Customer");
    expect(container.textContent).toContain("test.customer@example.invalid");
    expect(container.textContent).toContain("read-only");
    expect(container.querySelector("input, textarea")).toBeNull();
    expect(container.querySelector('a[href="/research/account/support"]')).not.toBeNull();
  });

  it("links to the real recovery route and makes unavailable security controls explicit", async () => {
    const container = await render(<AccountSecurityView data={FIXTURE_ACCOUNT_OVERVIEW} />);
    expect(container.querySelector('a[href="/research/reset-password?returnTo=%2Fresearch%2Faccount%2Fsecurity"]')).not.toBeNull();
    expect(container.textContent).toContain("Session and multi-factor controls are not available here");
    expect(container.textContent).not.toContain("MFA enabled");
  });

  it("renders exact saved-interest states with only their canonical safe actions", async () => {
    const interests: readonly ProductInterestDto[] = [
      { interestKey: "live-fixture", displayLabel: "Live fixture", availability: "live", recordedAt: "2026-08-20T00:00:00.000Z" },
      { interestKey: "request-fixture", displayLabel: "Request fixture", availability: "request_only", recordedAt: "2026-08-20T00:00:00.000Z" },
      { interestKey: "provider-fixture", displayLabel: "Provider fixture", availability: "provider_required", recordedAt: "2026-08-20T00:00:00.000Z" },
      { interestKey: "pending-fixture", displayLabel: "Pending fixture", availability: "pending_activation", recordedAt: "2026-08-20T00:00:00.000Z" },
      { interestKey: "unavailable-fixture", displayLabel: "Unavailable fixture", availability: "unavailable", recordedAt: "2026-08-20T00:00:00.000Z" },
    ];
    const container = await render(<AccountInterestsView interests={interests} />);
    expect(container.textContent).toContain("Live in catalog");
    expect(container.textContent).toContain("Request only");
    expect(container.textContent).toContain("Provider pathway required");
    expect(container.textContent).toContain("Pending activation");
    expect(container.textContent).toContain("Unavailable");
    expect(container.querySelector('a[href="/research/member/catalog"]')).not.toBeNull();
    expect(container.querySelector('a[href="/research/account/care"]')).not.toBeNull();
    expect(container.querySelectorAll('a[href="/research/account/support"]')).toHaveLength(2);
    expect(container.textContent).toContain("does not make the item orderable");
  });
});
