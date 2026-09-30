import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Router } from "wouter";
import { PATHWAY_TILES, ProductsPage } from "./pages";

const homeSource = readFileSync(resolve(__dirname, "../pages/Home.tsx"), "utf8");
const pagesSource = readFileSync(resolve(__dirname, "pages.tsx"), "utf8");
const careersSource = readFileSync(resolve(__dirname, "../pages/Careers.tsx"), "utf8");
const routedPublicSources = [
  "../components/Navbar.tsx",
  "../components/Footer.tsx",
  "../components/AccountAccessChooser.tsx",
  "../clarity/WorkspaceHome.tsx",
  "../care/CarePublicPages.tsx",
  "../care/CareAccessRequestForm.tsx",
  "../research/pages/Gateway.tsx",
  "../research/pages/Faq.tsx",
  "../research/pages/HowItWorks.tsx",
  "../research/pages/Support.tsx",
  "../research/assisted-order/AssistedOrderCta.tsx",
  "../research/quality/QualityPage.tsx",
  "../research/quality/TestingPage.tsx",
  "../research/b2b/PartnerPathwaysPage.tsx",
  "../research/b2b/OrganizationAccessPage.tsx",
  "../research/b2b/AffiliateAccessPage.tsx",
  "../research/b2b/SupplierPartnershipPage.tsx",
].map((path) => readFileSync(resolve(__dirname, path), "utf8")).join("\n");

describe("owner-approved public clarity copy", () => {
  it("uses the exact approved root hero", () => {
    expect(homeSource).toContain("Care and research products, clearly separated.");
    expect(homeSource).toContain("Start a Care request, or explore products for research use. Two different paths, with clear next steps.");
  });

  it("ships exactly the three first-release pathway tiles", () => {
    expect(PATHWAY_TILES.map(({ title }) => title)).toEqual([
      "Start Care",
      "Explore Research Products",
      "For Practices",
    ]);
    expect(`${homeSource}\n${pagesSource}`).not.toMatch(/product count|\$\d|Buy now|Add to cart/iu);
  });

  it("takes a newcomer from products to the supported research catalog without a self-link", () => {
    const html = renderToStaticMarkup(<Router ssrPath="/products"><ProductsPage /></Router>);
    expect(PATHWAY_TILES[1].href).toBe("/research/early-access");
    expect(html).toContain('href="/research/early-access"');
    expect(html).toContain("Browse Research Catalog");
    expect(html).toContain("A request is not a paid order");
    expect(html).not.toContain("We're preparing our public product list");
    const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/u)?.[1] ?? "";
    expect(main).not.toContain('href="/products"');
  });

  it("preserves the complete approved CTA vocabulary and exact Care qualifier", () => {
    const publicSource = `${homeSource}\n${pagesSource}\n${careersSource}\n${routedPublicSources}`;
    for (const approvedCta of ["Request Order", "Activate Account", "Join Waitlist"]) {
      expect(publicSource).toContain(approvedCta);
    }
    expect(publicSource).toContain("Care availability depends on your state. We confirm it after your request.");
    expect(publicSource).not.toContain("We confirm availability after the request.");
    expect(PATHWAY_TILES[1]).toMatchObject({ title: "Explore Research Products", label: "Explore Products" });
  });

  it("omits unverified claims and retired public labels", () => {
    const publicSource = `${homeSource}\n${pagesSource}\n${careersSource}\n${routedPublicSources}`;
    for (const blocked of [
      "Every lot has a record",
      "one business day",
      "72 hours",
      "state-licensed compounding pharmacy",
      "third-party tested",
      "$30 per month",
      "Research Rep",
      "Get access",
      "Request Early Access",
      "Apply for Early Access",
    ]) expect(publicSource).not.toContain(blocked);
    expect(publicSource).not.toMatch(/\b20%\b|\b7\.5%\b|\$50 minimum/iu);
    expect(publicSource).not.toMatch(/Xenios Care is available nationwide/iu);
  });

  it("publishes a general-interest careers application without named roles", () => {
    expect(careersSource).toContain("general interest only");
    expect(careersSource).toContain('kind="career_interest"');
    expect(careersSource).not.toContain("OPEN_ROLES");
    expect(careersSource).not.toContain("RoleCard");
  });
});
