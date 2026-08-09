import { describe, expect, it } from "vitest";
import {
  buildReturnUrl,
  interpretRedirectReturn,
  resolveCanonicalOrigin,
  selectSigningMode,
  type EarlyAccessSigningStart,
} from "./signing-seam";

const CANONICAL = "https://xeniostechnology.com";

describe("selectSigningMode", () => {
  it("uses native signing whenever native is available", () => {
    const result = selectSigningMode({ nativeEnabled: true, externalEnabled: true });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    // Native is the shipped in-page path and needs no provider credential, so
    // an external signer is never chosen merely because it is configured.
    expect(result.mode).toBe("native");
  });

  it("falls back to external redirect only when native is unavailable", () => {
    const result = selectSigningMode({ nativeEnabled: false, externalEnabled: true });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.mode).toBe("provider_hosted");
  });

  it("signs nothing when neither mode is enabled", () => {
    const result = selectSigningMode({ nativeEnabled: false, externalEnabled: false });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.code).toBe("signing_disabled");
  });
});

describe("the signing session union", () => {
  it("describes a native session without a URL", () => {
    const session: EarlyAccessSigningStart = {
      mode: "native",
      signingSessionId: "sess-1",
      documentVersionIds: ["ver-arbitration_agreement"],
    };
    // The point of the union: a native session has no signingUrl to read, so a
    // caller cannot accidentally redirect a member out of an in-page flow.
    expect(session.mode).toBe("native");
    expect("signingUrl" in session).toBe(false);
  });

  it("describes a provider-hosted session, and carries no return URL", () => {
    const session: EarlyAccessSigningStart = {
      mode: "provider_hosted",
      provider: "opensign",
      signingUrl: "https://provider.example/sign/doc-1",
      signingRequestId: "req-1",
    };
    expect(session.mode).toBe("provider_hosted");
    // Neither arm carries a return or redirect URL. Completion comes from a
    // verified webhook, so there is nothing for a return to advance.
    expect("returnUrl" in session).toBe(false);
    expect("redirectUrl" in session).toBe(false);
  });
});

describe("resolveCanonicalOrigin", () => {
  it("accepts a bare https origin", () => {
    const result = resolveCanonicalOrigin(CANONICAL);
    expect(result).toEqual({ ok: true, origin: CANONICAL });
  });

  it("refuses a missing origin", () => {
    for (const value of [undefined, null, "", "   "]) {
      const result = resolveCanonicalOrigin(value);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.code).toBe("canonical_origin_missing");
    }
  });

  it("refuses anything that is not a plain https origin", () => {
    const bad = [
      "http://xeniostechnology.com",
      "https://user:pass@xeniostechnology.com",
      "https://xeniostechnology.com/path",
      "https://xeniostechnology.com/?next=https://evil.example",
      "https://xeniostechnology.com/#fragment",
      "javascript:alert(1)",
      "not a url",
    ];
    for (const value of bad) {
      const result = resolveCanonicalOrigin(value);
      expect(result.ok, `${value} should be refused`).toBe(false);
    }
  });
});

describe("buildReturnUrl", () => {
  it("builds a same-site URL from the configured origin", () => {
    const result = buildReturnUrl(CANONICAL, "/research/early-access");
    expect(result).toEqual({ ok: true, url: `${CANONICAL}/research/early-access` });
  });

  it("refuses a path that escapes to another host", () => {
    // These are the shapes that turn a return URL into an open redirect. A
    // protocol-relative path is a different authority to a browser even though
    // it starts with a slash.
    const bad = [
      "//evil.example",
      "/\\evil.example",
      "https://evil.example",
      "research/early-access",
      "/path\\with\\backslash",
    ];
    for (const path of bad) {
      const result = buildReturnUrl(CANONICAL, path);
      expect(result.ok, `${path} should be refused`).toBe(false);
    }
  });

  it("refuses to build anything when the origin is unconfigured or invalid", () => {
    expect(buildReturnUrl(undefined, "/ok").ok).toBe(false);
    expect(buildReturnUrl("http://xeniostechnology.com", "/ok").ok).toBe(false);
  });

  it("cannot be given a request-derived host", () => {
    // The guard is structural: a Host header value is just a hostname, not an
    // origin, so it fails validation rather than silently becoming the origin.
    for (const hostHeader of ["evil.example", "xeniostechnology.com", "evil.example:443"]) {
      const result = buildReturnUrl(hostHeader, "/research/early-access");
      expect(result.ok, `${hostHeader} must not become an origin`).toBe(false);
    }
  });
});

describe("interpretRedirectReturn", () => {
  it("proves nothing and always demands a recheck", () => {
    const result = interpretRedirectReturn();
    expect(result.outcome).toBe("recheck_required");
    expect(result.proves).toBe("nothing");
  });
});
