import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Operations console read-surface tests. The properties that matter, in the
// order of how much damage getting them wrong would do:
//
// 1. THE GUARD. Every route is admin-only, proven by denial, not by reading
//    the registration. A roster, an order file, and a question thread are the
//    three widest reads in the system.
// 2. NOTHING INVENTED. A field the schema does not carry serializes as null,
//    and a queue label never renames the state that was actually stored.
// 3. THE PAYLOAD WALL. Question LIST rows carry no question body, and audit
//    rows carry record ids rather than the email addresses sitting one column
//    away in the source tables. Every seed carries an obvious marker so this
//    can be asserted rather than assumed.
// 4. DEFENSIVE READS. A table that has not been migrated yet must read as an
//    empty list, never a 500 on Samuel's console.
//
// Supabase is an in-memory fake whose table registry is per test: a table that
// was never registered answers with an error, which is exactly how a
// not-yet-migrated table behaves.
// ---------------------------------------------------------------------------

const state = vi.hoisted(() => ({
  tables: {} as Record<string, any[]>,
  configured: true,
}));

const admin = vi.hoisted(() => ({ allow: true }));

vi.mock("../supabase", () => {
  function query(table: string) {
    const list: any[] | null = Object.prototype.hasOwnProperty.call(state.tables, table)
      ? state.tables[table]
      : null;

    const filters: Array<[string, any]> = [];
    const inFilters: Array<[string, any[]]> = [];
    let limitN: number | null = null;

    const matches = (r: any) =>
      filters.every(([c, v]) => r[c] === v) && inFilters.every(([c, vs]) => vs.includes(r[c]));

    const finish = () => {
      if (list === null) {
        return { data: null, error: { message: `relation "${table}" does not exist` } };
      }
      let rows = list.filter(matches);
      if (limitN != null) rows = rows.slice(0, limitN);
      return { data: rows.map((r) => ({ ...r })), error: null };
    };

    const api: any = {
      select: () => api,
      eq: (c: string, v: any) => {
        filters.push([c, v]);
        return api;
      },
      in: (c: string, vs: any[]) => {
        inFilters.push([c, vs]);
        return api;
      },
      is: () => api,
      not: () => api,
      order: () => api,
      limit: (n: number) => {
        limitN = n;
        return api;
      },
      maybeSingle: async () => {
        const r = finish();
        const d = Array.isArray(r.data) ? (r.data[0] ?? null) : r.data;
        return { data: d, error: r.error };
      },
      then: (resolve: any) => resolve(finish()),
    };
    return api;
  }
  return {
    supabaseConfigured: () => state.configured,
    getSupabaseAdmin: () => ({ from: query }),
    getSupabaseAnon: () => {
      throw new Error("not used in tests");
    },
  };
});

vi.mock("../routes", () => ({
  requireSupabaseAdmin: (req: any, res: any, next: any) => {
    if (!admin.allow) return res.status(403).json({ ok: false, code: "admin_required" });
    req.adminEmail = "admin@example.com";
    next();
  },
}));

import { registerAdminOperationsApi } from "./admin-operations";

function makeApp() {
  const app = express();
  app.use(express.json());
  registerAdminOperationsApi(app);
  return app;
}

// ---------------------------------------------------------------------------
// Seeds. Sensitive markers are deliberate so the payload wall is assertable.
// ---------------------------------------------------------------------------

const MEMBER_ID = "00000000-0000-4000-8000-0000000000a1";
const APPLICATION_ID = "00000000-0000-4000-8000-0000000000b1";
const ORDER_ID = "00000000-0000-4000-8000-0000000000c1";
const QUESTION_ID = "00000000-0000-4000-8000-0000000000d1";
const FULFILLMENT_ID = "00000000-0000-4000-8000-0000000000e1";

const MEMBER = {
  id: MEMBER_ID,
  application_id: APPLICATION_ID,
  auth_user_id: "auth-a",
  email: "member@example.com",
  first_name: "Dana",
  status: "active",
  activated_at: "2026-05-01T10:00:00.000Z",
  created_at: "2026-04-01T10:00:00.000Z",
};

const APPLICATION = {
  id: APPLICATION_ID,
  email: "member@example.com",
  first_name: "Dana",
  last_name: "Ruiz",
  status: "active",
  goals_text: "SENSITIVE-APPLICATION-FREE-TEXT",
  submitted_at: "2026-03-01T10:00:00.000Z",
};

beforeEach(() => {
  state.tables = {};
  state.configured = true;
  admin.allow = true;
});

// ---------------------------------------------------------------------------
// The guard
// ---------------------------------------------------------------------------

const EVERY_ROUTE = [
  "/api/admin/research/members",
  `/api/admin/research/members/${MEMBER_ID}`,
  "/api/admin/research/orders",
  `/api/admin/research/orders/${ORDER_ID}`,
  "/api/admin/research/questions",
  `/api/admin/research/questions/${QUESTION_ID}`,
  "/api/admin/research/audit",
  "/api/admin/research/fulfillment",
  "/api/admin/research/inventory",
];

describe("admin operations guard", () => {
  // This suite doubles as the registration proof. An unregistered path would
  // fall through express to a 404, so a 403 from the admin gate is evidence
  // that the route exists AND that the gate is the first thing it hits.
  it.each(EVERY_ROUTE)("refuses %s without admin authority", async (path) => {
    admin.allow = false;
    const res = await request(makeApp()).get(path);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ ok: false, code: "admin_required" });
  });

  it.each(EVERY_ROUTE)("answers %s as unavailable when Supabase is not configured", async (path) => {
    state.configured = false;
    const res = await request(makeApp()).get(path);
    // 503 is what lib/api reads as { kind: "unavailable" }, so the page keeps
    // its pending panel instead of showing an error.
    expect(res.status).toBe(503);
  });

  it.each(EVERY_ROUTE)("sends %s with no-store", async (path) => {
    state.tables = { research_members: [MEMBER], research_member_questions: [], research_orders: [] };
    const res = await request(makeApp()).get(path);
    if (res.status === 200) expect(res.headers["cache-control"]).toBe("no-store");
  });
});

// ---------------------------------------------------------------------------
// Defensive reads
// ---------------------------------------------------------------------------

describe("defensive reads", () => {
  it.each([
    ["/api/admin/research/members", "members"],
    ["/api/admin/research/orders", "orders"],
    ["/api/admin/research/questions", "questions"],
    ["/api/admin/research/audit", "events"],
    ["/api/admin/research/fulfillment", "shipments"],
    ["/api/admin/research/inventory", "inventory"],
  ])("%s reads an unmigrated source as an empty list", async (path, key) => {
    const res = await request(makeApp()).get(path);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
    expect(res.body[key]).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

describe("members", () => {
  it("joins the surname from the application and invents nothing else", async () => {
    state.tables = { research_members: [MEMBER], research_applications: [APPLICATION] };
    const res = await request(makeApp()).get("/api/admin/research/members");
    expect(res.status).toBe(200);
    expect(res.body.members).toEqual([
      {
        id: MEMBER_ID,
        email: "member@example.com",
        first_name: "Dana",
        last_name: "Ruiz",
        status: "active",
        // No plan catalog and no sign-in log exist, so neither is guessed.
        plan: null,
        activated_at: "2026-05-01T10:00:00.000Z",
        last_sign_in_at: null,
      },
    ]);
    expect(JSON.stringify(res.body)).not.toContain("SENSITIVE-APPLICATION-FREE-TEXT");
  });

  it("reports a member with no application row without failing", async () => {
    state.tables = { research_members: [{ ...MEMBER, application_id: "missing" }], research_applications: [] };
    const res = await request(makeApp()).get("/api/admin/research/members");
    expect(res.body.members[0].last_name).toBeNull();
  });

  it("answers 404 for a member that does not exist", async () => {
    state.tables = { research_members: [] };
    const res = await request(makeApp()).get(`/api/admin/research/members/${MEMBER_ID}`);
    expect(res.status).toBe(404);
  });

  it("reports the latest decision per agreement, and a decline as not granted", async () => {
    state.tables = {
      research_members: [MEMBER],
      research_applications: [APPLICATION],
      research_agreement_acceptances: [
        {
          id: "acc-1",
          subject_type: "member",
          subject_id: MEMBER_ID,
          agreement_key: "research_terms",
          agreement_version: "1.0",
          decision: "accepted",
          created_at: "2026-05-02T10:00:00.000Z",
        },
        {
          id: "acc-2",
          subject_type: "member",
          subject_id: MEMBER_ID,
          agreement_key: "marketing",
          agreement_version: "1.0",
          decision: "declined",
          created_at: "2026-05-03T10:00:00.000Z",
        },
      ],
      research_application_events: [
        {
          id: "ev-1",
          application_id: APPLICATION_ID,
          new_status: "under_review",
          actor_type: "admin",
          internal_note: "SENSITIVE-INTERNAL-NOTE",
          created_at: "2026-03-02T10:00:00.000Z",
        },
      ],
    };
    const res = await request(makeApp()).get(`/api/admin/research/members/${MEMBER_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.member.consent).toEqual(
      expect.arrayContaining([
        { kind: "research_terms", granted_at: "2026-05-02T10:00:00.000Z", version: "1.0" },
        { kind: "marketing", granted_at: null, version: "1.0" },
      ]),
    );
    expect(res.body.member.events).toEqual([
      { at: "2026-03-02T10:00:00.000Z", title: "Application under review", detail: "by admin" },
    ]);
    // The application file is where internal review notes are read, with the
    // context around them. They do not travel into the member record.
    expect(JSON.stringify(res.body)).not.toContain("SENSITIVE-INTERNAL-NOTE");
  });
});

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

const ORDER = {
  id: ORDER_ID,
  member_id: MEMBER_ID,
  state: "payment_captured",
  subtotal_cents: 5000,
  total_cents: 5500,
  payment_reference: "pi_live_reference",
  placed_at: "2026-06-01T10:00:00.000Z",
  created_at: "2026-06-01T09:00:00.000Z",
};

describe("orders", () => {
  it("counts lines, resolves the member email, and reports the stored state verbatim", async () => {
    state.tables = {
      research_orders: [ORDER],
      research_members: [MEMBER],
      research_order_lines: [
        { id: "line-1", order_id: ORDER_ID, sku: "SKU-1", display_name: "Item one", quantity: 2, unit_price_cents: 2500 },
        { id: "line-2", order_id: ORDER_ID, sku: "SKU-2", display_name: "Item two", quantity: 1, unit_price_cents: 2500 },
      ],
    };
    const res = await request(makeApp()).get("/api/admin/research/orders");
    expect(res.status).toBe(200);
    expect(res.body.orders).toEqual([
      {
        id: ORDER_ID,
        reference: ORDER_ID,
        member_email: "member@example.com",
        status: "payment_captured",
        total_cents: 5500,
        item_count: 2,
        placed_at: "2026-06-01T10:00:00.000Z",
      },
    ]);
  });

  it("filters by the console queue without renaming the state", async () => {
    state.tables = {
      research_orders: [ORDER, { ...ORDER, id: "other", state: "draft" }],
      research_members: [MEMBER],
      research_order_lines: [],
    };
    const paid = await request(makeApp()).get("/api/admin/research/orders?status=paid");
    expect(paid.body.orders.map((o: any) => o.status)).toEqual(["payment_captured"]);
    const pending = await request(makeApp()).get("/api/admin/research/orders?status=pending");
    expect(pending.body.orders.map((o: any) => o.status)).toEqual(["draft"]);
    const all = await request(makeApp()).get("/api/admin/research/orders?status=");
    expect(all.body.orders).toHaveLength(2);
  });

  it("falls back to created_at for an order that was never placed", async () => {
    state.tables = {
      research_orders: [{ ...ORDER, state: "draft", placed_at: null }],
      research_members: [MEMBER],
      research_order_lines: [],
    };
    const res = await request(makeApp()).get("/api/admin/research/orders");
    expect(res.body.orders[0].placed_at).toBe("2026-06-01T09:00:00.000Z");
  });

  it("reports items, history, and no shipping summary without a fulfillment record", async () => {
    state.tables = {
      research_orders: [ORDER],
      research_members: [MEMBER],
      research_order_lines: [
        { id: "line-1", order_id: ORDER_ID, sku: "SKU-1", display_name: "Item one", quantity: 2, unit_price_cents: 2500 },
      ],
      research_order_state_events: [
        {
          id: "ose-1",
          order_id: ORDER_ID,
          from_state: "payment_authorized",
          to_state: "payment_captured",
          actor_type: "provider_webhook",
          occurred_at: "2026-06-01T11:00:00.000Z",
        },
      ],
    };
    const res = await request(makeApp()).get(`/api/admin/research/orders/${ORDER_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.order.items).toEqual([
      { id: "line-1", name: "Item one", sku: "SKU-1", quantity: 2, price_cents: 2500 },
    ]);
    expect(res.body.order.events).toEqual([
      {
        at: "2026-06-01T11:00:00.000Z",
        title: "payment authorized to payment captured",
        detail: "by provider webhook",
      },
    ]);
    expect(res.body.order.shipping_summary).toBeNull();
  });

  it("answers 404 for an order that does not exist", async () => {
    state.tables = { research_orders: [] };
    const res = await request(makeApp()).get(`/api/admin/research/orders/${ORDER_ID}`);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

const QUESTION = {
  id: QUESTION_ID,
  member_id: MEMBER_ID,
  category: "plan",
  status: "pending",
  source: "web",
  body_text: "SENSITIVE-QUESTION-BODY",
  answer_text: null,
  answered_at: null,
  answered_by: null,
  created_at: "2026-06-10T10:00:00.000Z",
  updated_at: "2026-06-10T10:00:00.000Z",
};

describe("questions", () => {
  it("keeps the question body out of list rows", async () => {
    state.tables = { research_member_questions: [QUESTION], research_members: [MEMBER] };
    const res = await request(makeApp()).get("/api/admin/research/questions");
    expect(res.status).toBe(200);
    expect(res.body.questions).toEqual([
      {
        id: QUESTION_ID,
        member_email: "member@example.com",
        topic: "plan",
        status: "pending",
        asked_at: "2026-06-10T10:00:00.000Z",
        last_activity_at: "2026-06-10T10:00:00.000Z",
      },
    ]);
    expect(JSON.stringify(res.body)).not.toContain("SENSITIVE-QUESTION-BODY");
  });

  it("filters the open, answered, and closed queues", async () => {
    state.tables = {
      research_member_questions: [
        QUESTION,
        { ...QUESTION, id: "q2", status: "answer_ready" },
        { ...QUESTION, id: "q3", status: "completed" },
      ],
      research_members: [MEMBER],
    };
    const app = makeApp();
    const open = await request(app).get("/api/admin/research/questions?status=open");
    expect(open.body.questions.map((q: any) => q.id)).toEqual([QUESTION_ID]);
    const answered = await request(app).get("/api/admin/research/questions?status=answered");
    expect(answered.body.questions.map((q: any) => q.id)).toEqual(["q2"]);
    const closed = await request(app).get("/api/admin/research/questions?status=closed");
    expect(closed.body.questions.map((q: any) => q.id)).toEqual(["q3"]);
  });

  it("opens the body and the answer thread on the detail route", async () => {
    state.tables = {
      research_member_questions: [
        {
          ...QUESTION,
          status: "answer_ready",
          answer_text: "Here is the answer.",
          answered_at: "2026-06-11T10:00:00.000Z",
          answered_by: "Samuel",
        },
      ],
      research_members: [MEMBER],
    };
    const res = await request(makeApp()).get(`/api/admin/research/questions/${QUESTION_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.question.body).toBe("SENSITIVE-QUESTION-BODY");
    expect(res.body.question.thread).toEqual([
      {
        id: `${QUESTION_ID}:answer`,
        author: "Samuel",
        body: "Here is the answer.",
        at: "2026-06-11T10:00:00.000Z",
      },
    ]);
  });

  it("says where a voice transcript lives instead of inventing one", async () => {
    state.tables = {
      research_member_questions: [
        { ...QUESTION, source: "telegram_voice", body_text: null, transcript_media_id: "media-1" },
      ],
      research_members: [MEMBER],
    };
    const res = await request(makeApp()).get(`/api/admin/research/questions/${QUESTION_ID}`);
    expect(res.body.question.body).toContain("voice note");
    expect(res.body.question.thread).toEqual([]);
  });

  it("answers 404 for a question that does not exist", async () => {
    state.tables = { research_member_questions: [] };
    const res = await request(makeApp()).get(`/api/admin/research/questions/${QUESTION_ID}`);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

describe("audit", () => {
  it("merges the recorded trails newest first and references records by id", async () => {
    state.tables = {
      research_application_events: [
        {
          id: "ev-1",
          application_id: APPLICATION_ID,
          new_status: "approved_pending_payment",
          actor_type: "admin",
          actor_id: "admin@example.com",
          reason_code: "meets_criteria",
          internal_note: "SENSITIVE-INTERNAL-NOTE",
          created_at: "2026-06-01T10:00:00.000Z",
        },
      ],
      referral_fraud_flags: [
        {
          id: "flag-1",
          reason: "possible-self-referral",
          status: "resolved",
          resolution_action: "disqualify",
          resolution_reason: "SENSITIVE-RESOLUTION-REASON",
          resolved_by: "admin@example.com",
          resolved_at: "2026-06-02T10:00:00.000Z",
          created_at: "2026-06-01T10:00:00.000Z",
        },
        { id: "flag-2", reason: "chargeback", status: "open", resolved_at: null, created_at: "2026-06-02T10:00:00.000Z" },
      ],
      research_notification_outbox: [
        {
          id: "outbox-1",
          event_type: "applicant_approved",
          recipient: "SENSITIVE-RECIPIENT@example.com",
          status: "sent",
          last_attempt_at: "2026-06-03T10:00:00.000Z",
          created_at: "2026-06-03T09:00:00.000Z",
        },
      ],
      research_order_state_events: [
        {
          id: "ose-1",
          order_id: ORDER_ID,
          from_state: "approved",
          to_state: "payment_captured",
          actor_type: "provider_webhook",
          occurred_at: "2026-06-04T10:00:00.000Z",
        },
      ],
    };
    const res = await request(makeApp()).get("/api/admin/research/audit");
    expect(res.status).toBe(200);
    expect(res.body.events.map((e: any) => e.id)).toEqual([
      "order-event:ose-1",
      "outbox:outbox-1",
      "fraud-flag:flag-1",
      "application-event:ev-1",
    ]);
    // An unresolved flag is not an audit event; nothing was decided yet.
    expect(res.body.events.some((e: any) => e.id === "fraud-flag:flag-2")).toBe(false);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain("SENSITIVE-INTERNAL-NOTE");
    expect(serialized).not.toContain("SENSITIVE-RESOLUTION-REASON");
    expect(serialized).not.toContain("SENSITIVE-RECIPIENT@example.com");
    expect(res.body.events[1].subject).toBe("notification outbox-1");
  });
});

// ---------------------------------------------------------------------------
// Fulfillment
// ---------------------------------------------------------------------------

describe("fulfillment", () => {
  it("joins lines and the shipment, and reports the stored state verbatim", async () => {
    state.tables = {
      research_fulfillment_orders: [
        {
          id: FULFILLMENT_ID,
          order_id: ORDER_ID,
          owner: "mitch",
          state: "shipped",
          recipient_name: "Dana Ruiz",
          address_city: "Austin",
          address_state: "TX",
          address_postal_code: "78701",
          address_country: "US",
          shipping_service: "standard",
          handling_profile: "ambient",
          partner_reference: "label-1",
          submitted_at: "2026-06-05T10:00:00.000Z",
          created_at: "2026-06-05T09:00:00.000Z",
          updated_at: "2026-06-06T10:00:00.000Z",
        },
      ],
      research_fulfillment_lines: [
        { id: "fl-1", fulfillment_order_id: FULFILLMENT_ID, sku: "SKU-1", quantity: 2, lot_id: "LOT-1" },
      ],
      research_shipments: [
        {
          id: "ship-1",
          fulfillment_order_id: FULFILLMENT_ID,
          carrier: "UPS",
          tracking_number: "1Z-TEST",
          created_at: "2026-06-06T09:00:00.000Z",
        },
      ],
    };
    const res = await request(makeApp()).get("/api/admin/research/fulfillment");
    expect(res.status).toBe(200);
    expect(res.body.shipments).toHaveLength(1);
    const row = res.body.shipments[0];
    expect(row.stage).toBe("shipped");
    expect(row.order_reference).toBe(ORDER_ID);
    expect(row.carrier).toBe("UPS");
    expect(row.tracking_reference).toBe("1Z-TEST");
    expect(row.lines).toEqual([{ id: "fl-1", sku: "SKU-1", quantity: 2, lot_id: "LOT-1", lot_code: "LOT-1" }]);
  });

  it("reports no carrier or tracking when no shipment exists", async () => {
    state.tables = {
      research_fulfillment_orders: [
        {
          id: FULFILLMENT_ID,
          order_id: ORDER_ID,
          owner: "xenios",
          state: "pending",
          created_at: "2026-06-05T09:00:00.000Z",
        },
      ],
    };
    const res = await request(makeApp()).get("/api/admin/research/fulfillment");
    expect(res.body.shipments[0].carrier).toBeNull();
    expect(res.body.shipments[0].tracking_reference).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

describe("inventory", () => {
  it("aggregates held lots per SKU and never reports a reorder point it does not have", async () => {
    state.tables = {
      research_inventory_lots: [
        { id: "l1", lot_id: "LOT-1", sku: "SKU-1", disposition: "available", quantity_available: 10, updated_at: "2026-06-01T10:00:00.000Z" },
        { id: "l2", lot_id: "LOT-2", sku: "SKU-1", disposition: "allocated", quantity_available: 4, updated_at: "2026-06-02T10:00:00.000Z" },
        // Shipped stock has left the building; counting it would overstate
        // what can actually be sent.
        { id: "l3", lot_id: "LOT-3", sku: "SKU-1", disposition: "shipped", quantity_available: 100, updated_at: "2026-06-03T10:00:00.000Z" },
      ],
      research_products: [{ id: "p1", sku: "SKU-1", display_name: "Catalog name" }],
    };
    const res = await request(makeApp()).get("/api/admin/research/inventory");
    expect(res.status).toBe(200);
    expect(res.body.inventory).toEqual([
      {
        id: "SKU-1",
        sku: "SKU-1",
        product_name: "Catalog name",
        on_hand: 14,
        reserved: 4,
        reorder_point: null,
        updated_at: "2026-06-02T10:00:00.000Z",
      },
    ]);
  });

  it("stands the SKU in for a product that is not in the catalog", async () => {
    state.tables = {
      research_inventory_lots: [
        { id: "l1", lot_id: "LOT-1", sku: "SKU-UNKNOWN", disposition: "available", quantity_available: 3, updated_at: null },
      ],
      research_products: [],
    };
    const res = await request(makeApp()).get("/api/admin/research/inventory");
    expect(res.body.inventory[0].product_name).toBe("SKU-UNKNOWN");
    expect(res.body.inventory[0].updated_at).toBeNull();
  });
});
