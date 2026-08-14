/**
 * The task's success criterion, verbatim, over real HTTP: an ACTIVE MEMBER
 * places an Early Access order whose customer record carries their userId.
 *
 * The session wall stays first (no Early Access session still refuses
 * SESSION_REQUIRED, member or not), the base identity still wins when it
 * resolves, and the bridged order is owned by the member's durable canonical
 * customerRef rather than any session-scoped identity.
 */
import request from "supertest";
import { describe, expect, it } from "vitest";

import {
  EARLY_ACCESS_TEST_PASSWORD,
  ORDER_BODY,
  StubIdentityDirectory,
  approvedLedgerFor,
  catalogOf,
  cleanUnit,
  makeEarlyAccessApp,
} from "./route-fixtures";
import {
  InMemoryEarlyAccessCustomerRepository,
  createEarlyAccessCustomer,
  customerRefFor,
  transitionEarlyAccessCustomer,
} from "../identity/early-access-customer";
import type { MemberRow } from "../../member-auth";

const ORDERS = "/api/research/early-access/orders";
const NOW = "2026-08-14T12:00:00.000Z";
const MEMBER_EMAIL = "kris@example.com";
const MEMBER_USER_ID = "11111111-1111-4111-8111-aaaaaaaaaaaa";

const MEMBER_ROW = Object.freeze({
  id: "33333333-3333-4333-8333-cccccccccccc",
  auth_user_id: MEMBER_USER_ID,
  email: MEMBER_EMAIL,
  status: "active",
}) as unknown as MemberRow;

async function seededCustomers(): Promise<InMemoryEarlyAccessCustomerRepository> {
  const repo = new InMemoryEarlyAccessCustomerRepository();
  const created = createEarlyAccessCustomer({
    id: "eacid0001",
    email: MEMBER_EMAIL,
    legalName: "Kristopher Lopez",
    now: NOW,
  });
  if (!created.ok) throw new Error(`fixture refused: ${created.code}`);
  const approved = transitionEarlyAccessCustomer({
    customer: created.value,
    to: "APPROVED",
    by: "Samuel Boadu",
    reason: "Founder-confirmed Roman Health operator.",
    now: NOW,
  });
  if (!approved.ok) throw new Error(`fixture approval refused: ${approved.code}`);
  const inserted = await repo.insert(approved.value);
  if (!inserted.ok) throw new Error("fixture insert refused");
  return repo;
}

async function openSession(app: ReturnType<typeof makeEarlyAccessApp>["app"]): Promise<string> {
  const unlocked = await request(app)
    .post("/api/research/early-access/unlock")
    .send({ password: EARLY_ACCESS_TEST_PASSWORD });
  const header = unlocked.headers["set-cookie"];
  const raw = Array.isArray(header) ? header[0] : String(header ?? "");
  return raw.split(";")[0] ?? "";
}

describe("a member at the Early Access order door", () => {
  it("places an order as their canonical customer, and the record carries their userId", async () => {
    const unit = cleanUnit();
    const customers = await seededCustomers();
    const harness = makeEarlyAccessApp({
      catalog: catalogOf([unit]),
      releases: await approvedLedgerFor(unit),
      // No session-scoped fallback identity: the bridge is the only resolver.
      identity: new StubIdentityDirectory(),
      customers,
      resolveMember: async () => MEMBER_ROW,
    });
    const cookie = await openSession(harness.app);
    const placed = await request(harness.app)
      .post(ORDERS)
      .set("Cookie", cookie)
      .send({ ...ORDER_BODY });
    expect(placed.status).toBe(201);

    const record = await customers.findByNormalizedEmail(MEMBER_EMAIL);
    expect(record).not.toBeNull();
    // THE SUCCESS CRITERION: the customer record carries the member's userId.
    expect(record?.userId).toBe(MEMBER_USER_ID);

    // And the order is owned by that canonical customer.
    const orderNumber = placed.body.order.orderNumber as string;
    const placement = await harness.store.placementByOrderNumber(orderNumber);
    expect(placement?.customerRef).toBe(customerRefFor(record!));
    expect(placement?.bindingProvenance).toBe("verified_link");
  });

  it("still refuses SESSION_REQUIRED without an Early Access session, member or not", async () => {
    const unit = cleanUnit();
    const harness = makeEarlyAccessApp({
      catalog: catalogOf([unit]),
      releases: await approvedLedgerFor(unit),
      identity: new StubIdentityDirectory(),
      customers: await seededCustomers(),
      resolveMember: async () => MEMBER_ROW,
    });
    const refused = await request(harness.app).post(ORDERS).send({ ...ORDER_BODY });
    expect(refused.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(refused.body)).toMatch(/SESSION_REQUIRED/);
  });

  it("an unapproved customer resolves no identity: the door refuses rather than upgrading", async () => {
    const unit = cleanUnit();
    const repo = new InMemoryEarlyAccessCustomerRepository();
    const created = createEarlyAccessCustomer({
      id: "eacid0002",
      email: MEMBER_EMAIL,
      legalName: "Kristopher Lopez",
      now: NOW,
    });
    if (!created.ok) throw new Error("fixture refused");
    const inserted = await repo.insert(created.value); // stays INVITED
    if (!inserted.ok) throw new Error("fixture insert refused");

    const harness = makeEarlyAccessApp({
      catalog: catalogOf([unit]),
      releases: await approvedLedgerFor(unit),
      identity: new StubIdentityDirectory(),
      customers: repo,
      resolveMember: async () => MEMBER_ROW,
    });
    const cookie = await openSession(harness.app);
    const refused = await request(harness.app)
      .post(ORDERS)
      .set("Cookie", cookie)
      .send({ ...ORDER_BODY });
    expect(refused.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(refused.body)).toMatch(/IDENTITY_REQUIRED/);
    expect((await repo.findByNormalizedEmail(MEMBER_EMAIL))?.userId).toBeNull();
  });
});
