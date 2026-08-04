/**
 * The manual operations doors: the routes that turn Samuel's off-band work
 * into durable records the projection already consumes.
 *
 * Customer side (behind the private wall, session required):
 *   POST verification/request  { email } -> 202 always. If the email names an
 *     APPROVED customer, a token bound to (customer, THIS session) is minted
 *     into the admin-visible queue for MANUAL out-of-band delivery. The
 *     response never says whether the email exists.
 *   POST verify  { token } -> binds THIS session to the token's customer via
 *     the single-use redemption (wrong session leaves the token unburned).
 *
 * Admin side (behind THE admin guard):
 *   POST   customers                     -> create AND approve a customer,
 *          named human from the guard, one call, because approval is the
 *          founder's manual act here.
 *   GET    verification-requests         -> the queue of minted tokens
 *          awaiting manual delivery.
 *   POST   supplier-confirmations        -> record SUPPLIER_CONFIRMED_ON_DEMAND.
 *   POST   holds                         -> record a unit hold (R4's pen).
 *   POST   holds/withdraw                -> withdraw one, as a recorded state
 *          change, never a delete.
 *
 * Nothing here weakens a gate: recording a confirmation does not release a
 * unit (the projection re-reads it), recording a customer does not bind a
 * session (only redemption does), and every actor is the named human the
 * guard authenticated, never a body field.
 */

import { randomBytes } from "node:crypto";
import type { Express, Request, RequestHandler, Response } from "express";

import {
  createEarlyAccessCustomer,
  normalizeEmail,
  transitionEarlyAccessCustomer,
  type EarlyAccessCustomerRepository,
} from "../identity/early-access-customer";
import {
  mintVerificationToken,
  redeemVerificationToken,
  type ConsumedTokenStore,
  type SessionBindingStore,
} from "../identity/identity-verification";
import {
  createSupplierConfirmation,
  type SupplierConfirmationStore,
} from "../ops/supplier-confirmation";
import { recordUnitHold, type UnitHoldRegistry } from "../ops/unit-holds";

export const EARLY_ACCESS_VERIFICATION_REQUEST_PATH =
  "/api/research/early-access/verification/request";
export const EARLY_ACCESS_VERIFY_PATH = "/api/research/early-access/verify";
export const EARLY_ACCESS_ADMIN_CUSTOMERS_PATH =
  "/api/admin/research/early-access/customers";
export const EARLY_ACCESS_ADMIN_VERIFICATIONS_PATH =
  "/api/admin/research/early-access/verification-requests";
export const EARLY_ACCESS_ADMIN_SUPPLIER_CONFIRMATIONS_PATH =
  "/api/admin/research/early-access/supplier-confirmations";
export const EARLY_ACCESS_ADMIN_HOLDS_PATH =
  "/api/admin/research/early-access/holds";
export const EARLY_ACCESS_ADMIN_HOLD_WITHDRAW_PATH =
  "/api/admin/research/early-access/holds/withdraw";

/** A minted token awaiting MANUAL delivery to the customer's email owner. */
export type PendingVerification = Readonly<{
  tokenId: string;
  customerId: string;
  email: string;
  token: string;
  mintedAt: string;
}>;

export class InMemoryPendingVerificationQueue {
  private readonly entries: PendingVerification[] = [];
  add(entry: PendingVerification): void {
    this.entries.push(entry);
  }
  all(): readonly PendingVerification[] {
    return [...this.entries];
  }
}

export interface EarlyAccessOpsRouteDependencies {
  readonly guard: RequestHandler;
  readonly adminActor: (request: Request) => string | null;
  readonly resolveSession: (cookieHeader: unknown) => Promise<{ authenticated: boolean }>;
  readonly readSessionId: (cookieHeader: unknown) => string | null;
  readonly customers: EarlyAccessCustomerRepository;
  readonly sessionBindings: SessionBindingStore;
  readonly consumed: ConsumedTokenStore;
  readonly confirmations: SupplierConfirmationStore;
  readonly holds: UnitHoldRegistry;
  readonly verificationQueue: InMemoryPendingVerificationQueue;
  readonly secret: string;
  readonly now: () => number;
}

function body(req: Request): Record<string, unknown> {
  return typeof req.body === "object" && req.body !== null
    ? (req.body as Record<string, unknown>)
    : {};
}

function text(value: unknown, max = 500): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || value.length > max) return null;
  return trimmed;
}

export function registerEarlyAccessOpsRoutes(
  app: Express,
  deps: EarlyAccessOpsRouteDependencies,
): void {
  // -------------------------------------------------------------------------
  // Customer doors
  // -------------------------------------------------------------------------

  app.post(EARLY_ACCESS_VERIFICATION_REQUEST_PATH, (req: Request, res: Response) => {
    void (async () => {
      const session = await deps.resolveSession(req.headers.cookie);
      if (!session.authenticated) {
        res.status(401).json({ ok: false, code: "SESSION_REQUIRED" });
        return;
      }
      const sessionId = deps.readSessionId(req.headers.cookie);
      const email = text(body(req).email, 320);
      // The answer is 202 regardless: this endpoint must not be an oracle for
      // which emails are Early Access customers.
      const accepted = { ok: true, code: "VERIFICATION_REQUESTED" };
      if (sessionId === null || email === null) {
        res.status(202).json(accepted);
        return;
      }
      const customer = await deps.customers.findByNormalizedEmail(normalizeEmail(email));
      if (customer !== null && customer.status === "APPROVED") {
        const nowMs = deps.now();
        const minted = mintVerificationToken({
          tokenId: `vtok_${randomBytes(16).toString("hex")}`,
          customerId: customer.id,
          email: customer.email,
          sessionId,
          nowMs,
          secret: deps.secret,
        });
        if (minted.ok) {
          deps.verificationQueue.add({
            tokenId: `vtok_queue_${randomBytes(8).toString("hex")}`,
            customerId: customer.id,
            email: customer.email,
            token: minted.value,
            mintedAt: new Date(nowMs).toISOString(),
          });
        }
      }
      res.status(202).json(accepted);
    })().catch(() => res.status(503).json({ ok: false, code: "UNAVAILABLE" }));
  });

  app.post(EARLY_ACCESS_VERIFY_PATH, (req: Request, res: Response) => {
    void (async () => {
      const session = await deps.resolveSession(req.headers.cookie);
      if (!session.authenticated) {
        res.status(401).json({ ok: false, code: "SESSION_REQUIRED" });
        return;
      }
      const sessionId = deps.readSessionId(req.headers.cookie);
      const token = body(req).token;
      if (sessionId === null || typeof token !== "string" || token.length === 0) {
        res.status(400).json({ ok: false, code: "REQUEST_INVALID" });
        return;
      }
      const redeemed = await redeemVerificationToken({
        token,
        sessionId,
        secret: deps.secret,
        nowMs: deps.now(),
        customers: deps.customers,
        consumed: deps.consumed,
        bindings: deps.sessionBindings,
      });
      if (!redeemed.ok) {
        res.status(403).json({ ok: false, code: "VERIFICATION_REFUSED" });
        return;
      }
      res.status(200).json({ ok: true, code: "SESSION_BOUND" });
    })().catch(() => res.status(503).json({ ok: false, code: "UNAVAILABLE" }));
  });

  // -------------------------------------------------------------------------
  // Admin doors
  // -------------------------------------------------------------------------

  app.post(EARLY_ACCESS_ADMIN_CUSTOMERS_PATH, deps.guard, (req: Request, res: Response) => {
    void (async () => {
      const actor = deps.adminActor(req);
      if (actor === null) {
        res.status(403).json({ ok: false, code: "ACTOR_NOT_PERMITTED" });
        return;
      }
      const payload = body(req);
      const email = text(payload.email, 320);
      const legalName = text(payload.legalName, 200);
      const phone = text(payload.phone, 40);
      const reason = text(payload.reason, 500);
      if (email === null || legalName === null || phone === null || reason === null) {
        res.status(400).json({ ok: false, code: "REQUEST_INVALID" });
        return;
      }
      const nowIso = new Date(deps.now()).toISOString();
      const created = createEarlyAccessCustomer({
        id: `cus_${randomBytes(12).toString("hex")}`,
        email,
        legalName,
        phone,
        now: nowIso,
      });
      if (!created.ok) {
        res.status(422).json({ ok: false, code: created.code });
        return;
      }
      const approved = transitionEarlyAccessCustomer({
        customer: created.value,
        to: "APPROVED",
        by: actor,
        reason,
        now: nowIso,
      });
      if (!approved.ok) {
        res.status(422).json({ ok: false, code: approved.code });
        return;
      }
      const inserted = await deps.customers.insert(approved.value);
      if (!inserted.ok) {
        res.status(409).json({ ok: false, code: inserted.code });
        return;
      }
      res.status(201).json({
        ok: true,
        customer: {
          id: approved.value.id,
          email: approved.value.email,
          legalName: approved.value.legalName,
          status: approved.value.status,
        },
      });
    })().catch(() => res.status(503).json({ ok: false, code: "UNAVAILABLE" }));
  });

  app.get(EARLY_ACCESS_ADMIN_VERIFICATIONS_PATH, deps.guard, (_req: Request, res: Response) => {
    res.status(200).json({ ok: true, requests: deps.verificationQueue.all() });
  });

  app.post(
    EARLY_ACCESS_ADMIN_SUPPLIER_CONFIRMATIONS_PATH,
    deps.guard,
    (req: Request, res: Response) => {
      void (async () => {
        const actor = deps.adminActor(req);
        if (actor === null) {
          res.status(403).json({ ok: false, code: "ACTOR_NOT_PERMITTED" });
          return;
        }
        const payload = body(req);
        const created = createSupplierConfirmation({
          confirmationId:
            text(payload.confirmationId, 128) ??
            `supconf_${randomBytes(12).toString("hex")}`,
          supplierOrg: String(payload.supplierOrg ?? ""),
          supplierContact: String(payload.supplierContact ?? ""),
          productId: String(payload.productId ?? ""),
          variantId: String(payload.variantId ?? ""),
          sku: String(payload.sku ?? ""),
          supplierSku: String(payload.supplierSku ?? ""),
          strength: String(payload.strength ?? ""),
          presentation: String(payload.presentation ?? ""),
          maxQuantity: Number(payload.maxQuantity),
          fulfillmentLocation: String(payload.fulfillmentLocation ?? ""),
          fulfillmentMethod: String(payload.fulfillmentMethod ?? ""),
          targetHandoffHours: Number(payload.targetHandoffHours ?? 72),
          shippingRequirements: String(payload.shippingRequirements ?? ""),
          coldChainState: String(payload.coldChainState ?? ""),
          documentationState: String(payload.documentationState ?? ""),
          confirmedAt: String(payload.confirmedAt ?? new Date(deps.now()).toISOString()),
          expiresAt: String(payload.expiresAt ?? ""),
          // The named human is the one the GUARD authenticated, never a body
          // field: what arrives in the body cannot promote itself to an actor.
          confirmedBy: actor,
          evidenceRef: String(payload.evidenceRef ?? ""),
        });
        if (!created.ok) {
          res.status(422).json({ ok: false, code: created.code });
          return;
        }
        const inserted = await deps.confirmations.insert(created.value);
        res.status(inserted ? 201 : 200).json({
          ok: true,
          replayed: !inserted,
          confirmationId: created.value.confirmationId,
        });
      })().catch(() => res.status(503).json({ ok: false, code: "UNAVAILABLE" }));
    },
  );

  app.post(EARLY_ACCESS_ADMIN_HOLDS_PATH, deps.guard, (req: Request, res: Response) => {
    void (async () => {
      const actor = deps.adminActor(req);
      if (actor === null) {
        res.status(403).json({ ok: false, code: "ACTOR_NOT_PERMITTED" });
        return;
      }
      const payload = body(req);
      const recorded = recordUnitHold({
        holdId: text(payload.holdId, 128) ?? `hold_${randomBytes(12).toString("hex")}`,
        kind: payload.kind as never,
        productId: String(payload.productId ?? ""),
        variantId: String(payload.variantId ?? ""),
        reason: String(payload.reason ?? ""),
        recordedBy: actor,
        recordedAt: new Date(deps.now()).toISOString(),
      });
      if (!recorded.ok) {
        res.status(422).json({ ok: false, code: recorded.code });
        return;
      }
      const inserted = await deps.holds.record(recorded.value);
      res.status(inserted ? 201 : 200).json({
        ok: true,
        replayed: !inserted,
        holdId: recorded.value.holdId,
      });
    })().catch(() => res.status(503).json({ ok: false, code: "UNAVAILABLE" }));
  });

  app.post(EARLY_ACCESS_ADMIN_HOLD_WITHDRAW_PATH, deps.guard, (req: Request, res: Response) => {
    void (async () => {
      const actor = deps.adminActor(req);
      if (actor === null) {
        res.status(403).json({ ok: false, code: "ACTOR_NOT_PERMITTED" });
        return;
      }
      const holdId = text(body(req).holdId, 128);
      if (holdId === null) {
        res.status(400).json({ ok: false, code: "REQUEST_INVALID" });
        return;
      }
      const withdrawn = await deps.holds.withdraw(
        holdId,
        actor,
        new Date(deps.now()).toISOString(),
      );
      if (!withdrawn) {
        res.status(404).json({ ok: false, code: "HOLD_NOT_FOUND" });
        return;
      }
      res.status(200).json({ ok: true });
    })().catch(() => res.status(503).json({ ok: false, code: "UNAVAILABLE" }));
  });
}
