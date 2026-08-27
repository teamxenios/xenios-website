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
      "/api/research/catalog",
      "/api/research/early-access/catalog",
    ]) {
      const res = await request(app).get(path).set("Authorization", `Bearer ${TOKEN_1}`);
      expect(res.status, path).toBe(404);
      expect(res.body.error, path).toBe("account_portal_preview_route_not_available");
    }
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
});
