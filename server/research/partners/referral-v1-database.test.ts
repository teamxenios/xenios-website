/** Opt-in REAL PostgreSQL rehearsal. Never accepts a database URL or production host.
 * XENIOS_REFERRAL_V1_DISPOSABLE_PG=1 starts a task-owned fresh database.
 * An unavailable runtime fails the opted-in suite; default runs visibly skip it.
 */
import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseReferralV1Store, REFERRAL_V1_SCHEMA_VERSION, type ReferralV1Result, type ReferralV1RpcClient } from "./referral-v1-store";
import { readReferralV1Lineage } from "./referral-v1-lineage";
import { startReferralRehearsalDatabase, referralRehearsalTableDDL as table, type ReferralRehearsalDatabase } from "./referral-v1-rehearsal";

const enabled = process.env.XENIOS_REFERRAL_V1_DISPOSABLE_PG === "1";
const root = process.cwd();
const candidate = readFileSync(path.join(root, "supabase/candidates/20260904_research_partner_referral_v1.sql"), "utf8");
const postcheck = readFileSync(path.join(root, "supabase/candidates/20260904_research_partner_referral_v1_postcheck.sql"), "utf8");
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
    expect(value(await store.authority()).schemaVersion).toBe(REFERRAL_V1_SCHEMA_VERSION);
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

  it("passes the final read-only transfer plus touch capability postcheck", async () => {
    await expect(sql(postcheck)).resolves.toBeDefined();
  });

  it("resolves exact issue and revoke replays before mutable account eligibility", async () => {
    const partner = await seedPartner();
    const issued = await issue(partner);
    const revokeInput = { actorAuthUserId: partner.actorAuthUserId, idempotencyKey: randomUUID(), linkId: issued.link.id };
    expect(value(await store.revoke(revokeInput)).created).toBe(true);
    await sql("update public.research_members set status='closed' where id=$1", [partner.memberId]);
    expect(value(await store.issue(issued.input))).toMatchObject({ created: false, link: { id: issued.link.id } });
    expect(value(await store.revoke(revokeInput))).toMatchObject({ created: false, link: { id: issued.link.id } });
    expect(await store.issue({ ...issued.input, destinationPath: "/care" })).toEqual({ ok: false, reason: "idempotency_conflict" });
    expect(await store.revoke({ ...revokeInput, linkId: randomUUID() })).toEqual({ ok: false, reason: "idempotency_conflict" });
    expect(await store.issue({ ...issued.input, idempotencyKey: randomUUID(), linkId: randomUUID(), tokenHashHex: hash() }))
      .toEqual({ ok: false, reason: "not_eligible" });
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
    expect(retained).toMatchObject({ created: false, availability: "revoked", conflictPreserved: true,
      touch: { touchId: results[0].touch.touchId } });
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
    expect(bound.some((result) => result.conflictPreserved === true)).toBe(true);
    expect((await sql("select count(*)::int n from public.research_partner_referral_events where event_type='account_bound' and actor_auth_user_id=$1", [actorAuthUserId])).rows[0].n).toBe(1);
    const winningLink = winner.linkId === first.link.id ? first : second;
    await store.revoke({ actorAuthUserId: winningLink.input.actorAuthUserId, idempotencyKey: randomUUID(), linkId: winner.linkId });
    // The claim was valid when made. Later link revocation does not truncate a
    // durable account binding; canonical partner eligibility remains current.
    expect(value(await store.getBinding({ actorAuthUserId })).availability).toBe("ready");
    expect(value(await store.getBinding({ actorAuthUserId })).binding).toEqual(winner);
    await sql("update public.research_partners set state='suspended' where id=$1", [winner.partnerId]);
    expect(value(await store.getBinding({ actorAuthUserId })).availability).toBe("partner_inactive");
    expect(value(await store.bindingAt({ actorAuthUserId, occurredAt: winner.effectiveAt! }))).toEqual({
      binding: winner, created: false, availability: "ready",
    });
  });

  it("preserves the first binding and appends CAS-protected future-only admin transfers", async () => {
    const original = await issue(await seedPartner());
    const target = await issue(await seedPartner());
    const laterTarget = await issue(await seedPartner());
    const account = await seedPartner();
    const subjectKeyHash = hash();
    const touch = value(await store.capture({ tokenHashHex: original.input.tokenHashHex, subjectKeyHash })).touch;
    const initial = value(await store.bind({ actorAuthUserId: account.actorAuthUserId, touchId: touch.touchId, subjectKeyHash })).binding!;
    expect(initial).toMatchObject({ revisionId: touch.touchId, source: "capture", partnerId: original.link.partnerId, linkId: original.link.id });
    const adminAuthUserId = randomUUID();
    const input = { adminAuthUserId, accountAuthUserId: account.actorAuthUserId, expectedRevisionId: initial.revisionId!,
      targetLinkId: target.link.id, idempotencyKey: randomUUID(), reasonCode: "customer_request" as const,
      authorizationReferenceHash: hash() };
    const transferred = value(await store.transferBinding(input));
    expect(transferred).toMatchObject({ created: true, binding: { source: "admin_transfer", partnerId: target.link.partnerId,
      linkId: target.link.id, touchId: touch.touchId }, transfer: { previousRevisionId: touch.touchId,
      previousPartnerId: original.link.partnerId, previousLinkId: original.link.id, nextPartnerId: target.link.partnerId,
      nextLinkId: target.link.id, reasonCode: "customer_request" } });
    expect(transferred.binding.revisionId).toBe(transferred.transfer.id);
    expect(transferred.binding.effectiveAt).toBe(transferred.transfer.effectiveAt);
    expect(Date.parse(transferred.transfer.effectiveAt)).toBeGreaterThanOrEqual(Date.parse(initial.effectiveAt!));
    expect(value(await store.getBinding({ actorAuthUserId: account.actorAuthUserId })).binding).toEqual(transferred.binding);
    expect((await sql("select partner_id,referral_link_id,referral_touch_id from public.research_affiliate_customer_bindings where customer_key=$1",
      [initial.accountKey])).rows[0]).toEqual({ partner_id: original.link.partnerId, referral_link_id: original.link.id, referral_touch_id: touch.touchId });
    expect((await sql("select actor_auth_user_id,authorization_reference_hash from public.research_referral_binding_transfer_events where id=$1",
      [transferred.transfer.id])).rows[0]).toEqual({ actor_auth_user_id: adminAuthUserId, authorization_reference_hash: input.authorizationReferenceHash });
    expect(value(await store.bindingAt({ actorAuthUserId: account.actorAuthUserId, occurredAt: initial.effectiveAt! })).binding)
      .toEqual(initial);
    expect(value(await store.bindingAt({ actorAuthUserId: account.actorAuthUserId,
      occurredAt: new Date(Date.parse(initial.boundAt) - 1).toISOString() }))).toEqual({
      binding: null, created: false, availability: "none",
    });
    expect(value(await store.bindingAt({ actorAuthUserId: account.actorAuthUserId, occurredAt: transferred.transfer.effectiveAt })).binding)
      .toEqual(transferred.binding);

    await sql("update public.research_members set status='closed' where id=$1", [account.memberId]);
    const replayed = value(await store.transferBinding(input));
    expect(replayed).toEqual({ ...transferred, created: false });
    expect(await store.transferBinding({ ...input, reasonCode: "compliance_action" })).toEqual({ ok: false, reason: "idempotency_conflict" });
    // Historical reconciliation is durable even when the current member door
    // is closed; only a new mutation remains ineligible.
    expect(value(await store.bindingAt({ actorAuthUserId: account.actorAuthUserId, occurredAt: transferred.transfer.effectiveAt })).binding)
      .toEqual(transferred.binding);
    expect(await store.transferBinding({ ...input, idempotencyKey: randomUUID() })).toEqual({ ok: false, reason: "not_eligible" });
    await sql("update public.research_members set status='active' where id=$1", [account.memberId]);
    expect(await store.transferBinding({ ...input, idempotencyKey: randomUUID() })).toEqual({ ok: false, reason: "stale_binding" });
    const accountOwnedLink = await issue(account);
    expect(await store.transferBinding({ ...input, expectedRevisionId: transferred.transfer.id, targetLinkId: accountOwnedLink.link.id,
      idempotencyKey: randomUUID() })).toEqual({ ok: false, reason: "self_referral" });

    const rawBackdate = await database.rpc.rpc("research_referral_v1_execute", { p_operation: "transferBinding", p_input: {
      actorAuthUserId: adminAuthUserId, accountAuthUserId: account.actorAuthUserId,
      expectedRevisionId: transferred.transfer.id, targetLinkId: laterTarget.link.id,
      idempotencyKey: randomUUID(), reasonCode: "documented_correction",
      authorizationReferenceHash: hash(), effectiveAt: "2020-01-01T00:00:00Z",
    } });
    expect(rawBackdate.error).toBeNull();
    expect(rawBackdate.data).toEqual({ ok: false, reason: "invalid_input" });

    const second = value(await store.transferBinding({ ...input, expectedRevisionId: transferred.transfer.id,
      targetLinkId: laterTarget.link.id, idempotencyKey: randomUUID(), reasonCode: "documented_correction" }));
    expect(second.transfer.previousRevisionId).toBe(transferred.transfer.id);
    expect(second.binding).toMatchObject({ revisionId: second.transfer.id, partnerId: laterTarget.link.partnerId, linkId: laterTarget.link.id });
    expect(value(await store.bindingAt({ actorAuthUserId: account.actorAuthUserId, occurredAt: transferred.transfer.effectiveAt })).binding)
      .toEqual(transferred.binding);
    expect(value(await store.bindingAt({ actorAuthUserId: account.actorAuthUserId, occurredAt: second.transfer.effectiveAt })).binding)
      .toEqual(second.binding);
    expect((await sql("select count(*)::int n from public.research_referral_binding_transfer_events where account_key=$1", [initial.accountKey])).rows[0].n).toBe(2);
    const lifecycle = value(await store.listAdmin({ adminAuthUserId, partnerId: laterTarget.link.partnerId, limit: 10 }));
    expect(lifecycle.bindings).toContainEqual({ ...second.binding, availability: "ready" });
    expect(lifecycle.transfers).toContainEqual({
      id: second.transfer.id, accountKey: second.transfer.accountKey, previousRevisionId: second.transfer.previousRevisionId,
      previousPartnerId: second.transfer.previousPartnerId, previousLinkId: second.transfer.previousLinkId,
      nextPartnerId: second.transfer.nextPartnerId, nextLinkId: second.transfer.nextLinkId,
      reasonCode: second.transfer.reasonCode, effectiveAt: second.transfer.effectiveAt,
    });
    expect(JSON.stringify(lifecycle)).not.toMatch(/authorizationReferenceHash|authorization_reference_hash|actorAuthUserId|actor_auth_user_id/);
  });

  it("keeps a valid historical claim eligible after link expiry while partner state remains authoritative", async () => {
    const publisher = await seedPartner(), account = await seedPartner();
    const linkId = randomUUID(), touchId = randomUUID(), subjectKeyHash = hash();
    await sql("insert into public.research_partner_links(id,partner_id,code,channel,created_at,referral_version,token_hash_hex,token_key_version,destination_path,expires_at) values($1::uuid,$2,$1::uuid::text,'signed_link',now()-interval '60 days',1,$3,1,'/health',now()-interval '30 days')", [linkId, publisher.partnerId, hash()]);
    await sql("insert into public.research_attribution_touches(id,subject_key,partner_id,channel,occurred_at,referral_version,referral_link_id,referral_expires_at) select $1,$2,partner_id,'signed_link',created_at+interval '1 day',1,id,expires_at from public.research_partner_links where id=$3", [touchId, subjectKeyHash, linkId]);
    await sql("insert into public.research_affiliate_customer_bindings(customer_key,partner_id,code,subject_key,captured_at,bound_at,program_state,method,referral_version,referral_link_id,referral_touch_id) select $1,$2::text,$3::text,subject_key,occurred_at,occurred_at+interval '1 day','pending_program','attribution_cookie',1,$3::uuid,id from public.research_attribution_touches where id=$4", [`auth:${account.actorAuthUserId}`, publisher.partnerId, linkId, touchId]);
    expect(value(await store.getBinding({ actorAuthUserId: account.actorAuthUserId }))).toMatchObject({
      availability: "ready", binding: { linkId, touchId, partnerId: publisher.partnerId },
    });
    await sql("update public.research_partners set state='suspended' where id=$1", [publisher.partnerId]);
    expect(value(await store.getBinding({ actorAuthUserId: account.actorAuthUserId })).availability).toBe("partner_inactive");
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
      for (const name of ["research_partner_referral_events", "research_affiliate_customer_bindings", "research_referral_binding_transfer_events",
        "research_referral_privacy_cleanup_work", "research_referral_privacy_cleanup_events"]) {
        await expect(sql(`select * from public.${name}`, [], role)).rejects.toThrow(/permission denied/);
        await expect(sql(`truncate public.${name}`, [], role)).rejects.toThrow(/permission denied/);
      }
      for (const name of ["research_partners", "research_members"]) {
        await expect(sql(`truncate public.${name}`, [], role)).rejects.toThrow(/permission denied/);
      }
    }
    await expect(sql("select public.research_referral_v1_privacy_begin($1,$2)", [randomUUID(), hash()], "service_role"))
      .rejects.toThrow(/permission denied/);
    await expect(sql("select public.research_referral_v1_privacy_finalize($1)", [hash()], "service_role"))
      .rejects.toThrow(/permission denied/);
    await expect(sql("select public.research_referral_v1_link_json($1)", [randomUUID()], "service_role")).rejects.toThrow(/permission denied/);
    const partner = await seedPartner(), issued = await issue(partner);
    await expect(sql("update public.research_partner_links set revoked_at=now() where id=$1", [issued.link.id], "service_role")).rejects.toThrow(/authority RPC/);
    await expect(sql("delete from public.research_partner_links where id=$1", [issued.link.id])).rejects.toThrow(/immutable/);
    await expect(sql("update public.research_partner_links set destination_path='/care' where id=$1", [issued.link.id])).rejects.toThrow(/immutable/);
    await expect(sql("delete from public.research_partner_referral_events where link_id=$1", [issued.link.id])).rejects.toThrow(/immutable/);
    await expect(sql("update public.research_referral_binding_transfer_events set reason_code='compliance_action'")).rejects.toThrow(/immutable/);
    await expect(sql("delete from public.research_idempotency_keys where key=$1", [issued.input.idempotencyKey], "service_role")).rejects.toThrow(/authority RPC/);
    // Ordinary legacy operations retain their original service permissions.
    await sql("insert into public.research_partner_links(partner_id,code,channel) values($1,$2,'code')", [partner.partnerId, `legacy-${randomUUID()}`], "service_role");
  });

  it("ignores service-role pg_temp catalog shadows in authority and mutation guards", async () => {
    const partner = await seedPartner(), issued = await issue(partner);
    const attacker = await connection("service_role");
    try {
      await attacker.query("create temp table pg_proc(oid oid,proowner oid); create temp table pg_roles(rolname name,rolsuper boolean,rolbypassrls boolean); create temp table pg_class(oid oid,relrowsecurity boolean,relforcerowsecurity boolean); create temp table pg_policy(polrelid oid); create temp table pg_trigger(tgname name,tgenabled char,tgfoid oid); create temp table pg_index(indexrelid oid,indisunique boolean,indisvalid boolean); create temp table pg_constraint(conname name,convalidated boolean)");
      await attacker.query("insert into pg_temp.pg_proc values(pg_catalog.to_regprocedure('public.research_referral_v1_execute(text,jsonb)')::oid,'service_role'::pg_catalog.regrole::oid)");
      expect((await attacker.query("select public.research_referral_v1_authority() result")).rows[0].result)
        .toEqual({ ok: true, value: { schemaVersion: REFERRAL_V1_SCHEMA_VERSION } });
      await expect(attacker.query("update public.research_partner_links set revoked_at=clock_timestamp() where id=$1", [issued.link.id]))
        .rejects.toThrow(/authority RPC/);
    } finally {
      await attacker.end();
    }
  });

  it("fails authority closed after privilege or guard drift", async () => {
    await sql("grant select on public.research_partner_referral_events to service_role");
    try { expect(await store.authority()).toEqual({ ok: false, reason: "unavailable" }); }
    finally { await sql("revoke select on public.research_partner_referral_events from service_role"); }
    await sql("alter table public.research_partner_links disable trigger referral_v1_links_guard");
    try { expect(await store.authority()).toEqual({ ok: false, reason: "unavailable" }); }
    finally { await sql("alter table public.research_partner_links enable trigger referral_v1_links_guard"); }
    await sql("alter table public.research_partners disable trigger referral_v1_partner_identity_guard");
    try { expect(await store.authority()).toEqual({ ok: false, reason: "unavailable" }); }
    finally { await sql("alter table public.research_partners enable trigger referral_v1_partner_identity_guard"); }
    await sql("drop trigger referral_v1_partner_identity_guard on public.research_partners; create trigger referral_v1_partner_identity_guard before update of id or delete on public.research_members for each row execute function public.research_referral_v1_identity_guard()");
    try { expect(await store.authority()).toEqual({ ok: false, reason: "unavailable" }); }
    finally {
      await sql("drop trigger referral_v1_partner_identity_guard on public.research_members; create trigger referral_v1_partner_identity_guard before insert or update of id,member_id or delete on public.research_partners for each row execute function public.research_referral_v1_identity_guard()");
    }
    await sql("grant truncate on public.research_partners to service_role");
    try { expect(await store.authority()).toEqual({ ok: false, reason: "unavailable" }); }
    finally { await sql("revoke truncate on public.research_partners from service_role"); }
    const identityGuardDefinition = (await sql("select pg_get_functiondef('public.research_referral_v1_identity_guard()'::regprocedure) definition")).rows[0].definition as string;
    await sql("create or replace function public.research_referral_v1_identity_guard() returns trigger language plpgsql security definer set search_path='' as $$ begin if tg_op='DELETE' then return old; end if; return new; end $$");
    try { expect(await store.authority()).toEqual({ ok: false, reason: "unavailable" }); }
    finally { await sql(identityGuardDefinition); }
    expect((await store.authority()).ok).toBe(true);
    await sql("alter function public.research_referral_v1_execute(text,jsonb) set search_path='public'");
    try { expect(await store.authority()).toEqual({ ok: false, reason: "unavailable" }); }
    finally { await sql("alter function public.research_referral_v1_execute(text,jsonb) set search_path=''"); }
    await sql("revoke execute on function public.research_referral_v1_execute(text,jsonb) from service_role");
    try { expect(await store.authority()).toEqual({ ok: false, reason: "unavailable" }); }
    finally { await sql("grant execute on function public.research_referral_v1_execute(text,jsonb) to service_role"); }
    expect((await store.authority()).ok).toBe(true);
  });

  it("makes established partner identity immutable and preserves replay after account closure", async () => {
    expect(await store.getBinding({ actorAuthUserId: randomUUID() })).toEqual({ ok: false, reason: "not_eligible" });
    const partner = await seedPartner(), issued = await issue(partner);
    const replacement = await seedPartner();
    await expect(sql("update public.research_partners set member_id=$1 where id=$2", [replacement.memberId, partner.partnerId]))
      .rejects.toThrow(/partner identity is immutable/i);
    await expect(sql("update public.research_members set auth_user_id=$1 where id=$2", [randomUUID(), partner.memberId]))
      .rejects.toThrow(/partner Auth identity is immutable/i);
    await expect(sql("delete from public.research_partners where id=$1", [partner.partnerId]))
      .rejects.toThrow(/partner identity is immutable/i);
    await expect(sql("delete from public.research_members where id=$1", [partner.memberId]))
      .rejects.toThrow(/partner Auth identity is immutable/i);
    await expect(sql("insert into public.research_partners(id,member_id,role,state,legal_name,contact_email) values($1,$2,'affiliate','application','Synthetic Invalid Identity','synthetic@example.invalid')", [randomUUID(), randomUUID()]))
      .rejects.toThrow(/partner member identity is invalid/i);
    for (const name of ["research_partners", "research_members"]) {
      const owner = await connection();
      try { await expect(owner.query(`truncate public.${name} cascade`)).rejects.toThrow(/identity cannot be truncated/i); }
      finally { await owner.end(); }
    }
    expect(value(await store.listOwn({ actorAuthUserId: partner.actorAuthUserId })).partnerId).toBe(partner.partnerId);
    expect(value(await store.issue(issued.input))).toMatchObject({ created: false, link: { id: issued.link.id } });
    await sql("update public.research_members set status='closed' where id=$1", [partner.memberId]);
    expect(await store.getBinding({ actorAuthUserId: partner.actorAuthUserId })).toEqual({ ok: false, reason: "not_eligible" });
    expect(value(await store.issue(issued.input))).toMatchObject({ created: false, link: { id: issued.link.id } });
    expect(await store.issue({ ...issued.input, idempotencyKey: randomUUID() })).toEqual({ ok: false, reason: "not_eligible" });
  });

  it("allows only a canonical first Auth claim for a partner-linked null identity", async () => {
    await sql("alter table public.research_members alter column auth_user_id drop not null");
    const applicationId = randomUUID(), memberId = randomUUID(), partnerId = randomUUID();
    const validAuthUserId = randomUUID(), replacementAuthUserId = randomUUID();
    await sql("insert into public.research_applications(id) values($1)", [applicationId]);
    await sql("insert into public.research_members(id,application_id,auth_user_id,email,first_name,status) values($1,$2,null,$3,'Synthetic','active')", [memberId, applicationId, `${randomUUID()}@example.invalid`]);
    await sql("insert into public.research_partners(id,member_id,role,state,legal_name,contact_email) values($1,$2,'affiliate','application','Synthetic Null Claim',$3)", [partnerId, memberId, `${randomUUID()}@example.invalid`]);
    await expect(sql("update public.research_members set auth_user_id=$1 where id=$2", [randomUUID(), memberId]))
      .rejects.toThrow(/partner Auth identity is invalid/i);
    await sql("insert into auth.users(id) values($1),($2)", [validAuthUserId, replacementAuthUserId]);
    await expect(sql("update public.research_members set auth_user_id=$1 where id=$2", [validAuthUserId, memberId])).resolves.toBeDefined();
    await expect(sql("update public.research_members set auth_user_id=$1 where id=$2", [replacementAuthUserId, memberId]))
      .rejects.toThrow(/partner Auth identity is immutable/i);
    await sql("alter table public.research_members alter column auth_user_id set not null");
    expect((await store.authority()).ok).toBe(true);
  });

  it("executes exact same-transaction privacy cleanup without deleting unrelated link visitors", async () => {
    const publisher = await seedPartner(), account = await seedPartner();
    const issued = await issue(publisher), accountSubject = hash(), unrelatedSubject = hash();
    const accountTouch = value(await store.capture({ tokenHashHex: issued.input.tokenHashHex, subjectKeyHash: accountSubject })).touch;
    const unrelatedTouch = value(await store.capture({ tokenHashHex: issued.input.tokenHashHex, subjectKeyHash: unrelatedSubject })).touch;
    value(await store.bind({ actorAuthUserId: account.actorAuthUserId, touchId: accountTouch.touchId, subjectKeyHash: accountSubject }));
    const authorizationReferenceHash = hash();
    const owner = await connection();
    let prepared: { deletedRowCount: number; referralCleanupPrepared: boolean; mustFinalizeInCurrentTransaction: boolean };
    try {
      await owner.query("begin");
      prepared = (await owner.query("select public.research_referral_v1_privacy_begin($1,$2) result",
        [account.memberId, authorizationReferenceHash])).rows[0].result;
      expect(prepared).toMatchObject({ referralCleanupPrepared: true, mustFinalizeInCurrentTransaction: true });
      await owner.query("delete from public.research_partners where id=$1", [account.partnerId]);
      await owner.query("delete from public.research_members where id=$1", [account.memberId]);
      const finalized = (await owner.query("select public.research_referral_v1_privacy_finalize($1) result",
        [authorizationReferenceHash])).rows[0].result;
      expect(finalized).toMatchObject({ referralIdentityCleanupCompleted: true, deletedRowCount: prepared.deletedRowCount });
      await owner.query("commit");
    } finally {
      await owner.query("rollback").catch(() => undefined);
      await owner.end();
    }
    expect((await sql("select count(*)::int n from public.research_partner_links where id=$1", [issued.link.id])).rows[0].n).toBe(1);
    expect((await sql("select count(*)::int n from public.research_attribution_touches where id=$1", [unrelatedTouch.touchId])).rows[0].n).toBe(1);
    expect((await sql("select count(*)::int n from public.research_attribution_touches where id=$1", [accountTouch.touchId])).rows[0].n).toBe(0);
    expect((await sql("select count(*)::int n from public.research_referral_privacy_cleanup_work")).rows[0].n).toBe(0);
    const event = (await sql("select authorization_reference_hash,deleted_row_count from public.research_referral_privacy_cleanup_events where authorization_reference_hash=$1", [authorizationReferenceHash])).rows[0];
    expect(event).toEqual({ authorization_reference_hash: authorizationReferenceHash, deleted_row_count: prepared.deletedRowCount });
    expect((await store.authority()).ok).toBe(true);
  });

  it("rolls back unfinished privacy cleanup, preserves legacy rows, and refuses unrelated admin-actor erasure", async () => {
    const legacyOwner = await seedPartner();
    const legacyCode = `legacy-${randomUUID()}`;
    await sql("insert into public.research_partner_links(partner_id,code,channel) values($1,$2,'code')", [legacyOwner.partnerId, legacyCode]);
    const unfinished = await connection();
    try {
      await unfinished.query("begin");
      await unfinished.query("select public.research_referral_v1_privacy_begin($1,$2)", [legacyOwner.memberId, hash()]);
      await expect(unfinished.query("delete from public.research_partners where id=$1", [legacyOwner.partnerId]))
        .rejects.toThrow(/privacy cleanup is required/i);
      await unfinished.query("rollback");
    } finally {
      await unfinished.query("rollback").catch(() => undefined);
      await unfinished.end();
    }
    expect((await sql("select count(*)::int n from public.research_partner_links where partner_id=$1 and code=$2 and referral_version is null",
      [legacyOwner.partnerId, legacyCode])).rows[0].n).toBe(1);

    const unfinishedOwner = await seedPartner(), unfinishedIssued = await issue(unfinishedOwner);
    const mustFinalize = await connection();
    try {
      await mustFinalize.query("begin");
      await mustFinalize.query("select public.research_referral_v1_privacy_begin($1,$2)", [unfinishedOwner.memberId, hash()]);
      await expect(mustFinalize.query("commit")).rejects.toThrow(/must be finalized/i);
      await mustFinalize.query("rollback");
    } finally {
      await mustFinalize.query("rollback").catch(() => undefined);
      await mustFinalize.end();
    }
    expect((await sql("select count(*)::int n from public.research_partner_links where id=$1", [unfinishedIssued.link.id])).rows[0].n).toBe(1);

    const publisher = await issue(await seedPartner()), target = await issue(await seedPartner());
    const account = await seedPartner(), admin = await seedPartner(), subjectKeyHash = hash();
    const touch = value(await store.capture({ tokenHashHex: publisher.input.tokenHashHex, subjectKeyHash })).touch;
    const initial = value(await store.bind({ actorAuthUserId: account.actorAuthUserId, touchId: touch.touchId, subjectKeyHash })).binding!;
    value(await store.transferBinding({ adminAuthUserId: admin.actorAuthUserId, accountAuthUserId: account.actorAuthUserId,
      expectedRevisionId: initial.revisionId!, targetLinkId: target.link.id, idempotencyKey: randomUUID(),
      reasonCode: "documented_correction", authorizationReferenceHash: hash() }));
    const before = value(await store.getBinding({ actorAuthUserId: account.actorAuthUserId })).binding;
    const actorCleanup = await connection();
    try {
      await actorCleanup.query("begin");
      await expect(actorCleanup.query("select public.research_referral_v1_privacy_begin($1,$2)", [admin.memberId, hash()]))
        .rejects.toThrow(/admin-actor redaction guidance/i);
      await actorCleanup.query("rollback");
    } finally {
      await actorCleanup.query("rollback").catch(() => undefined);
      await actorCleanup.end();
    }
    expect(value(await store.getBinding({ actorAuthUserId: account.actorAuthUserId })).binding).toEqual(before);
    expect((await store.authority()).ok).toBe(true);
  });

  it("serializes a legacy no-FK binding writer across privacy identity deletion", async () => {
    const target = await seedPartner(), customer = await seedPartner();
    const authorizationReferenceHash = hash(), privacy = await connection(), legacyWriter = await connection();
    try {
      await privacy.query("begin");
      await privacy.query("select public.research_referral_v1_privacy_begin($1,$2)",
        [target.memberId, authorizationReferenceHash]);
      await legacyWriter.query("begin");
      const pendingInsert = legacyWriter.query(
        "insert into public.research_affiliate_customer_bindings(customer_key,partner_id,code,subject_key,captured_at,bound_at,program_state,method) values($1,$2,$3,$4,clock_timestamp(),clock_timestamp(),'pending_program','attribution_cookie')",
        [`auth:${customer.actorAuthUserId}`, target.partnerId, `legacy-${randomUUID()}`, hash()]);
      await new Promise((resolve) => setTimeout(resolve, 75));
      await privacy.query("delete from public.research_partners where id=$1", [target.partnerId]);
      await privacy.query("delete from public.research_members where id=$1", [target.memberId]);
      await privacy.query("select public.research_referral_v1_privacy_finalize($1)", [authorizationReferenceHash]);
      await privacy.query("commit");
      await expect(pendingInsert).rejects.toThrow(/canonical partner identity is invalid/i);
      await legacyWriter.query("rollback");
    } finally {
      await privacy.query("rollback").catch(() => undefined);
      await legacyWriter.query("rollback").catch(() => undefined);
      await privacy.end();
      await legacyWriter.end();
    }
    expect((await sql("select count(*)::int n from public.research_affiliate_customer_bindings where partner_id=$1", [target.partnerId])).rows[0].n).toBe(0);
    expect((await store.authority()).ok).toBe(true);
  });

  it("deletes only canonical legacy bindings that directly reference the privacy subject", async () => {
    const target = await seedPartner(), customer = await seedPartner();
    const targetKey = `AUTH:${target.actorAuthUserId.toUpperCase()}`;
    await sql("insert into public.research_affiliate_customer_bindings(customer_key,partner_id,code,subject_key,captured_at,bound_at,program_state,method) values($1,$2,$3,$4,clock_timestamp(),clock_timestamp(),'pending_program','attribution_cookie')",
      [targetKey, target.partnerId.toUpperCase(), `legacy-${randomUUID()}`, hash()]);
    const authorizationReferenceHash = hash(), owner = await connection();
    try {
      await owner.query("begin");
      await owner.query("select public.research_referral_v1_privacy_begin($1,$2)", [target.memberId, authorizationReferenceHash]);
      expect((await owner.query("select count(*)::int n from public.research_affiliate_customer_bindings where customer_key=$1", [targetKey])).rows[0].n).toBe(0);
      await owner.query("delete from public.research_partners where id=$1", [target.partnerId]);
      await owner.query("delete from public.research_members where id=$1", [target.memberId]);
      await owner.query("select public.research_referral_v1_privacy_finalize($1)", [authorizationReferenceHash]);
      await owner.query("commit");
    } finally {
      await owner.query("rollback").catch(() => undefined);
      await owner.end();
    }
    expect((await sql("select count(*)::int n from public.research_affiliate_customer_bindings where customer_key='legacy:synthetic'")).rows[0].n).toBe(1);
    expect((await sql("select count(*)::int n from public.research_members where id=$1", [customer.memberId])).rows[0].n).toBe(1);
    expect((await store.authority()).ok).toBe(true);
  });

  it("serializes direct partner creation against concurrent member deletion", async () => {
    const applicationId = randomUUID(), memberId = randomUUID(), partnerId = randomUUID(), authUserId = randomUUID();
    await sql("insert into auth.users(id) values($1)", [authUserId]);
    await sql("insert into public.research_applications(id) values($1)", [applicationId]);
    await sql("insert into public.research_members(id,application_id,auth_user_id,email,first_name,status) values($1,$2,$3,$4,'Synthetic','active')", [memberId, applicationId, authUserId, `${randomUUID()}@example.invalid`]);
    const creator = await connection(), deleter = await connection();
    try {
      await creator.query("begin");
      await deleter.query("begin");
      await creator.query("insert into public.research_partners(id,member_id,role,state,legal_name,contact_email) values($1,$2,'affiliate','application','Synthetic Serialized Identity',$3)", [partnerId, memberId, `${randomUUID()}@example.invalid`]);
      const pendingDelete = deleter.query("delete from public.research_members where id=$1", [memberId]);
      await new Promise((resolve) => setTimeout(resolve, 75));
      await creator.query("commit");
      await expect(pendingDelete).rejects.toThrow(/partner Auth identity is immutable/i);
      await deleter.query("rollback");
    } finally {
      await creator.query("rollback").catch(() => undefined);
      await deleter.query("rollback").catch(() => undefined);
      await creator.end();
      await deleter.end();
    }
    expect((await sql("select member_id from public.research_partners where id=$1", [partnerId])).rows[0].member_id).toBe(memberId);
    expect((await store.authority()).ok).toBe(true);
  });

  it("returns bounded internal admin lineage without raw subject hashes, names or emails", async () => {
    const admin = value(await store.listAdmin({ adminAuthUserId: randomUUID(), limit: 3 }));
    for (const items of Object.values(admin)) expect(items.length).toBeLessThanOrEqual(3);
    expect(Object.keys(admin)).toEqual(["links", "events", "touches", "bindings", "transfers"]);
    expect(JSON.stringify(admin)).not.toMatch(/subjectKeyHash|subject_key|email|legal_name|contact_email|actor_auth_user_id|authorizationReferenceHash|authorization_reference_hash/);
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
      expect(value(await createSupabaseReferralV1Store(fresh.rpc).authority()).schemaVersion).toBe(REFERRAL_V1_SCHEMA_VERSION);
      expect((await fresh.sql("select count(*)::int n from public.research_affiliate_customer_bindings")).rows[0].n).toBe(0);
      expect(await readReferralV1Lineage([], fresh.rpc)).toEqual({ state: "available", records: [] });
      await fresh.sql("alter table public.research_members rename column auth_user_id to synthetic_schema_drift");
      try { await expect(fresh.sql(candidate)).rejects.toThrow(/Canonical dependency column drift/); }
      finally { await fresh.sql("alter table public.research_members rename column synthetic_schema_drift to auth_user_id"); }
    } finally { await fresh.stop(); }
  });

  it("refuses malformed baseline partner/member/Auth identity before installing irreversible guards", async () => {
    const fresh = await startReferralRehearsalDatabase({ applyReferralCandidate: false, includeLineageSources: false });
    const orphanPartnerId = randomUUID();
    try {
      await fresh.sql("insert into public.research_partners(id,member_id,role,state,legal_name,contact_email) values($1,$2,'affiliate','application','Synthetic Orphan','synthetic@example.invalid')", [orphanPartnerId, randomUUID()]);
      await expect(fresh.sql(candidate)).rejects.toThrow(/partner member identity is orphaned/i);
      await fresh.sql("delete from public.research_partners where id=$1", [orphanPartnerId]);

      const applicationId = randomUUID(), memberId = randomUUID(), authUserId = randomUUID();
      await fresh.sql("insert into public.research_applications(id) values($1)", [applicationId]);
      await fresh.sql("insert into public.research_members(id,application_id,auth_user_id,email,first_name,status) values($1,$2,$3,$4,'Synthetic','active')", [memberId, applicationId, authUserId, `${randomUUID()}@example.invalid`]);
      await fresh.sql("insert into public.research_partners(id,member_id,role,state,legal_name,contact_email) values($1,$2,'affiliate','application','Synthetic Auth Orphan',$3)", [randomUUID(), memberId, `${randomUUID()}@example.invalid`]);
      await expect(fresh.sql(candidate)).rejects.toThrow(/partner Auth identity is orphaned/i);
    } finally { await fresh.stop(); }
  });
});
