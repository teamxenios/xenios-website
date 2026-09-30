import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { AssistedOrderFinanceService } from "./finance";
import { createAssistedOrderRouteTable, ASSISTED_ORDER_STATUS_TOKEN_HEADER } from "./http";
import type { AssistedOrderHttpRequest } from "./http";
import type { AssistedOrderViewer } from "./ports";
import type { AssistedOrderService } from "./service";
import type { SupabaseRpcClient } from "./supabase-repository";

const REQUEST = "10000000-0000-4000-8000-000000000011";
const MEMBER = "20000000-0000-4000-8000-000000000011";
const ADMIN = "40000000-0000-4000-8000-000000000011";
const QUOTE = "50000000-0000-4000-8000-000000000011";
const OBSERVATION = "60000000-0000-4000-8000-000000000011";
const REFERENCE = "XRR-20260930-ABCDEF0011";
const quote = { requestId: REQUEST, publicReference: REFERENCE, quoteId: QUOTE,
  version: 1, totalCents: 5000, currency: "USD", state: "issued", lines: [] };

const admin: AssistedOrderViewer = {
  actorType: "admin", memberId: null, authUserId: ADMIN,
  earlyAccessSessionHash: null, normalizedEmail: "admin@example.test",
  actorLabel: "admin@example.test", capabilities: new Set(["assisted_orders:manage"]),
};
const owner: AssistedOrderViewer = {
  actorType: "member", memberId: MEMBER, authUserId: MEMBER,
  earlyAccessSessionHash: null, normalizedEmail: "owner@example.test",
  capabilities: new Set(["assisted_orders:read_own"]),
};

function harness(data: unknown = quote) {
  const rpc = vi.fn(async () => ({ data, error: null }));
  const service = new AssistedOrderFinanceService({ rpc } as SupabaseRpcClient, null);
  return { rpc, service };
}

describe("HL-12 mounted finance boundary", () => {
  it("only a guarded Auth UUID can issue a quote, with no browser total authority", async () => {
    const { rpc, service } = harness();
    await expect(service.issueQuote({ ...admin, authUserId: null }, REQUEST, {
      lineDecisions: [{ lineId: QUOTE }], validUntil: "2026-10-01T00:00:00.000Z",
    })).rejects.toHaveProperty("name", "AssistedOrderAuthorizationError");
    expect(rpc).not.toHaveBeenCalled();

    await service.issueQuote(admin, REQUEST, {
      lineDecisions: [{ lineId: QUOTE }], validUntil: "2026-10-01T00:00:00.000Z",
      totalCents: 1, actorId: "browser-actor",
    });
    expect(rpc).toHaveBeenCalledWith("research_assisted_order_quote_issue", {
      p_request_id: REQUEST,
      p_line_decisions: [{ lineId: QUOTE }],
      p_valid_until: "2026-10-01T00:00:00.000Z",
      p_actor_id: admin.actorLabel,
      p_customer_note: null,
    });
  });

  it("projects only the exact owner quote and hashes a header token", async () => {
    const { rpc, service } = harness();
    await service.getQuote(owner, REFERENCE, "status-secret");
    expect(rpc).toHaveBeenCalledWith("research_assisted_order_quote_get", {
      p_public_reference: REFERENCE,
      p_member_id: MEMBER,
      p_early_access_session_hash: null,
      p_status_token_hash: createHash("sha256").update("status-secret").digest("hex"),
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("status-secret");
    const absent = harness(null);
    await expect(absent.service.getQuote(owner, REFERENCE)).rejects.toHaveProperty(
      "name", "AssistedOrderNotFoundError",
    );
  });

  it("binds acceptance to the quote projected for the exact path", async () => {
    const { rpc, service } = harness();
    await expect(service.acceptQuote(owner, REFERENCE, {
      quoteId: "70000000-0000-4000-8000-000000000011", version: 1,
      expectedTotalCents: 5000,
    })).rejects.toHaveProperty("name", "AssistedOrderNotFoundError");
    expect(rpc).toHaveBeenCalledTimes(1);
    await expect(service.acceptQuote(owner, REFERENCE, {
      quoteId: QUOTE, version: 1, expectedTotalCents: 4999,
    })).rejects.toMatchObject({ code: "quote_stale" });
    expect(rpc).toHaveBeenCalledTimes(2);
    await service.acceptQuote(owner, REFERENCE, {
      quoteId: QUOTE, version: 1, expectedTotalCents: 5000,
    });
    expect(rpc).toHaveBeenLastCalledWith("research_assisted_order_quote_accept", {
      p_quote_id: QUOTE, p_version: 1, p_expected_total_cents: 5000,
      p_member_id: MEMBER, p_early_access_session_hash: null, p_status_token_hash: null,
    });
  });

  it("cannot record manual money from a typed reference when the ledger authority is absent", async () => {
    const { rpc, service } = harness();
    await expect(service.observeManual(admin, REQUEST, {
      quoteId: QUOTE, observedAmountCents: 5000, observedCurrency: "USD",
      paymentReference: REFERENCE, sourceEvidenceRef: "browser-proof",
    })).rejects.toMatchObject({ code: "manual_evidence_unavailable" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("requires an independent exact ledger record and uses its stable observation time", async () => {
    const rpc = vi.fn(async () => ({ data: { observationId: OBSERVATION }, error: null }));
    const evidence = { verify: vi.fn(async () => ({ observedAt: "2026-09-30T20:00:00.000Z" })) };
    const service = new AssistedOrderFinanceService({ rpc } as SupabaseRpcClient, evidence);
    await service.observeManual(admin, REQUEST, {
      quoteId: QUOTE, observedAmountCents: 5000, observedCurrency: "USD",
      paymentReference: REFERENCE, sourceEvidenceRef: "ledger:synthetic-1",
      method: "provider", actorAuthUserId: MEMBER,
    });
    expect(evidence.verify).toHaveBeenCalledWith({
      evidenceRef: "ledger:synthetic-1", requestId: REQUEST, quoteId: QUOTE,
      paymentReference: REFERENCE, observedAmountCents: 5000,
      observedCurrency: "USD", verifierAuthUserId: ADMIN,
    });
    expect(rpc).toHaveBeenCalledWith("research_assisted_order_payment_observe",
      expect.objectContaining({ p_method: "manual", p_actor_auth_user_id: ADMIN,
        p_observed_at: "2026-09-30T20:00:00.000Z", p_provider_name: null }));
  });

  it("verifies only through the request-bound RPC with the guarded admin UUID", async () => {
    const rpc = vi.fn(async () => ({ data: { verificationId: QUOTE, state: "paid" }, error: null }));
    const evidence = { verify: async () => ({ observedAt: "2026-09-30T20:00:00.000Z" }) };
    const service = new AssistedOrderFinanceService({ rpc } as SupabaseRpcClient, evidence);
    await service.verifyManual(admin, REQUEST, OBSERVATION);
    expect(rpc).toHaveBeenCalledWith("research_assisted_order_payment_verify_bound", {
      p_request_id: REQUEST, p_observation_id: OBSERVATION,
      p_verifier_auth_user_id: ADMIN,
    });
    const wrongPath = new AssistedOrderFinanceService({
      rpc: async () => ({ data: null, error: null }),
    }, evidence);
    await expect(wrongPath.verifyManual(admin, REQUEST, OBSERVATION))
      .rejects.toHaveProperty("name", "AssistedOrderNotFoundError");
    const unconfigured = harness();
    await expect(unconfigured.service.verifyManual(admin, REQUEST, OBSERVATION))
      .rejects.toMatchObject({ code: "manual_evidence_unavailable" });
    expect(unconfigured.rpc).not.toHaveBeenCalled();
  });

  it("adds five finance descriptors only when the gated service exists and keeps tokens out of body/query", async () => {
    const { service } = harness();
    const resolver = { resolve: async () => owner };
    const base = createAssistedOrderRouteTable({} as AssistedOrderService, resolver);
    const mounted = createAssistedOrderRouteTable({} as AssistedOrderService, resolver, null, service);
    expect(mounted.length - base.length).toBe(10); // five verbs plus five OPTIONS descriptors
    const route = mounted.find((entry) => entry.method === "POST" && entry.path.endsWith("/quote/accept"));
    expect(route).toBeDefined();
    const request: AssistedOrderHttpRequest = {
      method: "POST", path: route!.path, params: { publicReference: REFERENCE },
      headers: { [ASSISTED_ORDER_STATUS_TOKEN_HEADER]: "secret" }, query: {},
      body: { quoteId: QUOTE, version: 1, expectedTotalCents: 5000, token: "body-secret" },
    };
    expect((await route!.handler(request)).status).toBe(400);
    expect((await route!.handler({ ...request, body: { quoteId: QUOTE, version: 1, expectedTotalCents: 5000 }, query: { token: "query-secret" } })).status).toBe(400);
  });
});
