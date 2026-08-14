// FULL_CATALOG_VISIBILITY: the allowlist parse and the breadth decision.
//
// The properties that matter most are the negative ones. An unset variable
// must grant nobody, a blank entry must not match a caller with no email, and
// a substring or a domain must never match, because this is the one mechanism
// that widens what a person can see.

import { describe, expect, it } from "vitest";
import {
  FULL_CATALOG_VISIBILITY_ENV_VAR,
  fullCatalogVisibilityAllowlist,
  hasFullCatalogVisibility,
  normalizeMemberIdentity,
  resolveViewerVisibilityBreadth,
  resolveVisibilityBreadth,
} from "./visibility";

const SAMUEL = "sboadu1212@gmail.com";

function env(value?: string): Record<string, string | undefined> {
  return value === undefined ? {} : { [FULL_CATALOG_VISIBILITY_ENV_VAR]: value };
}

describe("full catalog visibility allowlist", () => {
  it("names the environment variable the wiring sets", () => {
    expect(FULL_CATALOG_VISIBILITY_ENV_VAR).toBe("RESEARCH_FULL_CATALOG_MEMBERS");
  });

  it("grants nobody by default", () => {
    expect(fullCatalogVisibilityAllowlist(env()).size).toBe(0);
    expect(hasFullCatalogVisibility(SAMUEL, env())).toBe(false);
    expect(resolveVisibilityBreadth(SAMUEL, env())).toBe("standard");
  });

  it("grants nobody for a blank or whitespace only value", () => {
    for (const value of ["", "   ", ",", ",,", " , , "]) {
      expect(fullCatalogVisibilityAllowlist(env(value)).size, JSON.stringify(value)).toBe(0);
      expect(hasFullCatalogVisibility(SAMUEL, env(value))).toBe(false);
    }
  });

  it("grants the named member, lowercased and trimmed like ADMIN_EMAIL", () => {
    const raw = "  Sboadu1212@Gmail.COM , ops@example.com ";
    expect(Array.from(fullCatalogVisibilityAllowlist(env(raw))).sort()).toEqual([
      "ops@example.com",
      SAMUEL,
    ]);
    expect(hasFullCatalogVisibility(SAMUEL, env(raw))).toBe(true);
    expect(hasFullCatalogVisibility("  SBOADU1212@gmail.com  ", env(raw))).toBe(true);
    expect(resolveVisibilityBreadth(SAMUEL, env(raw))).toBe("full");
  });

  it("does not grant anyone else on the list's domain", () => {
    const list = env(SAMUEL);
    expect(hasFullCatalogVisibility("someone.else@gmail.com", list)).toBe(false);
    expect(hasFullCatalogVisibility("@gmail.com", list)).toBe(false);
    expect(hasFullCatalogVisibility("gmail.com", list)).toBe(false);
    expect(resolveVisibilityBreadth("someone.else@gmail.com", list)).toBe("standard");
  });

  it("matches exactly, never by prefix, suffix, or substring", () => {
    const list = env(SAMUEL);
    for (const near of [
      "sboadu1212@gmail.com.attacker.example",
      "xsboadu1212@gmail.com",
      "sboadu1212@gmail.co",
      "sboadu1212",
      `${SAMUEL} `.repeat(2).trim(),
    ]) {
      expect(hasFullCatalogVisibility(near, list), near).toBe(false);
    }
  });

  it("refuses a wildcard rather than granting everyone", () => {
    for (const wildcard of ["*", "%", "all", "*@*"]) {
      const list = env(wildcard);
      expect(hasFullCatalogVisibility(SAMUEL, list), wildcard).toBe(false);
      expect(hasFullCatalogVisibility("anyone@example.com", list), wildcard).toBe(false);
    }
  });

  it("denies a missing, blank, or non string identity", () => {
    const list = env(SAMUEL);
    for (const identity of [undefined, null, "", "   ", 42, {}, []]) {
      expect(hasFullCatalogVisibility(identity, list), JSON.stringify(identity)).toBe(false);
      expect(resolveVisibilityBreadth(identity, list)).toBe("standard");
    }
  });

  it("normalizes exactly as requireSupabaseAdmin does", () => {
    expect(normalizeMemberIdentity("  Mixed.Case@Example.COM  ")).toBe("mixed.case@example.com");
    expect(normalizeMemberIdentity(undefined)).toBe("");
    expect(normalizeMemberIdentity(123)).toBe("");
  });
});

describe("the viewer breadth policy", () => {
  const MEMBER = "member@example.com";

  it("grants full breadth to a verified active member with no allowlist at all", () => {
    const breadth = resolveViewerVisibilityBreadth(
      { email: MEMBER, audience: "member", memberStatus: "active" },
      env(),
    );
    expect(breadth).toBe("full");
  });

  it("grants full breadth to an admin viewer", () => {
    expect(
      resolveViewerVisibilityBreadth({ email: SAMUEL, audience: "admin", memberStatus: null }, env()),
    ).toBe("full");
  });

  it("treats an ABSENT status as not active, never as a grant", () => {
    expect(
      resolveViewerVisibilityBreadth({ email: MEMBER, audience: "member" }, env()),
    ).toBe("standard");
    for (const status of [null, "", "past_due", "paused", "cancelled", "closed", "ACTIVE "]) {
      expect(
        resolveViewerVisibilityBreadth(
          { email: MEMBER, audience: "member", memberStatus: status },
          env(),
        ),
        JSON.stringify(status),
      ).toBe("standard");
    }
  });

  it("keeps the named-email allowlist additive for a non-active viewer", () => {
    const breadth = resolveViewerVisibilityBreadth(
      { email: SAMUEL, audience: "member", memberStatus: null },
      env(SAMUEL),
    );
    expect(breadth).toBe("full");
  });

  it("never widens on browser-controllable audience strings", () => {
    // The audience reaching this function comes from the authorizer, but the
    // policy still refuses anything that is not the exact admin literal.
    for (const audience of ["Admin", "ADMIN", " admin", "administrator", "member "]) {
      expect(
        resolveViewerVisibilityBreadth({ email: MEMBER, audience, memberStatus: null }, env()),
        audience,
      ).toBe("standard");
    }
  });
});
