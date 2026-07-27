// Website 1 administrator-authority disposable PostgreSQL 16 verifier.
// It never connects to Supabase or another remote database.

import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTAINER = "xenios_admin_authority_dryrun";
const MIGRATION =
  "supabase/migrations/20260727190000_research_admin_authority.sql";
const ROLLBACK =
  "supabase/production/research-admin-authority-rollback.sql";
const ADMIN = "00000000-0000-4000-8000-000000000001";
const TARGET = "00000000-0000-4000-8000-000000000002";
const results = [];

function docker(args, input) {
  return spawnSync("docker", args, {
    input,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

function psql(sql, database = "postgres") {
  return docker(
    [
      "exec",
      "-i",
      CONTAINER,
      "psql",
      "-U",
      "postgres",
      "-d",
      database,
      "-q",
      "-t",
      "-A",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    sql,
  );
}

function record(name, pass, evidence = "") {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (evidence.trim()) console.log(`      ${evidence.trim().replace(/\n/g, "\n      ")}`);
  if (!pass) throw new Error(name);
}

function requireOk(name, result) {
  record(name, result.status === 0, result.stderr || result.stdout);
}

function expectScalar(name, sql, expected, database = "postgres") {
  const result = psql(sql, database);
  const actual = result.stdout.trim();
  record(
    name,
    result.status === 0 && actual === expected,
    result.status === 0
      ? `expected=${expected} actual=${actual}`
      : result.stderr,
  );
}

function expectRejected(name, sql, pattern, database = "postgres") {
  const result = psql(sql, database);
  const evidence = result.stderr || result.stdout;
  record(name, result.status !== 0 && pattern.test(evidence), evidence);
}

function apply(relativePath, database = "postgres") {
  return psql(readFileSync(path.join(ROOT, relativePath), "utf8"), database);
}

function asyncPsql(sql) {
  return new Promise((resolve) => {
    const child = spawn(
      "docker",
      [
        "exec",
        "-i",
        CONTAINER,
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-q",
        "-t",
        "-A",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(sql);
  });
}

function baseSchema(database = "postgres") {
  return psql(
    `
      create extension if not exists pgcrypto;
      do $$ begin
        create role anon nologin;
      exception when duplicate_object then null; end $$;
      do $$ begin
        create role authenticated nologin;
      exception when duplicate_object then null; end $$;
      do $$ begin
        create role service_role nologin bypassrls;
      exception when duplicate_object then null; end $$;
      create schema if not exists auth;
      create table if not exists auth.users (id uuid primary key);
      create table if not exists public.research_members (
        id uuid primary key default gen_random_uuid(),
        auth_user_id uuid unique references auth.users(id),
        status text not null
      );
      create table if not exists public.research_prelaunch_role_assignments (
        id uuid primary key default gen_random_uuid(),
        auth_user_id uuid not null references auth.users(id) on delete cascade,
        role text not null,
        assigned_by text not null,
        reason text not null,
        granted_at timestamptz not null default now(),
        expires_at timestamptz,
        revoked_at timestamptz,
        revoked_by text,
        revocation_reason text
      );
      create unique index if not exists
        research_prelaunch_role_assignments_active_unique
        on public.research_prelaunch_role_assignments (auth_user_id, role)
        where revoked_at is null;
      grant select, insert, update, delete
        on public.research_prelaunch_role_assignments to service_role;
    `,
    database,
  );
}

function cleanup() {
  docker(["rm", "-f", CONTAINER]);
}

try {
  cleanup();
  requireOk(
    "start disposable PostgreSQL 16",
    docker([
      "run",
      "-d",
      "--name",
      CONTAINER,
      "-e",
      "POSTGRES_PASSWORD=pw",
      "postgres:16",
    ]),
  );
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (
      docker(["exec", CONTAINER, "pg_isready", "-U", "postgres"]).status === 0
    ) {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  record("PostgreSQL became ready", ready);

  requireOk("create Supabase-compatible base", baseSchema());
  requireOk("migration first apply", apply(MIGRATION));
  requireOk("migration idempotent second apply", apply(MIGRATION));
  expectScalar(
    "migration creates zero authority, preference, and audit rows",
    `select (
       (select count(*) from public.research_admin_experience_preferences) +
       (select count(*) from public.research_admin_authority_audit) +
       (select count(*) from public.research_prelaunch_role_assignments)
     )::text;`,
    "0",
  );
  expectScalar(
    "both new tables force RLS",
    `select count(*)::text
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in (
          'research_admin_experience_preferences',
          'research_admin_authority_audit'
        )
        and c.relrowsecurity
        and c.relforcerowsecurity;`,
    "2",
  );
  expectScalar(
    "service role has no direct mutation privilege on authority tables",
    `select count(*)::text
       from information_schema.role_table_grants
      where table_schema = 'public'
        and grantee = 'service_role'
        and privilege_type in ('INSERT','UPDATE','DELETE')
        and table_name in (
          'research_admin_experience_preferences',
          'research_admin_authority_audit',
          'research_prelaunch_role_assignments'
        );`,
    "0",
  );
  expectRejected(
    "direct service-role preference DML is denied",
    `set role service_role;
     insert into public.research_admin_experience_preferences (
       auth_user_id, preferred_experience
     ) values ('${ADMIN}', 'admin');`,
    /permission denied/i,
  );
  expectRejected(
    "bootstrap rejects a fabricated or absent auth UUID",
    `select public.research_admin_assign_initial_super_admin(
       '${ADMIN}', 'Verified continuity.', 'bootstrap-missing-user'
     );`,
    /does not exist/i,
  );

  requireOk(
    "create only disposable verified identities",
    psql(
      `insert into auth.users (id) values ('${ADMIN}'), ('${TARGET}');
       insert into public.research_members (auth_user_id, status)
       values ('${ADMIN}', 'active');`,
    ),
  );
  const bootstrapSql = `select public.research_admin_assign_initial_super_admin(
    '${ADMIN}', 'Verified continuity.', 'bootstrap-admin-0001'
  );`;
  const [bootstrapA, bootstrapB] = await Promise.all([
    asyncPsql(bootstrapSql),
    asyncPsql(bootstrapSql),
  ]);
  record(
    "concurrent initial assignment is idempotent",
    bootstrapA.status === 0 && bootstrapB.status === 0,
    bootstrapA.stderr || bootstrapB.stderr,
  );
  expectScalar(
    "concurrent bootstrap creates one role and one immutable audit",
    `select concat(
       (select count(*) from public.research_prelaunch_role_assignments
         where role = 'super_admin'),
       ':',
       (select count(*) from public.research_admin_authority_audit
         where event_type = 'initial_super_admin_assigned')
     );`,
    "1:1",
  );

  for (const [name, sql] of [
    [
      "preference rejects a NULL expected version",
      `select public.research_admin_set_experience_preference(
        '${ADMIN}', 'member', null, 'preference-null-version'
      );`,
    ],
    [
      "preference rejects a NULL experience",
      `select public.research_admin_set_experience_preference(
        '${ADMIN}', null, 0, 'preference-null-experience'
      );`,
    ],
    [
      "preference rejects a NULL idempotency key",
      `select public.research_admin_set_experience_preference(
        '${ADMIN}', 'member', 0, null
      );`,
    ],
  ]) {
    expectRejected(name, sql, /invalid experience preference command/i);
  }

  const preferenceSql = (key) => `select public.research_admin_set_experience_preference(
    '${ADMIN}', 'member', 0, '${key}'
  );`;
  const [preferenceA, preferenceB] = await Promise.all([
    asyncPsql(preferenceSql("preference-concurrent-a")),
    asyncPsql(preferenceSql("preference-concurrent-b")),
  ]);
  record(
    "optimistic concurrency permits exactly one version-zero preference write",
    [preferenceA.status, preferenceB.status].filter((status) => status === 0)
      .length === 1 &&
      `${preferenceA.stderr}${preferenceB.stderr}`.includes(
        "preference version conflict",
      ),
    preferenceA.stderr || preferenceB.stderr,
  );
  const successfulPreferenceKey =
    preferenceA.status === 0
      ? "preference-concurrent-a"
      : "preference-concurrent-b";
  requireOk(
    "preference retry returns the stored idempotent result",
    psql(preferenceSql(successfulPreferenceKey)),
  );
  expectScalar(
    "preference and audit remain single-version",
    `select concat(
       (select version from public.research_admin_experience_preferences
         where auth_user_id = '${ADMIN}'),
       ':',
       (select count(*) from public.research_admin_authority_audit
         where event_type = 'experience_preference_changed')
     );`,
    "1:1",
  );

  requireOk(
    "role grant RPC succeeds",
    psql(
      `select public.research_admin_role_grant(
        '${ADMIN}', '${TARGET}', 'approved_internal_reviewer',
        'Approved reviewer.', null, 'grant-reviewer-0001'
      );`,
    ),
  );
  expectRejected(
    "direct service-role role revocation is denied",
    `set role service_role;
     update public.research_prelaunch_role_assignments
        set revoked_at = now()
      where auth_user_id = '${TARGET}';`,
    /permission denied/i,
  );
  requireOk(
    "role revoke RPC succeeds",
    psql(
      `select public.research_admin_role_revoke(
        '${ADMIN}',
        (select id from public.research_prelaunch_role_assignments
          where auth_user_id = '${TARGET}'
            and role = 'approved_internal_reviewer'),
        'Reviewer access ended.',
        'revoke-reviewer-0001'
      );`,
    ),
  );
  expectRejected(
    "authority audit update is rejected",
    `update public.research_admin_authority_audit
        set result = '{}'::jsonb
      where true;`,
    /append-only/i,
  );

  requireOk(
    "create zero-state rollback database",
    psql("create database rollback_zero;"),
  );
  requireOk(
    "create rollback-zero base",
    baseSchema("rollback_zero"),
  );
  requireOk(
    "apply migration in rollback-zero database",
    apply(MIGRATION, "rollback_zero"),
  );
  requireOk(
    "zero-state rollback succeeds",
    apply(ROLLBACK, "rollback_zero"),
  );
  expectScalar(
    "zero-state rollback removes every new object",
    `select concat(
       (to_regclass('public.research_admin_experience_preferences') is null)::text,
       ':',
       (to_regclass('public.research_admin_authority_audit') is null)::text,
       ':',
       (to_regprocedure(
         'public.research_admin_assign_initial_super_admin(uuid,text,text)'
       ) is null)::text
     );`,
    "true:true:true",
    "rollback_zero",
  );

  console.log(
    JSON.stringify({
      ok: results.every((result) => result.pass),
      checks: results.length,
      postgres: 16,
      remoteConnections: 0,
    }),
  );
} finally {
  cleanup();
}
