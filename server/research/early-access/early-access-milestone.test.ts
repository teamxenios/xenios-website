/**
 * THE MILESTONE: one real order, executed end to end.
 *
 * Twelve steps, run against the real modules rather than described:
 *
 *   1 approve one Early Access customer      7 the server creates a reservation
 *   2 bind the customer session              8 an immutable order
 *   3 record one supplier confirmation       9 an invoice
 *   4 approve one clean exact product       10 a unique payment reference
 *   5 the customer SEES it                  11 the customer submits payment proof
 *   6 selects a quantity                    12 the order remains UNPAID
 *
 * Step 12 is the one that matters most. A customer who has uploaded a screenshot
 * believes they have paid, and the system must not agree with them yet: proof
 * submission must not mark paid, must not generate a receipt, must not release
 * the supplier, and must not create a commission. All four are asserted.
 */

import { describe, expect, it } from "vitest";

import type {
  EarlyAccessCatalogProjection,
  EarlyAccessCatalogRow,
} from "./catalog/early-access-catalog";
import {
  InMemoryEarlyAccessReleaseLedger,
  earlyAccessReleaseVersion,
} from "./release/founder-release";
import { buildEarlyAccessStorefront } from "./release/storefront-view";
import {
  createFounderReleaseRoute,
  type EarlyAccessCatalogSource,
} from "./release/release-routes";
import {
  InMemoryEarlyAccessOrderRepository,
  createEarlyAccessOrder,
} from "./commerce/order-service";
import {
  InMemoryEarlyAccessInvoiceRepository,
  createEarlyAccessInvoice,
} from "./commerce/invoice-service";
import { describeProofSubmission } from "./commerce/payment-proof";
import { buildSupplierReleasePacket } from "./commerce/supplier-release";
import {
  createEarlyAccessCustomer,
  customerRefFor,
  InMemoryEarlyAccessCustomerRepository,
  transitionEarlyAccessCustomer,
} from "./identity/early-access-customer";
import {
  EarlyAccessCustomerDirectory,
  InMemoryConsumedTokenStore,
  InMemorySessionBindingStore,
  mintVerificationToken,
  redeemVerificationToken,
} from "./identity/identity-verification";
import { recordManualAction } from "./ops/manual-action-record";

const NOW_MS = Date.parse("2026-08-04T12:00:00.000Z");
const NOW_ISO = "2026-08-04T12:00:00.000Z";
const SECRET = "early-access-milestone-secret";
const OPERATIONAL_ONLY = [
  "PRICE_NOT_APPROVED",
  "DOCUMENTATION_NOT_SATISFIED",
  "IMAGE_PENDING",
] as const;

function cleanUnit(overrides: Partial<EarlyAccessCatalogRow> = {}): EarlyAccessCatalogRow {
  return {
    productId: "prod-clean",
    slug: "clean-unit",
    displayName: "Clean Unit",
    canonicalName: "clean-unit",
    variantId: "var-10mg",
    sku: "CLEAN-10",
    strength: "10 mg",
    presentation: "lyophilised vial",
    priceCents: null,
    currency: "",
    audience: "member",
    availability: "available",
    offerState: "APPROVAL_REQUIRED_PURCHASE",
    description: "",
    imageState: "none",
    quantityLimit: 3,
    supplierReady: true,
    disputeStatus: { identity: "none", strength: "none" },
    purchasable: false,
    blockers: [...OPERATIONAL_ONLY],
    ...overrides,
  } as unknown as EarlyAccessCatalogRow;
}

function sourceOf(rows: EarlyAccessCatalogRow[]): EarlyAccessCatalogSource {
  return {
    async load(now: Date) {
      return {
        evaluatedAt: now.toISOString(),
        rows,
        productsWithoutVariants: [],
      } as unknown as EarlyAccessCatalogProjection;
    },
  };
}

function res() {
  const state: any = { status: 0, body: null };
  const port: any = {
    setHeader: () => {},
    status(code: number) {
      state.status = code;
      return this;
    },
    json(body: unknown) {
      state.body = body;
      return this;
    },
  };
  return { port, state };
}

describe("THE MILESTONE: one real order, executed", () => {
  it("runs all twelve steps and leaves the order UNPAID", async () => {
    // -----------------------------------------------------------------------
    // 1. Approve one Early Access customer. A named human, with a reason.
    // -----------------------------------------------------------------------
    const customers = new InMemoryEarlyAccessCustomerRepository();
    const created = createEarlyAccessCustomer({
      id: "cus_milestone",
      email: "buyer@example.invalid",
      legalName: "Milestone Buyer",
      phone: "+1 555 0100",
      now: NOW_ISO,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const approved = transitionEarlyAccessCustomer({
      customer: created.value,
      to: "APPROVED",
      by: "Samuel Boadu",
      reason: "First release invite",
      now: NOW_ISO,
    });
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    expect(approved.value.status).toBe("APPROVED");
    await customers.insert(approved.value);

    const approvalRecord = recordManualAction({
      kind: "availability_confirmation",
      subjectId: approved.value.id,
      actor: "Samuel Boadu",
      at: NOW_ISO,
      channel: "portal",
      externalReference: null,
      priorStatus: "INVITED",
      newStatus: "APPROVED",
      note: "Approved the first Early Access customer for the founding release.",
    });
    expect(approvalRecord.ok).toBe(true);

    // -----------------------------------------------------------------------
    // 2. Bind the customer session, through the verified-email door.
    // -----------------------------------------------------------------------
    const bindings = new InMemorySessionBindingStore();
    const consumed = new InMemoryConsumedTokenStore();
    const minted = mintVerificationToken({
      tokenId: "tok_milestone",
      customerId: approved.value.id,
      email: approved.value.email,
      sessionId: "sess_milestone",
      nowMs: NOW_MS,
      secret: SECRET,
    });
    expect(minted.ok).toBe(true);
    if (!minted.ok) return;

    const redeemed = await redeemVerificationToken({
      token: minted.value,
      sessionId: "sess_milestone",
      secret: SECRET,
      nowMs: NOW_MS + 1_000,
      customers,
      consumed,
      bindings,
    });
    expect(redeemed.ok).toBe(true);
    expect(await bindings.get("sess_milestone")).toBe("cus_milestone");

    const directory = new EarlyAccessCustomerDirectory({
      readSessionId: () => "sess_milestone",
      bindings,
      customers,
    });
    const identified = await directory.resolve({ cookieHeader: "xpa=..." });
    expect(identified).not.toBeNull();
    const customerRef = identified!.customerRef;
    expect(customerRef).toBe(customerRefFor(approved.value));

    // A session that never went through a door is still nobody, which is the
    // password-only case: entry without identity buys nothing.
    const anonymous = new EarlyAccessCustomerDirectory({
      readSessionId: () => "sess_password_only",
      bindings,
      customers,
    });
    expect(await anonymous.resolve({ cookieHeader: "xpa=..." })).toBeNull();

    // -----------------------------------------------------------------------
    // 3. Record one valid supplier confirmation (manual, no supplier API).
    // -----------------------------------------------------------------------
    const supplierConfirmation = recordManualAction({
      kind: "supplier_communication",
      subjectId: "prod-clean/var-10mg",
      actor: "Samuel Boadu",
      at: NOW_ISO,
      channel: "email",
      externalReference: "supplier-email-2026-08-04",
      priorStatus: "unconfirmed",
      newStatus: "supplier_confirmed_on_demand",
      note: "Supplier confirmed 3 units of CLEAN-10, 10 mg lyophilised vial, cold chain not required.",
    });
    expect(supplierConfirmation.ok).toBe(true);
    if (!supplierConfirmation.ok) return;
    expect(supplierConfirmation.value.audit.type).toBe(
      "early_access.manual.supplier_communication",
    );

    // -----------------------------------------------------------------------
    // 4. Approve one clean exact product.
    // -----------------------------------------------------------------------
    const ledger = new InMemoryEarlyAccessReleaseLedger();
    const row = cleanUnit();
    const catalog = sourceOf([row]);
    const { port, state } = res();
    await createFounderReleaseRoute({ catalog, ledger, now: () => NOW_MS } as any)(
      {
        actor: "Samuel Boadu",
        body: {
          releaseId: "rel-milestone-0001",
          productId: row.productId,
          variantId: row.variantId,
          productVersion: earlyAccessReleaseVersion(row),
          status: "approved",
          approvedPriceCents: 24_900,
          currency: "USD",
          waivedBlockers: [...OPERATIONAL_ONLY],
          approvedQuantityLimit: 3,
          expiresAt: null,
          reason: "Contents confirmed against the supplier confirmation above.",
        },
      },
      port,
    );
    expect(state.status).toBe(201);

    // -----------------------------------------------------------------------
    // 5. The customer SEES it, priced, behind the gate.
    // -----------------------------------------------------------------------
    const releases = await ledger.all();
    const storefront = buildEarlyAccessStorefront({
      projection: await catalog.load(new Date(NOW_MS)),
      releases,
    });
    expect(storefront.purchasableCount).toBe(1);
    const shown = storefront.units[0];
    expect(shown?.state).toBe("purchasable");
    expect(shown?.priceCents).toBe(24_900);

    // -----------------------------------------------------------------------
    // 6 + 7 + 8. Quantity, reservation against the release, immutable order.
    // -----------------------------------------------------------------------
    const orders = new InMemoryEarlyAccessOrderRepository();
    const placed = await createEarlyAccessOrder({
      orders,
      rows: [row],
      releases: [...releases],
      request: {
        idempotencyKey: "ea-milestone-key-0000001",
        orderId: "ea-order-milestone-0001",
        customerRef,
        productId: row.productId,
        variantId: row.variantId,
        quantity: 2,
        referralCode: null,
        now: NOW_ISO,
        // Stated by the caller and ignored: the price is the founder's.
        priceCents: 1,
        totalCents: 1,
        currency: "EUR",
      },
    });
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    const placement = placed.value.record;
    const order = placement.order;
    expect(order.status).toBe("awaiting_payment");
    expect(order.customerRef).toBe(customerRef);
    // The reservation is against the exact release the customer was shown.
    expect(placement.releaseId).toBe("rel-milestone-0001");
    expect(placement.productVersion).toBe(earlyAccessReleaseVersion(row));
    // The caller's stated money was discarded entirely.
    expect(placement.currency).toBe("USD");
    expect(placement.subtotalCents).toBe(49_800);
    // Twenty percent applies at three units only, so two units carry no discount.
    expect(placement.discountCents).toBe(0);
    expect(placement.totalCents).toBe(49_800);

    // The same idempotency key must not create a second order.
    const replay = await createEarlyAccessOrder({
      orders,
      rows: [row],
      releases: [...releases],
      request: {
        idempotencyKey: "ea-milestone-key-0000001",
        orderId: "ea-order-milestone-0001",
        customerRef,
        productId: row.productId,
        variantId: row.variantId,
        quantity: 2,
        referralCode: null,
        now: NOW_ISO,
      },
    });
    expect(replay.ok).toBe(true);
    if (replay.ok) expect(replay.value.record.order.orderId).toBe(order.orderId);

    // -----------------------------------------------------------------------
    // 9 + 10. Invoice, and a unique payment reference.
    // -----------------------------------------------------------------------
    const invoices = new InMemoryEarlyAccessInvoiceRepository();
    const issued = await createEarlyAccessInvoice({
      invoices,
      order: placement,
      now: NOW_ISO,
    });
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    const invoice = issued.value.invoice;
    expect(invoice.orderId).toBe(order.orderId);
    expect(invoice.totalCents).toBe(placement.totalCents);
    expect(invoice.paymentReference.length).toBeGreaterThan(0);

    // Derived from the order, so one order can only ever have one reference to
    // reconcile a manual payment against.
    const reIssued = await createEarlyAccessInvoice({
      invoices,
      order: placement,
      now: NOW_ISO,
    });
    expect(reIssued.ok).toBe(true);
    if (reIssued.ok) {
      expect(reIssued.value.invoice.paymentReference).toBe(invoice.paymentReference);
    }

    // -----------------------------------------------------------------------
    // 11. The customer submits payment proof.
    // -----------------------------------------------------------------------
    const proof = describeProofSubmission({
      order,
      proofId: "prf_milestone",
      filename: "zelle-transfer.webp",
      contentType: "image/webp",
      byteSize: 184_233,
      submittedAt: "2026-08-04T12:30:00.000Z",
      method: "zelle",
    });
    expect(proof.ok).toBe(true);
    if (!proof.ok) return;

    // -----------------------------------------------------------------------
    // 12. THE ORDER REMAINS UNPAID. Four separate negative assertions.
    // -----------------------------------------------------------------------
    const afterProof = proof.value.transition;
    expect(afterProof.from).toBe("awaiting_payment");
    expect(afterProof.to).toBe("payment_under_review");

    // (a) not paid
    expect(afterProof.to).not.toBe("payment_verified");
    const stored = await orders.findByOrderId(order.orderId);
    expect(stored?.status).not.toBe("payment_verified");

    // (b) no receipt: the proof result carries nothing receipt-shaped
    const serialized = JSON.stringify(proof.value);
    expect(serialized).not.toMatch(/receipt/i);

    // (c) the supplier is NOT released. buildSupplierReleasePacket refuses any
    //     order that is not payment_verified, so an under-review order cannot
    //     reach a supplier even if a caller tries.
    const supplierAttempt = buildSupplierReleasePacket(
      { ...order, status: "payment_under_review" },
      {
        supplierId: "sup_apex",
        supplierSku: "APEX-CLEAN-10",
        recipient: {
          recipientName: "Milestone Buyer",
          line1: "1 Example Street",
          line2: null,
          city: "Houston",
          region: "TX",
          postalCode: "77001",
          country: "US",
        },
      },
    );
    expect(supplierAttempt.ok).toBe(false);

    // (d) no commission accrues from a proof
    expect(serialized).not.toMatch(/commission/i);

    // And the acknowledgement a customer receives must not read as a receipt.
    const acknowledgement = recordManualAction({
      kind: "customer_support",
      subjectId: order.orderId,
      actor: "Samuel Boadu",
      at: "2026-08-04T12:31:00.000Z",
      channel: "email",
      externalReference: null,
      priorStatus: "awaiting_payment",
      newStatus: "payment_under_review",
      note: "Acknowledged the proof. This is not a receipt; payment is under review.",
    });
    expect(acknowledgement.ok).toBe(true);
    if (acknowledgement.ok) {
      expect(acknowledgement.value.note).toMatch(/not a receipt/i);
      expect(acknowledgement.value.newStatus).toBe("payment_under_review");
    }
  });
});
