import { afterEach, describe, expect, it } from "vitest";
import { statusRecoveryCrypto } from "./crypto";

const originalSecret = process.env.RESEARCH_SESSION_SECRET;
afterEach(() => {
  if (originalSecret === undefined) delete process.env.RESEARCH_SESSION_SECRET;
  else process.env.RESEARCH_SESSION_SECRET = originalSecret;
});

describe("status recovery credentials", () => {
  it("mints independent 256-bit random session credentials", () => {
    const values = new Set(Array.from({ length: 32 }, () => statusRecoveryCrypto.randomToken()));
    expect(values.size).toBe(32);
    for (const value of values) expect(value).toMatch(/^[A-Za-z0-9_-]{43}$/u);
  });

  it("derives a stable, secret-keyed 256-bit delivery credential per durable event", () => {
    process.env.RESEARCH_SESSION_SECRET = "synthetic-status-recovery-secret-one";
    const first = statusRecoveryCrypto.deliveryToken("a".repeat(64));
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(statusRecoveryCrypto.deliveryToken("a".repeat(64))).toBe(first);
    expect(statusRecoveryCrypto.deliveryToken("b".repeat(64))).not.toBe(first);
    process.env.RESEARCH_SESSION_SECRET = "synthetic-status-recovery-secret-two";
    expect(statusRecoveryCrypto.deliveryToken("a".repeat(64))).not.toBe(first);
  });
});
