import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { buildNewAccountQaHarness, CONTROLLER_KEY, NEW_ACCOUNT_EMAIL } from "../../../scripts/revenue-launch/new-account-qa-harness";

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
});
