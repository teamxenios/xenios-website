/** Owned-PG producer qualification for the server referral locator. UNRUN.
 * The real registerRequestIntentApi -> router -> service -> RPC repository ->
 * locator path, against the exact authoritative-referral candidate pinned below
 * and the same canonical prerequisite boot its own owned test uses. No managed
 * URL or credential is accepted. Every case is skipped unless an owned
 * PostgreSQL 17.6 or 17.11 selector is set AND the candidate file is present;
 * a present file with other bytes fails. Nothing here installs, enables or
 * claims a managed result. Synthetic actors only.
 * Not covered here: a signed-in member's account binding through the route
 * (this fixture resolves guests only), a reported referral stored beside a
 * verified touch, and a held V1 lock (55P03); the service tests cover the
 * last at the unit level. */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type express from "express";
import { sha256AssistedOrderHasher } from "../defaults";
import { ORIGIN, ROUTE, submission } from "./durable-journey.pg.fixture";
import { REQUEST_INTENT_SERVER_REFERRAL_ENV } from "./production";
import { createReferralInstallerFixture, pinnedSql, selectReferralInstallerImage } from "../../referral-readiness/canonical-prerequisites.pg.fixture";
import {
  ATTRIBUTION_COOKIE_NAME, REFERRAL_VISITOR_COOKIE, createReferralVisitor, referralSubject,
  sealReferralCapture, sealReferralVisitor,
} from "../../partners/referral-v1-tokens";

const S = "request_intent_private";
const CANDIDATE = "supabase/candidates/request_intent_authoritative_referral.sql";
/** The exact 9022 candidate bytes (Git blob db449ad3a79ac706d6fa67b6bce6f379a65cfa54). */
const CANDIDATE_PIN = { bytes: 49145, sha256: "dbd842e3aec723921e3b08140b11c7cf9c44b31e02ba9555faa0efcb795ef065" } as const;
const SECRET = "synthetic-owned-producer-partner-link-key-not-for-production";
const OTHER_SECRET = "synthetic-owned-producer-other-browser-key-not-for-production";
const image = selectReferralInstallerImage(process.env);
const pgIt = image && existsSync(CANDIDATE) ? it : it.skip;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
type Db = ReturnType<typeof createReferralInstallerFixture>;
/** The exact canonical Care predecessor that the pending-reader migration
 * requires (the same pin as account-lifecycle.pg.test.ts). */
const CARE_FOUNDATION = { path: "supabase/care-access-foundation.sql", bytes: 6227,
  sha256: "e91331b72820c6ca3f1cb3ce0fa8c79487e70d189d74b853bdaff49b2d7589ce" } as const;
/** Replace the inherited fixture's two CHECK-less stand-in Care tables with the
 * real pinned foundation, exactly as account-lifecycle.pg.test.ts does. No CHECK
 * is hand-written and the migration's strict predecessor lookup is unchanged. */
async function installCanonicalCare(db: Db) {
  await db.sql("drop table public.care_role_assignments; drop table public.care_capabilities");
  await db.sql(pinnedSql(CARE_FOUNDATION));
  expect((await db.sql(`select
    (select count(*)::int from pg_catalog.pg_constraint where conrelid='public.care_role_assignments'::regclass
      and conname='care_role_assignments_role_check' and contype='c' and convalidated) as role,
    (select count(*)::int from pg_catalog.pg_constraint where conrelid='public.care_access_audit'::regclass
      and conname='care_access_audit_permission_check' and contype='c' and convalidated) as permission`)).rows[0])
    .toEqual({ role: 1, permission: 1 });
}

function pinnedCandidate(): string {
  const sql = readFileSync(CANDIDATE, "utf8").replaceAll("\r\n", "\n");
  if (sql.includes("\r") || Buffer.byteLength(sql, "utf8") !== CANDIDATE_PIN.bytes || hash(sql) !== CANDIDATE_PIN.sha256) {
    throw new Error("Authoritative referral candidate pin mismatch: " + CANDIDATE);
  }
  return sql;
}

/** The same canonical boot as the candidate's own owned test, then the pinned candidate. */
async function boot(): Promise<Db> {
  if (!image) throw new Error("An exact existing owned PostgreSQL selector is required");
  const candidate = pinnedCandidate();
  const db = createReferralInstallerFixture();
  try {
    await db.start(image); await db.bootstrapCanonicalCore(); await db.bootstrapRemaining(); await db.installChain();
    const { app } = db.application(db.adapter().client);
    expect((await db.post(app, "", submission(), "a")).status).toBe(200);
    await installCanonicalCare(db);
    for (const path of [
      "supabase/research-notification-outbox.sql",
      "server/research/assisted-order/request-intent/private-contact.candidate.sql",
      "supabase/migrations/20261114133643_early_access_postal_admission.sql",
      "supabase/candidates/request_intent_optional_context.sql",
      "supabase/migrations/20261114133500_early_access_pending_request_reader.sql",
      "supabase/migrations/20261115205033_early_access_request_submitted_staff_notice.sql",
      "supabase/migrations/20261115222911_early_access_staff_notice_request_detail.sql",
      "supabase/migrations/20261118024134_request_intent_workflow.sql",
      "supabase/migrations/20261118033449_early_access_request_customer_notices.sql",
      "supabase/candidates/request_intent_policy_capture.sql",
      "supabase/candidates/request_intent_referral_capture.sql",
      "supabase/migrations/20261118172136_request_customer_notice_delivery_receipts.sql",
      "supabase/migrations/20261118194612_request_customer_notice_delivery_state.sql",
      "supabase/candidates/request_intent_staff_notice_retention_lock.sql",
    ]) await db.sql(readFileSync(path, "utf8"));
    await db.sql("create schema quote_delivery_private");
    await db.sql("set search_path=quote_delivery_private,pg_catalog;\n"
      + readFileSync("server/research/assisted-order/quote/delivery/tables.sql", "utf8")
      + readFileSync("server/research/assisted-order/quote/delivery/private-pg.sql", "utf8"));
    const bundle = randomUUID();
    await db.sql(`insert into ${S}.policy_bundles(id,environment,retention_policy_id,retention_policy_version,retention_record_reference,retention_document_sha256,
      recipient_policy_id,recipient_policy_version,recipient_record_reference,recipient_document_sha256,approval_record_reference,approval_received_at,
      required_agreements,notice_agreement_kind,notice_agreement_version,notice_document_sha256)
      values($1,'staging','FIXTURE-RETENTION','v1','fixture:retention:1',$2,'FIXTURE-RECIPIENT','v1','fixture:recipient:1',$3,
      'fixture:approval:1',clock_timestamp()-interval '1 second','[{"kind":"fixture-terms","version":"fixture-v1"}]','fixture-terms','fixture-v1',$4)`,
    [bundle, hash("retention"), hash("recipient"), hash("document")]);
    await db.sql(`update ${S}.workflow_settings set environment='staging',start_at=clock_timestamp(),enabled=true,
      retention_policy_version='fixture:retention:1',recipient_policy_version='fixture:recipient:1',policy_capture_bundle_id=$1,policy_capture_enabled=true`, [bundle]);
    await db.sql(readFileSync("supabase/candidates/request_intent_fixture_no_mail.sql", "utf8"));
    await db.sql(candidate);
    return db;
  } catch (error) { await db.close(); throw error; }
}

async function v1(db: Db, op: string, input: object) {
  const value = (await db.asRole("service_role", "select public.research_referral_v1_execute($1,$2::jsonb) as r", [op, JSON.stringify(input)])).rows[0].r;
  expect(value.ok).toBe(true); if (!value.ok) throw new Error("Owned V1 operation refused"); return value.value;
}
/** A real V1 touch captured for a real sealed visitor, as the referral routes would. */
async function capturedBrowser(db: Db) {
  const actor = randomUUID(), memberId = randomUUID(), application = randomUUID(), partner = randomUUID();
  const email = randomUUID() + "@example.invalid";
  await db.sql("insert into auth.users(id,email,email_confirmed_at) values($1,$2,clock_timestamp())", [actor, email]);
  await db.sql("insert into public.research_applications(id,email,first_name,last_name,country) values($1,$2,'Synthetic','Fixture','US')", [application, email]);
  await db.sql("insert into public.research_members(id,application_id,auth_user_id,email,first_name,status) values($1,$2,$3,$4,'Synthetic','active')",
    [memberId, application, actor, email]);
  await db.sql(`insert into public.research_partners(id,member_id,role,state,legal_name,contact_email,identity_verified,tax_status,payout_status,
    certified_at,certified_by_admin_id,activated_at,activated_by_admin_id)
    values($1,$2,'affiliate','active','Synthetic Owned Fixture','partner@example.invalid',true,'verified','verified',clock_timestamp(),
    'synthetic-owned-admin',clock_timestamp(),'synthetic-owned-admin')`, [partner, memberId]);
  const visitor = createReferralVisitor(Date.now()), subject = referralSubject(SECRET, visitor), token = hash(randomUUID());
  const issued = await v1(db, "issue", { actorAuthUserId: actor, idempotencyKey: randomUUID(), linkId: randomUUID(),
    tokenHashHex: token, tokenKeyVersion: 1, destinationPath: "/health", expiresInDays: 30 });
  const touch = (await v1(db, "capture", { tokenHashHex: token, subjectKeyHash: subject })).touch.touchId as string;
  const claim = { touchId: touch, subjectKeyHash: subject, expiresAt: Date.now() + 600_000 };
  const cookie = (secret: string) => `${REFERRAL_VISITOR_COOKIE}=${sealReferralVisitor(secret, visitor)}; `
    + `${ATTRIBUTION_COOKIE_NAME}=${sealReferralCapture(secret, claim)}`;
  // Another browser's sealed visitor with this browser's claim: subject mismatch.
  const other = createReferralVisitor(Date.now());
  const otherVisitor = `${REFERRAL_VISITOR_COOKIE}=${sealReferralVisitor(SECRET, other)}; `
    + `${ATTRIBUTION_COOKIE_NAME}=${sealReferralCapture(SECRET, claim)}`;
  return { partner, link: issued.link.id as string, touch, subject, cookie: cookie(SECRET), forged: cookie(OTHER_SECRET), otherVisitor };
}

function routeApp(db: Db, env: NodeJS.ProcessEnv) {
  return db.application(db.adapter().client, false, undefined, { env }).app;
}
const v1On: NodeJS.ProcessEnv = { RESEARCH_REFERRAL_V1_ENABLED: "true", AFFILIATE_SYSTEM_ENABLED: "true",
  AFFILIATE_PORTAL_ENABLED: "true", AFFILIATE_CODES_ENABLED: "true", RESEARCH_PARTNER_LINK_SECRET: SECRET };
// submission() stamps a fresh acceptedAt on each call, so a same-key replay must resend the first body unchanged.
function bodyFor(key: string) { return { ...submission(), idempotencyKey: key }; }
function post(app: express.Express, key: string, cookie?: string, sent: ReturnType<typeof bodyFor> = bodyFor(key)) {
  const call = request(app).post(ROUTE).set("Origin", ORIGIN).set("Sec-Fetch-Site", "same-origin").set("x-fixture-guest", "a");
  return (cookie ? call.set("Cookie", cookie) : call).send(sent);
}
async function saved(db: Db, key: string) {
  const rows = (await db.sql(`select authoritative_referral_snapshot as s from ${S}.requests where attempt_hash=$1`,
    [sha256AssistedOrderHasher.hash(key)])).rows;
  return { count: rows.length, snapshot: rows[0]?.s };
}

describe.sequential("server referral locator producer through the real request route", () => {
  pgIt("records the database's own decision for each locator, only on new births, and never echoes or logs it", async () => {
    const db = await boot();
    const logs = [vi.spyOn(console, "log"), vi.spyOn(console, "info"), vi.spyOn(console, "warn"), vi.spyOn(console, "error")];
    try {
      const browser = await capturedBrowser(db);
      const off = routeApp(db, v1On);
      const on = routeApp(db, { ...v1On, [REQUEST_INTENT_SERVER_REFERRAL_ENV]: "true" });
      const v1Off = routeApp(db, { ...v1On, RESEARCH_REFERRAL_V1_ENABLED: "false", [REQUEST_INTENT_SERVER_REFERRAL_ENV]: "true" });

      // G0: switch absent keeps the earlier birth, even with a valid captured browser.
      const plainKey = randomUUID();
      expect((await post(off, plainKey, browser.cookie)).status).toBe(200);
      expect(await saved(db, plainKey)).toMatchObject({ count: 1, snapshot: { state: "unavailable", reason: "not_requested" } });

      // G1: a real captured browser yields the provisional touch the SQL decided.
      const touchKey = randomUUID(), touchBody = bodyFor(touchKey), first = await post(on, touchKey, browser.cookie, touchBody);
      expect(first.status).toBe(200);
      expect(Object.keys(first.body).sort()).toEqual(["createdAt", "kind", "publicReference", "requestId", "status"]);
      const decided = await saved(db, touchKey);
      expect(decided).toMatchObject({ count: 1, snapshot: { protocol: "xri-referral/v1", state: "provisional_touch",
        source: "guest_touch", partnerId: browser.partner, linkId: browser.link, touchId: browser.touch } });
      expect(JSON.stringify(decided.snapshot)).not.toContain(browser.subject);

      // G4: replay of the same body under the same key with another cookie returns the same receipt and changes nothing.
      const replay = await post(on, touchKey, browser.forged, touchBody);
      expect(replay.status).toBe(200);
      expect(replay.body).toEqual(first.body);
      expect(await saved(db, touchKey)).toEqual(decided);

      // G3: a cookie sealed with another key, or another visitor's claim, gives no supported touch.
      for (const cookie of [browser.forged, browser.otherVisitor]) {
        const key = randomUUID();
        expect((await post(on, key, cookie)).status).toBe(200);
        expect(await saved(db, key)).toMatchObject({ count: 1, snapshot: { state: "none", reason: "no_supported_touch" } });
      }

      // The switch on with V1 off records the explicit disabled reason, not a touch.
      const disabledKey = randomUUID();
      expect((await post(v1Off, disabledKey, browser.cookie)).status).toBe(200);
      expect(await saved(db, disabledKey)).toMatchObject({ count: 1, snapshot: { state: "unavailable", reason: "disabled" } });

      // G6: no partner, link, touch or subject in any reply, and nothing logged that carries them.
      for (const body of [first.body, replay.body]) {
        for (const secret of [browser.partner, browser.link, browser.touch, browser.subject]) expect(JSON.stringify(body)).not.toContain(secret);
      }
      const logged = JSON.stringify(logs.flatMap(spy => spy.mock.calls));
      for (const secret of [browser.touch, browser.subject, browser.cookie, browser.partner]) expect(logged).not.toContain(secret);
    } finally {
      logs.forEach(spy => spy.mockRestore());
      await db.close();
    }
  }, 300_000);
});
