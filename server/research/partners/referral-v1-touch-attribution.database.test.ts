/** Real PostgreSQL, task-owned and loopback-only. Never a managed connection. */
import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseReferralV1Store, type ReferralV1Result } from "./referral-v1-store";
import { startReferralRehearsalDatabase, type ReferralRehearsalDatabase } from "./referral-v1-rehearsal";

const candidate = readFileSync("supabase/candidates/20260914_research_referral_v1_touch_attribution.sql", "utf8");
const enabled = process.env.XENIOS_REFERRAL_V1_DISPOSABLE_PG === "1";
const hash = () => createHash("sha256").update(randomUUID()).digest("hex");
function value<T>(result: ReferralV1Result<T>): T {
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  return result.value;
}

describe.skipIf(!enabled)("executable referral touch attribution candidate", () => {
  let db: ReferralRehearsalDatabase;
  let store: ReturnType<typeof createSupabaseReferralV1Store>;
  beforeAll(async () => {
    db = await startReferralRehearsalDatabase({ includeLineageSources: false });
    store = createSupabaseReferralV1Store(db.rpc);
    expect(value(await store.authority()).schemaVersion).toBe("gen2_referral_v1_20260904");
    await db.sql(candidate);
    expect(value(await store.authority()).schemaVersion).toBe("gen2_referral_v1_20260904");
  }, 120000);
  afterAll(async () => { if (db) await db.stop(); }, 60000);

  async function captured() {
    const partner = await db.seedPartner();
    const tokenHashHex = hash(), subjectKeyHash = hash();
    const issued = value(await store.issue({ actorAuthUserId: partner.actorAuthUserId, idempotencyKey: randomUUID(), linkId: randomUUID(), tokenHashHex, tokenKeyVersion: 1, destinationPath: "/health", expiresInDays: 30 }));
    const { touch } = value(await store.capture({ tokenHashHex, subjectKeyHash }));
    return { partner, issued, input: { touchId: touch.touchId, subjectKeyHash } };
  }

  it("executes through the existing service-role dispatcher and writes no attribution events", async () => {
    const { partner, input } = await captured();
    const before = (await db.sql("select count(*)::int n from public.research_partner_referral_events")).rows[0].n;
    expect(await store.attributionForTouch(input)).toEqual({ ok: true, value: { partnerId: partner.partnerId, eligible: true } });
    expect(await store.attributionForTouch(input)).toEqual({ ok: true, value: { partnerId: partner.partnerId, eligible: true } });
    expect((await db.sql("select count(*)::int n from public.research_partner_referral_events")).rows[0].n).toBe(before);
  });

  it("does not disclose a touch to another browser or resolve a missing touch", async () => {
    const { input } = await captured();
    const none = { ok: true, value: { partnerId: null, eligible: false } };
    expect(await store.attributionForTouch({ ...input, subjectKeyHash: hash() })).toEqual(none);
    expect(await store.attributionForTouch({ ...input, touchId: randomUUID() })).toEqual(none);
  });

  it.each(["actorAuthUserId", "partnerId"])("rejects extra %s at the actual RPC boundary", async (key) => {
    const { input } = await captured();
    const result = await db.rpc.rpc("research_referral_v1_execute", { p_operation: "attributionForTouch", p_input: { ...input, [key]: randomUUID() } });
    expect(result.data).toEqual({ ok: false, reason: "invalid_input" });
  });

  it.each([null, [], {}, { touchId: "bad", subjectKeyHash: "short" }])("rejects malformed payload %j without throwing", async (p_input) => {
    const result = await db.rpc.rpc("research_referral_v1_execute", { p_operation: "attributionForTouch", p_input });
    expect(result.error).toBeNull();
    expect(result.data).toEqual({ ok: false, reason: "invalid_input" });
  });

  it("rechecks revocation and partner suspension rather than trusting the sealed claim", async () => {
    const revoked = await captured();
    value(await store.revoke({ actorAuthUserId: revoked.partner.actorAuthUserId, linkId: revoked.issued.link.id, idempotencyKey: randomUUID() }));
    expect(value(await store.attributionForTouch(revoked.input))).toEqual({ partnerId: null, eligible: false });
    const suspended = await captured();
    await db.sql("update public.research_partners set state='suspended' where id=$1", [suspended.partner.partnerId]);
    expect(value(await store.attributionForTouch(suspended.input))).toEqual({ partnerId: null, eligible: false });
  });

  it("refuses historical expired touches while all immutable guards stay enabled", async () => {
    const partner = await db.seedPartner();
    const linkId = randomUUID(), touchId = randomUUID(), subjectKeyHash = hash();
    await db.sql("insert into public.research_partner_links(id,partner_id,code,channel,created_at,referral_version,token_hash_hex,token_key_version,destination_path,expires_at) values($1::uuid,$2,$1::uuid::text,'signed_link',now()-interval '60 days',1,$3,1,'/health',now()-interval '30 days')", [linkId, partner.partnerId, hash()]);
    await db.sql("insert into public.research_attribution_touches(id,subject_key,partner_id,channel,occurred_at,referral_version,referral_link_id,referral_expires_at) select $1,$2,partner_id,'signed_link',created_at+interval '1 day',1,id,expires_at from public.research_partner_links where id=$3", [touchId, subjectKeyHash, linkId]);
    expect(value(await store.attributionForTouch({ touchId, subjectKeyHash }))).toEqual({ partnerId: null, eligible: false });
  });

  it("keeps the helper internal and denies anonymous/authenticated RPC execution", async () => {
    for (const role of ["anon", "authenticated", "service_role"] as const) {
      await expect(db.sql("select public.research_referral_v1_touch_attribution($1,$2)", [randomUUID(), hash()], role)).rejects.toThrow(/permission denied/);
      if (role !== "service_role") await expect(db.sql("select public.research_referral_v1_execute('attributionForTouch','{}')", [], role)).rejects.toThrow(/permission denied/);
    }
  });

  it("refuses replay atomically and leaves the installed operation working", async () => {
    await expect(db.sql(candidate)).rejects.toThrow(/drift or replay/);
    expect(value(await store.attributionForTouch({ touchId: randomUUID(), subjectKeyHash: hash() }))).toEqual({ partnerId: null, eligible: false });
  });
});
