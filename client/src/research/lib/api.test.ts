// lib/api verb tests: apiPatch and apiDelete ride the same request core as
// GET/POST (same envelope, same guards). DELETE sends no body unless one is
// given. The SPA-HTML-200 guard and the denied envelope routing are pinned
// here too, since every adapter depends on them.

import { afterEach, describe, expect, it, vi } from "vitest";
import { apiDelete, apiGet, apiPatch } from "./api";

type Call = { url: string; init: RequestInit };
const calls: Call[] = [];

function stubFetch(status: number, body: unknown, contentType = "application/json") {
  calls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return {
        status,
        ok: status >= 200 && status < 300,
        headers: new Headers({ "content-type": contentType }),
        json: async () => {
          if (body === undefined) throw new Error("no body");
          return body;
        },
      };
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const headers = () => calls[0].init.headers as Record<string, string>;

describe("apiPatch", () => {
  it("sends PATCH with a JSON body, content type, and the bearer token", async () => {
    stubFetch(200, { ok: true, cart: {} });
    const result = await apiPatch<{ ok: true; cart: object }>("/api/x", { quantity: 2 }, "tok");
    expect(result).toEqual({ kind: "ok", data: { ok: true, cart: {} } });
    expect(calls[0].init.method).toBe("PATCH");
    expect(calls[0].init.body).toBe(JSON.stringify({ quantity: 2 }));
    expect(headers()["Content-Type"]).toBe("application/json");
    expect(headers().Authorization).toBe("Bearer tok");
    expect(calls[0].init.cache).toBe("no-store");
  });

  it("routes a coded denial through the denied kind", async () => {
    stubFetch(200, { ok: false, code: "quantity_invalid" });
    expect(await apiPatch("/api/x", { quantity: 0 }, "tok")).toEqual({
      kind: "denied",
      code: "quantity_invalid",
    });
  });
});

describe("apiDelete", () => {
  it("sends DELETE with NO body and NO content type by default", async () => {
    stubFetch(200, { ok: true });
    const result = await apiDelete("/api/x/1", "tok");
    expect(result).toEqual({ kind: "ok", data: { ok: true } });
    expect(calls[0].init.method).toBe("DELETE");
    expect(calls[0].init.body).toBeUndefined();
    expect(headers()["Content-Type"]).toBeUndefined();
    expect(headers().Authorization).toBe("Bearer tok");
  });

  it("sends a body only when one is explicitly given", async () => {
    stubFetch(200, { ok: true });
    await apiDelete("/api/x/1", "tok", { reason: "cleanup" });
    expect(calls[0].init.body).toBe(JSON.stringify({ reason: "cleanup" }));
    expect(headers()["Content-Type"]).toBe("application/json");
  });

  it("routes a coded 403 through the denied kind", async () => {
    stubFetch(403, { ok: false, code: "forbidden" });
    expect(await apiDelete("/api/x/1", "tok")).toEqual({ kind: "denied", code: "forbidden" });
  });
});

describe("shared request guards (unchanged behavior)", () => {
  it("keeps the SPA-HTML-200 guard: a 200 without JSON content type is unavailable", async () => {
    stubFetch(200, {}, "text/html");
    expect(await apiGet("/api/unpublished")).toEqual({ kind: "unavailable" });
    stubFetch(200, {}, "text/html");
    expect(await apiPatch("/api/unpublished", {})).toEqual({ kind: "unavailable" });
    stubFetch(200, {}, "text/html");
    expect(await apiDelete("/api/unpublished")).toEqual({ kind: "unavailable" });
  });

  it.each([404, 501, 503])("maps %i to unavailable for the new verbs too", async (status) => {
    stubFetch(status, {});
    expect(await apiPatch("/api/x", {})).toEqual({ kind: "unavailable" });
    stubFetch(status, {});
    expect(await apiDelete("/api/x")).toEqual({ kind: "unavailable" });
  });
});
