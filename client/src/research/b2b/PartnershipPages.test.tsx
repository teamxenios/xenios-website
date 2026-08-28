// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import SupplierAccessRoute from "../pages/SupplierAccess";
import WholesaleRoute from "../pages/Wholesale";
import PartnerLandingRoute from "../pages/partners/Landing";
import AffiliateAccessPage from "./AffiliateAccessPage";
import OrganizationAccessPage from "./OrganizationAccessPage";
import PartnerPathwaysPage from "./PartnerPathwaysPage";
import SupplierPartnershipPage from "./SupplierPartnershipPage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  document.title = "";
});

async function renderPage(page: ReactNode): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(page);
    await Promise.resolve();
  });
  return container;
}

function expectAccessibleRelationships(view: HTMLElement) {
  const ids = Array.from(view.querySelectorAll<HTMLElement>("[id]")).map((element) => element.id);
  expect(new Set(ids).size).toBe(ids.length);

  for (const attribute of ["aria-labelledby", "aria-describedby"] as const) {
    for (const element of view.querySelectorAll<HTMLElement>(`[${attribute}]`)) {
      const references = element.getAttribute(attribute)?.split(/\s+/).filter(Boolean) ?? [];
      expect(references.length).toBeGreaterThan(0);
      for (const reference of references) {
        expect(view.querySelector(`[id="${reference}"]`), `${attribute} references #${reference}`).not.toBeNull();
      }
    }
  }

  for (const label of view.querySelectorAll<HTMLLabelElement>("label[for]")) {
    expect(view.querySelector(`[id="${label.htmlFor}"]`), `label references #${label.htmlFor}`).not.toBeNull();
  }

  for (const action of view.querySelectorAll<HTMLAnchorElement | HTMLButtonElement>("a, button")) {
    expect(action.textContent?.trim().length ?? 0).toBeGreaterThan(2);
    const href = action instanceof HTMLAnchorElement ? action.getAttribute("href") : null;
    if (href?.startsWith("#")) {
      expect(view.querySelector(`[id="${href.slice(1)}"]`), `fragment ${href} has a target`).not.toBeNull();
    }
  }
}

describe("public B2B pathway pages", () => {
  it("keeps existing leaf route modules as thin aliases to the new canonical pages", () => {
    expect(PartnerLandingRoute).toBe(PartnerPathwaysPage);
    expect(SupplierAccessRoute).toBe(SupplierPartnershipPage);
    expect(WholesaleRoute).toBe(OrganizationAccessPage);
  });

  it("presents every relationship and the non-activation boundary on the partner hub", async () => {
    const view = await renderPage(<PartnerPathwaysPage />);

    expect(view.querySelectorAll("h1")).toHaveLength(1);
    expect(view.querySelectorAll("main")).toHaveLength(0);
    expect(view.querySelectorAll('[data-testid^="b2b-pathway-"]')).toHaveLength(7);
    expect(view.textContent).toContain("White-label interest");
    expect(view.textContent).toContain("Strategic partnerships");
    expect(view.textContent).toContain("Commercial relationships never control clinical decisions.");
    expect(view.textContent).toContain("does not transmit, save, approve, price, or activate anything");
    expectAccessibleRelationships(view);
  });

  it("keeps organization procurement separate from Care and makes wholesale terms non-authoritative", async () => {
    const view = await renderPage(<OrganizationAccessPage />);

    expect(view.querySelectorAll("h1")).toHaveLength(1);
    expect(view.textContent).toContain("Clinics and medical spas");
    expect(view.textContent).toContain("Research procurement separate from patient care");
    expect(view.textContent).toContain("Wholesale and organization-specific terms remain private and human-approved.");
    expect(view.textContent).toContain("A request does not establish price, supply, or clinical access.");
    expectAccessibleRelationships(view);
  });

  it("states the affiliate lifecycle without publishing economics or clinical incentives", async () => {
    const view = await renderPage(<AffiliateAccessPage />);

    expect(view.querySelectorAll("h1")).toHaveLength(1);
    expect(view.textContent).toContain("Application through payout, without invented economics.");
    expect(view.textContent).toContain("No payment or benefit may reward prescribing");
    expect(view.textContent).toContain("Rates, payment schedules, and program economics are not promised");
    expect(view.textContent).toContain("Customer accounts stay with Xenios.");
    expect(view.textContent).toContain("A 90-day external advisor relationship may operate");
    expect(view.textContent).toContain("No contact import, customer invitation, or outreach begins");
    expect(view.textContent).not.toMatch(/\b20%\b|\b7\.5%\b|\$50 minimum/i);
    expectAccessibleRelationships(view);
  });

  it("presents supplier access as invitation-only, minimum-data, and evidence-bound", async () => {
    const view = await renderPage(<SupplierPartnershipPage />);

    expect(view.querySelectorAll("h1")).toHaveLength(1);
    expect(view.textContent).toContain("Operational access begins after evidence, not interest.");
    expect(view.textContent).toContain("Minimum data, assigned work, no commercial poaching.");
    expect(view.textContent).toContain("No assignment exists until the canonical operations authority creates it");
    expect(view.textContent).toContain("prescription fulfillment remains with the licensed pharmacy");
    expectAccessibleRelationships(view);
  });
});
