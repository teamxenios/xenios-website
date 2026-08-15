import fs from "node:fs";
import path from "node:path";
import express, { type Express } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { FULL_CATALOG_VISIBILITY_ENV_VAR } from "../catalog-display/visibility";
import { noMasterOfferingCommerce } from "./customer-projection";
import type { NormalizedMasterOffering } from "./model";
import {
  MASTER_OFFERING_CATALOG_BASE_PATH,
  MASTER_OFFERING_CATALOG_DETAIL_ROUTE,
  MASTER_OFFERING_CATALOG_LIST_ROUTE,
  MASTER_OFFERING_CATALOG_PRICE_LIST_ROUTE,
  createMasterOfferingCatalogApiHandlers,
  type MasterOfferingCatalogApiDependencies,
} from "./routes";
import {
  InMemoryMasterOfferingCatalogReader,
  MasterOfferingCatalogService,
} from "./service";
import { cartSelection, offering, variant } from "./test-fixtures";
import {
  MASTER_OFFERINGS_ENABLED_ENV_VAR,
  MASTER_OFFERINGS_FOUNDER_ADMIN_ONLY_ENV_VAR,
} from "./visibility-policy";

const FOUNDER = "founder@example.com";

/**
 * A catalog whose private fields are all populated, so a privacy scan over a
 * real HTTP response is meaningful. An empty source reference would let a leak
 * pass unnoticed.
 */
const PRIVATE_MARKERS = [
  "Private supplier",
  "PLAN-0001",
  "Planning expansion benchmark",
  "research_vials|bpc 157",
];

function loadedCatalog(): readonly NormalizedMasterOffering[] {
  const sourceReferences = [
    {
      sheetRow: 4242,
      sourceGroup: "Planning expansion benchmark",
      sourceSku: "PLAN-0001",
      planningPricePresent: true,
      updatedWholesaleCostPresent: true,
    },
  ];
  return [
    offering({
      canonicalKey: "research_vials|bpc 157",
      sourceReferences,
      variants: [
        variant({ id: "mov_a", label: "5 mg vial", sourceReferences }),
        variant({ id: "mov_b", label: "10 mg vial", sourceReferences }),
      ],
    }),
    offering({
      id: "mo_hold",
      slug: "regulatory-hold-offering",
      displayName: "Held offering",
      canonicalKey: "research_vials|held",
      visibility: "admin_only",
      sourceReferences,
      variants: [variant({ id: "mov_hold", visibility: "admin_only" })],
    }),
  ];
}

function service(): MasterOfferingCatalogService {
  return new MasterOfferingCatalogService(
    new InMemoryMasterOfferingCatalogReader(loadedCatalog()),
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
    now: () => "2026-08-12T15:04:05.000Z",
    env: {
      [MASTER_OFFERINGS_ENABLED_ENV_VAR]: "true",
      [MASTER_OFFERINGS_FOUNDER_ADMIN_ONLY_ENV_VAR]: "true",
      [FULL_CATALOG_VISIBILITY_ENV_VAR]: FOUNDER,
      ...env,
    },
  });
  for (const route of [
    MASTER_OFFERING_CATALOG_LIST_ROUTE,
    MASTER_OFFERING_CATALOG_PRICE_LIST_ROUTE,
  ]) {
    application.get(
      route,
      handlers.privateHeaders,
      route === MASTER_OFFERING_CATALOG_LIST_ROUTE
        ? handlers.list
        : handlers.priceList,
    );
  }
  application.get(
    MASTER_OFFERING_CATALOG_DETAIL_ROUTE,
    handlers.privateHeaders,
    handlers.detail,
  );
  application.use(MASTER_OFFERING_CATALOG_BASE_PATH, handlers.error);
  return application;
}

const DETAIL_PATH =
  "/api/research/catalog-display/v2/products/research_vials/research-vials-bpc-157";

describe("adversarial: the detail route is not an enumeration oracle", () => {
  it("answers identically for missing, held, and wrong-family identities", async () => {
    const paths = [
      // Does not exist at all.
      "/api/research/catalog-display/v2/products/research_vials/no-such-product",
      // Exists, but is an admin-only regulatory hold.
      "/api/research/catalog-display/v2/products/research_vials/regulatory-hold-offering",
      // Exists and is member safe, but asked for under the wrong family.
      "/api/research/catalog-display/v2/products/supplements/research-vials-bpc-157",
      // Exists as an admin-only hold, asked for under the wrong family.
      "/api/research/catalog-display/v2/products/supplements/regulatory-hold-offering",
    ];
    const responses = await Promise.all(
      paths.map((route) => request(app()).get(route)),
    );
    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        ok: false,
        code: "master_offerings_not_found",
      });
    }
    const bodies = new Set(responses.map((r) => JSON.stringify(r.body)));
    expect(bodies.size).toBe(1);
  });

  it("refuses a restricted viewer before any existence signal", async () => {
    const outsider = app({
      authorizeViewer: () => ({
        audience: "member" as const,
        email: "outsider@example.com",
      }),
    });
    const real = await request(outsider).get(DETAIL_PATH);
    const fake = await request(outsider).get(
      "/api/research/catalog-display/v2/products/research_vials/no-such-product",
    );
    expect(real.status).toBe(403);
    expect(fake.status).toBe(403);
    expect(real.body).toEqual(fake.body);
  });

  it("rejects a traversal or wildcard slug as invalid, not as not found", async () => {
    for (const slug of ["..%2f..%2fetc", "*", "A-Z", "a".repeat(200)]) {
      const response = await request(app()).get(
        `/api/research/catalog-display/v2/products/research_vials/${slug}`,
      );
      expect([400, 404]).toContain(response.status);
      expect(response.body.ok).toBe(false);
      expect(JSON.stringify(response.body)).not.toContain("etc");
    }
  });
});

describe("adversarial: no private field crosses the HTTP boundary", () => {
  it("keeps supplier, source, and canonical identity out of list, detail, and export", async () => {
    const application = app();
    const responses = await Promise.all([
      request(application).get(MASTER_OFFERING_CATALOG_LIST_ROUTE),
      request(application).get(DETAIL_PATH),
      request(application).get(
        `${MASTER_OFFERING_CATALOG_PRICE_LIST_ROUTE}?format=json`,
      ),
      request(application).get(MASTER_OFFERING_CATALOG_PRICE_LIST_ROUTE),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(200);
      const payload = response.text || JSON.stringify(response.body);
      for (const marker of PRIVATE_MARKERS) {
        expect(payload).not.toContain(marker);
      }
      // Scanned in JSON key form. The bare words would false-positive on the
      // disclosure copy, which legitimately says "Catalog visibility does not
      // establish availability".
      for (const key of [
        "canonicalKey",
        "sourceReferences",
        "sheetRow",
        "sourceSku",
        "sourceGroup",
        "planningPricePresent",
        "updatedWholesaleCostPresent",
        "visibility",
        "binding",
        "offeringVariantId",
        "purchasable",
      ]) {
        expect(payload).not.toContain(`"${key}":`);
        expect(payload).not.toContain(`${key},`);
      }
    }
  });

  it("emits Product Control identity only inside a resolved add_to_cart", async () => {
    const purchasable = new MasterOfferingCatalogService(
      new InMemoryMasterOfferingCatalogReader(loadedCatalog()),
      (_offering, entry) =>
        entry.id === "mov_a"
          ? {
              binding: {
                offeringVariantId: "mov_a",
                productId: "pc_product_1",
                variantId: "pc_variant_1",
              },
              selection: cartSelection(),
            }
          : { binding: null, selection: null },
    );
    const application = app({ serviceForViewer: () => purchasable });

    const detail = await request(application).get(DETAIL_PATH);
    const [purchasableVariant, planningVariant] = detail.body.product.variants;
    expect(purchasableVariant.action.kind).toBe("add_to_cart");
    expect(purchasableVariant.action.productId).toBe("pc_product_1");
    expect(planningVariant.action).not.toHaveProperty("productId");
    expect(detail.text).not.toContain("offeringVariantId");

    // The list is action free, so no Product Control identity appears there at
    // all, even for a fully purchasable variant.
    const list = await request(application).get(
      MASTER_OFFERING_CATALOG_LIST_ROUTE,
    );
    expect(list.text).not.toContain("pc_product_1");
    expect(list.text).not.toContain("Add to Cart");
  });

  it("keeps the private headers on an error as well as on a success", async () => {
    const responses = await Promise.all([
      request(app()).get(MASTER_OFFERING_CATALOG_LIST_ROUTE),
      request(app()).get(
        "/api/research/catalog-display/v2/products/research_vials/no-such-product",
      ),
      request(app({}, { [MASTER_OFFERINGS_ENABLED_ENV_VAR]: "false" })).get(
        MASTER_OFFERING_CATALOG_LIST_ROUTE,
      ),
    ]);
    for (const response of responses) {
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.headers["x-robots-tag"]).toBe("noindex, nofollow");
      expect(response.headers["referrer-policy"]).toBe("no-referrer");
    }
  });
});

describe("adversarial: query hardening", () => {
  it("refuses repeated, array, and prototype-shaped query keys", async () => {
    const hostile = [
      "?q=a&q=b",
      "?page[]=1",
      "?__proto__[admin]=true",
      "?constructor[prototype][x]=1",
      "?pageSize=0",
      "?page=-1",
      "?page=1e3",
      `?q=${"a".repeat(161)}`,
      "?states=available_now&states=purchasable",
    ];
    for (const suffix of hostile) {
      const response = await request(app()).get(
        `${MASTER_OFFERING_CATALOG_LIST_ROUTE}${suffix}`,
      );
      expect(response.status).toBe(400);
      expect(response.body.code).toBe("master_offerings_invalid_request");
    }
  });

  it("accepts the closed vocabulary in repeated and comma form alike", async () => {
    const comma = await request(app()).get(
      `${MASTER_OFFERING_CATALOG_LIST_ROUTE}?families=research_vials,supplements`,
    );
    const repeated = await request(app()).get(
      `${MASTER_OFFERING_CATALOG_LIST_ROUTE}?families=research_vials&families=supplements`,
    );
    expect(comma.status).toBe(200);
    expect(repeated.status).toBe(200);
    expect(comma.body.catalog.total).toBe(repeated.body.catalog.total);
  });

  it("never lets a browser widen audience, breadth, or launch scope", async () => {
    const response = await request(app()).get(
      `${MASTER_OFFERING_CATALOG_LIST_ROUTE}?audience=admin&launchScope=all_members&visibility=admin_only`,
    );
    expect(response.status).toBe(400);
    const clean = await request(app()).get(MASTER_OFFERING_CATALOG_LIST_ROUTE);
    expect(clean.body.audience).toBe("member");
    expect(clean.body.launchScope).toBe("founder_admin");
  });
});

/**
 * One walk, cached for the file.
 *
 * Two independent walks over client, server and shared read several thousand
 * files twice, which took 32 seconds under full-suite parallel load and blew
 * the timeout. The scan is the same both times, so it is done once.
 */
let SOURCE_FILES: ReadonlyArray<{ rel: string; source: string }> | null = null;

function sourceFiles(): ReadonlyArray<{ rel: string; source: string }> {
  if (SOURCE_FILES !== null) return SOURCE_FILES;
  const collected: Array<{ rel: string; source: string }> = [];
  const walk = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "dist") continue;
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      collected.push({
        rel: path.relative(process.cwd(), full).split(path.sep).join("/"),
        source: fs.readFileSync(full, "utf8"),
      });
    }
  };
  for (const root of ["client/src", "server", "shared"]) {
    walk(path.join(process.cwd(), root));
  }
  SOURCE_FILES = collected;
  return collected;
}

describe("boundaries: the ingestion model stays on the server", () => {
    // The two boundary assertions above and below walk 1,378 files and about
    // 5.5 MB synchronously. Under vitest's default five second budget they
    // pass alone in roughly two seconds and time out under parallel load,
    // which three separate lanes hit independently. A boundary test that
    // times out reports a problem it never actually checked for, which is
    // worse than a red assertion because it looks like one. The budget is
    // raised so the scan finishes; not one expectation is relaxed.
  it("is not imported by any client file", () => {
    const files = sourceFiles().filter((file) => file.rel.startsWith("client/src/"));
    const offenders = files
      .filter(
        (file) =>
          /from\s+["'][^"']*master-offerings\/(model|normalize|reconciliation|service|routes|price-authority|price-list-export|dataset-reader|composition|mount)["']/.test(
            file.source,
          ) ||
          /from\s+["'][^"']*server\/research\/master-offerings/.test(file.source),
      )
      .map((file) => file.rel);
    // A scan that walked nothing would pass vacuously and quietly stop being a
    // boundary at all.
    expect(files.length).toBeGreaterThan(100);
    expect(offenders).toEqual([]);
  }, 60_000);

  it("is imported only by the composition root, which mounted it deliberately", () => {
    // This began as the tripwire that forced the mounting conversation: the
    // lane was imported by nothing, so it could not ship by accident. That
    // conversation happened. Phase 0 of the general platform build mounted
    // the route table in server/index.ts on founder direction, dark behind
    // RESEARCH_MASTER_OFFERINGS_ENABLED. The boundary survives with one
    // exact allowlist: the composition root may import the lane, and nothing
    // else may, so a second door still fails here by name.
    const lane =
      /master-offerings\/(FullCatalogPage|MasterOfferingCard|MasterOfferingCatalogControls|MasterOfferingDetail|MasterOfferingCatalogSurface|MasterOfferingDetailSurface|catalogApi|catalog-cart-handoff|integration-packet|routes|service|price-authority|price-list-export|dataset-reader|composition|mount)/;
    const owned = /(^|\/)master-offerings\//;
    const outside = sourceFiles().filter((file) => !owned.test(file.rel));
    const laneFiles = sourceFiles().length - outside.length;
    const offenders: string[] = [];
    for (const file of outside) {
      const statements =
        file.source.match(/^[ 	]*(?:import|export)[ 	].*$/gm) ?? [];
      for (const statement of statements) {
        if (lane.test(statement)) {
          offenders.push(`${file.rel}: ${statement.trim()}`);
        }
      }
    }
    // Prove the scan is live: it walked the repository and it recognized the
    // lane's own files rather than matching nothing at all.
    expect(outside.length).toBeGreaterThan(500);
    expect(laneFiles).toBeGreaterThanOrEqual(20);
    // The one permitted importer. Every offender must be the composition
    // root; any other file importing the lane is a second door and fails.
    const outsideAllowlist = offenders.filter(
      (offender) => !offender.startsWith("server/index.ts:"),
    );
    expect(outsideAllowlist).toEqual([]);
    // The scan's lane pattern names the shippable modules; the composition
    // root imports two of them (mount and composition), which proves the
    // allowlist is exercised rather than vacuously empty.
    expect(offenders.length).toBeGreaterThanOrEqual(2);
  }, 60_000);

  it("keeps the raw dataset out of the browser contract", () => {
    const raw = fs.readFileSync(
      path.join(
        process.cwd(),
        "shared",
        "research",
        "master-offerings",
        "contract.ts",
      ),
      "utf8",
    );
    // Comments are stripped first. The header comment names the private fields
    // in order to forbid them, and scanning raw text would fail on the very
    // documentation that states the rule.
    const declarations = raw
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    for (const forbidden of [
      "sourceReference",
      "canonicalKey",
      "wholesale",
      "margin",
      "supplier",
      "purchasable",
      "sheetRow",
    ]) {
      expect(declarations.toLowerCase()).not.toContain(
        forbidden.toLowerCase(),
      );
    }
  });
});
