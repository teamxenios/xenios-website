import { describe, expect, it } from "vitest";
import {
  ORDER_ENTRY_MODES,
  ORDER_ENTRY_MODE_IDS,
  RESEARCH_ORDER_ENTRY_PATH,
  orderEntryDestination,
  orderEntryMode,
  researchOrderModes,
  safeOrderEntryReturnTo,
} from "./order-entry";

describe("Research order entry contract", () => {
  it("publishes exactly the seven approved choices in their intended order", () => {
    expect(RESEARCH_ORDER_ENTRY_PATH).toBe("/research/order");
    expect(ORDER_ENTRY_MODE_IDS).toEqual([
      "quick_early_access",
      "member_account",
      "resume_or_track",
      "assisted_or_volume",
      "organization_or_clinic",
      "care",
      "manual_support",
    ]);
    expect(ORDER_ENTRY_MODES.map((mode) => mode.id)).toEqual(
      ORDER_ENTRY_MODE_IDS,
    );
    expect(new Set(ORDER_ENTRY_MODES.map((mode) => mode.id)).size).toBe(7);
    expect(ORDER_ENTRY_MODES.filter((mode) => mode.primary)).toHaveLength(1);
  });

  it("states every required decision fact for every choice", () => {
    for (const mode of ORDER_ENTRY_MODES) {
      expect(mode.audience.trim(), `${mode.id}: audience`).not.toBe("");
      expect(
        mode.requiredInformation.length,
        `${mode.id}: required information`,
      ).toBeGreaterThan(0);
      expect(
        mode.requiredInformation.every((entry) => entry.trim().length > 0),
        `${mode.id}: blank required information`,
      ).toBe(true);
      expect(
        mode.accountRequirement.trim(),
        `${mode.id}: account requirement`,
      ).not.toBe("");
      expect(mode.nextStep.trim(), `${mode.id}: next step`).not.toBe("");
      expect(
        mode.paymentTiming.trim(),
        `${mode.id}: payment timing`,
      ).not.toBe("");
      expect(
        mode.statusLocation.trim(),
        `${mode.id}: status location`,
      ).not.toBe("");
      expect(
        mode.humanSupport.trim(),
        `${mode.id}: human support`,
      ).not.toBe("");
    }
  });

  it("uses the existing canonical destinations and bootstraps assisted ordering safely", () => {
    expect(orderEntryMode("quick_early_access").href).toBe(
      "/research/early-access",
    );
    expect(orderEntryMode("member_account").href).toBe(
      "/research/member/catalog",
    );
    expect(orderEntryMode("resume_or_track").href).toBe(
      "/research/account/orders",
    );
    // A direct order-request deep link has no Early Access session on a fresh
    // browser. The entry hub therefore starts at the session bootstrap.
    expect(orderEntryMode("assisted_or_volume").href).toBe(
      "/research/early-access",
    );
    expect(orderEntryMode("organization_or_clinic").href).toBe(
      "/research/organizations",
    );
    expect(orderEntryMode("care").href).toBe("/care/schedule");
    expect(orderEntryMode("manual_support").href).toBe("/research/contact");
  });

  it("keeps Care and support outside the five Research modes", () => {
    expect(researchOrderModes().map((mode) => mode.id)).toEqual([
      "quick_early_access",
      "member_account",
      "resume_or_track",
      "assisted_or_volume",
      "organization_or_clinic",
    ]);
    expect(orderEntryMode("care").lane).toBe("care");
    expect(orderEntryMode("manual_support").lane).toBe("support");
  });

  it("allows only catalog or account-order continuations and scrubs unsafe query data", () => {
    const product =
      "/research/member/catalog/research_vials/research-vials-bpc-157?variant=mov_v1&qty=2&intent=buy_now";
    const order =
      "/research/account/orders/XRR-Fixture_01?tab=tracking&token=SECRET&access_token=SECRET&email=private%40example.invalid";

    expect(safeOrderEntryReturnTo(product)).toBe(product);
    expect(safeOrderEntryReturnTo(order)).toBe(
      "/research/account/orders/XRR-Fixture_01?tab=tracking",
    );
    expect(orderEntryDestination("member_account", product)).toBe(product);
    expect(orderEntryDestination("resume_or_track", order)).toBe(
      "/research/account/orders/XRR-Fixture_01?tab=tracking",
    );
  });

  it.each([
    "https://outside.invalid/research/member/catalog",
    "//outside.invalid/research/member/catalog",
    "/admin/research/orders",
    "/care/schedule",
    "/research/member/security",
    "/research/account",
    "/research/early-access",
    "/research/member/catalog#claim-token",
    "/research/member/catalog/../orders",
    null,
  ])("refuses unrelated or unsafe continuation %s", (candidate) => {
    expect(safeOrderEntryReturnTo(candidate)).toBeNull();
  });

  it("never lets one account choice consume the other choice's continuation", () => {
    expect(
      orderEntryDestination("member_account", "/research/account/orders/XRR-1"),
    ).toBe("/research/member/catalog");
    expect(
      orderEntryDestination(
        "resume_or_track",
        "/research/member/catalog/research_vials/research-vials-bpc-157?qty=2",
      ),
    ).toBe("/research/account/orders");
  });

  it("does not encode identity, money, clinical data, or referral authority in public paths", () => {
    for (const mode of ORDER_ENTRY_MODES) {
      expect(mode.href).toMatch(/^\//);
      expect(mode.href).not.toMatch(
        /@|email|phone|patient|diagnos|medication|price|commission|supplier|referral|token/i,
      );
    }
  });
});
