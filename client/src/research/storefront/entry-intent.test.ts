import { describe, expect, it } from "vitest";
import { safeResearchReturnTo } from "../lib/member-routing";
import {
  memberReturnToForIntent,
  preselectionFromSearch,
  safeStorefrontIntent,
  signInHrefForIntent,
} from "./entry-intent";

const GOOD = {
  family: "research_vials",
  slug: "research-vials-bpc-157",
  variantId: "mov_test_variant",
  quantity: 2,
  action: "BUY_NOW" as const,
};

describe("safeStorefrontIntent", () => {
  it("accepts a real selection", () => {
    expect(safeStorefrontIntent(GOOD)).toEqual(GOOD);
  });

  it("refuses everything outside the closed shapes", () => {
    const bads = [
      { ...GOOD, family: "not_a_family" },
      { ...GOOD, family: "RESEARCH_VIALS" },
      { ...GOOD, slug: "../../../etc" },
      { ...GOOD, slug: "UPPER-CASE" },
      { ...GOOD, slug: "" },
      { ...GOOD, variantId: "id with spaces" },
      { ...GOOD, variantId: "a".repeat(81) },
      { ...GOOD, variantId: "x/../y" },
      { ...GOOD, quantity: 0 },
      { ...GOOD, quantity: 51 },
      { ...GOOD, quantity: 2.5 },
      { ...GOOD, quantity: Number.NaN },
      { ...GOOD, action: "TEMPORARILY_HELD" as const },
      { ...GOOD, action: "NOT_AVAILABLE" as const },
    ];
    for (const bad of bads) {
      expect(safeStorefrontIntent(bad)).toBeNull();
    }
  });
});

describe("memberReturnToForIntent", () => {
  it("builds the exact member catalog path with the intent in the query", () => {
    const intent = safeStorefrontIntent(GOOD);
    expect(intent).not.toBeNull();
    expect(memberReturnToForIntent(intent!)).toBe(
      "/research/member/catalog/research_vials/research-vials-bpc-157?variant=mov_test_variant&qty=2&intent=buy_now",
    );
  });

  it("every built returnTo survives the sign-in page's own validator intact", () => {
    // The contract this whole flow rests on: what the storefront builds, the
    // sign-in validator admits unchanged, query and all. If this breaks, the
    // visitor lands on the member home instead of their product.
    for (const action of ["BUY_NOW", "ASSISTED_ORDER", "REQUEST_QUOTE", "CARE"] as const) {
      const intent = safeStorefrontIntent({ ...GOOD, action });
      const returnTo = memberReturnToForIntent(intent!);
      expect(safeResearchReturnTo(returnTo)).toBe(returnTo);
    }
  });
});

describe("signInHrefForIntent", () => {
  it("encodes the returnTo once and falls back to plain sign-in", () => {
    const intent = safeStorefrontIntent(GOOD);
    const href = signInHrefForIntent(intent);
    expect(href.startsWith("/research/sign-in?returnTo=")).toBe(true);
    const encoded = href.slice("/research/sign-in?returnTo=".length);
    expect(decodeURIComponent(encoded)).toBe(memberReturnToForIntent(intent!));
    expect(signInHrefForIntent(null)).toBe("/research/sign-in");
  });
});

describe("preselectionFromSearch", () => {
  it("round-trips what the storefront wrote", () => {
    const intent = safeStorefrontIntent(GOOD)!;
    const search = memberReturnToForIntent(intent).split("?")[1];
    expect(preselectionFromSearch(`?${search}`)).toEqual({
      variantId: "mov_test_variant",
      quantity: 2,
    });
  });

  it("drops crafted values instead of throwing", () => {
    expect(preselectionFromSearch("?variant=<script>&qty=51")).toEqual({
      variantId: null,
      quantity: null,
    });
    expect(preselectionFromSearch("?variant=ok_id&qty=0")).toEqual({
      variantId: "ok_id",
      quantity: null,
    });
    expect(preselectionFromSearch("")).toEqual({
      variantId: null,
      quantity: null,
    });
    expect(preselectionFromSearch("?qty=007")).toEqual({
      variantId: null,
      quantity: null,
    });
  });
});
