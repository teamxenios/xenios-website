import { createHash, createHmac } from "node:crypto";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { publicLotApiResponseSchema } from "../../../shared/research/quality/public-lot";
import {
  PUBLIC_QUALITY_HMAC_KEY_MAX_LIFETIME_SECONDS,
  PUBLIC_QUALITY_HMAC_ROTATION_SECONDS,
  PUBLIC_QUALITY_RATE_MAX_HITS,
  PUBLIC_QUALITY_RATE_RETENTION_SECONDS,
  PUBLIC_QUALITY_RATE_WINDOW_SECONDS,
  buildPublicQualityReadGuard,
  normalizePublicQualityClientAddress,
  publicQualityHmacKeyVersion,
  publicQualityRateLimitKey,
  trustedPublicQualityClientAddress,
  type PublicQualityDurableRateInput,
  type PublicQualityHmacKey,
  type PublicQualityReadGuardDependencies,
} from "./public-read-guard";

const NOW = Date.parse("2026-08-28T04:30:00.000Z");
const ROTATION_MS = PUBLIC_QUALITY_HMAC_ROTATION_SECONDS * 1000;
const EPOCH_START = Math.floor(NOW / ROTATION_MS) * ROTATION_MS;
const EPOCH_END = EPOCH_START + ROTATION_MS;
const CLIENT_ADDRESS = "198.51.100.22";
const SECRET = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
const KEY: PublicQualityHmacKey = {
  version: publicQualityHmacKeyVersion(EPOCH_START),
  secret: SECRET,
  activeFromMs: EPOCH_START,
  expiresAtMs: EPOCH_END,
};

function dependencies(
  overrides: Partial<PublicQualityReadGuardDependencies> = {},
): PublicQualityReadGuardDependencies {
  return {
    resolveNow: async () => ({ kind: "available", nowMs: NOW }),
    resolveActiveHmacKey: async () => ({
      kind: "available",
      key: KEY,
      previousKey: null,
      nextKey: null,
    }),
    durableHit: async () => ({ kind: "allowed", cleanup: "confirmed" }),
    isTrustedProxyAddress: () => false,
    authorityTimeoutMs: 30,
    ...overrides,
  };
}

function appWith(deps: PublicQualityReadGuardDependencies) {
  const app = express();
  app.get("/public-quality", buildPublicQualityReadGuard(deps), (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

function fakeRequest(remoteAddress: string, forwardedFor?: string) {
  return {
    socket: { remoteAddress },
    headers: forwardedFor === undefined ? {} : { "x-forwarded-for": forwardedFor },
  } as never;
}

function expectAbortedSignal(signal: AbortSignal | null): void {
  expect(signal).not.toBeNull();
  expect((signal as AbortSignal).aborted).toBe(true);
}

describe("public quality read guard: privacy and authority", () => {
  it("refuses construction without clock, key, durable-rate, and trusted-proxy authorities", () => {
    expect(() => buildPublicQualityReadGuard(undefined as never)).toThrow(/dependencies/);
    expect(() => buildPublicQualityReadGuard({
      resolveActiveHmacKey: async () => ({ kind: "unavailable" }),
      durableHit: async () => ({ kind: "unavailable" }),
      isTrustedProxyAddress: () => false,
    } as never)).toThrow(/clock/);
    expect(() => buildPublicQualityReadGuard({
      resolveNow: async () => ({ kind: "unavailable" }),
      durableHit: async () => ({ kind: "unavailable" }),
      isTrustedProxyAddress: () => false,
    } as never)).toThrow(/HMAC key source/);
    expect(() => buildPublicQualityReadGuard({
      resolveNow: async () => ({ kind: "unavailable" }),
      resolveActiveHmacKey: async () => ({ kind: "unavailable" }),
      isTrustedProxyAddress: () => false,
    } as never)).toThrow(/durable rate authority/);
    expect(() => buildPublicQualityReadGuard({
      resolveNow: async () => ({ kind: "unavailable" }),
      resolveActiveHmacKey: async () => ({ kind: "unavailable" }),
      durableHit: async () => ({ kind: "unavailable" }),
    } as never)).toThrow(/trusted proxy authority/);
    expect(() => buildPublicQualityReadGuard(dependencies({ authorityTimeoutMs: 0 })))
      .toThrow(/authorityTimeoutMs/);
  });

  it("uses a keyed, versioned HMAC token—not a naked deterministic hash or raw IP", async () => {
    let input: PublicQualityDurableRateInput | null = null;
    let socketAddress: string | undefined;
    const app = express();
    app.use((req, _res, next) => {
      socketAddress = req.socket.remoteAddress;
      next();
    });
    app.get("/public-quality", buildPublicQualityReadGuard(dependencies({
      durableHit: async (candidate) => {
        input = candidate;
        return { kind: "allowed", cleanup: "confirmed" };
      },
    })), (_req, res) => res.json({ ok: true }));

    const response = await request(app).get("/public-quality");
    expect(response.status).toBe(200);
    const trustedAddress = normalizePublicQualityClientAddress(socketAddress)!;
    const expectedToken = createHmac("sha256", SECRET)
      .update("xenios-public-quality-rate-v1\0", "utf8")
      .update(KEY.version, "utf8")
      .update("\0", "utf8")
      .update(trustedAddress, "utf8")
      .digest("hex");
    expect(input!.keys).toEqual([`research:public-quality:${KEY.version}:${expectedToken}`]);
    expect(input!.keys[0]).not.toContain(trustedAddress);
    expect(input!.keys[0]).not.toContain(CLIENT_ADDRESS);
    expect(input!.keys[0]).not.toContain(
      createHash("sha256").update(trustedAddress).digest("hex"),
    );
    expect(input).toMatchObject({
      windowSeconds: PUBLIC_QUALITY_RATE_WINDOW_SECONDS,
      maxHits: PUBLIC_QUALITY_RATE_MAX_HITS,
      retentionSeconds: PUBLIC_QUALITY_RATE_RETENTION_SECONDS,
    });
    expect(Object.keys(input!).sort()).toEqual([
      "keys",
      "maxHits",
      "retentionSeconds",
      "windowSeconds",
    ]);
  });

  it("canonicalizes equivalent IPv6 and IPv4-mapped forms before HMAC", () => {
    expect(normalizePublicQualityClientAddress("2001:0DB8:0:0:0:0:0:1"))
      .toBe("2001:db8::1");
    expect(publicQualityRateLimitKey("2001:0DB8:0:0:0:0:0:1", KEY))
      .toBe(publicQualityRateLimitKey("2001:db8::1", KEY));
    expect(publicQualityRateLimitKey("::ffff:192.0.2.1", KEY))
      .toBe(publicQualityRateLimitKey("::ffff:c000:201", KEY));
    expect(publicQualityRateLimitKey("::ffff:c000:201", KEY))
      .toBe(publicQualityRateLimitKey("192.0.2.1", KEY));
    expect(normalizePublicQualityClientAddress("fe80::1%25eth0")).toBeNull();
  });

  it("ignores direct spoofed headers and walks only a composition-authorized proxy chain", async () => {
    const directHeaders = new Proxy({ "x-forwarded-for": "203.0.113.250" }, {
      get() { throw new Error("direct forwarding headers must not be read"); },
    });
    expect(trustedPublicQualityClientAddress({
      socket: { remoteAddress: CLIENT_ADDRESS },
      headers: directHeaders,
    } as never, () => false)).toBe(CLIENT_ADDRESS);

    const trusted = new Set(["192.0.2.10", "192.0.2.11"]);
    const authority = (address: string) => trusted.has(address);
    expect(trustedPublicQualityClientAddress(
      fakeRequest("192.0.2.10", "203.0.113.250, 198.51.100.44, 192.0.2.11"),
      authority,
    )).toBe("198.51.100.44");
    expect(trustedPublicQualityClientAddress(
      fakeRequest("192.0.2.10", "198.51.100.44, malformed"),
      authority,
    )).toBeNull();
    expect(trustedPublicQualityClientAddress(
      fakeRequest("192.0.2.10"),
      authority,
    )).toBeNull();

    const keys: string[] = [];
    const app = appWith(dependencies({
      durableHit: async (input) => {
        keys.push(input.keys[0]);
        return { kind: "allowed", cleanup: "confirmed" };
      },
    }));
    for (const spoofed of ["203.0.113.10", "192.0.2.99, 203.0.113.10"]) {
      expect((await request(app).get("/public-quality").set("X-Forwarded-For", spoofed)).status)
        .toBe(200);
    }
    expect(new Set(keys).size).toBe(1);
  });

  it("rotates tokens by bounded key version/material and bounds retained tokens", () => {
    const nextKey: PublicQualityHmacKey = {
      ...KEY,
      version: publicQualityHmacKeyVersion(EPOCH_START + ROTATION_MS),
      activeFromMs: EPOCH_START + ROTATION_MS,
      expiresAtMs: EPOCH_END + ROTATION_MS,
      secret: Uint8Array.from({ length: 32 }, (_, index) => 255 - index),
    };
    const first = publicQualityRateLimitKey(CLIENT_ADDRESS, KEY);
    const second = publicQualityRateLimitKey(CLIENT_ADDRESS, nextKey);
    expect(first).not.toBe(second);
    expect(first).toContain(`:${KEY.version}:`);
    expect(second).toContain(`:${nextKey.version}:`);
    expect(PUBLIC_QUALITY_RATE_RETENTION_SECONDS).toBeLessThanOrEqual(
      PUBLIC_QUALITY_HMAC_KEY_MAX_LIFETIME_SECONDS,
    );
    expect(PUBLIC_QUALITY_RATE_RETENTION_SECONDS).toBe(
      PUBLIC_QUALITY_RATE_WINDOW_SECONDS * 2,
    );
  });

  it("pins one deterministic key epoch and atomically overlaps the previous token after rotation", async () => {
    const boundaryNow = EPOCH_START + 30_000;
    const previousKey: PublicQualityHmacKey = {
      version: publicQualityHmacKeyVersion(EPOCH_START - ROTATION_MS),
      secret: Uint8Array.from({ length: 32 }, (_, index) => 200 - index),
      activeFromMs: EPOCH_START - ROTATION_MS,
      expiresAtMs: EPOCH_START,
    };
    let input: PublicQualityDurableRateInput | null = null;
    const response = await request(appWith(dependencies({
      resolveNow: async () => ({ kind: "available", nowMs: boundaryNow }),
      resolveActiveHmacKey: async () => ({
        kind: "available",
        key: KEY,
        previousKey,
        nextKey: null,
      }),
      durableHit: async (candidate) => {
        input = candidate;
        return { kind: "allowed", cleanup: "confirmed" };
      },
    }))).get("/public-quality");
    expect(response.status).toBe(200);
    expect(input!.keys).toHaveLength(2);
    expect(input!.keys[0]).toContain(`:${KEY.version}:`);
    expect(input!.keys[1]).toContain(`:${previousKey.version}:`);

    const missingOverlap = await request(appWith(dependencies({
      resolveNow: async () => ({ kind: "available", nowMs: boundaryNow }),
      resolveActiveHmacKey: async () => ({
        kind: "available",
        key: KEY,
        previousKey: null,
        nextKey: null,
      }),
    }))).get("/public-quality");
    expect(missingOverlap.status).toBe(503);
  });

  it("fails closed when adjacent rotation epochs reuse current HMAC secret material", async () => {
    const durableHit = vi.fn(async () => ({
      kind: "allowed" as const,
      cleanup: "confirmed" as const,
    }));
    const previousKey: PublicQualityHmacKey = {
      version: publicQualityHmacKeyVersion(EPOCH_START - ROTATION_MS),
      secret: Uint8Array.from(SECRET),
      activeFromMs: EPOCH_START - ROTATION_MS,
      expiresAtMs: EPOCH_START,
    };
    const previousReuse = await request(appWith(dependencies({
      resolveNow: async () => ({ kind: "available", nowMs: EPOCH_START + 30_000 }),
      resolveActiveHmacKey: async () => ({
        kind: "available",
        key: KEY,
        previousKey,
        nextKey: null,
      }),
      durableHit,
    }))).get("/public-quality");
    expect(previousReuse.status).toBe(503);
    expect(durableHit).not.toHaveBeenCalled();

    const nextKey: PublicQualityHmacKey = {
      version: publicQualityHmacKeyVersion(EPOCH_END),
      secret: Uint8Array.from(SECRET),
      activeFromMs: EPOCH_END,
      expiresAtMs: EPOCH_END + ROTATION_MS,
    };
    const nextReuse = await request(appWith(dependencies({
      resolveNow: async () => ({ kind: "available", nowMs: EPOCH_END - 30_000 }),
      resolveActiveHmacKey: async () => ({
        kind: "available",
        key: KEY,
        previousKey: null,
        nextKey,
      }),
      durableHit,
    }))).get("/public-quality");
    expect(nextReuse.status).toBe(503);
    expect(durableHit).not.toHaveBeenCalled();
  });

  it("fails closed for rapid version churn, a near-expiry epoch, or expiry during authority resolution", async () => {
    const churnedKeys = [
      { ...KEY, version: "r1-per-request" },
      {
        ...KEY,
        version: publicQualityHmacKeyVersion(EPOCH_START + 1),
        activeFromMs: EPOCH_START + 1,
        expiresAtMs: EPOCH_END + 1,
      },
    ];
    for (const key of churnedKeys) {
      const durableHit = vi.fn(async () => ({ kind: "allowed" as const, cleanup: "confirmed" as const }));
      const response = await request(appWith(dependencies({
        resolveActiveHmacKey: async () => ({
          kind: "available",
          key,
          previousKey: null,
          nextKey: null,
        }),
        durableHit,
      }))).get("/public-quality");
      expect(response.status).toBe(503);
      expect(durableHit).not.toHaveBeenCalled();
    }

    const nearExpiryWithoutOverlap = await request(appWith(dependencies({
      resolveNow: async () => ({ kind: "available", nowMs: EPOCH_END - 30_000 }),
    }))).get("/public-quality");
    expect(nearExpiryWithoutOverlap.status).toBe(503);

    const nextKey: PublicQualityHmacKey = {
      version: publicQualityHmacKeyVersion(EPOCH_END),
      secret: Uint8Array.from({ length: 32 }, (_, index) => 150 - index),
      activeFromMs: EPOCH_END,
      expiresAtMs: EPOCH_END + ROTATION_MS,
    };
    const nearExpiryWithOverlap = await request(appWith(dependencies({
      resolveNow: async () => ({ kind: "available", nowMs: EPOCH_END - 30_000 }),
      resolveActiveHmacKey: async () => ({
        kind: "available",
        key: KEY,
        previousKey: null,
        nextKey,
      }),
    }))).get("/public-quality");
    expect(nearExpiryWithOverlap.status).toBe(200);

    let timeReads = 0;
    const durableHit = vi.fn(async () => ({ kind: "allowed" as const, cleanup: "confirmed" as const }));
    const crossedExpiry = await request(appWith(dependencies({
      resolveNow: async () => ({
        kind: "available",
        nowMs: timeReads++ === 0 ? EPOCH_END - 120_000 : EPOCH_END + 1,
      }),
      resolveActiveHmacKey: async () => ({
        kind: "available",
        key: KEY,
        previousKey: null,
        nextKey,
      }),
      durableHit,
    }))).get("/public-quality");
    expect(crossedExpiry.status).toBe(503);
    expect(timeReads).toBe(2);
    expect(durableHit).not.toHaveBeenCalled();
  });

  it("fails closed when clock, address, key material, or rotation bounds are unavailable", async () => {
    let clockSignal: AbortSignal | null = null;
    let keySignal: AbortSignal | null = null;
    const cases: PublicQualityReadGuardDependencies[] = [
      dependencies({ resolveNow: async () => ({ kind: "unavailable" }) }),
      dependencies({ resolveNow: async () => ({ kind: "available", nowMs: Number.NaN }) }),
      dependencies({
        resolveNow: async (signal) => {
          clockSignal = signal;
          return new Promise(() => undefined);
        },
        authorityTimeoutMs: 5,
      }),
      dependencies({ isTrustedProxyAddress: () => { throw new Error("proxy authority unavailable"); } }),
      dependencies({ resolveActiveHmacKey: async () => ({ kind: "unavailable" }) }),
      dependencies({ resolveActiveHmacKey: async () => ({ kind: "available", key: { ...KEY, secret: new Uint8Array(8) }, previousKey: null, nextKey: null }) }),
      dependencies({ resolveActiveHmacKey: async () => ({ kind: "available", key: { ...KEY, expiresAtMs: NOW }, previousKey: null, nextKey: null }) }),
      dependencies({ resolveActiveHmacKey: async () => ({
        kind: "available",
        key: {
          ...KEY,
          activeFromMs: NOW,
          expiresAtMs: NOW + (PUBLIC_QUALITY_HMAC_KEY_MAX_LIFETIME_SECONDS + 1) * 1000,
        },
        previousKey: null,
        nextKey: null,
      }) }),
      dependencies({
        authorityTimeoutMs: 5,
        resolveActiveHmacKey: async (_nowMs, signal) => {
          keySignal = signal;
          return new Promise(() => undefined);
        },
      }),
    ];
    for (const deps of cases) {
      const durableHit = vi.fn(deps.durableHit);
      const response = await request(appWith({ ...deps, durableHit })).get("/public-quality");
      expect(response.status).toBe(503);
      expect(response.body.code).toBe("public_quality_guard_unavailable");
      expect(publicLotApiResponseSchema.safeParse(response.body).success).toBe(true);
      expect(durableHit).not.toHaveBeenCalled();
    }
    expectAbortedSignal(clockSignal);
    expectAbortedSignal(keySignal);
  });

  it("fails closed when durable rate/time or cleanup authority is unavailable, with no raw IP in output or logs", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let durableSignal: AbortSignal | null = null;
    const decisions: Array<PublicQualityReadGuardDependencies["durableHit"]> = [
      async () => ({ kind: "unavailable" }),
      async () => ({ kind: "allowed", cleanup: "missing" as never }),
      async () => { throw new Error(`durable unavailable for ${CLIENT_ADDRESS}`); },
      async (_input, signal) => {
        durableSignal = signal;
        return new Promise(() => undefined);
      },
    ];
    for (const durableHit of decisions) {
      const response = await request(appWith(dependencies({
        durableHit,
        authorityTimeoutMs: 5,
      }))).get("/public-quality");
      expect(response.status).toBe(503);
      expect(JSON.stringify(response.body)).not.toContain(CLIENT_ADDRESS);
    }
    expect(JSON.stringify([...log.mock.calls, ...warn.mock.calls, ...error.mock.calls]))
      .not.toContain(CLIENT_ADDRESS);
    expectAbortedSignal(durableSignal);
  });

  it("returns a contract-valid no-store 429 only from an authoritative denied decision", async () => {
    const response = await request(appWith(dependencies({
      durableHit: async () => ({ kind: "denied", cleanup: "confirmed" }),
    }))).get("/public-quality");
    expect(response.status).toBe(429);
    expect(response.body.kind).toBe("rate_limited");
    expect(response.body.code).toBe("public_quality_rate_limited");
    expect(publicLotApiResponseSchema.safeParse(response.body).success).toBe(true);
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(JSON.stringify(response.body)).not.toMatch(/ip|address|hmac|key|secret/i);
  });
});
