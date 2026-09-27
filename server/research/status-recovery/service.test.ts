import { describe, expect, it, vi } from "vitest";
import {
  STATUS_RECOVERY_NEUTRAL_RESPONSE,
  type StatusRecoveryStatusView,
} from "../../../shared/research/status-recovery/contract";
import { InMemoryStatusRecoveryStore } from "./memory-store";
import type { StatusRecoveryCrypto } from "./ports";
import { StatusRecoveryCredentialError, StatusRecoveryService } from "./service";

const subject = Object.freeze({
  subjectType: "assisted_order" as const,
  subjectId: "11111111-1111-4111-8111-111111111111",
  ownerId: "22222222-2222-4222-8222-222222222222",
  publicReference: "XRR-20260927-ABCDEF1234",
  canonicalEmail: "owner@example.invalid",
});

const view: StatusRecoveryStatusView = Object.freeze({
  subjectType: "assisted_order",
  reference: subject.publicReference,
  status: "reviewing",
  statusLabel: "In review",
  whatHappened: "Xenios is reviewing your request.",
  nextStep: "Wait for the review update from Xenios.",
  nextStepOwner: "xenios",
  returnPath: "/status",
  supportPath: "/support",
  updatedAt: "2026-09-27T20:00:00.000Z",
  timeline: Object.freeze([]),
});

function fixture() {
  const store = new InMemoryStatusRecoveryStore();
  store.addSubject(subject, view);
  let nowMs = Date.parse("2026-09-27T20:00:00.000Z");
  let sequence = 0;
  const crypto: StatusRecoveryCrypto = Object.freeze({
    randomToken: () => `${String(++sequence).padStart(43, "A")}`,
    deliveryToken: () => "D".repeat(43),
    digestToken: (value) => `digest:${value}`,
    stableHash: (value) => `stable:${value}`,
  });
  const enqueue = vi.fn(async () => true);
  const sleeps: number[] = [];
  const service = new StatusRecoveryService({
    store,
    outbox: { enqueue },
    rateLimit: async () => true,
    clock: { now: () => new Date(nowMs), nowMs: () => nowMs },
    crypto,
    minimumResponseMs: 75,
    sleep: async (milliseconds) => { sleeps.push(milliseconds); },
  });
  return { store, service, enqueue, sleeps, setNow: (value: string) => { nowMs = Date.parse(value); } };
}

describe("status recovery service", () => {
  it.each([
    ["eligible", subject.publicReference, subject.canonicalEmail],
    ["wrong email", subject.publicReference, "other@example.invalid"],
    ["unknown", "XRR-20260927-0000000000", subject.canonicalEmail],
    ["malformed", "../private", subject.canonicalEmail],
    ["Care-shaped", "CARE-ABC12345", subject.canonicalEmail],
  ])("returns the invariant neutral response for %s input", async (_label, reference, email) => {
    const { service, sleeps } = fixture();
    await expect(service.request({ reference, email }, "198.51.100.4")).resolves.toEqual(STATUS_RECOVERY_NEUTRAL_RESPONSE);
    expect(sleeps).toEqual([75]);
  });

  it("queues one canonical-recipient event for an eligible match", async () => {
    const { service, enqueue } = fixture();
    await service.request({ reference: subject.publicReference.toLowerCase(), email: " OWNER@EXAMPLE.INVALID " }, "198.51.100.4");
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0][0]).toMatchObject({
      recipient: subject.canonicalEmail,
      applicationId: subject.subjectId,
      templateKey: "research.status_recovery.link",
      payload: { subjectId: subject.subjectId, ownerId: subject.ownerId },
    });
  });

  it("uses one stable outbox identity for unchanged replay in the same bucket", async () => {
    const { service, enqueue } = fixture();
    await service.request({ reference: subject.publicReference, email: subject.canonicalEmail }, "198.51.100.4");
    await service.request({ reference: subject.publicReference, email: subject.canonicalEmail }, "198.51.100.4");
    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(enqueue.mock.calls[0][0].eventKey).toBe(enqueue.mock.calls[1][0].eventKey);
    expect(enqueue.mock.calls[0][0].payload.idempotencyKey).toBe(enqueue.mock.calls[1][0].payload.idempotencyKey);
  });

  it("never turns rate-limit or outbox failure into a public oracle", async () => {
    const { store } = fixture();
    const service = new StatusRecoveryService({
      store,
      outbox: { enqueue: async () => { throw new Error("synthetic outbox failure"); } },
      rateLimit: async () => true,
      clock: { now: () => new Date("2026-09-27T20:00:00.000Z"), nowMs: () => 1 },
      crypto: { randomToken: () => "S".repeat(43), deliveryToken: () => "D".repeat(43), digestToken: (v) => v, stableHash: (v) => v },
      minimumResponseMs: 0,
    });
    await expect(service.request({ reference: subject.publicReference, email: subject.canonicalEmail }, "client")).resolves.toEqual(STATUS_RECOVERY_NEUTRAL_RESPONSE);
  });

  it("atomically consumes one token, restores only its subject, expires, and revokes the session", async () => {
    const { store, service, setNow } = fixture();
    await store.prepareDelivery({
      subjectType: subject.subjectType,
      subjectId: subject.subjectId,
      ownerId: subject.ownerId,
      idempotencyKey: "i".repeat(64),
      tokenDigest: "digest:" + "T".repeat(43),
      createdAt: "2026-09-27T20:00:00.000Z",
      expiresAt: "2026-09-27T20:30:00.000Z",
      source: "public_status_recovery",
    });
    const rawSession = await service.exchange("T".repeat(43));
    await expect(service.exchange("T".repeat(43))).rejects.toBeInstanceOf(StatusRecoveryCredentialError);
    await expect(service.status(rawSession)).resolves.toEqual(view);
    await service.end(rawSession);
    await expect(service.status(rawSession)).rejects.toBeInstanceOf(StatusRecoveryCredentialError);

    setNow("2026-09-28T20:00:01.000Z");
    await expect(service.status(rawSession)).rejects.toBeInstanceOf(StatusRecoveryCredentialError);
  });
});
