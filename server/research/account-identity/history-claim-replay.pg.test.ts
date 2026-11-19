/**
 * Owned PG16 compatibility / exact PG17.6 qualification; never a managed URL.
 * Applies the converged Pack02 foundation and current companion. Service/deps/store/hash/RPC
 * are real. Auth verification and the PostgREST transport are bounded fixture
 * inputs, not managed Supabase Auth/PostgREST or production readiness evidence.
 * The transport evaluates the actual store filters in PostgreSQL; it does not
 * synthesize a binding, consumed timestamp or successful command receipt.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDurableJourneyFixture, pg16It as existingPg16It } from "../assisted-order/request-intent/durable-journey.pg.fixture";
import { hashAccountChallenge } from "./challenge";
import { createProductionAccountIdentityDeps, createSupabaseAccountAuthVerifier } from "./production-deps";
import { AccountIdentityStoreUnavailableError, createSupabaseAccountIdentityStore } from "./production-store";
import { confirmCustomerHistoryClaim, type AccountClaimSubject } from "./service";

const foundation = readFileSync(resolve(process.cwd(), "supabase/pack02-candidates/20260812_research_account_organizations.sql"), "utf8");
const companion = readFileSync(resolve(process.cwd(), "supabase/candidates/account_history_claim_replay.sql"), "utf8");
const originalClaimSql = foundation.match(/create or replace function public\.research_account_commit_customer_claim\([\s\S]*?as \$\$[\s\S]*?\$\$;/)?.[0];
if (!originalClaimSql) throw new Error("Original canonical claim leaf is missing");
const ACTOR = "10000000-0000-4000-8000-000000000011";
const OTHER = "10000000-0000-4000-8000-000000000012";
const MEMBER = "20000000-0000-4000-8000-000000000011";
const OTHER_MEMBER = "20000000-0000-4000-8000-000000000012";
const ORG = "30000000-0000-4000-8000-000000000011";
const EMAIL = "history@example.invalid";
const lockPassword = randomUUID(); // Owned-cluster fixture credential only.
const request = { headers: { authorization: "Bearer owned-fixture-current-a" } };
const personal: AccountClaimSubject = { subjectType: "personal", memberId: MEMBER };
const db = createDurableJourneyFixture();
let legacyBaseline: unknown;
const pinned17 = process.env.XENIOS_ACCOUNT_FOUNDATION_PG17_6 === "1";
const pg16It = pinned17 ? it : existingPg16It;
const image = pinned17 ? "postgres:17.6" as const : "postgres:16" as const;
const run = Boolean(process.env.CI || process.env.XENIOS_RUN_PG16_VERIFIER === "1" || pinned17);
type Result = { data: unknown; error: unknown | null };

const columns: Record<string, readonly string[]> = {
  research_members: ["id", "application_id", "first_name", "status", "auth_user_id", "email"],
  research_applications: ["id", "last_name"],
  research_account_claim_challenges: ["id", "auth_user_id", "normalized_email", "customer_ref", "subject_type", "member_id", "organization_id", "token_hash", "expires_at", "consumed_at"],
  research_account_binding_events: ["id", "event_type", "auth_user_id", "organization_id", "customer_ref", "actor_label", "detail"],
  research_organization_users: ["id", "organization_id", "auth_user_id", "state", "roles", "password_change_required", "password_change_required_at"],
  research_account_organizations: ["id", "slug", "legal_name", "display_name", "status", "purchasing_email", "billing_email", "phone", "tax_id_last4", "purchase_order_required", "billing_address", "shipping_address"],
};

function transport({ loseCommitReply = false } = {}) {
  const rpcCalls: string[] = [];
  class Query implements PromiseLike<Result> {
    private selection: string[] = [];
    private predicates: Array<{ column: string; operator: "=" | ">" | "is"; value: unknown }> = [];
    private payload: Record<string, unknown> | null = null;
    private singleRow = false;
    constructor(private readonly table: string) {
      if (!Object.hasOwn(columns, table)) throw new Error("Unexpected fixture table");
    }
    private column(value: string) {
      if (!columns[this.table].includes(value)) throw new Error("Unexpected fixture column");
      return '"' + value + '"';
    }
    select(value: string) { this.selection = value.split(","); this.selection.forEach((c) => this.column(c)); return this; }
    eq(column: string, value: unknown) { this.column(column); this.predicates.push({ column, operator: "=", value }); return this; }
    gt(column: string, value: unknown) { this.column(column); this.predicates.push({ column, operator: ">", value }); return this; }
    is(column: string, value: unknown) { this.column(column); this.predicates.push({ column, operator: "is", value }); return this; }
    insert(payload: Record<string, unknown>) {
      if (!["research_account_claim_challenges", "research_account_binding_events"].includes(this.table)) throw new Error("Unexpected fixture write");
      Object.keys(payload).forEach((c) => this.column(c)); this.payload = payload; return this;
    }
    maybeSingle() { this.singleRow = true; return this; }
    single() { this.singleRow = true; return this; }
    async execute(): Promise<Result> {
      const values: unknown[] = [];
      const bind = (value: unknown) => { values.push(value); return "$" + values.length; };
      const projection = this.selection.map((c) => this.column(c)).join(",");
      if (!projection) throw new Error("Missing fixture projection");
      let sql: string;
      if (this.payload) {
        const entries = Object.entries(this.payload);
        sql = `insert into public.${this.table} (${entries.map(([key]) => this.column(key)).join(",")}) values (${entries.map(([, value]) => bind(value)).join(",")}) returning ${projection}`;
      } else {
        const filters = this.predicates.map(({ column, operator, value }) => {
          if (operator === "is") {
            if (value !== null) throw new Error("Unexpected fixture IS filter");
            return this.column(column) + " is null";
          }
          return this.column(column) + operator + bind(value);
        });
        sql = `select ${projection} from public.${this.table}` + (filters.length ? " where " + filters.join(" and ") : "");
      }
      try {
        const result = await db.asRole("service_role", sql, values);
        if (this.singleRow && result.rows.length > 1) throw new Error("Ambiguous fixture row");
        return { data: this.singleRow ? result.rows[0] ?? null : result.rows, error: null };
      } catch { return { data: null, error: { message: "Owned transport query failed" } }; }
    }
    then<A = Result, B = never>(yes?: ((value: Result) => A | PromiseLike<A>) | null, no?: ((error: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
      return this.execute().then(yes, no);
    }
  }
  const client = {
    from: (table: string) => new Query(table),
    async rpc(name: string, args: Record<string, unknown>): Promise<Result> {
      if (name !== "research_account_commit_customer_claim") throw new Error("Unexpected fixture RPC");
      rpcCalls.push(name);
      try {
        const result = await db.asRole("service_role", "select public.research_account_commit_customer_claim($1::uuid,$2::bytea,$3::uuid,$4::text) as value", [
          args.p_claim_id, args.p_token_hash, args.p_auth_user_id, args.p_verified_email,
        ]);
        if (loseCommitReply) {
          loseCommitReply = false;
          return { data: null, error: { message: "Synthetic response lost after commit" } };
        }
        return { data: result.rows[0].value, error: null };
      } catch { return { data: null, error: { message: "Owned transport RPC failed" } }; }
    },
  };
  const store = createSupabaseAccountIdentityStore(client as never);
  const auth = createSupabaseAccountAuthVerifier({ auth: {
    async getUser(token: string) {
      // The fixture models successful provider verification for two distinct
      // current accounts with the SAME email. Email does not confer ownership.
      const actor = token === "owned-fixture-current-a" ? ACTOR : token === "owned-fixture-current-b" ? OTHER : null;
      const found = actor ? (await db.sql("select id,email,email_confirmed_at from auth.users where id=$1", [actor])).rows[0] : null;
      return { data: { user: found ? { ...found, email_confirmed_at: found.email_confirmed_at?.toISOString() ?? null } : null }, error: null };
    },
  } });
  const deps = createProductionAccountIdentityDeps({
    store, auth, notifications: { deliver: async () => { throw new Error("No delivery authorized"); } },
    passwordEvidence: { changedAfter: async () => null }, siteUrl: "https://history.example.invalid",
  });
  return { store, deps, rpcCalls };
}

async function seed(subject: AccountClaimSubject = personal) {
  const claimId = randomUUID();
  const customerRef = "eac_" + randomUUID().replaceAll("-", "");
  const challengeToken = "owned-history-fixture-token-" + randomUUID();
  const input = { claimId, customerRef, userId: ACTOR, email: EMAIL, subject, tokenHash: hashAccountChallenge(challengeToken) };
  await transport().store.insertCustomerClaimChallenge({ ...input, expiresAt: new Date(Date.now() + 600_000).toISOString() });
  return { ...input, challengeToken };
}

async function outcome(claim: Awaited<ReturnType<typeof seed>>, overrides: Partial<{ claimId: string | null; tokenHash: string | null; userId: string | null; email: string | null }> = {}) {
  const input = { ...claim, ...overrides };
  return (await db.asRole("service_role", "select public.research_account_commit_customer_claim($1::uuid,$2::bytea,$3::uuid,$4::text) as value", [
    input.claimId, input.tokenHash === null ? null : "\\x" + input.tokenHash, input.userId, input.email,
  ])).rows[0].value;
}

async function canonicalState(claim: Awaited<ReturnType<typeof seed>>) {
  return (await db.sql(`select
    (select count(*)::int from public.research_customer_account_bindings where customer_ref=$1) as bindings,
    (select count(*)::int from public.research_account_binding_events where event_type='customer_ref_bound' and detail->>'claimId'=$2) as events,
    (select consumed_at::text from public.research_account_claim_challenges where id=$2::uuid) as consumed`, [claim.customerRef, claim.claimId])).rows[0];
}

async function legacyState(fixture = db) {
  return (await fixture.sql(`select jsonb_build_object(
    'table',(select jsonb_build_array(relowner,relacl::text,relrowsecurity,relforcerowsecurity) from pg_class where oid='public.research_organizations'::regclass),
    'columns',(select jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
      from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid='public.research_organizations'::regclass and a.attnum>0 and not a.attisdropped),
    'constraints',(select jsonb_agg(pg_get_constraintdef(oid) order by conname) from pg_constraint where conrelid='public.research_organizations'::regclass),
    'policies',(select jsonb_agg(jsonb_build_array(polname,polroles,pg_get_expr(polqual,polrelid)) order by polname) from pg_policy where polrelid='public.research_organizations'::regclass),
    'rows',(select jsonb_agg(to_jsonb(o) order by id) from public.research_organizations o)) as value`)).rows[0].value;
}

const legacySentinelSql = `create table public.research_organizations(id uuid primary key,name text not null,owner_partner_id uuid,state text not null,created_at timestamptz not null default clock_timestamp());
  alter table public.research_organizations enable row level security;
  create policy fixture_legacy_read on public.research_organizations for select to authenticated using (true);
  grant select on public.research_organizations to authenticated;
  insert into public.research_organizations values ('30000000-0000-4000-8000-000000000019','Synthetic partner organization','10000000-0000-4000-8000-000000000019','active','2026-01-01T00:00:00Z');`;
const managedDefaultsSql = `alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
  alter default privileges in schema public grant all on functions to anon,authenticated,service_role;
  alter default privileges in schema public grant all on sequences to anon,authenticated,service_role;`;

async function foundationState() {
  return (await db.sql(`select jsonb_build_object(
    'tables',(select jsonb_agg(jsonb_build_object('name',c.relname,'owner',c.relowner,'acl',c.relacl::text,'rls',c.relrowsecurity,
      'seal',obj_description(c.oid,'pg_class'),'columns',(select jsonb_agg(jsonb_build_array(a.attname,a.attacl::text,pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
        from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
      'constraints',(select jsonb_agg(pg_get_constraintdef(oid) order by conname) from pg_constraint where conrelid=c.oid),
      'triggers',(select jsonb_agg(jsonb_build_array(pg_get_triggerdef(oid),tgenabled) order by tgname) from pg_trigger where tgrelid=c.oid and not tgisinternal)) order by c.relname)
      from pg_class c where c.relnamespace='public'::regnamespace and c.relname=any(array['research_account_organizations','research_organization_users','research_organization_invitations',
        'research_account_claim_challenges','research_customer_account_bindings','research_organization_order_ownership','research_account_binding_events','research_organization_request_again'])),
    'routines',(select jsonb_agg(jsonb_build_array(p.proname,p.proowner,p.proacl::text,pg_get_functiondef(p.oid)) order by p.proname)
      from pg_proc p where p.pronamespace='public'::regnamespace and p.proname=any(array['research_bind_verified_organization_user','research_account_commit_customer_claim',
        'research_account_accept_organization_invitation','research_organization_order_ownership_validate','research_account_binding_events_immutable','research_organization_request_again_validate']))) as value`)).rows[0].value;
}

describe(`canonical account foundation/history replay, owned PostgreSQL ${pinned17 ? "17.6" : "16"}`, () => {
  beforeAll(async () => {
    if (!run) return;
    await db.start({ image });
    await db.sql(`create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
      create table public.research_applications(id uuid primary key,last_name text not null);
      create table public.research_members(id uuid primary key,auth_user_id uuid unique references auth.users(id),application_id uuid references public.research_applications(id),first_name text not null,status text not null,email text not null);
      create table public.research_orders(id uuid primary key);
      create role history_replay_foreign nologin;
      insert into auth.users values ('${ACTOR}','${EMAIL}',now()),('${OTHER}','${EMAIL}',now());
      insert into public.research_applications values ('${MEMBER}','Fixture'),('${OTHER_MEMBER}','Other');
      insert into public.research_members values ('${MEMBER}','${ACTOR}','${MEMBER}','History','active','${EMAIL}'),('${OTHER_MEMBER}','${OTHER}','${OTHER_MEMBER}','Other','active','${EMAIL}');`);
    // Disposable operator connection only: it must see the real RLS-protected
    // binding to acquire a lock. No production role or policy is changed.
    await db.sql("create role history_replay_lock login bypassrls password '" + lockPassword + "'");
    await db.sql(legacySentinelSql);
    legacyBaseline = await legacyState();
    await db.sql(managedDefaultsSql);
    await db.sql(foundation);
    await db.sql(`insert into public.research_account_organizations(id,slug,legal_name,display_name,purchasing_email,billing_email)
      values ('${ORG}','owned-history','Owned history','Owned history','${EMAIL}','${EMAIL}');
      grant select on public.research_members,public.research_applications,public.research_account_claim_challenges,public.research_account_organizations,public.research_organization_users to service_role;
      grant insert on public.research_account_claim_challenges,public.research_account_binding_events to service_role;
      grant select(id) on public.research_account_binding_events to service_role;
      grant usage on sequence public.research_account_binding_events_id_seq to service_role;`);
  }, 120_000);
  beforeEach(async () => {
    if (!run) return;
    await db.sql(foundation);
    await db.sql(companion);
    expect(await legacyState()).toEqual(legacyBaseline);
    await db.sql("update auth.users set email=$1,email_confirmed_at=now() where id in ($2,$3)", [EMAIL, ACTOR, OTHER]);
  });
  afterAll(async () => { if (run) await db.close(); });

  pg16It("converges namespace and exact privileges under managed default ACLs without changing partner authority or accepted replay", async () => {
    for (const invalidImage of ["postgres:17", "postgres:latest", "https://database.example.invalid", ""]) {
      const invalid = createDurableJourneyFixture();
      try {
        await expect(invalid.start({ image: invalidImage as never })).rejects.toThrow("Only the closed owned PostgreSQL image set is permitted");
      } finally { await invalid.close(); }
    }
    const claim = await seed();
    expect(await outcome(claim)).toBe("linked");
    const receipt = await canonicalState(claim);
    const before = await foundationState();
    await db.sql(foundation);
    await db.sql(foundation);
    expect(await foundationState()).toEqual(before);
    expect(await outcome(claim)).toBe("replayed");
    expect(await canonicalState(claim)).toEqual(receipt);
    expect(await legacyState()).toEqual(legacyBaseline);
    const permissions = (await db.sql(`select
      has_table_privilege('service_role','public.research_account_binding_events','SELECT') as event_table_read,
      has_column_privilege('service_role','public.research_account_binding_events','id','SELECT') as event_id_read,
      has_column_privilege('service_role','public.research_account_binding_events','detail','SELECT') as event_detail_read,
      has_column_privilege('service_role','public.research_organization_users','roles','UPDATE') as role_update,
      has_column_privilege('service_role','public.research_organization_users','password_change_required','UPDATE') as password_flag_update,
      has_column_privilege('service_role','public.research_account_organizations','status','UPDATE') as organization_status_update,
      has_column_privilege('service_role','public.research_account_organizations','display_name','UPDATE') as profile_update,
      has_table_privilege('service_role','public.research_account_claim_challenges','UPDATE,DELETE') as claim_update,
      has_table_privilege('service_role','public.research_customer_account_bindings','INSERT,UPDATE,DELETE') as binding_write,
      has_sequence_privilege('service_role','public.research_account_binding_events_id_seq','USAGE') as sequence_usage,
      has_sequence_privilege('service_role','public.research_account_binding_events_id_seq','SELECT,UPDATE') as sequence_write`)).rows[0];
    expect(permissions).toEqual({ event_table_read: false, event_id_read: true, event_detail_read: false, role_update: false,
      password_flag_update: true, organization_status_update: false, profile_update: true, claim_update: false, binding_write: false,
      sequence_usage: true, sequence_write: false });
    await expect(db.asRole("service_role", "update public.research_account_organizations set display_name='Current adapter profile' where id=$1 returning id", [ORG]))
      .resolves.toMatchObject({ rowCount: 1 });
    await expect(db.asRole("service_role", "update public.research_account_organizations set status='suspended' where id=$1", [ORG]))
      .rejects.toMatchObject({ code: "42501" });
    await expect(db.asRole("service_role", "update public.research_organization_users set roles=array['organization_owner']::text[] where auth_user_id=$1", [ACTOR]))
      .rejects.toMatchObject({ code: "42501" });
    for (const role of ["anon", "authenticated"] as const) {
      await expect(db.asRole(role, "select id from public.research_account_organizations")).rejects.toMatchObject({ code: "42501" });
      await expect(db.asRole(role, "select nextval('public.research_account_binding_events_id_seq')")).rejects.toMatchObject({ code: "42501" });
      const helpers = (await db.sql("select bool_or(has_function_privilege($1,oid,'EXECUTE')) as allowed from pg_proc where pronamespace='public'::regnamespace and proname in ('research_account_binding_events_immutable','research_organization_request_again_validate','research_organization_order_ownership_validate')", [role])).rows[0];
      expect(helpers.allowed).toBe(false);
    }
  });

  const foundationDrift = [
    { name: "broad inherited service grant", change: "grant delete on public.research_account_claim_challenges to service_role", restore: "revoke delete on public.research_account_claim_challenges from service_role" },
    { name: "browser column grant", change: "grant select(normalized_email) on public.research_account_claim_challenges to anon", restore: "revoke select(normalized_email) on public.research_account_claim_challenges from anon" },
    { name: "UUID default drift", change: "alter table public.research_account_organizations alter column id set default '00000000-0000-4000-8000-000000000000'::uuid", restore: "alter table public.research_account_organizations alter column id set default pg_catalog.gen_random_uuid()" },
    { name: "CHECK drift", change: "alter table public.research_account_organizations add constraint fixture_extra_check check(true)", restore: "alter table public.research_account_organizations drop constraint fixture_extra_check" },
    { name: "extra legacy organization FK", change: "alter table public.research_account_claim_challenges add constraint fixture_wrong_org_fk foreign key(organization_id) references public.research_organizations(id) not valid", restore: "alter table public.research_account_claim_challenges drop constraint fixture_wrong_org_fk" },
    { name: "disabled append-only trigger", change: "alter table public.research_account_binding_events disable trigger research_account_binding_events_immutable", restore: "alter table public.research_account_binding_events enable trigger research_account_binding_events_immutable" },
    { name: "foreign principal owner despite intact seal", change: "alter table public.research_account_organizations owner to history_replay_foreign", restore: "alter table public.research_account_organizations owner to postgres" },
  ];
  for (const scenario of foundationDrift) pg16It(`refuses ${scenario.name} without repairing the installed foundation`, async () => {
    await db.sql(scenario.change);
    const before = await foundationState();
    try {
      await expect(db.sql(foundation)).rejects.toThrow(/account foundation .*drift/);
      expect(await foundationState()).toEqual(before);
      expect(await legacyState()).toEqual(legacyBaseline);
    } finally { await db.sql(scenario.restore); }
    await db.sql(foundation);
    await db.sql(companion);
  });

  pg16It("rolls back a sabotaged fresh install under ordinary and wrapped appliers, refuses partial baselines, then installs without provisioning", async () => {
    const fresh = createDurableJourneyFixture();
    try {
      await fresh.start({ image });
      await fresh.sql(`create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
        create table public.research_members(id uuid primary key,auth_user_id uuid);
        create table public.research_orders(id uuid primary key);`);
      await fresh.sql(legacySentinelSql);
      const legacy = await legacyState(fresh);
      await fresh.sql(managedDefaultsSql);
      await fresh.sql(`create function public.fixture_poison_account_ddl() returns event_trigger language plpgsql as $$
        begin
          if to_regclass('public.research_account_organizations') is not null and not exists(
            select 1 from pg_attribute where attrelid='public.research_account_organizations'::regclass and attname='fixture_poison' and not attisdropped) then
            alter table public.research_account_organizations add column fixture_poison text;
          end if;
        end $$;
        create event trigger fixture_poison_account_ddl on ddl_command_end when tag in ('CREATE TABLE') execute function public.fixture_poison_account_ddl();`);
      const leftovers = async () => (await fresh.sql(`select
        (select count(*)::int from pg_class where relnamespace='public'::regnamespace and relname=any(array['research_account_organizations','research_organization_users','research_organization_invitations',
          'research_account_claim_challenges','research_customer_account_bindings','research_organization_order_ownership','research_account_binding_events','research_organization_request_again','research_account_binding_events_id_seq'])) as relations,
        (select count(*)::int from pg_proc where pronamespace='public'::regnamespace and proname=any(array['research_bind_verified_organization_user','research_account_commit_customer_claim',
          'research_account_accept_organization_invitation','research_organization_order_ownership_validate','research_account_binding_events_immutable','research_organization_request_again_validate'])) as routines`)).rows[0];
      for (const wrapped of [false, true]) {
        await expect(fresh.sql((wrapped ? "begin;\n" : "") + foundation)).rejects.toThrow(/account foundation table structure drift/);
        expect(await leftovers()).toEqual({ relations: 0, routines: 0 });
        expect(await legacyState(fresh)).toEqual(legacy);
      }
      await fresh.sql("drop event trigger fixture_poison_account_ddl; drop function public.fixture_poison_account_ddl()");
      await fresh.sql("create table public.research_account_organizations(id integer)");
      await expect(fresh.sql(foundation)).rejects.toThrow("account foundation partial baseline");
      expect(await leftovers()).toEqual({ relations: 1, routines: 0 });
      await fresh.sql("drop table public.research_account_organizations");
      await fresh.sql("alter table auth.users alter column id type text using id::text");
      await expect(fresh.sql(foundation)).rejects.toThrow("account foundation canonical prerequisite shape unavailable");
      expect(await leftovers()).toEqual({ relations: 0, routines: 0 });
      await fresh.sql("alter table auth.users alter column id type uuid using id::uuid");
      await fresh.sql(foundation);
      await fresh.sql(companion);
      await fresh.sql(foundation);
      await fresh.sql(companion);
      expect(await leftovers()).toEqual({ relations: 9, routines: 6 });
      expect(await legacyState(fresh)).toEqual(legacy);
      expect((await fresh.sql(`select
        (select count(*)::int from public.research_account_organizations) as companies,
        (select count(*)::int from public.research_organization_users) as memberships,
        (select count(*)::int from auth.users) as credentials,
        (select count(*)::int from public.research_account_claim_challenges) as challenges,
        (select count(*)::int from public.research_account_binding_events) as events`)).rows[0])
        .toEqual({ companies: 0, memberships: 0, credentials: 0, challenges: 0, events: 0 });
    } finally { await fresh.close(); }
  }, 120_000);

  pg16It("recovers an actual committed-but-lost store RPC reply with one binding and one canonical receipt", async () => {
    const claim = await seed();
    const current = transport({ loseCommitReply: true });
    await expect(confirmCustomerHistoryClaim(current.deps, request, claim)).rejects.toBeInstanceOf(AccountIdentityStoreUnavailableError);
    const committed = await canonicalState(claim);
    expect(committed).toMatchObject({ bindings: 1, events: 1, consumed: expect.any(String) });
    await expect(confirmCustomerHistoryClaim(current.deps, request, claim)).resolves.toEqual({
      ok: true, value: { customerRef: claim.customerRef, linked: false, replayed: true },
    });
    expect(current.rpcCalls).toHaveLength(2);
    expect(await canonicalState(claim)).toEqual(committed);
  });

  pg16It("serializes concurrent same-ID service confirmations and preserves the original consumed timestamp", async () => {
    const claim = await seed();
    const a = transport(), b = transport();
    const results = await Promise.all([
      confirmCustomerHistoryClaim(a.deps, request, claim), confirmCustomerHistoryClaim(b.deps, request, claim),
    ]);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(results.filter((result) => result.ok && result.value.linked)).toHaveLength(1);
    expect(results.filter((result) => result.ok && result.value.replayed)).toHaveLength(1);
    const committed = await canonicalState(claim);
    expect(committed).toMatchObject({ bindings: 1, events: 1 });
    expect(await outcome(claim)).toBe("replayed");
    expect(await canonicalState(claim)).toEqual(committed);
  });

  pg16It("replays a legacy foundation receipt after adoption, and reapplies without ABI/ACL drift", async () => {
    // Reapply now preserves accepted replay. Install the exact original source
    // leaf explicitly to keep this old-consumed-refusal control meaningful.
    await db.sql(originalClaimSql);
    const claim = await seed();
    expect(await outcome(claim)).toBe("linked");
    expect(await outcome(claim)).toBe("invalid"); // Preserve evidence of the original defect.
    const committed = await canonicalState(claim);
    await db.sql(companion);
    await db.sql(companion);
    expect(await outcome(claim)).toBe("replayed");
    expect(await canonicalState(claim)).toEqual(committed);
    const p = (await db.sql(`select p.prosecdef,p.proconfig,p.pronargs,p.proargnames,
      pg_get_userbyid(p.proowner) as owner,pg_get_function_result(p.oid) as result,
      has_function_privilege('service_role',p.oid,'execute') as service,
      has_function_privilege('anon',p.oid,'execute') as anon,
      has_function_privilege('authenticated',p.oid,'execute') as authenticated
      from pg_proc p where p.oid='public.research_account_commit_customer_claim(uuid,bytea,uuid,text)'::regprocedure`)).rows[0];
    expect(p).toEqual({ prosecdef: true, proconfig: ['search_path=""'], pronargs: 4,
      proargnames: ["p_claim_id", "p_token_hash", "p_auth_user_id", "p_verified_email"], owner: "postgres", result: "text", service: true, anon: false, authenticated: false });
  });

  pg16It("does not turn a consumed challenge plus another command's binding into a receipt", async () => {
    const first = await seed();
    expect(await outcome(first)).toBe("linked");
    const other = await seed();
    await db.sql("update public.research_account_claim_challenges set customer_ref=$1,consumed_at=clock_timestamp() where id=$2", [first.customerRef, other.claimId]);
    const before = await canonicalState({ ...other, customerRef: first.customerRef });
    expect(await outcome(other)).toBe("invalid");
    expect(await canonicalState({ ...other, customerRef: first.customerRef })).toEqual(before);
  });

  for (const mismatch of ["actor", "email", "subject", "time", "ambiguous"] as const) pg16It(`rejects an owner-seeded ${mismatch} receipt mismatch`, async () => {
    const first = await seed();
    expect(await outcome(first)).toBe("linked");
    const claim = await seed();
    // Deliberately seed an impossible baseline as the disposable DB owner. A
    // mere consumed bit and same binding must not bypass receipt validation.
    await db.sql("update public.research_account_claim_challenges set customer_ref=$1,consumed_at=clock_timestamp() where id=$2", [first.customerRef, claim.claimId]);
    const detail = { subjectType: mismatch === "subject" ? "organization" : "personal", outcome: "replayed", claimId: claim.claimId };
    await db.sql(`insert into public.research_account_binding_events(event_type,auth_user_id,customer_ref,actor_label,detail,occurred_at)
      values ('customer_ref_bound',$1,$2,$3,$4::jsonb,${mismatch === "time" ? "now()-interval '1 day'" : "clock_timestamp()"})`, [
      mismatch === "actor" ? OTHER : ACTOR, first.customerRef,
      mismatch === "email" ? "different@example.invalid" : EMAIL, JSON.stringify(detail),
    ]);
    if (mismatch === "ambiguous") await db.sql(`insert into public.research_account_binding_events(event_type,auth_user_id,customer_ref,actor_label,detail)
      values ('customer_ref_bound',$1,$2,$3,$4::jsonb)`, [ACTOR, first.customerRef, EMAIL, JSON.stringify(detail)]);
    const before = await canonicalState({ ...claim, customerRef: first.customerRef });
    expect(await outcome(claim)).toBe("invalid");
    expect(await canonicalState({ ...claim, customerRef: first.customerRef })).toEqual(before);
  });

  const invalidProofs = ["actor", "token", "email", "unverified", "expired", "infinite", "null-token", "null-email"] as const;
  for (const kind of invalidProofs) pg16It(`denies consumed replay for ${kind} proof without a second effect`, async () => {
    const claim = await seed();
    expect(await outcome(claim)).toBe("linked");
    const before = await canonicalState(claim);
    const overrides: Parameters<typeof outcome>[1] = {};
    if (kind === "actor") overrides.userId = OTHER;
    if (kind === "token") overrides.tokenHash = "0".repeat(64);
    if (kind === "email") overrides.email = "wrong@example.invalid";
    if (kind === "null-token") overrides.tokenHash = null;
    if (kind === "null-email") overrides.email = null;
    if (kind === "unverified") await db.sql("update auth.users set email_confirmed_at=null where id=$1", [ACTOR]);
    if (kind === "expired") await db.sql("update public.research_account_claim_challenges set expires_at=now()-interval '1 second' where id=$1", [claim.claimId]);
    if (kind === "infinite") await db.sql("update public.research_account_claim_challenges set expires_at='infinity' where id=$1", [claim.claimId]);
    expect(await outcome(claim, overrides)).toBe("invalid");
    expect(await canonicalState(claim)).toEqual(before);
  });

  pg16It("keeps same-email second accounts, changed tokens, expired claims and other personal subjects out of the service path", async () => {
    const claim = await seed();
    expect(await outcome(claim)).toBe("linked");
    const current = transport();
    const otherRequest = { headers: { authorization: "Bearer owned-fixture-current-b" } };
    const denied = await confirmCustomerHistoryClaim(current.deps, otherRequest, claim);
    expect(denied.ok).toBe(false);
    expect(current.rpcCalls).toHaveLength(0);
    expect((await confirmCustomerHistoryClaim(current.deps, request, { ...claim, challengeToken: "changed-fixture-token-value" })).ok).toBe(false);
    expect(current.rpcCalls).toHaveLength(1);
    await db.sql("update public.research_account_claim_challenges set member_id=$1 where id=$2", [OTHER_MEMBER, claim.claimId]);
    expect((await confirmCustomerHistoryClaim(current.deps, request, claim)).ok).toBe(false);
    expect(current.rpcCalls).toHaveLength(1);
    await db.sql("update public.research_account_claim_challenges set member_id=$1,expires_at=now()-interval '1 second' where id=$2", [MEMBER, claim.claimId]);
    expect((await confirmCustomerHistoryClaim(current.deps, request, claim)).ok).toBe(false);
    expect(current.rpcCalls).toHaveLength(1);
    expect(await canonicalState(claim)).toMatchObject({ bindings: 1, events: 1 });
  });

  pg16It("preserves unconsumed organization claims and conflicts, without granting personal callers an organization", async () => {
    const orgClaim = await seed({ subjectType: "organization", organizationId: ORG });
    const current = transport();
    const orgResult = await current.store.commitCustomerClaimHash(orgClaim);
    expect(orgResult).toBe("linked");
    expect(await current.store.commitCustomerClaimHash(orgClaim)).toBe("replayed");
    const before = await canonicalState(orgClaim);
    expect((await confirmCustomerHistoryClaim(current.deps, request, orgClaim)).ok).toBe(false);
    expect(current.rpcCalls).toHaveLength(2); // No org membership; service never commits.
    const competing = await seed();
    await db.sql("update public.research_account_claim_challenges set customer_ref=$1 where id=$2", [orgClaim.customerRef, competing.claimId]);
    expect(await outcome(competing)).toBe("conflict");
    expect(await canonicalState(orgClaim)).toEqual(before);
    expect(await canonicalState(competing)).toMatchObject({ bindings: 0, events: 0, consumed: null });
  });

  pg16It("recognizes a distinct first commit against an existing same-subject binding only after that claim has its own receipt", async () => {
    const first = await seed();
    expect(await outcome(first)).toBe("linked");
    const second = await seed();
    await db.sql("update public.research_account_claim_challenges set customer_ref=$1 where id=$2", [first.customerRef, second.claimId]);
    expect(await outcome(second)).toBe("replayed");
    const before = await canonicalState({ ...second, customerRef: first.customerRef });
    expect(before).toMatchObject({ bindings: 1, events: 1 });
    expect(await outcome(second)).toBe("replayed");
    expect(await canonicalState({ ...second, customerRef: first.customerRef })).toEqual(before);
  });

  pg16It("does not replay after the current binding changes subject", async () => {
    const claim = await seed();
    expect(await outcome(claim)).toBe("linked");
    await db.sql("update public.research_customer_account_bindings set member_id=$1 where customer_ref=$2", [OTHER_MEMBER, claim.customerRef]);
    const before = await canonicalState(claim);
    expect(await outcome(claim)).toBe("conflict");
    expect(await canonicalState(claim)).toEqual(before);
  });

  pg16It("rechecks expiry after an actual binding-lock wait without consuming the waiting claim", async () => {
    const first = await seed();
    expect(await outcome(first)).toBe("linked");
    const claim = await seed();
    await db.sql("update public.research_account_claim_challenges set customer_ref=$1,expires_at=clock_timestamp()+interval '2 seconds' where id=$2", [first.customerRef, claim.claimId]);
    await db.sql("grant select,update on public.research_customer_account_bindings to history_replay_lock");
    const pool = db.poolForLogin("history_replay_lock", lockPassword);
    const locker = await pool.connect();
    let pending: Promise<unknown> | null = null;
    try {
      await locker.query("begin");
      const pid = (await locker.query("select pg_backend_pid() as pid")).rows[0].pid;
      const locked = await locker.query("select id,customer_ref from public.research_customer_account_bindings where customer_ref=$1 for update", [first.customerRef]);
      expect(locked.rows).toEqual([{ id: expect.any(String), customer_ref: first.customerRef }]);
      pending = outcome(claim);
      let blocked = false;
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline) {
        blocked = Number((await db.sql("select count(*) as count from pg_stat_activity a where $1::integer=any(pg_blocking_pids(a.pid))", [pid])).rows[0].count) > 0;
        if (blocked) break;
        await new Promise((done) => setTimeout(done, 20));
      }
      expect(blocked).toBe(true);
      await db.sql("select pg_sleep(2.1)");
      await locker.query("commit");
      expect(await pending).toBe("invalid");
      expect(await canonicalState(claim)).toMatchObject({ events: 0, consumed: null });
      expect(await canonicalState(first)).toMatchObject({ bindings: 1, events: 1 });
    } finally {
      await locker.query("rollback");
      locker.release();
      await pending?.catch(() => undefined);
      await pool.end();
      await db.sql("revoke all on public.research_customer_account_bindings from history_replay_lock");
    }
  }, 30_000);

  pg16It("keeps canonical receipt rows append-only and rejects browser-role RPC calls", async () => {
    const claim = await seed();
    expect(await outcome(claim)).toBe("linked");
    for (const role of ["anon", "authenticated"] as const) {
      await expect(db.asRole(role, "select public.research_account_commit_customer_claim($1::uuid,$2::bytea,$3::uuid,$4::text)", [claim.claimId, "\\x" + claim.tokenHash, ACTOR, EMAIL])).rejects.toMatchObject({ code: "42501" });
      await expect(db.asRole(role, "insert into public.research_account_binding_events(event_type,actor_label) values ('customer_ref_bound','forged')")).rejects.toMatchObject({ code: "42501" });
    }
    await expect(db.sql("update public.research_account_binding_events set actor_label='changed' where detail->>'claimId'=$1", [claim.claimId])).rejects.toMatchObject({ code: "55000" });
    await expect(db.sql("delete from public.research_account_binding_events where detail->>'claimId'=$1", [claim.claimId])).rejects.toMatchObject({ code: "55000" });
    expect(await canonicalState(claim)).toMatchObject({ bindings: 1, events: 1 });
  });

  const drift = [
    { name: "foreign RPC owner", change: "alter function public.research_account_commit_customer_claim(uuid,bytea,uuid,text) owner to history_replay_foreign", restore: "alter function public.research_account_commit_customer_claim(uuid,bytea,uuid,text) owner to postgres" },
    { name: "foreign event-table owner", change: "alter table public.research_account_binding_events owner to history_replay_foreign", restore: "alter table public.research_account_binding_events owner to postgres" },
    { name: "foreign receipt-helper owner", change: "alter function public.research_account_binding_events_immutable() owner to history_replay_foreign", restore: "alter function public.research_account_binding_events_immutable() owner to postgres" },
    { name: "browser execute grant", change: "grant execute on function public.research_account_commit_customer_claim(uuid,bytea,uuid,text) to authenticated", restore: "revoke all on function public.research_account_commit_customer_claim(uuid,bytea,uuid,text) from authenticated" },
    { name: "disabled receipt trigger", change: "alter table public.research_account_binding_events disable trigger research_account_binding_events_immutable", restore: "alter table public.research_account_binding_events enable trigger research_account_binding_events_immutable" },
    { name: "RPC search-path drift", change: "alter function public.research_account_commit_customer_claim(uuid,bytea,uuid,text) set search_path=public", restore: "alter function public.research_account_commit_customer_claim(uuid,bytea,uuid,text) set search_path=''" },
    { name: "unrecognized RPC body", change: "create or replace function public.research_account_commit_customer_claim(p_claim_id uuid,p_token_hash bytea,p_auth_user_id uuid,p_verified_email text) returns text language plpgsql security definer set search_path='' as $$ begin return 'replayed'; end; $$", restore: originalClaimSql },
  ];
  for (const scenario of drift) pg16It(`rejects ${scenario.name} before replacing the installed RPC`, async () => {
    await db.sql(scenario.change);
    const before = (await db.sql("select pg_get_functiondef('public.research_account_commit_customer_claim(uuid,bytea,uuid,text)'::regprocedure) as body")).rows[0].body;
    try {
      await expect(db.sql(companion)).rejects.toThrow(/account claim replay .* drift/);
      const after = (await db.sql("select pg_get_functiondef('public.research_account_commit_customer_claim(uuid,bytea,uuid,text)'::regprocedure) as body")).rows[0].body;
      expect(after).toBe(before);
    } finally { await db.sql(scenario.restore); }
    await db.sql(companion);
  });
});
