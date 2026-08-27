// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { accountPortalFetch, downloadAccountDocument } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("customer account API adapter", () => {
  it("sends the verified member bearer token and disables private response caching", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ kind: "ok", data: { value: 1 } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(accountPortalFetch<{ value: number }>("member-token", "/overview")).resolves.toEqual({ kind: "ok", data: { value: 1 } });
    expect(fetchMock).toHaveBeenCalledWith("/api/research/customer-account/overview", expect.objectContaining({
      cache: "no-store",
      credentials: "same-origin",
      headers: expect.objectContaining({ Authorization: "Bearer member-token" }),
    }));
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
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

