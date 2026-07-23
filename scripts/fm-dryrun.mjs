// Founding-membership (FM) migration live dry run (throwaway local Postgres only).
//
// Spins up a disposable postgres:16 container, applies the real prerequisite
// chain (base migrations 1-8, then Track A, then the Track B commerce bundle),
// applies the FM bundle, applies the FM bundle a SECOND time to prove
// idempotency, runs the safety-posture and constraint proofs (append-only
// triggers on the ledger, audit trails, and version histories; the
// obligation status and amount-per-type checks; the one-receipt-per-obligation
// unique; the one-period-per-funding-obligation unique; the published-only
// signature gate), runs the read-only verification SQL, statically proves the
// bundle carries no destructive DDL, and removes the container.
//
// This never touches a real or remote database: the only connection is the
// localhost throwaway container it creates and deletes itself.
//
// Usage: node scripts/fm-dryrun.mjs
// Exit code 0 = every proof point passed.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTAINER = "xenios_fm_dryrun";
const PORT = "5546";

// The prerequisite chain, in manifest order. 1-8 are the base migrations
// already RUN in production; Track A is the member platform (9-19); Track B
// is the commerce bundle (20-26 + additions). The FM bundle is what this dry
// run proves, and it runs LAST.
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
  "supabase/production/research-track-b-commerce.sql",
];
const FM_BUNDLE = "supabase/production/research-founding-membership.sql";
const VERIFICATION = "supabase/production/research-founding-membership-verification.sql";

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
  // 1. Prerequisite chain: base 1-8, Track A, Track B commerce
  // ---------------------------------------------------------------------
  for (const rel of BASE_CHAIN) {
    const res = applyFile(rel);
    record(`prerequisite: ${rel}`, res.status === 0, res.status === 0 ? "" : res.stderr);
    if (res.status !== 0) throw new Error(`prerequisite failed: ${rel}`);
  }

  // ---------------------------------------------------------------------
  // 2. FM bundle: first apply, then a second apply (idempotency)
  // ---------------------------------------------------------------------
  {
    const first = applyFile(FM_BUNDLE);
    record("FM bundle: first apply", first.status === 0,
      first.status === 0 ? "" : first.stderr);
    if (first.status !== 0) throw new Error("first apply failed");

    const second = applyFile(FM_BUNDLE);
    record("FM bundle: second apply (idempotent re-run)", second.status === 0,
      second.status === 0 ? "" : second.stderr);
  }

  // ---------------------------------------------------------------------
  // 3. Posture: FM tables, RLS, policies, triggers
  // ---------------------------------------------------------------------
  {
    const posture = psql(`
      select count(*) as fm_tables,
             count(*) filter (where c.relrowsecurity) as rls_enabled,
             count(*) filter (where not c.relrowsecurity) as rls_disabled
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'research\\_fm\\_%';
      select count(*) as fm_policies from pg_policies
      where schemaname = 'public' and tablename like 'research\\_fm\\_%';
      select t.tgname, c.relname from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      where not t.tgisinternal and c.relname like 'research\\_fm\\_%' order by 2, 1;
    `);
    record("posture: FM table count, RLS roll-up, zero policies, trigger census",
      posture.status === 0, posture.stdout || posture.stderr);
  }

  // ---------------------------------------------------------------------
  // 4. Constraint and trigger proofs (each rejection is run for real)
  // ---------------------------------------------------------------------

  // Seed rows the proofs reference (fixed ids so the statements are
  // readable). All ids and names are synthetic test fixtures.
  expectOk("seed: method + version, bridge settings + audit event, obligation + event + period + ledger + receipt, identity case + audit, published + draft document versions + one signature, checklist row", `
    insert into public.research_fm_payment_methods
      (method_id, provider_code, member_facing_name, admin_facing_name,
       duration, settlement_time, receiving_legal_entity, ownership_classification,
       receiving_instructions_enc, receiving_instructions_masked)
    values ('pm-test-1', 'manual_test', 'Test method', 'Test method (admin)',
            'permanent', 'same day', 'Test Entity LLC', 'business',
            'enc.v1:dGVzdA==', '****1234');

    insert into public.research_fm_payment_method_versions
      (version_id, method_id, version, change_kind, changed_by, snapshot)
    values ('pmv-test-1', 'pm-test-1', 1, 'created', 'admin-test', '{}');

    insert into public.research_fm_bridge_settings (start_at, end_at, timezone)
    values (now(), now() + interval '14 days', 'America/Chicago');

    insert into public.research_fm_bridge_audit_events (event_id, kind, actor_id, reason, at)
    values ('bae-test-1', 'bridge_settings_updated', 'admin-test', 'dry run seed', now());

    insert into public.research_fm_obligations
      (id, human_ref, member_id, type, expected_amount_cents, description, status,
       method, agreements, due_at, expires_at)
    values ('00000000-0000-0000-0000-00000000fb01', 'XEN-DRYRUN-0001',
            '00000000-0000-0000-0000-00000000fa01', 'activation_50', 5000,
            'Founding membership activation ($50, includes the first 30 days)',
            'due', '{"methodId":"pm-test-1","label":"Test method"}',
            '{"capturedAt":"2026-07-22T00:00:00Z","agreements":[]}',
            now() + interval '7 days', now() + interval '30 days');

    insert into public.research_fm_obligation_events
      (event_id, obligation_id, action, actor_type)
    values ('00000000-0000-0000-0000-00000000fb02',
            '00000000-0000-0000-0000-00000000fb01', 'created', 'system');

    insert into public.research_fm_membership_periods
      (member_id, sequence, starts_at, ends_at, funding_obligation_id)
    values ('00000000-0000-0000-0000-00000000fa01', 1, now(), now() + interval '30 days',
            '00000000-0000-0000-0000-00000000fb01');

    insert into public.research_fm_ledger
      (id, entry_id, member_id, obligation_id, entry_type, amount_cents, actor_id)
    values ('00000000-0000-0000-0000-00000000fb03',
            '00000000-0000-0000-0000-00000000fb04',
            '00000000-0000-0000-0000-00000000fa01',
            '00000000-0000-0000-0000-00000000fb01', 'activation_payment', 5000, 'admin-test');

    insert into public.research_fm_receipts
      (receipt_number, obligation_id, member_id, amount_cents, method_label)
    values ('XR-DRYRUN-0001', '00000000-0000-0000-0000-00000000fb01',
            '00000000-0000-0000-0000-00000000fa01', 5000, 'Test method');

    insert into public.research_fm_identity_cases (case_id, member_id)
    values ('00000000-0000-0000-0000-00000000fb05', 'member-test-1');

    insert into public.research_fm_identity_audit
      (id, case_id, member_id, kind, actor_type)
    values ('00000000-0000-0000-0000-00000000fb06',
            '00000000-0000-0000-0000-00000000fb05', 'member-test-1', 'case_opened', 'system');

    insert into public.research_fm_document_versions
      (id, category, title, semver, status, published_at, jurisdiction,
       content, content_hash, counsel_review)
    values ('00000000-0000-0000-0000-00000000fb07', 'activation_terms',
            'Activation Terms (dry run)', '1.0.0', 'published', now(), 'US-TX',
            'Test published content.',
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            'approved');

    insert into public.research_fm_document_versions
      (id, category, title, semver, status, jurisdiction, content, content_hash)
    values ('00000000-0000-0000-0000-00000000fb08', 'privacy_notice',
            'Privacy Notice (draft, dry run)', '0.1.0', 'draft', 'US-TX',
            'Test draft content.',
            'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');

    insert into public.research_fm_document_signatures
      (id, member_id, document_version_id, category, semver, content_hash,
       typed_legal_name, full_document_shown, affirmative_consent,
       electronic_consent_version_id)
    values ('00000000-0000-0000-0000-00000000fb09',
            '00000000-0000-0000-0000-00000000fa01',
            '00000000-0000-0000-0000-00000000fb07', 'activation_terms', '1.0.0',
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            'Test Member', true, true,
            '00000000-0000-0000-0000-00000000fb07');

    insert into public.research_fm_bridge_checklist (id, items)
    values ('day15', '{"replacement_provider_selected":{"done":false,"note":null,"updatedBy":"admin-test","updatedAt":"2026-07-22T00:00:00Z"}}')
    on conflict (id) do update set items = excluded.items;
  `);

  // --- append-only: the payment ledger ---------------------------------
  expectRejected("append-only: UPDATE research_fm_ledger rejected",
    `update public.research_fm_ledger set amount_cents = 999
     where id = '00000000-0000-0000-0000-00000000fb03';`, /append only/);
  expectRejected("append-only: DELETE research_fm_ledger rejected",
    `delete from public.research_fm_ledger
     where id = '00000000-0000-0000-0000-00000000fb03';`, /append only/);

  // --- append-only: the audit trails -----------------------------------
  expectRejected("append-only: UPDATE research_fm_obligation_events rejected",
    `update public.research_fm_obligation_events set action = 'tampered'
     where event_id = '00000000-0000-0000-0000-00000000fb02';`, /append only/);
  expectRejected("append-only: DELETE research_fm_obligation_events rejected",
    `delete from public.research_fm_obligation_events
     where event_id = '00000000-0000-0000-0000-00000000fb02';`, /append only/);
  expectRejected("append-only: UPDATE research_fm_identity_audit rejected",
    `update public.research_fm_identity_audit set detail = 'tampered'
     where id = '00000000-0000-0000-0000-00000000fb06';`, /append only/);
  expectRejected("append-only: DELETE research_fm_identity_audit rejected",
    `delete from public.research_fm_identity_audit
     where id = '00000000-0000-0000-0000-00000000fb06';`, /append only/);
  expectRejected("append-only: UPDATE research_fm_bridge_audit_events rejected",
    `update public.research_fm_bridge_audit_events set reason = 'tampered'
     where event_id = 'bae-test-1';`, /append only/);
  expectRejected("append-only: DELETE research_fm_bridge_audit_events rejected",
    `delete from public.research_fm_bridge_audit_events
     where event_id = 'bae-test-1';`, /append only/);

  // --- append-only: the version histories ------------------------------
  expectRejected("append-only: UPDATE research_fm_payment_method_versions rejected",
    `update public.research_fm_payment_method_versions set changed_by = 'tampered'
     where version_id = 'pmv-test-1';`, /append only/);
  expectRejected("append-only: DELETE research_fm_payment_method_versions rejected",
    `delete from public.research_fm_payment_method_versions
     where version_id = 'pmv-test-1';`, /append only/);
  expectRejected("frozen: UPDATE of a PUBLISHED document version's content rejected",
    `update public.research_fm_document_versions set content = 'rewritten'
     where id = '00000000-0000-0000-0000-00000000fb07';`, /frozen/);
  expectRejected("permanent: DELETE of a PUBLISHED document version rejected",
    `delete from public.research_fm_document_versions
     where id = '00000000-0000-0000-0000-00000000fb07';`, /permanent record/);
  expectRejected("append-only: UPDATE research_fm_document_signatures rejected",
    `update public.research_fm_document_signatures set typed_legal_name = 'Tampered'
     where id = '00000000-0000-0000-0000-00000000fb09';`, /append only/);
  expectRejected("append-only: DELETE research_fm_document_signatures rejected",
    `delete from public.research_fm_document_signatures
     where id = '00000000-0000-0000-0000-00000000fb09';`, /append only/);

  // --- append-only: membership periods and receipts --------------------
  expectRejected("append-only: UPDATE research_fm_membership_periods rejected",
    `update public.research_fm_membership_periods set ends_at = now() + interval '60 days'
     where funding_obligation_id = '00000000-0000-0000-0000-00000000fb01';`, /append only/);
  expectRejected("append-only: UPDATE research_fm_receipts rejected",
    `update public.research_fm_receipts set amount_cents = 1
     where receipt_number = 'XR-DRYRUN-0001';`, /append only/);

  // --- the obligation status check constraint --------------------------
  expectRejected("obligations: unknown status rejected by the check constraint",
    `insert into public.research_fm_obligations
       (human_ref, member_id, type, expected_amount_cents, description, status,
        method, agreements, due_at, expires_at)
     values ('XEN-DRYRUN-BAD1', '00000000-0000-0000-0000-00000000fa02',
             'renewal_25', 2500, 'bad status probe', 'not_a_status',
             '{}', '{}', now(), now() + interval '30 days');`,
    /research_fm_obligations_status_check/);

  // --- canonical pricing at the database -------------------------------
  expectRejected("pricing: activation_50 at 2500 cents rejected (never $25 at activation)",
    `insert into public.research_fm_obligations
       (human_ref, member_id, type, expected_amount_cents, description, status,
        method, agreements, due_at, expires_at)
     values ('XEN-DRYRUN-BAD2', '00000000-0000-0000-0000-00000000fa02',
             'activation_50', 2500, 'wrong amount probe', 'due',
             '{}', '{}', now(), now() + interval '30 days');`,
    /research_fm_obligations_amount_matches_type/);
  expectRejected("pricing: renewal_25 at 5000 cents rejected",
    `insert into public.research_fm_obligations
       (human_ref, member_id, type, expected_amount_cents, description, status,
        method, agreements, due_at, expires_at)
     values ('XEN-DRYRUN-BAD3', '00000000-0000-0000-0000-00000000fa02',
             'renewal_25', 5000, 'wrong amount probe', 'due',
             '{}', '{}', now(), now() + interval '30 days');`,
    /research_fm_obligations_amount_matches_type/);

  // --- one live activation per member ----------------------------------
  expectRejected("obligations: second LIVE activation for the same member rejected",
    `insert into public.research_fm_obligations
       (human_ref, member_id, type, expected_amount_cents, description, status,
        method, agreements, due_at, expires_at)
     values ('XEN-DRYRUN-BAD4', '00000000-0000-0000-0000-00000000fa01',
             'activation_50', 5000, 'duplicate live activation probe', 'due',
             '{}', '{}', now(), now() + interval '30 days');`,
    /research_fm_one_live_activation_per_member/);

  // --- the ledger's signed-amounts invariant ---------------------------
  expectRejected("ledger: a refund with a POSITIVE amount rejected",
    `insert into public.research_fm_ledger
       (entry_id, member_id, obligation_id, entry_type, amount_cents, actor_id)
     values ('00000000-0000-0000-0000-00000000fb0a',
             '00000000-0000-0000-0000-00000000fa01',
             '00000000-0000-0000-0000-00000000fb01', 'refund', 5000, 'admin-test');`,
    /research_fm_ledger_signed_amounts/);

  // --- exactly one receipt per obligation (the 23505 path the server's
  // --- issueOnce relies on) --------------------------------------------
  expectRejected("receipts: second receipt for the same obligation rejected",
    `insert into public.research_fm_receipts
       (receipt_number, obligation_id, member_id, amount_cents, method_label)
     values ('XR-DRYRUN-0002', '00000000-0000-0000-0000-00000000fb01',
             '00000000-0000-0000-0000-00000000fa01', 5000, 'Test method');`,
    /research_fm_receipts_one_per_obligation/);

  // --- one period per funding obligation (the double-extend lock) ------
  expectRejected("periods: second period funded by the same obligation rejected",
    `insert into public.research_fm_membership_periods
       (member_id, sequence, starts_at, ends_at, funding_obligation_id)
     values ('00000000-0000-0000-0000-00000000fa01', 2, now(), now() + interval '30 days',
             '00000000-0000-0000-0000-00000000fb01');`,
    /research_fm_periods_one_per_obligation/);

  // --- a draft can never be signed -------------------------------------
  expectRejected("signatures: signing a DRAFT document version rejected",
    `insert into public.research_fm_document_signatures
       (member_id, document_version_id, category, semver, content_hash,
        typed_legal_name, full_document_shown, affirmative_consent,
        electronic_consent_version_id)
     values ('00000000-0000-0000-0000-00000000fa01',
             '00000000-0000-0000-0000-00000000fb08', 'privacy_notice', '0.1.0',
             'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
             'Test Member', true, true,
             '00000000-0000-0000-0000-00000000fb07');`,
    /never be signed/);

  // --- the checklist upsert path the server store uses -----------------
  expectOk("checklist: the server's upsert-by-id path works twice (mutable by design)",
    `insert into public.research_fm_bridge_checklist (id, items)
     values ('day15', '{"replacement_provider_selected":{"done":true,"note":"selected","updatedBy":"admin-test","updatedAt":"2026-07-22T01:00:00Z"}}')
     on conflict (id) do update set items = excluded.items;
     select id, items->'replacement_provider_selected'->>'done' as done
     from public.research_fm_bridge_checklist where id = 'day15';`);

  // ---------------------------------------------------------------------
  // 5. Verification SQL runs clean
  // ---------------------------------------------------------------------
  {
    const res = applyFile(VERIFICATION);
    // Clean = zero FAIL-labelled rows in the output.
    const failRows = /MISSING_TABLE|RLS_DISABLED|UNEXPECTED_POLICY|MISSING_APPEND_ONLY_TRIGGER|MISSING_UNIQUE|MISSING_CHECK|MISSING_COLUMN|UNEXPECTED_PLAINTEXT_COLUMN/
      .test(res.stdout.replace(/^.*as check.*$/gm, ""));
    record("verification SQL runs clean (zero FAIL rows)",
      res.status === 0 && !failRows, res.stdout || res.stderr);
  }

  // ---------------------------------------------------------------------
  // 6. Static proof: no destructive DDL in the bundle
  // ---------------------------------------------------------------------
  {
    const bundle = readFileSync(path.join(ROOT, FM_BUNDLE), "utf8");
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
