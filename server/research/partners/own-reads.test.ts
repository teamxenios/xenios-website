import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { buildCommerceDependencies } from "../commerce/production-deps";
import { registerCommerceApi, type PartnerSelfSource } from "../commerce/routes";
import type { AsyncPartnerMemberStore } from "../commerce/persistence/partners-store";
import type { CommissionLedgerRepository } from "./commissions";
import { createOwnPartnerReads, PARTNER_COMMISSION_LEDGER_PRODUCER_CONNECTED } from "./own-reads";

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
const notConnected = { financialReporting: "not_connected", conversionCount: null, totalCommissionCents: null,
  payableCents: null, conversions: null } as const;
const self = (patch: Partial<PartnerSelfSource> = {}): PartnerSelfSource => ({
  partnerId: "partner-a", role: "affiliate", state: "active",
  certifiedAt: null, activatedAt: null, training: [], agreements: [], ...patch,
});
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
      expect(await deps.partners.dashboardFor(partner!)).toMatchObject({ partnerId: `partner-${member}`, ...notConnected });
    }
    // No producer writes this ledger, so the composed reads never consult it.
    expect(s.listByPartner).not.toHaveBeenCalled();
    expect(await deps.partners.applyForMember("a", { role: "affiliate", legalName: "Fixture", contactEmail: "fixture@example.invalid" }, now())).toMatchObject({ ok: false, code: "commerce_disabled" });
    expect(s.createPartnerForMember).not.toHaveBeenCalled();
  });

  it.each([{}, { ...env, AFFILIATE_SYSTEM_ENABLED: "false" }, { ...env, AFFILIATE_PORTAL_ENABLED: "false" }, { ...env, SUPABASE_SERVICE_ROLE_KEY: "" }])("refuses unconfigured read capabilities %j", async (config) => {
    const s = source();
    const deps = buildCommerceDependencies(now, config, { resolvePartnerMemberStore: () => s.members, resolveCommissionLedgerStore: () => s.ledger });
    expect(deps.partners.readAvailable?.()).toBe(false);
    expect(await deps.partners.findByMemberId("a")).toBeNull();
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
    expect(await reads.findByMemberId("a")).toBeNull();
    const empty = await reads.dashboardFor({
      partnerId: "partner-a", role: "affiliate", state: "active",
      certifiedAt: null, activatedAt: null, training: [], agreements: [],
    });
    expect(empty).toEqual({
      partnerId: "partner-a", role: "affiliate", state: "active",
      leadCount: 0, ...notConnected, outstandingTraining: [],
    });
    expect(members).not.toHaveBeenCalled(); expect(ledger).not.toHaveBeenCalled();
  });

  it("pins the source fact that no live producer writes the commission ledger", () => {
    expect(PARTNER_COMMISSION_LEDGER_PRODUCER_CONNECTED).toBe(false);
  });

  it("reports ledger figures as unknown, never as zero, and does not read a ledger that holds rows", async () => {
    const listByPartner = vi.fn(async () => [{ id: "synthetic-entry", rootId: "synthetic-entry", kind: "accrual",
      amountCents: 5000, eligibleNetCents: 50000, state: "payable", createdAt: "2026-09-04T00:00:00Z" }]);
    const ledger = vi.fn(() => ({ listByPartner }) as unknown as CommissionLedgerRepository);
    const reads = createOwnPartnerReads({ available: true, members: vi.fn(), ledger });
    const dashboard = await reads.dashboardFor(self());
    expect(dashboard).toEqual({ partnerId: "partner-a", role: "affiliate", state: "active",
      leadCount: 0, ...notConnected, outstandingTraining: [] });
    expect(ledger).not.toHaveBeenCalled(); expect(listByPartner).not.toHaveBeenCalled();
  });

  it("reports an empty ledger as not connected too, not as zero", async () => {
    const s = source();
    const reads = createOwnPartnerReads({ available: true, members: () => s.members, ledger: () => s.ledger });
    expect(await reads.dashboardFor(self())).toMatchObject(notConnected);
    expect(s.listByPartner).not.toHaveBeenCalled();
  });

  it.each([
    ["research_rep", "training_pending"], ["affiliate", "suspended"], ["member_referral", "active"],
  ] as const)("keeps the server role %s and state %s while figures are unknown", async (role, state) => {
    const reads = createOwnPartnerReads({ available: true, members: vi.fn(), ledger: vi.fn() });
    expect(await reads.dashboardFor(self({ role, state }))).toEqual({ partnerId: "partner-a", role, state,
      leadCount: 0, ...notConnected, outstandingTraining: [] });
  });

  it("reads and reports the ledger only when a producer is explicitly connected", async () => {
    const s = source();
    const reads = createOwnPartnerReads({ available: true, members: () => s.members, ledger: () => s.ledger,
      ledgerProducerConnected: true });
    expect(await reads.dashboardFor(self())).toEqual({ partnerId: "partner-a", role: "affiliate", state: "active",
      leadCount: 0, financialReporting: "connected", conversionCount: 0, totalCommissionCents: 0, payableCents: 0,
      conversions: [], outstandingTraining: [] });
    expect(s.listByPartner).toHaveBeenCalledExactlyOnceWith("partner-a");
  });

  it("stays unknown while the capability is unavailable, even with a connected producer", async () => {
    const ledger = vi.fn();
    const reads = createOwnPartnerReads({ available: false, members: vi.fn(), ledger, ledgerProducerConnected: true });
    expect(await reads.dashboardFor(self())).toMatchObject(notConnected);
    expect(ledger).not.toHaveBeenCalled();
  });
});
