import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ACCESS_ROUTES,
  ADMIN_ROUTES,
  ALL_MANIFEST_ROUTES,
  PARTNER_ROUTES,
} from "./lib/routes";
import { PUBLIC_QUALITY_ROUTES } from "./quality/routes";

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

  it("mounts each founder command route exactly once", () => {
    expect(ADMIN_ROUTES.commandCenter).toBe("/admin/research/command-center");
    expect(ADMIN_ROUTES.earlyAccessPayments).toBe(
      "/admin/research/early-access/payments",
    );
    for (const route of [
      ADMIN_ROUTES.commandCenter,
      ADMIN_ROUTES.earlyAccessPayments,
    ]) {
      expect(ALL_MANIFEST_ROUTES.filter((candidate) => candidate === route))
        .toHaveLength(1);
      expect(sources.match(new RegExp(`path=${JSON.stringify(route)}`, "gu")))
        .toHaveLength(1);
    }
    expect(sources).toContain(
      'lazy(() => import("./pages/adminx/FounderCommandCenter"))',
    );
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

  it("registers the reviewed quality pages while keeping the public API separately unmounted", () => {
    expect(Object.values(PUBLIC_QUALITY_ROUTES)).toEqual([
      "/research/quality",
      "/research/testing",
      "/research/lots/:lotCode",
      "/research/documents",
    ]);
    for (const route of Object.values(PUBLIC_QUALITY_ROUTES)) {
      expect(ALL_MANIFEST_ROUTES.filter((candidate) => candidate === route)).toHaveLength(1);
      expect(sources.match(new RegExp(`path=${JSON.stringify(route)}`, "gu"))).toHaveLength(1);
    }
    expect(readFileSync(resolve(here, "../../../server/research/index.ts"), "utf8"))
      .not.toContain("registerPublicQualityApi(");
  });
});
