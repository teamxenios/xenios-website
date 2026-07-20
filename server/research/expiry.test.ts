import crypto from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The approval-expiry sweep: lapsed approvals flip to "expired" with an audit
// event, status-guarded, idempotent, and blind to everything it must not touch.

const state = vi.hoisted(() => ({
  apps: [] as any[],
  events: [] as any[],
}));

vi.mock("../supabase", () => {
  function query(table: string) {
    const list = table === "research_applications" ? state.apps : state.events;
    let mode: "select" | "insert" | "update" = "select";
    let insertPayload: any = null;
    let updatePayload: any = null;
    const eqFilters: Array<[string, any]> = [];
    const ltFilters: Array<[string, any]> = [];
    let limitN: number | null = null;

    const matches = (r: any) =>
      eqFilters.every(([c, v]) => r[c] === v) && ltFilters.every(([c, v]) => r[c] != null && r[c] < v);
    const finish = () => {
      if (mode === "insert") {
        const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...insertPayload };
        list.push(row);
        return { data: row, error: null };
      }
      if (mode === "update") {
        const targets = list.filter(matches);
        if (!targets.length) return { data: null, error: null };
        Object.assign(targets[0], updatePayload);
        return { data: targets[0], error: null };
      }
      let rows = list.filter(matches);
      if (limitN != null) rows = rows.slice(0, limitN);
      return { data: rows, error: null };
    };

    const api: any = {
      select: () => api,
      insert: (p: any) => { mode = "insert"; insertPayload = p; return api; },
      update: (p: any) => { mode = "update"; updatePayload = p; return api; },
      eq: (c: string, v: any) => { eqFilters.push([c, v]); return api; },
      lt: (c: string, v: any) => { ltFilters.push([c, v]); return api; },
      limit: (n: number) => { limitN = n; return api; },
      single: async () => {
        const r = finish();
        const d = Array.isArray(r.data) ? r.data[0] : r.data;
        return d ? { data: d, error: null } : { data: null, error: r.error ?? { message: "not found" } };
      },
      then: (resolve: any) => resolve(finish()),
    };
    return api;
  }
  return {
    supabaseConfigured: () => true,
    getSupabaseAdmin: () => ({ from: query }),
    getSupabaseAnon: () => { throw new Error("not used"); },
  };
});

import { sweepExpiredApprovals } from "./expiry";

const DAY = 24 * 60 * 60 * 1000;

function seedApp(overrides: Record<string, unknown> = {}) {
  const row = {
    id: crypto.randomUUID(),
    status: "approved_pending_payment",
    approval_expires_at: new Date(Date.now() - DAY).toISOString(),
    ...overrides,
  };
  state.apps.push(row);
  return row;
}

beforeEach(() => {
  state.apps.length = 0;
  state.events.length = 0;
});

describe("approval-expiry sweep", () => {
  it("expires a lapsed approval and writes the audit event", async () => {
    const row = seedApp();
    const count = await sweepExpiredApprovals(new Date());
    expect(count).toBe(1);
    expect(row.status).toBe("expired");
    expect(state.events).toHaveLength(1);
    expect(state.events[0]).toMatchObject({
      application_id: row.id,
      previous_status: "approved_pending_payment",
      new_status: "expired",
      actor_type: "system",
      reason_code: "approval_expired",
    });
  });

  it("also expires a stalled payment_pending past the approval window", async () => {
    const row = seedApp({ status: "payment_pending" });
    const count = await sweepExpiredApprovals(new Date());
    expect(count).toBe(1);
    expect(row.status).toBe("expired");
    expect(state.events[0].previous_status).toBe("payment_pending");
  });

  it("never touches unexpired, expiry-less, or other-status applications", async () => {
    const future = seedApp({ approval_expires_at: new Date(Date.now() + DAY).toISOString() });
    const noExpiry = seedApp({ approval_expires_at: null });
    const active = seedApp({ status: "active" });
    const submitted = seedApp({ status: "submitted", approval_expires_at: new Date(Date.now() - DAY).toISOString() });
    const count = await sweepExpiredApprovals(new Date());
    expect(count).toBe(0);
    expect(future.status).toBe("approved_pending_payment");
    expect(noExpiry.status).toBe("approved_pending_payment");
    expect(active.status).toBe("active");
    expect(submitted.status).toBe("submitted");
    expect(state.events).toHaveLength(0);
  });

  it("is idempotent: a second sweep flips nothing and adds no events", async () => {
    seedApp();
    expect(await sweepExpiredApprovals(new Date())).toBe(1);
    expect(await sweepExpiredApprovals(new Date())).toBe(0);
    expect(state.events).toHaveLength(1);
  });

  it("sweeps in batches across both sweepable statuses", async () => {
    for (let i = 0; i < 3; i++) seedApp();
    for (let i = 0; i < 2; i++) seedApp({ status: "payment_pending" });
    const count = await sweepExpiredApprovals(new Date());
    expect(count).toBe(5);
    expect(state.apps.every((a) => a.status === "expired")).toBe(true);
    expect(state.events).toHaveLength(5);
  });
});
