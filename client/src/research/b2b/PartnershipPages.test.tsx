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
    expect(view.textContent).toContain("Partner applications open soon.");
    expect(view.textContent).toContain("Strategic partnerships");
    expect(view.textContent).toContain("Sending an inquiry is not an application, does not create an account, and does not approve a partnership.");
    expect(view.textContent).toContain("Care services never earn commission.");
    expect(view.textContent).not.toMatch(/\b20%\b|\b7\.5%\b|\$50 minimum/i);
    expectAccessibleRelationships(view);
  });

  it("keeps client accounts and clinical authority separate from the practice relationship", async () => {
    const view = await renderPage(<OrganizationAccessPage />);

    expect(view.querySelectorAll("h1")).toHaveLength(1);
    expect(view.textContent).toContain("For practices: refer clients, keep your relationships.");
    expect(view.textContent).toContain("Your clients create and own their accounts.");
    expect(view.textContent).toContain("Your practice is recorded as the referring practice");
    expect(view.textContent).toContain("doesn't place orders for clients, edit their accounts, or approve treatment");
    expect(view.textContent).toContain("In-clinic inventory is under review.");
    expectAccessibleRelationships(view);
  });

  it("states the affiliate lifecycle without publishing economics or clinical incentives", async () => {
    const view = await renderPage(<AffiliateAccessPage />);

    expect(view.querySelectorAll("h1")).toHaveLength(1);
    expect(view.textContent).toContain("Partner applications open soon.");
    expect(view.textContent).toContain("This inquiry is not an application, account, or approval.");
    expect(view.textContent).toContain("The agreement controls the details.");
    expect(view.textContent).toContain("Care services never earn commission.");
    expect(view.textContent).not.toMatch(/\b20%\b|\b7\.5%\b|\$50 minimum/i);
    expectAccessibleRelationships(view);
  });

  it("presents supplier access as inquiry, review, then invitation", async () => {
    const view = await renderPage(<SupplierPartnershipPage />);

    expect(view.querySelectorAll("h1")).toHaveLength(1);
    expect(view.textContent).toContain("Inquiry, review, then invitation.");
    expect(view.textContent).toContain("does not create supplier access, approve a relationship, or promise product, inventory, price, or timing");
    expect(view.textContent).toContain("Supplier access is by invitation, after we review your documentation.");
    expectAccessibleRelationships(view);
  });
});
