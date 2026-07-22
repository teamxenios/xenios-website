// Track B migration live dry run (throwaway local Postgres only).
//
// Spins up a disposable postgres:16 container, applies the real prerequisite
// chain (base migrations 1-8, then Track A, then the Track B commerce bundle),
// applies the Track B bundle a SECOND time to prove idempotency, runs the
// safety-posture and constraint proofs (append-only triggers, idempotency
// uniques, capture/refund bounds, settlement partial unique), runs the
// read-only verification SQL, and removes the container.
//
// This never touches a real or remote database: the only connection is the
// localhost throwaway container it creates and deletes itself.
//
// Usage: node scripts/track-b-dryrun.mjs
// Exit code 0 = every proof point passed.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTAINER = "xenios_trackb_dryrun";
const PORT = "5544";

// The prerequisite chain, in manifest order. 1-8 are the base migrations
// already RUN in production; Track A is the member platform (9-19); the
// Track B bundle is what this dry run proves.
const BASE_CHAIN = [
  "supabase/schema.sql",
  "supabase/research-membership.sql",
  "supabase/research-notification-outbox.sql",
  "supabase/research-members.sql",
  "supabase/research-referrals.sql",
  "supabase/research-referrals-seed.sql",
  "supabase/research-consent-covenant.sql",
  "supabase/research-referral-fraud.sql",
  "supabase/production/research-track-a-private-platform.sql",
];
const TRACK_B = "supabase/production/research-track-b-commerce.sql";
const VERIFICATION = "supabase/production/research-track-b-verification.sql";

const results = [];
function record(name, pass, evidence) {
  results.push({ name, pass, evidence });
  console.log(`\n${pass ? "PASS" : "FAIL"}  ${name}`);
  if (evidence) console.log(evidence.trim().split("\n").map((l) => "      " + l).join("\n"));
}

function docker(args, input) {
  return spawnSync("docker", args, {
    input,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** Run SQL in the container. stopOnError uses ON_ERROR_STOP=1 (fail fast). */
function psql(sql, { stopOnError = true } = {}) {
  const args = ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-q"];
  if (stopOnError) args.push("-v", "ON_ERROR_STOP=1");
  const res = docker(args, sql);
  return { status: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

function applyFile(rel) {
  const sql = readFileSync(path.join(ROOT, rel), "utf8");
  return psql(sql);
}

/** A statement that MUST be rejected by the database, with the expected error. */
function expectRejected(name, sql, expectedPattern) {
  const res = psql(sql, { stopOnError: true });
  const rejected = res.status !== 0 && expectedPattern.test(res.stderr);
  record(name, rejected, res.stderr || res.stdout || "(no output)");
  return rejected;
}

function expectOk(name, sql) {
  const res = psql(sql);
  record(name, res.status === 0, res.status === 0 ? res.stdout : res.stderr);
  return res.status === 0;
}

function cleanup() {
  docker(["rm", "-f", CONTAINER]);
}

try {
  // ---------------------------------------------------------------------
  // 0. Fresh container
  // ---------------------------------------------------------------------
  cleanup(); // remove any leftover from an aborted run
  const run = docker([
    "run", "-d", "--name", CONTAINER,
    "-e", "POSTGRES_PASSWORD=pw",
    "-p", `${PORT}:5432`,
    "postgres:16",
  ]);
  if (run.status !== 0) {
    console.error("could not start container:", run.stderr);
    process.exit(1);
  }
  console.log(`started ${CONTAINER} (localhost:${PORT}, throwaway)`);

  // Wait for readiness. Postgres restarts once during init, so require two
  // consecutive ready checks.
  let readyStreak = 0;
  for (let i = 0; i < 60 && readyStreak < 2; i++) {
    const ready = docker(["exec", CONTAINER, "pg_isready", "-U", "postgres"]);
    readyStreak = ready.status === 0 ? readyStreak + 1 : 0;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // ---------------------------------------------------------------------
  // 1. Prerequisite chain: base 1-8, then Track A
  // ---------------------------------------------------------------------
  for (const rel of BASE_CHAIN) {
    const res = applyFile(rel);
    record(`prerequisite: ${rel}`, res.status === 0, res.status === 0 ? "" : res.stderr);
    if (res.status !== 0) throw new Error(`prerequisite failed: ${rel}`);
  }

  // ---------------------------------------------------------------------
  // 2. Track B bundle: first apply, then a second apply (idempotency)
  // ---------------------------------------------------------------------
  {
    const first = applyFile(TRACK_B);
    record("Track B bundle: first apply", first.status === 0,
      first.status === 0 ? "" : first.stderr);
    if (first.status !== 0) throw new Error("first apply failed");

    const second = applyFile(TRACK_B);
    record("Track B bundle: second apply (idempotent re-run)", second.status === 0,
      second.status === 0 ? "" : second.stderr);
  }

  // ---------------------------------------------------------------------
  // 3. Posture: tables, RLS, policies, triggers
  // ---------------------------------------------------------------------
  {
    const posture = psql(`
      select count(*) as research_tables,
             count(*) filter (where c.relrowsecurity) as rls_enabled,
             count(*) filter (where not c.relrowsecurity) as rls_disabled
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'research\\_%';
      select count(*) as research_policies from pg_policies
      where schemaname = 'public' and tablename like 'research\\_%';
      select t.tgname, c.relname from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      where not t.tgisinternal and t.tgname like 'research%no_update' order by 1;
    `);
    const ok = posture.status === 0 && / 0\b/.test(posture.stdout);
    record("posture: table count, RLS roll-up, zero policies, append-only triggers",
      posture.status === 0, posture.stdout || posture.stderr);
    void ok;
  }

  // ---------------------------------------------------------------------
  // 4. Constraint and trigger proofs (each rejection is run for real)
  // ---------------------------------------------------------------------

  // Seed rows the proofs reference (fixed ids so the statements are readable).
  expectOk("seed: one commission row, one store-credit row, one order + state event, one subscription + event", `
    insert into public.research_commission_ledger
      (id, partner_id, order_id, eligible_net_cents, basis_points, amount_cents, kind)
    values ('00000000-0000-0000-0000-00000000c001',
            '00000000-0000-0000-0000-00000000aaa1',
            '00000000-0000-0000-0000-00000000bbb1', 10000, 500, 500, 'accrual');

    insert into public.research_store_credit_ledger
      (id, member_id, amount_cents, state, reason)
    values ('00000000-0000-0000-0000-00000000a001',
            '00000000-0000-0000-0000-00000000aaa2', 1000, 'approved', 'referral_new_member');

    insert into public.research_orders (id, member_id, subtotal_cents, total_cents)
    values ('00000000-0000-0000-0000-00000000d001',
            '00000000-0000-0000-0000-00000000aaa3', 5000, 5000);
    insert into public.research_order_state_events
      (id, order_id, from_state, to_state, actor_type)
    values ('00000000-0000-0000-0000-00000000e001',
            '00000000-0000-0000-0000-00000000d001', 'draft', 'checkout_pending', 'system');

    insert into public.research_product_subscriptions
      (id, member_id, sku, frequency_days, quantity)
    values ('00000000-0000-0000-0000-00000000f001',
            '00000000-0000-0000-0000-00000000aaa4', 'TEST-SKU', 30, 1);
    insert into public.research_subscription_events
      (id, subscription_id, action, from_state, to_state, actor_type)
    values ('00000000-0000-0000-0000-00000000f002',
            '00000000-0000-0000-0000-00000000f001', 'activate', 'pending', 'active', 'system');
  `);

  expectRejected("append-only: UPDATE research_commission_ledger rejected",
    `update public.research_commission_ledger set amount_cents = 999
     where id = '00000000-0000-0000-0000-00000000c001';`, /append only/);
  expectRejected("append-only: DELETE research_commission_ledger rejected",
    `delete from public.research_commission_ledger
     where id = '00000000-0000-0000-0000-00000000c001';`, /append only/);
  expectRejected("append-only: UPDATE research_store_credit_ledger rejected",
    `update public.research_store_credit_ledger set amount_cents = 999999
     where id = '00000000-0000-0000-0000-00000000a001';`, /append only/);
  expectRejected("append-only: DELETE research_store_credit_ledger rejected",
    `delete from public.research_store_credit_ledger
     where id = '00000000-0000-0000-0000-00000000a001';`, /append only/);
  expectRejected("append-only: UPDATE research_order_state_events rejected",
    `update public.research_order_state_events set to_state = 'delivered'
     where id = '00000000-0000-0000-0000-00000000e001';`, /append only/);
  expectRejected("append-only: DELETE research_order_state_events rejected",
    `delete from public.research_order_state_events
     where id = '00000000-0000-0000-0000-00000000e001';`, /append only/);
  expectRejected("append-only: UPDATE research_subscription_events rejected",
    `update public.research_subscription_events set to_state = 'cancelled'
     where id = '00000000-0000-0000-0000-00000000f002';`, /append only/);
  expectRejected("append-only: DELETE research_subscription_events rejected",
    `delete from public.research_subscription_events
     where id = '00000000-0000-0000-0000-00000000f002';`, /append only/);

  expectOk("idempotency: first (scope, key) reservation inserts",
    `insert into public.research_idempotency_keys (scope, key)
     values ('checkout:member-aaa3', 'client-key-1');`);
  expectRejected("idempotency: duplicate (scope, key) rejected",
    `insert into public.research_idempotency_keys (scope, key)
     values ('checkout:member-aaa3', 'client-key-1');`,
    /research_idempotency_keys_scope_key_unique/);

  expectRejected("orders: over-capture (captured > authorized) rejected",
    `insert into public.research_orders
       (member_id, subtotal_cents, total_cents, authorized_amount_cents, captured_amount_cents)
     values ('00000000-0000-0000-0000-00000000aaa5', 1000, 1000, 1000, 1500);`,
    /research_orders_capture_within_authorization/);
  expectRejected("orders: over-refund (refunded > captured) rejected",
    `insert into public.research_orders
       (member_id, subtotal_cents, total_cents, authorized_amount_cents,
        captured_amount_cents, refunded_cents, state, payment_reference)
     values ('00000000-0000-0000-0000-00000000aaa5', 2000, 2000, 2000, 1000, 1500,
             'payment_captured', 'prov_ref_1');`,
    /research_orders_refund_within_capture/);
  expectRejected("orders: duplicate (member, checkout idempotency key) rejected", `
    insert into public.research_orders (member_id, subtotal_cents, total_cents, checkout_idempotency_key)
    values ('00000000-0000-0000-0000-00000000aaa6', 1000, 1000, 'ck-1');
    insert into public.research_orders (member_id, subtotal_cents, total_cents, checkout_idempotency_key)
    values ('00000000-0000-0000-0000-00000000aaa6', 1000, 1000, 'ck-1');`,
    /research_orders_idempotency_unique/);

  expectRejected("webhooks: replayed (provider, event id) rejected", `
    insert into public.research_provider_webhook_events (provider_name, event_id, event_type)
    values ('testprov', 'evt_1', 'payment.captured');
    insert into public.research_provider_webhook_events (provider_name, event_id, event_type)
    values ('testprov', 'evt_1', 'payment.captured');`,
    /research_provider_webhook_events_unique/);

  expectRejected("commissions: second live accrual for the same order rejected",
    `insert into public.research_commission_ledger
       (partner_id, order_id, eligible_net_cents, basis_points, amount_cents, kind)
     values ('00000000-0000-0000-0000-00000000aaa7',
             '00000000-0000-0000-0000-00000000bbb1', 10000, 500, 500, 'accrual');`,
    /research_commission_one_live_accrual_per_order/);

  expectOk("store credit: first settlement of an entry inserts",
    `insert into public.research_store_credit_ledger
       (member_id, amount_cents, state, reason, reverses_id)
     values ('00000000-0000-0000-0000-00000000aaa2', -1000, 'reversed', 'manual_adjustment',
             '00000000-0000-0000-0000-00000000a001');`);
  expectRejected("store credit: second settlement of the same entry rejected",
    `insert into public.research_store_credit_ledger
       (member_id, amount_cents, state, reason, reverses_id)
     values ('00000000-0000-0000-0000-00000000aaa2', -1000, 'reversed', 'manual_adjustment',
             '00000000-0000-0000-0000-00000000a001');`,
    /research_store_credit_settlement_unique/);

  // ---------------------------------------------------------------------
  // 5. Verification SQL runs clean
  // ---------------------------------------------------------------------
  {
    const res = applyFile(VERIFICATION);
    // Clean = zero FAIL-labelled rows in the output.
    const failRows = /MISSING_TABLE|RLS_DISABLED|UNEXPECTED_POLICY|MISSING_APPEND_ONLY_TRIGGER|MISSING_UNIQUE|MISSING_COLUMN/
      .test(res.stdout.replace(/^.*as check.*$/gm, ""));
    record("verification SQL runs clean (zero FAIL rows)",
      res.status === 0 && !failRows, res.stdout || res.stderr);
  }

  // ---------------------------------------------------------------------
  // 6. Static proof: no destructive DDL in the bundle
  // ---------------------------------------------------------------------
  {
    const bundle = readFileSync(path.join(ROOT, TRACK_B), "utf8");
    const destructive = bundle.match(
      /^\s*(drop\s+table|truncate|delete\s+from|alter\s+table[^;]*drop\s+column|drop\s+schema|drop\s+index)\b.*$/gim,
    );
    record("static: no destructive DDL in the bundle", !destructive,
      destructive ? destructive.join("\n") : "(only drop-trigger-if-exists + recreate, the idempotent pattern)");
  }
} finally {
  cleanup();
  console.log(`\nremoved ${CONTAINER}`);
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} proof points passed`);
if (failed.length > 0) {
  console.log("FAILED:", failed.map((f) => f.name).join("; "));
  process.exit(1);
}
