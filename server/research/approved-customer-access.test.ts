import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { APPROVED_CUSTOMER_SCHEMA_VERSION, APPROVE_CUSTOMER_ACCESS_PATH } from "@shared/research/approved-customer-access";
import { approveCustomerAccount, claimApprovedCustomerAccount, registerApprovedCustomerAccessApi, type ApprovedCustomerAccessDependencies } from "./approved-customer-access";

const actor = "00000000-0000-4000-8000-000000000001";
const applicationId = "00000000-0000-4000-8000-000000000002";
const memberId = "00000000-0000-4000-8000-000000000003";
const userId = "00000000-0000-4000-8000-000000000004";
const email = "customer@example.invalid";
const input = { email, firstName: "Customer", lastName: "A", reason: "Approved for customer access", expectedApplicationId: null, expectedUpdatedAt: null, idempotencyKey: "synthetic-operation-0001" };
const approved = { ok: true, applicationId, approvalVersion: 1, state: "approved_customer", delivery: "queued", expiresAt: "2026-09-19T00:00:00Z", replayed: false };
const claimed = { ok: true, applicationId, memberId, state: "active", replayed: false };
function setup() {
  return {
    authority: vi.fn(async () => ({ schemaVersion: APPROVED_CUSTOMER_SCHEMA_VERSION })),
    approve: vi.fn(async () => approved as unknown), claim: vi.fn(async () => claimed as unknown),
    createAuth: vi.fn(async () => ({ kind: "created", userId, email, emailVerified: true } as const)),
    verifySignIn: vi.fn(async () => ({ userId, email, emailVerified: true })),
    kickOutbox: vi.fn(async () => {}),
  } satisfies ApprovedCustomerAccessDependencies;
}

describe("approved customer access authority", () => {
  it("normalizes the explicit email and queues delivery without inventing a payment or partner fact", async () => {
    const deps = setup();
    expect(await approveCustomerAccount(deps, actor, { ...input, email: " Customer@Example.Invalid " })).toEqual(approved);
    expect(deps.approve).toHaveBeenCalledWith({ ...input, actorAuthUserId: actor });
    expect(deps.createAuth).not.toHaveBeenCalled(); expect(deps.claim).not.toHaveBeenCalled();
  });
  it.each([{ actorAuthUserId: actor }, { role: "admin" }, { expectedApplicationId: applicationId }, { reason: "short" }])("rejects extra authority fields or incomplete approval input %j", async (extra) => {
    const deps = setup(); expect(await approveCustomerAccount(deps, actor, { ...input, ...extra })).toMatchObject({ ok: false, code: "invalid_input" });
    expect(deps.authority).not.toHaveBeenCalled();
  });
  it.each([null, {}, { schemaVersion: "old" }])("refuses missing or incompatible provisioned authority %j", async (value) => {
    const deps = setup(); deps.authority.mockResolvedValue(value as any);
    expect(await approveCustomerAccount(deps, actor, input)).toMatchObject({ code: "approved_access_unavailable" });
    expect(deps.approve).not.toHaveBeenCalled();
  });
  it("does not report malformed or wrong-application RPC output as success", async () => {
    const deps = setup(); deps.approve.mockResolvedValue({ ...approved, applicationId: actor });
    expect(await approveCustomerAccount(deps, actor, { ...input, expectedApplicationId: applicationId, expectedUpdatedAt: "2026-09-05T00:00:00Z" })).toMatchObject({ code: "approved_access_unavailable" });
    expect(deps.kickOutbox).not.toHaveBeenCalled();
  });
  it("preserves durable replay and truthful queued delivery when dispatch fails", async () => {
    const deps = setup(); deps.approve.mockResolvedValue({ ...approved, replayed: true }); deps.kickOutbox.mockRejectedValue(new Error("provider down"));
    expect(await approveCustomerAccount(deps, actor, input)).toEqual({ ...approved, replayed: true });
  });
  it("returns concurrent state/idempotency refusals without dispatch", async () => {
    const deps = setup(); deps.approve.mockResolvedValue({ ok: false, code: "stale_inspection" });
    expect(await approveCustomerAccount(deps, actor, input)).toEqual({ ok: false, code: "stale_inspection" });
    expect(deps.kickOutbox).not.toHaveBeenCalled();
  });
});

describe("email-owned approved customer claim", () => {
  const claimInput = { applicationId, email, password: "synthetic-password-only" };
  it("creates only the matching confirmed Auth identity and uses the atomic claim", async () => {
    const deps = setup(); expect(await claimApprovedCustomerAccount(deps, claimInput)).toEqual(claimed);
    expect(deps.createAuth).toHaveBeenCalledWith(email, claimInput.password); expect(deps.claim).toHaveBeenCalledWith(applicationId, userId);
  });
  it("supports normal existing sign-in without a password or an Auth write", async () => {
    const deps = setup(); expect(await claimApprovedCustomerAccount(deps, { applicationId, email, authorization: "Bearer verified" })).toEqual(claimed);
    expect(deps.createAuth).not.toHaveBeenCalled();
  });
  it("requires normal sign-in when Auth already exists and never resets the password", async () => {
    const deps = setup(); deps.createAuth.mockResolvedValue({ kind: "exists" } as any);
    expect(await claimApprovedCustomerAccount(deps, claimInput)).toMatchObject({ code: "existing_sign_in_required" }); expect(deps.claim).not.toHaveBeenCalled();
  });
  it.each([null, { userId, email: "other@example.invalid", emailVerified: true }, { userId, email, emailVerified: false }])("refuses a wrong, unverified or invalid existing identity %j", async (identity) => {
    const deps = setup(); deps.verifySignIn.mockResolvedValue(identity as any);
    expect((await claimApprovedCustomerAccount(deps, { ...claimInput, authorization: "Bearer invalid" })).ok).toBe(false);
    expect(deps.createAuth).not.toHaveBeenCalled(); expect(deps.claim).not.toHaveBeenCalled();
  });
  it("checks provisioning before creating Auth", async () => {
    const deps = setup(); deps.authority.mockRejectedValue(new Error("missing RPC"));
    expect((await claimApprovedCustomerAccount(deps, claimInput)).ok).toBe(false); expect(deps.createAuth).not.toHaveBeenCalled();
  });
  it.each([undefined, "short", "x".repeat(201)])("requires a valid new password", async (password) => {
    const deps = setup(); expect(await claimApprovedCustomerAccount(deps, { ...claimInput, password })).toMatchObject({ code: "invalid_input" }); expect(deps.createAuth).not.toHaveBeenCalled();
  });
  it("refuses mismatched claim output and preserves uncertain Auth for normal-sign-in retry", async () => {
    const deps = setup(); deps.claim.mockResolvedValue({ ...claimed, applicationId: actor });
    expect(await claimApprovedCustomerAccount(deps, claimInput)).toMatchObject({ code: "claim_incomplete" }); expect(deps.kickOutbox).not.toHaveBeenCalled();
    deps.claim.mockRejectedValue(new Error("uncertain transaction response"));
    expect(await claimApprovedCustomerAccount(deps, { applicationId, email, authorization: "Bearer verified" })).toMatchObject({ code: "claim_incomplete" });
  });
});

describe("approval HTTP boundary", () => {
  const token = (sub: string) => `synthetic.${Buffer.from(JSON.stringify({ sub })).toString("base64url")}.test`;
  function appFor(deps = setup()) {
    const app = express(); app.use(express.json());
    registerApprovedCustomerAccessApi(app, deps, (req, res, next) => {
      if (req.headers.authorization !== `Bearer ${token(actor)}`) { res.status(403).json({ ok: false }); return; } next();
    }); return { app, deps };
  }
  it("requires canonical admin authentication before trusting the actor JWT claim", async () => {
    const { app, deps } = appFor();
    const response = await request(app).post(APPROVE_CUSTOMER_ACCESS_PATH).set("Authorization", `Bearer ${token(userId)}`).send(input);
    expect(response.status).toBe(403); expect(response.headers["cache-control"]).toContain("no-store"); expect(deps.authority).not.toHaveBeenCalled();
  });
  it("binds approval to the authenticated actor and ignores no body-provided selector", async () => {
    const { app, deps } = appFor();
    const response = await request(app).post(APPROVE_CUSTOMER_ACCESS_PATH).set("Authorization", `Bearer ${token(actor)}`).send(input);
    expect(response.status).toBe(200); expect(deps.approve).toHaveBeenCalledWith({ ...input, actorAuthUserId: actor });
    expect((await request(app).post(APPROVE_CUSTOMER_ACCESS_PATH).set("Authorization", `Bearer ${token(actor)}`).send({ ...input, actorAuthUserId: userId })).status).toBe(400);
    expect((await request(app).get(APPROVE_CUSTOMER_ACCESS_PATH)).status).toBe(404);
  });
});
