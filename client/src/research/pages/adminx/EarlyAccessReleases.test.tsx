// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type {
  EarlyAccessReleaseDto,
  FirstReleaseCandidateDto,
} from "../../adapters/earlyAccessReleases";
import { CandidateCard, mayOfferApproval } from "./EarlyAccessReleases";

// The one rule this screen exists to hold: a unit with a non-waivable blocker
// carries NO approval action. The server refuses such a release twice over, and
// this is the third refusal, at the surface, so nobody is ever offered a
// decision they are not in a position to make.

vi.mock("../../adapters/earlyAccessReleases", async () => {
  const actual = await vi.importActual<typeof import("../../adapters/earlyAccessReleases")>(
    "../../adapters/earlyAccessReleases",
  );
  return {
    ...actual,
    recordFounderRelease: vi.fn(async () => ({ kind: "ok" as const, data: {} as never })),
    getFounderReleaseReview: vi.fn(),
    getReleaseHistory: vi.fn(),
  };
});

function candidate(
  overrides: Partial<FirstReleaseCandidateDto> = {},
): FirstReleaseCandidateDto {
  return {
    productId: "prod-a",
    variantId: "var-1",
    slug: "product-a",
    product: "Product A",
    canonicalName: "Product A",
    variant: "10 mg, Single-use vial",
    sku: "A-1",
    strength: "10 mg",
    presentation: "Single-use vial",
    priceCents: null,
    currency: "",
    supplier: "mitch",
    fulfillmentMethod: "Manual, shipped by the supplier partner",
    inventoryState: "available",
    quantityLimit: null,
    waivableBlockers: ["PRICE_NOT_APPROVED", "QUANTITY_LIMIT_MISSING"],
    nonwaivableBlockers: [],
    classification: "APPROVABLE_FOR_EARLY_ACCESS",
    recommendedAction: "Ready for a founder release.",
    productVersion: "a".repeat(64),
    regulatoryHoldReason: null,
    authoritativePresentation: true,
    ...overrides,
  };
}

function render(node: React.ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(node);
  });
  return {
    host,
    unmount: () =>
      act(() => {
        root.unmount();
      }),
  };
}

function card(
  unit: FirstReleaseCandidateDto,
  releases: EarlyAccessReleaseDto[] = [],
) {
  return render(
    <CandidateCard
      candidate={unit}
      releases={releases}
      token="admin-token"
      onRecorded={() => {}}
    />,
  );
}

const KEY = "prod-a::var-1";

describe("the approval action and non-waivable blockers", () => {
  it("offers approval when the server reported no non-waivable blocker", () => {
    const { host, unmount } = card(candidate());
    expect(host.querySelector(`[data-testid="ea-release-approve-${KEY}"]`)).not.toBeNull();
    expect(host.querySelector(`[data-testid="ea-release-form-${KEY}"]`)).not.toBeNull();
    expect(host.querySelector(`[data-testid="ea-release-blocked-${KEY}"]`)).toBeNull();
    unmount();
  });

  it("hides approval entirely when a non-waivable blocker exists", () => {
    const { host, unmount } = card(
      candidate({
        nonwaivableBlockers: ["STRENGTH_DISPUTE_UNRESOLVED"],
        classification: "NOT_APPROVABLE_STRENGTH",
      }),
    );
    // Not disabled. Not present. A disabled control is still a control, and the
    // whole point is that the decision is not on offer.
    expect(host.querySelector(`[data-testid="ea-release-approve-${KEY}"]`)).toBeNull();
    expect(host.querySelector(`[data-testid="ea-release-form-${KEY}"]`)).toBeNull();
    expect(host.querySelector(`[data-testid="ea-release-blocked-${KEY}"]`)).not.toBeNull();
    unmount();
  });

  it("hides approval for a regulatory hold and states the recorded reason", () => {
    const { host, unmount } = card(
      candidate({
        nonwaivableBlockers: ["REGULATORY_HOLD"],
        classification: "NOT_APPROVABLE_REGULATORY",
        regulatoryHoldReason: "Held pending a founder decision and counsel review.",
      }),
    );
    expect(host.querySelector(`[data-testid="ea-release-approve-${KEY}"]`)).toBeNull();
    expect(host.querySelector(`[data-testid="ea-release-hold-${KEY}"]`)?.textContent).toContain(
      "counsel review",
    );
    unmount();
  });

  it("hides approval when one non-waivable blocker sits among many waivable ones", () => {
    const { host, unmount } = card(
      candidate({
        waivableBlockers: [
          "PRICE_NOT_APPROVED",
          "QUANTITY_LIMIT_MISSING",
          "DOCUMENTATION_NOT_SATISFIED",
          "IMAGE_PENDING",
        ],
        nonwaivableBlockers: ["FULFILLMENT_UNAVAILABLE"],
        classification: "NOT_APPROVABLE_FULFILLMENT",
      }),
    );
    expect(host.querySelector(`[data-testid="ea-release-approve-${KEY}"]`)).toBeNull();
    unmount();
  });
});

describe("MUTATION: the hidden-approval rule", () => {
  // Three mutations of `mayOfferApproval`, each written out and each shown to
  // disagree with the real predicate on a unit that must not be approvable.
  const held = candidate({ nonwaivableBlockers: ["REGULATORY_HOLD"] });

  it("catches a predicate that only checks the classification", () => {
    const mutated = (unit: FirstReleaseCandidateDto) =>
      unit.classification !== "NOT_APPROVABLE_STRENGTH";
    // A regulatory hold is not a strength dispute, so this mutation offers the
    // approval action for a compound counsel has not cleared.
    expect(mutated(held)).toBe(true);
    expect(mayOfferApproval(held)).toBe(false);
  });

  it("catches a predicate that also accepts a waivable-looking blocker set", () => {
    const mutated = (unit: FirstReleaseCandidateDto) =>
      unit.nonwaivableBlockers.length === 0 || unit.waivableBlockers.length > 0;
    expect(mutated(candidate({ nonwaivableBlockers: ["FULFILLMENT_UNAVAILABLE"] }))).toBe(
      true,
    );
    expect(
      mayOfferApproval(candidate({ nonwaivableBlockers: ["FULFILLMENT_UNAVAILABLE"] })),
    ).toBe(false);
  });

  it("catches a predicate that trusts a hard-coded list instead of the server split", () => {
    const mutated = (unit: FirstReleaseCandidateDto) =>
      !unit.nonwaivableBlockers.includes("IDENTITY_NOT_CONFIRMED");
    // A blocker code added upstream is silently approvable under this mutation.
    expect(mutated(held)).toBe(true);
    expect(mayOfferApproval(held)).toBe(false);
  });

  it("renders the difference, not just the predicate", () => {
    const mutatedWouldRender = held.classification !== "NOT_APPROVABLE_STRENGTH";
    expect(mutatedWouldRender).toBe(true);
    const { host, unmount } = card(held);
    expect(host.querySelector(`[data-testid="ea-release-approve-${KEY}"]`)).toBeNull();
    unmount();
  });
});

describe("what the screen shows a founder", () => {
  it("shows every fact a release is recorded against", () => {
    const { host, unmount } = card(
      candidate({ priceCents: 24_900, currency: "USD", quantityLimit: 3 }),
    );
    const text = host.textContent ?? "";
    expect(host.querySelector(`[data-testid="ea-release-price-${KEY}"]`)?.textContent).toBe(
      "249.00 USD",
    );
    expect(
      host.querySelector(`[data-testid="ea-release-version-${KEY}"]`)?.textContent,
    ).toBe("a".repeat(64));
    expect(text).toContain("A-1");
    expect(text).toContain("10 mg");
    expect(text).toContain("Single-use vial");
    expect(text).toContain("mitch");
    expect(text).toContain("Manual, shipped by the supplier partner");
    expect(
      host.querySelector(`[data-testid="ea-release-waivable-${KEY}"]`)?.textContent,
    ).toBe("PRICE_NOT_APPROVED, QUANTITY_LIMIT_MISSING");
    expect(
      host.querySelector(`[data-testid="ea-release-nonwaivable-${KEY}"]`)?.textContent,
    ).toBe("none");
    unmount();
  });

  it("shows the append-only history, including a revocation", () => {
    const releases: EarlyAccessReleaseDto[] = [
      {
        releaseId: "rel-1",
        portal: "private_early_access",
        productId: "prod-a",
        variantId: "var-1",
        productVersion: "a".repeat(64),
        status: "approved",
        approvedPriceCents: 24_900,
        currency: "USD",
        waivedBlockers: ["PRICE_NOT_APPROVED"],
        approvedQuantityLimit: 3,
        expiresAt: null,
        actor: "founder@example.com",
        reason: "Founder release for the private early access pilot.",
        recordedAt: "2026-08-01T00:00:00.000Z",
      },
      {
        releaseId: "rel-2",
        portal: "private_early_access",
        productId: "prod-a",
        variantId: "var-1",
        productVersion: "a".repeat(64),
        status: "revoked",
        approvedPriceCents: 0,
        currency: "",
        waivedBlockers: [],
        approvedQuantityLimit: 0,
        expiresAt: null,
        actor: "founder@example.com",
        reason: "Revoked pending a supplier document.",
        recordedAt: "2026-08-02T00:00:00.000Z",
      },
    ];
    const { host, unmount } = card(candidate(), releases);
    const history = host.querySelector(`[data-testid="ea-release-history-${KEY}"]`);
    expect(history?.querySelectorAll("li")).toHaveLength(2);
    // Revoking is a new record, never an edit, so both stay visible.
    expect(history?.textContent).toContain("approved");
    expect(history?.textContent).toContain("revoked");
    unmount();
  });

  it("says so plainly when no release was ever recorded", () => {
    const { host, unmount } = card(candidate());
    expect(
      host.querySelector(`[data-testid="ea-release-history-empty-${KEY}"]`),
    ).not.toBeNull();
    unmount();
  });

  it("never offers an actor field, because the actor is whoever signed in", () => {
    const { host, unmount } = card(candidate());
    const form = host.querySelector(`[data-testid="ea-release-form-${KEY}"]`);
    const labels = Array.from(form?.querySelectorAll("label") ?? []).map(
      (label) => label.textContent ?? "",
    );
    expect(labels.some((label) => /actor|approver|signed by/i.test(label))).toBe(false);
    expect(labels).toContain("Reason");
    expect(labels).toContain("Approved price, USD");
    expect(labels).toContain("Per-order quantity limit");
    expect(labels).toContain("Expires at, or blank for no expiry");
    unmount();
  });
});
