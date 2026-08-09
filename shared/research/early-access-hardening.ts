/**
 * Early Access hardening contract: the browser-facing half.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Six lanes are about to build against one another in parallel. Without one
 * frozen vocabulary they will each invent a slightly different name for the
 * same fact, and the integration will spend its time reconciling synonyms
 * instead of finding defects. This file is that vocabulary for everything a
 * browser is allowed to know.
 *
 * It deliberately contains no route, no fetch, no migration and no component.
 * Types, frozen constant lists and pure functions only, so importing it can
 * never change behavior.
 *
 * WHAT BELONGS HERE AND WHAT DOES NOT
 * -----------------------------------
 * Here: anything a customer's browser may render.
 * NOT here: the legal signer binding, the agreement package, the admin
 * projection, the internal email state and the settlement refusals. Those live
 * in server/research/early-access/hardening-contract.ts, because a type that
 * names a provider message id has no business being reachable from the client
 * bundle at all. The separation is structural, not a promise.
 *
 * This file extends `early-access-cart.ts`; it never restates it. The cart
 * contract still owns quote, checkout, invoice, receipt, release and
 * settlement shapes.
 */

import type { EarlyAccessCartCurrency } from "./early-access-cart";
import type { EarlyAccessPaymentOptionCode } from "./early-access-payment-options";

// ---------------------------------------------------------------------------
// 1. Order stage. One vocabulary, defined once.
// ---------------------------------------------------------------------------

/**
 * What has actually happened to this checkout, in order.
 *
 * The distinction that matters, and the one the accelerator got wrong:
 * `checkout_reserved` is NOT a submitted order. A customer who has a checkout
 * number, an invoice and payment instructions has reserved units and been told
 * where to pay. They have not yet submitted anything for review. Calling that
 * "submitted" is how an operator ends up looking for a payment nobody sent.
 *
 * `overdue` is deliberately absent. It is not a stage: an order can be overdue
 * while `processing` and while `partially_shipped`. It is derived from
 * `shipByAt` against the clock, so it is a flag on the projection below.
 *
 * `payment_rejected` is also absent, because it already exists as
 * `EarlyAccessCartPaymentState` in the cart contract and this list must not
 * fork that vocabulary. Stage answers "how far has this gone", payment state
 * answers "what did the operator decide". Both are server answers.
 */
export const EARLY_ACCESS_ORDER_STAGES = Object.freeze([
  /** Units are held and an invoice exists. Nothing has been paid or sent. */
  "checkout_reserved",
  /** The customer has been shown where and how to pay. Still nothing sent. */
  "payment_instructions_shown",
  /** The customer said they paid, and the proof submission has not completed. */
  "customer_submission_pending",
  /** A complete submission is on file and a named human must review it. */
  "payment_review_required",
  /** A named admin verified the payment. This is the clock start for ship-by. */
  "payment_verified",
  /** Suppliers have been released and the order is being fulfilled. */
  "processing",
  /** At least one child line shipped and at least one has not. */
  "partially_shipped",
  /** Every child line has shipped. */
  "shipped",
] as const);

export type EarlyAccessOrderStage = (typeof EARLY_ACCESS_ORDER_STAGES)[number];

export function isEarlyAccessOrderStage(value: unknown): value is EarlyAccessOrderStage {
  return (
    typeof value === "string" &&
    (EARLY_ACCESS_ORDER_STAGES as readonly string[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// 2. The customer's view of their own submission.
// ---------------------------------------------------------------------------

/**
 * How far the customer's proof submission got, in the customer's terms.
 *
 * `accepted_for_review` is the strongest thing this system may honestly tell a
 * customer. The internal mail provider accepting a message is not the same as
 * a human reading it, and neither is a promise that the payment is good.
 *
 * `needs_retry` means the submission did not complete and the customer must
 * send it again. It does NOT mean no internal email exists: the provider may
 * have accepted while the database write failed. That ambiguity is real, it is
 * recorded on the ADMIN projection as a reconciliation state, and the customer
 * is simply asked to retry, which is both true and actionable.
 */
export const EARLY_ACCESS_SUBMISSION_CUSTOMER_STATES = Object.freeze([
  "not_started",
  "in_progress",
  "accepted_for_review",
  "needs_retry",
] as const);

export type EarlyAccessSubmissionCustomerState =
  (typeof EARLY_ACCESS_SUBMISSION_CUSTOMER_STATES)[number];

/**
 * The ONLY submission shape a customer-facing response may serialize.
 *
 * Every field here is one the customer supplied or was shown. There is
 * deliberately no submission key, no internal recipient, no provider message
 * id, no provider error and no proof digest. Those are not omitted by
 * convention: `EARLY_ACCESS_SUBMISSION_FORBIDDEN_CUSTOMER_KEYS` below names
 * them, and `customerSubmissionViewIsClean` refuses any object carrying one,
 * so a route that accidentally spreads the admin record fails a test instead of
 * shipping.
 */
export type EarlyAccessSubmissionCustomerView = Readonly<{
  state: EarlyAccessSubmissionCustomerState;
  /** The method the customer chose, from this checkout's own resolved list. */
  method: EarlyAccessPaymentOptionCode | null;
  /** Customer-facing label for that method. Null when none is chosen yet. */
  methodLabel: string | null;
  /** The customer's own filename, echoed back so they know what arrived. */
  filename: string | null;
  /** When the submission was accepted for review. ISO 8601 UTC. */
  acceptedAt: string | null;
  /**
   * True when the customer may submit again. A retry never creates a second
   * checkout and never creates a second successful submission identity.
   */
  retryAllowed: boolean;
}>;

/**
 * Field names that must never appear on a customer-facing payload.
 *
 * This is the P0 leak from the risk register written as a testable list rather
 * than a code review habit.
 */
export const EARLY_ACCESS_SUBMISSION_FORBIDDEN_CUSTOMER_KEYS = Object.freeze([
  "submissionKey",
  "internalRecipient",
  "providerMessageId",
  "providerError",
  "lastError",
  "proofSha256",
  "sha256",
  "reconciliation",
  "internalEmailAcceptance",
  "customerRef",
  "memberId",
  "idempotencyKey",
] as const);

/**
 * True when an object carries no forbidden key, at any depth.
 *
 * Depth matters: the leak the accelerator shipped was a nested submission JSON
 * blob, not a top-level field, so a shallow check would have passed it.
 */
export function customerPayloadIsClean(value: unknown): boolean {
  const forbidden = new Set<string>(EARLY_ACCESS_SUBMISSION_FORBIDDEN_CUSTOMER_KEYS);
  const seen = new Set<unknown>();

  const walk = (node: unknown): boolean => {
    if (node === null || typeof node !== "object") return true;
    if (seen.has(node)) return true;
    seen.add(node);

    if (Array.isArray(node)) return node.every(walk);

    for (const key of Object.keys(node)) {
      if (forbidden.has(key)) return false;
      if (!walk((node as Record<string, unknown>)[key])) return false;
    }
    return true;
  };

  return walk(value);
}

// ---------------------------------------------------------------------------
// 3. Signing. Native and redirect are both first-class.
// ---------------------------------------------------------------------------

/**
 * Starting a signing session produces one of two shapes.
 *
 * The accelerator assumed a redirect URL was the only possible answer, which
 * silently deletes the in-page native signer this repository already has. A
 * union forces both callers to handle both, and forces the server to say which
 * one it means.
 *
 * Field names follow the existing engine rather than the accelerator, so the
 * two vocabularies never have to be translated: the provider arm carries a
 * `signingUrl` and a `signingRequestId`, exactly as
 * `CreateSigningSessionResult` does in
 * server/research/membership-activation/esign/signing.ts.
 *
 * There is no `returnUrl` and no `redirectUrl` field, for two reasons. The
 * first is that this repository's provider path is webhook-driven: it sets the
 * session's redirect to null on purpose and advances state only from a
 * verified provider webhook. The second is that a return URL assembled from
 * the request's Host header is an open redirect with extra steps. The audit of
 * this tree found no Host-derived URL construction anywhere, and this contract
 * is how it stays that way.
 */
export type EarlyAccessSigningStart =
  | Readonly<{
      mode: "native";
      /** The in-page signing session this browser should drive. */
      signingSessionId: string;
      /** Exact published versions to render, in presentation order. */
      documentVersionIds: readonly string[];
    }>
  | Readonly<{
      mode: "provider_hosted";
      provider: "opensign";
      /**
       * The provider-hosted page to send the signer to. Null when the provider
       * accepted the request but published no URL, which is a state the client
       * must render as "not ready", never as done.
       */
      signingUrl: string | null;
      /** Correlates the eventual provider webhook to this request. */
      signingRequestId: string;
    }>;

export const EARLY_ACCESS_SIGNING_MODES = Object.freeze([
  "native",
  "provider_hosted",
] as const);

export type EarlyAccessSigningMode = (typeof EARLY_ACCESS_SIGNING_MODES)[number];

/**
 * Coming back from a signing flow is not evidence of having signed.
 *
 * A customer can reach any return destination by pressing Back, by editing the
 * address bar, or by abandoning the provider page. Completion is only ever
 * recomputed on the server from immutable signature records and verified
 * provider webhooks. This constant exists so the rule has a name a test can
 * cite.
 */
export const EARLY_ACCESS_RETURN_IS_NOT_COMPLETION = true as const;

// ---------------------------------------------------------------------------
// 4. The legal package, as the customer sees its standing.
// ---------------------------------------------------------------------------

/**
 * What the customer is told about their agreement package.
 *
 * `satisfied` is a SERVER answer recomputed from signature records for the
 * CURRENT published package version. It is never the browser's cached memory
 * of having clicked something, and it is never an aggregate boolean stored at
 * signing time: a package version change must be able to un-satisfy it.
 */
export type EarlyAccessAgreementStandingView = Readonly<{
  satisfied: boolean;
  /** Identifies the exact required set this answer was computed against. */
  packageVersion: string;
  /** Categories still blocking, in presentation order. Customer-safe labels. */
  outstanding: readonly Readonly<{
    category: string;
    title: string;
    /** True where this document needs its own separate acknowledgement. */
    requiresSeparateAcknowledgment: boolean;
  }>[];
}>;

// ---------------------------------------------------------------------------
// 5. Ship-by. One arithmetic, one place.
// ---------------------------------------------------------------------------

export const EARLY_ACCESS_SHIP_BY_HOURS = 72 as const;

/**
 * `shipByAt = paymentVerifiedAt + 72 hours`, exactly.
 *
 * The durable value is computed by the database from its own clock, because a
 * promise to a customer must not depend on which server happened to answer.
 * This function exists so the client, the tests and the server all agree on
 * what that arithmetic means, and so a locale or a timezone can never quietly
 * change the answer: input and output are both ISO 8601 UTC instants.
 *
 * Returns null rather than a wrong date when the input is not an exact ISO
 * instant, so a malformed timestamp cannot become a shipping commitment.
 */
export function earlyAccessShipByAt(paymentVerifiedAtIso: string): string | null {
  const parsed = Date.parse(paymentVerifiedAtIso);
  if (!Number.isFinite(parsed)) return null;
  if (new Date(parsed).toISOString() !== paymentVerifiedAtIso) return null;
  return new Date(parsed + EARLY_ACCESS_SHIP_BY_HOURS * 60 * 60 * 1000).toISOString();
}

/**
 * Overdue is derived, never stored as a stage.
 *
 * Unshipped and past the commitment. A shipped order is never overdue, however
 * late it was, because the promise has been kept and relabelling it later
 * would make the operator queue lie.
 */
export function earlyAccessIsOverdue(
  input: Readonly<{ stage: EarlyAccessOrderStage; shipByAt: string | null; nowIso: string }>,
): boolean {
  if (input.shipByAt === null) return false;
  if (input.stage === "shipped") return false;
  const due = Date.parse(input.shipByAt);
  const now = Date.parse(input.nowIso);
  if (!Number.isFinite(due) || !Number.isFinite(now)) return false;
  return now > due;
}

/**
 * The customer-safe fulfilment projection.
 *
 * Timestamps are ISO 8601 UTC and the timezone label is explicit, so a browser
 * in another zone renders a consistent date instead of appearing to move the
 * commitment by a day.
 */
export type EarlyAccessFulfilmentView = Readonly<{
  stage: EarlyAccessOrderStage;
  paymentVerifiedAt: string | null;
  shipByAt: string | null;
  /** Always "UTC" today. Present so the client never guesses. */
  timezone: "UTC";
  overdue: boolean;
  /** Per child line, customer-safe. Tracking only once it exists. */
  lines: readonly Readonly<{
    orderNumber: string;
    quantity: number;
    shippedAt: string | null;
    tracking: readonly string[];
  }>[];
}>;

// ---------------------------------------------------------------------------
// 6. Catalog: roadmap stage and live commerce state are orthogonal.
// ---------------------------------------------------------------------------

/**
 * Where a product sits on the intended roadmap. Display only, always.
 *
 * A roadmap stage is a statement of intent written by a human in a planning
 * document. It can be wrong, it can be optimistic, and it is not joined to
 * supplier cost, COA, lot, legal approval or a live price. It must therefore
 * never be able to authorize a purchase, which is enforced structurally below
 * rather than by asking every caller to remember.
 */
export const CATALOG_ROADMAP_STAGES = Object.freeze([
  "planned",
  "this_week",
  "coming_soon",
] as const);

export type CatalogRoadmapStage = (typeof CATALOG_ROADMAP_STAGES)[number];

/**
 * What the live commerce system says about this unit right now.
 *
 * This is the projection of the existing purchase authority
 * (`evaluatePurchaseEligibility` in shared/research/catalog.ts). It is the only
 * field that may gate an Add to Cart control.
 */
export const CATALOG_LIVE_COMMERCE_STATES = Object.freeze([
  "purchasable",
  "held",
  "request_access",
  "care_only",
  "unavailable",
] as const);

export type CatalogLiveCommerceState = (typeof CATALOG_LIVE_COMMERCE_STATES)[number];

/**
 * The live cart unit. Its presence is what makes a card buyable.
 *
 * Every field is a live server value. A price from the planning workbook is
 * not one of them, and there is deliberately nowhere on this type to put one.
 */
export type EarlyAccessAddToCartAuthority = Readonly<{
  productId: string;
  variantId: string;
  unitPriceCents: number;
  currency: EarlyAccessCartCurrency;
}>;

/**
 * One catalog card carrying both truths at once.
 *
 * `roadmapStage` and `liveCommerce` are separate fields because they are
 * separate facts. A planned peptide can be displayed in full while being
 * unbuyable, and a live unit can be purchasable while nobody has written a
 * roadmap row for it.
 *
 * `priceDisplay` is a server-formatted string or null. Null means pricing is
 * pending, which is the honest answer for a planning row whose supplier quote
 * is outstanding, and it is not the same as free.
 */
export type EarlyAccessCatalogCard = Readonly<{
  /** Stable roadmap identifier. Not a productId, and never used as one. */
  catalogId: string;
  displayName: string;
  strength: string | null;
  roadmapStage: CatalogRoadmapStage;
  liveCommerce: CatalogLiveCommerceState;
  /** Non-null only when live commerce has an exact purchasable unit. */
  addToCart: EarlyAccessAddToCartAuthority | null;
  priceDisplay: string | null;
}>;

/**
 * The single question an Add to Cart control may ask.
 *
 * Note what is not read: `roadmapStage`. It is not consulted, not compared and
 * not defaulted from. A roadmap row cannot become purchase authority here even
 * if someone sets every other field to look convincing, because the function
 * requires a live unit object that only the live projection can produce.
 */
export function canAddToCart(card: EarlyAccessCatalogCard): boolean {
  return card.liveCommerce === "purchasable" && card.addToCart !== null;
}

/**
 * Fields that must never reach a public catalog payload.
 *
 * Supplier identity and cost are commercially sensitive, and an internal note
 * is written in a voice nobody intends a customer to read.
 */
export const CATALOG_FORBIDDEN_PUBLIC_KEYS = Object.freeze([
  "supplierId",
  "supplierSku",
  "supplierCostCents",
  "wholesaleCents",
  "internalNote",
  "internalNotes",
  "marginCents",
] as const);

// ---------------------------------------------------------------------------
// 7. The cart's own customer projection, which leaks supplier identity today.
// ---------------------------------------------------------------------------

/**
 * A DEFECT THAT EXISTS AT THE ACCEPTED BASE, not an accelerator hazard.
 *
 * `EarlyAccessCartChildOrder` and `EarlyAccessCartChildRelease` both carry
 * `supplierId` and `supplierSku`, and both reach the customer. The read route
 * returns `checkoutView(checkout)`, whose projection strips `customerRef`,
 * `idempotencyKey`, `intentHash` and `quoteId` but passes `children` through
 * untouched. The status route returns the store's result verbatim, and the
 * status RPC builds `fulfilment.childOrders` from child-release records with
 * both supplier fields inside.
 *
 * The asymmetry is the tell: the read route bothers to project and the status
 * route does not, and the projection that does exist was written to hide
 * OWNERSHIP fields rather than SUPPLIER fields. The concept was understood and
 * applied one field-class too narrowly.
 *
 * So the two projections the risk register asks for are required at base,
 * independent of anything M62 does.
 */
export const EARLY_ACCESS_CART_FORBIDDEN_CUSTOMER_KEYS = Object.freeze([
  "supplierId",
  "supplierSku",
  "customerRef",
  "idempotencyKey",
  "intentHash",
  "quoteId",
  "attribution",
] as const);

/**
 * True when a cart payload bound for a customer carries no supplier identity
 * and no ownership handle, at any depth.
 *
 * Separate from `customerPayloadIsClean` because the two lists answer different
 * questions and merging them would let a submission fix silently satisfy a
 * cart assertion, or the reverse.
 */
export function cartCustomerPayloadIsClean(value: unknown): boolean {
  const forbidden = new Set<string>(EARLY_ACCESS_CART_FORBIDDEN_CUSTOMER_KEYS);
  const seen = new Set<unknown>();

  const walk = (node: unknown): boolean => {
    if (node === null || typeof node !== "object") return true;
    if (seen.has(node)) return true;
    seen.add(node);

    if (Array.isArray(node)) return node.every(walk);

    for (const key of Object.keys(node)) {
      if (forbidden.has(key)) return false;
      if (!walk((node as Record<string, unknown>)[key])) return false;
    }
    return true;
  };

  return walk(value);
}
