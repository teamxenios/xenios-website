import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerResearchApi } from "./index";
import { registerCommerceApi, type CommerceGuards, type PartnerSelfSource } from "./commerce/routes";
import { buildCommerceDependencies } from "./commerce/production-deps";

const partner = (id: string): PartnerSelfSource => ({
  partnerId: id, role: "affiliate", state: "active", certifiedAt: "2026-09-01T00:00:00Z",
  activatedAt: "2026-09-01T00:00:00Z", training: [], agreements: [],
});

function appFor() {
  const app = express();
  app.use(express.json());
  registerResearchApi(app);
  const findByMemberId = vi.fn(async (id: string) => id === "customer" ? null : partner(`partner-${id}`));
  const dashboardFor = vi.fn(async (self: PartnerSelfSource) => ({ partnerId: self.partnerId }));
  const guard = vi.fn<CommerceGuards["requireMember"]>((req, res, next) => {
    const token = req.headers.authorization;
    if (!["Bearer member-a", "Bearer member-b", "Bearer customer"].includes(token ?? "")) {
      res.status(401).json({ ok: false, message: "Sign in required." });
      return;
    }
    (req as any).researchMember = { id: token!.slice(7) };
    next();
  });
  const deny: CommerceGuards["requireMember"] = (_req, res) => { res.status(403).json({ ok: false }); };
  const base = buildCommerceDependencies(() => new Date("2026-09-05T00:00:00Z"), {});
  registerCommerceApi(app, { ...base, partners: { ...base.partners, readAvailable: () => true, findByMemberId, dashboardFor } }, {
    requireMember: guard, requireActiveMember: deny, requireAdmin: deny,
  });
  return { app, guard, findByMemberId, dashboardFor };
}

function privateHeaders(response: { headers: Record<string, string | undefined> }) {
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(response.headers.pragma).toBe("no-cache");
  expect(response.headers["referrer-policy"]).toBe("no-referrer");
  expect(response.headers["x-robots-tag"]).toBe("noindex, nofollow");
}

describe("ordinary member partner reads through the legacy review wall", () => {
  beforeEach(() => {
    vi.stubEnv("RESEARCH_PUBLIC", "false");
    vi.stubEnv("RESEARCH_ACCESS_PASSWORD", "synthetic-review-password");
    vi.stubEnv("RESEARCH_SESSION_SECRET", "synthetic-review-secret-with-sufficient-length");
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each(["me", "dashboard"])("keeps unsigned and invalid sessions away from %s data", async (leaf) => {
    const { app, guard, findByMemberId } = appFor();
    const unsigned = await request(app).get(`/api/research/partner/${leaf}`);
    const invalid = await request(app).get(`/api/research/partner/${leaf}`).set("Authorization", "Bearer rejected");
    expect(unsigned.status).toBe(401);
    expect(invalid.status).toBe(401);
    privateHeaders(unsigned); privateHeaders(invalid);
    expect(guard).toHaveBeenCalledTimes(1);
    expect(findByMemberId).not.toHaveBeenCalled();
  });

  it.each(["me", "dashboard"])("derives %s owner from auth despite forged query and body identity", async (leaf) => {
    const { app, findByMemberId } = appFor();
    for (const member of ["member-a", "member-b"]) {
      const response = await request(app).get(`/api/research/partner/${leaf}?partnerId=foreign&memberId=foreign`)
        .set("Authorization", `Bearer ${member}`).send({ partnerId: "foreign", role: "admin" });
      expect(response.status).toBe(200);
      expect(response.body.partner.partnerId).toBe(`partner-${member}`);
      expect(JSON.stringify(response.body)).not.toContain("foreign");
      expect(findByMemberId).toHaveBeenLastCalledWith(member);
      privateHeaders(response);
    }
    const customer = await request(app).get(`/api/research/partner/${leaf}`).set("Authorization", "Bearer customer");
    expect(customer.status).toBe(404);
    expect(customer.body.code).toBe("partner_not_found");
    privateHeaders(customer);
  });

  it.each(["me", "dashboard"])("permits only private HEAD semantics for %s", async (leaf) => {
    const { app } = appFor();
    const response = await request(app).head(`/api/research/partner/${leaf}`).set("Authorization", "Bearer member-a");
    expect(response.status).toBe(200);
    expect(response.text ?? "").toBe("");
    privateHeaders(response);
  });

  it.each([
    ["get", "/api/research/partner/me/"], ["get", "/api/research/partner/dashboard/foreign"],
    ["get", "/api/research/partner/dashboard-extra"], ["get", "/api/research/partner/%6de"],
    ["post", "/api/research/partner/me"], ["patch", "/api/research/partner/dashboard"],
    ["delete", "/api/research/partner/dashboard"], ["post", "/api/research/partner/apply"],
  ])("does not admit unreviewed %s %s", async (method, path) => {
    const { app, guard, findByMemberId } = appFor();
    const response = await (request(app) as any)[method](path).set("Authorization", "Bearer member-a");
    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Access required.");
    expect(guard).not.toHaveBeenCalled();
    expect(findByMemberId).not.toHaveBeenCalled();
  });
});
