// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { accountPortalFetch, downloadAccountDocument, loadAccountSubscription } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("customer account API adapter", () => {
  it("sends the verified member bearer token and disables private response caching", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ kind: "ok", data: { value: 1 } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(accountPortalFetch<{ value: number }>("member-token", "/overview")).resolves.toEqual({ kind: "ok", data: { value: 1 } });
    expect(fetchMock).toHaveBeenCalledWith("/api/research/customer-account/overview", expect.objectContaining({
      cache: "no-store",
      credentials: "same-origin",
    }));
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer member-token");
    expect(headers.get("Accept")).toBe("application/json");
  });

  it("does not let a caller override the verified member boundary headers", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ kind: "ok", data: { value: 1 } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    await accountPortalFetch("member-token", "/overview", {
      headers: { Authorization: "Bearer unverified", Accept: "text/html" },
    });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer member-token");
    expect(headers.get("Accept")).toBe("application/json");
  });

  it("does not call the API without a verified member token", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(accountPortalFetch(null, "/overview")).resolves.toEqual({ kind: "denied", reason: "auth_required" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses an ok envelope from a non-ok HTTP response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ kind: "ok", data: { leaked: true } }), {
      status: 500,
      headers: { "content-type": "application/json" },
    })));
    await expect(accountPortalFetch("member-token", "/overview")).resolves.toEqual({ kind: "error" });
  });

  it("fails closed for unsafe document download paths before any fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(downloadAccountDocument("member-token", "https://files.example.invalid/document")).resolves.toBe("error");
    await expect(downloadAccountDocument("member-token", "//attacker.invalid/document")).resolves.toBe("error");
    await expect(downloadAccountDocument("member-token", "/api/research/customer-account/documents/../private")).resolves.toBe("error");
    await expect(downloadAccountDocument("member-token", "/api/research/customer-account/documents/doc-1?raw=1")).resolves.toBe("error");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves a typed 429 denial for the support UI", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      kind: "denied",
      reason: "rate_limited",
    }), {
      status: 429,
      headers: { "content-type": "application/json", "retry-after": "60" },
    })));
    await expect(accountPortalFetch("member-token", "/support", { method: "POST" }))
      .resolves.toEqual({ kind: "denied", reason: "rate_limited" });
  });

  it("keeps known membership truth when only receipt history is unavailable", async () => {
    const membership = {
      state: "active",
      billing: "current",
      planLabel: "Synthetic membership",
      nextRenewalAt: null,
      renewal: { state: "unavailable", nextRenewalAt: null },
      manageUrl: null,
      manualBilling: true,
    } as const;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith("/subscription")) {
        return new Response(JSON.stringify({ kind: "ok", data: { membership, careEnrollment: { sourceState: "unavailable" } } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ kind: "error" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      });
    }));
    await expect(loadAccountSubscription("member-token")).resolves.toEqual({
      kind: "ok",
      data: {
        subscription: { membership, careEnrollment: { sourceState: "unavailable" } },
        billingDocuments: null,
      },
    });
  });
});

