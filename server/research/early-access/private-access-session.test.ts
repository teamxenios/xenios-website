import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  PRIVATE_ACCESS_SESSION_CLOCK_SKEW_SECONDS,
  PRIVATE_ACCESS_SESSION_PURPOSE,
  PRIVATE_ACCESS_SESSION_TTL_SECONDS,
  PRIVATE_ACCESS_SESSION_VERSION,
  issuePrivateAccessSession,
  verifyPrivateAccessPassword,
  verifyPrivateAccessSession,
  type PrivateAccessSessionIssueResult,
} from "./private-access-session";

const ACCESS_PASSWORD = "private-entry-passphrase";
const SESSION_SECRET = "private-session-secret-that-is-not-the-access-password";
const NOW = 2_000_000_000_123;
const NONCE = Buffer.alloc(32, 0x11).toString("base64url");
const OTHER_NONCE = Buffer.alloc(32, 0x22).toString("base64url");
const MAC_DOMAIN = "xenios:research:private-early-access:session-token";

function issue(overrides: Record<string, unknown> = {}): PrivateAccessSessionIssueResult {
  return issuePrivateAccessSession({
    accessPassword: ACCESS_PASSWORD,
    presentedPassword: ACCESS_PASSWORD,
    sessionSecret: SESSION_SECRET,
    now: NOW,
    nonce: NONCE,
    ...overrides,
  });
}

function issuedToken(): string {
  const result = issue();
  if (!result.ok) throw new Error(`fixture issuance failed: ${result.code}`);
  return result.value.token;
}

function verify(token: string, overrides: Record<string, unknown> = {}) {
  return verifyPrivateAccessSession({
    token,
    sessionSecret: SESSION_SECRET,
    now: NOW,
    expectedNonce: NONCE,
    consumedNonces: [],
    ...overrides,
  });
}

function signRawJson(json: string, secret = SESSION_SECRET): string {
  const payload = Buffer.from(json, "utf8").toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(`${MAC_DOMAIN}\0${PRIVATE_ACCESS_SESSION_VERSION}\0${payload}`, "utf8")
    .digest("base64url");
  return `${PRIVATE_ACCESS_SESSION_VERSION}.${payload}.${signature}`;
}

function canonicalPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const iat = Math.floor(NOW / 1_000);
  return {
    v: 1,
    purpose: PRIVATE_ACCESS_SESSION_PURPOSE,
    iat,
    exp: iat + PRIVATE_ACCESS_SESSION_TTL_SECONDS,
    nonce: NONCE,
    ...overrides,
  };
}

describe("private early access password boundary", () => {
  it("accepts an exact password using a detached plain input", () => {
    expect(
      verifyPrivateAccessPassword({
        accessPassword: ACCESS_PASSWORD,
        presentedPassword: ACCESS_PASSWORD,
      }),
    ).toBe(true);
  });

  it("refuses an incorrect, empty, oversized, or non-string password", () => {
    expect(
      verifyPrivateAccessPassword({
        accessPassword: ACCESS_PASSWORD,
        presentedPassword: `${ACCESS_PASSWORD}-wrong`,
      }),
    ).toBe(false);
    expect(verifyPrivateAccessPassword({ accessPassword: "", presentedPassword: "" })).toBe(false);
    expect(verifyPrivateAccessPassword({ accessPassword: ACCESS_PASSWORD, presentedPassword: "x".repeat(1_025) })).toBe(
      false,
    );
    expect(verifyPrivateAccessPassword({ accessPassword: ACCESS_PASSWORD, presentedPassword: 7 })).toBe(false);
  });

  it("refuses extra, inherited, accessor, symbol, and proxy input without invoking hostile code", () => {
    let getterCalls = 0;
    const accessorInput: Record<string, unknown> = { presentedPassword: ACCESS_PASSWORD };
    Object.defineProperty(accessorInput, "accessPassword", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return ACCESS_PASSWORD;
      },
    });
    expect(verifyPrivateAccessPassword(accessorInput)).toBe(false);
    expect(getterCalls).toBe(0);

    expect(
      verifyPrivateAccessPassword({
        accessPassword: ACCESS_PASSWORD,
        presentedPassword: ACCESS_PASSWORD,
        privateReceivingDetails: "must-not-cross-boundary",
      }),
    ).toBe(false);
    expect(
      verifyPrivateAccessPassword(
        Object.create({ accessPassword: ACCESS_PASSWORD, presentedPassword: ACCESS_PASSWORD }) as unknown,
      ),
    ).toBe(false);
    const symbolInput = { accessPassword: ACCESS_PASSWORD, presentedPassword: ACCESS_PASSWORD } as Record<
      string | symbol,
      unknown
    >;
    symbolInput[Symbol("private")] = "marker";
    expect(verifyPrivateAccessPassword(symbolInput)).toBe(false);

    const hostileProxy = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error("hostile proxy");
        },
      },
    );
    expect(() => verifyPrivateAccessPassword(hostileProxy)).not.toThrow();
    expect(verifyPrivateAccessPassword(hostileProxy)).toBe(false);
  });
});

describe("private early access session issuance", () => {
  it("issues a canonical versioned and purpose-separated HMAC token with a fixed TTL", () => {
    const result = issue();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [version, encodedPayload, encodedSignature] = result.value.token.split(".");
    expect(version).toBe(PRIVATE_ACCESS_SESSION_VERSION);
    expect(encodedPayload).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encodedSignature).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.value.token.length).toBeLessThanOrEqual(1_024);

    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Record<string, unknown>;
    expect(Object.keys(payload)).toEqual(["v", "purpose", "iat", "exp", "nonce"]);
    expect(payload).toEqual(canonicalPayload());
    expect(result.value.session).toEqual({
      version: PRIVATE_ACCESS_SESSION_VERSION,
      purpose: PRIVATE_ACCESS_SESSION_PURPOSE,
      nonce: NONCE,
      issuedAtEpochSeconds: Math.floor(NOW / 1_000),
      expiresAtEpochSeconds: Math.floor(NOW / 1_000) + PRIVATE_ACCESS_SESSION_TTL_SECONDS,
    });
  });

  it("is deterministic for identical injected inputs and changes with the injected nonce", () => {
    const first = issue();
    const replay = issue();
    const anotherNonce = issue({ nonce: OTHER_NONCE });
    expect(first.ok && replay.ok && first.value.token === replay.value.token).toBe(true);
    expect(first.ok && anotherNonce.ok && first.value.token === anotherNonce.value.token).toBe(false);
  });

  it("returns detached frozen metadata without passwords, secrets, digests, or receiving details", () => {
    const result = issue();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.session)).toBe(true);
    expect(JSON.stringify(result)).not.toContain(ACCESS_PASSWORD);
    expect(JSON.stringify(result)).not.toContain(SESSION_SECRET);
    expect(JSON.stringify(result)).not.toContain("receiving");
    const payloadText = Buffer.from(result.value.token.split(".")[1], "base64url").toString("utf8");
    expect(payloadText).not.toContain(ACCESS_PASSWORD);
    expect(payloadText).not.toContain(SESSION_SECRET);
    expect(() => {
      (result.value.session as { nonce: string }).nonce = OTHER_NONCE;
    }).toThrow();
    expect(result.value.session.nonce).toBe(NONCE);
  });

  it("fails closed when configuration is empty, malformed, or oversized", () => {
    expect(issue({ accessPassword: "" })).toEqual({ ok: false, code: "CONFIGURATION_INVALID" });
    expect(issue({ accessPassword: 42 })).toEqual({ ok: false, code: "CONFIGURATION_INVALID" });
    expect(issue({ sessionSecret: "" })).toEqual({ ok: false, code: "CONFIGURATION_INVALID" });
    expect(issue({ sessionSecret: "short-session-secret" })).toEqual({
      ok: false,
      code: "CONFIGURATION_INVALID",
    });
    expect(issue({ sessionSecret: "s".repeat(4_097) })).toEqual({ ok: false, code: "CONFIGURATION_INVALID" });
  });

  it("fails closed for incorrect or malformed presented passwords", () => {
    expect(issue({ presentedPassword: "wrong-password" })).toEqual({ ok: false, code: "PASSWORD_INVALID" });
    expect(issue({ presentedPassword: "" })).toEqual({ ok: false, code: "PASSWORD_INVALID" });
    expect(issue({ presentedPassword: { value: ACCESS_PASSWORD } })).toEqual({
      ok: false,
      code: "PASSWORD_INVALID",
    });
  });

  it.each([
    ["zero clock", { now: 0 }],
    ["fractional clock", { now: NOW + 0.5 }],
    ["date clock", { now: new Date(NOW) }],
    ["short nonce", { nonce: "a".repeat(42) }],
    ["padded nonce", { nonce: `${"a".repeat(42)}=` }],
    ["spaced nonce", { nonce: `${"a".repeat(21)} ${"a".repeat(21)}` }],
    ["overlong nonce", { nonce: "n".repeat(44) }],
  ])("refuses %s", (_label, overrides) => {
    expect(issue(overrides)).toEqual({ ok: false, code: "INPUT_INVALID" });
  });

  it("rejects extra keys and hostile objects without invoking accessors or throwing", () => {
    expect(issue({ receivingInstructions: "private marker" })).toEqual({ ok: false, code: "INPUT_INVALID" });

    let getterCalls = 0;
    const accessorInput: Record<string, unknown> = {
      presentedPassword: ACCESS_PASSWORD,
      sessionSecret: SESSION_SECRET,
      now: NOW,
      nonce: NONCE,
    };
    Object.defineProperty(accessorInput, "accessPassword", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return ACCESS_PASSWORD;
      },
    });
    expect(issuePrivateAccessSession(accessorInput)).toEqual({ ok: false, code: "INPUT_INVALID" });
    expect(getterCalls).toBe(0);

    const hostileProxy = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("hostile proxy");
        },
      },
    );
    expect(() => issuePrivateAccessSession(hostileProxy)).not.toThrow();
    expect(issuePrivateAccessSession(hostileProxy)).toEqual({ ok: false, code: "INPUT_INVALID" });
  });
});

describe("private early access session verification", () => {
  it("accepts the exact issued token and returns only frozen session metadata", () => {
    const result = verify(issuedToken());
    expect(result).toEqual({
      ok: true,
      value: {
        version: PRIVATE_ACCESS_SESSION_VERSION,
        purpose: PRIVATE_ACCESS_SESSION_PURPOSE,
        nonce: NONCE,
        issuedAtEpochSeconds: Math.floor(NOW / 1_000),
        expiresAtEpochSeconds: Math.floor(NOW / 1_000) + PRIVATE_ACCESS_SESSION_TTL_SECONDS,
      },
    });
    expect(Object.isFrozen(result)).toBe(true);
    if (result.ok) expect(Object.isFrozen(result.value)).toBe(true);
    expect(JSON.stringify(result)).not.toContain(SESSION_SECRET);
  });

  it("accepts an identical token repeatedly until the caller marks its nonce consumed", () => {
    const token = issuedToken();
    expect(verify(token).ok).toBe(true);
    expect(verify(token).ok).toBe(true);
    expect(verify(token, { consumedNonces: [OTHER_NONCE, NONCE] })).toEqual({
      ok: false,
      code: "TOKEN_REPLAYED",
    });
  });

  it("refuses a nonce mismatch independently of replay state", () => {
    expect(verify(issuedToken(), { expectedNonce: OTHER_NONCE })).toEqual({
      ok: false,
      code: "NONCE_MISMATCH",
    });
  });

  it("enforces future-issued skew and strict expiry boundaries", () => {
    const token = issuedToken();
    expect(
      verify(token, { now: NOW - PRIVATE_ACCESS_SESSION_CLOCK_SKEW_SECONDS * 1_000 }),
    ).toMatchObject({ ok: true });
    expect(
      verify(token, { now: NOW - (PRIVATE_ACCESS_SESSION_CLOCK_SKEW_SECONDS + 1) * 1_000 }),
    ).toEqual({ ok: false, code: "TOKEN_NOT_YET_VALID" });

    const expiresAt = (Math.floor(NOW / 1_000) + PRIVATE_ACCESS_SESSION_TTL_SECONDS) * 1_000;
    expect(verify(token, { now: expiresAt - 1 })).toMatchObject({ ok: true });
    expect(verify(token, { now: expiresAt })).toEqual({ ok: false, code: "TOKEN_EXPIRED" });
    expect(verify(token, { now: expiresAt + 60_000 })).toEqual({ ok: false, code: "TOKEN_EXPIRED" });
  });

  it("refuses wrong secrets, changed signatures, and changed payloads with one generic token error", () => {
    const token = issuedToken();
    expect(verify(token, { sessionSecret: "different-session-secret-at-least-32-bytes" })).toEqual({
      ok: false,
      code: "TOKEN_INVALID",
    });

    const [version, payload, signature] = token.split(".");
    const changedSignature = `${signature.slice(0, -1)}${signature.endsWith("A") ? "B" : "A"}`;
    expect(verify(`${version}.${payload}.${changedSignature}`)).toEqual({ ok: false, code: "TOKEN_INVALID" });
    const changedPayload = `${payload.slice(0, -1)}${payload.endsWith("A") ? "B" : "A"}`;
    expect(verify(`${version}.${changedPayload}.${signature}`)).toEqual({ ok: false, code: "TOKEN_INVALID" });
  });

  it.each([
    ["empty token", ""],
    ["legacy two-part token", "legacy.signature"],
    ["legacy version", issuedToken().replace(/^xpa1\./, "v2.")],
    ["extra segment", `${issuedToken()}.extra`],
    ["padded payload", issuedToken().replace(".", ".=")],
    ["padded signature", `${issuedToken()}=`],
    ["standard base64 character", `${issuedToken().slice(0, -43)}+${issuedToken().slice(-42)}`],
    ["overlong token", `xpa1.${"a".repeat(1_100)}.${"b".repeat(43)}`],
  ])("rejects strict token grammar: %s", (_label, token) => {
    const result = verify(token);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(["INPUT_INVALID", "TOKEN_INVALID"]).toContain(result.code);
  });

  it.each([
    ["wrong purpose", canonicalPayload({ purpose: "research.status" })],
    ["wrong payload version", canonicalPayload({ v: 2 })],
    ["wrong TTL", canonicalPayload({ exp: Math.floor(NOW / 1_000) + PRIVATE_ACCESS_SESSION_TTL_SECONDS + 1 })],
    ["floating issued time", canonicalPayload({ iat: Math.floor(NOW / 1_000) + 0.5 })],
    ["string expiry", canonicalPayload({ exp: String(Math.floor(NOW / 1_000) + PRIVATE_ACCESS_SESSION_TTL_SECONDS) })],
    ["invalid nonce", canonicalPayload({ nonce: "not valid nonce" })],
    ["extra private key", canonicalPayload({ receivingDetails: "private marker" })],
  ])("rejects a correctly signed but structurally invalid payload: %s", (_label, payload) => {
    expect(verify(signRawJson(JSON.stringify(payload)))).toEqual({ ok: false, code: "TOKEN_INVALID" });
  });

  it("rejects non-canonical JSON even when it is correctly signed", () => {
    const payload = canonicalPayload();
    const nonCanonical = JSON.stringify({
      nonce: payload.nonce,
      exp: payload.exp,
      iat: payload.iat,
      purpose: payload.purpose,
      v: payload.v,
    });
    expect(verify(signRawJson(nonCanonical))).toEqual({ ok: false, code: "TOKEN_INVALID" });
  });

  it("fails closed on invalid configuration and malformed verification input", () => {
    const token = issuedToken();
    expect(verify(token, { sessionSecret: "" })).toEqual({ ok: false, code: "CONFIGURATION_INVALID" });
    expect(verify(token, { now: new Date(NOW) })).toEqual({ ok: false, code: "INPUT_INVALID" });
    expect(verify(token, { expectedNonce: "short" })).toEqual({ ok: false, code: "INPUT_INVALID" });
    expect(verify(token, { consumedNonces: new Set([NONCE]) })).toEqual({ ok: false, code: "INPUT_INVALID" });
    expect(verify(token, { consumedNonces: [OTHER_NONCE, OTHER_NONCE] })).toEqual({
      ok: false,
      code: "INPUT_INVALID",
    });
    expect(verify(token, { consumedNonces: new Array(1) })).toEqual({ ok: false, code: "INPUT_INVALID" });
    expect(verify(token, { consumedNonces: ["not-a-canonical-nonce"] })).toEqual({
      ok: false,
      code: "INPUT_INVALID",
    });
    expect(verify(token, { consumedNonces: Array(129).fill(NONCE) })).toEqual({
      ok: false,
      code: "INPUT_INVALID",
    });
    expect(
      verifyPrivateAccessSession({
        token,
        sessionSecret: SESSION_SECRET,
        now: NOW,
        expectedNonce: NONCE,
        consumedNonces: [],
        receivingDetails: "private marker",
      }),
    ).toEqual({ ok: false, code: "INPUT_INVALID" });
  });

  it("does not invoke accessor or proxy traps in caller-provided replay state", () => {
    const token = issuedToken();
    let getterCalls = 0;
    const accessorArray: string[] = [];
    Object.defineProperty(accessorArray, "0", {
      configurable: true,
      enumerable: true,
      get() {
        getterCalls += 1;
        return NONCE;
      },
    });
    Object.defineProperty(accessorArray, "length", { value: 1 });
    expect(verify(token, { consumedNonces: accessorArray })).toEqual({ ok: false, code: "INPUT_INVALID" });
    expect(getterCalls).toBe(0);

    const hostileReplayProxy = new Proxy([], {
      getOwnPropertyDescriptor() {
        throw new Error("hostile replay proxy");
      },
    });
    expect(() => verify(token, { consumedNonces: hostileReplayProxy })).not.toThrow();
    expect(verify(token, { consumedNonces: hostileReplayProxy })).toEqual({ ok: false, code: "INPUT_INVALID" });
  });

  it("contains hostile top-level verification objects without throwing", () => {
    const hostileProxy = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("hostile verification proxy");
        },
      },
    );
    expect(() => verifyPrivateAccessSession(hostileProxy)).not.toThrow();
    expect(verifyPrivateAccessSession(hostileProxy)).toEqual({ ok: false, code: "INPUT_INVALID" });

    let tokenGetterCalls = 0;
    const accessorInput: Record<string, unknown> = {
      sessionSecret: SESSION_SECRET,
      now: NOW,
      expectedNonce: NONCE,
      consumedNonces: [],
    };
    Object.defineProperty(accessorInput, "token", {
      enumerable: true,
      get() {
        tokenGetterCalls += 1;
        return issuedToken();
      },
    });
    expect(verifyPrivateAccessSession(accessorInput)).toEqual({ ok: false, code: "INPUT_INVALID" });
    expect(tokenGetterCalls).toBe(0);
  });
});
