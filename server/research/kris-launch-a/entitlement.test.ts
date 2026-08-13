import { describe, expect, it } from "vitest";
import {
  KRIS_PARTNER_EMAIL_ENV_VAR,
  KRIS_PARTNER_FOUNDER_CONFIRMED_EMAIL,
  KRIS_PARTNER_MEMBER_ID_ENV_VAR,
  krisEntitlementAwaitingMemberId,
  resolveKrisEntitlement,
} from "./entitlement";

const KRIS_EMAIL = "info@romanhealthcollective.com";
const KRIS_MEMBER_ID = "11111111-2222-3333-4444-555555555555";

describe("Kris price profile entitlement", () => {
  it("entitles the founder-confirmed address before the account exists", () => {
    expect(
      resolveKrisEntitlement({ memberId: null, email: KRIS_EMAIL }, {}),
    ).toEqual({
      entitled: true,
      profile: "KRIS_VOLUME_PARTNER",
      boundBy: "founder_confirmed_email",
    });
  });

  it("ships the founder-confirmed address as the committed default", () => {
    // Committed rather than environment-only so that the person entitled to a
    // confidential price sheet is visible in review.
    expect(KRIS_PARTNER_FOUNDER_CONFIRMED_EMAIL).toBe(KRIS_EMAIL);
  });

  it("ignores case and surrounding whitespace on the address", () => {
    expect(
      resolveKrisEntitlement({ memberId: null, email: "  INFO@RomanHealthCollective.com " }, {}),
    ).toMatchObject({ entitled: true, boundBy: "founder_confirmed_email" });
  });

  it("prefers the canonical member id once it is configured", () => {
    const result = resolveKrisEntitlement(
      { memberId: KRIS_MEMBER_ID, email: KRIS_EMAIL },
      { [KRIS_PARTNER_MEMBER_ID_ENV_VAR]: KRIS_MEMBER_ID },
    );
    expect(result).toEqual({
      entitled: true,
      profile: "KRIS_VOLUME_PARTNER",
      boundBy: "member_id",
    });
  });

  it("refuses a member id mismatch and does NOT fall back to the address", () => {
    // The point of configuring the id is to retire the mutable binding. A
    // second chance on email would reintroduce exactly what it retired, so a
    // viewer holding the right address but the wrong id is refused.
    expect(
      resolveKrisEntitlement(
        { memberId: "99999999-9999-9999-9999-999999999999", email: KRIS_EMAIL },
        { [KRIS_PARTNER_MEMBER_ID_ENV_VAR]: KRIS_MEMBER_ID },
      ),
    ).toEqual({ entitled: false, reason: "no_matching_profile" });
  });

  it("refuses every other member, which is the whole point", () => {
    for (const email of [
      "someone.else@example.com",
      "info@romanhealthcollective.com.evil.test",
      "xinfo@romanhealthcollective.com",
      "info@romanhealthcollective.co",
      "",
      "   ",
    ]) {
      expect(
        resolveKrisEntitlement({ memberId: null, email }, {}),
      ).toEqual({ entitled: false, reason: "no_matching_profile" });
    }
  });

  it("has no fallback profile at all", () => {
    const result = resolveKrisEntitlement(
      { memberId: "some-other-member", email: "another@example.com" },
      {},
    );
    expect(result.entitled).toBe(false);
    expect(JSON.stringify(result)).not.toContain("KRIS_VOLUME_PARTNER");
  });

  it("lets an operator move the address without a code change", () => {
    expect(
      resolveKrisEntitlement(
        { memberId: null, email: "new.partner@example.com" },
        { [KRIS_PARTNER_EMAIL_ENV_VAR]: "new.partner@example.com" },
      ),
    ).toMatchObject({ entitled: true });
    // and the previous address stops working, rather than both working
    expect(
      resolveKrisEntitlement(
        { memberId: null, email: KRIS_EMAIL },
        { [KRIS_PARTNER_EMAIL_ENV_VAR]: "new.partner@example.com" },
      ),
    ).toEqual({ entitled: false, reason: "no_matching_profile" });
  });

  it("reports that entitlement still rests on the address, so it is not forgotten", () => {
    expect(krisEntitlementAwaitingMemberId({})).toBe(true);
    expect(
      krisEntitlementAwaitingMemberId({ [KRIS_PARTNER_MEMBER_ID_ENV_VAR]: KRIS_MEMBER_ID }),
    ).toBe(false);
  });

  it("does not entitle on a blank configured id plus a blank viewer id", () => {
    expect(
      resolveKrisEntitlement(
        { memberId: "   ", email: "nobody@example.com" },
        { [KRIS_PARTNER_MEMBER_ID_ENV_VAR]: "   " },
      ),
    ).toEqual({ entitled: false, reason: "no_matching_profile" });
  });
});
