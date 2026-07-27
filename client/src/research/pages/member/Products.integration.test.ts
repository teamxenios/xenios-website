import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Website 3 member catalog integration", () => {
  it("uses the accepted Product Control projection instead of combining legacy catalog authorities", () => {
    const source = readFileSync(
      resolve("client/src/research/pages/member/Products.tsx"),
      "utf8",
    );
    expect(source).toContain("getMemberCatalog");
    expect(source).toContain("adaptMemberCatalog");
    expect(source).toContain("MemberCatalogExperience");
    expect(source).not.toContain("listProducts");
    expect(source).not.toContain("getProductPlatform");
    expect(source).not.toContain("toProductCards");
  });
});
