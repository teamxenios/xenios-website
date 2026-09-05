// Capability registry mapping: the frozen shape
// { ok: true, capabilities: { key: { enabled: boolean } } } from
// GET /api/research/capabilities. enabled true -> state "enabled";
// enabled false or a missing key -> the designed presentation defaults
// (PRODUCT_GATES read coming_soon/disabled, provider capabilities read
// pending_credentials). An absent endpoint keeps the defaults.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetCapabilitiesCache,
  fetchCapabilities,
  statusFor,
} from "./capabilities";

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
  vi.useRealTimers();
});

describe("fetchCapabilities against the frozen registry shape", () => {
  it("GETs /api/research/capabilities with the member bearer token", async () => {
    stubFetch(200, { ok: true, capabilities: {} });
    await fetchCapabilities("member-jwt");
    expect(calls[0].url).toBe("/api/research/capabilities");
    expect(
      (calls[0].init.headers as Record<string, string>).Authorization,
    ).toBe("Bearer member-jwt");
    expect(calls[0].init.cache).toBe("no-store");
  });

  it("maps enabled:true to state enabled", async () => {
    stubFetch(200, {
      ok: true,
      capabilities: { product_commerce: { enabled: true } },
    });
    const statuses = await fetchCapabilities("member-jwt");
    expect(statusFor(statuses, "product_commerce").state).toBe("enabled");
  });

  it("keeps the presentation default for enabled:false (product gate reads disabled)", async () => {
    stubFetch(200, {
      ok: true,
      capabilities: {
        product_commerce: { enabled: false },
        quantum_commerce: { enabled: false },
      },
    });
    const statuses = await fetchCapabilities("member-jwt");
    // provider-backed capability default
    expect(statusFor(statuses, "product_commerce").state).toBe(
      "pending_credentials",
    );
    // product gate default
    expect(statusFor(statuses, "quantum_commerce").state).toBe("disabled");
  });

  it("keeps the presentation default for a missing key", async () => {
    stubFetch(200, {
      ok: true,
      capabilities: { product_commerce: { enabled: true } },
    });
    const statuses = await fetchCapabilities("member-jwt");
    expect(statusFor(statuses, "transactional_email").state).toBe(
      "pending_credentials",
    );
    expect(statusFor(statuses, "tracker").state).toBe("disabled");
  });

  it("ignores unknown capability keys rather than inventing entries", async () => {
    stubFetch(200, {
      ok: true,
      capabilities: { not_a_capability: { enabled: true } },
    });
    const statuses = await fetchCapabilities("member-jwt");
    expect(statuses.size).toBe(0);
  });

  it("keeps every default when the endpoint is unavailable", async () => {
    stubFetch(404, {});
    const statuses = await fetchCapabilities("member-jwt");
    expect(statuses.size).toBe(0);
    expect(statusFor(statuses, "product_commerce").state).toBe(
      "pending_credentials",
    );
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

function capabilityResponse(capability?: string, status = 200): Response {
  return new Response(
    JSON.stringify({
      ok: status === 200,
      capabilities: capability ? { [capability]: { enabled: true } } : {},
    }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

function deferredResponse() {
  let resolve!: (value: Response) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Response>((accept, refuse) => {
    resolve = accept;
    reject = refuse;
  });
  return { promise, resolve, reject };
}

describe("capability cache credential isolation", () => {
  it("retains the 60-second memo only for the same credential", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-05T00:00:00Z"));
    const fetch = vi.fn(async () => capabilityResponse("affiliate_payouts"));
    vi.stubGlobal("fetch", fetch);
    await fetchCapabilities("partner-a-token");
    vi.advanceTimersByTime(59_999);
    expect(
      statusFor(await fetchCapabilities("partner-a-token"), "affiliate_payouts")
        .state,
    ).toBe("enabled");
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    await fetchCapabilities("partner-a-token");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not serve A's successful cache to B", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(capabilityResponse("affiliate_payouts"))
      .mockResolvedValueOnce(capabilityResponse());
    vi.stubGlobal("fetch", fetch);
    expect(
      statusFor(await fetchCapabilities("partner-a-token"), "affiliate_payouts")
        .state,
    ).toBe("enabled");
    expect(
      statusFor(await fetchCapabilities("partner-b-token"), "affiliate_payouts")
        .state,
    ).toBe("pending_credentials");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][1].headers).toEqual({
      Authorization: "Bearer partner-b-token",
    });
  });

  it("does not serve an authenticated capability cache to signed-out callers", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(capabilityResponse("affiliate_payouts"))
      .mockResolvedValueOnce(capabilityResponse(undefined, 401));
    vi.stubGlobal("fetch", fetch);
    await fetchCapabilities("partner-a-token");
    const signedOut = await fetchCapabilities(null);
    expect(signedOut.size).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][1].headers).toEqual({});
  });

  it("does not reuse an anonymous result for a later authenticated caller", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(capabilityResponse(undefined, 401))
      .mockResolvedValueOnce(capabilityResponse("affiliate_payouts"));
    vi.stubGlobal("fetch", fetch);
    await fetchCapabilities(null);
    expect(
      statusFor(await fetchCapabilities("partner-a-token"), "affiliate_payouts")
        .state,
    ).toBe("enabled");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each(["resolve", "reject"])(
    "late A %s cannot replace B's newest cache slot",
    async (outcome) => {
      const first = deferredResponse();
      const fetch = vi
        .fn()
        .mockReturnValueOnce(first.promise)
        .mockResolvedValue(capabilityResponse("product_commerce"));
      vi.stubGlobal("fetch", fetch);
      const a = fetchCapabilities("partner-a-token");
      await fetchCapabilities("partner-b-token");
      if (outcome === "resolve")
        first.resolve(capabilityResponse("affiliate_payouts"));
      else first.reject(new Error("Synthetic prior-request failure"));
      await a;
      const cachedB = await fetchCapabilities("partner-b-token");
      expect(statusFor(cachedB, "product_commerce").state).toBe("enabled");
      expect(statusFor(cachedB, "affiliate_payouts").state).toBe(
        "pending_credentials",
      );
      expect(fetch).toHaveBeenCalledTimes(2);
    },
  );

  it("a late success cannot replace the newest request's denied defaults", async () => {
    const first = deferredResponse();
    const fetch = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue(capabilityResponse(undefined, 403));
    vi.stubGlobal("fetch", fetch);
    const a = fetchCapabilities("partner-a-token");
    await fetchCapabilities("partner-b-token");
    first.resolve(capabilityResponse("affiliate_payouts"));
    await a;
    expect((await fetchCapabilities("partner-b-token")).size).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("a reset invalidates both the cached value and earlier in-flight population", async () => {
    const first = deferredResponse();
    const fetch = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue(capabilityResponse());
    vi.stubGlobal("fetch", fetch);
    const old = fetchCapabilities("partner-a-token");
    __resetCapabilitiesCache();
    first.resolve(capabilityResponse("affiliate_payouts"));
    await old;
    expect((await fetchCapabilities("partner-a-token")).size).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("replaces rather than accumulating prior credentials in the single cache slot", async () => {
    const fetch = vi.fn(async () => capabilityResponse());
    vi.stubGlobal("fetch", fetch);
    await fetchCapabilities("partner-a-token");
    await fetchCapabilities("partner-b-token");
    await fetchCapabilities("partner-a-token");
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
