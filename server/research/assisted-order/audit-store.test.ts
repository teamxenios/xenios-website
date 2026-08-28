import { describe, expect, it, vi } from "vitest";

import type { AssistedOrderAuditEvent } from "./ports";
import type { SupabaseRpcClient } from "./supabase-repository";
import {
  ASSISTED_ORDER_AUDIT_ACTOR_HMAC_KEY_ENV_VAR,
  ASSISTED_ORDER_AUDIT_ACTOR_KEY_ID_ENV_VAR,
  ASSISTED_ORDER_AUDIT_APPEND_RPC,
  ASSISTED_ORDER_AUDIT_ATTESTATION,
  ASSISTED_ORDER_AUDIT_ATTESTATION_ENV_VAR,
  ASSISTED_ORDER_AUDIT_AUTHORITY_RPC,
  ASSISTED_ORDER_AUDIT_ENABLED_ENV_VAR,
  ASSISTED_ORDER_AUDIT_SCHEMA_ENV_VAR,
  ASSISTED_ORDER_AUDIT_SCHEMA_VERSION,
  AssistedOrderAuditStoreError,
  assistedOrderAuditActorTypes,
  assistedOrderAuditEventTypes,
  resolveAssistedOrderAuditAuthority,
} from "./audit-store";

const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID = "22222222-2222-4222-8222-222222222222";
const DOCUMENT_ID = "33333333-3333-4333-8333-333333333333";
const MEMBER_ID = "44444444-4444-4444-8444-444444444444";
const OCCURRED_AT = "2026-08-28T12:34:56.789Z";
const REQUEST_FINGERPRINT = "a".repeat(64);
const ACTOR_KEY = Buffer.alloc(32, 9).toString("base64url");

function exactAuthority() {
  return {
    schemaVersion: ASSISTED_ORDER_AUDIT_SCHEMA_VERSION,
    attestation: ASSISTED_ORDER_AUDIT_ATTESTATION,
    eventTypes: assistedOrderAuditEventTypes,
    actorTypes: assistedOrderAuditActorTypes,
    evidencePolicy: "bounded_allowlist_v1",
    actorIdentityPolicy: "hmac_sha256_alias_v1",
    appendOnly: true,
  };
}

function exactEnv(
  overrides: Readonly<Record<string, string | undefined>> = {},
): NodeJS.ProcessEnv {
  return {
    [ASSISTED_ORDER_AUDIT_ENABLED_ENV_VAR]: "true",
    [ASSISTED_ORDER_AUDIT_SCHEMA_ENV_VAR]: ASSISTED_ORDER_AUDIT_SCHEMA_VERSION,
    [ASSISTED_ORDER_AUDIT_ATTESTATION_ENV_VAR]: ASSISTED_ORDER_AUDIT_ATTESTATION,
    [ASSISTED_ORDER_AUDIT_ACTOR_KEY_ID_ENV_VAR]: "primary-20260828",
    [ASSISTED_ORDER_AUDIT_ACTOR_HMAC_KEY_ENV_VAR]: ACTOR_KEY,
    ...overrides,
  } as NodeJS.ProcessEnv;
}

function submittedEvent(
  overrides: Partial<AssistedOrderAuditEvent> = {},
): AssistedOrderAuditEvent {
  return {
    eventId: EVENT_ID,
    eventType: "assisted_order.submitted",
    requestId: REQUEST_ID,
    actorType: "member",
    actorId: MEMBER_ID,
    evidence: {
      lineCount: 2,
      workflowModes: ["request_pricing", "direct_order_request"],
      requestFingerprint: REQUEST_FINGERPRINT,
    },
    occurredAt: OCCURRED_AT,
    ...overrides,
  } as AssistedOrderAuditEvent;
}

function rpcHarness(options: Readonly<{
  authority?: unknown;
  authorityError?: Readonly<{ message: string; code?: string }> | null;
  appendError?: Readonly<{ message: string; code?: string }> | null;
  mutateAppendResponse?: (
    response: Record<string, unknown>,
  ) => Record<string, unknown>;
}> = {}) {
  const calls: Array<{
    name: string;
    args: Readonly<Record<string, unknown>> | undefined;
  }> = [];
  const rpc: SupabaseRpcClient = {
    rpc: vi.fn(async (name, args) => {
      calls.push({ name, args });
      if (name === ASSISTED_ORDER_AUDIT_AUTHORITY_RPC) {
        return {
          data: Object.prototype.hasOwnProperty.call(options, "authority")
            ? options.authority
            : exactAuthority(),
          error: options.authorityError ?? null,
        };
      }
      if (name !== ASSISTED_ORDER_AUDIT_APPEND_RPC) {
        return { data: null, error: { message: "unexpected rpc" } };
      }
      if (options.appendError) {
        return { data: null, error: options.appendError };
      }
      const event = args?.p_event as Record<string, unknown>;
      const response: Record<string, unknown> = {
        state: "inserted",
        eventId: event.eventId,
        eventKey: event.eventKey,
        requestId: event.requestId,
        eventType: event.eventType,
        eventFingerprint: event.eventFingerprint,
        schemaVersion: ASSISTED_ORDER_AUDIT_SCHEMA_VERSION,
        attestation: ASSISTED_ORDER_AUDIT_ATTESTATION,
      };
      return {
        data: options.mutateAppendResponse
          ? options.mutateAppendResponse(response)
          : response,
        error: null,
      };
    }),
  };
  return { rpc, calls };
}

async function resolvedSink(
  harness = rpcHarness(),
): Promise<{
  sink: NonNullable<Awaited<ReturnType<typeof resolveAssistedOrderAuditAuthority>>["authority"]>["sink"];
  calls: typeof harness.calls;
}> {
  const result = await resolveAssistedOrderAuditAuthority({
    env: exactEnv(),
    rpc: harness.rpc,
  });
  if (!result.available) throw new Error(result.refusalReason);
  return { sink: result.authority.sink, calls: harness.calls };
}

describe("resolveAssistedOrderAuditAuthority", () => {
  it("is unavailable by default and does not probe an RPC", async () => {
    const h = rpcHarness();
    const result = await resolveAssistedOrderAuditAuthority({
      env: {},
      rpc: h.rpc,
    });
    expect(result).toEqual({
      available: false,
      authority: null,
      refusalReason: "assisted_order_audit_disabled",
    });
    expect(h.calls).toEqual([]);
  });

  it.each([
    [ASSISTED_ORDER_AUDIT_SCHEMA_ENV_VAR, "stale", "assisted_order_audit_schema_config_invalid"],
    [ASSISTED_ORDER_AUDIT_ATTESTATION_ENV_VAR, "stale", "assisted_order_audit_attestation_config_invalid"],
    [ASSISTED_ORDER_AUDIT_ACTOR_KEY_ID_ENV_VAR, "INVALID KEY", "assisted_order_audit_actor_key_id_invalid"],
    [ASSISTED_ORDER_AUDIT_ACTOR_HMAC_KEY_ENV_VAR, "too-short", "assisted_order_audit_actor_key_invalid"],
  ])("refuses invalid exact config %s", async (name, value, refusalReason) => {
    const h = rpcHarness();
    const result = await resolveAssistedOrderAuditAuthority({
      env: exactEnv({ [name]: value }),
      rpc: h.rpc,
    });
    expect(result).toMatchObject({ available: false, refusalReason });
    expect(h.calls).toEqual([]);
  });

  it("refuses an enabled configuration with no RPC", async () => {
    const result = await resolveAssistedOrderAuditAuthority({
      env: exactEnv(),
      rpc: null,
    });
    expect(result).toMatchObject({
      available: false,
      refusalReason: "assisted_order_audit_rpc_missing",
    });
  });

  it.each([
    null,
    {},
    { ...exactAuthority(), extra: true },
    { ...exactAuthority(), appendOnly: false },
    { ...exactAuthority(), eventTypes: [...assistedOrderAuditEventTypes].reverse() },
    { ...exactAuthority(), actorIdentityPolicy: "raw_actor_id" },
  ])("rejects a malformed or stale database authority %#", async (authority) => {
    const h = rpcHarness({ authority });
    const result = await resolveAssistedOrderAuditAuthority({
      env: exactEnv(),
      rpc: h.rpc,
    });
    expect(result).toMatchObject({
      available: false,
      refusalReason: "assisted_order_audit_authority_unavailable",
    });
  });

  it("does not reflect authority RPC error content", async () => {
    const secretMarker = "do-not-reflect-upstream-details";
    const h = rpcHarness({
      authorityError: { message: secretMarker, code: "XX000" },
    });
    const result = await resolveAssistedOrderAuditAuthority({
      env: exactEnv(),
      rpc: h.rpc,
    });
    expect(JSON.stringify(result)).not.toContain(secretMarker);
  });

  it("returns a branded sink only after the exact authority probe", async () => {
    const h = rpcHarness();
    const result = await resolveAssistedOrderAuditAuthority({
      env: exactEnv(),
      rpc: h.rpc,
    });
    expect(result.available).toBe(true);
    expect(h.calls).toEqual([
      { name: ASSISTED_ORDER_AUDIT_AUTHORITY_RPC, args: undefined },
    ]);
  });
});

describe("durable assisted-order audit event projection", () => {
  it("HMAC-aliases a member and sends only the strict safe record", async () => {
    const h = rpcHarness();
    const { sink, calls } = await resolvedSink(h);
    await sink.record(submittedEvent());
    const append = calls[1];
    expect(append.name).toBe(ASSISTED_ORDER_AUDIT_APPEND_RPC);
    expect(append.args).toMatchObject({
      p_schema_version: ASSISTED_ORDER_AUDIT_SCHEMA_VERSION,
      p_attestation: ASSISTED_ORDER_AUDIT_ATTESTATION,
    });
    const event = append.args?.p_event as Record<string, unknown>;
    expect(Object.keys(event).sort()).toEqual([
      "actorAlias",
      "actorType",
      "eventFingerprint",
      "eventId",
      "eventKey",
      "eventType",
      "evidence",
      "occurredAt",
      "requestId",
    ]);
    expect(event.actorAlias).toMatch(/^aa1:primary-20260828:[0-9a-f]{64}$/);
    const serialized = JSON.stringify(append.args);
    expect(serialized).not.toContain(MEMBER_ID);
    expect(serialized).not.toContain("email");
    expect(serialized).not.toContain("address");
    expect(serialized).not.toContain("note");
    expect(serialized).not.toContain("token");
    expect(serialized).not.toContain("url");
    expect(serialized).not.toContain("path");
    expect(serialized).not.toContain("error");
  });

  it("normalizes evidence arrays into deterministic sorted sets", async () => {
    const h = rpcHarness();
    const { sink, calls } = await resolvedSink(h);
    await sink.record(submittedEvent());
    expect(
      (calls[1].args?.p_event as Record<string, any>).evidence.workflowModes,
    ).toEqual(["direct_order_request", "request_pricing"]);
  });

  it("accepts every closed event vocabulary and projects bounded evidence", async () => {
    const h = rpcHarness();
    const { sink, calls } = await resolvedSink(h);
    const events: AssistedOrderAuditEvent[] = [
      submittedEvent(),
      {
        eventId: "55555555-5555-4555-8555-555555555555",
        eventType: "assisted_order.status_changed",
        requestId: REQUEST_ID,
        actorType: "admin",
        actorId: "Named Operator",
        evidence: {
          from: "payment_review",
          to: "paid",
          authorityEvidenceKinds: ["payment_verification"],
        },
        occurredAt: OCCURRED_AT,
      },
      {
        eventId: "66666666-6666-4666-8666-666666666666",
        eventType: "assisted_order.document_upload_authorized",
        requestId: REQUEST_ID,
        actorType: "early_access_session",
        actorId: "b".repeat(64),
        evidence: {
          documentId: DOCUMENT_ID,
          documentType: "government_id",
          side: "front",
          mimeType: "image/jpeg",
          sizeBytes: 1024,
        },
        occurredAt: OCCURRED_AT,
      },
      {
        eventId: "77777777-7777-4777-8777-777777777777",
        eventType: "assisted_order.document_upload_completion_authorized",
        requestId: REQUEST_ID,
        actorType: "member",
        actorId: MEMBER_ID,
        evidence: {
          documentId: DOCUMENT_ID,
          documentType: "business_document",
          sizeBytes: 2048,
        },
        occurredAt: OCCURRED_AT,
      },
      {
        eventId: "88888888-8888-4888-8888-888888888888",
        eventType: "assisted_order.document_download_authorized",
        requestId: REQUEST_ID,
        actorType: "system",
        actorId: null,
        evidence: { documentId: DOCUMENT_ID },
        occurredAt: OCCURRED_AT,
      },
    ];
    for (const event of events) await sink.record(event);
    const writtenTypes = calls
      .slice(1)
      .map((call) => (call.args?.p_event as Record<string, unknown>).eventType);
    expect(writtenTypes).toEqual(assistedOrderAuditEventTypes);
  });

  it.each([
    { extraTopLevel: "raw request body" },
    { evidence: { lineCount: 1, workflowModes: ["direct_order_request"], requestFingerprint: REQUEST_FINGERPRINT, url: "https://forbidden.example" } },
    { evidence: { lineCount: 1, workflowModes: ["direct_order_request"], requestFingerprint: REQUEST_FINGERPRINT, filePath: "/private/file" } },
    { evidence: { lineCount: 1, workflowModes: ["direct_order_request"], requestFingerprint: REQUEST_FINGERPRINT, note: "private" } },
    { evidence: { lineCount: 1, workflowModes: ["direct_order_request"], requestFingerprint: REQUEST_FINGERPRINT, token: "private" } },
  ])("refuses extra or sensitive-shaped input before the RPC %#", async (mutation) => {
    const h = rpcHarness();
    const { sink, calls } = await resolvedSink(h);
    await expect(
      sink.record({ ...submittedEvent(), ...mutation } as never),
    ).rejects.toMatchObject({ code: "invalid_event" });
    expect(calls).toHaveLength(1);
  });

  it("refuses the superseded raw status authority evidence shape", async () => {
    const h = rpcHarness();
    const { sink, calls } = await resolvedSink(h);
    await expect(
      sink.record({
        eventId: EVENT_ID,
        eventType: "assisted_order.status_changed",
        requestId: REQUEST_ID,
        actorType: "admin",
        actorId: "operator@example.com",
        evidence: {
          from: "payment_review",
          to: "paid",
          authorityEvidence: {
            paymentVerificationId: "raw-provider-or-proof-id",
          },
        },
        occurredAt: OCCURRED_AT,
      } as never),
    ).rejects.toMatchObject({ code: "invalid_event" });
    expect(calls).toHaveLength(1);
  });

  it.each([
    ["member", null],
    ["member", "not-a-uuid"],
    ["early_access_session", "not-a-hash"],
    ["admin", ""],
    ["admin", "contains\ncontrol"],
    ["system", "must-be-null"],
  ])("enforces the explicit actor identity policy for %s", async (actorType, actorId) => {
    const h = rpcHarness();
    const { sink, calls } = await resolvedSink(h);
    await expect(
      sink.record(submittedEvent({ actorType, actorId } as never)),
    ).rejects.toMatchObject({ code: "invalid_event" });
    expect(calls).toHaveLength(1);
  });

  it.each([
    { eventId: "not-a-uuid" },
    { requestId: "not-a-uuid" },
    { occurredAt: "2026-08-28" },
    { eventType: "assisted_order.everything" },
    { evidence: { lineCount: 0, workflowModes: ["direct_order_request"], requestFingerprint: REQUEST_FINGERPRINT } },
    { evidence: { lineCount: 1, workflowModes: ["direct_order_request", "direct_order_request"], requestFingerprint: REQUEST_FINGERPRINT } },
  ])("rejects malformed event values before storage %#", async (mutation) => {
    const h = rpcHarness();
    const { sink, calls } = await resolvedSink(h);
    await expect(
      sink.record(submittedEvent(mutation as never)),
    ).rejects.toBeInstanceOf(AssistedOrderAuditStoreError);
    expect(calls).toHaveLength(1);
  });
});

describe("strict append response and failure behavior", () => {
  it("accepts an exact idempotent replay", async () => {
    const h = rpcHarness({
      mutateAppendResponse: (response) => ({ ...response, state: "replayed" }),
    });
    const { sink } = await resolvedSink(h);
    await expect(sink.record(submittedEvent())).resolves.toBeUndefined();
  });

  it("maps a conflicting duplicate without reflecting database text", async () => {
    const marker = "private duplicate database detail";
    const h = rpcHarness({
      appendError: { code: "23505", message: marker },
    });
    const { sink } = await resolvedSink(h);
    const error = await sink.record(submittedEvent()).catch((reason) => reason);
    expect(error).toMatchObject({ code: "conflicting_duplicate" });
    expect(String(error)).not.toContain(marker);
  });

  it("maps every other upstream failure to a generic unavailable error", async () => {
    const marker = "private request row detail";
    const h = rpcHarness({
      appendError: { code: "XX000", message: marker },
    });
    const { sink } = await resolvedSink(h);
    const error = await sink.record(submittedEvent()).catch((reason) => reason);
    expect(error).toMatchObject({ code: "store_unavailable" });
    expect(String(error)).not.toContain(marker);
  });

  it.each([
    () => null,
    (response: Record<string, unknown>) => ({ ...response, extra: true }),
    (response: Record<string, unknown>) => ({ ...response, state: "maybe" }),
    (response: Record<string, unknown>) => ({ ...response, eventId: REQUEST_ID }),
    (response: Record<string, unknown>) => ({ ...response, eventFingerprint: "0".repeat(64) }),
    (response: Record<string, unknown>) => ({ ...response, attestation: "stale" }),
  ])("fails closed on a malformed RPC response %#", async (mutate) => {
    const h = rpcHarness({
      mutateAppendResponse: mutate as (
        response: Record<string, unknown>,
      ) => Record<string, unknown>,
    });
    const { sink } = await resolvedSink(h);
    await expect(sink.record(submittedEvent())).rejects.toMatchObject({
      code: "store_unavailable",
    });
  });
});
