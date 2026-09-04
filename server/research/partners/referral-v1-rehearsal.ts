/** LOCAL TEST/PREVIEW ONLY. Never import from production composition.
 * Starts its own fresh database. No existing host, port, URL or credentials accepted.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createServer } from "node:net";
import pg from "pg";
import type { ReferralV1RpcClient } from "./referral-v1-store";

export const REFERRAL_REHEARSAL_POSTGRES_IMAGE = "postgres@sha256:33f923b05f64ca54ac4401c01126a6b92afe839a0aa0a52bc5aeb5cc958e5f20";
const database = "xenios_referral_disposable";
const commandOptions = { encoding: "utf8" as const, windowsHide: true, timeout: 60000, stdio: ["ignore", "pipe", "pipe"] as ["ignore", "pipe", "pipe"] };
const docker = (...args: string[]) => execFileSync("docker", args, commandOptions).trim();
const wsl = (...args: string[]) => execFileSync("wsl", ["-d", "Ubuntu", "--exec", ...args], commandOptions).trim();
async function unusedLoopbackPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No isolated loopback port");
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

/** Extract a whole canonical CREATE TABLE statement, including its constraints. */
export function referralRehearsalTableDDL(source: string, name: string): string {
  const start = source.indexOf(`create table if not exists public.${name} (`);
  if (start < 0) throw new Error(`Missing canonical table ${name}`);
  const end = source.indexOf("\n);", start);
  if (end < 0) throw new Error(`Missing canonical table end ${name}`);
  return source.slice(start, end + 3);
}

export interface ReferralRehearsalDatabase {
  rpc: ReferralV1RpcClient;
  sql(query: string, args?: unknown[], user?: "postgres" | "service_role" | "anon" | "authenticated"): Promise<pg.QueryResult>;
  connection(user?: "postgres" | "service_role" | "anon" | "authenticated"): Promise<pg.Client>;
  seedPartner(state?: string): Promise<{ actorAuthUserId: string; memberId: string; partnerId: string }>;
  stop(): Promise<void>;
  runtimeEvidence: { transport: "wsl" | "docker"; version: string; database: string; taskResource: string; host: "127.0.0.1"; port: number };
}

export async function startReferralRehearsalDatabase(options: {
  root?: string;
  /** Reviewed, extracted portable Linux runtime; this is NOT a database data dir. */
  runtimePath?: string;
  /** Preview defaults to actual canonical request/order tables. */
  includeLineageSources?: boolean;
  /** Explicit old-candidate adoption branch used only by the database tests. */
  legacyBindingFixture?: boolean;
  /** Used by preview socket fences: called only after this owned server starts. */
  onPortReady?: (port: number) => void;
} = {}): Promise<ReferralRehearsalDatabase> {
  const root = options.root ?? process.cwd();
  const runtimePath = options.runtimePath ?? process.env.XENIOS_REFERRAL_V1_WSL_RUNTIME;
  const container = `xenios-referral-v1-test-${randomUUID()}`;
  let directory: string | null = null;
  let port = 0;
  let started = false;
  let stopped = false;
  const read = (file: string) => readFileSync(path.join(root, file), "utf8");
  async function connection(user: "postgres" | "service_role" | "anon" | "authenticated" = "postgres") {
    if (!started || stopped || port < 1 || port > 65535) throw new Error("Owned disposable database unavailable");
    const client = new pg.Client({ host: "127.0.0.1", port, database, user, password: "", ssl: false, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
    await client.connect();
    return client;
  }
  async function sql(query: string, args: unknown[] = [], user: "postgres" | "service_role" | "anon" | "authenticated" = "postgres") {
    const client = await connection(user);
    try { return await client.query(query, args); } finally { await client.end(); }
  }
  async function stop() {
    if (stopped) return;
    if (runtimePath && directory) {
      // Keep synthetic logs/evidence. Stop only the data directory created above.
      wsl("sh", "-c", 'set -eu; runtime="$1"; taskdir="$2"; export LD_LIBRARY_PATH="$runtime/usr/lib/x86_64-linux-gnu"; if "$runtime/usr/lib/postgresql/18/bin/pg_ctl" -D "$taskdir/data" status >/dev/null 2>&1; then "$runtime/usr/lib/postgresql/18/bin/pg_ctl" -D "$taskdir/data" -m fast -w stop; fi', "--", runtimePath, directory);
    } else if (started) { docker("rm", "--force", container); }
    started = false;
    stopped = true;
  }
  try {
    if (runtimePath) {
      if (!/^\/var\/tmp\/xenios-referral-v1-pg-[A-Za-z0-9]+\/runtime$/.test(runtimePath)) throw new Error("Unreviewed portable runtime path");
      directory = wsl("sh", "-c", 'set -eu; runtime="$1"; taskdir=$(mktemp -d /var/tmp/xenios-referral-v1-db-XXXXXXXX); export LD_LIBRARY_PATH="$runtime/usr/lib/x86_64-linux-gnu"; "$runtime/usr/lib/postgresql/18/bin/initdb" -D "$taskdir/data" -A trust -U postgres -L "$runtime/usr/share/postgresql/18" --no-locale >/dev/null; printf "%s" "$taskdir"', "--", runtimePath);
      if (!/^\/var\/tmp\/xenios-referral-v1-db-[A-Za-z0-9]+$/.test(directory)) throw new Error("Unexpected owned cluster path");
      port = await unusedLoopbackPort();
      // Successful pg_ctl start in our fresh data directory is required BEFORE a
      // connection. A port collision fails; it cannot adopt a pre-existing DB.
      wsl("sh", "-c", 'set -eu; runtime="$1"; taskdir="$2"; port="$3"; export LD_LIBRARY_PATH="$runtime/usr/lib/x86_64-linux-gnu"; "$runtime/usr/lib/postgresql/18/bin/pg_ctl" -D "$taskdir/data" -l "$taskdir/postgres.log" -o "-h 127.0.0.1 -p $port -k $taskdir" -w start; "$runtime/usr/lib/postgresql/18/bin/createdb" -h 127.0.0.1 -p "$port" -U postgres xenios_referral_disposable', "--", runtimePath, directory, String(port));
      started = true;
    } else {
      docker("run", "--detach", "--rm", "--name", container, "--publish", "127.0.0.1::5432", "--env", "POSTGRES_HOST_AUTH_METHOD=trust", "--env", `POSTGRES_DB=${database}`, REFERRAL_REHEARSAL_POSTGRES_IMAGE);
      started = true;
      const match = /^127\.0\.0\.1:(\d+)$/.exec(docker("port", container, "5432/tcp"));
      if (!match) throw new Error("Docker did not publish only loopback");
      port = Number(match[1]);
    }
    options.onPortReady?.(port);
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      try { await sql("select 1"); ready = true; break; } catch { await new Promise((resolve) => setTimeout(resolve, 200)); }
    }
    if (!ready) throw new Error("Disposable PostgreSQL startup deadline");
    await sql("create role anon login; create role authenticated login; create role service_role login noinherit bypassrls; create extension pgcrypto; create table public.research_applications(id uuid primary key)");
    const production = read("supabase/production/research-full-production.sql");
    await sql(read("supabase/research-members.sql"));
    for (const name of ["research_partners", "research_partner_links", "research_attribution_touches"]) await sql(referralRehearsalTableDDL(production, name));
    await sql(read("supabase/research-idempotency-keys.sql"));
    await sql("grant usage on schema public to anon,authenticated,service_role; grant select,insert,update,delete,truncate on all tables in schema public to service_role");
    if (options.legacyBindingFixture) {
      await sql(read("supabase/candidates/20260819_research_affiliate_customer_bindings.sql"));
      await sql("insert into public.research_affiliate_customer_bindings(customer_key,partner_id,code,subject_key,captured_at,bound_at,program_state,method) values('legacy:synthetic','legacy-partner','legacy-code','legacy-subject',now(),now(),'pending_program','attribution_cookie')");
    }
    await sql(read("supabase/candidates/20260904_research_partner_referral_v1.sql"));
    await sql(read("supabase/candidates/20260904_research_partner_referral_v1_lineage.sql"));
    if (options.includeLineageSources !== false) {
      await sql(referralRehearsalTableDDL(read("supabase/migrations/20260815150000_research_assisted_order_bridge.sql"), "research_assisted_order_requests"));
      await sql(referralRehearsalTableDDL(read("supabase/research-orders.sql"), "research_orders"));
      await sql("alter table public.research_assisted_order_requests enable row level security; alter table public.research_assisted_order_requests force row level security; revoke all on public.research_assisted_order_requests,public.research_orders from public,anon,authenticated,service_role");
    }
    const rpc: ReferralV1RpcClient = { async rpc(name, args) {
      try {
        const result = name === "research_referral_v1_authority" ? await sql("select public.research_referral_v1_authority() as result", [], "service_role")
          : name === "research_referral_v1_execute" ? await sql("select public.research_referral_v1_execute($1,$2::jsonb) as result", [args?.p_operation, JSON.stringify(args?.p_input)], "service_role")
          : name === "research_partner_referral_v1_lineage" ? await sql("select public.research_partner_referral_v1_lineage($1::text[],$2::integer) as result", [args?.p_account_keys, args?.p_limit], "service_role")
          : (() => { throw new Error("Unexpected rehearsal RPC"); })();
        return { data: result.rows[0].result, error: null };
      } catch (error) { return { data: null, error: { code: (error as { code?: string }).code ?? "rehearsal_error" } }; }
    } };
    async function seedPartner(state = "active") {
      const actorAuthUserId = randomUUID(), memberId = randomUUID(), partnerId = randomUUID(), applicationId = randomUUID();
      await sql("insert into public.research_applications(id) values($1)", [applicationId]);
      await sql("insert into public.research_members(id,application_id,auth_user_id,email,first_name,status) values($1,$2,$3,$4,'Synthetic','active')", [memberId, applicationId, actorAuthUserId, `${randomUUID()}@example.invalid`]);
      await sql("insert into public.research_partners(id,member_id,role,state,legal_name,contact_email,identity_verified,tax_status,payout_status,certified_at,certified_by_admin_id,activated_at,activated_by_admin_id) values($1,$2,'affiliate',$3,'Synthetic Local Fixture',$4,true,'verified','verified',now(),'synthetic-local-admin',now(),'synthetic-local-admin')", [partnerId, memberId, state, `${randomUUID()}@example.invalid`]);
      return { actorAuthUserId, memberId, partnerId };
    }
    return { rpc, sql, connection, seedPartner, stop, runtimeEvidence: {
      transport: runtimePath ? "wsl" : "docker", version: String((await sql("show server_version")).rows[0].server_version),
      database, taskResource: directory ?? container, host: "127.0.0.1", port,
    } };
  } catch (error) { await stop(); throw error; }
}
