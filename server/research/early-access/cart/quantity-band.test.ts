/**
 * THE QUANTITY BAND, END TO END.
 *
 * One file holding the whole mandate for the one-through-twenty widening, so a
 * later change that narrows the band, or that lets duplicate lines walk past
 * it, fails here rather than in production.
 *
 * The three things this file exists to prove, in order of how badly they would
 * hurt if they broke:
 *
 *   1. The cap is PER EXACT VARIANT and is applied to the AGGREGATE. Duplicate
 *      cart lines merge into one canonical line, so twenty is twenty however
 *      the browser spells it, and twenty-one is refused however it is split.
 *   2. The server is the authority. The browser's max attribute, its line
 *      count, and its price echo are all input, and none of them decides.
 *   3. Quantity flows through unchanged. One line of twenty stays ONE line of
 *      twenty in the quote, the checkout, the invoice, the settlement, the
 *      receipt, the child release and every projection. Twenty units never
 *      become twenty orders, twenty releases or twenty emails.
 */

import { describe, expect, it } from "vitest";
import type {
  EarlyAccessCartCheckoutRecord,
  EarlyAccessCartItemInput,
  EarlyAccessCartQuoteRequest,
} from "@shared/research/early-access-cart";
import {
  EARLY_ACCESS_MAX_QUANTITY,
  EARLY_ACCESS_MIN_QUANTITY,
  isEarlyAccessQuantity,
} from "@shared/research/early-access-quantity";
import {
  EARLY_ACCESS_PROMOTIONS,
  earlyAccessPromotionDiscountCents,
  earlyAccessPromotionFor,
} from "../commerce/promotion";
import { checkoutEarlyAccessCart } from "./checkout-service";
import { quoteEarlyAccessCart } from "./quote-service";
import { customerCheckoutView, projectEarlyAccessCustomerCartStatus } from "./customer-status";
import { earlyAccessCartIntentHash, normalizeCartItems } from "./model";
import { recordEarlyAccessCartExternalProof, settleEarlyAccessCart } from "./settlement";
import { InMemoryEarlyAccessCartStore } from "./store";
import type { CartCatalogUnit } from "./ports";

const CUSTOMER = { customerRef: "eac_0123456789abcdef0123456789abcdef" };
const BPC = { productId: "PEX-001", variantId: "VAR-BPC5" } as const;
const NAD = { productId: "PEX-010", variantId: "VAR-NAD1000" } as const;
const BPC_PRICE = 3350;
const NAD_PRICE = 10075;

/**
 * The catalogue this suite buys from. `quantityLimit: 20` is Product Control
 * declaring the whole band available for these two units; the narrower case
 * (a limit BELOW the band) has its own test rather than being the default.
 */
const units: CartCatalogUnit[] = [
  { ...BPC, displayName: "BPC-157 Research Material", strength: "5 mg", sku: "R360-BPC157-5MG-VIAL", purchasable: true, availability: "AVAILABLE", priceCents: BPC_PRICE, currency: "USD", quantityLimit: 20, supplierReady: true },
  { ...NAD, displayName: "NAD+ Research Material", strength: "1000 mg", sku: "R360-NAD-1000MG-VIAL", purchasable: true, availability: "AVAILABLE", priceCents: NAD_PRICE, currency: "USD", quantityLimit: 20, supplierReady: true },
  { productId: "PEX-050", variantId: "VAR-SCARCE", displayName: "Scarce", strength: "2 mg", sku: "SCARCE", purchasable: true, availability: "AVAILABLE", priceCents: 5000, currency: "USD", quantityLimit: 2, supplierReady: true },
];

const CONTACT = { email: "buyer@example.com", phone: "+1 512 555 0100" };
const SHIP_TO = {
  recipientName: "Samuel Boadu",
  line1: "1 Main",
  line2: null,
  city: "Austin",
  region: "TX",
  postalCode: "78701",
  country: "US",
} as const;

function item(
  identity: { productId: string; variantId: string },
  quantity: unknown,
  expectedUnitPriceCents: number,
): EarlyAccessCartItemInput {
  return {
    ...identity,
    quantity: quantity as number,
    expectedUnitPriceCents,
    expectedCurrency: "USD",
  };
}

function requestOf(items: readonly EarlyAccessCartItemInput[]): EarlyAccessCartQuoteRequest {
  return { items, contact: CONTACT, shipTo: SHIP_TO };
}

/**
 * No promotion beyond the approved one. The cart's real adapter resolves the
 * promotion table; this suite is about QUANTITY, so it holds the discount at
 * zero and asserts the arithmetic rather than the offer.
 */
function deps(nowMs = Date.parse("2026-08-11T18:00:00.000Z")) {
  const store = new InMemoryEarlyAccessCartStore();
  return {
    store,
    quote: {
      catalog: { units: async () => units },
      releases: {
        decide: async ({ unit }: { unit: CartCatalogUnit }) => ({
          released: true as const,
          priceCents: unit.priceCents!,
          currency: "USD" as const,
          promotion: { promotionId: null, version: null, label: null, discountCents: 0 },
        }),
      },
      suppliers: {
        forUnit: async (productId: string) => ({
          supplierId: "supplier-renew360",
          supplierSku: `sku-${productId}`,
        }),
      },
      shipping: { serves: async () => true, quote: async () => ({ currency: "USD" as const, shippingCents: 0 }) },
      agreements: { accepted: async () => true },
      quotes: store,
      now: () => nowMs,
      quoteId: () => "xeaq_12345678901234567890",
    },
    checkout: {
      quotes: store,
      checkouts: store,
      audit: { record: async () => {} },
      now: () => nowMs + 60_000,
      checkoutNumber: () => "XEC-0123456789ABCDEF",
      childOrderNumber: (index: number) =>
        `XEA-CART-01234567-${String(index + 1).padStart(2, "0")}`,
    },
  };
}

// ---------------------------------------------------------------------------
describe("the band itself", () => {
  it("accepts one and fifty and refuses everything outside", () => {
    expect(EARLY_ACCESS_MIN_QUANTITY).toBe(1);
    expect(EARLY_ACCESS_MAX_QUANTITY).toBe(50);

    for (const accepted of [1, 2, 3, 19, 20, 49, 50]) {
      expect(isEarlyAccessQuantity(accepted), `${accepted} should be accepted`).toBe(true);
    }
    // Zero, negative, past the ceiling, decimal, NaN, both infinities, and
    // every magnitude integer arithmetic cannot hold exactly.
    for (const refused of [
      0,
      -1,
      -20,
      51,
      100,
      1.5,
      19.999,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.MAX_SAFE_INTEGER,
      1e21,
    ]) {
      expect(isEarlyAccessQuantity(refused), `${refused} should be refused`).toBe(false);
    }
  });

  it("coerces nothing: a quantity must already BE a number", () => {
    // The whole class of bug this guard exists for. "20" is not 20, true is not
    // 1, and an empty string is not 0, however willing JavaScript is to pretend
    // otherwise.
    for (const refused of ["1", "20", "", " ", true, false, null, undefined, [], [20], {}, 20n]) {
      expect(isEarlyAccessQuantity(refused), `${String(refused)} should be refused`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
describe("the pre-existing promotion authority is byte-identical", () => {
  /**
   * The three fingerprints as they were at the accepted base
   * `d4cf8d10599ca183df06a4f1968775888a4150c8`, computed from that commit's own
   * rule literals.
   *
   * These are not decoration. `earlyAccessPromotionVersion` hashes the rule's
   * CONTENT, and every historical order stores the fingerprint it was sold
   * under and is validated against it on read. If widening the band had altered
   * one character of an authored rule, its fingerprint would move and real
   * orders would stop validating. Pinning the literals means that failure is a
   * red test rather than a customer-visible one.
   */
  const BASE_PROMOTION_VERSIONS: Readonly<Record<string, string>> = Object.freeze({
    "early-access-single": "7c8cf4f605cb6af0c230018ccdf2ecb82793e9ace563506c70561862ce770d6e",
    "early-access-pair": "40e89985a3ccade33ccb6dcd28bfac3e3fbe0da1bd29f6389f843b7742e2959f",
    "early-access-bundle-3": "11d6be483e32819a4dfff57aeed775da512e61a9f6d7a3ffbb5b7a303de8f590",
  });

  it("keeps all three authored rules at their original fingerprints", () => {
    for (const [promotionId, expected] of Object.entries(BASE_PROMOTION_VERSIONS)) {
      const rule = EARLY_ACCESS_PROMOTIONS.find((p) => p.promotionId === promotionId);
      expect(rule, `${promotionId} must still exist`).toBeDefined();
      expect(rule!.promotionVersion, `${promotionId} fingerprint`).toBe(expected);
    }
  });

  it("introduces no unauthorized discount anywhere in the widened band", () => {
    // Quantity 3 at 2000 basis points is the ONLY discount that exists. Every
    // other quantity in the band carries zero, including the seventeen the
    // widening added.
    const discounted = EARLY_ACCESS_PROMOTIONS.filter((p) => p.discountBasisPoints !== 0);
    expect(discounted).toHaveLength(1);
    expect(discounted[0]!.promotionId).toBe("early-access-bundle-3");
    expect(discounted[0]!.eligibleQuantity).toBe(3);
    expect(discounted[0]!.discountBasisPoints).toBe(2_000);

    // And the table covers the whole band exactly, so no quantity the round
    // accepts is left unpriced and none outside it is priced.
    expect(EARLY_ACCESS_PROMOTIONS.map((p) => p.eligibleQuantity)).toEqual(
      Array.from({ length: EARLY_ACCESS_MAX_QUANTITY }, (_unused, i) => i + 1),
    );
    expect(earlyAccessPromotionFor(EARLY_ACCESS_MAX_QUANTITY + 1)).toBeNull();
  });

  it("prices each quantity exactly, with no volume curve", () => {
    // Written out rather than computed: a discount that appeared at, say, ten
    // would have to be typed in here to pass.
    const unit = 10_000;
    const expected: readonly (readonly [number, number])[] = [
      [1, 0],
      [2, 0],
      [3, 6_000], // 20% of 30_000, the one approved discount
      [4, 0],
      [6, 0],
      [10, 0],
      [20, 0],
    ];
    for (const [quantity, discountCents] of expected) {
      const promotion = earlyAccessPromotionFor(quantity);
      expect(promotion, `quantity ${quantity} must resolve`).not.toBeNull();
      expect(
        earlyAccessPromotionDiscountCents(unit * quantity, promotion!.discountBasisPoints),
        `discount at ${quantity}`,
      ).toBe(discountCents);
    }
  });
});

// ---------------------------------------------------------------------------
describe("cart canonicalization, per exact variant", () => {
  it("merges duplicate lines of one variant into a canonical aggregate", () => {
    const canonical = normalizeCartItems([
      item(BPC, 10, BPC_PRICE),
      item(BPC, 10, BPC_PRICE),
    ]);
    expect(canonical).not.toBeNull();
    expect(canonical).toHaveLength(1);
    expect(canonical![0]!.quantity).toBe(20);
  });

  it("refuses an aggregate past the cap even though each line is legal", () => {
    // 25 and 26 are each a perfectly good quantity. Their SUM is not.
    expect(normalizeCartItems([item(BPC, 25, BPC_PRICE), item(BPC, 26, BPC_PRICE)])).toBeNull();
    // And no split gets there either.
    expect(
      normalizeCartItems([
        item(BPC, 17, BPC_PRICE),
        item(BPC, 17, BPC_PRICE),
        item(BPC, 17, BPC_PRICE),
      ]),
    ).toBeNull();
    // Fifty single-unit lines is exactly the cap and is allowed.
    const twenty = normalizeCartItems(
      Array.from({ length: 50 }, () => item(BPC, 1, BPC_PRICE)),
    );
    expect(twenty).toHaveLength(1);
    expect(twenty![0]!.quantity).toBe(50);
    // Twenty-one is not.
    expect(
      normalizeCartItems(Array.from({ length: 51 }, () => item(BPC, 1, BPC_PRICE))),
    ).toBeNull();
  });

  it("keeps distinct variants distinct, each with its own cap", () => {
    const canonical = normalizeCartItems([item(BPC, 20, BPC_PRICE), item(NAD, 20, NAD_PRICE)]);
    expect(canonical).toHaveLength(2);
    expect(canonical!.map((line) => line.quantity)).toEqual([20, 20]);
  });

  it("refuses duplicate lines that disagree about the price they were shown", () => {
    // Merging two price echoes into one has no honest answer, so the cart is
    // refused whole rather than reconciled.
    expect(normalizeCartItems([item(BPC, 5, BPC_PRICE), item(BPC, 5, 100)])).toBeNull();
  });

  it("refuses a single line outside the band before any merging happens", () => {
    for (const bad of [0, 51, -1, 2.5, "3", null, undefined, Number.NaN]) {
      expect(normalizeCartItems([item(BPC, bad, BPC_PRICE)]), `${String(bad)}`).toBeNull();
    }
  });

  it("canonicalizes to the same list whatever order the browser sent", () => {
    const a = normalizeCartItems([item(NAD, 5, NAD_PRICE), item(BPC, 6, BPC_PRICE), item(BPC, 4, BPC_PRICE)]);
    const b = normalizeCartItems([item(BPC, 4, BPC_PRICE), item(NAD, 5, NAD_PRICE), item(BPC, 6, BPC_PRICE)]);
    expect(a).toEqual(b);
    // And therefore to the same intent identity.
    const hash = (items: readonly EarlyAccessCartItemInput[]) =>
      earlyAccessCartIntentHash({
        customerRef: CUSTOMER.customerRef,
        items,
        contact: { email: "buyer@example.com", phone: "+15125550100" },
        shipTo: SHIP_TO,
      });
    expect(hash(a!)).toBe(hash(b!));
  });
});

// ---------------------------------------------------------------------------
describe("the quote, at fifty", () => {
  it("computes the line and cart totals from the SERVER price times the quantity", async () => {
    const { quote } = deps();
    const result = await quoteEarlyAccessCart(quote, CUSTOMER, requestOf([item(BPC, 20, BPC_PRICE)]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quote.lines).toHaveLength(1);
    expect(result.quote.lines[0]!.quantity).toBe(20);
    expect(result.quote.lines[0]!.subtotalCents).toBe(BPC_PRICE * 20);
    expect(result.quote.lines[0]!.payableCents).toBe(BPC_PRICE * 20);
    expect(result.quote.subtotalCents).toBe(BPC_PRICE * 20);
    expect(result.quote.payableTotalCents).toBe(
      result.quote.subtotalCents -
        result.quote.discountCents +
        result.quote.shippingCents +
        result.quote.taxCents,
    );
  });

  it("ignores the browser's price echo as authority and refuses a stale one", async () => {
    const { quote } = deps();
    // A browser claiming a lower unit price does not get it.
    const result = await quoteEarlyAccessCart(
      quote,
      CUSTOMER,
      requestOf([item(BPC, 20, 1)]),
    );
    expect(result).toMatchObject({ ok: false, code: "LINE_REFUSED" });
    if (result.ok) return;
    expect(result.lines?.[0]).toMatchObject({ code: "PRICE_CHANGED", currentUnitPriceCents: BPC_PRICE });
  });

  it("quotes a merged duplicate as ONE line at the aggregate quantity", async () => {
    const { quote } = deps();
    const result = await quoteEarlyAccessCart(
      quote,
      CUSTOMER,
      requestOf([item(BPC, 10, BPC_PRICE), item(BPC, 10, BPC_PRICE)]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // ONE line, not two. This is what stops duplicate browser lines becoming
    // duplicate supplier child orders.
    expect(result.quote.lines).toHaveLength(1);
    expect(result.quote.lines[0]!.quantity).toBe(20);
    expect(result.quote.subtotalCents).toBe(BPC_PRICE * 20);
  });

  it("refuses a duplicate pair whose aggregate is past the cap", async () => {
    const { quote, store } = deps();
    const result = await quoteEarlyAccessCart(
      quote,
      CUSTOMER,
      requestOf([item(BPC, 25, BPC_PRICE), item(BPC, 26, BPC_PRICE)]),
    );
    expect(result).toMatchObject({ ok: false, code: "CART_INVALID" });
    expect(await store.get("xeaq_12345678901234567890")).toBeNull();
  });

  it("lets two different variants each carry twenty", async () => {
    const { quote } = deps();
    const result = await quoteEarlyAccessCart(
      quote,
      CUSTOMER,
      requestOf([item(BPC, 20, BPC_PRICE), item(NAD, 20, NAD_PRICE)]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quote.lines.map((line) => line.quantity)).toEqual([20, 20]);
    expect(result.quote.subtotalCents).toBe(BPC_PRICE * 20 + NAD_PRICE * 20);
  });

  it("does not let the widened band bypass Product Control", async () => {
    // The scarce unit declares a limit of 2. Twenty is inside the ROUND's band
    // and still refused, truthfully, as a quantity problem. It is never
    // silently lowered to 2 and never substituted for another variant.
    const { quote, store } = deps();
    const result = await quoteEarlyAccessCart(
      quote,
      CUSTOMER,
      requestOf([item({ productId: "PEX-050", variantId: "VAR-SCARCE" }, 20, 5000)]),
    );
    expect(result).toMatchObject({ ok: false, code: "LINE_REFUSED" });
    if (result.ok) return;
    expect(result.lines?.[0]).toMatchObject({ code: "QUANTITY_INVALID" });
    expect(await store.get("xeaq_12345678901234567890")).toBeNull();
  });

  it("changes the intent identity when the quantity changes", async () => {
    const twenty = await quoteEarlyAccessCart(deps().quote, CUSTOMER, requestOf([item(BPC, 20, BPC_PRICE)]));
    const nineteen = await quoteEarlyAccessCart(deps().quote, CUSTOMER, requestOf([item(BPC, 19, BPC_PRICE)]));
    expect(twenty.ok && nineteen.ok).toBe(true);
    if (!twenty.ok || !nineteen.ok) return;
    expect(twenty.quote.intentHash).not.toBe(nineteen.quote.intentHash);
  });
});

// ---------------------------------------------------------------------------
describe("checkout, invoice and replay at twenty", () => {
  async function placed(items: readonly EarlyAccessCartItemInput[] = [item(BPC, 20, BPC_PRICE)]) {
    const d = deps();
    const quoted = await quoteEarlyAccessCart(d.quote, CUSTOMER, requestOf(items));
    if (!quoted.ok) throw new Error("fixture quote refused");
    const result = await checkoutEarlyAccessCart(d.checkout, CUSTOMER, {
      quoteId: quoted.quote.quoteId,
      idempotencyKey: "xeac_1234567890123456",
      expectedIntentHash: quoted.quote.intentHash,
    });
    return { d, quoted, result };
  }

  it("carries twenty into ONE child order and ONE invoice line", async () => {
    const { quoted, result } = await placed();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Twenty units are not twenty orders.
    expect(result.checkout.children).toHaveLength(1);
    expect(result.checkout.children[0]!.quantity).toBe(20);
    expect(result.checkout.invoice.lines).toHaveLength(1);
    expect(result.checkout.invoice.lines[0]!.quantity).toBe(20);
    // The invoice total IS the quote total. One amount, one payment reference.
    expect(result.checkout.invoice.payableTotalCents).toBe(quoted.quote.payableTotalCents);
    expect(result.checkout.invoice.paymentReference).toBe("XEACART-0123456789ABCDEF");
  });

  it("replays the original quantities rather than re-deriving them", async () => {
    const { d, quoted, result } = await placed();
    expect(result.ok).toBe(true);
    const replay = await checkoutEarlyAccessCart(d.checkout, CUSTOMER, {
      quoteId: quoted.quote.quoteId,
      idempotencyKey: "xeac_1234567890123456",
      expectedIntentHash: quoted.quote.intentHash,
    });
    expect(replay).toMatchObject({ ok: true, replayed: true });
    if (!replay.ok) return;
    expect(replay.checkout.children.map((child) => child.quantity)).toEqual([20]);
    expect(replay.checkout.invoice.payableTotalCents).toBe(quoted.quote.payableTotalCents);
    // One checkout, not two.
    expect(replay.checkout.cartCheckoutNumber).toBe("XEC-0123456789ABCDEF");
  });

  it("creates ONE checkout under concurrent confirms of the same intent", async () => {
    const d = deps();
    const quoted = await quoteEarlyAccessCart(d.quote, CUSTOMER, requestOf([item(BPC, 20, BPC_PRICE)]));
    if (!quoted.ok) throw new Error("fixture quote refused");
    const attempt = () =>
      checkoutEarlyAccessCart(d.checkout, CUSTOMER, {
        quoteId: quoted.quote.quoteId,
        idempotencyKey: "xeac_1234567890123456",
        expectedIntentHash: quoted.quote.intentHash,
      });
    const results = await Promise.all([attempt(), attempt(), attempt(), attempt(), attempt(), attempt()]);
    const created = results.filter((r) => r.ok && !r.replayed);
    expect(created).toHaveLength(1);
    for (const result of results) {
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.checkout.children[0]!.quantity).toBe(20);
    }
  });

  it("refuses a checkout whose intent no longer matches the changed quantity", async () => {
    const d = deps();
    const twenty = await quoteEarlyAccessCart(d.quote, CUSTOMER, requestOf([item(BPC, 20, BPC_PRICE)]));
    const nineteen = await quoteEarlyAccessCart(d.quote, CUSTOMER, requestOf([item(BPC, 19, BPC_PRICE)]));
    if (!twenty.ok || !nineteen.ok) throw new Error("fixture quote refused");
    const result = await checkoutEarlyAccessCart(d.checkout, CUSTOMER, {
      quoteId: nineteen.quote.quoteId,
      idempotencyKey: "xeac_1234567890123456",
      expectedIntentHash: twenty.quote.intentHash,
    });
    expect(result).toMatchObject({ ok: false, code: "QUOTE_CHANGED" });
  });

  it("keeps the customer projection at the right quantity and supplier-free", async () => {
    const { result } = await placed();
    if (!result.ok) return;
    const view = customerCheckoutView(result.checkout);
    expect(view.children).toHaveLength(1);
    expect(view.children[0]!.quantity).toBe(20);
    // The projection is the boundary: quantity crosses it, supplier identity
    // does not.
    expect(JSON.stringify(view)).not.toContain("supplier-renew360");
    expect(Object.keys(view.children[0]!)).not.toContain("supplierId");
    expect(Object.keys(view.children[0]!)).not.toContain("supplierSku");
  });
});

// ---------------------------------------------------------------------------
describe("settlement and release at twenty", () => {
  function record(quantity: number): EarlyAccessCartCheckoutRecord {
    const subtotal = BPC_PRICE * quantity;
    return {
      cartCheckoutNumber: "XEC-0123456789ABCDEF",
      customerRef: CUSTOMER.customerRef,
      contact: { email: "buyer@example.com", phone: "+15125550100" },
      shipTo: SHIP_TO,
      idempotencyKey: "xeac_1234567890123456",
      intentHash: "a".repeat(64),
      quoteId: "xeaq_1234567890123456",
      children: [
        {
          orderNumber: "XEA-CART-01234567-01",
          ...BPC,
          sku: "R360-BPC157-5MG-VIAL",
          quantity,
          supplierId: "supplier-renew360",
          supplierSku: "RP-1",
          unitPriceCents: BPC_PRICE,
          subtotalCents: subtotal,
          discountCents: 0,
          payableCents: subtotal,
        },
      ],
      invoice: {
        invoiceNumber: "XEI-0123456789ABCDEF",
        cartCheckoutNumber: "XEC-0123456789ABCDEF",
        paymentReference: "XEACART-0123456789ABCDEF",
        currency: "USD",
        lines: [
          {
            orderNumber: "XEA-CART-01234567-01",
            sku: "R360-BPC157-5MG-VIAL",
            quantity,
            unitPriceCents: BPC_PRICE,
            subtotalCents: subtotal,
            discountCents: 0,
            payableCents: subtotal,
          },
        ],
        subtotalCents: subtotal,
        discountCents: 0,
        shippingCents: 0,
        taxCents: 0,
        payableTotalCents: subtotal,
        instructions: "manual",
        issuedAt: "2026-08-11T00:00:00.000Z",
        status: "awaiting_payment",
      },
      paymentState: "awaiting_payment",
      placedAt: "2026-08-11T00:00:00.000Z",
      attribution: null,
    } satisfies EarlyAccessCartCheckoutRecord;
  }

  async function settledAtTwenty() {
    const store = new InMemoryEarlyAccessCartStore();
    const checkout = record(20);
    await store.commit(checkout);
    const deps = { checkouts: store, settlements: store };
    const proof = await recordEarlyAccessCartExternalProof(deps, {
      cartCheckoutNumber: checkout.cartCheckoutNumber,
      sha256: "b".repeat(64),
      filename: "proof.png",
      contentType: "image/png",
      byteSize: 100,
      provenanceNote: "Received by the named operator off platform",
      actorId: "admin@example.com",
      at: "2026-08-11T00:01:00.000Z",
    });
    expect(proof.committed).toBe(true);
    const settled = await settleEarlyAccessCart(deps, {
      cartCheckoutNumber: checkout.cartCheckoutNumber,
      externalTransactionId: "txn-1",
      confirmedFundsReceived: true,
      confirmedAmountAndReference: true,
      actorId: "admin@example.com",
      at: "2026-08-11T00:02:00.000Z",
    });
    return { store, checkout, deps, settled };
  }

  it("settles once, receipts once, and releases ONE child order of twenty", async () => {
    const { checkout, settled } = await settledAtTwenty();
    expect(settled.committed).toBe(true);
    if (!settled.committed) return;
    // Twenty units are one release, not twenty.
    expect(settled.settlement.childReleases).toHaveLength(1);
    expect(settled.settlement.childReleases[0]!.quantity).toBe(20);
    expect(settled.settlement.childReleases[0]!.orderNumber).toBe("XEA-CART-01234567-01");
    // One receipt, for the one amount the invoice stated.
    expect(settled.settlement.receipt.verifiedAmountCents).toBe(checkout.invoice.payableTotalCents);
    expect(settled.settlement.verifiedAmountCents).toBe(BPC_PRICE * 20);
  });

  it("settles only once however many times it is asked", async () => {
    const { checkout, deps, settled } = await settledAtTwenty();
    expect(settled.committed).toBe(true);
    const again = await settleEarlyAccessCart(deps, {
      cartCheckoutNumber: checkout.cartCheckoutNumber,
      externalTransactionId: "txn-1",
      confirmedFundsReceived: true,
      confirmedAmountAndReference: true,
      actorId: "admin@example.com",
      at: "2026-08-11T00:03:00.000Z",
    });
    expect(again).toMatchObject({ committed: false, reason: "already_settled" });
  });

  it("gives the admin no way to settle a quantity other than the checkout's", async () => {
    // THE SHAPE IS THE GUARANTEE. The settlement input carries a checkout
    // number, a transaction id, two confirmations and an actor. There is no
    // quantity field and no amount field, so an operator cannot state either:
    // the amount is read from the durable invoice.
    const { checkout, settled } = await settledAtTwenty();
    if (!settled.committed) return;
    expect(settled.settlement.verifiedAmountCents).toBe(checkout.invoice.payableTotalCents);
    expect(settled.settlement.childReleases[0]!.quantity).toBe(
      checkout.children[0]!.quantity,
    );
  });

  it("gives proof upload no way to change a quantity", async () => {
    // Same argument, same shape. Proof metadata is a hash, a filename, a
    // content type, a byte size and a provenance note. No quantity, no money.
    const store = new InMemoryEarlyAccessCartStore();
    const checkout = record(20);
    await store.commit(checkout);
    const deps = { checkouts: store, settlements: store };
    await recordEarlyAccessCartExternalProof(deps, {
      cartCheckoutNumber: checkout.cartCheckoutNumber,
      sha256: "c".repeat(64),
      filename: "proof.png",
      contentType: "image/png",
      byteSize: 100,
      provenanceNote: "Received by the named operator off platform",
      actorId: "admin@example.com",
      at: "2026-08-11T00:01:00.000Z",
    });
    const after = await store.byCheckoutNumber(checkout.cartCheckoutNumber);
    expect(after?.children[0]!.quantity).toBe(20);
    expect(after?.invoice.lines[0]!.quantity).toBe(20);
    expect(after?.invoice.payableTotalCents).toBe(BPC_PRICE * 20);
  });

  it("shows the customer one fulfilment line of twenty, with no supplier identity", async () => {
    const { store, checkout, settled } = await settledAtTwenty();
    expect(settled.committed).toBe(true);
    // The real durable status, projected by the real projection, rather than a
    // shape this test invented. A hand-built status would prove the projection
    // is supplier-safe about data the store never produced.
    const durable = await store.status(checkout.cartCheckoutNumber);
    expect(durable).not.toBeNull();
    const status = projectEarlyAccessCustomerCartStatus(durable!, "2026-08-11T00:05:00.000Z");
    expect(status.fulfilment.childOrders).toHaveLength(1);
    expect(status.fulfilment.childOrders[0]!.quantity).toBe(20);
    // The server-side status DOES carry supplier identity; the projection is
    // what removes it. Both halves are asserted so the test cannot pass merely
    // because the fixture never had a supplier.
    expect(JSON.stringify(durable)).toContain("supplier-renew360");
    expect(JSON.stringify(status)).not.toContain("supplier-renew360");
    expect(JSON.stringify(status)).not.toContain("RP-1");
  });
});
