import { beforeEach, describe, expect, it, vi } from "vitest";

const fakes = vi.hoisted(() => ({ enqueue: vi.fn(async () => true) }));
vi.mock("../outbox", () => ({ enqueueNotification: fakes.enqueue }));
vi.mock("../../services/email-config", () => ({ adminRecipients: () => ["admin@example.test"] }));
import { enqueuePartnerApplicationNotifications, enqueuePartnerLifecycleNotifications } from "./notifications";

beforeEach(() => fakes.enqueue.mockClear());

describe("partner notification enqueue", () => {
  it("enqueues one deterministic customer/admin application pair", async () => {
    await enqueuePartnerApplicationNotifications({ partnerId: "partner-1", contactEmail: "member@example.test", legalName: "Member", role: "affiliate", state: "application" });
    expect(fakes.enqueue.mock.calls.map(([job]) => job.eventKey)).toEqual([
      "partner:partner-1:application:customer",
      "partner:partner-1:application:admin:admin@example.test",
    ]);
  });

  it("uses the recorded transition in lifecycle idempotency keys", async () => {
    const input = { partnerId: "partner-1", contactEmail: "member@example.test", action: "activate", state: "active", updatedAt: "2026-09-24T12:00:00Z" };
    await enqueuePartnerLifecycleNotifications(input);
    await enqueuePartnerLifecycleNotifications(input);
    expect(fakes.enqueue.mock.calls[0]?.[0].eventKey).toBe("partner:partner-1:lifecycle:2026-09-24T12:00:00Z:active:customer");
    expect(fakes.enqueue.mock.calls[2]?.[0].eventKey).toBe(fakes.enqueue.mock.calls[0]?.[0].eventKey);
  });
});
