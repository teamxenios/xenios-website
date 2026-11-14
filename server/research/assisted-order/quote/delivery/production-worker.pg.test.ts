import { execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { readFileSync } from "node:fs";
import express from "express";
import type { Pool } from "pg";
import request from "supertest";
import { expect, vi } from "vitest";
import { createDurableJourneyFixture, OPERATOR, pg16It, submission } from "../../request-intent/durable-journey.pg.fixture";
import { requestIntentQuoteOwnerReader } from "../../request-intent/quote-owner-reader";
import { requestIntentQuoteRequestReader, requestIntentStaffReader } from "../../request-intent/rpc-repository";
import { registerPrivateQuoteDispatch, runOutboxTick } from "../../../outbox";
import { AssistedOrderQuoteService } from "../service";
import { bindReviewedXriQuoteLines } from "../xri-line-bindings";
import { attachApprovedPrivateQuotes } from "./compose.mjs";
import { pgTransactions } from "./pg.mjs";
import { createProductionQuoteAuthority, memberOwnerHash, PRODUCTION_QUOTE_SELLER, productionQuoteLineId } from "./production-portal";
import { PRODUCTION_QUOTE_ORIGIN, PRODUCTION_QUOTE_TENANT } from "./production";

const state = vi.hoisted(() => ({ admin: null as SupabaseClient | null }));
vi.mock("../../../../supabase", () => ({
  getSupabaseAdmin: () => {
    if (!state.admin) throw new Error("Owned PostgREST client not ready");
    return state.admin;
  },
  supabaseConfigured: () => true,
}));
vi.mock("../../../agreement-package-reconciliation", () => ({ runAgreementPackageReconciler: vi.fn() }));
vi.mock("../../../../routes", () => ({ requireSupabaseAdmin: vi.fn() }));

const POSTGREST = "postgrest/postgrest:v14.18@sha256:c7cd7e265a85b05248abf53f4473fcec7e327c282d0bd0cf60f1551996d09fcf";
const docker = (...args: string[]) => execFileSync("docker", args, {
  encoding: "utf8", windowsHide: true, timeout: 60_000, stdio: ["ignore", "pipe", "pipe"],
}).trim();

function testToken(secret: string, claims: Record<string, string>) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const body = encode({ alg: "HS256", typ: "JWT" }) + "." + encode(claims);
  return body + "." + createHmac("sha256", secret).update(body).digest("base64url");
}

async function openRest(name: string, network: string, dbName: string, password: string, secret: string) {
  docker("run", "--detach", "--rm", "--name", name, "--network", network,
    "--publish", "127.0.0.1::3000",
    "--env", "PGRST_DB_URI=postgres://fixture_rest:" + password + "@" + dbName + ":5432/request_intent_disposable",
    "--env", "PGRST_DB_SCHEMAS=public", "--env", "PGRST_DB_ANON_ROLE=anon", "--env", "PGRST_JWT_SECRET=" + secret, POSTGREST);
  const match = /^127\.0\.0\.1:(\d+)$/.exec(docker("port", name, "3000/tcp"));
  if (!match) throw new Error("PostgREST port was not confined to literal loopback");
  const origin = "http://127.0.0.1:" + match[1];
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const ready = await fetch(origin, { signal: AbortSignal.timeout(1_000) });
      if (ready.ok) return origin;
    } catch { /* The fresh service may still be connecting to PostgreSQL. */ }
    await delay(250);
  }
  throw new Error("Owned PostgREST service did not become ready");
}

function restClient(origin: string, key: string): SupabaseClient {
  // Bare PostgREST has no Supabase gateway, so strip only the SDK REST prefix.
  // Refuse every other request and destination in this synthetic rehearsal.
  return createClient(origin, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
    global: { fetch: (input, init) => {
      const url = new URL(String(input));
      if (url.origin !== origin || !url.pathname.startsWith("/rest/v1/")) throw new Error("Unexpected fixture request");
      url.pathname = url.pathname.slice("/rest/v1".length);
      return fetch(url, init);
    } },
  });
}

pg16It("claims an issued quote through the real worker and dispatches once through the audited reader", async () => {
  const db = createDurableJourneyFixture();
  const password = randomUUID();
  const requestId = randomUUID();
  const memberId = randomUUID();
  const authId = randomUUID();
  const recipient = "member@example.invalid";
  const issuerEmail = "staff@example.invalid";
  const customerRef = "eac_" + "a".repeat(32);
  const ownerHash = memberOwnerHash(authId);
  const network = "xenios-quote-network-" + randomUUID();
  const rest = "xenios-quote-rest-" + randomUUID();
  const restPassword = randomUUID();
  const secret = randomUUID() + randomUUID();
  let networkCreated = false;
  let pool: Pool | undefined;
  try {
    await db.start({ dockerOnly: true });
    await db.sql(readFileSync("supabase/research-notification-outbox.sql", "utf8"));
    for (const file of [
      "20261114025655_early_access_contact_and_private_quote_schema.sql",
      "20261114033000_early_access_quote_request_ownership.sql",
      "20261114043300_early_access_quote_request_audit.sql",
    ]) await db.sql(readFileSync("supabase/migrations/" + file, "utf8"));
    await db.sql(readFileSync("supabase/production/early-access-quote-runtime-review.sql", "utf8"));
    expect((await db.sql("SELECT rolcanlogin FROM pg_roles WHERE rolname='ea_quote_login'")).rows)
      .toEqual([{ rolcanlogin: false }]);
    await db.sql([
      "CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid $$;",
      "GRANT SELECT, UPDATE ON public.research_notification_outbox TO service_role;",
      "GRANT INSERT ON public.research_notification_attempts TO service_role;",
      "CREATE ROLE fixture_rest LOGIN NOINHERIT PASSWORD '" + restPassword + "';",
      "GRANT anon, authenticated, service_role TO fixture_rest WITH SET TRUE, INHERIT FALSE, ADMIN FALSE;",
      `ALTER ROLE ea_quote_login LOGIN PASSWORD '${password}';`,
    ].join("\n"));
    const input = submission();
    const terms = { kind: "early_access_terms", version: "v2" };
    const line = {
      productId: "fixture-product", variantId: "fixture-variant", sourceVariantId: "fixture-source",
      productName: "Synthetic quote item", specification: "Fixture variant",
      family: "research_peptides_materials", workflowMode: "request_pricing", quantity: 2,
      researchUseOnly: true, clinicalReviewRequired: false, sourceDisplayState: "request_access",
      sourceVariantDisplayState: "request_access", sourceRefusal: null, catalogVersion: "fixture-v1", reviewState: "pending",
    };
    await db.sql(
      "INSERT INTO request_intent_private.requests (id,public_reference,owner_hash,attempt_hash,fingerprint,contact,agreements,lines) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [requestId, "XRI-" + requestId.replace(/-/g, "").toUpperCase(), ownerHash, "a".repeat(64), "b".repeat(64),
        JSON.stringify({ ...input.contact, email: recipient, billingAddress: input.contact.shippingAddress }),
        JSON.stringify([{ ...input.agreements[0], ...terms }, ...input.agreements.slice(1)]), JSON.stringify([line])],
    );
    const dbName = db.ownedDockerContainer();
    docker("network", "create", network);
    networkCreated = true;
    docker("network", "connect", network, dbName);
    const origin = await openRest(rest, network, dbName, restPassword, secret);
    const rpc = restClient(origin, testToken(secret, { role: "service_role" }));
    state.admin = rpc;
    const denied = await restClient(origin, testToken(secret, { role: "authenticated", sub: authId }))
      .rpc("request_intent_quote_read", { p_request_id: requestId, p_owner_hash: ownerHash, p_quote_id: null });
    expect(denied.error?.code).toBe("42501");
    const quoteRequests = requestIntentQuoteRequestReader(rpc);
    const authority = createProductionQuoteAuthority({
      tenant: PRODUCTION_QUOTE_TENANT, issuerId: OPERATOR, adminEmail: issuerEmail, deliveryEnabled: true,
      requiredAgreements: [terms], agreementGate: { accepted: async (ref) => ref === customerRef },
      verifyAccount: async (id) => id === OPERATOR
        ? { email: issuerEmail, confirmedAt: "2026-01-01T00:00:00Z" }
        : id === authId ? { email: recipient, confirmedAt: "2026-01-01T00:00:00Z" } : null,
      owners: requestIntentQuoteOwnerReader(rpc), staffReader: requestIntentStaffReader(rpc),
      directories: {
        membersByEmail: async (email) => email === recipient ? [{ id: memberId, email, authUserId: authId, status: "active" }] : [],
        bindings: {
          customerRefsForHistory: async () => ({ refs: [customerRef], complete: true }),
          forCustomer: async () => ({ ok: true, binding: { memberId } }),
        },
        clearance: { cleared: async (scope) => ({ ...scope, approvalEvidenceId: "fixture-price", unitPriceCents: 1275, currency: "USD" }) },
        quoteRequests,
      },
    });
    const send = vi.fn(async () => "fixture-provider-message");
    const app = express();
    app.use(express.json());
    pool = db.poolForLogin("ea_quote_login", password);
    const asRuntime = pgTransactions(pool, { runtimeRole: "production" });
    await expect(pool.query("SELECT id FROM quote_delivery_private.qd_quotes")).rejects.toMatchObject({ code: "42501" });
    await expect(asRuntime(PRODUCTION_QUOTE_TENANT, requestId, (q) =>
      q("SELECT recipient FROM public.research_notification_outbox"))).rejects.toMatchObject({ code: "42501" });
    await expect(asRuntime(PRODUCTION_QUOTE_TENANT, requestId, (q) =>
      q("INSERT INTO public.research_notification_outbox(event_key,event_type,template_key,recipient,payload) VALUES($1,$2,$2,$3,$4)",
        ["qd-" + "0".repeat(64), "ea_private_quote_notice_v1", recipient, JSON.stringify({
          tenant: PRODUCTION_QUOTE_TENANT, xriId: requestId, quoteId: randomUUID(), extra: "denied",
        })]))).rejects.toMatchObject({ code: "42501" });
    await expect(asRuntime("ea-staging", requestId, (q) =>
      q("INSERT INTO qd_directory(tenant,target_id,xri_id,seller) VALUES($1,$2,$3,$4)",
        ["ea-staging", "fixture-stage", requestId, PRODUCTION_QUOTE_SELLER]))).rejects.toMatchObject({ code: "42501" });
    attachApprovedPrivateQuotes({
      enabled: true, router: app, pool, authority: authority.authority, runtimeRole: "production",
      assumeStagingRuntimeRole: false, stageDispatchPaused: false, deferStagingNotice: false,
      Engine: AssistedOrderQuoteService, bind: bindReviewedXriQuoteLines,
      transport: { ready: () => true, send }, tagKey: Buffer.alloc(32, 1),
      customerPrincipal: async () => null, ownedRequests: async () => [],
      staffPrincipal: async () => ({ tenant: PRODUCTION_QUOTE_TENANT, subject: OPERATOR, capabilities: new Set(["assisted_orders:manage"]) }),
      staffGuard: (req, res, next) => { if (req.get("x-fixture-staff") === "operator") next(); else res.sendStatus(401); },
      csrfChecked: async (req) => req.get("origin") === PRODUCTION_QUOTE_ORIGIN,
      issueInput: async (req) => authority.issueInput(req.body),
      registerPrivateQuoteDispatch,
    });
    const body = {
      xriId: requestId, attempt: randomUUID(), expectedVersion: 0, validUntil: new Date(Date.now() + 3_600_000).toISOString(),
      lines: [{ requestLineId: productionQuoteLineId(requestId, line.productId, line.variantId) }],
    };
    const issue = () => request(app).post("/api/staff/early-access/private-quotes/issue")
      .set("x-fixture-staff", "operator").set("Origin", PRODUCTION_QUOTE_ORIGIN).send(body);
    const first = await issue().expect(201);
    const quoteId: string = first.body.quoteId;
    await issue().expect(200, { quoteId, replay: true });
    expect(await quoteRequests.forDispatch(requestId, quoteId)).toBeNull();
    expect(send).not.toHaveBeenCalled();

    expect(await runOutboxTick()).toEqual({ sent: 1, retried: 0, failed: 0 });
    expect(await runOutboxTick()).toEqual({ sent: 0, retried: 0, failed: 0 });
    expect(send).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/^qd-[0-9a-f]{64}$/), recipient);
    expect((await db.sql("SELECT status,attempt_count,provider_message_id FROM public.research_notification_outbox")).rows)
      .toEqual([{ status: "sent", attempt_count: 1, provider_message_id: "fixture-provider-message" }]);
    expect((await db.sql("SELECT state,provider_id FROM quote_delivery_private.qd_notification_intents")).rows)
      .toEqual([{ state: "accepted", provider_id: "fixture-provider-message" }]);
    expect((await db.sql("SELECT outcome,attempt FROM public.research_notification_attempts")).rows)
      .toEqual([{ outcome: "sent", attempt: 1 }]);
    expect((await db.sql("SELECT actor_user_id FROM request_intent_private.access_events WHERE event_type='quote_dispatch_read'")).rows)
      .toEqual([{ actor_user_id: null }]);
  } finally {
    state.admin = null;
    try {
      await pool?.end();
    } finally {
      try {
        if (docker("ps", "-aq", "--filter", "name=^/" + rest + "$")) docker("rm", "--force", rest);
      } finally {
        try { await db.close(); } finally { if (networkCreated) docker("network", "rm", network); }
      }
    }
  }
}, 180_000);
