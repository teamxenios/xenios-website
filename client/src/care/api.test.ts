import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  token: null as string | null,
  recovery: false,
}));

vi.mock("@/lib/supabaseBrowser", () => ({
  getSupabaseBrowser: vi.fn(async () => ({
    auth: {
      getSession: vi.fn(async () => ({
        data: {
          session: authState.token
            ? { access_token: authState.token }
            : null,
        },
      })),
    },
  })),
  isRecoveryAccessToken: vi.fn(() => authState.recovery),
}));

import { careApiFetch } from "./api";

describe("Care browser authentication boundary", () => {
  beforeEach(() => {
    authState.token = null;
    authState.recovery = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 200 })),
    );
  });

  it("attaches only the current Supabase bearer session", async () => {
    authState.token = "member-token";
    await careApiFetch("/api/care/eligibility");
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer member-token",
    );
    expect(init?.credentials).toBe("same-origin");
    expect(init?.cache).toBe("no-store");
  });

  it("never attaches a recovery-purpose credential", async () => {
    authState.token = "recovery-token";
    authState.recovery = true;
    await careApiFetch("/api/care/eligibility");
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(new Headers(init?.headers).has("Authorization")).toBe(false);
  });
});
