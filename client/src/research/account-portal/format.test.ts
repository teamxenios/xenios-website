import { describe, expect, it } from "vitest";
import {
  authoritativeCarePharmacyCount,
  authoritativeOrderCount,
  carePharmacyHistoryAvailability,
  commerceRecordPresentation,
  formatAccountDate,
  formatMembershipRenewal,
  safeAccountPath,
  safeBillingManagementUrl,
  safeExternalUrl,
} from "./format";
import {
  FIXTURE_ACCOUNT_OVERVIEW,
  FIXTURE_MEMBERSHIP_MANUAL,
} from "@shared/research/customer-account/fixtures";
import type { MembershipDto } from "@shared/research/customer-account/contract";

function membershipWithRenewal(renewal: MembershipDto["renewal"]): MembershipDto {
  return { ...FIXTURE_MEMBERSHIP_MANUAL, renewal };
}

function legacyMembershipWithoutRenewal(): MembershipDto {
  const { renewal: _authoritativeRenewal, ...legacy } = FIXTURE_MEMBERSHIP_MANUAL;
  // A legacy timestamp is compatibility-only and must not become evidence.
  const legacyOnly = { ...legacy, nextRenewalAt: "2030-01-01" };
  // @ts-expect-error Intentionally exercise a pre-contract runtime payload.
  return legacyOnly;
}

describe("account portal date presentation", () => {
  it("preserves date-only and midnight-UTC calendar dates", () => {
    expect(formatAccountDate("2026-07-01")).toBe("Jul 1, 2026");
    expect(formatAccountDate("2026-07-01T00:00Z")).toBe("Jul 1, 2026");
    expect(formatAccountDate("2026-07-01T00:00:00.0Z")).toBe("Jul 1, 2026");
    expect(formatAccountDate("2026-07-01T00:00:00.000Z")).toBe("Jul 1, 2026");
    expect(formatAccountDate("2026-07-01T00:00:00.000000000Z")).toBe("Jul 1, 2026");
  });

  it("fails closed for absent or malformed dates", () => {
    expect(formatAccountDate(null)).toBe("Not available");
    expect(formatAccountDate("not-a-date")).toBe("Not available");
    expect(formatAccountDate("2026-02-31")).toBe("Not available");
    expect(formatAccountDate("02/03/2026")).toBe("Not available");
    expect(formatAccountDate("2026-01-01T24:00:00Z")).toBe("Not available");
    expect(formatAccountDate("2026-07-01", true)).toBe("Not available");
  });

  it("uses only the explicit renewal discriminant", () => {
    expect(formatMembershipRenewal(membershipWithRenewal({
      state: "scheduled",
      nextRenewalAt: "2026-07-01",
    }))).toBe("Jul 1, 2026");
    expect(formatMembershipRenewal(membershipWithRenewal({
      state: "not_scheduled",
      nextRenewalAt: null,
    }))).toBe("Not scheduled");
    expect(formatMembershipRenewal(membershipWithRenewal({
      state: "unavailable",
      nextRenewalAt: null,
    }))).toBe("Renewal schedule unavailable");
    expect(formatMembershipRenewal(membershipWithRenewal({
      state: "scheduled",
      nextRenewalAt: "not-a-date",
    }))).toBe("Renewal schedule unavailable");
    expect(formatMembershipRenewal(membershipWithRenewal({
      state: "scheduled",
      nextRenewalAt: "2026-02-31",
    }))).toBe("Renewal schedule unavailable");
    expect(formatMembershipRenewal(legacyMembershipWithoutRenewal()))
      .toBe("Renewal schedule unavailable");
  });
});

describe("account portal authority guards", () => {
  it("uses numeric order counts only from complete authoritative evidence", () => {
    const complete = {
      ...FIXTURE_ACCOUNT_OVERVIEW.orderHistory,
      availability: "complete" as const,
      authoritativeRecordCount: 2,
    };
    const partial = {
      ...complete,
      availability: "partial" as const,
      authoritativeRecordCount: null,
    };
    expect(authoritativeOrderCount(complete)).toBe(2);
    expect(authoritativeOrderCount(partial)).toBeNull();
    expect(authoritativeOrderCount({ ...complete, authoritativeRecordCount: -1 })).toBeNull();
    expect(authoritativeOrderCount({ ...complete, authoritativeRecordCount: 1.5 })).toBeNull();
  });

  it("uses numeric Care/pharmacy counts only from available authoritative evidence", () => {
    const availableZero = { availability: "available", authoritativeRecordCount: 0 } as const;
    const availableTwo = { availability: "available", authoritativeRecordCount: 2 } as const;
    const partial = { availability: "partial", authoritativeRecordCount: null } as const;
    const unavailable = { availability: "unavailable", authoritativeRecordCount: null } as const;

    expect(authoritativeCarePharmacyCount(availableZero)).toBe(0);
    expect(authoritativeCarePharmacyCount(availableTwo)).toBe(2);
    expect(authoritativeCarePharmacyCount(partial)).toBeNull();
    expect(authoritativeCarePharmacyCount(unavailable)).toBeNull();
    expect(authoritativeCarePharmacyCount({ ...availableTwo, authoritativeRecordCount: -1 })).toBeNull();
    expect(authoritativeCarePharmacyCount({ ...availableTwo, authoritativeRecordCount: 1.5 })).toBeNull();
    expect(carePharmacyHistoryAvailability(partial)).toBe("partial");
    expect(carePharmacyHistoryAvailability(unavailable)).toBe("unavailable");
    // @ts-expect-error Intentionally exercise an invalid discriminant/count pair.
    expect(carePharmacyHistoryAvailability({ availability: "available", authoritativeRecordCount: null }))
      .toBe("unavailable");
    // NaN is type-compatible with number but invalid authoritative evidence.
    expect(carePharmacyHistoryAvailability({ availability: "available", authoritativeRecordCount: Number.NaN }))
      .toBe("unavailable");
    // @ts-expect-error Intentionally exercise an invalid discriminant/count pair.
    expect(carePharmacyHistoryAvailability({ availability: "partial", authoritativeRecordCount: 1 }))
      .toBe("unavailable");
    // @ts-expect-error Intentionally exercise an invalid discriminant/count pair.
    expect(carePharmacyHistoryAvailability({ availability: "unavailable", authoritativeRecordCount: 0 }))
      .toBe("unavailable");
  });

  it("labels record kind only from the explicit discriminant", () => {
    expect(commerceRecordPresentation("order"))
      .toEqual({ label: "Order", dateVerb: "Placed" });
    expect(commerceRecordPresentation("request"))
      .toEqual({ label: "Request", dateVerb: "Requested" });
    expect(commerceRecordPresentation("unknown"))
      .toEqual({ label: "Commerce record", dateVerb: "Recorded" });
  });

  it("accepts only canonical document paths and credential-free HTTPS links", () => {
    expect(safeAccountPath("/api/research/customer-account/documents/doc-fixture-0001"))
      .toBe("/api/research/customer-account/documents/doc-fixture-0001");
    expect(safeAccountPath("/api/research/customer-account/documents/../private"))
      .toBeNull();
    expect(safeAccountPath("/api/research/customer-account/documents/doc-1?raw=1"))
      .toBeNull();
    expect(safeExternalUrl("https://tracking.invalid/fixture/1Z999TEST"))
      .toBe("https://tracking.invalid/fixture/1Z999TEST");
    expect(safeExternalUrl("https://user:pass@tracking.invalid/fixture"))
      .toBeNull();
    expect(safeExternalUrl("/relative"))
      .toBeNull();
    expect(safeBillingManagementUrl("https://billing.stripe.com/p/session/test_fixture"))
      .toBe("https://billing.stripe.com/p/session/test_fixture");
    expect(safeBillingManagementUrl("https://billing.stripe.com.attacker.invalid/session"))
      .toBeNull();
    expect(safeBillingManagementUrl("https://attacker.invalid/billing"))
      .toBeNull();
  });
});
