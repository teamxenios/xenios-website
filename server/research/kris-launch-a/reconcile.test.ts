// Reconciliation between a committed artifact and its successor.
//
// The load-bearing case is the purchase-opening transition: a row whose mode
// becomes direct_eligible must surface in purchaseOpeningIds and flip
// opensNoPurchasePath to false, because that is the one change a price
// refresh must never carry silently.

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadKrisDataset } from "./dataset-reader";
import { reconcileKrisArtifacts } from "./reconcile";
import { rawArtifact } from "./test-fixtures";

type RawProducts = {
  products: Array<Record<string, unknown>>;
  priceOverlays: Record<string, Record<string, Record<string, unknown>>>;
};

function variant(mutate: (raw: RawProducts) => void) {
  const raw = rawArtifact() as unknown as RawProducts;
  mutate(raw);
  return loadKrisDataset(raw);
}

const CURRENT = loadKrisDataset(rawArtifact());

describe("reconciling two artifacts", () => {
  it("reports two identical artifacts as identical and safe", () => {
    const report = reconcileKrisArtifacts(CURRENT, loadKrisDataset(rawArtifact()));
    expect(report.identical).toBe(true);
    expect(report.opensNoPurchasePath).toBe(true);
    expect(report.added).toEqual([]);
    expect(report.retired).toEqual([]);
  });

  it("itemizes a price movement without inventing a mode transition", () => {
    const next = variant((raw) => {
      raw.priceOverlays.KRIS_VOLUME_PARTNER.kli_one.amountCents = 9900;
      raw.priceOverlays.KRIS_VOLUME_PARTNER.kli_one.display = "$99.00";
    });
    const report = reconcileKrisArtifacts(CURRENT, next);
    expect(report.priceMovements).toHaveLength(1);
    expect(report.priceMovements[0].id).toBe("kli_one");
    expect(report.modeTransitions).toEqual([]);
    expect(report.opensNoPurchasePath).toBe(true);
    expect(report.identical).toBe(false);
  });

  it("itemizes member-visible field drift by field name", () => {
    const next = variant((raw) => {
      raw.products[0].specification = "ALPHA 10MG";
    });
    const report = reconcileKrisArtifacts(CURRENT, next);
    expect(report.changed).toEqual([{ id: "kli_one", fields: ["specification"] }]);
  });

  it("reports an added and a retired item by id", () => {
    const next = variant((raw) => {
      raw.products = raw.products.filter((p) => p.id !== "kli_two");
      delete raw.priceOverlays.KRIS_VOLUME_PARTNER.kli_two;
      raw.products.push({
        id: "kli_three",
        slug: "supplements-gamma",
        displayName: "Gamma",
        specification: "GAMMA",
        family: "supplements",
        familyLabel: "Supplements",
        channel: "supplement",
        channelLabel: "Supplement",
        format: "Capsule",
        packBasis: "Per listed unit",
        moq: 1,
        dosageForm: "Capsule",
        suppliedNote: "Subject to availability.",
      });
    });
    const report = reconcileKrisArtifacts(CURRENT, next);
    expect(report.added).toEqual(["kli_three"]);
    expect(report.retired).toEqual(["kli_two"]);
  });

  it("FLAGS a row becoming purchasable and refuses to call the swap safe", () => {
    const next = variant((raw) => {
      // The pending clinical row is repriced AND rechanneled to a direct
      // channel in the successor: price_pending -> direct_eligible.
      raw.products[1].channel = "supplement";
      raw.priceOverlays.KRIS_VOLUME_PARTNER.kli_two = {
        state: "priced",
        amountCents: 5000,
        currency: "USD",
        display: "$50.00",
        basis: "Per listed unit",
      };
    });
    const report = reconcileKrisArtifacts(CURRENT, next);
    expect(report.purchaseOpeningIds).toEqual(["kli_two"]);
    expect(report.opensNoPurchasePath).toBe(false);
    const transition = report.modeTransitions.find((t) => t.id === "kli_two");
    expect(transition?.from).toBe("price_pending");
    expect(transition?.to).toBe("direct_eligible");
    expect(transition?.opensPurchase).toBe(true);
  });

  it("records a non-opening transition without tripping the purchase flag", () => {
    const next = variant((raw) => {
      // Repriced but still clinical: price_pending -> provider_workflow.
      raw.priceOverlays.KRIS_VOLUME_PARTNER.kli_two = {
        state: "priced",
        amountCents: 5000,
        currency: "USD",
        display: "$50.00",
        basis: "Per listed unit",
      };
    });
    const report = reconcileKrisArtifacts(CURRENT, next);
    const transition = report.modeTransitions.find((t) => t.id === "kli_two");
    expect(transition?.to).toBe("provider_workflow");
    expect(transition?.opensPurchase).toBe(false);
    expect(report.opensNoPurchasePath).toBe(true);
  });

  it("reports the real committed artifact as identical to itself", () => {
    const committed = path.resolve(
      process.cwd(),
      "server/research/kris-launch-a/data/kris-launch-a-catalog.generated.json",
    );
    const raw = JSON.parse(fs.readFileSync(committed, "utf8"));
    const report = reconcileKrisArtifacts(loadKrisDataset(raw), loadKrisDataset(raw));
    expect(report.identical).toBe(true);
    expect(report.opensNoPurchasePath).toBe(true);
  });
});
