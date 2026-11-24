/** Prepared, NOT RUN. Owned loopback PostgreSQL only; no managed endpoint/actor. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect } from "vitest";
import { createDurableJourneyFixture, pg16It } from "./assisted-order/request-intent/durable-journey.pg.fixture";

const SQL = "supabase/candidates/catalog_publication_staging_foundation.sql";
const SQL_SHA = "54e75101b36acb474a442a6b815d95d416763ea5c4dcdf84df6b71311209a879";
const FIXTURE = "server/research/assisted-order/request-intent/durable-journey.pg.fixture.ts";
const FIXTURE_SHA = "3889dfbf502614e95f4fd00c6d265d9049a41766fa1cff82e0fd124305db80b4";
const BOOTSTRAP = "supabase/verification/research-pricing-lineage-disposable-bootstrap.sql";
const BOOTSTRAP_SHA = "bab1f2a56f773d22254c48cf75db9a1f794ed1ac92acd54afdeea86045ab6ceb";
const canonical = ["research_products", "research_product_facts", "research_product_goals", "research_product_guide_links",
  "research_product_prohibited_claims", "research_product_open_questions", "research_supplement_candidates",
  "research_product_content", "research_product_variants", "research_product_prices", "research_product_media", "research_product_admin_audit"];
const tables = [...canonical, "research_catalog_publication_revisions", "research_catalog_publication_heads",
  "research_catalog_publication_operations", "research_catalog_approval_owner_events", "research_catalog_approval_events"];
function pinned(path: string, sha: string) {
  const bytes = readFileSync(resolve(process.cwd(), path));
  if (createHash("sha256").update(bytes).digest("hex") !== sha) throw Error("foundation_input_pin:" + path);
  return bytes.toString("utf8");
}
// Exact accepted storage/extension SUPPORT fragment only. No minimal legacy product replicas.
function support() {
  const raw = pinned(BOOTSTRAP, BOOTSTRAP_SHA);
  const start = raw.indexOf("create schema if not exists extensions;");
  const end = raw.indexOf("-- Minimal replicas of the legacy tables");
  if (start < 0 || end <= start || raw.indexOf("create schema if not exists extensions;", start + 1) !== -1) {
    throw Error("foundation_support_fragment_bounds");
  }
  return raw.slice(start, end);
}
const defaultSnapshot = `select coalesce(jsonb_agg(jsonb_build_array(d.defaclrole,d.defaclnamespace,d.defaclobjtype,d.defaclacl::text)
  order by d.defaclrole,d.defaclnamespace,d.defaclobjtype),'[]'::jsonb) as value from pg_default_acl d`;
const sqlLiteral = (value: string) => "'" + value.replaceAll("'", "''") + "'";
const historyInsert = (payload: string) => `insert into supabase_migrations.schema_migrations(version,statements,name)
  values ('owned-foundation-disposable-only',array[${sqlLiteral(payload)}], 'owned_foundation_disposable_only');`;

for (const image of ["postgres:17.6", "postgres:17.11"] as const) {
  pg16It("expanded empty staging foundation, exact default ACL, late rollback and closed postimage: " + image, async () => {
    // Refuse drift before any allocation. No environment URL, password or image override is accepted.
    const payload = pinned(SQL, SQL_SHA);
    pinned(FIXTURE, FIXTURE_SHA);
    const fixtureSupport = support();
    const db = createDurableJourneyFixture();
    let failed = false;
    let primary: unknown;
    try {
      await db.start({ dockerOnly: true, image, bootstrapProfile: "separate_owned_superuser" });
      db.ownedDockerContainer();
      await db.sql(fixtureSupport);
      // Disposable fixture setup only; reproduces captured postgres r/f/S defaults and roles.
      // The accepted separate bootstrap retains OID10; this distinct postgres login self-demotes.
      await db.sql(`alter role anon inherit; alter role authenticated inherit; alter role service_role inherit;
        alter default privileges for role postgres in schema public grant all on tables to postgres,anon,authenticated,service_role;
        alter default privileges for role postgres in schema public grant all on functions to postgres,anon,authenticated,service_role;
        alter default privileges for role postgres in schema public grant all on sequences to postgres,anon,authenticated,service_role;
        create schema supabase_migrations;
        create table supabase_migrations.schema_migrations(version text primary key,statements text[],name text,
          created_by text,idempotency_key text,rollback text[]);
        alter role postgres nosuperuser bypassrls inherit;`);
      expect((await db.sql(`select current_user,session_user,r.rolsuper,r.rolbypassrls,r.rolinherit,
        (select r2.rolname<>current_user and r2.rolsuper from pg_roles r2 where r2.oid=10) as separate_bootstrap
        from pg_roles r where r.rolname=current_user`)).rows[0]).toEqual({
        current_user: "postgres", session_user: "postgres", rolsuper: false, rolbypassrls: true, rolinherit: true, separate_bootstrap: true,
      });
      const beforeDefaults = (await db.sql(defaultSnapshot)).rows[0].value;
      const empty = async () => {
        expect((await db.sql("select count(*)::integer as n from pg_class where relnamespace='public'::regnamespace and relname=any($1::text[])", [tables])).rows[0].n).toBe(0);
        expect((await db.sql("select count(*)::integer as n from storage.buckets where id='research-product-media-production'")).rows[0].n).toBe(0);
        expect((await db.sql("select count(*)::integer as n from supabase_migrations.schema_migrations")).rows[0].n).toBe(0);
      };
      await empty();
      // Explicit disposable SQL transaction, not a claim that this test invokes the CLI transport.
      const tx = (after: string) => "begin;\n" + payload + "\n" + historyInsert(payload) + "\n" + after + "\ncommit;";
      await expect(db.sql(tx("do $owned_late$ begin raise exception 'owned_foundation_late_failure'; end $owned_late$;")))
        .rejects.toThrow("owned_foundation_late_failure");
      await empty();
      expect((await db.sql(defaultSnapshot)).rows[0].value).toEqual(beforeDefaults);
      await db.sql(tx(""));
      const actual = (await db.sql(`select c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) as owner
        from pg_class c where c.relnamespace='public'::regnamespace and c.relname=any($1::text[]) order by c.relname`, [tables])).rows;
      expect(actual).toHaveLength(17);
      expect(actual.every(row => row.relrowsecurity && row.relforcerowsecurity && row.owner === "postgres")).toBe(true);
      for (const table of tables) {
        // table is from the closed constant list above, never a host/browser selector.
        expect((await db.sql(`select count(*)::integer as n from public.${table}`)).rows[0].n).toBe(0);
      }
      expect((await db.sql(`select count(*)::integer as n from pg_class c
        cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
        where c.relnamespace='public'::regnamespace and c.relname=any($1::text[]) and a.grantee='service_role'::regrole`, [canonical])).rows[0].n).toBe(33);
      expect((await db.sql(`select count(*)::integer as n from pg_class c
        where c.relnamespace='public'::regnamespace and c.relname=any($1::text[]) and has_table_privilege('service_role',c.oid,'MAINTAIN')`, [canonical])).rows[0].n).toBe(0);
      expect((await db.sql(`select count(*)::integer as n from pg_class c cross join lateral
        aclexplode(coalesce(c.relacl,acldefault('S',c.relowner))) a
        where c.oid=pg_get_serial_sequence('public.research_catalog_approval_owner_events','sequence')::regclass and a.grantee<>c.relowner`)).rows[0].n).toBe(0);
      expect((await db.sql("select version from supabase_migrations.schema_migrations")).rows).toEqual([{ version: "owned-foundation-disposable-only" }]);
      expect((await db.sql("select statements from supabase_migrations.schema_migrations")).rows[0].statements).toEqual([payload]);
      expect((await db.sql(defaultSnapshot)).rows[0].value).toEqual(beforeDefaults);
      // A second fresh install must refuse without disturbing the accepted empty schema/history.
      await expect(db.sql(tx(""))).rejects.toThrow("foundation_target_not_empty_or_name_collision");
      expect((await db.sql("select count(*)::integer as n from supabase_migrations.schema_migrations")).rows[0].n).toBe(1);
    } catch (error) { failed = true; primary = error; }
    // Always attempt owned fixture cleanup; preserve falsy primary failures and cleanup failure independently.
    let cleanupFailed = false;
    let cleanup: unknown;
    try { await db.close(); } catch (error) { cleanupFailed = true; cleanup = error; }
    if (failed || cleanupFailed) throw new AggregateError([
      ...(failed ? [primary] : []), ...(cleanupFailed ? [cleanup] : []),
    ], "foundation_owned_qualification_or_cleanup_failed");
  }, 120_000);
}
