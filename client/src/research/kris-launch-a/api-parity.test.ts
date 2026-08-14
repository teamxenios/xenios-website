import { describe, expect, it } from "vitest";
import {
  KRIS_CATALOG_DETAIL_ROUTE,
  KRIS_CATALOG_LIST_ROUTE,
} from "../../../../server/research/kris-launch-a/routes";
import { KRIS_API_BASE, krisCatalogUrl, krisDetailUrl } from "./integration-packet";

/**
 * The client's URLs held against the server's OWN route table constants.
 *
 * This surface shipped once with the two sides built against the same
 * contract but different paths: the server mounted /v1/catalog and
 * /v1/products/:slug while the browser bundle requested /catalog and
 * /items/:family/:slug, so every request died at the research wall and the
 * member read a broken catalog. Each side's tests passed, because each side
 * pinned only itself.
 *
 * This test is the cross-side pin. It imports the server's exported route
 * constants, the exact strings the composition root registers, and holds the
 * client builders to them, so the next path move on either side fails here
 * before it can ship as a catalog nobody can load.
 */
describe("client URLs match the server route table", () => {
  it("the list request is the mounted list route", () => {
    expect(krisCatalogUrl()).toBe(KRIS_CATALOG_LIST_ROUTE);
  });

  it("the detail request instantiates the mounted detail pattern", () => {
    const url = krisDetailUrl("supplements", "some-slug");
    const pattern = new RegExp(
      "^" + KRIS_CATALOG_DETAIL_ROUTE.replace(":slug", "[^/]+") + "$",
    );
    expect(url).toMatch(pattern);
    expect(url).toBe(KRIS_CATALOG_DETAIL_ROUTE.replace(":slug", "some-slug"));
  });

  it("both mounted routes live under the client's base", () => {
    expect(KRIS_CATALOG_LIST_ROUTE.startsWith(KRIS_API_BASE + "/")).toBe(true);
    expect(KRIS_CATALOG_DETAIL_ROUTE.startsWith(KRIS_API_BASE + "/")).toBe(true);
  });
});
