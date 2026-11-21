import { describe, expect, it } from "vitest";
import { AUTH_RETURN_STATIC_PATHS, researchAuthPath, safeResearchReturnTo } from "./auth-return-to";

describe("shared credential-free auth navigation", () => {
  it.each(AUTH_RETURN_STATIC_PATHS)("round-trips registered static path %s", (path) => {
    const reset = researchAuthPath("/research/reset-password", path);
    const destination = new URL(reset, "https://xenios.invalid").searchParams.get("returnTo");
    expect(destination).toBe(path);
    expect(researchAuthPath("/research/sign-in", destination)).toBe(`/research/sign-in?returnTo=${encodeURIComponent(path)}`);
  });

  it.each([
    null, undefined, 42, {}, ["/research/account"], "", " /research/account", "/research/account ",
    "https://outside.invalid/research/account", "//outside.invalid", "/\\outside.invalid",
    "/research/member/../account", "/research/member/%2e%2e/account", "/research/member/%252faccount",
    "/research/account#access_token=secret", "/research/account\n", "/research/account/",
    "/Research/account", "/research/account/sign-in", "/research/account/organization-invitations/accept",
    "/care/clinical/review", "/admin/research", "/research/member/nonexistent", "/research/account?" + "a".repeat(2048),
  ])("fails closed for malformed/privileged/unmounted destination %j", (value) => {
    expect(safeResearchReturnTo(value)).toBeNull();
    expect(researchAuthPath("/research/reset-password", value)).toBe("/research/reset-password");
  });

  it("keeps only bounded non-secret view/selection hints", () => {
    expect(safeResearchReturnTo("/research/apply/status?token=PRIVATE&email=private%40example.invalid&returnTo=https://outside.invalid"))
      .toBe("/research/apply/status");
    expect(safeResearchReturnTo("/research/partners/dashboard?partnerId=foreign&role=admin&email=private%40example.invalid"))
      .toBe("/research/partners/dashboard");
    expect(safeResearchReturnTo("/research/partners/dashboard/foreign")).toBeNull();
    expect(safeResearchReturnTo("/research/partners/admin")).toBeNull();
    expect(safeResearchReturnTo("/research/partners/resources?partnerId=foreign&token=SECRET"))
      .toBe("/research/partners/resources");
    expect(safeResearchReturnTo("/research/partners/resources/extra")).toBeNull();
    expect(safeResearchReturnTo("/research/member/security?from=expired-session"))
      .toBe("/research/member/security?from=expired-session");
    expect(safeResearchReturnTo("/research/account/orders/XRR-Fixture_01?tab=payment&access_token=SECRET&refresh_token=SECRET&token=SECRET&code=SECRET&returnTo=https://outside.invalid&email=private%40example.invalid&q=private&ref=private"))
      .toBe("/research/account/orders/XRR-Fixture_01?tab=payment");
    expect(safeResearchReturnTo("/research/member/catalog/research_vials/bpc-157?variant=fixture.1&qty=2&intent=buy_now"))
      .toBe("/research/member/catalog/research_vials/bpc-157?variant=fixture.1&qty=2&intent=buy_now");
  });

  it("allows the exact private pending-review return without actor, token or nested authority", () => {
    expect(researchAuthPath("/research/sign-in", "/care/request-intents"))
      .toBe("/research/sign-in?returnTo=%2Fcare%2Frequest-intents");
    expect(safeResearchReturnTo("/care/request-intents?actor=other&token=SECRET&role=clinical_admin"))
      .toBe("/care/request-intents");
    expect(safeResearchReturnTo("/care/request-intents/export")).toBeNull();
  });

  it("returns only to the registered AE shell without scope or permission hints", () => {
    expect(researchAuthPath("/research/sign-in", "/research/account-executive"))
      .toBe("/research/sign-in?returnTo=%2Fresearch%2Faccount-executive");
    expect(safeResearchReturnTo("/research/account-executive?scopeId=other&role=admin&token=PRIVATE"))
      .toBe("/research/account-executive");
    expect(safeResearchReturnTo("/research/account-executive/commands")).toBeNull();
  });

  it("admits only own settings and strips credentials or role hints from the destination", () => {
    expect(researchAuthPath("/research/sign-in", "/research/account/settings?userId=other&role=admin&token=SECRET"))
      .toBe("/research/sign-in?returnTo=%2Fresearch%2Faccount%2Fsettings");
    for (const path of ["/research/account/settings/other", "/research/account/settings/", "/research/register",
      "/research/account/settings#access_token=SECRET", "/research/account/settings/../security/initial-password"]) {
      expect(safeResearchReturnTo(path)).toBeNull();
    }
  });

  it("returns to personal history linking without carrying emailed credentials or organization authority", () => {
    const path = "/research/account/claim-history";
    expect(researchAuthPath("/research/sign-in", `${path}?claim=private-id&token=private-token&organizationId=other&returnTo=https://outside.invalid`))
      .toBe("/research/sign-in?returnTo=%2Fresearch%2Faccount%2Fclaim-history");
    for (const suffix of ["/extra", "s", "/../organizations/other", "#token=private-token"]) {
      expect(safeResearchReturnTo(path + suffix)).toBeNull();
    }
  });

  it("returns only to the self closure page or canonical operation locator without carrying authority or credentials", () => {
    const root = "/research/account/delete", operation = root + "/10000000-0000-4000-8000-000000000001";
    for (const path of [root, operation]) {
      expect(safeResearchReturnTo(path + "?targetId=other&role=admin&attemptCarrier=PRIVATE&token=PRIVATE")).toBe(path);
      expect(researchAuthPath("/research/sign-in", path)).toBe("/research/sign-in?returnTo=" + encodeURIComponent(path));
    }
    for (const path of [root + "/other", operation + "/extra", root + "/00000000-0000-0000-0000-000000000000",
      root + "/10000000-0000-4000-8000-00000000000A", root + "/%311000000-0000-4000-8000-000000000001", root + "#token=PRIVATE"]) {
      expect(safeResearchReturnTo(path)).toBeNull();
    }
  });

  it("drops duplicate, nested, overlong and malformed allowed parameters", () => {
    for (const query of ["tab=payment&tab=tracking", "from=https://outside.invalid", "tab=access_token%3DSECRET", "qty=101", "variant=" + "v".repeat(81), "variant=%252f", "variant=private%40example.invalid", "intent=paid"]) {
      expect(safeResearchReturnTo(`/research/account?${query}`)).toBe("/research/account");
    }
  });

  it("preserves only the assessment's exact monthly check-in mode", () => {
    const destination = "/research/member/assessment?mode=checkin";
    expect(safeResearchReturnTo(destination)).toBe(destination);
    const reset = researchAuthPath("/research/reset-password", destination);
    expect(new URL(reset, "https://xenios.invalid").searchParams.get("returnTo")).toBe(destination);
    for (const query of ["mode=initial", "mode=CHECKIN", "mode=checkin&mode=initial", "mode=checkin%26token%3DSECRET"]) {
      expect(safeResearchReturnTo(`/research/member/assessment?${query}`)).toBe("/research/member/assessment");
    }
    expect(safeResearchReturnTo("/research/account?mode=checkin")).toBe("/research/account");
  });

  it.each([
    "/research/early-access/order-request/XRR-Fixture_01",
    "/research/early-access/order-request/confirmation/XRR-Fixture_01",
    "/research/member/kris-catalog/research_vials/fixture-1",
  ])("preserves the existing bounded dynamic path %s", (path) => {
    expect(safeResearchReturnTo(path)).toBe(path);
    expect(safeResearchReturnTo(`${path}/extra`)).toBeNull();
  });
});
