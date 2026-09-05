import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { buildCommerceDependencies } from "../commerce/production-deps";
import { registerCommerceApi } from "../commerce/routes";
import type { AsyncPartnerMemberStore } from "../commerce/persistence/partners-store";
import type { CommissionLedgerRepository } from "./commissions";
import { createOwnPartnerReads } from "./own-reads";

const now = () => new Date("2026-09-05T00:00:00Z");
function source() {
  const findByMemberId = vi.fn(async (memberId: string) => memberId === "customer" ? null : ({
    partnerId: `partner-${memberId}`, memberId, role: "affiliate" as const,
    state: "active" as const, certifiedAt: now().toISOString(), activatedAt: now().toISOString(),
  }));
  const listByPartner = vi.fn(async () => []);
  const createPartnerForMember = vi.fn();
  const members = { findByMemberId, createPartnerForMember } as AsyncPartnerMemberStore;
  const ledger = { listByPartner } as unknown as CommissionLedgerRepository;
  return { findByMemberId, listByPartner, createPartnerForMember, members, ledger };
}
const env = { SUPABASE_URL: "https://fixture.invalid", SUPABASE_SERVICE_ROLE_KEY: "synthetic",
  AFFILIATE_SYSTEM_ENABLED: "true", AFFILIATE_PORTAL_ENABLED: "true", NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED: "false" };

describe("partner account reads independently of purchasing", () => {
  it("reads the owned partner with commerce disabled without enabling a writer", async () => {
    const s = source();
    const deps = buildCommerceDependencies(now, env, { resolvePartnerMemberStore: () => s.members, resolveCommissionLedgerStore: () => s.ledger });
    expect(deps.partners.readAvailable?.()).toBe(true);
    for (const member of ["a", "b"]) {
      const partner = await deps.partners.findByMemberId(member);
      expect(partner?.partnerId).toBe(`partner-${member}`);
      expect(await deps.partners.dashboardFor(partner!)).toMatchObject({ partnerId: `partner-${member}`, conversionCount: 0 });
      expect(s.listByPartner).toHaveBeenLastCalledWith(`partner-${member}`);
    }
    expect(await deps.partners.applyForMember("a", { role: "affiliate", legalName: "Fixture", contactEmail: "fixture@example.invalid" }, now())).toMatchObject({ ok: false, code: "commerce_disabled" });
    expect(s.createPartnerForMember).not.toHaveBeenCalled();
  });

  it.each([{}, { ...env, AFFILIATE_SYSTEM_ENABLED: "false" }, { ...env, AFFILIATE_PORTAL_ENABLED: "false" }, { ...env, SUPABASE_SERVICE_ROLE_KEY: "" }])("refuses unconfigured read capabilities %j", async (config) => {
    const s = source();
    const deps = buildCommerceDependencies(now, config, { resolvePartnerMemberStore: () => s.members, resolveCommissionLedgerStore: () => s.ledger });
    expect(deps.partners.readAvailable?.()).toBe(false);
    await expect(deps.partners.findByMemberId("a")).rejects.toThrow("unavailable");
    expect(s.findByMemberId).not.toHaveBeenCalled();
  });

  it.each(["me", "dashboard"])("distinguishes unavailable from an absent partner at %s", async (leaf) => {
    const s = source();
    const deps = buildCommerceDependencies(now, env, { resolvePartnerMemberStore: () => s.members, resolveCommissionLedgerStore: () => s.ledger });
    const app = express(); app.use(express.json());
    registerCommerceApi(app, deps, {
      requireMember: (req, _res, next) => { (req as any).researchMember = { id: req.headers["x-fixture-member"] ?? "a" }; next(); },
      requireAdmin: (_req, res) => { res.status(403).end(); },
      requireActiveMember: (_req, res) => { res.status(403).end(); },
    });
    const missing = await request(app).get(`/api/research/partner/${leaf}`).set("x-fixture-member", "customer");
    expect(missing.status).toBe(404); expect(missing.body.code).toBe("partner_not_found");
    s.findByMemberId.mockRejectedValue(new Error("PRIVATE_DATABASE_URL"));
    const unavailable = await request(app).get(`/api/research/partner/${leaf}`);
    expect(unavailable.status).toBe(503); expect(unavailable.body.code).toBe("capability_disabled");
    expect(JSON.stringify(unavailable.body)).not.toContain("PRIVATE_");
    expect(unavailable.headers["cache-control"]).toBe("no-store");
  });

  it("disabled ports never create a memory substitute", async () => {
    const members = vi.fn(); const ledger = vi.fn();
    const reads = createOwnPartnerReads({ available: false, members, ledger });
    await expect(reads.findByMemberId("a")).rejects.toThrow();
    expect(members).not.toHaveBeenCalled(); expect(ledger).not.toHaveBeenCalled();
  });
});
