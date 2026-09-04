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
    expect(safeResearchReturnTo("/research/account/orders/XRR-Fixture_01?tab=payment&access_token=SECRET&refresh_token=SECRET&token=SECRET&code=SECRET&returnTo=https://outside.invalid&email=private%40example.invalid&q=private&ref=private"))
      .toBe("/research/account/orders/XRR-Fixture_01?tab=payment");
    expect(safeResearchReturnTo("/research/member/catalog/research_vials/bpc-157?variant=fixture.1&qty=2&intent=buy_now"))
      .toBe("/research/member/catalog/research_vials/bpc-157?variant=fixture.1&qty=2&intent=buy_now");
  });

  it("drops duplicate, nested, overlong and malformed allowed parameters", () => {
    for (const query of ["tab=payment&tab=tracking", "from=https://outside.invalid", "tab=access_token%3DSECRET", "qty=101", "variant=" + "v".repeat(81), "variant=%252f", "variant=private%40example.invalid", "intent=paid"]) {
      expect(safeResearchReturnTo(`/research/account?${query}`)).toBe("/research/account");
    }
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
