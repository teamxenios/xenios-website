import { describe, expect, it } from "vitest";

import { ProductControlDeclaredFactsReader } from "../catalog/declared-facts-source";
import {
  ProductControlCatalogSource,
  resolveEarlyAccessSettlementCurrency,
} from "../catalog/product-control-source";
import { InMemorySupplierConfirmationStore } from "../ops/supplier-confirmation";
import {
  NO_RECORDED_LOTS_INVENTORY,
  canonicalReviewProducts,
} from "./first-release-canonical-source";
import { seedFounderFirstRelease } from "./founder-first-release-seed";
import { seedRawPeptidesConfirmations } from "./founder-supply-seed";
import { InMemoryEarlyAccessReleaseLedger } from "./founder-release";
import { createEarlyAccessCatalogRoute } from "./release-routes";

/**
 * THE OPENING SET, served by the MOUNTED ROUTE with production's own wiring.
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM opening-set.acceptance.test.ts
 *
 * That file asserts the accepted 22/18/4 by calling buildEarlyAccessStorefront
 * directly and handing it `founderHeldUnits` from the seed's return value. It
 * was green the entire time production was serving 21/18/3 with Cagrilintide
 * missing, because the fixture supplied the one input production never did.
 * A test that passes an argument the real caller cannot pass proves the
 * projection works, not that the deployment does.
 *
 * So this file drives `createEarlyAccessCatalogRoute` with dependencies shaped
 * exactly as the production composition root supplies them, and in particular
 * WITHOUT `founderHeldUnits`. Before the repair every assertion below failed:
 * 21 units, 3 held, no Cagrilintide.
 */

/** Held on a disputed strength. Migration 47's write gate holds these. */
const STRENGTH_DISPUTE_HELD = [
  { productId: "PEP-007", strength: "10 mg", name: "Tesamorelin" },
  { productId: "PEP-009", strength: "500 mg", name: "NAD+" },
  { productId: "PEP-010", strength: "10 mg", name: "MOTS-C" },
] as const;

/** Held because the founder has not commercially released it. */
const FOUNDER_HELD = { productId: "PEX-028", strength: "10 mg", name: "Cagrilintide" } as const;

const EXPECTED_VISIBLE = 22;
const EXPECTED_PURCHASABLE = 18;
const EXPECTED_HELD = 4;
const NAD_1000_PRICE_CENTS = 10_075;

type Unit = {
  productId: string;
  strength: string | null;
  availability: string;
  purchasable: boolean;
  priceCents: number | null;
  basis: unknown;
  hold: string | null;
  releaseId: string | null;
  productControlBlockers: readonly string[];
};

type Body = {
  ok: boolean;
  units: Unit[];
  purchasableCount: number;
  heldCount: number;
};

function response() {
  const state: { status: number | null; body: Body } = {
    status: null,
    body: { ok: false, units: [], purchasableCount: -1, heldCount: -1 },
  };
  const port = {
    status(code: number) {
      state.status = code;
      return port;
    },
    json(body: unknown) {
      state.body = body as Body;
      return body;
    },
    setHeader() {
      return port;
    },
  };
  return { port, state };
}

/**
 * The catalogue exactly as a signed-in customer receives it from the mounted
 * route, prepared the way production prepares it: confirm supply, re-project
 * against the confirmed world, release.
 *
 * The dependency object is deliberately the PRODUCTION shape. Read it as the
 * specification of what server/index.ts passes: a session resolver, the
 * catalog source, the release ledger and a clock. There is no
 * `founderHeldUnits` key, because the composition root has no projection at
 * boot to resolve one against and never supplied it.
 */
/** The customer the world is BUILT under: verified, so seeding sees real rows. */
const VERIFIED_CALLER = Object.freeze({
  customerRef: "cus_mounted_route",
  boundBy: "verified_link" as const,
});

type Caller = { readonly customerRef: string; readonly boundBy?: unknown } | null;

async function servedCatalogue(caller: Caller = VERIFIED_CALLER): Promise<Body> {
  const confirmations = new InMemorySupplierConfirmationStore();
  const source = new ProductControlCatalogSource({
    catalog: { readCatalog: async () => canonicalReviewProducts() },
    declaredFacts: new ProductControlDeclaredFactsReader({
      inventory: NO_RECORDED_LOTS_INVENTORY,
      currency: resolveEarlyAccessSettlementCurrency(),
      supplierConfirmations: confirmations,
    }),
  } as never);

  const at = new Date("2026-08-05T00:00:00.000Z");
  // The world is prepared under a VERIFIED customer, because that is who the
  // supply confirmations and founder releases were recorded for. The CALLER
  // below is a separate question: the same shelf, read by whoever is asking.
  const context = { earlyAccessCustomer: VERIFIED_CALLER };

  const before = await source.load(at, context);
  await seedRawPeptidesConfirmations({ rows: before.rows as never, store: confirmations });
  const ledger = new InMemoryEarlyAccessReleaseLedger();
  const confirmed = await source.load(at, context);
  await seedFounderFirstRelease({ rows: confirmed.rows as never, ledger });

  const route = createEarlyAccessCatalogRoute({
    resolveSession: async () => ({ authenticated: true, expiresAtEpochMs: at.getTime() + 60_000 }),
    catalog: source,
    ledger,
    now: () => at.getTime(),
  } as never);

  const { port, state } = response();
  await route({ cookieHeader: "ea=1", earlyAccessCustomer: caller }, port as never);
  expect(state.status).toBe(200);
  return state.body;
}

describe("the mounted catalogue route, wired the way production wires it", () => {
  it("serves 22 visible units, 18 purchasable and 4 held", async () => {
    // The exact regression. Without the derivation this was 21 / 18 / 3.
    const body = await servedCatalogue();

    expect(body.units).toHaveLength(EXPECTED_VISIBLE);
    expect(body.purchasableCount).toBe(EXPECTED_PURCHASABLE);
    expect(body.heldCount).toBe(EXPECTED_HELD);
    expect(body.units.filter((unit) => unit.purchasable)).toHaveLength(EXPECTED_PURCHASABLE);
  });

  it("still contains Cagrilintide, which is the unit the omission dropped", async () => {
    // A held unit under "released_units" has no release by design, so naming it
    // is the ONLY thing that keeps it visible. This assertion is the one that
    // fails the moment the derivation is removed again.
    const body = await servedCatalogue();
    const unit = body.units.find((candidate) => candidate.productId === FOUNDER_HELD.productId);

    expect(unit, "Cagrilintide vanished from the mounted catalogue").toBeDefined();
    expect(unit?.strength).toBe(FOUNDER_HELD.strength);
  });

  it("holds Cagrilintide on the founder's decision, with no price and nothing to buy", async () => {
    const body = await servedCatalogue();
    const unit = body.units.find((candidate) => candidate.productId === FOUNDER_HELD.productId);

    expect(unit?.availability).toBe("TEMPORARILY_HELD");
    expect(unit?.hold).toBe("NO_FOUNDER_RELEASE");
    expect(unit?.purchasable).toBe(false);
    // No amount sits beside something nobody may buy, and no release to buy under.
    expect(unit?.priceCents).toBeNull();
    expect(unit?.basis).toBeNull();
    expect(unit?.releaseId).toBeNull();
    // The reason is a commercial decision, not a determination about the product.
    expect(unit?.productControlBlockers).not.toContain("STRENGTH_DISPUTE_UNRESOLVED");
  });

  it("holds exactly the four accepted units and no others", async () => {
    const body = await servedCatalogue();
    const held = body.units
      .filter((unit) => unit.availability !== "AVAILABLE")
      .map((unit) => `${unit.productId} ${unit.strength}`)
      .sort();

    expect(held).toEqual(
      [
        ...STRENGTH_DISPUTE_HELD.map((unit) => `${unit.productId} ${unit.strength}`),
        `${FOUNDER_HELD.productId} ${FOUNDER_HELD.strength}`,
      ].sort(),
    );
  });

  it.each(STRENGTH_DISPUTE_HELD)(
    "keeps $name $strength held on the unresolved strength dispute",
    async ({ productId, strength }) => {
      const body = await servedCatalogue();
      const unit = body.units.find(
        (candidate) => candidate.productId === productId && candidate.strength === strength,
      );

      expect(unit, `${productId} ${strength} is not in the served catalogue`).toBeDefined();
      expect(unit?.availability).toBe("TEMPORARILY_HELD");
      expect(unit?.purchasable).toBe(false);
      expect(unit?.productControlBlockers).toContain("STRENGTH_DISPUTE_UNRESOLVED");
      expect(unit?.priceCents).toBeNull();
    },
  );

  it("keeps NAD+ 1000 mg AVAILABLE at exactly $100.75", async () => {
    // The hold is per UNIT. Deriving the held set must not widen a 500 mg
    // dispute into a hold on the strength the founder approved and priced.
    const body = await servedCatalogue();
    const unit = body.units.find(
      (candidate) => candidate.productId === "PEP-009" && candidate.strength === "1000 mg",
    );

    expect(unit?.availability).toBe("AVAILABLE");
    expect(unit?.purchasable).toBe(true);
    expect(unit?.priceCents).toBe(NAD_1000_PRICE_CENTS);
  });

  it("gives every purchasable unit an exact price and a release to sell under", async () => {
    const body = await servedCatalogue();

    for (const unit of body.units.filter((candidate) => candidate.purchasable)) {
      expect(Number.isSafeInteger(unit.priceCents), `${unit.productId} price is not exact`).toBe(
        true,
      );
      expect(unit.priceCents as number).toBeGreaterThan(0);
      expect(unit.releaseId, `${unit.productId} is not pinned to a release`).not.toBeNull();
    }
  });

  it("derives the held set rather than inventing a release for it", async () => {
    // The repair must keep the unit VISIBLE without fabricating a release, a
    // price, or a purchase action. If a future change ever "fixes" the count by
    // releasing Cagrilintide, purchasableCount moves to 19 and this fails.
    const body = await servedCatalogue();
    const unit = body.units.find((candidate) => candidate.productId === FOUNDER_HELD.productId);

    expect(body.purchasableCount).toBe(EXPECTED_PURCHASABLE);
    expect(unit?.releaseId).toBeNull();
    expect(unit?.hold).toBe("NO_FOUNDER_RELEASE");
  });
});

/**
 * THE VERIFIED-LINK GATE, at the layer that decides it.
 *
 * Everything above is what a VERIFIED customer sees. The audience source is
 * the one place that turns a resolved customer into the PRIVATE_EARLY_ACCESS
 * authorization every price and purchase control hangs off, so this is where
 * the founder's rule is either enforced or not: a session bound by typing an
 * email under the SHARED password is not an identified customer, and neither
 * is one whose provenance is missing or unrecognised.
 *
 * These run against the same real projection, the same 22 canonical units and
 * the same recorded founder releases as the tests above. Nothing is stubbed
 * out to make them pass; the ONLY difference between them and the 22/18/4
 * tests is the provenance on the caller.
 */
describe("who the catalogue will price", () => {
  /** Every way a unit can carry money or a way to buy it. */
  function commercialFields(body: Body) {
    return {
      priced: body.units.filter((unit) => unit.priceCents !== null),
      purchasable: body.units.filter((unit) => unit.purchasable),
      released: body.units.filter((unit) => unit.releaseId !== null),
    };
  }

  const UNIDENTIFIED: readonly [string, Caller][] = [
    // A password-only session. The directory resolved nobody.
    ["a password-only session", null],
    // A typed email under the shared password: a real customer reference,
    // and no proof that the person typing is that customer.
    ["an email-entry binding", { customerRef: "cus_mounted_route", boundBy: "email_entry" }],
    // What a durable store written before the provenance column produces.
    ["an absent provenance", { customerRef: "cus_mounted_route" }],
    // Anything outside the vocabulary, including near-misses.
    ["an unknown provenance", { customerRef: "cus_mounted_route", boundBy: "verified" }],
    ["a wrong-case provenance", { customerRef: "cus_mounted_route", boundBy: "VERIFIED_LINK" }],
    ["a non-string provenance", { customerRef: "cus_mounted_route", boundBy: true }],
    // A reference with nothing behind it is not an identity either.
    ["a blank customer reference", { customerRef: "   ", boundBy: "verified_link" }],
  ];

  for (const [label, caller] of UNIDENTIFIED) {
    it(`shows ${label} the shelf, and not one price on it`, async () => {
      const body = await servedCatalogue(caller);
      const { priced, purchasable, released } = commercialFields(body);

      // Still the whole shelf. Withholding the catalogue would be a different
      // product decision; what is withheld is the commercial half of it.
      expect(body.units).toHaveLength(EXPECTED_VISIBLE);
      expect(priced).toHaveLength(0);
      expect(purchasable).toHaveLength(0);
      expect(released).toHaveLength(0);
      expect(body.purchasableCount).toBe(0);
      expect(body.heldCount).toBe(EXPECTED_VISIBLE);
      // Not merely absent from the fields this test reads: the founder's
      // approved amount must not appear anywhere in the served payload.
      expect(JSON.stringify(body)).not.toContain(String(NAD_1000_PRICE_CENTS));
    });
  }

  it("shows a verified customer the same shelf, priced", async () => {
    // The control. Without it every assertion above would also pass against a
    // gate that had simply broken the catalogue for everybody.
    const body = await servedCatalogue(VERIFIED_CALLER);
    const { priced, purchasable } = commercialFields(body);

    expect(body.units).toHaveLength(EXPECTED_VISIBLE);
    expect(purchasable).toHaveLength(EXPECTED_PURCHASABLE);
    expect(priced.length).toBeGreaterThanOrEqual(EXPECTED_PURCHASABLE);
    expect(JSON.stringify(body)).toContain(String(NAD_1000_PRICE_CENTS));
  });

  it("holds Cagrilintide for an unverified caller too, and for the founder's reason", async () => {
    // The unverified refusal must not overwrite the truthful hold: a unit the
    // founder never released is held because of that, not because of who is
    // looking. If this ever reported a release, the gate would be masking the
    // release ledger rather than sitting beside it.
    const body = await servedCatalogue({
      customerRef: "cus_mounted_route",
      boundBy: "email_entry",
    });
    const unit = body.units.find((candidate) => candidate.productId === FOUNDER_HELD.productId);

    expect(unit).toBeDefined();
    expect(unit?.releaseId).toBeNull();
    expect(unit?.priceCents).toBeNull();
    expect(unit?.purchasable).toBe(false);
  });
});
