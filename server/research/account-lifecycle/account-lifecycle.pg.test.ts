/** Owned disposable PG mechanics ONLY. Every policy/assurance/domain/provider
 * adapter below is explicitly synthetic, not company approval/clearance or a
 * real account/provider deletion. No managed URL, client, secrets or action is
 * accepted. All cases remain UNRUN until Root allocates exact dual-PG proof. */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Pool, PoolClient } from "pg";
import { createReferralInstallerFixture, pinnedSql, selectReferralInstallerImage } from "../referral-readiness/canonical-prerequisites.pg.fixture";

const image = selectReferralInstallerImage(process.env), pgIt = image ? it : it.skip;
const SQL = "supabase/candidates/account_lifecycle.sql", S = "account_lifecycle_private", F = "account_lifecycle_fixture";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const policy = hash("OWNED synthetic policy, NOT an approved company lifecycle policy"), project = hash("OWNED disposable project only");
const canonicalPins = {
  foundation: { path: "supabase/pack02-candidates/20260812_research_account_organizations.sql", bytes: 59747, sha256: "3d9454f7981bb7516efa66e03e19babe00225cb27d871ba155431b5bed6c3eb9" },
  care: { path: "supabase/care-access-foundation.sql", bytes: 6227, sha256: "e91331b72820c6ca3f1cb3ce0fa8c79487e70d189d74b853bdaff49b2d7589ce" },
} as const;
type Db = ReturnType<typeof createReferralInstallerFixture>;
type Context = { policyRevision: string; assuranceRef: string; sessionBinding: string; assuranceNotAfter: string; prepareNotAfter: string };
type Witness = { actor: string; target: string; attempt: string; mode: "self" | "admin"; context: Context };
type Fixture = { db: Db; pool: Pool | null; actor: string; other: string; close(): Promise<void> };
type Envelope = { protocol: string; operationId: string; version: number; state: string; progress: Record<string, string>;
  preview: { digest: string; expiresAt: string; policyRevision: string; coverageRevision: string } | null; blockers: string[]; nextAction: string };

async function boot(ports = true, targetProfile = false): Promise<Fixture> {
  if (!image) throw new Error("Exact existing owned PostgreSQL selector required");
  const db = createReferralInstallerFixture(targetProfile ? { installerAuthority: "owned_target_nonsuper_bypass" } : {});
  let pool: Pool | null = null;
  try {
    await db.start(image); await db.sql(readFileSync(SQL, "utf8"));
    const actor = randomUUID(), other = randomUUID();
    if (!targetProfile) await db.sql("insert into auth.users(id,email,email_confirmed_at) values($1,$1::text||'@example.invalid',clock_timestamp()),($2,$2::text||'@example.invalid',clock_timestamp())", [actor, other]);
    if (ports) await adapters(db);
    if (!targetProfile) {
      const password = randomUUID();
      await db.sql(`create role lifecycle_owned_backend login superuser password '${password}'`);
      pool = db.poolForLogin("lifecycle_owned_backend", password);
    }
    return { db, pool, actor, other, async close() { try { if (pool) await pool.end(); } finally { await db.close(); } } };
  } catch (error) { try { if (pool) await pool.end(); } finally { await db.close(); } throw error; }
}
async function adapters(db: Db) {
  await db.sql(`create schema ${F};
    create table ${F}.settings(singleton boolean primary key default true,policy_revision text not null,published_at timestamptz not null,
      preview_seconds integer not null default 600,retention_seconds integer not null default 3600,admin_allowed boolean not null default false,
      held_domain text,closure_hold boolean not null default false,unknown_domain text,coverage_ready boolean not null default true,
      finite_replay boolean not null default true,provider_qualified boolean not null default true,auth_fks boolean not null default true,
      storage_resolved boolean not null default true,retained text not null default 'not_applicable',sessions text not null default 'not_applicable',
      eligible text not null default 'not_applicable',delete_mode text not null default 'hard',policy_override jsonb);
    insert into ${F}.settings(singleton,policy_revision,published_at) values(true,'${policy}',clock_timestamp()-interval '1 second');
    create table ${F}.witnesses(ref text primary key,actor uuid not null,target uuid not null,mode text not null,attempt uuid not null,
      session_binding text not null,policy_revision text not null,issued_at timestamptz not null,not_after timestamptz not null,
      unique(actor,target,mode,attempt));
    create table ${F}.evidence(operation uuid not null,execution uuid not null,payload jsonb not null,primary key(operation,execution));
    create table ${F}.relationships(target uuid not null references auth.users(id),note text not null);
    create function ${F}.policy_delegate() returns jsonb language plpgsql stable security definer set search_path='' as $owned$
    declare c ${F}.settings; begin select * into strict c from ${F}.settings where singleton;
      return coalesce(c.policy_override,jsonb_build_object('protocol','account-lifecycle/policy/v1','policyRevision',c.policy_revision,
        'documentSha256',repeat('1',64),'recordReference','OWNED:synthetic-policy-not-live','approvalReference','OWNED:mechanics-only-no-live-approval',
        'previewMaxSeconds',c.preview_seconds,'operationRetentionSeconds',c.retention_seconds,'evidenceRetentionSeconds',c.retention_seconds,
        'publishedAt',${S}.utc(c.published_at)));end $owned$;
    create function ${S}.policy_v1() returns jsonb language plpgsql stable security definer set search_path='' as $owned$
    begin return ${F}.policy_delegate();end $owned$;
    create function ${S}.authorize_v1(p_actor uuid,p_target uuid,p_mode text,p_phase text,p_assurance_ref text,p_assurance_not_after timestamptz)
    returns jsonb language plpgsql volatile security definer set search_path='' as $owned$
    declare w ${F}.witnesses; c ${F}.settings; purpose text;
    begin
      select * into strict c from ${F}.settings where singleton;
      select * into w from ${F}.witnesses where ref=p_assurance_ref;
      if not found or (w.actor,w.target,w.mode) is distinct from (p_actor,p_target,p_mode) then
        return '{"protocol":"account-lifecycle/authority/v1","decision":"unavailable","reason":"assurance_unavailable"}';end if;
      if p_mode='admin' and not c.admin_allowed then return '{"protocol":"account-lifecycle/authority/v1","decision":"denied","reason":"admin_authority_unavailable"}';end if;
      purpose:=case when p_phase='provider_dispatch' then 'provider_dispatch' when p_mode='self' then 'self_close'
        when p_phase='status' then 'global_status' else 'global_close' end;
      return jsonb_build_object('protocol','account-lifecycle/authority/v1','decision','authorized','actorId',w.actor,'targetId',w.target,
        'mode',w.mode,'phase',p_phase,'sessionBinding',w.session_binding,'policyRevision',w.policy_revision,'issuedAttempt',w.attempt,
        'issuedAt',${S}.utc(w.issued_at),'notAfter',${S}.utc(w.not_after),'action',purpose);
    end $owned$;
    create function ${S}.dependencies_v1(p_target uuid,p_phase text) returns jsonb
    language plpgsql volatile security definer set search_path='' as $owned$
    declare c ${F}.settings; domains jsonb; begin select * into strict c from ${F}.settings where singleton;
      select jsonb_agg(jsonb_build_object('domain',name,
        'state',case when name=c.unknown_domain then 'unknown' when name=c.held_domain then case when c.closure_hold then 'hold' else 'retention_required' end else 'known_none' end,
        'closure',case when name=c.unknown_domain then 'unknown' when name=c.held_domain and c.closure_hold then 'hold' else 'allow' end,
        'erasure',case when name=c.unknown_domain then 'unknown' when name=c.held_domain then 'retain' else 'none' end,
        'authDelete',case when name=c.unknown_domain then 'unknown' when name=c.held_domain then
          case when c.retained='retained' and not c.closure_hold and c.auth_fks then 'allow' else 'hold' end else 'allow' end,
        'revision',repeat('2',64),'evidenceSha256',repeat('3',64)) order by name) into domains
        from unnest(array['identity','organizations','staff','care','finance','xri','referral','storage','unknown_dependencies']) name;
      return jsonb_build_object('protocol','account-lifecycle/dependencies/v1','revision',repeat('4',64),'targetId',p_target,
        'domains',domains,'providerSessions',c.sessions,'eligibleData',c.eligible,'retainedData',c.retained,
        'authForeignKeysResolved',c.auth_fks,'storageResolved',c.storage_resolved,'authDeletionMode',c.delete_mode);
    end $owned$;
    create function ${S}.guard_coverage_v1() returns jsonb language plpgsql stable security definer set search_path='' as $owned$
    declare c ${F}.settings; begin select * into strict c from ${F}.settings where singleton;
      return jsonb_build_object('protocol','account-lifecycle/coverage/v1','revision',repeat('5',64),'applicationFenced',c.coverage_ready,
        'newWritersFenced',c.coverage_ready,'directAccessFenced',c.coverage_ready,'backoutCompatible',c.coverage_ready,
        'finiteReplaySafe',c.finite_replay,'providerQualified',c.provider_qualified);end $owned$;
    create function ${S}.provider_evidence_v1(p_operation uuid,p_execution uuid) returns jsonb
    language plpgsql volatile security definer set search_path='' as $owned$
    declare result jsonb; begin select payload into result from ${F}.evidence where operation=p_operation and execution=p_execution;return result;end $owned$;
    create function ${F}.guarded_bind(p_target uuid) returns void language plpgsql volatile security definer set search_path='' as $owned$
    begin perform ${S}.guard_subject_after_auth(p_target);insert into ${F}.relationships values(p_target,'OWNED synthetic guarded writer only');end $owned$;
    revoke all on schema ${F} from public,anon,authenticated,service_role;
    revoke all on all functions in schema ${F} from public,anon,authenticated,service_role;
    revoke all on all functions in schema ${S} from public,anon,authenticated,service_role;`);
  await bind(db);
}
async function bind(db: Db) {
  // Fixtures bind the exact functions JUST CREATED from this closed source.
  // Never run this against a managed target or present these as approved pins.
  const signatures = [`${S}.policy_v1()`, `${S}.authorize_v1(uuid,uuid,text,text,text,timestamptz)`, `${S}.dependencies_v1(uuid,text)`,
    `${S}.guard_coverage_v1()`, `${S}.provider_evidence_v1(uuid,uuid)`, `${S}.native_guards_valid()`, `${F}.policy_delegate()`];
  await db.sql(`update ${S}.bindings set enabled=true,project_binding=$1,definition_pins=(select jsonb_agg(jsonb_build_object(
    'signature',signature,'sha256',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),
    'owner',pg_get_userbyid(p.proowner),'isDefiner',p.prosecdef,'language',l.lanname,'volatility',p.provolatile::text,
    'resultType',pg_get_function_result(p.oid),'argumentNames',to_jsonb(coalesce(p.proargnames,array[]::text[])),
    'defaultCount',p.pronargdefaults,'config',coalesce(to_jsonb(p.proconfig),'null'::jsonb),
    'publicExecute',exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE'),
    'anonExecute',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticatedExecute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
    'serviceExecute',has_function_privilege('service_role',p.oid,'EXECUTE')) order by signature)
    from unnest($2::text[]) signature join pg_proc p on p.oid=to_regprocedure(signature) join pg_language l on l.oid=p.prolang)
    where singleton`, [project, signatures]);
}
async function witness(f: Fixture, mode: "self" | "admin" = "self", ttl = 600): Promise<Witness> {
  // Server-issued random attempt, never accepted from a browser-selected UUID.
  const actor = f.actor, target = mode === "self" ? actor : f.other, attempt = randomUUID();
  const ref = hash(randomUUID()), session = hash(randomUUID());
  const row = (await f.db.sql(`insert into ${F}.witnesses(ref,actor,target,mode,attempt,session_binding,policy_revision,issued_at,not_after)
    values($1,$2,$3,$4,$5,$6,$7,clock_timestamp(),clock_timestamp()+$8*interval '1 second')
    returning ${S}.utc(not_after) as expiry`, [ref, actor, target, mode, attempt, session, policy, ttl])).rows[0];
  return { actor, target, attempt, mode, context: { policyRevision: policy, assuranceRef: ref, sessionBinding: session,
    assuranceNotAfter: row.expiry, prepareNotAfter: row.expiry } };
}
async function prepare(f: Fixture, w: Witness) {
  const query = w.mode === "self" ? "select public.account_lifecycle_prepare_self($1,$2,$3::jsonb) as r"
    : "select public.account_lifecycle_prepare_admin($1,$4::uuid,$2,'authorized_admin_closure',$3::jsonb) as r";
  const args: unknown[] = [w.actor, w.attempt, JSON.stringify(w.context)]; if (w.mode === "admin") args.push(w.target);
  return (await f.db.asRole("service_role", query, args)).rows[0].r as Envelope;
}
function confirmQuery(w: Witness, r: Envelope): [string, unknown[]] {
  return [`select public.account_lifecycle_confirm_${w.mode}($1,$2,$3,$4,$5::jsonb) as r`,
    [w.actor, r.operationId, r.preview!.digest, r.version, JSON.stringify({ assuranceRef: w.context.assuranceRef, sessionBinding: w.context.sessionBinding })]];
}
async function confirm(f: Fixture, w: Witness, r: Envelope) { const [query, args] = confirmQuery(w, r); return (await f.db.asRole("service_role", query, args)).rows[0].r as Envelope; }
async function snapshot(f: Fixture) {
  return (await f.db.sql(`select jsonb_build_object('operations',(select coalesce(jsonb_agg(to_jsonb(o) order by id),'[]') from ${S}.operations o),
    'heads',(select coalesce(jsonb_agg(to_jsonb(h) order by target_id),'[]') from ${S}.subject_state h),
    'events',(select coalesce(jsonb_agg(to_jsonb(e) order by id),'[]') from ${S}.events e),
    'tickets',(select count(*) from ${S}.mutation_tickets)) as r`)).rows[0].r;
}
async function claim(f: Fixture, r: Envelope, execution = randomUUID()) {
  return (await f.db.sql(`select ${S}.claim_auth_delete($1,$2,$3) as r`, [r.operationId, r.version, execution])).rows[0].r;
}
async function evidence(f: Fixture, r: Envelope, execution: string, outcome: string, overrides: Record<string, unknown> = {}) {
  const receipt = hash(randomUUID());
  await f.db.sql(`insert into ${F}.evidence(operation,execution,payload) select id,$2,
    jsonb_build_object('protocol','account-lifecycle/provider-evidence/v1','operationId',id,'executionId',$2::uuid,'targetId',target_id,
      'requestDigest',request_sha256,'dispatchDigest',dispatch_sha256,'requestedDeleteMode',auth_delete_mode,'outcome',$3::text,
      'evidenceSha256',$4::text,'observedAt',${S}.utc(clock_timestamp()),'projectBinding',$5::text)||$6::jsonb
    from ${S}.operations where id=$1 on conflict(operation,execution) do update set payload=excluded.payload`,
  [r.operationId, execution, outcome, receipt, project, JSON.stringify(overrides)]);
  return receipt;
}
async function finish(f: Fixture, r: Envelope, execution: string, outcome: string, receipt: string) {
  return (await f.db.sql(`select ${S}.finish_auth_delete($1,$2,$3,$4) as r`, [r.operationId, execution, outcome, receipt])).rows[0].r as Envelope;
}
async function backend(f: Fixture, role: "postgres" | "service_role" = "service_role") {
  if (!f.pool) throw new Error("Independent backends require the standard owned mechanics profile");
  const c = await f.pool.connect(); await c.query("begin"); await c.query("set local role " + role);
  await c.query("set local statement_timeout='8s'"); return c;
}
async function waiting(f: Fixture, pid: number) {
  for (let i = 0; i < 100; i++) {
    if ((await f.db.sql("select exists(select 1 from pg_locks where pid=$1 and not granted) as waiting", [pid])).rows[0].waiting) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error("Owned backend did not reach its actual native lock wait");
}
async function release(...clients: PoolClient[]) { for (const c of clients) { try { await c.query("rollback"); } finally { c.release(); } } }

describe.sequential("owned native account lifecycle — NO live deletion authority", () => {
  pgIt("starts unavailable without any approved ports and refuses the target-shaped missing Auth row-lock privilege", async () => {
    for (const target of [false, true]) {
      const f = await boot(false, target);
      try {
        const before = await snapshot(f);
        const time = (await f.db.sql(`select ${S}.utc(clock_timestamp()+interval '5 minutes') as t`)).rows[0].t;
        const w: Witness = { actor: f.actor, target: f.actor, attempt: randomUUID(), mode: "self", context: {
          policyRevision: policy, assuranceRef: hash("not-a-qualified-witness"), sessionBinding: hash("unqualified"), assuranceNotAfter: time, prepareNotAfter: time } };
        const result = await prepare(f, w);
        expect(result).toEqual({ protocol: "account-lifecycle/v1", operationId: null, version: null, state: "unavailable",
          progress: { application: "not_started", providerSessions: "not_started", eligibleData: "unknown", retainedData: "unknown", authIdentity: "not_started" },
          preview: null, blockers: [target ? "assurance_unavailable" : "policy_unavailable"], nextAction: "authorized_review" });
        expect(await snapshot(f)).toEqual(before);
        expect((await f.db.sql(`select enabled,definition_pins from ${S}.bindings`)).rows).toEqual([{ enabled: false, definition_pins: [] }]);
        if (target) expect((await f.db.sql(`select ${S}.auth_lock_capable() as capable`)).rows[0].capable).toBe(false);
      } finally { await f.close(); }
    }
  }, 240_000);

  pgIt("persists an Auth-only preview once, validates actual issuedAttempt, and preserves scoped immutable retry/status", async () => {
    const f = await boot();
    try {
      expect((await f.db.sql("select to_regclass('public.research_members') is null as no_member_table")).rows[0].no_member_table).toBe(true);
      const w = await witness(f), result = await prepare(f, w);
      expect(result).toMatchObject({ protocol: "account-lifecycle/v1", version: 0, state: "confirmation_required", blockers: [], nextAction: "confirm" });
      expect(Object.keys(result).sort()).toEqual(["protocol", "operationId", "version", "state", "progress", "preview", "blockers", "nextAction"].sort());
      expect(result.preview).toMatchObject({ policyRevision: policy, digest: expect.stringMatching(/^[a-f0-9]{64}$/) });
      expect(result.preview!.expiresAt).toMatch(/\.\d{6}Z$/);
      const before = await snapshot(f);
      expect(await prepare(f, w)).toEqual(result);
      expect((await f.db.asRole("service_role", "select public.account_lifecycle_status_self($1,$2) as r", [w.actor, result.operationId])).rows[0].r).toEqual(result);
      expect(await snapshot(f)).toEqual(before);
      await expect(prepare(f, { ...w, context: { ...w.context, prepareNotAfter: "2099-01-01T00:00:00Z" } }))
        .rejects.toMatchObject({ code: "23505", message: "account_lifecycle_attempt_conflict" });
      await expect(f.db.asRole("service_role", "select public.account_lifecycle_status_self($1,$2)", [f.other, result.operationId]))
        .rejects.toMatchObject({ code: "42501", message: "account_lifecycle_forbidden" });
      const mismatched = await prepare(f, { ...w, attempt: randomUUID() });
      expect(mismatched).toMatchObject({ state: "unavailable", operationId: null, blockers: ["assurance_unavailable"] });
      const forged = await prepare(f, { ...w, actor: f.other, target: f.other, attempt: randomUUID() });
      expect(forged).toMatchObject({ state: "unavailable", operationId: null, blockers: ["assurance_unavailable"] });
      expect(await snapshot(f)).toEqual(before);
    } finally { await f.close(); }
  }, 240_000);

  pgIt("separates application closure from Auth deletion, with real CAS, immutable heads and no feature-off reopening", async () => {
    const f = await boot();
    try {
      const w = await witness(f), preview = await prepare(f, w), preparedSnapshot = await snapshot(f);
      await expect(confirm(f, w, { ...preview, version: preview.version + 1 }))
        .rejects.toMatchObject({ code: "P0001", message: "account_lifecycle_version_conflict" });
      expect(await snapshot(f)).toEqual(preparedSnapshot);
      const closed = await confirm(f, w, preview);
      expect(closed).toMatchObject({ operationId: preview.operationId, version: 1, state: "auth_deletion_pending", blockers: [],
        progress: { application: "verified", authIdentity: "pending" } });
      expect((await f.db.sql("select count(*)::int as n from auth.users where id=$1", [f.actor])).rows[0].n).toBe(1);
      const before = await snapshot(f);
      expect(await confirm(f, w, preview)).toEqual(closed);
      expect(await snapshot(f)).toEqual(before);
      await expect(f.db.sql(`update ${S}.subject_state set state='closing' where target_id=$1`, [f.actor]))
        .rejects.toMatchObject({ code: "42501", message: "account_lifecycle_immutable_closure" });
      await expect(f.db.sql(`delete from ${S}.subject_state where target_id=$1`, [f.actor]))
        .rejects.toMatchObject({ code: "42501", message: "account_lifecycle_retention_authority_required" });
      await f.db.sql(`update ${S}.bindings set enabled=false`);
      expect((await f.db.asRole("service_role", "select public.account_lifecycle_access_state($1) as r", [f.actor])).rows[0].r)
        .toEqual({ state: "closed", generation: 1 });
      await expect(f.db.sql(`select ${S}.guard_subject_after_auth($1)`, [f.actor])).rejects.toMatchObject({ code: "42501" });
      expect((await f.db.sql(`select ${S}.cleanup_eligible($1) as eligible`, [closed.operationId])).rows[0].eligible).toBe(false);
      expect(await snapshot(f)).toEqual(before);
    } finally { await f.close(); }
  }, 240_000);

  pgIt("keeps missing/unknown/held domain and incomplete coverage facts closed, without treating retained data as erased", async () => {
    const f = await boot();
    try {
      for (const domain of ["organizations", "staff", "care", "finance", "unknown_dependencies"]) {
        await f.db.sql(`update ${F}.settings set held_domain=$1,closure_hold=true`, [domain]);
        const w = await witness(f), result = await prepare(f, w);
        expect(result.state).toBe("blocked"); expect(result.preview).toBeNull(); expect(result.progress.application).toBe("not_started");
        expect(result.blockers).toContain(domain === "organizations" ? "last_owner_review" : domain === "staff" ? "shared_staff_review"
          : domain === "care" ? "clinical_retention" : domain === "finance" ? "financial_retention" : "legal_hold");
      }
      await f.db.sql(`update ${F}.settings set held_domain=null,closure_hold=false,unknown_domain='unknown_dependencies'`);
      expect((await prepare(f, await witness(f))).blockers).toContain("dependency_unknown");
      await f.db.sql(`update ${F}.settings set unknown_domain=null,coverage_ready=false`);
      expect((await prepare(f, await witness(f))).blockers).toContain("guard_coverage_unavailable");
      await f.db.sql(`update ${F}.settings set coverage_ready=true,finite_replay=false`);
      const w = await witness(f), prepared = await prepare(f, w), closed = await confirm(f, w, prepared);
      expect(closed).toMatchObject({ state: "blocked", progress: { application: "verified", authIdentity: "pending" } });
      expect(closed.blockers).toContain("replay_cleanup_unproven");
      expect((await claim(f, closed)).decision).toBe("blocked");
      expect((await f.db.sql(`select count(*)::int as n from ${S}.operations where execution_id is not null`)).rows[0].n).toBe(0);
      expect((await f.db.sql("select count(*)::int as n from auth.users")).rows[0].n).toBe(2);
    } finally { await f.close(); }
  }, 240_000);

  pgIt("reserves at most once across lost/different execution retries and reconciles only a bound owned provider receipt", async () => {
    const f = await boot();
    try {
      const w = await witness(f), ready = await confirm(f, w, await prepare(f, w)), reservation = await claim(f, ready);
      expect(reservation).toMatchObject({ decision: "reserved", deleteMode: "hard", status: { state: "auth_outcome_unknown", progress: { application: "verified", authIdentity: "unknown" } } });
      const execution = reservation.executionId as string, before = await snapshot(f);
      expect((await claim(f, ready, execution)).decision).toBe("already_reserved");
      expect((await claim(f, ready, randomUUID())).decision).toBe("already_reserved");
      expect(await snapshot(f)).toEqual(before);
      const uncertainHash = await evidence(f, ready, execution, "uncertain"), uncertain = await finish(f, ready, execution, "uncertain", uncertainHash);
      expect(uncertain).toMatchObject({ state: "auth_outcome_unknown", progress: { application: "verified", authIdentity: "unknown" }, blockers: ["provider_outcome_unknown"] });
      const uncertainSnapshot = await snapshot(f);
      expect(await finish(f, ready, execution, "uncertain", uncertainHash)).toEqual(uncertain);
      expect(await snapshot(f)).toEqual(uncertainSnapshot);
      const acceptedHash = await evidence(f, ready, execution, "provider_confirmed"), done = await finish(f, ready, execution, "provider_confirmed", acceptedHash);
      expect(done).toMatchObject({ state: "completed", blockers: [], nextAction: "none", progress: { application: "verified", authIdentity: "verified", retainedData: "not_applicable" } });
      const complete = await snapshot(f);
      expect(await finish(f, ready, execution, "provider_confirmed", acceptedHash)).toEqual(done);
      await expect(finish(f, ready, execution, "uncertain", uncertainHash)).rejects.toMatchObject({ code: "23505", message: "account_lifecycle_evidence_conflict" });
      expect(await snapshot(f)).toEqual(complete);
      // This was a synthetic adapter receipt, NOT a real provider deletion.
      expect((await f.db.sql("select count(*)::int as n from auth.users where id=$1", [f.actor])).rows[0].n).toBe(1);
      expect((await f.db.sql(`select ${S}.cleanup_eligible($1) as eligible`, [done.operationId])).rows[0].eligible).toBe(false);
    } finally { await f.close(); }
  }, 240_000);

  pgIt("refuses wrong target/project/mode/dispatch and pre-reservation receipts while retaining the unknown execution", async () => {
    const f = await boot();
    try {
      const w = await witness(f), ready = await confirm(f, w, await prepare(f, w)), reservation = await claim(f, ready), execution = reservation.executionId as string;
      for (const override of [{ targetId: f.other }, { projectBinding: hash("different project") }, { requestedDeleteMode: "soft" },
        { dispatchDigest: hash("different dispatch") }, { observedAt: "2000-01-01T00:00:00Z" }, { unapprovedExtraField: true }]) {
        const receipt = await evidence(f, ready, execution, "provider_confirmed", override), result = await finish(f, ready, execution, "provider_confirmed", receipt);
        expect(result.state).toBe("blocked"); expect(result.progress.authIdentity).toBe("unknown");
        expect(result.blockers).toContain("provider_outcome_unknown"); expect((await claim(f, result)).decision).toBe("already_reserved");
      }
      await f.db.sql(`update ${F}.settings set retained='retained',held_domain='finance'`);
      // A synthetic retention classification with explicit resolved Auth refs
      // does not manufacture a paid/financial row or rewrite reservation mode.
      const receipt = await evidence(f, ready, execution, "auth_absent_verified"), result = await finish(f, ready, execution, "auth_absent_verified", receipt);
      expect(result).toMatchObject({ state: "completed_with_retention", progress: { authIdentity: "verified", retainedData: "retained" } });
      expect((await f.db.sql(`select auth_delete_mode from ${S}.operations where id=$1`, [ready.operationId])).rows[0].auth_delete_mode).toBe("hard");
    } finally { await f.close(); }
  }, 240_000);

  pgIt("denies raw role/table/provider setters and generic nonce forgery; native incomplete or cross-backend capabilities cannot commit", async () => {
    const f = await boot();
    try {
      const w = await witness(f), prepared = await prepare(f, w), before = await snapshot(f);
      for (const role of ["anon", "authenticated"] as const) {
        await expect(f.db.asRole(role, "select public.account_lifecycle_prepare_self($1,$2,$3::jsonb)", [w.actor, w.attempt, JSON.stringify(w.context)]))
          .rejects.toMatchObject({ code: "42501" });
      }
      await expect(f.db.asRole("service_role", `select * from ${S}.operations`)).rejects.toMatchObject({ code: "42501" });
      await expect(f.db.asRole("service_role", `select ${S}.claim_auth_delete($1,$2,$3)`, [prepared.operationId, prepared.version, randomUUID()]))
        .rejects.toMatchObject({ code: "42501" });
      await expect(f.db.sql(`delete from ${S}.operations where id=$1`, [prepared.operationId]))
        .rejects.toMatchObject({ code: "42501", message: "account_lifecycle_retention_authority_required" });
      const a = await backend(f, "postgres"), b = await backend(f, "postgres");
      try {
        await a.query(`select ${S}.open_frame($1)`, [prepared.operationId]);
        const nonce = (await a.query("select current_setting('xenios.account_lifecycle_nonce') as n")).rows[0].n;
        await b.query("select set_config('xenios.account_lifecycle_nonce',$1,true)", [nonce]);
        await expect(b.query(`update ${S}.operations set version=version+1 where id=$1`, [prepared.operationId]))
          .rejects.toMatchObject({ code: "42501", message: "account_lifecycle_native_frame_required" });
        await b.query("rollback");
        await expect(a.query("commit")).rejects.toMatchObject({ code: "55000", message: "account_lifecycle_incomplete_transaction" });
      } finally { await release(a, b); }
      expect(await snapshot(f)).toEqual(before);
      const invalid = await backend(f, "postgres");
      try {
        await invalid.query(`select ${S}.open_frame($1)`, [prepared.operationId]);
        await expect(invalid.query(`update ${S}.operations set state='completed',version=version+1 where id=$1`, [prepared.operationId]))
          .rejects.toMatchObject({ code: "22023", message: "account_lifecycle_invalid_state" });
      } finally { await release(invalid); }
      expect(await snapshot(f)).toEqual(before);
    } finally { await f.close(); }
  }, 240_000);

  pgIt("rolls back the actual operation/ticket insert if audit persistence fails, and refuses immediate capability leakage", async () => {
    const f = await boot();
    try {
      const w = await witness(f), before = await snapshot(f);
      // Owned DB-failure injection, not a fake domain adapter success.
      await f.db.sql(`alter table ${S}.events add constraint owned_audit_failure check(false)`);
      await expect(prepare(f, w)).rejects.toMatchObject({ code: "23514" });
      expect(await snapshot(f)).toEqual(before);
      await f.db.sql(`alter table ${S}.events drop constraint owned_audit_failure`);
      const c = await backend(f);
      try {
        await c.query("set constraints all immediate");
        await expect(c.query("select public.account_lifecycle_prepare_self($1,$2,$3::jsonb)", [w.actor, w.attempt, JSON.stringify(w.context)]))
          .rejects.toMatchObject({ code: "55000", message: "account_lifecycle_incomplete_transaction" });
      } finally { await release(c); }
      expect(await snapshot(f)).toEqual(before);
      expect((await prepare(f, w)).state).toBe("confirmation_required");
    } finally { await f.close(); }
  }, 240_000);

  pgIt("rejects current policy/provenance/assurance/delegate drift and exact native guard detachment without renewing attempts", async () => {
    const f = await boot();
    try {
      const w = await witness(f), prepared = await prepare(f, w);
      const definition = (await f.db.sql(`select pg_get_functiondef('${F}.policy_delegate()'::regprocedure) as d`)).rows[0].d as string;
      const drift = definition.replace(/AS\s+(\$[A-Za-z_0-9]*\$)/, (_match, tag: string) => "AS " + tag + "\n-- OWNED delegate drift\n");
      expect(drift).not.toBe(definition); await f.db.sql(drift);
      const blocked = await confirm(f, w, prepared);
      expect(blocked).toMatchObject({ operationId: prepared.operationId, state: "blocked", blockers: ["policy_unavailable"] });
      expect((await f.db.sql(`select count(*)::int as n from ${S}.subject_state`)).rows[0].n).toBe(0);
      await f.db.sql(definition);
      const fresh = await witness(f), freshPreview = await prepare(f, fresh);
      await f.db.sql(`update ${F}.settings set policy_revision=$1`, [hash("rotated policy")]);
      expect(await confirm(f, fresh, freshPreview)).toMatchObject({ state: "blocked", blockers: ["policy_changed"] });
      await f.db.sql(`update ${F}.settings set policy_revision=$1,policy_override='null'::jsonb`, [policy]);
      expect((await prepare(f, await witness(f))).state).toBe("unavailable");
      await f.db.sql(`update ${F}.settings set policy_override=null,published_at=clock_timestamp()+interval '1 hour'`);
      expect((await prepare(f, await witness(f))).blockers).toEqual(["policy_unavailable"]);
      await f.db.sql(`update ${F}.settings set published_at=clock_timestamp()-interval '1 second'`);
      const known = await witness(f), knownPreview = await prepare(f, known), before = await snapshot(f);
      const trigger = (await f.db.sql(`select pg_get_triggerdef(oid) as d from pg_trigger where tgrelid='${S}.mutation_tickets'::regclass
        and tgname='account_lifecycle_ticket_must_close'`)).rows[0].d as string;
      try {
        await f.db.sql(`drop trigger account_lifecycle_ticket_must_close on ${S}.mutation_tickets`);
        const newAttempt = await prepare(f, await witness(f));
        expect(newAttempt).toMatchObject({ state: "unavailable", blockers: ["guard_coverage_unavailable"] });
        await expect(confirm(f, known, knownPreview)).rejects.toMatchObject({ code: "55000", message: "account_lifecycle_guard_unavailable" });
        expect(await snapshot(f)).toEqual(before);
      } finally { await f.db.sql(trigger); }
      expect((await f.db.sql(`select ${S}.native_guards_valid() as valid`)).rows[0].valid).toBe(true);
      for (const [grant, revoke] of [
        [`grant select on ${S}.operations to service_role`, `revoke select on ${S}.operations from service_role`],
        [`grant execute on function ${S}.claim_auth_delete(uuid,bigint,uuid) to service_role`,
          `revoke execute on function ${S}.claim_auth_delete(uuid,bigint,uuid) from service_role`],
      ]) {
        try {
          await f.db.sql(grant);
          expect((await prepare(f, await witness(f))).blockers).toEqual(["guard_coverage_unavailable"]);
          await expect(confirm(f, known, knownPreview)).rejects.toMatchObject({ code: "55000", message: "account_lifecycle_guard_unavailable" });
          expect(await snapshot(f)).toEqual(before);
        } finally { await f.db.sql(revoke); }
      }
      expect((await f.db.sql(`select ${S}.native_guards_valid() as valid`)).rows[0].valid).toBe(true);
    } finally { await f.close(); }
  }, 240_000);

  pgIt("makes same-target alternate confirmations contend on real backends and closes exactly one immutable operation", async () => {
    const f = await boot();
    try {
      const firstWitness = await witness(f), secondWitness = await witness(f);
      const first = await prepare(f, firstWitness), second = await prepare(f, secondWitness);
      const a = await backend(f), b = await backend(f);
      try {
        const [qa, va] = confirmQuery(firstWitness, first), [qb, vb] = confirmQuery(secondWitness, second);
        const winner = (await a.query(qa, va)).rows[0].r;
        expect(winner.progress.application).toBe("verified");
        const pid = (await b.query("select pg_backend_pid() as pid")).rows[0].pid as number;
        const pending = b.query(qb, vb); await waiting(f, pid); await a.query("commit");
        const loser = (await pending).rows[0].r; await b.query("commit");
        expect(loser).toMatchObject({ operationId: second.operationId, state: "blocked", blockers: ["attempt_conflict"] });
      } finally { await release(a, b); }
      expect((await f.db.sql(`select operation_id,generation from ${S}.subject_state where target_id=$1`, [f.actor])).rows)
        .toEqual([{ operation_id: first.operationId, generation: "1" }]);
      expect((await f.db.sql(`select count(*)::int as n from ${S}.mutation_tickets`)).rows[0].n).toBe(0);
    } finally { await f.close(); }
  }, 240_000);

  pgIt("uses Auth-before-subject locks against a real guarded writer in both orderings and never revives it on flag restoration", async () => {
    for (const writerFirst of [true, false]) {
      const f = await boot();
      try {
        const w = await witness(f), prepared = await prepare(f, w), a = await backend(f, "postgres"), b = await backend(f, "postgres");
        try {
          if (writerFirst) {
            await a.query(`select ${F}.guarded_bind($1)`, [f.actor]);
            await b.query("set local role service_role");
            const [query, args] = confirmQuery(w, prepared), pid = (await b.query("select pg_backend_pid() as pid")).rows[0].pid as number;
            const close = b.query(query, args); await waiting(f, pid); await a.query("commit");
            expect((await close).rows[0].r.progress.application).toBe("verified"); await b.query("commit");
          } else {
            await a.query("set local role service_role"); const [query, args] = confirmQuery(w, prepared); await a.query(query, args);
            const pid = (await b.query("select pg_backend_pid() as pid")).rows[0].pid as number;
            const denied = b.query(`select ${F}.guarded_bind($1)`, [f.actor]);
            const captured = denied.then(value => ({ value }), error => ({ error }));
            await waiting(f, pid); await a.query("commit");
            expect(await captured).toMatchObject({ error: { code: "42501", message: "account_lifecycle_forbidden" } });
          }
        } finally { await release(a, b); }
        expect((await f.db.sql(`select count(*)::int as n from ${F}.relationships`)).rows[0].n).toBe(writerFirst ? 1 : 0);
        await f.db.sql(`update ${S}.bindings set enabled=false`);
        await expect(f.db.sql(`select ${F}.guarded_bind($1)`, [f.actor])).rejects.toMatchObject({ code: "42501" });
        await f.db.sql(`update ${S}.bindings set enabled=true`);
        await expect(f.db.sql(`select ${F}.guarded_bind($1)`, [f.actor])).rejects.toMatchObject({ code: "42501" });
      } finally { await f.close(); }
    }
  }, 360_000);

  pgIt("rechecks actual expiry after a real global-lock wait and rejects repeatable-read clearance", async () => {
    const f = await boot();
    try {
      const w = await witness(f, "self", 1), a = await backend(f, "postgres"), b = await backend(f);
      try {
        await a.query("select pg_advisory_xact_lock(9042026,1)");
        const pid = (await b.query("select pg_backend_pid() as pid")).rows[0].pid as number;
        const pending = b.query("select public.account_lifecycle_prepare_self($1,$2,$3::jsonb) as r", [w.actor, w.attempt, JSON.stringify(w.context)]);
        await waiting(f, pid); await a.query("select pg_sleep(1.1)"); await a.query("commit");
        expect((await pending).rows[0].r).toMatchObject({ state: "unavailable", blockers: ["recent_auth_required"] }); await b.query("commit");
      } finally { await release(a, b); }
      expect((await snapshot(f)).operations).toEqual([]);
      const c = await backend(f), fresh = await witness(f);
      try {
        await c.query("set transaction isolation level repeatable read");
        await expect(c.query("select public.account_lifecycle_prepare_self($1,$2,$3::jsonb)", [fresh.actor, fresh.attempt, JSON.stringify(fresh.context)]))
          .rejects.toMatchObject({ code: "25000", message: "account_lifecycle_read_committed_required" });
      } finally { await release(c); }
      expect((await snapshot(f)).operations).toEqual([]);
    } finally { await f.close(); }
  }, 240_000);

  pgIt("conserves actual Pack02 Auth foreign keys and two-organization relationships; tenant removal is not global account closure", async () => {
    const f = await boot();
    try {
      await f.db.bootstrapCanonicalCore();
      await f.db.sql(pinnedSql(canonicalPins.foundation));
      const first = randomUUID(), second = randomUUID();
      await f.db.sql(`insert into public.research_account_organizations(id,slug,legal_name,display_name,purchasing_email,billing_email)
        values($1,'owned-a','Owned A','Owned A','a@example.invalid','a@example.invalid'),
          ($2,'owned-b','Owned B','Owned B','b@example.invalid','b@example.invalid')`, [first, second]);
      await f.db.sql(`insert into public.research_organization_users(organization_id,auth_user_id,email_at_binding,roles,state,binding_method,bound_by)
        values($1,$3,$3::text||'@example.invalid',array['organization_admin'],'active','operator_verified_auth_user','OWNED synthetic binding'),
          ($2,$3,$3::text||'@example.invalid',array['business_buyer'],'active','operator_verified_auth_user','OWNED synthetic binding')`, [first, second, f.actor]);
      const before = (await f.db.sql(`select to_jsonb(o) as r from public.research_organization_users o where organization_id=$1`, [second])).rows;
      // Genuine native FK refusal, with no copied Auth/provider deletion routine.
      await expect(f.db.sql("delete from auth.users where id=$1", [f.actor])).rejects.toMatchObject({ code: "23503" });
      await f.db.sql(`update public.research_organization_users set state='revoked',revoked_at=clock_timestamp()
        where organization_id=$1 and auth_user_id=$2`, [first, f.actor]);
      expect((await f.db.sql(`select to_jsonb(o) as r from public.research_organization_users o where organization_id=$1`, [second])).rows).toEqual(before);
      expect((await f.db.sql("select count(*)::int as n from auth.users where id=$1", [f.actor])).rows[0].n).toBe(1);
      // An organization_admin row supplies no global-other-user authority.
      const admin = await witness(f, "admin"), denied = await prepare(f, admin);
      expect(denied).toMatchObject({ state: "unavailable", operationId: null, blockers: ["admin_authority_unavailable"] });
      // The actual Pack02 writers have NOT adopted the lifecycle fence. Admit
      // that missing coverage instead of presenting a fabricated closed account.
      await f.db.sql(`update ${F}.settings set coverage_ready=false,auth_fks=false`);
      expect(await prepare(f, await witness(f))).toMatchObject({ state: "blocked", progress: { application: "not_started" }, blockers: ["guard_coverage_unavailable"] });
      expect((await f.db.sql(`select count(*)::int as n from ${S}.subject_state`)).rows[0].n).toBe(0);
      expect((await f.db.sql(`select count(*)::int as n from public.research_orders`)).rows[0].n).toBe(0);
      expect((await f.db.sql(`select count(*)::int as n from public.research_account_binding_events`)).rows[0].n).toBe(0);
    } finally { await f.close(); }
  }, 300_000);

  pgIt("preserves actual mixed Care FK/audit semantics and refuses treating a clinical retention hold as deletion clearance", async () => {
    const f = await boot();
    try {
      // Replace only the inherited synthetic Care placeholders, on this owned
      // disposable DB, with the complete pinned canonical foundation.
      await f.db.sql("drop table public.care_role_assignments; drop table public.care_capabilities");
      await f.db.sql(pinnedSql(canonicalPins.care));
      await f.db.sql(`insert into public.care_role_assignments(user_id,role,granted_by) values($1,'clinical_support',$2)`, [f.other, f.actor]);
      await f.db.sql(`insert into public.care_access_audit(actor_user_id,permission,outcome) values($1,'care:support_assigned','forbidden')`, [f.actor]);
      await f.db.sql("update public.care_capabilities set approved_by=$1 where capability_key='care'", [f.actor]);
      const before = (await f.db.sql(`select jsonb_build_object('roles',(select jsonb_agg(to_jsonb(r)) from public.care_role_assignments r),
        'audit',(select jsonb_agg(to_jsonb(a)) from public.care_access_audit a),'capabilities',(select jsonb_agg(to_jsonb(c)) from public.care_capabilities c)) as r`)).rows[0].r;
      await expect(f.db.sql("delete from auth.users where id=$1", [f.actor])).rejects.toMatchObject({ code: "23503" });
      expect((await f.db.sql(`select jsonb_build_object('roles',(select jsonb_agg(to_jsonb(r)) from public.care_role_assignments r),
        'audit',(select jsonb_agg(to_jsonb(a)) from public.care_access_audit a),'capabilities',(select jsonb_agg(to_jsonb(c)) from public.care_capabilities c)) as r`)).rows[0].r).toEqual(before);
      await f.db.sql(`update ${F}.settings set held_domain='care',closure_hold=true,auth_fks=false`);
      expect(await prepare(f, await witness(f))).toMatchObject({ state: "blocked", blockers: ["clinical_retention"], progress: { application: "not_started" } });
      expect((await f.db.sql(`select count(*)::int as n from ${S}.subject_state`)).rows[0].n).toBe(0);
      expect((await f.db.sql("select count(*)::int as n from auth.users where id=any($1::uuid[])", [[f.actor, f.other]])).rows[0].n).toBe(2);
    } finally { await f.close(); }
  }, 240_000);

  pgIt("requires a separate current global authority for admin prepare/status and scopes self status to its own operation", async () => {
    const f = await boot();
    try {
      const w = await witness(f, "admin");
      expect((await prepare(f, w)).state).toBe("unavailable");
      await f.db.sql(`update ${F}.settings set admin_allowed=true`);
      const prepared = await prepare(f, w);
      expect(prepared).toMatchObject({ state: "confirmation_required", version: 0 });
      const context = { assuranceRef: w.context.assuranceRef, sessionBinding: w.context.sessionBinding };
      expect((await f.db.asRole("service_role", "select public.account_lifecycle_status_admin($1,$2,$3::jsonb) as r",
        [w.actor, prepared.operationId, JSON.stringify(context)])).rows[0].r).toEqual(prepared);
      await expect(f.db.asRole("service_role", "select public.account_lifecycle_status_self($1,$2)", [w.target, prepared.operationId]))
        .rejects.toMatchObject({ code: "42501" });
      await expect(f.db.asRole("service_role", "select public.account_lifecycle_status_admin($1,$2,$3::jsonb)",
        [w.target, prepared.operationId, JSON.stringify(context)])).rejects.toMatchObject({ code: "42501" });
      // Status uses CURRENT global-status authority; an expired original
      // preparation witness is neither renewed nor treated as present authority.
      await f.db.sql(`update ${F}.witnesses set not_after=clock_timestamp()-interval '1 second' where ref=$1`, [w.context.assuranceRef]);
      await expect(f.db.asRole("service_role", "select public.account_lifecycle_status_admin($1,$2,$3::jsonb)",
        [w.actor, prepared.operationId, JSON.stringify(context)])).rejects.toMatchObject({ code: "42501" });
      await f.db.sql(`update ${F}.witnesses set issued_at=clock_timestamp(),not_after=clock_timestamp()+interval '1 minute',policy_revision=$2 where ref=$1`,
        [w.context.assuranceRef, hash("OWNED rotated status authority")]);
      expect((await f.db.asRole("service_role", "select public.account_lifecycle_status_admin($1,$2,$3::jsonb) as r",
        [w.actor, prepared.operationId, JSON.stringify(context)])).rows[0].r).toEqual(prepared);
      expect((await f.db.sql(`select count(*)::int as n from ${S}.subject_state`)).rows[0].n).toBe(0);
    } finally { await f.close(); }
  }, 240_000);

  pgIt("preserves blocked reserved uncertainty on current/stale confirmation, actual expiry and readiness restoration", async () => {
    const f = await boot();
    try {
      const w = await witness(f, "self", 4), preview = await prepare(f, w), ready = await confirm(f, w, preview);
      const reservation = await claim(f, ready), execution = reservation.executionId as string;
      const receipt = await evidence(f, ready, execution, "provider_confirmed", { targetId: f.other });
      const blocked = await finish(f, ready, execution, "provider_confirmed", receipt);
      expect(blocked).toMatchObject({ state: "blocked", progress: { application: "verified", authIdentity: "unknown" } });
      expect(blocked.blockers).toContain("provider_outcome_unknown");
      const before = await snapshot(f), latest = { ...blocked, preview: preview.preview };
      expect(await confirm(f, w, latest)).toEqual(blocked);
      expect(await confirm(f, w, preview)).toEqual(blocked);
      expect(await snapshot(f)).toEqual(before);
      expect((await f.db.sql(`select execution_id,execution_state from ${S}.operations where id=$1`, [blocked.operationId])).rows)
        .toEqual([{ execution_id: execution, execution_state: "reserved" }]);

      const definition = (await f.db.sql(`select pg_get_functiondef('${S}.provider_evidence_v1(uuid,uuid)'::regprocedure) as d`)).rows[0].d as string;
      const drift = definition.replace(/AS\s+(\$[A-Za-z_0-9]*\$)/, (_match, tag: string) => "AS " + tag + "\n-- OWNED temporarily unready receipt port\n");
      expect(drift).not.toBe(definition);
      try {
        await f.db.sql(drift);
        await f.db.sql(`update ${S}.bindings set enabled=false`);
        expect(await confirm(f, w, latest)).toEqual(blocked);
        // Wait only for this genuine immutable native preview expiry. No clock
        // rewriting, fabricated stale context or wider operation timeout.
        await f.db.sql("select pg_sleep(greatest(0,extract(epoch from ($1::timestamptz-clock_timestamp())))+0.01)", [preview.preview!.expiresAt]);
        expect((await f.db.sql("select $1::timestamptz<=clock_timestamp() as expired", [preview.preview!.expiresAt])).rows[0].expired).toBe(true);
        expect(await confirm(f, w, latest)).toEqual(blocked);
      } finally {
        await f.db.sql(definition);
        await f.db.sql(`update ${S}.bindings set enabled=true`);
      }
      expect((await f.db.sql(`select ${S}.ports_valid(true) as valid`)).rows[0].valid).toBe(true);
      expect(await confirm(f, w, latest)).toEqual(blocked);
      expect(await confirm(f, w, preview)).toEqual(blocked);
      expect(await snapshot(f)).toEqual(before);
      expect((await claim(f, blocked, randomUUID())).decision).toBe("already_reserved");
      expect(await snapshot(f)).toEqual(before);

      // The native invariant rejects pending with an existing reservation even
      // inside an otherwise valid owner transaction capability.
      const c = await backend(f, "postgres");
      try {
        await c.query(`select ${S}.open_frame($1)`, [blocked.operationId]);
        await expect(c.query(`update ${S}.operations set state='auth_deletion_pending',
          progress=jsonb_set(progress,'{authIdentity}','"pending"'::jsonb),blockers='{}',next_action='wait',version=version+1 where id=$1`, [blocked.operationId]))
          .rejects.toMatchObject({ code: "22023", message: "account_lifecycle_invalid_state" });
      } finally { await release(c); }
      expect(await snapshot(f)).toEqual(before);
      expect((await f.db.asRole("service_role", "select public.account_lifecycle_access_state($1) as r", [f.actor])).rows[0].r.state).toBe("closed");
    } finally { await f.close(); }
  }, 240_000);

  pgIt("returns the committed same-operation closure after an actual second confirmation lock wait without a new version or event", async () => {
    const f = await boot();
    try {
      const w = await witness(f), preview = await prepare(f, w), a = await backend(f), b = await backend(f);
      try {
        const [query, args] = confirmQuery(w, preview), winner = (await a.query(query, args)).rows[0].r;
        const pid = (await b.query("select pg_backend_pid() as pid")).rows[0].pid as number;
        const pending = b.query(query, args).then(value => ({ value }), error => ({ error }));
        await waiting(f, pid); await a.query("commit");
        const result = await pending;
        expect(result).toHaveProperty("value.rows.0.r", winner);
        await b.query("commit");
        expect(await confirm(f, w, preview)).toEqual(winner);
        expect((await snapshot(f)).operations).toHaveLength(1);
        expect((await snapshot(f)).events).toHaveLength(2);
        expect((await f.db.sql(`select version,execution_id from ${S}.operations where id=$1`, [winner.operationId])).rows)
          .toEqual([{ version: "1", execution_id: null }]);
      } finally { await release(a, b); }
    } finally { await f.close(); }
  }, 240_000);
});
