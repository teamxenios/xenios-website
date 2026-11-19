/** Owned installer rehearsal only. Never accepts a URL, credentials or managed target. */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

export function createReferralInstallerFixture() {
  const db = createAccountPrerequisiteRehearsalFixture();
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
    } catch (error) { await db.close(); throw error; }
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
  const apply = (name: keyof typeof REFERRAL_INSTALLER_PINS) => db.sql(pinnedSql(REFERRAL_INSTALLER_PINS[name]));
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
  return { ...db, start, bootstrapRemaining, catalog, defaults, financialRows, apply, installChain, conserved, installationState,
    prerequisiteNames: names, additionalNames };
}
