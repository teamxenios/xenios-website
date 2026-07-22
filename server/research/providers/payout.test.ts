import crypto from "crypto";
import { describe, expect, it, afterEach } from "vitest";
import {
  DisabledPayoutProvider,
  MINIMUM_PAYOUT_CENTS,
  RealPayoutAdapter,
  TestPayoutProvider,
  buildBatch,
  canMarkPaid,
  eligibleForPayout,
  isValidPayoutAccountReference,
  mapPayoutFailure,
  isValidPayoutId,
  payoutsEmergencyDisabled,
  proofSettlesEntry,
  resolvePayoutProvider,
  validatePayoutConfig,
  type CreatePayoutBatchInput,
  type PayoutAuditEvent,
  type PayoutBatchEntry,
  type PayoutProviderRequest,
  type PayoutProviderResponse,
  type PayoutTransport,
  type RealPayoutConfig,
} from "./payout";

const baseInput = {
  batchId: "batch_1",
  partnerId: "prt_1",
  amountCents: 12500,
  currency: "usd" as const,
  idempotencyKey: "key_1",
  ledgerEntryIds: ["led_1"],
};

const ASOF = new Date("2026-03-01T00:00:00.000Z");
const NOW_MS = ASOF.getTime();
const WEBHOOK_SECRET = "whsec_test";

// ---------------------------------------------------------------------------
// Real adapter harness: an injected transport, a fixed clock, a captured audit
// ---------------------------------------------------------------------------

function providerPayoutBody(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "po_1",
    status: "paid",
    amount: 12500,
    currency: "usd",
    // The provider echoes the metadata the adapter sent, including the
    // settlement set the payment covers (how a proof binds to its entries).
    metadata: { batchId: "batch_1", partnerId: "prt_1", ledgerEntryIds: "led_1" },
    ...over,
  };
}

interface Harness {
  adapter: RealPayoutAdapter;
  requests: PayoutProviderRequest[];
  auditEvents: PayoutAuditEvent[];
}

function harness(
  respond: (request: PayoutProviderRequest) => PayoutProviderResponse = () => ({
    status: 200,
    body: providerPayoutBody(),
  }),
  configOver: Partial<RealPayoutConfig> = {},
): Harness {
  const requests: PayoutProviderRequest[] = [];
  const auditEvents: PayoutAuditEvent[] = [];
  const transport: PayoutTransport = async (request) => {
    requests.push(request);
    return respond(request);
  };
  const adapter = new RealPayoutAdapter({
    apiKey: "payout_key",
    webhookSecret: WEBHOOK_SECRET,
    apiBase: "https://payouts.example",
    transport,
    now: () => NOW_MS,
    emergencyDisabled: () => false,
    audit: (event) => auditEvents.push(event),
    ...configOver,
  });
  return { adapter, requests, auditEvents };
}

const realCreateInput = {
  ...baseInput,
  payoutAccountReference: "acct_partner_1",
  approvedBy: "samuel",
};

function batchInput(over: Partial<CreatePayoutBatchInput> = {}): CreatePayoutBatchInput {
  return {
    batchId: "batch_1",
    approvedBy: "samuel",
    items: [
      {
        partnerId: "prt_1",
        payoutAccountReference: "acct_partner_1",
        amountCents: 12500,
        currency: "usd" as const,
        ledgerEntryIds: ["led_1"],
      },
    ],
    ...over,
  };
}

function signedHeader(rawBody: string, atSeconds: number = NOW_MS / 1000): string {
  const hmac = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(`${atSeconds}.${rawBody}`)
    .digest("hex");
  return `t=${atSeconds},v1=${hmac}`;
}

function entry(over: Partial<PayoutBatchEntry> = {}): PayoutBatchEntry {
  return {
    ledgerId: "led_1",
    partnerId: "prt_1",
    partnerState: "active",
    taxStatus: "verified",
    payoutMethodStatus: "verified",
    commissionState: "payable",
    amountCents: 9000,
    payableAt: "2026-02-01T00:00:00.000Z",
    underDispute: false,
    onHold: false,
    ...over,
  };
}

describe("DisabledPayoutProvider (the production default)", () => {
  const p = new DisabledPayoutProvider();

  it("refuses every operation with a structured DISABLED result, never a throw", async () => {
    for (const result of [
      await p.createPayout(),
      await p.getPayout(),
      await p.cancelPayout(),
      await p.verifyWebhook(),
    ]) {
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("DISABLED");
        expect(result.retryable).toBe(false);
      }
    }
  });
});

describe("TestPayoutProvider", () => {
  it("creates a payout and returns a provider reference", async () => {
    const p = new TestPayoutProvider();
    const r = await p.createPayout(baseInput);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.status).toBe("paid");
      expect(r.value.providerReference).toBeTruthy();
    }
  });

  it("rejects a non-positive or non-integer amount", async () => {
    const p = new TestPayoutProvider();
    expect((await p.createPayout({ ...baseInput, amountCents: 0 })).ok).toBe(false);
    expect((await p.createPayout({ ...baseInput, amountCents: -1, idempotencyKey: "k2" })).ok).toBe(false);
    expect((await p.createPayout({ ...baseInput, amountCents: 10.5, idempotencyKey: "k3" })).ok).toBe(false);
  });

  it("refuses a payout that settles no ledger entry", async () => {
    const p = new TestPayoutProvider();
    const r = await p.createPayout({ ...baseInput, ledgerEntryIds: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("MISCONFIGURED");
  });

  // Idempotency: the classic double-pay bug.
  it("returns the same payout for a repeated idempotency key", async () => {
    const p = new TestPayoutProvider();
    const a = await p.createPayout(baseInput);
    const b = await p.createPayout(baseInput);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(b.value.providerReference).toBe(a.value.providerReference);
    }
  });

  it("refuses a second payout for the same partner in one batch even with a fresh key", async () => {
    const p = new TestPayoutProvider();
    expect((await p.createPayout(baseInput)).ok).toBe(true);
    const dup = await p.createPayout({ ...baseInput, idempotencyKey: "key_2" });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.message).toContain("already has a payout");
  });

  it("creates a distinct payout for the same partner in a different batch", async () => {
    const p = new TestPayoutProvider();
    const a = await p.createPayout(baseInput);
    const b = await p.createPayout({ ...baseInput, batchId: "batch_2", idempotencyKey: "key_2" });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(b.value.providerReference).not.toBe(a.value.providerReference);
  });

  it("retrieves a created payout and refuses an unknown reference", async () => {
    const p = new TestPayoutProvider();
    const created = await p.createPayout(baseInput);
    if (!created.ok) throw new Error("setup failed");
    expect((await p.getPayout(created.value.providerReference)).ok).toBe(true);
    expect((await p.getPayout("nope")).ok).toBe(false);
  });

  it("refuses to cancel a paid payout", async () => {
    const p = new TestPayoutProvider();
    const created = await p.createPayout(baseInput);
    if (!created.ok) throw new Error("setup failed");
    const r = await p.cancelPayout(created.value.providerReference);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("Cannot cancel a paid payout");
  });

  describe("webhook verification", () => {
    it("rejects a missing or wrong signature", async () => {
      const p = new TestPayoutProvider();
      const body = JSON.stringify({ id: "evt_1", type: "payout.paid" });
      expect((await p.verifyWebhook(body, undefined)).ok).toBe(false);
      expect((await p.verifyWebhook(body, "wrong")).ok).toBe(false);
    });

    it("rejects a malformed body and a body missing id or type", async () => {
      const p = new TestPayoutProvider();
      expect((await p.verifyWebhook("{not json", "test-signature")).ok).toBe(false);
      expect((await p.verifyWebhook(JSON.stringify({ id: "e" }), "test-signature")).ok).toBe(false);
    });

    it("accepts a well formed signed event and rejects a replay", async () => {
      const p = new TestPayoutProvider();
      const body = JSON.stringify({ id: "evt_dup", type: "payout.paid", providerReference: "x" });
      const first = await p.verifyWebhook(body, "test-signature");
      expect(first.ok).toBe(true);
      if (first.ok) expect(first.value.verified).toBe(true);
      const replay = await p.verifyWebhook(body, "test-signature");
      expect(replay.ok).toBe(false);
      if (!replay.ok) expect(replay.message).toContain("Duplicate");
    });
  });
});

describe("RealPayoutAdapter construction", () => {
  it("refuses to construct without a complete configuration", () => {
    expect(
      () => new RealPayoutAdapter({ apiKey: "", webhookSecret: "s", apiBase: "https://x" }),
    ).toThrow(/resolvePayoutProvider/);
    expect(
      () => new RealPayoutAdapter({ apiKey: "k", webhookSecret: "", apiBase: "https://x" }),
    ).toThrow(/resolvePayoutProvider/);
    expect(() => new RealPayoutAdapter({ apiKey: "k", webhookSecret: "s", apiBase: "" })).toThrow(
      /resolvePayoutProvider/,
    );
  });

  it("declares the credential names it will need, without any values", () => {
    expect(RealPayoutAdapter.requiredEnvironmentVariables).toEqual([
      "PAYOUT_PROVIDER",
      "PAYOUT_API_KEY",
      "PAYOUT_WEBHOOK_SECRET",
      "PAYOUT_API_BASE",
    ]);
  });
});

describe("validatePayoutConfig", () => {
  it("reports what is missing by variable NAME only, never a value", () => {
    const r = validatePayoutConfig({} as NodeJS.ProcessEnv);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.missingEnvironmentVariables).toEqual([
        "PAYOUT_API_KEY",
        "PAYOUT_WEBHOOK_SECRET",
        "PAYOUT_API_BASE",
      ]);
    }
  });

  it("lists only the absent names from a partial environment, never a value", () => {
    const r = validatePayoutConfig({ PAYOUT_API_KEY: "sk_live_secret_value" } as NodeJS.ProcessEnv);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.missingEnvironmentVariables).toEqual(["PAYOUT_WEBHOOK_SECRET", "PAYOUT_API_BASE"]);
      expect(JSON.stringify(r)).not.toContain("sk_live_secret_value");
    }
  });

  it("passes a complete environment through", () => {
    const r = validatePayoutConfig({
      PAYOUT_API_KEY: "k",
      PAYOUT_WEBHOOK_SECRET: "s",
      PAYOUT_API_BASE: "https://payouts.example",
    } as NodeJS.ProcessEnv);
    expect(r.ok).toBe(true);
  });
});

describe("isValidPayoutAccountReference", () => {
  it("accepts a provider-issued token shape", () => {
    expect(isValidPayoutAccountReference("acct_partner_1")).toBe(true);
    expect(isValidPayoutAccountReference("ACCT-42")).toBe(true);
  });

  it("refuses empties, whitespace, non-strings, and secret-length blobs", () => {
    expect(isValidPayoutAccountReference("")).toBe(false);
    expect(isValidPayoutAccountReference("ab")).toBe(false);
    expect(isValidPayoutAccountReference("has space")).toBe(false);
    expect(isValidPayoutAccountReference("acct\nnewline")).toBe(false);
    expect(isValidPayoutAccountReference(undefined)).toBe(false);
    expect(isValidPayoutAccountReference(42)).toBe(false);
    expect(isValidPayoutAccountReference("x".repeat(80))).toBe(false);
  });
});

describe("RealPayoutAdapter createPayout", () => {
  // The approval doctrine: model output or a scheduler never authorizes money.
  it("refuses a payout without a named approving admin, before any request is sent", async () => {
    const h = harness();
    const r = await h.adapter.createPayout({ ...realCreateInput, approvedBy: undefined });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("REJECTED");
      expect(r.message).toContain("approvedBy");
    }
    expect(h.requests).toHaveLength(0);
    expect(h.auditEvents.map((e) => e.type)).toEqual(["payout_item_refused"]);
  });

  it("refuses a blank approvedBy the same way", async () => {
    const h = harness();
    const r = await h.adapter.createPayout({ ...realCreateInput, approvedBy: "   " });
    expect(r.ok).toBe(false);
    expect(h.requests).toHaveLength(0);
  });

  it("refuses a missing or malformed payout account reference", async () => {
    const h = harness();
    for (const bad of [undefined, "", "has space"]) {
      const r = await h.adapter.createPayout({ ...realCreateInput, payoutAccountReference: bad });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toContain("account reference");
    }
    expect(h.requests).toHaveLength(0);
  });

  // The hold: the ledger enforced it upstream; the adapter double-checks.
  it("refuses an item whose hold has not elapsed", async () => {
    const h = harness();
    const r = await h.adapter.createPayout({
      ...realCreateInput,
      holdUntil: "2026-04-01T00:00:00.000Z",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("hold");
    expect(h.requests).toHaveLength(0);
  });

  it("refuses an unparseable hold rather than paying through it", async () => {
    const h = harness();
    const r = await h.adapter.createPayout({ ...realCreateInput, holdUntil: "not-a-date" });
    expect(r.ok).toBe(false);
    expect(h.requests).toHaveLength(0);
  });

  it("pays an item whose hold elapsed exactly at now", async () => {
    const h = harness();
    const r = await h.adapter.createPayout({ ...realCreateInput, holdUntil: ASOF.toISOString() });
    expect(r.ok).toBe(true);
  });

  it("refuses a non-positive, non-integer amount and an empty ledger set", async () => {
    const h = harness();
    expect((await h.adapter.createPayout({ ...realCreateInput, amountCents: 0 })).ok).toBe(false);
    expect((await h.adapter.createPayout({ ...realCreateInput, amountCents: 10.5 })).ok).toBe(false);
    expect((await h.adapter.createPayout({ ...realCreateInput, ledgerEntryIds: [] })).ok).toBe(false);
    expect(h.requests).toHaveLength(0);
  });

  it("sends the caller's idempotency key and maps a paid response to a markable record", async () => {
    const h = harness();
    const r = await h.adapter.createPayout(realCreateInput);
    expect(r.ok).toBe(true);
    expect(canMarkPaid(r)).toBe(true);
    // The record binds back to exactly the entries this payment settled.
    if (r.ok) expect(r.value.ledgerEntryIds).toEqual(["led_1"]);
    expect(h.requests).toHaveLength(1);
    expect(h.requests[0].idempotencyKey).toBe("key_1");
    expect(h.requests[0].method).toBe("POST");
    expect(h.requests[0].path).toBe("/v1/payouts");
    expect(h.auditEvents.map((e) => e.type)).toEqual(["payout_created"]);
    expect(h.auditEvents[0].approvedBy).toBe("samuel");
  });

  // Unknown provider status: never guessed, never success.
  it("refuses an unknown provider status with an explicit error", async () => {
    const h = harness(() => ({ status: 200, body: providerPayoutBody({ status: "settling_maybe" }) }));
    const r = await h.adapter.createPayout(realCreateInput);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("PERMANENT_FAILURE");
      expect(r.message).toContain("settling_maybe");
      expect(r.message).toContain("Refusing to guess");
    }
    expect(h.auditEvents.map((e) => e.type)).toEqual(["payout_create_failed"]);
  });

  it("refuses a response in a currency other than usd", async () => {
    const h = harness(() => ({ status: 200, body: providerPayoutBody({ currency: "eur" }) }));
    expect((await h.adapter.createPayout(realCreateInput)).ok).toBe(false);
  });

  it("refuses a response without an id or without an integer amount", async () => {
    const noId = harness(() => ({ status: 200, body: providerPayoutBody({ id: "" }) }));
    expect((await noId.adapter.createPayout(realCreateInput)).ok).toBe(false);
    const badAmount = harness(() => ({ status: 200, body: providerPayoutBody({ amount: 125.5 }) }));
    expect((await badAmount.adapter.createPayout(realCreateInput)).ok).toBe(false);
  });

  // Retry mapping: only what a retry can fix is retryable.
  it("maps credential failures to MISCONFIGURED, never retryable", async () => {
    const h = harness(() => ({ status: 401, body: { error: { message: "bad key" } } }));
    const r = await h.adapter.createPayout(realCreateInput);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("MISCONFIGURED");
      expect(r.retryable).toBe(false);
    }
  });

  it("maps throttling and provider outages to RETRYABLE", async () => {
    for (const status of [429, 500, 503]) {
      const h = harness(() => ({ status, body: null }));
      const r = await h.adapter.createPayout(realCreateInput);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.code).toBe("RETRYABLE");
        expect(r.retryable).toBe(true);
      }
    }
  });

  it("maps a provider refusal to terminal REJECTED so nobody re-sends a refused payment", async () => {
    const h = harness(() => ({ status: 402, body: { error: { message: "insufficient balance" } } }));
    const r = await h.adapter.createPayout(realCreateInput);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("REJECTED");
      expect(r.retryable).toBe(false);
      expect(r.message).toContain("insufficient balance");
    }
  });

  it("maps a transport failure (network) to RETRYABLE", async () => {
    const auditEvents: PayoutAuditEvent[] = [];
    const adapter = new RealPayoutAdapter({
      apiKey: "payout_key",
      webhookSecret: WEBHOOK_SECRET,
      apiBase: "https://payouts.example",
      transport: async () => {
        throw new Error("network down");
      },
      now: () => NOW_MS,
      emergencyDisabled: () => false,
      audit: (e) => auditEvents.push(e),
    });
    const r = await adapter.createPayout(realCreateInput);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.retryable).toBe(true);
  });
});

describe("RealPayoutAdapter emergency disable", () => {
  // The kill switch beats everything: valid config, valid input, every operation.
  it("refuses every operation with an explicit EMERGENCY_DISABLED refusal and no request", async () => {
    const h = harness(undefined, { emergencyDisabled: () => true });
    const results = [
      await h.adapter.createPayout(realCreateInput),
      await h.adapter.createPayoutBatch(batchInput()),
      await h.adapter.getPayout("po_1"),
      await h.adapter.cancelPayout("po_1"),
      await h.adapter.reconcileBatch("batch_1", ["po_1"]),
      await h.adapter.verifyWebhook(
        JSON.stringify({ id: "evt_1", type: "payout.paid" }),
        signedHeader(JSON.stringify({ id: "evt_1", type: "payout.paid" })),
      ),
    ];
    for (const r of results) {
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.code).toBe("DISABLED");
        expect(r.retryable).toBe(false);
        expect(r.message).toContain("EMERGENCY_DISABLED");
        expect(r.message).toContain("PAYOUTS_EMERGENCY_DISABLED");
      }
    }
    expect(h.requests).toHaveLength(0);
    h.auditEvents.forEach((e) => expect(e.type).toBe("payout_emergency_refusal"));
  });

  it("reads the process environment at call time by default", async () => {
    const original = process.env.PAYOUTS_EMERGENCY_DISABLED;
    try {
      const h = harness(undefined, { emergencyDisabled: undefined });
      process.env.PAYOUTS_EMERGENCY_DISABLED = "true";
      const refused = await h.adapter.createPayout(realCreateInput);
      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.message).toContain("EMERGENCY_DISABLED");

      // Flipping it back re-enables the same adapter instance without a restart.
      delete process.env.PAYOUTS_EMERGENCY_DISABLED;
      const allowed = await h.adapter.createPayout(realCreateInput);
      expect(allowed.ok).toBe(true);
    } finally {
      if (original === undefined) delete process.env.PAYOUTS_EMERGENCY_DISABLED;
      else process.env.PAYOUTS_EMERGENCY_DISABLED = original;
    }
  });

  it("payoutsEmergencyDisabled requires exactly the string true", () => {
    expect(payoutsEmergencyDisabled({ PAYOUTS_EMERGENCY_DISABLED: "true" } as NodeJS.ProcessEnv)).toBe(true);
    expect(payoutsEmergencyDisabled({ PAYOUTS_EMERGENCY_DISABLED: "TRUE" } as NodeJS.ProcessEnv)).toBe(false);
    expect(payoutsEmergencyDisabled({} as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe("RealPayoutAdapter createPayoutBatch", () => {
  function echoRespond(request: PayoutProviderRequest): PayoutProviderResponse {
    const metadata = (request.body?.metadata ?? {}) as Record<string, unknown>;
    return {
      status: 200,
      body: providerPayoutBody({
        id: `po_${String(metadata.partnerId)}`,
        amount: request.body?.amount,
        metadata,
      }),
    };
  }

  // The directive: no payout for a batch missing approvedBy.
  it("refuses the whole batch when approvedBy is missing, before any request", async () => {
    const h = harness(echoRespond);
    const r = await h.adapter.createPayoutBatch(batchInput({ approvedBy: "" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("REJECTED");
      expect(r.message).toContain("approvedBy");
    }
    expect(h.requests).toHaveLength(0);
    expect(h.auditEvents.map((e) => e.type)).toEqual(["payout_batch_refused"]);
  });

  it("refuses an empty batch", async () => {
    const h = harness(echoRespond);
    const r = await h.adapter.createPayoutBatch(batchInput({ items: [] }));
    expect(r.ok).toBe(false);
    expect(h.requests).toHaveLength(0);
  });

  it("refuses a batch listing the same partner twice as a double pay", async () => {
    const h = harness(echoRespond);
    const item = batchInput().items[0];
    const r = await h.adapter.createPayoutBatch(batchInput({ items: [item, { ...item }] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("twice");
    expect(h.requests).toHaveLength(0);
  });

  it("pays each partner with an idempotency key derived from the batch id", async () => {
    const h = harness(echoRespond);
    const items = [
      { ...batchInput().items[0], partnerId: "prt_1" },
      { ...batchInput().items[0], partnerId: "prt_2", payoutAccountReference: "acct_partner_2" },
    ];
    const r = await h.adapter.createPayoutBatch(batchInput({ items }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.items).toHaveLength(2);
      r.value.items.forEach((item) => expect(item.ok).toBe(true));
    }
    expect(h.requests.map((q) => q.idempotencyKey)).toEqual([
      "payout:batch_1:prt_1",
      "payout:batch_1:prt_2",
    ]);
  });

  // A retried batch asks the provider to settle the SAME payments.
  it("re-sends the identical idempotency keys on a batch retry", async () => {
    const h = harness(echoRespond);
    await h.adapter.createPayoutBatch(batchInput());
    await h.adapter.createPayoutBatch(batchInput());
    expect(h.requests.map((q) => q.idempotencyKey)).toEqual([
      "payout:batch_1:prt_1",
      "payout:batch_1:prt_1",
    ]);
  });

  it("reports per-item results: one failure never aborts the rest", async () => {
    const h = harness((request) => {
      const metadata = (request.body?.metadata ?? {}) as Record<string, unknown>;
      if (metadata.partnerId === "prt_1") {
        return { status: 402, body: { error: { message: "insufficient balance" } } };
      }
      return echoRespond(request);
    });
    const items = [
      { ...batchInput().items[0], partnerId: "prt_1" },
      { ...batchInput().items[0], partnerId: "prt_2", payoutAccountReference: "acct_partner_2" },
    ];
    const r = await h.adapter.createPayoutBatch(batchInput({ items }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      const [first, second] = r.value.items;
      expect(first.ok).toBe(false);
      if (!first.ok) {
        expect(first.code).toBe("REJECTED");
        expect(first.retryable).toBe(false);
      }
      expect(second.ok).toBe(true);
    }
  });

  // The directive: a future hold is refused, per item, while clean items proceed.
  it("refuses an item on a future hold while paying the clean item", async () => {
    const h = harness(echoRespond);
    const items = [
      { ...batchInput().items[0], partnerId: "prt_1", holdUntil: "2026-04-01T00:00:00.000Z" },
      { ...batchInput().items[0], partnerId: "prt_2", payoutAccountReference: "acct_partner_2" },
    ];
    const r = await h.adapter.createPayoutBatch(batchInput({ items }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      const held = r.value.items.find((i) => i.partnerId === "prt_1");
      const paid = r.value.items.find((i) => i.partnerId === "prt_2");
      expect(held?.ok).toBe(false);
      if (held && !held.ok) expect(held.message).toContain("hold");
      expect(paid?.ok).toBe(true);
    }
    // Only the clean item ever reached the wire.
    expect(h.requests).toHaveLength(1);
  });
});

describe("RealPayoutAdapter reconciliation and reversal reporting", () => {
  it("fetches current provider state for a payout", async () => {
    const h = harness(() => ({ status: 200, body: providerPayoutBody({ status: "in_transit" }) }));
    const r = await h.adapter.getPayout("po_1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.status).toBe("pending");
    expect(h.requests[0]).toMatchObject({ method: "GET", path: "/v1/payouts/po_1" });
    expect(h.auditEvents.map((e) => e.type)).toEqual(["payout_reconciled"]);
  });

  // A reversal is only REPORTED here; the append-only commission ledger records
  // the reversal as a NEW event upstream. The adapter never rewrites history.
  it("reports a provider reversal as reversed state, and it is never markable paid", async () => {
    const h = harness(() => ({ status: 200, body: providerPayoutBody({ status: "reversed" }) }));
    const r = await h.adapter.getPayout("po_1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.status).toBe("reversed");
    expect(canMarkPaid(r)).toBe(false);
  });

  it("refuses an unknown status during reconciliation instead of guessing", async () => {
    const h = harness(() => ({ status: 200, body: providerPayoutBody({ status: "mystery" }) }));
    const r = await h.adapter.getPayout("po_1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("PERMANENT_FAILURE");
  });

  it("reconciles a batch with per-reference outcomes, including failures", async () => {
    const h = harness((request) => {
      if (request.path.endsWith("/po_missing")) {
        return { status: 404, body: { error: { message: "no such payout" } } };
      }
      return { status: 200, body: providerPayoutBody({ status: "failed" }) };
    });
    const r = await h.adapter.reconcileBatch("batch_1", ["po_1", "po_missing"]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const found = r.value.items.find((i) => i.providerReference === "po_1");
      const missing = r.value.items.find((i) => i.providerReference === "po_missing");
      expect(found?.ok).toBe(true);
      if (found?.ok) expect(found.payout.status).toBe("failed");
      expect(missing?.ok).toBe(false);
      if (missing && !missing.ok) expect(missing.code).toBe("REJECTED");
    }
  });
});

describe("RealPayoutAdapter cancelPayout", () => {
  it("maps a provider cancellation to a cancelled record", async () => {
    const h = harness(() => ({ status: 200, body: providerPayoutBody({ status: "canceled" }) }));
    const r = await h.adapter.cancelPayout("po_1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.status).toBe("cancelled");
    expect(h.requests[0]).toMatchObject({ method: "POST", path: "/v1/payouts/po_1/cancel" });
  });

  it("surfaces the provider's refusal to cancel a paid payout", async () => {
    const h = harness(() => ({ status: 400, body: { error: { message: "already paid" } } }));
    const r = await h.adapter.cancelPayout("po_1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("already paid");
  });

  it("refuses a cancellation response that did not actually cancel", async () => {
    const h = harness(() => ({ status: 200, body: providerPayoutBody({ status: "paid" }) }));
    const r = await h.adapter.cancelPayout("po_1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("PERMANENT_FAILURE");
  });
});

describe("RealPayoutAdapter webhook verification", () => {
  const eventBody = JSON.stringify({
    id: "evt_1",
    type: "payout.paid",
    data: { object: { id: "po_1" } },
  });

  it("accepts a correctly signed event and extracts the reference", async () => {
    const h = harness();
    const r = await h.adapter.verifyWebhook(eventBody, signedHeader(eventBody));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.verified).toBe(true);
      expect(r.value.eventId).toBe("evt_1");
      expect(r.value.eventType).toBe("payout.paid");
      expect(r.value.providerReference).toBe("po_1");
    }
    expect(h.auditEvents.map((e) => e.type)).toEqual(["payout_webhook_verified"]);
  });

  it("translates provider event names into the domain vocabulary", async () => {
    const h = harness();
    const body = JSON.stringify({ id: "evt_c", type: "payout.canceled", providerReference: "po_9" });
    const r = await h.adapter.verifyWebhook(body, signedHeader(body));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.eventType).toBe("payout.cancelled");
      expect(r.value.providerReference).toBe("po_9");
    }
  });

  it("passes an unlisted event type through untranslated for the caller to ignore", async () => {
    const h = harness();
    const body = JSON.stringify({ id: "evt_x", type: "payout.new_thing" });
    const r = await h.adapter.verifyWebhook(body, signedHeader(body));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.eventType).toBe("payout.new_thing");
  });

  it("rejects a missing header, a wrong signature, and a tampered body", async () => {
    const h = harness();
    expect((await h.adapter.verifyWebhook(eventBody, undefined)).ok).toBe(false);
    expect((await h.adapter.verifyWebhook(eventBody, "t=1,v1=deadbeef")).ok).toBe(false);
    const tampered = eventBody.replace("po_1", "po_2");
    expect((await h.adapter.verifyWebhook(tampered, signedHeader(eventBody))).ok).toBe(false);
  });

  it("rejects a stale timestamp outside the tolerance window", async () => {
    const h = harness();
    const staleSeconds = NOW_MS / 1000 - 3600;
    const r = await h.adapter.verifyWebhook(eventBody, signedHeader(eventBody, staleSeconds));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("tolerance");
  });

  // Replay protection: a verified event id is refused the second time.
  it("rejects a replayed event id", async () => {
    const h = harness();
    expect((await h.adapter.verifyWebhook(eventBody, signedHeader(eventBody))).ok).toBe(true);
    const replay = await h.adapter.verifyWebhook(eventBody, signedHeader(eventBody));
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.message).toContain("Duplicate");
    expect(h.auditEvents.map((e) => e.type)).toEqual([
      "payout_webhook_verified",
      "payout_webhook_rejected",
    ]);
  });

  it("rejects a signed but malformed or incomplete body", async () => {
    const h = harness();
    const notJson = "{not json";
    expect((await h.adapter.verifyWebhook(notJson, signedHeader(notJson))).ok).toBe(false);
    const missingType = JSON.stringify({ id: "evt_only" });
    expect((await h.adapter.verifyWebhook(missingType, signedHeader(missingType))).ok).toBe(false);
  });
});

describe("mapPayoutFailure", () => {
  it("never marks a 4xx refusal retryable and never a 401 as a mere rejection", () => {
    const auth = mapPayoutFailure(401, null);
    if (!auth.ok) expect(auth.code).toBe("MISCONFIGURED");
    const refusal = mapPayoutFailure(422, { error: { message: "bad destination" } });
    if (!refusal.ok) {
      expect(refusal.code).toBe("REJECTED");
      expect(refusal.retryable).toBe(false);
      expect(refusal.message).toBe("bad destination");
    }
  });

  it("falls back to a status-only message without leaking the raw body", () => {
    const r = mapPayoutFailure(500, { secret_field: "do not echo" });
    if (!r.ok) {
      expect(r.message).toBe("Provider returned HTTP 500.");
      expect(r.message).not.toContain("do not echo");
    }
  });
});

describe("resolvePayoutProvider", () => {
  const original = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = original;
  });

  it("defaults to disabled with an empty environment", () => {
    expect(resolvePayoutProvider({} as NodeJS.ProcessEnv).name).toBe("disabled");
  });

  it("stays disabled when payouts are off, even if a provider is named", () => {
    expect(resolvePayoutProvider({ PAYOUT_PROVIDER: "live" } as NodeJS.ProcessEnv).name).toBe("disabled");
  });

  it("requires the flag to be exactly true", () => {
    const p = resolvePayoutProvider({
      RESEARCH_AFFILIATE_PAYOUTS_ENABLED: "TRUE",
      PAYOUT_PROVIDER: "test",
    } as NodeJS.ProcessEnv);
    expect(p.name).toBe("disabled");
  });

  it("selects the test provider only outside production", () => {
    const p = resolvePayoutProvider({
      RESEARCH_AFFILIATE_PAYOUTS_ENABLED: "true",
      PAYOUT_PROVIDER: "test",
      NODE_ENV: "development",
    } as NodeJS.ProcessEnv);
    expect(p.name).toBe("test");
  });

  // A misconfiguration must never turn production into fake payouts.
  it("refuses the test provider in production and falls back to disabled", () => {
    const p = resolvePayoutProvider({
      RESEARCH_AFFILIATE_PAYOUTS_ENABLED: "true",
      PAYOUT_PROVIDER: "test",
      NODE_ENV: "production",
    } as NodeJS.ProcessEnv);
    expect(p.name).toBe("disabled");
  });

  it("falls back to disabled for an unknown provider name", () => {
    const p = resolvePayoutProvider({
      RESEARCH_AFFILIATE_PAYOUTS_ENABLED: "true",
      PAYOUT_PROVIDER: "wat",
    } as NodeJS.ProcessEnv);
    expect(p.name).toBe("disabled");
  });

  // The factory rule: unconfigured -> Disabled, never a half-configured adapter.
  it("falls back to disabled when live is selected without a complete configuration", () => {
    const p = resolvePayoutProvider({
      RESEARCH_AFFILIATE_PAYOUTS_ENABLED: "true",
      PAYOUT_PROVIDER: "live",
    } as NodeJS.ProcessEnv);
    expect(p.name).toBe("disabled");

    const partial = resolvePayoutProvider({
      RESEARCH_AFFILIATE_PAYOUTS_ENABLED: "true",
      PAYOUT_PROVIDER: "live",
      PAYOUT_API_KEY: "k",
    } as NodeJS.ProcessEnv);
    expect(partial.name).toBe("disabled");
  });

  it("returns the real adapter only from a complete configuration", () => {
    const p = resolvePayoutProvider({
      RESEARCH_AFFILIATE_PAYOUTS_ENABLED: "true",
      PAYOUT_PROVIDER: "live",
      PAYOUT_API_KEY: "k",
      PAYOUT_WEBHOOK_SECRET: "s",
      PAYOUT_API_BASE: "https://payouts.example",
    } as NodeJS.ProcessEnv);
    expect(p.name).toBe("real");
  });

  // The kill switch beats the enable flag, the selection, and a full configuration.
  it("resolves to disabled under the emergency switch regardless of everything else", () => {
    const live = resolvePayoutProvider({
      PAYOUTS_EMERGENCY_DISABLED: "true",
      RESEARCH_AFFILIATE_PAYOUTS_ENABLED: "true",
      PAYOUT_PROVIDER: "live",
      PAYOUT_API_KEY: "k",
      PAYOUT_WEBHOOK_SECRET: "s",
      PAYOUT_API_BASE: "https://payouts.example",
    } as NodeJS.ProcessEnv);
    expect(live.name).toBe("disabled");

    const test = resolvePayoutProvider({
      PAYOUTS_EMERGENCY_DISABLED: "true",
      RESEARCH_AFFILIATE_PAYOUTS_ENABLED: "true",
      PAYOUT_PROVIDER: "test",
      NODE_ENV: "development",
    } as NodeJS.ProcessEnv);
    expect(test.name).toBe("disabled");
  });

  it("the resolved live adapter honors the emergency switch at call time", async () => {
    const env = {
      RESEARCH_AFFILIATE_PAYOUTS_ENABLED: "true",
      PAYOUT_PROVIDER: "live",
      PAYOUT_API_KEY: "k",
      PAYOUT_WEBHOOK_SECRET: "s",
      PAYOUT_API_BASE: "https://payouts.example",
    } as NodeJS.ProcessEnv;
    const p = resolvePayoutProvider(env);
    expect(p.name).toBe("real");
    env.PAYOUTS_EMERGENCY_DISABLED = "true";
    const r = await p.createPayout({ ...baseInput, payoutAccountReference: "acct_1", approvedBy: "samuel" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("EMERGENCY_DISABLED");
  });
});

describe("TestPayoutProvider production guard", () => {
  const original = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = original;
  });

  it("refuses to construct in production", () => {
    process.env.NODE_ENV = "production";
    expect(() => new TestPayoutProvider()).toThrow(/not available in production/);
  });
});

describe("canMarkPaid", () => {
  it("refuses to mark paid on a failed provider result", () => {
    expect(canMarkPaid({ ok: false, code: "DISABLED", message: "no", retryable: false })).toBe(false);
  });

  it("refuses to mark paid on a success carrying no provider reference", () => {
    expect(
      canMarkPaid({
        ok: true,
        value: {
          providerReference: "",
          batchId: "b",
          partnerId: "p",
          amountCents: 100,
          currency: "usd",
          status: "paid",
          ledgerEntryIds: ["led_1"],
        },
      }),
    ).toBe(false);
  });

  it("refuses to mark paid while the payout is only pending", () => {
    expect(
      canMarkPaid({
        ok: true,
        value: {
          providerReference: "ref_1",
          batchId: "b",
          partnerId: "p",
          amountCents: 100,
          currency: "usd",
          status: "pending",
          ledgerEntryIds: ["led_1"],
        },
      }),
    ).toBe(false);
  });

  it("allows marking paid only on a real reference plus a paid status", async () => {
    const p = new TestPayoutProvider();
    const r = await p.createPayout(baseInput);
    expect(canMarkPaid(r)).toBe(true);
  });

  it("refuses a proof that names no settled ledger entries (nothing to bind to)", async () => {
    const h = harness(() => ({
      status: 200,
      body: providerPayoutBody({ metadata: { batchId: "batch_1", partnerId: "prt_1" } }),
    }));
    const r = await h.adapter.createPayout(realCreateInput);
    expect(r.ok).toBe(true); // the payment happened
    expect(canMarkPaid(r)).toBe(false); // but it proves nothing about any entry
  });

  it("binds the proof to its own entries: it settles led_1 and led_2, never led_3", async () => {
    const h = harness(() => ({
      status: 200,
      body: providerPayoutBody({ metadata: { batchId: "batch_1", partnerId: "prt_1", ledgerEntryIds: "led_1,led_2" } }),
    }));
    const r = await h.adapter.createPayout({ ...realCreateInput, ledgerEntryIds: ["led_1", "led_2"] });
    if (!canMarkPaid(r)) throw new Error("setup failed");
    expect(proofSettlesEntry(r, "led_1")).toBe(true);
    expect(proofSettlesEntry(r, "led_2")).toBe(true);
    expect(proofSettlesEntry(r, "led_3")).toBe(false);
  });
});

describe("payout id shape (the derived key delimiter)", () => {
  it("accepts plain tokens and refuses the ':' delimiter and junk", () => {
    expect(isValidPayoutId("batch_1")).toBe(true);
    expect(isValidPayoutId("prt-2.a")).toBe(true);
    expect(isValidPayoutId("a:b")).toBe(false);
    expect(isValidPayoutId("")).toBe(false);
    expect(isValidPayoutId(" b")).toBe(false);
    expect(isValidPayoutId(42)).toBe(false);
  });

  it("refuses the colliding pair (batch a, partner b:c) versus (batch a:b, partner c) outright", async () => {
    const h = harness();
    // Item-level: a partner id carrying the delimiter is refused before any key derives.
    const batch = await h.adapter.createPayoutBatch(batchInput({
      batchId: "a",
      items: [{
        partnerId: "b:c",
        payoutAccountReference: "acct_partner_1",
        amountCents: 12500,
        currency: "usd" as const,
        ledgerEntryIds: ["led_1"],
      }],
    }));
    expect(batch.ok).toBe(true);
    if (batch.ok) {
      expect(batch.value.items[0].ok).toBe(false);
    }
    // Batch-level: a batch id carrying the delimiter refuses the whole batch.
    const collided = await h.adapter.createPayoutBatch(batchInput({ batchId: "a:b" }));
    expect(collided.ok).toBe(false);
    if (!collided.ok) expect(collided.message).toContain("malformed");
    expect(h.requests).toHaveLength(0); // nothing ever reached the provider
  });
});

describe("eligibleForPayout", () => {
  it("passes a fully compliant active partner over the minimum", () => {
    const r = eligibleForPayout("active", "verified", MINIMUM_PAYOUT_CENTS, MINIMUM_PAYOUT_CENTS, {
      payoutMethodStatus: "verified",
    });
    expect(r).toEqual({ ok: true, reasons: [] });
  });

  // Fail closed: silence about the payout method is not approval.
  it("denies when the payout method status is not supplied", () => {
    const r = eligibleForPayout("active", "verified", 99999);
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("payout_status_unverified");
  });

  it("denies an unverified payout method", () => {
    const r = eligibleForPayout("active", "verified", 99999, MINIMUM_PAYOUT_CENTS, {
      payoutMethodStatus: "unverified",
    });
    expect(r.reasons).toContain("payout_status_unverified");
  });

  it("denies a partner who is not active", () => {
    for (const state of ["suspended", "terminated", "quality_review", "application"] as const) {
      const r = eligibleForPayout(state, "verified", 99999, MINIMUM_PAYOUT_CENTS, {
        payoutMethodStatus: "verified",
      });
      expect(r.ok).toBe(false);
      expect(r.reasons).toContain("partner_not_active");
    }
  });

  it("denies a tax status that is merely submitted, not verified", () => {
    const r = eligibleForPayout("active", "submitted", 99999, MINIMUM_PAYOUT_CENTS, {
      payoutMethodStatus: "verified",
    });
    expect(r.reasons).toContain("tax_status_missing");
  });

  it("denies a balance one cent under the minimum and allows it exactly at it", () => {
    const under = eligibleForPayout("active", "verified", MINIMUM_PAYOUT_CENTS - 1, MINIMUM_PAYOUT_CENTS, {
      payoutMethodStatus: "verified",
    });
    expect(under.reasons).toContain("below_minimum");
    const at = eligibleForPayout("active", "verified", MINIMUM_PAYOUT_CENTS, MINIMUM_PAYOUT_CENTS, {
      payoutMethodStatus: "verified",
    });
    expect(at.ok).toBe(true);
  });

  it("denies a dispute or a hold", () => {
    const disputed = eligibleForPayout("active", "verified", 99999, MINIMUM_PAYOUT_CENTS, {
      payoutMethodStatus: "verified",
      underDispute: true,
    });
    expect(disputed.reasons).toEqual(["entry_under_dispute"]);
    const held = eligibleForPayout("active", "verified", 99999, MINIMUM_PAYOUT_CENTS, {
      payoutMethodStatus: "verified",
      onHold: true,
    });
    expect(held.reasons).toEqual(["entry_on_hold"]);
  });

  // The directive: accumulate every denial rather than returning on the first.
  it("accumulates every reason at once", () => {
    const r = eligibleForPayout("suspended", "missing", 10, MINIMUM_PAYOUT_CENTS, {
      payoutMethodStatus: "missing",
      underDispute: true,
      onHold: true,
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toEqual([
      "partner_not_active",
      "tax_status_missing",
      "payout_status_unverified",
      "below_minimum",
      "entry_under_dispute",
      "entry_on_hold",
    ]);
  });
});

describe("buildBatch", () => {
  it("includes a clean partner and sums their entries", () => {
    const batch = buildBatch(
      [entry({ ledgerId: "led_1", amountCents: 3000 }), entry({ ledgerId: "led_2", amountCents: 4000 })],
      ASOF,
    );
    expect(batch.excluded).toEqual([]);
    expect(batch.included).toEqual([{ partnerId: "prt_1", amountCents: 7000, ledgerIds: ["led_1", "led_2"] }]);
  });

  it("excludes an entry whose commission state is not payable", () => {
    const batch = buildBatch([entry({ commissionState: "approved" })], ASOF);
    expect(batch.included).toEqual([]);
    expect(batch.excluded[0].reasons).toContain("entry_on_hold");
  });

  it("excludes a disputed entry and a held entry with their own reasons", () => {
    const batch = buildBatch(
      [
        entry({ ledgerId: "led_d", underDispute: true }),
        entry({ ledgerId: "led_h", onHold: true }),
      ],
      ASOF,
    );
    expect(batch.included).toEqual([]);
    const disputed = batch.excluded.find((e) => e.ledgerId === "led_d");
    const held = batch.excluded.find((e) => e.ledgerId === "led_h");
    expect(disputed?.reasons).toContain("entry_under_dispute");
    expect(held?.reasons).toContain("entry_on_hold");
  });

  // The hold window must actually elapse against the injected clock.
  it("excludes an entry whose hold has not elapsed at asOf", () => {
    const batch = buildBatch([entry({ payableAt: "2026-04-01T00:00:00.000Z" })], ASOF);
    expect(batch.included).toEqual([]);
    expect(batch.excluded[0].reasons).toContain("entry_on_hold");
  });

  it("excludes an entry with an unparseable payableAt rather than paying it", () => {
    const batch = buildBatch([entry({ payableAt: "not-a-date" })], ASOF);
    expect(batch.included).toEqual([]);
    expect(batch.excluded).toHaveLength(1);
  });

  it("does not let a blocked entry lift a partner over the minimum", () => {
    // 4000 clean plus 4000 disputed would clear 5000 if the disputed one counted.
    const batch = buildBatch(
      [
        entry({ ledgerId: "led_ok", amountCents: 4000 }),
        entry({ ledgerId: "led_bad", amountCents: 4000, underDispute: true }),
      ],
      ASOF,
    );
    expect(batch.included).toEqual([]);
    const clean = batch.excluded.find((e) => e.ledgerId === "led_ok");
    expect(clean?.reasons).toContain("below_minimum");
  });

  it("excludes every entry of a partner who fails the partner-level gate", () => {
    const batch = buildBatch(
      [
        entry({ ledgerId: "led_1", partnerState: "suspended", amountCents: 9000 }),
        entry({ ledgerId: "led_2", partnerState: "suspended", amountCents: 9000 }),
      ],
      ASOF,
    );
    expect(batch.included).toEqual([]);
    expect(batch.excluded).toHaveLength(2);
    batch.excluded.forEach((e) => expect(e.reasons).toContain("partner_not_active"));
  });

  it("excludes a partner with an unverified payout method or missing tax status", () => {
    const batch = buildBatch(
      [
        entry({ ledgerId: "led_1", partnerId: "prt_a", payoutMethodStatus: "unverified" }),
        entry({ ledgerId: "led_2", partnerId: "prt_b", taxStatus: "missing" }),
      ],
      ASOF,
    );
    expect(batch.included).toEqual([]);
    const a = batch.excluded.find((e) => e.partnerId === "prt_a");
    const b = batch.excluded.find((e) => e.partnerId === "prt_b");
    expect(a?.reasons).toContain("payout_status_unverified");
    expect(b?.reasons).toContain("tax_status_missing");
  });

  it("keeps one partner's problem from blocking another partner", () => {
    const batch = buildBatch(
      [
        entry({ ledgerId: "led_good", partnerId: "prt_good", amountCents: 9000 }),
        entry({ ledgerId: "led_bad", partnerId: "prt_bad", partnerState: "terminated", amountCents: 9000 }),
      ],
      ASOF,
    );
    expect(batch.included).toEqual([
      { partnerId: "prt_good", amountCents: 9000, ledgerIds: ["led_good"] },
    ]);
    expect(batch.excluded).toHaveLength(1);
    expect(batch.excluded[0].partnerId).toBe("prt_bad");
  });

  it("rounds a total DOWN so rounding never invents value for a partner", () => {
    const batch = buildBatch([entry({ amountCents: 9000.9 })], ASOF);
    expect(batch.included[0].amountCents).toBe(9000);
  });

  it("is deterministic in ordering across partners", () => {
    const entries = [
      entry({ ledgerId: "led_z", partnerId: "prt_z", amountCents: 9000 }),
      entry({ ledgerId: "led_a", partnerId: "prt_a", amountCents: 9000 }),
    ];
    const first = buildBatch(entries, ASOF);
    const second = buildBatch(entries.slice().reverse(), ASOF);
    expect(first.included).toEqual(second.included);
    expect(first.included[0].partnerId).toBe("prt_a");
  });

  it("returns empty structures for no entries", () => {
    expect(buildBatch([], ASOF)).toEqual({ included: [], excluded: [] });
  });
});

// ---------------------------------------------------------------------------
// Regression: the partner gate must not depend on which entry came first
// ---------------------------------------------------------------------------

describe("buildBatch partner gate is order independent", () => {
  it("excludes the whole group when ANY entry says the partner is not active", () => {
    const entries = [
      entry({ ledgerId: "led_ok", amountCents: 6000 }),
      entry({ ledgerId: "led_stale", amountCents: 6000, partnerState: "suspended" }),
    ];

    const forward = buildBatch(entries, ASOF);
    const reverse = buildBatch(entries.slice().reverse(), ASOF);

    expect(forward.included).toEqual([]);
    expect(reverse.included).toEqual([]);
    forward.excluded.forEach((e) => expect(e.reasons).toContain("partner_not_active"));
    expect(forward.excluded.map((e) => e.ledgerId).sort()).toEqual(["led_ok", "led_stale"]);
  });

  it("excludes the whole group when ANY entry lacks a verified tax or payout method", () => {
    const unverifiedTax = buildBatch(
      [entry({ ledgerId: "a" }), entry({ ledgerId: "b", taxStatus: "submitted" })],
      ASOF,
    );
    expect(unverifiedTax.included).toEqual([]);
    expect(unverifiedTax.excluded[0].reasons).toContain("tax_status_missing");

    const unverifiedMethod = buildBatch(
      [entry({ ledgerId: "a" }), entry({ ledgerId: "b", payoutMethodStatus: "unverified" })],
      ASOF,
    );
    expect(unverifiedMethod.included).toEqual([]);
    expect(unverifiedMethod.excluded[0].reasons).toContain("payout_status_unverified");
  });

  it("still pays a group whose entries all agree", () => {
    const batch = buildBatch(
      [entry({ ledgerId: "a", amountCents: 3000 }), entry({ ledgerId: "b", amountCents: 3000 })],
      ASOF,
    );
    expect(batch.included).toEqual([{ partnerId: "prt_1", amountCents: 6000, ledgerIds: ["a", "b"] }]);
  });

  it("does not repeat a reason once per entry", () => {
    const batch = buildBatch(
      [
        entry({ ledgerId: "a", partnerState: "suspended" }),
        entry({ ledgerId: "b", partnerState: "suspended" }),
      ],
      ASOF,
    );
    expect(batch.excluded[0].reasons).toEqual(["partner_not_active"]);
  });
});
