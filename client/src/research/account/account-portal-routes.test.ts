import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ACCOUNT_PORTAL_ROUTES, ALL_MANIFEST_ROUTES } from "../lib/routes";

const section = readFileSync(resolve(__dirname, "../section.tsx"), "utf8");

describe("customer account portal routes", () => {
  it("registers exactly eleven personal portal entries through the member guard", () => {
    const routes = Object.values(ACCOUNT_PORTAL_ROUTES);
    expect(routes).toEqual([
      "/research/account",
      "/research/account/orders",
      "/research/account/subscription",
      "/research/account/care",
      "/research/account/documents",
      "/research/account/support",
      "/research/account/claim-history",
      "/research/account/orders/:reference",
      "/research/account/profile",
      "/research/account/security",
      "/research/account/interests",
    ]);
    for (const route of routes) {
      expect(ALL_MANIFEST_ROUTES).toContain(route);
      if (route === ACCOUNT_PORTAL_ROUTES.claimHistory) continue;
      expect(section).toMatch(new RegExp(`<Route path="${route.replaceAll("/", "\\/")}">\\{\\(\\) => <L member component=\\{Account`));
    }
    expect(section).toContain('<Route path="/research/account/claim-history">{() => <L component={AccountClaimHistory} />}</Route>');
    expect(section).toContain('const HistoryClaimOperationBoundary = module.HistoryClaimOperationBoundary;');
    expect(section).toContain('<HistoryClaimOperationBoundary><Member><HistoryClaimPage /></Member></HistoryClaimOperationBoundary>');
  });

  it("registers the opaque detail route before the orders list and every account route before the root", () => {
    const at = (needle: string) => {
      const index = section.indexOf(needle);
      expect(index).toBeGreaterThan(-1);
      return index;
    };
    expect(at('path="/research/account/orders/:reference"')).toBeLessThan(at('path="/research/account/orders"'));
    const root = at('<Route path="/research/account">');
    for (const route of Object.values(ACCOUNT_PORTAL_ROUTES)) {
      if (route === "/research/account") continue;
      expect(at(`path="${route}"`)).toBeLessThan(root);
    }
  });

  it("keeps organization and initial-password authority unmounted while composing personal history linking", () => {
    expect(section).not.toContain('path="/research/account/organizations/:organizationId"');
    expect(section).not.toContain('path="/research/account/organization-invitations/accept"');
    expect(section).not.toContain('path="/research/account/security/initial-password"');
    expect(section).toContain('path="/research/account/claim-history"');
  });
});
