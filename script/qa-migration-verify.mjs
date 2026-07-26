import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = process.env.QA_REPO_ROOT
  ? path.resolve(process.env.QA_REPO_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const supabase = path.join(root, "supabase");
const staticOnly = process.argv.includes("--static");
const container = `xenios-qa-${process.pid}`;

const ordered = [
  "schema.sql",
  "research-membership.sql",
  "research-notification-outbox.sql",
  "research-members.sql",
  "research-referrals.sql",
  "research-referrals-seed.sql",
  "research-consent-covenant.sql",
  "research-referral-fraud.sql",
  "research-member-billing.sql",
  "research-agreements.sql",
  "research-member-profile.sql",
  "research-assessment.sql",
  "research-blueprint.sql",
  "research-plans.sql",
  "research-documents.sql",
  "research-tracker.sql",
  "research-media.sql",
  "research-questions.sql",
  "research-sla-events.sql",
  "research-catalog.sql",
  "research-inventory-lots.sql",
  "research-orders.sql",
  "research-subscriptions.sql",
  "research-fulfillment.sql",
  "research-partners.sql",
  "research-commission-ledger.sql",
  "production/research-founding-membership.sql",
  "research-fm-esign-native.sql",
  "research-fm-esign-native-attempt-lease.sql",
  "research-fm-esign-native-hardening.sql",
  "research-idempotency-keys.sql",
  "research-fm-activation-verify-atomic.sql",
  "research-product-requests.sql",
  "research-product-requests-hardening.sql",
  "research-product-requests-function-hardening.sql",
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", ...options });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function staticVerification() {
  const missing = ordered.filter((file) => !fs.existsSync(path.join(supabase, file)));
  if (missing.length) throw new Error(`Missing ordered migrations: ${missing.join(", ")}`);

  const fullBundle = fs.readFileSync(path.join(supabase, "production", "research-full-production.sql"), "utf8");
  const bundled = ordered.slice(8, 26);
  const absentFromBundle = bundled.filter((file) => {
    const source = fs.readFileSync(path.join(supabase, file), "utf8").trim().replace(/\r\n/g, "\n");
    return !fullBundle.replace(/\r\n/g, "\n").includes(source);
  });
  if (absentFromBundle.length) {
    throw new Error(`Production bundle drift: ${absentFromBundle.join(", ")}`);
  }

  const tableFiles = ordered.filter((file) => /research-/.test(file));
  const missingRls = [];
  for (const file of tableFiles) {
    const sql = fs.readFileSync(path.join(supabase, file), "utf8");
    if (/create table/i.test(sql) && !/enable row level security/i.test(sql)) missingRls.push(file);
  }
  if (missingRls.length) throw new Error(`Table migrations without RLS enablement: ${missingRls.join(", ")}`);
  console.log(`Static migration verification passed (${ordered.length} ordered files; production bundle fidelity checked).`);
}

async function disposablePostgresVerification() {
  run("docker", [
    "run", "--rm", "-d", "--name", container,
    "-e", "POSTGRES_PASSWORD=website6qa",
    "-e", "POSTGRES_DB=xenios_qa",
    "postgres:16-alpine",
  ]);
  try {
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const result = spawnSync("docker", ["exec", container, "pg_isready", "-U", "postgres", "-d", "xenios_qa"], {
        encoding: "utf8",
      });
      if (result.status === 0) {
        ready = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!ready) throw new Error("Disposable PostgreSQL did not become ready.");

    const prelude = `
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema storage;
      create table storage.buckets (
        id text primary key,
        name text not null,
        public boolean not null default false,
        file_size_limit bigint,
        allowed_mime_types text[]
      );
      create extension if not exists pgcrypto;
    `;
    run("docker", ["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "xenios_qa"], {
      input: prelude,
    });

    for (const file of ordered) {
      const sql = fs.readFileSync(path.join(supabase, file), "utf8");
      try {
        run("docker", ["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "xenios_qa"], {
          input: sql,
          maxBuffer: 20 * 1024 * 1024,
        });
      } catch (error) {
        throw new Error(`Migration failed: ${file}\n${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const verification = `
      do $$
      declare problem text;
      begin
        select string_agg(c.relname, ', ') into problem
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
          and c.relname like 'research\\_%' and not c.relrowsecurity;
        if problem is not null then raise exception 'RLS disabled: %', problem; end if;

        select string_agg(tablename || ':' || policyname, ', ') into problem
        from pg_policies where schemaname = 'public' and tablename like 'research\\_%';
        if problem is not null then raise exception 'Unexpected policies: %', problem; end if;

        select string_agg(table_name, ', ') into problem
        from information_schema.role_table_grants
        where table_schema = 'public' and table_name like 'research\\_%'
          and grantee in ('anon', 'authenticated');
        if problem is not null then raise exception 'Browser role table grants: %', problem; end if;
      end $$;

      select count(*) as research_tables,
             count(*) filter (where c.relrowsecurity) as rls_enabled
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'research\\_%';
    `;
    const output = run("docker", ["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "xenios_qa"], {
      input: verification,
    });
    console.log("Disposable PostgreSQL migration/RLS/grant verification passed.");
    console.log(output.trim());
  } finally {
    spawnSync("docker", ["rm", "-f", container], { encoding: "utf8" });
  }
}

staticVerification();
if (!staticOnly) await disposablePostgresVerification();
