// Capability registry mapping: the frozen shape
// { ok: true, capabilities: { key: { enabled: boolean } } } from
// GET /api/research/capabilities. enabled true -> state "enabled";
// enabled false or a missing key -> the designed presentation defaults
// (PRODUCT_GATES read coming_soon/disabled, provider capabilities read
// pending_credentials). An absent endpoint keeps the defaults.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetCapabilitiesCache, fetchCapabilities, statusFor } from "./capabilities";

const calls: Array<{ url: string; init: RequestInit }> = [];

function stubFetch(status: number, body: unknown) {
  calls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return {
        status,
        ok: status >= 200 && status < 300,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => body,
      };
    }),
  );
}

beforeEach(() => {
  __resetCapabilitiesCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchCapabilities against the frozen registry shape", () => {
  it("GETs /api/research/capabilities with the member bearer token", async () => {
    stubFetch(200, { ok: true, capabilities: {} });
    await fetchCapabilities("member-jwt");
    expect(calls[0].url).toBe("/api/research/capabilities");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer member-jwt");
    expect(calls[0].init.cache).toBe("no-store");
  });

  it("maps enabled:true to state enabled", async () => {
    stubFetch(200, { ok: true, capabilities: { product_commerce: { enabled: true } } });
    const statuses = await fetchCapabilities("member-jwt");
    expect(statusFor(statuses, "product_commerce").state).toBe("enabled");
  });

  it("keeps the presentation default for enabled:false (product gate reads disabled)", async () => {
    stubFetch(200, {
      ok: true,
      capabilities: { product_commerce: { enabled: false }, quantum_commerce: { enabled: false } },
    });
    const statuses = await fetchCapabilities("member-jwt");
    // provider-backed capability default
    expect(statusFor(statuses, "product_commerce").state).toBe("pending_credentials");
    // product gate default
    expect(statusFor(statuses, "quantum_commerce").state).toBe("disabled");
  });

  it("keeps the presentation default for a missing key", async () => {
    stubFetch(200, { ok: true, capabilities: { product_commerce: { enabled: true } } });
    const statuses = await fetchCapabilities("member-jwt");
    expect(statusFor(statuses, "transactional_email").state).toBe("pending_credentials");
    expect(statusFor(statuses, "tracker").state).toBe("disabled");
  });

  it("ignores unknown capability keys rather than inventing entries", async () => {
    stubFetch(200, { ok: true, capabilities: { not_a_capability: { enabled: true } } });
    const statuses = await fetchCapabilities("member-jwt");
    expect(statuses.size).toBe(0);
  });

  it("keeps every default when the endpoint is unavailable", async () => {
    stubFetch(404, {});
    const statuses = await fetchCapabilities("member-jwt");
    expect(statuses.size).toBe(0);
    expect(statusFor(statuses, "product_commerce").state).toBe("pending_credentials");
  });

  it("keeps every default when the fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("offline");
      }),
    );
    const statuses = await fetchCapabilities(null);
    expect(statuses.size).toBe(0);
  });
});
