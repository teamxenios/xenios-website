import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { PARTNER_ADMIN_OPERATION_PATH, PARTNER_LIFECYCLE_SCHEMA_VERSION, type PartnerOperation } from "@shared/research/partner-lifecycle";
import { DEFAULT_PARTNER_REQUIREMENTS } from "./partners";
import { performPartnerOperation, registerPartnerLifecycleApi, validPartnerLifecycleAuthority } from "./lifecycle-admin";

const actor = "00000000-0000-4000-8000-000000000001";
const memberId = "00000000-0000-4000-8000-000000000002";
const partnerId = "00000000-0000-4000-8000-000000000003";
const timestamp = "2026-09-05T00:00:00Z";
const authority = () => ({ schemaVersion: PARTNER_LIFECYCLE_SCHEMA_VERSION, requirements: DEFAULT_PARTNER_REQUIREMENTS });
const selected = { partnerId, expectedUpdatedAt: timestamp, reason: "Reviewed actual partner requirements", idempotencyKey: "synthetic-operation-0001" };
const prepare: PartnerOperation = { action: "prepare", memberId, role: "affiliate", legalName: "Synthetic Partner", reason: selected.reason, idempotencyKey: selected.idempotencyKey };
const proof = { evidenceReference: "review:test-0001", reviewedEvidence: true as const };
function fixture(action: PartnerOperation["action"] = "prepare") {
  return { authority: vi.fn(async (): Promise<unknown> => authority()),
    operate: vi.fn(async (): Promise<unknown> => ({ ok: true, partnerId, memberId, action, state: "application", updatedAt: timestamp, replayed: false })),
    now: () => new Date(timestamp) };
}
function appFixture() {
  const deps = fixture(); const app = express(); app.use(express.json());
  const jwt = `synthetic.${Buffer.from(JSON.stringify({ sub: actor })).toString("base64url")}.signature`;
  registerPartnerLifecycleApi(app, deps, (req, res, next) => {
    if (req.headers.authorization !== `Bearer ${jwt}` && req.headers.authorization !== "Bearer missing-sub") { res.status(403).json({ ok: false }); return; }
    next();
  });
  return { app, deps, jwt };
}

describe("canonical partner lifecycle administration", () => {
  it("pins the full canonical versioned requirement set, independent of order", () => {
    expect(validPartnerLifecycleAuthority(authority())).toBe(true);
    expect(validPartnerLifecycleAuthority({ ...authority(), requirements: { agreements: [...DEFAULT_PARTNER_REQUIREMENTS.agreements].reverse(), trainingModules: [...DEFAULT_PARTNER_REQUIREMENTS.trainingModules].reverse() } })).toBe(true);
    for (const raw of [null, { ...authority(), schemaVersion: "other" }, { ...authority(), extra: true },
      { ...authority(), requirements: { ...DEFAULT_PARTNER_REQUIREMENTS, trainingModules: [] } },
      { ...authority(), requirements: { ...DEFAULT_PARTNER_REQUIREMENTS, agreements: [...DEFAULT_PARTNER_REQUIREMENTS.agreements, DEFAULT_PARTNER_REQUIREMENTS.agreements[0]] } }]) {
      expect(validPartnerLifecycleAuthority(raw)).toBe(false);
    }
  });

  it("binds an explicit prepare action to the authenticated audit actor and canonical member", async () => {
    const deps = fixture();
    expect(await performPartnerOperation(deps, actor, prepare)).toMatchObject({ ok: true, memberId, partnerId, action: "prepare", replayed: false });
    expect(deps.operate).toHaveBeenCalledWith(actor, prepare);
  });

  it.each([
    { ...prepare, actorAuthUserId: memberId }, { ...prepare, paid: true }, { ...prepare, role: "admin" },
    { ...prepare, memberId: "customer@example.invalid" }, { ...prepare, reason: "short" }, { ...prepare, idempotencyKey: "short" },
    { ...selected, action: "record_clearance", kind: "tax", decision: "verified", ...proof, reviewedEvidence: false },
    { ...selected, action: "record_clearance", kind: "tax", decision: "verified", ...proof, reviewedEvidence: "true" },
    { ...selected, action: "record_clearance", kind: "tax", decision: "verified", ...proof, evidenceReference: "https://private-doc.example.invalid" },
    { ...selected, action: "record_agreement", ...proof, agreementKey: "unknown", version: "1.0.0", contentHash: "a".repeat(64), acceptedAt: timestamp },
    { ...selected, action: "record_agreement", ...proof, agreementKey: "partner_agreement", version: "1.0.0", contentHash: "a".repeat(64), acceptedAt: "2027-01-01T00:00:00Z" },
    { ...selected, action: "record_training", ...proof, moduleKey: "security", version: "99.0.0", completedAt: timestamp },
    { ...selected, action: "record_training", ...proof, moduleKey: "security", version: "1.0.0", completedAt: "2027-01-01T00:00:00Z" },
  ])("refuses malformed, body-selected authority, or unsupported evidence before source access (%#)", async (raw) => {
    const deps = fixture(); expect(await performPartnerOperation(deps, actor, raw)).toEqual({ ok: false, code: "invalid_input" });
    expect(deps.authority).not.toHaveBeenCalled(); expect(deps.operate).not.toHaveBeenCalled();
  });

  it("refuses an absent actor and an unprovisioned or divergent authority without writing", async () => {
    const deps = fixture(); expect(await performPartnerOperation(deps, "admin@example.invalid", prepare)).toMatchObject({ code: "invalid_input" });
    deps.authority.mockResolvedValue({ ...authority(), requirements: { agreements: [], trainingModules: [] } });
    expect(await performPartnerOperation(deps, actor, prepare)).toMatchObject({ ok: false, code: "partner_lifecycle_unavailable" });
    expect(deps.operate).not.toHaveBeenCalled();
  });

  it("requires actual reviewed evidence and forwards the exact selected record snapshot", async () => {
    const deps = fixture("record_agreement");
    const operation = { ...selected, ...proof, action: "record_agreement", agreementKey: "partner_agreement", version: "1.0.0", contentHash: "a".repeat(64), acceptedAt: timestamp };
    expect(await performPartnerOperation(deps, actor, operation)).toMatchObject({ ok: true, action: "record_agreement" });
    expect(deps.operate).toHaveBeenCalledWith(actor, operation);
  });

  it.each(["stale_inspection", "identity_review_required", "partner_already_exists", "evidence_conflict", "idempotency_conflict", "invalid_state"])("preserves durable %s denial without guessing success", async (code) => {
    const deps = fixture(); deps.operate.mockResolvedValue({ ok: false, code });
    expect(await performPartnerOperation(deps, actor, prepare)).toEqual({ ok: false, code });
  });

  it("preserves missing requirements and same-operation replay", async () => {
    const deps = fixture("activate"); deps.operate.mockResolvedValue({ ok: false, code: "requirements_missing", missingRequirements: ["tax_clearance", "admin_certification"] });
    expect(await performPartnerOperation(deps, actor, { ...selected, action: "activate" })).toMatchObject({ code: "requirements_missing", missingRequirements: ["tax_clearance", "admin_certification"] });
    deps.operate.mockResolvedValue({ ok: true, partnerId, memberId, action: "activate", state: "active", updatedAt: timestamp, replayed: true });
    expect(await performPartnerOperation(deps, actor, { ...selected, action: "activate" })).toMatchObject({ ok: true, replayed: true });
  });

  it.each([
    { ok: true }, { ok: false, code: "PRIVATE_PROVIDER_DETAIL" },
    { ok: true, partnerId, memberId: actor, action: "prepare", state: "application", updatedAt: timestamp, replayed: false },
    { ok: true, partnerId, memberId, action: "activate", state: "active", updatedAt: timestamp, replayed: false },
    { ok: true, partnerId, memberId, action: "prepare", state: "application", updatedAt: timestamp, replayed: false, privateData: "PRIVATE" },
  ])("rejects malformed or mismatched source result (%#)", async (raw) => {
    const deps = fixture(); deps.operate.mockResolvedValue(raw);
    expect(await performPartnerOperation(deps, actor, prepare)).toMatchObject({ ok: false, code: "partner_lifecycle_unavailable" });
  });

  it("rejects cross-partner operation output and sanitizes uncertain database failures", async () => {
    const deps = fixture("activate");
    expect(await performPartnerOperation(deps, actor, { ...selected, partnerId: actor, action: "activate" })).toMatchObject({ code: "partner_lifecycle_unavailable" });
    deps.operate.mockRejectedValue(new Error("PRIVATE_PROVIDER_DETAIL"));
    expect(JSON.stringify(await performPartnerOperation(deps, actor, { ...selected, action: "activate" }))).not.toContain("PRIVATE");
  });

  it("denies customer, partner, recovery and missing credentials before any read or mutation", async () => {
    const f = appFixture();
    for (const token of ["", "Bearer customer", "Bearer partner-a", "Bearer partner-b", "Bearer recovery"]) {
      const result = await request(f.app).post(PARTNER_ADMIN_OPERATION_PATH).set("Authorization", token).send(prepare);
      expect(result.status).toBe(403); expect(result.headers["cache-control"]).toBe("private, no-store");
    }
    expect(f.deps.authority).not.toHaveBeenCalled(); expect(f.deps.operate).not.toHaveBeenCalled();
    expect((await request(f.app).post(PARTNER_ADMIN_OPERATION_PATH).set("Authorization", "Bearer missing-sub").send(prepare)).status).toBe(401);
  });

  it("mounts only the explicit admin POST and keeps results private", async () => {
    const f = appFixture();
    const result = await request(f.app).post(PARTNER_ADMIN_OPERATION_PATH).set("Authorization", `Bearer ${f.jwt}`).send(prepare);
    expect(result.status).toBe(200); expect(result.headers["referrer-policy"]).toBe("no-referrer"); expect(result.headers.vary).toBe("Authorization, Cookie");
    expect(f.deps.operate).toHaveBeenCalledWith(actor, prepare);
    expect((await request(f.app).get(PARTNER_ADMIN_OPERATION_PATH).set("Authorization", `Bearer ${f.jwt}`)).status).toBe(404);
    f.deps.authority.mockResolvedValue(null);
    expect((await request(f.app).post(PARTNER_ADMIN_OPERATION_PATH).set("Authorization", `Bearer ${f.jwt}`).send(prepare)).status).toBe(503);
  });
});
