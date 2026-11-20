/** Owned installer rehearsal only. Never accepts a URL, credentials or managed target. */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Pool } from "pg";
import { ACCOUNT_CORE_SOURCE_PINS, createAccountPrerequisiteRehearsalFixture } from "../account-identity/account-prerequisites.pg.fixture";

export const REFERRAL_PREREQUISITE_PINS = [
  ...ACCOUNT_CORE_SOURCE_PINS,
  { path: "supabase/research-partners.sql", bytes: 14093, sha256: "c2eb9d486e2c6f61111b34cb31eda8d2709e3bd951b901cbef396368b8ab97d0" },
  { path: "supabase/research-commission-ledger.sql", bytes: 7694, sha256: "4859fa8468ce193dc6df8be4af5c88ff61eaf1fdb0a869107be86178782000ba" },
  { path: "supabase/research-idempotency-keys.sql", bytes: 1456, sha256: "2a77a8a59e32b91b6f9b36e1b89c7dab5598782ed71a8b0cbc2d9edc1581ff29" },
  { path: "supabase/research-inventory-lots.sql", bytes: 5624, sha256: "00ccc125f9bfcd428b530e19445c1042b7953b5450dea223707609b87282ee7e" },
  { path: "supabase/research-track-b-fidelity.sql", bytes: 7341, sha256: "9c9170a03fb51231c25fbe36cc9e4e94b229f8d99ec2594b902f07ebea6745ce" },
] as const;
export const REFERRAL_INSTALLER_PINS = {
  base: { path: "supabase/candidates/20260904_research_partner_referral_v1.sql", bytes: 84786, sha256: "69d6f8558550ffb63caed08bdb5cac6d51c96cf80d9c54a9598685d08f82aefb" },
  lineage: { path: "supabase/candidates/20260904_research_partner_referral_v1_lineage.sql", bytes: 9100, sha256: "77a3ea7b96f37b16881ddbaeef89e4448cad6a5ec1b5fd32c8d7f4ea03be0e50" },
  touch: { path: "supabase/candidates/20260914_research_referral_v1_touch_attribution.sql", bytes: 10462, sha256: "297d052369c8df25808be805753693c85ec7e0c2ec2624430e5ca2ce33f1db18" },
  aliases: { path: "supabase/candidates/referral_v1_readable_aliases.sql", bytes: 23670, sha256: "161151b9e74e6bf2b53921f3a406bcd5f4d39c644a1f108c3de92f8e172dc219" },
  precheck: { path: "supabase/candidates/20260904_research_partner_referral_v1_precheck.sql", bytes: 2931, sha256: "d8b6178461c5dc58eeb2c2a6696796685db483883d7dbbc7c342ab8a39b6e9fa" },
  postcheck: { path: "supabase/candidates/20260904_research_partner_referral_v1_postcheck.sql", bytes: 2720, sha256: "9338159185e6f495863fba95021fb8eabb2a6e574a13c1e5502b0dbfda7bbb84" },
} as const;
type SourcePin = { readonly path: string; readonly bytes: number; readonly sha256: string };
export function pinnedSql(pin: SourcePin, source = readFileSync(resolve(process.cwd(), pin.path), "utf8")) {
  const sql = source.replaceAll("\r\n", "\n");
  if (sql.includes("\r") || Buffer.byteLength(sql, "utf8") !== pin.bytes
    || createHash("sha256").update(sql, "utf8").digest("hex") !== pin.sha256) {
    throw new Error("Referral rehearsal source pin mismatch: " + pin.path);
  }
  return sql;
}
export function selectReferralInstallerImage(env: Record<string, string | undefined>) {
  const names = ["XENIOS_REFERRAL_INSTALLER_PG17_6", "XENIOS_REFERRAL_INSTALLER_PG17_11"] as const;
  for (const name of names) if (env[name] !== undefined && env[name] !== "0" && env[name] !== "1") {
    throw new Error("Invalid owned referral PostgreSQL selector");
  }
  const prod = env[names[0]] === "1", stage = env[names[1]] === "1";
  if (prod && stage) throw new Error("Conflicting owned referral PostgreSQL selectors");
  return prod ? "postgres:17.6" as const : stage ? "postgres:17.11" as const : null;
}
export type ReferralInstallerImage = NonNullable<ReturnType<typeof selectReferralInstallerImage>>;
const literal = (value: string) => "'" + value.replaceAll("'", "''") + "'";
const sources = () => REFERRAL_PREREQUISITE_PINS.map(pin => pinnedSql(pin));
export const REFERRAL_FINANCIAL_TABLES = ["research_commission_ledger", "research_store_credit_ledger", "research_payout_batches", "research_payout_attempts"] as const;
const changed = new Set(["research_members", "research_partners", "research_partner_links", "research_attribution_touches", "research_idempotency_keys"]);

// Footprints are discovered from COMPLETE pinned sources. No table excerpt is executed.
function footprint(sql: string) {
  return [...sql.matchAll(/create\s+table\s+if\s+not\s+exists\s+public\.([a-z_]+)/gi)].map(match => match[1]);
}
function catalogSql(schema: string, names: readonly string[]) {
  const normalized = (expression: string) => `replace(replace(${expression},${literal(schema + ".")},''),'public.','')`;
  return `select jsonb_build_object(
    'tables',(select jsonb_agg(jsonb_build_object(
      'name',c.relname,'kind',c.relkind,'owner',c.relowner,'rls',c.relrowsecurity,'force',c.relforcerowsecurity,
      'acl',(select jsonb_agg(jsonb_build_array(a.grantor,a.grantee,a.privilege_type,a.is_grantable)
        order by a.grantor,a.grantee,a.privilege_type,a.is_grantable)
        from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a),
      'partition',c.relispartition,'options',c.reloptions,
      'inheritance',(select count(*) from pg_inherits where inhrelid=c.oid or inhparent=c.oid),
      'columns',(select jsonb_agg(jsonb_build_array(a.attnum,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,
        a.attidentity,a.attgenerated,a.attcollation,a.attacl::text,${normalized("pg_get_expr(d.adbin,d.adrelid)")}) order by a.attnum)
        from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
        where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
      'constraints',(select jsonb_agg(jsonb_build_array(k.conname,k.contype,k.conkey,k.confkey,
        k.convalidated,k.condeferrable,k.condeferred,k.connoinherit,k.conislocal,k.coninhcount,
        ${normalized("pg_get_constraintdef(k.oid,true)")}) order by k.conname) from pg_constraint k where k.conrelid=c.oid),
      'indexes',(select jsonb_agg(jsonb_build_array(i.indisunique,i.indisprimary,i.indisexclusion,i.indimmediate,
        i.indisvalid,i.indisready,i.indislive,i.indnullsnotdistinct,${normalized("pg_get_indexdef(i.indexrelid)")})
        order by r.relname) from pg_index i join pg_class r on r.oid=i.indexrelid where i.indrelid=c.oid),
      'triggers',(select jsonb_agg(jsonb_build_array(t.tgname,t.tgenabled,${normalized("pg_get_triggerdef(t.oid)")}) order by t.tgname)
        from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal),
      'policies',(select jsonb_agg(jsonb_build_array(p.polname,p.polcmd,p.polroles,p.polpermissive,
        pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)) order by p.polname) from pg_policy p where p.polrelid=c.oid),
      'rules',(select count(*) from pg_rewrite where ev_class=c.oid)) order by c.relname)
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname=${literal(schema)} and c.relname=any(array[${names.map(literal).join(",")}]) and c.relkind in ('r','p')),
    'ledgerHelper',(select jsonb_build_array(p.proowner,p.prosecdef,p.proconfig,
      (select jsonb_agg(jsonb_build_array(a.grantor,a.grantee,a.privilege_type,a.is_grantable)
        order by a.grantor,a.grantee,a.privilege_type,a.is_grantable)
        from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a),${normalized("pg_get_functiondef(p.oid)")})
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname=${literal(schema)} and p.proname='research_ledger_is_append_only' and p.pronargs=0)) as value`;
}

type InstallerOptions = { installerAuthority?: "owned_target_nonsuper_bypass" };
type TargetFault = "no_bypass" | "no_auth_usage" | "no_auth_select" | "foreign_link_owner" | "late_base_error";
type TargetProbe = "become_superuser" | "become_platform" | "alter_auth" | "create_event_trigger" | "platform_source_actor";

export function createReferralInstallerFixture(options: InstallerOptions = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)
    || Object.keys(options).some(key => key !== "installerAuthority")
    || (options.installerAuthority !== undefined && options.installerAuthority !== "owned_target_nonsuper_bypass")) {
    throw new Error("Only the closed owned target installer profile is admitted");
  }
  const target = options.installerAuthority === "owned_target_nonsuper_bypass";
  const db = createAccountPrerequisiteRehearsalFixture();
  const platformRole = "referral_platform_" + randomUUID().replaceAll("-", "");
  const authOwner = "referral_auth_" + randomUUID().replaceAll("-", "");
  const fixtureSchema = "referral_m3_fixture";
  let platformPool: Pool | undefined;
  const full = sources(); // Refuse source drift before even allocating Docker.
  Object.values(REFERRAL_INSTALLER_PINS).forEach(pin => pinnedSql(pin));
  const names = full.flatMap(footprint);
  if (names.length !== 37 || new Set(names).size !== 37) throw new Error("Canonical referral prerequisite footprint changed");
  const additional = full.slice(ACCOUNT_CORE_SOURCE_PINS.length);
  const additionalNames = additional.flatMap(footprint);
  const occupied = [...new Set([...additionalNames, ...additionalNames.map(name => name + "_pkey"),
    ...additional.flatMap(sql => [...sql.matchAll(/create\s+(?:unique\s+)?index\s+if\s+not\s+exists\s+([a-z_]+)/gi)].map(match => match[1])),
    ...additional.flatMap(sql => [...sql.matchAll(/\bconstraint\s+(research_[a-z_]+)/gi)].map(match => match[1]))])];

  async function start(image: ReferralInstallerImage) {
    if (image !== "postgres:17.6" && image !== "postgres:17.11") throw new Error("Only exact owned PostgreSQL 17.6/17.11 are admitted");
    try {
      await db.start({ image, dockerOnly: true });
      // Match only the observed extension kernel, never alter Auth/provider state.
      await db.sql("begin; create schema extensions; create extension pgcrypto with schema extensions version '1.3'; commit;");
      const kernel = (await db.sql(`select e.extversion,n.nspname,e.extowner=current_user::regrole::oid as owned,
        to_regprocedure('extensions.gen_random_uuid()') is not null as extension_uuid,
        to_regprocedure('pg_catalog.gen_random_uuid()') is not null as native_uuid
        from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto'`)).rows[0];
      if (JSON.stringify(kernel) !== JSON.stringify({ extversion: "1.3", nspname: "extensions", owned: true, extension_uuid: true, native_uuid: true })) {
        throw new Error("Observed owned pgcrypto kernel mismatch");
      }
      // Empty, explicitly synthetic Auth-shaped dependency. id is SECOND; not a
      // managed Auth install, identity verification, account grant or real actor.
      await db.sql(`create table auth.users(instance_id uuid,id uuid primary key,email text,email_confirmed_at timestamptz);
        alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
        alter default privileges in schema public grant all on functions to anon,authenticated,service_role;
        alter default privileges in schema public grant all on sequences to anon,authenticated,service_role;
        create role referral_fixture_foreign nologin;`);
      if (target) await provisionTargetProfile();
    } catch (error) { await close(); throw error; }
  }
  async function close() {
    try { if (platformPool) await platformPool.end(); }
    finally { platformPool = undefined; await db.close(); }
  }
  async function platformSql(text: string) {
    if (!target || !platformPool) throw new Error("Owned target platform setup is unavailable");
    const client = await platformPool.connect();
    try {
      await client.query("begin; set local statement_timeout='15s'; set local lock_timeout='3s'");
      try { const result = await client.query(text); await client.query("commit"); return result; }
      catch (error) { await client.query("rollback"); throw error; }
    } finally { client.release(); }
  }
  async function provisionTargetProfile() {
    // This marker/port exists only after THIS fixture allocated its exact
    // loopback Docker container. No managed role/name/client can be injected.
    db.ownedDockerContainer();
    const password = randomUUID();
    await db.sql(`create role ${platformRole} login superuser password ${literal(password)}`);
    platformPool = db.poolForLogin(platformRole, password);
    await platformSql(`create role ${authOwner} nologin nosuperuser nobypassrls;
      alter schema auth owner to ${platformRole};
      alter table auth.users owner to ${authOwner};
      alter function auth.uid() owner to ${authOwner};
      grant usage on schema auth to postgres;
      grant select,references on auth.users to postgres;
      grant usage on schema extensions to anon,authenticated,service_role;
      grant anon,authenticated,service_role to postgres;
      alter default privileges for role postgres in schema public grant all on tables to postgres,anon,authenticated,service_role;
      alter default privileges for role postgres in schema public grant all on functions to postgres,anon,authenticated,service_role;
      alter default privileges for role postgres in schema public grant all on sequences to postgres,anon,authenticated,service_role;
      alter default privileges for role ${platformRole} in schema public grant all on tables to postgres,anon,authenticated,service_role;
      alter default privileges for role ${platformRole} in schema public grant all on functions to postgres,anon,authenticated,service_role;
      alter default privileges for role ${platformRole} in schema public grant all on sequences to postgres,anon,authenticated,service_role;
      create schema ${fixtureSchema};
      grant usage on schema ${fixtureSchema} to postgres;
      create function ${fixtureSchema}.require_source_actor() returns event_trigger
      language plpgsql security invoker set search_path='' as $actor$
      declare command record;
      begin
        for command in select * from pg_catalog.pg_event_trigger_ddl_commands() loop
          if command.schema_name in ('public','referral_alias_v1_private')
            or command.object_identity='referral_alias_v1_private' then
            if session_user<>'postgres' or current_user<>'postgres'
              or not exists(select 1 from pg_catalog.pg_roles where rolname=current_user and not rolsuper) then
              raise exception using errcode='42501',message='M3 source requires genuine non-superuser postgres';
            end if;
          end if;
        end loop;
      end $actor$;
      revoke all on function ${fixtureSchema}.require_source_actor() from public,anon,authenticated,service_role;
      grant execute on function ${fixtureSchema}.require_source_actor() to postgres;
      create event trigger referral_m3_source_actor on ddl_command_end
        execute function ${fixtureSchema}.require_source_actor();
      alter role postgres nosuperuser bypassrls createdb createrole login inherit;`);
    const state = await targetAuthority();
    if (state.actor.current_user !== "postgres" || state.actor.session_user !== "postgres" || state.actor.rolsuper !== false
      || state.actor.rolbypassrls !== true || state.platform_effective !== false || !state.source_fence) {
      throw new Error("Owned target authority transition was not established");
    }
  }
  async function targetAuthority() {
    if (!target || !platformPool) throw new Error("Target authority receipt requires the opt-in owned profile");
    return (await db.sql(`select jsonb_build_object(
      'actor',(select jsonb_build_object('current_user',current_user,'session_user',session_user,'rolsuper',rolsuper,
        'rolbypassrls',rolbypassrls,'rolcreatedb',rolcreatedb,'rolcreaterole',rolcreaterole,'rolcanlogin',rolcanlogin)
        from pg_roles where rolname=current_user),
      'platform_effective',pg_has_role(current_user,${literal(platformRole)},'USAGE'),
      'database_create',has_database_privilege(current_user,current_database(),'CREATE'),
      'public_create',has_schema_privilege(current_user,'public','CREATE'),
      'auth_usage',has_schema_privilege(current_user,'auth','USAGE'),
      'auth_schema_foreign_owner',(select nspowner<>current_user::regrole::oid from pg_namespace where nspname='auth'),
      'auth_schema_acl',(select jsonb_agg(jsonb_build_array(a.grantor,a.grantee,a.privilege_type,a.is_grantable)
        order by a.grantor,a.grantee,a.privilege_type,a.is_grantable)
        from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a where n.nspname='auth'),
      'auth',(select jsonb_build_object('owner',pg_get_userbyid(c.relowner),'foreign_owner',c.relowner<>current_user::regrole::oid,
        'select',has_table_privilege(current_user,c.oid,'SELECT'),'references',has_table_privilege(current_user,c.oid,'REFERENCES'),
        'id_attnum',(select attnum from pg_attribute where attrelid=c.oid and attname='id' and not attisdropped),
        'id_type',(select format_type(atttypid,atttypmod) from pg_attribute where attrelid=c.oid and attname='id' and not attisdropped),
        'primary_key',(select conkey::int[] from pg_constraint where conrelid=c.oid and contype='p' and convalidated),
        'primary_key_live',exists(select 1 from pg_constraint k join pg_index i on i.indexrelid=k.conindid
          where k.conrelid=c.oid and k.contype='p' and k.convalidated and not k.condeferrable
            and i.indisunique and i.indisvalid and i.indisready and i.indislive),
        'acl',(select jsonb_agg(jsonb_build_array(a.grantor,a.grantee,a.privilege_type,a.is_grantable)
          order by a.grantor,a.grantee,a.privilege_type,a.is_grantable) from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a))
        from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='auth' and c.relname='users'),
      'crypto',(select jsonb_build_object('version',e.extversion,'schema',n.nspname,'owner',pg_get_userbyid(e.extowner),
        'extension_uuid',to_regprocedure('extensions.gen_random_uuid()') is not null,
        'native_uuid',to_regprocedure('pg_catalog.gen_random_uuid()') is not null,
        'digest_bytea',to_regprocedure('extensions.digest(bytea,text)') is not null,
        'digest_text',to_regprocedure('extensions.digest(text,text)') is not null)
        from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto'),
      'crypto_routines',(select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),
        'definer',p.prosecdef,'volatility',p.provolatile,
        'execute',(select jsonb_agg(jsonb_build_array(r.name,has_function_privilege(r.name,p.oid,'EXECUTE'),has_schema_privilege(r.name,'extensions','USAGE')) order by r.name)
          from (values('postgres'),('anon'),('authenticated'),('service_role')) r(name))) order by p.oid::regprocedure::text)
        from pg_proc p where p.oid=any(array[to_regprocedure('extensions.gen_random_uuid()'),to_regprocedure('extensions.digest(bytea,text)'),to_regprocedure('extensions.digest(text,text)')])),
      'source_fence',exists(select 1 from pg_event_trigger e join pg_proc p on p.oid=e.evtfoid
        where e.evtname='referral_m3_source_actor' and e.evtevent='ddl_command_end' and e.evtenabled='O'
          and not p.prosecdef and pg_get_userbyid(p.proowner)=${literal(platformRole)}),
      'owned_event_triggers',(select jsonb_agg(jsonb_build_array(e.evtname,e.evtevent,e.evtenabled,e.evttags,pg_get_functiondef(e.evtfoid)) order by e.evtname)
        from pg_event_trigger e where e.evtname like 'referral_m3_%'),
      'defaults',(select coalesce(jsonb_agg(to_jsonb(q) order by q.creator,q.schema,q.kind),'[]'::jsonb) from (
        select case when r.rolname=${literal(platformRole)} then 'supabase_admin' else r.rolname end as creator,
          n.nspname as schema,d.defaclobjtype as kind,
          (select jsonb_agg(jsonb_build_array(
            case when pg_get_userbyid(a.grantor)=${literal(platformRole)} then 'supabase_admin' else pg_get_userbyid(a.grantor) end,
            case when a.grantee=0 then 'PUBLIC' when pg_get_userbyid(a.grantee)=${literal(platformRole)} then 'supabase_admin' else pg_get_userbyid(a.grantee) end,
            a.privilege_type,a.is_grantable) order by a.grantee,a.privilege_type,a.grantor)
            from aclexplode(d.defaclacl) a) as rights
          from pg_default_acl d join pg_roles r on r.oid=d.defaclrole left join pg_namespace n on n.oid=d.defaclnamespace) q)) as value`)).rows[0].value;
  }
  async function assertTargetDefaults() {
    const entries = (await targetAuthority()).defaults as Array<{ creator: string; schema: string; kind: string; rights: unknown[][] }>;
    const privileges = { S: ["SELECT", "UPDATE", "USAGE"], f: ["EXECUTE"],
      r: ["DELETE", "INSERT", "MAINTAIN", "REFERENCES", "SELECT", "TRIGGER", "TRUNCATE", "UPDATE"] };
    const roles = ["postgres", "anon", "authenticated", "service_role"];
    if (!Array.isArray(entries) || entries.length !== 6) throw new Error("M3 owned target default-ACL mismatch");
    for (const creator of ["postgres", "supabase_admin"]) for (const kind of ["S", "f", "r"] as const) {
      const actual = entries.filter(row => row.creator === creator && row.schema === "public" && row.kind === kind);
      const expected = roles.flatMap(role => privileges[kind].map(right => JSON.stringify([creator, role, right, false]))).sort();
      if (actual.length !== 1 || !Array.isArray(actual[0].rights)
        || JSON.stringify(actual[0].rights.map(row => JSON.stringify(row)).sort()) !== JSON.stringify(expected)) {
        throw new Error("M3 owned target default-ACL mismatch");
      }
    }
  }
  async function bootstrapCanonicalCore() {
    if (target) await assertTargetDefaults();
    return db.bootstrapCanonicalCore();
  }
  async function fixtureSetup(text: string) {
    // Source never takes this port. Fault setup and inverse commit atomically
    // with the observer fence re-enabled before any actual installer call.
    await platformSql(`alter event trigger referral_m3_source_actor disable;
      ${text}; alter event trigger referral_m3_source_actor enable;`);
  }
  async function withTargetFault<T>(fault: TargetFault, work: () => Promise<T>) {
    if (!target) throw new Error("Target faults require the owned opt-in profile");
    const changes: Record<TargetFault, [string, string]> = {
      no_bypass: ["alter role postgres nobypassrls", "alter role postgres bypassrls"],
      no_auth_usage: ["revoke usage on schema auth from public,postgres,anon,authenticated,service_role", "grant usage on schema auth to postgres,anon,authenticated,service_role"],
      no_auth_select: ["revoke select on auth.users from postgres", "grant select on auth.users to postgres"],
      foreign_link_owner: [`alter table public.research_partner_links owner to ${authOwner}`, "alter table public.research_partner_links owner to postgres"],
      late_base_error: [`create function ${fixtureSchema}.fail_late() returns event_trigger language plpgsql security invoker set search_path='' as $late$
        declare command record; begin
          for command in select * from pg_catalog.pg_event_trigger_ddl_commands() loop
            if command.classid='pg_catalog.pg_proc'::regclass
              and command.objid=pg_catalog.to_regprocedure('public.research_referral_v1_authority()') then
              raise exception using errcode='P0001',message='M3 owned late base failure';
            end if;
          end loop;
        end $late$;
        create event trigger referral_m3_fail_late on ddl_command_end when tag in ('CREATE FUNCTION')
          execute function ${fixtureSchema}.fail_late()`,
        `drop event trigger referral_m3_fail_late; drop function ${fixtureSchema}.fail_late()`],
    };
    if (!Object.prototype.hasOwnProperty.call(changes, fault)) throw new Error("Unknown owned M3 fault");
    await fixtureSetup(changes[fault][0]);
    try { return await work(); } finally { await fixtureSetup(changes[fault][1]); }
  }
  async function targetProbe(probe: TargetProbe) {
    if (!target) throw new Error("Target probes require the owned opt-in profile");
    if (probe === "platform_source_actor") return platformSql("create table public.research_m3_actor_probe(note text)");
    const probes = {
      become_superuser: "alter role postgres superuser",
      become_platform: `set role ${platformRole}`,
      alter_auth: "alter table auth.users add column m3_probe text",
      create_event_trigger: `create event trigger referral_m3_forbidden on ddl_command_end execute function ${fixtureSchema}.require_source_actor()`,
    };
    if (!Object.prototype.hasOwnProperty.call(probes, probe)) throw new Error("Unknown owned M3 probe");
    return db.sql(probes[probe]);
  }
  async function defaults() {
    return (await db.sql(`select coalesce(jsonb_agg(jsonb_build_array(defaclrole,defaclnamespace,defaclobjtype,defaclacl::text)
      order by defaclrole,defaclnamespace,defaclobjtype),'[]'::jsonb) as value from pg_default_acl`)).rows[0].value;
  }
  async function catalog(selected: readonly string[] = names) {
    return (await db.sql(catalogSql("public", selected))).rows[0].value;
  }
  async function financialRows() {
    return Object.fromEntries((await db.sql(REFERRAL_FINANCIAL_TABLES.map(name =>
      `select ${literal(name)} as name,count(*)::integer as n from public.${name}`).join(" union all "))).rows.map(row => [row.name, row.n]));
  }
  async function bootstrapRemaining() {
    if (target) await assertTargetDefaults();
    const reference = "referral_expected_" + randomUUID().replaceAll("-", "");
    const beforeDefaults = await defaults();
    try {
      // Independent empty reference: ALL EIGHT complete sources, only namespace
      // rewritten. Actual public installation below uses every original byte.
      // The reference has no public-schema default ACLs. Explicitly model the
      // SAME known fixture grants without editing any default-ACL origin.
      await db.sql(`begin; create schema ${reference};\n${full.join("\n").replace(/\bpublic\./g, reference + ".")}
        grant all on all tables in schema ${reference} to anon,authenticated,service_role;
        grant all on all functions in schema ${reference} to anon,authenticated,service_role;
        commit;`);
      const expected = (await db.sql(catalogSql(reference, names))).rows[0].value;
      const expectedTables = (expected as { tables: unknown[] }).tables;
      if (expectedTables.length !== 37) throw new Error("Complete reference table count mismatch");
      await db.sql(`begin; set local lock_timeout='5s';
        do $referral_prerequisite_guard$ begin
          if exists(select 1 from unnest(array[${occupied.map(literal).join(",")}]) name where to_regclass('public.'||name) is not null)
            or to_regprocedure('public.research_ledger_is_append_only()') is not null
            or exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
              where n.nspname='public' and t.tgname in ('research_commission_ledger_no_update','research_store_credit_ledger_no_update')) then
            raise exception 'Owned referral prerequisites require absent additional canonical names';
          end if;
        end $referral_prerequisite_guard$;
        ${additional.join("\n")}
        do $referral_prerequisite_check$ declare actual jsonb; begin
          ${catalogSql("public", names).replace(/ as value$/, " into actual")};
          if actual is distinct from ${literal(JSON.stringify(expected))}::jsonb then
            raise exception 'Complete canonical referral prerequisite metadata mismatch';
          end if;
        end $referral_prerequisite_check$;
        commit;`);
    } finally { await db.sql(`drop schema if exists ${reference} cascade`); }
    if (JSON.stringify(await defaults()) !== JSON.stringify(beforeDefaults)) throw new Error("Prerequisite chain changed fixture default ACLs");
    const allRows = (await db.sql(names.map(name => `select ${literal(name)} as name,count(*)::integer as n from public.${name}`).join(" union all "))).rows;
    if (allRows.length !== 37 || allRows.some(row => row.n !== 0)) throw new Error("Complete prerequisites must be empty before synthetic controls");
    if (Object.values(await financialRows()).some(count => count !== 0)) throw new Error("Monetary tables must remain empty");
    return { sourcePins: REFERRAL_PREREQUISITE_PINS, tables: names.length,
      profile: "complete_canonical_evolved_sources" as const, aclOrigin: "modeled_observed_table_grants_not_managed_default_acl_evidence" as const };
  }
  const actorGuard = () => `do $m3_actual_caller$ begin
    if session_user<>'postgres' or current_user<>'postgres'
      or not exists(select 1 from pg_catalog.pg_roles where rolname=current_user and not rolsuper)
      or pg_catalog.pg_has_role(current_user,${literal(platformRole)},'USAGE')
      or not exists(select 1 from pg_catalog.pg_event_trigger where evtname='referral_m3_source_actor' and evtenabled='O') then
      raise exception using errcode='42501',message='M3 installer caller or native fence drift';
    end if;
  end $m3_actual_caller$;\n`;
  const apply = (name: keyof typeof REFERRAL_INSTALLER_PINS) => {
    const source = pinnedSql(REFERRAL_INSTALLER_PINS[name]);
    // Precheck/postcheck have no DDL: attest their genuine caller on that same
    // owned connection too. Core/remaining DDL is fenced natively through the
    // unchanged shared bootstrap closure, not an injected privileged client.
    if (!target) return db.sql(source);
    return (async () => {
      await assertTargetDefaults();
      return db.sql(actorGuard() + source + "\n" + actorGuard());
    })();
  };
  async function installChain() {
    await apply("precheck");
    for (const name of ["base", "lineage", "touch", "aliases"] as const) await apply(name);
    await apply("postcheck");
  }
  async function conserved() {
    return { catalog: await catalog(names.filter(name => !changed.has(name))), defaults: await defaults(), financialRows: await financialRows() };
  }
  async function installationState() {
    // Object properties/definitions, never OIDs of recreated triggers or rows of
    // a managed database. Captures every private alias table, including reassignments.
    return (await db.sql(`select jsonb_build_object(
      'tables',(select jsonb_agg(jsonb_build_array(n.nspname,c.relname,c.relkind,c.relowner,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity,
        (select jsonb_agg(jsonb_build_array(a.attnum,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attacl::text,pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
          from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
        (select jsonb_agg(pg_get_constraintdef(k.oid) order by k.conname) from pg_constraint k where k.conrelid=c.oid),
        (select jsonb_agg(pg_get_indexdef(i.indexrelid) order by r.relname) from pg_index i join pg_class r on r.oid=i.indexrelid where i.indrelid=c.oid),
        (select jsonb_agg(jsonb_build_array(t.tgname,t.tgenabled,pg_get_triggerdef(t.oid)) order by t.tgname) from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal))
        order by n.nspname,c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname in ('public','referral_alias_v1_private') and c.relkind in ('r','p')),
      'routines',(select jsonb_agg(jsonb_build_array(n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),p.proowner,p.proacl::text,
        p.prosecdef,p.proconfig,pg_get_functiondef(p.oid)) order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid))
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','referral_alias_v1_private')),
      'namespaces',(select jsonb_agg(jsonb_build_array(nspname,nspowner,nspacl::text) order by nspname) from pg_namespace
        where nspname in ('public','referral_alias_v1_private')),
      'defaults',(select jsonb_agg(jsonb_build_array(defaclrole,defaclnamespace,defaclobjtype,defaclacl::text) order by defaclrole,defaclnamespace,defaclobjtype) from pg_default_acl)) as value`)).rows[0].value;
  }
  return { ...db, start, close, bootstrapCanonicalCore, bootstrapRemaining, catalog, defaults, financialRows, apply, installChain, conserved, installationState,
    targetAuthority, withTargetFault, targetProbe,
    prerequisiteNames: names, additionalNames };
}
