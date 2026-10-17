import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  PRIVATE_ACCESS_COOKIE_CLOCK_SKEW_SECONDS,
  PRIVATE_ACCESS_COOKIE_MAX_HEADER_BYTES,
  PRIVATE_ACCESS_COOKIE_MAX_KEY_COUNT,
  PRIVATE_ACCESS_COOKIE_NAME,
  PRIVATE_ACCESS_COOKIE_TTL_SECONDS,
  PRIVATE_ACCESS_COOKIE_VERSION,
  clearPrivateAccessCookie,
  decodePrivateAccessCookie,
  encodePrivateAccessCookie,
  type PrivateAccessCookieIssueResult,
} from "./private-access-cookie-session";

const NOW = 2_000_000_000_123;
const SESSION_HANDLE = Buffer.alloc(32, 0x41).toString("base64url");
const OTHER_HANDLE = Buffer.alloc(32, 0x42).toString("base64url");
const ACTIVE_KEY_ID = "active-2026-08";
const PREVIOUS_KEY_ID = "previous-2026-07";
const ACTIVE_SECRET = "cookie-session-secret-with-at-least-thirty-two-bytes";
const PREVIOUS_SECRET = "previous-cookie-session-secret-at-least-thirty-two-bytes";
const KEY_RING = Object.freeze({
  activeKeyId: ACTIVE_KEY_ID,
  keys: Object.freeze({
    [ACTIVE_KEY_ID]: ACTIVE_SECRET,
    [PREVIOUS_KEY_ID]: PREVIOUS_SECRET,
  }),
});
const MAC_DOMAIN = "xenios:research:private-early-access:cookie-session";

function issue(overrides: Record<string, unknown> = {}): PrivateAccessCookieIssueResult {
  return encodePrivateAccessCookie({
    keyRing: KEY_RING,
    now: NOW,
    sessionHandle: SESSION_HANDLE,
    ...overrides,
  });
}

function issuedValue(): string {
  const result = issue();
  if (!result.ok) throw new Error(`cookie fixture failed: ${result.code}`);
  return result.value.cookieValue;
}

function header(cookieValue = issuedValue(), prefix = "theme=dark; "): string {
  return `${prefix}${PRIVATE_ACCESS_COOKIE_NAME}=${cookieValue}; locale=en`;
}

function verify(cookieHeader: string, overrides: Record<string, unknown> = {}) {
  return decodePrivateAccessCookie({
    cookieHeader,
    keyRing: KEY_RING,
    now: NOW,
    ...overrides,
  });
}

function signedValue(
  keyId: string,
  handleValue: string,
  issuedAt: string,
  expiresAt: string,
  secret = ACTIVE_SECRET,
): string {
  const signature = createHmac("sha256", secret)
    .update(
      [MAC_DOMAIN, PRIVATE_ACCESS_COOKIE_VERSION, keyId, handleValue, issuedAt, expiresAt].join("\0"),
      "utf8",
    )
    .digest("base64url");
  return [PRIVATE_ACCESS_COOKIE_VERSION, keyId, handleValue, issuedAt, expiresAt, signature].join(".");
}

describe("private early access host-only cookie issuance", () => {
  it("emits an opaque keyed value with an exact absolute lifetime", () => {
    const result = issue();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const issuedAt = Math.floor(NOW / 1_000);
    const expiresAt = issuedAt + PRIVATE_ACCESS_COOKIE_TTL_SECONDS;
    expect(result.value.cookieValue.split(".")).toEqual([
      PRIVATE_ACCESS_COOKIE_VERSION,
      ACTIVE_KEY_ID,
      SESSION_HANDLE,
      String(issuedAt),
      String(expiresAt),
      expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    ]);
    expect(result.value.session).toEqual({
      version: PRIVATE_ACCESS_COOKIE_VERSION,
      keyId: ACTIVE_KEY_ID,
      sessionHandle: SESSION_HANDLE,
      issuedAtEpochSeconds: issuedAt,
      expiresAtEpochSeconds: expiresAt,
    });
  });

  it("serializes every required __Host attribute and no Domain attribute", () => {
    const result = issue();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const expiresAt = Math.floor(NOW / 1_000) + PRIVATE_ACCESS_COOKIE_TTL_SECONDS;
    expect(result.value.setCookie).toBe(
      `${PRIVATE_ACCESS_COOKIE_NAME}=${result.value.cookieValue}; Path=/; ` +
        `Expires=${new Date(expiresAt * 1_000).toUTCString()}; ` +
        `Max-Age=${PRIVATE_ACCESS_COOKIE_TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict`,
    );
    expect(result.value.setCookie).not.toMatch(/(?:^|;)\s*Domain=/i);
    expect(result.value.setCookie).not.toContain(ACTIVE_SECRET);
  });

  it("supports a bounded injected key ring and explicit key rotation", () => {
    const previous = issue({
      keyRing: {
        activeKeyId: PREVIOUS_KEY_ID,
        keys: {
          [ACTIVE_KEY_ID]: ACTIVE_SECRET,
          [PREVIOUS_KEY_ID]: PREVIOUS_SECRET,
        },
      },
    });
    expect(previous.ok).toBe(true);
    if (!previous.ok) return;
    expect(verify(header(previous.value.cookieValue)).ok).toBe(true);
    expect(
      verify(header(previous.value.cookieValue), {
        keyRing: { activeKeyId: ACTIVE_KEY_ID, keys: { [ACTIVE_KEY_ID]: ACTIVE_SECRET } },
      }),
    ).toEqual({ ok: false, code: "COOKIE_INVALID" });

    const active = issue();
    expect(active.ok).toBe(true);
    if (!active.ok) return;
    expect(active.value.session.keyId).toBe(ACTIVE_KEY_ID);

    const tooManyKeys = Object.fromEntries(
      Array.from({ length: PRIVATE_ACCESS_COOKIE_MAX_KEY_COUNT + 1 }, (_, index) => [
        `key-${index}`,
        `${ACTIVE_SECRET}-${index}`,
      ]),
    );
    expect(issue({ keyRing: { activeKeyId: "key-0", keys: tooManyKeys } })).toEqual({
      ok: false,
      code: "CONFIGURATION_INVALID",
    });
    expect(issue({ keyRing: { activeKeyId: "missing-key", keys: KEY_RING.keys } })).toEqual({
      ok: false,
      code: "CONFIGURATION_INVALID",
    });
    expect(issue({ keyRing: { activeKeyId: "UPPERCASE", keys: KEY_RING.keys } })).toEqual({
      ok: false,
      code: "CONFIGURATION_INVALID",
    });
  });

  it("does not read environment state or invoke key-ring accessors", () => {
    let getterCalls = 0;
    const keys: Record<string, unknown> = {};
    Object.defineProperty(keys, ACTIVE_KEY_ID, {
      enumerable: true,
      get() {
        getterCalls += 1;
        return ACTIVE_SECRET;
      },
    });
    expect(issue({ keyRing: { activeKeyId: ACTIVE_KEY_ID, keys } })).toEqual({
      ok: false,
      code: "CONFIGURATION_INVALID",
    });
    expect(getterCalls).toBe(0);
  });

  it("bounds the clock to JavaScript Date's representable range", () => {
    const maxSafeIssueMs = 8_640_000_000_000_000 - PRIVATE_ACCESS_COOKIE_TTL_SECONDS * 1_000;
    expect(issue({ now: maxSafeIssueMs }).ok).toBe(true);
    expect(issue({ now: maxSafeIssueMs + 1 })).toEqual({ ok: false, code: "INPUT_INVALID" });
  });

  it("fails closed for weak keys, malformed handles, invalid clocks, and extra fields", () => {
    expect(issue({ keyRing: { activeKeyId: ACTIVE_KEY_ID, keys: { [ACTIVE_KEY_ID]: "short" } } })).toEqual({
      ok: false,
      code: "CONFIGURATION_INVALID",
    });
    expect(issue({ sessionHandle: "not-opaque" })).toEqual({ ok: false, code: "INPUT_INVALID" });
    expect(issue({ now: 0 })).toEqual({ ok: false, code: "INPUT_INVALID" });
    expect(
      encodePrivateAccessCookie({
        keyRing: KEY_RING,
        now: NOW,
        sessionHandle: SESSION_HANDLE,
        accessPassword: "must-not-be-accepted",
      }),
    ).toEqual({ ok: false, code: "INPUT_INVALID" });
  });

  it("does not invoke top-level accessors or proxy traps", () => {
    let getterCalls = 0;
    const hostile: Record<string, unknown> = { keyRing: KEY_RING, now: NOW };
    Object.defineProperty(hostile, "sessionHandle", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return SESSION_HANDLE;
      },
    });
    expect(encodePrivateAccessCookie(hostile)).toEqual({ ok: false, code: "INPUT_INVALID" });
    expect(getterCalls).toBe(0);
    const proxy = new Proxy({}, { getPrototypeOf: () => { throw new Error("hostile"); } });
    expect(() => encodePrivateAccessCookie(proxy)).not.toThrow();
    expect(encodePrivateAccessCookie(proxy)).toEqual({ ok: false, code: "INPUT_INVALID" });
  });

  it("clears only the exact host-only cookie with the same strict attributes", () => {
    expect(clearPrivateAccessCookie()).toBe(
      `${PRIVATE_ACCESS_COOKIE_NAME}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; ` +
        "Max-Age=0; HttpOnly; Secure; SameSite=Strict",
    );
    expect(clearPrivateAccessCookie()).not.toContain("Domain=");
  });
});

describe("private early access raw Cookie-header verification", () => {
  it("accepts exactly one canonical cookie among unrelated cookies", () => {
    expect(verify(header())).toEqual({
      ok: true,
      value: {
        version: PRIVATE_ACCESS_COOKIE_VERSION,
        keyId: ACTIVE_KEY_ID,
        sessionHandle: SESSION_HANDLE,
        issuedAtEpochSeconds: Math.floor(NOW / 1_000),
        expiresAtEpochSeconds: Math.floor(NOW / 1_000) + PRIVATE_ACCESS_COOKIE_TTL_SECONDS,
      },
    });
  });

  it("rejects missing, duplicate, case-aliased, quoted, and empty cookies", () => {
    expect(verify("theme=dark; locale=en")).toEqual({ ok: false, code: "COOKIE_MISSING" });
    expect(verify(`${PRIVATE_ACCESS_COOKIE_NAME}=${issuedValue()}; ${PRIVATE_ACCESS_COOKIE_NAME}=${issuedValue()}`))
      .toEqual({ ok: false, code: "COOKIE_DUPLICATE" });
    expect(verify(`${PRIVATE_ACCESS_COOKIE_NAME.toLowerCase()}=${issuedValue()}`)).toEqual({
      ok: false,
      code: "COOKIE_HEADER_INVALID",
    });
    expect(verify(`${PRIVATE_ACCESS_COOKIE_NAME}="${issuedValue()}"`)).toEqual({
      ok: false,
      code: "COOKIE_HEADER_INVALID",
    });
    expect(verify(`${PRIVATE_ACCESS_COOKIE_NAME}=`)).toEqual({ ok: false, code: "COOKIE_HEADER_INVALID" });
  });

  it("rejects control characters, malformed segments, and oversized Cookie headers", () => {
    expect(verify(`${PRIVATE_ACCESS_COOKIE_NAME}=${issuedValue()}\r\nInjected=yes`)).toEqual({
      ok: false,
      code: "COOKIE_HEADER_INVALID",
    });
    // CHANGED DELIBERATELY. This previously asserted that any malformed
    // neighbouring segment invalidated the whole header. That is a denial of
    // service against our own members: one `consent="yes"` or `_ga=` from a
    // sibling subdomain or an analytics script (both RFC-legal) would lock a
    // paying customer out of Private Early Access with no way to repair it.
    // A neighbour we do not own is now skipped; our own segment keeps every
    // strict rule, and the header-wide control-character and size limits below
    // are unchanged.
    expect(verify(`malformed; ${PRIVATE_ACCESS_COOKIE_NAME}=${issuedValue()}`).ok).toBe(true);
    // The same private cookie beside RFC-legal neighbours a real browser sends.
    expect(verify(`consent="yes"; ${PRIVATE_ACCESS_COOKIE_NAME}=${issuedValue()}`).ok).toBe(true);
    expect(verify(`_ga=; ${PRIVATE_ACCESS_COOKIE_NAME}=${issuedValue()}`).ok).toBe(true);
    // Our own segment keeps every strict rule.
    expect(verify(`ok=1; ${PRIVATE_ACCESS_COOKIE_NAME}=`)).toEqual({
      ok: false,
      code: "COOKIE_HEADER_INVALID",
    });
    expect(
      verify(`${PRIVATE_ACCESS_COOKIE_NAME}=${issuedValue()}; ${PRIVATE_ACCESS_COOKIE_NAME}=${issuedValue()}`),
    ).toEqual({ ok: false, code: "COOKIE_DUPLICATE" });
    expect(verify(`padding=${"x".repeat(PRIVATE_ACCESS_COOKIE_MAX_HEADER_BYTES)}; ${PRIVATE_ACCESS_COOKIE_NAME}=${issuedValue()}`))
      .toEqual({ ok: false, code: "COOKIE_HEADER_INVALID" });
  });

  it("refuses any handle, timestamp, signature, or key-id mutation", () => {
    const parts = issuedValue().split(".");
    expect(verify(header([parts[0], parts[1], OTHER_HANDLE, ...parts.slice(3)].join(".")))).toEqual({
      ok: false,
      code: "COOKIE_INVALID",
    });
    expect(verify(header([parts[0], parts[1], parts[2], String(Number(parts[3]) - 1), ...parts.slice(4)].join("."))))
      .toEqual({ ok: false, code: "COOKIE_INVALID" });
    const signature = parts[5];
    expect(verify(header([...parts.slice(0, 5), `${signature.slice(0, -1)}A`].join(".")))).toEqual({
      ok: false,
      code: "COOKIE_INVALID",
    });
    expect(verify(header([parts[0], "unknown-key", ...parts.slice(2)].join(".")))).toEqual({
      ok: false,
      code: "COOKIE_INVALID",
    });
  });

  it("enforces bounded not-before skew and absolute expiry without sliding", () => {
    const issuedAt = Math.floor(NOW / 1_000) + PRIVATE_ACCESS_COOKIE_CLOCK_SKEW_SECONDS;
    const within = signedValue(
      ACTIVE_KEY_ID,
      SESSION_HANDLE,
      String(issuedAt),
      String(issuedAt + PRIVATE_ACCESS_COOKIE_TTL_SECONDS),
    );
    expect(verify(header(within)).ok).toBe(true);
    const beyond = signedValue(
      ACTIVE_KEY_ID,
      SESSION_HANDLE,
      String(issuedAt + 1),
      String(issuedAt + 1 + PRIVATE_ACCESS_COOKIE_TTL_SECONDS),
    );
    expect(verify(header(beyond))).toEqual({ ok: false, code: "COOKIE_NOT_YET_VALID" });

    const expiresAtMs = (Math.floor(NOW / 1_000) + PRIVATE_ACCESS_COOKIE_TTL_SECONDS) * 1_000;
    expect(verify(header(), { now: expiresAtMs - 1 }).ok).toBe(true);
    expect(verify(header(), { now: expiresAtMs })).toEqual({ ok: false, code: "COOKIE_EXPIRED" });
    expect(verify(header(), { now: expiresAtMs + 60_000 })).toEqual({ ok: false, code: "COOKIE_EXPIRED" });
  });

  it("refuses a correctly signed noncanonical or unbounded lifetime", () => {
    const issuedAt = Math.floor(NOW / 1_000);
    expect(
      verify(header(signedValue(
        ACTIVE_KEY_ID,
        SESSION_HANDLE,
        `0${issuedAt}`,
        String(issuedAt + PRIVATE_ACCESS_COOKIE_TTL_SECONDS),
      ))),
    ).toEqual({ ok: false, code: "COOKIE_INVALID" });
    expect(
      verify(header(signedValue(
        ACTIVE_KEY_ID,
        SESSION_HANDLE,
        String(issuedAt),
        String(issuedAt + PRIVATE_ACCESS_COOKIE_TTL_SECONDS + 1),
      ))),
    ).toEqual({ ok: false, code: "COOKIE_INVALID" });
  });

  it("rejects non-exact inputs and hostile key-ring accessors", () => {
    expect(
      decodePrivateAccessCookie({ cookieHeader: header(), keyRing: KEY_RING, now: NOW, rawCookie: issuedValue() }),
    ).toEqual({ ok: false, code: "INPUT_INVALID" });
    let getterCalls = 0;
    const keys: Record<string, unknown> = {};
    Object.defineProperty(keys, ACTIVE_KEY_ID, {
      enumerable: true,
      get() {
        getterCalls += 1;
        return ACTIVE_SECRET;
      },
    });
    expect(verify(header(), { keyRing: { activeKeyId: ACTIVE_KEY_ID, keys } })).toEqual({
      ok: false,
      code: "CONFIGURATION_INVALID",
    });
    expect(getterCalls).toBe(0);
  });
});
