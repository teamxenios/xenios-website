import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  KRIS_CHANNELS,
  KRIS_FAMILIES,
  isKrisChannel,
  isKrisFamily,
  type KrisChannel,
} from "@shared/research/kris-launch-a/contract";
import {
  krisAccessPolicy,
  KRIS_CATALOG_DISCLOSURES,
} from "./access-policy";
import { parseKrisPrice, joinKey, normalizeKrisLaunchA } from "./normalize";

const ARTIFACT = path.resolve(
  process.cwd(),
  "server/research/kris-launch-a/data/kris-launch-a-catalog.generated.json",
);

type Artifact = {
  counts: { items: number; priced: number; pricePending: number };
  invariants: Record<string, boolean>;
  priceProfiles: string[];
  products: Array<{
    id: string;
    slug: string;
    displayName: string;
    specification: string;
    family: string;
    channel: string;
    suppliedNote: string;
  }>;
  priceOverlays: Record<string, Record<string, { state: string; amountCents?: number }>>;
};

function artifact(): Artifact {
  return JSON.parse(fs.readFileSync(ARTIFACT, "utf8")) as Artifact;
}

/**
 * The Launch A numbers, pinned.
 *
 * A failure here means the catalog changed. That is a real event, not
 * necessarily a bug, but it must never happen quietly: regenerate, read the
 * counts the builder prints, satisfy yourself they are the ones you meant, and
 * update these in the same commit as the data.
 */
const ITEMS = 420;
const PRICED = 418;
const PENDING = 2;

describe("the Launch A artifact", () => {
  it("is committed, not left on somebody's machine", () => {
    expect(fs.existsSync(ARTIFACT)).toBe(true);
  });

  it("carries 420 items, 418 priced and 2 pending, recounted rather than trusted", () => {
    const data = artifact();
    const overlay = data.priceOverlays.KRIS_VOLUME_PARTNER;
    const priced = Object.values(overlay).filter((entry) => entry.state === "priced");
    const pending = Object.values(overlay).filter((entry) => entry.state === "pending");

    expect(data.products.length).toBe(ITEMS);
    expect(priced.length).toBe(PRICED);
    expect(pending.length).toBe(PENDING);
    // The header must agree with the body, or the header is a claim not a fact.
    expect(data.counts).toEqual({
      items: ITEMS,
      priced: PRICED,
      pricePending: PENDING,
    });
  });

  it("names exactly the two items that have no price yet", () => {
    const data = artifact();
    const overlay = data.priceOverlays.KRIS_VOLUME_PARTNER;
    const pending = data.products
      .filter((product) => overlay[product.id]?.state === "pending")
      .map((product) => `${product.displayName} / ${product.specification}`)
      .sort();
    expect(pending).toEqual([
      "BAM15 / BAM15 500 mcg",
      "Syringes & Alcohol Swabs / Syringes & Alcohol Swabs",
    ]);
  });

  it("gives every product exactly one overlay entry, and no zero price", () => {
    const data = artifact();
    const overlay = data.priceOverlays.KRIS_VOLUME_PARTNER;
    for (const product of data.products) {
      expect(overlay[product.id]).toBeDefined();
    }
    expect(Object.keys(overlay).length).toBe(data.products.length);
    for (const entry of Object.values(overlay)) {
      if (entry.state !== "priced") continue;
      expect(entry.amountCents).toBeGreaterThan(0);
    }
  });

  it("keeps ids and slugs unique, so a deep link addresses one product", () => {
    const data = artifact();
    expect(new Set(data.products.map((p) => p.id)).size).toBe(data.products.length);
    expect(new Set(data.products.map((p) => p.slug)).size).toBe(data.products.length);
  });

  it("uses only the closed family and channel vocabularies", () => {
    for (const product of artifact().products) {
      expect(isKrisFamily(product.family)).toBe(true);
      expect(isKrisChannel(product.channel)).toBe(true);
    }
  });

  it("declares every private invariant false and ships one price profile", () => {
    const data = artifact();
    for (const value of Object.values(data.invariants)) expect(value).toBe(false);
    expect(data.priceProfiles).toEqual(["KRIS_VOLUME_PARTNER"]);
  });

  it("carries no private column name, supplier field or purchase action", () => {
    const raw = fs.readFileSync(ARTIFACT, "utf8");
    for (const forbidden of [
      "Selected Supplier",
      "Buy Cost / Unit",
      "Original Quote",
      "Suggested Sell Price",
      "Gross Profit / Unit",
      "Gross Margin %",
      "Alternative Supplier",
      "Alternative Cost / Unit",
      "Savings vs Alternative",
      "Selection Rationale",
      "Source File",
      "Source Location",
      "Supplier Notes",
      "Quality / Regulatory Notes",
      "add_to_cart",
    ]) {
      expect(raw.includes(forbidden)).toBe(false);
    }
  });
});

describe("access policy", () => {
  it("contains no parallel purchase-authority field", () => {
    for (const channel of KRIS_CHANNELS) {
      expect(krisAccessPolicy(channel)).not.toHaveProperty("purchasable");
    }
  });

  it("states the provider requirement and the state availability caveat", () => {
    const policy = krisAccessPolicy("clinical_provider_only");
    expect(policy.statusLabel).toBe("Provider workflow required");
    expect(policy.notices.join(" ")).toContain("state availability");
    expect(policy.notices.join(" ")).toContain("pharmacy requirements");
  });

  it("states research use only and the documentation caveat", () => {
    const policy = krisAccessPolicy("ruo_research");
    expect(policy.statusLabel).toBe("Research use only");
    expect(policy.notices.join(" ")).toContain("availability and documentation");
  });

  it("requires confirmation before activation on the pending classification", () => {
    expect(krisAccessPolicy("classification_pending").notices.join(" ")).toContain(
      "confirmed before activation",
    );
  });

  it("says plainly that signing in is not permission to buy", () => {
    expect(KRIS_CATALOG_DISCLOSURES.join(" ")).toContain("does not authorize a purchase");
  });

  it("gives a policy for every channel, so none can fall through unlabelled", () => {
    for (const channel of KRIS_CHANNELS) {
      const policy = krisAccessPolicy(channel as KrisChannel);
      expect(policy.statusLabel.length).toBeGreaterThan(0);
      expect(policy.notices.length).toBeGreaterThan(0);
    }
  });
});

describe("the policy survives a row whose note was replaced by Price pending", () => {
  it("keeps provider-only and research-use-only on the two pending rows", () => {
    // The load-bearing case. Both pending rows carry the supplied note
    // "Price pending." and nothing else, so a surface reading the note alone
    // would silently drop their access status. The status comes from channel.
    const data = artifact();
    const overlay = data.priceOverlays.KRIS_VOLUME_PARTNER;
    const pending = data.products.filter(
      (product) => overlay[product.id]?.state === "pending",
    );
    expect(pending.length).toBe(PENDING);
    for (const product of pending) {
      expect(product.suppliedNote).toBe("Price pending.");
      const policy = krisAccessPolicy(product.channel as KrisChannel);
      expect(policy.notices.length).toBeGreaterThan(0);
      expect(policy).not.toHaveProperty("purchasable");
    }
    const channels = pending.map((product) => product.channel).sort();
    expect(channels).toEqual(["clinical_provider_only", "ruo_research"]);
    expect(krisAccessPolicy("ruo_research").statusLabel).toBe("Research use only");
    expect(krisAccessPolicy("clinical_provider_only").statusLabel).toBe(
      "Provider workflow required",
    );
  });

  it("keeps every clinical and RUO row on its status, all 365 of them", () => {
    const data = artifact();
    const clinical = data.products.filter(
      (p) => p.channel === "clinical_provider_only",
    );
    const ruo = data.products.filter((p) => p.channel === "ruo_research");
    expect(clinical.length).toBe(244);
    expect(ruo.length).toBe(121);
    for (const product of [...clinical, ...ruo]) {
      expect(krisAccessPolicy(product.channel as KrisChannel)).not.toHaveProperty(
        "purchasable",
      );
    }
  });
});

describe("price parsing", () => {
  it("reads a plain amount into whole cents", () => {
    expect(parseKrisPrice("3.85")).toEqual({ ok: true, amountCents: 385 });
    expect(parseKrisPrice("$1,250.00")).toEqual({ ok: true, amountCents: 125000 });
    expect(parseKrisPrice("231")).toEqual({ ok: true, amountCents: 23100 });
  });

  it("treats a blank as pending, which is a state and not an error", () => {
    expect(parseKrisPrice("")).toEqual({ ok: true, amountCents: null });
    expect(parseKrisPrice("   ")).toEqual({ ok: true, amountCents: null });
  });

  it("refuses zero rather than rendering a free product", () => {
    expect(parseKrisPrice("0")).toEqual({ ok: false, reason: "zero" });
    expect(parseKrisPrice("0.00")).toEqual({ ok: false, reason: "zero" });
  });

  it("refuses anything that is not a plain positive amount", () => {
    expect(parseKrisPrice("TBD")).toEqual({ ok: false, reason: "unparsable" });
    expect(parseKrisPrice("call us")).toEqual({ ok: false, reason: "unparsable" });
    expect(parseKrisPrice("-5")).toEqual({ ok: false, reason: "unparsable" });
  });
});

describe("the join", () => {
  it("folds case and whitespace but nothing else", () => {
    expect(joinKey("Supplements", "Supplement", "A  B", "Spec")).toBe(
      joinKey("supplements", "supplement", "a b", "spec"),
    );
    expect(joinKey("Supplements", "Supplement", "A", "Spec")).not.toBe(
      joinKey("Supplements", "Supplement", "B", "Spec"),
    );
  });

  it("refuses a row whose family or channel is outside the vocabulary", () => {
    const kris = [
      {
        sheetRow: 5,
        Family: "Something Invented",
        Channel: "RUO Research",
        Product: "X",
        Specification: "X",
        "Kris Volume Price": "1.00",
      },
      {
        sheetRow: 6,
        Family: "Supplements",
        Channel: "Not A Channel",
        Product: "Y",
        Specification: "Y",
        "Kris Volume Price": "1.00",
      },
    ];
    const result = normalizeKrisLaunchA([], kris);
    expect(result.items).toHaveLength(0);
    expect(result.issues.map((issue) => issue.code).sort()).toEqual([
      "unknown_channel",
      "unknown_family",
    ]);
  });

  it("keeps a Kris row that the master does not match, and says so", () => {
    const result = normalizeKrisLaunchA(
      [],
      [
        {
          sheetRow: 5,
          Family: "Supplements",
          Channel: "Supplement",
          Product: "Orphan",
          Specification: "Orphan 1",
          "Kris Volume Price": "9.99",
        },
      ],
    );
    // Kris's workbook decides the universe. An unmatched row is reported, not
    // dropped: a product Kris can see must be addressable.
    expect(result.items).toHaveLength(1);
    expect(result.items[0].displayName).toBe("Orphan");
    expect(result.issues.map((issue) => issue.code)).toContain("unmatched_kris_row");
  });
});

describe("the contract itself", () => {
  it("has no purchase action to reach for", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "shared/research/kris-launch-a/contract.ts"),
      "utf8",
    );
    const declarations = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(declarations).not.toContain("add_to_cart");
    expect(declarations).not.toContain("addToCart");
  });

  it("closes both vocabularies at what the workbook actually contains", () => {
    expect(KRIS_CHANNELS.length).toBe(5);
    expect(KRIS_FAMILIES.length).toBe(7);
  });
});
