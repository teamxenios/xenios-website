import { afterEach, describe, expect, it } from "vitest";
import { InMemoryStatusRecoveryStore } from "./memory-store";
import { statusRecoveryCrypto } from "./crypto";
import { prepareStatusRecoveryOutboxEmail } from "./notification";
import type { StatusRecoveryStatusView } from "../../../shared/research/status-recovery/contract";

const originalSecret = process.env.RESEARCH_SESSION_SECRET;
afterEach(() => {
  if (originalSecret === undefined) delete process.env.RESEARCH_SESSION_SECRET;
  else process.env.RESEARCH_SESSION_SECRET = originalSecret;
});

describe("status recovery outbox preparation", () => {
  it("re-reads the canonical recipient and reproduces the same digest on a retry", async () => {
    process.env.RESEARCH_SESSION_SECRET = "synthetic-status-recovery-secret";
    const store = new InMemoryStatusRecoveryStore();
    const subject = {
      subjectType: "assisted_order" as const,
      subjectId: "11111111-1111-4111-8111-111111111111",
      ownerId: null,
      publicReference: "XRR-20260927-ABCDEF1234",
      canonicalEmail: "canonical@example.invalid",
    };
    store.addSubject(subject, { subjectType: "assisted_order", reference: subject.publicReference, status: "submitted", statusLabel: "Received", whatHappened: "Received", nextStep: "Wait", nextStepOwner: "xenios", returnPath: "/status", supportPath: "/support", updatedAt: "2026-09-27T20:00:00.000Z", timeline: [] } satisfies StatusRecoveryStatusView);
    const job = {
      event_key: "status-recovery:event",
      recipient: "attacker@example.invalid",
      payload: {
        subjectType: "assisted_order",
        subjectId: subject.subjectId,
        ownerId: null,
        publicReference: subject.publicReference,
        idempotencyKey: "a".repeat(64),
      },
    };
    const input = { job, store, crypto: statusRecoveryCrypto, clock: { now: () => new Date("2026-09-27T20:00:00.000Z"), nowMs: () => 0 }, siteUrl: "https://xeniostechnology.com" };
    const first = await prepareStatusRecoveryOutboxEmail(input);
    const second = await prepareStatusRecoveryOutboxEmail(input);
    expect(first).toEqual(second);
    expect(first?.to).toBe(subject.canonicalEmail);
    expect(first?.text).not.toContain("attacker@example.invalid");
    expect(first?.text).toMatch(/https:\/\/xeniostechnology\.com\/status#recovery=[A-Za-z0-9_-]{43}/u);
    const rawToken = /#recovery=([A-Za-z0-9_-]{43})/u.exec(first?.text ?? "")?.[1];
    expect(rawToken).toHaveLength(43);
    expect(JSON.stringify(store.tokenRows())).not.toContain(rawToken);
    expect(JSON.stringify(store.tokenRows())).not.toContain("#recovery=");
    expect(store.tokenRows()).toHaveLength(1);
  });

  it("rejects a mismatched binding and never trusts an unsafe configured origin", async () => {
    process.env.RESEARCH_SESSION_SECRET = "synthetic-status-recovery-secret";
    const store = new InMemoryStatusRecoveryStore();
    const prepared = await prepareStatusRecoveryOutboxEmail({
      job: { event_key: "event", recipient: "other@example.invalid", payload: { subjectType: "assisted_order", subjectId: "11111111-1111-4111-8111-111111111111", ownerId: null, idempotencyKey: "a".repeat(64) } },
      store,
      crypto: statusRecoveryCrypto,
      clock: { now: () => new Date(), nowMs: () => 0 },
      siteUrl: "http://evil.example/path",
    });
    expect(prepared).toBeNull();
  });
});
