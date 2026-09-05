import request from "supertest";
import { describe, expect, it } from "vitest";

import {
  ACCOUNT_PORTAL_PREVIEW_PASSWORD,
  buildAccountPortalPreviewApp,
  PREVIEW_DOCUMENT_UUIDS,
  PREVIEW_PERSONAS,
} from "../../../scripts/preview-account-portal";

const TOKEN_1 = PREVIEW_PERSONAS[0].token;
const TOKEN_2 = PREVIEW_PERSONAS[1].token;
const PARTNER_B = PREVIEW_PERSONAS.find((persona) => persona.email === "partner-b@preview.invalid")!;
const ORG_A = PREVIEW_PERSONAS.find((persona) => persona.email === "org-a@preview.invalid")!;
const PARTNER_PATHS = ["/api/research/partner/me", "/api/research/partner/dashboard"] as const;

describe("account-portal preview harness guard", () => {
  it("refuses to run under NODE_ENV=production", () => {
    expect(() => buildAccountPortalPreviewApp({ NODE_ENV: "production" })).toThrow(
      /refuses to run under NODE_ENV=production/,
    );
  });

  it("keeps every non-preview research API behind a clearly-preview 404", async () => {
    const { app } = buildAccountPortalPreviewApp({});
    for (const path of [
      "/api/research/questions",
      "/api/research/products",
      "/api/research/early-access/catalog",
    ]) {
      const res = await request(app).get(path).set("Authorization", `Bearer ${TOKEN_1}`);
      expect(res.status, path).toBe(404);
      expect(res.body.error, path).toBe("account_portal_preview_route_not_available");
    }
  });

  it("serves only a read-only, commerce-disabled synthetic catalog projection", async () => {
    const { app } = buildAccountPortalPreviewApp({});
    const active = await request(app)
      .get("/api/research/catalog")
      .set("Authorization", `Bearer ${TOKEN_1}`);
    expect(active.status).toBe(200);
    expect(active.body).toEqual({
      products: [],
      commerce: { research: false, consumer: false },
      email: "research@xeniostechnology.com",
    });
    expect(active.headers["cache-control"]).toBe("no-store");
    expect((await request(app).get("/api/research/catalog")).status).toBe(401);
  });

  it("authenticates only the preview personas with the preview password", async () => {
    const { app } = buildAccountPortalPreviewApp({});
    const good = await request(app)
      .post("/preview-auth/auth/v1/token?grant_type=password")
      .send({ email: PREVIEW_PERSONAS[0].email, password: ACCOUNT_PORTAL_PREVIEW_PASSWORD });
    expect(good.status).toBe(200);
    expect(good.body.access_token).toBe(TOKEN_1);

    const badPassword = await request(app)
      .post("/preview-auth/auth/v1/token?grant_type=password")
      .send({ email: PREVIEW_PERSONAS[0].email, password: "wrong" });
    expect(badPassword.status).toBe(400);

    const unknown = await request(app)
      .post("/preview-auth/auth/v1/token?grant_type=password")
      .send({ email: "someone-else@preview.invalid", password: ACCOUNT_PORTAL_PREVIEW_PASSWORD });
    expect(unknown.status).toBe(400);
  });

  it("serves the member probe and the real customer-account surface per persona", async () => {
    const { app } = buildAccountPortalPreviewApp({});
    const me = await request(app)
      .get("/api/research/member/me")
      .set("Authorization", `Bearer ${TOKEN_1}`);
    expect(me.status).toBe(200);
    expect(me.body.member.status).toBe("active");

    const overview = await request(app)
      .get("/api/research/customer-account/overview")
      .set("Authorization", `Bearer ${TOKEN_1}`);
    expect(overview.status).toBe(200);
    expect(overview.body.data.identity.email).toBe("test.customer@example.invalid");
    expect(JSON.stringify(overview.body)).not.toContain("Seth");

    const anonymous = await request(app).get("/api/research/customer-account/overview");
    expect(anonymous.status).toBe(401);
  });

  it("serves the REAL audited catalog-priority projection", async () => {
    const { app } = buildAccountPortalPreviewApp({});
    const res = await request(app)
      .get("/api/research/customer-account/catalog-priority")
      .set("Authorization", `Bearer ${TOKEN_1}`);
    expect(res.status).toBe(200);
    expect(res.body.data.statuses["aod-motsc-tesa-ipa"]).toBe(
      "verbally_confirmed_pending_documentation",
    );
    expect(res.body.data.statuses["dsip"]).toBe("live");
    expect(res.body.data.queue).toHaveLength(13);
    expect(JSON.stringify(res.body)).not.toContain("demandMentions");
  });

  it("downloads a document only for the owning persona", async () => {
    const { app } = buildAccountPortalPreviewApp({});
    const documentUuid = PREVIEW_DOCUMENT_UUIDS["doc-fixture-0001"];
    const owner = await request(app)
      .get(`/api/research/customer-account/documents/${documentUuid}`)
      .set("Authorization", `Bearer ${TOKEN_1}`);
    expect(owner.status).toBe(200);
    expect(owner.headers["content-type"]).toContain("application/pdf");

    const stranger = await request(app)
      .get(`/api/research/customer-account/documents/${documentUuid}`)
      .set("Authorization", `Bearer ${TOKEN_2}`);
    expect(stranger.status).toBe(404);
    expect(stranger.body.reason).toBe("document_unavailable");
  });

  it("the REAL wall refuses a non-UUID document id shape even with a valid token", async () => {
    const { app } = buildAccountPortalPreviewApp({});
    const res = await request(app)
      .get("/api/research/customer-account/documents/doc-fixture-0001")
      .set("Authorization", `Bearer ${TOKEN_1}`);
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Access required.");
  });

  it("admits exact partner GET and HEAD through the REAL wall only with a fixed owning bearer", async () => {
    const { app } = buildAccountPortalPreviewApp({});
    for (const path of PARTNER_PATHS) {
      const owner = await request(app).get(path).set("Authorization", `Bearer ${TOKEN_1}`);
      expect(owner.status, path).toBe(200);
      expect(owner.body.ok).toBe(true);
      expect(owner.body.partner.partnerId).toBe("partner-fixture-a");
      expect(owner.headers["cache-control"]).toContain("no-store");
      expect(owner.headers["vary"]).toContain("Authorization");

      const head = await request(app).head(path).set("Authorization", `Bearer ${TOKEN_1}`);
      expect(head.status, path).toBe(200);
      expect(head.text).toBeUndefined();
      expect(head.headers["cache-control"]).toContain("no-store");
      expect((await request(app).get(path)).status, path).toBe(401);
      expect((await request(app).head(path)).status, path).toBe(401);
      const unknown = await request(app).get(path).set("Authorization", "Bearer unknown-not-a-fixture");
      expect(unknown.status, path).toBe(401);
      expect(unknown.body).toEqual({ ok: false, code: "member_required" });
    }
  });

  it("returns canonical partner_not_found for the ordinary customer instead of another partner's account", async () => {
    const { app } = buildAccountPortalPreviewApp({});
    for (const path of PARTNER_PATHS) {
      const response = await request(app).get(path).set("Authorization", `Bearer ${TOKEN_2}`);
      expect(response.status, path).toBe(404);
      expect(response.body).toEqual({ ok: false, code: "partner_not_found" });
      expect(response.headers["cache-control"]).toContain("no-store");
    }
  });

  it("keeps Partner A positive ledger, Partner B measured empty ledger, and Org A relation isolated", async () => {
    const { app } = buildAccountPortalPreviewApp({});
    const fixtureCases = [
      { token: TOKEN_1, partnerId: "partner-fixture-a", role: "affiliate", count: 2, total: 7000, payable: 2000 },
      { token: PARTNER_B.token, partnerId: "partner-fixture-b", role: "research_rep", count: 0, total: 0, payable: 0 },
      { token: ORG_A.token, partnerId: "partner-fixture-org-a", role: "organization_partner", count: 0, total: 0, payable: 0 },
    ];
    for (const fixture of fixtureCases) {
      const self = await request(app).get(PARTNER_PATHS[0]).set("Authorization", `Bearer ${fixture.token}`);
      expect(self.status).toBe(200);
      expect(Object.keys(self.body.partner).sort()).toEqual([
        "active", "agreements", "certified", "partnerId", "role", "state", "training",
      ]);
      expect(self.body.partner).toMatchObject({ partnerId: fixture.partnerId, role: fixture.role });
      const dashboard = await request(app).get(PARTNER_PATHS[1]).set("Authorization", `Bearer ${fixture.token}`);
      expect(dashboard.status).toBe(200);
      expect(dashboard.body.partner).toMatchObject({
        partnerId: fixture.partnerId, role: fixture.role, conversionCount: fixture.count,
        totalCommissionCents: fixture.total, payableCents: fixture.payable,
      });
      expect(dashboard.body.partner.conversions).toHaveLength(fixture.count);
      expect(Object.keys(dashboard.body.partner).sort()).toEqual([
        "conversionCount", "conversions", "leadCount", "outstandingTraining", "partnerId", "payableCents",
        "role", "state", "totalCommissionCents",
      ]);
      for (const conversion of dashboard.body.partner.conversions) {
        expect(Object.keys(conversion).sort()).toEqual([
          "attributedAt", "commissionCents", "eligibleNetCents", "state",
        ]);
      }
    }
    const orgSelf = await request(app).get(PARTNER_PATHS[0]).set("Authorization", `Bearer ${ORG_A.token}`);
    expect(orgSelf.body.partner).toMatchObject({ state: "training_pending", active: false, certified: false });
  });

  it("authenticates the additional local personas and serves only their own empty account identities", async () => {
    const { app } = buildAccountPortalPreviewApp({});
    for (const persona of [PARTNER_B, ORG_A]) {
      const login = await request(app).post("/preview-auth/auth/v1/token?grant_type=password")
        .send({ email: persona.email, password: ACCOUNT_PORTAL_PREVIEW_PASSWORD });
      expect(login.status).toBe(200);
      expect(login.body.access_token).toBe(persona.token);
      const overview = await request(app).get("/api/research/customer-account/overview")
        .set("Authorization", `Bearer ${persona.token}`);
      expect(overview.status).toBe(200);
      expect(overview.body.data.identity.email).toBe(persona.email);
      const orders = await request(app).get("/api/research/customer-account/orders")
        .set("Authorization", `Bearer ${persona.token}`);
      expect(orders.status).toBe(200);
      expect(orders.body.data.research).toEqual([]);
    }
  });

  it("refuses query, body, and path identity selectors instead of accepting foreign partner ids", async () => {
    const { app } = buildAccountPortalPreviewApp({});
    for (const path of PARTNER_PATHS) {
      for (const selector of ["partnerId=partner-fixture-a", "memberId=member-fixture-1", "orgId=partner-fixture-org-a"]) {
        const response = await request(app).get(`${path}?${selector}`).set("Authorization", `Bearer ${PARTNER_B.token}`);
        expect(response.status).toBe(400);
        expect(response.body).toEqual({ ok: false, code: "preview_request_selector_not_supported" });
      }
      const bodySelector = await request(app).get(path).set("Authorization", `Bearer ${PARTNER_B.token}`)
        .send({ partnerId: "partner-fixture-a" });
      expect(bodySelector.status).toBe(400);
      const pathSelector = await request(app).get(`${path}/partner-fixture-a`).set("Authorization", `Bearer ${PARTNER_B.token}`);
      expect(pathSelector.status).toBe(404);
      expect(pathSelector.body.error).toBe("account_portal_preview_route_not_available");
    }
  });

  it("keeps partner writes and every adjacent partner API unavailable without mutating fixtures", async () => {
    const { app } = buildAccountPortalPreviewApp({});
    for (const path of PARTNER_PATHS) {
      for (const method of ["post", "put", "patch", "delete"] as const) {
        const response = await request(app)[method](path).set("Authorization", `Bearer ${TOKEN_1}`)
          .send({ partnerId: "partner-fixture-b", state: "active", conversionCount: 999 });
        expect(response.status).toBe(404);
        expect(response.body.error).toBe("account_portal_preview_route_not_available");
      }
    }
    for (const path of ["links", "leads", "conversions", "organizations", "apply", "payouts"]) {
      const response = await request(app).get(`/api/research/partner/${path}`).set("Authorization", `Bearer ${TOKEN_1}`);
      expect(response.status).toBe(404);
      expect(response.body.error).toBe("account_portal_preview_route_not_available");
    }
    const unchanged = await request(app).get(PARTNER_PATHS[1]).set("Authorization", `Bearer ${TOKEN_1}`);
    expect(unchanged.body.partner).toMatchObject({ partnerId: "partner-fixture-a", conversionCount: 2, totalCommissionCents: 7000 });
  });
});
