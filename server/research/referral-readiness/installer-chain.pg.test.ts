/** Complete-source owned rehearsal. Execution is evidence only after a real PG run. */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createReferralInstallerFixture, pinnedSql, REFERRAL_FINANCIAL_TABLES,
  REFERRAL_INSTALLER_PINS, REFERRAL_PREREQUISITE_PINS, selectReferralInstallerImage,
} from "./canonical-prerequisites.pg.fixture";

const image = selectReferralInstallerImage(process.env);
const pgIt = image ? it : it.skip;
type Fixture = ReturnType<typeof createReferralInstallerFixture>;
async function owned(work: (db: Fixture) => Promise<void>, remaining = true) {
  if (!image) throw new Error("An exact owned PostgreSQL selector is required");
  const db = createReferralInstallerFixture();
  try {
    await db.start(image);
    await db.bootstrapCanonicalCore();
    if (remaining) await db.bootstrapRemaining();
    await work(db);
  } finally { await db.close(); }
}
async function noV1(db: Fixture) {
  expect((await db.sql(`select to_regprocedure('public.research_referral_v1_execute(text,jsonb)') is null as absent,
    not exists(select 1 from pg_attribute where attrelid='public.research_partner_links'::regclass
      and attname='referral_version' and not attisdropped) as no_extension`)).rows[0]).toEqual({ absent: true, no_extension: true });
}
async function rejectUnchanged(db: Fixture, work: () => Promise<unknown>, message: RegExp) {
  const before = await db.installationState();
  await expect(work()).rejects.toThrow(message);
  expect(await db.installationState()).toEqual(before);
}
const aclTables = ["research_members", "research_partners", "research_partner_links", "research_attribution_touches", "research_idempotency_keys"];
async function aclRows(db: Fixture) {
  return (await db.sql(`select c.relname as table_name,case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee,
    pg_get_userbyid(a.grantor) as grantor,a.privilege_type,a.is_grantable
    from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
    where c.oid=any($1::regclass[]) order by c.relname,a.grantee,a.privilege_type,a.grantor`, [db.prerequisiteNames.map(name => "public." + name)])).rows;
}
async function assertInstalled(db: Fixture) {
  expect((await db.asRole("service_role", "select public.research_referral_v1_authority() as value")).rows[0].value)
    .toEqual({ ok: true, value: { schemaVersion: "gen2_referral_v1_transfer_touch_20260921" } });
  expect((await db.asRole("service_role", "select public.research_partner_referral_v1_lineage(array[]::text[],100) as value")).rows[0].value)
    .toEqual({ state: "unavailable", records: [] });
  expect((await db.sql("select to_regclass('public.research_assisted_order_requests') is null as absent")).rows[0].absent).toBe(true);
  // No fabricated request table/storage bucket to manufacture positive lineage.
  const boundary = (await db.sql(`select
    (select count(*)::integer from pg_class c where c.oid=any(array[
      'public.research_affiliate_customer_bindings'::regclass,'public.research_partner_referral_events'::regclass,
      'public.research_referral_binding_transfer_events'::regclass,'public.research_referral_privacy_cleanup_work'::regclass,
      'public.research_referral_privacy_cleanup_events'::regclass]) and c.relrowsecurity and c.relforcerowsecurity
      and c.relowner=current_user::regrole::oid) as protected_tables,
    (select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='referral_alias_v1_private' and c.relkind='r' and c.relrowsecurity
        and c.relowner=current_user::regrole::oid) as alias_tables,
    not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      cross join (values('anon'),('authenticated')) r(name) where n.nspname='public'
        and (p.proname like 'research_referral_v1_%' or p.proname in ('research_referral_alias_v1_execute','research_partner_referral_v1_lineage'))
        and has_function_privilege(r.name,p.oid,'EXECUTE')) as browser_rpc_closed,
    not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      cross join (values('anon'),('authenticated'),('service_role')) r(name)
      where n.nspname='referral_alias_v1_private' and c.relkind='r'
        and has_table_privilege(r.name,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')) as private_tables_closed,
    not exists(select 1 from unnest($1::regclass[]) t cross join (values('anon'),('authenticated'),('service_role')) r(name)
      where has_table_privilege(r.name,t,'TRUNCATE')) as truncate_closed`, [aclTables.map(name => "public." + name)])).rows[0];
  expect(boundary).toEqual({ protected_tables: 5, alias_tables: 4, browser_rpc_closed: true, private_tables_closed: true, truncate_closed: true });
  for (const role of ["anon", "authenticated"] as const) {
    await expect(db.asRole(role, "select public.research_referral_alias_v1_execute('resolve','{}'::jsonb)"))
      .rejects.toMatchObject({ code: "42501" });
  }
  expect(await db.financialRows()).toEqual(Object.fromEntries(REFERRAL_FINANCIAL_TABLES.map(name => [name, 0])));
}

describe.sequential("source-pinned canonical referral installer readiness", () => {
  it("pins all complete sources, including legacy evolution and both review scripts", () => {
    for (const pin of [...REFERRAL_PREREQUISITE_PINS, ...Object.values(REFERRAL_INSTALLER_PINS)]) {
      expect(Buffer.byteLength(pinnedSql(pin))).toBe(pin.bytes);
      expect(() => pinnedSql(pin, pinnedSql(pin) + "\n")).toThrow("source pin mismatch");
    }
    expect(REFERRAL_PREREQUISITE_PINS).toHaveLength(8);
    expect(Object.keys(REFERRAL_INSTALLER_PINS)).toHaveLength(6);
  });
  it("admits only mutually exclusive exact owned PG17 selectors without a default target", () => {
    expect(selectReferralInstallerImage({})).toBeNull();
    expect(selectReferralInstallerImage({ XENIOS_REFERRAL_INSTALLER_PG17_6: "1" })).toBe("postgres:17.6");
    expect(selectReferralInstallerImage({ XENIOS_REFERRAL_INSTALLER_PG17_11: "1" })).toBe("postgres:17.11");
    expect(() => selectReferralInstallerImage({ XENIOS_REFERRAL_INSTALLER_PG17_6: "1", XENIOS_REFERRAL_INSTALLER_PG17_11: "1" })).toThrow("Conflicting");
    expect(() => selectReferralInstallerImage({ XENIOS_REFERRAL_INSTALLER_PG17_6: "17" })).toThrow("Invalid");
  });

  pgIt("installs the complete fresh chain with exact ACL deltas and untouched legacy/monetary namespaces", async () => {
    await owned(async db => {
      const before = await db.conserved(), acls = await aclRows(db);
      expect((await db.sql(`select (select count(*)::integer from pg_attribute where attrelid='public.research_orders'::regclass and attnum>0 and not attisdropped) as orders,
        (select count(*)::integer from pg_attribute where attrelid='public.research_commission_ledger'::regclass and attnum>0 and not attisdropped) as ledger,
        (select count(*)::integer from pg_attribute where attrelid='public.research_organizations'::regclass and attnum>0 and not attisdropped) as legacy_org,
        to_regclass('public.research_account_organizations') is null as no_buyer_org,
        not exists(select 1 from pg_constraint where conrelid='public.research_partners'::regclass and contype='f') as no_invented_partner_fk`)).rows[0])
        .toEqual({ orders: 21, ledger: 15, legacy_org: 5, no_buyer_org: true, no_invented_partner_fk: true });
      // The fixture deliberately stresses broad grants. Their modeled default-ACL
      // origin is NOT an observation of actual managed pg_default_acl.
      const eightRights = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER", "MAINTAIN"].sort();
      const modeledRoles = ["postgres", "anon", "authenticated", "service_role"];
      expect(acls).toHaveLength(37 * modeledRoles.length * eightRights.length);
      expect(new Set(acls.map(row => row.table_name))).toEqual(new Set(db.prerequisiteNames));
      for (const table of db.prerequisiteNames) for (const role of modeledRoles) {
        const entries = acls.filter(row => row.table_name === table && row.grantee === role);
        expect(entries.map(row => row.privilege_type).sort()).toEqual(eightRights);
        expect(entries.every(row => row.grantor === "postgres" && row.is_grantable === false)).toBe(true);
      }
      await db.installChain();
      const expectedAcls = acls.filter(row => {
        if (!aclTables.includes(row.table_name)) return true;
        const client = ["PUBLIC", "anon", "authenticated"].includes(row.grantee);
        const narrowed = ["research_partner_links", "research_attribution_touches", "research_idempotency_keys"].includes(row.table_name);
        if (narrowed && client) return false;
        return !(row.privilege_type === "TRUNCATE" && (client || row.grantee === "service_role"));
      });
      expect(await aclRows(db)).toEqual(expectedAcls);
      expect(await db.conserved()).toEqual(before);
      // Adverse controls use the SAME conservation projection as the successful
      // installer assertion. Unexpected rights outside its five-table delta must
      // be visible even when every financial table is empty.
      await db.sql("grant select on public.research_commission_ledger to referral_fixture_foreign");
      expect(await db.conserved()).not.toEqual(before);
      await db.sql("revoke select on public.research_commission_ledger from referral_fixture_foreign");
      expect(await db.conserved()).toEqual(before);
      await db.sql("grant execute on function public.research_ledger_is_append_only() to referral_fixture_foreign");
      expect(await db.conserved()).not.toEqual(before);
      await db.sql("revoke execute on function public.research_ledger_is_append_only() from referral_fixture_foreign");
      expect(await db.conserved()).toEqual(before);
      await assertInstalled(db);
      await rejectUnchanged(db, () => db.apply("base"), /already exists or drifted/);
      await rejectUnchanged(db, () => db.apply("lineage"), /Lineage already exists/);
    });
  }, 180_000);

  pgIt("preserves inert evolved legacy rows and rejects actual partner/member/Auth orphans", async () => {
    await owned(async db => {
      const auth = "10000000-0000-4000-8000-000000000101", member = "20000000-0000-4000-8000-000000000101";
      const partner = "30000000-0000-4000-8000-000000000101";
      const app = "40000000-0000-4000-8000-000000000101";
      // Inert owned-only application partner: never active, verified or eligible.
      await db.sql(`insert into public.research_partners(id,member_id,role,legal_name,contact_email)
        values($1,$2,'member_referral','Synthetic inert fixture','inert@example.invalid')`, [partner, member]);
      await rejectUnchanged(db, () => db.apply("base"), /partner member identity is orphaned/);
      await noV1(db);
      await db.sql(`insert into public.research_applications(id,email,first_name,last_name,country)
        values($1,'inert@example.invalid','Synthetic','Fixture','US');
        `, [app]);
      await db.sql(`insert into public.research_members(id,application_id,auth_user_id,email,first_name)
        values($1,$2,$3,'inert@example.invalid','Synthetic')`, [member, app, auth]);
      await rejectUnchanged(db, () => db.apply("base"), /partner Auth identity is orphaned/);
      await noV1(db);
      await db.sql("insert into auth.users(id,email) values($1,'inert@example.invalid')", [auth]);
      await db.sql(`insert into public.research_partner_links(partner_id,code,channel) values($1,'owned-legacy-only','signed_link');
        `, [partner]);
      await db.sql(`insert into public.research_attribution_touches(subject_key,partner_id,channel)
        values('owned-legacy-subject',$1,'signed_link')`, [partner]);
      await db.sql("insert into public.research_organizations(name,owner_partner_id) values('Synthetic legacy partner organization',$1)", [partner]);
      const oldRows = async () => (await db.sql(`select jsonb_build_object(
        'auth',(select to_jsonb(u) from auth.users u where id=$2),
        'application',(select to_jsonb(a) from public.research_applications a where id=$3),
        'member',(select to_jsonb(m) from public.research_members m where id=$4),
        'partner',(select to_jsonb(p) from public.research_partners p where id=$1),
        'link',(select to_jsonb(l)-array['referral_version','token_hash_hex','token_key_version','destination_path','expires_at'] from public.research_partner_links l where code='owned-legacy-only'),
        'touch',(select to_jsonb(t)-array['referral_version','referral_link_id','referral_expires_at'] from public.research_attribution_touches t where subject_key='owned-legacy-subject'),
        'organization',(select to_jsonb(o) from public.research_organizations o where owner_partner_id=$1)) as value`, [partner, auth, app, member])).rows[0].value;
      const rows = await oldRows(), conservation = await db.conserved();
      expect(rows).toMatchObject({
        auth: { id: auth, instance_id: null, email: "inert@example.invalid", email_confirmed_at: null },
        application: { id: app, status: "submitted", age_confirmed: false },
        member: { id: member, application_id: app, auth_user_id: auth, status: "pending_activation", activated_at: null },
      });
      await db.installChain();
      expect(await oldRows()).toEqual(rows);
      expect(await db.conserved()).toEqual(conservation);
      expect((await db.sql(`select (select referral_version is null and token_hash_hex is null and token_key_version is null
        and destination_path is null and expires_at is null from public.research_partner_links where code='owned-legacy-only') as old_link,
        (select referral_version is null and referral_link_id is null and referral_expires_at is null from public.research_attribution_touches
          where subject_key='owned-legacy-subject') as old_touch,
        (select state='application' and not identity_verified and tax_status='not_started' and payout_status='not_started'
          and activated_at is null and certified_at is null from public.research_partners where id=$1) as still_inert`, [partner])).rows[0])
        .toEqual({ old_link: true, old_touch: true, still_inert: true });
      await assertInstalled(db);
    });
  }, 180_000);

  pgIt("refuses occupied prerequisite indexes and rolls back canonical-default poison without adopting it", async () => {
    await owned(async db => {
      // Deliberately invalid OWNED collisions; never substitute prerequisites.
      await db.sql("create index research_partners_state_idx on public.research_orders(state)");
      await rejectUnchanged(db, () => db.bootstrapRemaining(), /require absent additional canonical names/);
      await db.sql("drop index public.research_partners_state_idx");
      await db.sql(`create function public.referral_fixture_poison_default() returns event_trigger language plpgsql as $$ begin
        if to_regclass('public.research_partners') is not null then
          alter table public.research_partners alter column state set default 'suspended';
        end if;
        end $$;
        create event trigger referral_fixture_poison_default on ddl_command_end when tag in ('CREATE TABLE')
          execute function public.referral_fixture_poison_default();`);
      await rejectUnchanged(db, () => db.bootstrapRemaining(), /canonical referral prerequisite metadata mismatch/);
      expect((await db.sql("select to_regclass('public.research_partners') is null as absent")).rows[0].absent).toBe(true);
      await db.sql("drop event trigger referral_fixture_poison_default; drop function public.referral_fixture_poison_default()");
      await db.bootstrapRemaining(); // The genuine clean full-source bootstrap still succeeds.
      expect((await db.catalog()).tables).toHaveLength(37);
      expect(await db.financialRows()).toEqual(Object.fromEntries(REFERRAL_FINANCIAL_TABLES.map(name => [name, 0])));
    }, false);
  }, 180_000);

  pgIt("refuses installer actor/partial/helper/trigger/index drift and conserves canonical alias reapply", async () => {
    await owned(async db => {
      const base = pinnedSql(REFERRAL_INSTALLER_PINS.base);
      for (const role of ["anon", "authenticated", "service_role"] as const) {
        await rejectUnchanged(db, () => db.asRole(role, base), /requires a reviewed BYPASSRLS owner/);
      }
      const poisons = [
        ["create table public.research_partner_referral_events(owned_fixture_note text)", "drop table public.research_partner_referral_events", /already exists or drifted/],
        ["create function public.research_referral_v1_identity_guard() returns trigger language plpgsql as $$ begin return new; end $$", "drop function public.research_referral_v1_identity_guard()", /already exists or drifted/],
        [`create function public.referral_fixture_guard() returns trigger language plpgsql as $$ begin return new; end $$;
          create trigger referral_v1_member_auth_identity_guard before update on public.research_orders for each row execute function public.referral_fixture_guard()`,
          "drop trigger referral_v1_member_auth_identity_guard on public.research_orders; drop function public.referral_fixture_guard()", /already exists or drifted/],
        ["create index referral_v1_token_hash_unique on public.research_orders(id)", "drop index public.referral_v1_token_hash_unique", /already exists/],
      ] as const;
      for (const [poison, cleanup, message] of poisons) {
        await db.sql(poison);
        await rejectUnchanged(db, () => db.apply("base"), message);
        await noV1(db);
        await db.sql(cleanup);
      }
      // Drop/recreate an exact canonical unique constraint, not a convenient
      // weaker index. Restore its captured definition after the refusal.
      const unique = (await db.sql(`select conname,pg_get_constraintdef(oid) as definition from pg_constraint
        where conrelid='public.research_members'::regclass and conname='research_members_auth_user_id_key'`)).rows[0];
      expect(unique).toBeTruthy();
      await db.sql('alter table public.research_members drop constraint "' + unique.conname + '"');
      await rejectUnchanged(db, () => db.apply("base"), /ownership or idempotency uniqueness missing/);
      await db.sql('alter table public.research_members add constraint "' + unique.conname + '" ' + unique.definition);
      await db.installChain();
      const tombstone = createHash("sha256").update("OWNED-RETIRED-CODE").digest("hex");
      await db.sql("insert into referral_alias_v1_private.retired_codes(code_hash) values($1)", [tombstone]);
      const clean = await db.installationState(), conservation = await db.conserved();
      await db.apply("aliases"); await db.apply("aliases");
      expect(await db.installationState()).toEqual(clean);
      expect((await db.sql("select code_hash from referral_alias_v1_private.retired_codes")).rows).toEqual([{ code_hash: tombstone }]);
      const aliasPoisons = [
        ["alter schema referral_alias_v1_private owner to referral_fixture_foreign", "alter schema referral_alias_v1_private owner to postgres", /private schema owner\/privilege drift/],
        ["grant usage on schema referral_alias_v1_private to referral_fixture_foreign", "revoke all on schema referral_alias_v1_private from referral_fixture_foreign", /private schema owner\/privilege drift/],
        ["grant usage,create on schema referral_alias_v1_private to referral_fixture_foreign; alter function referral_alias_v1_private.retire_alias() owner to referral_fixture_foreign; revoke all on schema referral_alias_v1_private from referral_fixture_foreign",
          "alter function referral_alias_v1_private.retire_alias() owner to postgres", /retire helper owner\/privilege\/property drift/],
        ["create function referral_alias_v1_private.retire_alias(text) returns text language sql as $$ select $1 $$",
          "drop function referral_alias_v1_private.retire_alias(text)", /retire helper signature drift/],
        ["alter function referral_alias_v1_private.retire_alias() security invoker", "alter function referral_alias_v1_private.retire_alias() security definer", /retire helper owner\/privilege\/property drift/],
        ["grant select on referral_alias_v1_private.reassignments to referral_fixture_foreign", "revoke all on referral_alias_v1_private.reassignments from referral_fixture_foreign", /table owner\/privilege drift/],
        ["alter table referral_alias_v1_private.reassignments alter column reason drop not null",
          "alter table referral_alias_v1_private.reassignments alter column reason set not null", /reassignment shape drift/],
      ] as const;
      for (const [poison, cleanup, message] of aliasPoisons) {
        await db.sql(poison);
        await rejectUnchanged(db, () => db.apply("aliases"), message);
        await db.sql(cleanup);
      }
      // The canonical alias source deliberately DROPS/RECREATES its own trigger.
      // Check exact restoration, rather than inventing a preflight rejection.
      await db.sql("alter table referral_alias_v1_private.aliases disable trigger retire_alias");
      await db.apply("aliases");
      expect(await db.installationState()).toEqual(clean);
      expect(await db.conserved()).toEqual(conservation);
      await assertInstalled(db);
    });
  }, 180_000);
});

async function targetOwned(work: (db: Fixture) => Promise<void>, bootstrap = true) {
  if (!image) throw new Error("An exact owned PostgreSQL selector is required");
  const db = createReferralInstallerFixture({ installerAuthority: "owned_target_nonsuper_bypass" });
  try {
    await db.start(image);
    if (bootstrap) { await db.bootstrapCanonicalCore(); await db.bootstrapRemaining(); }
    await work(db);
  } finally { await db.close(); }
}
async function assertTargetActor(db: Fixture) {
  const state = await db.targetAuthority();
  expect(state).toMatchObject({ actor: { current_user: "postgres", session_user: "postgres", rolsuper: false,
    rolbypassrls: true, rolcreatedb: true, rolcreaterole: true, rolcanlogin: true }, platform_effective: false,
    database_create: true, public_create: true, auth_usage: true, auth_schema_foreign_owner: true, source_fence: true,
    auth: { foreign_owner: true, select: true, references: true, id_attnum: 2, id_type: "uuid", primary_key: [2], primary_key_live: true },
    crypto: { version: "1.3", schema: "extensions", owner: "postgres", extension_uuid: true, native_uuid: true, digest_bytea: true, digest_text: true } });
  expect(state.crypto_routines).toHaveLength(3);
  for (const routine of state.crypto_routines) {
    expect(routine).toMatchObject({ owner: "postgres", definer: false });
    expect(routine.execute).toEqual(["anon", "authenticated", "postgres", "service_role"].map(role => [role, true, true]));
  }
  expect(state.defaults.map((row: { creator: string; schema: string; kind: string }) => [row.creator, row.schema, row.kind])).toEqual([
    ["postgres", "public", "S"], ["postgres", "public", "f"], ["postgres", "public", "r"],
    ["supabase_admin", "public", "S"], ["supabase_admin", "public", "f"], ["supabase_admin", "public", "r"],
  ]);
  return state;
}

describe.sequential("M3 owned target-shaped NOSUPERUSER BYPASSRLS installer", () => {
  it("admits only the closed opt-in profile, with no external target or actor injection", () => {
    expect(() => createReferralInstallerFixture({ installerAuthority: "superuser" } as never)).toThrow("closed owned target");
    expect(() => createReferralInstallerFixture({ installerAuthority: "owned_target_nonsuper_bypass", url: "postgres://external.invalid/test" } as never)).toThrow("closed owned target");
    expect(() => createReferralInstallerFixture({ user: "postgres" } as never)).toThrow("closed owned target");
  });

  pgIt("uses the genuine target actor for the unchanged full chain and preserves both creator-default scopes and exact native ACL deltas", async () => {
    await targetOwned(async db => {
      const authority = await assertTargetActor(db), before = await db.conserved(), acls = await aclRows(db);
      expect((await db.catalog()).tables).toHaveLength(37);
      const denied = ["become_superuser", "become_platform", "alter_auth", "create_event_trigger", "platform_source_actor"] as const;
      for (const probe of denied) {
        const installation = await db.installationState();
        await expect(db.targetProbe(probe)).rejects.toMatchObject({ code: "42501" });
        expect(await db.installationState()).toEqual(installation);
        expect(await db.targetAuthority()).toEqual(authority);
      }
      expect((await db.sql("select to_regclass('public.research_m3_actor_probe') is null as absent")).rows[0].absent).toBe(true);
      await db.installChain(); // Every source remains pinned; no platform fallback.
      expect(await db.conserved()).toEqual(before);
      expect(await db.targetAuthority()).toEqual(authority);
      const expected = acls.filter(row => {
        if (!aclTables.includes(row.table_name)) return true;
        const client = ["PUBLIC", "anon", "authenticated"].includes(row.grantee);
        if (["research_partner_links", "research_attribution_touches", "research_idempotency_keys"].includes(row.table_name) && client) return false;
        return !(row.privilege_type === "TRUNCATE" && (client || row.grantee === "service_role"));
      });
      expect(await aclRows(db)).toEqual(expected);
      expect((await db.sql(`select count(*)::integer as owned from pg_class where oid=any($1::regclass[])
        and relowner='postgres'::regrole`, [db.prerequisiteNames.map(name => "public." + name)])).rows[0].owned).toBe(37);
      await assertInstalled(db);
      await rejectUnchanged(db, () => db.apply("base"), /already exists or drifted/);
      await rejectUnchanged(db, () => db.apply("lineage"), /Lineage already exists/);
      const installed = await db.installationState(); await db.apply("aliases"); await db.apply("aliases");
      expect(await db.installationState()).toEqual(installed);
      expect(await db.targetAuthority()).toEqual(authority);
      expect(await db.financialRows()).toEqual(Object.fromEntries(REFERRAL_FINANCIAL_TABLES.map(name => [name, 0])));
    });
  }, 240_000);

  pgIt("refuses actual insufficient owner/Auth/BYPASS authority without partial native install or privileged retry", async () => {
    await targetOwned(async db => {
      const baseline = await db.installationState(), authority = await assertTargetActor(db);
      for (const fault of ["no_bypass", "no_auth_usage", "no_auth_select", "foreign_link_owner"] as const) {
        await db.withTargetFault(fault, async () => {
          const before = await db.installationState(), faultAuthority = await db.targetAuthority();
          expect(faultAuthority.actor.rolsuper).toBe(false); expect(faultAuthority.source_fence).toBe(true);
          if (fault === "no_bypass") expect(faultAuthority.actor.rolbypassrls).toBe(false);
          if (fault === "no_auth_usage") expect(faultAuthority.auth_usage).toBe(false);
          if (fault === "no_auth_select") expect(faultAuthority.auth.select).toBe(false);
          if (fault === "no_bypass") await expect(db.apply("base")).rejects.toThrow("requires a reviewed BYPASSRLS owner");
          else await expect(db.apply("base")).rejects.toMatchObject({ code: "42501" });
          expect(await db.installationState()).toEqual(before);
          expect(await db.targetAuthority()).toEqual(faultAuthority);
          await noV1(db);
        });
        expect(await db.installationState()).toEqual(baseline);
        expect(await db.targetAuthority()).toEqual(authority);
      }
      const base = pinnedSql(REFERRAL_INSTALLER_PINS.base);
      for (const role of ["anon", "authenticated", "service_role"] as const) {
        await rejectUnchanged(db, () => db.asRole(role, base), /requires a reviewed BYPASSRLS owner/);
      }
      await db.installChain(); await assertInstalled(db); expect(await db.targetAuthority()).toEqual(authority);
    });
  }, 240_000);

  pgIt("rolls back real late base DDL as the non-superuser, conserving the earlier committed canonical stage", async () => {
    await targetOwned(async db => {
      const canonical = await db.installationState(), defaults = await db.defaults(), authority = await assertTargetActor(db);
      await db.withTargetFault("late_base_error", async () => {
        const before = await db.installationState(), faultAuthority = await db.targetAuthority();
        await expect(db.apply("base")).rejects.toMatchObject({ code: "P0001", message: "M3 owned late base failure" });
        expect(await db.installationState()).toEqual(before); expect(await db.defaults()).toEqual(defaults);
        expect(await db.targetAuthority()).toEqual(faultAuthority); await noV1(db);
      });
      expect(await db.installationState()).toEqual(canonical); expect(await db.targetAuthority()).toEqual(authority);
      await db.installChain(); await assertInstalled(db);
      expect(await db.defaults()).toEqual(defaults); expect(await db.targetAuthority()).toEqual(authority);
    });
  }, 240_000);

  pgIt("refuses a foreign creator-default grant before source DDL and never normalizes it into the target model", async () => {
    await targetOwned(async db => {
      const clean = await db.defaults(), authority = await assertTargetActor(db);
      await db.sql("alter default privileges for role postgres in schema public grant select on tables to referral_fixture_foreign");
      const poisoned = await db.installationState();
      await expect(db.bootstrapCanonicalCore()).rejects.toThrow("M3 owned target default-ACL mismatch");
      expect(await db.installationState()).toEqual(poisoned);
      expect((await db.sql("select to_regclass('public.research_members') is null as absent")).rows[0].absent).toBe(true);
      await db.sql("alter default privileges for role postgres in schema public revoke select on tables from referral_fixture_foreign");
      expect(await db.defaults()).toEqual(clean); expect(await db.targetAuthority()).toEqual(authority);
      await db.bootstrapCanonicalCore(); await db.bootstrapRemaining(); await db.installChain();
      await assertInstalled(db); expect(await db.defaults()).toEqual(clean);
    }, false);
  }, 240_000);
});
