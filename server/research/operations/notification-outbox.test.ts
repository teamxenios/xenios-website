import { describe, expect, it, vi } from "vitest";
import {
  InMemoryOutboxRepository,
  NotificationOutbox,
  type NotificationProvider,
  type ProviderResult,
} from "./notification-outbox";

const NOW = new Date("2026-07-25T16:00:00.000Z");

function provider(result: ProviderResult): NotificationProvider & { send: ReturnType<typeof vi.fn> } {
  return { send: vi.fn(async () => result) };
}

describe("durable multi-channel notification outbox", () => {
  it("enqueues once per audience, channel, and event dedupe key", () => {
    const repo = new InMemoryOutboxRepository();
    const outbox = new NotificationOutbox(repo, {});
    const input = {
      audience: { kind: "operator" as const, id: "ops-1" },
      channels: ["in_app", "email"] as const,
      topic: "fulfillment.exception",
      dedupeKey: "exception-1",
      sensitivity: "operational" as const,
      message: { title: "Fulfillment exception", body: "Order XR-1042 needs review." },
      occurredAt: NOW,
    };
    expect(outbox.enqueue(input)).toMatchObject({ ok: true, idempotent: false });
    expect(outbox.enqueue(input)).toMatchObject({ ok: true, idempotent: true });
    expect(outbox.list()).toHaveLength(2);
  });

  it("sends each message once and preserves provider evidence", async () => {
    const email = provider({ ok: true, providerReference: "email-42" });
    const outbox = new NotificationOutbox(new InMemoryOutboxRepository(), { email });
    outbox.enqueue({
      audience: { kind: "affiliate", id: "aff-1" },
      channels: ["email"],
      topic: "affiliate.approved",
      dedupeKey: "approval-1",
      sensitivity: "customer_sensitive",
      message: { title: "Account approved", body: "Sign in to finish activation." },
      occurredAt: NOW,
    });
    expect(await outbox.run(NOW)).toMatchObject({ attempted: 1, sent: 1, failed: 0 });
    expect(await outbox.run(NOW)).toMatchObject({ attempted: 0, sent: 0 });
    expect(email.send).toHaveBeenCalledTimes(1);
    expect(outbox.list()[0]).toMatchObject({
      status: "sent",
      attemptCount: 1,
      providerReference: "email-42",
    });
  });

  it("retries a transient provider failure with bounded backoff", async () => {
    const email = provider({ ok: false, retryable: true, code: "rate_limited" });
    const outbox = new NotificationOutbox(new InMemoryOutboxRepository(), { email });
    outbox.enqueue({
      audience: { kind: "operator", id: "ops-1" },
      channels: ["email"],
      topic: "shipment.failure",
      dedupeKey: "shipment-1",
      sensitivity: "operational",
      message: { title: "Shipment update failed", body: "The carrier status needs another attempt." },
      occurredAt: NOW,
    });
    await outbox.run(NOW);
    const record = outbox.list()[0];
    expect(record).toMatchObject({ status: "failed_retryable", attemptCount: 1, failureCode: "rate_limited" });
    expect(record.nextAttemptAt).toBe("2026-07-25T16:01:00.000Z");
    expect((await outbox.run(new Date("2026-07-25T16:00:30.000Z"))).attempted).toBe(0);
  });

  it("is SMS-ready but fails visibly and retryably when no SMS provider exists", async () => {
    const outbox = new NotificationOutbox(new InMemoryOutboxRepository(), {});
    outbox.enqueue({
      audience: { kind: "operator", id: "ops-1" },
      channels: ["sms"],
      topic: "operations.alert",
      dedupeKey: "alert-1",
      sensitivity: "operational",
      message: { title: "Operations alert", body: "Open the secure command center." },
      occurredAt: NOW,
    });
    await outbox.run(NOW);
    expect(outbox.list()[0]).toMatchObject({
      channel: "sms",
      status: "failed_retryable",
      failureCode: "provider_unavailable",
      attemptCount: 1,
    });
  });

  it("never sends customer-sensitive content over Telegram or SMS", async () => {
    const telegram = provider({ ok: true, providerReference: "tg-1" });
    const sms = provider({ ok: true, providerReference: "sms-1" });
    const outbox = new NotificationOutbox(new InMemoryOutboxRepository(), { telegram, sms });
    const result = outbox.enqueue({
      audience: { kind: "member", id: "opaque-member" },
      channels: ["telegram", "sms", "email"],
      topic: "member.private",
      dedupeKey: "private-1",
      sensitivity: "customer_sensitive",
      message: { title: "Private update", body: "Open your secure account to read it." },
      occurredAt: NOW,
    });
    expect(result.ok).toBe(true);
    expect(outbox.list("suppressed").map((record) => record.channel).sort()).toEqual(["sms", "telegram"]);
    await outbox.run(NOW);
    expect(telegram.send).not.toHaveBeenCalled();
    expect(sms.send).not.toHaveBeenCalled();
  });

  it("also detects clinical content mislabeled as operational and suppresses external delivery", async () => {
    const telegram = provider({ ok: true, providerReference: "tg-1" });
    const outbox = new NotificationOutbox(new InMemoryOutboxRepository(), { telegram });
    outbox.enqueue({
      audience: { kind: "member", id: "opaque-member" },
      channels: ["telegram"],
      topic: "bad.payload",
      dedupeKey: "bad-1",
      sensitivity: "operational",
      message: { title: "Patient update", body: "Your prescription is ready." },
      occurredAt: NOW,
    });
    expect(outbox.list()[0]).toMatchObject({ status: "suppressed", failureCode: "external_privacy_policy" });
    await outbox.run(NOW);
    expect(telegram.send).not.toHaveBeenCalled();
  });
});
