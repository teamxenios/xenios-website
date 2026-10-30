/**
 * Extracted unchanged test authorities from accepted b0e5b225d081e195173b14df18c02e7908522199.
 * Synthetic Care tables omit managed CHECKs; auth.uid reads the legacy claim.
 * This fixture does not qualify managed Auth, Care schema or production readiness.
 * No host/database URL or credentials are accepted. Only the owned postgres:16
 * container is used. CI must execute; Docker/SQL/assertion failures fail the test.
 * Identity, catalog facts and Care access-audit delivery are synthetic inputs.
 * The production registration, service, repository and candidate SQL are real.
 */
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import express from "express";
import pg from "pg";
import request from "supertest";
import { expect, it, vi } from "vitest";
import type { CareAccessDependencies } from "../../../care/access";
import type { NormalizedMasterOffering } from "../../master-offerings/model";
import type { AssistedOrderViewer } from "../ports";
import type { AssistedOrderProductionWiring } from "../production-deps";
import type { SupabaseRpcClient } from "../supabase-repository";
import {
  assistedOrderFormPair, requiredAssistedOrderFormAcknowledgments,
} from "../../../../shared/research/assisted-order/form";
import {
  type RequestIntentDetail, type RequestIntentInput,
} from "../../../../shared/research/assisted-order/request-intent";
import { registerRequestIntentApi } from "./production";
import { RequestIntentError } from "./service";

export const pg16It = process.env.CI || process.env.XENIOS_RUN_PG16_VERIFIER === "1" ? it : it.skip;
const ROOT = process.cwd();
export const ROUTE = "/api/research/early-access/request-intents";
export const ORIGIN = "https://durable-journey.example.invalid";
export const OPERATOR = "10000000-0000-4000-8000-000000000001";
export const OTHER_ACTOR = "10000000-0000-4000-8000-000000000002";
export const ATTEMPT = "20000000-0000-4000-8000-000000000001";
const CANDIDATE_SHA256 = "c50a54629c5e182dafed61e80831e6f9429c18568aac4dd668c0bad8213d97f8";
type DbRole = "postgres" | "service_role" | "anon" | "authenticated";
type SavedRow = {
  id: string; public_reference: string; owner_hash: string; attempt_hash: string;
  fingerprint: string; status: "pending_review"; created_at: Date;
  contact: RequestIntentDetail["contact"];
  agreements: RequestIntentDetail["agreements"];
  lines: RequestIntentDetail["lines"];
};

export const guest: AssistedOrderViewer = {
  actorType: "early_access_session", authUserId: null, memberId: null,
  earlyAccessCustomerRef: "synthetic-customer-a",
  earlyAccessSessionHash: "synthetic-session-a",
  normalizedEmail: "synthetic@example.invalid",
  capabilities: new Set(["assisted_orders:submit", "assisted_orders:read_own"]),
};
export const otherGuest: AssistedOrderViewer = {
  ...guest, earlyAccessCustomerRef: "synthetic-customer-b",
  earlyAccessSessionHash: "synthetic-session-b",
  // The same contact email must not confer ownership.
};
function offering(id: number, clinical: boolean): NormalizedMasterOffering {
  return {
    id: "off-" + id, slug: "synthetic-" + id, canonicalKey: "synthetic-" + id,
    displayName: "Synthetic " + id, canonicalName: "Synthetic " + id,
    family: clinical ? "clinical_formulations_503a" : "research_peptides_materials",
    category: "Synthetic", subcategory: null, brand: null, aliases: [],
    displayState: clinical ? "care_pathway" : "request_access",
    stateExplanation: "", copyState: "approved", visibility: "member",
    variants: [{
      id: "var-" + id, label: "Synthetic exact variant " + id,
      displayState: clinical ? "care_pathway" : "request_access",
      visibility: "member", sourceReferences: [],
    }],
    sourceReferences: [],
  };
}
export function submission(): RequestIntentInput {
  const acceptedAt = new Date(Date.now() - 60_000).toISOString();
  return {
    idempotencyKey: ATTEMPT,
    contact: {
      fullLegalName: "Synthetic Customer", email: "synthetic@example.invalid",
      mobilePhone: "+15555550123", organizationName: "Synthetic Organization",
      ageConfirmed: true, billingSameAsShipping: true,
      shippingAddress: {
        line1: "1 Synthetic Street", line2: "Synthetic Unit", city: "Test",
        region: "TX", postalCode: "00000", countryCode: "US",
      },
    },
    agreements: [
      { kind: "fixture-terms", version: "fixture-v1", accepted: true, acceptedAt },
      ...requiredAssistedOrderFormAcknowledgments({ includesResearchUseOnly: true })
        .map((ack) => ({ ...assistedOrderFormPair(ack), accepted: true as const, acceptedAt })),
    ],
    lines: [
      { productId: "product-var-1", variantId: "pc-var-1", quantity: 2 },
      { productId: "product-var-2", variantId: "pc-var-2", quantity: 100 },
    ],
  };
}

export function createDurableJourneyFixture() {
  const container = "xenios-request-intent-" + randomUUID();
  const database = "request_intent_disposable";
  const password = randomUUID(); // Ephemeral fixture credential; never a host secret.
  let created = false;
  let port = 0;
  const docker = (...args: string[]) => execFileSync("docker", args, {
    encoding: "utf8", windowsHide: true, timeout: 60_000,
    stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1024 * 1024,
  }).trim();
  async function withClient<T>(work: (client: pg.Client) => Promise<T>): Promise<T> {
    if (!created || port < 1 || port > 65535) throw new Error("Owned database not ready");
    const client = new pg.Client({
      host: "127.0.0.1", port, database, user: "postgres", password, ssl: false,
      connectionTimeoutMillis: 5_000, statement_timeout: 10_000,
      query_timeout: 12_000, application_name: "request-intent-disposable",
    });
    try {
      await client.connect();
      return await work(client);
    } finally {
      await client.end();
    }
  }
  const sql = (text: string, values: unknown[] = []) =>
    withClient((client) => client.query(text, values));
  async function asRole(role: DbRole, text: string, values: unknown[] = [], subject = "") {
    return withClient(async (client) => {
      await client.query("begin");
      try {
        // role is a closed test-only union, never HTTP input.
        await client.query("set local role " + role);
        await client.query("select set_config('request.jwt.claim.sub', $1, true)", [subject]);
        const result = await client.query(text, values);
        await client.query("commit");
        return result;
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    });
  }

  function adapter(options: { loseCreateReply?: boolean; subject?: string } = {}) {
    let loseCreateReply = options.loseCreateReply === true;
    const calls: string[] = [];
    const errors: Array<{ name: string; code?: string }> = [];
    const client: SupabaseRpcClient = {
      async rpc(name, args = {}) {
        calls.push(name);
        let text: string;
        let values: unknown[];
        switch (name) {
          case "research_rate_limit_hit":
            text = "select public.research_rate_limit_hit($1::text,$2::integer,$3::integer) as value";
            values = [args.p_key, args.p_window_seconds, args.p_max_hits];
            break;
          case "request_intent_find_attempt":
            text = "select public.request_intent_find_attempt($1::text,$2::text) as value";
            values = [args.p_owner_hash, args.p_attempt_hash];
            break;
          case "request_intent_create_or_replay":
            text = "select public.request_intent_create_or_replay($1::text,$2::text,$3::text,$4::jsonb) as value";
            // pg must receive a JSON string here, not a SQL array conversion.
            values = [args.p_owner_hash, args.p_attempt_hash, args.p_fingerprint, JSON.stringify(args.p_detail)];
            break;
          case "request_intent_staff_get":
            text = "select public.request_intent_staff_get($1::uuid,$2::uuid) as value";
            values = [args.p_request_id, args.p_actor_user_id];
            break;
          case "request_intent_staff_list":
            text = "select public.request_intent_staff_list($1::uuid,$2::integer) as value";
            values = [args.p_actor_user_id, args.p_page];
            break;
          default:
            throw new Error("Unexpected fixture RPC " + name);
        }
        let data: unknown;
        try {
          // Each RPC owns a fresh connection and commits before returning.
          const result = await asRole("service_role", text, values, options.subject);
          data = result.rows[0].value;
        } catch (error) {
          const failure = error as { code?: string; message?: string };
          errors.push({ name, code: failure.code });
          return { data: null, error: { code: failure.code, message: failure.message ?? "SQL failed" } };
        }
        if (name === "request_intent_create_or_replay" && loseCreateReply) {
          loseCreateReply = false;
          // The COMMIT and connection close above have completed. Do not roll
          // back or substitute a receipt when the transport reply is lost.
          throw new Error("synthetic reply lost after committed create");
        }
        return { data, error: null };
      },
    };
    return { client, calls, errors };
  }

  function application(rpc: SupabaseRpcClient, dependenciesClosed = false) {
    const rows = [offering(1, true), offering(2, false)];
    const select = vi.fn(async (query: { page?: number; pageSize?: number }) => {
      if (dependenciesClosed) throw new Error("Replay must not re-resolve the catalog");
      const page = query.page ?? 1, pageSize = query.pageSize ?? 100;
      return {
        offerings: rows.slice((page - 1) * pageSize, page * pageSize),
        // Price projection only; no request persistence is held in memory.
        prices: new Map(),
        page: { page, pageSize, total: rows.length },
      };
    });
    const accepted = vi.fn(async (customerRef: string) =>
      !dependenciesClosed && customerRef === guest.earlyAccessCustomerRef);
    const env: NodeJS.ProcessEnv = {
      SITE_URL: ORIGIN, RESEARCH_REQUEST_INTENT_ENABLED: "true",
      RESEARCH_REQUEST_INTENT_STAFF_READ_ENABLED: "true",
      CARE_ENABLED: "false", CARE_ENABLE_APPROVED: "false",
    };
    const wiring: AssistedOrderProductionWiring = {
      env, requiredAgreements: [{
        kind: "fixture-terms", version: dependenciesClosed ? "fixture-v2" : "fixture-v1",
      }],
      agreementGate: { accepted },
      masterOfferingServiceFor: () => ({ select }),
      bindingFor: (id) => rows.some((row) => row.variants[0].id === id)
        ? { productId: "product-" + id, variantId: "pc-" + id } : null,
      offeringVariantFor: () => null,
      catalogVersion: "synthetic-durable-v1", supabaseRpc: rpc,
      supabaseStorage: null, log: () => undefined,
    };
    const care: CareAccessDependencies = {
      loadCapabilityStatus: vi.fn(async () => ({
        rail: "care" as const, state: "disabled" as const, enabled: false,
        publicMessage: "", checkedAt: new Date().toISOString(),
      })),
      // These stand in for previously verified principals, not browser role
      // claims. Keep the operator snapshot stale for the SQL revocation probe.
      resolvePrincipal: async (req) => req.get("x-fixture-staff") === "operator"
        ? { subjectId: OPERATOR, roles: ["clinical_admin"] }
        : req.get("x-fixture-staff") === "research"
          ? { subjectId: OTHER_ACTOR, roles: ["research_admin"] } : null,
      recordAccessDecision: vi.fn(async () => undefined),
    };
    const app = express();
    app.use(express.json());
    registerRequestIntentApi(app, wiring, {
      customer: async (req) => {
        if (req.get("x-fixture-guest") === "a") return guest;
        if (req.get("x-fixture-guest") === "b") return otherGuest;
        throw new RequestIntentError("authentication_required", 401);
      },
    }, care);
    return { app, env, select, accepted, care };
  }
  const post = (app: express.Express, suffix: string, body: object, owner = "a") =>
    request(app).post(ROUTE + suffix).set("Origin", ORIGIN)
      .set("Sec-Fetch-Site", "same-origin").set("x-fixture-guest", owner).send(body);
  const staff = (app: express.Express, suffix: string, actor = "operator") =>
    request(app).get(ROUTE + "/staff" + suffix).set("x-fixture-staff", actor);
  const snapshot = async () => (await sql(
    "select * from request_intent_private.requests order by id",
  )).rows as SavedRow[];
  const counts = async () => (await sql([
    "select (select count(*)::int from request_intent_private.requests) as requests,",
    "(select count(*)::int from request_intent_private.access_events",
    " where event_type='submitted') as submitted,",
    "(select count(*)::int from request_intent_private.access_events) as events",
  ].join("\n"))).rows[0];

  async function start() {
    docker("create", "--rm", "--name", container,
      "--publish", "127.0.0.1::5432",
      "--env", "POSTGRES_PASSWORD=" + password,
      "--env", "POSTGRES_DB=" + database, "postgres:16");
    created = true;
    docker("start", container);
    const published = /^127\.0\.0\.1:(\d+)$/.exec(docker("port", container, "5432/tcp"));
    if (!published) throw new Error("Database port was not confined to literal loopback");
    port = Number(published[1]);
    // TCP avoids accepting the image's temporary Unix-socket init server.
    execFileSync("docker", ["exec", container, "sh", "-c",
      "i=0; while [ \"$i\" -lt 30 ]; do " +
      "if pg_isready -h 127.0.0.1 -p 5432 -U postgres -d request_intent_disposable >/dev/null 2>&1; " +
      "then exit 0; fi; i=$((i+1)); sleep 1; done; exit 1",
    ], { timeout: 35_000, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const version = Number((await sql("show server_version_num")).rows[0].server_version_num);
    expect(version).toBeGreaterThanOrEqual(160000);
    expect(version).toBeLessThan(170000);

    // Minimal disposable prerequisites only; no production roles are assigned.
    await sql([
      "create role anon nologin;",
      "create role authenticated nologin;",
      "create role service_role nologin noinherit bypassrls;",
      "create schema auth;",
      "create function auth.uid() returns uuid language sql stable as $$",
      " select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;",
      "create table public.care_role_assignments (user_id uuid not null, role text not null, revoked_at timestamptz);",
      "create table public.care_capabilities (capability_key text primary key, state text not null, approved_by uuid, approved_at timestamptz);",
      "grant usage on schema public,auth to anon,authenticated,service_role;",
    ].join("\n"));
    await sql("insert into public.care_role_assignments(user_id,role) values ($1::uuid,'clinical_admin'),($2::uuid,'research_admin')",
      [OPERATOR, OTHER_ACTOR]);
    await sql("insert into public.care_capabilities values ('request_intent_pending_read','enabled',$1::uuid,now()),('care','disabled',null,null)",
      [OPERATOR]);

    // Load the unchanged canonical limiter statements, not a fake allow RPC.
    // The other referral tables in that file are unrelated to this fixture.
    const referral = readFileSync(resolve(ROOT, "supabase/research-referral-fraud.sql"), "utf8");
    const rateStart = referral.indexOf("create table if not exists public.research_rate_limits (");
    const rateEnd = referral.indexOf("-- Service role only", rateStart);
    expect(rateStart).toBeGreaterThanOrEqual(0);
    expect(rateEnd).toBeGreaterThan(rateStart);
    await sql(referral.slice(rateStart, rateEnd));
    await sql([
      "alter table public.research_rate_limits enable row level security;",
      "revoke all on public.research_rate_limits from public,anon,authenticated;",
      "grant select,insert,update,delete on public.research_rate_limits to service_role;",
      "revoke all on function public.research_rate_limit_hit(text,integer,integer) from public,anon,authenticated;",
      "grant execute on function public.research_rate_limit_hit(text,integer,integer) to service_role;",
    ].join("\n"));

    const candidate = readFileSync(resolve(ROOT, "supabase/candidates/mixed_catalog_request_intent.sql"));
    expect(createHash("sha256").update(candidate).digest("hex")).toBe(CANDIDATE_SHA256);
    await sql(candidate.toString("utf8"));
  }

  async function close() {
    // Cleanup failures fail CI; never convert them into a skip/PASS.
    if (created) {
      docker("rm", "--force", container);
      created = false;
    }
  }
  return { start, close, adapter, application, post, staff, snapshot, counts, sql, asRole };
}
