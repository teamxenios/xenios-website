import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import type { CustomerAccountPorts } from "./ports";
import { CUSTOMER_ACCOUNT_PATHS, registerCustomerAccountApi } from "./routes";
import { createMemoryCustomerAccountPorts, defaultMemorySeeds } from "./memory-adapters";
import { FIXTURE_CUSTOMER_ORDERS, FIXTURE_MEMBERSHIP_MANUAL } from "@shared/research/customer-account/fixtures";

// Test guards with the production shape: requireMember attaches researchMember
// from a test header or answers 401; requireActiveMember additionally applies
// the status gate the merged production guard applies (x-test-status header
// models research_members.status; absent means active). Handlers never read
// identity anywhere else, so these are the only seams the tests need.
function buildApp(portsOverride?: Partial<CustomerAccountPorts>) {
  const app = express();
  app.use(express.json());
  const ports = { ...createMemoryCustomerAccountPorts(defaultMemorySeeds()), ...portsOverride };
  const requireMember = (
    req: express.Request,
    res: express.Response,
    next: () => void,
  ) => {
    const key = req.header("x-test-member");
    if (!key) {
      res.status(401).json({ kind: "denied", reason: "member_required" });
      return;
    }
    (req as { researchMember?: { id: string } }).researchMember = { id: key };
    next();
  };
  registerCustomerAccountApi(app, ports, {
    requireMember,
    requireActiveMember: (req, res, next) => {
      requireMember(req, res, () => {
        const status = req.header("x-test-status") ?? "active";
        if (status !== "active") {
          res.status(403).json({ ok: false, code: `status_${status}` });
          return;
        }
        next();
      });
    },
  });
  return app;
}

function expectPrivateNoStore(res: { headers: Record<string, string | string[] | undefined> }) {
  expect(res.headers["cache-control"]).toBe("no-store");
  expect(res.headers.pragma).toBe("no-cache");
}

describe("customer-account routes", () => {
  it("refuses every path without a member", async () => {
    const app = buildApp();
    for (const path of Object.values(CUSTOMER_ACCOUNT_PATHS)) {
      const res = await request(app).get(path);
      expect(res.status).toBe(401);
      expect(res.body.kind).toBe("denied");
      expectPrivateNoStore(res);
    }
  });

  it("returns the overview for the acting member only", async () => {
    const app = buildApp();
    const res = await request(app)
      .get(CUSTOMER_ACCOUNT_PATHS.overview)
      .set("x-test-member", "member-fixture-1");
    expect(res.status).toBe(200);
    expect(res.body.kind).toBe("ok");
    expect(res.body.data.identity.email).toBe("test.customer@example.invalid");
    expect(res.body.data.researchOrders).toHaveLength(2);
    expectPrivateNoStore(res);
  });

  it("serves an actionable target only from the authenticated member's own records", async () => {
    const scopedPorts = createMemoryCustomerAccountPorts(defaultMemorySeeds().map((seed, index) => index === 0 ? {
      ...seed,
      orders: {
        ...FIXTURE_CUSTOMER_ORDERS,
        research: [{ ...FIXTURE_CUSTOMER_ORDERS.research[0], recordKind: "order" as const, reference: "ORDER-SYNTHETIC-PRIVATE" }],
      },
    } : seed));
    const app = buildApp(scopedPorts);
    const owner = await request(app).get(CUSTOMER_ACCOUNT_PATHS.overview).set("x-test-member", "member-fixture-1");
    expect(owner.status).toBe(200);
    expect(owner.body.data.nextAdministrativeActionTarget).toEqual({ kind: "order", reference: "ORDER-SYNTHETIC-PRIVATE" });
    expect(owner.body.data.accountStanding).toBe("attention");
    expectPrivateNoStore(owner);

    const other = await request(app)
      .get(`${CUSTOMER_ACCOUNT_PATHS.overview}?memberId=member-fixture-1&reference=ORDER-SYNTHETIC-PRIVATE`)
      .set("x-test-member", "member-fixture-2");
    expect(other.status).toBe(200);
    expect(other.body.data.nextAdministrativeActionTarget).toBeNull();
    expect(JSON.stringify(other.body)).not.toContain("ORDER-SYNTHETIC-PRIVATE");
    expectPrivateNoStore(other);
  });

  it("NEVER exposes partner attribution on the member surface", async () => {
    const app = buildApp();
    const res = await request(app)
      .get(CUSTOMER_ACCOUNT_PATHS.overview)
      .set("x-test-member", "member-fixture-1");
    // member-fixture-1 HAS an attribution seeded; the member view must omit it.
    expect(res.body.data.partnerAttribution).toBeNull();
    expect(JSON.stringify(res.body)).not.toContain("vitality_advisors");
    expect(JSON.stringify(res.body)).not.toContain("Seth");
  });

  it("keeps customers isolated: the empty customer sees nothing of the rich one", async () => {
    const app = buildApp();
    const res = await request(app)
      .get(CUSTOMER_ACCOUNT_PATHS.overview)
      .set("x-test-member", "member-fixture-2");
    expect(res.status).toBe(200);
    expect(res.body.data.researchOrders).toHaveLength(0);
    expect(res.body.data.documents).toHaveLength(0);
    expect(JSON.stringify(res.body)).not.toContain("XRR-20260820-TESTFIX01");
  });

  it("answers 404 for a member with no customer record", async () => {
    const app = buildApp();
    const res = await request(app)
      .get(CUSTOMER_ACCOUNT_PATHS.overview)
      .set("x-test-member", "member-unknown");
    expect(res.status).toBe(404);
    expect(res.body.reason).toBe("customer_not_found");
  });

  it("subscription keeps membership and Care as separate objects", async () => {
    const app = buildApp();
    const res = await request(app)
      .get(CUSTOMER_ACCOUNT_PATHS.subscription)
      .set("x-test-member", "member-fixture-1");
    expect(res.body.data.membership.state).toBe("active");
    expect(res.body.data.careEnrollment.enrolled).toBe(true);
    // An active membership must not leak into Care truth: pharmacy untouched.
    expect(res.body.data.careEnrollment.pharmacyState).toBe("none");
  });

  it("fails subscription closed when an adapted producer contradicts the renewal mirror", async () => {
    const app = buildApp({
      membership: {
        async membershipFor() {
          return {
            ...FIXTURE_MEMBERSHIP_MANUAL,
            renewal: {
              state: "scheduled",
              nextRenewalAt: "2026-10-01T00:00:00.000Z",
            },
            nextRenewalAt: "2026-11-01T00:00:00.000Z",
          } as never;
        },
      },
    });

    const res = await request(app)
      .get(CUSTOMER_ACCOUNT_PATHS.subscription)
      .set("x-test-member", "member-fixture-1");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ kind: "error" });
    expect(JSON.stringify(res.body)).not.toContain("2026-10");
    expect(JSON.stringify(res.body)).not.toContain("2026-11");
  });

  it("fails subscription closed when scheduled renewal evidence is not a timestamp", async () => {
    const app = buildApp({
      membership: {
        async membershipFor() {
          return {
            ...FIXTURE_MEMBERSHIP_MANUAL,
            renewal: { state: "scheduled", nextRenewalAt: "not-a-date" },
            nextRenewalAt: "not-a-date",
          } as never;
        },
      },
    });

    const res = await request(app)
      .get(CUSTOMER_ACCOUNT_PATHS.subscription)
      .set("x-test-member", "member-fixture-1");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ kind: "error" });
    expect(JSON.stringify(res.body)).not.toContain("not-a-date");
  });

  it("orders lists research and care/pharmacy lanes separately", async () => {
    const app = buildApp();
    const res = await request(app)
      .get(CUSTOMER_ACCOUNT_PATHS.orders)
      .set("x-test-member", "member-fixture-1");
    expect(res.body.data.research).toHaveLength(2);
    expect(res.body.data.carePharmacy).toHaveLength(1);
    expect(res.body.data.research[0].paymentState).toBe("unpaid");
  });

  it("rejects malformed support cases with 400, never 500", async () => {
    const app = buildApp();
    for (const bad of [
      {},
      { category: "order" },
      { category: "not-a-category", subject: "x", description: "y" },
      { category: "order", subject: "", description: "y" },
      { category: "order", subject: "x".repeat(201), description: "y" },
    ]) {
      const res = await request(app)
        .post(CUSTOMER_ACCOUNT_PATHS.support)
        .set("x-test-member", "member-fixture-1")
        .send(bad);
      expect(res.status).toBe(400);
      expect(res.body.reason).toBe("invalid_support_case");
      expectPrivateNoStore(res);
    }
  });

  it("an exhausted support budget answers 429 rate_limited, never a generic 500", async () => {
    const app = buildApp({
      support: {
        casesFor: async () => [],
        openCase: async () => {
          throw new Error("support_rate_limited");
        },
      },
    });
    const res = await request(app)
      .post(CUSTOMER_ACCOUNT_PATHS.support)
      .set("x-test-member", "member-fixture-1")
      .send({ category: "order", subject: "s", description: "d" });
    expect(res.status).toBe(429);
    expect(res.body.reason).toBe("rate_limited");
    expectPrivateNoStore(res);
  });

  it("opens a valid support case for the acting member", async () => {
    const app = buildApp();
    const res = await request(app)
      .post(CUSTOMER_ACCOUNT_PATHS.support)
      .set("x-test-member", "member-fixture-2")
      .send({ category: "account", subject: "Update my email", description: "Please advise." });
    expect(res.status).toBe(201);
    expect(res.body.data.state).toBe("open");
    expectPrivateNoStore(res);
    // and it shows up in that member's list, not the other member's
    const mine = await request(app)
      .get(CUSTOMER_ACCOUNT_PATHS.support)
      .set("x-test-member", "member-fixture-2");
    expect(mine.body.data.some((c: { id: string }) => c.id === res.body.data.id)).toBe(true);
    const theirs = await request(app)
      .get(CUSTOMER_ACCOUNT_PATHS.support)
      .set("x-test-member", "member-fixture-1");
    expect(theirs.body.data.some((c: { id: string }) => c.id === res.body.data.id)).toBe(false);
  });

  it("catalog-priority refuses when no projection is composed", async () => {
    const app = buildApp();
    const res = await request(app)
      .get(CUSTOMER_ACCOUNT_PATHS.catalogPriority)
      .set("x-test-member", "member-fixture-1");
    expect(res.status).toBe(404);
    expect(res.body.reason).toBe("catalog_priority_unavailable");
  });

  it("catalog-priority serves statuses only when the port is composed", async () => {
    const app = buildApp({
      catalogPriority: {
        catalogPriorityFor: async () => ({
          statuses: { dsip: "live", "aod-motsc-tesa-ipa": "verbally_confirmed_pending_documentation" },
          queue: [
            { key: "Q-2026-08-26-01", title: "Retatrutide 48 mg", status: "verbally_confirmed_pending_documentation" },
          ],
        }),
      },
    });
    const res = await request(app)
      .get(CUSTOMER_ACCOUNT_PATHS.catalogPriority)
      .set("x-test-member", "member-fixture-1");
    expect(res.status).toBe(200);
    expect(res.body.data.statuses.dsip).toBe("live");
    expect(res.body.data.queue).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toContain("demandMentions");
  });

  // P1-2 (2026-08-27): the catalog-priority projection is GLOBAL
  // availability-pipeline data, so it carries the active-member door. Every
  // non-active status must be refused by the guard before the port is reached.
  it("catalog-priority is ACTIVE members only: every non-active status is refused", async () => {
    let portReads = 0;
    const app = buildApp({
      catalogPriority: {
        catalogPriorityFor: async () => {
          portReads += 1;
          return { statuses: { dsip: "live" }, queue: [] };
        },
      },
    });
    const get = (status?: string) => {
      const req = request(app)
        .get(CUSTOMER_ACCOUNT_PATHS.catalogPriority)
        .set("x-test-member", "member-fixture-1");
      return status ? req.set("x-test-status", status) : req;
    };

    for (const status of ["pending_activation", "paused", "cancelled", "past_due"]) {
      const res = await get(status);
      expect(res.status, status).toBe(403);
      expect(res.body.code).toBe(`status_${status}`);
      expectPrivateNoStore(res);
    }
    expect(portReads).toBe(0); // no denied caller ever reached the projection

    const unauthenticated = await request(app).get(CUSTOMER_ACCOUNT_PATHS.catalogPriority);
    expect(unauthenticated.status).toBe(401);

    const active = await get();
    expect(active.status).toBe(200);
    expect(portReads).toBe(1);
  });

  it("the seven per-member paths deliberately do NOT require active status", async () => {
    // A past-due customer must still read their own account state.
    const app = buildApp();
    const res = await request(app)
      .get(CUSTOMER_ACCOUNT_PATHS.overview)
      .set("x-test-member", "member-fixture-1")
      .set("x-test-status", "past_due");
    expect(res.status).toBe(200);
  });

  it("document download denies when no byte capability is composed", async () => {
    const app = buildApp();
    const res = await request(app)
      .get(`${CUSTOMER_ACCOUNT_PATHS.documents}/doc-fixture-0001`)
      .set("x-test-member", "member-fixture-1");
    expect(res.status).toBe(404);
    expect(res.body.reason).toBe("document_unavailable");
    expectPrivateNoStore(res);
  });

  it("document download serves bytes for the OWNING member only", async () => {
    const memory = createMemoryCustomerAccountPorts(defaultMemorySeeds());
    const app = buildApp({
      documents: {
        documentsFor: (memberKey) => memory.documents.documentsFor(memberKey),
        openDocument: async (memberKey, documentId) =>
          memberKey === "member-fixture-1" && documentId === "doc-fixture-0001"
            ? {
                bytes: new Uint8Array([37, 80, 68, 70]),
                contentType: "application/pdf",
                filename: "Receipt.pdf",
              }
            : null,
      },
    });
    const owner = await request(app)
      .get(`${CUSTOMER_ACCOUNT_PATHS.documents}/doc-fixture-0001`)
      .set("x-test-member", "member-fixture-1");
    expect(owner.status).toBe(200);
    expect(owner.headers["content-type"]).toContain("application/pdf");
    expect(owner.headers["content-disposition"]).toContain("Receipt.pdf");
    expectPrivateNoStore(owner);

    const stranger = await request(app)
      .get(`${CUSTOMER_ACCOUNT_PATHS.documents}/doc-fixture-0001`)
      .set("x-test-member", "member-fixture-2");
    expect(stranger.status).toBe(404);
    expect(stranger.body.reason).toBe("document_unavailable");
    expectPrivateNoStore(stranger);

    const anonymous = await request(app).get(
      `${CUSTOMER_ACCOUNT_PATHS.documents}/doc-fixture-0001`,
    );
    expect(anonymous.status).toBe(401);
    expectPrivateNoStore(anonymous);
  });

  it("keeps unexpected private-handler errors out of every cache", async () => {
    const app = buildApp({
      orders: {
        ordersFor: async () => {
          throw new Error("private_store_unavailable");
        },
      },
    });
    const res = await request(app)
      .get(CUSTOMER_ACCOUNT_PATHS.orders)
      .set("x-test-member", "member-fixture-1");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ kind: "error" });
    expectPrivateNoStore(res);
  });
});
