import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import express from "express";
import type { Pool } from "pg";
import request from "supertest";
import { expect, vi } from "vitest";
import { createDurableJourneyFixture, OPERATOR, pg16It, submission } from "../../request-intent/durable-journey.pg.fixture";
import { requestIntentQuoteOwnerReader } from "../../request-intent/quote-owner-reader";
import { requestIntentQuoteRequestReader, requestIntentStaffReader, type RequestIntentRpcClient } from "../../request-intent/rpc-repository";
import { registerPrivateQuoteDispatch, runOutboxTick } from "../../../outbox";
import { AssistedOrderQuoteService } from "../service";
import { bindReviewedXriQuoteLines } from "../xri-line-bindings";
import { attachApprovedPrivateQuotes } from "./compose.mjs";
import { createProductionQuoteAuthority, memberOwnerHash, PRODUCTION_QUOTE_SELLER, productionQuoteLineId } from "./production-portal";
import { PRODUCTION_QUOTE_ORIGIN, PRODUCTION_QUOTE_TENANT } from "./production";

const client = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("../../../../supabase", () => ({
  getSupabaseAdmin: () => client,
  supabaseConfigured: () => true,
}));
vi.mock("../../../agreement-package-reconciliation", () => ({ runAgreementPackageReconciler: vi.fn() }));
vi.mock("../../../../routes", () => ({ requireSupabaseAdmin: vi.fn() }));

type Database = ReturnType<typeof createDurableJourneyFixture>;
const OUTBOX = "research_notification_outbox";
const ATTEMPTS = "research_notification_attempts";

// Translate the worker's PostgREST calls to committed queries against the
// disposable database. The mail transport and account facts are synthetic.
function connectWorker(db: Database) {
  client.from.mockImplementation((table: string) => {
    if (table === ATTEMPTS) {
      return { insert: ({ outbox_id, attempt, outcome, error_summary }: Record<string, unknown>) =>
        db.sql("INSERT INTO public.research_notification_attempts (outbox_id,attempt,outcome,error_summary) VALUES ($1,$2,$3,$4)",
          [outbox_id, attempt, outcome, error_summary]) };
    }
    if (table !== OUTBOX) throw new Error("Unexpected worker table");
    return {
      select: () => ({
        eq: (key: string, status: string) => ({
          lt: (column: string, cutoff: string) => ({
            limit: async (limit: number) => {
              expect([key, column]).toEqual(["status", "updated_at"]);
              return { data: (await db.sql(
                "SELECT * FROM public.research_notification_outbox WHERE status=$1 AND updated_at<$2 LIMIT $3", [status, cutoff, limit])).rows, error: null };
            },
          }),
        }),
        in: (key: string, statuses: string[]) => ({
          lte: (column: string, now: string) => ({
            limit: async (limit: number) => {
              expect([key, column]).toEqual(["status", "next_attempt_at"]);
              return { data: (await db.sql(
                "SELECT * FROM public.research_notification_outbox WHERE status=ANY($1) AND next_attempt_at<=$2 LIMIT $3", [statuses, now, limit])).rows, error: null };
            },
          }),
        }),
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: (column: string, id: string) => {
          expect(column).toBe("id");
          if (patch.status !== "processing") {
            expect(patch.status).toBe("sent");
            return db.sql(
              "UPDATE public.research_notification_outbox SET status=$1,attempt_count=$2,last_attempt_at=$3,provider_message_id=$4,completed_at=$5,updated_at=$6 WHERE id=$7",
              [patch.status, patch.attempt_count, patch.last_attempt_at, patch.provider_message_id, patch.completed_at, patch.updated_at, id]);
          }
          return { eq: (statusColumn: string, status: string) => ({
            select: () => ({
              single: async () => {
                expect(statusColumn).toBe("status");
                return { data: (await db.sql(
                  "UPDATE public.research_notification_outbox SET status=$1,updated_at=$2 WHERE id=$3 AND status=$4 RETURNING *",
                  [patch.status, patch.updated_at, id, status])).rows[0] ?? null };
              },
            }),
          }) };
        },
      }),
    };
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
  let pool: Pool | undefined;
  try {
    await db.start();
    await db.sql(readFileSync("supabase/research-notification-outbox.sql", "utf8"));
    for (const file of [
      "20261114025655_early_access_contact_and_private_quote_schema.sql",
      "20261114033000_early_access_quote_request_ownership.sql",
      "20261114043300_early_access_quote_request_audit.sql",
    ]) await db.sql(readFileSync("supabase/migrations/" + file, "utf8"));
    await db.sql([
      "CREATE ROLE ea_quote_runtime NOLOGIN NOINHERIT;",
      `CREATE ROLE ea_quote_login LOGIN NOINHERIT PASSWORD '${password}';`,
      "GRANT ea_quote_runtime TO ea_quote_login WITH SET TRUE, INHERIT FALSE, ADMIN FALSE;",
      "GRANT USAGE ON SCHEMA quote_delivery_private TO ea_quote_runtime;",
      "GRANT SELECT, INSERT ON quote_delivery_private.qd_quotes, quote_delivery_private.qd_attempts, quote_delivery_private.qd_notification_intents, quote_delivery_private.qd_audits, quote_delivery_private.qd_directory TO ea_quote_runtime;",
      "GRANT UPDATE(state) ON quote_delivery_private.qd_quotes TO ea_quote_runtime;",
      "GRANT UPDATE(state,provider_id) ON quote_delivery_private.qd_notification_intents TO ea_quote_runtime;",
      "GRANT INSERT(event_key,event_type,template_key,recipient,payload), SELECT(event_key) ON public.research_notification_outbox TO ea_quote_runtime;",
      "CREATE POLICY fixture_quote_insert ON public.research_notification_outbox FOR INSERT TO ea_quote_runtime WITH CHECK (event_type='ea_private_quote_notice_v1' AND payload->>'tenant'='ea-production');",
      "CREATE POLICY fixture_quote_return ON public.research_notification_outbox FOR SELECT TO ea_quote_runtime USING (event_type='ea_private_quote_notice_v1' AND payload->>'tenant'='ea-production');",
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
    const staffRpc = db.adapter().client;
    const rpc: RequestIntentRpcClient = {
      async rpc(name, args) {
        if (name !== "request_intent_owned_ids" && name !== "request_intent_quote_read") return staffRpc.rpc(name, args);
        const lookup = name === "request_intent_owned_ids";
        const result = await db.asRole("service_role", lookup
          ? "SELECT public.request_intent_owned_ids($1::text,$2::uuid,$3::uuid) AS value"
          : "SELECT public.request_intent_quote_read($1::uuid,$2::text,$3::uuid) AS value", lookup
          ? [args.p_owner_hash, args.p_request_id, args.p_after_id]
          : [args.p_request_id, args.p_owner_hash, args.p_quote_id]);
        return { data: result.rows[0].value, error: null };
      },
    };
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
    connectWorker(db);
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
    try { await pool?.end(); } finally { await db.close(); }
  }
}, 180_000);
