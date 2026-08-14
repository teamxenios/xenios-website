// The readiness report, tested on both sides of the cliff.
//
// The assessor delegates liveness and release decisions to the enforcement
// path's own functions, so these tests concentrate on what the report ADDS:
// per-unit composition, the ready flag being conjunctive, and the supply-cliff
// arithmetic, including the exact-instant edge where enforcement flips.

import { describe, expect, it } from "vitest";
import type { EarlyAccessCatalogRow } from "../early-access/catalog/early-access-catalog";
import type { SupplierConfirmation } from "../early-access/ops/supplier-confirmation";
import type { UnitHoldRecord } from "../early-access/ops/unit-holds";
import {
  earlyAccessReleaseVersion,
  validateEarlyAccessRelease,
  type EarlyAccessRelease,
} from "../early-access/release/founder-release";
import { assessKrisOperationalReadiness } from "./operational-readiness";

const NOW = "2026-08-14T12:00:00.000Z";
const CLIFF = "2026-09-03T23:30:00.000Z";
const HELD_BLOCKERS = ["PRICE_NOT_APPROVED", "DOCUMENTATION_NOT_SATISFIED"] as const;

function row(overrides: Partial<EarlyAccessCatalogRow> = {}): EarlyAccessCatalogRow {
  return {
    productId: "prod-alpha",
    slug: "alpha",
    displayName: "Alpha",
    canonicalName: "alpha",
    variantId: "var-10mg",
    sku: "ALPHA-10",
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
    supplierReady: true,
    disputeStatus: { identity: "none", strength: "none" },
    purchasable: false,
    blockers: [...HELD_BLOCKERS],
    ...overrides,
  } as unknown as EarlyAccessCatalogRow;
}

function release(target: EarlyAccessCatalogRow, overrides: Record<string, unknown> = {}): EarlyAccessRelease {
  const validated = validateEarlyAccessRelease({
    releaseId: "rel-0001",
    productId: target.productId,
    variantId: target.variantId,
    productVersion: earlyAccessReleaseVersion(target),
    status: "approved",
    approvedPriceCents: 24_900,
    currency: "USD",
    waivedBlockers: [...HELD_BLOCKERS],
    approvedQuantityLimit: 3,
    expiresAt: null,
    actor: "Samuel Boadu",
    reason: "Founder release fixture.",
    recordedAt: "2026-08-04T12:00:00.000Z",
    ...overrides,
  });
  if (!validated.ok) throw new Error(`fixture invalid: ${validated.code}`);
  return validated.release;
}

function confirmation(overrides: Partial<SupplierConfirmation> = {}): SupplierConfirmation {
  return {
    confirmationId: "conf-0001",
    supplierOrg: "Raw Peptides",
    supplierContact: "private",
    productId: "prod-alpha",
    variantId: "var-10mg",
    sku: "ALPHA-10",
    supplierSku: "RP-ALPHA-10",
    strength: "10 mg",
    presentation: "lyophilised vial",
    maxQuantity: 50,
    fulfillmentLocation: "Houston",
    fulfillmentMethod: "cold-chain courier",
    targetHandoffHours: 72,
    shippingRequirements: "cold chain",
    coldChainState: "required",
    documentationState: "COA per lot pending",
    confirmedAt: "2026-08-04T23:30:00.000Z",
    expiresAt: CLIFF,
    confirmedBy: "Samuel Boadu",
    evidenceRef: "msg-ref-1",
    status: "active",
    withdrawnAt: null,
    withdrawnBy: null,
    ...overrides,
  } as SupplierConfirmation;
}

function hold(overrides: Partial<UnitHoldRecord> = {}): UnitHoldRecord {
  return {
    holdId: "hold-0001",
    kind: "SUPPLIER_QUALITY_HOLD",
    productId: "prod-alpha",
    variantId: "var-10mg",
    reason: "lot pending review",
    recordedBy: "Samuel Boadu",
    recordedAt: NOW,
    status: "active",
    withdrawnBy: null,
    withdrawnAt: null,
    ...overrides,
  } as UnitHoldRecord;
}

const BINDING = { krisId: "kli_alpha0001", productId: "prod-alpha", variantId: "var-10mg" };

describe("per-unit readiness composition", () => {
  it("reports a released, supplied, unheld unit as operationally ready", () => {
    const target = row();
    const report = assessKrisOperationalReadiness({
      bindings: [BINDING],
      rows: [target],
      releases: [release(target)],
      confirmations: [confirmation()],
      holds: [],
      now: NOW,
    });
    const unit = report.units[0];
    expect(unit.release).toEqual({ state: "released", approvedQuantityLimit: 3 });
    expect(unit.supplierConfirmation.live).toBe(true);
    if (unit.supplierConfirmation.live) {
      expect(unit.supplierConfirmation.daysRemaining).toBe(20);
      expect(unit.supplierConfirmation.maxQuantity).toBe(50);
    }
    expect(unit.operationallyReady).toBe(true);
    expect(report.operationallyReadyCount).toBe(1);
  });

  it("is conjunctive: a dead confirmation alone takes readiness down", () => {
    const target = row();
    const report = assessKrisOperationalReadiness({
      bindings: [BINDING],
      rows: [target],
      releases: [release(target)],
      confirmations: [confirmation({ expiresAt: "2026-08-10T00:00:00.000Z" })],
      holds: [],
      now: NOW,
    });
    const unit = report.units[0];
    expect(unit.supplierConfirmation).toEqual({
      live: false,
      reason: "expired",
      expiresAt: "2026-08-10T00:00:00.000Z",
    });
    expect(unit.operationallyReady).toBe(false);
  });

  it("is conjunctive: an active hold alone takes readiness down", () => {
    const target = row();
    const report = assessKrisOperationalReadiness({
      bindings: [BINDING],
      rows: [target],
      releases: [release(target)],
      confirmations: [confirmation()],
      holds: [hold()],
      now: NOW,
    });
    expect(report.units[0].activeHolds).toEqual([
      { kind: "SUPPLIER_QUALITY_HOLD", reason: "lot pending review", recordedBy: "Samuel Boadu" },
    ]);
    expect(report.units[0].operationallyReady).toBe(false);
  });

  it("a withdrawn hold does not count", () => {
    const target = row();
    const report = assessKrisOperationalReadiness({
      bindings: [BINDING],
      rows: [target],
      releases: [release(target)],
      confirmations: [confirmation()],
      holds: [hold({ status: "withdrawn", withdrawnBy: "Samuel Boadu", withdrawnAt: NOW })],
      now: NOW,
    });
    expect(report.units[0].activeHolds).toEqual([]);
    expect(report.units[0].operationallyReady).toBe(true);
  });

  it("reports an unreleased unit as held with the door's own reason", () => {
    const target = row();
    const report = assessKrisOperationalReadiness({
      bindings: [BINDING],
      rows: [target],
      releases: [],
      confirmations: [confirmation()],
      holds: [],
      now: NOW,
    });
    const view = report.units[0].release;
    expect(view.state).toBe("held");
    if (view.state === "held") expect(view.hold).toBe("NO_FOUNDER_RELEASE");
    expect(report.units[0].operationallyReady).toBe(false);
  });

  it("reports a missing row and a missing confirmation truthfully", () => {
    const report = assessKrisOperationalReadiness({
      bindings: [BINDING],
      rows: [],
      releases: [],
      confirmations: [],
      holds: [],
      now: NOW,
    });
    expect(report.units[0].release).toEqual({ state: "row_missing" });
    expect(report.units[0].supplierConfirmation).toEqual({
      live: false,
      reason: "none",
      expiresAt: null,
    });
    expect(report.units[0].displayName).toBeNull();
  });
});

describe("the supply cliff", () => {
  const bindingB = { krisId: "kli_beta00001", productId: "prod-beta", variantId: "var-5mg" };
  const bindingC = { krisId: "kli_gamma0001", productId: "prod-gamma", variantId: "var-1mg" };

  it("names the earliest instant and counts every unit it takes down", () => {
    const rowB = row({ productId: "prod-beta", variantId: "var-5mg", displayName: "Beta" });
    const rowC = row({ productId: "prod-gamma", variantId: "var-1mg", displayName: "Gamma" });
    const report = assessKrisOperationalReadiness({
      bindings: [BINDING, bindingB, bindingC],
      rows: [row(), rowB, rowC],
      releases: [],
      confirmations: [
        confirmation(),
        confirmation({ confirmationId: "conf-0002", productId: "prod-beta", variantId: "var-5mg" }),
        confirmation({
          confirmationId: "conf-0003",
          productId: "prod-gamma",
          variantId: "var-1mg",
          expiresAt: "2026-10-01T00:00:00.000Z",
        }),
      ],
      holds: [],
      now: NOW,
    });
    expect(report.supplyCliff).toEqual({
      earliestExpiryAt: CLIFF,
      daysRemaining: 20,
      unitsAffected: 2,
      liveConfirmations: 3,
    });
  });

  it("flips at the exact expiry instant, matching enforcement", () => {
    const report = assessKrisOperationalReadiness({
      bindings: [BINDING],
      rows: [row()],
      releases: [],
      confirmations: [confirmation()],
      holds: [],
      now: CLIFF,
    });
    expect(report.units[0].supplierConfirmation.live).toBe(false);
    expect(report.supplyCliff.liveConfirmations).toBe(0);
    expect(report.supplyCliff.earliestExpiryAt).toBeNull();
  });

  it("reports null cleanly when nothing is live", () => {
    const report = assessKrisOperationalReadiness({
      bindings: [BINDING],
      rows: [row()],
      releases: [],
      confirmations: [],
      holds: [],
      now: NOW,
    });
    expect(report.supplyCliff).toEqual({
      earliestExpiryAt: null,
      daysRemaining: null,
      unitsAffected: 0,
      liveConfirmations: 0,
    });
  });
});
