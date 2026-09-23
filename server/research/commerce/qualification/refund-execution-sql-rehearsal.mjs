/**
 * Local-only disposable rehearsal for the complete checkout money chain.
 * It never constructs a remote connection and applies the checked-in SQL bytes
 * to one fresh in-memory PGlite database. This is compatibility/replay/tamper
 * evidence, not managed Supabase or independent-connection concurrency proof.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const runtimeArgument = process.argv[process.argv.indexOf("--runtime") + 1] || process.env.XENIOS_PGLITE_PACKAGE_PATH;
if (!runtimeArgument || !isAbsolute(runtimeArgument) || /^[\\/]{2}/.test(runtimeArgument)) {
  throw new Error("usage: node refund-execution-sql-rehearsal.mjs --runtime <absolute local @electric-sql/pglite directory>");
}
const runtimePath = await realpath(runtimeArgument);
const metadata = JSON.parse(await readFile(resolve(runtimePath, "package.json"), "utf8"));
if (metadata.name !== "@electric-sql/pglite" || metadata.version !== "0.5.8") throw new Error("PGlite 0.5.8 is required");
const insideRuntime = async (entry) => {
  const actual = await realpath(resolve(runtimePath, entry));
  const rel = relative(runtimePath, actual);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error("runtime entry escaped package");
  return actual;
};
const [{ PGlite }, { pgcrypto }] = await Promise.all([
  import(pathToFileURL(await insideRuntime("dist/index.js")).href),
  import(pathToFileURL(await insideRuntime("dist/contrib/pgcrypto.js")).href),
]);

const CHECKOUT = "supabase/candidates/20260909150000_research_checkout_executions";
const INVENTORY = "supabase/migrations/20260727160000_research_inventory_reservation_commands.sql";
const INVENTORY_LOTS = "supabase/migrations/20260727120000_research_inventory_lot_coa_admin.sql";
const PRODUCT_CONTROL = "supabase/migrations/20260726143000_research_product_control_center.sql";
const PRODUCT_DIAGNOSTICS = "supabase/research-products-diagnostics.sql";
const MEMBERS = "supabase/research-members.sql";
const MEMBERSHIP = "supabase/research-membership.sql";
const PREPARATION = "supabase/candidates/20260909170000_research_checkout_atomic_preparation.sql";
const RECOVERY = "supabase/candidates/20260910120000_research_checkout_execution_recovery";
const CREDIT = "supabase/candidates/20260910201400_research_checkout_credit_reservations";
const OPERATION = "supabase/candidates/20260910220129_research_checkout_recovery_operation";
const REFUND = "supabase/candidates/20260921_research_refund_execution";
const FILES = [
  "supabase/production/research-track-b-commerce.sql",
  "supabase/research-idempotency-keys.sql",
  `${CHECKOUT}.precheck.sql`, `${CHECKOUT}.sql`, `${CHECKOUT}.postcheck.sql`, `${CHECKOUT}.rehearsal.sql`,
  MEMBERSHIP, MEMBERS, PRODUCT_DIAGNOSTICS, PRODUCT_CONTROL, INVENTORY_LOTS, INVENTORY, PREPARATION,
  `${CREDIT}.precheck.sql`, `${CREDIT}.sql`, `${CREDIT}.postcheck.sql`,
  `${RECOVERY}.precheck.sql`, `${RECOVERY}.sql`, `${RECOVERY}.postcheck.sql`,
  `${OPERATION}.precheck.sql`, `${OPERATION}.sql`, `${OPERATION}.postcheck.sql`,
  `${REFUND}.precheck.sql`, `${REFUND}.sql`, `${REFUND}.postcheck.sql`, `${REFUND}.rehearsal.sql`,
];
const capability = "durable_checkout_money_v2:20260923.1";
const lf = (bytes) => bytes.toString("utf8").replaceAll("\r\n", "\n");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const inputs = await Promise.all(FILES.map(async (name) => {
  const text = lf(await readFile(resolve(ROOT, name)));
  return { name, text, lfSha256: sha256(text) };
}));
const headSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();

const db = new PGlite({ extensions: { pgcrypto } });
try {
  await db.exec(`create schema if not exists extensions;
    create extension if not exists pgcrypto with schema extensions;
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema if not exists storage;
    create table if not exists storage.buckets(id text primary key,name text not null,public boolean not null default false,file_size_limit bigint,allowed_mime_types text[]);`);
  for (const input of inputs) {
    // The historical lot/COA migration intentionally remains byte-identical.
    // Its prerequisite migration supplies this column in managed history; the
    // disposable one-engine rehearsal bootstraps that prerequisite explicitly.
    if (input.name === INVENTORY_LOTS) {
      await db.exec("alter table public.research_lot_quality_documents add column if not exists private_storage_key text");
    }
    if (input.name === `${REFUND}.postcheck.sql`) {
      const beforePostcheck = await db.query("select public.research_checkout_money_capability() as capability");
      if (beforePostcheck.rows[0]?.capability !== capability) {
        const catalog = await db.query(`select p.oid::regprocedure::text as signature,md5(p.prosrc) as fingerprint
          from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and (p.proname like 'research_checkout_%' or p.proname like 'research_refund_%'
            or p.proname like 'research_payment_webhook_inbox_%' or p.proname='research_store_credit_protect_reservations')
          order by signature`);
        throw new Error(`pre-postcheck capability mismatch: ${JSON.stringify(catalog.rows)}`);
      }
    }
    await db.exec(input.text);
  }

  const exact = await db.query("select public.research_checkout_money_capability() as capability");
  if (exact.rows[0]?.capability !== capability) throw new Error("complete checkout capability did not attest exact chain");

  // Exercise the atomic preparation authority itself. An already-committed
  // exact identity must replay before inventory is touched; changed commercial
  // identity must conflict; fresh inventory/order projection mismatches must
  // fail before reservation; and unavailable inventory must roll back without
  // leaving an order or execution.
  const memberId = "11111111-1111-4111-8111-111111111111";
  const replayOrderId = "22222222-2222-4222-8222-222222222222";
  const replayExecutionId = "33333333-3333-4333-8333-333333333333";
  const replayKey = "req_atomic_0001";
  const replayDigest = "a".repeat(64);
  await db.query(`insert into public.research_orders
    (id,member_id,state,subtotal_cents,shipping_cents,store_credit_applied_cents,total_cents,
     checkout_idempotency_key,last_idempotency_key,review_triggers,created_at,updated_at)
    values ($1,$2,'checkout_pending',1000,0,0,1000,$3,$3,'{}',now(),now())`, [replayOrderId, memberId, replayKey]);
  await db.query(`insert into public.research_checkout_executions
    (id,member_id,request_key,request_body_sha256,order_id,phase,version,amount_cents,currency,
     payment_method_reference,quote_fingerprint,authorization_key,capture_key,cancel_key,reservation_ids)
    values ($1,$2,$3,$4,$5,'reserved',1,1000,'usd','pm_atomic_replay','quote-atomic-v2',
      'authorize-atomic-v2','capture-atomic-v2','cancel-atomic-v2','{reservation-replay}')`,
    [replayExecutionId, memberId, replayKey, replayDigest, replayOrderId]);
  const replayOrder = { orderId: replayOrderId, memberId, checkoutIdempotencyKey: replayKey };
  const replayExecution = {
    executionId: replayExecutionId, memberId, orderId: replayOrderId, requestKey: replayKey,
    requestBodySha256: replayDigest, amountCents: 1000, currency: "usd",
    paymentMethodReference: "pm_atomic_replay", quoteFingerprint: "quote-atomic-v2",
    phase: "reserved", version: 1,
  };
  const replay = await db.query(`select * from public.research_checkout_prepare(
    $1::jsonb,$2::jsonb,$3::jsonb,now(),now()+interval '15 minutes')`,
    [JSON.stringify(replayOrder), JSON.stringify(replayExecution), JSON.stringify([{ sku: "NO-STOCK", quantity: 1 }])]);
  if (replay.rows.length !== 1 || replay.rows[0]?.idempotent_replay !== true
      || replay.rows[0]?.order_id !== replayOrderId || replay.rows[0]?.execution_id !== replayExecutionId) {
    throw new Error("atomic checkout exact replay did not return the committed identity");
  }
  let conflictRefused = false;
  try {
    await db.query(`select * from public.research_checkout_prepare(
      $1::jsonb,$2::jsonb,$3::jsonb,now(),now()+interval '15 minutes')`, [
      JSON.stringify(replayOrder),
      JSON.stringify({ ...replayExecution, requestBodySha256: "b".repeat(64) }),
      JSON.stringify([{ sku: "NO-STOCK", quantity: 1 }]),
    ]);
  } catch (error) {
    conflictRefused = String(error?.message ?? error).includes("checkout_prepare_idempotency_conflict");
  }
  if (!conflictRefused) throw new Error("atomic checkout conflicting replay was not refused");

  const expectInventoryBindingMismatch = async ({ label, orderId, executionId, requestKey, digest, orderLines, inventoryLines }) => {
    const order = {
      orderId, memberId, checkoutIdempotencyKey: requestKey,
      totals: { subtotalCents: 1000, shippingCents: 0, storeCreditAppliedCents: 0, totalCents: 1000 },
      reviewTriggers: [], lines: orderLines, shipments: [],
    };
    const execution = {
      ...replayExecution, executionId, orderId, requestKey, requestBodySha256: digest,
      paymentMethodReference: `pm_atomic_${label}`, authorizationKey: `authorize-atomic-${label}`,
      captureKey: `capture-atomic-${label}`, cancelKey: `cancel-atomic-${label}`,
    };
    let exactMarker = false;
    try {
      await db.query(`select * from public.research_checkout_prepare(
        $1::jsonb,$2::jsonb,$3::jsonb,now(),now()+interval '15 minutes')`, [
        JSON.stringify(order), JSON.stringify(execution), JSON.stringify(inventoryLines),
      ]);
    } catch (error) {
      exactMarker = String(error?.message ?? error).includes("checkout_prepare_inventory_binding_mismatch");
    }
    if (!exactMarker) throw new Error(`atomic checkout ${label} mismatch did not return the exact binding marker`);
    const partial = await db.query(`select
      (select count(*)::int from public.research_orders where id=$1) as orders,
      (select count(*)::int from public.research_checkout_executions where id=$2) as executions`,
      [orderId, executionId]);
    if (partial.rows[0]?.orders !== 0 || partial.rows[0]?.executions !== 0) {
      throw new Error(`atomic checkout ${label} mismatch left partial order or execution state`);
    }
  };
  await expectInventoryBindingMismatch({
    label: "sku", orderId: "66666666-6666-4666-8666-666666666666",
    executionId: "77777777-7777-4777-8777-777777777777", requestKey: "req_atomic_sku_mismatch",
    digest: "d".repeat(64),
    orderLines: [{ sku: "ORDER-SKU", displayName: "Order SKU", quantity: 1, lineTotalCents: 1000 }],
    inventoryLines: [{ sku: "INVENTORY-SKU", quantity: 1 }],
  });
  await expectInventoryBindingMismatch({
    label: "quantity", orderId: "88888888-8888-4888-8888-888888888888",
    executionId: "99999999-9999-4999-8999-999999999999", requestKey: "req_atomic_quantity_mismatch",
    digest: "e".repeat(64),
    orderLines: [{ sku: "QUANTITY-SKU", displayName: "Quantity SKU", quantity: 1, lineTotalCents: 1000 }],
    inventoryLines: [{ sku: "QUANTITY-SKU", quantity: 2 }],
  });

  const rollbackOrderId = "44444444-4444-4444-8444-444444444444";
  const rollbackExecutionId = "55555555-5555-4555-8555-555555555555";
  const rollbackKey = "req_atomic_0002";
  const rollbackOrder = {
    orderId: rollbackOrderId, memberId, checkoutIdempotencyKey: rollbackKey,
    totals: { subtotalCents: 1000, shippingCents: 0, storeCreditAppliedCents: 0, totalCents: 1000 },
    reviewTriggers: [], lines: [{ sku: "NO-STOCK", displayName: "Unavailable", quantity: 1, lineTotalCents: 1000 }], shipments: [],
  };
  const rollbackExecution = {
    ...replayExecution, executionId: rollbackExecutionId, orderId: rollbackOrderId,
    requestKey: rollbackKey, requestBodySha256: "c".repeat(64),
    paymentMethodReference: "pm_atomic_rollback", authorizationKey: "authorize-atomic-rollback",
    captureKey: "capture-atomic-rollback", cancelKey: "cancel-atomic-rollback",
  };
  let preparationFailed = false;
  try {
    await db.query(`select * from public.research_checkout_prepare(
      $1::jsonb,$2::jsonb,$3::jsonb,now(),now()+interval '15 minutes')`, [
      JSON.stringify(rollbackOrder), JSON.stringify(rollbackExecution),
      JSON.stringify([{ sku: "NO-STOCK", quantity: 1 }]),
    ]);
  } catch {
    preparationFailed = true;
  }
  if (!preparationFailed) throw new Error("atomic checkout unavailable inventory unexpectedly succeeded");
  const partial = await db.query(`select
    (select count(*)::int from public.research_orders where id=$1) as orders,
    (select count(*)::int from public.research_checkout_executions where id=$2) as executions`,
    [rollbackOrderId, rollbackExecutionId]);
  if (partial.rows[0]?.orders !== 0 || partial.rows[0]?.executions !== 0) {
    throw new Error("atomic checkout failure left partial order or execution state");
  }

  const expectCapabilityNullAfter = async (label, mutation) => {
    await db.exec("begin");
    try {
      await db.exec(mutation);
      const result = await db.query("select public.research_checkout_money_capability() as capability");
      if (result.rows[0]?.capability !== null) throw new Error(`${label} did not revoke capability`);
    } finally {
      await db.exec("rollback");
    }
  };

  // Each formerly uncovered catalog drift is isolated in its own transaction.
  // A probe passes only when that single mutation makes the exact token null.
  const catalogTamperProbes = [
    ["column_nullability_tamper",
      "alter table public.research_checkout_executions alter column currency drop not null"],
    ["authorization_unique_constraint_tamper",
      "alter table public.research_checkout_executions drop constraint research_checkout_executions_authorization_key_key"],
    ["checkout_order_fk_tamper",
      "alter table public.research_checkout_executions drop constraint research_checkout_executions_order_id_fkey"],
    ["credit_execution_fk_tamper",
      "alter table public.research_checkout_credit_reservations drop constraint research_checkout_credit_reservations_execution_id_fkey"],
    ["credit_partial_index_tamper",
      "drop index public.research_checkout_credit_reservations_member_held_idx"],
    ["order_update_acl_tamper",
      "grant update on table public.research_orders to service_role"],
    ["anon_inventory_insert_acl_tamper",
      "grant insert on table public.research_inventory_lots to anon"],
    ["inventory_expire_rpc_acl_tamper",
      "grant execute on function public.research_expire_inventory_reservations(uuid,uuid,text[],timestamptz,text,text) to anon"],
    ["arbitrary_function_owner_tamper", `
      create role capability_function_owner_drift;
      alter function public.research_reserve_inventory(uuid,uuid,jsonb,timestamptz,timestamptz,text)
        owner to capability_function_owner_drift`],
    ["function_volatility_tamper",
      "alter function public.research_checkout_execution_claim(uuid,integer,text) stable"],
    ["credit_trigger_search_path_tamper",
      "alter function public.research_checkout_credit_reserve() set search_path to public"],
    ["inventory_force_rls_tamper",
      "alter table public.research_inventory_lots no force row level security"],
    ["inventory_identity_trigger_disabled_tamper",
      "alter table public.research_inventory_lots disable trigger research_inventory_lot_identity_serialization"],
    ["checkout_primary_key_tamper",
      "alter table public.research_checkout_executions drop constraint research_checkout_executions_pkey cascade"],
    ["webhook_primary_key_tamper",
      "alter table public.research_payment_webhook_inbox drop constraint research_payment_webhook_inbox_pkey"],
    ["paid_reference_check_tamper",
      "alter table public.research_checkout_executions drop constraint research_checkout_executions_paid_needs_reference"],
    ["order_truncate_acl_tamper",
      "grant truncate on table public.research_orders to service_role"],
    ["checkout_table_owner_tamper", `
      create role capability_table_owner_drift;
      alter table public.research_checkout_executions owner to capability_table_owner_drift`],
  ];
  for (const [name, mutation] of catalogTamperProbes) {
    await expectCapabilityNullAfter(name, mutation);
    const restoredAfterProbe = await db.query("select public.research_checkout_money_capability() as capability");
    if (restoredAfterProbe.rows[0]?.capability !== capability) {
      throw new Error(`${name} rollback did not restore exact capability`);
    }
  }
  await expectCapabilityNullAfter("wrong inventory trigger timing/event", `
    drop trigger research_inventory_reservation_events_no_update on public.research_inventory_reservation_events;
    create trigger research_inventory_reservation_events_no_update after update on public.research_inventory_reservation_events
      for each row execute function public.research_inventory_reservation_event_immutable()`);
  await expectCapabilityNullAfter("removed refund claim concurrency index",
    "drop index public.research_refund_executions_one_active_claim");
  await expectCapabilityNullAfter("direct inventory DML grant",
    "grant update on public.research_inventory_lots to service_role");
  await expectCapabilityNullAfter("direct reservation DML grant",
    "grant update on public.research_lot_reservations to service_role");
  await expectCapabilityNullAfter("missing atomic prepare function",
    "drop function public.research_checkout_prepare(jsonb,jsonb,jsonb,timestamptz,timestamptz)");
  await expectCapabilityNullAfter("unsafe function owner",
    "alter function public.research_reserve_inventory(uuid,uuid,jsonb,timestamptz,timestamptz,text) owner to service_role");
  await expectCapabilityNullAfter("inventory function SECURITY INVOKER substitution",
    "alter function public.research_release_inventory_reservations(uuid,uuid,text[],timestamptz,text,text) security invoker");
  await expectCapabilityNullAfter("altered reservation RLS posture",
    "alter table public.research_lot_reservations no force row level security");

  await db.exec("begin");
  try {
    await db.exec(`create or replace function public.research_checkout_money_capability()
      returns text language sql stable security definer set search_path = ''
      as 'select ''durable_checkout_money_v1:stale'''`);
    const stale = await db.query("select public.research_checkout_money_capability() as capability");
    if (stale.rows[0]?.capability === capability) throw new Error("stale capability version was accepted");
  } finally {
    await db.exec("rollback");
  }

  await db.exec("begin; savepoint body_tamper;");
  await db.exec(`create or replace function public.research_refund_execution_require_reconciliation(p_execution_id uuid,p_expected_version integer)
    returns setof public.research_refund_executions language sql security definer set search_path = ''
    as 'select * from public.research_refund_executions where false'`);
  const bodyTamper = await db.query("select public.research_checkout_money_capability() as capability");
  if (bodyTamper.rows[0]?.capability !== null) throw new Error("function body tamper did not revoke capability");
  await db.exec("rollback to savepoint body_tamper; release savepoint body_tamper; commit;");

  await db.exec("begin; alter function public.research_payment_webhook_inbox_claim(text,text,text,text,timestamptz) security invoker;");
  const attributeTamper = await db.query("select public.research_checkout_money_capability() as capability");
  if (attributeTamper.rows[0]?.capability !== null) throw new Error("function attribute tamper did not revoke capability");
  await db.exec("rollback;");

  await db.exec("begin; grant update on public.research_payment_webhook_inbox to service_role;");
  const aclTamper = await db.query("select public.research_checkout_money_capability() as capability");
  if (aclTamper.rows[0]?.capability !== null) throw new Error("inbox ACL tamper did not revoke capability");
  await db.exec("rollback;");
  await db.exec("begin; grant update on public.research_checkout_executions to service_role;");
  const requiredAclTamper = await db.query("select public.research_checkout_money_capability() as capability");
  if (requiredAclTamper.rows[0]?.capability !== null) throw new Error("checkout direct-DML grant did not revoke capability");
  await db.exec("rollback;");
  await db.exec("begin; alter function public.research_checkout_prepare(jsonb,jsonb,jsonb,timestamptz,timestamptz) set search_path to public;");
  const searchPathTamper = await db.query("select public.research_checkout_money_capability() as capability");
  if (searchPathTamper.rows[0]?.capability !== null) throw new Error("preparation search_path tamper did not revoke capability");
  await db.exec("rollback;");
  await db.exec("begin; alter table public.research_checkout_executions drop constraint research_checkout_executions_member_id_request_key_key;");
  const constraintTamper = await db.query("select public.research_checkout_money_capability() as capability");
  if (constraintTamper.rows[0]?.capability !== null) throw new Error("idempotency constraint tamper did not revoke capability");
  await db.exec("rollback;");
  await db.exec("begin; drop index public.research_checkout_executions_provider_reference_idx;");
  const indexTamper = await db.query("select public.research_checkout_money_capability() as capability");
  if (indexTamper.rows[0]?.capability !== null) throw new Error("provider-reference index tamper did not revoke capability");
  await db.exec("rollback;");
  await db.exec("begin; alter table public.research_checkout_executions disable trigger research_checkout_executions_immutable;");
  const triggerTamper = await db.query("select public.research_checkout_money_capability() as capability");
  if (triggerTamper.rows[0]?.capability !== null) throw new Error("immutable trigger tamper did not revoke capability");
  await db.exec("rollback;");
  const restored = await db.query("select public.research_checkout_money_capability() as capability");
  if (restored.rows[0]?.capability !== capability) throw new Error("capability did not restore after rolled-back tamper");

  process.stdout.write(JSON.stringify({
    status: "PASS",
    scope: "LOCAL_MEMORY_ONLY",
    runtime: `${metadata.name}@${metadata.version}`,
    headSha,
    capability,
    sqlInputs: inputs.map(({ name, lfSha256 }) => ({ path: name, lfSha256 })),
    checks: ["full_candidate_chain", "postchecks", "atomic_prepare_exact_replay", "atomic_prepare_conflict", "atomic_prepare_sku_binding_mismatch", "atomic_prepare_quantity_binding_mismatch", "atomic_prepare_rollback", ...catalogTamperProbes.map(([name]) => name), "replay", "terminal_binding_tamper", "body_fingerprint_tamper", "function_attribute_tamper", "forbidden_acl_tamper", "direct_dml_acl_tamper", "search_path_tamper", "request_key_constraint_tamper", "provider_reference_index_tamper", "trigger_disabled_tamper", "trigger_timing_event_tamper", "refund_concurrency_index_tamper", "inventory_dml_grant_tamper", "reservation_dml_grant_tamper", "missing_atomic_prepare_tamper", "unsafe_owner_tamper", "security_invoker_tamper", "rls_force_tamper", "stale_capability_version_tamper"],
    limitation: "single in-memory PostgreSQL engine; not managed Supabase/PostgREST or independent-connection concurrency evidence",
  }) + "\n");
} finally {
  await db.close();
}
