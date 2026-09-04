/** Opt-in REAL PostgreSQL rehearsal. Never accepts a database URL or production host.
 * XENIOS_REFERRAL_V1_DISPOSABLE_PG=1 starts a task-owned fresh database.
 * An unavailable runtime fails the opted-in suite; default runs visibly skip it.
 */
import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseReferralV1Store, type ReferralV1Result, type ReferralV1RpcClient } from "./referral-v1-store";
import { readReferralV1Lineage } from "./referral-v1-lineage";
import { startReferralRehearsalDatabase, referralRehearsalTableDDL as table, type ReferralRehearsalDatabase } from "./referral-v1-rehearsal";

const enabled = process.env.XENIOS_REFERRAL_V1_DISPOSABLE_PG === "1";
const root = process.cwd();
const candidate = readFileSync(path.join(root, "supabase/candidates/20260904_research_partner_referral_v1.sql"), "utf8");
let database: ReferralRehearsalDatabase;
const sql: ReferralRehearsalDatabase["sql"] = (...args) => database.sql(...args);
const connection: ReferralRehearsalDatabase["connection"] = (...args) => database.connection(...args);
const seedPartner: ReferralRehearsalDatabase["seedPartner"] = (...args) => database.seedPartner(...args);
const rpc: ReferralV1RpcClient = { rpc: (...args) => database.rpc.rpc(...args) };
const store = createSupabaseReferralV1Store(rpc);
const hash = () => createHash("sha256").update(randomUUID()).digest("hex");
function value<T>(r: ReferralV1Result<T>): T { expect(r.ok, JSON.stringify(r)).toBe(true); if (!r.ok) throw new Error(r.reason); return r.value; }
async function issue(partner: { actorAuthUserId: string }, extra = {}) {
  const input = { actorAuthUserId: partner.actorAuthUserId, idempotencyKey: randomUUID(), linkId: randomUUID(), tokenHashHex: hash(), tokenKeyVersion: 1, destinationPath: "/health", expiresInDays: 30 as const, ...extra };
  return { input, ...value(await store.issue(input)) };
}

describe.skipIf(!enabled)("Referral V1 disposable PostgreSQL authority", () => {
  beforeAll(async () => {
    database = await startReferralRehearsalDatabase({ includeLineageSources: false, legacyBindingFixture: true });
    expect(value(await store.authority()).schemaVersion).toBe("gen2_referral_v1_20260904");
  }, 120000);

  afterAll(async () => { if (database) await database.stop(); }, 60000);

  it("preserves legacy evidence and refuses blind migration replay", async () => {
    expect((await sql("select referral_version,code from public.research_affiliate_customer_bindings where customer_key='legacy:synthetic'")).rows).toEqual([{ referral_version: null, code: "legacy-code" }]);
    await expect(sql(candidate)).rejects.toThrow(/already exists or drifted/);
  });

  it("resolves Auth UUID through member UUID to canonical partner and denies ineligible issuance", async () => {
    const partner = await seedPartner();
    const issued = await issue(partner);
    expect(issued.link.partnerId).toBe(partner.partnerId);
    expect(issued.link.partnerId).not.toBe(partner.memberId);
    const own = value(await store.listOwn({ actorAuthUserId: partner.actorAuthUserId }));
    expect(own).toMatchObject({ eligible: true, partnerId: partner.partnerId, partnerState: "active" });
    expect(own.links.map((l) => l.id)).toEqual([issued.link.id]);
    expect(value(await store.listOwn({ actorAuthUserId: randomUUID() }))).toEqual({ eligible: false, partnerId: null, partnerState: null, links: [] });
    const inactive = await seedPartner("suspended");
    expect(await store.issue({ ...issued.input, actorAuthUserId: inactive.actorAuthUserId, idempotencyKey: randomUUID(), linkId: randomUUID() })).toEqual({ ok: false, reason: "not_eligible" });
  });

  it("atomically replays concurrent issue with newly generated token candidates; changed intent conflicts", async () => {
    const partner = await seedPartner();
    const input = { actorAuthUserId: partner.actorAuthUserId, idempotencyKey: randomUUID(), tokenKeyVersion: 1, destinationPath: "/care", expiresInDays: 30 as const };
    const results = await Promise.all(Array.from({ length: 8 }, () => store.issue({ ...input, linkId: randomUUID(), tokenHashHex: hash() })));
    const values = results.map(value);
    expect(new Set(values.map((r) => r.link.id)).size).toBe(1);
    expect(values.filter((r) => r.created)).toHaveLength(1);
    expect((await sql("select count(*)::int as n from public.research_partner_referral_events where partner_id=$1", [partner.partnerId])).rows[0].n).toBe(1);
    expect(await store.issue({ ...input, linkId: randomUUID(), tokenHashHex: hash(), destinationPath: "/health" })).toEqual({ ok: false, reason: "idempotency_conflict" });
    // Every transport call opens a new PG connection; a new adapter has no cache.
    const replay = value(await createSupabaseReferralV1Store(rpc).issue({ ...input, linkId: randomUUID(), tokenHashHex: hash() }));
    expect(replay.link.id).toBe(values[0].link.id);
    expect(replay.created).toBe(false);
  });

  it("rolls back link, audit and idempotency together when audit insertion fails; retry recovers", async () => {
    const partner = await seedPartner();
    const input = { actorAuthUserId: partner.actorAuthUserId, idempotencyKey: randomUUID(), linkId: randomUUID(), tokenHashHex: hash(), tokenKeyVersion: 1, destinationPath: "/health", expiresInDays: 30 as const };
    await sql("create function public.test_fail_referral_audit() returns trigger language plpgsql as $$ begin raise exception 'synthetic fault'; end $$; create trigger synthetic_audit_failure before insert on public.research_partner_referral_events for each row execute function public.test_fail_referral_audit()");
    try {
      expect(await store.issue(input)).toEqual({ ok: false, reason: "unavailable" });
      expect((await sql("select count(*)::int n from public.research_partner_links where id=$1", [input.linkId])).rows[0].n).toBe(0);
      expect((await sql("select count(*)::int n from public.research_idempotency_keys where key=$1", [input.idempotencyKey])).rows[0].n).toBe(0);
    } finally { await sql("drop trigger synthetic_audit_failure on public.research_partner_referral_events; drop function public.test_fail_referral_audit()"); }
    expect(value(await store.issue(input)).created).toBe(true);
  });

  it("retains exactly one concurrent first-valid visitor capture and one audit event", async () => {
    const one = await issue(await seedPartner()), two = await issue(await seedPartner());
    const subjectKeyHash = hash();
    const results = (await Promise.all(Array.from({ length: 8 }, (_, i) => store.capture({ tokenHashHex: i % 2 ? one.input.tokenHashHex : two.input.tokenHashHex, subjectKeyHash })))).map(value);
    expect(new Set(results.map((r) => r.touch.touchId)).size).toBe(1);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect((await sql("select count(*)::int n from public.research_partner_referral_events where touch_id=$1", [results[0].touch.touchId])).rows[0].n).toBe(1);
    const winner = results[0].touch.linkId === one.link.id ? one : two;
    await store.revoke({ actorAuthUserId: winner.input.actorAuthUserId, idempotencyKey: randomUUID(), linkId: winner.link.id });
    const other = winner === one ? two : one;
    const retained = value(await store.capture({ tokenHashHex: other.input.tokenHashHex, subjectKeyHash }));
    expect(retained).toMatchObject({ created: false, availability: "revoked", touch: { touchId: results[0].touch.touchId } });
    expect(await store.capture({ tokenHashHex: winner.input.tokenHashHex, subjectKeyHash: hash() })).toEqual({ ok: false, reason: "invalid_link" });
  });

  it("binds once per Auth account and per capture across retries/concurrent devices", async () => {
    const first = await issue(await seedPartner()), second = await issue(await seedPartner());
    const s1 = hash(), s2 = hash();
    const t1 = value(await store.capture({ tokenHashHex: first.input.tokenHashHex, subjectKeyHash: s1 })).touch;
    const t2 = value(await store.capture({ tokenHashHex: second.input.tokenHashHex, subjectKeyHash: s2 })).touch;
    const { actorAuthUserId } = await seedPartner();
    const bound = (await Promise.all(Array.from({ length: 8 }, (_, i) => store.bind({ actorAuthUserId, touchId: i % 2 ? t1.touchId : t2.touchId, subjectKeyHash: i % 2 ? s1 : s2 })))).map(value);
    expect(bound.filter((r) => r.created)).toHaveLength(1);
    expect(new Set(bound.map((r) => r.binding?.touchId)).size).toBe(1);
    const winner = bound[0].binding!;
    const subjectKeyHash = winner.touchId === t1.touchId ? s1 : s2;
    expect(await store.bind({ actorAuthUserId: (await seedPartner()).actorAuthUserId, touchId: winner.touchId, subjectKeyHash })).toEqual({ ok: false, reason: "capture_claimed" });
    expect(value(await store.getBinding({ actorAuthUserId })).binding).toEqual(winner);
    expect((await sql("select count(*)::int n from public.research_partner_referral_events where event_type='account_bound' and actor_auth_user_id=$1", [actorAuthUserId])).rows[0].n).toBe(1);
    const winningLink = winner.linkId === first.link.id ? first : second;
    await store.revoke({ actorAuthUserId: winningLink.input.actorAuthUserId, idempotencyKey: randomUUID(), linkId: winner.linkId });
    expect(value(await store.getBinding({ actorAuthUserId })).availability).toBe("revoked");
    expect(value(await store.getBinding({ actorAuthUserId })).binding).toEqual(winner);
  });

  it("rejects self referral at signed capture and at later Auth binding", async () => {
    const partner = await seedPartner(), issued = await issue(partner), subjectKeyHash = hash();
    expect(await store.capture({ tokenHashHex: issued.input.tokenHashHex, subjectKeyHash, actorAuthUserId: partner.actorAuthUserId })).toEqual({ ok: false, reason: "self_referral" });
    const touch = value(await store.capture({ tokenHashHex: issued.input.tokenHashHex, subjectKeyHash })).touch;
    expect(await store.bind({ actorAuthUserId: partner.actorAuthUserId, touchId: touch.touchId, subjectKeyHash })).toEqual({ ok: false, reason: "self_referral" });
    expect(value(await store.getBinding({ actorAuthUserId: partner.actorAuthUserId })).binding).toBeNull();
  });

  it("rejects forged provenance, unregistered links and wrong ownership", async () => {
    const partner = await seedPartner(), issued = await issue(partner);
    expect(await store.resolve({ tokenHashHex: hash() })).toEqual({ ok: false, reason: "invalid_link" });
    const other = await seedPartner();
    expect(await store.revoke({ actorAuthUserId: other.actorAuthUserId, idempotencyKey: randomUUID(), linkId: issued.link.id })).toEqual({ ok: false, reason: "not_found" });
    expect(await store.bind({ actorAuthUserId: other.actorAuthUserId, touchId: randomUUID(), subjectKeyHash: hash() })).toEqual({ ok: false, reason: "capture_missing" });
  });

  it("refuses expired capture and historical expired-touch binding without new evidence", async () => {
    const partner = await seedPartner(), recipient = await seedPartner();
    const alternate = await issue(partner);
    const expiredId = randomUUID(), expiredHash = hash(), expiredTouchId = randomUUID();
    const historicalSubject = hash(), freshSubject = hash();
    // Honest synthetic history in this fresh disposable database only: a link
    // issued 60 days ago, captured while valid, then expired 30 days ago. These
    // are fixture INSERTs by the database owner, not claims of time-elapsed E2E.
    // All candidate constraints/immutable guards stay enabled; no clock changes.
    await sql("insert into public.research_partner_links(id,partner_id,code,channel,created_at,referral_version,token_hash_hex,token_key_version,destination_path,expires_at) values($1::uuid,$2,$1::uuid::text,'signed_link',now()-interval '60 days',1,$3,1,'/health',now()-interval '30 days')", [expiredId, partner.partnerId, expiredHash]);
    await sql("insert into public.research_attribution_touches(id,subject_key,partner_id,channel,occurred_at,referral_version,referral_link_id,referral_expires_at) select $1,$2,partner_id,'signed_link',created_at+interval '1 day',1,id,expires_at from public.research_partner_links where id=$3", [expiredTouchId, historicalSubject, expiredId]);
    await sql("insert into public.research_partner_referral_events(event_type,partner_id,link_id,touch_id,occurred_at) select 'capture_recorded',partner_id,referral_link_id,id,occurred_at from public.research_attribution_touches where id=$1", [expiredTouchId]);
    const evidenceCounts = async () => (await sql("select (select count(*)::int from public.research_attribution_touches) touches,(select count(*)::int from public.research_affiliate_customer_bindings) bindings,(select count(*)::int from public.research_partner_referral_events) events")).rows[0];
    const before = await evidenceCounts();

    expect(await store.resolve({ tokenHashHex: expiredHash })).toEqual({ ok: false, reason: "invalid_link" });
    expect(value(await store.listOwn({ actorAuthUserId: partner.actorAuthUserId })).links.find((l) => l.id === expiredId)?.availability).toBe("expired");
    expect(await store.capture({ tokenHashHex: expiredHash, subjectKeyHash: freshSubject })).toEqual({ ok: false, reason: "invalid_link" });
    expect(await store.capture({ tokenHashHex: expiredHash, subjectKeyHash: historicalSubject })).toEqual({ ok: false, reason: "invalid_link" });
    // A later valid incoming link retains the historical first winner as
    // ineligible; it must neither replace the touch nor make it bindable.
    expect(value(await store.capture({ tokenHashHex: alternate.input.tokenHashHex, subjectKeyHash: historicalSubject })))
      .toMatchObject({ created: false, availability: "expired", touch: { touchId: expiredTouchId, linkId: expiredId } });
    for (let attempt = 0; attempt < 2; attempt++) {
      expect(await store.bind({ actorAuthUserId: recipient.actorAuthUserId, touchId: expiredTouchId, subjectKeyHash: historicalSubject }))
        .toEqual({ ok: false, reason: "invalid_link" });
    }
    expect(value(await store.getBinding({ actorAuthUserId: recipient.actorAuthUserId })))
      .toEqual({ binding: null, created: false, availability: "none" });
    expect((await sql("select count(*)::int n from public.research_attribution_touches where subject_key=$1", [freshSubject])).rows[0].n).toBe(0);
    expect(await evidenceCounts()).toEqual(before);
  });

  it("waits for an external suspension row lock and refuses a stale eligibility decision", async () => {
    const partner = await seedPartner(), issued = await issue(partner);
    const external = await connection();
    try {
      await external.query("begin");
      await external.query("update public.research_partners set state='suspended' where id=$1", [partner.partnerId]);
      const pending = store.capture({ tokenHashHex: issued.input.tokenHashHex, subjectKeyHash: hash() });
      await new Promise((resolve) => setTimeout(resolve, 75));
      await external.query("commit");
      expect(await pending).toEqual({ ok: false, reason: "invalid_link" });
      expect(value(await store.listOwn({ actorAuthUserId: partner.actorAuthUserId })).eligible).toBe(false);
    } finally { await external.end(); }
  });

  it("confines browser/service permissions and prohibits direct evidence mutation", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      await expect(sql("select public.research_referral_v1_authority()", [], role)).rejects.toThrow(/permission denied/);
      await expect(sql("select public.research_referral_v1_execute('listAdmin','{}')", [], role)).rejects.toThrow(/permission denied/);
    }
    for (const role of ["anon", "authenticated", "service_role"] as const) {
      for (const name of ["research_partner_referral_events", "research_affiliate_customer_bindings"]) {
        await expect(sql(`select * from public.${name}`, [], role)).rejects.toThrow(/permission denied/);
        await expect(sql(`truncate public.${name}`, [], role)).rejects.toThrow(/permission denied/);
      }
    }
    await expect(sql("select public.research_referral_v1_link_json($1)", [randomUUID()], "service_role")).rejects.toThrow(/permission denied/);
    const partner = await seedPartner(), issued = await issue(partner);
    await expect(sql("update public.research_partner_links set revoked_at=now() where id=$1", [issued.link.id], "service_role")).rejects.toThrow(/authority RPC/);
    await expect(sql("delete from public.research_partner_links where id=$1", [issued.link.id])).rejects.toThrow(/immutable/);
    await expect(sql("update public.research_partner_links set destination_path='/care' where id=$1", [issued.link.id])).rejects.toThrow(/immutable/);
    await expect(sql("delete from public.research_partner_referral_events where link_id=$1", [issued.link.id])).rejects.toThrow(/immutable/);
    await expect(sql("delete from public.research_idempotency_keys where key=$1", [issued.input.idempotencyKey], "service_role")).rejects.toThrow(/authority RPC/);
    // Ordinary legacy operations retain their original service permissions.
    await sql("insert into public.research_partner_links(partner_id,code,channel) values($1,$2,'code')", [partner.partnerId, `legacy-${randomUUID()}`], "service_role");
  });

  it("fails authority closed after privilege or guard drift", async () => {
    await sql("grant select on public.research_partner_referral_events to service_role");
    try { expect(await store.authority()).toEqual({ ok: false, reason: "unavailable" }); }
    finally { await sql("revoke select on public.research_partner_referral_events from service_role"); }
    await sql("alter table public.research_partner_links disable trigger referral_v1_links_guard");
    try { expect(await store.authority()).toEqual({ ok: false, reason: "unavailable" }); }
    finally { await sql("alter table public.research_partner_links enable trigger referral_v1_links_guard"); }
    expect((await store.authority()).ok).toBe(true);
    await sql("alter function public.research_referral_v1_execute(text,jsonb) set search_path='public'");
    try { expect(await store.authority()).toEqual({ ok: false, reason: "unavailable" }); }
    finally { await sql("alter function public.research_referral_v1_execute(text,jsonb) set search_path=''"); }
    await sql("revoke execute on function public.research_referral_v1_execute(text,jsonb) from service_role");
    try { expect(await store.authority()).toEqual({ ok: false, reason: "unavailable" }); }
    finally { await sql("grant execute on function public.research_referral_v1_execute(text,jsonb) to service_role"); }
    expect((await store.authority()).ok).toBe(true);
  });

  it("denies unknown or closed Auth membership and cross-partner idempotency replay", async () => {
    expect(await store.getBinding({ actorAuthUserId: randomUUID() })).toEqual({ ok: false, reason: "not_eligible" });
    const partner = await seedPartner(), issued = await issue(partner);
    const replacement = await seedPartner();
    // Synthetic account ownership remap illustrates why idempotency is not ownership.
    await sql("update public.research_partners set member_id=$1 where id=$2", [randomUUID(), partner.partnerId]);
    await sql("update public.research_partners set member_id=$1 where id=$2", [partner.memberId, replacement.partnerId]);
    expect(await store.issue(issued.input)).toEqual({ ok: false, reason: "not_found" });
    await sql("update public.research_members set status='closed' where id=$1", [partner.memberId]);
    expect(await store.getBinding({ actorAuthUserId: partner.actorAuthUserId })).toEqual({ ok: false, reason: "not_eligible" });
    expect(await store.issue({ ...issued.input, idempotencyKey: randomUUID() })).toEqual({ ok: false, reason: "not_eligible" });
  });

  it("returns bounded internal admin lineage without raw subject hashes, names or emails", async () => {
    const admin = value(await store.listAdmin({ adminAuthUserId: randomUUID(), limit: 3 }));
    for (const items of Object.values(admin)) expect(items.length).toBeLessThanOrEqual(3);
    expect(Object.keys(admin)).toEqual(["links", "events", "touches", "bindings"]);
    expect(JSON.stringify(admin)).not.toMatch(/subjectKeyHash|subject_key|email|legal_name|contact_email|actor_auth_user_id/);
    expect(admin.bindings.length).toBeGreaterThan(0);
  });

  it("rehearses service-only canonical request/order lineage, exclusions, caps and missing-source refusal", async () => {
    const lineageClient = { async rpc(_name: string, args: Record<string, unknown>) {
      try { return { data: (await sql("select public.research_partner_referral_v1_lineage($1::text[],$2::integer) as result", [args.p_account_keys, args.p_limit], "service_role")).rows[0].result, error: null }; }
      catch { return { data: null, error: { code: "rehearsal_error" } }; }
    } };
    const publisher = await issue(await seedPartner()), account = await seedPartner(), subjectKeyHash = hash();
    const touch = value(await store.capture({ tokenHashHex: publisher.input.tokenHashHex, subjectKeyHash })).touch;
    const binding = value(await store.bind({ actorAuthUserId: account.actorAuthUserId, touchId: touch.touchId, subjectKeyHash })).binding!;
    expect(await readReferralV1Lineage([binding], lineageClient)).toEqual({ state: "unavailable", records: [] });
    await sql(table(readFileSync(path.join(root, "supabase/migrations/20260815150000_research_assisted_order_bridge.sql"), "utf8"), "research_assisted_order_requests"));
    await sql(table(readFileSync(path.join(root, "supabase/research-orders.sql"), "utf8"), "research_orders"));
    await sql("alter table public.research_assisted_order_requests enable row level security; alter table public.research_assisted_order_requests force row level security; revoke all on public.research_assisted_order_requests,public.research_orders from public,anon,authenticated,service_role");
    const request = async (memberId: string | null, before = false) => {
      const reference = `XRR-20260904-${hash().slice(0, 10).toUpperCase()}`;
      const address = JSON.stringify({ line1: "Synthetic", city: "Synthetic", region: "ZZ", postalCode: "00000", countryCode: "US" });
      await sql("insert into public.research_assisted_order_requests(id,public_reference,idempotency_key_hash,request_fingerprint,actor_member_id,early_access_session_hash,normalized_email,full_legal_name,mobile_phone,shipping_address,billing_address,age_confirmed,source,created_at) values($1,$2,$3,$4,$5,$6,'synthetic@example.invalid','Synthetic Fixture','0000000000',$7::jsonb,$7::jsonb,true,'early_access_manual_order_bridge',$8::timestamptz)",
        [randomUUID(), reference, hash(), hash(), memberId, memberId ? null : hash(), address, new Date(Date.parse(binding.boundAt) + (before ? -60000 : 60000)).toISOString()]);
      return reference;
    };
    const owned = await request(account.memberId);
    await request(account.memberId, true);
    await request((await seedPartner()).memberId);
    await request(null);
    const orderId = randomUUID();
    await sql("insert into public.research_orders(id,member_id,subtotal_cents,total_cents,created_at) values($1,$2,0,0,$3)", [orderId, account.memberId, new Date(Date.parse(binding.boundAt) + 60000).toISOString()]);
    const lineage = await readReferralV1Lineage([binding], lineageClient);
    expect(lineage.state).toBe("available");
    expect(lineage.records.map((r) => r.reference).sort()).toEqual([owned, orderId].sort());
    expect(lineage.records.every((r) => r.attribution === "account_binding_only")).toBe(true);
    expect(JSON.stringify(lineage)).not.toMatch(/synthetic@example|full_legal|mobile_phone|shipping_address|early_access_session_hash|subjectKeyHash/);
    for (const role of ["anon", "authenticated"] as const) await expect(sql("select public.research_partner_referral_v1_lineage($1::text[],100)", [[binding.accountKey]], role)).rejects.toThrow(/permission denied/);
    await expect(sql("select * from public.research_assisted_order_requests", [], "service_role")).rejects.toThrow(/permission denied/);
    await expect(sql("select * from public.research_orders", [], "service_role")).rejects.toThrow(/permission denied/);
    await request(account.memberId);
    expect((await sql("select public.research_partner_referral_v1_lineage($1::text[],1) as result", [[binding.accountKey]], "service_role")).rows[0].result).toEqual({ state: "unavailable", records: [] });
    await sql("alter table public.research_orders rename column member_id to synthetic_drifted_member");
    try { expect(await readReferralV1Lineage([binding], lineageClient)).toEqual({ state: "unavailable", records: [] }); }
    finally { await sql("alter table public.research_orders rename column synthetic_drifted_member to member_id"); }
  });

  it("also installs cleanly without a legacy binding table using the reusable preview runtime", async () => {
    const fresh = await startReferralRehearsalDatabase();
    try {
      expect(value(await createSupabaseReferralV1Store(fresh.rpc).authority()).schemaVersion).toBe("gen2_referral_v1_20260904");
      expect((await fresh.sql("select count(*)::int n from public.research_affiliate_customer_bindings")).rows[0].n).toBe(0);
      expect(await readReferralV1Lineage([], fresh.rpc)).toEqual({ state: "available", records: [] });
      await fresh.sql("alter table public.research_members rename column auth_user_id to synthetic_schema_drift");
      try { await expect(fresh.sql(candidate)).rejects.toThrow(/Canonical dependency column drift/); }
      finally { await fresh.sql("alter table public.research_members rename column synthetic_schema_drift to auth_user_id"); }
    } finally { await fresh.stop(); }
  });
});
