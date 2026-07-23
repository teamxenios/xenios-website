// xenios research: the commerce, catalog, evidence, and distribution HTTP surface (G6, G7, G8).
//
// This module is registered by the integration lane, not by itself. It does not touch
// server/research/index.ts, per the coordinator file claim.
//
// Two authorization defects were left open by the domain reviews because they can only
// be closed at this layer. Both are closed here, structurally rather than by discipline:
//
//   1. IDENTITY IS NEVER READ FROM THE CLIENT. `subjectOf` derives the acting member
//      from the authenticated request only. No handler reads a member id or partner id
//      from a body, query, or path parameter. A route therefore cannot be pointed at
//      another member's data by changing a request, because there is nothing in the
//      request to change.
//
//   2. RICH DOMAIN RECORDS ARE NEVER SERIALIZED. `PartnerRecord` carries legal name,
//      contact email, internal notes, admin ids, and a lifecycle history containing
//      suspension and termination reasons. `toPartnerSelfDto` builds the response by
//      explicit construction, so a field added to the record later cannot appear in a
//      response by default.

import express, { type Express, type Request, type Response } from "express";
import type {
  AddCartLineRequest,
  Api,
  CheckoutRequest,
  CommerceDenialCode,
  CreateClaimRequest,
  GoalDto,
  GuideDetailDto,
  GuideSummaryDto,
  MemberCapabilityStatus,
  PartnerLinkDto,
  ProductDetailDto,
  ProductSummaryDto,
  ShippingQuoteRequest,
  SubscriptionActionRequest,
} from "@shared/research/commerce-api";
import { PARTNER_ROLES, type PartnerRole, type PartnerState } from "@shared/research/distribution";
import type { WebhookResult } from "./webhooks";

// ---------------------------------------------------------------------------
// Injected surface
// ---------------------------------------------------------------------------

/**
 * Everything the routes need, injected so the surface is testable without a database,
 * a network, or a provider credential.
 */
export interface CommerceDependencies {
  catalog: {
    listProducts(): ProductSummaryDto[];
    getProduct(slug: string): ProductDetailDto | null;
    listGoals(): GoalDto[];
  };
  guides: {
    listForMember(): Promise<GuideSummaryDto[]>;
    getForMember(slug: string): Promise<GuideDetailDto | { denied: "guide_not_published" } | null>;
  };
  cart: {
    getCart(memberId: string, asOf: Date): Promise<unknown>;
    addLine(memberId: string, req: AddCartLineRequest, asOf: Date): Promise<unknown>;
    updateLine(memberId: string, sku: string, quantity: number, asOf: Date): Promise<unknown>;
    removeLine(memberId: string, sku: string, asOf: Date): Promise<unknown>;
  };
  checkout: {
    submit(memberId: string, req: CheckoutRequest, asOf: Date): Promise<unknown>;
  };
  orders: {
    listForMember(memberId: string): Promise<unknown[]>;
    getForMember(memberId: string, orderId: string): Promise<unknown | null>;
  };
  subscriptions: {
    listForMember(memberId: string): Promise<unknown[]>;
    apply(memberId: string, subscriptionId: string, req: SubscriptionActionRequest, asOf: Date): Promise<unknown>;
    /** Creation through the full gate chain the service enforces. */
    create(memberId: string, input: CreateSubscriptionWireInput, asOf: Date): Promise<unknown>;
  };
  claims: {
    submitClaim(memberId: string, req: CreateClaimRequest, asOf: Date): Promise<unknown>;
    listForMember(memberId: string): Promise<unknown[]>;
    /** Ownership enforced beneath: a foreign claim reads as missing. */
    getForMember(memberId: string, claimId: string): Promise<unknown | null>;
  };
  /** The admin claim workflow. Reached only through the admin guard. */
  claimsAdmin: {
    listOpen(): Promise<unknown[]>;
    review(claimId: string, adminId: string, decision: ClaimReviewWireDecision, asOf: Date, note?: string): Promise<unknown>;
    /** Money moves only on provider proof; the service enforces it. */
    refund(claimId: string, adminId: string, amountCents: number, idempotencyKey: string, asOf: Date): Promise<unknown>;
    replacement(claimId: string, adminId: string, asOf: Date): Promise<unknown>;
  };
  storeCredit: {
    forMember(memberId: string): Promise<unknown>;
  };
  partners: {
    /** Resolves the partner owned by this member, or null. Never takes a partner id. */
    findByMemberId(memberId: string): Promise<PartnerSelfSource | null>;
    /**
     * Takes the ALREADY RESOLVED partner (from findByMemberId), never an id from
     * a request, so the dashboard can carry role and state without a second read.
     */
    dashboardFor(partner: PartnerSelfSource): Promise<unknown>;
    listLinks(partnerId: string): Promise<PartnerLinkDto[]>;
    /** Member-scoped onboarding. One partner per member; the member id is the subject. */
    applyForMember(memberId: string, input: PartnerApplyWireInput, asOf: Date): Promise<unknown>;
  };
  /** Admin partner review actions. Reached only through the admin guard. */
  partnerAdmin: {
    review(partnerId: string, adminId: string, decision: PartnerReviewWireDecision, asOf: Date): Promise<unknown>;
  };
  /**
   * Admin order lifecycle actions (the large-order review queue's resolution:
   * approve, capture, cancel). Reached only through the admin guard; money
   * rules (capture only out of approved, bounded by the authorization, on
   * provider proof) are enforced by the order service beneath.
   */
  ordersAdmin: {
    approve(orderId: string, adminId: string, asOf: Date): Promise<unknown>;
    capture(orderId: string, adminId: string, asOf: Date): Promise<unknown>;
    cancel(orderId: string, adminId: string, reason: string, asOf: Date): Promise<unknown>;
  };
  /**
   * Inbound provider webhooks. NOT behind member auth (the provider calls it);
   * the signature over the exact raw bytes is the gate, verified beneath.
   */
  webhooks: {
    handlePayment(rawBody: string, signature: string | undefined, asOf: Date): Promise<WebhookResult>;
    handleFulfillment(rawBody: string, signature: string | undefined, asOf: Date): Promise<WebhookResult>;
  };
  /** The member shipping-quote surface (frozen contract: POST /api/research/shipping/quote). */
  shippingQuotes: {
    quoteFor(memberId: string, req: ShippingQuoteRequest, asOf: Date): Promise<unknown>;
  };
  capabilities: {
    memberVisible(): Record<string, MemberCapabilityStatus>;
  };
  adminQueues: {
    commerce(): Promise<unknown>;
  };
  /** Injected so handlers are deterministic under test. */
  now(): Date;
}

/** The wire shape of a subscription-creation request, validated before the service. */
export interface CreateSubscriptionWireInput {
  sku: string;
  quantity: number;
  frequencyDays: number;
  priceVersion: string;
  paymentProviderReference?: string | null;
  shippingAddressRef?: string | null;
}

/** The admin review decisions the wire accepts. Anything else is refused at the boundary. */
export const CLAIM_REVIEW_WIRE_DECISIONS = [
  "under_review",
  "information_requested",
  "approved",
  "declined",
] as const;
export type ClaimReviewWireDecision = (typeof CLAIM_REVIEW_WIRE_DECISIONS)[number];

/** Partner review decisions the admin wire accepts. */
export const PARTNER_REVIEW_WIRE_DECISIONS = ["certify", "activate", "suspend", "reinstate"] as const;
export type PartnerReviewWireDecision = (typeof PARTNER_REVIEW_WIRE_DECISIONS)[number];

/** The wire shape of a partner application. The member id is never part of it. */
export interface PartnerApplyWireInput {
  role: PartnerRole;
  legalName: string;
  contactEmail: string;
}

/** The subset of a partner record this layer is permitted to see. */
export interface PartnerSelfSource {
  partnerId: string;
  role: PartnerRole;
  state: PartnerState;
  certifiedAt: string | null;
  activatedAt: string | null;
  training: Array<{ moduleKey: string; moduleVersion: string; completedAt: string }>;
  agreements: Array<{ agreementKey: string; agreementVersion: string; decidedAt: string }>;
}

/**
 * What a partner may see about themselves.
 *
 * Deliberately absent: legalName, contactEmail, internalNotes, certifiedByAdminId,
 * activatedByAdminId, and the lifecycle history, which carries suspension and
 * termination reasons written for Samuel rather than for the partner.
 */
export interface PartnerSelfDto {
  partnerId: string;
  role: PartnerRole;
  state: PartnerState;
  certified: boolean;
  active: boolean;
  training: Array<{ moduleKey: string; moduleVersion: string; completedAt: string }>;
  agreements: Array<{ agreementKey: string; agreementVersion: string; decidedAt: string }>;
}

/**
 * Built by explicit construction, never by spreading or deleting keys from the record.
 * A field added to PartnerRecord later cannot reach a partner through this function.
 */
export function toPartnerSelfDto(source: PartnerSelfSource): PartnerSelfDto {
  return {
    partnerId: source.partnerId,
    role: source.role,
    state: source.state,
    certified: source.certifiedAt !== null,
    active: source.activatedAt !== null && source.state === "active",
    training: source.training.map((t) => ({
      moduleKey: t.moduleKey,
      moduleVersion: t.moduleVersion,
      completedAt: t.completedAt,
    })),
    agreements: source.agreements.map((a) => ({
      agreementKey: a.agreementKey,
      agreementVersion: a.agreementVersion,
      decidedAt: a.decidedAt,
    })),
  };
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/**
 * The acting member, taken ONLY from what the guard authenticated.
 *
 * This is the whole of the viewer-enforcement fix. Because no handler accepts an
 * identity from the request, there is no parameter an attacker can change to read
 * another member. A missing identity fails closed rather than defaulting.
 */
export function subjectOf(req: Request): string | null {
  const member = (req as unknown as { researchMember?: Record<string, unknown> }).researchMember;
  if (!member) return null;
  const id = member.id ?? member.member_id ?? member.memberId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

/** Member and admin JSON is never cached, matching the merged research routes. */
function secure(res: Response): Response {
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");
  return res;
}

function ok<T extends object>(res: Response, payload: T): void {
  secure(res).json({ ok: true, ...payload } satisfies Api<T>);
}

function deny(res: Response, status: number, code: CommerceDenialCode | "forbidden", message?: string): void {
  secure(res).status(status).json({ ok: false, code, ...(message ? { message } : {}) });
}

/** A handler that needs an authenticated subject. Fails closed when there is none. */
function withSubject(handler: (memberId: string, req: Request, res: Response) => void | Promise<void>) {
  return async (req: Request, res: Response): Promise<void> => {
    const memberId = subjectOf(req);
    if (!memberId) {
      deny(res, 403, "forbidden", "This area requires an active membership.");
      return;
    }
    await handler(memberId, req, res);
  };
}

/**
 * The acting admin, for attribution on review decisions. The merged admin guard
 * attaches the verified admin email; a missing value falls back to the literal
 * "admin" rather than anything from the request body.
 */
export function adminIdOf(req: Request): string {
  const email = (req as unknown as { adminEmail?: unknown }).adminEmail;
  return typeof email === "string" && email.length > 0 ? email : "admin";
}

/**
 * The exact bytes the provider signed. Signature verification is only meaningful
 * over the raw body, never over a re-serialization, so this reads the buffer the
 * body pipeline captured (`req.rawBody` from the app-level json verify hook, or
 * `req.body` when the route-level raw parser ran) and refuses anything else.
 */
export function rawBodyOf(req: Request): string | null {
  const captured = (req as unknown as { rawBody?: unknown }).rawBody;
  if (Buffer.isBuffer(captured)) return captured.toString("utf8");
  if (Buffer.isBuffer(req.body)) return (req.body as Buffer).toString("utf8");
  return null;
}

// ---------------------------------------------------------------------------
// Wire validation (structure only; every business rule stays in the services)
// ---------------------------------------------------------------------------

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

const SHIPPING_SERVICES: readonly string[] = [
  "standard",
  "expedited_2day",
  "next_day",
  "same_day",
  "temperature_controlled",
];

/** Structural address validation, matching checkout's rule. */
function parseQuoteRequest(body: unknown): ShippingQuoteRequest | null {
  if (body === null || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const destination = record.destination as Record<string, unknown> | undefined;
  if (!destination || typeof destination !== "object") return null;
  if (!isNonEmptyString(destination.line1)) return null;
  if (!isNonEmptyString(destination.city)) return null;
  if (typeof destination.state !== "string" || !/^[A-Za-z]{2}$/.test(destination.state)) return null;
  if (typeof destination.postalCode !== "string" || !/^\d{5}(-\d{4})?$/.test(destination.postalCode)) return null;
  if (destination.country !== "US") return null;
  if (typeof record.service !== "string" || !SHIPPING_SERVICES.includes(record.service)) return null;
  const parsed: ShippingQuoteRequest = {
    destination: {
      line1: destination.line1,
      city: destination.city,
      state: destination.state.toUpperCase(),
      postalCode: destination.postalCode,
      country: "US",
    },
    service: record.service as ShippingQuoteRequest["service"],
  };
  if (isNonEmptyString(destination.line2)) parsed.destination.line2 = destination.line2;
  return parsed;
}

function parseCreateSubscription(body: unknown): CreateSubscriptionWireInput | null {
  if (body === null || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (!isNonEmptyString(record.sku)) return null;
  if (typeof record.quantity !== "number") return null;
  if (typeof record.frequencyDays !== "number") return null;
  if (!isNonEmptyString(record.priceVersion)) return null;
  const input: CreateSubscriptionWireInput = {
    sku: record.sku,
    quantity: record.quantity,
    frequencyDays: record.frequencyDays,
    priceVersion: record.priceVersion,
  };
  if (isNonEmptyString(record.paymentProviderReference)) {
    input.paymentProviderReference = record.paymentProviderReference;
  }
  if (isNonEmptyString(record.shippingAddressRef)) {
    input.shippingAddressRef = record.shippingAddressRef;
  }
  return input;
}

function parsePartnerApply(body: unknown): PartnerApplyWireInput | null {
  if (body === null || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (typeof record.role !== "string" || !(PARTNER_ROLES as readonly string[]).includes(record.role)) {
    return null;
  }
  if (!isNonEmptyString(record.legalName)) return null;
  if (!isNonEmptyString(record.contactEmail) || !record.contactEmail.includes("@")) return null;
  return {
    role: record.role as PartnerRole,
    legalName: record.legalName.trim(),
    contactEmail: record.contactEmail.trim(),
  };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export interface CommerceGuards {
  requireActiveMember: (req: Request, res: Response, next: () => void) => void | Promise<void>;
  requireMember: (req: Request, res: Response, next: () => void) => void | Promise<void>;
  requireAdmin: (req: Request, res: Response, next: () => void) => void | Promise<void>;
}

/**
 * Registers the commerce surface.
 *
 * Guards are injected rather than imported so this module has no opinion about how
 * authentication works and cannot accidentally define a parallel auth path. The
 * integration lane passes the merged guards.
 */
export function registerCommerceApi(app: Express, deps: CommerceDependencies, guards: CommerceGuards): void {
  const active = guards.requireActiveMember;
  const member = guards.requireMember;
  const admin = guards.requireAdmin;

  // ---- G0 capabilities -----------------------------------------------------
  app.get("/api/research/capabilities", active, (_req, res) => {
    ok(res, { capabilities: deps.capabilities.memberVisible() });
  });

  // ---- G6 catalog, goals, guides -------------------------------------------
  app.get("/api/research/products", active, (_req, res) => {
    ok(res, { products: deps.catalog.listProducts() });
  });

  app.get("/api/research/products/:slug", active, (req, res) => {
    const product = deps.catalog.getProduct(String(req.params.slug));
    if (!product) {
      deny(res, 404, "product_not_found");
      return;
    }
    ok(res, { product });
  });

  app.get("/api/research/goals", active, (_req, res) => {
    ok(res, { goals: deps.catalog.listGoals() });
  });

  app.get("/api/research/guides", active, async (_req, res) => {
    ok(res, { guides: await deps.guides.listForMember() });
  });

  app.get("/api/research/guides/:slug", active, async (req, res) => {
    const guide = await deps.guides.getForMember(String(req.params.slug));
    if (guide === null) {
      deny(res, 404, "guide_not_found");
      return;
    }
    // An unpublished Guide is denied rather than partially rendered, so no body,
    // claim, or source of an unapproved Guide can reach a member.
    if ("denied" in guide) {
      deny(res, 403, "guide_not_published", "This Guide has not completed review.");
      return;
    }
    ok(res, { guide });
  });

  // ---- G7 cart --------------------------------------------------------------
  app.get(
    "/api/research/cart",
    active,
    withSubject(async (memberId, _req, res) => {
      ok(res, { cart: await deps.cart.getCart(memberId, deps.now()) });
    }),
  );

  app.post(
    "/api/research/cart/lines",
    active,
    withSubject(async (memberId, req, res) => {
      const body = req.body as AddCartLineRequest;
      const result = await deps.cart.addLine(memberId, body, deps.now());
      relay(res, result, "cart");
    }),
  );

  app.patch(
    "/api/research/cart/lines/:sku",
    active,
    withSubject(async (memberId, req, res) => {
      const quantity = Number((req.body as { quantity?: unknown })?.quantity);
      const result = await deps.cart.updateLine(memberId, String(req.params.sku), quantity, deps.now());
      relay(res, result, "cart");
    }),
  );

  app.delete(
    "/api/research/cart/lines/:sku",
    active,
    withSubject(async (memberId, req, res) => {
      const result = await deps.cart.removeLine(memberId, String(req.params.sku), deps.now());
      relay(res, result, "cart");
    }),
  );

  // ---- G7 checkout, orders, subscriptions, claims ---------------------------
  app.post(
    "/api/research/checkout",
    active,
    withSubject(async (memberId, req, res) => {
      const result = await deps.checkout.submit(memberId, req.body as CheckoutRequest, deps.now());
      relay(res, result, "order");
    }),
  );

  app.get(
    "/api/research/orders",
    active,
    withSubject(async (memberId, _req, res) => {
      ok(res, { orders: await deps.orders.listForMember(memberId) });
    }),
  );

  app.get(
    "/api/research/orders/:orderId",
    active,
    withSubject(async (memberId, req, res) => {
      // The service enforces ownership; a foreign order returns null and 404s here,
      // so a probe cannot distinguish another member's order from a missing one.
      const order = await deps.orders.getForMember(memberId, String(req.params.orderId));
      if (!order) {
        deny(res, 404, "order_not_found");
        return;
      }
      ok(res, { order });
    }),
  );

  app.get(
    "/api/research/subscriptions",
    active,
    withSubject(async (memberId, _req, res) => {
      ok(res, { subscriptions: await deps.subscriptions.listForMember(memberId) });
    }),
  );

  app.post(
    "/api/research/subscriptions/:subscriptionId",
    active,
    withSubject(async (memberId, req, res) => {
      const result = await deps.subscriptions.apply(
        memberId,
        String(req.params.subscriptionId),
        req.body as SubscriptionActionRequest,
        deps.now(),
      );
      relay(res, result, "subscription");
    }),
  );

  app.post(
    "/api/research/claims",
    active,
    withSubject(async (memberId, req, res) => {
      const result = await deps.claims.submitClaim(memberId, req.body as CreateClaimRequest, deps.now());
      relay(res, result, "claim");
    }),
  );

  app.get(
    "/api/research/claims",
    active,
    withSubject(async (memberId, _req, res) => {
      ok(res, { claims: await deps.claims.listForMember(memberId) });
    }),
  );

  app.get(
    "/api/research/store-credit",
    active,
    withSubject(async (memberId, _req, res) => {
      ok(res, { storeCredit: await deps.storeCredit.forMember(memberId) });
    }),
  );

  // ---- G8 partner portal ----------------------------------------------------
  //
  // Every route below resolves the partner FROM THE AUTHENTICATED MEMBER. None accepts
  // a partner id, so partner A cannot address partner B by editing a request.

  app.get(
    "/api/research/partner/me",
    member,
    withSubject(async (memberId, _req, res) => {
      const partner = await deps.partners.findByMemberId(memberId);
      if (!partner) {
        deny(res, 404, "partner_not_found");
        return;
      }
      ok(res, { partner: toPartnerSelfDto(partner) });
    }),
  );

  app.get(
    "/api/research/partner/dashboard",
    member,
    withSubject(async (memberId, _req, res) => {
      const partner = await deps.partners.findByMemberId(memberId);
      if (!partner) {
        deny(res, 404, "partner_not_found");
        return;
      }
      // The resolved partner is handed over whole, so the dashboard layer never
      // receives an id it could confuse with a client-supplied one.
      ok(res, { partner: await deps.partners.dashboardFor(partner) });
    }),
  );

  app.post(
    "/api/research/partner/apply",
    member,
    withSubject(async (memberId, req, res) => {
      const input = parsePartnerApply(req.body);
      if (!input) {
        deny(res, 400, "forbidden", "A partner application needs a valid role, legal name, and contact email.");
        return;
      }
      relay(res, await deps.partners.applyForMember(memberId, input, deps.now()), "partner");
    }),
  );

  app.get(
    "/api/research/partner/links",
    member,
    withSubject(async (memberId, _req, res) => {
      const partner = await deps.partners.findByMemberId(memberId);
      if (!partner) {
        deny(res, 404, "partner_not_found");
        return;
      }
      ok(res, { links: await deps.partners.listLinks(partner.partnerId) });
    }),
  );

  // ---- G7 shipping quote ----------------------------------------------------
  app.post(
    "/api/research/shipping/quote",
    active,
    withSubject(async (memberId, req, res) => {
      const parsed = parseQuoteRequest(req.body);
      if (!parsed) {
        deny(res, 400, "address_invalid", "A quote needs a valid US address and a known service.");
        return;
      }
      relay(res, await deps.shippingQuotes.quoteFor(memberId, parsed, deps.now()), "quote");
    }),
  );

  // ---- G7 subscription creation --------------------------------------------
  app.post(
    "/api/research/subscriptions",
    active,
    withSubject(async (memberId, req, res) => {
      const input = parseCreateSubscription(req.body);
      if (!input) {
        deny(
          res,
          400,
          "subscription_action_invalid",
          "A subscription needs a SKU, a quantity, a frequency, and the price version presented.",
        );
        return;
      }
      relay(res, await deps.subscriptions.create(memberId, input, deps.now()), "subscription");
    }),
  );

  // ---- G7 claim detail ------------------------------------------------------
  app.get(
    "/api/research/claims/:claimId",
    active,
    withSubject(async (memberId, req, res) => {
      // Ownership beneath: a foreign claim is indistinguishable from a missing one.
      const claim = await deps.claims.getForMember(memberId, String(req.params.claimId));
      if (!claim) {
        deny(res, 404, "order_not_found", "No such claim.");
        return;
      }
      ok(res, { claim });
    }),
  );

  // ---- Provider webhooks ----------------------------------------------------
  //
  // Deliberately NOT behind member auth: the provider calls it, and the gate is
  // the signature over the exact raw bytes. The route-level raw parser preserves
  // those bytes for content types the app-level json parser does not consume;
  // for JSON the app-level verify hook already captured them on req.rawBody.
  // Nothing from the body or the signature is ever logged or echoed back.
  //
  // Both provider rails (payment and fulfillment) mount through the same
  // handler shape: raw bytes in, the rail's signature header, one canonical
  // handler beneath sharing the durable replay-guarded event store.
  function webhookRoute(
    signatureHeaders: readonly string[],
    handle: (rawBody: string, signature: string | undefined, asOf: Date) => Promise<WebhookResult>,
  ) {
    return async (req: Request, res: Response): Promise<void> => {
      const raw = rawBodyOf(req);
      if (raw === null) {
        secure(res).status(400).json({ ok: false, code: "malformed" });
        return;
      }
      let signature: string | undefined;
      if (typeof req.get === "function") {
        for (const header of signatureHeaders) {
          const value = req.get(header);
          if (typeof value === "string") {
            signature = value;
            break;
          }
        }
      }
      try {
        const result = await handle(raw, signature, deps.now());
        if (result.ok) {
          // Applied or an absorbed replay: both are a 200 so the provider stops
          // retrying. A replay reports applied false.
          secure(res).status(200).json({ ok: true, applied: result.applied, eventId: result.eventId });
          return;
        }
        // A capability that is not ready is retryable later; everything else is a
        // rejection of this delivery and must not be retried into success.
        const status = result.code === "capability_disabled" ? 503 : 400;
        secure(res).status(status).json({ ok: false, code: result.code });
      } catch {
        // A store or provider failure is retryable. The error detail (which could
        // carry configuration strings) never reaches the response.
        secure(res).status(500).json({ ok: false, code: "webhook_error" });
      }
    };
  }

  app.post(
    "/api/research/webhooks/payment",
    express.raw({ type: () => true, limit: "1mb" }),
    webhookRoute(["stripe-signature", "x-webhook-signature"], (raw, signature, asOf) =>
      deps.webhooks.handlePayment(raw, signature, asOf),
    ),
  );

  // The fulfillment partner's status webhook: same raw-byte + signature gate,
  // same durable event store replay guard beneath, its own signature header.
  app.post(
    "/api/research/webhooks/fulfillment",
    express.raw({ type: () => true, limit: "1mb" }),
    webhookRoute(["x-webhook-signature"], (raw, signature, asOf) =>
      deps.webhooks.handleFulfillment(raw, signature, asOf),
    ),
  );

  // ---- G10 admin ------------------------------------------------------------
  app.get("/api/admin/research/commerce/queues", admin, async (_req, res) => {
    ok(res, { queues: await deps.adminQueues.commerce() });
  });

  app.get("/api/admin/research/claims", admin, async (_req, res) => {
    ok(res, { claims: await deps.claimsAdmin.listOpen() });
  });

  app.post("/api/admin/research/claims/:claimId/review", admin, async (req, res) => {
    const decision = (req.body as { decision?: unknown })?.decision;
    if (
      typeof decision !== "string" ||
      !(CLAIM_REVIEW_WIRE_DECISIONS as readonly string[]).includes(decision)
    ) {
      deny(res, 400, "forbidden", "Unknown review decision.");
      return;
    }
    const note = (req.body as { note?: unknown })?.note;
    relay(
      res,
      await deps.claimsAdmin.review(
        String(req.params.claimId),
        adminIdOf(req),
        decision as ClaimReviewWireDecision,
        deps.now(),
        typeof note === "string" ? note : undefined,
      ),
      "claim",
    );
  });

  app.post("/api/admin/research/claims/:claimId/refund", admin, async (req, res) => {
    const body = req.body as { amountCents?: unknown; idempotencyKey?: unknown };
    if (!Number.isInteger(body?.amountCents) || (body.amountCents as number) <= 0) {
      deny(res, 400, "payment_failed", "A refund needs a positive integer amount in cents.");
      return;
    }
    if (!isNonEmptyString(body?.idempotencyKey)) {
      deny(res, 400, "forbidden", "A refund needs an idempotency key.");
      return;
    }
    relay(
      res,
      await deps.claimsAdmin.refund(
        String(req.params.claimId),
        adminIdOf(req),
        body.amountCents as number,
        body.idempotencyKey as string,
        deps.now(),
      ),
      "claim",
    );
  });

  app.post("/api/admin/research/claims/:claimId/replacement", admin, async (req, res) => {
    relay(
      res,
      await deps.claimsAdmin.replacement(String(req.params.claimId), adminIdOf(req), deps.now()),
      "claim",
    );
  });

  app.post("/api/admin/research/partners/:partnerId/review", admin, async (req, res) => {
    const decision = (req.body as { decision?: unknown })?.decision;
    if (
      typeof decision !== "string" ||
      !(PARTNER_REVIEW_WIRE_DECISIONS as readonly string[]).includes(decision)
    ) {
      deny(res, 400, "forbidden", "Unknown partner review decision.");
      return;
    }
    relay(
      res,
      await deps.partnerAdmin.review(
        String(req.params.partnerId),
        adminIdOf(req),
        decision as PartnerReviewWireDecision,
        deps.now(),
      ),
      "partner",
    );
  });

  // ---- G10 admin order lifecycle (the large-order review resolution) --------
  //
  // Approve and capture resolve a held order; cancel refuses one. Attribution
  // comes from the guard-attached admin identity, never from a body. All money
  // rules live in the order service beneath: capture is legal only out of
  // approved, is bounded by the recorded authorization, and marks nothing paid
  // without provider proof.
  app.post("/api/admin/research/orders/:orderId/approve", admin, async (req, res) => {
    relay(res, await deps.ordersAdmin.approve(String(req.params.orderId), adminIdOf(req), deps.now()), "order");
  });

  app.post("/api/admin/research/orders/:orderId/capture", admin, async (req, res) => {
    relay(res, await deps.ordersAdmin.capture(String(req.params.orderId), adminIdOf(req), deps.now()), "order");
  });

  app.post("/api/admin/research/orders/:orderId/cancel", admin, async (req, res) => {
    const reason = (req.body as { reason?: unknown })?.reason;
    if (!isNonEmptyString(reason)) {
      deny(res, 400, "forbidden", "A cancellation needs a reason.");
      return;
    }
    relay(
      res,
      await deps.ordersAdmin.cancel(String(req.params.orderId), adminIdOf(req), reason.trim(), deps.now()),
      "order",
    );
  });
}

/**
 * Relays a service result that is already a discriminated union.
 *
 * A denial keeps its machine code so the UI can route on it, and a service that returns
 * no recognizable shape produces a generic refusal rather than leaking an internal
 * object. Unknown shapes fail closed.
 */
function relay(res: Response, result: unknown, key: string): void {
  if (result && typeof result === "object" && "ok" in result) {
    const shaped = result as { ok: boolean; code?: string; codes?: string[]; message?: string };
    if (shaped.ok) {
      const { ok: _ok, ...rest } = shaped as Record<string, unknown> & { ok: boolean };
      ok(res, Object.keys(rest).length > 0 ? rest : { [key]: null });
      return;
    }
    const code = shaped.code ?? shaped.codes?.[0] ?? "forbidden";
    const status = code === "commerce_disabled" ? 503 : 400;
    deny(res, status, code as CommerceDenialCode, shaped.message);
    return;
  }
  deny(res, 500, "forbidden", "The request could not be completed.");
}
