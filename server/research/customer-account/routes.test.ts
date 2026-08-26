import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { CUSTOMER_ACCOUNT_PATHS, registerCustomerAccountApi } from "./routes";
import { createMemoryCustomerAccountPorts, defaultMemorySeeds } from "./memory-adapters";

// A test guard with the production shape: it attaches researchMember from a
// test header, or answers 401. Handlers never read identity anywhere else, so
// this is the only seam the tests need.
function buildApp() {
  const app = express();
  app.use(express.json());
  registerCustomerAccountApi(app, createMemoryCustomerAccountPorts(defaultMemorySeeds()), {
    requireMember: (req, res, next) => {
      const key = req.header("x-test-member");
      if (!key) {
        res.status(401).json({ kind: "denied", reason: "member_required" });
        return;
      }
      (req as { researchMember?: { id: string } }).researchMember = { id: key };
      next();
    },
  });
  return app;
}

describe("customer-account routes", () => {
  it("refuses every path without a member", async () => {
    const app = buildApp();
    for (const path of Object.values(CUSTOMER_ACCOUNT_PATHS)) {
      const res = await request(app).get(path);
      expect(res.status).toBe(401);
      expect(res.body.kind).toBe("denied");
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

  it("orders lists research and care/pharmacy lanes separately", async () => {
    const app = buildApp();
    const res = await request(app)
      .get(CUSTOMER_ACCOUNT_PATHS.orders)
      .set("x-test-member", "member-fixture-1");
    expect(res.body.data.research).toHaveLength(2);
    expect(res.body.data.carePharmacy).toHaveLength(1);
    expect(res.body.data.research[0].paymentState).toBe("awaiting_payment");
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
    }
  });

  it("opens a valid support case for the acting member", async () => {
    const app = buildApp();
    const res = await request(app)
      .post(CUSTOMER_ACCOUNT_PATHS.support)
      .set("x-test-member", "member-fixture-2")
      .send({ category: "account", subject: "Update my email", description: "Please advise." });
    expect(res.status).toBe(201);
    expect(res.body.data.state).toBe("open");
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
});
