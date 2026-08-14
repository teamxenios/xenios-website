import { describe, expect, it } from "vitest";
import type { KrisPriceProfile, KrisPriceView } from "@shared/research/kris-launch-a/contract";
import {
  InMemoryKrisCatalogSource,
  KrisDatasetUnavailable,
  type KrisCatalogSource,
  type KrisProductRecord,
} from "./dataset-reader";
import { KrisCatalogService } from "./service";
import { krisProduct, pricedAt } from "./test-fixtures";

/** A source that answers by index and counts exactly what it was asked for. */
class CountingSource implements KrisCatalogSource {
  scans = 0;
  slugLookups = 0;
  idLookups = 0;
  priceLookups: string[] = [];

  constructor(
    private readonly items: readonly KrisProductRecord[],
    private readonly overlay: ReadonlyMap<string, KrisPriceView> = new Map(),
  ) {}

  products(): readonly KrisProductRecord[] {
    this.scans += 1;
    return this.items;
  }

  findBySlug(slug: string): KrisProductRecord | null {
    this.slugLookups += 1;
    return this.items.find((item) => item.slug === slug) ?? null;
  }

  findById(id: string): KrisProductRecord | null {
    this.idLookups += 1;
    return this.items.find((item) => item.id === id) ?? null;
  }

  priceFor(_profile: KrisPriceProfile, productId: string): KrisPriceView {
    this.priceLookups.push(productId);
    return this.overlay.get(productId) ?? { state: "pending", display: "Price pending" };
  }

  hasProfile(): boolean {
    return true;
  }
}

const PRICED = krisProduct({
  id: "kli_priced",
  slug: "research-capsules-priced-item",
  displayName: "Priced Item",
  channel: "ruo_research",
});
const PENDING = krisProduct({
  id: "kli_pending",
  slug: "shipping-and-fulfillment-syringes",
  displayName: "Syringes & Alcohol Swabs",
  specification: "Syringes & Alcohol Swabs",
  family: "shipping_and_fulfillment",
  channel: "clinical_provider_only",
  // The trap: the note has been REPLACED by the pending copy, so it no longer
  // states the provider requirement.
  suppliedNote: "Price pending.",
});

function service(source: KrisCatalogSource): KrisCatalogService {
  return new KrisCatalogService(source, "KRIS_VOLUME_PARTNER");
}

describe("price resolution", () => {
  it("takes every price from the entitled overlay and nowhere else", () => {
    const source = new CountingSource(
      [PRICED],
      new Map([["kli_priced", pricedAt(4500, "Per listed unit")]]),
    );
    const item = service(source).list({}).items[0];
    expect(item.price).toEqual({
      state: "priced",
      amountCents: 4500,
      currency: "USD",
      display: "$45.00",
      basis: "Per listed unit",
    });
    expect(source.priceLookups).toEqual(["kli_priced"]);
  });

  it("says Price pending, never zero and never a guess", () => {
    const item = service(new CountingSource([PENDING])).list({}).items[0];
    expect(item.price).toEqual({ state: "pending", display: "Price pending" });
    expect(JSON.stringify(item.price)).not.toContain("$0");
    expect(JSON.stringify(item.price)).not.toContain("amountCents");
  });

  it("refuses a profile the dataset cannot price, rather than showing 420 pending rows", () => {
    const unpriceable: KrisCatalogSource = {
      ...new InMemoryKrisCatalogSource([PRICED]),
      products: () => [PRICED],
      findBySlug: () => PRICED,
      findById: () => PRICED,
      priceFor: () => ({ state: "pending", display: "Price pending" }),
      hasProfile: () => false,
    };
    const subject = new KrisCatalogService(unpriceable, "KRIS_VOLUME_PARTNER");
    expect(() => subject.list({})).toThrow(KrisDatasetUnavailable);
    expect(() => subject.detail(PRICED.slug)).toThrow(KrisDatasetUnavailable);
  });
});

describe("access presentation", () => {
  it("attaches the channel policy to EVERY item, in addition to the note", () => {
    const page = service(new CountingSource([PRICED, PENDING])).list({});
    for (const item of page.items) {
      expect(item.access.channel).toBe(item.channel);
      expect(item.access).not.toHaveProperty("purchasable");
      expect(item.access.notices.length).toBeGreaterThan(0);
    }
  });

  it("keeps the status on a row whose note was replaced by Price pending", () => {
    // This is the whole reason the policy is computed from the channel in code.
    // Rendering suppliedNote alone would leave these two rows with no status at
    // all, which is precisely where a reader looks twice.
    const detail = service(new CountingSource([PENDING])).detail(PENDING.slug);
    expect(detail?.suppliedNote).toBe("Price pending.");
    expect(detail?.access.statusLabel).toBe("Provider workflow required");
    expect(detail?.access.notices[0]).toBe("Provider workflow required.");
    expect(detail?.price.state).toBe("pending");
  });

  it("carries the disclosures on a detail view", () => {
    const detail = service(new CountingSource([PRICED])).detail(PRICED.slug);
    expect(detail?.disclosures.join(" ")).toContain("does not authorize a purchase");
  });
});

describe("detail costs one lookup and one price", () => {
  it("answers by slug without walking the catalog", () => {
    const source = new CountingSource(
      [PRICED, PENDING],
      new Map([["kli_priced", pricedAt(4500)]]),
    );
    const detail = service(source).detail("research-capsules-priced-item");
    expect(detail?.id).toBe("kli_priced");
    expect(source.slugLookups).toBe(1);
    expect(source.scans).toBe(0);
    // Exactly one product priced. Not two, and not 420.
    expect(source.priceLookups).toEqual(["kli_priced"]);
  });

  it("answers by specification id the same way", () => {
    const source = new CountingSource(
      [PRICED, PENDING],
      new Map([["kli_priced", pricedAt(4500)]]),
    );
    const view = service(source).specification("kli_priced");
    expect(view?.slug).toBe("research-capsules-priced-item");
    expect(source.idLookups).toBe(1);
    expect(source.scans).toBe(0);
    expect(source.priceLookups).toEqual(["kli_priced"]);
  });

  it("refuses a malformed slug or id by shape, before any lookup", () => {
    const source = new CountingSource([PRICED]);
    expect(service(source).detail("../../etc/passwd")).toBeNull();
    expect(service(source).detail("UPPERCASE")).toBeNull();
    expect(service(source).specification("nope!")).toBeNull();
    expect(source.slugLookups).toBe(0);
    expect(source.idLookups).toBe(0);
  });

  it("returns null for an unknown slug rather than the nearest thing", () => {
    expect(service(new CountingSource([PRICED])).detail("no-such-item")).toBeNull();
  });
});

describe("a list projects and prices only the page", () => {
  const many = Array.from({ length: 50 }, (_, index) =>
    krisProduct({
      id: `kli_bulk${String(index).padStart(3, "0")}`,
      slug: `bulk-item-${index}`,
      displayName: `Bulk ${String(index).padStart(3, "0")}`,
    }),
  );

  it("prices 24 rows for the default page, not 50", () => {
    const source = new CountingSource(many);
    const page = service(source).list({});
    expect(page.items).toHaveLength(24);
    expect(page.total).toBe(50);
    expect(source.priceLookups).toHaveLength(24);
    expect(source.scans).toBe(1);
  });

  it("reads a price per match only when sorting by price, and still projects one page", () => {
    const source = new CountingSource(
      many,
      new Map(many.map((item, index) => [item.id, pricedAt((index + 1) * 100)])),
    );
    const page = service(source).list({ sort: "price_desc", pageSize: 10 });
    expect(page.items).toHaveLength(10);
    // 50 amount reads to order the match set, then 10 to project the page.
    expect(source.priceLookups).toHaveLength(60);
    expect(page.items[0].price).toMatchObject({ amountCents: 5000 });
  });

  it("counts without projecting or pricing anything", () => {
    const source = new CountingSource(many);
    expect(service(source).count({})).toBe(50);
    expect(source.priceLookups).toHaveLength(0);
  });

  it("echoes the profile it priced with", () => {
    expect(service(new CountingSource(many)).list({}).profile).toBe(
      "KRIS_VOLUME_PARTNER",
    );
  });
});
