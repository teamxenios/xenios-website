import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import express, { type RequestHandler } from "express";
import request from "supertest";
import { expect, it } from "vitest";
import { REFERRAL_API } from "@shared/research/referral-v1";
import { startReferralRehearsalDatabase } from "./referral-v1-rehearsal";
import { createSupabaseReferralV1Store, type ReferralV1Result, type ReferralV1RpcClient } from "./referral-v1-store";
import { registerReferralV1Api } from "./referral-v1-routes";
import { referralDigest, referralPublicToken } from "./referral-v1-tokens";
import { createReferralV1AttributionResolver } from "./referral-v1-attribution";

const enabled = process.env.XENIOS_REFERRAL_V1_DISPOSABLE_PG === "1";
const value = <T>(result: ReferralV1Result<T>): T => {
  expect(result.ok).toBe(true); if (!result.ok) throw new Error(result.reason); return result.value;
};
/** Same actual owned-loopback harness and opt-in as the existing42 V1 PG cases.
 * Test guards/limiter identify synthetic users; not managed Auth, live UI,
 * payment evidence, commission or partner activation qualification. */
it.skipIf(!enabled)("qualifies readable aliases through canonical V1 ownership, capture, first-valid races and cross-device bindings", async () => {
  const db = await startReferralRehearsalDatabase({ includeLineageSources: false });
  try {
    const rpc: ReferralV1RpcClient = { async rpc(name, args) {
      if (name !== "research_referral_alias_v1_execute") return db.rpc.rpc(name, args);
      try { return { data: (await db.sql("select public.research_referral_alias_v1_execute($1,$2::jsonb) as result",
        [args?.p_operation, JSON.stringify(args?.p_input)], "service_role")).rows[0].result, error: null }; }
      catch (error) { return { data: null, error: { code: (error as { code?: string }).code } }; }
    } };
    const store = createSupabaseReferralV1Store(rpc), sam = await db.seedPartner(), other = await db.seedPartner();
    const account = async () => {
      const actor = randomUUID(), app = randomUUID(), member = randomUUID();
      await db.sql("insert into auth.users(id) values($1)", [actor]);
      await db.sql("insert into public.research_applications(id) values($1)", [app]);
      await db.sql("insert into public.research_members(id,application_id,auth_user_id,email,first_name,status) values($1,$2,$3,$4,'Synthetic','active')",
        [member, app, actor, `${randomUUID()}@example.invalid`]);
      return actor;
    };
    const john = await account(), jane = await account(), racingAccount = await account();
    const secret = "synthetic-readable-referral-pg-key-not-for-production", origin = "https://referral-fixture.invalid";
    const issue = async (actorAuthUserId: string) => {
      const id = randomUUID(), token = referralPublicToken(secret, id, 1)!;
      const result = value(await store.issue({ actorAuthUserId, idempotencyKey: randomUUID(), linkId: id,
        tokenHashHex: referralDigest(token), tokenKeyVersion: 1, destinationPath: "/health", expiresInDays: 30 }));
      return { link: result.link, token };
    };
    const samLink = await issue(sam.actorAuthUserId), otherLink = await issue(other.actorAuthUserId);
    expect(await store.resolveReadableAlias!({ code: "SAM-2026" })).toEqual({ ok: false, reason: "unavailable" });
    expect(value(await store.resolve({ tokenHashHex: referralDigest(samLink.token) })).link.id).toBe(samLink.link.id);
    const candidate = readFileSync("supabase/candidates/referral_v1_readable_aliases.sql", "utf8");
    await db.sql(candidate); await db.sql(candidate);
    expect((await store.authority()).ok).toBe(true); // No weakening of the existing guarded capability.
    const aliasInput = { actorAuthUserId: sam.actorAuthUserId, linkId: samLink.link.id, code: "SAM-2026", idempotencyKey: randomUUID() };
    expect(await store.assignReadableAlias!({ ...aliasInput, actorAuthUserId: other.actorAuthUserId })).toEqual({ ok: false, reason: "not_found" });
    const duplicate = await Promise.all(Array.from({ length: 4 }, () => store.assignReadableAlias!(aliasInput)));
    expect(duplicate.map(value).filter(r => r.created)).toHaveLength(1);
    expect(new Set(duplicate.map(value).map(r => r.alias.link.id))).toEqual(new Set([samLink.link.id]));
    expect(await store.assignReadableAlias!({ ...aliasInput, code: "DIFFERENT" })).toEqual({ ok: false, reason: "idempotency_conflict" });
    expect(value(await store.listReadableAliases!({ actorAuthUserId: other.actorAuthUserId })).aliases).toEqual([]);
    const alias = value(await store.resolveReadableAlias!({ code: "SAM-2026" })).alias;
    expect(alias.link).toEqual(value(await store.resolve({ tokenHashHex: referralDigest(samLink.token) })).link);
    const collisionA = await issue(sam.actorAuthUserId), collisionB = await issue(other.actorAuthUserId);
    const collision = await Promise.all([
      store.assignReadableAlias!({ actorAuthUserId: sam.actorAuthUserId, linkId: collisionA.link.id, code: "ONE-CODE", idempotencyKey: randomUUID() }),
      store.assignReadableAlias!({ actorAuthUserId: other.actorAuthUserId, linkId: collisionB.link.id, code: "ONE-CODE", idempotencyKey: randomUUID() }),
    ]);
    expect(collision.filter(r => r.ok)).toHaveLength(1);
    expect(collision.filter(r => !r.ok && r.reason === "idempotency_conflict")).toHaveLength(1);
    // Failure of the receipt write rolls back the assignment/audit row as well.
    const faultLink = await issue(sam.actorAuthUserId), faultInput = { ...aliasInput, linkId: faultLink.link.id, code: "ATOMIC-RETRY", idempotencyKey: randomUUID() };
    await db.sql(`create function referral_alias_v1_private.fixture_fail() returns trigger language plpgsql as $$begin raise exception 'synthetic receipt failure'; end$$;
      create trigger fixture_fail before insert on referral_alias_v1_private.receipts for each row execute function referral_alias_v1_private.fixture_fail()`);
    expect(await store.assignReadableAlias!(faultInput)).toEqual({ ok: false, reason: "unavailable" });
    expect((await db.sql("select count(*)::int as n from referral_alias_v1_private.aliases where code='ATOMIC-RETRY'")).rows[0].n).toBe(0);
    await db.sql("drop trigger fixture_fail on referral_alias_v1_private.receipts");
    expect(value(await store.assignReadableAlias!(faultInput)).created).toBe(true);
    const app = express(); app.use(express.json());
    const known = new Set([john, jane, racingAccount, sam.actorAuthUserId, other.actorAuthUserId]);
    const guard: RequestHandler = (req, res, next) => {
      const actor = req.headers.authorization?.slice(7);
      if (!actor || !known.has(actor)) { res.status(401).json({ ok: false }); return; }
      Object.assign(req, { researchMember: { auth_user_id: actor, status: "active" } }); next();
    };
    registerReferralV1Api(app, { enabled: true, secret, origin, store, allowed: async () => true,
      lineage: async () => ({ state: "unavailable", records: [] }) }, { requireMember: guard, requireAdmin: guard });
    const bootstrap = async () => {
      const result = await request(app).post(REFERRAL_API.bootstrap).set("Origin", origin).send({});
      expect(result.status).toBe(200);
      return { Cookie: result.headers["set-cookie"][0].split(";")[0], "X-Xenios-Referral-CSRF": result.body.csrfToken };
    };
    const headers = await bootstrap();
    const captured = await request(app).post(REFERRAL_API.capture).set("Origin", origin).set(headers).send({ code: " sam-2026 " });
    expect(captured.status).toBe(200); expect(captured.body.accountBinding).toBe("sign_in_required");
    const cookies = headers.Cookie + "; " + captured.headers["set-cookie"][0].split(";")[0];
    const again = await request(app).post(REFERRAL_API.capture).set("Origin", origin).set(headers).send({ code: samLink.token });
    expect(again.status).toBe(200);
    expect((await db.sql("select count(*)::int as n from public.research_attribution_touches where referral_link_id=$1", [samLink.link.id])).rows[0].n).toBe(1);
    const bind = async (actor: string) => request(app).post(REFERRAL_API.bind).set("Origin", origin).set({ ...headers, Cookie: cookies })
      .set("Authorization", "Bearer " + actor).send({});
    expect((await bind(john)).body.accountBinding).toBe("bound");
    expect((await bind(jane)).body.accountBinding).toBe("not_bound");
    expect(value(await store.getBinding({ actorAuthUserId: jane })).binding).toBeNull();
    const fresh = createSupabaseReferralV1Store(rpc), resolver = createReferralV1AttributionResolver({ enabled: true, secret, store: fresh });
    expect(await resolver.resolve({ actorAuthUserId: john, cookieHeader: undefined })).toBe(sam.partnerId);
    const hash = () => createHash("sha256").update(randomUUID()).digest("hex");
    const touchA = value(await store.capture({ tokenHashHex: referralDigest(samLink.token), subjectKeyHash: hash() })).touch;
    const touchB = value(await store.capture({ tokenHashHex: referralDigest(otherLink.token), subjectKeyHash: hash() })).touch;
    const firstClaims = await Promise.all([store.bind({ actorAuthUserId: racingAccount, touchId: touchA.touchId, subjectKeyHash: touchA.subjectKeyHash }),
      store.bind({ actorAuthUserId: racingAccount, touchId: touchB.touchId, subjectKeyHash: touchB.subjectKeyHash })]);
    expect(firstClaims.map(value).filter(r => r.created)).toHaveLength(1);
    expect(new Set(firstClaims.map(value).map(r => r.binding!.partnerId)).size).toBe(1);
    expect(value(await store.bind({ actorAuthUserId: john, touchId: touchB.touchId, subjectKeyHash: touchB.subjectKeyHash })).conflictPreserved).toBe(true);
    expect(await resolver.resolve({ actorAuthUserId: john, cookieHeader: undefined })).toBe(sam.partnerId);
    expect(await store.capture({ tokenHashHex: referralDigest(samLink.token), subjectKeyHash: hash(), actorAuthUserId: sam.actorAuthUserId }))
      .toEqual({ ok: false, reason: "self_referral" });
    // Historical expired link/alias fixture exercises the real lifecycle read;
    // no current alias assignment is permitted on that expired authority.
    const expiredId = randomUUID();
    await db.sql("insert into public.research_partner_links(id,partner_id,code,channel,created_at,referral_version,token_hash_hex,token_key_version,destination_path,expires_at) values($1::uuid,$2,$1::uuid::text,'signed_link',now()-interval '60 days',1,$3,1,'/health',now()-interval '30 days')",
      [expiredId, sam.partnerId, hash()]);
    await db.sql("insert into referral_alias_v1_private.aliases(code,link_id,assigned_by,assigned_at) values('EXPIRED-CODE',$1,$2,now()-interval '59 days')", [expiredId, sam.actorAuthUserId]);
    expect(await store.resolveReadableAlias!({ code: "EXPIRED-CODE" })).toEqual({ ok: false, reason: "invalid_link" });
    expect(await store.assignReadableAlias!({ ...aliasInput, linkId: expiredId, code: "EXPIRED-CODE", idempotencyKey: randomUUID() }))
      .toEqual({ ok: false, reason: "invalid_link" });
    // Current lifecycle prevents new alias capture without rewriting John's old winner.
    await store.revoke({ actorAuthUserId: sam.actorAuthUserId, linkId: samLink.link.id, idempotencyKey: randomUUID() });
    expect(await store.resolveReadableAlias!({ code: "SAM-2026" })).toEqual({ ok: false, reason: "invalid_link" });
    expect(await resolver.resolve({ actorAuthUserId: john, cookieHeader: undefined })).toBe(sam.partnerId);
    await db.sql("update public.research_partners set state='suspended' where id=$1", [other.partnerId]);
    expect(await store.assignReadableAlias!({ actorAuthUserId: other.actorAuthUserId, linkId: otherLink.link.id,
      code: "INACTIVE", idempotencyKey: randomUUID() })).toEqual({ ok: false, reason: "not_eligible" });
    await expect(db.sql("select * from referral_alias_v1_private.aliases", [], "service_role")).rejects.toMatchObject({ code: "42501" });
    for (const role of ["anon", "authenticated"] as const) await expect(db.sql("select public.research_referral_alias_v1_execute('resolve','{\"code\":\"SAM-2026\"}'::jsonb)", [], role))
      .rejects.toMatchObject({ code: "42501" });
    // Owned synthetic erasure removes alias/receipt context; stale retries or
    // a new owned link cannot resurrect or repoint that retired public code.
    await db.sql("delete from referral_alias_v1_private.aliases where code='ATOMIC-RETRY'");
    expect(await store.resolveReadableAlias!({ code: "ATOMIC-RETRY" })).toEqual({ ok: false, reason: "invalid_link" });
    expect(await store.assignReadableAlias!(faultInput)).toEqual({ ok: false, reason: "idempotency_conflict" });
    const replacement = await issue(sam.actorAuthUserId);
    expect(await store.assignReadableAlias!({ ...faultInput, linkId: replacement.link.id, idempotencyKey: randomUUID() }))
      .toEqual({ ok: false, reason: "idempotency_conflict" });
    expect((await db.sql("select count(*)::int as n from referral_alias_v1_private.receipts where code='ATOMIC-RETRY'")).rows[0].n).toBe(0);
    // Optional capability removal still leaves the real opaque canonical path intact.
    await db.sql("drop function public.research_referral_alias_v1_execute(text,jsonb)");
    expect(await store.resolveReadableAlias!({ code: "ONE-CODE" })).toEqual({ ok: false, reason: "unavailable" });
    expect((await store.resolve({ tokenHashHex: referralDigest(faultLink.token) })).ok).toBe(true);
  } finally { await db.stop(); }
}, 120_000);
