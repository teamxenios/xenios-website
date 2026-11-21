import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import type { Request } from "express";
import express from "express";
import request from "supertest";
import { expect } from "vitest";
import { createDurableJourneyFixture, pg16It } from "../assisted-order/request-intent/durable-journey.pg.fixture";
import { SupabasePrivateAccessSessionRepository, PRIVATE_ACCESS_SESSION_ACCESS_ROLE, PRIVATE_ACCESS_SESSION_RPC,
  PRIVATE_ACCESS_LIVE_SESSION_EXPIRY_RPC, type PrivateAccessSessionDatabaseCall } from "./private-access-session-repository";
import { registerPrivateEarlyAccessApi, type EarlyAccessRegistrationOptions } from "./register";
import { OriginalGuestProofUnavailableError } from "./identity/original-guest-proof";
import { EARLY_ACCESS_TEST_CONFIG, cleanUnit, catalogOf, approvedLedgerFor } from "./routes/route-fixtures";
import { createAssistedOrderViewerResolvers } from "../assisted-order/express";
import { requestIntentOwner } from "../assisted-order/request-intent/service";
import { sha256AssistedOrderHasher } from "../assisted-order/defaults";
import { createOriginalGuestProofResolver } from "../connected-operations";

/** Owned PG16, actual canonical sessions SQL, nonce exchange, repository, signed
 * cookie/session resolver and custodian through the actual registration/factory.
 * Selection below is owned test composition, not a Root runtime mount, managed Auth, saved
 * request/AE claim transaction, real-user credential or production activation. */
pg16It("qualifies optional live expiry without changing boolean admission, with actual cookie ownership and row-lock revocation", async () => {
  const db = createDurableJourneyFixture(), owner = "71000000-0000-4000-8000-000000000001";
  const role = PRIVATE_ACCESS_SESSION_ACCESS_ROLE;
  const calls: string[] = [];
  const query = async (call: PrivateAccessSessionDatabaseCall) => {
    calls.push(call.fn);
    const statements = {
      [PRIVATE_ACCESS_SESSION_RPC.issueNonce]: "select public.research_private_early_access_issue_nonce($1::text,$2::uuid,$3::text) as value",
      [PRIVATE_ACCESS_SESSION_RPC.exchangeNonce]: "select public.research_private_early_access_exchange_nonce($1::text,$2::text,$3::uuid,$4::text) as value",
      [PRIVATE_ACCESS_SESSION_RPC.sessionActive]: "select public.research_private_early_access_session_active($1::text,$2::uuid,$3::text) as value",
      [PRIVATE_ACCESS_SESSION_RPC.revokeSession]: "select public.research_private_early_access_revoke_session($1::text,$2::uuid,$3::text) as value",
      [PRIVATE_ACCESS_LIVE_SESSION_EXPIRY_RPC]: "select public.research_private_early_access_live_session_expiry($1::text,$2::uuid,$3::text) as value",
    };
    const values = call.fn === PRIVATE_ACCESS_SESSION_RPC.exchangeNonce
      ? [call.args.p_nonce_hash, call.args.p_session_hash, call.args.p_owner_id, call.args.p_access_role]
      : [call.fn === PRIVATE_ACCESS_SESSION_RPC.issueNonce ? call.args.p_nonce_hash : call.args.p_session_hash,
        call.args.p_owner_id, call.args.p_access_role];
    return (await db.asRole("service_role", statements[call.fn], values)).rows[0].value;
  };
  const repository = new SupabasePrivateAccessSessionRepository({ ownerId: owner, query });
  type Observed = Parameters<NonNullable<EarlyAccessRegistrationOptions["onDoorSources"]>>[0];
  const observation: { current: Observed | null } = { current: null };
  const app = express(), unit = cleanUnit(); app.use(express.json());
  const options: EarlyAccessRegistrationOptions = {
    config: { ...EARLY_ACCESS_TEST_CONFIG, openAccess: true, sessionTtlMinutes: 240 },
    repository, now: Date.now, sessionIdentity: true, originalGuestProofExpiry: "canonical-live-row-v1", env: {},
    catalog: catalogOf([unit]), releases: await approvedLedgerFor(unit),
  };
  registerPrivateEarlyAccessApi(app, { ...options, onDoorSources: sources => { observation.current = sources; } });
  const doors = observation.current;
  if (!doors || !doors.readOriginalGuestProof) throw new Error("Selected canonical registration capability missing");
  const { resolveSession, readSessionId, readOriginalGuestProof: readProof } = doors;
  const resolveAeProof = createOriginalGuestProofResolver(readProof);
  expect(calls).toEqual([]); // Construction selects source, never probes provider.
  const unselected: { current: Observed | null } = { current: null };
  registerPrivateEarlyAccessApi(express(), { ...options, originalGuestProofExpiry: undefined,
    onDoorSources: sources => { unselected.current = sources; } });
  expect(unselected.current?.readOriginalGuestProof).toBeNull(); expect(calls).toEqual([]);
  const unlock = async () => {
    const response = await request(app).post("/api/research/early-access/unlock").send({});
    expect(response.status).toBe(200);
    const raw = response.headers["set-cookie"], cookies = typeof raw === "string" ? [raw] : raw ?? [];
    return cookies.map(value => value.split(";")[0]).join("; ");
  };
  const scalar = async (hash: string | null, selectedOwner: string | null = owner, selectedRole: string | null = role) =>
    (await db.asRole("service_role", "select public.research_private_early_access_live_session_expiry($1::text,$2::uuid,$3::text) as value",
      [hash, selectedOwner, selectedRole])).rows[0].value;
  const snapshot = async () => (await db.sql(`select
    (select jsonb_agg(to_jsonb(s) order by session_hash) from public.research_private_early_access_sessions s) as sessions,
    (select jsonb_agg(to_jsonb(n) order by nonce_hash) from public.research_private_early_access_nonces n) as nonces`)).rows[0];
  try {
    await db.start();
    await db.sql(readFileSync("supabase/research-private-early-access-sessions.sql", "utf8"));
    const cookie = await unlock(), h1 = readSessionId(cookie);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
    if (!h1) throw new Error("Canonical signed reader missing H1");
    expect(await repository.resolveWithExpiry(h1, Date.now())).toEqual({ ok: false, code: "BACKEND_UNAVAILABLE" });
    await expect(readProof(cookie)).rejects.toBeInstanceOf(OriginalGuestProofUnavailableError);
    calls.length = 0;
    expect(await resolveSession(cookie)).toEqual({ authenticated: true, expiresAtEpochMs: null });
    expect(calls).toEqual([PRIVATE_ACCESS_SESSION_RPC.sessionActive]);
    const beforeCandidate = await snapshot(), candidate = readFileSync("supabase/candidates/private_early_access_live_session_expiry.sql", "utf8");
    await db.sql(candidate); await db.sql(candidate);
    expect(await snapshot()).toEqual(beforeCandidate);
    const attributes = (await db.sql(`select p.prosecdef as definer,p.provolatile as volatility,p.proretset as setof,
      p.prorettype::regtype::text as returns,p.proconfig as config,l.lanname as language,
      p.proowner=c.relowner as same_owner,p.proargnames as arguments from pg_proc p join pg_language l on l.oid=p.prolang
      cross join pg_class c where p.oid='public.research_private_early_access_live_session_expiry(text,uuid,text)'::regprocedure
      and c.oid='public.research_private_early_access_sessions'::regclass`)).rows[0];
    expect(attributes).toEqual({ definer: true, volatility: "v", setof: false, returns: "timestamp with time zone",
      config: ["search_path=pg_catalog"], language: "plpgsql", same_owner: true,
      arguments: ["p_session_hash", "p_owner_id", "p_access_role"] });
    const acl = (await db.sql(`select
      has_function_privilege('anon','public.research_private_early_access_live_session_expiry(text,uuid,text)','execute') as anon,
      has_function_privilege('authenticated','public.research_private_early_access_live_session_expiry(text,uuid,text)','execute') as authenticated,
      has_function_privilege('service_role','public.research_private_early_access_live_session_expiry(text,uuid,text)','execute') as backend,
      has_table_privilege('service_role','public.research_private_early_access_sessions','select') as direct`)).rows[0];
    expect(acl).toEqual({ anon: false, authenticated: false, backend: true, direct: false });
    for (const deniedRole of ["anon", "authenticated"] as const) await expect(db.asRole(deniedRole,
      "select public.research_private_early_access_live_session_expiry($1::text,$2::uuid,$3::text)", [h1, owner, role])).rejects.toMatchObject({ code: "42501" });
    await expect(db.asRole("service_role", "select expires_at from public.research_private_early_access_sessions"))
      .rejects.toMatchObject({ code: "42501" });
    await db.sql(`create role ea_expiry_unexpected nologin;
      grant execute on function public.research_private_early_access_live_session_expiry(text,uuid,text) to ea_expiry_unexpected`);
    await expect(db.sql(candidate)).rejects.toMatchObject({ code: "P0001" });
    await db.sql("revoke all on function public.research_private_early_access_live_session_expiry(text,uuid,text) from ea_expiry_unexpected");
    await db.sql(candidate);
    const exactExpiry = (await db.sql("select expires_at from public.research_private_early_access_sessions where session_hash=$1", [h1])).rows[0].expires_at as Date;
    expect(await repository.resolveWithExpiry(h1, Date.now())).toEqual({ ok: true, value: exactExpiry.getTime() });
    const proof = await readProof(cookie);
    expect(proof).toMatchObject({ sessionHandleHash: h1, expiresAtEpochMs: exactExpiry.getTime() });
    if (!proof) throw new Error("Actual PG-backed custodian proof missing");
    const aeProof = await resolveAeProof({ headers: { cookie } });
    expect(aeProof).toEqual({ customerRef: proof.customerRef,
      sessionHash: createHash("sha256").update(h1, "utf8").digest("hex"), expiresAt: exactExpiry.toISOString() });
    if (!aeProof) throw new Error("Actual Root ownership conversion missing");
    const viewer = await createAssistedOrderViewerResolvers({ resolveMember: async () => null, earlyAccess: () => doors,
      earlyAccessBindings: () => null, adminEmail: () => "" })
      .customer({ headers: { cookie } } as Request);
    expect(requestIntentOwner(viewer, sha256AssistedOrderHasher)).toBe(sha256AssistedOrderHasher.stableHash([
      "request-intent-owner", "session", aeProof.customerRef, aeProof.sessionHash,
    ]));
    expect(await snapshot()).toEqual(beforeCandidate); // No nonce/session mint, touch or expiry sliding on proof reads.
    for (const [hash, selectedOwner, selectedRole] of [[null, owner, role], ["A".repeat(64), owner, role],
      ["f".repeat(64), owner, role], [h1, null, role], [h1, "71000000-0000-4000-8000-000000000002", role],
      [h1, owner, null], [h1, owner, "clinical_admin"]]) expect(await scalar(hash, selectedOwner, selectedRole)).toBeNull();
    const foreignRepository = new SupabasePrivateAccessSessionRepository({ ownerId: "71000000-0000-4000-8000-000000000002", query });
    expect(await foreignRepository.resolveWithExpiry(h1, Date.now())).toEqual({ ok: true, value: null });
    const otherCookie = await unlock(), otherProof = await readProof(otherCookie);
    expect(otherProof).not.toBeNull(); expect(otherProof?.customerRef).not.toBe(proof.customerRef);
    expect(otherProof?.sessionHandleHash).not.toBe(h1);
    // Real table boundary cases preserve the canonical four-hour constraint.
    for (const [hash, issued] of [["a".repeat(64), "clock_timestamp()-interval '5 hours'"],
      ["b".repeat(64), "clock_timestamp()+interval '1 hour'"], ["c".repeat(64), "'infinity'::timestamptz"]]) {
      await db.sql(`with stamp as(select ${issued} as issued) insert into public.research_private_early_access_sessions
        (session_hash,owner_id,access_role,issued_at,expires_at) select $1,$2,$3,issued,issued+interval '240 minutes' from stamp`, [hash, owner, role]);
      expect(await scalar(hash)).toBeNull();
    }
    const password = randomUUID();
    await db.sql("create role ea_expiry_lock_probe login superuser password '" + password + "'");
    const pool = db.poolForLogin("ea_expiry_lock_probe", password), lock = await pool.connect();
    try {
      const pid = Number((await lock.query("select pg_backend_pid() as pid")).rows[0].pid);
      const waitForBlocked = async (prefix: string) => {
        for (let attempt = 0; attempt < 100; attempt++) {
          const found = await db.sql(`select count(*)::int as n from pg_stat_activity
            where wait_event_type='Lock' and query like $1 and $2::int=any(pg_blocking_pids(pid))`, [prefix + "%", pid]);
          if (found.rows[0].n > 0) return true;
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        return false;
      };
      // Revoke first: the expiry projection waits, then observes revoked_at and
      // refuses. The blocking PID is observed, not inferred from a timer.
      await lock.query("begin");
      await lock.query("update public.research_private_early_access_sessions set revoked_at=clock_timestamp() where session_hash=$1", [h1]);
      const pendingRead = repository.resolveWithExpiry(h1, Date.now());
      const readBlocked = await waitForBlocked("select public.research_private_early_access_live_session_expiry");
      await lock.query("commit");
      expect(await pendingRead).toEqual({ ok: true, value: null }); expect(readBlocked).toBe(true);
      expect(await readProof(cookie)).toBeNull(); expect((await resolveSession(cookie)).authenticated).toBe(false);
      expect(await resolveAeProof({ headers: { cookie } })).toBeNull();
      // Projection first: FOR SHARE holds until this transaction commits and
      // blocks a non-key revoke update. This does not lock any later AE claim.
      const otherH1 = readSessionId(otherCookie)!;
      await lock.query("begin"); await lock.query("set local role service_role");
      const held = await lock.query("select public.research_private_early_access_live_session_expiry($1::text,$2::uuid,$3::text) as value", [otherH1, owner, role]);
      expect(held.rows[0].value).toBeInstanceOf(Date);
      const pendingRevoke = repository.revoke(otherH1, Date.now());
      const revokeBlocked = await waitForBlocked("select public.research_private_early_access_revoke_session");
      await lock.query("commit");
      expect(await pendingRevoke).toEqual({ ok: true, value: true }); expect(revokeBlocked).toBe(true);
      expect(await repository.resolveWithExpiry(otherH1, Date.now())).toEqual({ ok: true, value: null });
      expect(await readProof(otherCookie)).toBeNull();
    } finally {
      await lock.query("rollback"); lock.release(); await pool.end();
    }
    // Removing only the optional RPC cannot change the existing boolean path.
    const finalCookie = await unlock(), finalH1 = readSessionId(finalCookie)!;
    await db.sql("drop function public.research_private_early_access_live_session_expiry(text,uuid,text)");
    expect(await repository.resolveWithExpiry(finalH1, Date.now())).toEqual({ ok: false, code: "BACKEND_UNAVAILABLE" });
    calls.length = 0;
    expect(await resolveSession(finalCookie)).toEqual({ authenticated: true, expiresAtEpochMs: null });
    expect(calls).toEqual([PRIVATE_ACCESS_SESSION_RPC.sessionActive]);
    await expect(readProof(finalCookie)).rejects.toBeInstanceOf(OriginalGuestProofUnavailableError);
    await expect(resolveAeProof({ headers: { cookie: finalCookie } })).rejects.toThrow(/^ae_guest_proof_unavailable$/);
  } finally { await db.close(); }
}, 120_000);
