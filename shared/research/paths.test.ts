import { describe, expect, it } from "vitest";
import {
  isResearchAccessStatePath,
  isResearchActivatePath,
  isResearchAdminPath,
  isResearchApplicationStatusPath,
  isResearchPath,
  isPublicResearchDocumentPath,
  isResearchResetPasswordPath,
  normalizeResearchPath,
} from "./paths";

// The path normalization must match the wouter router (decodeURI + case-fold)
// so the tracking guard and the server page gate cover exactly the URLs that
// render the research surface — including case-variant and percent-encoded
// forms (PR #25 correction pass, both router-normalization-mismatch classes).

describe("isResearchPath", () => {
  it("matches the plain research surface", () => {
    expect(isResearchPath("/research")).toBe(true);
    expect(isResearchPath("/research/")).toBe(true);
    expect(isResearchPath("/research/member")).toBe(true);
    expect(isResearchPath("/research/reset-password")).toBe(true);
  });

  it("matches case variants (wouter is case-insensitive)", () => {
    expect(isResearchPath("/Research")).toBe(true);
    expect(isResearchPath("/RESEARCH/member")).toBe(true);
    expect(isResearchPath("/reSearch/apply")).toBe(true);
  });

  it("matches percent-encoded variants (wouter matches the decoded path)", () => {
    expect(isResearchPath("/%72esearch/member")).toBe(true); // %72 = r
    expect(isResearchPath("/%52esearch")).toBe(true); // %52 = R
    expect(isResearchPath("/resea%72ch/apply")).toBe(true);
    expect(isResearchPath("/%52%45%53%45%41%52%43%48/member")).toBe(true); // RESEARCH
  });

  it("never matches the root homepage or unrelated paths", () => {
    expect(isResearchPath("/")).toBe(false);
    expect(isResearchPath("/researchers")).toBe(false);
    expect(isResearchPath("/about")).toBe(false);
    expect(isResearchPath("/kairos")).toBe(false);
  });

  it("fails safe on a malformed percent-encoding (never throws)", () => {
    expect(() => isResearchPath("/%ZZ")).not.toThrow();
    expect(isResearchPath("/%ZZ")).toBe(false);
  });
});

describe("canonical Research path normalization", () => {
  it("matches router case, encoding, query, hash, and one optional slash", () => {
    expect(normalizeResearchPath("/Research/Partners/")).toBe("/research/partners");
    expect(normalizeResearchPath("/%72esearch/partners?ref=hidden#section")).toBe(
      "/research/partners",
    );
  });

  it("does not liberalize multiple slashes or throw on malformed encoding", () => {
    expect(normalizeResearchPath("/research/partners//")).toBe("/research/partners/");
    expect(() => normalizeResearchPath("/research/%ZZ")).not.toThrow();
    expect(normalizeResearchPath("/research/%ZZ")).toBe("/research/%zz");
  });
});

describe("isPublicResearchDocumentPath", () => {
  it.each([
    "/research",
    "/Research/Partners/",
    "/%72esearch/organizations",
    "/research/affiliates",
    "/research/quality",
    "/research/testing",
    "/research/documents",
    "/research/policies/research-use",
    "/research/policies/shipping",
    "/research/policies/returns",
  ])("admits the exact reviewed public document %s", (path) => {
    expect(isPublicResearchDocumentPath(path)).toBe(true);
  });

  it.each([
    "/research/apply",
    "/research/sign-in",
    "/research/early-access",
    "/research/partners/apply",
    "/research/partners/dashboard",
    "/research/organizations/private",
    "/research/affiliates/private",
    "/research/lots/LOT-ALPHA-01",
    "/research/documents/private",
    "/research/policies/private",
    "/research/partners//",
    "/research/%ZZ",
  ])("keeps the private, descendant, or malformed document %s closed", (path) => {
    expect(isPublicResearchDocumentPath(path)).toBe(false);
  });
});

describe("isResearchResetPasswordPath", () => {
  it("matches the reset page in plain, case, and encoded forms", () => {
    expect(isResearchResetPasswordPath("/research/reset-password")).toBe(true);
    expect(isResearchResetPasswordPath("/Research/reset-password")).toBe(true);
    expect(isResearchResetPasswordPath("/research/%72eset-password")).toBe(true);
  });

  it("tolerates the optional trailing slash (wouter route is /research/reset-password/?$)", () => {
    expect(isResearchResetPasswordPath("/research/reset-password/")).toBe(true);
    expect(isResearchResetPasswordPath("/Research/reset-password/")).toBe(true);
  });

  it("does not match other research pages", () => {
    expect(isResearchResetPasswordPath("/research")).toBe(false);
    expect(isResearchResetPasswordPath("/research/member")).toBe(false);
    expect(isResearchResetPasswordPath("/research/reset-password//")).toBe(false);
    expect(isResearchResetPasswordPath("/research/reset-password/extra")).toBe(false);
  });
});

describe("isResearchActivatePath", () => {
  it("matches plain, case, encoded, and trailing-slash activation routes", () => {
    expect(isResearchActivatePath("/research/activate")).toBe(true);
    expect(isResearchActivatePath("/Research/Activate")).toBe(true);
    expect(isResearchActivatePath("/research/%61ctivate")).toBe(true);
    expect(isResearchActivatePath("/research/activate/")).toBe(true);
  });

  it("fails closed for neighboring and malformed routes", () => {
    expect(isResearchActivatePath("/research/activate//")).toBe(false);
    expect(isResearchActivatePath("/research/activate/extra")).toBe(false);
    expect(isResearchActivatePath("/research/application-status")).toBe(false);
    expect(isResearchActivatePath("/research/%ZZ")).toBe(false);
  });
});

describe("isResearchAccessStatePath", () => {
  it("matches plain, case, encoded, and trailing-slash access-state routes", () => {
    expect(isResearchAccessStatePath("/research/access-state")).toBe(true);
    expect(isResearchAccessStatePath("/Research/Access-State")).toBe(true);
    expect(isResearchAccessStatePath("/research/%61ccess-state")).toBe(true);
    expect(isResearchAccessStatePath("/research/access-state/")).toBe(true);
  });

  it("fails closed for neighboring and malformed routes", () => {
    expect(isResearchAccessStatePath("/research/access-state//")).toBe(false);
    expect(isResearchAccessStatePath("/research/access-state/extra")).toBe(false);
    expect(isResearchAccessStatePath("/research/access")).toBe(false);
    expect(isResearchAccessStatePath("/research/activate")).toBe(false);
    expect(isResearchAccessStatePath("/research/%ZZ")).toBe(false);
  });
});

describe("isResearchApplicationStatusPath", () => {
  it("matches every registered alias in plain, case, encoded, and slash forms", () => {
    expect(isResearchApplicationStatusPath("/research/apply/status")).toBe(true);
    expect(isResearchApplicationStatusPath("/research/application/status")).toBe(true);
    expect(isResearchApplicationStatusPath("/research/application-status")).toBe(true);
    expect(isResearchApplicationStatusPath("/Research/Application-Status")).toBe(true);
    expect(isResearchApplicationStatusPath("/research/%61pply/status")).toBe(true);
    expect(isResearchApplicationStatusPath("/research/application/status/")).toBe(true);
  });

  it("fails closed for application and status lookalikes", () => {
    expect(isResearchApplicationStatusPath("/research/apply")).toBe(false);
    expect(isResearchApplicationStatusPath("/research/apply/status//")).toBe(false);
    expect(isResearchApplicationStatusPath("/research/application/status//")).toBe(false);
    expect(isResearchApplicationStatusPath("/research/application-status//")).toBe(false);
    expect(isResearchApplicationStatusPath("/research/apply/status/extra")).toBe(false);
    expect(isResearchApplicationStatusPath("/research/activate")).toBe(false);
    expect(isResearchApplicationStatusPath("/research/%ZZ")).toBe(false);
  });
});

describe("isResearchAdminPath", () => {
  it("matches the canonical admin surface and its descendants", () => {
    expect(isResearchAdminPath("/admin/research")).toBe(true);
    expect(isResearchAdminPath("/admin/research/")).toBe(true);
    expect(isResearchAdminPath("/admin/research/products")).toBe(true);
  });

  it("matches case and percent-encoded variants rendered by the SPA", () => {
    expect(isResearchAdminPath("/Admin/Research")).toBe(true);
    expect(isResearchAdminPath("/%61dmin/research/members")).toBe(true);
    expect(isResearchAdminPath("/admin/%72esearch")).toBe(true);
  });

  it("does not match APIs or neighboring paths", () => {
    expect(isResearchAdminPath("/api/admin/research")).toBe(false);
    expect(isResearchAdminPath("/admin/researchers")).toBe(false);
    expect(isResearchAdminPath("/research")).toBe(false);
    expect(isResearchAdminPath("/admin")).toBe(false);
  });
});
