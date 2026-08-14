import type { Express, NextFunction, Request, Response } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import type { MemberRow } from "../../member-auth";
import type { BuyerPriceSheet, BuyerScopedPricing } from "../commerce/buyer-scoped-pricing";
import {
  InMemoryEarlyAccessCustomerRepository,
  createEarlyAccessCustomer,
  customerRefFor,
  transitionEarlyAccessCustomer,
} from "../identity/early-access-customer";
import {
  EARLY_ACCESS_TEST_PASSWORD,
  ORDER_BODY,
  UNIT_PRICE_CENTS,
  StubIdentityDirectory,
  approvedLedgerFor,
  catalogOf,
  cleanUnit,
  makeEarlyAccessApp,
} from "./route-fixtures";

/**
 * ADMIN PRICE-ISOLATION AT THE REAL EARLY ACCESS ORDER DOOR.
 *
 * A Xenios admin may also be an active member and an approved Early Access
 * customer. At a customer order route, that dual-role principal must lose the
 * admin half of its authority: pricing is resolved only for its own canonical
 * customerRef. This test makes every prerequisite valid so a refusal cannot be
 * mistaken for a session-wall or identity-wall success.
 */

const ORDERS = "/api/research/early-access/orders";
const ADMIN_PROBE = "/api/admin/research/early-access/verification-requests";
const NOW = "2026-08-14T18:30:00.000Z";

const ADMIN_EMAIL = "samuel@xeniostechnology.com";
const KRIS_EMAIL = "info@romanhealthcollective.com";
const ADMIN_BEARER = "Bearer test-admin-member-token";
const KRIS_BEARER = "Bearer test-kris-member-token";
const PARTNER_PRICE_CENTS = 8_756;

const ADMIN_MEMBER = Object.freeze({
  id: "22222222-2222-4222-8222-222222222222",
  application_id: "app-admin-isolation",
  auth_user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  email: ADMIN_EMAIL,
  first_name: "Samuel",
  status: "active",
  created_at: NOW,
}) satisfies MemberRow;

const KRIS_MEMBER = Object.freeze({
  id: "33333333-3333-4333-8333-333333333333",
  application_id: "app-kris-isolation",
  auth_user_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  email: KRIS_EMAIL,
  first_name: "Kristopher",
  status: "active",
  created_at: NOW,
}) satisfies MemberRow;

async function insertApprovedCustomer(
  customers: InMemoryEarlyAccessCustomerRepository,
  input: Readonly<{ id: string; email: string; legalName: string }>,
) {
  const created = createEarlyAccessCustomer({ ...input, now: NOW });
  if (!created.ok) throw new Error(`customer fixture refused: ${created.code}`);
  const approved = transitionEarlyAccessCustomer({
    customer: created.value,
    to: "APPROVED",
    by: "Samuel Boadu",
    reason: "Price-isolation route fixture",
    now: NOW,
  });
  if (!approved.ok) throw new Error(`approval fixture refused: ${approved.code}`);
  const inserted = await customers.insert(approved.value);
  if (!inserted.ok) throw new Error("customer fixture insert refused");
  return approved.value;
}

function memberFromBearer(req: Request): Promise<MemberRow | null> {
  const bearer = req.get("authorization");
  if (bearer === ADMIN_BEARER) return Promise.resolve(ADMIN_MEMBER);
  if (bearer === KRIS_BEARER) return Promise.resolve(KRIS_MEMBER);
  return Promise.resolve(null);
}

/** The same admin bearer positively controlled below is the named admin. */
function requireTestAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.get("authorization") !== ADMIN_BEARER) {
    res.status(401).json({ ok: false });
    return;
  }
  (req as Request & { adminEmail: string }).adminEmail = ADMIN_EMAIL;
  next();
}

async function openSession(app: Express): Promise<string> {
  const unlocked = await request(app)
    .post("/api/research/early-access/unlock")
    .send({ password: EARLY_ACCESS_TEST_PASSWORD });
  expect(unlocked.status).toBe(200);
  const header = unlocked.headers["set-cookie"];
  const raw = Array.isArray(header) ? header[0] : String(header ?? "");
  const cookie = raw.split(";")[0] ?? "";
  expect(cookie).not.toBe("");
  return cookie;
}

describe("a named admin at the buyer-scoped Early Access order door", () => {
  it("prices only its own customer: partner price refuses, public price sells, and Kris still gets the grant", async () => {
    const unit = cleanUnit();
    const customers = new InMemoryEarlyAccessCustomerRepository();
    const adminCustomer = await insertApprovedCustomer(customers, {
      id: "eacid0101",
      email: ADMIN_EMAIL,
      legalName: "Samuel Boadu",
    });
    const krisCustomer = await insertApprovedCustomer(customers, {
      id: "eacid0102",
      email: KRIS_EMAIL,
      legalName: "Kristopher Lopez",
    });
    const adminRef = customerRefFor(adminCustomer);
    const krisRef = customerRefFor(krisCustomer);
    expect(adminRef).not.toBe(krisRef);

    const partnerSheet: BuyerPriceSheet = {
      profileKey: "KRIS_VOLUME_PARTNER",
      entitlementId: "ent-admin-isolation-control",
      priceFor: (productId, variantId) =>
        productId === unit.productId && variantId === unit.variantId
          ? { amountCents: PARTNER_PRICE_CENTS, currency: "USD" }
          : null,
    };
    const forCustomer = vi.fn(
      async (customerRef: string): Promise<BuyerPriceSheet | null> =>
        customerRef === krisRef ? partnerSheet : null,
    );
    const pricing: BuyerScopedPricing = { forCustomer };

    const harness = makeEarlyAccessApp({
      catalog: catalogOf([unit]),
      releases: await approvedLedgerFor(unit),
      // Load-bearing: a default fallback identity would bypass the member bridge.
      identity: new StubIdentityDirectory(),
      customers,
      resolveMember: memberFromBearer,
      requireAdmin: requireTestAdmin,
      buyerScopedPrices: pricing,
    });

    // Positive control: this exact bearer is accepted as the named admin by the
    // real registered admin surface. The order assertions below use the same
    // bearer, but admin authority is not an input to customer pricing.
    const nonAdminProbe = await request(harness.app)
      .get(ADMIN_PROBE)
      .set("Authorization", KRIS_BEARER);
    expect(nonAdminProbe.status).toBe(401);
    const adminProbe = await request(harness.app)
      .get(ADMIN_PROBE)
      .set("Authorization", ADMIN_BEARER);
    expect(adminProbe.status).toBe(200);
    expect(forCustomer).not.toHaveBeenCalled();

    const cookie = await openSession(harness.app);
    const adminPartnerKey = "ea-admin-partner-price-attempt-0001";
    const refused = await request(harness.app)
      .post(ORDERS)
      .set("Cookie", cookie)
      .set("Authorization", ADMIN_BEARER)
      .send({
        ...ORDER_BODY,
        idempotencyKey: adminPartnerKey,
        expectedUnitPriceCents: PARTNER_PRICE_CENTS,
        // Every identity/profile hint is browser-controlled and must be ignored.
        customerRef: krisRef,
        memberId: KRIS_MEMBER.id,
        audience: "admin",
        profileKey: partnerSheet.profileKey,
      });

    expect(refused.status).toBe(409);
    expect(refused.body).toEqual({
      ok: false,
      code: "PRICE_CHANGED",
      unitPriceCents: UNIT_PRICE_CENTS,
      currency: "USD",
    });
    expect(forCustomer).toHaveBeenLastCalledWith(adminRef, expect.any(Number));
    expect(forCustomer.mock.calls.map(([customerRef]) => customerRef)).toEqual([adminRef]);
    expect(await harness.store.placementByIdempotencyKey(adminPartnerKey)).toBeNull();

    const refusedWire = JSON.stringify(refused.body);
    for (const privateValue of [
      partnerSheet.profileKey,
      partnerSheet.entitlementId,
      krisRef,
      KRIS_EMAIL,
      String(PARTNER_PRICE_CENTS),
    ]) {
      expect(refusedWire).not.toContain(privateValue);
    }

    // Admin privilege does not block ordinary customer commerce either: the
    // same principal may buy at the public amount, under its own customerRef.
    const adminPublicKey = "ea-admin-public-price-control-0001";
    const adminPublic = await request(harness.app)
      .post(ORDERS)
      .set("Cookie", cookie)
      .set("Authorization", ADMIN_BEARER)
      .send({ ...ORDER_BODY, idempotencyKey: adminPublicKey });
    expect(adminPublic.status).toBe(201);
    expect(adminPublic.body.order.money.unitPriceCents).toBe(UNIT_PRICE_CENTS);
    expect((await harness.store.placementByIdempotencyKey(adminPublicKey))?.customerRef).toBe(
      adminRef,
    );

    // Grant control: this is not an always-null provider or a globally refused
    // partner amount. The distinct Kris identity reaches the same HTTP door and
    // receives the sheet keyed only to Kris's canonical customerRef.
    const krisKey = "ea-kris-partner-price-control-0001";
    const krisPartner = await request(harness.app)
      .post(ORDERS)
      .set("Cookie", cookie)
      .set("Authorization", KRIS_BEARER)
      .send({
        ...ORDER_BODY,
        idempotencyKey: krisKey,
        expectedUnitPriceCents: PARTNER_PRICE_CENTS,
      });
    expect(krisPartner.status).toBe(201);
    expect(krisPartner.body.order.money.unitPriceCents).toBe(PARTNER_PRICE_CENTS);
    const krisPlacement = await harness.store.placementByIdempotencyKey(krisKey);
    expect(krisPlacement?.customerRef).toBe(krisRef);
    expect(krisPlacement?.order.order.line.unitPriceCents).toBe(PARTNER_PRICE_CENTS);
    expect(forCustomer.mock.calls.map(([customerRef]) => customerRef)).toEqual([
      adminRef,
      adminRef,
      krisRef,
    ]);
  });
});
