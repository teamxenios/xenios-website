/**
 * `enqueueNotificationOnce`: the same insert as `enqueueNotification`, with the
 * three outcomes told apart.
 *
 * The looser boolean is what every mail caller wants ("is this notification on
 * file"), and a duplicate is a success by that measure. The 72-hour shipping
 * sweep needs the stricter question ("did THIS call create the row") so a
 * repeated run cannot report an alert it did not raise. Both are proved here,
 * including that the old function's behaviour is byte-for-byte unchanged.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  configured: true,
  inserted: [] as Record<string, unknown>[],
  error: null as { message?: string; code?: string } | null,
}));

vi.mock("../supabase", () => ({
  supabaseConfigured: () => state.configured,
  getSupabaseAdmin: () => ({
    from: () => ({
      insert: async (row: Record<string, unknown>) => {
        if (state.error) return { error: state.error };
        state.inserted.push(row);
        return { error: null };
      },
    }),
  }),
}));

const INPUT = {
  eventKey: "ea_cart_shipping_overdue:abc",
  eventType: "ea_shipping_overdue_internal",
  templateKey: "ea_shipping_overdue_internal",
  recipient: "research@xeniostechnology.com",
  payload: { cartCheckoutNumber: "XEC-0123456789ABCDEF" },
};

async function subject() {
  return import("./outbox");
}

describe("enqueueNotificationOnce", () => {
  beforeEach(() => {
    state.configured = true;
    state.inserted = [];
    state.error = null;
  });

  it("reports `inserted` when the row is created", async () => {
    const { enqueueNotificationOnce } = await subject();
    expect(await enqueueNotificationOnce(INPUT)).toBe("inserted");
    expect(state.inserted).toHaveLength(1);
    expect(state.inserted[0]).toMatchObject({
      event_key: INPUT.eventKey,
      event_type: INPUT.eventType,
      template_key: INPUT.templateKey,
      recipient: INPUT.recipient,
      application_id: null,
    });
  });

  it("reports `already_queued` on the unique-violation SQLSTATE", async () => {
    const { enqueueNotificationOnce } = await subject();
    state.error = { code: "23505", message: "value violates unique constraint" };
    expect(await enqueueNotificationOnce(INPUT)).toBe("already_queued");
  });

  it("reports `already_queued` on a duplicate message even without the code", async () => {
    // PostgREST does not always surface the SQLSTATE, which is why the message
    // is checked too rather than instead.
    const { enqueueNotificationOnce } = await subject();
    state.error = { message: "duplicate key value violates unique constraint" };
    expect(await enqueueNotificationOnce(INPUT)).toBe("already_queued");
  });

  it("reports `unavailable` for any other failure", async () => {
    const { enqueueNotificationOnce } = await subject();
    state.error = { code: "08006", message: "connection failure" };
    expect(await enqueueNotificationOnce(INPUT)).toBe("unavailable");
  });

  it("reports `unavailable` when storage is not configured, and inserts nothing", async () => {
    const { enqueueNotificationOnce } = await subject();
    state.configured = false;
    expect(await enqueueNotificationOnce(INPUT)).toBe("unavailable");
    expect(state.inserted).toEqual([]);
  });
});

describe("enqueueNotification keeps its exact previous behaviour", () => {
  beforeEach(() => {
    state.configured = true;
    state.inserted = [];
    state.error = null;
  });

  it("is true on a fresh insert AND on a duplicate, which is what mail callers mean", async () => {
    const { enqueueNotification } = await subject();
    expect(await enqueueNotification(INPUT)).toBe(true);
    state.error = { code: "23505", message: "duplicate key value" };
    expect(await enqueueNotification(INPUT)).toBe(true);
  });

  it("is false when the queue is unreachable or unconfigured", async () => {
    const { enqueueNotification } = await subject();
    state.error = { code: "08006", message: "connection failure" };
    expect(await enqueueNotification(INPUT)).toBe(false);
    state.error = null;
    state.configured = false;
    expect(await enqueueNotification(INPUT)).toBe(false);
  });
});
