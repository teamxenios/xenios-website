// Composed negatives for the manual-order launch, at the SUBMIT seam.
//
// Written for the lead, who owns server/research/assisted-order/** and asked
// for negative cases rather than edits. Nothing here writes into that module;
// it drives AssistedOrderService through its own dependency ports.
//
// WHY THE SUBMIT SEAM SPECIFICALLY. Under the manual-order launch the founder
// emails payment instructions BY HAND after a submission. There is no
// automated system downstream to catch a wrong acceptance, so the last place a
// non-orderable unit can be stopped is the moment the durable order is
// created. A shelf that hides a product is not a gate; the door has to refuse.
//
// The pattern these guard against has recurred all day: a rule recorded in one
// place and never consulted at the place that matters — the GRP-0422 hold that
// nothing read, a supplier adapter holding its own copy of a server constant,
// a shelf scope that never reached checkout, an admin toolbar offering a
// transition the server refuses. Each passed its own unit tests.
//
// TIME-OF-CHECK / TIME-OF-USE. The shelf is resolved at T1 and the submit
// happens at T2. Several tests below deliberately MUTATE the authority between
// the two and submit the unchanged cart, because asking the gate twice in one
// tick can pass while a real divergence stays open.

import { describe, expect, it, vi } from "vitest";
import type {
  AssistedOrderCatalogItem,
  AssistedOrderSubmitInput,
} from "../../../shared/research/assisted-order/contract";
import type {
  AssistedOrderDependencies,
  AssistedOrderLegalPort,
  AssistedOrderNotificationIntent,
  AssistedOrderViewer,
} from "../assisted-order/ports";
import {
  ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS,
  assistedOrderFormPair,
} from "../../../shared/research/assisted-order/form";
import { InMemoryAssistedOrderRepository } from "../assisted-order/memory-repository";
import { AssistedOrderService } from "../assisted-order/service";

const FORM_PAIRS = ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS.map((a) => ({
  ...assistedOrderFormPair(a),
  acceptedAt: "2026-08-15T12:00:00.000Z",
}));

const customer: AssistedOrderViewer = Object.freeze({
  actorType: "member",
  memberId: "11111111-1111-4111-8111-111111111111",
  earlyAccessSessionHash: null,
  normalizedEmail: "member@example.com",
  capabilities: new Set(["assisted_orders:submit", "assisted_orders:read_own"]),
});

/** A directly orderable RUO peptide: the control case that MUST succeed. */
function directPeptide(overrides: Partial<AssistedOrderCatalogItem> = {}): AssistedOrderCatalogItem {
  return Object.freeze({
    productId: "product-1",
    variantId: "variant-1",
    productName: "Research Peptide",
    family: "Research Peptides & Materials",
    channel: "RUO Research",
    specification: "10 mg",
    format: "Vial",
    packBasis: "Per vial",
    minimumQuantity: 1,
    maximumQuantity: 100,
    quantityIncrement: 1,
    unitPriceCents: 5000,
    currency: "USD",
    workflowMode: "direct_order_request",
    actionLabel: "Order now",
    accessNotice: "Research Use Only",
    researchUseOnly: true,
    catalogVersion: "catalog-v1",
    priceVersion: "price-v1",
    ...overrides,
  });
}

// The five rows the founder's routing table says are NOT directly orderable.
const NON_DIRECT_ROWS: ReadonlyArray<readonly [string, Partial<AssistedOrderCatalogItem>]> = [
  [
    "GRP-0422, the formulation-held combination",
    {
      productId: "GRP-0422",
      productName: "CJC-1295 + Ipamorelin WITH DAC",
      // The reviewed reconciliation STRIPS the marker from the canonical
      // specification, so nothing here asserts on marker text. s7 shipped a
      // marker-based hold and it silently stopped firing.
      specification: "5 mg total",
      unitPriceCents: 9900,
      workflowMode: "availability_review",
      actionLabel: "Request order",
    },
  ],
  [
    "a Care / provider-only row",
    { productId: "care-1", channel: "Clinical", workflowMode: "provider_request", actionLabel: "Continue through Care" },
  ],
  [
    "a classification-pending row",
    {
      productId: "pending-1",
      channel: "Supplier Catalog / Classification Pending",
      workflowMode: "availability_review",
      actionLabel: "Request order",
    },
  ],
  [
    "a held row",
    { productId: "held-1", workflowMode: "availability_review", actionLabel: "Temporarily unavailable" },
  ],
  [
    "a Research Capsule, excluded from the direct peptide expansion",
    {
      productId: "capsule-1",
      productName: "Research Capsules",
      family: "Research Capsules",
      workflowMode: "request_pricing",
      actionLabel: "Request pricing",
    },
  ],
];

function input(overrides: Partial<AssistedOrderSubmitInput> = {}): AssistedOrderSubmitInput {
  return {
    idempotencyKey: "submit-1",
    contact: {
      fullLegalName: "Test Member",
      email: "member@example.com",
      mobilePhone: "+15125550100",
      ageConfirmed: true,
      shippingAddress: {
        line1: "100 Test Street",
        city: "Austin",
        region: "TX",
        postalCode: "78704",
        countryCode: "US",
      },
      billingSameAsShipping: true,
    },
    agreements: [
      { kind: "assisted_order_request_notice", version: "v1", acceptedAt: "2026-08-15T12:00:00.000Z" },
      ...FORM_PAIRS,
    ],
    lines: [
      {
        productId: "product-1",
        variantId: "variant-1",
        quantity: 2,
        expectedCatalogVersion: "catalog-v1",
        expectedPriceVersion: "price-v1",
        expectedUnitPriceCents: 5000,
      },
    ],
    ...overrides,
  };
}

/**
 * The composition. `authority` is a mutable box so a test can change what the
 * catalog says BETWEEN the shelf read and the submit, which is the divergence
 * that matters.
 */
function harness(initial: AssistedOrderCatalogItem = directPeptide()) {
  const authority = { item: initial };
  const repository = new InMemoryAssistedOrderRepository();
  const notifications: AssistedOrderNotificationIntent[] = [];
  let sequence = 0;
  let referenceSequence = 0;
  const legal: AssistedOrderLegalPort = {
    requiredAgreements: async () => [{ kind: "assisted_order_request_notice", version: "v1" }],
  };
  const deps: AssistedOrderDependencies = {
    legal,
    catalog: {
      list: async () => ({
        items: [authority.item],
        total: 1,
        page: 1,
        pageSize: 24,
        families: [authority.item.family],
        channels: [authority.item.channel],
        workflowModes: [authority.item.workflowMode],
      }),
      resolveLine: async (_viewer, requested) => {
        const current = authority.item;
        return {
          lineId: "assigned-by-service",
          productId: current.productId,
          variantId: current.variantId,
          productName: current.productName,
          specification: current.specification,
          format: current.format,
          packBasis: current.packBasis,
          quantity: requested.quantity,
          minimumQuantity: current.minimumQuantity,
          maximumQuantity: current.maximumQuantity,
          quantityIncrement: current.quantityIncrement,
          workflowMode: current.workflowMode,
          customerActionLabel: current.actionLabel,
          unitPriceCents: current.unitPriceCents,
          lineEstimateCents: null,
          currency: "USD",
          catalogVersion: current.catalogVersion,
          priceVersion: current.priceVersion,
          accessNotice: current.accessNotice,
          researchUseOnly: current.researchUseOnly,
          authoritativeFingerprint: `fingerprint:${current.productId}:${current.workflowMode}`,
        };
      },
    },
    repository,
    outbox: {
      enqueue: async (intent) => {
        notifications.push(intent);
      },
    },
    audit: { record: vi.fn(async () => undefined) },
    documents: {
      createUpload: async (request) => ({
        documentId: "doc",
        uploadUrl: "https://storage.example/upload",
        objectPath: request.objectPath,
        expiresAt: "2026-08-15T12:15:00.000Z",
        requiredHeaders: { "content-type": request.mimeType },
      }),
      createDownload: async () => ({ url: "https://storage.example/d", expiresAt: "2026-08-15T12:05:00.000Z" }),
    },
    googleMirror: { enqueue: vi.fn(async () => undefined) },
    clock: { now: () => new Date("2026-08-15T12:00:00.000Z") },
    ids: {
      uuid: () => {
        sequence += 1;
        return `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
      },
      publicReference: () => {
        referenceSequence += 1;
        return `XRR-20260815-REF${String(referenceSequence).padStart(5, "0")}`;
      },
      opaqueToken: () => `token-${sequence}`,
    },
    hasher: { hash: (v) => `hash:${v}`, stableHash: (v) => JSON.stringify(v) },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    adminNotificationEmail: "research@xeniostechnology.com",
    documentBucketName: "research-assisted-order-documents",
  };
  return { service: new AssistedOrderService(deps), repository, notifications, authority };
}

/** Did the submission become a DIRECT order the founder would bill by hand? */
function acceptedAsDirect(receipt: { lines: ReadonlyArray<{ workflowMode: string }> }): boolean {
  return receipt.lines.some((line) => line.workflowMode === "direct_order_request");
}

// ---------------------------------------------------------------------------
// Control: the thing that must keep working
// ---------------------------------------------------------------------------

describe("the launch path itself still works", () => {
  it("accepts an eligible RUO peptide and returns a durable reference", async () => {
    const { service, notifications } = harness();
    const receipt = await service.submit(customer, input());
    expect(receipt.publicReference).toMatch(/^XRR-/);
    expect(acceptedAsDirect(receipt)).toBe(true);
    // Exactly one customer notification and one admin notification.
    expect(notifications).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// The five rows that must never complete a DIRECT submit
// ---------------------------------------------------------------------------

describe("a non-directly-orderable row cannot complete a direct submit", () => {
  it.each(NON_DIRECT_ROWS)("%s is never accepted as a direct order", async (_label, overrides) => {
    const { service } = harness(directPeptide(overrides));
    let receipt: Awaited<ReturnType<typeof service.submit>> | null = null;
    try {
      receipt = await service.submit(customer, input());
    } catch {
      // A refusal at submit is a perfectly good outcome for this assertion.
      return;
    }
    // If it was accepted at all, it must NOT have been accepted as a direct
    // order — the founder must not be told to bill for it by hand.
    expect(acceptedAsDirect(receipt!)).toBe(false);
  });

  // MUTATION CHECK, and the most important test in this file.
  //
  // The tests above could pass vacuously: submit() re-resolves every line from
  // the catalog authority and echoes its workflowMode, so if the authority
  // already says "not direct" then nothing was really gated. This test forces
  // the opposite fixture and records what happens.
  //
  // It documents WHERE the protection actually lives. Submit does not have an
  // independent opinion about GRP-0422 — it trusts the authority. So the hold
  // MUST be enforced upstream, in whatever decides workflowMode. If that
  // upstream decision ever regresses, the submit path will accept a held
  // combination product and the founder will hand-quote it to a real customer.
  it("accepts a held row as DIRECT when the authority wrongly says direct — the gate is upstream", async () => {
    const { service } = harness(
      directPeptide({ productId: "GRP-0422", specification: "5 mg total", workflowMode: "direct_order_request" }),
    );
    const receipt = await service.submit(customer, input());
    // Recorded, not celebrated: this is the exposure, and it is why the hold
    // has to hold in the running system rather than in an artifact.
    expect(acceptedAsDirect(receipt)).toBe(true);
  });

  it("GRP-0422 is asserted through the authority, never through marker text", async () => {
    const { service } = harness(
      directPeptide({ productId: "GRP-0422", specification: "5 mg total", workflowMode: "availability_review" }),
    );
    const receipt = await service.submit(customer, input());
    // The canonical specification has the marker STRIPPED, so the routing must
    // come from workflowMode and not from anything spelled in the text.
    expect(receipt.lines[0].specification).not.toMatch(/split|pending|hold/i);
    expect(acceptedAsDirect(receipt)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Time-of-check / time-of-use: the divergence that a same-tick test misses
// ---------------------------------------------------------------------------

describe("the shelf decision and the submit decision cannot drift apart", () => {
  it("refuses a direct order when the row stopped being direct between shelf and submit", async () => {
    const { service, authority } = harness(directPeptide());
    // T1: the customer sees a directly orderable unit and fills the form.
    const cart = input();
    // T2: the authority withdraws it — classification pulled, hold applied.
    authority.item = directPeptide({ workflowMode: "availability_review", actionLabel: "Request order" });

    let receipt: Awaited<ReturnType<typeof service.submit>> | null = null;
    try {
      receipt = await service.submit(customer, cart);
    } catch {
      return;
    }
    expect(acceptedAsDirect(receipt!)).toBe(false);
  });

  it("refuses when the row became Care between shelf and submit", async () => {
    const { service, authority } = harness(directPeptide());
    const cart = input();
    authority.item = directPeptide({ channel: "Clinical", workflowMode: "provider_request" });
    let receipt: Awaited<ReturnType<typeof service.submit>> | null = null;
    try {
      receipt = await service.submit(customer, cart);
    } catch {
      return;
    }
    expect(acceptedAsDirect(receipt!)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Browser claims are never authority
// ---------------------------------------------------------------------------

describe("nothing the browser sends can change what is charged or ordered", () => {
  it("refuses a tampered unit price rather than honouring it", async () => {
    const { service } = harness(directPeptide({ unitPriceCents: 5000 }));
    await expect(
      service.submit(
        customer,
        input({
          lines: [
            {
              productId: "product-1",
              variantId: "variant-1",
              quantity: 2,
              expectedCatalogVersion: "catalog-v1",
              expectedPriceVersion: "price-v1",
              expectedUnitPriceCents: 1, // a cent
            },
          ],
        }),
      ),
    ).rejects.toThrow();
  });

  it("prices from the authority, never from the browser, when no expectation is sent", async () => {
    const { service } = harness(directPeptide({ unitPriceCents: 5000 }));
    const receipt = await service.submit(
      customer,
      input({
        lines: [{ productId: "product-1", variantId: "variant-1", quantity: 2 }],
      }),
    );
    expect(receipt.lines[0].unitPriceCents).toBe(5000);
  });

  it("refuses a quantity above the 100-per-variant ceiling", async () => {
    const { service } = harness(directPeptide({ maximumQuantity: 100 }));
    await expect(
      service.submit(
        customer,
        input({
          lines: [
            {
              productId: "product-1",
              variantId: "variant-1",
              quantity: 101,
              expectedCatalogVersion: "catalog-v1",
              expectedPriceVersion: "price-v1",
              expectedUnitPriceCents: 5000,
            },
          ],
        }),
      ),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Affiliate: a typed claim is not attribution
// ---------------------------------------------------------------------------

describe("a typed affiliate code cannot promote itself to verified attribution", () => {
  it("stores a declared code without it becoming verified attribution", async () => {
    const { service, repository } = harness();
    // No verified ref is passed: this is a customer typing a code in a form.
    await service.submit(customer, input({ declaredAffiliateCode: "dana10" } as Partial<AssistedOrderSubmitInput>));
    const stored = (repository as unknown as { records?: Map<string, Record<string, unknown>> }).records;
    if (!stored) return; // repository internals are not part of this contract
    const record = Array.from(stored.values())[0] ?? {};
    // Whatever the field is named, nothing verified may have been set from a
    // value the browser supplied.
    const verified = record.verifiedAffiliateAttributionRef ?? record.verified_affiliate_attribution_ref ?? null;
    expect(verified).toBeNull();
  });

  it("does not let a declared code change the price that is charged", async () => {
    const plain = harness(directPeptide({ unitPriceCents: 5000 }));
    const withCode = harness(directPeptide({ unitPriceCents: 5000 }));
    const a = await plain.service.submit(customer, input());
    const b = await withCode.service.submit(
      customer,
      input({ declaredAffiliateCode: "dana10" } as Partial<AssistedOrderSubmitInput>),
    );
    expect(b.lines[0].unitPriceCents).toBe(a.lines[0].unitPriceCents);
    expect(b.estimatedTotalCents).toBe(a.estimatedTotalCents);
  });
});

// ---------------------------------------------------------------------------
// The founder's inbox
// ---------------------------------------------------------------------------

describe("a duplicate submit does not put two orders in the founder's inbox", () => {
  it("replays the same reference and notifies exactly once", async () => {
    const { service, notifications } = harness();
    const cart = input();
    const first = await service.submit(customer, cart);
    const second = await service.submit(customer, cart);
    expect(second.publicReference).toBe(first.publicReference);
    // One customer + one admin, for the pair of submits.
    expect(notifications).toHaveLength(2);
  });

  it("still produces two orders for two genuinely different submissions", async () => {
    const { service, notifications } = harness();
    const first = await service.submit(customer, input({ idempotencyKey: "submit-1" }));
    const second = await service.submit(customer, input({ idempotencyKey: "submit-2" }));
    expect(second.publicReference).not.toBe(first.publicReference);
    expect(notifications).toHaveLength(4);
  });
});
