import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  hashPrivateAccessPassword,
  parsePrivateAccessPasswordHash,
  verifyPrivateAccessPassword,
} from "./private-access-password";

// A fixed low-cost parameter set keeps the suite fast. The canonical-format
// tests below pin the real production parameters separately.
const FAST = { n: 16_384, r: 8, p: 1 } as const;

describe("private access password hash format", () => {
  it("round-trips a correct password", () => {
    const stored = hashPrivateAccessPassword("correct horse battery staple", FAST);
    expect(verifyPrivateAccessPassword("correct horse battery staple", stored)).toBe(true);
  });

  it("refuses a wrong password", () => {
    const stored = hashPrivateAccessPassword("correct horse battery staple", FAST);
    expect(verifyPrivateAccessPassword("Correct horse battery staple", stored)).toBe(false);
    expect(verifyPrivateAccessPassword("", stored)).toBe(false);
    expect(verifyPrivateAccessPassword("correct horse battery stapl", stored)).toBe(false);
  });

  it("parses the exact operator script format", () => {
    // Shape emitted by Generate-XeniosEarlyAccessSecrets.ps1:
    // scrypt$32768$8$1$<16-byte salt b64url>$<64-byte digest b64url>
    const salt = randomBytes(16);
    const stored = hashPrivateAccessPassword("a-launch-password-12", { n: 32_768, r: 8, p: 1, salt });
    const parts = stored.split("$");
    expect(parts).toHaveLength(6);
    expect(parts[0]).toBe("scrypt");
    expect(parts[1]).toBe("32768");
    expect(parts[2]).toBe("8");
    expect(parts[3]).toBe("1");
    expect(Buffer.from(parts[4], "base64url")).toHaveLength(16);
    expect(Buffer.from(parts[5], "base64url")).toHaveLength(64);
    // Production parameters must actually verify, which also proves maxmem is
    // set high enough: N=32768 with r=8 exceeds Node's 32 MB default.
    expect(verifyPrivateAccessPassword("a-launch-password-12", stored)).toBe(true);
  });

  it("FAILS CLOSED on an unconfigured or malformed hash", () => {
    // A deployment that forgot the variable, or fat-fingered it, must refuse
    // everyone rather than admit everyone.
    for (const bad of [
      undefined,
      null,
      "",
      "not-a-hash",
      "scrypt$32768$8$1$onlyfivefields",
      "scrypt$32768$8$1$salt$digest$extra",
      "bcrypt$32768$8$1$AAAA$BBBB",
      "scrypt$0$8$1$AAAA$BBBB",
      "scrypt$32768$8$1$$",
      123,
      {},
      [],
    ]) {
      expect(verifyPrivateAccessPassword("anything", bad)).toBe(false);
      expect(parsePrivateAccessPasswordHash(bad)).toBeNull();
    }
  });

  it("refuses a non-power-of-two or out-of-bounds cost", () => {
    const salt = randomBytes(16).toString("base64url");
    const digest = randomBytes(64).toString("base64url");
    // Not a power of two.
    expect(parsePrivateAccessPasswordHash(`scrypt$32767$8$1$${salt}$${digest}`)).toBeNull();
    // Below the floor: a hostile value must not weaken the cost.
    expect(parsePrivateAccessPasswordHash(`scrypt$1024$8$1$${salt}$${digest}`)).toBeNull();
    // Absurd values must not become a memory-exhaustion primitive.
    expect(parsePrivateAccessPasswordHash(`scrypt$2097152$8$1$${salt}$${digest}`)).toBeNull();
    expect(parsePrivateAccessPasswordHash(`scrypt$32768$64$1$${salt}$${digest}`)).toBeNull();
  });

  it("refuses non-canonical base64url so one hash has exactly one encoding", () => {
    const salt = randomBytes(16);
    const stored = hashPrivateAccessPassword("a-launch-password-12", { n: 16_384, r: 8, p: 1, salt });
    const parts = stored.split("$");
    // Standard base64 alphabet instead of base64url, and padded forms, are
    // rejected outright rather than silently normalized.
    const padded = `${parts[0]}$${parts[1]}$${parts[2]}$${parts[3]}$${parts[4]}=$${parts[5]}`;
    expect(parsePrivateAccessPasswordHash(padded)).toBeNull();
  });

  it("refuses a wrong-length salt or digest", () => {
    const shortSalt = randomBytes(8).toString("base64url");
    const digest = randomBytes(64).toString("base64url");
    expect(parsePrivateAccessPasswordHash(`scrypt$16384$8$1$${shortSalt}$${digest}`)).toBeNull();
    const salt = randomBytes(16).toString("base64url");
    const shortDigest = randomBytes(32).toString("base64url");
    expect(parsePrivateAccessPasswordHash(`scrypt$16384$8$1$${salt}$${shortDigest}`)).toBeNull();
  });

  it("refuses a non-string presented password and bounds its length", () => {
    const stored = hashPrivateAccessPassword("a-launch-password-12", FAST);
    for (const bad of [undefined, null, 123, {}, [], Buffer.from("x")]) {
      expect(verifyPrivateAccessPassword(bad, stored)).toBe(false);
    }
    // An oversized presented password is refused before key derivation, so it
    // cannot be used to force expensive work.
    expect(verifyPrivateAccessPassword("x".repeat(2_000), stored)).toBe(false);
  });

  it("uses a distinct salt per hash, so two identical passwords differ", () => {
    const a = hashPrivateAccessPassword("same-password-1234", FAST);
    const b = hashPrivateAccessPassword("same-password-1234", FAST);
    expect(a).not.toBe(b);
    expect(verifyPrivateAccessPassword("same-password-1234", a)).toBe(true);
    expect(verifyPrivateAccessPassword("same-password-1234", b)).toBe(true);
  });
});
