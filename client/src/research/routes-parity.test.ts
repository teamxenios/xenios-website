import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ACCESS_ROUTES, ALL_MANIFEST_ROUTES, PARTNER_ROUTES } from "./lib/routes";

// The route manifest is the single source of truth; this parity test fails
// the build the moment a manifest route is missing from the routers.

const here = resolve(__dirname);
const sources =
  readFileSync(resolve(here, "section.tsx"), "utf8") +
  readFileSync(resolve(here, "adminx-section.tsx"), "utf8");

describe("route manifest parity", () => {
  it("registers every manifest route in a router", () => {
    const missing = ALL_MANIFEST_ROUTES.filter((route) => !sources.includes(`"${route}"`));
    expect(missing).toEqual([]);
  });

  it("keeps the emailed status-link path registered alongside the manifest alias", () => {
    // Emailed links use /research/apply/status; the manifest's canonical form
    // is /research/application-status. Both must stay routed.
    expect(sources).toContain('"/research/apply/status"');
    expect(sources).toContain('"/research/application-status"');
  });

  it("keeps every public editorial route bidirectionally pinned to the manifest and router", () => {
    const editorialRoutes = [
      ACCESS_ROUTES.about,
      ACCESS_ROUTES.howItWorks,
      ACCESS_ROUTES.faq,
      ACCESS_ROUTES.policies,
      ACCESS_ROUTES.contact,
    ];
    expect(editorialRoutes).toEqual([
      "/research/about",
      "/research/how-it-works",
      "/research/faq",
      "/research/policies",
      "/research/contact",
    ]);
    for (const route of editorialRoutes) {
      expect(ALL_MANIFEST_ROUTES.filter((candidate) => candidate === route)).toHaveLength(1);
      expect(sources.match(new RegExp(`path=${JSON.stringify(route)}`, "gu"))).toHaveLength(1);
    }
    expect(sources).not.toContain(
      '<Route path="/research/faq"><Redirect to="/research/support" /></Route>',
    );
  });

  it("registers only the exact public B2B roots as open informational routes", () => {
    const publicB2bRoutes = [
      ACCESS_ROUTES.organizations,
      PARTNER_ROUTES.home,
      ACCESS_ROUTES.affiliates,
    ];
    expect(publicB2bRoutes).toEqual([
      "/research/organizations",
      "/research/partners",
      "/research/affiliates",
    ]);
    for (const route of publicB2bRoutes) {
      expect(ALL_MANIFEST_ROUTES.filter((candidate) => candidate === route)).toHaveLength(1);
      expect(sources.match(new RegExp(`path=${JSON.stringify(route)}`, "gu"))).toHaveLength(1);
    }
    expect(sources).toContain('<Route path="/research/partners/apply">');
    expect(sources).not.toContain('<Route path="/research/organizations/');
    expect(sources).not.toContain('<Route path="/research/affiliates/');
  });
});
