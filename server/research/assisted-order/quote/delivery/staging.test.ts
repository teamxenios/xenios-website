import express from "express";
import type { Pool } from "pg";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { AssistedOrderProductionWiring } from "../../production-deps";
import { mountStagingPrivateQuotePortal, mountStagingQuoteConnection, stagingQuotePoolOptions, STAGING_QUOTE_ORIGIN } from "./staging";

const stage = {
  RENDER: "true",
  RENDER_SERVICE_ID: "srv-d9h4f4m7r5hc73ctjng0",
  RENDER_EXTERNAL_URL: STAGING_QUOTE_ORIGIN,
  SUPABASE_URL: "https://tetynodzrtmdbuzgboro.supabase.co",
  EA_STAGE_QUOTE_DATABASE_URL:
    "postgresql://ea_quote_stage_login.tetynodzrtmdbuzgboro:fixture%40secret@aws-0-us-west-2.pooler.supabase.com:5432/postgres",
};

describe("staging quote connection", () => {
  it("requires this Render service, this Supabase project, the staging login and checked TLS", () => {
    expect(stagingQuotePoolOptions(stage)).toMatchObject({ password: "fixture@secret", ssl: { rejectUnauthorized: true }, max: 2 });
    for (const env of [
      { ...stage, RENDER_SERVICE_ID: "another-service" },
      { ...stage, IS_PULL_REQUEST: "true" },
      { ...stage, SUPABASE_URL: "https://another-project.supabase.co" },
      { ...stage, EA_STAGE_QUOTE_DATABASE_URL: stage.EA_STAGE_QUOTE_DATABASE_URL + "?sslmode=disable" },
      { ...stage, EA_STAGE_QUOTE_DATABASE_URL: stage.EA_STAGE_QUOTE_DATABASE_URL.replace("ea_quote_stage_login.", "postgres.") },
      { ...stage, EA_STAGE_QUOTE_DATABASE_URL: stage.EA_STAGE_QUOTE_DATABASE_URL.replace(":5432", ":6543") },
    ]) expect(stagingQuotePoolOptions(env)).toBeNull();
  });

  it("proves the role only for authenticated staff and returns booleans even when SQL refuses", async () => {
    const app = express();
    let mayAssume = false;
    let connects = 0;
    mountStagingQuoteConnection(app, { ...stage, RESEND_API_KEY: "synthetic-key" }, (req, res, next) => {
      if (req.get("authorization") !== "Bearer test-admin") { res.status(401).end(); return; }
      next();
    }, () => ({
      on: () => undefined,
      connect: async () => {
        connects++;
        return {
          query: async (sql: string) => {
            if (sql.startsWith("SET LOCAL ROLE") && !mayAssume) throw Error("fake private error");
            return { rows: sql.includes("AS restricted") ? [{ restricted: true }] : sql.includes("AS ok") ? [{ ok: true }] : [] };
          },
          release: () => undefined,
        };
      },
    }) as unknown as Pool);
    const path = "/api/staff/early-access/private-quotes/staging-readiness";
    await request(app).get(path).expect(401);
    expect(connects).toBe(0);
    await request(app).get(path).set("Authorization", "Bearer test-admin")
      .expect(503, { restrictedConnection: false, resendConfigured: true });
    mayAssume = true;
    await request(app).get(path).set("Authorization", "Bearer test-admin")
      .expect(200, { restrictedConnection: true, resendConfigured: true });
    expect(connects).toBe(2);
  });

  it("mounts the configured portal but denies a fresh session before loading quote data", async () => {
    const app = express();
    const denyStaff: express.RequestHandler = (_req, res) => { res.status(401).end(); };
    const fixture = {
      xriId: "1520449e-7cfd-4ebb-b193-bd85b507aeef", ownerHash: "a".repeat(64),
      attemptHash: "b".repeat(64), customerRef: "fixture-customer",
      issuerId: "1520449e-7cfd-4ebb-b193-bd85b507aeee", recipientId: "1520449e-7cfd-4ebb-b193-bd85b507aeed",
      productId: "test-product", variantId: "test-variant", approvalEvidenceId: "test-approval",
      unitPriceCents: 100, validUntil: new Date(Date.now() + 60_000).toISOString(),
    };
    const wiring = {
      env: { ...stage, EA_STAGE_QUOTE_FIXTURE: JSON.stringify(fixture), EA_STAGE_QUOTE_TAG_KEY: "1".repeat(64) },
      requiredAgreements: [{ kind: "early_access_terms", version: "v2" }],
      agreementGate: { accepted: async () => { throw Error("unexpected standing check"); } },
      supabaseRpc: { rpc: async () => { throw Error("unexpected RPC"); } },
    } as unknown as AssistedOrderProductionWiring;
    mountStagingPrivateQuotePortal(app, wiring, {
      async customer() {
        return { actorType: "early_access_session", memberId: null, earlyAccessSessionHash: null,
          normalizedEmail: null, capabilities: new Set() };
      },
    }, denyStaff, async () => { throw Error("unexpected account lookup"); }, () => ({
      on() {}, connect() { throw Error("unexpected database access"); },
    }) as unknown as Pool);
    const response = await request(app).get("/earlyaccess/quotes").expect(401);
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(response.text).toContain("Verified access required");
    expect(response.text).not.toContain(fixture.xriId);
    await request(app).post("/api/staff/early-access/private-quotes/issue").send({}).expect(401);
  });
});
