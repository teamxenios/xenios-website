/** Real candidate SQL and canonical prelaunch DDL on owned PostgreSQL17 only.
 * Auth rows/claims are synthetic. This does not qualify managed GoTrue, actual
 * MFA, a real role grant, a browser, or managed installation/activation. */
import { readFileSync } from "node:fs";
import { expect } from "vitest";
import { createDurableJourneyFixture, pg16It, OPERATOR, OTHER_ACTOR } from "./assisted-order/request-intent/durable-journey.pg.fixture";

const SQL = "supabase/candidates/admin_account_session.sql";
const sessionId = "80000000-0000-4000-8000-000000000001";
const otherSessionId = "80000000-0000-4000-8000-000000000002";
const statement = "select public.research_admin_account_read_current($1::uuid,$2::uuid) as value";

for (const image of ["postgres:17.6", "postgres:17.11"] as const) {
  pg16It(`qualifies service-only canonical account session/role liveness on ${image}`, async () => {
    const db = createDurableJourneyFixture();
    try {
      await db.start({ dockerOnly: true, managedCareSchema: true, image });
      await db.sql("create table auth.sessions(id uuid primary key,user_id uuid not null references auth.users(id),not_after timestamptz,aal text)");
      await db.sql(readFileSync("supabase/research-prelaunch-foundation.sql", "utf8"));
      await db.sql("insert into auth.sessions values($1,$2,now()+interval '1 hour','aal2'),($3,$4,null,'aal2')", [sessionId, OPERATOR, otherSessionId, OTHER_ACTOR]);
      await db.sql("insert into public.research_prelaunch_role_assignments(auth_user_id,role,assigned_by,reason) values($1,'super_admin','synthetic-fixture','Synthetic qualification')", [OPERATOR]);
      await db.sql(readFileSync(SQL, "utf8"));
      const current = async (actor: string | null = OPERATOR, session: string | null = sessionId) =>
        (await db.asRole("service_role", statement, [actor, session])).rows[0].value;
      const before = async () => (await db.sql(`select
        (select jsonb_agg(to_jsonb(s) order by id) from auth.sessions s) as sessions,
        (select jsonb_agg(to_jsonb(r) order by id) from public.research_prelaunch_role_assignments r) as roles,
        (select count(*)::int from public.research_prelaunch_access_audit) as audit,
        (select count(*)::int from auth.users) as users`)).rows[0];

      const snapshot = await before();
      expect(await current()).toBe(true);
      expect(await current(null)).toBe(false);
      expect(await current(OPERATOR, null)).toBe(false);
      expect(await current(OTHER_ACTOR, sessionId)).toBe(false);
      expect(await current(OPERATOR, otherSessionId)).toBe(false);
      expect(await current(OTHER_ACTOR, otherSessionId)).toBe(false);
      expect(await before()).toEqual(snapshot);

      // An unrelated persisted platform role is not global account authority.
      for (const role of ["internal_team", "product_admin", "operations_admin", "clinical_admin", "approved_internal_reviewer"]) {
        await db.sql("update public.research_prelaunch_role_assignments set role=$1 where auth_user_id=$2", [role, OPERATOR]);
        expect(await current()).toBe(false);
      }
      await db.sql("update public.research_prelaunch_role_assignments set role='super_admin' where auth_user_id=$1", [OPERATOR]);
      expect(await current()).toBe(true);
      await db.sql("update public.research_prelaunch_role_assignments set expires_at=now()-interval '1 second',granted_at=now()-interval '1 hour' where auth_user_id=$1", [OPERATOR]);
      expect(await current()).toBe(false);
      await db.sql("update public.research_prelaunch_role_assignments set expires_at=null,granted_at=now()+interval '1 hour' where auth_user_id=$1", [OPERATOR]);
      expect(await current()).toBe(false);
      await db.sql("update public.research_prelaunch_role_assignments set granted_at=now()-interval '1 hour',revoked_at=now(),revoked_by='synthetic-fixture',revocation_reason='Synthetic revocation' where auth_user_id=$1", [OPERATOR]);
      expect(await current()).toBe(false);
      await db.sql("update public.research_prelaunch_role_assignments set revoked_at=null,revoked_by=null,revocation_reason=null where auth_user_id=$1", [OPERATOR]);
      expect(await current()).toBe(true);

      await db.sql("update auth.sessions set aal='aal1' where id=$1", [sessionId]);
      expect(await current()).toBe(false);
      await db.sql("update auth.sessions set aal='aal2',not_after=now()-interval '1 second' where id=$1", [sessionId]);
      expect(await current()).toBe(false);
      await db.sql("update auth.sessions set not_after=null where id=$1", [sessionId]);
      expect(await current()).toBe(true);
      await db.sql("delete from auth.sessions where id=$1", [sessionId]);
      expect(await current()).toBe(false);
      await db.sql("insert into auth.sessions values($1,$2,null,'aal2')", [sessionId, OPERATOR]);
      expect(await current()).toBe(true);

      // ACL and in-function backend checks both matter; no new table SELECT
      // privileges are needed by the service-only boolean bridge.
      for (const role of ["anon", "authenticated"] as const) {
        await expect(db.asRole(role, statement, [OPERATOR, sessionId])).rejects.toMatchObject({ code: "42501" });
      }
      await expect(db.asRole("service_role", statement, [OPERATOR, sessionId], OPERATOR)).rejects.toMatchObject({ code: "42501" });
      await expect(db.sql(statement, [OPERATOR, sessionId])).rejects.toMatchObject({ code: "42501" });
      await expect(db.asRole("service_role", "select id from auth.sessions limit 1")).rejects.toMatchObject({ code: "42501" });
      const acl = (await db.sql(`select prosecdef,
        proconfig=array['search_path=""']::text[] as closed_path,
        has_function_privilege('anon',oid,'execute') as anon,
        has_function_privilege('authenticated',oid,'execute') as authenticated,
        has_function_privilege('service_role',oid,'execute') as service
        from pg_proc where oid='public.research_admin_account_read_current(uuid,uuid)'::regprocedure`)).rows[0];
      expect(acl).toEqual({ prosecdef: true, closed_path: true, anon: false, authenticated: false, service: true });
      const afterFailures = await before();
      expect(afterFailures.users).toBe(snapshot.users);
      expect(afterFailures.audit).toBe(snapshot.audit);
      expect(await current()).toBe(true);
    } finally { await db.close(); }
  }, 120_000);
}
