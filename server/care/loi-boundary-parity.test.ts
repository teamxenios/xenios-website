import { createServer } from "node:http";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { LoiRow, NoteRow } from "../supabase-store";

// ---------------------------------------------------------------------------
// Full-stack proof: the REAL generic routes (server/routes.ts, protected and
// untouched) mounted after the REAL Care boundary, behind the REAL canonical
// admin guard (requireSupabaseAdmin) with only the Supabase edge stubbed.
//
// Proves, against the actual registration order server/index.ts uses:
//   - unauthenticated and non-admin callers are refused by the canonical guard;
//   - the generic list, CSV export and analytics never contain a Care row;
//   - the generic CSV for generic rows is BYTE-IDENTICAL with and without the
//     boundary (no drift in the shadowed export);
//   - the generic status writer is refused for a Care row with zero mutation
//     and still writes a generic row through routes.ts's own handler.
// ---------------------------------------------------------------------------

const ADMIN_EMAIL = "admin@example.test";
const ADMIN_TOKEN = "admin-session-token";
const MEMBER_TOKEN = "member-session-token";
const CARE_ID = "2a99c6f7-1111-4222-8333-abcdefabcdef";
const GENERIC_ID = "11111111-1111-4111-8111-111111111111";

const store = vi.hoisted(() => ({
  rows: [] as LoiRow[],
  notes: [] as NoteRow[],
  listLoi: vi.fn(async () => store.rows),
  listNotesByType: vi.fn(async (_type: string) => store.notes),
  updateLoiStatus: vi.fn(async (_id: string, _status: string) => undefined),
  getAnalytics: vi.fn(async () => ({
    waitlistTotal: 0,
    loiTotal: store.rows.length,
    bookingsTotal: 0,
    displayCount: 556,
    daily: [{ date: "2026-09-03", waitlist: 0, loi: store.rows.length, bookings: 0 }],
  })),
}));

vi.mock("../supabase-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../supabase-store")>()),
  listLoi: store.listLoi,
  listNotesByType: store.listNotesByType,
  updateLoiStatus: store.updateLoiStatus,
  getAnalytics: store.getAnalytics,
  getDisplayCount: async () => 556,
}));

vi.mock("../supabase", () => ({
  supabaseConfigured: () => true,
  getSupabaseAnon: () => ({
    auth: {
      getUser: async (token: string) => {
        if (token === ADMIN_TOKEN) return { data: { user: { email: ADMIN_EMAIL } }, error: null };
        if (token === MEMBER_TOKEN) return { data: { user: { email: "member@example.test" } }, error: null };
        return { data: { user: null }, error: new Error("invalid token") };
      },
    },
  }),
  getSupabaseAdmin: () => {
    throw new Error("the admin client must never be touched by these routes in this test");
  },
}));

import { registerRoutes, requireSupabaseAdmin } from "../routes";
import { buildCareLoiBoundaryProductionDependencies, registerCareLoiBoundary } from "./loi-boundary";
import { CARE_ACCESS_BUSINESS_NAME, CARE_ACCESS_ROLE_PREFIX, CARE_ACCESS_SCHEMA } from "./manual-access-classifier";

function genericLoi(overrides: Partial<LoiRow> = {}): LoiRow {
  return {
    id: GENERIC_ID,
    name: "Generic Founder",
    email: "founder@example.test",
    business_name: "Generic Co",
    role: "CEO",
    why_interested: 'We want a pilot, "quoted", with, commas\nand a newline.',
    ip: "203.0.113.9",
    source_page: "/",
    landing_page: "/",
    status: "New",
    email_status: "sent",
    created_at: "2026-09-03T10:00:00.000Z",
    ...overrides,
  } as LoiRow;
}

function careRow(overrides: Partial<LoiRow> = {}): LoiRow {
  return genericLoi({
    id: CARE_ID,
    name: "Care Requester",
    email: "care@example.test",
    phone: "5550100",
    business_name: CARE_ACCESS_BUSINESS_NAME,
    role: `${CARE_ACCESS_ROLE_PREFIX}new_care_request`,
    why_interested: JSON.stringify({ schema: CARE_ACCESS_SCHEMA, locationState: "CO", careGoal: "new_care_request", contactMethod: "phone", contactWindow: "morning", adultConfirmation: true, boundaryAcknowledgement: true, medicalFreeTextCollected: false }),
    source_page: "/care/schedule",
    landing_page: "/care/schedule",
    created_at: "2026-09-03T04:28:51.480Z",
    ...overrides,
  });
}

async function buildApp(withBoundary: boolean) {
  const app = express();
  app.use(express.json());
  if (withBoundary) {
    registerCareLoiBoundary(app, requireSupabaseAdmin, buildCareLoiBoundaryProductionDependencies());
  }
  await registerRoutes(createServer(app), app);
  return app;
}

const savedEnv: Record<string, string | undefined> = {};
beforeAll(() => {
  for (const key of ["ADMIN_EMAIL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "DATABASE_URL"]) savedEnv[key] = process.env[key];
  process.env.ADMIN_EMAIL = ADMIN_EMAIL;
  process.env.SUPABASE_URL = "https://example-project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "never-used-in-this-test";
  delete process.env.DATABASE_URL;
});
afterAll(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
beforeEach(() => {
  store.listLoi.mockClear();
  store.listNotesByType.mockClear();
  store.updateLoiStatus.mockClear();
  store.getAnalytics.mockClear();
  store.rows = [genericLoi(), careRow(), careRow({ id: "bbbbbbbb-1111-4222-8333-abcdefabcdef", why_interested: "{malformed" })];
  store.notes = [
    { id: "n1", record_type: "loi", record_id: GENERIC_ID, note: "Called back", author: "ops@example.test", created_at: "2026-09-03T12:00:00.000Z" } as NoteRow,
    { id: "n2", record_type: "loi", record_id: CARE_ID, note: "care note must not leak", author: "ops@example.test", created_at: "2026-09-03T12:30:00.000Z" } as NoteRow,
  ];
});

describe("generic LOI routes behind the Care boundary (real routes.ts, real admin guard)", () => {
  it("is refused by the canonical guard for unauthenticated and non-admin sessions before any read", async () => {
    const app = await buildApp(true);
    expect((await request(app).get("/api/admin/loi")).status).toBe(401);
    expect((await request(app).get("/api/admin/loi").set("Authorization", `Bearer ${MEMBER_TOKEN}`)).status).toBe(403);
    expect((await request(app).patch(`/api/admin/loi/${CARE_ID}/status`).send({ status: "Signed" })).status).toBe(401);
    expect(store.listLoi).not.toHaveBeenCalled();
    expect(store.updateLoiStatus).not.toHaveBeenCalled();
  });

  it("lists only generic rows for the admin, while the raw store still holds the Care rows", async () => {
    const app = await buildApp(true);
    const res = await request(app).get("/api/admin/loi").set("Authorization", `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.map((r: LoiRow) => r.id)).toEqual([GENERIC_ID]);
    expect(JSON.stringify(res.body)).not.toContain("care@example.test");
    expect(store.rows).toHaveLength(3);
  });

  it("without the boundary the same routes would expose the Care rows (the boundary is what closes the leak)", async () => {
    const app = await buildApp(false);
    const res = await request(app).get("/api/admin/loi").set("Authorization", `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
  });

  it("refuses the generic status writer for a Care row with zero mutation, and still writes a generic row through routes.ts", async () => {
    const app = await buildApp(true);
    const refused = await request(app)
      .patch(`/api/admin/loi/${CARE_ID}/status`)
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
      .send({ status: "Signed" });
    expect(refused.status).toBe(404);
    expect(refused.body).toEqual({ success: false, message: "Not found" });
    expect(store.updateLoiStatus).not.toHaveBeenCalled();

    const allowed = await request(app)
      .patch(`/api/admin/loi/${GENERIC_ID}/status`)
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
      .send({ status: "Reviewing" });
    expect(allowed.status).toBe(200);
    expect(allowed.body).toEqual({ success: true });
    expect(store.updateLoiStatus).toHaveBeenCalledTimes(1);
    expect(store.updateLoiStatus).toHaveBeenCalledWith(GENERIC_ID, "Reviewing");

    // The real generic route is case-insensitive and Postgres normalises uuid
    // spellings, so these must be refused too (adversarial review P1s).
    for (const path of [
      `/api/admin/loi/${CARE_ID}/STATUS`,
      `/api/admin/loi/${CARE_ID.toUpperCase()}/status`,
      `/api/admin/loi/${encodeURIComponent(`{${CARE_ID}}`)}/status`,
    ]) {
      const bypassAttempt = await request(app)
        .patch(path)
        .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
        .send({ status: "Signed" });
      expect(bypassAttempt.status, path).toBe(404);
    }
    expect(store.updateLoiStatus).toHaveBeenCalledTimes(1);

    // routes.ts's own vocabulary check still governs generic rows.
    const invalid = await request(app)
      .patch(`/api/admin/loi/${GENERIC_ID}/status`)
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
      .send({ status: "Contacted" });
    expect(invalid.status).toBe(400);
    expect(store.updateLoiStatus).toHaveBeenCalledTimes(1);
  });

  it("exports a CSV that is byte-identical to the generic export of the generic rows alone", async () => {
    const withBoundary = await buildApp(true);
    const shadowed = await request(withBoundary).get("/api/admin/export?type=loi").set("Authorization", `Bearer ${ADMIN_TOKEN}`);
    expect(shadowed.status).toBe(200);
    expect(shadowed.text).not.toContain(CARE_ID);
    expect(shadowed.text).not.toContain("care note must not leak");
    expect(shadowed.text).toContain("Called back");

    // The reference: the untouched generic handler over a store that only ever
    // held the generic rows and their notes.
    store.rows = [genericLoi()];
    store.notes = store.notes.filter((n) => n.record_id === GENERIC_ID);
    const reference = await request(await buildApp(false)).get("/api/admin/export?type=loi").set("Authorization", `Bearer ${ADMIN_TOKEN}`);
    expect(reference.status).toBe(200);
    expect(shadowed.text).toBe(reference.text);
    expect(shadowed.headers["content-type"]).toBe(reference.headers["content-type"]);
    expect(shadowed.headers["content-disposition"]).toBe(reference.headers["content-disposition"]);
  });

  it("answers analytics with the Care rows removed from the LOI figures", async () => {
    const app = await buildApp(true);
    const res = await request(app).get("/api/admin/analytics").set("Authorization", `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.data.loiTotal).toBe(1);
    expect(res.body.data.daily).toEqual([{ date: "2026-09-03", waitlist: 0, loi: 1, bookings: 0 }]);
    expect(res.body.data.displayCount).toBe(556);
  });

  it("still lets the generic export of other record types and the public health door through", async () => {
    const app = await buildApp(true);
    const health = await request(app).get("/api/health");
    expect(health.status).toBe(200);
    const bookings = await request(app).get("/api/admin/export?type=bookings").set("Authorization", `Bearer ${ADMIN_TOKEN}`);
    // routes.ts reaches the real store for bookings, which this test does not stub: the
    // generic handler ran (500 from the throwing admin client), the boundary did not.
    expect(bookings.status).toBe(500);
    expect(store.listLoi).not.toHaveBeenCalled();
  });
});
