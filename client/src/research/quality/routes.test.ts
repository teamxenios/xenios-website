import { describe, expect, it } from "vitest";
import { PUBLIC_QUALITY_ROUTES, publicLotRoute } from "./routes";

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
});

