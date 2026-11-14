// @vitest-environment jsdom
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type pg from "pg";
import request from "supertest";
import { expect } from "vitest";
import { EARLY_ACCESS_PRODUCT_POLICY_AGREEMENT } from "../../../policies-data";
import {
  createDurableJourneyFixture, guest, OPERATOR, pg16It, submission,
} from "../../request-intent/durable-journey.pg.fixture";
import { mountStagingPrivateQuotePortal, STAGING_QUOTE_ORIGIN } from "./staging";

// Managed identity is synthetic. The mounted request, RPCs, issuer, portal, and
// SQL run against the fixture's own loopback-only PG16 database.
pg16It("issues one staged quote, shows it to its request owner, and keeps mail paused on replay", async () => {
  const db = createDurableJourneyFixture();
  const loginPassword = randomUUID();
  const issuerEmail = "operator@example.invalid";
  const recipient = "samuel@xeniostechnology.com"; // Exact fixture scope; mail stays disabled.
  const recipientId = randomUUID();
  let pool: pg.Pool | undefined;
  try {
    await db.start();
    await db.sql(readFileSync("supabase/research-notification-outbox.sql", "utf8"));
    const privateSql = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");
    await db.sql([
      "BEGIN; CREATE SCHEMA quote_delivery_private; SET LOCAL search_path = quote_delivery_private, pg_catalog;",
      privateSql("tables.sql"), privateSql("private-pg.sql"),
      "CREATE ROLE ea_quote_stage_runtime NOLOGIN NOINHERIT;",
      `CREATE ROLE ea_quote_stage_login LOGIN NOINHERIT PASSWORD '${loginPassword}';`,
      "GRANT ea_quote_stage_runtime TO ea_quote_stage_login WITH SET TRUE, INHERIT FALSE;",
      "GRANT USAGE ON SCHEMA quote_delivery_private TO ea_quote_stage_runtime;",
      "GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA quote_delivery_private TO ea_quote_stage_runtime;",
      "COMMIT;",
    ].join("\n"));

    const terms = EARLY_ACCESS_PRODUCT_POLICY_AGREEMENT;
    const { app, wiring } = db.application(db.adapter().client, false, terms);
    const input = submission();
    const line = { ...input.lines[1], quantity: 2 };
    const submitted = await db.post(app, "", {
      ...input, lines: [line], contact: { ...input.contact, email: recipient },
      agreements: input.agreements.map((agreement, index) => index === 0 ? { ...agreement, ...terms } : agreement),
    });
    expect(submitted.status).toBe(200);
    const rows = await db.snapshot();
    expect(rows).toHaveLength(1);
    const [saved] = rows;
    const fixture = {
      xriId: saved.id, attemptHash: saved.attempt_hash, ownerHash: saved.owner_hash,
      customerRef: guest.earlyAccessCustomerRef, issuerId: OPERATOR, recipientId,
      productId: line.productId, variantId: line.variantId, unitPriceCents: 1275,
      approvalEvidenceId: "synthetic-price", validUntil: new Date(Date.now() + 3600000).toISOString(),
    };
    const env = {
      RENDER: "true", RENDER_SERVICE_ID: "srv-d9h4f4m7r5hc73ctjng0", RENDER_EXTERNAL_URL: STAGING_QUOTE_ORIGIN,
      SUPABASE_URL: "https://srcphrgnxreqyirkitxd.supabase.co",
      EA_STAGE_QUOTE_DATABASE_URL: "postgresql://ea_quote_stage_login.srcphrgnxreqyirkitxd:unused@aws-0-us-east-2.pooler.supabase.com:5432/postgres",
      EA_STAGE_QUOTE_FIXTURE: JSON.stringify(fixture), EA_STAGE_QUOTE_TAG_KEY: "1".repeat(64), ADMIN_EMAIL: issuerEmail,
    };
    const confirmedAt = new Date().toISOString();
    const runtimePool = db.poolForLogin("ea_quote_stage_login", loginPassword);
    pool = runtimePool;
    mountStagingPrivateQuotePortal(app, { ...wiring, env }, { customer: async () => guest }, (req, res, next) => {
      if (req.get("x-fixture-staff") !== "operator") { res.sendStatus(401); return; }
      Object.assign(req, { adminEmail: issuerEmail });
      next();
    }, async id => id === OPERATOR ? { email: issuerEmail, confirmedAt } :
      id === recipientId ? { email: recipient, confirmedAt } : null, () => runtimePool);

    const issue = () => request(app).post("/api/staff/early-access/private-quotes/issue")
      .set("x-fixture-staff", "operator").set("Origin", STAGING_QUOTE_ORIGIN).send({});
    const issued = await issue().expect(201);
    expect(issued.body).toEqual({ quoteId: expect.any(String), replay: false, noticeReleased: false });
    const portal = await request(app).get("/earlyaccess/quotes").expect(200);
    const quote = new DOMParser().parseFromString(portal.text, "text/html").querySelector("main > section");
    expect(quote?.querySelector("h2")?.textContent).toContain(submitted.body.publicReference);
    expect(quote?.querySelector("li")?.textContent).toContain("Synthetic 2");
    expect(quote?.textContent).toContain("Total: $25.50");
    await issue().expect(200, { quoteId: issued.body.quoteId, replay: true, noticeReleased: false });
    const count = await db.sql(`SELECT
      (SELECT count(*)::int FROM quote_delivery_private.qd_quotes) AS quotes,
      (SELECT count(*)::int FROM public.research_notification_outbox) AS notices`);
    expect(count.rows[0]).toEqual({ quotes: 1, notices: 0 });
  } finally {
    try { await pool?.end(); } finally { await db.close(); }
  }
}, 120_000);
