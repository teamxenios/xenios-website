import { describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { attemptStaffRecovery, staffRecoveryOrigin, type StaffRecoveryDependencies, type StaffRecoveryRequest } from "./staff-recovery";

function fixture() {
  const env: Record<string, string | undefined> = { RESEARCH_STAFF_RECOVERY_ENABLED: "true", SITE_URL: "https://staging.example.invalid", NODE_ENV: "production" };
  const deps = {
    environment: () => env,
    limit: vi.fn(async () => true),
    eligibility: vi.fn(async () => ({ data: true as unknown, error: null as unknown })),
    send: vi.fn(async (_email: string, _options: { redirectTo: string }) => ({ error: null as unknown })),
    reportFailure: vi.fn(),
  } satisfies StaffRecoveryDependencies;
  const input: StaffRecoveryRequest = {
    email: "staff@example.invalid", returnTo: "/care/request-intents", origin: env.SITE_URL,
    fetchSite: "same-origin", json: true, ip: "192.0.2.10",
  };
  return { env, deps, input };
}

describe("default-off staff recovery adapter (no real provider)", () => {
  it.each([undefined, "false", "TRUE", "1", " true "])("is disabled for flag %s", async (flag) => {
    const { env, deps, input } = fixture(); env.RESEARCH_STAFF_RECOVERY_ENABLED = flag;
    await attemptStaffRecovery(input, deps);
    expect(deps.limit).not.toHaveBeenCalled(); expect(deps.eligibility).not.toHaveBeenCalled(); expect(deps.send).not.toHaveBeenCalled();
  });

  it.each([undefined, "bad", "http://staging.example.invalid", "https://user:pass@example.invalid", "https://example.invalid/path", "https://example.invalid?next=1", "https://example.invalid#token"])("fails closed for callback configuration %s", (site) => {
    expect(staffRecoveryOrigin({ RESEARCH_STAFF_RECOVERY_ENABLED: "true", SITE_URL: site })).toBeNull();
  });

  it("allows HTTP loopback only in a synthetic test environment", () => {
    for (const NODE_ENV of ["production", "development", undefined]) {
      expect(staffRecoveryOrigin({ RESEARCH_STAFF_RECOVERY_ENABLED: "true", SITE_URL: "http://127.0.0.1:9999", NODE_ENV })).toBeNull();
    }
    expect(staffRecoveryOrigin({ RESEARCH_STAFF_RECOVERY_ENABLED: "true", SITE_URL: "http://127.0.0.1:9999", NODE_ENV: "test" })).toBe("http://127.0.0.1:9999");
  });

  it.each([
    { origin: undefined }, { origin: "null" }, { origin: "https://outside.invalid" },
    { origin: "https://staging.example.invalid/" }, { fetchSite: "cross-site" }, { fetchSite: "same-site" },
    { json: false }, { ip: "unknown" }, { email: "STAFF@example.invalid" }, { email: " staff@example.invalid" },
  ])("rejects untrusted request context %j before lookup", async (change) => {
    const { deps, input } = fixture(); await attemptStaffRecovery({ ...input, ...change }, deps);
    expect(deps.limit).not.toHaveBeenCalled(); expect(deps.eligibility).not.toHaveBeenCalled(); expect(deps.send).not.toHaveBeenCalled();
  });

  it("uses strict durable hashed budgets and the configured staging callback once", async () => {
    const { deps, input } = fixture(); await attemptStaffRecovery(input, deps);
    expect(deps.limit.mock.calls).toEqual([
      [expect.stringMatching(/^research-staff-recovery-ip:[a-f0-9]{64}$/), 600, 3, { durableFailurePolicy: "deny" }],
      [expect.stringMatching(/^research-staff-recovery-email:[a-f0-9]{64}$/), 600, 1, { durableFailurePolicy: "deny" }],
    ]);
    expect(JSON.stringify(deps.limit.mock.calls)).not.toContain(input.ip);
    expect(JSON.stringify(deps.limit.mock.calls)).not.toContain(input.email);
    expect(deps.eligibility).toHaveBeenCalledExactlyOnceWith(input.email);
    expect(deps.send).toHaveBeenCalledExactlyOnceWith(input.email, {
      redirectTo: "https://staging.example.invalid/research/reset-password?returnTo=%2Fcare%2Frequest-intents",
    });
  });

  it.each([1, 2])("denies after durable budget %i fails", async (call) => {
    const { deps, input } = fixture(); let n = 0; deps.limit.mockImplementation(async () => ++n !== call);
    await attemptStaffRecovery(input, deps);
    expect(deps.eligibility).not.toHaveBeenCalled(); expect(deps.send).not.toHaveBeenCalled();
  });

  it.each([false, null, "true", { eligible: true }, 1])("does not trust a non-boolean eligibility response %j", async (data) => {
    const { deps, input } = fixture(); deps.eligibility.mockResolvedValue({ data, error: null });
    await attemptStaffRecovery(input, deps); expect(deps.send).not.toHaveBeenCalled();
  });

  it.each(["https://outside.invalid/", "/care/request-intents#secret", { role: "clinical_admin" }])("does not forward unsafe context %j", async (returnTo) => {
    const { deps, input } = fixture(); await attemptStaffRecovery({ ...input, returnTo }, deps);
    expect(deps.send.mock.calls[0][1].redirectTo).toBe("https://staging.example.invalid/research/reset-password");
  });

  it.each(["limit", "eligibility", "send"] as const)("contains %s failures with fixed codes only", async (stage) => {
    const { deps, input } = fixture(); deps[stage].mockRejectedValue(new Error("private-address@example.invalid private-callback-token"));
    await expect(attemptStaffRecovery(input, deps)).resolves.toBeUndefined();
    expect(deps.reportFailure).toHaveBeenCalledExactlyOnceWith(stage === "limit" ? "limiter_unavailable" : stage === "eligibility" ? "eligibility_unavailable" : "provider_unavailable");
    expect(JSON.stringify(deps.reportFailure.mock.calls)).not.toMatch(/private-address|private-callback-token/);
  });

  it("does not send when audit/eligibility fails, and does not retry provider errors", async () => {
    const { deps, input } = fixture();
    deps.eligibility.mockResolvedValueOnce({ data: true, error: { message: "private audit failure" } });
    await attemptStaffRecovery(input, deps); expect(deps.send).not.toHaveBeenCalled();
    deps.send.mockResolvedValue({ error: { message: "private provider failure" } });
    await attemptStaffRecovery(input, deps); expect(deps.send).toHaveBeenCalledTimes(1);
    expect(deps.reportFailure.mock.calls).toEqual([["eligibility_unavailable"], ["provider_unavailable"]]);
  });
});

// Independent of the mocked adapter cases above: real PostgreSQL constraints,
// function privileges, indexed lookup and transactional audit. The transport
// accepts no host/database URL or credentials and publishes no host port.
// Auth is a synthetic provider-shaped schema, not actual managed GoTrue/mail.
const pg16It = process.env.CI || process.env.XENIOS_RUN_PG16_VERIFIER === "1" ? it : it.skip;
pg16It("qualifies staff recovery SQL in its owned PG16 database before any release ledger claim", async () => {
  const container = `xenios-staff-recovery-${randomUUID()}`;
  let created = false;
  const docker = (args: string[], input?: string) => execFileSync("docker", args, {
    encoding: "utf8", windowsHide: true, timeout: 60_000,
    input, stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"], maxBuffer: 2 * 1024 * 1024,
  }).trim();
  const sql = (text: string, database = "staff_recovery_disposable") => docker([
    "exec", "-i", container, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database, "-Atq",
  ], text);
  const prerequisite = (path: string, literal: string) => {
    const block = readFileSync(path, "utf8").match(/do \$migration\$[\s\S]*?\$migration\$;/)?.[0];
    if (!block?.includes(literal) || !block.includes("care_access_audit")) throw new Error("staff_recovery_prerequisite_missing");
    // Execute the actual additive role/audit block unchanged. Other workflow
    // functions/tables are outside this recovery fixture and are not qualified.
    return block;
  };
  try {
    docker(["run", "-d", "--name", container, "--network", "none", "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:16"]);
    created = true;
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { docker(["exec", container, "pg_isready", "-U", "postgres"]); ready = true; break; } catch { /* starting */ }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!ready) throw new Error("staff_recovery_owned_postgres_not_ready");
    sql("create database staff_recovery_disposable;", "postgres");
    expect(sql("select current_setting('server_version_num')::int between 160000 and 169999;")).toBe("t");
    sql(`create role anon nologin; create role authenticated nologin;
      create role service_role nologin noinherit bypassrls;
      create schema auth;
      create table auth.users (
        id uuid primary key, instance_id uuid, email varchar(255), email_confirmed_at timestamptz,
        banned_until timestamptz, is_sso_user boolean not null default false, deleted_at timestamptz,
        raw_user_meta_data jsonb default '{}'::jsonb
      );
      create index idx_users_email on auth.users(email);
      create unique index users_email_partial_key on auth.users(email) where is_sso_user=false;
      grant usage on schema auth to service_role,anon,authenticated;
      create function auth.uid() returns uuid language sql stable set search_path='' as $$
        select nullif(pg_catalog.current_setting('request.jwt.claim.sub',true),'')::uuid;
      $$;`);
    sql(readFileSync("supabase/care-access-foundation.sql", "utf8"));
    sql(prerequisite("supabase/migrations/20261114133500_early_access_pending_request_reader.sql", "request_intent_reader"));
    sql(prerequisite("supabase/migrations/20261118024134_request_intent_workflow.sql", "request_intent_processor"));
    // Simulate a separately approved audit purpose. Recovery must preserve it
    // as well as current pending-reader and processor purposes on both replays.
    sql(`do $$ declare e text; begin
      select pg_get_expr(conbin,conrelid) into strict e from pg_constraint
        where conrelid='public.care_access_audit'::regclass and conname='ea_pending_reader_permission_check';
      execute 'alter table public.care_access_audit drop constraint ea_pending_reader_permission_check,
        add constraint ea_pending_reader_permission_check check (('||e||') or permission=''fixture:already_approved'')';
    end; $$;`);
    const rolesBefore = sql("select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.care_role_assignments'::regclass order by conname;");
    const migration = readFileSync("supabase/migrations/20261118034207_staff_account_recovery_eligibility.sql", "utf8");
    sql(migration); sql(migration);
    sql(`begin; insert into public.care_access_audit(actor_user_id,permission,outcome) values
      (null,'care:security_audit','allowed'),(null,'request_intent:read_pending','allowed'),
      (null,'request_intent:process','allowed'),(null,'fixture:already_approved','allowed'); rollback;`);
    expect(sql("select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.care_role_assignments'::regclass order by conname;")).toBe(rolesBefore);
    sql(readFileSync("supabase/tests/staff-account-recovery.test.sql", "utf8"));
    expect(sql("select count(*) from auth.users;")).toBe("0");
    expect(sql("select count(*) from public.care_access_audit;")).toBe("0");
  } finally {
    if (created) docker(["rm", "-f", container]);
  }
}, 180_000);
