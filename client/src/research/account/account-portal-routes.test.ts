import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ACCOUNT_PORTAL_ROUTES, ALL_MANIFEST_ROUTES } from "../lib/routes";

const section = readFileSync(resolve(__dirname, "../section.tsx"), "utf8");

describe("customer account portal routes", () => {
  it("registers exactly the six portal routes through the member guard", () => {
    const routes = Object.values(ACCOUNT_PORTAL_ROUTES);
    expect(routes).toEqual([
      "/research/account",
      "/research/account/orders",
      "/research/account/subscription",
      "/research/account/care",
      "/research/account/documents",
      "/research/account/support",
    ]);
    for (const route of routes) {
      expect(ALL_MANIFEST_ROUTES).toContain(route);
      expect(section).toMatch(new RegExp(`<Route path="${route.replaceAll("/", "\\/")}">\\{\\(\\) => <L member component=\\{Account`));
    }
  });

  it("keeps the organization-dependent legacy account routes unmounted", () => {
    expect(section).not.toContain('path="/research/account/organizations/:organizationId"');
    expect(section).not.toContain('path="/research/account/claim-history"');
  });
});

