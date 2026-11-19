import { describe, expect, it, vi } from "vitest";
import {
  EARLY_ACCESS_SESSION_IDENTITY_ENV,
  earlyAccessCustomerRefForSession,
  earlyAccessSessionIdentityEnabled,
  SessionScopedEarlyAccessIdentityDirectory,
} from "./session-scoped-identity";
import { buildEarlyAccessPersistence } from "../persistence/production-deps";

describe("session-scoped Early Access identity", () => {
  it("derives a stable opaque customer reference per durable session", () => {
    const a = earlyAccessCustomerRefForSession("a".repeat(64));
    expect(a).toMatch(/^eac_[a-f0-9]{32}$/);
    expect(earlyAccessCustomerRefForSession("a".repeat(64))).toBe(a);
    expect(earlyAccessCustomerRefForSession("b".repeat(64))).not.toBe(a);
  });
  it("refuses an invalid or unauthenticated session", async () => {
    const directory = new SessionScopedEarlyAccessIdentityDirectory({
      resolveSession: async () => ({ authenticated: false }), readSessionId: () => "a".repeat(64),
    });
    expect(await directory.resolve({ cookieHeader: "x" })).toBeNull();
  });
  it("uses an existing stronger identity before the session fallback", async () => {
    const existing = { customerRef: `eac_${"1".repeat(32)}`, displayName: "Named", boundBy: "verified_link" as const };
    const primary = { resolve: vi.fn(async () => existing) };
    const directory = new SessionScopedEarlyAccessIdentityDirectory({
      resolveSession: async () => ({ authenticated: true }), readSessionId: () => "a".repeat(64), primary,
    });
    expect(await directory.resolve({ cookieHeader: "x" })).toEqual(existing);
  });
  it("creates a session_code identity without an email or body customer id", async () => {
    const directory = new SessionScopedEarlyAccessIdentityDirectory({
      resolveSession: async () => ({ authenticated: true }), readSessionId: () => "a".repeat(64),
    });
    const customer = await directory.resolve({ cookieHeader: "x" });
    expect(customer?.boundBy).toBe("session_code");
    expect(customer?.customerRef).toMatch(/^eac_[a-f0-9]{32}$/);
  });

  it("carries the continuity reference as an alias when a stronger identity wins", async () => {
    const secret = "unit-test-secret";
    const { mintEarlyAccessContinuityCookie, readEarlyAccessContinuityToken, earlyAccessCustomerRefForContinuity } =
      await import("./session-scoped-identity");
    const minted = mintEarlyAccessContinuityCookie(secret);
    const cookieHeader = minted.setCookie.split(";")[0];
    const token = readEarlyAccessContinuityToken(cookieHeader, secret);
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    const continuityRef = earlyAccessCustomerRefForContinuity(token as string);

    const verified = {
      customerRef: `eac_${"9".repeat(32)}`,
      displayName: "Verified",
      boundBy: "verified_link" as const,
    };
    const directory = new SessionScopedEarlyAccessIdentityDirectory({
      resolveSession: async () => ({ authenticated: true }),
      readSessionId: () => "a".repeat(64),
      primary: { resolve: async () => verified },
      continuitySecret: secret,
    });
    const resolved = await directory.resolve({ cookieHeader });
    // The verified identity stays primary; the continuity reference rides as
    // a server-derived alias so earlier orders remain readable.
    expect(resolved?.customerRef).toBe(verified.customerRef);
    expect(resolved?.aliasRefs).toEqual([continuityRef]);

    // A forged credential contributes NOTHING: no alias, no identity.
    const forgedHeader = `xenios_ea_customer=v1.${"a".repeat(64)}.${"b".repeat(64)}`;
    expect(readEarlyAccessContinuityToken(forgedHeader, secret)).toBeNull();
    const forgedResolved = await directory.resolve({ cookieHeader: forgedHeader });
    expect(forgedResolved?.aliasRefs).toBeUndefined();
  });

  it("refuses to derive from a session id outside the accepted length bounds", () => {
    expect(earlyAccessCustomerRefForSession("short")).toBeNull();
    expect(earlyAccessCustomerRefForSession("a".repeat(15))).toBeNull();
    expect(earlyAccessCustomerRefForSession("a".repeat(257))).toBeNull();
    expect(earlyAccessCustomerRefForSession("a".repeat(16))).toMatch(/^eac_[a-f0-9]{32}$/);
  });

  it("attests the original legacy guest independently of stronger primary or arbitrary aliases", async () => {
    const primary = { resolve: vi.fn(async () => ({ customerRef: `eac_${"9".repeat(32)}`, displayName: "Verified",
      boundBy: "verified_link" as const, aliasRefs: [`eac_${"8".repeat(32)}`] })) };
    const directory = new SessionScopedEarlyAccessIdentityDirectory({
      resolveSession: async () => ({ authenticated: true, expiresAtEpochMs: 2_000 }),
      readSessionId: () => "a".repeat(64), now: () => 1_000, primary,
    });
    expect(await directory.readOriginalGuestProof("canonical-cookie")).toEqual({
      customerRef: earlyAccessCustomerRefForSession("a".repeat(64)), sessionHandleHash: "a".repeat(64), expiresAtEpochMs: 2_000,
    });
    expect(primary.resolve).not.toHaveBeenCalled();
    expect((await directory.resolve({ cookieHeader: "canonical-cookie" }))?.customerRef).toBe(`eac_${"9".repeat(32)}`);
  });

  it.each([undefined, null, NaN, Infinity, 1_000, 999, 8_640_000_000_000_001])("requires an actual finite future row expiry, not a boolean/TTL: %j", async expiresAtEpochMs => {
    const readSessionId = vi.fn(() => "a".repeat(64));
    const directory = new SessionScopedEarlyAccessIdentityDirectory({
      resolveSession: async () => ({ authenticated: true, expiresAtEpochMs }), readSessionId, now: () => 1_000,
    });
    expect(await directory.readOriginalGuestProof("cookie")).toBeNull();
  });

  it("does not consult the signed reader after failed liveness and contains resolver diagnostics", async () => {
    const resolveSession = vi.fn(async () => ({ authenticated: false, expiresAtEpochMs: 2_000 }));
    const readSessionId = vi.fn(() => "a".repeat(64));
    const directory = new SessionScopedEarlyAccessIdentityDirectory({ resolveSession, readSessionId, now: () => 1_000 });
    expect(await directory.readOriginalGuestProof("cookie")).toBeNull(); expect(readSessionId).not.toHaveBeenCalled();
    resolveSession.mockRejectedValueOnce(new Error("PRIVATE_SESSION_DIAGNOSTIC"));
    expect(await directory.readOriginalGuestProof("cookie")).toBeNull(); expect(readSessionId).not.toHaveBeenCalled();
  });

  it.each(["a".repeat(16), "a".repeat(65), "A".repeat(64), "not-a-canonical-hash"])("does not attest a noncanonical H1: %j", async hash => {
    const directory = new SessionScopedEarlyAccessIdentityDirectory({
      resolveSession: async () => ({ authenticated: true, expiresAtEpochMs: 2_000 }), readSessionId: () => hash, now: () => 1_000,
    });
    expect(await directory.readOriginalGuestProof("cookie")).toBeNull();
  });
});

describe("the session-identity kill switch", () => {
  it("enables ONLY on the exact string \"true\"", () => {
    expect(earlyAccessSessionIdentityEnabled({ [EARLY_ACCESS_SESSION_IDENTITY_ENV]: "true" })).toBe(
      true,
    );
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["false", "false"],
    ["numeric truthiness", "1"],
    ["uppercase", "TRUE"],
    ["mixed case", "True"],
    ["yes", "yes"],
    ["padded", " true"],
    ["on", "on"],
  ])("stays DISABLED for %s", (_name, value) => {
    const env: Record<string, string> = {};
    if (value !== undefined) env[EARLY_ACCESS_SESSION_IDENTITY_ENV] = value;
    expect(earlyAccessSessionIdentityEnabled(env)).toBe(false);
  });

  it("flows into the LOCAL (memory) composition with the same semantics", () => {
    // No Supabase configuration: the memory mode. The switch must behave
    // identically to production, so a local rehearsal rehearses the truth.
    const enabled = buildEarlyAccessPersistence({
      [EARLY_ACCESS_SESSION_IDENTITY_ENV]: "true",
    } as NodeJS.ProcessEnv);
    expect(enabled.mode).toBe("memory");
    expect(enabled.options.sessionIdentity).toBe(true);

    const disabled = buildEarlyAccessPersistence({
      [EARLY_ACCESS_SESSION_IDENTITY_ENV]: "TRUE",
    } as NodeJS.ProcessEnv);
    expect(disabled.options.sessionIdentity).toBe(false);
  });

  it("flows into the PRODUCTION (durable) composition and states itself in the boot log", () => {
    const durableEnv = (value: string | undefined): NodeJS.ProcessEnv => {
      const env: Record<string, string> = {
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key-for-tests",
        RESEARCH_EARLY_ACCESS_OWNER_ID: "00000000-0000-4000-8000-000000000000",
      };
      if (value !== undefined) env[EARLY_ACCESS_SESSION_IDENTITY_ENV] = value;
      return env as NodeJS.ProcessEnv;
    };
    const fakeQuery = async () => null;

    const enabled = buildEarlyAccessPersistence(durableEnv("true"), fakeQuery);
    expect(enabled.mode).toBe("durable");
    expect(enabled.options.sessionIdentity).toBe(true);
    expect(enabled.warnings.join("\n")).toContain("Session-scoped identity is ENABLED");

    for (const wrong of [undefined, "", "false", "1", "TRUE", "yes"]) {
      const disabled = buildEarlyAccessPersistence(durableEnv(wrong), fakeQuery);
      expect(disabled.mode).toBe("durable");
      expect(disabled.options.sessionIdentity, `value ${String(wrong)} must disable`).toBe(false);
      expect(disabled.warnings.join("\n")).toContain("Session-scoped identity is DISABLED");
    }

    // The boot line states the stance and nothing secret: no key material, no
    // session ids, no customer references.
    for (const line of enabled.warnings) {
      expect(line).not.toContain("service-role-key-for-tests");
      expect(line).not.toMatch(/eac_[a-f0-9]/);
    }
  });
});
