import { describe, expect, it } from "vitest";

import type { EarlyAccessCatalogRow } from "../catalog/early-access-catalog";
import {
  EARLY_ACCESS_RELEASE_PORTAL,
  InMemoryEarlyAccessReleaseLedger,
  decideEarlyAccessRelease,
  earlyAccessReleaseVersion,
  validateEarlyAccessRelease,
  type EarlyAccessRelease,
} from "./founder-release";

// The whole point of this module is that a founder can sell a unit Product
// Control holds, WITHOUT that override leaking anywhere else or surviving a
// change to the product. These tests are written against those four properties
// rather than against the shape of the code.

const HELD_BLOCKERS = ["PRICE_NOT_APPROVED", "DOCUMENTATION_NOT_SATISFIED"] as const;

function row(overrides: Partial<EarlyAccessCatalogRow> = {}): EarlyAccessCatalogRow {
  return {
    productId: "prod-retatrutide",
    slug: "retatrutide",
    displayName: "Retatrutide",
    canonicalName: "retatrutide",
    variantId: "var-10mg",
    sku: "RETA-10",
    strength: "10 mg",
    presentation: "lyophilised vial",
    priceCents: null,
    currency: "",
    audience: "member",
    availability: "available",
    offerState: "APPROVAL_REQUIRED_PURCHASE",
    description: "",
    imageState: "none",
    quantityLimit: 3,
    supplierReady: false,
    disputeStatus: { identity: "none", strength: "none" },
    purchasable: false,
    blockers: [...HELD_BLOCKERS],
    ...overrides,
  } as unknown as EarlyAccessCatalogRow;
}

function draft(overrides: Record<string, unknown> = {}) {
  return {
    releaseId: "rel-0001",
    productId: "prod-retatrutide",
    variantId: "var-10mg",
    productVersion: earlyAccessReleaseVersion(row()),
    status: "approved",
    approvedPriceCents: 24_900,
    currency: "USD",
    waivedBlockers: [...HELD_BLOCKERS],
    approvedQuantityLimit: 3,
    expiresAt: null,
    actor: "Samuel Boadu",
    reason: "Founder release for the private early access pilot.",
    recordedAt: "2026-08-04T12:00:00.000Z",
    ...overrides,
  };
}

function approved(overrides: Record<string, unknown> = {}): EarlyAccessRelease {
  const validated = validateEarlyAccessRelease(draft(overrides));
  if (!validated.ok) throw new Error(`fixture invalid: ${validated.code}`);
  return validated.release;
}

describe("the founder release makes a held unit purchasable inside Early Access", () => {
  it("releases the exact unit at the founder's price", () => {
    const decision = decideEarlyAccessRelease({ row: row(), releases: [approved()] });
    expect(decision.released).toBe(true);
    if (!decision.released) return;
    expect(decision.priceCents).toBe(24_900);
    expect(decision.currency).toBe("USD");
    expect(decision.releaseId).toBe("rel-0001");
  });

  it("holds a unit with no founder release, and says why", () => {
    const decision = decideEarlyAccessRelease({ row: row(), releases: [] });
    expect(decision.released).toBe(false);
    if (decision.released) return;
    expect(decision.hold).toBe("NO_FOUNDER_RELEASE");
    // Product Control's real reasons still reach the customer-facing copy.
    expect(decision.unwaivedBlockers).toEqual([...HELD_BLOCKERS]);
  });

  it("does not release a DIFFERENT unit of the same product", () => {
    const other = row({ variantId: "var-20mg", sku: "RETA-20" });
    const decision = decideEarlyAccessRelease({ row: other, releases: [approved()] });
    expect(decision.released).toBe(false);
  });
});

describe("the override is scoped to Private Early Access and cannot leak", () => {
  it("refuses a release recorded for any other portal", () => {
    for (const portal of ["member_storefront", "public_storefront", "care", "affiliate", "supplier"]) {
      const validated = validateEarlyAccessRelease(draft({ portal }));
      expect(validated.ok).toBe(false);
      if (!validated.ok) expect(validated.code).toBe("PORTAL_NOT_PERMITTED");
    }
  });

  it("ignores a release whose portal was tampered with after validation", () => {
    // A record that reached storage by some other route must still not count.
    const forged = { ...approved(), portal: "member_storefront" } as unknown as EarlyAccessRelease;
    const decision = decideEarlyAccessRelease({ row: row(), releases: [forged] });
    expect(decision.released).toBe(false);
    if (!decision.released) expect(decision.hold).toBe("NO_FOUNDER_RELEASE");
  });

  it("pins the only permitted portal", () => {
    expect(EARLY_ACCESS_RELEASE_PORTAL).toBe("private_early_access");
  });
});

describe("a release is bound to the product facts the founder actually saw", () => {
  it("goes STALE when the strength changes", () => {
    const release = approved();
    const changed = row({ strength: "15 mg" });
    const decision = decideEarlyAccessRelease({ row: changed, releases: [release] });
    expect(decision.released).toBe(false);
    if (!decision.released) expect(decision.hold).toBe("RELEASE_STALE");
  });

  it("goes STALE when the SKU, presentation, or canonical identity changes", () => {
    for (const change of [{ sku: "RETA-10-B" }, { presentation: "solution" }, { canonicalName: "tirzepatide" }]) {
      const decision = decideEarlyAccessRelease({ row: row(change), releases: [approved()] });
      expect(decision.released).toBe(false);
      if (!decision.released) expect(decision.hold).toBe("RELEASE_STALE");
    }
  });

  it("goes STALE when Product Control reports a DIFFERENT set of problems", () => {
    // The founder waived what they were shown. A new blocker means the picture
    // they approved is not the picture now, so the unit is held for review.
    const changed = row({ blockers: [...HELD_BLOCKERS, "IMAGE_PENDING"] });
    const decision = decideEarlyAccessRelease({ row: changed, releases: [approved()] });
    expect(decision.released).toBe(false);
    if (!decision.released) expect(decision.hold).toBe("RELEASE_STALE");
  });

  it("the version is deterministic and order independent for blockers", () => {
    const a = earlyAccessReleaseVersion(row({ blockers: ["PRICE_NOT_APPROVED", "DOCUMENTATION_NOT_SATISFIED"] }));
    const b = earlyAccessReleaseVersion(row({ blockers: ["DOCUMENTATION_NOT_SATISFIED", "PRICE_NOT_APPROVED"] }));
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("the version separates units that differ only by a field boundary", () => {
    // Naive concatenation would collide "10 mg"+"vial" with "10"+" mg vial".
    const a = earlyAccessReleaseVersion(row({ strength: "10 mg", presentation: "vial" }));
    const b = earlyAccessReleaseVersion(row({ strength: "10", presentation: "mg vial" }));
    expect(a).not.toBe(b);
  });
});

describe("nothing is waived by accident", () => {
  it("holds the unit when a blocker appears that the release never waived", () => {
    // Same facts the founder saw, except one extra blocker they never waived.
    const changed = row({ blockers: [...HELD_BLOCKERS, "IMAGE_PENDING"] });
    const release = approved({ productVersion: earlyAccessReleaseVersion(changed) });
    const decision = decideEarlyAccessRelease({ row: changed, releases: [release] });
    expect(decision.released).toBe(false);
    if (!decision.released) {
      expect(decision.hold).toBe("BLOCKERS_NOT_WAIVED");
      expect(decision.unwaivedBlockers).toEqual(["IMAGE_PENDING"]);
    }
  });

  it.each([
    ["an identity dispute", "IDENTITY_DISPUTE_UNRESOLVED"],
    ["a strength dispute", "STRENGTH_DISPUTE_UNRESOLVED"],
    ["a presentation dispute", "PRESENTATION_DISPUTE_UNRESOLVED"],
    ["an unconfirmed identity", "IDENTITY_NOT_CONFIRMED"],
    ["an unconfirmed strength", "STRENGTH_NOT_CONFIRMED"],
    ["an unknown formula", "FORMULA_UNKNOWN"],
    ["an unknown component split", "COMPONENT_SPLIT_UNKNOWN"],
    ["a SKU identity mismatch", "SKU_IDENTITY_MISMATCH"],
    ["a regulatory hold", "REGULATORY_HOLD"],
    ["a recall", "RECALL"],
    ["a stop ship", "STOP_SHIP"],
    ["a supplier quality hold", "SUPPLIER_QUALITY_HOLD"],
    ["an unassigned supplier", "SUPPLIER_NOT_ASSIGNED"],
    ["an unavailable fulfilment path", "FULFILLMENT_UNAVAILABLE"],
    ["a disallowed audience", "AUDIENCE_NOT_PERMITTED"],
  ])("REFUSES to record a release waiving %s", (_label, blocker) => {
    // A founder may bridge an operational gap. They may never assert that we
    // know what is in the vial when we do not.
    const validated = validateEarlyAccessRelease(
      draft({ waivedBlockers: [...HELD_BLOCKERS, blocker] }),
    );
    expect(validated.ok).toBe(false);
    if (!validated.ok) expect(validated.code).toBe("NONWAIVABLE_BLOCKER");
  });

  it.each([
    ["lab documentation pending", "DOCUMENTATION_NOT_SATISFIED"],
    ["lab documentation pending (explicit code)", "LAB_DOCUMENTATION_PENDING"],
    ["a missing image", "IMAGE_PENDING"],
    ["manual fulfilment", "MANUAL_FULFILLMENT_REQUIRED"],
    ["pending supplier automation", "AUTOMATED_SUPPLIER_INTEGRATION_PENDING"],
    ["pending tracking automation", "AUTOMATED_TRACKING_PENDING"],
    ["a missing quantity limit", "QUANTITY_LIMIT_MISSING"],
  ])("ALLOWS waiving %s when nothing about the contents is in doubt", (_label, blocker) => {
    const unit = row({ blockers: [blocker] });
    const release = approved({
      waivedBlockers: [blocker],
      productVersion: earlyAccessReleaseVersion(unit),
    });
    const decision = decideEarlyAccessRelease({ row: unit, releases: [release] });
    expect(decision.released).toBe(true);
  });

  it("IGNORES a stored release that waives a non-waivable blocker", () => {
    // Validation refuses to record one, but a record could arrive by another
    // route: a direct database write, a backup restored from older rules, a code
    // path nobody checked. The decision must not trust the ledger.
    const unit = row({ blockers: ["STRENGTH_DISPUTE_UNRESOLVED"] });
    const forged = {
      ...approved(),
      productVersion: earlyAccessReleaseVersion(unit),
      waivedBlockers: ["STRENGTH_DISPUTE_UNRESOLVED"],
    } as unknown as EarlyAccessRelease;
    const decision = decideEarlyAccessRelease({ row: unit, releases: [forged] });
    expect(decision.released).toBe(false);
    if (!decision.released) {
      expect(decision.hold).toBe("NONWAIVABLE_BLOCKER");
      expect(decision.unwaivedBlockers).toContain("STRENGTH_DISPUTE_UNRESOLVED");
    }
  });

  it("a PREVIOUSLY VALID release stops selling when a dispute appears later", () => {
    const before = decideEarlyAccessRelease({ row: row(), releases: [approved()] });
    expect(before.released).toBe(true);

    // The same release, after Product Control raises a strength dispute.
    const disputed = row({ blockers: [...HELD_BLOCKERS, "STRENGTH_DISPUTE_UNRESOLVED"] });
    const after = decideEarlyAccessRelease({ row: disputed, releases: [approved()] });
    expect(after.released).toBe(false);
    if (!after.released) expect(after.hold).toBe("NONWAIVABLE_BLOCKER");
  });

  it("an unknown blocker code is treated as NON-waivable", () => {
    // Fails closed: a code added to Product Control later must not become
    // silently waivable the moment it appears.
    const validated = validateEarlyAccessRelease(
      draft({ waivedBlockers: [...HELD_BLOCKERS, "SOME_FUTURE_BLOCKER"] }),
    );
    expect(validated.ok).toBe(false);
    if (!validated.ok) expect(validated.code).toBe("NONWAIVABLE_BLOCKER");
  });

  it("an expired release stops selling", () => {
    const release = approved({ expiresAt: "2026-08-04T13:00:00.000Z" });
    const live = decideEarlyAccessRelease({
      row: row(), releases: [release], now: Date.parse("2026-08-04T12:30:00.000Z"),
    });
    expect(live.released).toBe(true);
    const expired = decideEarlyAccessRelease({
      row: row(), releases: [release], now: Date.parse("2026-08-04T13:30:00.000Z"),
    });
    expect(expired.released).toBe(false);
    if (!expired.released) expect(expired.hold).toBe("RELEASE_EXPIRED");
  });

  it("requires a real quantity limit on an approval", () => {
    for (const bad of [0, -1, 1.5, 1_000]) {
      const validated = validateEarlyAccessRelease(draft({ approvedQuantityLimit: bad }));
      expect(validated.ok).toBe(false);
      if (!validated.ok) expect(validated.code).toBe("QUANTITY_LIMIT_INVALID");
    }
  });
});

describe("every release names a human, a reason, and a real price", () => {
  it.each([
    ["actor missing", { actor: "" }, "ACTOR_INVALID"],
    ["actor is not a person", { actor: "  " }, "ACTOR_INVALID"],
    ["reason too thin", { reason: "ok" }, "REASON_INSUFFICIENT"],
    ["price zero", { approvedPriceCents: 0 }, "PRICE_INVALID"],
    ["price negative", { approvedPriceCents: -1 }, "PRICE_INVALID"],
    ["price fractional", { approvedPriceCents: 24_900.5 }, "PRICE_INVALID"],
    ["price absurd", { approvedPriceCents: 999_999_999 }, "PRICE_INVALID"],
    ["currency unsupported", { currency: "XYZ" }, "CURRENCY_UNSUPPORTED"],
    ["currency missing", { currency: "" }, "CURRENCY_UNSUPPORTED"],
    ["status unknown", { status: "pending" }, "STATUS_INVALID"],
    ["version not a hash", { productVersion: "nope" }, "VERSION_INVALID"],
    ["timestamp unparseable", { recordedAt: "last tuesday" }, "TIMESTAMP_INVALID"],
  ])("refuses %s", (_label, override, code) => {
    const validated = validateEarlyAccessRelease(draft(override));
    expect(validated.ok).toBe(false);
    if (!validated.ok) expect(validated.code).toBe(code);
  });

  it("refuses a non-object entirely", () => {
    for (const bad of [null, undefined, "release", 42, []]) {
      expect(validateEarlyAccessRelease(bad).ok).toBe(false);
    }
  });

  it("a revocation carries no price claim", () => {
    const validated = validateEarlyAccessRelease(
      draft({ releaseId: "rel-0002", status: "revoked", approvedPriceCents: 1, currency: "" }),
    );
    expect(validated.ok).toBe(true);
    if (validated.ok) {
      expect(validated.release.approvedPriceCents).toBe(0);
      expect(validated.release.currency).toBe("");
    }
  });
});

describe("the ledger is append only", () => {
  it("a revocation is a NEW record, and the unit stops being purchasable", async () => {
    const ledger = new InMemoryEarlyAccessReleaseLedger();
    await ledger.append(draft());
    await ledger.append(
      draft({
        releaseId: "rel-0002",
        status: "revoked",
        recordedAt: "2026-08-04T13:00:00.000Z",
        reason: "Pulled pending the lab documentation.",
      }),
    );

    const releases = await ledger.all();
    expect(releases).toHaveLength(2);
    // The approval is still on the record. History is not rewritten.
    expect(releases[0]?.status).toBe("approved");

    const decision = decideEarlyAccessRelease({ row: row(), releases: [...releases] });
    expect(decision.released).toBe(false);
    if (!decision.released) expect(decision.hold).toBe("RELEASE_REVOKED");
  });

  it("a later re-approval brings the unit back without erasing the revocation", async () => {
    const ledger = new InMemoryEarlyAccessReleaseLedger();
    await ledger.append(draft());
    await ledger.append(draft({ releaseId: "rel-0002", status: "revoked", recordedAt: "2026-08-04T13:00:00.000Z" }));
    await ledger.append(draft({ releaseId: "rel-0003", recordedAt: "2026-08-04T14:00:00.000Z" }));

    const releases = await ledger.all();
    expect(releases).toHaveLength(3);
    const decision = decideEarlyAccessRelease({ row: row(), releases: [...releases] });
    expect(decision.released).toBe(true);
    if (decision.released) expect(decision.releaseId).toBe("rel-0003");
  });

  it("refuses a duplicate release id rather than overwriting", async () => {
    const ledger = new InMemoryEarlyAccessReleaseLedger();
    expect((await ledger.append(draft())).ok).toBe(true);
    const second = await ledger.append(draft({ reason: "A different reason entirely." }));
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe("DUPLICATE_RELEASE_ID");
    expect(await ledger.all()).toHaveLength(1);
  });

  it("never appends an invalid record", async () => {
    const ledger = new InMemoryEarlyAccessReleaseLedger();
    const result = await ledger.append(draft({ actor: "" }));
    expect(result.ok).toBe(false);
    expect(await ledger.all()).toHaveLength(0);
  });

  it("history is scoped to one unit", async () => {
    const ledger = new InMemoryEarlyAccessReleaseLedger();
    await ledger.append(draft());
    await ledger.append(draft({ releaseId: "rel-0009", variantId: "var-20mg" }));
    expect(await ledger.history("prod-retatrutide", "var-10mg")).toHaveLength(1);
  });

  it("resolves the current state deterministically when timestamps tie", () => {
    const a = approved({ releaseId: "rel-aaa", recordedAt: "2026-08-04T12:00:00.000Z" });
    const b = approved({ releaseId: "rel-bbb", status: "revoked", recordedAt: "2026-08-04T12:00:00.000Z" });
    const forward = decideEarlyAccessRelease({ row: row(), releases: [a, b] });
    const reversed = decideEarlyAccessRelease({ row: row(), releases: [b, a] });
    expect(forward.released).toBe(reversed.released);
  });
});
