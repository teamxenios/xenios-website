// B7. The legacy /api/research/catalog lane serves prices from the hardcoded
// products-data array, NOT from Product Control.
//
// That is why the strength-dispute machinery cannot see it. There is no price
// row, so research_product_prices_strength_gate never fires. There is no
// variant row, so research_product_variants_strength_gate never fires.
// findVariantStrengthDispute is never called and the founder-locked registry is
// irrelevant. Migration 47 does not and cannot cover this lane.
//
// Three entries in that array carry a strength the signed supplier master
// contradicts, and client/src/research/components.tsx renders
// formatMoney(product.priceCents) unconditionally, so an active member was
// shown a firm price for a contested unit while the lane could not transact.
//
// These tests pin the containment: while research commerce is off, the catalog
// withholds the amount. They are deliberately behavioural over the real route,
// not assertions over the source text, because a source-text assertion cannot
// tell whether the value actually leaves the server.
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function allowMember(_req: unknown, _res: unknown, next: () => void) {
  next();
}

vi.mock("./member-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./member-auth")>();
  return { ...actual, requireActiveMember: allowMember, requireMember: allowMember };
});

import { registerResearchApi } from "./index";
import { registerMemberAccessApi } from "./guards";

const KEYS = [
  "RESEARCH_PUBLIC",
  "RESEARCH_ACCESS_PASSWORD",
  "RESEARCH_SESSION_SECRET",
  "NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED",
] as const;
const saved: Partial<Record<(typeof KEYS)[number], string>> = {};

function build() {
  const app = express();
  app.use(express.json());
  registerResearchApi(app);
  return app;
}

// The member-contract alias is a SECOND door onto the same array, mounted at
// server/index.ts:191. The first version of this containment corrected only
// /api/research/catalog, and an executed probe then showed this path still
// returning all three contested amounts while commerce.research was false.
// Every assertion below therefore runs against BOTH doors.
function buildMemberAlias() {
  const app = express();
  app.use(express.json());
  registerMemberAccessApi(app);
  return app;
}

const DOORS: ReadonlyArray<{ name: string; path: string; app: () => express.Express }> = [
  { name: "GET /api/research/catalog", path: "/api/research/catalog", app: build },
  {
    name: "GET /api/research/member/catalog",
    path: "/api/research/member/catalog",
    app: buildMemberAlias,
  },
];

beforeEach(() => {
  for (const key of KEYS) {
    const value = process.env[key];
    if (value === undefined) delete saved[key];
    else saved[key] = value;
    delete process.env[key];
  }
  process.env.RESEARCH_PUBLIC = "true";
  process.env.RESEARCH_SESSION_SECRET = "test-secret-for-catalog-containment";
});

afterEach(() => {
  for (const key of KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("B7: the legacy catalog withholds money while the lane cannot transact", () => {
  it("returns NO price for any product when research commerce is off", async () => {
    delete process.env.NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED;
    const response = await request(build()).get("/api/research/catalog");

    expect(response.status).toBe(200);
    expect(response.body.commerce.research).toBe(false);
    expect(Array.isArray(response.body.products)).toBe(true);
    expect(response.body.products.length).toBeGreaterThan(0);

    for (const product of response.body.products) {
      expect(product.priceCents).toBeNull();
    }
  });

  it("never emits 0, which the cart would render as FREE", async () => {
    // CartPage.tsx computes `priceCents || 0`, so a zero is indistinguishable
    // from free. null is the only honest withheld value, and formatMoney(null)
    // already renders "Pricing available after review".
    delete process.env.NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED;
    const response = await request(build()).get("/api/research/catalog");
    for (const product of response.body.products) {
      expect(product.priceCents).not.toBe(0);
    }
  });

  it("withholds the price on the three contested units specifically", async () => {
    // These are the units whose strength the signed supplier master contradicts.
    // Named so a future change that reintroduces their amounts fails loudly here
    // rather than silently on a member's screen.
    delete process.env.NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED;
    const response = await request(build()).get("/api/research/catalog");
    const contested = ["tesamorelin", "nad-plus", "ss-31"];

    for (const fragment of contested) {
      const hits = response.body.products.filter((product: { slug?: string }) =>
        (product.slug ?? "").includes(fragment),
      );
      for (const hit of hits) {
        expect(hit.priceCents).toBeNull();
      }
    }
  });

  it("still returns the products themselves, so the catalog is not emptied", async () => {
    // Containment must not become deletion. The member should still see what
    // exists; only the amount is withheld.
    delete process.env.NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED;
    const response = await request(build()).get("/api/research/catalog");
    const first = response.body.products[0];
    expect(typeof first.slug).toBe("string");
    expect(first.slug.length).toBeGreaterThan(0);
  });

  it("NEGATIVE CONTROL: with commerce ON the amounts are served unchanged", async () => {
    // Without this the suite would pass against a route that always returns
    // null, which would be a different defect wearing the same green tick.
    process.env.NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED = "true";
    const response = await request(build()).get("/api/research/catalog");

    expect(response.body.commerce.research).toBe(true);
    const priced = response.body.products.filter(
      (product: { priceCents: number | null }) => typeof product.priceCents === "number",
    );
    expect(priced.length).toBeGreaterThan(0);
  });
});

describe.each(DOORS)("B7: $name withholds money identically", (door) => {
  it("withholds every price when research commerce is off", async () => {
    delete process.env.NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED;
    const response = await request(door.app()).get(door.path);

    expect(response.status).toBe(200);
    expect(response.body.commerce.research).toBe(false);
    expect(response.body.products.length).toBeGreaterThan(0);
    for (const product of response.body.products) {
      expect(product.priceCents).toBeNull();
      expect(product.priceCents).not.toBe(0);
    }
  });

  it("withholds the three contested units by name", async () => {
    delete process.env.NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED;
    const response = await request(door.app()).get(door.path);
    const contested = ["tesamorelin", "nad-plus", "ss-31"];

    const seen: string[] = [];
    for (const product of response.body.products) {
      const slug: string = product.slug ?? "";
      if (contested.some((fragment) => slug.includes(fragment))) {
        seen.push(slug);
        expect(product.priceCents).toBeNull();
      }
    }
    // Anti-vacuity: if the slugs ever change, this must fail loudly rather than
    // pass by matching nothing.
    expect(seen.length).toBe(3);
  });

  it("NEGATIVE CONTROL: with commerce ON this door serves amounts unchanged", async () => {
    process.env.NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED = "true";
    const response = await request(door.app()).get(door.path);

    expect(response.body.commerce.research).toBe(true);
    const priced = response.body.products.filter(
      (product: { priceCents: number | null }) => typeof product.priceCents === "number",
    );
    expect(priced.length).toBeGreaterThan(0);
  });
});
