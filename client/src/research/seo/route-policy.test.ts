import { describe, expect, it } from "vitest";
import {
  isPublicResearchIndexRoute,
  PUBLIC_RESEARCH_EXACT_PATHS,
  researchRouteRobots,
} from "./route-policy";

describe("Research SEO route policy", () => {
  it("allows only the declared public editorial and catalog routes", () => {
    for (const path of PUBLIC_RESEARCH_EXACT_PATHS) {
      expect(isPublicResearchIndexRoute(path), path).toBe(true);
      expect(researchRouteRobots(path), path).toBe("index");
    }
    for (const path of [
      "/research/catalog/bpc-157",
      "/research/categories/peptides",
      "/research/lots/lot-001",
      "/research/policies/shipping",
    ]) {
      expect(isPublicResearchIndexRoute(path), path).toBe(true);
    }
  });

  it("fails closed for account, identity, Early Access, application, and portal routes", () => {
    for (const path of [
      "/research/account",
      "/research/account/orders",
      "/research/member",
      "/research/member/catalog",
      "/research/sign-in",
      "/research/reset-password",
      "/research/activate",
      "/research/access-state",
      "/research/apply",
      "/research/application/status",
      "/research/early-access",
      "/research/early-access/order-request",
      "/research/partners/dashboard",
      "/research/partners/payouts",
      "/research/__gallery/catalog",
      "/admin/research",
      "/care/portal",
    ]) {
      expect(isPublicResearchIndexRoute(path), path).toBe(false);
      expect(researchRouteRobots(path), path).toBe("noindex");
    }
  });

  it("normalizes router-equivalent case, encoding, query, hash, and trailing slash forms", () => {
    expect(isPublicResearchIndexRoute("/Research/Catalog/")).toBe(true);
    expect(isPublicResearchIndexRoute("/%72esearch/catalog/bpc-157?ref=private#lot")).toBe(true);
    expect(isPublicResearchIndexRoute("/research/account/?next=/research/catalog")).toBe(false);
  });

  it("rejects lookalikes, malformed encodings, and nested descendants", () => {
    for (const path of [
      "/researchers",
      "/research/catalogue",
      "/research/catalog/product/private",
      "/research/categories/family/private",
      "/research/partners/dashboard/reports",
      "/research/%ZZ",
    ]) {
      expect(isPublicResearchIndexRoute(path), path).toBe(false);
    }
  });
});
