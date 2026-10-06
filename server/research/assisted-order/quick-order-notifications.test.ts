import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderAssistedOrderOutboxEmail } from "./communications";

/**
 * Synthetic contract tests of the actual renderer and existing outbox worker.
 * Only repository/transport boundaries and unrelated token/reconciliation
 * dependencies are replaced. No database, provider, timer, or hosted service
 * is exercised. Reloading the worker below simulates lost process memory;
 * it does not establish SQL durability, transactional enqueue, or exactly-once
 * delivery by a real provider.
 */
type Row = Record<string, any>;

const fixture = vi.hoisted(() => ({
  outbox: [] as Row[],
  attempts: [] as Row[],
  sequence: 0,
  sendMode: "ok" as "ok" | "reject" | "throw",
  loseSentWrite: false,
}));

const transport = vi.hoisted(() => ({
  send: vi.fn(async (_message: Record<string, unknown>, _options?: { idempotencyKey: string }) => {
    if (fixture.sendMode === "throw") throw new Error("Synthetic transport unavailable");
    if (fixture.sendMode === "reject") return { data: null, error: { message: "Synthetic provider rejection" } };
    return { data: { id: "synthetic-provider-message" }, error: null };
  }),
}));

vi.mock("../../supabase", () => {
  function query(table: string) {
    if (!["research_notification_outbox", "research_notification_attempts"].includes(table)) {
      throw new Error(`Unexpected synthetic repository table: ${table}`);
    }
    const rows = table === "research_notification_outbox" ? fixture.outbox : fixture.attempts;
    const filters: Array<(row: Row) => boolean> = [];
    let operation: "select" | "insert" | "update" = "select";
    let values: Row = {};
    let maximum = Number.POSITIVE_INFINITY;
    const finish = () => {
      if (operation === "insert") {
        if (table === "research_notification_outbox" && rows.some(row => row.event_key === values.event_key)) {
          return { data: null, error: { code: "23505", message: "Synthetic event_key uniqueness conflict" } };
        }
        const row = {
          id: `synthetic-row-${++fixture.sequence}`,
          status: "pending",
          attempt_count: 0,
          next_attempt_at: new Date(0).toISOString(),
          updated_at: new Date(0).toISOString(),
          ...structuredClone(values),
        };
        rows.push(row);
        return { data: structuredClone(row), error: null };
      }
      const matches = rows.filter(row => filters.every(filter => filter(row))).slice(0, maximum);
      if (operation === "update") {
        // Simulate loss after provider acceptance, before the outcome is saved.
        if (fixture.loseSentWrite && table === "research_notification_outbox" && values.status === "sent") {
          fixture.loseSentWrite = false;
          throw new Error("Synthetic outcome write interrupted");
        }
        for (const row of matches) Object.assign(row, structuredClone(values));
      }
      // Detached snapshots matter: claiming a row must not mutate an earlier
      // SELECT result and accidentally change the worker's compare-and-set.
      return { data: structuredClone(matches), error: null };
    };
    const api: any = {
      select: () => api,
      insert: (value: Row) => { operation = "insert"; values = value; return api; },
      update: (value: Row) => { operation = "update"; values = value; return api; },
      eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return api; },
      in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return api; },
      lte: (key: string, value: string) => { filters.push(row => row[key] != null && row[key] <= value); return api; },
      lt: (key: string, value: string) => { filters.push(row => row[key] != null && row[key] < value); return api; },
      limit: (value: number) => { maximum = value; return api; },
      single: async () => {
        const result = finish();
        const data = Array.isArray(result.data) ? result.data[0] ?? null : result.data;
        return { data, error: result.error };
      },
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve().then(finish).then(resolve, reject),
    };
    return api;
  }
  return {
    supabaseConfigured: () => true,
    getSupabaseAdmin: () => ({ from: query, rpc: () => { throw new Error("No RPC is authorized by this synthetic fixture"); } }),
  };
});

vi.mock("../../services/email", () => ({
  getResendClient: async () => ({ client: { emails: { send: transport.send } } }),
}));
vi.mock("../../services/email-config", () => ({
  adminRecipients: () => [],
  resolveEmailConfiguration: async () => { throw new Error("Unexpected email configuration lookup"); },
}));
vi.mock("../../routes", () => ({
  requireSupabaseAdmin: () => { throw new Error("No HTTP endpoint is exercised by this fixture"); },
}));
vi.mock("../membership", () => ({
  makeResearchToken: () => { throw new Error("Quick Order notification must not mint a membership token"); },
  makeApprovedCustomerClaimToken: () => { throw new Error("Quick Order notification must not mint an account claim"); },
}));
vi.mock("../agreement-package-reconciliation", () => ({
  runAgreementPackageReconciler: async () => undefined,
}));

const TEMPLATE = "research.assisted_order.quick_order.submitted.admin.v1";
const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const REFERENCE = "XRR-20261006-A1B2C3D4E5";
const EVENT_KEY = `assisted-order:${REQUEST_ID}:quick-order-submitted:admin`;
const RECIPIENT = "synthetic-operator@example.invalid";
const NOW = new Date("2026-10-06T18:00:00.000Z");
const INTERNAL_URL = `https://xeniostechnology.com/admin/research/assisted-orders/${REQUEST_ID}`;
const PRIVATE_VALUE = "SYNTHETIC_PRIVATE_VALUE_MUST_NOT_LEAK";
const REFUSAL = "Quick Order notification payload unavailable.";

function payload(): Record<string, unknown> {
  return { schemaVersion: "quick-order-v1", requestId: REQUEST_ID, publicReference: REFERENCE };
}

function job(value = payload()) {
  return {
    eventKey: EVENT_KEY,
    eventType: "assisted_order.submitted",
    templateKey: TEMPLATE,
    recipient: RECIPIENT,
    payload: value,
  };
}

async function worker() { return import("../outbox"); }

async function restartWithSyntheticStoredRows() {
  fixture.outbox = structuredClone(fixture.outbox);
  fixture.attempts = structuredClone(fixture.attempts);
  vi.resetModules();
  return worker();
}

beforeEach(() => {
  fixture.outbox = [];
  fixture.attempts = [];
  fixture.sequence = 0;
  fixture.sendMode = "ok";
  fixture.loseSentWrite = false;
  vi.clearAllMocks();
  vi.stubEnv("SITE_URL", "https://untrusted.example.invalid");
  vi.stubEnv("RESEARCH_EMAIL_FROM", "Synthetic Research <sender@example.invalid>");
  vi.stubEnv("RESEARCH_EMAIL_REPLY_TO", "reply@example.invalid");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Quick Order reference-only notification renderer", () => {
  it("renders only the reference and a fixed trusted internal link, independent of SITE_URL", () => {
    const mail = renderAssistedOrderOutboxEmail(TEMPLATE, payload());
    expect(mail).toEqual({
      subject: `Quick Order request ${REFERENCE}`,
      text: [
        "A Quick Order request is ready for review.",
        `Reference: ${REFERENCE}`,
        `Review: ${INTERNAL_URL}`,
        "Sign in with authorized operator access.",
      ].join("\n"),
    });
    expect(mail!.text.match(/https?:\/\/\S+/g)).toEqual([INTERNAL_URL]);
    expect(mail!.text).not.toContain("untrusted.example.invalid");
    expect(mail!.text).not.toMatch(/payment|commission|shipping|affiliation|customer-entered/i);
  });

  it.each([
    "fullLegalName", "email", "mobilePhone", "shippingAddress", "billingAddress",
    "customerNotes", "lines", "agreements", "source", "sourceDetail", "declaredCode",
    "declaredAffiliateCode", "affiliateAttributionRef", "affiliationKind", "affiliationDetail",
    "documentBytes", "storagePath", "paymentEvidence", "bankAccount", "walletAddress",
    "supplierName", "wholesaleCostCents", "marginCents", "estimate", "payloadHash",
    "statusToken", "adminPath", "statusPath", "returnUrl", "url",
  ])("refuses extra field %s without echoing private content", key => {
    let failure: unknown;
    try { renderAssistedOrderOutboxEmail(TEMPLATE, { ...payload(), [key]: PRIVATE_VALUE }); }
    catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe(REFUSAL);
  });

  it.each(["adminPath", "url", "returnUrl"])("does not accept a caller-supplied link in %s", key => {
    expect(() => renderAssistedOrderOutboxEmail(TEMPLATE, {
      ...payload(), [key]: "https://untrusted.example.invalid/collect?token=synthetic",
    })).toThrow(REFUSAL);
  });

  it.each([null, undefined, [], "payload", 123])("refuses a non-record payload (%s)", value => {
    expect(() => renderAssistedOrderOutboxEmail(TEMPLATE, value as unknown as Record<string, unknown>)).toThrow(REFUSAL);
  });

  it.each(["schemaVersion", "requestId", "publicReference"])("requires %s", key => {
    const value = payload();
    delete value[key];
    expect(() => renderAssistedOrderOutboxEmail(TEMPLATE, value)).toThrow(REFUSAL);
  });

  it.each(["quick-order-v2", " quick-order-v1", null, 1])("refuses schema version %s", schemaVersion => {
    expect(() => renderAssistedOrderOutboxEmail(TEMPLATE, { ...payload(), schemaVersion })).toThrow(REFUSAL);
  });

  it.each([
    "not-a-uuid", "00000000-0000-0000-0000-000000000000",
    "11111111-1111-0111-8111-111111111111", "11111111-1111-9111-8111-111111111111",
    "11111111-1111-4111-7111-111111111111", "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
    ` ${REQUEST_ID}`, `${REQUEST_ID} `, `${REQUEST_ID}\n`, `${REQUEST_ID}\r`,
    `${REQUEST_ID}/../../outside`, `${REQUEST_ID}?token=synthetic`,
    `${REQUEST_ID}#fragment`, `https://untrusted.example.invalid/${REQUEST_ID}`, null, 42,
  ])("refuses malformed/noncanonical request ID %s", requestId => {
    expect(() => renderAssistedOrderOutboxEmail(TEMPLATE, { ...payload(), requestId })).toThrow(REFUSAL);
  });

  it.each([
    "XRR-2026106-A1B2C3D4E5", "XRR-20261006-A1B2C3D4E", "XRR-20261006-A1B2C3D4E56",
    "XRR-20261006-a1b2c3d4e5", "XRR-20261006-Z1B2C3D4E5", "OTHER-20261006-A1B2C3D4E5",
    ` ${REFERENCE}`, `${REFERENCE} `, `${REFERENCE}\n`, `${REFERENCE}\r`, `${REFERENCE}\nInjected: value`,
    `https://untrusted.example.invalid/${REFERENCE}`, null, 42,
  ])("refuses malformed/noncanonical public reference %s", publicReference => {
    expect(() => renderAssistedOrderOutboxEmail(TEMPLATE, { ...payload(), publicReference })).toThrow(REFUSAL);
  });

  it("does not register a customer or unknown-version Quick Order template", () => {
    expect(renderAssistedOrderOutboxEmail("research.assisted_order.quick_order.submitted.customer.v1", payload())).toBeNull();
    expect(renderAssistedOrderOutboxEmail("research.assisted_order.quick_order.submitted.admin.v2", payload())).toBeNull();
  });
});

describe("legacy assisted-order renderer compatibility", () => {
  it("retains the prior customer summary for a payload without Quick Order schema fields", () => {
    const mail = renderAssistedOrderOutboxEmail("research.assisted_order.submitted.customer", {
      publicReference: REFERENCE, lineCount: 3, estimatedTotalCents: 15000,
      statusPath: "/research/early-access/order-request/synthetic-private-status",
    });
    expect(mail?.subject).toBe(`Xenios Research order request received (${REFERENCE})`);
    expect(mail?.text).toContain("Requested items: 3");
    expect(mail?.text).toContain("$150.00 USD (estimate)");
    expect(mail?.text).toContain("Email does not carry a secure status credential");
    expect(mail?.text).not.toContain("synthetic-private-status");
  });

  it("preserves existing admin item/address/notes rendering without applying the new strict shape to legacy rows", () => {
    const mail = renderAssistedOrderOutboxEmail("research.assisted_order.submitted.admin", {
      publicReference: REFERENCE, fullLegalName: "Synthetic Customer", email: "customer@example.invalid",
      shippingAddress: { line1: "Synthetic address line", countryCode: "US" },
      customerNotes: "Synthetic legacy note", adminPath: `/admin/research/assisted-orders/${REQUEST_ID}`,
      lines: [{ productName: "Synthetic legacy item", quantity: 2, unitPriceCents: 2500, lineEstimateCents: 5000 }],
      estimatedTotalCents: 5000,
    });
    expect(mail?.subject).toBe(`New assisted order request ${REFERENCE}`);
    for (const expected of ["Synthetic Customer", "customer@example.invalid", "Synthetic address line", "Synthetic legacy note", "Synthetic legacy item", "$25.00 each", INTERNAL_URL]) {
      expect(mail?.text).toContain(expected);
    }
    expect(renderAssistedOrderOutboxEmail("research.assisted_order.unknown", {})).toBeNull();
  });
});

describe("Quick Order through the existing outbox dispatcher (synthetic storage/transport)", () => {
  it("sends the real renderer output using the existing row's stable event key", async () => {
    const outbox = await worker();
    expect(await outbox.enqueueNotificationOnce(job())).toBe("inserted");
    expect(await outbox.enqueueNotificationOnce(job())).toBe("already_queued");
    expect(await outbox.runOutboxTick(NOW)).toEqual({ sent: 1, retried: 0, failed: 0 });
    expect(transport.send).toHaveBeenCalledTimes(1);
    expect(transport.send).toHaveBeenCalledWith({
      from: "Synthetic Research <sender@example.invalid>", to: RECIPIENT,
      ...renderAssistedOrderOutboxEmail(TEMPLATE, payload()), replyTo: "reply@example.invalid",
    }, { idempotencyKey: EVENT_KEY });
    expect(fixture.outbox).toHaveLength(1);
    expect(fixture.outbox[0]).toMatchObject({
      event_key: EVENT_KEY, payload: payload(), application_id: null,
      status: "sent", attempt_count: 1, provider_message_id: "synthetic-provider-message",
    });
    expect(fixture.attempts).toMatchObject([{ outbox_id: fixture.outbox[0].id, attempt: 1, outcome: "sent" }]);
    expect(await outbox.runOutboxTick(new Date(NOW.getTime() + 3600000))).toEqual({ sent: 0, retried: 0, failed: 0 });
    expect(transport.send).toHaveBeenCalledTimes(1);
  });

  it.each([
    { label: "private declaration", extra: { sourceDetail: PRIVATE_VALUE } },
    { label: "external URL", extra: { adminPath: `https://untrusted.example.invalid/${PRIVATE_VALUE}` } },
    { label: "malformed reference", extra: { publicReference: PRIVATE_VALUE } },
    { label: "malformed request UUID", extra: { requestId: PRIVATE_VALUE } },
    { label: "unknown schema", extra: { schemaVersion: PRIVATE_VALUE } },
  ])("refuses $label before transport and records a generic failure", async ({ extra }) => {
    const outbox = await worker();
    await outbox.enqueueNotificationOnce(job({ ...payload(), ...extra }));
    expect(await outbox.runOutboxTick(NOW)).toEqual({ sent: 0, retried: 1, failed: 0 });
    expect(transport.send).not.toHaveBeenCalled();
    expect(fixture.outbox[0]).toMatchObject({ status: "failed_retryable", last_error_summary: REFUSAL });
    expect(fixture.attempts).toMatchObject([{ outcome: "failed", error_summary: REFUSAL }]);
    expect(JSON.stringify(fixture.attempts)).not.toContain(PRIVATE_VALUE);
  });

  it.each(["reject", "throw"] as const)("retains the event key across a %s failure, backoff, and a simulated worker restart", async mode => {
    const outbox = await worker();
    await outbox.enqueueNotificationOnce(job());
    fixture.sendMode = mode;
    expect(await outbox.runOutboxTick(NOW)).toEqual({ sent: 0, retried: 1, failed: 0 });
    const storedId = fixture.outbox[0].id;
    const retryAt = new Date(fixture.outbox[0].next_attempt_at);
    expect(retryAt.getTime() - NOW.getTime()).toBeGreaterThanOrEqual(60000);
    expect(retryAt.getTime() - NOW.getTime()).toBeLessThanOrEqual(72000);
    expect(fixture.outbox[0]).toMatchObject({ status: "failed_retryable", attempt_count: 1 });
    expect(fixture.outbox[0].completed_at).toBeUndefined();

    const resumed = await restartWithSyntheticStoredRows();
    expect(await resumed.enqueueNotificationOnce(job())).toBe("already_queued");
    fixture.sendMode = "ok";
    expect(await resumed.runOutboxTick(new Date(retryAt.getTime() - 1))).toEqual({ sent: 0, retried: 0, failed: 0 });
    expect(transport.send).toHaveBeenCalledTimes(1);
    expect(await resumed.runOutboxTick(retryAt)).toEqual({ sent: 1, retried: 0, failed: 0 });
    expect(transport.send.mock.calls.map(call => call[1])).toEqual([
      { idempotencyKey: EVENT_KEY }, { idempotencyKey: EVENT_KEY },
    ]);
    expect(fixture.outbox).toHaveLength(1);
    expect(fixture.outbox[0]).toMatchObject({ id: storedId, event_key: EVENT_KEY, status: "sent", attempt_count: 2 });
    expect(fixture.attempts.map(row => row.outcome)).toEqual(["failed", "sent"]);
  });

  it("reclaims a simulated interrupted outcome after the stale window with the same provider idempotency key", async () => {
    const outbox = await worker();
    await outbox.enqueueNotificationOnce(job());
    fixture.loseSentWrite = true;
    await expect(outbox.runOutboxTick(NOW)).rejects.toThrow("Synthetic outcome write interrupted");
    expect(fixture.outbox[0]).toMatchObject({ status: "processing", attempt_count: 0 });
    expect(transport.send).toHaveBeenCalledTimes(1);
    const storedId = fixture.outbox[0].id;
    const resumed = await restartWithSyntheticStoredRows();

    // The existing worker uses a strict '<' stale cutoff, not '<='.
    expect(await resumed.runOutboxTick(new Date(NOW.getTime() + 15 * 60000))).toEqual({ sent: 0, retried: 0, failed: 0 });
    expect(transport.send).toHaveBeenCalledTimes(1);
    expect(await resumed.runOutboxTick(new Date(NOW.getTime() + 15 * 60000 + 1))).toEqual({ sent: 1, retried: 0, failed: 0 });
    expect(transport.send.mock.calls.map(call => call[1])).toEqual([
      { idempotencyKey: EVENT_KEY }, { idempotencyKey: EVENT_KEY },
    ]);
    expect(fixture.outbox).toHaveLength(1);
    expect(fixture.outbox[0]).toMatchObject({ id: storedId, event_key: EVENT_KEY, status: "sent", attempt_count: 2 });
    expect(fixture.attempts.map(row => row.outcome)).toEqual(["sent", "failed", "sent"]);
    expect(fixture.attempts[1].error_summary).toBe("stale processing reclaim (crashed mid-send)");
    // Two synthetic provider calls are observed. Deduplication beyond the
    // stable key and SQL durability remain outside this fixture's evidence.
  });

  it("uses the existing status-guarded claim when two synthetic ticks see the same due job", async () => {
    const outbox = await worker();
    await outbox.enqueueNotificationOnce(job());
    const results = await Promise.all([outbox.runOutboxTick(NOW), outbox.runOutboxTick(NOW)]);
    expect(results.reduce((count, result) => count + result.sent, 0)).toBe(1);
    expect(transport.send).toHaveBeenCalledTimes(1);
    expect(fixture.outbox[0]).toMatchObject({ event_key: EVENT_KEY, status: "sent", attempt_count: 1 });
    expect(fixture.attempts).toHaveLength(1);
  });
});
