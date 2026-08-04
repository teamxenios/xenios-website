import { isEarlyAccessPaymentOptionCode } from "@shared/research/early-access-payment-options";

import type { EarlyAccessCatalogRow } from "../catalog/early-access-catalog";
import {
  decideEarlyAccessRelease,
  type EarlyAccessReleaseHold,
  type EarlyAccessReleaseLedger,
} from "../release/founder-release";
import type { EarlyAccessCatalogSource } from "../release/release-routes";
import type { EarlyAccessSessionCheck } from "../private-access-routes";
import {
  EARLY_ACCESS_CURRENCIES,
  EARLY_ACCESS_MAX_QUANTITY,
  EARLY_ACCESS_MIN_QUANTITY,
} from "../commerce/early-access-order";
import { carriesAnyKey, isOneOf, isSafeIdentifier } from "../commerce/input-guards";
import {
  createEarlyAccessOrder,
  isEarlyAccessIdempotencyKey,
  type EarlyAccessOrderInsert,
  type EarlyAccessOrderRepository,
  type EarlyAccessReleaseOrder,
} from "../commerce/order-service";
import {
  createEarlyAccessInvoice,
  type EarlyAccessInvoiceInsert,
  type EarlyAccessInvoiceRepository,
  type EarlyAccessReleaseInvoice,
} from "../commerce/invoice-service";
import {
  EARLY_ACCESS_PROOF_MAX_BYTES,
  PROOF_BYTE_BEARING_KEYS,
} from "../commerce/payment-proof";
import { describeProofAttachment, type EarlyAccessProofRecord } from "../commerce/proof-service";
import { applyPrivateHeaders, fail, project, readInstant, send, stampOf, type ResponsePort } from "./http";
import { isEarlyAccessOrderNumber } from "./order-number";
import type {
  EarlyAccessAgreementGate,
  EarlyAccessAuditSink,
  EarlyAccessCustomer,
  EarlyAccessIdentityDirectory,
  EarlyAccessProofStorage,
  EarlyAccessReferralResolver,
  EarlyAccessShippingPolicy,
  EarlyAccessSupplierDirectory,
} from "./ports";
import { readShippingDestination } from "./ports";
import type { EarlyAccessCommerceStore, EarlyAccessPlacement } from "./store";

/**
 * The customer half of Early Access commerce over HTTP.
 *
 * Four routes: place an order, read one back, read its invoice, and submit proof
 * that a manual payment was sent. Everything that costs money is decided by the
 * commerce domain from server-held facts; this file decides only who is asking,
 * what they are allowed to see, and in what order the refusals are computed.
 *
 * THREE PROPERTIES THE SHAPE ENFORCES RATHER THAN PROMISES
 *
 * 1. A PRICE CANNOT ARRIVE FROM A BROWSER. The request is projected onto a fixed
 *    key list that contains no amount, no total, and no referral code, so those
 *    fields are not argued with: they are never read. The one money field the
 *    client may send is the price it DISPLAYED, and it is used only to refuse the
 *    order when the server's price has moved.
 *
 * 2. A SESSION IS NOT AN IDENTITY. The Early Access gate is one shared password
 *    for a whole deployment, so "authenticated" says the caller may be here and
 *    says nothing about which customer they are. Every route resolves the
 *    customer separately and authorizes each order against that customer, which
 *    is what stops the shared password from being a master key over the order
 *    book.
 *
 * 3. AN ORDER AND ITS INVOICE ARE ONE FACT. The domain services run against
 *    staging repositories that read through to the durable store and buffer their
 *    writes, so nothing is durable until one commit takes the order, the money
 *    snapshot, and the invoice together. There is no window in which a customer
 *    owes money for an order that has no invoice.
 */

// ---------------------------------------------------------------------------
// The refusal vocabulary
// ---------------------------------------------------------------------------

/**
 * Every reason an order can be refused, in the order the checks run.
 *
 * The codes are stable and machine-readable because the storefront has to react
 * differently to each: a stale price re-renders the unit, a missing agreement
 * opens the agreement, a held product is not something the customer can fix.
 */
export const EARLY_ACCESS_ORDER_FAILURES = Object.freeze([
  "SESSION_REQUIRED",
  "IDENTITY_REQUIRED",
  "AGREEMENT_REQUIRED",
  "PRODUCT_HELD",
  "RELEASE_REQUIRED",
  "RELEASE_STALE",
  "RELEASE_REVOKED",
  "PRICE_CHANGED",
  "QUANTITY_EXCEEDED",
  "SUPPLIER_UNAVAILABLE",
  "SHIPPING_UNAVAILABLE",
  "PAYABLE_TOTAL_INVALID",
] as const);

export type EarlyAccessOrderFailure = (typeof EARLY_ACCESS_ORDER_FAILURES)[number];

/**
 * The order is refused with a state code, not created and then apologised for.
 * 409 for "the server's state disagrees with what you were shown", 403 for "you
 * are here but not permitted", 422 for arithmetic that did not hold.
 */
const ORDER_FAILURE_STATUS: Readonly<Record<EarlyAccessOrderFailure, number>> = Object.freeze({
  SESSION_REQUIRED: 401,
  IDENTITY_REQUIRED: 403,
  AGREEMENT_REQUIRED: 403,
  PRODUCT_HELD: 409,
  RELEASE_REQUIRED: 409,
  RELEASE_STALE: 409,
  RELEASE_REVOKED: 409,
  PRICE_CHANGED: 409,
  QUANTITY_EXCEEDED: 409,
  SUPPLIER_UNAVAILABLE: 409,
  SHIPPING_UNAVAILABLE: 409,
  PAYABLE_TOTAL_INVALID: 422,
});

function refuse(
  response: ResponsePort,
  code: EarlyAccessOrderFailure,
  detail?: Readonly<Record<string, unknown>>,
): void {
  fail(response, ORDER_FAILURE_STATUS[code], code, detail);
}

/**
 * Map a founder-release hold onto the customer vocabulary.
 *
 * Typed against the hold union so a hold added to the bridge later is a compile
 * error here rather than a default branch that lets an order through.
 *
 * An EXPIRED release reports as stale on purpose: both mean the decision the
 * customer is buying under is no longer the current one, and the storefront's
 * correct reaction is the same in both cases (go back and look again). The
 * distinction is an operator's, and it stays in the release ledger.
 */
function holdFailure(hold: EarlyAccessReleaseHold): EarlyAccessOrderFailure {
  switch (hold) {
    case "NO_FOUNDER_RELEASE":
      return "RELEASE_REQUIRED";
    case "RELEASE_REVOKED":
      return "RELEASE_REVOKED";
    case "RELEASE_STALE":
      return "RELEASE_STALE";
    case "RELEASE_EXPIRED":
      return "RELEASE_STALE";
    case "NONWAIVABLE_BLOCKER":
      return "PRODUCT_HELD";
    case "BLOCKERS_NOT_WAIVED":
      return "PRODUCT_HELD";
  }
}

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface EarlyAccessOrderRouteDependencies {
  /**
   * The SAME resolver the session endpoint and the catalog use. There is one
   * definition of "is this cookie good", and a second one here would eventually
   * answer a cookie the session endpoint would reject.
   */
  readonly resolveSession: (cookieHeader: unknown) => Promise<EarlyAccessSessionCheck>;
  readonly catalog: EarlyAccessCatalogSource;
  readonly releases: EarlyAccessReleaseLedger;
  readonly store: EarlyAccessCommerceStore;
  readonly identity: EarlyAccessIdentityDirectory;
  readonly agreements: EarlyAccessAgreementGate;
  readonly suppliers: EarlyAccessSupplierDirectory;
  readonly shipping: EarlyAccessShippingPolicy;
  readonly referrals: EarlyAccessReferralResolver;
  readonly proofStorage: EarlyAccessProofStorage;
  readonly audit: EarlyAccessAuditSink;
  /** Epoch milliseconds. */
  readonly now: () => number;
  readonly orderNumber: () => string;
  readonly proofId: () => string;
}

// ---------------------------------------------------------------------------
// Staging repositories: read through, buffer the write
// ---------------------------------------------------------------------------

/**
 * The order repository the domain service writes into during a placement.
 *
 * Reads go to the durable store, so the service's own idempotency and conflict
 * logic sees real history. The write is buffered, so the service can compute the
 * whole order without anything becoming durable before the money snapshot and the
 * invoice have also been produced. This is the unit-of-work seam, and it is why
 * "everything persists or nothing does" is true of the route rather than hoped for.
 */
class StagingOrderRepository implements EarlyAccessOrderRepository {
  constructor(private readonly store: EarlyAccessCommerceStore) {}

  async findByIdempotencyKey(idempotencyKey: string): Promise<EarlyAccessReleaseOrder | null> {
    const placement = await this.store.placementByIdempotencyKey(idempotencyKey);
    return placement === null ? null : placement.order;
  }

  async findByOrderId(orderId: string): Promise<EarlyAccessReleaseOrder | null> {
    const placement = await this.store.placementByOrderNumber(orderId);
    return placement === null ? null : placement.order;
  }

  async insert(record: EarlyAccessReleaseOrder): Promise<EarlyAccessOrderInsert> {
    return Object.freeze({ inserted: true as const, record });
  }
}

/** The same idea for the invoice: a brand-new order has none, and the write waits. */
class StagingInvoiceRepository implements EarlyAccessInvoiceRepository {
  async findByOrderId(): Promise<EarlyAccessReleaseInvoice | null> {
    return null;
  }

  async insert(invoice: EarlyAccessReleaseInvoice): Promise<EarlyAccessInvoiceInsert> {
    return Object.freeze({ inserted: true as const, invoice });
  }
}

// ---------------------------------------------------------------------------
// The money snapshot
// ---------------------------------------------------------------------------

/**
 * Whether the immutable money snapshot on a placed order holds together.
 *
 * Checked at the route, before anything is durable, because every number below
 * is derived independently by a different module and they must agree exactly:
 * the line total from unit price times quantity, the subtotal stored beside it,
 * the bundle discount, and the amount the customer will actually be asked to pay.
 *
 * FABLE-RM: this is the site the money lane replaces. `totalCents` is what the
 * customer owes and `order.orderTotalCents` is the pre-discount subtotal; when
 * `payableTotalCents` / `OrderMoneySnapshot` land, this function becomes a check
 * over that one object and the two names stop needing to be told apart by hand.
 */
export function earlyAccessMoneySnapshotHolds(record: EarlyAccessReleaseOrder): boolean {
  const subtotal = record.subtotalCents;
  const discount = record.discountCents;
  const payable = record.totalCents;
  return (
    Number.isSafeInteger(subtotal) &&
    Number.isSafeInteger(discount) &&
    Number.isSafeInteger(payable) &&
    subtotal > 0 &&
    discount >= 0 &&
    discount < subtotal &&
    payable === subtotal - discount &&
    payable > 0 &&
    record.order.line.lineTotalCents === subtotal &&
    record.order.orderTotalCents === subtotal &&
    record.currency === record.order.currency
  );
}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

/**
 * The canonical order response.
 *
 * Built by explicit construction from an allowlist rather than by deleting
 * fields from the stored record, so a field added to the placement later cannot
 * leak to a customer by default. Absent on purpose: the release id, the product
 * version, the supplier, the affiliate attribution, and the customer reference.
 */
function orderView(placement: EarlyAccessPlacement): Record<string, unknown> {
  const record = placement.order;
  return {
    orderNumber: placement.orderNumber,
    placedAt: placement.placedAt,
    paymentState: placement.paymentState,
    unit: {
      sku: record.order.line.sku,
      quantity: record.order.line.quantity,
    },
    money: {
      currency: record.currency,
      unitPriceCents: record.order.line.unitPriceCents,
      subtotalCents: record.subtotalCents,
      discountCents: record.discountCents,
      discountLabel: record.discountCents > 0 ? record.tier.label : null,
      /** The amount owed. The invoice and the confirmation both quote this one. */
      payableTotalCents: record.totalCents,
    },
    invoice: {
      invoiceNumber: placement.invoice.invoiceNumber,
      paymentReference: placement.invoice.paymentReference,
      issuedAt: placement.invoice.issuedAt,
    },
    shipTo: { ...placement.shipTo },
  };
}

function invoiceView(placement: EarlyAccessPlacement): Record<string, unknown> {
  const invoice = placement.invoice;
  return {
    invoiceNumber: invoice.invoiceNumber,
    orderNumber: placement.orderNumber,
    issuedAt: invoice.issuedAt,
    status: invoice.status,
    lines: invoice.lines.map((line) => ({ ...line })),
    subtotalCents: invoice.subtotalCents,
    discountCents: invoice.discountCents,
    discountLabel: invoice.discountLabel,
    payableTotalCents: invoice.totalCents,
    currency: invoice.currency,
    paymentReference: invoice.paymentReference,
    instructions: invoice.instructions,
  };
}

/** What a customer may know about their own proofs. Never a storage handle. */
function proofView(record: EarlyAccessProofRecord): Record<string, unknown> {
  return {
    submittedAt: record.uploadedAt,
    filename: record.filename,
    contentType: record.contentType,
    byteSize: record.byteSize,
    method: record.method,
    superseded: false,
  };
}

// ---------------------------------------------------------------------------
// Shared front matter: session, then identity
// ---------------------------------------------------------------------------

type Caller =
  | Readonly<{ ok: true; customer: EarlyAccessCustomer; nowMs: number }>
  | Readonly<{ ok: false }>;

/**
 * Resolve the caller for every route below, in the one correct order.
 *
 * The session is checked first because a caller with no session must learn
 * nothing at all, including whether an identity exists. The customer is resolved
 * second and is the thing every later authorization compares against.
 */
async function resolveCaller(
  deps: EarlyAccessOrderRouteDependencies,
  cookieHeader: unknown,
  response: ResponsePort,
): Promise<Caller> {
  const session = await deps.resolveSession(cookieHeader);
  if (!session.authenticated) {
    refuse(response, "SESSION_REQUIRED");
    return Object.freeze({ ok: false as const });
  }

  const nowMs = readInstant(deps.now);
  if (nowMs === null) {
    fail(response, 503, "UNAVAILABLE");
    return Object.freeze({ ok: false as const });
  }

  const customer = await deps.identity.resolve({ cookieHeader });
  if (customer === null || !isSafeIdentifier(customer.customerRef)) {
    refuse(response, "IDENTITY_REQUIRED");
    return Object.freeze({ ok: false as const });
  }

  return Object.freeze({ ok: true as const, customer, nowMs });
}

/**
 * The order this customer owns, or nothing.
 *
 * A cross-customer read and a genuinely missing order answer IDENTICALLY. A 403
 * would confirm that the order number exists and belongs to someone, which turns
 * the lookup into an oracle even though it refuses to serve the body.
 */
async function ownedPlacement(
  deps: EarlyAccessOrderRouteDependencies,
  orderNumber: unknown,
  customer: EarlyAccessCustomer,
): Promise<EarlyAccessPlacement | null> {
  if (!isEarlyAccessOrderNumber(orderNumber)) return null;
  const placement = await deps.store.placementByOrderNumber(orderNumber);
  if (placement === null) return null;
  if (placement.customerRef !== customer.customerRef) return null;
  return placement;
}

// ---------------------------------------------------------------------------
// POST /orders
// ---------------------------------------------------------------------------

/**
 * The fields the route reads. Nothing else on the body is carried forward.
 *
 * Note what is absent and why. `orderId`: a customer naming their own order can
 * collide with another customer's. `customerRef`: identity is resolved from the
 * credential, never claimed. `referralCode`: a commission is real money moving on
 * a claim, so the server decides which referral applies. Every price and total
 * key: the founder release is the only price.
 */
const ORDER_BODY_KEYS = [
  "idempotencyKey",
  "productId",
  "variantId",
  "quantity",
  "expectedUnitPriceCents",
  "expectedCurrency",
  "shipTo",
] as const;

export function createEarlyAccessOrderPlacementRoute(deps: EarlyAccessOrderRouteDependencies) {
  return async (
    request: { cookieHeader?: unknown; body?: unknown },
    response: ResponsePort,
  ): Promise<void> => {
    try {
      applyPrivateHeaders(response);

      const caller = await resolveCallerForPlacement(deps, request, response);
      if (caller === null) return;
      const { customer, nowMs, body, shipTo, quantity } = caller;
      const now = stampOf(nowMs);

      // A replay is answered before the catalog and the ledger are consulted, so a
      // customer who double taps gets the order they placed even if the release
      // behind it has since been revoked. What was sold stays sold.
      const prior = await deps.store.placementByIdempotencyKey(body.idempotencyKey as string);
      if (prior !== null) {
        if (!replays(prior, customer, body, quantity)) {
          fail(response, 409, "IDEMPOTENCY_CONFLICT");
          return;
        }
        send(response, 200, { ok: true, replayed: true, order: orderView(prior) });
        return;
      }

      // PRODUCT CONTROL. One row, or the unit is not something we can sell. An
      // absent row and an ambiguous one answer the same as a held one, so the
      // endpoint does not report what is in the catalog to someone probing it.
      const projection = await deps.catalog.load(new Date(nowMs));
      const matches = projection.rows.filter(
        (row) => row.productId === body.productId && row.variantId === body.variantId,
      );
      if (matches.length !== 1) {
        refuse(response, "PRODUCT_HELD");
        return;
      }
      const row = matches[0] as EarlyAccessCatalogRow;

      // THE FOUNDER RELEASE. Stale, revoked, expired, and non-waivable blockers
      // are all decided by the bridge, which is the only thing that may price an
      // Early Access unit at all.
      const releases = await deps.releases.all();
      const decision = decideEarlyAccessRelease({ row, releases, now: nowMs });
      if (!decision.released) {
        refuse(response, holdFailure(decision.hold));
        return;
      }

      // THE PRICE. The customer echoes what they were shown; the server compares
      // it against what it resolved. A moved price re-renders the unit instead of
      // charging an amount nobody agreed to.
      if (
        decision.priceCents !== body.expectedUnitPriceCents ||
        decision.currency !== body.expectedCurrency
      ) {
        refuse(response, "PRICE_CHANGED", {
          unitPriceCents: decision.priceCents,
          currency: decision.currency,
        });
        return;
      }

      // THE QUANTITY. The portal ceiling and the per-unit supply cap Product
      // Control recorded, which binds even where the founder waived blockers.
      if (quantity < EARLY_ACCESS_MIN_QUANTITY || quantity > EARLY_ACCESS_MAX_QUANTITY) {
        refuse(response, "QUANTITY_EXCEEDED", { maximum: EARLY_ACCESS_MAX_QUANTITY });
        return;
      }
      if (row.quantityLimit !== null && quantity > row.quantityLimit) {
        refuse(response, "QUANTITY_EXCEEDED", { maximum: row.quantityLimit });
        return;
      }

      // THE SUPPLIER AND THE ROUTE TO THE CUSTOMER. Promising a box we have no
      // supplier for, or an address we do not serve, is a promise made with the
      // customer's money already taken.
      if (!row.supplierReady) {
        refuse(response, "SUPPLIER_UNAVAILABLE");
        return;
      }
      const supplier = await deps.suppliers.forUnit(row.productId, row.variantId);
      if (
        supplier === null ||
        !isSafeIdentifier(supplier.supplierId) ||
        !isSafeIdentifier(supplier.supplierSku)
      ) {
        refuse(response, "SUPPLIER_UNAVAILABLE");
        return;
      }
      if (row.availability !== "available") {
        refuse(response, "SHIPPING_UNAVAILABLE");
        return;
      }
      if (!(await deps.shipping.serves(shipTo))) {
        refuse(response, "SHIPPING_UNAVAILABLE");
        return;
      }

      // THE REFERRAL, resolved from the server's own record of this customer.
      const attribution = await deps.referrals.forCustomer(customer.customerRef);

      const orderNumber = deps.orderNumber();
      if (!isEarlyAccessOrderNumber(orderNumber)) {
        fail(response, 503, "UNAVAILABLE");
        return;
      }

      // THE ORDER AND ITS LINES. The service re-decides the release from the same
      // pure function over the same inputs, so it cannot disagree with the check
      // above, and it remains the only writer of the money.
      const placed = await createEarlyAccessOrder({
        orders: new StagingOrderRepository(deps.store),
        rows: projection.rows,
        releases: [...releases],
        request: {
          idempotencyKey: body.idempotencyKey,
          orderId: orderNumber,
          customerRef: customer.customerRef,
          productId: row.productId,
          variantId: row.variantId,
          quantity,
          referralCode: attribution === null ? null : attribution.referralCode,
          now,
        },
      });
      if (!placed.ok) {
        // The route already answered every refusal the service can raise for a
        // reason a customer can act on. Anything left is a disagreement between
        // two evaluations of the same facts, which is a server fault.
        fail(response, 503, "UNAVAILABLE");
        return;
      }
      const record = placed.value.record;

      // THE IMMUTABLE MONEY SNAPSHOT, checked while nothing is durable yet.
      if (!earlyAccessMoneySnapshotHolds(record)) {
        refuse(response, "PAYABLE_TOTAL_INVALID");
        return;
      }

      // THE INVOICE AND THE PAYMENT REFERENCE. Both derived from the order, so
      // one order can only ever carry one of each.
      const issued = await createEarlyAccessInvoice({
        order: record,
        now,
        invoices: new StagingInvoiceRepository(),
      });
      if (!issued.ok) {
        if (issued.code === "totals_disagree") {
          refuse(response, "PAYABLE_TOTAL_INVALID");
          return;
        }
        fail(response, 503, "UNAVAILABLE");
        return;
      }

      const placement: EarlyAccessPlacement = Object.freeze({
        orderNumber,
        customerRef: customer.customerRef,
        idempotencyKey: body.idempotencyKey,
        order: record,
        invoice: issued.value.invoice,
        shipTo,
        supplier,
        attribution,
        paymentState: "awaiting_payment" as const,
        placedAt: now,
      });

      const committed = await deps.store.commitPlacement(placement);
      if (!committed.committed) {
        if (committed.reason === "order_number_taken") {
          // Eighty bits collided, or the generator is broken. Either way this
          // request must not be answered with somebody else's order.
          fail(response, 503, "UNAVAILABLE");
          return;
        }
        // The key was claimed between the read above and this write. The
        // incumbent is the order that exists, so it answers.
        const incumbent = committed.placement;
        if (!replays(incumbent, customer, body, quantity)) {
          fail(response, 409, "IDEMPOTENCY_CONFLICT");
          return;
        }
        send(response, 200, { ok: true, replayed: true, order: orderView(incumbent) });
        return;
      }

      await recordAudit(deps, {
        event: "early_access.order.placed",
        orderNumber,
        actor: customer.customerRef,
        at: now,
        detail: {
          payableTotalCents: record.totalCents,
          currency: record.currency,
          quantity,
          releaseId: record.releaseId,
        },
      });

      send(response, 201, { ok: true, replayed: false, order: orderView(placement) });
    } catch {
      unavailable(response);
    }
  };
}

type PlacementCaller = Readonly<{
  customer: EarlyAccessCustomer;
  nowMs: number;
  body: Readonly<{
    idempotencyKey: string;
    productId: string;
    variantId: string;
    expectedUnitPriceCents: number;
    expectedCurrency: string;
  }>;
  shipTo: ReturnType<typeof readShippingDestination> & object;
  quantity: number;
}>;

/**
 * Session, then the request shape, then identity, then agreements.
 *
 * The request is read between the two authorization steps rather than before
 * them because a malformed body is the customer's own problem and telling them
 * about it costs nothing, while an unauthenticated caller must learn nothing at
 * all. The agreement check runs last of the four so a caller who is not the
 * customer never learns whether that customer has signed anything.
 */
async function resolveCallerForPlacement(
  deps: EarlyAccessOrderRouteDependencies,
  request: { cookieHeader?: unknown; body?: unknown },
  response: ResponsePort,
): Promise<PlacementCaller | null> {
  const session = await deps.resolveSession(request?.cookieHeader);
  if (!session.authenticated) {
    refuse(response, "SESSION_REQUIRED");
    return null;
  }

  const nowMs = readInstant(deps.now);
  if (nowMs === null) {
    fail(response, 503, "UNAVAILABLE");
    return null;
  }

  const body = project(request?.body, ORDER_BODY_KEYS);
  if (body === null) {
    fail(response, 400, "REQUEST_INVALID");
    return null;
  }
  if (!isEarlyAccessIdempotencyKey(body.idempotencyKey)) {
    fail(response, 400, "REQUEST_INVALID", { field: "idempotencyKey" });
    return null;
  }
  if (!isSafeIdentifier(body.productId) || !isSafeIdentifier(body.variantId)) {
    fail(response, 400, "REQUEST_INVALID", { field: "productId" });
    return null;
  }
  // The SHAPE of the quantity is a request problem; its SIZE is a state problem
  // and is answered later, in the canonical order, as QUANTITY_EXCEEDED.
  if (typeof body.quantity !== "number" || !Number.isSafeInteger(body.quantity)) {
    fail(response, 400, "REQUEST_INVALID", { field: "quantity" });
    return null;
  }
  if (
    typeof body.expectedUnitPriceCents !== "number" ||
    !Number.isSafeInteger(body.expectedUnitPriceCents) ||
    body.expectedUnitPriceCents <= 0
  ) {
    fail(response, 400, "REQUEST_INVALID", { field: "expectedUnitPriceCents" });
    return null;
  }
  if (!isOneOf(body.expectedCurrency, EARLY_ACCESS_CURRENCIES)) {
    fail(response, 400, "REQUEST_INVALID", { field: "expectedCurrency" });
    return null;
  }
  const shipTo = readShippingDestination(body.shipTo);
  if (shipTo === null) {
    fail(response, 400, "REQUEST_INVALID", { field: "shipTo" });
    return null;
  }

  const customer = await deps.identity.resolve({ cookieHeader: request?.cookieHeader });
  if (customer === null || !isSafeIdentifier(customer.customerRef)) {
    refuse(response, "IDENTITY_REQUIRED");
    return null;
  }

  if (!(await deps.agreements.accepted(customer.customerRef))) {
    refuse(response, "AGREEMENT_REQUIRED");
    return null;
  }

  return Object.freeze({
    customer,
    nowMs,
    body: Object.freeze({
      idempotencyKey: body.idempotencyKey,
      productId: body.productId,
      variantId: body.variantId,
      expectedUnitPriceCents: body.expectedUnitPriceCents,
      expectedCurrency: body.expectedCurrency,
    }),
    shipTo,
    quantity: body.quantity,
  });
}

/**
 * Whether a stored order is the one this request is replaying.
 *
 * An idempotency key answers "have I already done this", so the same key for a
 * different unit, quantity, or customer is not a replay: it is two orders wearing
 * one name, and answering with the first is how a customer is handed something
 * they did not ask for. The customer comparison is the one that matters most: a
 * key guessed or copied from someone else must never return their order.
 */
function replays(
  stored: EarlyAccessPlacement,
  customer: EarlyAccessCustomer,
  body: PlacementCaller["body"],
  quantity: number,
): boolean {
  return (
    stored.customerRef === customer.customerRef &&
    stored.order.order.line.productId === body.productId &&
    stored.order.order.line.variantId === body.variantId &&
    stored.order.order.line.quantity === quantity
  );
}

// ---------------------------------------------------------------------------
// GET /orders/:orderNumber and GET /orders/:orderNumber/invoice
// ---------------------------------------------------------------------------

export function createEarlyAccessOrderLookupRoute(deps: EarlyAccessOrderRouteDependencies) {
  return async (
    request: { cookieHeader?: unknown; orderNumber?: unknown },
    response: ResponsePort,
  ): Promise<void> => {
    try {
      applyPrivateHeaders(response);
      const caller = await resolveCaller(deps, request?.cookieHeader, response);
      if (!caller.ok) return;

      const placement = await ownedPlacement(deps, request?.orderNumber, caller.customer);
      if (placement === null) {
        fail(response, 404, "ORDER_NOT_FOUND");
        return;
      }

      const [proofs, settlement, dispatch] = await Promise.all([
        deps.store.proofs(placement.orderNumber),
        deps.store.settlement(placement.orderNumber),
        deps.store.dispatch(placement.orderNumber),
      ]);

      const views = proofs.map((intake) => proofView(intake.record));
      const current = views.length === 0 ? null : views[views.length - 1];
      for (let index = 0; index < views.length - 1; index += 1) {
        (views[index] as Record<string, unknown>).superseded = true;
      }

      send(response, 200, {
        ok: true,
        order: orderView(placement),
        payment: {
          state: placement.paymentState,
          paid: settlement !== null,
          proofs: views,
          currentProof: current,
        },
        // Present only once a named human confirmed the money arrived.
        receipt:
          settlement === null
            ? null
            : {
                receiptId: settlement.receipt.receiptId,
                payableTotalCents: settlement.receipt.payableTotalCents,
                currency: settlement.receipt.currency,
                issuedAt: settlement.receipt.issuedAt,
              },
        fulfilment: {
          released: settlement !== null,
          tracking: dispatch.tracking.map((entry) => ({
            carrier: entry.carrier,
            trackingNumber: entry.trackingNumber,
            recordedAt: entry.recordedAt,
          })),
          shippedAt: dispatch.fulfillment === null ? null : dispatch.fulfillment.fulfilledAt,
        },
      });
    } catch {
      unavailable(response);
    }
  };
}

export function createEarlyAccessInvoiceRoute(deps: EarlyAccessOrderRouteDependencies) {
  return async (
    request: { cookieHeader?: unknown; orderNumber?: unknown },
    response: ResponsePort,
  ): Promise<void> => {
    try {
      applyPrivateHeaders(response);
      const caller = await resolveCaller(deps, request?.cookieHeader, response);
      if (!caller.ok) return;

      const placement = await ownedPlacement(deps, request?.orderNumber, caller.customer);
      if (placement === null) {
        fail(response, 404, "ORDER_NOT_FOUND");
        return;
      }

      send(response, 200, { ok: true, invoice: invoiceView(placement) });
    } catch {
      unavailable(response);
    }
  };
}

// ---------------------------------------------------------------------------
// POST /orders/:orderNumber/payment-proof
// ---------------------------------------------------------------------------

/**
 * The formats a payment proof may take, and the extensions each one may wear.
 *
 * Both halves are required and both must agree. A declared type is a claim the
 * uploader makes; an extension is a claim the filename makes; and the interesting
 * attack is the one where they disagree, so an executable named for an image and
 * an image named for a document are both refused here.
 *
 * WEBP is listed because a phone screenshot is commonly webp and refusing it
 * would send customers away to convert a file by hand. The domain allowlist in
 * payment-proof.ts now carries webp too, so this route and the layer that
 * actually stores agree; a regression test pins the two lists together, because
 * a silent divergence accepts a proof at the door and refuses it deeper.
 */
export const EARLY_ACCESS_PROOF_UPLOAD_TYPES: Readonly<Record<string, readonly string[]>> =
  Object.freeze({
    "image/jpeg": Object.freeze([".jpg", ".jpeg"]),
    "image/png": Object.freeze([".png"]),
    "image/webp": Object.freeze([".webp"]),
    "application/pdf": Object.freeze([".pdf"]),
  });

/** One definition of the ceiling, taken from the domain rather than restated. */
export const EARLY_ACCESS_PROOF_UPLOAD_MAX_BYTES = EARLY_ACCESS_PROOF_MAX_BYTES;

const SHA256_HEX = /^[a-f0-9]{64}$/;

const PROOF_BODY_KEYS = ["filename", "contentType", "byteSize", "sha256", "method"] as const;

/**
 * Whether a declared content type and a filename agree, both against the
 * allowlist. An extension that belongs to a different listed type is refused
 * rather than trusted, so the two claims cannot be played off each other.
 */
export function earlyAccessProofFormatAgrees(contentType: unknown, filename: unknown): boolean {
  if (typeof contentType !== "string" || typeof filename !== "string") return false;
  const extensions = EARLY_ACCESS_PROOF_UPLOAD_TYPES[contentType];
  if (extensions === undefined) return false;
  const lowered = filename.toLowerCase();
  return extensions.some((extension) => lowered.endsWith(extension));
}

export function createEarlyAccessPaymentProofRoute(deps: EarlyAccessOrderRouteDependencies) {
  return async (
    request: { cookieHeader?: unknown; orderNumber?: unknown; body?: unknown },
    response: ResponsePort,
  ): Promise<void> => {
    try {
      applyPrivateHeaders(response);

      // Checked before anything else is read. A caller that believes it uploaded
      // a file and did not is a worse failure than a loud refusal, and this
      // handler must never be the place bytes arrive: the object goes straight to
      // private storage, and only its metadata and digest reach this process.
      if (carriesAnyKey(request?.body, PROOF_BYTE_BEARING_KEYS)) {
        fail(response, 400, "PROOF_BYTES_SUPPLIED");
        return;
      }

      const caller = await resolveCaller(deps, request?.cookieHeader, response);
      if (!caller.ok) return;
      const now = stampOf(caller.nowMs);

      const placement = await ownedPlacement(deps, request?.orderNumber, caller.customer);
      if (placement === null) {
        fail(response, 404, "ORDER_NOT_FOUND");
        return;
      }

      const body = project(request?.body, PROOF_BODY_KEYS);
      if (body === null) {
        fail(response, 400, "REQUEST_INVALID");
        return;
      }
      if (!earlyAccessProofFormatAgrees(body.contentType, body.filename)) {
        fail(response, 415, "CONTENT_TYPE_UNSUPPORTED", {
          accepted: Object.keys(EARLY_ACCESS_PROOF_UPLOAD_TYPES),
        });
        return;
      }
      if (
        typeof body.byteSize !== "number" ||
        !Number.isSafeInteger(body.byteSize) ||
        body.byteSize < 1 ||
        body.byteSize > EARLY_ACCESS_PROOF_UPLOAD_MAX_BYTES
      ) {
        fail(response, 413, "BYTE_SIZE_INVALID", { maxBytes: EARLY_ACCESS_PROOF_UPLOAD_MAX_BYTES });
        return;
      }
      if (typeof body.sha256 !== "string" || !SHA256_HEX.test(body.sha256)) {
        fail(response, 400, "CHECKSUM_INVALID");
        return;
      }
      if (!isEarlyAccessPaymentOptionCode(body.method)) {
        fail(response, 400, "METHOD_UNSUPPORTED");
        return;
      }

      const proofId = deps.proofId();
      if (!isSafeIdentifier(proofId)) {
        fail(response, 503, "UNAVAILABLE");
        return;
      }

      const existing = await deps.store.proofs(placement.orderNumber);
      const objectKey = `${placement.orderNumber}/${proofId}`;
      const storageRef = await deps.proofStorage.reserve({
        objectKey,
        contentType: body.contentType as string,
        byteSize: body.byteSize,
        sha256: body.sha256,
      });
      if (storageRef === null) {
        fail(response, 503, "STORAGE_UNAVAILABLE");
        return;
      }

      // The proof this one replaces is read from the chain, never claimed by the
      // uploader: a customer working from a stale screen must not be able to
      // declare which proof is current.
      const prior = existing.length === 0 ? null : (existing[existing.length - 1] as { record: EarlyAccessProofRecord });
      const described = describeProofAttachment({
        order: placement.order.order,
        proofs: existing.map((intake) => intake.record),
        proofId,
        storageRef,
        filename: body.filename,
        contentType: body.contentType,
        byteSize: body.byteSize,
        method: body.method,
        uploadedBy: caller.customer.customerRef,
        uploadedAt: now,
        supersedesProofId: prior === null ? null : prior.record.proofId,
      });
      if (!described.ok) {
        proofRefusal(response, described.code);
        return;
      }

      const committed = await deps.store.commitProof({
        orderNumber: placement.orderNumber,
        record: described.value.record,
        sha256: body.sha256,
        receivedAt: now,
      });
      if (!committed.committed) {
        fail(response, 409, "PROOF_CHAIN_MOVED");
        return;
      }

      await recordAudit(deps, {
        event: "early_access.payment_proof.received",
        orderNumber: placement.orderNumber,
        actor: caller.customer.customerRef,
        at: now,
        detail: {
          contentType: described.value.record.contentType,
          byteSize: described.value.record.byteSize,
          sha256: body.sha256,
          supersededProofId: described.value.supersededProofId,
        },
      });

      // 202, and a body that cannot be mistaken for a receipt. The customer has
      // told us they sent money; nobody has confirmed that it arrived. Every
      // field that would exist if it had is present and explicitly null.
      send(response, 202, {
        ok: true,
        orderNumber: placement.orderNumber,
        received: true,
        payment: {
          state: "under_review",
          paid: false,
          verified: false,
        },
        proof: proofView(described.value.record),
        receipt: null,
        supplierOrder: null,
        commission: null,
        message:
          "We have received your payment proof. A member of the team confirms every payment " +
          "by hand after it arrives. This is not a receipt, and your order is not paid until " +
          "that confirmation reaches you.",
      });
    } catch {
      unavailable(response);
    }
  };
}

/**
 * Surface a domain proof refusal.
 *
 * `content_type_unsupported` can still arrive here after the route's own
 * allowlist passed, and today that means exactly one thing: the format is webp.
 * `EARLY_ACCESS_PROOF_CONTENT_TYPES` in commerce/payment-proof.ts lists png,
 * jpeg, and pdf only, and widening it is a change to a module this lane does not
 * own. The refusal is surfaced honestly rather than dressed up as something the
 * customer did wrong, and the route needs no change on the day the domain list
 * grows.
 */
function proofRefusal(response: ResponsePort, code: string): void {
  if (code === "content_type_unsupported" || code === "filename_invalid") {
    fail(response, 415, "CONTENT_TYPE_UNSUPPORTED", {
      accepted: Object.keys(EARLY_ACCESS_PROOF_UPLOAD_TYPES),
    });
    return;
  }
  if (code === "byte_size_invalid") {
    fail(response, 413, "BYTE_SIZE_INVALID", { maxBytes: EARLY_ACCESS_PROOF_UPLOAD_MAX_BYTES });
    return;
  }
  if (code === "proof_limit_reached") {
    fail(response, 409, "PROOF_LIMIT_REACHED");
    return;
  }
  if (code === "order_not_awaiting_payment") {
    fail(response, 409, "ORDER_NOT_AWAITING_PAYMENT");
    return;
  }
  if (code === "method_unsupported") {
    fail(response, 400, "METHOD_UNSUPPORTED");
    return;
  }
  fail(response, 400, "REQUEST_INVALID");
}

// ---------------------------------------------------------------------------
// Shared tails
// ---------------------------------------------------------------------------

/** An audit sink that throws must not change what the customer is told. */
async function recordAudit(
  deps: EarlyAccessOrderRouteDependencies,
  event: Parameters<EarlyAccessAuditSink["record"]>[0],
): Promise<void> {
  try {
    await deps.audit.record(event);
  } catch {
    // Deliberately swallowed. The fact is already durable.
  }
}

function unavailable(response: ResponsePort): void {
  try {
    fail(response, 503, "UNAVAILABLE");
  } catch {
    // The response port itself is broken; there is nothing further to do.
  }
}
