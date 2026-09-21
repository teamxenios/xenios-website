/**
 * Disposable, local-only PGlite rehearsal for the commission schedule candidate.
 * No connection string, filesystem data directory, Supabase client, or network
 * adapter is accepted.
 *
 * Usage:
 *   node server/research/partners/commission-schedules/sql-rehearsal.mjs <absolute local @electric-sql/pglite package directory>
 */
import assert from "node:assert/strict";
import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const runtimeDirectory = process.argv[2];
assert(runtimeDirectory && isAbsolute(runtimeDirectory), "absolute local PGlite directory required");
assert(!/^[\\/]{2}/.test(runtimeDirectory), "network runtime paths are refused");
const runtimeRoot = await realpath(runtimeDirectory);
const metadata = JSON.parse(await readFile(resolve(runtimeRoot, "package.json"), "utf8"));
assert.equal(metadata.name, "@electric-sql/pglite");
assert.equal(metadata.version, "0.5.8");
const insideRuntime = async (file) => {
  const path = await realpath(resolve(runtimeRoot, file));
  const rel = relative(runtimeRoot, path);
  assert(rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
  return path;
};
const [{ PGlite }, { pgcrypto }] = await Promise.all([
  import(pathToFileURL(await insideRuntime("dist/index.js")).href),
  import(pathToFileURL(await insideRuntime("dist/contrib/pgcrypto.js")).href),
]);

const root = process.cwd();
const candidatePath = "supabase/candidates/20260921_research_program_commission_schedules.sql";
const precheckPath = "supabase/candidates/20260921_research_program_commission_schedules_precheck.sql";
const postcheckPath = "supabase/candidates/20260921_research_program_commission_schedules_postcheck.sql";
const [candidate, precheck, postcheck] = await Promise.all(
  [candidatePath, precheckPath, postcheckPath].map((path) => readFile(resolve(root, path), "utf8")),
);

const bootstrap = `
  create extension if not exists pgcrypto;
  create role anon; create role authenticated; create role service_role;
  create table public.research_partners (
    id uuid primary key default gen_random_uuid(),
    state text not null default 'active'
  );
  create table public.research_commission_ledger (
    id uuid primary key default gen_random_uuid(),
    partner_id uuid not null references public.research_partners(id),
    order_id uuid not null,
    state text not null default 'pending'
      check (state in ('pending','held','approved','payable','paid','reversed','disputed','forfeited')),
    eligible_net_cents bigint not null check (eligible_net_cents >= 0),
    basis_points integer not null check (basis_points between 0 and 10000),
    amount_cents bigint not null check (amount_cents >= 0),
    reverses_ledger_id uuid references public.research_commission_ledger(id),
    source_reference text,
    payout_batch_id uuid,
    payout_reference text,
    actor_type text not null default 'system' check (actor_type in ('admin','system')),
    actor_id text,
    created_at timestamptz not null default now(),
    check (state <> 'paid' or (payout_reference is not null and payout_batch_id is not null)),
    check (reverses_ledger_id is null or state = 'reversed')
  );
  create unique index research_commission_one_live_accrual_per_order
    on public.research_commission_ledger(order_id)
    where state in ('pending','held','approved','payable','paid');
  create or replace function public.research_ledger_is_append_only()
  returns trigger language plpgsql as $$ begin
    raise exception 'ledger is append only' using errcode = '55000';
  end; $$;
  create trigger research_commission_ledger_no_update before update or delete
    on public.research_commission_ledger for each row
    execute function public.research_ledger_is_append_only();
`;

function resultValue(results, column) {
  for (const result of results) {
    for (const row of result.rows ?? []) if (column in row) return row[column];
  }
  throw new Error(`result column missing: ${column}`);
}

async function freshDb() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(bootstrap);
  return db;
}

let checks = 0;
const checked = () => { checks += 1; };
const db = await freshDb();
try {
  assert.equal(resultValue(await db.exec(precheck), "commission_program_precheck").verdict, "APPLY_READY");
  checked();
  await db.exec(candidate);
  assert.equal(resultValue(await db.exec(postcheck), "commission_program_postcheck").verdict, "APPLIED_OK");
  checked();
  await db.exec(candidate);
  assert.equal(resultValue(await db.exec(postcheck), "commission_program_postcheck").verdict, "APPLIED_OK");
  checked();

  const seth = (await db.query(`
    select definition, schedule_hash from public.research_commission_program_schedules
    where program_id='seth_operating_advisor_2026_09_signed' and schedule_version=1
  `)).rows[0];
  const partner = "10000000-0000-4000-8000-000000000001";
  const binding = "20000000-0000-4000-8000-000000000001";
  const orderUuid = "30000000-0000-4000-8000-000000000001";
  const accrualId = "40000000-0000-4000-8000-000000000001";
  const reversalId = "50000000-0000-4000-8000-000000000001";
  const periodAccrualId = "60000000-0000-4000-8000-000000000001";
  const periodReversalId = "70000000-0000-4000-8000-000000000001";
  const snapshot = {
    definition: seth.definition,
    hashAlgorithm: "sha256",
    scheduleHash: seth.schedule_hash,
  };
  const attribution = {
    acceptedRelationshipReference: "accepted-customer:1",
    firstEligibleTransactionAt: "2026-09-02T00:00:00.000Z",
    activeManagementConfirmed: true,
  };
  const money = (settlementRef, amountCents, settledAt) => ({
    settlementRef, externalTransactionRef: `external:${settlementRef}`,
    amountCents, currency: "USD", settledAt,
  });
  const revenue = { grossProductChannelRevenueCents: 100000, exclusions: [] };
  const calculation = {
    eligibleBasisCents: 100000, commissionCents: 25000,
    components: [{ basisCents: 100000, rateBasisPoints: 2500, commissionCents: 25000 }],
  };

  await db.query("insert into public.research_partners(id,state) values ($1,'active')", [partner]);
  await db.query(`insert into public.research_partner_commission_program_bindings(
    id,partner_id,program_id,schedule_version,schedule_hash,effective_at,authority_reference,recorded_by
  ) values ($1,$2,'seth_operating_advisor_2026_09_signed',1,$3,'2026-09-02Z','signed:seth:v1','rehearsal')`,
  [binding, partner, seth.schedule_hash]);
  await db.query(`insert into public.research_commission_ledger(
    id,partner_id,order_id,state,eligible_net_cents,basis_points,amount_cents,
    program_id,schedule_version,schedule_hash,schedule_snapshot,program_binding_id,
    canonical_order_reference,original_settlement_reference,settlement_reference,idempotency_key,
    event_kind,period_key,period_index,term_mode,eligible_basis_delta_cents,
    commission_delta_cents,price_authority_reference,attribution_snapshot,
    money_evidence_snapshot,revenue_snapshot,calculation_snapshot
  ) values ($1,$2,$3,'pending',100000,2500,25000,
    'seth_operating_advisor_2026_09_signed',1,$4,$5,$6,
    'order_pack04_0001','settlement:1','settlement:1','accrual:settlement:1',
    'accrual','binding-seth:0:initial_term',0,'initial_term',100000,25000,
    'catalog-price:v1',$7,$8,$9,$10)`, [
    accrualId, partner, orderUuid, seth.schedule_hash, snapshot, binding,
    attribution, money("settlement:1", 100000, "2026-09-02T00:00:00.000Z"), revenue, calculation,
  ]);
  await db.query(`insert into public.research_commission_period_ledger(
    id,period_key,revision,source_ledger_id,eligible_basis_delta_cents,
    commission_delta_cents,cumulative_eligible_basis_cents,cumulative_commission_cents,occurred_at
  ) values ($1,'binding-seth:0:initial_term',1,$2,100000,25000,100000,25000,'2026-09-02Z')`,
  [periodAccrualId, accrualId]);
  await db.query(`insert into public.research_commission_ledger(
    id,partner_id,order_id,state,eligible_net_cents,basis_points,amount_cents,reverses_ledger_id,
    program_id,schedule_version,schedule_hash,schedule_snapshot,program_binding_id,
    canonical_order_reference,original_settlement_reference,settlement_reference,idempotency_key,
    event_kind,period_key,period_index,term_mode,eligible_basis_delta_cents,
    commission_delta_cents,price_authority_reference,attribution_snapshot,
    money_evidence_snapshot,revenue_snapshot,calculation_snapshot,reversal_authority_reference
  ) values ($1,$2,$3,'reversed',25000,2500,6250,$4,
    'seth_operating_advisor_2026_09_signed',1,$5,$6,$7,
    'order_pack04_0001','settlement:1','refund:1','refund_reversal:refund:1',
    'refund_reversal','binding-seth:0:initial_term',0,'initial_term',-25000,-6250,
    'catalog-price:v1',$8,$9,null,$10,'commerce:refund:1')`, [
    reversalId, partner, orderUuid, accrualId, seth.schedule_hash, snapshot, binding,
    attribution, money("refund:1", 25000, "2026-09-20T00:00:00.000Z"),
    { eligibleBasisCents: 25000, commissionCents: 6250, components: [] },
  ]);
  await db.query(`insert into public.research_commission_period_ledger(
    id,period_key,revision,source_ledger_id,eligible_basis_delta_cents,
    commission_delta_cents,cumulative_eligible_basis_cents,cumulative_commission_cents,occurred_at
  ) values ($1,'binding-seth:0:initial_term',2,$2,-25000,-6250,75000,18750,'2026-09-20Z')`,
  [periodReversalId, reversalId]);
  assert.deepEqual((await db.query(`select revision,cumulative_eligible_basis_cents::int basis,
    cumulative_commission_cents::int commission from public.research_commission_period_ledger
    order by revision`)).rows, [
    { revision: 1, basis: 100000, commission: 25000 },
    { revision: 2, basis: 75000, commission: 18750 },
  ]);
  checked();

  await db.exec("begin");
  await assert.rejects(() => db.query(`insert into public.research_commission_ledger
    select (jsonb_populate_record(
      null::public.research_commission_ledger,
      to_jsonb(existing) || jsonb_build_object(
        'id',gen_random_uuid(),'idempotency_key','other-key'
      )
    )).* from public.research_commission_ledger existing where id=$1`, [reversalId]), /unique/i);
  await db.exec("rollback");
  assert.equal((await db.query("select count(*)::int n from public.research_commission_ledger")).rows[0].n, 2);
  checked();

  await db.exec("begin");
  await assert.rejects(() => db.query(`insert into public.research_commission_ledger
    select (jsonb_populate_record(
      null::public.research_commission_ledger,
      to_jsonb(existing) || jsonb_build_object(
        'id',gen_random_uuid(),
        'settlement_reference','refund:2',
        'money_evidence_snapshot',money_evidence_snapshot || '{"settlementRef":"refund:2"}'::jsonb
      )
    )).* from public.research_commission_ledger existing where id=$1`, [reversalId]), /unique/i);
  await db.exec("rollback");
  assert.equal((await db.query("select count(*)::int n from public.research_commission_ledger")).rows[0].n, 2);
  checked();

  await db.exec("begin");
  await assert.rejects(() => db.query(`update public.research_commission_program_schedules
    set definition='{}'::jsonb where program_id='seth_operating_advisor_2026_09_signed'`), /append-only/);
  await db.exec("rollback");
  checked();

  const driftDb = await freshDb();
  try {
    await driftDb.exec(`create table public.research_commission_program_schedules(
      program_id text not null, schedule_version integer not null, schedule_hash text not null,
      definition jsonb not null, effective_at timestamptz not null, authority_class text not null,
      recorded_at timestamptz not null default now(), primary key(program_id,schedule_version),
      unique(program_id,schedule_version,schedule_hash)
    ); insert into public.research_commission_program_schedules values(
      'seth_operating_advisor_2026_09_signed',1,
      '57616b61ae3c654f6154aa69896861428859033dd75d5b2224203cd1cfe47b3b',
      '{}','2026-09-02Z','signed_agreement',now()
    );`);
    await assert.rejects(() => driftDb.exec(candidate), /differs from the exact reviewed v1 definition or hash/);
    await driftDb.exec("rollback");
    checked();
  } finally {
    await driftDb.close();
  }

  console.log(JSON.stringify({
    status: "PASS", checks, engine: (await db.query("select version() version")).rows[0].version,
    runtime: `${metadata.name}@${metadata.version}`,
    candidatePath, precheckPath, postcheckPath,
    applyCount: 2, exactDefinitionDriftRefused: true,
    productionMutated: false, scope: "isolated in-memory PostgreSQL/WASM",
  }, null, 2));
} finally {
  await db.close();
}
