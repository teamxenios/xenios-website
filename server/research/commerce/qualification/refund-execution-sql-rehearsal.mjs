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
const RECOVERY = "supabase/candidates/20260910120000_research_checkout_execution_recovery";
const CREDIT = "supabase/candidates/20260910201400_research_checkout_credit_reservations";
const OPERATION = "supabase/candidates/20260910220129_research_checkout_recovery_operation";
const REFUND = "supabase/candidates/20260921_research_refund_execution";
const FILES = [
  "supabase/production/research-track-b-commerce.sql",
  "supabase/research-idempotency-keys.sql",
  `${CHECKOUT}.precheck.sql`, `${CHECKOUT}.sql`, `${CHECKOUT}.postcheck.sql`, `${CHECKOUT}.rehearsal.sql`,
  `${RECOVERY}.precheck.sql`, `${RECOVERY}.sql`, `${RECOVERY}.postcheck.sql`,
  `${CREDIT}.precheck.sql`, `${CREDIT}.sql`, `${CREDIT}.postcheck.sql`,
  `${OPERATION}.precheck.sql`, `${OPERATION}.sql`, `${OPERATION}.postcheck.sql`,
  `${REFUND}.precheck.sql`, `${REFUND}.sql`, `${REFUND}.postcheck.sql`, `${REFUND}.rehearsal.sql`,
];
const capability = "durable_checkout_money_v1:20260922.1";
const lf = (bytes) => bytes.toString("utf8").replaceAll("\r\n", "\n");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const inputs = await Promise.all(FILES.map(async (name) => {
  const text = lf(await readFile(resolve(ROOT, name)));
  return { name, text, lfSha256: sha256(text) };
}));
const headSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();

const db = new PGlite({ extensions: { pgcrypto } });
try {
  await db.exec("create extension if not exists pgcrypto; create role anon; create role authenticated; create role service_role bypassrls;");
  for (const input of inputs) {
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
  await db.exec("begin; revoke update on public.research_checkout_executions from service_role;");
  const requiredAclTamper = await db.query("select public.research_checkout_money_capability() as capability");
  if (requiredAclTamper.rows[0]?.capability !== null) throw new Error("required checkout ACL removal did not revoke capability");
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
    checks: ["full_candidate_chain", "postchecks", "replay", "terminal_binding_tamper", "body_fingerprint_tamper", "function_attribute_tamper", "forbidden_acl_tamper", "required_acl_tamper"],
    limitation: "single in-memory PostgreSQL engine; not managed Supabase/PostgREST or independent-connection concurrency evidence",
  }) + "\n");
} finally {
  await db.close();
}
