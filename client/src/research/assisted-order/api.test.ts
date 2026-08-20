import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supabase = vi.hoisted(() => ({ getSupabaseBrowser: vi.fn() }));

vi.mock("@/lib/supabaseBrowser", () => supabase);

import {
  loadAssistedOrderAdminList,
  loadAssistedOrderCatalog,
  submitAssistedOrder,
} from "./api";

function sessionClient(accessToken: string | null) {
  return {
    auth: {
      getSession: async () => ({
        data: { session: accessToken ? { access_token: accessToken } : null },
      }),
    },
  };
}

function okResponse(body: unknown = { items: [] }) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

function headersOf(call: number): Record<string, string> {
  return (fetchMock.mock.calls[call][1] as RequestInit).headers as Record<
    string,
    string
  >;
}

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(okResponse());
  vi.stubGlobal("fetch", fetchMock);
  supabase.getSupabaseBrowser.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("assisted order api authorization", () => {
  it("presents the member bearer when a Supabase session exists", async () => {
    supabase.getSupabaseBrowser.mockResolvedValue(sessionClient("member-jwt"));
    await loadAssistedOrderCatalog({ page: 1 });
    expect(headersOf(0).authorization).toBe("Bearer member-jwt");
    // Cookies still ride along, so an Early Access session is never displaced.
    expect((fetchMock.mock.calls[0][1] as RequestInit).credentials).toBe("include");
  });

  it("sends no authorization header for an Early Access cookie customer", async () => {
    supabase.getSupabaseBrowser.mockResolvedValue(sessionClient(null));
    await loadAssistedOrderCatalog({ page: 1 });
    expect(headersOf(0).authorization).toBeUndefined();
    expect((fetchMock.mock.calls[0][1] as RequestInit).credentials).toBe("include");
  });

  it("still works when Supabase is unconfigured or unreachable", async () => {
    supabase.getSupabaseBrowser.mockResolvedValue(null);
    await loadAssistedOrderCatalog({ page: 1 });
    expect(headersOf(0).authorization).toBeUndefined();

    supabase.getSupabaseBrowser.mockRejectedValue(new Error("offline"));
    await expect(loadAssistedOrderCatalog({ page: 1 })).resolves.toBeDefined();
    expect(headersOf(1).authorization).toBeUndefined();
  });

  it("carries the bearer on submit too, not only on reads", async () => {
    supabase.getSupabaseBrowser.mockResolvedValue(sessionClient("member-jwt"));
    fetchMock.mockResolvedValue(okResponse({ publicReference: "XRR-1" }));
    await submitAssistedOrder({
      idempotencyKey: "k",
      contact: {
        fullLegalName: "A",
        email: "a@example.org",
        mobilePhone: "5550102000",
        ageConfirmed: true,
        shippingAddress: {
          line1: "1",
          city: "B",
          region: "C",
          postalCode: "1",
          countryCode: "US",
        },
        billingSameAsShipping: true,
      },
      agreements: [],
      lines: [],
    });
    expect(headersOf(0).authorization).toBe("Bearer member-jwt");
  });

  it("never lets a member session override an explicit admin token", async () => {
    supabase.getSupabaseBrowser.mockResolvedValue(sessionClient("member-jwt"));
    await loadAssistedOrderAdminList("admin-token", {});
    expect(headersOf(0).authorization).toBe("Bearer admin-token");
  });
});
