// xenios research: the member cart.
//
// A cart is a snapshot of INTENT, never a promise of availability. Every read
// re-runs eligibility, supplier-fact provenance, and stock against the catalog and
// the lot table as of the instant supplied by the caller, so a line that was fine
// when it was added comes back blocked the moment it stops being fine.
//
// Two rules drive the shape of this module:
//
//   1. Nothing a browser sends is trusted except a SKU, a quantity, and a purchase
//      mode. Prices come from the catalog on every single read.
//   2. Blocking reasons accumulate. A line reports the one code the member acts on,
//      while the cart reports the complete set an operator needs.

import {
  evaluatePurchaseEligibility,
  isMemberDisplayable,
  type CatalogProduct,
  type PurchaseBlockReason,
} from "@shared/research/catalog";
import {
  configuredStandardQuote,
  orderShippingTotalCents,
  SUBSCRIPTION_FREQUENCIES,
  type SubscriptionFrequencyDays,
} from "@shared/research/commerce";
import {
  spendableStoreCreditCents,
  type StoreCreditEntry,
} from "@shared/research/distribution";
import type {
  AddCartLineRequest,
  CartDto,
  CartLineDto,
  CommerceDenialCode,
} from "@shared/research/commerce-api";
import {
  allocateFefo,
  splitByFulfillmentOwner,
  type InventoryLot,
  type OrderLine,
} from "../inventory/lots";

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/**
 * What is persisted between requests.
 *
 * Deliberately holds no price, no display name, and no computed total. Storing a
 * price would let a stale or client-supplied number survive into checkout.
 */
export interface StoredCartLine {
  sku: string;
  quantity: number;
  purchaseMode: "one_time" | "subscription";
  subscriptionFrequencyDays?: SubscriptionFrequencyDays;
}

export interface StoredCart {
  lines: StoredCartLine[];
}

export interface CartRepository {
  load(memberId: string): StoredCart | null;
  save(memberId: string, cart: StoredCart): void;
}

export interface CartServiceDeps {
  repository: CartRepository;
  /** Keyed by SKU. The only authority on price and fulfillment owner. */
  catalog: Map<string, CatalogProduct>;
  lots: InventoryLot[];
  storeCredit: StoreCreditEntry[];
  commerceEnabled: boolean;
  quantumCommerceEnabled: boolean;
  requiredAgreementKeys: string[];
}

export type CartDenial = { ok: false; code: CommerceDenialCode; message: string };
export type CartMutation = { ok: true; cart: CartDto } | CartDenial;

export interface CartService {
  getCart(memberId: string, asOf: Date): CartDto;
  addLine(memberId: string, req: AddCartLineRequest, asOf: Date): CartMutation;
  updateLine(memberId: string, sku: string, quantity: number, asOf: Date): CartMutation;
  removeLine(memberId: string, sku: string, asOf: Date): CartDto;
  revalidate(memberId: string, asOf: Date): CartDto;
}

// ---------------------------------------------------------------------------
// Denial mapping
// ---------------------------------------------------------------------------

const ELIGIBILITY_TO_DENIAL: Readonly<Record<PurchaseBlockReason, CommerceDenialCode>> = {
  commerce_capability_disabled: "commerce_disabled",
  lane_commerce_disabled: "lane_not_purchasable",
  commerce_not_approved: "product_not_purchasable",
  availability_not_purchasable: "product_not_purchasable",
  unconfirmed_commerce_critical_facts: "unconfirmed_supplier_facts",
  quality_documentation_incomplete: "product_not_purchasable",
  subscription_not_eligible: "subscription_action_invalid",
};

/**
 * Which single code a blocked line reports. Most specific first, so a member is told
 * the thing they can actually act on rather than a downstream consequence of it.
 */
const LINE_BLOCK_PRIORITY: readonly CommerceDenialCode[] = [
  "product_not_found",
  "quantity_invalid",
  "subscription_action_invalid",
  "unconfirmed_supplier_facts",
  "commerce_disabled",
  "lane_not_purchasable",
  "product_not_purchasable",
  "insufficient_stock",
] as const;

function highestPriority(reasons: readonly CommerceDenialCode[]): CommerceDenialCode | null {
  for (const code of LINE_BLOCK_PRIORITY) {
    if (reasons.includes(code)) return code;
  }
  return reasons[0] ?? null;
}

/**
 * The per-line ceiling.
 *
 * `Number.isInteger` is true for values like 1e21, so a whole-number check alone
 * does not keep money in exact integer cents: a quantity that large drives
 * `unitPriceCents * quantity` past `Number.MAX_SAFE_INTEGER`, where addition and
 * comparison stop being exact and a total is no longer a count of cents. The stock
 * gate happens to reject such a line today, but the arithmetic invariant must not
 * depend on another gate standing in front of it.
 *
 * The bound is far above any real member order and far below the exact-integer limit.
 */
export const MAX_LINE_QUANTITY = 1000;

function isValidQuantity(quantity: number): boolean {
  return Number.isInteger(quantity) && quantity > 0 && quantity <= MAX_LINE_QUANTITY;
}

// ---------------------------------------------------------------------------
// Line evaluation
// ---------------------------------------------------------------------------

interface EvaluatedLine {
  line: CartLineDto;
  /** Null when the product is unknown or its fulfillment owner is not assigned. */
  owner: "mitch" | "xenios" | null;
  reasons: CommerceDenialCode[];
}

function evaluateLine(
  stored: StoredCartLine,
  deps: CartServiceDeps,
  asOf: Date,
): EvaluatedLine {
  const reasons: CommerceDenialCode[] = [];
  const product = deps.catalog.get(stored.sku);

  if (!product) {
    reasons.push("product_not_found");
    return {
      owner: null,
      reasons,
      line: {
        sku: stored.sku,
        displayName: stored.sku,
        quantity: stored.quantity,
        purchaseMode: stored.purchaseMode,
        ...(stored.subscriptionFrequencyDays !== undefined
          ? { subscriptionFrequencyDays: stored.subscriptionFrequencyDays }
          : {}),
        unitPriceCents: null,
        lineTotalCents: null,
        blockedReason: "product_not_found",
      },
    };
  }

  const asSubscription = stored.purchaseMode === "subscription";

  if (!isValidQuantity(stored.quantity)) {
    reasons.push("quantity_invalid");
  }

  if (
    asSubscription &&
    (stored.subscriptionFrequencyDays === undefined ||
      !SUBSCRIPTION_FREQUENCIES.includes(stored.subscriptionFrequencyDays))
  ) {
    reasons.push("subscription_action_invalid");
  }

  const eligibility = evaluatePurchaseEligibility(product, {
    productCommerceEnabled: deps.commerceEnabled,
    quantumCommerceEnabled: deps.quantumCommerceEnabled,
    asSubscription,
  });
  for (const blockReason of eligibility.blockReasons) {
    const code = ELIGIBILITY_TO_DENIAL[blockReason];
    if (!reasons.includes(code)) reasons.push(code);
  }

  // The price is read fresh from the catalog and only when its provenance permits.
  // An unconfirmed price serializes as null and blocks checkout; it never becomes 0.
  const priceFact = product.facts.priceCents;
  const priceDisplayable = isMemberDisplayable(priceFact);
  if (!priceDisplayable && !reasons.includes("unconfirmed_supplier_facts")) {
    reasons.push("unconfirmed_supplier_facts");
  }

  const unitPriceCents = priceDisplayable ? priceFact.value : null;
  const lineTotalCents =
    unitPriceCents !== null && isValidQuantity(stored.quantity)
      ? unitPriceCents * stored.quantity
      : null;

  // A lot that is expired, quarantined, or carries an unknown expiry contributes
  // nothing here, because allocateFefo refuses it before counting it.
  if (isValidQuantity(stored.quantity)) {
    const allocation = allocateFefo(deps.lots, stored.sku, stored.quantity, asOf);
    if (!allocation.ok) reasons.push("insufficient_stock");
  }

  const owner = product.fulfillmentOwner === "not_assigned" ? null : product.fulfillmentOwner;
  if (owner === null && !reasons.includes("product_not_purchasable")) {
    reasons.push("product_not_purchasable");
  }

  return {
    owner,
    reasons,
    line: {
      sku: product.sku,
      displayName: product.displayName,
      quantity: stored.quantity,
      purchaseMode: stored.purchaseMode,
      ...(stored.subscriptionFrequencyDays !== undefined
        ? { subscriptionFrequencyDays: stored.subscriptionFrequencyDays }
        : {}),
      unitPriceCents,
      lineTotalCents,
      blockedReason: highestPriority(reasons),
    },
  };
}

// ---------------------------------------------------------------------------
// Cart assembly
// ---------------------------------------------------------------------------

function buildCart(memberId: string, stored: StoredCart, deps: CartServiceDeps, asOf: Date): CartDto {
  const evaluated = stored.lines.map((line) => evaluateLine(line, deps, asOf));

  const blockingReasons: CommerceDenialCode[] = [];
  const addBlocking = (code: CommerceDenialCode): void => {
    if (!blockingReasons.includes(code)) blockingReasons.push(code);
  };

  if (evaluated.length === 0) addBlocking("cart_empty");
  if (!deps.commerceEnabled) addBlocking("commerce_disabled");
  for (const entry of evaluated) {
    for (const code of entry.reasons) addBlocking(code);
  }

  const subtotalCents = evaluated.reduce(
    (sum, entry) => sum + (entry.line.lineTotalCents ?? 0),
    0,
  );

  const orderLines: OrderLine[] = evaluated
    .filter((entry): entry is EvaluatedLine & { owner: "mitch" | "xenios" } => entry.owner !== null)
    .map((entry) => ({ sku: entry.line.sku, quantity: entry.line.quantity, owner: entry.owner }));

  const groups = splitByFulfillmentOwner(orderLines);
  const shipmentGroups = groups.map((group) => ({
    owner: group.owner,
    skus: group.lines.map((line) => line.sku),
  }));

  // One quote per fulfillment owner, then a single charge for the order. A split
  // shipment is an internal concern and is never billed twice to the member.
  const shippingCents = orderShippingTotalCents(groups.map(() => configuredStandardQuote()));

  const memberEntries = deps.storeCredit.filter((entry) => entry.memberId === memberId);
  const spendableCents = spendableStoreCreditCents(memberEntries);
  const storeCreditAppliedCents = Math.max(0, Math.min(spendableCents, subtotalCents));

  const estimatedTotalCents = Math.max(0, subtotalCents + shippingCents - storeCreditAppliedCents);

  const checkoutReady =
    evaluated.length > 0 &&
    evaluated.every((entry) => entry.line.blockedReason === null) &&
    blockingReasons.length === 0;

  return {
    lines: evaluated.map((entry) => entry.line),
    shipmentGroups,
    subtotalCents,
    shippingCents,
    storeCreditAppliedCents,
    estimatedTotalCents,
    checkoutReady,
    blockingReasons,
    requiredAgreements: [...deps.requiredAgreementKeys],
  };
}

function loadCart(memberId: string, deps: CartServiceDeps): StoredCart {
  const existing = deps.repository.load(memberId);
  return existing ? { lines: [...existing.lines] } : { lines: [] };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export function createCartService(deps: CartServiceDeps): CartService {
  function read(memberId: string, asOf: Date): CartDto {
    return buildCart(memberId, loadCart(memberId, deps), deps, asOf);
  }

  return {
    getCart(memberId, asOf) {
      return read(memberId, asOf);
    },

    /**
     * Rejects only what makes the REQUEST invalid. A product that is currently
     * ineligible or out of stock is still admitted and surfaced as a blocked line,
     * because both conditions vary with time and revalidation is what catches them.
     */
    addLine(memberId, req, asOf) {
      if (!isValidQuantity(req.quantity)) {
        return {
          ok: false,
          code: "quantity_invalid",
          message: `Quantity must be a whole number between 1 and ${MAX_LINE_QUANTITY}.`,
        };
      }

      const product = deps.catalog.get(req.sku);
      if (!product) {
        return { ok: false, code: "product_not_found", message: `Unknown SKU ${req.sku}.` };
      }

      if (!deps.commerceEnabled) {
        return {
          ok: false,
          code: "commerce_disabled",
          message: "Product commerce is not enabled.",
        };
      }

      if (req.purchaseMode === "subscription") {
        const frequency = req.subscriptionFrequencyDays;
        if (frequency === undefined || !SUBSCRIPTION_FREQUENCIES.includes(frequency)) {
          return {
            ok: false,
            code: "subscription_action_invalid",
            message: "A subscription needs a frequency of 30, 60, or 90 days.",
          };
        }
        if (!product.subscriptionEligible) {
          return {
            ok: false,
            code: "subscription_action_invalid",
            message: `${product.displayName} is not available as a subscription.`,
          };
        }
      }

      const cart = loadCart(memberId, deps);
      const existing = cart.lines.find((line) => line.sku === req.sku);

      // The bound applies to the resulting line, not just to this request, so
      // repeated adds cannot walk a line past the ceiling one call at a time.
      const combinedQuantity = (existing?.quantity ?? 0) + req.quantity;
      if (!isValidQuantity(combinedQuantity)) {
        return {
          ok: false,
          code: "quantity_invalid",
          message: `A single line may hold at most ${MAX_LINE_QUANTITY} units.`,
        };
      }

      const next: StoredCartLine = {
        sku: req.sku,
        quantity: combinedQuantity,
        purchaseMode: req.purchaseMode,
        ...(req.purchaseMode === "subscription" && req.subscriptionFrequencyDays !== undefined
          ? { subscriptionFrequencyDays: req.subscriptionFrequencyDays }
          : {}),
      };
      cart.lines = existing
        ? cart.lines.map((line) => (line.sku === req.sku ? next : line))
        : [...cart.lines, next];

      deps.repository.save(memberId, cart);
      return { ok: true, cart: buildCart(memberId, cart, deps, asOf) };
    },

    updateLine(memberId, sku, quantity, asOf) {
      if (!isValidQuantity(quantity)) {
        return {
          ok: false,
          code: "quantity_invalid",
          message: `Quantity must be a whole number between 1 and ${MAX_LINE_QUANTITY}.`,
        };
      }

      const cart = loadCart(memberId, deps);
      if (!cart.lines.some((line) => line.sku === sku)) {
        return { ok: false, code: "product_not_found", message: `${sku} is not in the cart.` };
      }

      cart.lines = cart.lines.map((line) => (line.sku === sku ? { ...line, quantity } : line));
      deps.repository.save(memberId, cart);
      return { ok: true, cart: buildCart(memberId, cart, deps, asOf) };
    },

    removeLine(memberId, sku, asOf) {
      const cart = loadCart(memberId, deps);
      cart.lines = cart.lines.filter((line) => line.sku !== sku);
      deps.repository.save(memberId, cart);
      return buildCart(memberId, cart, deps, asOf);
    },

    revalidate(memberId, asOf) {
      return read(memberId, asOf);
    },
  };
}

/** An in-memory repository for tests and for a request-scoped cart. */
export function createInMemoryCartRepository(): CartRepository {
  const carts = new Map<string, StoredCart>();
  return {
    load(memberId) {
      const cart = carts.get(memberId);
      return cart ? { lines: cart.lines.map((line) => ({ ...line })) } : null;
    },
    save(memberId, cart) {
      carts.set(memberId, { lines: cart.lines.map((line) => ({ ...line })) });
    },
  };
}
