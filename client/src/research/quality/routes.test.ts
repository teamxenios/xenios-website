import { describe, expect, it } from "vitest";
import {
  PUBLIC_QUALITY_ROUTES,
  isPublicLotRoutePath,
  publicLotRoute,
} from "./routes";

describe("public quality route handoff", () => {
  it("exports the exact unique public route set for protected composition", () => {
    expect(PUBLIC_QUALITY_ROUTES).toEqual({
      quality: "/research/quality",
      testing: "/research/testing",
      lot: "/research/lots/:lotCode",
      documents: "/research/documents",
    });
    expect(new Set(Object.values(PUBLIC_QUALITY_ROUTES)).size).toBe(4);
    expect(Object.values(PUBLIC_QUALITY_ROUTES).every((path) =>
      path.startsWith("/research/") && !path.includes("/member/") && !path.includes("/admin/"),
    )).toBe(true);
  });

  it("constructs only an exact normalized lot route", () => {
    expect(publicLotRoute(" lot-alpha-01 ")).toBe("/research/lots/LOT-ALPHA-01");
    expect(publicLotRoute("LOT/../../private")).toBeNull();
  });

  it("recognizes only one bounded exact lot segment", () => {
    expect(isPublicLotRoutePath("/research/lots/LOT-ALPHA-01")).toBe(true);
    expect(isPublicLotRoutePath("/Research/Lots/lot-alpha-01/")).toBe(true);
    expect(isPublicLotRoutePath("/research/lots/ab")).toBe(true);
    expect(isPublicLotRoutePath("/research/lots/%ZZ")).toBe(true);
    expect(isPublicLotRoutePath("/research/lots/LOT-ALPHA-01//")).toBe(false);
    expect(isPublicLotRoutePath("/research/lots/LOT-ALPHA-01/private")).toBe(false);
    // decodeURI (and wouter) preserve an encoded slash as one segment; the
    // routed page remains public but rejects it as an invalid lot code.
    expect(isPublicLotRoutePath("/research/lots/LOT%2FPRIVATE")).toBe(true);
  });
});
