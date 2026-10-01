import crypto from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Durable outbox worker tests (Mega 1 section 11): idempotent enqueue,
// exactly-once claims, retry backoff, permanent failure after the cap, and
// no token storage in the queue.
// ---------------------------------------------------------------------------

const state = vi.hoisted(() => ({
  outbox: [] as any[],
  attempts: [] as any[],
  applications: [] as any[],
  ready: false,
  rpcCalls: [] as any[],
  sendMode: "ok" as "ok" | "throw" | "false",
}));

const emails = vi.hoisted(() => ({
  sendApplicationReceived: vi.fn(async () => {
    if (state.sendMode === "throw") throw new Error("provider 500");
    return state.sendMode === "ok";
  }),
  sendStatusLink: vi.fn(async () => true),
  sendInternalApplicationAlert: vi.fn(async () => true),
  sendApplicationApproved: vi.fn(async () => true),
  sendApplicationDeclined: vi.fn(async () => true),
  sendMoreInformationRequested: vi.fn(async () => true),
  sendResubmittedConfirmation: vi.fn(async () => true),
  sendAccountClaimSuccess: vi.fn(async () => true),
  sendApprovedCustomerClaim: vi.fn(async () => ({ ok: true, id: "provider-approved-test-only" })),
  sendApprovedCustomerWelcome: vi.fn(async () => ({ ok: true, id: "provider-welcome-test-only" })),
  sendEmailFailureAlert: vi.fn(async () => ({ ok: true, id: "resend-alert-id" })),
  sendAdminTestEmail: vi.fn(async () => ({ ok: true, id: "resend-test-id" })),
}));

const resend = vi.hoisted(() => ({
  send: vi.fn(async () => ({ data: { id: "resend-product-id" }, error: null })),
}));

vi.mock("../supabase", () => {
  function query(table: string) {
    const list = table === "research_applications" ? state.applications : table === "research_notification_attempts" ? state.attempts : state.outbox;
    let mode: "select" | "insert" | "update" = "select";
    let insertPayload: any = null;
    let updatePayload: any = null;
    let selectCols: string | null = null;
    const filters: Array<[string, any]> = [];
    const lteFilters: Array<[string, any]> = [];
    const ltFilters: Array<[string, any]> = [];
    let inFilter: [string, any[]] | null = null;
    let limitN: number | null = null;
    const applyFilters = (rows: any[]) =>
      rows.filter(
        (r) =>
          filters.every(([c, v]) => r[c] === v) &&
          lteFilters.every(([c, v]) => r[c] <= v) &&
          ltFilters.every(([c, v]) => r[c] != null && r[c] < v) &&
          (!inFilter || inFilter[1].includes(r[inFilter[0]])),
      );
    const finish = () => {
      if (mode === "insert") {
        if (table === "research_notification_outbox" && insertPayload?.event_key &&
            list.some((r: any) => r.event_key === insertPayload.event_key)) {
          return { data: null, error: { message: "duplicate key value" } };
        }
        const row = {
          id: crypto.randomUUID(),
          status: "pending",
          attempt_count: 0,
          next_attempt_at: new Date(0).toISOString(),
          created_at: new Date().toISOString(),
          ...insertPayload,
        };
        list.push(row);
        return { data: row, error: null };
      }
      if (mode === "update") {
        const targets = applyFilters(list);
        // Real Supabase does not error on zero-row updates.
        if (!targets.length) return { data: null, error: null };
        for (const target of targets) Object.assign(target, updatePayload);
        return { data: targets[0], error: null };
      }
      let rows = applyFilters(list);
      if (limitN != null) rows = rows.slice(0, limitN);
      if (selectCols && selectCols !== "*") {
        const cols = selectCols.split(",").map((c) => c.trim());
        rows = rows.map((r) => Object.fromEntries(cols.filter((c) => c in r).map((c) => [c, r[c]])));
      }
      return { data: rows, error: null };
    };
    const api: any = {
      select: (cols?: string) => { if (mode === "select") selectCols = cols ?? null; return api; },
      insert: (p: any) => { mode = "insert"; insertPayload = p; return api; },
      update: (p: any) => { mode = "update"; updatePayload = p; return api; },
      eq: (c: string, v: any) => { filters.push([c, v]); return api; },
      in: (c: string, vs: any[]) => { inFilter = [c, vs]; return api; },
      lte: (c: string, v: any) => { lteFilters.push([c, v]); return api; },
      lt: (c: string, v: any) => { ltFilters.push([c, v]); return api; },
      order: () => api,
      limit: (n: number) => { limitN = n; return api; },
      maybeSingle: async () => { const r = finish(); const d = Array.isArray(r.data) ? r.data[0] ?? null : r.data; return { data: d, error: null }; },
      single: async () => {
        const r = finish();
        const d = Array.isArray(r.data) ? r.data[0] : r.data;
        return d ? { data: d, error: null } : { data: null, error: { message: "not found" } };
      },
      then: (resolve: any) => resolve(finish()),
    };
    return api;
  }
  return {
    supabaseConfigured: () => true,
    getSupabaseAdmin: () => ({ from: query, rpc: async (name: string, args: unknown) => {
      state.rpcCalls.push({ name, args }); return { data: state.ready, error: null };
    } }),
    getSupabaseAnon: () => { throw new Error("not used"); },
  };
});

vi.mock("./agreement-package-reconciliation", () => ({ runAgreementPackageReconciler: async () => undefined }));
vi.mock("../routes", () => ({ requireSupabaseAdmin: (_r: any, _s: any, next: any) => next() }));
vi.mock("./membership-emails", () => emails);
vi.mock("../services/email", () => ({
  getResendClient: async () => ({
    client: { emails: { send: resend.send } },
  }),
}));

process.env.RESEARCH_SESSION_SECRET = "test-secret-for-vitest";

import { configurePaymentEffectsRecovery, runOutboxTick } from "./outbox";

beforeEach(() => {
  state.outbox.length = 0;
  state.attempts.length = 0;
  state.applications.length = 0;
  state.rpcCalls.length = 0;
  state.ready = false;
  configurePaymentEffectsRecovery(null);
  vi.clearAllMocks();
});
const verificationId = "55555555-5555-4555-8555-555555555555";
function paymentJob(status = "pending") {
  return {
    id: "66666666-6666-4666-8666-666666666666",
    assisted_order_verification_id: verificationId,
    event_key: "assisted-order:11111111-1111-4111-8111-111111111111:payment-verification:" + verificationId,
    event_type: "assisted_order.status_changed",
    template_key: "research.assisted_order.status_changed.customer",
    recipient: "synthetic@example.invalid", status, attempt_count: 0,
    next_attempt_at: new Date(0).toISOString(), updated_at: new Date().toISOString(),
    payload: { publicReference: "XRR-20260930-ABCDEF0011", status: "paid",
      customerMessage: "Payment verified. Fulfillment is reviewed separately." },
  };
}
describe("mounted canonical outbox payment-effect recovery", () => {
  it("leaves a held payment intent unsendable without configured recovery", async () => {
    state.outbox.push(paymentJob("held"));
    expect(await runOutboxTick()).toEqual({ sent: 0, retried: 0, failed: 0 });
    expect(resend.send).not.toHaveBeenCalled();
    expect(state.rpcCalls).toHaveLength(0);
    expect(state.outbox[0].status).toBe("held");
  });
  it("recovers before claiming and independently rechecks the exact job before synthetic delivery", async () => {
    state.outbox.push(paymentJob("held"));
    const runBatch = vi.fn(async () => {
      expect(resend.send).not.toHaveBeenCalled();
      state.outbox[0].status = "pending";
      state.ready = true; // Synthetic successful canonical audit + release.
      return { completed: 1, failed: 0 };
    });
    configurePaymentEffectsRecovery({ recover: async () => undefined, runBatch });
    expect(await runOutboxTick()).toEqual({ sent: 1, retried: 0, failed: 0 });
    expect(runBatch).toHaveBeenCalledOnce();
    expect(state.rpcCalls).toEqual([{ name: "research_assisted_order_payment_effects_outbox_ready", args: {
      p_outbox_id: state.outbox[0].id, p_verification_id: verificationId,
      p_event_key: state.outbox[0].event_key, p_recipient: "synthetic@example.invalid",
      p_template_key: state.outbox[0].template_key, p_payload: state.outbox[0].payload,
    } }]);
    expect(resend.send).toHaveBeenCalledOnce();
    expect(resend.send.mock.calls[0][1]).toEqual({ idempotencyKey: state.outbox[0].event_key });
  });
  it("refuses a pending payment notice without a valid durable audit receipt", async () => {
    state.outbox.push(paymentJob());
    expect(await runOutboxTick()).toEqual({ sent: 0, retried: 1, failed: 0 });
    expect(resend.send).not.toHaveBeenCalled();
    expect(state.outbox[0].status).toBe("failed_retryable");
  });
  it("does not bypass authority for a legacy paid notice missing the new column", async () => {
    const old = paymentJob(); delete (old as any).assisted_order_verification_id;
    state.outbox.push(old);
    state.ready = true;
    expect((await runOutboxTick()).sent).toBe(0);
    expect(resend.send).not.toHaveBeenCalled();
    expect(state.rpcCalls).toHaveLength(0);
  });
  it("keeps recovery failure visible without dispatching held jobs or logging private errors", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    state.outbox.push(paymentJob("held"));
    configurePaymentEffectsRecovery({ recover: async () => undefined,
      runBatch: async () => { throw new Error("private actor and recipient"); } });
    await runOutboxTick();
    expect(log).toHaveBeenCalledWith("[outbox] verified payment effects recovery unavailable");
    expect(JSON.stringify(log.mock.calls)).not.toContain("private actor");
    expect(resend.send).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
