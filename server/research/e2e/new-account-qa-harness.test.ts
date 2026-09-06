import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { buildNewAccountQaHarness, CONTROLLER_KEY, makeQualificationToken, ADMIN_AUTH_ID, NEW_ACCOUNT_EMAIL } from "../../../scripts/revenue-launch/new-account-qa-harness";

const originalNodeEnv = process.env.NODE_ENV;
afterEach(() => { process.env.NODE_ENV = originalNodeEnv; });

describe("dedicated new-account qualification harness", () => {
  it("refuses production mode", () => {
    process.env.NODE_ENV = "production";
    expect(() => buildNewAccountQaHarness()).toThrow("refuses production mode");
  });

  it("starts with an absent account and requires the canonical admin boundary", async () => {
    const { app } = buildNewAccountQaHarness();
    const initial = await request(app).post("/api/admin/research/access/inspect").send({ email: NEW_ACCOUNT_EMAIL });
    expect(initial.status).toBe(401);
    const state = await request(app).get("/__qualification/state");
    expect(state.body).toMatchObject({ approved: false, claimed: false, outbox: [] });
    expect(state.body.claimToken).toBeUndefined();
  });

  it("rejects wrong-purpose/tampered claim tokens and keeps the controller sink private", async () => {
    const { app } = buildNewAccountQaHarness();
    const denied = await request(app).post("/api/research/member/claim").send({ token: "v2.status.invalid.invalid.invalid", password: "long-enough-password" });
    expect(denied.status).toBe(401);
    const publicState = await request(app).get("/__qualification/state");
    expect(publicState.body.claimToken).toBeUndefined();
    expect(publicState.body.outbox).toEqual([]);
    expect((await request(app).get("/__qualification/state").set("X-Qualification-Controller", CONTROLLER_KEY)).status).toBe(200);
  });

  it("keeps unknown research APIs unavailable", async () => {
    const { app } = buildNewAccountQaHarness();
    expect((await request(app).get("/api/research/unknown-qualification-door")).status).toBe(404);
  });

  it("replays the positive approval, claim, and normal Auth path through the canonical admin guard", async () => {
    const { app, state, adminToken } = buildNewAccountQaHarness();
    const server = await new Promise<import("node:http").Server>((resolve) => {
      const listener = app.listen(5237, "127.0.0.1", () => resolve(listener));
    });
    try {
      const auth = { Authorization: `Bearer ${adminToken}` };
      const inspect = await request(server).post("/api/admin/research/access/inspect").set(auth).send({ email: NEW_ACCOUNT_EMAIL });
      expect(inspect.status).toBe(200);
      expect(inspect.body.inspection.identityState).toBe("absent");

      const wrongUser = await request(server).post("/api/admin/research/access/inspect")
        .set("Authorization", `Bearer ${makeQualificationToken(ADMIN_AUTH_ID, "other-admin@preview.invalid")}`)
        .send({ email: NEW_ACCOUNT_EMAIL });
      expect(wrongUser.status).toBe(403);
      const recovery = await request(server).post("/api/admin/research/access/inspect")
        .set("Authorization", `Bearer ${makeQualificationToken(ADMIN_AUTH_ID, "admin@preview.invalid", true)}`)
        .send({ email: NEW_ACCOUNT_EMAIL });
      expect(recovery.status).toBe(403);

      const approval = await request(server).post("/api/admin/research/access/approve-customer").set(auth).send({
        email: NEW_ACCOUNT_EMAIL, firstName: "New", lastName: "Customer", reason: "Dedicated browser qualification", expectedApplicationId: null, expectedUpdatedAt: null, idempotencyKey: "qualification-approval-001",
      });
      expect(approval.status).toBe(200);
      expect(approval.body).toMatchObject({ ok: true, state: "approved_customer", delivery: "queued" });
      expect(state.claimToken).toEqual(expect.any(String));
      expect(state.outbox[0]?.eventType).toBe("approved_customer_claim");

      const claim = await request(server).post("/api/research/member/claim").send({ token: state.claimToken, password: "positive-test-password" });
      expect(claim.status).toBe(200);
      expect(claim.body).toMatchObject({ ok: true, state: "active" });
      const signIn = await request(server).post("/auth/v1/token?grant_type=password").send({ email: NEW_ACCOUNT_EMAIL, password: "positive-test-password" });
      expect(signIn.status).toBe(200);
      expect(state.outbox.map((event) => event.eventType)).toEqual(["approved_customer_claim", "approved_customer_welcome"]);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
