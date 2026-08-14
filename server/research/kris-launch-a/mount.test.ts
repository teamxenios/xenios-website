import fs from "node:fs";
import path from "node:path";
import express, { type Express } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  KRIS_PARTNER_MEMBER_ID_ENV_VAR,
  KRIS_PARTNER_FOUNDER_CONFIRMED_EMAIL,
} from "./entitlement";
import {
  InMemoryKrisCatalogSource,
  KrisDatasetUnavailable,
  type KrisCatalogSource,
} from "./dataset-reader";
import {
  KRIS_CATALOG_DETAIL_ROUTE,
  KRIS_CATALOG_LIST_ROUTE,
  type KrisCatalogApiDependencies,
  type KrisCatalogViewer,
} from "./routes";
import {
  KRIS_CATALOG_ERROR_BASE_PATH,
  KRIS_CATALOG_ROUTES,
  krisCatalogErrorHandler,
  krisCatalogRouteTable,
} from "./mount";
import { KrisCatalogService } from "./service";
import { KRIS_LAUNCH_A_ENABLED_ENV_VAR } from "./visibility-policy";
import { krisProduct, pricedAt } from "./test-fixtures";

const KRIS_MEMBER_ID = "11111111-2222-3333-4444-555555555555";
const LIST = KRIS_CATALOG_LIST_ROUTE;
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
  family: "shipping_and_fulfillment",
  channel: "clinical_provider_only",
  suppliedNote: "Price pending.",
});
const DETAIL = `/api/research/kris-launch-a/v1/products/${PRICED.slug}`;

function source(): KrisCatalogSource {
  return new InMemoryKrisCatalogSource(
    [PRICED, PENDING],
    new Map([["kli_priced", pricedAt(4500)]]),
  );
}

function dependencies(input: {
  viewer?: KrisCatalogViewer | null;
  env?: Record<string, string | undefined>;
  catalog?: KrisCatalogSource;
} = {}): KrisCatalogApiDependencies {
  const viewer =
    input.viewer === undefined
      ? {
          audience: "member" as const,
          email: KRIS_PARTNER_FOUNDER_CONFIRMED_EMAIL,
          memberId: null,
        }
      : input.viewer;
  return {
    authorizeViewer: () => viewer,
    serviceForProfile: (profile) =>
      new KrisCatalogService(input.catalog ?? source(), profile),
    env: {
      [KRIS_LAUNCH_A_ENABLED_ENV_VAR]: "true",
      ...input.env,
    },
  };
}

/** Exactly the two lines the composition root is being asked to write. */
function mounted(input: Parameters<typeof dependencies>[0] = {}): Express {
  const app = express();
  const deps = dependencies(input);
  for (const route of krisCatalogRouteTable(deps)) {
    app[route.method](route.path, ...route.handlers);
  }
  app.use(KRIS_CATALOG_ERROR_BASE_PATH, krisCatalogErrorHandler(deps));
  return app;
}

describe("the route table", () => {
  it("describes exactly two GET routes and their OPTIONS", () => {
    const table = krisCatalogRouteTable(dependencies());
    expect(table.filter((route) => route.method === "get").map((r) => r.path)).toEqual([
      "/api/research/kris-launch-a/v1/catalog",
      "/api/research/kris-launch-a/v1/products/:slug",
    ]);
    expect(table.filter((route) => route.method === "options").map((r) => r.path)).toEqual([
      ...KRIS_CATALOG_ROUTES,
    ]);
    for (const route of table) expect(route.handlers).toHaveLength(2);
    // Four call sites is the whole census delta this lane can cause.
    expect(table).toHaveLength(4);
  });

  it("registers no Express route of its own", () => {
    // server/release-control-plane.test.ts pins the number of static Express
    // registration call sites, and that pin belongs to another lane. A prepared
    // lane that wrote app.get here would move it while still being unmounted.
    // Comments are stripped first: this file documents the two lines the
    // composition root should write, and a raw scan would fail on the very
    // example that explains the rule.
    const source = fs
      .readFileSync(
        path.join(process.cwd(), "server", "research", "kris-launch-a", "mount.ts"),
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

  it("refuses to build handlers without its dependencies", () => {
    expect(() => krisCatalogRouteTable(undefined as never)).toThrow(/dependencies required/);
    expect(() =>
      krisCatalogRouteTable({ authorizeViewer: () => null } as never),
    ).toThrow(/dependencies required/);
  });
});

describe("what the doors serve", () => {
  it("serves both GET routes with the private headers in place", async () => {
    for (const url of [LIST, DETAIL]) {
      const response = await request(mounted()).get(url);
      expect(response.status).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.headers["x-robots-tag"]).toBe("noindex, nofollow");
      expect(response.headers["referrer-policy"]).toBe("no-referrer");
    }
  });

  it("answers OPTIONS with GET, HEAD, OPTIONS and nothing else", async () => {
    for (const url of [LIST, DETAIL.replace(PRICED.slug, "anything")]) {
      const response = await request(mounted()).options(url);
      expect(response.status).toBe(204);
      expect(response.headers["allow"]).toBe("GET, HEAD, OPTIONS");
    }
  });

  it("refuses every write method on every route", async () => {
    const app = mounted();
    for (const url of [LIST, DETAIL]) {
      for (const method of ["post", "put", "patch", "delete"] as const) {
        expect((await request(app)[method](url)).status).toBe(404);
      }
    }
  });

  it("pages server side and echoes the profile it priced with", async () => {
    const response = await request(mounted()).get(`${LIST}?pageSize=1&page=2`);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.total).toBe(2);
    expect(response.body.totalPages).toBe(2);
    expect(response.body.profile).toBe("KRIS_VOLUME_PARTNER");
  });

  it("carries the access policy and the disclosures on a detail view", async () => {
    const response = await request(mounted()).get(DETAIL);
    expect(response.body.product.access.purchasable).toBe(false);
    expect(response.body.product.disclosures.length).toBeGreaterThan(0);
    expect(response.body.product.price.display).toBe("$45.00");
  });
});

describe("the flag", () => {
  it("is fail closed: off, misspelled and near misses all mean off", async () => {
    for (const value of [undefined, "TRUE", "1", "yes"]) {
      const response = await request(
        mounted({ env: { [KRIS_LAUNCH_A_ENABLED_ENV_VAR]: value } }),
      ).get(LIST);
      expect(response.status).toBe(503);
      expect(response.body.code).toBe("kris_catalog_disabled");
    }
  });

  it("closes OPTIONS too, so the surface does not advertise itself when off", async () => {
    const response = await request(
      mounted({ env: { [KRIS_LAUNCH_A_ENABLED_ENV_VAR]: undefined } }),
    ).options(LIST);
    expect(response.status).toBe(503);
  });
});

describe("identity and entitlement", () => {
  it("refuses an unidentified caller with 401 before anything else happens", async () => {
    const response = await request(mounted({ viewer: null })).get(LIST);
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ ok: false, code: "kris_catalog_auth_required" });
  });

  it("refuses a viewer with no email, whatever audience it claims", async () => {
    const response = await request(
      mounted({ viewer: { audience: "admin", email: "  ", memberId: null } }),
    ).get(LIST);
    expect(response.status).toBe(401);
  });

  it("entitles the founder-confirmed address before the account exists", async () => {
    const response = await request(mounted()).get(LIST);
    expect(response.status).toBe(200);
    expect(response.body.profile).toBe("KRIS_VOLUME_PARTNER");
  });

  it("entitles the canonical member id once it is configured", async () => {
    const response = await request(
      mounted({
        viewer: {
          audience: "member",
          email: "kris.new.address@example.com",
          memberId: KRIS_MEMBER_ID,
        },
        env: { [KRIS_PARTNER_MEMBER_ID_ENV_VAR]: KRIS_MEMBER_ID },
      }),
    ).get(LIST);
    expect(response.status).toBe(200);
  });

  it("refuses a member id mismatch and does not fall back to the address", async () => {
    const response = await request(
      mounted({
        viewer: {
          audience: "member",
          email: KRIS_PARTNER_FOUNDER_CONFIRMED_EMAIL,
          memberId: "99999999-9999-9999-9999-999999999999",
        },
        env: { [KRIS_PARTNER_MEMBER_ID_ENV_VAR]: KRIS_MEMBER_ID },
      }),
    ).get(LIST);
    expect(response.status).toBe(403);
    expect(response.body.code).toBe("kris_catalog_forbidden");
  });

  it("refuses an unrelated member, and an operator who is not the partner", async () => {
    for (const viewer of [
      { audience: "member" as const, email: "someone.else@example.com", memberId: "m_1" },
      { audience: "admin" as const, email: "ops@xeniostechnology.com", memberId: "m_2" },
    ]) {
      const response = await request(mounted({ viewer })).get(LIST);
      // Entitlement is the ONLY grant here. Being an operator does not make
      // anyone the audience for a confidential partner price sheet.
      expect(response.status).toBe(403);
    }
  });

  it("exposes no product data and no price at all in a refusal", async () => {
    const forbidden = await request(
      mounted({
        viewer: { audience: "member", email: "someone.else@example.com", memberId: null },
      }),
    );
    for (const url of [LIST, DETAIL]) {
      const response = await forbidden.get(url);
      expect(response.status).toBe(403);
      expect(response.body).toEqual({ ok: false, code: "kris_catalog_forbidden" });
      for (const leak of [
        "kli_",
        "Priced Item",
        "Syringes",
        "$",
        "amountCents",
        "KRIS_VOLUME_PARTNER",
        "research_capsules",
        "items",
        "total",
      ]) {
        expect(response.text).not.toContain(leak);
      }
    }
  });

  it("refuses before the dataset is touched at all", async () => {
    let reads = 0;
    const counting: KrisCatalogSource = {
      products: () => {
        reads += 1;
        return [];
      },
      findBySlug: () => {
        reads += 1;
        return null;
      },
      findById: () => null,
      priceFor: () => ({ state: "pending", display: "Price pending" }),
      hasProfile: () => true,
    };
    await request(
      mounted({
        viewer: { audience: "member", email: "nobody@example.com", memberId: null },
        catalog: counting,
      }),
    ).get(LIST);
    expect(reads).toBe(0);
  });
});

describe("the query is a closed vocabulary", () => {
  it("refuses an unrecognized key rather than ignoring it", async () => {
    for (const query of ["profile=CONSUMER", "limit=1000", "audience=admin", "sort2=x"]) {
      const response = await request(mounted()).get(`${LIST}?${query}`);
      expect(response.status).toBe(400);
      expect(response.body.code).toBe("kris_catalog_invalid_request");
    }
  });

  it("refuses a page size above the ceiling rather than silently clamping", async () => {
    expect((await request(mounted()).get(`${LIST}?pageSize=101`)).status).toBe(400);
    expect((await request(mounted()).get(`${LIST}?pageSize=100`)).status).toBe(200);
  });

  it("refuses a value outside a closed vocabulary", async () => {
    for (const query of [
      "families=wellness",
      "channels=direct_to_consumer",
      "sort=cheapest",
      "page=0",
      "page=-1",
      "pageSize=abc",
    ]) {
      expect((await request(mounted()).get(`${LIST}?${query}`)).status).toBe(400);
    }
  });

  it("accepts the vocabulary it does publish", async () => {
    const response = await request(mounted()).get(
      `${LIST}?q=priced&families=research_peptides_and_materials&channels=ruo_research&sort=price_asc&page=1&pageSize=10`,
    );
    expect(response.status).toBe(200);
    expect(response.body.sort).toBe("price_asc");
  });
});

describe("the detail door", () => {
  it("404s an unknown slug and 400s a malformed one", async () => {
    const app = mounted();
    const unknown = await request(app).get(
      KRIS_CATALOG_DETAIL_ROUTE.replace(":slug", "no-such-item"),
    );
    expect(unknown.status).toBe(404);
    expect(unknown.body).toEqual({ ok: false, code: "kris_catalog_not_found" });
    for (const slug of ["UPPERCASE", "-leading-dash", "has_underscore"]) {
      const response = await request(app).get(
        `/api/research/kris-launch-a/v1/products/${slug}`,
      );
      expect(response.status).toBe(400);
    }
  });

  it("takes no query at all", async () => {
    expect((await request(mounted()).get(`${DETAIL}?q=anything`)).status).toBe(400);
  });
});

describe("failures answer honestly", () => {
  it("turns an unreadable dataset into 503, never an empty catalog", async () => {
    const broken: KrisCatalogSource = {
      products: () => {
        throw new KrisDatasetUnavailable("dataset file is not readable");
      },
      findBySlug: () => {
        throw new KrisDatasetUnavailable("dataset file is not readable");
      },
      findById: () => null,
      priceFor: () => ({ state: "pending", display: "Price pending" }),
      hasProfile: () => true,
    };
    for (const url of [LIST, DETAIL]) {
      const response = await request(mounted({ catalog: broken })).get(url);
      expect(response.status).toBe(503);
      expect(response.body).toEqual({ ok: false, code: "kris_catalog_unavailable" });
      expect(response.text).not.toContain("not readable");
    }
  });

  it("keeps its error handler scoped to its own path", async () => {
    const app = mounted();
    app.get("/api/other/thing", () => {
      throw new Error("someone else's failure");
    });
    const response = await request(app).get("/api/other/thing");
    expect(response.status).toBe(500);
    expect(response.body.code).toBeUndefined();
  });
});

describe("only direct_eligible sells", () => {
  it("marks a row purchasable only when its mode says so", async () => {
    // This assertion used to read "emits no purchase action on any response",
    // which was correct while Launch A was browse-only and is now the wrong
    // requirement. It is rewritten rather than deleted: the per-mode rule is
    // what stands between a clinical row and a purchase control, so the file
    // must keep asserting something here.
    const app = mounted();
    for (const url of [LIST, `${LIST}?pageSize=100`]) {
      const response = await request(app).get(url);
      expect(response.status).toBe(200);
      for (const item of response.body.items ?? []) {
        expect(item.purchaseMode).toBeDefined();
        // canAddToCart is true for exactly one mode and never disagrees with it.
        expect(item.canAddToCart).toBe(item.purchaseMode === "direct_eligible");
        if (item.purchaseMode !== "direct_eligible") {
          expect(item.canAddToCart).toBe(false);
        }
        // A purchasable row always carries a real price. The $0 guard.
        if (item.canAddToCart) expect(item.price.state).toBe("priced");
      }
    }
  });

  it("never marks a clinical or pending row purchasable", async () => {
    const response = await request(mounted()).get(`${LIST}?pageSize=100`);
    for (const item of response.body.items ?? []) {
      if (
        item.channel === "clinical_provider_only" ||
        item.channel === "classification_pending" ||
        item.price.state !== "priced"
      ) {
        expect(item.canAddToCart, `${item.slug} became purchasable`).toBe(false);
      }
    }
  });

  it("says purchasable false on every item it serves", async () => {
    const response = await request(mounted()).get(`${LIST}?pageSize=100`);
    expect(response.body.items.length).toBeGreaterThan(0);
    for (const item of response.body.items) {
      expect(item.access.purchasable).toBe(false);
    }
  });
});
