import { describe, expect, it } from "vitest";
import { isResearchPath, isResearchResetPasswordPath } from "./paths";

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

describe("isResearchResetPasswordPath", () => {
  it("matches the reset page in plain, case, and encoded forms", () => {
    expect(isResearchResetPasswordPath("/research/reset-password")).toBe(true);
    expect(isResearchResetPasswordPath("/Research/reset-password")).toBe(true);
    expect(isResearchResetPasswordPath("/research/%72eset-password")).toBe(true);
  });

  it("does not match other research pages", () => {
    expect(isResearchResetPasswordPath("/research")).toBe(false);
    expect(isResearchResetPasswordPath("/research/member")).toBe(false);
  });
});
