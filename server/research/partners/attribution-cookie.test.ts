import { describe, expect, it } from "vitest";
import { LinkSecretMissingError } from "./attribution";
import {
  ATTRIBUTION_COOKIE_NAME,
  attributionSetCookieValue,
  attributionTokenFromCookieHeader,
  mintAttributionToken,
  verifiedAttributionFromCookieHeader,
  verifiedAttributionRefFromCookieHeader,
  verifyAttributionToken,
  type AttributionCookieClaims,
} from "./attribution-cookie";

const SECRET = "attribution-cookie-test-secret";
const NOW = new Date("2026-08-19T12:00:00.000Z");

function claims(overrides: Partial<AttributionCookieClaims> = {}): AttributionCookieClaims {
  return {
    partnerId: "partner-1",
    code: "v1.cGFydG5lci0x.bm9uY2U.signature",
    subjectKey: "opaque-subject-key",
    issuedAt: "2026-08-19T11:00:00.000Z",
    expiresAt: "2026-09-18T11:00:00.000Z",
    ...overrides,
  };
}

describe("mintAttributionToken", () => {
  it("round-trips its claims through verify under the same secret", () => {
    const token = mintAttributionToken(SECRET, claims());
    expect(verifyAttributionToken(SECRET, token, NOW)).toEqual(claims());
  });

  it("refuses to mint without a secret, the same failure attribution.ts raises", () => {
    expect(() => mintAttributionToken(null, claims())).toThrow(LinkSecretMissingError);
    expect(() => mintAttributionToken("", claims())).toThrow(LinkSecretMissingError);
  });
});

describe("verifyAttributionToken", () => {
  it("rejects a token signed with a different secret", () => {
    const forged = mintAttributionToken("some-other-secret", claims());
    expect(verifyAttributionToken(SECRET, forged, NOW)).toBeNull();
  });

  it("rejects a payload edited after signing", () => {
    const token = mintAttributionToken(SECRET, claims());
    const [version, , signature] = token.split(".");
    const swapped = Buffer.from(
      JSON.stringify({ ...claims(), partnerId: "partner-thief" }),
      "utf8",
    ).toString("base64url");
    expect(
      verifyAttributionToken(SECRET, `${version}.${swapped}.${signature}`, NOW),
    ).toBeNull();
  });

  it("rejects an expired token", () => {
    const expired = mintAttributionToken(
      SECRET,
      claims({ expiresAt: "2026-08-19T11:59:59.000Z" }),
    );
    expect(verifyAttributionToken(SECRET, expired, NOW)).toBeNull();
    // Expiry exactly at the boundary is also a miss: expired means not after now.
    const boundary = mintAttributionToken(
      SECRET,
      claims({ expiresAt: NOW.toISOString() }),
    );
    expect(verifyAttributionToken(SECRET, boundary, NOW)).toBeNull();
  });

  it("rejects malformed tokens without throwing", () => {
    for (const bad of [
      "",
      "xa1",
      "xa1.only-two",
      "xa1.a.b.c",
      "xa0.payload.sig",
      "xa1.!!!.sig",
      `xa1.${Buffer.from("not-json", "utf8").toString("base64url")}.sig`,
      `xa1.${Buffer.from("null", "utf8").toString("base64url")}.sig`,
    ]) {
      expect(verifyAttributionToken(SECRET, bad, NOW)).toBeNull();
    }
  });

  it("rejects a signed payload whose fields are missing or empty", () => {
    const empty = mintAttributionToken(SECRET, claims({ partnerId: "" }));
    expect(verifyAttributionToken(SECRET, empty, NOW)).toBeNull();
    const badDate = mintAttributionToken(SECRET, claims({ expiresAt: "not-a-date" }));
    expect(verifyAttributionToken(SECRET, badDate, NOW)).toBeNull();
  });

  it("verifies nothing without a secret", () => {
    const token = mintAttributionToken(SECRET, claims());
    expect(verifyAttributionToken(null, token, NOW)).toBeNull();
    expect(verifyAttributionToken("", token, NOW)).toBeNull();
  });
});

describe("attributionSetCookieValue", () => {
  it("carries every required attribute", () => {
    const token = mintAttributionToken(SECRET, claims());
    const cookie = attributionSetCookieValue(
      token,
      new Date("2026-09-18T11:00:00.000Z"),
      NOW,
    );
    expect(cookie.startsWith(`${ATTRIBUTION_COOKIE_NAME}=${token};`)).toBe(true);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=");
    expect(cookie).toContain("Expires=");
  });

  it("clamps a past expiry to Max-Age=0 rather than a negative age", () => {
    const cookie = attributionSetCookieValue(
      "token",
      new Date("2026-08-19T11:00:00.000Z"),
      NOW,
    );
    expect(cookie).toContain("Max-Age=0");
  });
});

describe("attributionTokenFromCookieHeader", () => {
  it("finds the token among other cookies", () => {
    const token = mintAttributionToken(SECRET, claims());
    const header = `session=abc; ${ATTRIBUTION_COOKIE_NAME}=${token}; theme=dark`;
    expect(attributionTokenFromCookieHeader(header)).toBe(token);
  });

  it("returns null for an absent header, absent cookie, or empty value", () => {
    expect(attributionTokenFromCookieHeader(undefined)).toBeNull();
    expect(attributionTokenFromCookieHeader("session=abc")).toBeNull();
    expect(attributionTokenFromCookieHeader(`${ATTRIBUTION_COOKIE_NAME}=`)).toBeNull();
    expect(attributionTokenFromCookieHeader("")).toBeNull();
  });
});

describe("verifiedAttributionRefFromCookieHeader", () => {
  it("yields the partner id only from a verified cookie", () => {
    const token = mintAttributionToken(SECRET, claims());
    const header = `${ATTRIBUTION_COOKIE_NAME}=${token}`;
    expect(verifiedAttributionRefFromCookieHeader(SECRET, header, NOW)).toBe("partner-1");
    expect(verifiedAttributionFromCookieHeader(SECRET, header, NOW)).toEqual(claims());
  });

  it("yields null for absent, forged, expired, or secretless requests", () => {
    const token = mintAttributionToken(SECRET, claims());
    const forged = mintAttributionToken("another-secret", claims());
    const expired = mintAttributionToken(
      SECRET,
      claims({ expiresAt: "2026-08-01T00:00:00.000Z" }),
    );
    expect(verifiedAttributionRefFromCookieHeader(SECRET, undefined, NOW)).toBeNull();
    expect(
      verifiedAttributionRefFromCookieHeader(SECRET, `${ATTRIBUTION_COOKIE_NAME}=${forged}`, NOW),
    ).toBeNull();
    expect(
      verifiedAttributionRefFromCookieHeader(SECRET, `${ATTRIBUTION_COOKIE_NAME}=${expired}`, NOW),
    ).toBeNull();
    expect(
      verifiedAttributionRefFromCookieHeader(null, `${ATTRIBUTION_COOKIE_NAME}=${token}`, NOW),
    ).toBeNull();
  });
});
