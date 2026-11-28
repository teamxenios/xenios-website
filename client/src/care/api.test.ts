import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";

const authState = vi.hoisted(() => ({
  token: null as string | null,
  recovery: false,
  read: null as null | (() => Promise<{ data: { session: Session | null } }>),
}));

vi.mock("@/lib/supabaseBrowser", () => ({
  getSupabaseBrowser: vi.fn(async () => ({
    auth: {
      getSession: vi.fn(async () => authState.read ? authState.read() : ({
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
    authState.read = null;
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

  it("checks the actual resolved SDK session immediately before a fenced request", async () => {
    const actual = { access_token: "synthetic-current", user: { id: "synthetic-subject" } } as Session;
    authState.read = async () => ({ data: { session: actual } });
    const fence = vi.fn((session) => session === actual);
    await careApiFetch("/api/research/early-access/request-intents/staff", {
      headers: { Authorization: "Bearer obsolete-header" },
    }, fence);
    expect(fence).toHaveBeenCalledWith(actual);
    expect(new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers).get("Authorization"))
      .toBe("Bearer synthetic-current");
  });

  it("cannot borrow a replacement SDK session while the displayed binding still says old", async () => {
    let resolve!: (value: { data: { session: Session | null } }) => void;
    authState.read = () => new Promise((yes) => { resolve = yes; });
    const fence = vi.fn((session: Session | null) => session?.access_token === "synthetic-A");
    const pending = careApiFetch("/api/research/early-access/request-intents/staff/id/start-review", { method: "POST" }, fence);
    await Promise.resolve(); await Promise.resolve();
    const replacement = { access_token: "synthetic-B", user: { id: "replacement-subject" } } as Session;
    resolve({ data: { session: replacement } });
    await expect(pending).rejects.toThrow("current Care session");
    expect(fence).toHaveBeenCalledWith(replacement);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("checks a synchronously revoked binding after the SDK await", async () => {
    let current = true;
    authState.read = async () => {
      current = false;
      return { data: { session: { access_token: "synthetic-A" } as Session } };
    };
    await expect(careApiFetch("/api/care/eligibility", {}, () => current)).rejects.toThrow("current Care session");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["missing", "recovery", "sdk-error"])("never falls back anonymously for a fenced %s session", async (kind) => {
    if (kind === "sdk-error") authState.read = async () => { throw new Error("synthetic provider failure"); };
    else if (kind === "recovery") { authState.token = "synthetic-recovery"; authState.recovery = true; }
    await expect(careApiFetch("/api/care/eligibility", {}, () => true)).rejects.toThrow("current Care session");
    expect(fetch).not.toHaveBeenCalled();
  });
});
