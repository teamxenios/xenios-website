import express, { type NextFunction, type Request, type RequestHandler, type Response } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalyticsSummary, LoiRow, NoteRow } from "../supabase-store";
import {
  CARE_ACCESS_BUSINESS_NAME,
  CARE_ACCESS_ROLE_PREFIX,
  CARE_ACCESS_SCHEMA,
} from "./manual-access-classifier";
import {
  CARE_LOI_BOUNDARY_PREFIXES,
  genericLoiCsv,
  registerCareLoiBoundary,
  subtractCareFromAnalytics,
  type CareLoiBoundaryDependencies,
} from "./loi-boundary";

const CARE_ID = "2a99c6f7-1111-4222-8333-abcdefabcdef";
const MALFORMED_CARE_ID = "bbbbbbbb-1111-4222-8333-abcdefabcdef";
const GENERIC_ID = "11111111-1111-4111-8111-111111111111";

function genericLoi(overrides: Partial<LoiRow> = {}): LoiRow {
  return {
    id: GENERIC_ID,
    name: "Generic Founder",
    email: "founder@example.test",
    business_name: "Generic Co",
    role: "CEO",
    why_interested: "We want to explore a pilot, with \"quotes\", commas, and\nnewlines.",
    ip: "203.0.113.9",
    source_page: "/",
    landing_page: "/",
    utm_source: "newsletter",
    status: "New",
    email_status: "sent",
    created_at: "2026-09-02T10:00:00.000Z",
    ...overrides,
  } as LoiRow;
}

function careRow(overrides: Partial<LoiRow> = {}): LoiRow {
  return genericLoi({
    id: CARE_ID,
    name: "Care Requester",
    email: "care@example.test",
    business_name: CARE_ACCESS_BUSINESS_NAME,
    role: `${CARE_ACCESS_ROLE_PREFIX}new_care_request`,
    why_interested: JSON.stringify({
      schema: CARE_ACCESS_SCHEMA,
      locationState: "CO",
      careGoal: "new_care_request",
      contactMethod: "phone",
      contactWindow: "morning",
      adultConfirmation: true,
      boundaryAcknowledgement: true,
      medicalFreeTextCollected: false,
    }),
    source_page: "/care/schedule",
    landing_page: "/care/schedule",
    utm_source: null,
    created_at: "2026-09-03T04:28:51.480Z",
    ...overrides,
  });
}

const malformedCare = () =>
  careRow({ id: MALFORMED_CARE_ID, why_interested: "{not json", created_at: "2026-09-03T05:00:00.000Z" });

function analytics(): AnalyticsSummary {
  return {
    waitlistTotal: 7,
    loiTotal: 3,
    bookingsTotal: 1,
    displayCount: 563,
    daily: [
      { date: "2026-09-02", waitlist: 2, loi: 1, bookings: 0 },
      { date: "2026-09-03", waitlist: 1, loi: 2, bookings: 1 },
    ],
  };
}

const ADMIN = "Bearer admin-token";
const guard: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  if (req.headers.authorization !== ADMIN) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }
  next();
};

interface Harness {
  app: express.Express;
  deps: CareLoiBoundaryDependencies & { listLoi: ReturnType<typeof vi.fn> };
  generic: {
    list: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    exportCsv: ReturnType<typeof vi.fn>;
    analytics: ReturnType<typeof vi.fn>;
    updateLoiStatus: ReturnType<typeof vi.fn>;
  };
}

/**
 * The boundary first, then stand-ins for the generic routes exactly as
 * server/index.ts orders them (Care registrar before registerRoutes). Each
 * stand-in records that it was reached so a test can prove the boundary
 * answered (or deliberately deferred) before the generic handler ran.
 */
function harness(rows: LoiRow[], notes: NoteRow[] = []): Harness {
  const app = express();
  app.use(express.json());
  const deps = {
    listLoi: vi.fn(async () => rows),
    listNotesByType: vi.fn(async (_type: string) => notes),
    getAnalytics: vi.fn(async () => analytics()),
  };
  registerCareLoiBoundary(app, guard, deps);
  const generic = {
    list: vi.fn(),
    patch: vi.fn(),
    exportCsv: vi.fn(),
    analytics: vi.fn(),
    updateLoiStatus: vi.fn(async (_id: string, _status: string) => undefined),
  };
  app.get("/api/admin/loi", guard, async (_req, res) => {
    generic.list();
    res.json({ success: true, data: rows });
  });
  app.patch("/api/admin/loi/:id/status", guard, async (req, res) => {
    generic.patch(String(req.params.id), String(req.body?.status));
    await generic.updateLoiStatus(String(req.params.id), String(req.body?.status));
    res.json({ success: true });
  });
  app.get("/api/admin/export", guard, async (req, res) => {
    generic.exportCsv(String(req.query.type));
    res.type("text/csv").send("generic-export");
  });
  app.get("/api/admin/analytics", guard, async (_req, res) => {
    generic.analytics();
    res.json({ success: true, data: analytics() });
  });
  return { app, deps, generic };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("Care ↔ generic LOI boundary: list", () => {
  it("refuses an unauthenticated caller before reading anything", async () => {
    const h = harness([genericLoi(), careRow()]);
    const res = await request(h.app).get("/api/admin/loi");
    expect(res.status).toBe(401);
    expect(h.deps.listLoi).not.toHaveBeenCalled();
    expect(h.generic.list).not.toHaveBeenCalled();
  });

  it("answers the generic list without any Care row, strongly marked or malformed, and never reaches the generic handler", async () => {
    const h = harness([genericLoi(), careRow(), malformedCare(), genericLoi({ id: "33333333-3333-4333-8333-333333333333" })]);
    const res = await request(h.app).get("/api/admin/loi").set("Authorization", ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.map((r: LoiRow) => r.id)).toEqual([GENERIC_ID, "33333333-3333-4333-8333-333333333333"]);
    expect(JSON.stringify(res.body)).not.toContain(CARE_ID);
    expect(JSON.stringify(res.body)).not.toContain(MALFORMED_CARE_ID);
    expect(JSON.stringify(res.body)).not.toContain(CARE_ACCESS_SCHEMA);
    expect(h.generic.list).not.toHaveBeenCalled();
  });

  it("answers HEAD itself so even the content length reflects the generic rows only", async () => {
    const h = harness([genericLoi(), careRow(), malformedCare()]);
    const get = await request(h.app).get("/api/admin/loi").set("Authorization", ADMIN);
    const head = await request(h.app).head("/api/admin/loi").set("Authorization", ADMIN);
    expect(head.status).toBe(200);
    expect(head.text ?? "").toBe("");
    expect(head.headers["content-length"]).toBe(get.headers["content-length"]);
    expect(h.generic.list).not.toHaveBeenCalled();
  });

  it("leaves a generic row's own fields untouched (the boundary filters rows, never columns)", async () => {
    const h = harness([genericLoi()]);
    const res = await request(h.app).get("/api/admin/loi").set("Authorization", ADMIN);
    expect(res.body.data[0]).toEqual(genericLoi());
  });

  it("reports the generic error envelope when the store fails", async () => {
    const h = harness([]);
    h.deps.listLoi.mockRejectedValueOnce(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await request(h.app).get("/api/admin/loi").set("Authorization", ADMIN);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, message: "Failed to load early interest" });
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/care@example|203\.0\.113/u);
  });

  it("passes every other /api/admin/loi subpath through to whatever the generic layer registers", async () => {
    const h = harness([genericLoi()]);
    const res = await request(h.app).get("/api/admin/loi/anything-else").set("Authorization", ADMIN);
    expect(res.status).toBe(404); // nothing downstream owns it; the boundary did not invent a response
    expect(h.deps.listLoi).not.toHaveBeenCalled();
  });
});

describe("Care ↔ generic LOI boundary: generic status writer", () => {
  it("refuses to let the generic writer touch a Care row: 404, zero mutation, generic handler never reached", async () => {
    const h = harness([genericLoi(), careRow()]);
    const res = await request(h.app)
      .patch(`/api/admin/loi/${CARE_ID}/status`)
      .set("Authorization", ADMIN)
      .send({ status: "Signed" });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: "Not found" });
    expect(h.generic.patch).not.toHaveBeenCalled();
    expect(h.generic.updateLoiStatus).not.toHaveBeenCalled();
  });

  it("refuses a malformed-but-strongly-marked Care row the same way", async () => {
    const h = harness([malformedCare()]);
    const res = await request(h.app)
      .patch(`/api/admin/loi/${MALFORMED_CARE_ID}/status`)
      .set("Authorization", ADMIN)
      .send({ status: "Reviewing" });
    expect(res.status).toBe(404);
    expect(h.generic.updateLoiStatus).not.toHaveBeenCalled();
  });

  it("defers a generic row to the generic writer unchanged", async () => {
    const h = harness([genericLoi(), careRow()]);
    const res = await request(h.app)
      .patch(`/api/admin/loi/${GENERIC_ID}/status`)
      .set("Authorization", ADMIN)
      .send({ status: "Reviewing" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(h.generic.patch).toHaveBeenCalledWith(GENERIC_ID, "Reviewing");
    expect(h.generic.updateLoiStatus).toHaveBeenCalledWith(GENERIC_ID, "Reviewing");
  });

  it("keeps the generic writer's own semantics for an unknown id (not a Care row, so not the boundary's call)", async () => {
    const h = harness([genericLoi()]);
    const res = await request(h.app)
      .patch("/api/admin/loi/99999999-9999-4999-8999-999999999999/status")
      .set("Authorization", ADMIN)
      .send({ status: "Reviewing" });
    expect(res.status).toBe(200);
    expect(h.generic.patch).toHaveBeenCalledTimes(1);
  });

  it("fails closed when it cannot classify the row: the generic writer must not run", async () => {
    const h = harness([careRow()]);
    h.deps.listLoi.mockRejectedValueOnce(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await request(h.app)
      .patch(`/api/admin/loi/${CARE_ID}/status`)
      .set("Authorization", ADMIN)
      .send({ status: "Signed" });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, message: "Failed to update status" });
    expect(h.generic.updateLoiStatus).not.toHaveBeenCalled();
  });

  it("refuses an unauthenticated writer before looking anything up", async () => {
    const h = harness([careRow()]);
    const res = await request(h.app).patch(`/api/admin/loi/${CARE_ID}/status`).send({ status: "Signed" });
    expect(res.status).toBe(401);
    expect(h.deps.listLoi).not.toHaveBeenCalled();
    expect(h.generic.updateLoiStatus).not.toHaveBeenCalled();
  });

  it("refuses a Care row however the status segment is cased, because the generic writer routes case-insensitively", async () => {
    for (const segment of ["STATUS", "Status", "sTaTuS"]) {
      const h = harness([careRow()]);
      const res = await request(h.app)
        .patch(`/api/admin/loi/${CARE_ID}/${segment}`)
        .set("Authorization", ADMIN)
        .send({ status: "Signed" });
      expect(res.status, segment).toBe(404);
      expect(h.generic.updateLoiStatus).not.toHaveBeenCalled();
    }
  });

  it("refuses a Care row under every uuid spelling Postgres would treat as the same id", async () => {
    const spellings = [
      CARE_ID.toUpperCase(),
      `{${CARE_ID}}`,
      CARE_ID.replace(/-/gu, ""),
      `{${CARE_ID.toUpperCase().replace(/-/gu, "")}}`,
    ];
    for (const spelling of spellings) {
      const h = harness([careRow()]);
      const res = await request(h.app)
        .patch(`/api/admin/loi/${encodeURIComponent(spelling)}/status`)
        .set("Authorization", ADMIN)
        .send({ status: "Signed" });
      expect(res.status, spelling).toBe(404);
      expect(h.generic.updateLoiStatus).not.toHaveBeenCalled();
    }
  });

  it("still defers a generic row spelled in upper case to the generic writer", async () => {
    const h = harness([genericLoi(), careRow()]);
    const res = await request(h.app)
      .patch(`/api/admin/loi/${GENERIC_ID.toUpperCase()}/status`)
      .set("Authorization", ADMIN)
      .send({ status: "Reviewing" });
    expect(res.status).toBe(200);
    expect(h.generic.updateLoiStatus).toHaveBeenCalledTimes(1);
  });

  it("recognises the status path with a trailing slash and an encoded id", async () => {
    const h = harness([careRow({ id: "care id" })]);
    const res = await request(h.app)
      .patch("/api/admin/loi/care%20id/status/")
      .set("Authorization", ADMIN)
      .send({ status: "Signed" });
    expect(res.status).toBe(404);
    expect(h.generic.updateLoiStatus).not.toHaveBeenCalled();
  });
});

describe("Care ↔ generic LOI boundary: CSV export", () => {
  const notes: NoteRow[] = [
    { id: "n1", record_type: "loi", record_id: GENERIC_ID, note: "Called back", author: "ops@example.test", created_at: "2026-09-02T12:00:00.000Z" } as NoteRow,
    { id: "n2", record_type: "loi", record_id: CARE_ID, note: "must never leak", author: "ops@example.test", created_at: "2026-09-03T12:00:00.000Z" } as NoteRow,
  ];

  it("answers type=loi with generic rows only, joined notes, and the generic headers", async () => {
    const h = harness([genericLoi(), careRow(), malformedCare()], notes);
    const res = await request(h.app).get("/api/admin/export?type=loi").set("Authorization", ADMIN);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^text\/csv/u);
    expect(res.headers["content-disposition"]).toBe('attachment; filename="xenios-loi.csv"');
    expect(res.text).toContain(GENERIC_ID);
    expect(res.text).toContain("2026-09-02T12:00:00.000Z ops@example.test: Called back");
    expect(res.text).not.toContain(CARE_ID);
    expect(res.text).not.toContain(MALFORMED_CARE_ID);
    expect(res.text).not.toContain("must never leak");
    expect(res.text).not.toContain(CARE_ACCESS_SCHEMA);
    expect(h.deps.listNotesByType).toHaveBeenCalledWith("loi");
    expect(h.generic.exportCsv).not.toHaveBeenCalled();
  });

  it("returns an empty document when only Care rows exist (existing empty-table behaviour)", async () => {
    const h = harness([careRow()], notes);
    const res = await request(h.app).get("/api/admin/export?type=loi").set("Authorization", ADMIN);
    expect(res.status).toBe(200);
    expect(res.text).toBe("");
  });

  it("defers every non-LOI export type to the generic layer", async () => {
    const h = harness([careRow()]);
    for (const type of ["waitlist", "bookings", ""]) {
      const res = await request(h.app).get(`/api/admin/export${type ? `?type=${type}` : ""}`).set("Authorization", ADMIN);
      expect(res.status).toBe(200);
      expect(res.text).toBe("generic-export");
    }
    expect(h.deps.listLoi).not.toHaveBeenCalled();
  });

  it("refuses an unauthenticated export before reading", async () => {
    const h = harness([careRow()]);
    const res = await request(h.app).get("/api/admin/export?type=loi");
    expect(res.status).toBe(401);
    expect(h.deps.listLoi).not.toHaveBeenCalled();
  });
});

describe("Care ↔ generic LOI boundary: analytics", () => {
  it("removes Care rows from the LOI total and daily counts and leaves everything else alone", async () => {
    const h = harness([genericLoi(), careRow(), malformedCare()]);
    const res = await request(h.app).get("/api/admin/analytics").set("Authorization", ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      waitlistTotal: 7,
      loiTotal: 1,
      bookingsTotal: 1,
      displayCount: 563,
      daily: [
        { date: "2026-09-02", waitlist: 2, loi: 1, bookings: 0 },
        { date: "2026-09-03", waitlist: 1, loi: 0, bookings: 1 },
      ],
    });
    expect(h.generic.analytics).not.toHaveBeenCalled();
  });

  it("never reports a negative count and ignores Care rows outside the daily window", () => {
    const summary = analytics();
    const adjusted = subtractCareFromAnalytics(summary, [
      careRow({ created_at: "2026-08-01T00:00:00.000Z" }),
      careRow({ id: "x", created_at: "2026-09-03T01:00:00.000Z" }),
      careRow({ id: "y", created_at: "2026-09-03T02:00:00.000Z" }),
      careRow({ id: "z", created_at: "2026-09-03T03:00:00.000Z" }),
    ]);
    expect(adjusted.loiTotal).toBe(0);
    expect(adjusted.daily[1].loi).toBe(0);
    expect(adjusted.daily[0].loi).toBe(1);
    // input untouched
    expect(summary.loiTotal).toBe(3);
    expect(summary.daily[1].loi).toBe(2);
  });

  it("refuses an unauthenticated caller before reading", async () => {
    const h = harness([careRow()]);
    const res = await request(h.app).get("/api/admin/analytics");
    expect(res.status).toBe(401);
    expect(h.deps.getAnalytics).not.toHaveBeenCalled();
  });
});

describe("generic CSV encoder parity rules", () => {
  it("matches the generic export's escaping rules", () => {
    expect(genericLoiCsv([])).toBe("");
    const csv = genericLoiCsv([
      { id: "1", text: 'say "hi", now\nplease', obj: { a: 1 }, empty: null, missing: undefined, n: 5 },
    ]);
    expect(csv).toBe('id,text,obj,empty,missing,n\n1,"say ""hi"", now\nplease","{""a"":1}",,,5');
  });

  it("exposes the exact generic prefixes it shadows", () => {
    expect(CARE_LOI_BOUNDARY_PREFIXES).toEqual({
      loi: "/api/admin/loi",
      export: "/api/admin/export",
      analytics: "/api/admin/analytics",
    });
  });
});
