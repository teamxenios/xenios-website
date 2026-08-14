import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  KRIS_PURCHASE_MODES,
  isKrisPurchaseMode,
  type KrisChannel,
  type KrisPriceView,
  type KrisPurchaseMode,
} from "@shared/research/kris-launch-a/contract";
import { krisAccessPolicy } from "./access-policy";
import { krisModePermitsLegacyOrder, krisPurchaseMode } from "./purchase-mode";

const ARTIFACT = path.resolve(
  process.cwd(),
  "server/research/kris-launch-a/data/kris-launch-a-catalog.generated.json",
);

type Artifact = {
  products: Array<{
    id: string;
    displayName: string;
    specification: string;
    channel: KrisChannel;
    suppliedNote: string;
  }>;
  priceOverlays: Record<
    string,
    Record<string, { state: string; amountCents?: number; currency?: string; display?: string; basis?: string }>
  >;
};

function rows() {
  const data = JSON.parse(fs.readFileSync(ARTIFACT, "utf8")) as Artifact;
  const overlay = data.priceOverlays.KRIS_VOLUME_PARTNER;
  return data.products.map((product) => {
    const entry = overlay[product.id];
    const price: KrisPriceView =
      entry?.state === "priced"
        ? {
            state: "priced",
            amountCents: entry.amountCents as number,
            currency: entry.currency as string,
            display: entry.display as string,
            basis: entry.basis as string,
          }
        : { state: "pending", display: "Price pending" };
    return { product, price, mode: krisPurchaseMode({ channel: product.channel, price }) };
  });
}

/**
 * The counts as they stand. A change here is a real event, not necessarily a
 * bug, but it must never happen quietly: a row moving into direct_eligible is a
 * row becoming purchasable.
 */
const EXPECTED: Readonly<Record<KrisPurchaseMode, number>> = {
  direct_eligible: 143,
  provider_workflow: 243,
  classification_pending: 32,
  price_pending: 2,
};

describe("the 420 row purchase mode matrix", () => {
  it("maps every row to exactly one known mode, with no unknowns", () => {
    const all = rows();
    expect(all).toHaveLength(420);
    for (const { product, mode } of all) {
      expect(isKrisPurchaseMode(mode), `${product.displayName} produced ${mode}`).toBe(true);
    }
    // Exactly one: the derivation returns a single value, so the way this could
    // fail is a row appearing twice. Ids are the identity, so count them.
    expect(new Set(all.map((row) => row.product.id)).size).toBe(420);
  });

  it("counts each mode, and the counts sum to 420", () => {
    const counted = { direct_eligible: 0, provider_workflow: 0, classification_pending: 0, price_pending: 0 };
    for (const { mode } of rows()) counted[mode] += 1;
    expect(counted).toEqual(EXPECTED);
    expect(Object.values(counted).reduce((total, n) => total + n, 0)).toBe(420);
  });

  it("makes only direct_eligible purchasable, and that is 143 of 420", () => {
    const all = rows();
    const purchasable = all.filter((row) => krisModePermitsLegacyOrder(row.mode));
    expect(purchasable).toHaveLength(EXPECTED.direct_eligible);
    for (const row of purchasable) {
      expect(row.mode).toBe("direct_eligible");
      // A purchasable row always has a real price. This is the $0 guard.
      expect(row.price.state).toBe("priced");
      if (row.price.state === "priced") expect(row.price.amountCents).toBeGreaterThan(0);
    }
    for (const row of all) {
      if (row.mode === "direct_eligible") continue;
      expect(krisModePermitsLegacyOrder(row.mode)).toBe(false);
    }
  });

  it("never lets a clinical row become purchasable", () => {
    const clinical = rows().filter((row) => row.product.channel === "clinical_provider_only");
    expect(clinical).toHaveLength(244);
    for (const row of clinical) {
      expect(krisModePermitsLegacyOrder(row.mode)).toBe(false);
      expect(["provider_workflow", "price_pending"]).toContain(row.mode);
    }
  });

  it("never lets a classification-pending row become purchasable", () => {
    const pending = rows().filter((row) => row.product.channel === "classification_pending");
    expect(pending).toHaveLength(32);
    for (const row of pending) expect(row.mode).toBe("classification_pending");
  });

  it("keeps the two price-pending rows unpurchasable AND keeps their access status", () => {
    // The case the whole two-axis design exists for. Both rows carry the
    // supplied note "Price pending." and nothing else, so the access status
    // cannot come from the note. Mode says not purchasable; access still says
    // what the product is.
    const pending = rows().filter((row) => row.mode === "price_pending");
    expect(pending).toHaveLength(2);
    const named = pending
      .map((row) => `${row.product.displayName} / ${row.product.specification}`)
      .sort();
    expect(named).toEqual([
      "BAM15 / BAM15 500 mcg",
      "Syringes & Alcohol Swabs / Syringes & Alcohol Swabs",
    ]);

    for (const row of pending) {
      expect(krisModePermitsLegacyOrder(row.mode)).toBe(false);
      expect(row.product.suppliedNote).toBe("Price pending.");
      expect(row.price.state).toBe("pending");
    }

    const bam = pending.find((row) => row.product.displayName === "BAM15");
    expect(bam?.product.channel).toBe("ruo_research");
    expect(krisAccessPolicy("ruo_research").statusLabel).toBe("Research use only");

    const syringes = pending.find((row) => row.product.displayName === "Syringes & Alcohol Swabs");
    expect(syringes?.product.channel).toBe("clinical_provider_only");
    expect(krisAccessPolicy("clinical_provider_only").statusLabel).toBe(
      "Provider workflow required",
    );
  });
});

describe("the derivation refuses rather than defaults", () => {
  const priced: KrisPriceView = {
    state: "priced",
    amountCents: 100,
    currency: "USD",
    display: "$1.00",
    basis: "Per listed unit",
  };

  it("refuses a channel it has never seen instead of allowing a purchase", () => {
    // The failure mode this guards: a future workbook adds a channel, the
    // vocabulary is widened, and the new rows arrive purchasable because the
    // derivation ended in an else. It ends in a set membership test instead.
    const mode = krisPurchaseMode({
      channel: "a_channel_from_a_future_workbook" as KrisChannel,
      price: priced,
    });
    expect(mode).toBe("classification_pending");
    expect(krisModePermitsLegacyOrder(mode)).toBe(false);
  });

  it("puts price ahead of channel, so an unpriced direct row is still refused", () => {
    const mode = krisPurchaseMode({
      channel: "supplement",
      price: { state: "pending", display: "Price pending" },
    });
    expect(mode).toBe("price_pending");
    expect(krisModePermitsLegacyOrder(mode)).toBe(false);
  });

  it("permits exactly three channels to reach direct_eligible", () => {
    const permitted = (["ruo_research", "supplement", "nonclinical_topical"] as const).map(
      (channel) => krisPurchaseMode({ channel, price: priced }),
    );
    expect(permitted).toEqual(["direct_eligible", "direct_eligible", "direct_eligible"]);
    expect(krisPurchaseMode({ channel: "clinical_provider_only", price: priced })).toBe(
      "provider_workflow",
    );
    expect(krisPurchaseMode({ channel: "classification_pending", price: priced })).toBe(
      "classification_pending",
    );
  });

  it("has a label for every mode, so none can render blank", () => {
    for (const mode of KRIS_PURCHASE_MODES) {
      expect(isKrisPurchaseMode(mode)).toBe(true);
    }
  });
});
