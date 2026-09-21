/** Local-only disposable rehearsal for the unapplied refund execution candidate. */
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const runtimePath = process.argv[process.argv.indexOf("--runtime") + 1] || process.env.XENIOS_PGLITE_PACKAGE_PATH;
if (!runtimePath) throw new Error("usage: node refund-execution-sql-rehearsal.mjs --runtime <@electric-sql/pglite directory>");
const metadata = JSON.parse(await readFile(path.join(runtimePath, "package.json"), "utf8"));
if (metadata.name !== "@electric-sql/pglite" || metadata.version !== "0.5.8") throw new Error("PGlite 0.5.8 is required");
const [{ PGlite }, { pgcrypto }] = await Promise.all([
  import(pathToFileURL(path.join(runtimePath, "dist/index.js")).href),
  import(pathToFileURL(path.join(runtimePath, "dist/contrib/pgcrypto.js")).href),
]);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const candidateDir = path.join(root, "supabase", "candidates");
const read = (name) => readFile(path.join(candidateDir, name), "utf8");

const bootstrap = `
create role anon noinherit; create role authenticated noinherit; create role service_role noinherit bypassrls;
create table public.research_orders (
 id uuid primary key, member_id uuid not null, state text not null check (state in
 ('draft','checkout_pending','payment_authorized','manual_review','approved','payment_captured','processing','partially_fulfilled','fulfilled','delivered','exception','cancelled','refunded','replaced')),
 subtotal_cents bigint not null, shipping_cents bigint not null, store_credit_applied_cents bigint not null,
 total_cents bigint not null, authorized_amount_cents bigint, captured_amount_cents bigint,
 refunded_cents bigint not null default 0 check (refunded_cents >= 0 and (captured_amount_cents is null or refunded_cents <= captured_amount_cents)),
 payment_reference text, checkout_idempotency_key text, last_idempotency_key text,
 created_at timestamptz not null, updated_at timestamptz not null
);
create table public.research_claims (
 id uuid primary key, order_id uuid not null references public.research_orders(id), member_id uuid not null,
 sku text not null, lot_id text, reason text not null, state text not null check (state in ('submitted','under_review','information_requested','approved','declined','resolved')),
 resolution text check (resolution in ('replacement','refund','partial_refund','none')), evidence_refs text[] not null,
 reviewed_by text, submitted_at timestamptz not null, updated_at timestamptz not null
);
create table public.research_refund_keys(scope text primary key, refund_reference text not null, recorded_at timestamptz not null default now());
create table public.research_order_state_events(
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.research_orders(id),
 from_state text not null, to_state text not null, actor_type text not null, actor_id text,
 provider_reference text, idempotency_key text, occurred_at timestamptz not null
);
create table public.research_payment_webhook_inbox(
 provider_name text not null, event_id text not null, event_type text not null,
 payload_sha256 text not null, state text not null default 'processing', outcome text,
 reason text, execution_id uuid, received_at timestamptz not null default now(),
 completed_at timestamptz, primary key(provider_name,event_id)
);
`;

const db = new PGlite({ extensions: { pgcrypto } });
try {
  await db.exec("create extension if not exists pgcrypto;" + bootstrap);
  await db.exec(await read("20260921_research_refund_execution.precheck.sql"));
  await db.exec(await read("20260921_research_refund_execution.sql"));
  await db.exec(await read("20260921_research_refund_execution.postcheck.sql"));
  await db.exec(await read("20260921_research_refund_execution.rehearsal.sql"));
  process.stdout.write(JSON.stringify({ status: "PASS", scope: "LOCAL_MEMORY_ONLY", runtime: `${metadata.name}@${metadata.version}` }) + "\n");
} finally {
  await db.close();
}
