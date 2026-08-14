import { EARLY_ACCESS_MAX_QUANTITY } from "@shared/research/early-access-quantity";
import type {
  KrisCatalogDetailView,
  KrisCatalogItemView,
  KrisCatalogPage,
} from "@shared/research/kris-launch-a/contract";
import {
  KRIS_CHANNELS,
  KRIS_CHANNEL_LABELS,
  KRIS_FAMILIES,
  KRIS_FAMILY_LABELS,
  KRIS_PRICE_PENDING,
} from "@shared/research/kris-launch-a/contract";
import { afterEach, describe, expect, it, vi } from "vitest";
import { krisPathwayView } from "../../../../server/research/kris-launch-a/pathway";
import {
  krisFixtureCatalog,
  krisFixtureDetail,
  krisFixtureItems,
} from "./__fixtures__/krisFixtureServer";
import {
  getKrisCatalog,
  getKrisDetail,
  toKrisSurfaceState,
} from "./catalogApi";

const FAMILY = "research_capsules" as const;
const SLUG = "research-capsules-bam15-bam15-500-mcg";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function detailEnvelope(product: KrisCatalogDetailView): unknown {
  return { ok: true, profile: "KRIS_VOLUME_PARTNER", product };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

/** Hydrate the committed storage-oriented fixture exactly as production projects it. */
function mountedItem(item: KrisCatalogItemView): KrisCatalogItemView {
  const price =
    item.price.state === "pending" ? KRIS_PRICE_PENDING : item.price;
  return {
    ...item,
    price,
    pathway: krisPathwayView(item.purchaseMode, item.channel, item),
  };
}

function mountedDetail(): KrisCatalogDetailView {
  const item = krisFixtureDetail(FAMILY, SLUG);
  if (item === null) throw new Error("fixture detail missing");
  return { ...mountedItem(item), disclosures: item.disclosures };
}

function mountedPage(page: KrisCatalogPage): KrisCatalogPage {
  return {
    ...page,
    facets: {
      families: KRIS_FAMILIES.map((value) => ({
        value,
        label: KRIS_FAMILY_LABELS[value],
        count:
          page.facets.families.find((entry) => entry.value === value)?.count ??
          0,
      })),
      channels: KRIS_CHANNELS.map((value) => ({
        value,
        label: KRIS_CHANNEL_LABELS[value],
        count:
          page.facets.channels.find((entry) => entry.value === value)?.count ??
          0,
      })),
    },
    items: page.items.map(mountedItem),
  };
}

function directDetail(): KrisCatalogDetailView {
  const item = krisFixtureItems()
    .map(mountedItem)
    .find(
      (candidate) =>
        candidate.purchaseMode === "direct_eligible" &&
        candidate.price.state === "priced",
    );
  if (item === undefined || item.price.state !== "priced") {
    throw new Error("fixture has no priced direct item");
  }
  return {
    ...item,
    legacyOrder: {
      productId: "product:fixture-direct",
      variantId: "variant:fixture-direct",
      unitPriceCents: item.price.amountCents,
      currency: item.price.currency,
      quantityLimit: EARLY_ACCESS_MAX_QUANTITY,
      evaluatedAt: "2026-08-14T12:34:56.789Z",
    },
    canBuyNow: true,
    pathway: null,
    disclosures: ["Fixture disclosure"],
  };
}

function providerDetail(): KrisCatalogDetailView {
  const item = krisFixtureItems()
    .map(mountedItem)
    .find((candidate) => candidate.purchaseMode === "provider_workflow");
  if (item === undefined) throw new Error("fixture has no provider item");
  return { ...item, disclosures: ["Fixture disclosure"] };
}

async function readDetail(product: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      jsonResponse({ ok: true, profile: "KRIS_VOLUME_PARTNER", product }),
    ),
  );
  return getKrisDetail("member-token", FAMILY, SLUG);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Kris catalog API adapter", () => {
  it("accepts the complete mounted detail envelope and projects only public fields", async () => {
    const product = mountedDetail();
    const wireProduct = {
      ...product,
      privateSupplierCost: 1,
      price: { ...product.price, privatePriceSource: "do-not-project" },
      access: { ...product.access, internalDecision: "do-not-project" },
    };
    const fetch = vi.fn(async () => jsonResponse(detailEnvelope(wireProduct)));
    vi.stubGlobal("fetch", fetch);

    const result = await getKrisDetail("member-token", FAMILY, SLUG);
    expect(result).toEqual({ kind: "ok", data: product });
    expect(result.kind === "ok" ? result.data : null).not.toHaveProperty(
      "privateSupplierCost",
    );
    expect(fetch).toHaveBeenCalledWith(
      `/api/research/kris-launch-a/v1/products/${SLUG}`,
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        headers: expect.objectContaining({
          Authorization: "Bearer member-token",
        }),
      }),
    );
  });

  it("accepts a complete list envelope, including an honest empty page", async () => {
    const page = mountedPage(krisFixtureCatalog({ pageSize: 24 }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(page)),
    );
    await expect(getKrisCatalog("member-token")).resolves.toEqual({
      kind: "ok",
      data: page,
    });

    const empty = mountedPage(
      krisFixtureCatalog({ q: "no-such-fixture-product" }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(empty)),
    );
    await expect(getKrisCatalog("member-token")).resolves.toEqual({
      kind: "ok",
      data: empty,
    });
  });

  it("fails closed on partial list/detail success envelopes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: true })),
    );
    await expect(getKrisCatalog("member-token")).resolves.toEqual({
      kind: "unavailable",
    });

    await expect(
      readDetail({ id: "fixture-id", slug: SLUG, disclosures: [] }),
    ).resolves.toEqual({ kind: "unavailable" });
  });

  it.each([
    ["price display", (item: any) => (item.price.display = "$0.01")],
    ["price currency", (item: any) => (item.price.currency = "US$")],
    ["access channel", (item: any) => (item.access.channel = "supplement")],
    ["purchasability", (item: any) => (item.access.purchasable = true)],
    ["product identity", (item: any) => (item.legacyOrder.productId = "x")],
    ["variant identity", (item: any) => (item.legacyOrder.variantId = "../x")],
    [
      "quantity authority",
      (item: any) =>
        (item.legacyOrder.quantityLimit = EARLY_ACCESS_MAX_QUANTITY + 1),
    ],
    [
      "canonical evaluation time",
      (item: any) => (item.legacyOrder.evaluatedAt = "2026-08-14T12:34:56Z"),
    ],
    ["price binding", (item: any) => item.legacyOrder.unitPriceCents++],
    ["buy-now decision", (item: any) => (item.canBuyNow = false)],
  ])("refuses a malformed nested %s", async (_name, mutate) => {
    const product = clone(directDetail());
    mutate(product);
    await expect(readDetail(product)).resolves.toEqual({ kind: "unavailable" });
  });

  it.each([
    ["missing pathway", (item: any) => delete item.pathway],
    [
      "wrong pathway kind",
      (item: any) => (item.pathway.kind = "price_pending"),
    ],
    [
      "partial pathway request",
      (item: any) => delete item.pathway.request.subject,
    ],
    [
      "unknown purchase mode",
      (item: any) => (item.purchaseMode = "buy_anyway"),
    ],
  ])("refuses a provider item with %s", async (_name, mutate) => {
    const product = clone(providerDetail());
    mutate(product);
    await expect(readDetail(product)).resolves.toEqual({ kind: "unavailable" });
  });

  it("requires pending price and pending mode to agree", async () => {
    const product = clone(directDetail()) as any;
    product.price = { state: "pending", display: "Price pending" };
    product.legacyOrder = null;
    product.canBuyNow = false;
    await expect(readDetail(product)).resolves.toEqual({ kind: "unavailable" });
  });

  it.each([
    ["facets", (page: any) => (page.facets.families[0].label = "Wrong")],
    ["partial facet set", (page: any) => (page.facets.families = [])],
    [
      "duplicate facet",
      (page: any) => (page.facets.channels[1] = page.facets.channels[0]),
    ],
    ["nested item", (page: any) => delete page.items[0].pathway],
    ["total pages", (page: any) => page.totalPages++],
    ["page item count", (page: any) => page.items.pop()],
  ])("refuses a malformed list %s", async (_name, mutate) => {
    const page = clone(
      mountedPage(krisFixtureCatalog({ pageSize: 24 })),
    ) as KrisCatalogPage;
    mutate(page);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(page)),
    );
    await expect(getKrisCatalog("member-token")).resolves.toEqual({
      kind: "unavailable",
    });
  });

  it("accepts a server page beyond the final page only when it is empty", async () => {
    const page = clone(
      mountedPage(krisFixtureCatalog({ pageSize: 24 })),
    ) as any;
    page.page = page.totalPages + 1;
    page.items = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(page)),
    );
    await expect(getKrisCatalog("member-token")).resolves.toMatchObject({
      kind: "ok",
      data: { page: page.totalPages + 1, items: [] },
    });
  });

  it("binds returned detail identity to both requested route segments", async () => {
    const product = mountedDetail();
    await expect(
      readDetail({ ...product, slug: "a-different-safe-slug" }),
    ).resolves.toEqual({ kind: "unavailable" });
    await expect(
      readDetail({
        ...product,
        family: "supplements",
        familyLabel: "Supplements",
      }),
    ).resolves.toEqual({ kind: "unavailable" });
  });

  it("preserves the mounted not-found code without changing generic 404s", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ ok: false, code: "kris_catalog_not_found" }, 404),
      ),
    );
    const notFound = await getKrisDetail("member-token", FAMILY, SLUG);
    expect(notFound).toEqual({
      kind: "denied",
      code: "kris_catalog_not_found",
      message: undefined,
    });
    expect(toKrisSurfaceState(notFound)).toBe("not_found");

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("<html>not the API</html>", {
            status: 404,
            headers: { "Content-Type": "text/html" },
          }),
      ),
    );
    await expect(getKrisDetail("member-token", FAMILY, SLUG)).resolves.toEqual({
      kind: "unavailable",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ ok: false, code: "kris_catalog_not_found" }, 200),
      ),
    );
    await expect(getKrisDetail("member-token", FAMILY, SLUG)).resolves.toEqual({
      kind: "unavailable",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ ok: false, code: "kris_catalog_not_found" }, 500),
      ),
    );
    await expect(getKrisDetail("member-token", FAMILY, SLUG)).resolves.toEqual({
      kind: "error",
      message: "Something went wrong. Please try again.",
    });
  });

  it("never interprets an inherited object key as a catalog error code", () => {
    expect(toKrisSurfaceState({ kind: "denied", code: "toString" })).toBe(
      "restricted",
    );
  });

  it("preserves the server's entitlement denial", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ ok: false, code: "kris_catalog_forbidden" }, 403),
      ),
    );
    await expect(getKrisDetail("member-token", FAMILY, SLUG)).resolves.toEqual({
      kind: "denied",
      code: "kris_catalog_forbidden",
      message: undefined,
    });
  });
});
