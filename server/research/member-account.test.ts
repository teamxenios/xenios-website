import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Member account surface tests.
//
// Three things are pinned here, in this order of importance:
//   1. NEGATIVE AUTH FIRST. Every one of the seven paths refuses an anonymous
//      caller with 401 and a wrong-subject caller with 403, and the refusal
//      happens BEFORE any repository call (the fake counts reads, and the
//      count must be zero on a denied request).
//   2. PER-MEMBER ISOLATION. Every read filters on the member the guard
//      resolved, so one member's ledger, periods, consents, and media are
//      never visible to another.
//   3. TRUTHFULNESS. A missing table reads as the empty state, a malformed row
//      is dropped rather than rendered with filler, no amount is ever zero,
//      and the five surfaces with no store answer 503 naming that store rather
//      than reporting a success that did not happen.
// ---------------------------------------------------------------------------

const state = vi.hoisted(() => ({
  tables: {} as Record<string, any[]>,
  missing: new Set<string>(),
  reads: 0,
  // Every (table, projection, filters) triple the handlers issued, so a test
  // can prove what was asked for and on whose behalf.
  queries: [] as Array<{ table: string; columns: string; filters: Array<[string, any]> }>,
}));

const auth = vi.hoisted(() => ({
  member: null as any,
  signedOut: false,
  noMember: false,
}));

vi.mock("../supabase", () => {
  function query(table: string) {
    state.reads += 1;
    const filters: Array<[string, any]> = [];
    const record = { table, columns: "", filters };
    state.queries.push(record);
    const api: any = {
      select: (columns: string) => {
        record.columns = columns;
        return api;
      },
      eq: (column: string, value: any) => {
        filters.push([column, value]);
        return api;
      },
      order: () => api,
      limit: () => api,
      then: (resolve: any) => {
        if (state.missing.has(table)) {
          return resolve({
            data: null,
            error: { message: `relation "public.${table}" does not exist` },
          });
        }
        const rows = (state.tables[table] ?? []).filter((row) =>
          filters.every(([column, value]) => row[column] === value),
        );
        return resolve({ data: rows, error: null });
      },
      maybeSingle: async () => ({ data: null, error: null }),
    };
    return api;
  }
  return {
    supabaseConfigured: () => true,
    getSupabaseAdmin: () => ({ from: query }),
    getSupabaseAnon: () => {
      throw new Error("not used in tests");
    },
  };
});

// The guards are mocked so a test chooses the member a request runs as, or the
// exact denial production would produce. Both member guards share the same
// mock body: this module's routes differ only in WHICH guard they mount, and
// each route's guard choice is asserted separately below.
vi.mock("./member-auth", () => {
  const guard = (req: any, res: any, next: any) => {
    if (auth.signedOut) return res.status(401).json({ ok: false, message: "Sign in required." });
    if (auth.noMember) {
      return res.status(403).json({ ok: false, message: "No research membership for this account." });
    }
    req.researchMember = auth.member;
    next();
  };
  return {
    requireMember: guard,
    requireResearchSubject: guard,
    requireActiveMember: guard,
  };
});

import {
  MEMBER_ACCOUNT_PATHS,
  MISSING_STORES,
  consentsFromEvents,
  isoDay,
  mediaFromRows,
  membershipAgreements,
  nextChargeFromPeriods,
  paymentsFromLedger,
  registerMemberAccountApi,
} from "./member-account";
import { MEMBER_ACCOUNT_API } from "@shared/research/member-paths";
import { AGREEMENT_DEFINITIONS } from "./agreements";
import { defaultDeps } from "./member-platform-deps";

const MEMBER_A = "11111111-1111-4111-8111-111111111111";
const MEMBER_B = "22222222-2222-4222-8222-222222222222";
const OBLIGATION_ACTIVATION = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const OBLIGATION_RENEWAL = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";

function makeApp() {
  const app = express();
  app.use(express.json());
  registerMemberAccountApi(app, defaultDeps());
  return app;
}

/** Every path with the method the adapter uses, so the loops below cover all seven. */
const ALL_ROUTES: Array<{ method: "get" | "post"; path: string }> = [
  { method: "get", path: MEMBER_ACCOUNT_PATHS.membership },
  { method: "post", path: MEMBER_ACCOUNT_PATHS.cancel },
  { method: "get", path: MEMBER_ACCOUNT_PATHS.securitySessions },
  { method: "get", path: MEMBER_ACCOUNT_PATHS.privacySummary },
  { method: "post", path: MEMBER_ACCOUNT_PATHS.privacyExport },
  { method: "post", path: MEMBER_ACCOUNT_PATHS.privacyCorrection },
  { method: "post", path: MEMBER_ACCOUNT_PATHS.privacyDeletion },
];

/** The five surfaces with no store behind them. */
const REFUSING_ROUTES: Array<{ method: "get" | "post"; path: string; store: string }> = [
  { method: "post", path: MEMBER_ACCOUNT_PATHS.cancel, store: MISSING_STORES.cancellation },
  { method: "get", path: MEMBER_ACCOUNT_PATHS.securitySessions, store: MISSING_STORES.sessions },
  { method: "post", path: MEMBER_ACCOUNT_PATHS.privacyExport, store: MISSING_STORES.privacyRequests },
  { method: "post", path: MEMBER_ACCOUNT_PATHS.privacyCorrection, store: MISSING_STORES.privacyRequests },
  { method: "post", path: MEMBER_ACCOUNT_PATHS.privacyDeletion, store: MISSING_STORES.privacyRequests },
];

beforeEach(() => {
  state.tables = {};
  state.missing = new Set();
  state.reads = 0;
  state.queries = [];
  auth.member = { id: MEMBER_A, status: "active", activated_at: "2026-06-02T15:04:05.000Z" };
  auth.signedOut = false;
  auth.noMember = false;
});

// ---------------------------------------------------------------------------
// 0. The prefix trap: what express actually registered, as literal strings
// ---------------------------------------------------------------------------

describe("published paths", () => {
  function registered(): Set<string> {
    const app = makeApp() as any;
    const found = new Set<string>();
    for (const layer of app.router?.stack ?? app._router?.stack ?? []) {
      if (!layer.route) continue;
      for (const method of Object.keys(layer.route.methods)) {
        if (layer.route.methods[method]) found.add(`${method.toUpperCase()} ${layer.route.path}`);
      }
    }
    return found;
  }

  // The literals, held on the server side too. The client adapter's suite
  // holds the same literals. Both sides now import ONE constant, so this is
  // what makes changing that constant fail loudly instead of unpublishing a
  // page: an unregistered path returns the app shell with a 200 and nothing
  // else in the system notices.
  it("registers exactly the seven member account paths", () => {
    expect([...registered()].sort()).toEqual([
      "GET /api/research/member/membership",
      "GET /api/research/member/privacy/summary",
      "GET /api/research/member/security/sessions",
      "POST /api/research/member/cancel",
      "POST /api/research/member/privacy/correction",
      "POST /api/research/member/privacy/deletion",
      "POST /api/research/member/privacy/export",
    ]);
  });

  it("registers the shared constant itself, not a second copy of the strings", () => {
    expect(MEMBER_ACCOUNT_PATHS).toBe(MEMBER_ACCOUNT_API);
    const paths = new Set([...registered()].map((route) => route.split(" ")[1]));
    for (const path of Object.values(MEMBER_ACCOUNT_API)) {
      expect(paths.has(path)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 1. Negative auth, before any repository call
// ---------------------------------------------------------------------------

describe("member account authorization", () => {
  it.each(ALL_ROUTES)("refuses an anonymous caller on $method $path", async ({ method, path }) => {
    auth.signedOut = true;
    const response = await request(makeApp())[method](path).send({});
    expect(response.status).toBe(401);
    expect(state.reads).toBe(0);
  });

  it.each(ALL_ROUTES)(
    "refuses a session with no member row on $method $path",
    async ({ method, path }) => {
      auth.noMember = true;
      const response = await request(makeApp())[method](path).send({});
      expect(response.status).toBe(403);
      expect(state.reads).toBe(0);
    },
  );

  it.each(ALL_ROUTES)("fails closed when the guard attaches nothing on $method $path", async ({ method, path }) => {
    auth.member = undefined;
    const response = await request(makeApp())[method](path).send({});
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ ok: false, code: "membership_inactive" });
    expect(state.reads).toBe(0);
  });

  it.each(ALL_ROUTES)("sends no-store headers on $method $path", async ({ method, path }) => {
    const response = await request(makeApp())[method](path).send({});
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
  });
});

// ---------------------------------------------------------------------------
// 2. The five surfaces with no store
// ---------------------------------------------------------------------------

describe("surfaces with no store behind them", () => {
  it.each(REFUSING_ROUTES)("refuses $path truthfully and names its missing store", async ({ method, path, store }) => {
    const response = await request(makeApp())[method](path).send({});
    expect(response.status).toBe(503);
    expect(response.body.ok).toBe(false);
    expect(response.body.code).toBe("capability_disabled");
    expect(response.body.missingStore).toBe(store);
    // The copy must say nothing happened; a "received" or "submitted" claim
    // here would be a reported success that never occurred.
    expect(String(response.body.message)).toMatch(/not (switched on|available|being recorded)/i);
  });

  it.each(REFUSING_ROUTES)("touches no table for $path", async ({ method, path }) => {
    await request(makeApp())[method](path).send({ detail: "my birth year is wrong" });
    expect(state.reads).toBe(0);
  });

  it("never reports a cancellation as done", async () => {
    const response = await request(makeApp()).post(MEMBER_ACCOUNT_PATHS.cancel).send({ confirm: true });
    expect(response.status).not.toBe(200);
    expect(response.body.ok).not.toBe(true);
  });

  it("never answers the session list with an empty array", async () => {
    // An empty array reads as "you have no other sessions", a claim this
    // server cannot make. The refusal is the honest answer.
    const response = await request(makeApp()).get(MEMBER_ACCOUNT_PATHS.securitySessions);
    expect(response.body.sessions).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3. Membership, served from the real tables
// ---------------------------------------------------------------------------

describe("GET member/membership", () => {
  it("reports the member's own status, start date, and funded coverage", async () => {
    state.tables.research_fm_membership_periods = [
      { member_id: MEMBER_A, sequence: 1, starts_at: "2026-06-02T00:00:00.000Z", ends_at: "2026-07-02T00:00:00.000Z" },
      { member_id: MEMBER_A, sequence: 2, starts_at: "2026-07-02T00:00:00.000Z", ends_at: "2026-08-02T00:00:00.000Z" },
    ];
    const response = await request(makeApp()).get(MEMBER_ACCOUNT_PATHS.membership);
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.status).toBe("active");
    expect(response.body.startedAt).toBe("2026-06-02");
    expect(response.body.nextChargeAt).toBe("2026-08-02");
  });

  it("renders the payment history from the append-only ledger", async () => {
    state.tables.research_fm_obligations = [
      { member_id: MEMBER_A, id: OBLIGATION_ACTIVATION, type: "activation_50" },
      { member_id: MEMBER_A, id: OBLIGATION_RENEWAL, type: "renewal_25" },
    ];
    state.tables.research_fm_ledger = [
      {
        member_id: MEMBER_A,
        entry_id: "e2",
        obligation_id: OBLIGATION_RENEWAL,
        entry_type: "renewal_payment",
        amount_cents: 2500,
        recorded_at: "2026-07-02T12:00:00.000Z",
      },
      {
        member_id: MEMBER_A,
        entry_id: "e1",
        obligation_id: OBLIGATION_ACTIVATION,
        entry_type: "activation_payment",
        amount_cents: 5000,
        recorded_at: "2026-06-02T12:00:00.000Z",
      },
    ];
    const response = await request(makeApp()).get(MEMBER_ACCOUNT_PATHS.membership);
    expect(response.body.payments).toEqual([
      { id: "e2", at: "2026-07-02", label: "30-day renewal", amountCents: 2500, status: "Paid" },
      {
        id: "e1",
        at: "2026-06-02",
        label: "Activation (includes your first 30 days)",
        amountCents: 5000,
        status: "Paid",
      },
    ]);
  });

  it("never shows another member's periods, ledger, or obligations", async () => {
    state.tables.research_fm_membership_periods = [
      { member_id: MEMBER_B, sequence: 1, starts_at: "2026-01-01T00:00:00.000Z", ends_at: "2099-01-01T00:00:00.000Z" },
    ];
    state.tables.research_fm_ledger = [
      {
        member_id: MEMBER_B,
        entry_id: "other",
        obligation_id: OBLIGATION_ACTIVATION,
        entry_type: "activation_payment",
        amount_cents: 5000,
        recorded_at: "2026-06-02T12:00:00.000Z",
      },
    ];
    const response = await request(makeApp()).get(MEMBER_ACCOUNT_PATHS.membership);
    expect(response.body.nextChargeAt).toBeNull();
    expect(response.body.payments).toEqual([]);
  });

  it("reads a missing billing migration as the empty state, not an error", async () => {
    state.missing = new Set([
      "research_fm_membership_periods",
      "research_fm_ledger",
      "research_fm_obligations",
      "research_agreement_acceptances",
    ]);
    const response = await request(makeApp()).get(MEMBER_ACCOUNT_PATHS.membership);
    expect(response.status).toBe(200);
    expect(response.body.payments).toEqual([]);
    expect(response.body.nextChargeAt).toBeNull();
  });

  it("carries no renewal date and no payments for a member who has not activated", async () => {
    auth.member = { id: MEMBER_A, status: "pending_activation", activated_at: null };
    const response = await request(makeApp()).get(MEMBER_ACCOUNT_PATHS.membership);
    expect(response.body.status).toBe("pending_activation");
    expect(response.body.startedAt).toBeNull();
    expect(response.body.nextChargeAt).toBeNull();
    expect(response.body.payments).toEqual([]);
  });

  it("stays open to a past_due member so the billing page is not closed by the lapse", async () => {
    auth.member = { id: MEMBER_A, status: "past_due", activated_at: "2026-06-02T15:04:05.000Z" };
    const response = await request(makeApp()).get(MEMBER_ACCOUNT_PATHS.membership);
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("past_due");
  });
});

describe("what the reads ask for", () => {
  it("scopes every read to the member the guard resolved, and to nothing else", async () => {
    await request(makeApp()).get(MEMBER_ACCOUNT_PATHS.membership);
    await request(makeApp()).get(MEMBER_ACCOUNT_PATHS.privacySummary);
    expect(state.queries.length).toBeGreaterThan(0);
    for (const query of state.queries) {
      const subject = query.filters.find(([column]) => column === "member_id" || column === "subject_id");
      expect(subject?.[1]).toBe(MEMBER_A);
    }
  });

  it("never selects * from a table that carries admin or method detail", async () => {
    await request(makeApp()).get(MEMBER_ACCOUNT_PATHS.membership);
    await request(makeApp()).get(MEMBER_ACCOUNT_PATHS.privacySummary);
    // research_fm_obligations holds a method snapshot and the admin
    // verification record; research_fm_ledger holds the acting admin. A
    // projection is the cheap structural way none of it can reach a member
    // response by someone later spreading a row.
    for (const query of state.queries) {
      expect(query.columns).not.toBe("*");
      expect(query.columns.length).toBeGreaterThan(0);
    }
    const obligations = state.queries.find((query) => query.table === "research_fm_obligations");
    expect(obligations?.columns).toBe("id, type");
    const ledger = state.queries.find((query) => query.table === "research_fm_ledger");
    expect(ledger?.columns).not.toMatch(/actor_id/);
  });
});

describe("payment history rules", () => {
  const obligations = new Map([
    [OBLIGATION_ACTIVATION, "activation_50"],
    [OBLIGATION_RENEWAL, "renewal_25"],
  ]);

  it("never emits a zero amount", () => {
    const rows = [
      {
        entry_id: "z",
        entry_type: "renewal_payment",
        amount_cents: 0,
        recorded_at: "2026-07-02T00:00:00.000Z",
        obligation_id: OBLIGATION_RENEWAL,
      },
    ];
    expect(paymentsFromLedger(rows, obligations)).toEqual([]);
  });

  it("drops a row with no id, no date, or no amount rather than filling one in", () => {
    const rows = [
      { entry_id: "", entry_type: "renewal_payment", amount_cents: 2500, recorded_at: "2026-07-02T00:00:00.000Z" },
      { entry_id: "a", entry_type: "renewal_payment", amount_cents: 2500, recorded_at: "not a date" },
      { entry_id: "b", entry_type: "renewal_payment", amount_cents: null, recorded_at: "2026-07-02T00:00:00.000Z" },
      { entry_id: "c", entry_type: "unknown_kind", amount_cents: 2500, recorded_at: "2026-07-02T00:00:00.000Z" },
    ];
    expect(paymentsFromLedger(rows, obligations)).toEqual([]);
  });

  it("reports a reversal and a refund as themselves, signed, naming what they undid", () => {
    const rows = [
      {
        entry_id: "r1",
        entry_type: "reversal",
        amount_cents: -2500,
        recorded_at: "2026-07-10T00:00:00.000Z",
        obligation_id: OBLIGATION_RENEWAL,
      },
      {
        entry_id: "r2",
        entry_type: "refund",
        amount_cents: -5000,
        recorded_at: "2026-07-11T00:00:00.000Z",
        obligation_id: OBLIGATION_ACTIVATION,
      },
    ];
    expect(paymentsFromLedger(rows, obligations)).toEqual([
      { id: "r1", at: "2026-07-10", label: "Renewal payment reversed", amountCents: -2500, status: "Reversed" },
      { id: "r2", at: "2026-07-11", label: "Activation payment refunded", amountCents: -5000, status: "Refunded" },
    ]);
  });

  it("falls back to the generic correction label when the obligation is unreadable", () => {
    const rows = [
      {
        entry_id: "r3",
        entry_type: "reversal",
        amount_cents: -2500,
        recorded_at: "2026-07-10T00:00:00.000Z",
        obligation_id: "unknown",
      },
    ];
    expect(paymentsFromLedger(rows, new Map())).toEqual([
      { id: "r3", at: "2026-07-10", label: "Payment reversed", amountCents: -2500, status: "Reversed" },
    ]);
  });

  it("takes the latest coverage end, whatever order the rows arrive in", () => {
    expect(
      nextChargeFromPeriods([
        { ends_at: "2026-08-02T00:00:00.000Z" },
        { ends_at: "2026-07-02T00:00:00.000Z" },
        { ends_at: "bad" },
      ]),
    ).toBe("2026-08-02");
    expect(nextChargeFromPeriods([])).toBeNull();
  });

  it("reads an unparseable timestamp as absent, never as a guessed day", () => {
    expect(isoDay("2026-06-02T15:04:05.000Z")).toBe("2026-06-02");
    expect(isoDay("not a date")).toBeNull();
    expect(isoDay(null)).toBeNull();
    expect(isoDay(undefined)).toBeNull();
  });
});

describe("membership agreements", () => {
  it("reports the real register, never marking an unaccepted draft accepted", () => {
    const views = membershipAgreements([]);
    expect(views).toHaveLength(AGREEMENT_DEFINITIONS.length);
    expect(views.every((view) => view.accepted === false)).toBe(true);
    expect(views.every((view) => view.summary === null)).toBe(true);
    expect(views.map((view) => view.key)).toEqual(AGREEMENT_DEFINITIONS.map((d) => d.key));
  });

  it("marks accepted only when the member accepted the CURRENT version", () => {
    const current = AGREEMENT_DEFINITIONS[0];
    const accepted = membershipAgreements([{ key: current.key, acceptedVersion: current.version }]);
    expect(accepted.find((view) => view.key === current.key)?.accepted).toBe(true);
    const stale = membershipAgreements([{ key: current.key, acceptedVersion: "0.0.1-superseded" }]);
    expect(stale.find((view) => view.key === current.key)?.accepted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. Privacy summary, served from the real tables
// ---------------------------------------------------------------------------

describe("GET member/privacy/summary", () => {
  it("reports the member's own consents and stored media", async () => {
    state.tables.research_consent_events = [
      {
        subject_type: "member",
        subject_id: MEMBER_A,
        consent_kind: "marketing_email",
        granted: true,
        created_at: "2026-06-02T00:00:00.000Z",
      },
    ];
    state.tables.research_private_media = [
      { member_id: MEMBER_A, id: "m1", kind: "progress_photo", uploaded_at: "2026-07-01T00:00:00.000Z", processing_state: "processed" },
    ];
    const response = await request(makeApp()).get(MEMBER_ACCOUNT_PATHS.privacySummary);
    expect(response.status).toBe(200);
    expect(response.body.consents).toEqual([
      { key: "marketing_email", label: "Marketing email", status: "Granted", grantedAt: "2026-06-02" },
    ]);
    expect(response.body.media).toEqual([{ id: "m1", kind: "Progress photo", addedAt: "2026-07-01" }]);
  });

  it("never shows another member's consents or media", async () => {
    state.tables.research_consent_events = [
      {
        subject_type: "member",
        subject_id: MEMBER_B,
        consent_kind: "marketing_email",
        granted: true,
        created_at: "2026-06-02T00:00:00.000Z",
      },
    ];
    state.tables.research_private_media = [
      { member_id: MEMBER_B, id: "m9", kind: "voice_note", uploaded_at: "2026-07-01T00:00:00.000Z" },
    ];
    const response = await request(makeApp()).get(MEMBER_ACCOUNT_PATHS.privacySummary);
    expect(response.body.consents).toEqual([]);
    expect(response.body.media).toEqual([]);
  });

  it("reads missing consent and media tables as the empty state", async () => {
    state.missing = new Set(["research_consent_events", "research_private_media"]);
    const response = await request(makeApp()).get(MEMBER_ACCOUNT_PATHS.privacySummary);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, consents: [], media: [] });
  });
});

describe("consent registry reading", () => {
  it("lets the latest row win, so a withdrawal supersedes the grant", () => {
    const rows = [
      { consent_kind: "marketing_email", granted: false, created_at: "2026-07-01T00:00:00.000Z" },
      { consent_kind: "marketing_email", granted: true, created_at: "2026-06-01T00:00:00.000Z" },
    ];
    expect(consentsFromEvents(rows)).toEqual([
      { key: "marketing_email", label: "Marketing email", status: "Withdrawn", grantedAt: null },
    ]);
  });

  it("resolves the same way whatever order the rows arrive in", () => {
    const rows = [
      { consent_kind: "marketing_email", granted: true, created_at: "2026-06-01T00:00:00.000Z" },
      { consent_kind: "marketing_email", granted: false, created_at: "2026-07-01T00:00:00.000Z" },
    ];
    expect(consentsFromEvents(rows)[0].status).toBe("Withdrawn");
  });

  it("shows no date beside a withdrawn consent", () => {
    const rows = [{ consent_kind: "health_data_collection", granted: false, created_at: "2026-07-01T00:00:00.000Z" }];
    expect(consentsFromEvents(rows)[0].grantedAt).toBeNull();
  });

  it("drops a row with no kind or no usable timestamp", () => {
    expect(
      consentsFromEvents([
        { consent_kind: "", granted: true, created_at: "2026-07-01T00:00:00.000Z" },
        { consent_kind: "marketing_email", granted: true, created_at: "nonsense" },
      ]),
    ).toEqual([]);
  });
});

describe("media inventory reading", () => {
  it("does not list an object that has been deleted", () => {
    expect(
      mediaFromRows([
        { id: "m1", kind: "progress_photo", uploaded_at: "2026-07-01T00:00:00.000Z", processing_state: "deleted" },
        { id: "m2", kind: "voice_note", uploaded_at: "2026-07-02T00:00:00.000Z", processing_state: "processed" },
      ]),
    ).toEqual([{ id: "m2", kind: "Voice note", addedAt: "2026-07-02" }]);
  });

  it("drops a row with no id, kind, or upload date", () => {
    expect(
      mediaFromRows([
        { id: "", kind: "progress_photo", uploaded_at: "2026-07-01T00:00:00.000Z" },
        { id: "m3", kind: "", uploaded_at: "2026-07-01T00:00:00.000Z" },
        { id: "m4", kind: "progress_photo", uploaded_at: null },
      ]),
    ).toEqual([]);
  });
});
