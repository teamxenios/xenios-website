/** Preview composition only; no PostgreSQL, provider, browser, or production I/O. */
import express from "express";
import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { referralPreviewApiBoundary, registerReferralPreviewReadOnlyDependencies } from "../../../scripts/referral-v1/preview";

describe("local referral preview read-only dependency contract", () => {
  const app = express();
  const guard = vi.fn(() => { throw new Error("Disabled capability reached authentication"); });
  beforeAll(async () => {
    app.use(express.json());
    app.use("/api", referralPreviewApiBoundary);
    await registerReferralPreviewReadOnlyDependencies(app, { requireMember: guard, requireAdmin: guard });
  });

  it("uses canonical Care status with requests closed and no provider readiness", async () => {
    const response = await request(app).get("/api/care/access-request/status");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, acceptingRequests: false, workflow: "manual_human_follow_up", typicalResponse: "one_business_day", clinicalHandoff: "separate_secure_step_after_review" });
    expect(response.headers["cache-control"]).toContain("no-store");
  });

  it("labels the zero waitlist display as an explicit synthetic fixture", async () => {
    const response = await request(app).get("/api/waitlist/count");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ count: 0 });
    expect(response.headers["x-xenios-preview-fixture"]).toBe("synthetic-waitlist-count");
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("keeps actual Master Offering and activation controllers disabled", async () => {
    const catalog = await request(app).get("/api/research/catalog-display/v2/catalog");
    expect(catalog.status).toBe(503);
    expect(catalog.body).toEqual({ ok: false, code: "master_offerings_disabled" });
    expect(catalog.headers["cache-control"]).toBe("no-store");
    const activation = await request(app).get("/api/research/activation/status");
    expect(activation.status).toBe(503);
    expect(activation.body).toMatchObject({ ok: false, code: "capability_disabled" });
    expect(activation.body).not.toHaveProperty("active");
    expect(guard).not.toHaveBeenCalled();
  });

  it.each([
    "/api/care/access-request",
    "/api/waitlist/count",
    "/api/research/catalog-display/v2/catalog",
    "/api/research/activation/status",
    "/api/research/activation/identity/consent",
  ])("refuses non-referral writes before the real registrar: %s", async (route) => {
    const response = await request(app).post(route).send({ website: "synthetic-honeypot", accepted: true });
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ code: "outside_local_referral_preview" });
    expect(guard).not.toHaveBeenCalled();
  });
});
