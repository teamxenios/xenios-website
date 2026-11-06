import { describe, expect, it, vi, afterEach } from "vitest";
import { MASTER_OFFERING_CATALOG_ERROR_CODES } from "@shared/research/master-offerings/contract";
import {
  MASTER_OFFERING_STATE_COPY,
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

  it("reads the server's not-found answer for a product as not found, not as an outage", async () => {
    // A stale product link, or a mistyped one whose slug is still well
    // formed, answers 404 with the catalog's own machine code. Every 404 used
    // to read as unavailable, so the page showed "The full catalog is not
    // available yet" and a retry button for a product that is simply not
    // there.
    globalThis.fetch = respond(404, {
      ok: false,
      code: "master_offerings_not_found",
    }) as unknown as typeof fetch;
    const result = await getMasterOfferingDetail("token", "research_vials", "renamed-product");
    expect(result).toEqual({ kind: "denied", code: "master_offerings_not_found" });
    expect(toMasterOfferingSurfaceState(result)).toBe("not_found");
    expect(MASTER_OFFERING_STATE_COPY.not_found.title).toBe("That product is not in the catalog.");
  });

  it("keeps an HTML, foreign-code or sibling-code 404 on the detail path as unavailable", async () => {
    // Only the catalog's own not-found code is a missing record. An HTML 404
    // or a code outside the taxonomy still means the API is not there, and
    // the page must not tell a member a product does not exist on that
    // evidence.
    globalThis.fetch = respond(
      404,
      "<!doctype html><html></html>",
      "text/html",
    ) as unknown as typeof fetch;
    expect((await getMasterOfferingDetail("token", "research_vials", "bpc-157")).kind).toBe(
      "unavailable",
    );
    globalThis.fetch = respond(404, {
      ok: false,
      code: "some_other_code",
    }) as unknown as typeof fetch;
    expect((await getMasterOfferingDetail("token", "research_vials", "bpc-157")).kind).toBe(
      "unavailable",
    );
    // A sibling code from the catalog's own taxonomy is not the not-found
    // denial either: only master_offerings_not_found is a missing record, so
    // the opt-in must stay a single code rather than the whole taxonomy.
    globalThis.fetch = respond(404, {
      ok: false,
      code: "master_offerings_invalid_request",
    }) as unknown as typeof fetch;
    expect((await getMasterOfferingDetail("token", "research_vials", "bpc-157")).kind).toBe(
      "unavailable",
    );
  });

  it("keeps a list 404 as unavailable, never as not found", async () => {
    globalThis.fetch = respond(404, {
      ok: false,
      code: "master_offerings_not_found",
    }) as unknown as typeof fetch;
    const result = await getMasterOfferingCatalog("token");
    expect(result.kind).toBe("unavailable");
    expect(toMasterOfferingSurfaceState(result)).toBe("unavailable");
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
