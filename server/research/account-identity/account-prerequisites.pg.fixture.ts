/**
 * OWNED TEST REHEARSAL ONLY. Not a managed installer or production ACL policy.
 * No URL/client/credentials accepted: SQL closes over the existing owned-loopback
 * fixture. The eleven historical tables are fresh-only; existing/evolved objects
 * are refused, never adopted, repaired, renamed or replayed over production.
 */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createDurableJourneyFixture } from "../assisted-order/request-intent/durable-journey.pg.fixture";

export const ACCOUNT_CORE_SOURCE_PINS = [
  { path: "supabase/research-membership.sql", bytes: 3404, sha256: "a5741c2cd9d25e7fec0631e0609cc3e8385f4808026680465ee4a46cf26c46d8" },
  { path: "supabase/research-members.sql", bytes: 1140, sha256: "aa9f6c539f755f08042f90f7799885320e58e2f775f4078fbc6f10cf21b0aded" },
  { path: "supabase/research-orders.sql", bytes: 9246, sha256: "dcac210951410775608f9c0b5413cdcdf054a7741136e1d2844b28375a3c76d0" },
] as const;

export const ACCOUNT_CORE_COLUMNS = {
  research_applications: 28, research_application_events: 10, research_members: 9,
  research_carts: 4, research_cart_lines: 7, research_orders: 17,
  research_order_lines: 8, research_order_state_events: 9,
  research_provider_webhook_events: 5, research_claims: 12, research_refund_keys: 3,
} as const;
const tables = Object.keys(ACCOUNT_CORE_COLUMNS);
const literal = (value: unknown) => "'" + String(value).replaceAll("'", "''") + "'";
const json = (value: unknown) => literal(JSON.stringify(value)) + "::jsonb";

function pinnedSources() {
  return ACCOUNT_CORE_SOURCE_PINS.map(pin => {
    // Git pins are LF bytes. ONLY normalize checkout CRLF; never trim, extract
    // table snippets, omit comments or substitute a broader historical bundle.
    const sql = readFileSync(resolve(process.cwd(), pin.path), "utf8").replaceAll("\r\n", "\n");
    if (sql.includes("\r") || Buffer.byteLength(sql, "utf8") !== pin.bytes
      || createHash("sha256").update(sql, "utf8").digest("hex") !== pin.sha256) {
      throw new Error("Pinned account core source mismatch: " + pin.path);
    }
    return sql;
  });
}

function rehearsalSql() {
  const sources = pinnedSources();
  const actual = sources.join("\n");
  const prefix = "account_core_ref_" + randomUUID().replaceAll("-", "").slice(0, 12) + "_";
  const references = Object.fromEntries(tables.map((name, index) => [name, "pg_temp." + prefix + index]));
  const explicitIndexes = [...actual.matchAll(/\bcreate\s+(?:unique\s+)?index\s+if\s+not\s+exists\s+([a-z_]+)/gi)].map(match => match[1]);
  const namedConstraints = [...actual.matchAll(/\bconstraint\s+(research_[a-z_]+)/gi)].map(match => match[1]);
  if (explicitIndexes.length !== 12) throw new Error("Pinned core index footprint changed");
  const occupiedNames = [...new Set([...tables, ...tables.map(name => name + "_pkey"), ...explicitIndexes, ...namedConstraints,
    "research_applications_email_key", "research_members_application_id_key", "research_members_auth_user_id_key",
    "research_members_email_key", "research_carts_member_id_key"])];

  // Independent expected metadata comes from COMPLETE hash-pinned source, not
  // from the installed catalog. The actual scripts below remain byte-complete.
  // Only this empty reference copy has namespace/temp/index names rewritten.
  let reference = actual.replace(/^create extension if not exists "pgcrypto";\n/gm, "");
  reference = reference.replace(/\bpublic\.(research_[a-z_]+)\b/g, (_match, name: string) => {
    const target = references[name];
    if (!target) throw new Error("Unexpected pinned core reference");
    return target;
  });
  let created = 0, closed = 0, indexes = 0;
  reference = reference.replace(/create table if not exists pg_temp\./gi, () => { created++; return "create temporary table pg_temp."; });
  reference = reference.replace(/^\);$/gm, () => { closed++; return ") on commit drop;"; });
  reference = reference.replace(/create\s+(unique\s+)?index\s+if\s+not\s+exists\s+[a-z_]+/gi,
    (_match, unique: string | undefined) => "create " + (unique ?? "") + "index " + prefix + "index_" + indexes++);
  if (created !== 11 || closed !== 11 || indexes !== 12 || actual.includes("$account_core_actual$") || reference.includes("$account_core_reference$")) {
    throw new Error("Pinned core reference transformation refused");
  }

  return `begin;
set local lock_timeout='5s';
set local search_path=pg_catalog,public;
set local standard_conforming_strings=on;
do $account_core_rehearsal$
declare
  v_names text[]:=array[${tables.map(literal).join(",")}];
  v_occupied text[]:=array[${occupiedNames.map(literal).join(",")}];
  v_references jsonb:=${json(references)};
  v_columns jsonb:=${json(ACCOUNT_CORE_COLUMNS)};
  v_targets jsonb:='{}'::jsonb;
  v_name text; v_role text; v_relation regclass; v_reference regclass; v_owner oid;
  v_actual jsonb; v_expected jsonb; v_observed jsonb; v_defaults jsonb; v_after_defaults jsonb;
  v_privileges text[]; v_granted text[]; v_rows bigint; v_side integer;
begin
  if not exists(select 1 from pg_extension where extname='pgcrypto') then raise exception 'owned core rehearsal requires existing pgcrypto'; end if;
  if exists(select 1 from unnest(v_occupied) occupied_name where to_regclass('public.'||occupied_name) is not null) then
    raise exception 'owned core rehearsal requires fresh absent canonical names'; end if;
  select jsonb_agg(jsonb_build_array(defaclrole,defaclnamespace,defaclobjtype,defaclacl::text) order by defaclrole,defaclnamespace,defaclobjtype)
    into v_defaults from pg_default_acl;
  execute $account_core_reference$${reference}$account_core_reference$;
  execute $account_core_actual$${actual}$account_core_actual$;
  foreach v_name in array v_names loop
    v_relation:=to_regclass('public.'||v_name); v_reference:=to_regclass(v_references->>v_name);
    v_targets:=v_targets||jsonb_build_object(v_relation::oid::text,v_name,v_reference::oid::text,v_name);
  end loop;
  foreach v_name in array v_names loop
    v_relation:=to_regclass('public.'||v_name); v_reference:=to_regclass(v_references->>v_name);
    if not exists(select 1 from pg_class relation where relation.oid=v_relation and relation.relkind='r'
      and relation.relowner=current_user::regrole::oid and relation.relrowsecurity and not relation.relforcerowsecurity and not relation.relispartition)
      or exists(select 1 from pg_inherits where inhrelid=v_relation or inhparent=v_relation)
      or exists(select 1 from pg_policy where polrelid=v_relation)
      or exists(select 1 from pg_rewrite where ev_class=v_relation)
      or exists(select 1 from pg_trigger where tgrelid=v_relation and not tgisinternal) then
      raise exception 'owned core structural boundary mismatch: %',v_name; end if;
    if (select count(*) from pg_attribute where attrelid=v_relation and attnum>0 and not attisdropped)<>(v_columns->>v_name)::integer then
      raise exception 'owned core full column footprint mismatch: %',v_name; end if;
    for v_side in 0..1 loop
      select jsonb_build_object(
        'columns',(select jsonb_agg(jsonb_build_array(attrs.attname,format_type(attrs.atttypid,attrs.atttypmod),attrs.attnotnull,
          attrs.attidentity,attrs.attgenerated,attrs.attcollation,pg_get_expr(defs.adbin,defs.adrelid)) order by attrs.attnum)
          from pg_attribute attrs left join pg_attrdef defs on defs.adrelid=attrs.attrelid and defs.adnum=attrs.attnum
          where attrs.attrelid=case when v_side=0 then v_relation else v_reference end and attrs.attnum>0 and not attrs.attisdropped),
        'constraints',(select jsonb_agg(contract order by contract) from (
          select jsonb_build_array(cons.contype,cons.conkey,cons.confkey,
            case when cons.contype='f' then coalesce(v_targets->>cons.confrelid::text,cons.confrelid::regclass::text) else null end,
            cons.confupdtype,cons.confdeltype,cons.confmatchtype,cons.convalidated,cons.condeferrable,cons.condeferred,
            cons.connoinherit,cons.conislocal,cons.coninhcount,case when cons.contype='c' then pg_get_expr(cons.conbin,cons.conrelid) else null end) as contract
          from pg_constraint cons where cons.conrelid=case when v_side=0 then v_relation else v_reference end) contracts),
        'indexes',(select jsonb_agg(contract order by contract) from (
          select jsonb_build_array(am.amname,idx.indisunique,idx.indisprimary,idx.indisexclusion,idx.indimmediate,idx.indisvalid,idx.indisready,idx.indislive,
            idx.indnullsnotdistinct,idx.indnkeyatts,idx.indnatts,idx.indkey::text,idx.indclass::text,idx.indcollation::text,idx.indoption::text,
            pg_get_expr(idx.indexprs,idx.indrelid),pg_get_expr(idx.indpred,idx.indrelid)) as contract
          from pg_index idx join pg_class index_relation on index_relation.oid=idx.indexrelid join pg_am am on am.oid=index_relation.relam
          where idx.indrelid=case when v_side=0 then v_relation else v_reference end) indexes)
      ) into v_observed;
      if v_side=0 then v_actual:=v_observed; else v_expected:=v_observed; end if;
    end loop;
    if v_actual is distinct from v_expected then raise exception 'owned core canonical metadata mismatch: %',v_name; end if;
    -- Observe the KNOWN BROAD managed-style defaults faithfully. These sources
    -- contain no grants/revokes; this is NOT a proposed production ACL boundary.
    select relowner into v_owner from pg_class where oid=v_relation;
    select array_agg(acl.privilege_type order by acl.privilege_type) into v_privileges
      from aclexplode(acldefault('r',v_owner)) acl where acl.grantee=v_owner;
    if exists(select 1 from pg_class relation cross join lateral aclexplode(coalesce(relation.relacl,acldefault('r',relation.relowner))) acl
      where relation.oid=v_relation and acl.grantee<>v_owner and
        (acl.grantee not in ('anon'::regrole::oid,'authenticated'::regrole::oid,'service_role'::regrole::oid) or acl.is_grantable))
      or exists(select 1 from pg_attribute attrs where attrs.attrelid=v_relation and attrs.attnum>0 and attrs.attacl is not null) then
      raise exception 'owned core observed default ACL mismatch: %',v_name; end if;
    foreach v_role in array array['anon','authenticated','service_role'] loop
      select array_agg(acl.privilege_type order by acl.privilege_type) into v_granted
        from pg_class relation cross join lateral aclexplode(relation.relacl) acl
        where relation.oid=v_relation and acl.grantee=v_role::regrole::oid;
      if v_granted is distinct from v_privileges then raise exception 'owned core broad default ACL missing: % %',v_name,v_role; end if;
    end loop;
    execute format('select count(*) from public.%I',v_name) into v_rows;
    if v_rows<>0 then raise exception 'owned core must be empty before synthetic seeds: %',v_name; end if;
  end loop;
  select jsonb_agg(jsonb_build_array(defaclrole,defaclnamespace,defaclobjtype,defaclacl::text) order by defaclrole,defaclnamespace,defaclobjtype)
    into v_after_defaults from pg_default_acl;
  if v_after_defaults is distinct from v_defaults then raise exception 'owned core source changed default ACL policy'; end if;
end;
$account_core_rehearsal$;
commit;`;
}

export function createAccountPrerequisiteRehearsalFixture() {
  const owned = createDurableJourneyFixture();
  async function coreRows(): Promise<Record<string, number>> {
    const sql = tables.map(name => `select ${literal(name)} as name,count(*)::integer as n from public.${name}`).join(" union all ");
    return Object.fromEntries((await owned.sql(sql)).rows.map(row => [row.name as string, row.n as number]));
  }
  async function assertCoreEmpty() {
    const rows = await coreRows();
    if (Object.keys(rows).length !== 11 || Object.values(rows).some(count => count !== 0)) throw new Error("Canonical core is not empty before synthetic seeds");
    return rows;
  }
  async function bootstrapCanonicalCore() {
    await owned.sql(rehearsalSql());
    const emptyBeforeSeeds = await assertCoreEmpty();
    const rowSecurity: Record<string, boolean> = {};
    for (const role of ["anon", "authenticated"] as const) {
      const result = await owned.asRole(role, `select bool_and(row_security_active(relation.oid)) as active from pg_class relation
        where relation.oid=any(array[${tables.map(name => literal("public." + name) + "::regclass").join(",")}])`);
      rowSecurity[role] = result.rows[0].active === true;
      if (!rowSecurity[role]) throw new Error("Owned core browser RLS is not effective");
      let denied = false;
      try {
        // Even an unexpected permission bug cannot persist this probe: success
        // explicitly rolls back; expected RLS failure is rolled back by asRole.
        await owned.asRole(role, `insert into public.research_applications(email,first_name,last_name,country)
          values('owned-denial-probe@example.invalid','Synthetic','Probe','US'); rollback;`);
      } catch (error) {
        if ((error as { code?: string }).code !== "42501") throw new Error("Owned core RLS denial failed unexpectedly");
        denied = true;
      }
      if (!denied) throw new Error("Owned core unexpectedly allowed browser application insertion");
    }
    await assertCoreEmpty();
    return { sourcePins: ACCOUNT_CORE_SOURCE_PINS, tableCount: 11, columnCount: 112,
      emptyBeforeSeeds, rowSecurity, aclPosture: "observed_broad_defaults_no_new_policy" as const };
  }
  return { ...owned, bootstrapCanonicalCore, assertCoreEmpty, coreRows };
}
