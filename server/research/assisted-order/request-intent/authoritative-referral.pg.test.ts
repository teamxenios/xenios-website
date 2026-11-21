/** Source-authored owned-PG qualification. No managed URL/credential accepted.
 * Exact existing complete canonical prerequisite fixture and PG17 selectors.
 * Synthetic actors/approvals below are not operational identity/consent facts.
 * No provider/worker/ledger/payment path runs. All cases remain UNRUN until
 * Root allocates hosted qualification of the composed source. */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Pool, PoolClient } from "pg";
import type { RequestIntentDetail } from "../../../../shared/research/assisted-order/request-intent";
import { sha256AssistedOrderHasher } from "../defaults";
import { submission } from "./durable-journey.pg.fixture";
import { createReferralInstallerFixture, pinnedSql, selectReferralInstallerImage } from "../../referral-readiness/canonical-prerequisites.pg.fixture";

const image = selectReferralInstallerImage(process.env), pgIt = image ? it : it.skip;
const S = "request_intent_private", CANDIDATE = "supabase/candidates/request_intent_authoritative_referral.sql";
const PIN_SUCCESSOR = "supabase/candidates/request_intent_fixture_referral_pins.sql";
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
type Fixture = { db: Db; pool: Pool; prototype: RequestIntentDetail; close(): Promise<void> };
type RecordInput = { owner: string; attempt: string; fingerprint: string; detail: RequestIntentDetail; source?: unknown };
type Writer = "base" | "context" | "referral";
const kinds = ["base", "context", "referral"] as const;

async function boot(v1 = true, bridge = true): Promise<Fixture> {
  if (!image) throw new Error("An exact existing owned PostgreSQL selector is required");
  const db = createReferralInstallerFixture();
  let pool: Pool | undefined;
  try {
    await db.start(image); await db.bootstrapCanonicalCore(); await db.bootstrapRemaining();
    if (v1) await db.installChain();
    const { app } = db.application(db.adapter().client);
    expect((await db.post(app, "", submission(), "a")).status).toBe(200);
    const [seed] = await db.snapshot();
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
    const password = randomUUID();
    await db.sql(`create role xri_referral_test_backend login superuser password '${password}'`);
    pool = db.poolForLogin("xri_referral_test_backend", password);
    if (bridge) await db.sql(readFileSync(CANDIDATE, "utf8"));
    return { db, pool, prototype: { requestId: seed.id, publicReference: seed.public_reference,
      kind: "unapproved_selection_request", status: "pending_review", createdAt: new Date().toISOString(),
      contact: seed.contact, agreements: seed.agreements, lines: seed.lines },
      async close() { await pool!.end(); await db.close(); } };
  } catch (error) { if (pool) await pool.end(); await db.close(); throw error; }
}
function record(f: Fixture, source?: unknown, owner = hash(randomUUID())): RecordInput {
  const id = randomUUID();
  return { owner, attempt: hash(randomUUID()), fingerprint: hash(randomUUID()), source,
    detail: { ...f.prototype, requestId: id, publicReference: "XRI-" + id.replaceAll("-", "").toUpperCase() } };
}
function query(r: RecordInput, kind: Writer = "base"): [string, unknown[]] {
  const detail = { ...r.detail, ...(r.source === undefined ? {} : { _serverReferral: r.source }) };
  const args: unknown[] = [r.owner, r.attempt, r.fingerprint, JSON.stringify(detail)];
  if (kind === "base") return ["select public.request_intent_create_or_replay($1,$2,$3,$4::jsonb) as r", args];
  if (kind === "context") return ["select public.request_intent_create_with_context($1,$2,$3,$4::jsonb,'{\"goal\":\"compare_options\"}') as r", args];
  return ["select public.request_intent_create_with_referral($1,$2,$3,$4::jsonb,'{\"referralChoice\":{\"mode\":\"omit\"}}',null) as r", args];
}
async function save(f: Fixture, r: RecordInput, kind: Writer = "base") { const [sql, args] = query(r, kind); return f.db.asRole("service_role", sql, args); }
async function snapshot(f: Fixture, r: RecordInput) {
  return (await f.db.sql(`select authoritative_referral_snapshot as s from ${S}.requests where owner_hash=$1 and attempt_hash=$2`, [r.owner, r.attempt])).rows[0]?.s;
}
async function counts(f: Fixture) {
  return (await f.db.sql(`select (select count(*) from ${S}.requests)::int as r,(select count(*) from ${S}.workflow_events)::int as w,
    (select count(*) from ${S}.access_events)::int as a,(select count(*) from public.research_notification_outbox)::int as o,
    (select count(*) from public.research_notification_attempts)::int as attempts`)).rows[0];
}
async function v1(f: Fixture, op: string, input: object) {
  const value = (await f.db.asRole("service_role", "select public.research_referral_v1_execute($1,$2::jsonb) as r", [op, JSON.stringify(input)])).rows[0].r;
  expect(value.ok).toBe(true); if (!value.ok) throw new Error("Owned V1 operation refused"); return value.value;
}
async function member(f: Fixture) {
  const actor = randomUUID(), id = randomUUID(), application = randomUUID(), email = randomUUID() + "@example.invalid";
  await f.db.sql("insert into auth.users(id,email,email_confirmed_at) values($1,$2,clock_timestamp())", [actor, email]);
  await f.db.sql("insert into public.research_applications(id,email,first_name,last_name,country) values($1,$2,'Synthetic','Fixture','US')", [application, email]);
  await f.db.sql("insert into public.research_members(id,application_id,auth_user_id,email,first_name,status) values($1,$2,$3,$4,'Synthetic','active')", [id, application, actor, email]);
  return { actor, id, owner: sha256AssistedOrderHasher.stableHash(["request-intent-owner", "member", actor]) };
}
async function captured(f: Fixture) {
  const m = await member(f), partner = randomUUID();
  await f.db.sql(`insert into public.research_partners(id,member_id,role,state,legal_name,contact_email,identity_verified,tax_status,payout_status,
    certified_at,certified_by_admin_id,activated_at,activated_by_admin_id)
    values($1,$2,'affiliate','active','Synthetic Owned Fixture','partner@example.invalid',true,'verified','verified',clock_timestamp(),
    'synthetic-owned-admin',clock_timestamp(),'synthetic-owned-admin')`, [partner, m.id]);
  const token = hash(randomUUID()), subject = hash(randomUUID());
  const issued = await v1(f, "issue", { actorAuthUserId: m.actor, idempotencyKey: randomUUID(), linkId: randomUUID(),
    tokenHashHex: token, tokenKeyVersion: 1, destinationPath: "/health", expiresInDays: 30 });
  const result = await v1(f, "capture", { tokenHashHex: token, subjectKeyHash: subject });
  const ms = Number((await f.db.sql("select floor(extract(epoch from clock_timestamp())*1000)+60000 as ms")).rows[0].ms);
  return { actor: m.actor, partner, link: issued.link.id as string, touch: result.touch.touchId as string, subject,
    source: { kind: "guest_touch", touchId: result.touch.touchId as string, subjectKeyHash: subject, claimExpiresAt: ms } };
}
async function begin(f: Fixture, role: "postgres" | "service_role" = "service_role") {
  const c = await f.pool.connect(); await c.query("begin"); await c.query("set local role " + role);
  await c.query("set local statement_timeout='8s'"); return c;
}
async function waitAdvisory(f: Fixture, pid: number) {
  for (let i = 0; i < 100; i++) {
    if ((await f.db.sql("select exists(select 1 from pg_locks where pid=$1 and locktype='advisory' and not granted) as waiting", [pid])).rows[0].waiting) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error("Owned backend did not reach its expected native advisory lock");
}
async function finish(a: PoolClient, b: PoolClient) { await a.query("rollback"); await b.query("rollback"); a.release(); b.release(); }
async function armOwnedNoMail(f: Fixture, r: RecordInput) {
  const key = { ownerBinding: hash(randomUUID()), policyRevision: hash(randomUUID()) };
  await f.db.sql(`insert into ${S}.catalog_contact_admission(owner_binding,policy_revision,full_legal_name,email,expires_at,postal_address)
    values($1,$2,'Synthetic Owned Fixture','fixture@example.invalid',clock_timestamp()+interval '30 minutes',$3::jsonb)`,
  [key.ownerBinding, key.policyRevision, JSON.stringify(r.detail.contact.shippingAddress)]);
  const until = (await f.db.sql("select to_char((clock_timestamp()+interval '10 minutes') at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') as t")).rows[0].t;
  const metadata = (await f.db.asRole("service_role", "select public.request_intent_fixture_prepare_metadata($1,$2,$3,$4::jsonb,$5::jsonb,null,$6::timestamptz) as m",
    [r.owner, r.attempt, r.fingerprint, JSON.stringify({ lines: r.detail.lines, agreements: r.detail.agreements }), JSON.stringify(key), until])).rows[0].m;
  const args = [randomUUID(), r.owner, r.attempt, r.fingerprint, metadata.snapshotSha256, "owned:synthetic:approval", hash("owned-only"),
    metadata.issuedAt, metadata.expiresAt, JSON.stringify(key), metadata.admissionExpiresAt];
  await publishOwnedNoMail(f, args);
  return args;
}
async function publishOwnedNoMail(f: Fixture, args: unknown[]) {
  return f.db.sql(`select ${S}.fixture_no_mail_publish($1::uuid,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9::timestamptz,$10::jsonb,$11::timestamptz,null)`, args);
}
async function guardStatus(f: Fixture) {
  return (await f.db.asRole("service_role", "select public.request_intent_fixture_mail_guard_status() as s")).rows[0].s;
}
async function applyPinSuccessor(f: Fixture) {
  // The candidate contains its own transaction. A failed postflight must be
  // rolled back on THIS connection before it is returned to the owned pool.
  const c = await f.pool.connect();
  try {
    await c.query("set role postgres");
    try { await c.query(readFileSync(PIN_SUCCESSOR, "utf8")); }
    catch (error) { await c.query("rollback"); throw error; }
  } finally { await c.query("reset role"); c.release(); }
}
async function pinConservation(f: Fixture) {
  const catalog = (await f.db.sql(`select jsonb_build_object(
    'functions',(select jsonb_agg(jsonb_build_array(n.nspname,p.proname,p.oid,p.proowner,p.prosecdef,p.provolatile,p.prokind,p.proretset,
      p.proconfig,p.proargnames,p.pronargdefaults,pg_get_function_identity_arguments(p.oid),pg_get_function_result(p.oid),
      (select jsonb_agg(jsonb_build_array(a.grantor,a.grantee,a.privilege_type,a.is_grantable)
        order by a.grantor,a.grantee,a.privilege_type,a.is_grantable) from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a),
      case when p.oid=to_regprocedure('public.request_intent_fixture_mail_guard_status()') then null else pg_get_functiondef(p.oid) end)
      order by n.nspname,p.proname,p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('public','request_intent_private','quote_delivery_private')),
    'relations',(select jsonb_agg(jsonb_build_array(n.nspname,c.relname,c.relkind,c.relowner,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text)
      order by n.nspname,c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('public','request_intent_private','quote_delivery_private')),
    'columns',(select jsonb_agg(jsonb_build_array(a.attrelid,a.attnum,a.attname,a.atttypid,a.atttypmod,a.attnotnull,a.attisdropped,
      a.attidentity,a.attgenerated,a.attacl::text,pg_get_expr(d.adbin,d.adrelid)) order by a.attrelid,a.attnum)
      from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
      left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
      where a.attnum>0 and n.nspname in ('public','request_intent_private','quote_delivery_private')),
    'constraints',(select jsonb_agg(jsonb_build_array(c.conrelid,c.conname,c.contype,c.convalidated,c.connoinherit,pg_get_constraintdef(c.oid))
      order by c.conrelid,c.conname) from pg_constraint c join pg_class r on r.oid=c.conrelid join pg_namespace n on n.oid=r.relnamespace
      where n.nspname in ('public','request_intent_private','quote_delivery_private')),
    'triggers',(select jsonb_agg(jsonb_build_array(t.tgrelid,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid)) order by t.tgrelid,t.tgname)
      from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
      where not t.tgisinternal and n.nspname in ('public','request_intent_private','quote_delivery_private')),
    'policies',(select jsonb_agg(jsonb_build_array(p.polrelid,p.polname,p.polcmd,p.polpermissive,p.polroles,pg_get_expr(p.polqual,p.polrelid),
      pg_get_expr(p.polwithcheck,p.polrelid)) order by p.polrelid,p.polname)
      from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('public','request_intent_private','quote_delivery_private')),
    'defaults',(select jsonb_agg(jsonb_build_array(defaclrole,defaclnamespace,defaclobjtype,defaclacl::text)
      order by defaclrole,defaclnamespace,defaclobjtype) from pg_default_acl)) as s`)).rows[0].s;
  const relations = ["requests", "workflow_settings", "workflow_events", "workflow_staff_intents", "workflow_notice_intents", "workflow_notice_receipts",
    "access_events", "request_policy_snapshots", "policy_bundles", "policy_capture_publications", "catalog_contact_admission",
    "catalog_referral_admission", "optional_context", "reported_referral_snapshots"].map(name => `${S}.${name}`)
    .concat(["public.research_notification_outbox", "public.research_notification_attempts", "quote_delivery_private.qd_notification_intents"]);
  const rows: Array<[string, unknown]> = [];
  for (const relation of relations) rows.push([relation,
    (await f.db.sql(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) as r from ${relation} t`)).rows[0].r]);
  return { catalog, rows };
}
async function selectedRefusesWithoutEffects(f: Fixture, r: RecordInput, publication: unknown[]) {
  expect(await guardStatus(f)).toEqual({ protocol: "request-intent/fixture-no-mail/v1", ready: false });
  const before = await pinConservation(f);
  await expect(publishOwnedNoMail(f, publication)).rejects.toMatchObject({ code: "55000", message: "fixture_guard_unavailable" });
  for (const kind of kinds) await expect(save(f, r, kind)).rejects.toMatchObject({ code: "55000", message: "fixture_guard_unavailable" });
  expect(await pinConservation(f)).toEqual(before);
}

describe.sequential("native authoritative XRI referral birth contract", () => {
  pgIt("preserves bridge-OFF old-schema saves; V1 absence compiles and means unavailable, with historical NULL and omitted new births distinct", async () => {
    const f = await boot(false, false);
    try {
      const legacy = record(f); for (const kind of kinds) await save(f, record(f), kind);
      await save(f, legacy);
      await f.db.sql(readFileSync(CANDIDATE, "utf8"));
      expect(await snapshot(f, legacy)).toBeNull();
      for (const kind of kinds) {
        const omitted = record(f); await save(f, omitted, kind);
        expect(await snapshot(f, omitted)).toMatchObject({ state: "unavailable", reason: "not_requested" });
        const absent = record(f, { kind: "no_supported_touch" }); await save(f, absent, kind);
        expect(await snapshot(f, absent)).toMatchObject({ state: "unavailable", reason: "authority_unavailable" });
      }
      await save(f, { ...legacy, source: { partnerId: randomUUID() } }); // saved replay ignores new locator
      expect(await snapshot(f, legacy)).toBeNull();
    } finally { await f.close(); }
  }, 240_000);

  pgIt("stores real canonical guest provisional facts through4/5/6 exactly once without leaking source or creating V1/economic events", async () => {
    const f = await boot();
    try {
      const c = await captured(f);
      const events = (await f.db.sql("select count(*)::int as n from public.research_partner_referral_events")).rows[0].n;
      for (const kind of kinds) {
        const r = record(f, c.source), reply = (await save(f, r, kind)).rows[0].r;
        expect(Object.keys(reply).sort()).toEqual(["fingerprint", "receipt"]);
        expect(JSON.stringify(reply)).not.toContain("_serverReferral");
        const s = await snapshot(f, r);
        expect(s).toMatchObject({ protocol: "xri-referral/v1", state: "provisional_touch", source: "guest_touch", availability: "ready",
          partnerId: c.partner, linkId: c.link, touchId: c.touch });
        expect(s.decidedAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/);
        expect(JSON.stringify(s)).not.toContain(c.subject);
        const before = await counts(f); await save(f, { ...r, source: { kind: "unavailable", reason: "disabled" } }, kind);
        expect(await snapshot(f, r)).toEqual(s); expect(await counts(f)).toEqual(before);
        await expect(f.db.sql(`update ${S}.requests set authoritative_referral_snapshot=null where id=$1`, [r.detail.requestId]))
          .rejects.toMatchObject({ code: "42501" });
      }
      expect((await f.db.sql("select count(*)::int as n from public.research_partner_referral_events")).rows[0].n).toBe(events);
      expect(await f.db.financialRows()).toEqual(Object.fromEntries(Object.keys(await f.db.financialRows()).map(k => [k, 0])));
      for (const role of ["anon", "authenticated", "service_role"] as const) {
        await expect(f.db.asRole(role, `select ${S}.xri_referral_decide($1,'{}')`, [hash("untrusted")])).rejects.toMatchObject({ code: "42501" });
      }
    } finally { await f.close(); }
  }, 240_000);

  pgIt("retains first-valid account provenance separately from later eligibility/revoke, with owner mismatch and outage-safe exact replay", async () => {
    const f = await boot();
    try {
      const c = await captured(f), buyer = await member(f);
      await v1(f, "bind", { actorAuthUserId: buyer.actor, touchId: c.touch, subjectKeyHash: c.subject });
      const r = record(f, { kind: "account", actorAuthUserId: buyer.actor }, buyer.owner); await save(f, r, "referral");
      const original = await snapshot(f, r);
      expect(original).toMatchObject({ state: "bound_account", source: "capture", partnerId: c.partner, touchId: c.touch, availability: "ready" });
      expect(JSON.stringify(original)).not.toContain(buyer.actor); expect(JSON.stringify(original)).not.toContain("auth:");
      await v1(f, "revoke", { actorAuthUserId: c.actor, linkId: c.link, idempotencyKey: randomUUID() });
      const afterRevoke = record(f, r.source, buyer.owner); await save(f, afterRevoke);
      expect(await snapshot(f, afterRevoke)).toMatchObject({ state: "bound_account", availability: "ready", partnerId: c.partner });
      await f.db.sql("update public.research_partners set state='suspended' where id=$1", [c.partner]);
      const afterSuspend = record(f, r.source, buyer.owner); await save(f, afterSuspend);
      expect(await snapshot(f, afterSuspend)).toMatchObject({ state: "bound_account", availability: "partner_inactive", partnerId: c.partner });
      const wrong = record(f, r.source); await save(f, wrong);
      expect(await snapshot(f, wrong)).toMatchObject({ state: "unavailable", reason: "invalid_source" });
      await f.db.sql("alter function public.research_referral_v1_authority() rename to owned_unavailable_authority");
      for (const kind of kinds) await save(f, r, kind);
      expect(await snapshot(f, r)).toEqual(original);
      const unavailable = record(f, r.source, buyer.owner); await save(f, unavailable);
      expect(await snapshot(f, unavailable)).toMatchObject({ state: "unavailable", reason: "authority_unavailable" });
    } finally { await f.close(); }
  }, 240_000);

  pgIt("rejects supplied decisions/invalid milliseconds, distinguishes known absence and rechecks claim/revoke through canonical helpers", async () => {
    const f = await boot();
    try {
      const c = await captured(f);
      for (const source of [null, { ...c.source, partnerId: c.partner }, { ...c.source, claimExpiresAt: String(c.source.claimExpiresAt) },
        { ...c.source, claimExpiresAt: 1.5 }, { kind: "account", actorAuthUserId: "not-uuid" }]) {
        const r = record(f, source); await save(f, r);
        expect(await snapshot(f, r)).toMatchObject({ state: "unavailable", reason: "invalid_source" });
      }
      const seconds = record(f, { ...c.source, claimExpiresAt: Math.floor(c.source.claimExpiresAt / 1000) }); await save(f, seconds);
      expect(await snapshot(f, seconds)).toMatchObject({ state: "none", reason: "claim_expired", availability: "expired" });
      const none = record(f, { kind: "no_supported_touch" }); await save(f, none);
      expect(await snapshot(f, none)).toMatchObject({ state: "none", reason: "no_supported_touch" });
      await v1(f, "revoke", { actorAuthUserId: c.actor, linkId: c.link, idempotencyKey: randomUUID() });
      const revoked = record(f, c.source); await save(f, revoked);
      expect(await snapshot(f, revoked)).toMatchObject({ state: "none", reason: "link_revoked", availability: "revoked" });
    } finally { await f.close(); }
  }, 240_000);

  pgIt("all4/5/6 wait on real V1 global BEFORE taking any XRI advisory lock and observe a bind that commits first", async () => {
    const f = await boot();
    try {
      for (const kind of kinds) {
        const c = await captured(f), buyer = await member(f), r = record(f, { kind: "account", actorAuthUserId: buyer.actor }, buyer.owner);
        const a = await begin(f, "postgres"), b = await begin(f);
        try {
          await a.query("select pg_advisory_xact_lock(9042026,1)");
          const pid = (await b.query("select pg_backend_pid() as p")).rows[0].p as number;
          const [sql, args] = query(r, kind), pending = b.query(sql, args); await waitAdvisory(f, pid);
          expect((await f.db.sql("select count(*)::int as n from pg_locks where pid=$1 and locktype='advisory' and granted", [pid])).rows[0].n).toBe(0);
          const bound = (await a.query("select public.research_referral_v1_execute('bind',$1::jsonb) as r",
            [JSON.stringify({ actorAuthUserId: buyer.actor, touchId: c.touch, subjectKeyHash: c.subject })])).rows[0].r;
          expect(bound.ok).toBe(true); await a.query("commit"); await pending; await b.query("commit");
        } finally { await finish(a, b); }
        expect(await snapshot(f, r)).toMatchObject({ state: "bound_account", partnerId: c.partner, touchId: c.touch });
      }
    } finally { await f.close(); }
  }, 240_000);

  pgIt("an actual XRI winner fences a later revoke; concurrent same-attempt context cannot backfill the base winner", async () => {
    const f = await boot();
    try {
      const c = await captured(f), r = record(f, c.source), a = await begin(f), b = await begin(f, "postgres");
      try {
        const [sql, args] = query(r); await a.query(sql, args);
        const pid = (await b.query("select pg_backend_pid() as p")).rows[0].p as number;
        const pending = b.query("select public.research_referral_v1_execute('revoke',$1::jsonb) as r",
          [JSON.stringify({ actorAuthUserId: c.actor, linkId: c.link, idempotencyKey: randomUUID() })]);
        await waitAdvisory(f, pid); await a.query("commit"); expect((await pending).rows[0].r.ok).toBe(true); await b.query("commit");
      } finally { await finish(a, b); }
      expect(await snapshot(f, r)).toMatchObject({ state: "provisional_touch", partnerId: c.partner });
      const c2 = await captured(f), race = record(f, c2.source), x = await begin(f), y = await begin(f);
      try {
        const [s1, a1] = query(race, "base"); await x.query(s1, a1);
        const pid = (await y.query("select pg_backend_pid() as p")).rows[0].p as number;
        const [s2, a2] = query({ ...race, source: { kind: "unavailable", reason: "disabled" } }, "context");
        const pending = y.query(s2, a2); await waitAdvisory(f, pid); await x.query("commit");
        expect((await pending).rows[0].r.receipt.requestId).toBe(race.detail.requestId); await y.query("commit");
      } finally { await finish(x, y); }
      expect((await f.db.sql(`select count(*)::int as n from ${S}.optional_context where request_id=$1`, [race.detail.requestId])).rows[0].n).toBe(0);
      expect((await f.db.sql(`select count(*)::int as n from ${S}.access_events where request_id=$1 and event_type='submitted'`, [race.detail.requestId])).rows[0].n).toBe(1);
      expect(await snapshot(f, race)).toMatchObject({ state: "provisional_touch", partnerId: c2.partner });
    } finally { await f.close(); }
  }, 240_000);

  pgIt("a canonical optional-read42P01 becomes unavailable, while policy failure and real global-lock timeout propagate without partial save", async () => {
    const f = await boot();
    try {
      const r = record(f, { kind: "no_supported_touch" });
      await f.db.sql("alter table public.research_members rename to owned_members_unavailable");
      await save(f, r); expect(await snapshot(f, r)).toMatchObject({ state: "unavailable", reason: "authority_unavailable" });
      await f.db.sql("alter table public.owned_members_unavailable rename to research_members");
      const bad = record(f, { kind: "no_supported_touch" });
      bad.detail = { ...bad.detail, agreements: bad.detail.agreements.filter(x => x.kind !== "fixture-terms") };
      const before = await counts(f); await expect(save(f, bad)).rejects.toMatchObject({ code: "55000" });
      expect(await counts(f)).toEqual(before); expect(await snapshot(f, bad)).toBeUndefined();
      const a = await begin(f, "postgres"), b = await begin(f);
      try {
        await a.query("select pg_advisory_xact_lock(9042026,1)"); await b.query("set local lock_timeout='100ms'");
        const [savedSql, savedArgs] = query(r); // actual saved replay ignores the blocked optional authority
        expect((await b.query(savedSql, savedArgs)).rows[0].r.receipt.requestId).toBe(r.detail.requestId);
        const [sql, args] = query(record(f, { kind: "no_supported_touch" }));
        await expect(b.query(sql, args)).rejects.toMatchObject({ code: "55P03" });
      } finally { await finish(a, b); }
      expect(await counts(f)).toEqual(before);
    } finally { await f.close(); }
  }, 240_000);

  pgIt("same proposed UUID under another owner is a real canonical23505, not an attributed successful fallback", async () => {
    const f = await boot();
    try {
      const c = await captured(f), winner = record(f, c.source); await save(f, winner);
      const before = await counts(f), original = await snapshot(f, winner);
      const loser = { ...record(f, c.source), detail: winner.detail };
      await expect(save(f, loser, "referral")).rejects.toMatchObject({ code: "23505" });
      expect(await counts(f)).toEqual(before); expect(await snapshot(f, loser)).toBeUndefined(); expect(await snapshot(f, winner)).toEqual(original);
      expect((await f.db.sql(`select count(*)::int as n from ${S}.reported_referral_snapshots where request_id=$1`, [winner.detail.requestId])).rows[0].n).toBe(0);
      await f.db.sql(readFileSync(CANDIDATE, "utf8")); // exact verify-only source reapply
      expect(await snapshot(f, winner)).toEqual(original);
    } finally { await f.close(); }
  }, 240_000);

  pgIt("future-only native transfer changes later births while retaining original relationship/revision and replay", async () => {
    const f = await boot();
    try {
      const original = await captured(f), target = await captured(f), buyer = await member(f);
      await v1(f, "bind", { actorAuthUserId: buyer.actor, touchId: original.touch, subjectKeyHash: original.subject });
      const r = record(f, { kind: "account", actorAuthUserId: buyer.actor }, buyer.owner); await save(f, r);
      const first = await snapshot(f, r);
      const transferred = await v1(f, "transferBinding", { actorAuthUserId: randomUUID(), accountAuthUserId: buyer.actor,
        expectedRevisionId: original.touch, targetLinkId: target.link, idempotencyKey: randomUUID(),
        reasonCode: "customer_request", authorizationReferenceHash: hash("owned:synthetic:transfer") });
      const later = record(f, r.source, buyer.owner); await save(f, later, "context");
      expect(await snapshot(f, later)).toMatchObject({ state: "bound_account", source: "admin_transfer", partnerId: target.partner,
        linkId: target.link, touchId: original.touch, revisionId: transferred.transfer.id, boundAt: first.boundAt });
      await save(f, r); expect(await snapshot(f, r)).toEqual(first);
    } finally { await f.close(); }
  }, 240_000);

  pgIt("uses exact signed epoch milliseconds after a real global lock wait instead of refreshing or crediting an expired claim", async () => {
    const f = await boot();
    try {
      const c = await captured(f), a = await begin(f, "postgres"), b = await begin(f);
      const ms = Number((await f.db.sql("select floor(extract(epoch from clock_timestamp())*1000)+2000 as ms")).rows[0].ms);
      const r = record(f, { ...c.source, claimExpiresAt: ms });
      try {
        await a.query("select pg_advisory_xact_lock(9042026,1)");
        const pid = (await b.query("select pg_backend_pid() as p")).rows[0].p as number;
        const [sql, args] = query(r, "referral"), pending = b.query(sql, args); await waitAdvisory(f, pid);
        expect((await f.db.sql("select extract(epoch from clock_timestamp())*1000<$1::numeric as live", [ms])).rows[0].live).toBe(true);
        await a.query("select pg_sleep(2.1)"); // owned expiry, not race synchronization
        await a.query("commit"); await pending; await b.query("commit");
      } finally { await finish(a, b); }
      expect(await snapshot(f, r)).toMatchObject({ state: "none", reason: "claim_expired", availability: "expired" });
    } finally { await f.close(); }
  }, 240_000);

  pgIt("never silently repins no-mail definitions: armed new birth refuses, consumed saved replay wins, and retention stays disabled", async () => {
    for (const consumed of [false, true]) {
      const f = await boot(true, false);
      try {
        const r = record(f); await armOwnedNoMail(f, r);
        if (consumed) await save(f, r);
        const before = await counts(f);
        await f.db.sql(readFileSync(CANDIDATE, "utf8"));
        expect((await f.db.asRole("service_role", "select public.request_intent_fixture_mail_guard_status() as s")).rows[0].s.ready).toBe(false);
        for (const kind of kinds) {
          if (consumed) expect((await save(f, { ...r, source: { kind: "no_supported_touch" } }, kind)).rows[0].r.receipt.requestId).toBe(r.detail.requestId);
          else await expect(save(f, { ...r, source: { kind: "no_supported_touch" } }, kind)).rejects.toMatchObject({ code: "55000", message: "fixture_guard_unavailable" });
        }
        expect(await counts(f)).toEqual(before);
        expect((await f.db.sql("select count(*)::int as n from public.research_notification_attempts")).rows[0].n).toBe(0);
        expect((await f.db.sql("select count(*)::int as n from public.research_notification_outbox")).rows[0].n).toBe(0);
        await f.db.sql(readFileSync("supabase/candidates/request_intent_retention_execution.sql", "utf8"));
        expect((await f.db.asRole("service_role", "select public.request_intent_retention_execute($1::uuid,$2::uuid) as r", [r.detail.requestId, randomUUID()])).rows[0].r)
          .toEqual({ status: "blocked", reason: "disabled" });
        expect((await f.db.sql(`select to_regprocedure('${S}.retention_authority_lock_v1(uuid)') is null as absent`)).rows[0].absent).toBe(true);
      } finally { await f.close(); }
    }
  }, 360_000);
});

describe.sequential("pin-only no-mail successor after the native referral bridge", () => {
  pgIt("restores exact guarded4/5/6 births after the deliberate pin mismatch, without requiring optional V1 or touching rows/ACLs", async () => {
    for (const kind of kinds) {
      const f = await boot(false, false);
      try {
        expect(await guardStatus(f)).toEqual({ protocol: "request-intent/fixture-no-mail/v1", ready: true });
        const ordinary = record(f); const ordinaryReceipt = (await save(f, ordinary)).rows[0].r;
        const r = record(f, { kind: "no_supported_touch" }); const publication = await armOwnedNoMail(f, r);
        await f.db.sql(readFileSync(CANDIDATE, "utf8"));
        await selectedRefusesWithoutEffects(f, r, publication);
        const before = await pinConservation(f);
        await applyPinSuccessor(f);
        expect(await guardStatus(f)).toEqual({ protocol: "request-intent/fixture-no-mail/v1", ready: true });
        expect(await pinConservation(f)).toEqual(before); // Only excluded status body may differ.
        expect((await save(f, ordinary)).rows[0].r).toEqual(ordinaryReceipt);
        expect(await snapshot(f, ordinary)).toBeNull();
        await publishOwnedNoMail(f, publication); // Exact one-shot publication replay, no rearm.
        expect((await save(f, r, kind)).rows[0].r.receipt.requestId).toBe(r.detail.requestId);
        const stored = (await f.db.sql(`select authoritative_referral_snapshot,fixture_no_mail_control_id from ${S}.requests where id=$1`, [r.detail.requestId])).rows[0];
        expect(stored.authoritative_referral_snapshot).toMatchObject({ state: "unavailable", reason: "authority_unavailable" });
        expect(stored.fixture_no_mail_control_id).toBe(publication[0]);
        expect((await f.db.sql(`select fixture_control_id,fixture_request_id from ${S}.workflow_settings where singleton`)).rows[0])
          .toEqual({ fixture_control_id: publication[0], fixture_request_id: r.detail.requestId });
        expect((await f.db.sql(`select mail_disposition,fixture_control_id from ${S}.workflow_staff_intents where request_id=$1`, [r.detail.requestId])).rows)
          .toEqual([{ mail_disposition: "fixture_no_mail", fixture_control_id: publication[0] }]);
        const saved = await pinConservation(f);
        for (const writer of kinds) expect((await save(f, { ...r, source: { partnerId: randomUUID() } }, writer)).rows[0].r.receipt.requestId).toBe(r.detail.requestId);
        expect(await pinConservation(f)).toEqual(saved);
        await expect(f.db.sql(`update ${S}.requests set authoritative_referral_snapshot=null where id=$1`, [r.detail.requestId]))
          .rejects.toMatchObject({ code: "42501", message: "request_intent_is_immutable" });
        const fresh = record(f); const freshReceipt = (await save(f, fresh, kind)).rows[0].r;
        expect((await save(f, fresh, kind)).rows[0].r).toEqual(freshReceipt);
        expect((await f.db.sql(`select fixture_no_mail_control_id from ${S}.requests where id=$1`, [fresh.detail.requestId])).rows[0].fixture_no_mail_control_id).toBeNull();
        expect(await snapshot(f, fresh)).toMatchObject({ state: "unavailable", reason: "not_requested" });
        expect((await counts(f)).o).toBe(0); expect((await counts(f)).attempts).toBe(0);
      } finally { await f.close(); }
    }
  }, 480_000);

  pgIt("rolls back a missing bridge, preserves exact idempotence, and refuses an unreviewed status predecessor without repairing it", async () => {
    const f = await boot(false, false);
    const definition = async () => (await f.db.sql("select pg_get_functiondef('public.request_intent_fixture_mail_guard_status()'::regprocedure) as d")).rows[0].d as string;
    try {
      const old = await definition(), baseline = await pinConservation(f);
      await expect(applyPinSuccessor(f)).rejects.toMatchObject({ code: "55000", message: "fixture_referral_pin_prerequisite_unavailable" });
      expect(await definition()).toBe(old); expect(await pinConservation(f)).toEqual(baseline);
      expect((await guardStatus(f)).ready).toBe(true);
      await f.db.sql(readFileSync(CANDIDATE, "utf8")); await applyPinSuccessor(f);
      const successor = await definition(), installed = await pinConservation(f);
      await applyPinSuccessor(f);
      expect(await definition()).toBe(successor); expect(await pinConservation(f)).toEqual(installed);
      const drift = successor.replace("declare item record;", "declare item record; -- owned status-body drift\n");
      expect(drift).not.toBe(successor); await f.db.sql(drift);
      const beforeRefusal = await definition(), beforeRows = await pinConservation(f);
      await expect(applyPinSuccessor(f)).rejects.toMatchObject({ code: "55000", message: "fixture_referral_pin_predecessor_unreviewed" });
      expect(await definition()).toBe(beforeRefusal); expect(await pinConservation(f)).toEqual(beforeRows);
      await f.db.sql(successor); expect((await guardStatus(f)).ready).toBe(true);
    } finally { await f.close(); }
  }, 240_000);

  pgIt("rejects every new delegate/body pin plus ABI/security/execute drift instead of silently binding runtime definitions", async () => {
    const f = await boot(false, false);
    try {
      const r = record(f); const publication = await armOwnedNoMail(f, r);
      await f.db.sql(readFileSync(CANDIDATE, "utf8")); await applyPinSuccessor(f);
      const baseline = await pinConservation(f);
      const signatures = [
        `${S}.xri_referral_time(text)`, `${S}.xri_referral_snapshot_valid(jsonb)`, `${S}.xri_referral_negative(text,text,text,timestamptz)`,
        `${S}.xri_referral_lock(text,text)`, `${S}.xri_referral_authority_state()`, `${S}.xri_referral_decide(text,jsonb)`, `${S}.xri_referral_birth()`,
        `${S}.create_or_replay(text,text,text,jsonb)`, `${S}.create_with_context(text,text,text,jsonb,jsonb)`, `${S}.create_with_referral(text,text,text,jsonb,jsonb,jsonb)`,
        "public.request_intent_create_or_replay(text,text,text,jsonb)", "public.request_intent_create_with_context(text,text,text,jsonb,jsonb)",
        "public.request_intent_create_with_referral(text,text,text,jsonb,jsonb,jsonb)", `${S}.find_attempt(text,text)`, `${S}.deny_mutation()`,
      ];
      for (const signature of signatures) {
        const original = (await f.db.sql("select pg_get_functiondef($1::regprocedure) as d", [signature])).rows[0].d as string;
        const drift = original.replace(/AS\s+(\$[A-Za-z_0-9]*\$)/, (_match, tag: string) => "AS " + tag + "\n-- owned binding drift\n");
        expect(drift).not.toBe(original);
        try {
          await f.db.sql(drift); await selectedRefusesWithoutEffects(f, r, publication);
          await expect(applyPinSuccessor(f)).rejects.toMatchObject({ code: "55000", message: "fixture_referral_pin_prerequisite_unavailable" });
          await selectedRefusesWithoutEffects(f, r, publication);
        } finally { await f.db.sql(original); }
        expect((await guardStatus(f)).ready).toBe(true); expect(await pinConservation(f)).toEqual(baseline);
      }
      const signature = `${S}.xri_referral_decide(text,jsonb)`;
      const original = (await f.db.sql("select pg_get_functiondef($1::regprocedure) as d", [signature])).rows[0].d as string;
      const defaultDrift = original.replace("p_source jsonb)", "p_source jsonb DEFAULT '{}'::jsonb)");
      expect(defaultDrift).not.toBe(original);
      for (const command of [defaultDrift, `alter function ${signature} security invoker`, `alter function ${signature} stable`,
        `grant execute on function ${signature} to service_role`]) {
        try { await f.db.sql(command); await selectedRefusesWithoutEffects(f, r, publication); }
        finally { await f.db.sql(original); await f.db.sql(`revoke execute on function ${signature} from service_role`); }
        expect((await guardStatus(f)).ready).toBe(true); expect(await pinConservation(f)).toEqual(baseline);
      }
    } finally { await f.close(); }
  }, 480_000);

  pgIt("requires both exact unconditional native snapshot guards and the unchanged nullable constrained column", async () => {
    const f = await boot(false, false);
    try {
      const r = record(f); const publication = await armOwnedNoMail(f, r);
      await f.db.sql(readFileSync(CANDIDATE, "utf8")); await applyPinSuccessor(f);
      const baseline = await pinConservation(f);
      for (const [name, fn, event] of [["request_authoritative_referral_birth", "xri_referral_birth", "insert"],
        ["request_intent_immutable", "deny_mutation", "update or delete"]] as const) {
        const original = (await f.db.sql(`select pg_get_triggerdef(oid) as d from pg_trigger where tgrelid='${S}.requests'::regclass and tgname=$1`, [name])).rows[0].d as string;
        const variants = [null,
          `create trigger ${name} before ${event} on ${S}.requests for each row when(false) execute function ${S}.${fn}()`,
          `create trigger ${name} before ${event} on ${S}.requests for each row execute function ${S}.${fn}('owned-argument')`,
          `create trigger ${name} before update of id on ${S}.requests for each row execute function ${S}.${fn}()`,
          `create constraint trigger ${name} after ${event} on ${S}.requests deferrable initially deferred for each row execute function ${S}.${fn}()`];
        for (const variant of variants) {
          try {
            await f.db.sql(`drop trigger ${name} on ${S}.requests`); if (variant) await f.db.sql(variant);
            await selectedRefusesWithoutEffects(f, r, publication);
            await expect(applyPinSuccessor(f)).rejects.toMatchObject({ code: "55000", message: "fixture_referral_pin_prerequisite_unavailable" });
          } finally {
            // Constraint triggers also use DROP TRIGGER; DROP CONSTRAINT is not a valid inverse here.
            await f.db.sql(`drop trigger if exists ${name} on ${S}.requests`); await f.db.sql(original);
          }
          expect((await guardStatus(f)).ready).toBe(true); expect(await pinConservation(f)).toEqual(baseline);
        }
      }
      try {
        await f.db.sql(`alter table ${S}.requests alter column authoritative_referral_snapshot set default '{}'::jsonb`);
        await selectedRefusesWithoutEffects(f, r, publication);
      } finally { await f.db.sql(`alter table ${S}.requests alter column authoritative_referral_snapshot drop default`); }
      expect(await pinConservation(f)).toEqual(baseline);
      try {
        await f.db.sql(`alter table ${S}.requests drop constraint request_authoritative_referral_snapshot_shape;
          alter table ${S}.requests add constraint request_authoritative_referral_snapshot_shape check(true)`);
        await selectedRefusesWithoutEffects(f, r, publication);
      } finally {
        await f.db.sql(`alter table ${S}.requests drop constraint request_authoritative_referral_snapshot_shape;
          alter table ${S}.requests add constraint request_authoritative_referral_snapshot_shape check(${S}.xri_referral_snapshot_valid(authoritative_referral_snapshot))`);
      }
      expect((await guardStatus(f)).ready).toBe(true); expect(await pinConservation(f)).toEqual(baseline);
      expect((await counts(f)).o).toBe(0); expect((await counts(f)).attempts).toBe(0);
    } finally { await f.close(); }
  }, 480_000);
});
