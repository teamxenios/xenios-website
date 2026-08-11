import express, { type Express } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { FULL_CATALOG_VISIBILITY_ENV_VAR } from "../catalog-display/visibility";
import { noMasterOfferingCommerce } from "./customer-projection";
import {
  MASTER_OFFERING_CATALOG_DETAIL_ROUTE,
  MASTER_OFFERING_CATALOG_LIST_ROUTE,
  MASTER_OFFERING_CATALOG_BASE_PATH,
  createMasterOfferingCatalogApiHandlers,
  type MasterOfferingCatalogApiDependencies,
} from "./routes";
import {
  InMemoryMasterOfferingCatalogReader,
  MasterOfferingCatalogService,
} from "./service";
import { offering } from "./test-fixtures";
import {
  MASTER_OFFERINGS_ENABLED_ENV_VAR,
  MASTER_OFFERINGS_FOUNDER_ADMIN_ONLY_ENV_VAR,
} from "./visibility-policy";

const FOUNDER = "founder@example.com";

function service(): MasterOfferingCatalogService {
  return new MasterOfferingCatalogService(
    new InMemoryMasterOfferingCatalogReader([offering()]),
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
    env: {
      [MASTER_OFFERINGS_ENABLED_ENV_VAR]: "true",
      [MASTER_OFFERINGS_FOUNDER_ADMIN_ONLY_ENV_VAR]: "true",
      [FULL_CATALOG_VISIBILITY_ENV_VAR]: FOUNDER,
      ...env,
    },
  });
  application.get(
    MASTER_OFFERING_CATALOG_LIST_ROUTE,
    handlers.privateHeaders,
    handlers.list,
  );
  application.get(
    MASTER_OFFERING_CATALOG_DETAIL_ROUTE,
    handlers.privateHeaders,
    handlers.detail,
  );
  application.options(
    MASTER_OFFERING_CATALOG_LIST_ROUTE,
    handlers.privateHeaders,
    handlers.options,
  );
  application.options(
    MASTER_OFFERING_CATALOG_DETAIL_ROUTE,
    handlers.privateHeaders,
    handlers.options,
  );
  application.use(MASTER_OFFERING_CATALOG_BASE_PATH, handlers.error);
  return application;
}

function expectPrivate(headers: Record<string, string | undefined>): void {
  expect(headers["cache-control"]).toBe("no-store");
  expect(headers["pragma"]).toBe("no-cache");
  expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["x-robots-tag"]).toBe("noindex, nofollow");
}

describe("unmounted master offerings API composition packet", () => {
  it("pins the final v2 list and detail route shapes", () => {
    expect(MASTER_OFFERING_CATALOG_LIST_ROUTE).toBe(
      "/api/research/catalog-display/v2/catalog",
    );
    expect(MASTER_OFFERING_CATALOG_DETAIL_ROUTE).toBe(
      "/api/research/catalog-display/v2/products/:family/:slug",
    );
  });

  it("fails closed when display-first is disabled", async () => {
    const authorizeViewer = vi.fn();
    const response = await request(
      app(
        { authorizeViewer },
        { [MASTER_OFFERINGS_ENABLED_ENV_VAR]: "false" },
      ),
    ).get(MASTER_OFFERING_CATALOG_LIST_ROUTE);
    expect(response.status).toBe(503);
    expect(response.body.code).toBe("master_offerings_disabled");
    expect(authorizeViewer).not.toHaveBeenCalled();
    expectPrivate(response.headers);
  });

  it("launches founder/admin-only by default and ignores browser breadth claims", async () => {
    const ordinary = app({
      authorizeViewer: () => ({
        audience: "member",
        email: "ordinary@example.com",
      }),
    });
    const denied = await request(ordinary).get(
      `${MASTER_OFFERING_CATALOG_LIST_ROUTE}?breadth=full`,
    );
    expect(denied.status).toBe(400);
    const restricted = await request(ordinary).get(
      MASTER_OFFERING_CATALOG_LIST_ROUTE,
    );
    expect(restricted.status).toBe(403);
    expect(restricted.body.code).toBe("master_offerings_launch_restricted");

    const admin = app({
      authorizeViewer: () => ({ audience: "admin", email: "admin@example.com" }),
    });
    const allowed = await request(admin).get(MASTER_OFFERING_CATALOG_LIST_ROUTE);
    expect(allowed.status).toBe(200);
    expect(allowed.body.launchScope).toBe("founder_admin");
  });

  it("serves validated search/filter/pagination through the pure catalog service", async () => {
    const response = await request(app()).get(
      `${MASTER_OFFERING_CATALOG_LIST_ROUTE}?q=BPC-157&families=research_vials&states=available_now&page=1&pageSize=24`,
    );
    expect(response.status).toBe(200);
    expect(response.body.catalog.total).toBe(1);
    expect(response.body.catalog.products[0].slug).toBe(
      "research-vials-bpc-157",
    );
    expectPrivate(response.headers);
  });

  it("rejects unknown filters and page sizes above 100", async () => {
    for (const query of [
      "families=unknown",
      "states=live",
      "pageSize=101",
      "page=0",
    ]) {
      const response = await request(app()).get(
        `${MASTER_OFFERING_CATALOG_LIST_ROUTE}?${query}`,
      );
      expect(response.status, query).toBe(400);
      expect(response.body.code).toBe("master_offerings_invalid_request");
    }
  });

  it("returns member-safe detail with fallback demand action and no quantity selector", async () => {
    const response = await request(app()).get(
      "/api/research/catalog-display/v2/products/research_vials/research-vials-bpc-157",
    );
    expect(response.status).toBe(200);
    expect(response.body.product.variants[0].action.kind).toBe("request_access");
    expect(JSON.stringify(response.body)).not.toContain("quantityPolicy");
    expect(JSON.stringify(response.body)).not.toContain("sourceReferences");
  });

  it("unifies missing and mismatched-family detail as not found", async () => {
    for (const path of [
      "/api/research/catalog-display/v2/products/supplements/research-vials-bpc-157",
      "/api/research/catalog-display/v2/products/research_vials/missing",
    ]) {
      const response = await request(app()).get(path);
      expect(response.status).toBe(404);
      expect(response.body.code).toBe("master_offerings_not_found");
    }
  });

  it("can expand to all active members only through the server flag", async () => {
    const response = await request(
      app(
        {
          authorizeViewer: () => ({
            audience: "member",
            email: "ordinary@example.com",
          }),
        },
        { [MASTER_OFFERINGS_FOUNDER_ADMIN_ONLY_ENV_VAR]: "false" },
      ),
    ).get(MASTER_OFFERING_CATALOG_LIST_ROUTE);
    expect(response.status).toBe(200);
    expect(response.body.launchScope).toBe("all_members");
  });
});
