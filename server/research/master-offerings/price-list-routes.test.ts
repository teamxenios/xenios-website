import express, { type Express } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { FULL_CATALOG_VISIBILITY_ENV_VAR } from "../catalog-display/visibility";
import { noMasterOfferingCommerce } from "./customer-projection";
import {
  MASTER_OFFERING_CATALOG_BASE_PATH,
  MASTER_OFFERING_CATALOG_PRICE_LIST_ROUTE,
  createMasterOfferingCatalogApiHandlers,
  parseMasterOfferingPriceListQuery,
  type MasterOfferingCatalogApiDependencies,
} from "./routes";
import {
  InMemoryMasterOfferingCatalogReader,
  MasterOfferingCatalogService,
} from "./service";
import { offering, variant } from "./test-fixtures";
import {
  MASTER_OFFERINGS_ENABLED_ENV_VAR,
  MASTER_OFFERINGS_FOUNDER_ADMIN_ONLY_ENV_VAR,
} from "./visibility-policy";

const FOUNDER = "founder@example.com";
const GENERATED_AT = "2026-08-12T15:04:05.000Z";

function service(): MasterOfferingCatalogService {
  return new MasterOfferingCatalogService(
    new InMemoryMasterOfferingCatalogReader([
      offering({
        variants: [
          variant({ id: "mov_a", label: "5 mg vial" }),
          variant({ id: "mov_b", label: "10 mg vial" }),
        ],
      }),
    ]),
    noMasterOfferingCommerce,
  );
}

function app(
  overrides: Partial<MasterOfferingCatalogApiDependencies> = {},
  env: Record<string, string | undefined> = {},
): Express {
  const application = express();
  const handlers = createMasterOfferingCatalogApiHandlers({
    authorizeViewer:
      overrides.authorizeViewer ??
      (() => ({ audience: "member" as const, email: FOUNDER })),
    serviceForViewer: overrides.serviceForViewer ?? service,
    now: overrides.now ?? (() => GENERATED_AT),
    env: {
      [MASTER_OFFERINGS_ENABLED_ENV_VAR]: "true",
      [MASTER_OFFERINGS_FOUNDER_ADMIN_ONLY_ENV_VAR]: "true",
      [FULL_CATALOG_VISIBILITY_ENV_VAR]: FOUNDER,
      ...env,
    },
  });
  application.get(
    MASTER_OFFERING_CATALOG_PRICE_LIST_ROUTE,
    handlers.privateHeaders,
    handlers.priceList,
  );
  application.use(MASTER_OFFERING_CATALOG_BASE_PATH, handlers.error);
  return application;
}

describe("unmounted price list export composition packet", () => {
  it("registers no Express route by itself", () => {
    const handlers = createMasterOfferingCatalogApiHandlers({
      authorizeViewer: () => null,
      serviceForViewer: service,
    });
    expect(typeof handlers.priceList).toBe("function");
    expect(MASTER_OFFERING_CATALOG_PRICE_LIST_ROUTE).toBe(
      "/api/research/catalog-display/v2/price-list",
    );
  });

  it("downloads a private, noindex CSV attachment", async () => {
    const response = await request(app()).get(
      MASTER_OFFERING_CATALOG_PRICE_LIST_ROUTE,
    );
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["x-robots-tag"]).toBe("noindex, nofollow");
    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.headers["content-disposition"]).toBe(
      'attachment; filename="xenios-research-price-list-2026-08-12.csv"',
    );
    const lines = response.text.trim().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("Price");
    expect(response.text).toContain("Price on request");
  });

  it("downloads the same rows as JSON on request", async () => {
    const response = await request(app()).get(
      `${MASTER_OFFERING_CATALOG_PRICE_LIST_ROUTE}?format=json`,
    );
    expect(response.status).toBe(200);
    expect(response.headers["content-disposition"]).toContain(".json");
    expect(response.body.rowCount).toBe(2);
    expect(response.body.pricedRowCount).toBe(0);
    expect(response.body.notice).toContain("Product Control");
  });

  it("applies the same closed filters as the catalog", async () => {
    const empty = await request(app()).get(
      `${MASTER_OFFERING_CATALOG_PRICE_LIST_ROUTE}?format=json&families=diagnostics`,
    );
    expect(empty.body.rowCount).toBe(0);
    const matched = await request(app()).get(
      `${MASTER_OFFERING_CATALOG_PRICE_LIST_ROUTE}?format=json&families=research_vials&q=bpc`,
    );
    expect(matched.body.rowCount).toBe(2);
  });

  it("rejects an unknown query key, an unknown format, and any paging key", async () => {
    for (const suffix of [
      "?unknown=1",
      "?format=xlsx",
      "?page=2",
      "?pageSize=10",
      "?families=not_a_family",
    ]) {
      const response = await request(app()).get(
        `${MASTER_OFFERING_CATALOG_PRICE_LIST_ROUTE}${suffix}`,
      );
      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        ok: false,
        code: "master_offerings_invalid_request",
      });
    }
  });

  it("is disabled, auth gated, and launch gated exactly like the catalog", async () => {
    const disabled = await request(
      app({}, { [MASTER_OFFERINGS_ENABLED_ENV_VAR]: "false" }),
    ).get(MASTER_OFFERING_CATALOG_PRICE_LIST_ROUTE);
    expect(disabled.status).toBe(503);
    expect(disabled.body.code).toBe("master_offerings_disabled");

    const anonymous = await request(app({ authorizeViewer: () => null })).get(
      MASTER_OFFERING_CATALOG_PRICE_LIST_ROUTE,
    );
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.code).toBe("master_offerings_auth_required");

    const other = await request(
      app({
        authorizeViewer: () => ({
          audience: "member" as const,
          email: "someone-else@example.com",
        }),
      }),
    ).get(MASTER_OFFERING_CATALOG_PRICE_LIST_ROUTE);
    expect(other.status).toBe(403);
    expect(other.body.code).toBe("master_offerings_launch_restricted");
  });

  it("refuses an oversized export rather than truncating it", async () => {
    const huge = {
      priceList: async () => ({
        ok: false as const,
        code: "too_large" as const,
        rowCount: 9000,
        maxRows: 5000,
      }),
    } as unknown as MasterOfferingCatalogService;
    const response = await request(app({ serviceForViewer: () => huge })).get(
      MASTER_OFFERING_CATALOG_PRICE_LIST_ROUTE,
    );
    expect(response.status).toBe(413);
    expect(response.body).toEqual({
      ok: false,
      code: "master_offerings_export_too_large",
    });
  });

  it("fails closed to unavailable when the service throws", async () => {
    const broken = {
      priceList: async () => {
        throw new Error("catalog unavailable");
      },
    } as unknown as MasterOfferingCatalogService;
    const response = await request(app({ serviceForViewer: () => broken })).get(
      MASTER_OFFERING_CATALOG_PRICE_LIST_ROUTE,
    );
    expect(response.status).toBe(503);
    expect(response.body.code).toBe("master_offerings_unavailable");
  });
});

describe("price list query parsing", () => {
  it("defaults to csv and keeps the catalog filter vocabulary", () => {
    expect(parseMasterOfferingPriceListQuery({ query: {} })).toEqual({
      query: {},
      format: "csv",
    });
    expect(
      parseMasterOfferingPriceListQuery({
        query: { q: " bpc ", families: "research_vials,blends", format: "json" },
      }),
    ).toEqual({
      query: { q: "bpc", families: ["research_vials", "blends"] },
      format: "json",
    });
  });
});
