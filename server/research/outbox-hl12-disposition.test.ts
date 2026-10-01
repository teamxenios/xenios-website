import { beforeEach, describe, expect, it, vi } from "vitest";

// Real canonical worker/renderer/dispatch guard, with synthetic storage and
// delivery ports only. SQL atomicity and ACLs have a separate disposable proof.
const state = vi.hoisted(() => ({
  jobs: [] as Record<string, any>[], attempts: [] as Record<string, any>[],
  ready: false, rpcError: false, configured: true,
  rpcCalls: [] as { name: string; args: unknown }[],
}));
const send = vi.hoisted(() => vi.fn(async (_message: unknown, _options?: unknown) => ({ data: { id: "synthetic-only" }, error: null })));

vi.mock("../supabase", () => {
  const query = (table: string) => {
    const rows = table === "research_notification_outbox" ? state.jobs
      : table === "research_notification_attempts" ? state.attempts : [];
    const predicates: ((row: Record<string, any>) => boolean)[] = [];
    let update: Record<string, unknown> | null = null;
    let insert: Record<string, unknown> | null = null;
    let limit = Infinity;
    const finish = () => {
      if (insert) { rows.push({ ...insert }); return { data: insert, error: null }; }
      const matches = rows.filter((row) => predicates.every((predicate) => predicate(row))).slice(0, limit);
      if (update) { for (const row of matches) Object.assign(row, update); }
      return { data: matches, error: null };
    };
    const api: any = {
      select: () => api, order: () => api,
      update: (value: Record<string, unknown>) => { update = value; return api; },
      insert: (value: Record<string, unknown>) => { insert = value; return api; },
      eq: (key: string, value: unknown) => { predicates.push((row) => row[key] === value); return api; },
      in: (key: string, values: unknown[]) => { predicates.push((row) => values.includes(row[key])); return api; },
      lte: (key: string, value: string) => { predicates.push((row) => row[key] <= value); return api; },
      lt: (key: string, value: string) => { predicates.push((row) => row[key] != null && row[key] < value); return api; },
      limit: (value: number) => { limit = value; return api; },
      single: async () => ({ data: (finish().data as any[])[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: (finish().data as any[])[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) => resolve(finish()),
    };
    return api;
  };
  return {
    supabaseConfigured: () => state.configured,
    getSupabaseAdmin: () => ({ from: query, rpc: async (name: string, args: unknown) => {
      state.rpcCalls.push({ name, args });
      return { data: state.ready, error: state.rpcError ? { message: "private source error" } : null };
    } }),
    getSupabaseAnon: () => { throw new Error("No anonymous database calls in worker proof"); },
  };
});
vi.mock("./agreement-package-reconciliation", () => ({ runAgreementPackageReconciler: async () => undefined }));
vi.mock("../routes", () => ({ requireSupabaseAdmin: (_r: unknown, _s: unknown, next: () => void) => next() }));
vi.mock("./membership-emails", () => Object.fromEntries([
  "sendApplicationReceived", "sendStatusLink", "sendInternalApplicationAlert", "sendApplicationApproved",
  "sendApplicationDeclined", "sendMoreInformationRequested", "sendResubmittedConfirmation", "sendAccountClaimSuccess",
  "sendApprovedCustomerClaim", "sendApprovedCustomerWelcome", "sendEmailFailureAlert", "sendAdminTestEmail",
  "sendB2BBuyerClaim",
].map((key) => [key, vi.fn(async () => true)])));
vi.mock("../services/email", () => ({ getResendClient: async () => ({ client: { emails: { send } } }) }));

process.env.RESEARCH_SESSION_SECRET = "synthetic-disposition-worker-test-only";
import { configureDispositionEffectsRecovery, configurePaymentEffectsRecovery, runOutboxTick } from "./outbox";

const requestId = "11111111-1111-4111-8111-111111111111";
const dispositionId = "55555555-5555-4555-8555-555555555555";
const outboxId = "66666666-6666-4666-8666-666666666666";
function job(status = "pending") {
  return {
    id: outboxId, assisted_order_disposition_id: dispositionId,
    event_key: `assisted-order:${requestId}:financial-disposition:${dispositionId}`,
    event_type: "assisted_order.status_changed", template_key: "research.assisted_order.status_changed.customer",
    recipient: "synthetic@example.invalid", status, attempt_count: 0,
    next_attempt_at: new Date(0).toISOString(), updated_at: new Date().toISOString(),
    payload: { publicReference: "XRR-20261001-ABCDEF0011", status: "cancelled",
      customerMessage: "Request cancelled. No funds were received for this request." },
  };
}
beforeEach(() => {
  state.jobs.length = 0; state.attempts.length = 0; state.rpcCalls.length = 0;
  state.ready = false; state.rpcError = false; state.configured = true;
  configureDispositionEffectsRecovery(null); configurePaymentEffectsRecovery(null);
  vi.clearAllMocks();
});

describe("canonical outbox disposition effects", () => {
  it("leaves held obligations untouched when recovery is not configured", async () => {
    state.jobs.push(job("held"));
    expect(await runOutboxTick()).toEqual({ sent: 0, retried: 0, failed: 0 });
    expect(state.jobs[0].status).toBe("held");
    expect(send).not.toHaveBeenCalled();
    expect(state.rpcCalls).toEqual([]);
  });
  it("recovers before claiming and independently binds the exact delivery envelope", async () => {
    state.jobs.push(job("held"));
    const runBatch = vi.fn(async () => {
      expect(send).not.toHaveBeenCalled();
      state.jobs[0].status = "pending"; state.ready = true;
      return { completed: 1, failed: 0 };
    });
    configureDispositionEffectsRecovery({ recover: async () => undefined, runBatch });
    expect(await runOutboxTick()).toEqual({ sent: 1, retried: 0, failed: 0 });
    expect(runBatch).toHaveBeenCalledOnce();
    expect(state.rpcCalls).toEqual([{ name: "research_assisted_order_disposition_effects_outbox_ready", args: {
      p_outbox_id: outboxId, p_disposition_id: dispositionId, p_event_key: state.jobs[0].event_key,
      p_recipient: "synthetic@example.invalid", p_template_key: state.jobs[0].template_key,
      p_payload: state.jobs[0].payload,
    } }]);
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][1]).toEqual({ idempotencyKey: state.jobs[0].event_key });
    const message = send.mock.calls[0][0] as { text: string; html?: string };
    expect(message.text).toContain("Request cancelled. No funds were received for this request.");
    // Existing assisted-order messages intentionally use the plain-text port.
    expect(message.html).toBeUndefined();
    expect(message.text).not.toContain("Payment verified");
    expect(JSON.stringify(message)).not.toContain(dispositionId);
    expect((await runOutboxTick()).sent).toBe(0);
    expect(send).toHaveBeenCalledOnce();
  });
  it.each([false, true])("refuses an unreleased/failed readiness envelope (RPC error=%s)", async (rpcError) => {
    state.jobs.push(job()); state.rpcError = rpcError;
    expect(await runOutboxTick()).toEqual({ sent: 0, retried: 1, failed: 0 });
    expect(send).not.toHaveBeenCalled();
    expect(state.jobs[0].last_error_summary).toBe("financial disposition notification authority unavailable");
  });
  it("refuses a reserved event whose disposition FK was stripped", async () => {
    const stripped: Record<string, any> = job(); delete stripped.assisted_order_disposition_id;
    state.jobs.push(stripped); state.ready = true;
    expect((await runOutboxTick()).sent).toBe(0);
    expect(send).not.toHaveBeenCalled();
    expect(state.rpcCalls).toEqual([]);
  });
  it("preserves ordinary nonfinancial cancellation without requiring the new SQL RPC", async () => {
    const ordinary: Record<string, any> = job(); delete ordinary.assisted_order_disposition_id;
    ordinary.event_key = `assisted-order:${requestId}:status:cancelled:2026-10-01T00:00:00.000Z`;
    ordinary.payload.customerMessage = "This request was cancelled.";
    state.jobs.push(ordinary);
    expect((await runOutboxTick()).sent).toBe(1);
    expect(state.rpcCalls).toEqual([]);
  });
  it.each([
    "Request cancelled. No funds were received for this request.",
    "  REQUEST CANCELLED. NO FUNDS WERE RECEIVED FOR THIS REQUEST.  ",
  ])("refuses the financial claim even with its FK and reserved event key stripped: %s", async (message) => {
    const stripped: Record<string, any> = job(); delete stripped.assisted_order_disposition_id;
    stripped.event_key = `assisted-order:${requestId}:status:cancelled:2026-10-01T00:00:00.000Z`;
    stripped.payload.customerMessage = message;
    state.jobs.push(stripped); state.ready = true;
    expect((await runOutboxTick()).sent).toBe(0);
    expect(send).not.toHaveBeenCalled();
    expect(state.rpcCalls).toEqual([]);
  });
  it("does not let disposition recovery bypass the original payment guard", async () => {
    const forged = job(); forged.payload.status = "paid";
    state.jobs.push(forged); state.ready = true;
    expect((await runOutboxTick()).sent).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });
  it("sanitizes recovery faults and still runs unrelated existing recovery", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const paymentBatch = vi.fn(async () => ({ completed: 0, failed: 0 }));
    configurePaymentEffectsRecovery({ recover: async () => undefined, runBatch: paymentBatch });
    configureDispositionEffectsRecovery({ recover: async () => undefined,
      runBatch: async () => { throw new Error("private evidence/actor"); } });
    state.jobs.push(job("held"));
    await runOutboxTick();
    expect(paymentBatch).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith("[outbox] financial disposition effects recovery unavailable");
    expect(JSON.stringify(log.mock.calls)).not.toContain("private evidence");
    expect(send).not.toHaveBeenCalled();
    log.mockRestore();
  });
  it("does not invoke storage or recovery when storage is unconfigured", async () => {
    state.configured = false;
    const runBatch = vi.fn(async () => ({ completed: 0, failed: 0 }));
    configureDispositionEffectsRecovery({ recover: async () => undefined, runBatch });
    await runOutboxTick();
    expect(runBatch).not.toHaveBeenCalled();
    expect(state.rpcCalls).toEqual([]);
  });
});
