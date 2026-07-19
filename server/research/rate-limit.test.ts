import { beforeEach, describe, expect, it, vi } from "vitest";

// Rate limiting (V3 section 71): durable via the research_rate_limit_hit RPC,
// with an in-memory fixed window as the fallback posture. Plus the email
// canonicalization and disposable-domain bright lines from fraud.ts.

const state = vi.hoisted(() => ({
  configured: true,
  rpcMode: "allow" as "allow" | "deny" | "throw" | "missing",
  rpcCalls: [] as any[],
}));

vi.mock("../supabase", () => ({
  supabaseConfigured: () => state.configured,
  getSupabaseAdmin: () => {
    if (state.rpcMode === "missing") return {};
    return {
      rpc: async (fn: string, args: any) => {
        state.rpcCalls.push({ fn, args });
        if (state.rpcMode === "throw") throw new Error("db down");
        return { data: state.rpcMode === "allow", error: null };
      },
    };
  },
  getSupabaseAnon: () => {
    throw new Error("not used");
  },
}));

import { rateLimitHit } from "./rate-limit";
import { canonicalizeEmail, isDisposableEmail } from "./fraud";

beforeEach(() => {
  state.configured = true;
  state.rpcMode = "allow";
  state.rpcCalls.length = 0;
  delete process.env.RESEARCH_DISPOSABLE_DOMAINS;
});

describe("durable rate limiting", () => {
  it("uses the shared database counter when available", async () => {
    expect(await rateLimitHit("k1", 600, 5)).toBe(true);
    expect(state.rpcCalls).toHaveLength(1);
    expect(state.rpcCalls[0].fn).toBe("research_rate_limit_hit");
    expect(state.rpcCalls[0].args).toEqual({ p_key: "k1", p_window_seconds: 600, p_max_hits: 5 });

    state.rpcMode = "deny";
    expect(await rateLimitHit("k1", 600, 5)).toBe(false);
  });

  it("falls back to the in-memory window when the database call fails", async () => {
    state.rpcMode = "throw";
    const key = `fallback:${Date.now()}`;
    expect(await rateLimitHit(key, 600, 2)).toBe(true);
    expect(await rateLimitHit(key, 600, 2)).toBe(true);
    expect(await rateLimitHit(key, 600, 2)).toBe(false);
  });

  it("falls back when Supabase is unconfigured (never blocks the request path)", async () => {
    state.configured = false;
    const key = `unconfigured:${Date.now()}`;
    expect(await rateLimitHit(key, 600, 1)).toBe(true);
    expect(await rateLimitHit(key, 600, 1)).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });
});

describe("email canonicalization", () => {
  it("collapses case, plus-tags, and gmail dot variants", () => {
    expect(canonicalizeEmail("Person@Example.com")).toBe("person@example.com");
    expect(canonicalizeEmail("person+promo@example.com")).toBe("person@example.com");
    expect(canonicalizeEmail("p.e.r.son+x@gmail.com")).toBe("person@gmail.com");
    expect(canonicalizeEmail("person@googlemail.com")).toBe("person@gmail.com");
  });

  it("does not collapse dots outside gmail", () => {
    expect(canonicalizeEmail("p.erson@example.com")).toBe("p.erson@example.com");
  });
});

describe("disposable domains", () => {
  it("catches known throwaway domains and the env extension", () => {
    expect(isDisposableEmail("x@mailinator.com")).toBe(true);
    expect(isDisposableEmail("x@example.com")).toBe(false);
    process.env.RESEARCH_DISPOSABLE_DOMAINS = "burner.example, other.example";
    expect(isDisposableEmail("x@burner.example")).toBe(true);
    expect(isDisposableEmail("x@Other.Example")).toBe(true);
  });
});
