import { describe, expect, it } from "vitest";
import {
  CATALOG_DISCOVERY_STATUSES,
  parseCatalogDiscoveryItem,
  parseCatalogDiscoveryProjection,
  savedInterestCommand,
} from "./presentation-contract";

const AT = "2026-08-28T12:00:00.000Z";

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    productId: "product-1",
    variantId: "variant-1",
    displayName: "Example offering",
    variantLabel: "Exact variant",
    category: { key: "research", label: "Research" },
    strength: { key: "ten-mg", label: "10 mg" },
    form: { key: "vial", label: "Vial" },
    status: "live",
    statusExplanation: "Explicit live evidence is recorded.",
    accessPath: "direct_order",
    detailHref: "/research/member/catalog/example",
    image: {
      href: "https://media.xeniostechnology.com/example.webp",
      altText: "Example package",
      width: 800,
      height: 600,
    },
    action: {
      kind: "request_order",
      href: "/research/member/product-requests/new",
    },
    savedInterest: {
      availability: "available",
      state: "not_saved",
      revision: 3,
    },
    ...overrides,
  };
}

describe("catalog discovery presentation contract", () => {
  it("publishes exactly the required seven-state vocabulary", () => {
    expect(CATALOG_DISCOVERY_STATUSES).toEqual([
      "live",
      "request_only",
      "provider_required",
      "documentation_pending",
      "held",
      "unavailable",
      "unknown",
    ]);
  });

  it.each([
    ["live", "direct_order", "request_order"],
    ["request_only", "request_availability", "request_availability"],
    ["provider_required", "care", "continue_care"],
    [
      "documentation_pending",
      "availability_list",
      "join_availability_list",
    ],
  ] as const)(
    "accepts only the compatible explicit %s action",
    (status, accessPath, kind) => {
      const parsed = parseCatalogDiscoveryItem(
        row({
          status,
          accessPath,
          action: {
            kind,
            href: "/research/member/product-requests/new",
            label: "Untrusted label",
          },
        }),
      );
      expect(parsed?.status).toBe(status);
      expect(parsed?.accessPath).toBe(accessPath);
      expect(parsed?.action?.kind).toBe(kind);
      expect(parsed?.action?.label).not.toBe("Untrusted label");
    },
  );

  it("never infers status, strength, form, or action from hostile lure fields", () => {
    const parsed = parseCatalogDiscoveryItem(
      row({
        status: undefined,
        accessPath: undefined,
        strength: undefined,
        form: undefined,
        variantLabel: "10 mg vial",
        action: {
          kind: "request_order",
          href: "/research/member/product-requests/new",
        },
        workbookPresent: true,
        catalogPresent: true,
        demandCount: 9_999,
        verbalSupplyConfirmation: "confirmed",
        supplierRelationship: "active",
        partnerRequest: "priority",
        pendingActivation: { state: "approved" },
      }),
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.status).toBe("unknown");
    expect(parsed?.accessPath).toBe("unknown");
    expect(parsed?.strength).toBeNull();
    expect(parsed?.form).toBeNull();
    expect(parsed?.action).toBeNull();
  });

  it.each(["available_now", "pending_pharmacy_activation", "LIVE", null])(
    "treats malformed or superseded status %s as unknown",
    (status) => {
      const parsed = parseCatalogDiscoveryItem(row({ status }));
      expect(parsed?.status).toBe("unknown");
      expect(parsed?.accessPath).toBe("unknown");
      expect(parsed?.action).toBeNull();
    },
  );

  it("rejects malformed and non-live purchase-like actions without executing authority", () => {
    expect(
      parseCatalogDiscoveryItem(
        row({ status: "request_only", action: { kind: "buy_now", href: "/research/cart" } }),
      )?.action,
    ).toBeNull();
    const heldConflict = parseCatalogDiscoveryItem(
      row({
        status: "held",
        accessPath: "direct_order",
        action: {
          kind: "request_order",
          href: "/research/member/product-requests/new",
        },
      }),
    );
    expect(heldConflict?.accessPath).toBe("unknown");
    expect(heldConflict?.action).toBeNull();
    expect(
      parseCatalogDiscoveryItem(
        row({
          action: { kind: "request_order", href: "https://evil.example/buy" },
        }),
      )?.action,
    ).toBeNull();
  });

  it("fails malformed media and saved-interest evidence closed", () => {
    const parsed = parseCatalogDiscoveryItem(
      row({
        image: {
          href: "javascript:alert(1)",
          altText: "Example",
          width: 0,
          height: "600",
        },
        savedInterest: {
          availability: "available",
          state: "saved",
          interestId: "interest-1",
          revision: -1,
          recordedAt: "yesterday",
        },
      }),
    );
    expect(parsed?.image).toBeNull();
    expect(parsed?.savedInterest).toEqual({ availability: "unavailable" });
    expect(parsed && savedInterestCommand(parsed)).toBeNull();
  });

  it("emits a revision-bound saved-interest command without mutating evidence", () => {
    const parsed = parseCatalogDiscoveryItem(
      row({
        savedInterest: {
          availability: "available",
          state: "saved",
          interestId: "interest-1",
          revision: 7,
          recordedAt: AT,
        },
      }),
    );
    expect(parsed && savedInterestCommand(parsed)).toEqual({
      kind: "remove_saved_interest",
      productId: "product-1",
      variantId: "variant-1",
      interestId: "interest-1",
      expectedRevision: 7,
    });
    expect(parsed?.savedInterest).toMatchObject({ state: "saved", revision: 7 });
  });

  it("separates rejected identity rows from an authoritative empty result", () => {
    expect(
      parseCatalogDiscoveryProjection([
        row(),
        row({ productId: "" }),
        null,
      ]),
    ).toMatchObject({ rejectedCount: 2, items: [{ productId: "product-1" }] });
  });
});
