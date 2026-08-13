import fs from "node:fs";
import path from "node:path";
import express, { type Express } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { FULL_CATALOG_VISIBILITY_ENV_VAR } from "../catalog-display/visibility";
import { noMasterOfferingCommerce } from "./customer-projection";
import {
  MASTER_OFFERING_CATALOG_ERROR_BASE_PATH,
  MASTER_OFFERING_CATALOG_ROUTES,
  masterOfferingCatalogErrorHandler,
  masterOfferingCatalogRouteTable,
} from "./mount";
import type { MasterOfferingCatalogApiDependencies } from "./routes";
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

function dependencies(
  env: Record<string, string | undefined> = {},
): MasterOfferingCatalogApiDependencies {
  return {
    authorizeViewer: () => ({ audience: "member" as const, email: FOUNDER }),
    serviceForViewer: service,
    now: () => "2026-08-13T00:00:00.000Z",
    env: {
      [MASTER_OFFERINGS_ENABLED_ENV_VAR]: "true",
      [MASTER_OFFERINGS_FOUNDER_ADMIN_ONLY_ENV_VAR]: "true",
      [FULL_CATALOG_VISIBILITY_ENV_VAR]: FOUNDER,
      ...env,
    },
  };
}

/** Exactly what the composition root is being asked to write. */
function mounted(env: Record<string, string | undefined> = {}): Express {
  const app = express();
  const deps = dependencies(env);
  for (const route of masterOfferingCatalogRouteTable(deps)) {
    app[route.method](route.path, ...route.handlers);
  }
  app.use(
    MASTER_OFFERING_CATALOG_ERROR_BASE_PATH,
    masterOfferingCatalogErrorHandler(deps),
  );
  return app;
}

describe("the route table", () => {
  it("describes exactly three GET routes and their OPTIONS", () => {
    const table = masterOfferingCatalogRouteTable(dependencies());
    expect(table.filter((route) => route.method === "get").map((r) => r.path)).toEqual([
      "/api/research/catalog-display/v2/catalog",
      "/api/research/catalog-display/v2/products/:family/:slug",
      "/api/research/catalog-display/v2/price-list",
    ]);
    expect(
      table.filter((route) => route.method === "options").map((r) => r.path),
    ).toEqual([...MASTER_OFFERING_CATALOG_ROUTES]);
    for (const route of table) {
      expect(route.handlers.length).toBe(2);
    }
  });

  it("registers no Express route of its own", () => {
    // The repository pins the number of static Express registration call sites
    // in server/release-control-plane.test.ts. A prepared lane that wrote
    // app.get here would move that pinned count while still being unmounted,
    // and the pin belongs to another lane. So this file describes; the
    // composition root registers, and the census moves when the catalog really
    // becomes reachable.
    // Comments are stripped first: the file documents the two lines the
    // composition root should write, and scanning raw text would fail on the
    // very example that explains the rule.
    const source = fs
      .readFileSync(
        path.join(process.cwd(), "server", "research", "master-offerings", "mount.ts"),
        "utf8",
      )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    for (const call of [
      "app.get(",
      "app.post(",
      "app.options(",
      "app.use(",
      "router.get(",
      "router.use(",
    ]) {
      expect(source).not.toContain(call);
    }
  });

  it("serves all three routes with the private headers in place", async () => {
    const app = mounted();
    const responses = await Promise.all([
      request(app).get("/api/research/catalog-display/v2/catalog"),
      request(app).get(
        "/api/research/catalog-display/v2/products/research_vials/research-vials-bpc-157",
      ),
      request(app).get("/api/research/catalog-display/v2/price-list?format=json"),
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
        expect((await request(app)[method](route)).status).toBe(404);
      }
    }
  });

  it("mounting grants reachability and no commerce whatsoever", async () => {
    const response = await request(mounted()).get(
      "/api/research/catalog-display/v2/products/research_vials/research-vials-bpc-157",
    );
    expect(response.status).toBe(200);
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
    const app = mounted();
    app.get("/api/other/thing", () => {
      throw new Error("someone else's failure");
    });
    const response = await request(app).get("/api/other/thing");
    expect(response.status).toBe(500);
    expect(response.body.code).toBeUndefined();
  });
});
