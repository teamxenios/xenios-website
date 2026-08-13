// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { MASTER_OFFERING_CATALOG_ERROR_CODES } from "@shared/research/master-offerings/contract";
import {
  MASTER_OFFERING_STATE_COPY,
  downloadMasterOfferingPriceList,
  getMasterOfferingCatalog,
  getMasterOfferingDetail,
  toMasterOfferingSurfaceState,
} from "./catalogApi";

const realFetch = globalThis.fetch;

function respond(
  status: number,
  body: unknown,
  contentType = "application/json",
) {
  return vi.fn(async () =>
    new Response(
      contentType.includes("json") ? JSON.stringify(body) : String(body),
      { status, headers: { "content-type": contentType } },
    ),
  );
}

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe("catalog read adapter", () => {
  it("requests the v2 list and detail paths with the closed filter vocabulary", async () => {
    const fetchMock = respond(200, { ok: true });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await getMasterOfferingCatalog("token", {
      q: "bpc",
      families: ["research_vials"],
      page: 2,
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/research/catalog-display/v2/catalog?q=bpc&families=research_vials&page=2",
    );

    await getMasterOfferingDetail("token", "research_vials", "bpc-157");
    expect(fetchMock.mock.calls[1][0]).toBe(
      "/api/research/catalog-display/v2/products/research_vials/bpc-157",
    );
  });

  it("reads an unmounted route as unavailable, not as an empty catalog", async () => {
    // The prepared routes are deliberately not mounted, so today they fall
    // through to the SPA catch-all and answer 200 with the app shell. An empty
    // catalog would read as "we sell nothing"; unavailable is the truth.
    globalThis.fetch = respond(
      200,
      "<!doctype html><html></html>",
      "text/html",
    ) as unknown as typeof fetch;
    const result = await getMasterOfferingCatalog(null);
    expect(result.kind).toBe("unavailable");
    expect(toMasterOfferingSurfaceState(result)).toBe("unavailable");
  });
});

describe("private price-list adapter", () => {
  it("fetches the server-authored blob with the member bearer token", async () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    const createObjectURL = vi.fn(() => "blob:private-price-list");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
    const fetchMock = vi.fn(async () =>
      new Response("offering,price\r\nBPC-157,$99.00\r\n", {
        status: 200,
        headers: { "content-type": "text/csv; charset=utf-8" },
      }),
    );

    const result = await downloadMasterOfferingPriceList(
      "member-secret",
      { q: "bpc", families: ["research_vials"] },
      "csv",
      fetchMock as unknown as typeof fetch,
    );

    expect(result).toEqual({
      ok: true,
      filename: "xenios-research-price-list.csv",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/research/catalog-display/v2/price-list?q=bpc&families=research_vials&format=csv",
      {
        method: "GET",
        credentials: "same-origin",
        headers: { Authorization: "Bearer member-secret" },
      },
    );
    expect(click).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:private-price-list");
  });

  it("does not make an export request without a member token", async () => {
    const fetchMock = vi.fn();
    expect(
      await downloadMasterOfferingPriceList(
        null,
        {},
        "json",
        fetchMock as unknown as typeof fetch,
      ),
    ).toEqual({ ok: false, reason: "auth_required" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses an HTML SPA fallback instead of saving it as a price list", async () => {
    const fetchMock = vi.fn(async () =>
      new Response("<!doctype html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );
    expect(
      await downloadMasterOfferingPriceList(
        "member-secret",
        {},
        "csv",
        fetchMock as unknown as typeof fetch,
      ),
    ).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("surface state mapping", () => {
  it("separates a restricted member from a signed-out one", () => {
    expect(
      toMasterOfferingSurfaceState({
        kind: "denied",
        code: "master_offerings_launch_restricted",
      }),
    ).toBe("restricted");
    expect(
      toMasterOfferingSurfaceState({
        kind: "unauthorized",
        code: "master_offerings_auth_required",
      }),
    ).toBe("unauthorized");
  });

  it("maps every code in the closed taxonomy to a state with copy", () => {
    for (const code of MASTER_OFFERING_CATALOG_ERROR_CODES) {
      const state = toMasterOfferingSurfaceState({ kind: "error", code });
      expect(state).not.toBe("ok");
      expect(state).not.toBe("loading");
      expect(MASTER_OFFERING_STATE_COPY[state].title.trim()).toBeTruthy();
    }
  });

  it("falls back to the state the HTTP class implies for an unknown code", () => {
    expect(
      toMasterOfferingSurfaceState({ kind: "denied", code: "something_new" }),
    ).toBe("restricted");
    expect(
      toMasterOfferingSurfaceState({ kind: "error", message: "boom" }),
    ).toBe("error");
    expect(toMasterOfferingSurfaceState({ kind: "unauthorized" })).toBe(
      "unauthorized",
    );
  });

  it("never blames the member in a non-ok state", () => {
    for (const copy of Object.values(MASTER_OFFERING_STATE_COPY)) {
      const text = `${copy.title} ${copy.body}`.toLowerCase();
      expect(text).not.toContain("your fault");
      expect(text).not.toContain("invalid account");
      expect(text).not.toContain("forbidden");
    }
  });
});
