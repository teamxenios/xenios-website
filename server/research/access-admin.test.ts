import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { APPROVED_USER_ACCESS_PATH } from "@shared/research/approved-user-access";
import { DEFAULT_PARTNER_REQUIREMENTS } from "./partners/partners";
import { projectAccessInspection, registerAccessInspectionApi, type AccessInspectionFacts } from "./access-admin";

const ids = [1, 2, 3, 4].map((n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`);
const email = "customer@example.invalid";
const now = () => new Date("2026-09-05T00:00:00Z");
const deps = { now, membershipBillingEnabled: () => false };
const empty = (): AccessInspectionFacts => ({ auth: [], applications: [], members: [], partners: [], organizations: { state: "available", records: [] } });
function linked(): AccessInspectionFacts {
  return { ...empty(),
    auth: [{ id: ids[0], email, emailVerified: true, signInRecorded: true }],
    applications: [{ id: ids[3], email, status: "approved_pending_payment" }],
    members: [{ id: ids[1], email, authUserId: ids[0], status: "pending_activation" }],
    partners: [{ id: ids[2], memberId: ids[1], role: "affiliate", state: "application", identityVerified: false,
      taxStatus: "not_started", payoutStatus: "not_started", certifiedAt: null, agreements: [], training: [] }],
  };
}
function appWith(facts: AccessInspectionFacts = empty()) {
  const app = express(); app.use(express.json());
  const inspect = vi.fn(async () => facts);
  registerAccessInspectionApi(app, { ...deps, inspect }, (req, res, next) => {
    if (req.headers.authorization !== "Bearer synthetic-admin") { res.status(403).json({ ok: false }); return; }
    next();
  });
  return { app, inspect };
}

describe("admin approved-user diagnosis", () => {
  it("states absent records without treating them as approval or verified ownership", () => {
    const result = projectAccessInspection(email, empty(), deps);
    expect(result.identityState).toBe("absent");
    expect(result.nextActions).toEqual([expect.objectContaining({ href: "/research/apply", notification: "application_email" })]);
    expect(result.boundaries).toMatchObject({ care: "separate_authority", partnerLifecycleReview: "unavailable", referralEligibility: "checked_by_referral_authority" });
    expect(JSON.stringify(result)).not.toMatch(/seth|jmiami/i);
  });

  it("keeps verified identity, customer activation and every partner requirement separate", () => {
    const result = projectAccessInspection(email, linked(), deps);
    expect(result.identityState).toBe("verified");
    expect(result.members[0].binding).toBe("verified");
    expect(result.partners[0].missingRequirements).toHaveLength(23);
    expect(result.nextActions.map((a) => a.label)).toContain("Customer access approval required");
    expect(result.nextActions.find((a) => a.label === "Review customer application")?.consequence).toContain("does not activate membership");
  });

  it("does not bind a partner by matching email when the member id differs", () => {
    const facts = linked(); facts.partners[0].memberId = ids[3];
    const result = projectAccessInspection(email, facts, deps);
    expect(result.partners[0].binding).toBe("missing");
    expect(result.partners[0].missingRequirements).toContain("verified_member_binding");
  });

  it.each(["unverified", "wrong_auth", "wrong_email", "duplicate_auth"])("does not infer verified member binding for %s", (kind) => {
    const facts = linked();
    if (kind === "unverified") facts.auth[0].emailVerified = false;
    if (kind === "wrong_auth") facts.members[0].authUserId = ids[3];
    if (kind === "wrong_email") facts.members[0].email = "other@example.invalid";
    if (kind === "duplicate_auth") facts.auth.push({ ...facts.auth[0], id: ids[3] });
    const result = projectAccessInspection(email, facts, deps);
    expect(result.members[0].binding).not.toBe("verified");
    expect(result.partners[0].missingRequirements).toContain("verified_member_binding");
  });

  it("requires actual current agreement and training evidence, refusing declined/future facts", () => {
    const facts = linked(); const p = facts.partners[0];
    p.identityVerified = true; p.taxStatus = "verified"; p.payoutStatus = "verified";
    p.state = "active"; p.certifiedAt = "2026-09-01T00:00:00Z";
    p.agreements = DEFAULT_PARTNER_REQUIREMENTS.agreements.map((a) => ({ ...a, accepted: true, contentHash: "evidence-hash", decidedAt: "2026-09-01T00:00:00Z" }));
    p.training = DEFAULT_PARTNER_REQUIREMENTS.trainingModules.map((t) => ({ ...t, completedAt: "2026-09-01T00:00:00Z" }));
    expect(projectAccessInspection(email, facts, deps).partners[0].missingRequirements).toEqual([]);
    p.agreements[0].accepted = false;
    p.training[0].completedAt = "2027-01-01T00:00:00Z";
    expect(projectAccessInspection(email, facts, deps).partners[0].missingRequirements).toHaveLength(2);
  });

  it("does not copy private source fields or clinical information into the read projection", () => {
    const facts = linked();
    Object.assign(facts.partners[0], { internalNotes: "PRIVATE_NOTES", taxDocument: "PRIVATE_TAX" });
    Object.assign(facts.auth[0], { rawUserMetadata: "PRIVATE_AUTH", password: "PRIVATE_PASSWORD" });
    const serialized = JSON.stringify(projectAccessInspection(email, facts, deps));
    expect(serialized).not.toContain("PRIVATE_");
    expect(serialized).not.toContain("contentHash");
    expect(serialized).not.toContain("password");
  });

  it("refuses unauthorized readers before any identity lookup", async () => {
    const { app, inspect } = appWith(linked());
    for (const token of ["", "Bearer customer", "Bearer partner-a", "Bearer partner-b", "Bearer recovery"]) {
      const res = await request(app).post(APPROVED_USER_ACCESS_PATH).set("Authorization", token).send({ email });
      expect(res.status).toBe(403);
      expect(res.headers["cache-control"]).toBe("private, no-store");
      expect(JSON.stringify(res.body)).not.toContain(email);
    }
    expect(inspect).not.toHaveBeenCalled();
  });

  it("normalizes only an explicit valid email and returns a private read-only response", async () => {
    const { app, inspect } = appWith(linked());
    const res = await request(app).post(APPROVED_USER_ACCESS_PATH).set("Authorization", "Bearer synthetic-admin").send({ email: ` ${email.toUpperCase()} ` });
    expect(res.status).toBe(200); expect(inspect).toHaveBeenCalledWith(email);
    expect(res.body.inspection.email).toBe(email);
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.headers.vary).toBe("Authorization, Cookie");
    expect((await request(app).get(APPROVED_USER_ACCESS_PATH).set("Authorization", "Bearer synthetic-admin")).status).toBe(404);
  });

  it.each([{ email, role: "admin" }, { email, grant: true }, { email: "not-email" }, { authUserId: ids[0] }])("rejects extra commands or malformed input %j", async (body) => {
    const { app, inspect } = appWith();
    const res = await request(app).post(APPROVED_USER_ACCESS_PATH).set("Authorization", "Bearer synthetic-admin").send(body);
    expect(res.status).toBe(400); expect(inspect).not.toHaveBeenCalled();
  });

  it("reports unavailable without provider errors or false absence", async () => {
    const { app, inspect } = appWith(); inspect.mockRejectedValue(new Error("PRIVATE_PROVIDER_ERROR"));
    const res = await request(app).post(APPROVED_USER_ACCESS_PATH).set("Authorization", "Bearer synthetic-admin").send({ email });
    expect(res.status).toBe(503); expect(res.body.code).toBe("access_inspection_unavailable");
    expect(JSON.stringify(res.body)).not.toContain("PRIVATE_");
    expect(res.body.inspection).toBeUndefined();
  });
});
