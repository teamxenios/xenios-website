/** Owned disposable PG ONLY. These are synthetic database/worker fixtures,
 * never evidence of a human's consent, live actor, managed apply or no-mail run.
 * No existing DB URL/provider is accepted. All cases are authored; qualification
 * is allocated by Root. Reuses the existing closed owned transport/cleanup. */
import { readFileSync } from "node:fs";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { expect } from "vitest";
import type { Pool, PoolClient } from "pg";
import type { RequestIntentDetail } from "../../../../shared/research/assisted-order/request-intent";
import { createDurableJourneyFixture, pg16It, submission } from "./durable-journey.pg.fixture";
import { outboxAttemptRow, outboxClaimFields, outboxCompletionFields } from "../../outbox-writes";

const S = "request_intent_private";
const CANDIDATE = "supabase/candidates/request_intent_fixture_no_mail.sql";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
type Db = ReturnType<typeof createDurableJourneyFixture>;
type Writer = "base" | "context" | "referral";
type Detail = RequestIntentDetail;
type Fixture = { db: Db; pool: Pool; prototype: Detail; close(): Promise<void> };
type Tuple = { owner: string; attempt: string; fingerprint: string; detail: Detail;
  key: { ownerBinding: string; policyRevision: string }; revision: string | null;
  metadata: Record<string, string>; control: string; approval: string };
const metadataSQL = "select public.request_intent_fixture_prepare_metadata($1,$2,$3,$4::jsonb,$5::jsonb,$6::uuid,$7::timestamptz) as m";
const publicationSQL = `select ${S}.fixture_no_mail_publish($1::uuid,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9::timestamptz,$10::jsonb,$11::timestamptz,$12::uuid) as digest`;

async function boot(): Promise<Fixture> {
  const db = createDurableJourneyFixture();
  let pool: Pool | undefined;
  try {
    await db.start({ managedCareSchema: true });
    // A real mounted canonical-service submission supplies the stored line and
    // acknowledgment shape; no pared-down duplicate schema is substituted.
    const { app } = db.application(db.adapter().client);
    expect((await db.post(app, "", submission(), "a")).status).toBe(200);
    const [seed] = await db.snapshot();
    for (const p of [
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
    ]) await db.sql(readFileSync(p, "utf8"));
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
    await db.sql(readFileSync(CANDIDATE, "utf8"));
    expect((await db.asRole("service_role", "select public.request_intent_fixture_mail_guard_status() as s")).rows[0].s)
      .toEqual({ protocol: "request-intent/fixture-no-mail/v1", ready: true });
    // Ephemeral login in this helper-owned cluster only. No external connection
    // options or customer credential is accepted or logged.
    const password = randomUUID();
    await db.sql(`create role fixture_no_mail_backend login superuser password '${password}'`);
    pool = db.poolForLogin("fixture_no_mail_backend", password);
    const prototype: Detail = { requestId: seed.id, publicReference: seed.public_reference,
      kind: "unapproved_selection_request", status: "pending_review", createdAt: new Date().toISOString(),
      contact: seed.contact, agreements: seed.agreements, lines: seed.lines };
    return { db, pool, prototype, async close() { await pool!.end(); await db.close(); } };
  } catch (e) { if (pool) await pool.end(); await db.close(); throw e; }
}

async function tuple(f: Fixture, label: string, v4 = false, notAfter?: string): Promise<Tuple> {
  const owner = hash("owner:" + label), attempt = hash("attempt:" + label), fingerprint = hash("input:" + label);
  const id = randomUUID();
  const detail = { ...f.prototype, requestId: id, publicReference: "XRI-" + id.replace(/-/g, "").toUpperCase() };
  const key = { ownerBinding: hash("admission:" + label), policyRevision: hash("policy:" + label) };
  const revision = v4 ? randomUUID() : null;
  await f.db.sql(`insert into ${S}.catalog_contact_admission(owner_binding,policy_revision,full_legal_name,email,expires_at,postal_address)
    values($1,$2,'Synthetic fixture','fixture@example.invalid',clock_timestamp()+interval '30 minutes','{"line1":"1 Fixture St","city":"Fixture","countryCode":"HK"}')`,
  [key.ownerBinding, key.policyRevision]);
  if (revision) await f.db.sql(`insert into ${S}.catalog_referral_admission(owner_binding,policy_revision,revision,admission_expires_at)
    select owner_binding,policy_revision,$3::uuid,expires_at from ${S}.catalog_contact_admission where owner_binding=$1 and policy_revision=$2`,
  [key.ownerBinding, key.policyRevision, revision]);
  const deadline = notAfter ?? (await f.db.sql("select to_char((clock_timestamp()+interval '10 minutes') at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') as t")).rows[0].t as string;
  const metadata = (await f.db.asRole("service_role", metadataSQL, [owner, attempt, fingerprint,
    JSON.stringify({ lines: detail.lines, agreements: detail.agreements }), JSON.stringify(key), revision, deadline])).rows[0].m as Record<string, string>;
  expect(Object.keys(metadata).sort()).toEqual(["protocol", "snapshotSha256", "issuedAt", "expiresAt", "admissionExpiresAt", "admissionPolicyRevision", ...(revision ? ["referralRevision"] : [])].sort());
  expect(metadata.issuedAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/);
  expect(metadata.admissionPolicyRevision).toBe(key.policyRevision);
  expect(metadata.snapshotSha256).toMatch(/^[a-f0-9]{64}$/);
  return { owner, attempt, fingerprint, detail, key, revision, metadata, control: randomUUID(), approval: hash("approved:" + label) };
}
function publication(t: Tuple): unknown[] {
  return [t.control, t.owner, t.attempt, t.fingerprint, t.metadata.snapshotSha256, "owned:synthetic:approval", t.approval,
    t.metadata.issuedAt, t.metadata.expiresAt, JSON.stringify(t.key), t.metadata.admissionExpiresAt, t.revision];
}
function write(t: Tuple, kind: Writer): [string, unknown[]] {
  const args = [t.owner, t.attempt, t.fingerprint, JSON.stringify(t.detail)];
  if (kind === "base") return ["select public.request_intent_create_or_replay($1,$2,$3,$4::jsonb) as r", args];
  if (kind === "context") return ["select public.request_intent_create_with_context($1,$2,$3,$4::jsonb,'{\"goal\":\"compare_options\"}'::jsonb) as r", args];
  return ["select public.request_intent_create_with_referral($1,$2,$3,$4::jsonb,'{\"referralChoice\":{\"mode\":\"omit\"}}'::jsonb,null) as r", args];
}
async function save(f: Fixture, t: Tuple, kind: Writer = "base") { const [q, a] = write(t, kind); return f.db.asRole("service_role", q, a); }
async function begin(pool: Pool, role: "postgres" | "service_role"): Promise<PoolClient> {
  const c = await pool.connect();
  await c.query("begin"); await c.query("set local role " + role);
  await c.query("set local statement_timeout='8s'");
  return c;
}
async function waiting(db: Db, pid: number) {
  for (let i = 0; i < 80; i++) {
    if ((await db.sql(`select a.wait_event_type='Lock' and exists(
      select 1 from pg_catalog.pg_locks l where l.pid=a.pid and l.locktype='advisory' and not l.granted
      ) as waiting from pg_catalog.pg_stat_activity a where a.pid=$1`, [pid])).rows[0]?.waiting) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error("Owned independent backend did not reach the expected database lock");
}
async function zeroAttempts(f: Fixture) {
  expect((await f.db.sql("select count(*)::int as n from public.research_notification_attempts")).rows[0].n).toBe(0);
  expect((await f.db.sql("select count(*)::int as n from public.research_notification_outbox where mail_disposition='fixture_no_mail' and (last_attempt_at is not null or attempt_count<>0 or provider_message_id is not null or status<>'pending')")).rows[0].n).toBe(0);
}

pg16It("publisher wins real L->F races against base, context and direct referral; one immutable birth, exact replay and ordinary conservation", async () => {
  for (const kind of ["base", "context", "referral"] as const) {
    const f = await boot();
    try {
      const t = await tuple(f, "publisher-first:" + kind, kind === "referral");
      const a = await begin(f.pool, "postgres"), b = await begin(f.pool, "service_role");
      try {
        await a.query(publicationSQL, publication(t));
        const pid = (await b.query("select pg_backend_pid() as pid")).rows[0].pid as number;
        const [sql, args] = write(t, kind);
        const work = b.query(sql, args);
        await waiting(f.db, pid); // Actual independent backend blocked on L, not a sleep/mock proof.
        await a.query("commit");
        expect((await work).rows[0].r.receipt.requestId).toBe(t.detail.requestId);
        await b.query("commit");
      } finally { await a.query("rollback"); await b.query("rollback"); a.release(); b.release(); }
      const row = (await f.db.sql(`select fixture_no_mail_control_id from ${S}.requests where id=$1`, [t.detail.requestId])).rows[0];
      expect(row.fixture_no_mail_control_id).toBe(t.control);
      expect((await f.db.sql(`select fixture_request_id from ${S}.workflow_settings where singleton`)).rows[0].fixture_request_id).toBe(t.detail.requestId);
      const before = (await f.db.sql(`select (select count(*) from ${S}.requests)::int as r,(select count(*) from ${S}.workflow_events)::int as e,(select count(*) from ${S}.access_events)::int as a`)).rows[0];
      for (const other of ["base", "context", "referral"] as const) expect((await save(f, t, other)).rows[0].r.receipt.requestId).toBe(t.detail.requestId);
      expect((await f.db.sql(`select (select count(*) from ${S}.requests)::int as r,(select count(*) from ${S}.workflow_events)::int as e,(select count(*) from ${S}.access_events)::int as a`)).rows[0]).toEqual(before);
      expect((await f.db.sql("select count(*)::int as n from public.research_notification_outbox")).rows[0].n).toBe(0);
      expect((await f.db.sql(`select ${S}.workflow_customer_notice(request_id,event_id) as s from ${S}.workflow_notice_intents where request_id=$1`, [t.detail.requestId])).rows).toEqual([{ s: "suppressed" }]);
      await f.db.sql(readFileSync(CANDIDATE, "utf8")); // verify-only source reapply never resets the slot
      expect((await f.db.sql(publicationSQL, publication(t))).rows[0].digest).toMatch(/^[a-f0-9]{64}$/);
      await zeroAttempts(f);
    } finally { await f.close(); }
  }
}, 240_000);

pg16It("writer wins real base/context/referral races: publisher cannot convert an ordinary request or bypass its existing lock", async () => {
  const f = await boot();
  try {
    for (const kind of ["base", "context", "referral"] as const) {
      const t = await tuple(f, "writer-first:" + kind);
      const a = await begin(f.pool, "service_role"), b = await begin(f.pool, "postgres");
      try {
        const [sql, args] = write(t, kind); await a.query(sql, args);
        const pid = (await b.query("select pg_backend_pid() as pid")).rows[0].pid as number;
        const pending = b.query(publicationSQL, publication(t));
        // Attach rejection handling before waiting/commit to avoid an unhandled rejection.
        const outcome = pending.then(() => null, e => e as { code: string });
        await waiting(f.db, pid); await a.query("commit");
        expect(await outcome).toMatchObject({ code: "55000" }); await b.query("rollback");
      } finally { await a.query("rollback"); await b.query("rollback"); a.release(); b.release(); }
      expect((await f.db.sql(`select fixture_no_mail_control_id from ${S}.requests where id=$1`, [t.detail.requestId])).rows[0].fixture_no_mail_control_id).toBeNull();
    }
    expect((await f.db.sql(`select fixture_control_id from ${S}.workflow_settings where singleton`)).rows[0].fixture_control_id).toBeNull();
    expect((await f.db.sql("select count(*)::int as n from public.research_notification_outbox where mail_disposition='ordinary'")).rows[0].n).toBe(3);
  } finally { await f.close(); }
}, 180_000);

pg16It("a blocked second backend wins after first-birth rollback; same-attempt recovery never recreates optional data or reopens mail after admission purge", async () => {
  const f = await boot();
  try {
    const t = await tuple(f, "abort-then-winner", true);
    await f.db.sql(publicationSQL, publication(t));
    const secondId = randomUUID();
    const next: Tuple = { ...t, detail: { ...t.detail, requestId: secondId,
      publicReference: "XRI-" + secondId.replace(/-/g, "").toUpperCase() } };
    const a = await begin(f.pool, "service_role"), b = await begin(f.pool, "service_role");
    try {
      const [firstSQL, firstArgs] = write(t, "context");
      await a.query(firstSQL, firstArgs); // birth, slot consumption, policy/event/context all still uncommitted
      const pid = (await b.query("select pg_backend_pid() as pid")).rows[0].pid as number;
      const [secondSQL, secondArgs] = write(next, "referral");
      const pending = b.query(secondSQL, secondArgs);
      await waiting(f.db, pid);
      await a.query("rollback");
      expect((await pending).rows[0].r.receipt.requestId).toBe(secondId);
      await b.query("commit");
    } finally { await a.query("rollback"); await b.query("rollback"); a.release(); b.release(); }
    expect((await f.db.sql(`select id,fixture_no_mail_control_id from ${S}.requests where owner_hash=$1 and attempt_hash=$2`, [t.owner, t.attempt])).rows)
      .toEqual([{ id: secondId, fixture_no_mail_control_id: t.control }]);
    expect((await f.db.sql(`select fixture_request_id from ${S}.workflow_settings where singleton`)).rows[0].fixture_request_id).toBe(secondId);
    expect((await f.db.sql(`select count(*)::int as n from ${S}.optional_context where request_id in($1,$2)`, [t.detail.requestId, secondId])).rows[0].n).toBe(0);
    expect((await f.db.sql(`select request_id,mode from ${S}.reported_referral_snapshots where request_id in($1,$2)`, [t.detail.requestId, secondId])).rows)
      .toEqual([{ request_id: secondId, mode: "omit" }]);
    const before = (await f.db.sql(`select (select count(*) from ${S}.workflow_events where request_id=$1)::int as e,
      (select count(*) from ${S}.request_policy_snapshots where request_id=$1)::int as p,
      (select count(*) from ${S}.access_events where request_id=$1)::int as a`, [secondId])).rows[0];
    expect(before).toEqual({ e: 2, p: 1, a: 1 });
    await f.db.sql(`delete from ${S}.catalog_contact_admission where owner_binding=$1 and policy_revision=$2`, [t.key.ownerBinding, t.key.policyRevision]);
    for (const kind of ["base", "context", "referral"] as const) expect((await save(f, t, kind)).rows[0].r.receipt.requestId).toBe(secondId);
    expect((await f.db.sql(`select (select count(*) from ${S}.workflow_events where request_id=$1)::int as e,
      (select count(*) from ${S}.request_policy_snapshots where request_id=$1)::int as p,
      (select count(*) from ${S}.access_events where request_id=$1)::int as a`, [secondId])).rows[0]).toEqual(before);
    expect((await f.db.sql(`select count(*)::int as n from ${S}.optional_context where request_id=$1`, [secondId])).rows[0].n).toBe(0);
    expect((await f.db.sql("select count(*)::int as n from public.research_notification_outbox")).rows[0].n).toBe(0);
    await zeroAttempts(f);
  } finally { await f.close(); }
}, 180_000);

pg16It("guards held jobs, direct INSERT processing, old claim/completion/stale/retry, early ledger INSERT and exact derivative alert before any attempt", async () => {
  const f = await boot();
  try {
    const t = await tuple(f, "native-fences", true);
    const counts = (await f.db.sql(`select (select count(*) from ${S}.requests)::int as r,(select count(*) from public.research_notification_outbox)::int as o`)).rows[0];
    for (const role of ["anon", "authenticated", "service_role"] as const) await expect(f.db.asRole(role, publicationSQL, publication(t))).rejects.toMatchObject({ code: "42501" });
    const preparation = [t.owner, t.attempt, t.fingerprint, JSON.stringify({ lines: t.detail.lines, agreements: t.detail.agreements }),
      JSON.stringify(t.key), t.revision, t.metadata.expiresAt];
    for (const role of ["anon", "authenticated"] as const) await expect(f.db.asRole(role, metadataSQL, preparation)).rejects.toMatchObject({ code: "42501" });
    await expect(f.db.asRole("service_role", metadataSQL, preparation, randomUUID())).rejects.toMatchObject({ code: "42501" });
    expect((await f.db.sql(`select (select count(*) from ${S}.requests)::int as r,(select count(*) from public.research_notification_outbox)::int as o`)).rows[0]).toEqual(counts);
    await f.db.sql(publicationSQL, publication(t));
    await expect(f.db.asRole("service_role", metadataSQL, preparation)).rejects.toMatchObject({ code: "55000" });
    const changedApproval = publication(t); changedApproval[6] = hash("unapproved-replacement");
    await expect(f.db.sql(publicationSQL, changedApproval)).rejects.toMatchObject({ code: "23505" });
    await expect(save(f, { ...t, fingerprint: hash("changed") })).rejects.toMatchObject({ code: "23505" });
    const wrong = { ...t, detail: { ...t.detail, lines: [...t.detail.lines].reverse() } };
    await expect(save(f, wrong)).rejects.toMatchObject({ code: "55000" });
    await save(f, t);
    const key = "ea-request-submitted-" + t.detail.requestId;
    const payload = { reference: t.detail.publicReference, submittedAt: new Date().toISOString(), itemCount: t.detail.lines.length,
      recipients: ["staff-a@example.invalid", "staff-b@example.invalid"] };
    const insert = `insert into public.research_notification_outbox(event_key,event_type,template_key,recipient,payload,status)
      values($1,'ea_request_submitted_staff_v1','ea_request_submitted_staff_v1','staff-a@example.invalid',$2::jsonb,$3) returning *`;
    expect((await f.db.sql(insert, [key, JSON.stringify(payload), "processing"])).rows).toEqual([]);
    const [job] = (await f.db.sql(insert, [key, JSON.stringify(payload), "pending"])).rows;
    expect(job.mail_disposition).toBe("fixture_no_mail");
    const now = new Date(), claim = outboxClaimFields(now);
    expect((await f.db.sql("update public.research_notification_outbox set status=$2,updated_at=$3,last_attempt_at=$4,completed_at=null where id=$1 and status='pending' returning *",
      [job.id, claim.status, claim.updated_at, claim.last_attempt_at])).rows).toEqual([]);
    const attempt = outboxAttemptRow(job.id, 1, { ok: false, providerId: null, error: "owned blocked dispatch" });
    expect((await f.db.sql("insert into public.research_notification_attempts(outbox_id,attempt,outcome,error_summary) values($1,$2,$3,$4) returning id",
      [attempt.outbox_id, attempt.attempt, attempt.outcome, attempt.error_summary])).rows).toEqual([]); // BEFORE completion CAS
    const completed = outboxCompletionFields({ ok: false, providerId: null, nonRetryable: true, error: "owned" }, 1, now);
    expect((await f.db.sql("update public.research_notification_outbox set status=$2,attempt_count=$3,last_attempt_at=$4,completed_at=$5 where id=$1 returning id",
      [job.id, completed.status, completed.attempt_count, completed.last_attempt_at, completed.completed_at])).rows).toEqual([]);
    for (const sql of [
      "update public.research_notification_outbox set status='failed_retryable',attempt_count=attempt_count+1,last_attempt_at=clock_timestamp(),updated_at=clock_timestamp() where id=$1 returning id",
      "update public.research_notification_outbox set status='pending',attempt_count=0,last_error_summary=null,completed_at=null,next_attempt_at=clock_timestamp(),updated_at=clock_timestamp() where id=$1 returning id",
    ]) expect((await f.db.sql(sql, [job.id])).rows).toEqual([]);
    const alertKey = "email-failure:" + job.id + ":1:admin@example.invalid";
    const alert = (await f.db.sql(`insert into public.research_notification_outbox(event_key,event_type,template_key,recipient,payload)
      values($1,'notification_failed_admin','admin_email_failure','admin@example.invalid','{}') returning *`, [alertKey])).rows[0];
    expect(alert.mail_disposition).toBe("fixture_no_mail");
    expect((await f.db.sql("update public.research_notification_outbox set status='processing',last_attempt_at=clock_timestamp() where id=$1 returning id", [alert.id])).rows).toEqual([]);
    expect((await f.db.sql("select * from public.research_notification_outbox where id=$1", [job.id])).rows[0]).toEqual(job);
    await expect(f.db.sql("update public.research_notification_outbox set mail_disposition='ordinary',fixture_control_id=null,fixture_request_id=null where id=$1", [job.id]))
      .rejects.toMatchObject({ code: "42501" });
    for (const args of [["2000-01-01", ["staff-a@example.invalid", "staff-b@example.invalid"]], ["2000-01-01", ["staff-a@example.invalid", "staff-b@example.invalid"], "2000-01-01"]]) {
      const casts = args.length === 2 ? "$1::timestamptz,$2::text[]" : "$1::timestamptz,$2::text[],$3::timestamptz";
      await f.db.asRole("service_role", `select public.request_intent_enqueue_staff_notices(${casts})`, args);
    }
    expect((await f.db.sql("select count(*)::int as n from public.research_notification_outbox where mail_disposition='ordinary'")).rows[0].n).toBe(1); // original real-shaped seed only
    await f.db.sql(`update ${S}.workflow_settings set enabled=false`);
    await f.db.sql(`update ${S}.workflow_settings set enabled=true`);
    expect((await save(f, t)).rows[0].r.receipt.requestId).toBe(t.detail.requestId);
    await expect(f.db.sql(`update ${S}.workflow_settings set fixture_control_id=null`)).rejects.toMatchObject({ code: "42501" });
    await expect(f.db.sql(`delete from ${S}.workflow_settings where singleton`)).rejects.toMatchObject({ code: "42501" });
    await expect(f.db.sql(`update ${S}.requests set fixture_no_mail_control_id=null where id=$1`, [t.detail.requestId])).rejects.toMatchObject({ code: "42501" });
    await zeroAttempts(f);
  } finally { await f.close(); }
}, 180_000);

pg16It("a rotated v4 child and subsequently missing contact parent refuse birth without consuming the slot", async () => {
  const f = await boot();
  try {
    const t = await tuple(f, "admission-rotated-before-birth", true);
    await f.db.sql(publicationSQL, publication(t));
    await f.db.sql(`update ${S}.catalog_referral_admission set revision=$3 where owner_binding=$1 and policy_revision=$2`,
      [t.key.ownerBinding, t.key.policyRevision, randomUUID()]);
    for (const kind of ["base", "context", "referral"] as const) await expect(save(f, t, kind)).rejects.toMatchObject({ code: "55000" });
    await f.db.sql(`delete from ${S}.catalog_contact_admission where owner_binding=$1 and policy_revision=$2`, [t.key.ownerBinding, t.key.policyRevision]);
    await expect(save(f, t)).rejects.toMatchObject({ code: "55000" });
    expect((await f.db.sql(`select fixture_request_id from ${S}.workflow_settings where singleton`)).rows[0].fixture_request_id).toBeNull();
    expect((await f.db.sql(`select count(*)::int as n from ${S}.requests where owner_hash=$1 and attempt_hash=$2`, [t.owner, t.attempt])).rows[0].n).toBe(0);
    expect((await f.db.sql("select count(*)::int as n from public.research_notification_outbox")).rows[0].n).toBe(0);
    await zeroAttempts(f);
  } finally { await f.close(); }
}, 180_000);

pg16It("erasing only the matching v4 referral child while contact remains live refuses every writer with no partial birth", async () => {
  // A separate owned fixture is necessary: the one-shot publication cannot be
  // reset or reused from the preceding already-rotated-child scenario.
  const f = await boot();
  try {
    const t = await tuple(f, "only-referral-child-erased", true);
    expect((await f.db.sql(`select exists(select 1 from ${S}.catalog_contact_admission a
      join ${S}.catalog_referral_admission r using(owner_binding,policy_revision)
      where a.owner_binding=$1 and a.policy_revision=$2 and a.postal_address is not null
        and a.expires_at>clock_timestamp() and r.admission_expires_at=a.expires_at and r.revision=$3::uuid) as valid`,
      [t.key.ownerBinding, t.key.policyRevision, t.revision])).rows[0].valid).toBe(true);
    await f.db.sql(publicationSQL, publication(t));
    const slot = (await f.db.sql(`select fixture_control_id,fixture_request_id from ${S}.workflow_settings where singleton`)).rows[0];
    expect(slot).toEqual({ fixture_control_id: t.control, fixture_request_id: null });
    expect((await f.db.sql(`delete from ${S}.catalog_referral_admission where owner_binding=$1 and policy_revision=$2 returning revision`,
      [t.key.ownerBinding, t.key.policyRevision])).rows).toEqual([{ revision: t.revision }]);
    expect((await f.db.sql(`select exists(select 1 from ${S}.catalog_contact_admission
      where owner_binding=$1 and policy_revision=$2 and postal_address is not null and expires_at>clock_timestamp()) as live`,
      [t.key.ownerBinding, t.key.policyRevision])).rows[0].live).toBe(true);
    expect((await f.db.asRole("service_role", "select public.request_intent_fixture_mail_guard_status() as s")).rows[0].s.ready).toBe(true);
    for (const kind of ["base", "context", "referral"] as const) await expect(save(f, t, kind))
      .rejects.toMatchObject({ code: "55000", message: "fixture_admission_unavailable" });
    expect((await f.db.sql(`select fixture_control_id,fixture_request_id from ${S}.workflow_settings where singleton`)).rows[0]).toEqual(slot);
    expect((await f.db.sql(`select count(*)::int as n from ${S}.requests where owner_hash=$1 and attempt_hash=$2`, [t.owner, t.attempt])).rows[0].n).toBe(0);
    expect((await f.db.sql("select count(*)::int as n from public.research_notification_outbox")).rows[0].n).toBe(0);
    expect((await f.db.sql("select count(*)::int as n from quote_delivery_private.qd_notification_intents")).rows[0].n).toBe(0);
    await zeroAttempts(f);
  } finally { await f.close(); }
}, 180_000);

pg16It("conditional, argument-bearing, column-narrowed or deferred native triggers cannot authorize publication or selected birth", async () => {
  const f = await boot();
  try {
    const t = await tuple(f, "native-binding-structure", true);
    const quoteDrop = "drop trigger fixture_quote_fence on quote_delivery_private.qd_notification_intents;\n";
    const quoteOriginal = "create trigger fixture_quote_fence before insert or update on quote_delivery_private.qd_notification_intents for each row execute function request_intent_private.fixture_quote_fence()";
    const consumeDrop = `alter table ${S}.requests drop constraint if exists request_fixture_consume;
      drop trigger if exists request_fixture_consume on ${S}.requests;\n`;
    const consumeOriginal = `create trigger request_fixture_consume after insert on ${S}.requests for each row execute function ${S}.fixture_consume()`;
    const replacements = [
      { drop: quoteDrop, original: quoteOriginal,
        changed: "create trigger fixture_quote_fence before insert or update on quote_delivery_private.qd_notification_intents for each row when (false) execute function request_intent_private.fixture_quote_fence()" },
      { drop: quoteDrop, original: quoteOriginal,
        changed: "create trigger fixture_quote_fence before insert or update on quote_delivery_private.qd_notification_intents for each row execute function request_intent_private.fixture_quote_fence('unexpected-argument')" },
      { drop: quoteDrop, original: quoteOriginal,
        changed: "create trigger fixture_quote_fence before insert or update of provider_id on quote_delivery_private.qd_notification_intents for each row execute function request_intent_private.fixture_quote_fence()" },
      // AFTER INSERT + ROW has the SAME type bits as the real consume guard;
      // only its constraint/deferral metadata reveals this unsafe replacement.
      { drop: consumeDrop, original: consumeOriginal,
        changed: `create constraint trigger request_fixture_consume after insert on ${S}.requests deferrable initially deferred for each row execute function ${S}.fixture_consume()` },
    ];
    const ready = async () => (await f.db.asRole("service_role", "select public.request_intent_fixture_mail_guard_status() as s")).rows[0].s.ready;
    for (const replacement of replacements) {
      await f.db.sql(replacement.drop + replacement.changed);
      expect(await ready()).toBe(false);
      await expect(f.db.sql(publicationSQL, publication(t))).rejects.toMatchObject({ code: "55000", message: "fixture_guard_unavailable" });
      expect((await f.db.sql(`select fixture_control_id from ${S}.workflow_settings where singleton`)).rows[0].fixture_control_id).toBeNull();
      await f.db.sql(replacement.drop + replacement.original);
      expect(await ready()).toBe(true);
    }
    await f.db.sql(publicationSQL, publication(t));
    for (const replacement of replacements) {
      await f.db.sql(replacement.drop + replacement.changed);
      expect(await ready()).toBe(false);
      for (const kind of ["base", "context", "referral"] as const) await expect(save(f, t, kind))
        .rejects.toMatchObject({ code: "55000", message: "fixture_guard_unavailable" });
      expect((await f.db.sql(`select fixture_request_id from ${S}.workflow_settings where singleton`)).rows[0].fixture_request_id).toBeNull();
      expect((await f.db.sql(`select count(*)::int as n from ${S}.requests where owner_hash=$1 and attempt_hash=$2`, [t.owner, t.attempt])).rows[0].n).toBe(0);
      expect((await f.db.sql("select count(*)::int as n from public.research_notification_outbox")).rows[0].n).toBe(0);
      expect((await f.db.sql("select count(*)::int as n from quote_delivery_private.qd_notification_intents")).rows[0].n).toBe(0);
      await zeroAttempts(f);
      await f.db.sql(replacement.drop + replacement.original);
      expect(await ready()).toBe(true);
    }
  } finally { await f.close(); }
}, 180_000);

pg16It("private native quote fence defeats exported old desk.dispatch without shared worker or a public shadow", async () => {
  const f = await boot();
  try {
    const t = await tuple(f, "direct-desk"); await f.db.sql(publicationSQL, publication(t)); await save(f, t);
    await f.db.sql("create table public.qd_notification_intents(shadow text)");
    const tenant = "owned-staging", quoteId = "owned-quote", target = "owned-target", seller = "owned-seller", lineId = "owned-line", evidence = "owned:approved:line";
    const tagKey = Buffer.alloc(32, 7), tag = (purpose: string, value: unknown) => createHmac("sha256", tagKey).update(JSON.stringify([purpose, value])).digest("hex");
    const source = t.detail.lines[0];
    const binding = tag("clearance", [JSON.stringify([lineId, evidence, source.productId, source.variantId, source.sourceVariantId, source.quantity,
      source.catalogVersion, source.workflowMode, source.clinicalReviewRequired, source.researchUseOnly])]);
    const email = "fixture@example.invalid", contactTag = tag("contact", [email, "owned-revision"]);
    await f.db.sql("insert into quote_delivery_private.qd_directory values($1,$2,$3,$4)", [tenant, target, t.detail.requestId, seller]);
    await f.db.sql(`insert into quote_delivery_private.qd_quotes values($1,$2,$3,$4,$5,1,'issued',$6)`,
      [tenant, quoteId, target, t.detail.requestId, seller, JSON.stringify({ quoteId, requestId: target, validUntil: new Date(Date.now() + 60_000).toISOString(), lines: [{ lineId }] })]);
    const insert = "insert into quote_delivery_private.qd_notification_intents(tenant,id,xri_id,contact_tag,bindings_tag,issuer,state) values($1,$2,$3,$4,$5,'owned-issuer',$6) returning *";
    expect((await f.db.sql(insert, [tenant, quoteId, t.detail.requestId, contactTag, binding, "attempting"])).rows).toEqual([]);
    const [intent] = (await f.db.sql(insert, [tenant, quoteId, t.detail.requestId, contactTag, binding, "queued"])).rows;
    expect(intent.mail_disposition).toBe("fixture_no_mail");
    const modulePath = new URL("../quote/delivery/workflow.mjs", import.meta.url).href;
    const { makePrivateQuoteDesk } = await import(modulePath);
    let calls = 0;
    const ctx = { tenant, intent: { ...t.detail }, target: { requestId: target, sellerId: seller },
      binding: { requestId: target, publicReference: t.detail.publicReference, earlyAccessSessionHash: "owned-session" }, currentStanding: true,
      bindings: [{ issueLineId: lineId, approvalEvidenceId: evidence, source }],
      contact: { verified: true, deliveryAllowed: true, requestId: t.detail.requestId, revision: "owned-revision", email }, dispatchAuthorized: true };
    let activeContext = ctx;
    const desk = makePrivateQuoteDesk({ tagKey, Engine: class {}, bind: () => [{ requestLineId: lineId }], authority: { forDispatch: async () => activeContext },
      transport: { ready: () => true, send: async () => { calls++; return "owned-provider-id"; } },
      transact: async (_tenant: string, _id: string, work: (q: (s: string, a?: unknown[]) => Promise<Record<string, unknown>[]>) => Promise<unknown>) => {
        const c = await begin(f.pool, "postgres");
        try { await c.query("set local search_path=quote_delivery_private,pg_catalog");
          const r = await work(async (sql, args = []) => (await c.query(sql, args)).rows); await c.query("commit"); return r;
        } catch (e) { await c.query("rollback"); throw e; } finally { c.release(); }
      } });
    await expect(desk.dispatch(tenant, t.detail.requestId, quoteId)).rejects.toThrow();
    expect(calls).toBe(0);
    expect((await f.db.sql("select * from quote_delivery_private.qd_notification_intents where tenant=$1 and id=$2", [tenant, quoteId])).rows[0]).toEqual(intent);
    await expect(f.db.sql("update quote_delivery_private.qd_notification_intents set mail_disposition='ordinary',fixture_control_id=null,fixture_request_id=null where tenant=$1 and id=$2", [tenant, quoteId]))
      .rejects.toMatchObject({ code: "42501" });
    expect((await f.db.sql("select count(*)::int as n from public.qd_notification_intents")).rows[0].n).toBe(0);
    // Positive control uses the SAME real exported desk/SQL path, valid binding
    // bytes and network counter. A broken authority/tag fixture cannot fake the
    // preceding zero-send result: this ordinary neighbor must actually dispatch.
    const ordinary = await tuple(f, "direct-desk-ordinary"); await save(f, ordinary);
    const ordinaryQuote = "owned-ordinary-quote", ordinaryTarget = "owned-ordinary-target";
    await f.db.sql("insert into quote_delivery_private.qd_directory values($1,$2,$3,$4)", [tenant, ordinaryTarget, ordinary.detail.requestId, seller]);
    await f.db.sql("insert into quote_delivery_private.qd_quotes values($1,$2,$3,$4,$5,1,'issued',$6)",
      [tenant, ordinaryQuote, ordinaryTarget, ordinary.detail.requestId, seller, JSON.stringify({ quoteId: ordinaryQuote, requestId: ordinaryTarget,
        validUntil: new Date(Date.now() + 60_000).toISOString(), lines: [{ lineId }] })]);
    await f.db.sql(insert, [tenant, ordinaryQuote, ordinary.detail.requestId, contactTag, binding, "queued"]);
    activeContext = { ...ctx, intent: ordinary.detail, target: { requestId: ordinaryTarget, sellerId: seller },
      binding: { ...ctx.binding, requestId: ordinaryTarget, publicReference: ordinary.detail.publicReference },
      contact: { ...ctx.contact, requestId: ordinary.detail.requestId } };
    expect(await desk.dispatch(tenant, ordinary.detail.requestId, ordinaryQuote)).toBe("accepted");
    expect(calls).toBe(1);
    await zeroAttempts(f);
  } finally { await f.close(); }
}, 180_000);

pg16It("keeps the actual194612 receipt successor and genuine ordinary attempt/acceptance/bounce/conflict facts while fixture graph is closed", async () => {
  const f = await boot();
  try {
    const t = await tuple(f, "ordinary-evidence"); await save(f, t);
    const event = (await f.db.sql(`select event_id from ${S}.workflow_notice_intents where request_id=$1`, [t.detail.requestId])).rows[0].event_id as string;
    const key = "ea-request-customer-" + event, message = randomUUID();
    const word = async () => (await f.db.sql(`select ${S}.workflow_customer_notice($1,$2) as w`, [t.detail.requestId, event])).rows[0].w;
    expect(await word()).toBe("pending");
    const job = (await f.db.sql("update public.research_notification_outbox set status='processing',last_attempt_at=clock_timestamp() where event_key=$1 returning *", [key])).rows[0];
    expect(job.mail_disposition).toBe("ordinary");
    expect((await f.db.sql("insert into public.research_notification_attempts(outbox_id,attempt,outcome) values($1,1,'sent') returning id", [job.id])).rowCount).toBe(1);
    await f.db.sql("update public.research_notification_outbox set status='sent',provider_message_id=$2 where event_key=$1", [key, message]);
    const record = (name: string, kind: string) => f.db.asRole("service_role", "select public.request_intent_customer_notice_receipt_record($1,$2::uuid,$3,$4)", [name, message, kind, hash(name)]);
    expect(await word()).toBe("provider_accepted"); await record("owned-accepted", "accepted"); expect(await word()).toBe("provider_accepted");
    await record("owned-bounced", "bounced"); expect(await word()).toBe("failed");
    await record("owned-delivered", "delivered"); expect(await word()).toBe("delivery_unknown");
    const delivered = await tuple(f, "ordinary-delivered"); await save(f, delivered);
    const deliveredEvent = (await f.db.sql(`select event_id from ${S}.workflow_notice_intents where request_id=$1`, [delivered.detail.requestId])).rows[0].event_id as string;
    const deliveredMessage = randomUUID();
    // Receipt before the worker stores its message id must become attributable
    // on the next read, without retrying or rewriting a sent job.
    await f.db.asRole("service_role", "select public.request_intent_customer_notice_receipt_record($1,$2::uuid,'delivered',$3)",
      ["owned-early-receipt", deliveredMessage, hash("early")]);
    await f.db.sql("update public.research_notification_outbox set status='sent',provider_message_id=$2 where event_key=$1",
      ["ea-request-customer-" + deliveredEvent, deliveredMessage]);
    expect((await f.db.sql(`select ${S}.workflow_customer_notice($1,$2) as w`, [delivered.detail.requestId, deliveredEvent])).rows[0].w).toBe("delivered_to_server");
    expect((await f.db.sql("select status from public.research_notification_outbox where id=$1", [job.id])).rows[0].status).toBe("sent");
    await expect(record("owned-accepted", "delivered")).rejects.toMatchObject({ code: "23505" });
    expect((await record("owned-accepted", "accepted")).rows[0].request_intent_customer_notice_receipt_record).toBe("replayed");
    await expect(f.db.sql(publicationSQL, publication(t))).rejects.toMatchObject({ code: "55000" });
    expect((await f.db.sql("select count(*)::int as n from public.research_notification_attempts where outbox_id=$1", [job.id])).rows[0].n).toBe(1);
    const other = await tuple(f, "drift-publication");
    await f.db.sql("alter table public.research_notification_attempts disable trigger fixture_attempt_fence");
    expect((await f.db.asRole("service_role", "select public.request_intent_fixture_mail_guard_status() as s")).rows[0].s.ready).toBe(false);
    await expect(f.db.sql(publicationSQL, publication(other))).rejects.toMatchObject({ code: "55000" });
    await expect(f.db.sql(readFileSync(CANDIDATE, "utf8"))).rejects.toMatchObject({ code: "55000" });
  } finally { await f.close(); }
}, 180_000);

pg16It("binds actual admission expiry/revision and rejects an expired unused tuple without ordinary fallback or a replacement control", async () => {
  const f = await boot();
  try {
    const t = await tuple(f, "expiry-and-revision", true);
    const metaArgs = [t.owner, t.attempt, t.fingerprint, JSON.stringify({ lines: t.detail.lines, agreements: t.detail.agreements }),
      JSON.stringify(t.key), randomUUID(), t.metadata.expiresAt];
    await expect(f.db.asRole("service_role", metadataSQL, metaArgs)).rejects.toMatchObject({ code: "55000" });
    const bad = publication(t); bad[10] = t.metadata.expiresAt; // TTL/deadline is NOT actual admission expiry
    await expect(f.db.sql(publicationSQL, bad)).rejects.toMatchObject({ code: "55000" });
    const until = (await f.db.sql("select to_char((clock_timestamp()+interval '2 seconds') at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') as t")).rows[0].t as string;
    const args = publication(t); args[8] = until;
    await f.db.sql(publicationSQL, args);
    // Bounded owned-clock expiry case, not a race synchronizer or widened runtime deadline.
    await f.db.sql("select pg_sleep(2.1)");
    await expect(save(f, t)).rejects.toMatchObject({ code: "55000" });
    expect((await f.db.sql(`select count(*)::int as n from ${S}.requests where owner_hash=$1 and attempt_hash=$2`, [t.owner, t.attempt])).rows[0].n).toBe(0);
    const replacement = [...args]; replacement[0] = randomUUID();
    await expect(f.db.sql(publicationSQL, replacement)).rejects.toMatchObject({ code: "23505" });
    expect((await f.db.sql("select count(*)::int as n from public.research_notification_outbox")).rows[0].n).toBe(0);
    await zeroAttempts(f);
  } finally { await f.close(); }
}, 180_000);
