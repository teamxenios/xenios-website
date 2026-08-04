import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PRIVATE_ACCESS_NONCE_ROLE,
  PRIVATE_ACCESS_NONCE_TTL_SECONDS,
  consumePrivateAccessNonce,
  preparePrivateAccessNonce,
  type PrivateAccessNonceRecord,
} from "./private-access-nonce-store";

const NOW = 2_000_000_000_123;
const NONCE = Buffer.alloc(32, 0x51).toString("base64url");
const OTHER_NONCE = Buffer.alloc(32, 0x52).toString("base64url");
const SESSION_HANDLE = Buffer.alloc(32, 0x61).toString("base64url");
const OTHER_SESSION_HANDLE = Buffer.alloc(32, 0x62).toString("base64url");
const OWNER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_OWNER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const STORE_SECRET = "private-nonce-store-secret-at-least-thirty-two-bytes";
const OTHER_STORE_SECRET = "different-private-nonce-store-secret-at-least-thirty-two";
const migration = readFileSync(
  resolve(__dirname, "../../../supabase/research-private-early-access-sessions.sql"),
  "utf8",
);
const verification = readFileSync(
  resolve(__dirname, "../../../supabase/verification/research-private-early-access-sessions.verify.sql"),
  "utf8",
);
const rollbackNotes = readFileSync(
  resolve(__dirname, "../../../supabase/production/research-private-early-access-sessions-rollback-notes.md"),
  "utf8",
);

function prepare(overrides: Record<string, unknown> = {}) {
  return preparePrivateAccessNonce({
    nonce: NONCE,
    now: NOW,
    ownerId: OWNER_ID,
    role: PRIVATE_ACCESS_NONCE_ROLE,
    storeSecret: STORE_SECRET,
    ...overrides,
  });
}

function preparedRecord(): PrivateAccessNonceRecord {
  const result = prepare();
  if (!result.ok) throw new Error(`nonce fixture failed: ${result.code}`);
  return result.value;
}

function consume(record: PrivateAccessNonceRecord, overrides: Record<string, unknown> = {}) {
  return consumePrivateAccessNonce({
    nonce: NONCE,
    now: NOW,
    ownerId: OWNER_ID,
    record,
    role: PRIVATE_ACCESS_NONCE_ROLE,
    sessionHandle: SESSION_HANDLE,
    storeSecret: STORE_SECRET,
    ...overrides,
  });
}

describe("private early access nonce preparation", () => {
  it("returns only domain-separated hashes and exact bounded metadata", () => {
    const result = prepare();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const issuedAt = Math.floor(NOW / 1_000);
    expect(result.value).toEqual({
      nonceHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      ownerId: OWNER_ID,
      role: PRIVATE_ACCESS_NONCE_ROLE,
      issuedAtEpochSeconds: issuedAt,
      expiresAtEpochSeconds: issuedAt + PRIVATE_ACCESS_NONCE_TTL_SECONDS,
      consumedAtEpochSeconds: null,
      exchangedSessionHash: null,
    });
    const serialized = JSON.stringify(result.value);
    expect(serialized).not.toContain(NONCE);
    expect(serialized).not.toContain(SESSION_HANDLE);
    expect(serialized).not.toContain(STORE_SECRET);
  });

  it("is deterministic for exact evidence and changes by nonce or secret", () => {
    const first = prepare();
    const replay = prepare();
    const otherNonce = prepare({ nonce: OTHER_NONCE });
    const otherSecret = prepare({ storeSecret: OTHER_STORE_SECRET });
    expect(first).toEqual(replay);
    expect(first.ok && otherNonce.ok && first.value.nonceHash).not.toBe(otherNonce.ok && otherNonce.value.nonceHash);
    expect(first.ok && otherSecret.ok && first.value.nonceHash).not.toBe(
      otherSecret.ok && otherSecret.value.nonceHash,
    );
  });

  it("refuses weak configuration, noncanonical opaque values, owner/role drift, and invalid time", () => {
    expect(prepare({ storeSecret: "short" })).toEqual({ ok: false, code: "CONFIGURATION_INVALID" });
    expect(prepare({ nonce: "not-a-nonce" })).toEqual({ ok: false, code: "INPUT_INVALID" });
    expect(prepare({ ownerId: OWNER_ID.toUpperCase() })).toEqual({ ok: false, code: "INPUT_INVALID" });
    expect(prepare({ role: "admin" })).toEqual({ ok: false, code: "INPUT_INVALID" });
    expect(prepare({ now: 0 })).toEqual({ ok: false, code: "INPUT_INVALID" });
  });

  it("rejects extra, inherited, symbol, accessor, and hostile proxy input", () => {
    expect(
      preparePrivateAccessNonce({
        nonce: NONCE,
        now: NOW,
        ownerId: OWNER_ID,
        role: PRIVATE_ACCESS_NONCE_ROLE,
        storeSecret: STORE_SECRET,
        paymentReference: "must-not-cross",
      }),
    ).toEqual({ ok: false, code: "INPUT_INVALID" });
    expect(
      preparePrivateAccessNonce(
        Object.create({
          nonce: NONCE,
          now: NOW,
          ownerId: OWNER_ID,
          role: PRIVATE_ACCESS_NONCE_ROLE,
          storeSecret: STORE_SECRET,
        }) as unknown,
      ),
    ).toEqual({ ok: false, code: "INPUT_INVALID" });
    const withSymbol = {
      nonce: NONCE,
      now: NOW,
      ownerId: OWNER_ID,
      role: PRIVATE_ACCESS_NONCE_ROLE,
      storeSecret: STORE_SECRET,
    } as Record<string | symbol, unknown>;
    withSymbol[Symbol("private")] = "marker";
    expect(preparePrivateAccessNonce(withSymbol)).toEqual({ ok: false, code: "INPUT_INVALID" });

    let getterCalls = 0;
    const accessor: Record<string, unknown> = {
      nonce: NONCE,
      now: NOW,
      ownerId: OWNER_ID,
      role: PRIVATE_ACCESS_NONCE_ROLE,
    };
    Object.defineProperty(accessor, "storeSecret", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return STORE_SECRET;
      },
    });
    expect(preparePrivateAccessNonce(accessor)).toEqual({ ok: false, code: "INPUT_INVALID" });
    expect(getterCalls).toBe(0);
    const proxy = new Proxy({}, { ownKeys: () => { throw new Error("hostile"); } });
    expect(() => preparePrivateAccessNonce(proxy)).not.toThrow();
    expect(preparePrivateAccessNonce(proxy)).toEqual({ ok: false, code: "INPUT_INVALID" });
  });
});

describe("private early access nonce-exchange planning", () => {
  it("produces one hash-only consumed record and receipt", () => {
    const result = consume(preparedRecord());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.record.consumedAtEpochSeconds).toBe(Math.floor(NOW / 1_000));
    expect(result.value.receipt).toEqual({
      nonceHash: result.value.record.nonceHash,
      sessionHash: result.value.record.exchangedSessionHash,
      ownerId: OWNER_ID,
      role: PRIVATE_ACCESS_NONCE_ROLE,
      consumedAtEpochSeconds: Math.floor(NOW / 1_000),
    });
    const serialized = JSON.stringify(result.value);
    expect(serialized).not.toContain(NONCE);
    expect(serialized).not.toContain(SESSION_HANDLE);
    expect(serialized).not.toContain(STORE_SECRET);
  });

  it("refuses an exact replay using the consumed durable snapshot", () => {
    const first = consume(preparedRecord());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(consume(first.value.record)).toEqual({ ok: false, code: "NONCE_REPLAYED" });
  });

  it("remains explicitly planner-only and leaves stale-snapshot serialization to PostgreSQL", () => {
    const stale = preparedRecord();
    const firstPlan = consume(stale);
    const concurrentPlan = consume(stale, { sessionHandle: OTHER_SESSION_HANDLE });
    expect(firstPlan.ok).toBe(true);
    expect(concurrentPlan.ok).toBe(true);
    if (!firstPlan.ok || !concurrentPlan.ok) return;
    expect(firstPlan.value.record.exchangedSessionHash).not.toBe(
      concurrentPlan.value.record.exchangedSessionHash,
    );
  });

  it("refuses nonce, owner, role, and secret mismatches but binds any fresh canonical session", () => {
    const record = preparedRecord();
    expect(consume(record, { nonce: OTHER_NONCE })).toEqual({ ok: false, code: "NONCE_INVALID" });
    const otherSession = consume(record, { sessionHandle: OTHER_SESSION_HANDLE });
    expect(otherSession.ok).toBe(true);
    if (otherSession.ok) {
      const defaultSession = consume(record);
      expect(defaultSession.ok).toBe(true);
      if (!defaultSession.ok) return;
      expect(otherSession.value.record.exchangedSessionHash).not.toBe(
        defaultSession.value.record.exchangedSessionHash,
      );
    }
    expect(consume(record, { ownerId: OTHER_OWNER_ID })).toEqual({ ok: false, code: "OWNER_MISMATCH" });
    expect(consume(record, { role: "admin" })).toEqual({ ok: false, code: "INPUT_INVALID" });
    expect(consume(record, { storeSecret: OTHER_STORE_SECRET })).toEqual({
      ok: false,
      code: "NONCE_INVALID",
    });
  });

  it("rejects any future-issued record and expires at the absolute boundary", () => {
    const record = preparedRecord();
    const future: PrivateAccessNonceRecord = {
      ...record,
      issuedAtEpochSeconds: record.issuedAtEpochSeconds + 1,
      expiresAtEpochSeconds: record.expiresAtEpochSeconds + 1,
    };
    expect(consume(future)).toEqual({ ok: false, code: "NONCE_NOT_YET_VALID" });

    const expiresAtMs = record.expiresAtEpochSeconds * 1_000;
    expect(consume(record, { now: expiresAtMs - 1 }).ok).toBe(true);
    expect(consume(record, { now: expiresAtMs })).toEqual({ ok: false, code: "NONCE_EXPIRED" });
  });

  it("refuses malformed, extended, already-invalid, or noncanonical stored records", () => {
    const record = preparedRecord();
    expect(consume({ ...record, nonceHash: "f".repeat(63) } as PrivateAccessNonceRecord)).toEqual({
      ok: false,
      code: "INPUT_INVALID",
    });
    expect(
      consume({
        ...record,
        expiresAtEpochSeconds: record.expiresAtEpochSeconds + 1,
      } as PrivateAccessNonceRecord),
    ).toEqual({ ok: false, code: "INPUT_INVALID" });
    expect(
      consume({ ...record, paymentAuthority: true } as PrivateAccessNonceRecord & { paymentAuthority: boolean }),
    ).toEqual({ ok: false, code: "INPUT_INVALID" });
    expect(
      consume({
        ...record,
        consumedAtEpochSeconds: record.expiresAtEpochSeconds,
      } as PrivateAccessNonceRecord),
    ).toEqual({ ok: false, code: "INPUT_INVALID" });
  });

  it("rejects a hostile record accessor without reading it", () => {
    let getterCalls = 0;
    const record = { ...preparedRecord() } as Record<string, unknown>;
    delete record.nonceHash;
    Object.defineProperty(record, "nonceHash", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return preparedRecord().nonceHash;
      },
    });
    expect(consume(record as PrivateAccessNonceRecord)).toEqual({ ok: false, code: "INPUT_INVALID" });
    expect(getterCalls).toBe(0);
  });
});

describe("private early access canonical SQL source invariants (causal execution required)", () => {
  it("is one explicit transaction and fails closed on a partial installation", () => {
    expect(migration.trimStart()).toMatch(/^--[\s\S]*?\nbegin;/i);
    expect(migration.trimEnd()).toMatch(/commit;$/i);
    expect(migration).toContain("partial installation detected");
    expect(migration).toMatch(/\(v_sessions is null\) <> \(v_nonces is null\)/);
    expect(migration).toContain("incompatible sessions table columns");
    expect(migration).toContain("incompatible nonces table columns");
    expect(migration).toContain("incompatible sessions constraints");
    expect(migration).toContain("incompatible nonces constraints");
    expect(migration).toContain("pg_catalog.pg_get_constraintdef(c.oid, true)");
    expect(migration).toContain("pg_catalog.pg_get_indexdef(c.oid)");
    expect(migration).toContain("c.convalidated::text");
    expect(migration).toContain("i.indisvalid::text");
    expect(migration).toContain("i.indisready::text");
    expect(migration).toContain("i.indislive::text");
    expect(migration).toContain("tables must be ordinary persistent relations");
    expect(migration).toContain("function/index-only partial installation detected");
    expect(migration).toContain("incomplete or overloaded function installation detected");
  });

  it("stores hashes only and binds exact owner, role, and bounded absolute expiry", () => {
    expect(migration).toMatch(/session_hash text primary key/);
    expect(migration).toMatch(/nonce_hash text primary key/);
    expect(migration).not.toMatch(/\b(?:raw_nonce|raw_cookie|cookie_value|session_token|access_password)\b/i);
    expect(migration).toMatch(/access_role = 'private_early_access_member'/g);
    expect(migration).toMatch(/expires_at = issued_at \+ interval '15 minutes'/);
    expect(migration).toMatch(/expires_at = issued_at \+ interval '5 minutes'/);
    expect(migration).toMatch(/exchanged_session_hash text/);
    expect(migration).toMatch(/\(consumed_at is null\) = \(exchanged_session_hash is null\)/);
  });

  it("creates a session only inside one guarded atomic nonce exchange", () => {
    expect(migration).not.toContain("research_private_early_access_create_session");
    expect(migration).not.toContain("research_private_early_access_consume_nonce");
    const exchange = migration.slice(
      migration.indexOf("create or replace function public.research_private_early_access_exchange_nonce"),
      migration.indexOf("create or replace function public.research_private_early_access_session_active"),
    );
    expect(exchange).toMatch(/for update/);
    expect(exchange).toMatch(/insert into public\.research_private_early_access_sessions/);
    expect(exchange).toMatch(/update public\.research_private_early_access_nonces n\s+set consumed_at = v_now,/);
    expect(exchange).toMatch(/exchanged_session_hash = p_session_hash/);
    expect(exchange).toMatch(/n\.consumed_at is null/);
    expect(exchange).toMatch(/v_nonce\.expires_at <= v_now/);
    expect(exchange).toContain("atomic exchange invariant failed");
    expect(exchange).not.toMatch(/set revoked_at/);

    const lockPosition = exchange.indexOf("pg_catalog.pg_advisory_xact_lock");
    const rowLockPosition = exchange.indexOf("for update;");
    const refreshedClockPosition = exchange.indexOf("v_now := pg_catalog.clock_timestamp();");
    const expiryCheckPosition = exchange.indexOf("v_nonce.expires_at <= v_now");
    expect(lockPosition).toBeGreaterThan(-1);
    expect(rowLockPosition).toBeGreaterThan(lockPosition);
    expect(refreshedClockPosition).toBeGreaterThan(rowLockPosition);
    expect(expiryCheckPosition).toBeGreaterThan(refreshedClockPosition);
  });

  it("refreshes database time only after a nonce-issue lock and row lookup", () => {
    const issue = migration.slice(
      migration.indexOf("create or replace function public.research_private_early_access_issue_nonce"),
      migration.indexOf("create or replace function public.research_private_early_access_exchange_nonce"),
    );
    const lockPosition = issue.indexOf("pg_catalog.pg_advisory_xact_lock");
    const rowLockPosition = issue.indexOf("for update;");
    const refreshedClockPosition = issue.indexOf("v_now := pg_catalog.clock_timestamp();");
    expect(lockPosition).toBeGreaterThan(-1);
    expect(rowLockPosition).toBeGreaterThan(lockPosition);
    expect(refreshedClockPosition).toBeGreaterThan(rowLockPosition);
  });

  it("forces RLS with zero policies and zero direct application-role table access", () => {
    expect(migration.match(/force row level security;/gi)).toHaveLength(2);
    expect(migration).toContain("unexpected RLS policy detected; zero policies are required");
    expect(migration).toMatch(/array\['anon', 'authenticated', 'service_role'\]/);
    expect(migration).toMatch(/revoke all on table public\.research_private_early_access_sessions from %I/);
    expect(migration).toMatch(/revoke all on table public\.research_private_early_access_nonces from %I/);
    expect(migration).toContain("table ACL allowlist violation");
    expect(migration).toContain("pg_catalog.aclexplode");
    expect(migration).toContain("column ACL entries are forbidden");
    expect(migration).toContain("pg_catalog.has_column_privilege");
    expect(migration).not.toMatch(/grant\s+(?:select|insert|update|delete|all)\s+on\s+table/i);
  });

  it("uses four fixed-search-path SECURITY DEFINER functions and grants only narrow execute", () => {
    expect(migration.match(/security definer/gi)).toHaveLength(4);
    expect(migration.match(/set search_path = pg_catalog/gi)).toHaveLength(4);
    expect(migration.match(/create or replace function public\.research_private_early_access_/gi)).toHaveLength(4);
    expect(migration).toMatch(/revoke all on function public\.research_private_early_access_exchange_nonce/);
    expect(migration).toMatch(/grant execute on function %s to service_role/);
    expect(migration).toContain("function ACL allowlist violation");
    expect(migration).toContain("effective browser RPC execute");
    expect(migration).not.toMatch(/grant execute[\s\S]*to (?:public|anon|authenticated)/i);
  });

  it("ships read-only catalog verification and a protected zero-row rollback procedure", () => {
    expect(verification).toMatch(/begin transaction read only;/i);
    expect(verification).toContain("unexpected_policy_count");
    expect(verification).toContain("role_table_grants");
    expect(verification).toContain("security_definer");
    expect(verification).toContain("has_table_privilege");
    expect(verification).toContain("sessions constraint definitions mismatch");
    expect(verification).toContain("nonce constraint definitions mismatch");
    expect(verification).toContain("index definitions mismatch");
    expect(verification).toContain("table ACL allowlist violation");
    expect(verification).toContain("function ACL allowlist violation");
    expect(verification).toContain("column ACL entries are forbidden");
    expect(verification).toContain("has_column_privilege");
    expect(verification).toContain("unexpected prefixed RPC count");
    expect(verification).toContain("forbidden browser RPC execute");
    expect(verification).toContain("p.proowner = v_table_owner");
    expect(verification).toContain("session_row_count");
    expect(verification.trimEnd()).toMatch(/commit;$/i);
    expect(rollbackNotes).toContain("PENDING / UNAPPLIED");
    expect(rollbackNotes).toContain("Both tables contain zero rows");
    expect(rollbackNotes).toContain("There is no standalone session-create function");
    expect(rollbackNotes).toContain("Drop `public.research_private_early_access_nonces` before");
    expect(rollbackNotes).toContain("Forward repair is preferred");
  });
});
