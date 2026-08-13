import express, { type Express } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { FULL_CATALOG_VISIBILITY_ENV_VAR } from "../catalog-display/visibility";
import { noMasterOfferingCommerce } from "./customer-projection";
import {
  MASTER_OFFERING_CATALOG_ROUTES,
  mountMasterOfferingCatalog,
} from "./mount";
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

function service(): MasterOfferingCatalogService {
  return new MasterOfferingCatalogService(
    new InMemoryMasterOfferingCatalogReader([
      offering({ variants: [variant({ id: "mov_a" })] }),
    ]),
    noMasterOfferingCommerce,
  );
}

function mounted(env: Record<string, string | undefined> = {}): Express {
  const app = express();
  mountMasterOfferingCatalog(app, {
    authorizeViewer: () => ({ audience: "member" as const, email: FOUNDER }),
    serviceForViewer: service,
    now: () => "2026-08-13T00:00:00.000Z",
    env: {
      [MASTER_OFFERINGS_ENABLED_ENV_VAR]: "true",
      [MASTER_OFFERINGS_FOUNDER_ADMIN_ONLY_ENV_VAR]: "true",
      [FULL_CATALOG_VISIBILITY_ENV_VAR]: FOUNDER,
      ...env,
    },
  });
  return app;
}

describe("the mount helper", () => {
  it("registers exactly the three prepared GET routes", () => {
    expect(MASTER_OFFERING_CATALOG_ROUTES).toEqual([
      "/api/research/catalog-display/v2/catalog",
      "/api/research/catalog-display/v2/products/:family/:slug",
      "/api/research/catalog-display/v2/price-list",
    ]);
    const app = express();
    const result = mountMasterOfferingCatalog(app, {
      authorizeViewer: () => null,
      serviceForViewer: service,
    });
    expect(result.routes).toEqual([...MASTER_OFFERING_CATALOG_ROUTES]);
    expect(result.basePath).toBe("/api/research/catalog-display/v2");
  });

  it("serves all three routes with the private headers in place", async () => {
    const app = mounted();
    const responses = await Promise.all([
      request(app).get("/api/research/catalog-display/v2/catalog"),
      request(app).get(
        "/api/research/catalog-display/v2/products/research_vials/research-vials-bpc-157",
      ),
      request(app).get(
        "/api/research/catalog-display/v2/price-list?format=json",
      ),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.headers["x-robots-tag"]).toBe("noindex, nofollow");
    }
  });

  it("answers OPTIONS with GET, HEAD, OPTIONS and nothing else", async () => {
    for (const route of [
      "/api/research/catalog-display/v2/catalog",
      "/api/research/catalog-display/v2/price-list",
    ]) {
      const response = await request(mounted()).options(route);
      expect(response.status).toBe(204);
      expect(response.headers["allow"]).toBe("GET, HEAD, OPTIONS");
    }
  });

  it("refuses every write method on every route", async () => {
    const app = mounted();
    for (const route of [
      "/api/research/catalog-display/v2/catalog",
      "/api/research/catalog-display/v2/price-list",
    ]) {
      for (const method of ["post", "put", "patch", "delete"] as const) {
        const response = await request(app)[method](route);
        expect(response.status).toBe(404);
      }
    }
  });

  it("mounting grants reachability and no commerce whatsoever", async () => {
    const response = await request(mounted()).get(
      "/api/research/catalog-display/v2/products/research_vials/research-vials-bpc-157",
    );
    expect(response.status).toBe(200);
    // A fully mounted catalog still sells nothing until Product Control binds
    // an exact variant. Mounting is reachability, not authority.
    expect(response.text).not.toContain("add_to_cart");
    expect(response.text).not.toContain("Add to Cart");
    expect(response.body.product.variants[0].price.state).toBe("on_request");
  });

  it("stays fail closed behind the display flag even once mounted", async () => {
    const response = await request(
      mounted({ [MASTER_OFFERINGS_ENABLED_ENV_VAR]: undefined }),
    ).get("/api/research/catalog-display/v2/catalog");
    expect(response.status).toBe(503);
    expect(response.body.code).toBe("master_offerings_disabled");
  });

  it("keeps the error handler scoped to its own path", async () => {
    const app = express();
    mountMasterOfferingCatalog(app, {
      authorizeViewer: () => ({ audience: "member" as const, email: FOUNDER }),
      serviceForViewer: service,
      env: {
        [MASTER_OFFERINGS_ENABLED_ENV_VAR]: "true",
        [FULL_CATALOG_VISIBILITY_ENV_VAR]: FOUNDER,
      },
    });
    app.get("/api/other/thing", () => {
      throw new Error("someone else's failure");
    });
    // A global error handler here would have swallowed this and answered 503.
    const response = await request(app).get("/api/other/thing");
    expect(response.status).toBe(500);
    expect(response.body.code).toBeUndefined();
  });
});
