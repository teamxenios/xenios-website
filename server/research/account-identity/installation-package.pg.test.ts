import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { createDurableJourneyFixture } from "../assisted-order/request-intent/durable-journey.pg.fixture";
import { ACCOUNT_CORE_COLUMNS } from "./account-prerequisites.pg.fixture";
import { ACCOUNT_INSTALLATION_SOURCE_PINS, buildAccountInstallationPackage } from "./installation-package";

const pgIt = process.env.CI || process.env.XENIOS_ACCOUNT_ATOMIC_PACKAGE_PG17_11 === "1" ? it : it.skip;
const foundationTables = ["research_account_organizations", "research_organization_users", "research_organization_invitations",
  "research_account_claim_challenges", "research_customer_account_bindings", "research_organization_order_ownership",
  "research_account_binding_events", "research_organization_request_again"];
const tables = [...Object.keys(ACCOUNT_CORE_COLUMNS), ...foundationTables];
const routines = ["research_bind_verified_organization_user", "research_account_commit_customer_claim", "research_account_accept_organization_invitation",
  "research_organization_order_ownership_validate", "research_account_binding_events_immutable", "research_organization_request_again_validate"];

/** Closed owned17.11 ONLY. Synthetic Auth + explicitly granted fixture DDL
 * capabilities do not establish the actual managed postgres privileges/native
 * hooks, provider history, live Auth/PostgREST or a reviewed core ACL policy. */
pgIt("keeps the complete five-source package atomic under an owned NOSUPERUSER+BYPASSRLS installer", async () => {
  const owned = createDurableJourneyFixture(), password = randomUUID();
  const artifact = buildAccountInstallationPackage(ACCOUNT_INSTALLATION_SOURCE_PINS.map(pin => ({
    path: pin.path, sql: readFileSync(resolve(process.cwd(), pin.path), "utf8"),
  })));
  const closure = async () => (await owned.sql(`select
    (select count(*)::int from pg_class c where c.relnamespace='public'::regnamespace and c.relname=any($1::text[])) as tables,
    (select count(*)::int from pg_proc p where p.pronamespace='public'::regnamespace and p.proname=any($2::text[])) as routines,
    to_regclass('public.research_account_binding_events_id_seq') is not null as sequence`, [tables, routines])).rows[0];
  const defaults = async () => (await owned.sql(`select jsonb_agg(jsonb_build_array(defaclrole,defaclnamespace,defaclobjtype,defaclacl::text)
    order by defaclrole,defaclnamespace,defaclobjtype) as value from pg_default_acl`)).rows[0].value;
  const legacy = async () => (await owned.sql(`select jsonb_build_object('owner',relowner,'acl',relacl::text,'rls',relrowsecurity,
    'columns',(select jsonb_agg(jsonb_build_array(attname,atttypid,attnotnull) order by attnum) from pg_attribute where attrelid=c.oid and attnum>0 and not attisdropped),
    'policies',(select jsonb_agg(jsonb_build_array(polname,polroles,pg_get_expr(polqual,polrelid)) order by polname) from pg_policy where polrelid=c.oid),
    'rows',(select jsonb_agg(to_jsonb(o)) from public.research_organizations o)) as value
    from pg_class c where c.oid='public.research_organizations'::regclass`)).rows[0].value;
  try {
    // The existing helper enforces owned loopback Docker and actual170011.
    // No arbitrary URL/image/native binary fallback is accepted by this test.
    await owned.start({ image: "postgres:17.11", dockerOnly: true });
    await owned.sql(`create schema extensions; create extension pgcrypto with schema extensions version '1.3';
      create table auth.users(instance_id uuid,id uuid primary key,email text,email_confirmed_at timestamptz);
      create role account_package_installer login nosuperuser bypassrls nocreatedb nocreaterole noreplication inherit password '${password}';
      grant usage,create on schema public to account_package_installer;
      grant usage on schema auth,extensions to account_package_installer;
      grant references(id) on auth.users to account_package_installer;
      alter default privileges for role account_package_installer in schema public grant all on tables to anon,authenticated,service_role;
      alter default privileges for role account_package_installer in schema public grant all on functions to anon,authenticated,service_role;
      alter default privileges for role account_package_installer in schema public grant all on sequences to anon,authenticated,service_role;
      create table public.research_organizations(id uuid primary key,name text not null,owner_partner_id uuid,state text not null,created_at timestamptz not null default clock_timestamp());
      alter table public.research_organizations enable row level security;
      create policy fixture_legacy_read on public.research_organizations for select to authenticated using(true);
      grant select on public.research_organizations to authenticated;
      insert into public.research_organizations values('30000000-0000-4000-8000-000000000019','Synthetic partner organization','10000000-0000-4000-8000-000000000019','active','2026-01-01T00:00:00Z');`);
    const originalDefaults = await defaults(), originalLegacy = await legacy();
    expect(await closure()).toEqual({ tables: 0, routines: 0, sequence: false });
    const pool = owned.poolForLogin("account_package_installer", password), client = await pool.connect();
    try {
      await client.query("set statement_timeout='30s'; set lock_timeout='5s'");
      expect((await client.query(`select current_user as actor,session_user as session,rolsuper as superuser,rolbypassrls as bypass,
        rolcreatedb as createdb,rolcreaterole as createrole,rolreplication as replication,
        has_database_privilege(current_database(),'TEMP') as temporary,
        has_schema_privilege('public','CREATE') as ddl,has_column_privilege('auth.users','id','REFERENCES') as auth_reference,
        has_table_privilege('auth.users','SELECT') as auth_read from pg_roles where rolname=current_user`)).rows[0]).toEqual({
        actor: "account_package_installer", session: "account_package_installer", superuser: false, bypass: true,
        createdb: false, createrole: false, replication: false, temporary: true, ddl: true, auth_reference: true, auth_read: false,
      });

      // A refusal AFTER all eleven core tables were created must roll all of
      // them back and preserve the one existing foreign foundation object.
      await owned.sql("create table public.research_account_organizations(id integer primary key,note text); insert into public.research_account_organizations values(1,'Synthetic foreign baseline')");
      const foreignBefore = (await owned.sql("select relowner,relacl::text,pg_get_constraintdef(con.oid) as key from pg_class c join pg_constraint con on con.conrelid=c.oid where c.oid='public.research_account_organizations'::regclass")).rows;
      await client.query("begin");
      await expect(client.query(artifact.transactionBodySql)).rejects.toMatchObject({ code: "P0001" });
      await client.query("rollback");
      expect(await closure()).toEqual({ tables: 1, routines: 0, sequence: false });
      expect((await owned.sql("select relowner,relacl::text,pg_get_constraintdef(con.oid) as key from pg_class c join pg_constraint con on con.conrelid=c.oid where c.oid='public.research_account_organizations'::regclass")).rows).toEqual(foreignBefore);
      expect((await owned.sql("select * from public.research_account_organizations")).rows).toEqual([{ id: 1, note: "Synthetic foreign baseline" }]);
      await owned.sql("drop table public.research_account_organizations"); // Owned injected fixture only.
      expect(await defaults()).toEqual(originalDefaults); expect(await legacy()).toEqual(originalLegacy);

      // Strong premature-COMMIT control: execute the entire real chain, then
      // fail AFTER the companion. Any surviving component COMMIT would leak
      // core/foundation/routines/ACLs past this outer ROLLBACK and fail below.
      await client.query("begin");
      await client.query(artifact.transactionBodySql);
      expect((await client.query("select count(*)::int as n from pg_class where relnamespace='public'::regnamespace and relname=any($1::text[])", [tables])).rows[0].n).toBe(19);
      await expect(client.query("select 1/0")).rejects.toMatchObject({ code: "22012" });
      await client.query("rollback");
      expect(await closure()).toEqual({ tables: 0, routines: 0, sequence: false });
      expect(await defaults()).toEqual(originalDefaults); expect(await legacy()).toEqual(originalLegacy);

      await client.query("begin"); await client.query(artifact.transactionBodySql); await client.query("commit");
      expect(await closure()).toEqual({ tables: 19, routines: 6, sequence: true });
      const tableState = (await owned.sql(`select count(*)::int as n,bool_and(c.relowner='account_package_installer'::regrole and c.relrowsecurity and not c.relforcerowsecurity) as owner_rls
        from pg_class c where c.relnamespace='public'::regnamespace and c.relname=any($1::text[])`, [tables])).rows[0];
      expect(tableState).toEqual({ n: 19, owner_rls: true });
      const rows = await owned.sql(tables.map(name => `select '${name}' as name,count(*)::int as n from public.${name}`).join(" union all "));
      expect(rows.rows).toHaveLength(19); expect(rows.rows.every(row => row.n === 0)).toBe(true);
      expect((await owned.sql(`select p.proowner='account_package_installer'::regrole as owner,p.prosecdef as definer,
        position('v_event public.research_account_binding_events%rowtype' in p.prosrc)>0 as companion
        from pg_proc p where p.oid='public.research_account_commit_customer_claim(uuid,bytea,uuid,text)'::regprocedure`)).rows[0])
        .toEqual({ owner: true, definer: true, companion: true });
      // This slice deliberately OBSERVES, rather than inventing a policy for,
      // the still-broad core grants. A successful owned COMMIT is not readiness.
      expect((await owned.sql(`select has_table_privilege('anon','public.research_members','MAINTAIN') as core_broad,
        has_table_privilege('anon','public.research_customer_account_bindings','SELECT') as foundation_read,
        to_regclass('supabase_migrations.schema_migrations') is null as no_new_history,
        (select count(*)::int from auth.users) as synthetic_auth_rows`)).rows[0])
        .toEqual({ core_broad: true, foundation_read: false, no_new_history: true, synthetic_auth_rows: 0 });
      expect(artifact.managedExecutable).toBe(false); expect(artifact.unresolvedContracts).toHaveLength(5);
      expect(await defaults()).toEqual(originalDefaults); expect(await legacy()).toEqual(originalLegacy);
    } finally { await client.query("rollback"); client.release(); await pool.end(); }
  } finally { await owned.close(); }
}, 180_000);
