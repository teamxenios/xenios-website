import { describe, expect, it } from "vitest";
import { accountNextActionLink } from "./next-action";

describe("account next-action navigation boundary", () => {
  it.each([
    ["care", "/research/account/care", "Review Care status"],
    ["membership", "/research/account/subscription", "Review billing details"],
    ["orders", "/research/account/orders", "Review commerce history"],
    ["support", "/research/account/support", "Review with support"],
  ])("maps %s to an implemented private destination", (kind, href, label) => {
    expect(accountNextActionLink({ kind })).toEqual({ href, label });
  });

  it("keeps an opaque reference without treating its prefix as an order type", () => {
    expect(accountNextActionLink({ kind: "order", reference: "XRR-SYNTHETIC-ORDER" })).toEqual({
      href: "/research/account/orders/XRR-SYNTHETIC-ORDER", label: "Review order details",
    });
  });

  it.each(["", "../admin", "//example.invalid", "A?token=secret", "A#token", "A%2fB", "A\\B", "A".repeat(193), null, 3])(
    "refuses unsafe order references (%s)", (reference) => {
      expect(accountNextActionLink({ kind: "order", reference })).toEqual({
        href: "/research/account/orders", label: "Review commerce history",
      });
    },
  );

  it.each([undefined, null, [], "https://example.invalid", { kind: "admin" }, { kind: "url", href: "javascript:alert(1)" }])(
    "falls back for absent or unrecognized wire data", (target) => {
      expect(accountNextActionLink(target)).toEqual({ href: "/research/account/support", label: "Review with support" });
    },
  );

  it("does not honor a supplied href even on a recognized target", () => {
    expect(accountNextActionLink({ kind: "care", href: "https://example.invalid" }).href).toBe("/research/account/care");
  });
});
