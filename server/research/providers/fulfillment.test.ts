import { describe, expect, it, afterEach } from "vitest";
import {
  DisabledMitchProvider,
  MITCH_ALLOWED_PAYLOAD_KEYS,
  MITCH_MAX_TRANSMISSION_ATTEMPTS,
  MITCH_WEBHOOK_TOLERANCE_SECONDS,
  MitchFulfillmentProvider,
  TestMitchProvider,
  buildMitchPayload,
  cancelTransmissionId,
  classifyMitchHttpStatus,
  createMitchFulfillmentProvider,
  mapMitchStatus,
  missingMitchEnvironment,
  planTransmissionRetry,
  resendTransmissionId,
  resolveFulfillmentProvider,
  signMitchWebhook,
  submitTransmissionId,
  type FulfillmentAuditEvent,
  type FulfillmentDeadLetterEntry,
  type InternalFulfillmentRequest,
  type MitchTransport,
  type MitchTransportRequest,
  type MitchTransportResponse,
} from "./fulfillment";

/**
 * A request deliberately loaded with internal data that must never cross the
 * boundary. Every sensitive field carries a distinctive marker string so a leak is
 * detectable by scanning the serialized payload.
 */
function loadedRequest(overrides: Partial<InternalFulfillmentRequest> = {}): InternalFulfillmentRequest {
  return {
    fulfillmentOrderId: "FF-1",
    memberId: "MEMBER-SECRET-ID",
    recipientName: "A Member",
    shippingAddress: {
      line1: "1 Example Street",
      city: "Houston",
      state: "TX",
      postalCode: "77002",
      country: "US",
    },
    recipientPhone: "+15555550123",
    carrierRequiresPhone: false,
    shippingService: "standard",
    handlingProfile: "ambient",
    lines: [{ sku: "P001", quantity: 1 }],

    memberHealthGoals: ["LEAK-HEALTH-GOAL"],
    assessmentSummary: "LEAK-ASSESSMENT",
    blueprintReference: "LEAK-BLUEPRINT",
    trackerSummary: "LEAK-TRACKER",
    referralCode: "LEAK-REFERRAL",
    previousOrderIds: ["LEAK-PRIOR-ORDER"],
    internalNotes: "LEAK-NOTES",
    ...overrides,
  };
}

describe("Mitch payload data minimization", () => {
  it("emits only the allowlisted keys", () => {
    const payload = buildMitchPayload(loadedRequest());
    expect(Object.keys(payload).sort()).toEqual(
      MITCH_ALLOWED_PAYLOAD_KEYS.filter((k) => k !== "recipientPhone").slice().sort(),
    );
  });

  // The load-bearing privacy test.
  it("never transmits health, assessment, Blueprint, tracker, referral, or order history", () => {
    const serialized = JSON.stringify(buildMitchPayload(loadedRequest()));
    for (const marker of [
      "LEAK-HEALTH-GOAL",
      "LEAK-ASSESSMENT",
      "LEAK-BLUEPRINT",
      "LEAK-TRACKER",
      "LEAK-REFERRAL",
      "LEAK-PRIOR-ORDER",
      "LEAK-NOTES",
      "MEMBER-SECRET-ID",
    ]) {
      expect(serialized).not.toContain(marker);
    }
  });

  it("does not leak a field added upstream later", () => {
    // Simulates a future developer adding a sensitive field to the internal type.
    const withFutureField = {
      ...loadedRequest(),
      futureSensitiveField: "LEAK-FUTURE",
    } as InternalFulfillmentRequest;
    const serialized = JSON.stringify(buildMitchPayload(withFutureField));
    expect(serialized).not.toContain("LEAK-FUTURE");
  });

  it("withholds the phone number unless the carrier requires it", () => {
    const withheld = buildMitchPayload(loadedRequest({ carrierRequiresPhone: false }));
    expect(withheld.recipientPhone).toBeUndefined();

    const included = buildMitchPayload(loadedRequest({ carrierRequiresPhone: true }));
    expect(included.recipientPhone).toBe("+15555550123");
  });

  it("omits the phone entirely when none is held, even if the carrier requires one", () => {
    const payload = buildMitchPayload(loadedRequest({ carrierRequiresPhone: true, recipientPhone: undefined }));
    expect(payload.recipientPhone).toBeUndefined();
  });

  it("carries the shipping fields the partner genuinely needs", () => {
    const payload = buildMitchPayload(loadedRequest());
    expect(payload.fulfillmentOrderId).toBe("FF-1");
    expect(payload.shippingAddress.city).toBe("Houston");
    expect(payload.lines).toEqual([{ sku: "P001", quantity: 1 }]);
  });

  it("includes line2 only when present", () => {
    expect(buildMitchPayload(loadedRequest()).shippingAddress.line2).toBeUndefined();
    const withLine2 = loadedRequest();
    withLine2.shippingAddress.line2 = "Apt 4";
    expect(buildMitchPayload(withLine2).shippingAddress.line2).toBe("Apt 4");
  });
});

describe("DisabledMitchProvider", () => {
  it("refuses every operation without throwing", async () => {
    const p = new DisabledMitchProvider();
    for (const r of [await p.submit(), await p.fetchStatus(), await p.verifyInboundWebhook()]) {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("DISABLED");
    }
  });
});

describe("TestMitchProvider", () => {
  it("submits a valid order and records the minimized payload", async () => {
    const p = new TestMitchProvider();
    const r = await p.submit(loadedRequest());
    expect(r.ok).toBe(true);
    expect(p.submitted).toHaveLength(1);
    expect(JSON.stringify(p.submitted[0])).not.toContain("LEAK-BLUEPRINT");
  });

  it("rejects an empty order", async () => {
    const p = new TestMitchProvider();
    const r = await p.submit(loadedRequest({ lines: [] }));
    expect(r.ok).toBe(false);
  });

  // Storage handling is a safety decision, not a default.
  it("refuses to ship when the handling profile is not confirmed", async () => {
    const p = new TestMitchProvider();
    const r = await p.submit(loadedRequest({ handlingProfile: "not_confirmed" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("not confirmed");
    expect(p.submitted).toHaveLength(0);
  });

  it("rejects an inbound webhook with a bad signature or malformed body", async () => {
    const p = new TestMitchProvider();
    const body = JSON.stringify({ fulfillmentOrderId: "FF-1", status: "shipped" });
    expect((await p.verifyInboundWebhook(body, undefined)).ok).toBe(false);
    expect((await p.verifyInboundWebhook("{bad", "test-signature")).ok).toBe(false);
  });

  it("accepts a well formed signed status update", async () => {
    const p = new TestMitchProvider();
    const body = JSON.stringify({ fulfillmentOrderId: "FF-1", status: "shipped", trackingNumber: "T1" });
    const r = await p.verifyInboundWebhook(body, "test-signature");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.trackingNumber).toBe("T1");
  });
});

describe("MitchFulfillmentProvider unconfigured", () => {
  it("refuses rather than faking a submission when no transport is injected", async () => {
    const r = await new MitchFulfillmentProvider().submit(loadedRequest());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("MISCONFIGURED");
  });

  it("refuses a webhook rather than skipping verification when no secret is configured", async () => {
    const r = await new MitchFulfillmentProvider().verifyInboundWebhook("{}", "t=1,v1=00");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("MISCONFIGURED");
  });

  it("declares credential names only, never values", () => {
    expect(MitchFulfillmentProvider.requiredEnvironmentVariables).toContain("MITCH_API_KEY");
    for (const name of MitchFulfillmentProvider.requiredEnvironmentVariables) {
      expect(name).toMatch(/^MITCH_[A-Z_]+$/);
    }
  });

  it("defaults to the manual export transport", () => {
    expect(new MitchFulfillmentProvider().transportMode).toBe("manual_export");
  });
});

describe("resolveFulfillmentProvider", () => {
  const original = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = original;
  });

  it("defaults to disabled", () => {
    expect(resolveFulfillmentProvider({} as NodeJS.ProcessEnv).name).toBe("disabled");
  });

  it("stays disabled when the flag is off even if a provider is named", () => {
    expect(resolveFulfillmentProvider({ MITCH_PROVIDER: "mitch" } as NodeJS.ProcessEnv).name).toBe("disabled");
  });

  it("refuses the test provider in production", () => {
    const p = resolveFulfillmentProvider({
      RESEARCH_MITCH_FULFILLMENT_ENABLED: "true",
      MITCH_PROVIDER: "test",
      NODE_ENV: "production",
    } as NodeJS.ProcessEnv);
    expect(p.name).toBe("disabled");
  });

  it("selects the real adapter with the configured transport mode when fully configured", () => {
    // A clean (non-synthetic-marked) configuration: the fulfillment flag makes
    // the process production-like, where the synthetic-data guard refuses markers.
    const p = resolveFulfillmentProvider({
      RESEARCH_MITCH_FULFILLMENT_ENABLED: "true",
      MITCH_PROVIDER: "mitch",
      MITCH_TRANSPORT_MODE: "sftp",
      MITCH_ENDPOINT_URL: "https://mitch.partner-unit.test/mitch",
      MITCH_API_KEY: "fake-test-key",
      MITCH_WEBHOOK_SECRET: "fake-test-secret",
    } as NodeJS.ProcessEnv);
    expect(p.name).toBe("mitch");
    expect(p.transportMode).toBe("sftp");
  });

  // The synthetic-data production guard, wired at the construction chokepoint:
  // the sandbox profile (MITCH_TEST_ keys, example.invalid endpoints) can never
  // become the live fulfillment path while the process is production-like.
  it("refuses to construct the live adapter over the Mitch sandbox profile", () => {
    const sandbox = {
      RESEARCH_MITCH_FULFILLMENT_ENABLED: "true",
      MITCH_PROVIDER: "mitch",
      MITCH_ENDPOINT_URL: "https://example.invalid/mitch",
      MITCH_API_KEY: "MITCH_TEST_key",
      MITCH_WEBHOOK_SECRET: "fake-test-secret",
    } as NodeJS.ProcessEnv;
    expect(() => resolveFulfillmentProvider(sandbox)).toThrow(/Synthetic fixture data/);
  });

  it("stays disabled when the real adapter is selected but credentials are missing", () => {
    const p = resolveFulfillmentProvider({
      RESEARCH_MITCH_FULFILLMENT_ENABLED: "true",
      MITCH_PROVIDER: "mitch",
    } as NodeJS.ProcessEnv);
    expect(p.name).toBe("disabled");
  });
});

describe("TestMitchProvider production guard", () => {
  const original = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = original;
  });

  it("refuses to construct in production", () => {
    process.env.NODE_ENV = "production";
    expect(() => new TestMitchProvider()).toThrow(/not available in production/);
  });
});

// ---------------------------------------------------------------------------
// Production adapter
// ---------------------------------------------------------------------------

const OK_ACK: MitchTransportResponse = {
  httpStatus: 200,
  body: JSON.stringify({ accepted: true, partnerReference: "mitch-ref-1" }),
};

class FakeTransport implements MitchTransport {
  readonly requests: MitchTransportRequest[] = [];

  constructor(private readonly respond: (request: MitchTransportRequest) => MitchTransportResponse | Error = () => OK_ACK) {}

  async send(request: MitchTransportRequest): Promise<MitchTransportResponse> {
    this.requests.push(request);
    const outcome = this.respond(request);
    if (outcome instanceof Error) throw outcome;
    return outcome;
  }
}

class FakeDeadLetterSink {
  readonly entries: FulfillmentDeadLetterEntry[] = [];
  async record(entry: FulfillmentDeadLetterEntry): Promise<void> {
    this.entries.push(entry);
  }
}

class FakeAuditRecorder {
  readonly events: FulfillmentAuditEvent[] = [];
  record(event: FulfillmentAuditEvent): void {
    this.events.push(event);
  }
}

const WEBHOOK_SECRET = "fake-webhook-secret-for-tests";
const NOW_MS = 1_750_000_000_000;

function configuredProvider(respond?: (request: MitchTransportRequest) => MitchTransportResponse | Error) {
  const transport = new FakeTransport(respond);
  const deadLetters = new FakeDeadLetterSink();
  const audit = new FakeAuditRecorder();
  const provider = new MitchFulfillmentProvider({
    transportMode: "api",
    transport,
    webhookSecret: WEBHOOK_SECRET,
    deadLetterSink: deadLetters,
    auditRecorder: audit,
    now: () => NOW_MS,
  });
  return { provider, transport, deadLetters, audit };
}

describe("MitchFulfillmentProvider order transmission", () => {
  it("transmits the minimized payload and returns the partner reference", async () => {
    const { provider, transport } = configuredProvider();
    const r = await provider.submit(loadedRequest());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ accepted: true, partnerReference: "mitch-ref-1" });

    expect(transport.requests).toHaveLength(1);
    const sent = transport.requests[0];
    expect(sent.kind).toBe("submit_order");
    expect(sent.transmissionId).toBe(submitTransmissionId("FF-1"));
  });

  // The load-bearing boundary test for the production path: even when the
  // internal request object is polluted with sensitive fields the type does not
  // declare, the payload that reaches the transport carries ONLY allowlisted keys.
  it("never lets a polluted internal request widen the outbound payload", async () => {
    const { provider, transport } = configuredProvider();
    const polluted = {
      ...loadedRequest(),
      assessmentDocument: "LEAK-ASSESSMENT-DOC",
      blueprintBody: "LEAK-BLUEPRINT-BODY",
      healthHistory: ["LEAK-HEALTH-HISTORY"],
      privateNotes: "LEAK-PRIVATE-NOTES",
      downlineMembers: ["LEAK-DOWNLINE"],
    } as unknown as InternalFulfillmentRequest;

    const r = await provider.submit(polluted);
    expect(r.ok).toBe(true);

    const sent = transport.requests[0].payload as Record<string, unknown>;
    const allowed = new Set<string>(MITCH_ALLOWED_PAYLOAD_KEYS);
    for (const key of Object.keys(sent)) {
      expect(allowed.has(key)).toBe(true);
    }

    const serialized = JSON.stringify(transport.requests[0]);
    for (const marker of [
      "LEAK-ASSESSMENT-DOC",
      "LEAK-BLUEPRINT-BODY",
      "LEAK-HEALTH-HISTORY",
      "LEAK-PRIVATE-NOTES",
      "LEAK-DOWNLINE",
      "LEAK-HEALTH-GOAL",
      "LEAK-ASSESSMENT",
      "LEAK-BLUEPRINT",
      "LEAK-TRACKER",
      "LEAK-REFERRAL",
      "LEAK-PRIOR-ORDER",
      "LEAK-NOTES",
      "MEMBER-SECRET-ID",
    ]) {
      expect(serialized).not.toContain(marker);
    }
  });

  it("uses the same transmission id on a retry so the partner deduplicates", async () => {
    const { provider, transport } = configuredProvider();
    await provider.submit(loadedRequest());
    await provider.submit(loadedRequest(), { attempt: 2 });
    expect(transport.requests[0].transmissionId).toBe(transport.requests[1].transmissionId);
  });

  it("passes a partner hold through as an honest non-acceptance", async () => {
    const { provider } = configuredProvider(() => ({
      httpStatus: 200,
      body: JSON.stringify({ accepted: false, holdReason: "cold chain review" }),
    }));
    const r = await provider.submit(loadedRequest());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ accepted: false, holdReason: "cold chain review" });
  });

  it("treats a garbled acknowledgment as a retryable failure, never a success", async () => {
    const { provider } = configuredProvider(() => ({ httpStatus: 200, body: "not json" }));
    const r = await provider.submit(loadedRequest());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.retryable).toBe(true);
      expect(r.code).toBe("RETRYABLE");
    }
  });

  it("marks a server fault retryable and a client fault permanent", async () => {
    const { provider: p500 } = configuredProvider(() => ({ httpStatus: 500, body: "" }));
    const r500 = await p500.submit(loadedRequest());
    expect(r500.ok).toBe(false);
    if (!r500.ok) expect(r500.retryable).toBe(true);

    const { provider: p400, deadLetters } = configuredProvider(() => ({ httpStatus: 400, body: "" }));
    const r400 = await p400.submit(loadedRequest());
    expect(r400.ok).toBe(false);
    if (!r400.ok) expect(r400.retryable).toBe(false);
    expect(deadLetters.entries).toHaveLength(1);
    expect(deadLetters.entries[0].fulfillmentOrderId).toBe("FF-1");
    expect(deadLetters.entries[0].reason).toContain("400");
  });

  it("treats a thrown transport error as retryable", async () => {
    const { provider, deadLetters } = configuredProvider(() => new Error("connection reset"));
    const r = await provider.submit(loadedRequest());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.retryable).toBe(true);
    expect(deadLetters.entries).toHaveLength(0);
  });

  it("dead-letters when the attempt budget is spent even on a retryable fault", async () => {
    const { provider, deadLetters } = configuredProvider(() => ({ httpStatus: 500, body: "" }));
    const r = await provider.submit(loadedRequest(), { attempt: MITCH_MAX_TRANSMISSION_ATTEMPTS });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.retryable).toBe(false);
    expect(deadLetters.entries).toHaveLength(1);
    expect(deadLetters.entries[0].attempt).toBe(MITCH_MAX_TRANSMISSION_ATTEMPTS);
  });

  it("refuses an empty order and an unconfirmed handling profile without transmitting", async () => {
    const { provider, transport } = configuredProvider();
    expect((await provider.submit(loadedRequest({ lines: [] }))).ok).toBe(false);
    expect((await provider.submit(loadedRequest({ handlingProfile: "not_confirmed" }))).ok).toBe(false);
    expect(transport.requests).toHaveLength(0);
  });

  it("records structured audit events that never carry payload contents", async () => {
    const { provider, audit } = configuredProvider();
    await provider.submit(loadedRequest());
    const types = audit.events.map((e) => e.type);
    expect(types).toContain("transmission_attempted");
    expect(types).toContain("transmission_acknowledged");
    const serialized = JSON.stringify(audit.events);
    expect(serialized).not.toContain("LEAK-");
    expect(serialized).not.toContain("MEMBER-SECRET-ID");
    expect(serialized).not.toContain("1 Example Street");
  });

  it("does not let a broken audit recorder change the outcome", async () => {
    const transport = new FakeTransport();
    const provider = new MitchFulfillmentProvider({
      transport,
      webhookSecret: WEBHOOK_SECRET,
      auditRecorder: {
        record() {
          throw new Error("audit store down");
        },
      },
    });
    const r = await provider.submit(loadedRequest());
    expect(r.ok).toBe(true);
  });
});

describe("MitchFulfillmentProvider cancellation", () => {
  it("transmits only the order id and parses the acknowledgment", async () => {
    const { provider, transport } = configuredProvider(() => ({
      httpStatus: 200,
      body: JSON.stringify({ cancelled: true }),
    }));
    const r = await provider.cancel("FF-9");
    expect(r.ok).toBe(true);
    const sent = transport.requests[0];
    expect(sent.kind).toBe("cancel_order");
    expect(sent.transmissionId).toBe(cancelTransmissionId("FF-9"));
    expect(sent.payload).toEqual({ fulfillmentOrderId: "FF-9" });
  });

  it("treats an unacknowledged cancellation as a retryable failure", async () => {
    const { provider } = configuredProvider(() => ({ httpStatus: 200, body: JSON.stringify({}) }));
    const r = await provider.cancel("FF-9");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.retryable).toBe(true);
  });
});

describe("MitchFulfillmentProvider manual resend", () => {
  it("uses a distinct deterministic transmission id per resend reference", async () => {
    const { provider, transport, audit } = configuredProvider();
    await provider.resend(loadedRequest(), "RS-1");
    await provider.resend(loadedRequest(), "RS-1", { attempt: 2 });
    await provider.resend(loadedRequest(), "RS-2");

    const ids = transport.requests.map((r) => r.transmissionId);
    expect(ids[0]).toBe(resendTransmissionId("FF-1", "RS-1"));
    expect(ids[0]).toBe(ids[1]);
    expect(ids[2]).not.toBe(ids[0]);
    expect(ids[0]).not.toBe(submitTransmissionId("FF-1"));
    expect(audit.events.some((e) => e.type === "resend_requested")).toBe(true);
  });

  it("keeps the allowlist on the resend path", async () => {
    const { provider, transport } = configuredProvider();
    await provider.resend(loadedRequest(), "RS-1");
    const sent = transport.requests[0].payload as Record<string, unknown>;
    const allowed = new Set<string>(MITCH_ALLOWED_PAYLOAD_KEYS);
    for (const key of Object.keys(sent)) expect(allowed.has(key)).toBe(true);
    expect(JSON.stringify(sent)).not.toContain("LEAK-");
  });

  it("refuses a resend without a reference", async () => {
    const { provider, transport } = configuredProvider();
    const r = await provider.resend(loadedRequest(), "  ");
    expect(r.ok).toBe(false);
    expect(transport.requests).toHaveLength(0);
  });
});

describe("MitchFulfillmentProvider status fetch", () => {
  it("maps a partner status word and carries the tracking fields", async () => {
    const { provider } = configuredProvider(() => ({
      httpStatus: 200,
      body: JSON.stringify({
        fulfillmentOrderId: "FF-1",
        status: "SHIPPED",
        trackingNumber: "TRK-1",
        carrier: "usps",
        shippedAt: "2026-07-22T00:00:00.000Z",
        lotId: "LOT-7",
      }),
    }));
    const r = await provider.fetchStatus("FF-1");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.status).toBe("shipped");
      expect(r.value.trackingNumber).toBe("TRK-1");
      expect(r.value.carrier).toBe("usps");
      expect(r.value.lotId).toBe("LOT-7");
    }
  });

  it("errors on an unknown status word instead of guessing", async () => {
    const { provider } = configuredProvider(() => ({
      httpStatus: 200,
      body: JSON.stringify({ fulfillmentOrderId: "FF-1", status: "TELEPORTED" }),
    }));
    const r = await provider.fetchStatus("FF-1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("TELEPORTED");
  });

  it("rejects a status body for a different order", async () => {
    const { provider } = configuredProvider(() => ({
      httpStatus: 200,
      body: JSON.stringify({ fulfillmentOrderId: "FF-OTHER", status: "SHIPPED" }),
    }));
    const r = await provider.fetchStatus("FF-1");
    expect(r.ok).toBe(false);
  });
});

describe("MitchFulfillmentProvider webhook verification", () => {
  const nowSeconds = Math.floor(NOW_MS / 1000);

  function signedBody(overrides: Record<string, unknown> = {}, timestampSeconds = nowSeconds) {
    const body = JSON.stringify({
      eventId: "EV-1",
      fulfillmentOrderId: "FF-1",
      status: "SHIPPED",
      trackingNumber: "TRK-1",
      carrier: "ups",
      ...overrides,
    });
    return { body, signature: signMitchWebhook(body, WEBHOOK_SECRET, timestampSeconds) };
  }

  it("accepts a correctly signed update and maps the status and tracking", async () => {
    const { provider } = configuredProvider();
    const { body, signature } = signedBody();
    const r = await provider.verifyInboundWebhook(body, signature);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.status).toBe("shipped");
      expect(r.value.fulfillmentOrderId).toBe("FF-1");
      expect(r.value.trackingNumber).toBe("TRK-1");
      expect(r.value.carrier).toBe("ups");
    }
  });

  it("rejects a tampered body", async () => {
    const { provider } = configuredProvider();
    const { signature } = signedBody();
    const tampered = JSON.stringify({ eventId: "EV-1", fulfillmentOrderId: "FF-EVIL", status: "SHIPPED" });
    const r = await provider.verifyInboundWebhook(tampered, signature);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("Invalid signature");
  });

  it("rejects a stale timestamp and a far-future timestamp", async () => {
    const { provider } = configuredProvider();
    const stale = signedBody({}, nowSeconds - MITCH_WEBHOOK_TOLERANCE_SECONDS - 1);
    expect((await provider.verifyInboundWebhook(stale.body, stale.signature)).ok).toBe(false);

    const future = signedBody({}, nowSeconds + MITCH_WEBHOOK_TOLERANCE_SECONDS + 1);
    expect((await provider.verifyInboundWebhook(future.body, future.signature)).ok).toBe(false);
  });

  it("rejects a replayed event id", async () => {
    const { provider } = configuredProvider();
    const { body, signature } = signedBody();
    expect((await provider.verifyInboundWebhook(body, signature)).ok).toBe(true);
    const replay = await provider.verifyInboundWebhook(body, signature);
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.message).toContain("Duplicate");
  });

  it("rejects an unknown status word by name instead of faking a mapping", async () => {
    const { provider } = configuredProvider();
    const { body, signature } = signedBody({ status: "MYSTERY_STATE" });
    const r = await provider.verifyInboundWebhook(body, signature);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("MYSTERY_STATE");
  });

  it("rejects a missing or malformed signature header", async () => {
    const { provider } = configuredProvider();
    const { body } = signedBody();
    expect((await provider.verifyInboundWebhook(body, undefined)).ok).toBe(false);
    expect((await provider.verifyInboundWebhook(body, "v1=deadbeef")).ok).toBe(false);
    expect((await provider.verifyInboundWebhook(body, "t=abc,v1=zz")).ok).toBe(false);
  });

  it("rejects a body missing its event id or order id", async () => {
    const { provider } = configuredProvider();
    const { body, signature } = signedBody({ eventId: undefined });
    const r = await provider.verifyInboundWebhook(body, signature);
    expect(r.ok).toBe(false);
  });
});

describe("retry planning and status classification", () => {
  it("backs off exponentially with a hard attempt budget", () => {
    expect(planTransmissionRetry(1, true)).toEqual({ retryable: true, backoffMs: 1_000, nextAttempt: 2 });
    expect(planTransmissionRetry(2, true)).toEqual({ retryable: true, backoffMs: 2_000, nextAttempt: 3 });
    expect(planTransmissionRetry(4, true)).toEqual({ retryable: true, backoffMs: 8_000, nextAttempt: 5 });
    expect(planTransmissionRetry(MITCH_MAX_TRANSMISSION_ATTEMPTS, true).retryable).toBe(false);
    expect(planTransmissionRetry(1, false).retryable).toBe(false);
  });

  it("classifies HTTP outcomes conservatively", () => {
    expect(classifyMitchHttpStatus(200)).toEqual({ ok: true, retryable: false });
    expect(classifyMitchHttpStatus(429)).toEqual({ ok: false, retryable: true });
    expect(classifyMitchHttpStatus(503)).toEqual({ ok: false, retryable: true });
    expect(classifyMitchHttpStatus(404)).toEqual({ ok: false, retryable: false });
  });

  it("maps only the agreed status vocabulary", () => {
    expect(mapMitchStatus("shipped")).toBe("shipped");
    expect(mapMitchStatus(" ON_HOLD ")).toBe("on_hold");
    expect(mapMitchStatus("SOMETHING_NEW")).toBeNull();
  });
});

describe("environment validation and factory", () => {
  it("reports missing credential names, never values", () => {
    const missing = missingMitchEnvironment({} as NodeJS.ProcessEnv);
    expect(missing).toEqual(["MITCH_ENDPOINT_URL", "MITCH_API_KEY", "MITCH_WEBHOOK_SECRET"]);
    expect(missingMitchEnvironment({ MITCH_ENDPOINT_URL: "  " } as NodeJS.ProcessEnv)).toContain("MITCH_ENDPOINT_URL");
  });

  it("builds a disabled provider when unconfigured", () => {
    expect(createMitchFulfillmentProvider({} as NodeJS.ProcessEnv).name).toBe("disabled");
  });

  it("builds the real adapter when every credential name is present", () => {
    const p = createMitchFulfillmentProvider({
      MITCH_ENDPOINT_URL: "https://example.invalid/mitch",
      MITCH_API_KEY: "fake-test-key",
      MITCH_WEBHOOK_SECRET: "fake-test-secret",
    } as NodeJS.ProcessEnv);
    expect(p.name).toBe("mitch");
    expect(p.transportMode).toBe("api");
  });
});
