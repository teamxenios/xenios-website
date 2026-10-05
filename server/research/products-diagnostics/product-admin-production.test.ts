import { describe, expect, it, vi } from "vitest";
import {
  PRODUCT_COMMERCE_REQUIRED_INPUT_BINDINGS,
  PRODUCT_PRESENTATION_INPUT_BINDINGS,
} from "@shared/research/product-admin";
import {
  productReleaseGateFromRequiredInputs,
  SupabaseProductAdminRepository,
} from "./product-admin-production";
import { LiveProductControlReader } from "../catalog/product-control-reader";

type Readiness = {
  domain: string;
  manifestApproved: boolean;
  softwareComplete: boolean;
  publicEnabled: boolean;
  launchStatus: string;
  realInputsRequired: boolean;
  expectedInputCount: number;
  actualInputCount: number;
  blockingInputCount: number;
  blockingKeys: string[];
};

function ready(domain: string, count = 2): Readiness {
  return {
    domain,
    manifestApproved: true,
    softwareComplete: true,
    publicEnabled: true,
    launchStatus: "public_enabled",
    realInputsRequired: false,
    expectedInputCount: count,
    actualInputCount: count,
    blockingInputCount: 0,
    blockingKeys: [],
  };
}

function canonicalRows(productId = "product-1") {
  return PRODUCT_COMMERCE_REQUIRED_INPUT_BINDINGS.map((binding) => ({
    key: binding.key,
    domain: binding.domain,
    record_type: binding.recordType,
    record_id: productId,
    current_state: "verified",
    blocking_level: "blocks_display",
  }));
}

function dbWith(
  data: unknown[],
  readiness: Record<string, Partial<Readiness>> = {},
) {
  return {
    from() {
      return {
        select() {
          return {
            async eq() {
              return { data, error: null };
            },
          };
        },
      };
    },
    async rpc(_name: string, args: { p_domain: string }) {
      const baseline = ready(args.p_domain);
      return {
        data: { ...baseline, ...(readiness[args.p_domain] ?? {}) },
        error: null,
      };
    },
  };
}

async function evaluate(
  rows: unknown[],
  readiness: Record<string, Partial<Readiness>> = {},
) {
  return productReleaseGateFromRequiredInputs(
    dbWith(rows, readiness) as never,
  ).evaluate("product-1");
}

describe("productReleaseGateFromRequiredInputs", () => {
  it("fails closed for empty, truncated, and same-count replacement projections", async () => {
    const complete = canonicalRows();
    const empty = await evaluate([]);
    const truncated = await evaluate(complete.slice(0, -1));
    const replaced = await evaluate([
      ...complete.slice(0, -1),
      { ...complete.at(-1), key: "products.unexpected" },
    ]);

    expect(empty.displayReady).toBe(false);
    expect(truncated.displayReady).toBe(false);
    expect(replaced.displayReady).toBe(false);
    expect(replaced.blockingKeys).toContain("product.required_inputs.record_set");
  });

  it("fails closed for stale manifest and inconsistent canonical counts", async () => {
    const rows = canonicalRows();
    const stale = await evaluate(rows, {
      products: { manifestApproved: false },
    });
    const inconsistent = await evaluate(rows, {
      product_content: { actualInputCount: 1, expectedInputCount: 2 },
    });

    expect(stale.blockingKeys).toContain(
      "product.required_inputs.manifest:products",
    );
    expect(inconsistent.blockingKeys).toContain(
      "product.required_inputs.manifest:product_content",
    );
  });

  it("isolates the exact product record identity", async () => {
    const wrongRecord = canonicalRows("product-2");
    const result = await evaluate(wrongRecord);

    expect(result.displayReady).toBe(false);
    expect(result.blockingKeys).toContain("products.sku");
  });

  it("returns exact rejected and expired blockers", async () => {
    const rows = canonicalRows();
    rows[0].current_state = "rejected";
    rows[1].current_state = "expired";
    const result = await evaluate(rows);

    expect(result.displayReady).toBe(false);
    expect(result.blockingKeys).toEqual(
      expect.arrayContaining([rows[0].key, rows[1].key]),
    );
  });

  it("ignores all states and malformed metadata of the reserved presentation input", async () => {
    const baseline = await evaluate(canonicalRows());
    const binding = PRODUCT_PRESENTATION_INPUT_BINDINGS[0];
    const image = {
      key: binding.key,
      domain: binding.domain,
      record_type: binding.recordType,
      record_id: "product-1",
      current_state: "missing",
      blocking_level: "blocks_display",
    };
    for (const current_state of [
      "missing", "entered", "under_review", "verified", "rejected",
      "expired", "superseded", "not_applicable",
    ]) {
      await expect(evaluate([
        ...canonicalRows(),
        { ...image, current_state },
      ])).resolves.toEqual(baseline);
    }
    await expect(evaluate([
      ...canonicalRows(),
      image,
      {
        ...image,
        domain: "wrong-image-domain",
        record_type: null,
        record_id: "another-product",
        current_state: "invalid-image-state",
        blocking_level: "blocks_transaction",
      },
    ])).resolves.toEqual(baseline);
  });

  it("cannot substitute image evidence for a missing or rejected commerce input", async () => {
    const binding = PRODUCT_PRESENTATION_INPUT_BINDINGS[0];
    const approvedImage = {
      key: binding.key,
      domain: binding.domain,
      record_type: binding.recordType,
      record_id: "product-1",
      current_state: "verified",
      blocking_level: "informational",
    };
    for (const expected of PRODUCT_COMMERCE_REQUIRED_INPUT_BINDINGS) {
      const missing = canonicalRows().filter((row) => row.key !== expected.key);
      await expect(evaluate([...missing, approvedImage])).resolves.toMatchObject({
        displayReady: false,
        commerceReady: false,
        blockingKeys: expect.arrayContaining([expected.key]),
      });
      const rejected = canonicalRows().map((row) => (
        row.key === expected.key ? { ...row, current_state: "rejected" } : row
      ));
      await expect(evaluate([...rejected, approvedImage])).resolves.toMatchObject({
        displayReady: false,
        commerceReady: false,
        blockingKeys: expect.arrayContaining([expected.key]),
      });
    }
    for (const unknown of [
      { ...canonicalRows()[0], key: "products.unknown", blocking_level: "informational" },
      { ...canonicalRows()[0], domain: "wrong-domain" },
      { ...canonicalRows()[0] },
    ]) {
      await expect(evaluate([...canonicalRows(), approvedImage, unknown])).resolves.toMatchObject({
        displayReady: false,
        blockingKeys: expect.arrayContaining(["product.required_inputs.record_set"]),
      });
    }
  });

  it("allows display only for the exact current record set and canonical readiness", async () => {
    await expect(evaluate(canonicalRows())).resolves.toEqual({
      displayReady: true,
      commerceReady: false,
      blockingKeys: [],
    });
  });
});

const REPOSITORY_AT = "2026-10-03T20:00:00.000Z";
const MEDIA_TABLE_NAME = "research_product_media";
const INPUT_TABLE_NAME = "research_required_inputs";
type RepositoryRead = "list" | "listDetails" | "get";
type QueryFailure = "construction" | "rejected" | "returned";

function repositoryRows(): Record<string, unknown> {
  return {
    research_products: [{
      id: "product-1", sku: "PRODUCT-1", slug: "product-1",
      display_name: "Product One", canonical_name: "Product One", name_aliases: [],
      lane: "research_material", category: "Research", product_classification: "Research material",
      admin_status: "published", active_state: true, visibility_state: "public",
      availability: "in_stock", commerce_approval: "approved", quality_document_state: "approved",
      updated_at: REPOSITORY_AT, published_at: REPOSITORY_AT,
    }],
    research_product_variants: [{
      id: "variant-1", product_id: "product-1", sku: "PRODUCT-1-VARIANT", label: "Standard",
      member_eligible: true, status: "approved", active: true, sort_order: 0,
      created_at: REPOSITORY_AT, updated_at: REPOSITORY_AT,
    }],
    research_product_prices: [{
      id: "price-1", product_id: "product-1", variant_id: "variant-1", audience: "member",
      amount_cents: 14900, currency: "USD", status: "active", version: 1,
      effective_at: "2026-07-01T00:00:00.000Z", expires_at: null,
      created_by: "admin", approved_by: "reviewer", created_at: REPOSITORY_AT, updated_at: REPOSITORY_AT,
    }],
    research_product_media: [{
      id: "media-1", product_id: "product-1", kind: "primary_image", state: "approved",
      storage_key: "product-1/media-1/image.webp", filename: "image.webp", content_type: "image/webp",
      size_bytes: 100, alt_text: "Product One package", sort_order: 0, approved_by: "reviewer",
      created_at: REPOSITORY_AT, updated_at: REPOSITORY_AT,
    }],
    research_product_content: [{ product_id: "product-1", section: "shortDescription", body: "Reviewed product summary.", metadata: null }],
    research_product_admin_audit: [],
    research_required_inputs: canonicalRows(),
  };
}

function repositoryHarness() {
  const rows = repositoryRows();
  const failures: Partial<Record<string, QueryFailure>> = {};
  const selects: Array<{ table: string; columns: string }> = [];
  const rpc = vi.fn(async () => ({ data: null, error: { code: "MEDIA_COMMAND_FAILED" } }));
  const storageFrom = vi.fn();
  const db = {
    rpc,
    storage: { from: storageFrom },
    from(table: string) {
      if (failures[table] === "construction") throw new Error(`query construction failed: ${table}`);
      let columns = "*";
      const filters: Array<{ key: string; values: readonly unknown[] }> = [];
      const execute = async (single = false) => {
        if (failures[table] === "rejected") throw new Error(`query rejected: ${table}`);
        if (failures[table] === "returned") return { data: null, error: { code: "READ_FAILED" } };
        const source = rows[table];
        let data = typeof source === "function" ? source() : source;
        if (Array.isArray(data)) {
          data = data.filter((row) => (
            row === null || typeof row !== "object" ||
            filters.every(({ key, values }) => !(key in row) || values.includes(row[key]))
          ));
          if (columns !== "*") {
            data = data.map((row: unknown) => (
              row === null || typeof row !== "object" || Array.isArray(row)
                ? row
                : Object.fromEntries(columns.split(",").map((key) => [key, (row as Record<string, unknown>)[key]]))
            ));
          }
        }
        return { data: single && Array.isArray(data) ? data[0] ?? null : data, error: null };
      };
      const query = {
        select(value: string) { columns = value; selects.push({ table, columns }); return query; },
        order() { return query; },
        eq(key: string, value: unknown) { filters.push({ key, values: [value] }); return query; },
        in(key: string, values: readonly unknown[]) { filters.push({ key, values }); return query; },
        or() { return query; },
        maybeSingle() { return execute(true); },
        then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
          return execute().then(resolve, reject);
        },
      };
      return query;
    },
  };
  return { repo: new SupabaseProductAdminRepository(db as never), rows, failures, selects, rpc, storageFrom };
}

async function readProducts(repo: SupabaseProductAdminRepository, method: RepositoryRead) {
  if (method === "get") return [await repo.get("product-1")];
  return method === "list" ? repo.list({}) : repo.listDetails();
}

describe("Product Control optional media reads", () => {
  it.each(["listDetails", "get"] as const)("keeps %s products when only media query construction, rejection, or returned errors fail", async (method) => {
    const baseline = await readProducts(repositoryHarness().repo, method);
    expect(baseline).toHaveLength(1);
    expect(baseline[0]).toMatchObject({ media: [{ id: "media-1" }], prices: [{ amountCents: 14900 }] });
    for (const failure of ["construction", "rejected", "returned"] as const) {
      const setup = repositoryHarness();
      setup.failures[MEDIA_TABLE_NAME] = failure;
      await expect(readProducts(setup.repo, method)).resolves.toEqual(
        baseline.map((product) => ({ ...product, media: [] })),
      );
    }
  });

  it.each(["listDetails", "get"] as const)("drops malformed media rows without dropping %s products or valid neighboring media", async (method) => {
    const baseline = await readProducts(repositoryHarness().repo, method);
    for (const media of [undefined, null, {}, "invalid", [null, {}, 42, "invalid"]]) {
      const setup = repositoryHarness();
      setup.rows[MEDIA_TABLE_NAME] = media;
      await expect(readProducts(setup.repo, method)).resolves.toEqual(
        baseline.map((product) => ({ ...product, media: [] })),
      );
    }
    const mixed = repositoryHarness();
    const valid = (mixed.rows[MEDIA_TABLE_NAME] as unknown[])[0];
    mixed.rows[MEDIA_TABLE_NAME] = [null, {}, valid, { ...(valid as object), kind: "unknown-kind" }];
    await expect(readProducts(mixed.repo, method)).resolves.toEqual(baseline);
  });

  it.each(["list", "listDetails", "get"] as const)("keeps %s missingInputCount independent of image state and preserves other blockers", async (method) => {
    const setup = repositoryHarness();
    const realRows = canonicalRows();
    realRows[0].current_state = "missing";
    const unknownBlocker = { ...realRows[1], key: "products.other_authority", current_state: "rejected" };
    const image = {
      key: "product_content.primary_image", record_id: "product-1",
      current_state: "missing", blocking_level: "blocks_transaction",
      domain: "malformed-image-domain", record_type: null,
    };
    setup.rows[INPUT_TABLE_NAME] = [...realRows, unknownBlocker, image];
    const baseline = await readProducts(setup.repo, method);
    expect(baseline[0]).toMatchObject({ missingInputCount: 2 });
    for (const state of ["verified", "rejected", "expired", "superseded", "missing"]) {
      image.current_state = state;
      await expect(readProducts(setup.repo, method)).resolves.toEqual(baseline);
    }
    expect(setup.selects.filter(({ table }) => table === INPUT_TABLE_NAME)
      .every(({ columns }) => columns.split(",").includes("key"))).toBe(true);
    realRows[0].current_state = "verified";
    expect((await readProducts(setup.repo, method))[0]).toMatchObject({ missingInputCount: 1 });
  });

  it("keeps list filtering image-independent and never asks for media rows", async () => {
    const setup = repositoryHarness();
    setup.failures[MEDIA_TABLE_NAME] = "construction";
    setup.rows[INPUT_TABLE_NAME] = [
      ...canonicalRows(),
      { key: "product_content.primary_image", record_id: "product-1", current_state: "missing", blocking_level: "blocks_display" },
    ];
    await expect(setup.repo.list({ missingInputsOnly: true })).resolves.toEqual([]);
    expect(setup.selects.some(({ table }) => table === MEDIA_TABLE_NAME)).toBe(false);
  });

  it.each([true, false])("retains the catalog while image inputs change between snapshot reads (bulk=%s)", async (bulk) => {
    const setup = repositoryHarness();
    let inputReads = 0;
    setup.rows[INPUT_TABLE_NAME] = () => [
      ...canonicalRows(),
      {
        key: "product_content.primary_image", record_id: "product-1",
        current_state: ++inputReads % 2 ? "missing" : "verified", blocking_level: "blocks_display",
      },
    ];
    const reader = new LiveProductControlReader(bulk ? setup.repo : {
      list: setup.repo.list.bind(setup.repo),
      get: setup.repo.get.bind(setup.repo),
    });
    const catalog = await reader.readCatalog();
    expect(inputReads).toBeGreaterThan(1);
    expect(catalog).toHaveLength(1);
    expect(catalog[0]).toMatchObject({ id: "product-1", missingInputCount: 0, prices: [{ amountCents: 14900 }] });
  });

  it.each(["list", "listDetails", "get"] as const)("keeps all non-media %s read failures strict", async (method) => {
    const tables = ["research_products", "research_product_variants", INPUT_TABLE_NAME];
    if (method !== "list") tables.push("research_product_prices", "research_product_content");
    if (method === "get") tables.push("research_product_admin_audit");
    for (const table of tables) {
      for (const failure of ["construction", "rejected", "returned"] as const) {
        const setup = repositoryHarness();
        setup.failures[MEDIA_TABLE_NAME] = "returned";
        setup.failures[table] = failure;
        await expect(readProducts(setup.repo, method)).rejects.toThrow();
      }
    }
  });

  it("keeps media preparation, confirmation, and update failures strict", async () => {
    const setup = repositoryHarness();
    await expect(setup.repo.createMediaUpload("product-1", {
      kind: "primary_image", filename: "image.webp", contentType: "image/webp",
      sizeBytes: 100, altText: "Product One", sortOrder: 0,
    }, "admin", REPOSITORY_AT)).rejects.toThrow("prepare product media failed");
    await expect(setup.repo.updateMedia("product-1", "media-1", {
      state: "approved", altText: "Product One", sortOrder: 0, reason: null,
    }, "admin", REPOSITORY_AT)).rejects.toThrow("research_admin_update_product_media failed");
    for (const failure of ["construction", "rejected", "returned"] as const) {
      setup.failures[MEDIA_TABLE_NAME] = failure;
      await expect(setup.repo.confirmMediaUpload("product-1", "media-1", "admin", REPOSITORY_AT))
        .rejects.toThrow();
    }
    expect(setup.storageFrom).not.toHaveBeenCalled();
    expect(setup.rpc).toHaveBeenCalledTimes(2);
  });
});
