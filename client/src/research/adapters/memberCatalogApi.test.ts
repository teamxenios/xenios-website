import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getMemberCatalog,
  getMemberProductDetail,
} from "./memberCatalogApi";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("member catalog API adapter", () => {
  it("uses the canonical private list/detail routes with bearer auth and no-store", async () => {
    const fetch = vi.fn(async () => ({
      status: 503,
      ok: false,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ ok: false, code: "member_catalog_unavailable" }),
    }));
    vi.stubGlobal("fetch", fetch);

    await getMemberCatalog("member-token");
    await getMemberProductDetail("member-token", "a product/x");

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "/api/research/member/products",
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        headers: expect.objectContaining({
          Authorization: "Bearer member-token",
        }),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/research/member/products/a%20product%2Fx",
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
      }),
    );
  });
});
