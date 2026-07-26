// Assessment v2 migration dry run (throwaway local Postgres only).
//
// Applies the canonical assessment, blueprint, and plan foundations, seeds
// legacy rows, applies the v2 migration twice, and proves the release-critical
// invariants. This script never connects to Supabase or any remote database.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTAINER = "xenios_assessment_v2_dryrun";
const PORT = "5546";
const results = [];

function docker(args, input) {
  return spawnSync("docker", args, {
    input,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

function psql(sql, { stopOnError = true } = {}) {
  const args = [
    "exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres",
    "-q", "-t", "-A",
  ];
  if (stopOnError) args.push("-v", "ON_ERROR_STOP=1");
  const result = docker(args, sql);
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function applyFile(relativePath) {
  return psql(readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function record(name, pass, evidence = "") {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (evidence.trim()) {
    console.log(evidence.trim().split("\n").map((line) => `      ${line}`).join("\n"));
  }
}

function requireOk(name, result) {
  const pass = result.status === 0;
  record(name, pass, pass ? result.stdout : result.stderr);
  if (!pass) throw new Error(name);
}

function expectScalar(name, sql, expected) {
  const result = psql(sql);
  const actual = result.stdout.trim();
  const pass = result.status === 0 && actual === expected;
  record(name, pass, result.status === 0 ? `expected=${expected} actual=${actual}` : result.stderr);
  if (!pass) throw new Error(name);
}

function expectRejected(name, sql, pattern) {
  const result = psql(sql);
  const evidence = result.stderr || result.stdout;
  const pass = result.status !== 0 && pattern.test(evidence);
  record(name, pass, evidence);
  if (!pass) throw new Error(name);
}

function cleanup() {
  docker(["rm", "-f", CONTAINER]);
}

try {
  cleanup();
  const run = docker([
    "run", "-d", "--name", CONTAINER,
    "-e", "POSTGRES_PASSWORD=pw",
    "-p", `${PORT}:5432`,
    "postgres:16",
  ]);
  if (run.status !== 0) throw new Error(run.stderr || "could not start postgres");

  let readyStreak = 0;
  for (let attempt = 0; attempt < 60 && readyStreak < 2; attempt += 1) {
    const ready = docker(["exec", CONTAINER, "pg_isready", "-U", "postgres"]);
    readyStreak = ready.status === 0 ? readyStreak + 1 : 0;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (readyStreak < 2) throw new Error("postgres did not become ready");

  requireOk("create Supabase-compatible database roles", psql(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
  `));

  for (const relativePath of [
    "supabase/research-assessment.sql",
    "supabase/research-blueprint.sql",
    "supabase/research-plans.sql",
  ]) {
    requireOk(`prerequisite: ${relativePath}`, applyFile(relativePath));
  }

  requireOk("seed legacy monthly row and blueprint review pair", psql(`
    insert into public.research_assessment_responses (
      id, member_id, definition_id, definition_version, mode, status,
      created_at, started_at, last_saved_at
    ) values (
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      'monthly-v1', 1, 'monthly_check_in', 'in_progress',
      '2026-05-08T12:00:00Z', '2026-05-08T12:00:00Z', '2026-05-09T12:00:00Z'
    );

    insert into public.research_blueprints (
      id, member_id, version, state, content, published_at
    ) values (
      '30000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      1, 'published', '{"recommendations":[]}'::jsonb, '2026-05-01T12:00:00Z'
    ), (
      '30000000-0000-0000-0000-000000000002',
      '20000000-0000-0000-0000-000000000001',
      2, 'samuel_review',
      '{"recommendations":[
        {"id":"fitness","kind":"fitness_program"},
        {"id":"nutrition","kind":"nutrition_program"},
        {"id":"lifestyle","kind":"lifestyle"}
      ]}'::jsonb,
      null
    );
  `));

  requireOk("Assessment v2 migration: first apply", applyFile("supabase/research-assessment-v2.sql"));
  requireOk("Assessment v2 migration: idempotent second apply", applyFile("supabase/research-assessment-v2.sql"));

  expectScalar(
    "legacy monthly response receives deterministic UTC cycle key",
    `select cycle_key from public.research_assessment_responses
      where id = '10000000-0000-0000-0000-000000000001';`,
    "2026-05",
  );
  expectScalar(
    "RLS remains enabled on every Assessment v2 private table",
    `select count(*)::text
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in (
          'research_assessment_responses',
          'research_blueprints',
          'research_xenios30_plans',
          'research_plan_review_audit_events'
        )
        and c.relrowsecurity;`,
    "4",
  );
  expectScalar(
    "health-derived and audit tables force RLS even for table owners",
    `select count(*)::text
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in (
          'research_assessment_responses',
          'research_blueprints',
          'research_plan_review_audit_events'
        )
        and c.relforcerowsecurity;`,
    "3",
  );

  requireOk("atomic publish RPC commits blueprint and plan draft", psql(`
    select id from public.publish_research_blueprint(
      '30000000-0000-0000-0000-000000000002',
      '2026-06-01T12:00:00Z',
      'reviewer@example.invalid',
      'approved'
    );
  `));
  expectScalar(
    "exactly one current published blueprint remains",
    `select count(*)::text from public.research_blueprints
      where member_id = '20000000-0000-0000-0000-000000000001'
        and state = 'published';`,
    "1",
  );
  expectScalar(
    "previously published blueprint is superseded",
    `select state from public.research_blueprints
      where id = '30000000-0000-0000-0000-000000000001';`,
    "updated",
  );
  expectScalar(
    "publication creates exactly one linked human-review plan draft",
    `select count(*)::text from public.research_xenios30_plans
      where source_blueprint_id = '30000000-0000-0000-0000-000000000002'
        and state = 'samuel_review'
        and jsonb_array_length(content->'fitnessDraft') = 1
        and jsonb_array_length(content->'nutritionDraft') = 1;`,
    "1",
  );

  requireOk("idempotent publish retry is harmless", psql(`
    select id from public.publish_research_blueprint(
      '30000000-0000-0000-0000-000000000002',
      '2026-06-01T12:00:00Z',
      'reviewer@example.invalid',
      'approved'
    );
  `));
  expectScalar(
    "publish retry does not duplicate plan drafts",
    `select count(*)::text from public.research_xenios30_plans
      where source_blueprint_id = '30000000-0000-0000-0000-000000000002';`,
    "1",
  );

  requireOk("seed a distinct later assessment and Blueprint in the same month", psql(`
    insert into public.research_assessment_responses (
      id, member_id, definition_id, definition_version, mode, status,
      cycle_key, revision, answers, submitted_at
    ) values (
      '10000000-0000-0000-0000-000000000002',
      '20000000-0000-0000-0000-000000000001',
      'initial-v3', 3, 'initial', 'submitted',
      'revision-2', 0, '{}'::jsonb, '2026-06-10T12:00:00Z'
    );
    insert into public.research_blueprints (
      id, member_id, version, state, content, assessment_response_id
    ) values (
      '30000000-0000-0000-0000-000000000003',
      '20000000-0000-0000-0000-000000000001',
      3, 'samuel_review', '{"recommendations":[]}'::jsonb,
      '10000000-0000-0000-0000-000000000002'
    );
    select id from public.publish_research_blueprint(
      '30000000-0000-0000-0000-000000000003',
      '2026-06-15T12:00:00Z',
      'reviewer@example.invalid',
      'approved'
    );
  `));
  expectScalar(
    "a later same-month publication archives the prior active plan draft",
    `select count(*)::text from public.research_xenios30_plans
      where member_id = '20000000-0000-0000-0000-000000000001'
        and month_label = '2026-06'
        and state in ('draft', 'samuel_review');`,
    "1",
  );
  requireOk("republish the original Blueprint in the same month", psql(`
    update public.research_blueprints
       set state = 'samuel_review'
     where id = '30000000-0000-0000-0000-000000000002';
    select id from public.publish_research_blueprint(
      '30000000-0000-0000-0000-000000000002',
      '2026-06-20T12:00:00Z',
      'reviewer@example.invalid',
      're-approved'
    );
  `));
  expectScalar(
    "A-B-A publication restores exactly one active plan draft",
    `select count(*)::text from public.research_xenios30_plans
      where member_id = '20000000-0000-0000-0000-000000000001'
        and month_label = '2026-06'
        and state in ('draft', 'samuel_review');`,
    "1",
  );
  expectScalar(
    "A-B-A publication reactivates the target Blueprint plan",
    `select state from public.research_xenios30_plans
      where source_blueprint_id = '30000000-0000-0000-0000-000000000002'
        and month_label = '2026-06';`,
    "samuel_review",
  );
  requireOk("publish plan A, then run the published-plan A-B-A variant", psql(`
    update public.research_xenios30_plans
       set state = 'published',
           reviewed_by = 'Samuel',
           published_at = '2026-06-21T12:00:00Z',
           member_acknowledged_at = '2026-06-22T12:00:00Z'
     where source_blueprint_id = '30000000-0000-0000-0000-000000000002'
       and month_label = '2026-06';

    update public.research_blueprints
       set state = 'samuel_review'
     where id = '30000000-0000-0000-0000-000000000003';
    select id from public.publish_research_blueprint(
      '30000000-0000-0000-0000-000000000003',
      '2026-06-23T12:00:00Z',
      'reviewer@example.invalid',
      're-approved B'
    );

    update public.research_blueprints
       set state = 'samuel_review'
     where id = '30000000-0000-0000-0000-000000000002';
    select id from public.publish_research_blueprint(
      '30000000-0000-0000-0000-000000000002',
      '2026-06-24T12:00:00Z',
      'reviewer@example.invalid',
      'new A draft'
    );
  `));
  expectScalar(
    "published plan history remains immutable through A-B-A",
    `select count(*)::text from public.research_xenios30_plans
      where source_blueprint_id = '30000000-0000-0000-0000-000000000002'
        and month_label = '2026-06'
        and state = 'published'
        and reviewed_by = 'Samuel'
        and member_acknowledged_at = '2026-06-22T12:00:00Z';`,
    "1",
  );
  expectScalar(
    "published-plan A-B-A creates exactly one new active draft revision",
    `select count(*)::text from public.research_xenios30_plans
      where member_id = '20000000-0000-0000-0000-000000000001'
        and month_label = '2026-06'
        and state in ('draft', 'samuel_review');`,
    "1",
  );

  requireOk("service role may append audit evidence", psql(`
    set role service_role;
    insert into public.research_plan_review_audit_events (
      event_key, blueprint_id, member_id, actor_email, action
    ) values (
      'dryrun:view:1',
      '30000000-0000-0000-0000-000000000002',
      '20000000-0000-0000-0000-000000000001',
      'reviewer@example.invalid',
      'plan_brief_viewed'
    );
    reset role;
  `));
  expectRejected(
    "service role cannot mutate audit evidence",
    `set role service_role;
     update public.research_plan_review_audit_events
        set action = 'revise_attempted'
      where event_key = 'dryrun:view:1';`,
    /permission denied|append-only/i,
  );
  expectRejected(
    "service role cannot truncate audit evidence",
    `set role service_role; truncate public.research_plan_review_audit_events;`,
    /permission denied/i,
  );

  expectRejected(
    "partial unique index rejects a second current published blueprint",
    `insert into public.research_blueprints (
       member_id, version, state, content
     ) values (
       '20000000-0000-0000-0000-000000000001',
       4, 'published', '{"recommendations":[]}'::jsonb
     );`,
    /research_blueprints_one_published_per_member_idx/i,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  cleanup();
  const failed = results.filter((result) => !result.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exitCode = 1;
}
