import crypto from "crypto";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FRAUD_ACTIONS } from "@shared/research/referral-types";

// ---------------------------------------------------------------------------
// P0: the referral fraud reviewer surface writes the member credit ledger, so
// it must fail closed while RESEARCH_REFERRALS_ENABLED is off.
//
// These tests drive the REAL fraud.ts and fraud-admin.ts. Nothing about the
// gate is mocked. What is faked is the store underneath, so that "no money
// moved" can be asserted directly: every insert and update is a spy, and the
// two tables that matter (member_credit_ledger and referral_rewards) have
// their own spies that must never be called while the capability is off.
// ---------------------------------------------------------------------------

const db = vi.hoisted(() => ({
  tables: {
    referral_fraud_flags: [] as any[],
    referral_rewards: [] as any[],
    referral_attributions: [] as any[],
    referral_identities: [] as any[],
    referral_events: [] as any[],
    member_credit_ledger: [] as any[],
  } as Record<string, any[]>,
  // Table-scoped write spies. The money assertions read these.
  ledgerInsert: vi.fn(),
  rewardInsert: vi.fn(),
  rewardUpdate: vi.fn(),
  // Everything else, for the wider "nothing at all happened" assertions.
  anyInsert: vi.fn(),
  anyUpdate: vi.fn(),
}));

vi.mock("../supabase", () => {
  function query(table: string) {
    const list = db.tables[table] ?? (db.tables[table] = []);
    let mode: "select" | "insert" | "update" = "select";
    let insertPayload: any = null;
    let updatePayload: any = null;
    const filters: Array<[string, any]> = [];
    let limitN: number | null = null;
    let orderDesc = false;

    const applyFilters = (rows: any[]) => rows.filter((r) => filters.every(([c, v]) => r[c] === v));
    const finish = () => {
      if (mode === "insert") {
        db.anyInsert(table, insertPayload);
        if (table === "member_credit_ledger") db.ledgerInsert(insertPayload);
        if (table === "referral_rewards") db.rewardInsert(insertPayload);
        const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...insertPayload };
        list.push(row);
        return { data: row, error: null };
      }
      if (mode === "update") {
        // Spy on the ATTEMPT, before any row matching, so a mutation that
        // matched nothing is still visible as a mutation that was tried.
        db.anyUpdate(table, updatePayload);
        if (table === "referral_rewards") db.rewardUpdate(updatePayload);
        const targets = applyFilters(list);
        if (!targets.length) return { data: null, error: { message: "no matching row" } };
        Object.assign(targets[0], updatePayload);
        return { data: targets[0], error: null };
      }
      let rows = applyFilters(list);
      if (orderDesc) rows = [...rows].reverse();
      if (limitN != null) rows = rows.slice(0, limitN);
      return { data: rows, error: null };
    };

    const api: any = {
      select: () => api,
      insert: (p: any) => { mode = "insert"; insertPayload = p; return api; },
      update: (p: any) => { mode = "update"; updatePayload = p; return api; },
      eq: (c: string, v: any) => { filters.push([c, v]); return api; },
      order: () => { orderDesc = true; return api; },
      limit: (n: number) => { limitN = n; return api; },
      maybeSingle: async () => {
        const r = finish();
        const d = Array.isArray(r.data) ? r.data[0] ?? null : r.data;
        return { data: d, error: null };
      },
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

const auth = vi.hoisted(() => ({ adminEmail: null as string | null }));

vi.mock("../routes", () => ({
  requireSupabaseAdmin(req: any, res: any, next: any) {
    if (!auth.adminEmail) return res.status(401).json({ ok: false, message: "Admin sign-in required." });
    req.adminEmail = auth.adminEmail;
    next();
  },
}));

import {
  applyFraudAction,
  openFraudFlag,
  recordReferralEvent,
  reverseRewardsForAttribution,
} from "./fraud";
import { registerReferralFraudAdmin } from "./fraud-admin";

// --- fixtures ---------------------------------------------------------------

function seedCase(rewardStatuses: string[]) {
  const identity = {
    id: crypto.randomUUID(),
    owner_type: "member",
    owner_id: crypto.randomUUID(),
    owner_email: "referrer@example.com",
    code: "AAAAAAAAAA",
    status: "active",
  };
  db.tables.referral_identities.push(identity);

  const attribution = {
    id: crypto.randomUUID(),
    referral_identity_id: identity.id,
    application_id: crypto.randomUUID(),
    status: "qualified",
    disqualification_reason: null,
  };
  db.tables.referral_attributions.push(attribution);

  for (const status of rewardStatuses) {
    db.tables.referral_rewards.push({
      id: crypto.randomUUID(),
      attribution_id: attribution.id,
      recipient_type: "referrer",
      recipient_member_id: identity.owner_id,
      reward_type: "credit",
      value_cents: 1500,
      currency: "usd",
      status,
    });
  }

  const flag = {
    id: crypto.randomUUID(),
    reason: "unusual-velocity",
    status: "open",
    attribution_id: attribution.id,
    identity_id: identity.id,
    resolution_action: null,
    resolution_reason: null,
    resolved_by: null,
    resolved_at: null,
  };
  db.tables.referral_fraud_flags.push(flag);

  return { identity, attribution, flag };
}

function rewardStatuses(): string[] {
  return db.tables.referral_rewards.map((r) => r.status);
}

// A FIXED canonical flag id, for the tests that assert the refusal line does
// NOT contain something. crypto.randomUUID() is unsafe there and was a real
// measured flake: a v4 UUID is hex and hyphens, "1500" is the seeded reward's
// value_cents and is made only of hex digits, so a random id contains it about
// 1 run in 4,487 (measured over 20M samples) and fails an assertion that has
// nothing to do with what it is testing. A flaky assertion in the file that
// certifies the money-path gate destroys the signal it exists to give, because
// the next person who sees it go red deletes it.
//
// This literal contains no "5" at all, so "1500" is impossible in it rather
// than merely unlikely, and every other needle in ABSENT_NEEDLES contains a
// character outside the UUID alphabet. Both properties are pinned by the guard
// test in the log-forging section below, so the collision cannot come back.
const LOG_SAFE_FLAG_ID = "a1b2c3d4-e6f7-4a8b-9c0d-e1f2a3b4c6d7";

/** The single assertion that matters: no money moved and no reward changed. */
function expectNoMoneyPathTouched() {
  expect(db.ledgerInsert).not.toHaveBeenCalled();
  expect(db.rewardInsert).not.toHaveBeenCalled();
  expect(db.rewardUpdate).not.toHaveBeenCalled();
  expect(db.tables.member_credit_ledger).toHaveLength(0);
}

function makeAdminApp() {
  const app = express();
  app.use(express.json());
  registerReferralFraudAdmin(app);
  return app;
}

// A refused action logs. Captured rather than printed, so the refusal-log
// assertions below read the calls instead of the test output being flooded.
let warned: ReturnType<typeof vi.spyOn>;

function warnLines(): string[] {
  return warned.mock.calls.map((call) => String(call[0]));
}

beforeEach(() => {
  for (const key of Object.keys(db.tables)) db.tables[key].length = 0;
  db.ledgerInsert.mockClear();
  db.rewardInsert.mockClear();
  db.rewardUpdate.mockClear();
  db.anyInsert.mockClear();
  db.anyUpdate.mockClear();
  auth.adminEmail = null;
  delete process.env.RESEARCH_REFERRALS_ENABLED;
  warned = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  warned.mockRestore();
  delete process.env.RESEARCH_REFERRALS_ENABLED;
});

// ---------------------------------------------------------------------------

describe("capability OFF: every fraud entry point fails closed", () => {
  it("refuses all seven reviewer actions and writes nothing to the ledger or the rewards", async () => {
    for (const action of FRAUD_ACTIONS) {
      for (const key of Object.keys(db.tables)) db.tables[key].length = 0;
      const { flag, identity } = seedCase(["held", "pending", "available"]);

      const result = await applyFraudAction({
        flagId: flag.id,
        action,
        reason: `attempted ${action} while the program is off`,
        adminId: "admin@xeniostechnology.com",
      });

      expect(result.ok).toBe(false);
      expect((result as { code?: string }).code).toBe("referrals_disabled");
      // The flag itself is untouched, so the case is not silently resolved.
      expect(db.tables.referral_fraud_flags[0].status).toBe("open");
      expect(db.tables.referral_fraud_flags[0].resolution_action).toBeNull();
      // Reward statuses are exactly as seeded.
      expect(rewardStatuses().sort()).toEqual(["available", "held", "pending"]);
      // The referrer identity is not suspended either.
      expect(db.tables.referral_identities.find((i) => i.id === identity.id)!.status).toBe("active");
      expect(db.tables.referral_events).toHaveLength(0);
      expectNoMoneyPathTouched();
    }
  });

  it("reverseRewardsForAttribution writes no compensating negative ledger entry", async () => {
    const { attribution } = seedCase(["available", "redeemed", "held", "pending"]);

    const result = await reverseRewardsForAttribution({
      attributionId: attribution.id,
      reason: "chargeback",
      actorType: "admin",
      actorId: "admin@xeniostechnology.com",
    });

    expect(result).toEqual({ cancelled: 0, reversed: 0 });
    expect(rewardStatuses().sort()).toEqual(["available", "held", "pending", "redeemed"]);
    expectNoMoneyPathTouched();
  });

  it("the held -> pending flip that steers the promotion cron cannot happen", async () => {
    // hold is the action that pauses a held reward so the 5-minute
    // promoteHeldRewards cron cannot mint it; clear is the action that releases
    // a paused reward back into the cron's path. Neither may move while the
    // program is off, because both decide what the cron later turns into
    // positive member credit.
    const held = seedCase(["held"]);
    const holdResult = await applyFraudAction({
      flagId: held.flag.id,
      action: "hold",
      reason: "pause this while the program is off",
      adminId: "admin@xeniostechnology.com",
    });
    expect(holdResult.ok).toBe(false);
    expect(rewardStatuses()).toEqual(["held"]);
    expect(db.rewardUpdate).not.toHaveBeenCalled();

    for (const key of Object.keys(db.tables)) db.tables[key].length = 0;
    db.rewardUpdate.mockClear();

    const paused = seedCase(["pending"]);
    const clearResult = await applyFraudAction({
      flagId: paused.flag.id,
      action: "clear",
      reason: "release this while the program is off",
      adminId: "admin@xeniostechnology.com",
    });
    expect(clearResult.ok).toBe(false);
    expect(rewardStatuses()).toEqual(["pending"]);
    expect(db.rewardUpdate).not.toHaveBeenCalled();
    expectNoMoneyPathTouched();
  });

  it("openFraudFlag creates no flag row", async () => {
    const id = await openFraudFlag({ reason: "manual-report", detail: "reported while the program is off" });
    expect(id).toBeNull();
    expect(db.tables.referral_fraud_flags).toHaveLength(0);
    expect(db.anyInsert).not.toHaveBeenCalled();
  });

  it("recordReferralEvent writes no event row", async () => {
    await recordReferralEvent({ eventType: "fraud-action-clear", actorType: "admin", actorId: "admin@x" });
    expect(db.tables.referral_events).toHaveLength(0);
    expect(db.anyInsert).not.toHaveBeenCalled();
  });
});

describe("capability OFF: a refused action writes nothing and leaves a refusal log line", () => {
  // Without this, an admin attempting money moves during a capability-off
  // window produces zero rows AND zero log lines, so the attempts are
  // invisible. The refusal is logged rather than recorded, because recording a
  // row would itself be a referral-subsystem write while the subsystem is off.
  it("warns with the action and the flag id while still writing nothing", async () => {
    const { flag } = seedCase(["held", "available"]);

    const result = await applyFraudAction({
      flagId: flag.id,
      action: "reverse-reward",
      reason: "attempted while the program is off",
      adminId: "admin@xeniostechnology.com",
    });

    expect(result.ok).toBe(false);
    const lines = warnLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("[referral fraud]");
    expect(lines[0]).toContain("reverse-reward");
    expect(lines[0]).toContain(flag.id);

    // Log only. Nothing was inserted or updated anywhere, so the fail-closed
    // property is intact and observability did not weaken it.
    expect(db.anyInsert).not.toHaveBeenCalled();
    expect(db.anyUpdate).not.toHaveBeenCalled();
    expect(db.tables.referral_events).toHaveLength(0);
    expect(db.tables.referral_fraud_flags[0].status).toBe("open");
    expectNoMoneyPathTouched();
  });

  it("logs no email, no reviewer reason text and no ledger amount", async () => {
    // Fixed id, not crypto.randomUUID(): see LOG_SAFE_FLAG_ID. seedCase still
    // supplies the 1500-cent reward that makes the amount assertion mean
    // something.
    seedCase(["available"]);

    await applyFraudAction({
      flagId: LOG_SAFE_FLAG_ID,
      action: "disqualify",
      reason: "member jane.doe@example.com reported this",
      adminId: "admin@xeniostechnology.com",
    });

    const line = warnLines()[0];
    expect(line).not.toContain("admin@xeniostechnology.com");
    expect(line).not.toContain("jane.doe@example.com");
    expect(line).not.toContain("referrer@example.com");
    expect(line).not.toContain("1500");
  });

  it("logs every repeated attempt, so a run of attempts is visible as a run", async () => {
    const { flag } = seedCase(["held", "available"]);
    const attempts: Array<"disqualify" | "reverse-reward"> = [
      "disqualify",
      "reverse-reward",
      "disqualify",
    ];

    for (const action of attempts) {
      await applyFraudAction({
        flagId: flag.id,
        action,
        reason: "attempted while the program is off",
        adminId: "admin@xeniostechnology.com",
      });
    }

    expect(warnLines()).toHaveLength(3);
    expect(warnLines().filter((l) => l.includes("disqualify"))).toHaveLength(2);
    expectNoMoneyPathTouched();
  });

  it("the admin route's refusal is logged too", async () => {
    auth.adminEmail = "admin@xeniostechnology.com";
    const { flag } = seedCase(["available"]);

    const res = await request(makeAdminApp())
      .post(`/api/admin/research/referral-fraud/${flag.id}/action`)
      .send({ action: "disqualify", reason: "confirmed duplicate accounts" });

    expect(res.status).toBe(409);
    expect(warnLines().some((l) => l.includes("disqualify") && l.includes(flag.id))).toBe(true);
    expectNoMoneyPathTouched();
  });
});

// ---------------------------------------------------------------------------
// This refusal line is the only trace the REFERRAL SUBSYSTEM records for a
// refused reviewer action, because recording a row would itself be a
// referral-subsystem write while the subsystem is off. So a caller who can
// forge this line can forge that record.
//
// It is NOT the only line the request produces, and an earlier version of this
// comment claimed it was. The pre-existing request logger in server/index.ts
// runs for every /api request, before and regardless of authentication, and
// emits a second line for the same request carrying req.path verbatim:
//
//   [rid:...] POST /api/admin/research/referral-fraud/referrer@example.com/action 409 in 1ms
//
// The residual there is narrow, and worth stating exactly rather than
// flattening in either direction. req.path is NOT percent-decoded (req.params
// is, which is why the cases below are real attacks against THIS line): in
// req.path, %0A stays "%0A", %0D stays "%0D", %1B stays "%1B" and %40 stays
// "%40", so newline, CRLF and ANSI forging are dead in the request log too.
// What survives there is a RAW, unencoded "@", a legal path character, so an
// address typed straight into the URL reaches the request log even though it
// can never reach the refusal line below.
//
// That logger is pre-existing and is untouched by this change, so this gate
// neither introduces nor worsens the residual. It is recorded as a follow-up
// for the owner of server/index.ts rather than fixed here: changing a global
// request logger is out of scope for this P0, and that file is leased.
//
// The flag id reaches applyFraudAction straight from the URL path, and Express
// percent-decodes a path PARAMETER before the route sees it: %0A arrives as a
// real newline, %1B as a real escape character, %40 as a real "@". The route
// tests below drive the REAL registered route with a REAL admin principal and
// assert the string console.warn actually received.
// ---------------------------------------------------------------------------

const ESCAPE = "\u001b";
const ANY_CONTROL_CHAR = /[\u0000-\u001f\u007f-\u009f]/;
const VALID_FLAG_ID = "550e8400-e29b-41d4-a716-446655440000";

// The whole emitted line, end to end. Every fragment is either fixed prose, a
// FRAUD_ACTIONS member (lowercase letters and hyphens) or "<unknown>", and
// either a hex-and-hyphen UUID or "<omitted>". Matching this pattern is itself
// the single-line proof: the pattern is anchored at both ends, JavaScript's $
// without the m flag matches only at end of input (unlike Perl and Python it
// does not tolerate a trailing newline), and none of the character classes
// between the anchors admits a newline, a carriage return, an escape character
// or an "@". The explicit checks below it are redundant on purpose, so a
// failure says which property broke.
const REFUSAL_LINE =
  /^\[referral fraud\] refused reviewer action: action=(?:[a-z-]+|<unknown>) flag=(?:[0-9a-fA-F-]+|<omitted>)\. The referral program is disabled, so nothing was written\.$/;

function expectLineIsSingleLineAndClean(line: string) {
  expect(line).toMatch(REFUSAL_LINE);
  expect(line).not.toContain("\n");
  expect(line).not.toContain("\r");
  expect(line).not.toContain(ESCAPE);
  expect(line).not.toContain("@");
  expect(ANY_CONTROL_CHAR.test(line)).toBe(false);
  expect(line.split(/\r?\n/)).toHaveLength(1);
}

// Every string the refusal-line tests assert the line does NOT contain. A flag
// id is echoed into that line verbatim when it is canonical, so an id that
// happens to contain one of these fails an assertion about something else.
const ABSENT_NEEDLES = [
  "1500",
  "@",
  "\n",
  "\r",
  ESCAPE,
  "FORGED",
  "applied successfully",
  "admin@xeniostechnology.com",
  "jane.doe@example.com",
  "referrer@example.com",
  "evil.example.com",
  "example.com",
  "<omitted>",
  "<unknown>",
];

// Mirrors CANONICAL_UUID in fraud.ts: an id must match this to be echoed at all
// rather than reported as <omitted>.
const CANONICAL_UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

it("the fixed flag ids are canonical and collide with none of the absent needles", () => {
  // The regression guard for a measured flake. These ids used to be
  // crypto.randomUUID(); "1500" is all hex digits, so about 1 random id in
  // 4,487 contained it and failed "logs no email, no reviewer reason text and
  // no ledger amount" for a reason unrelated to the gate. Fixing the ids fixed
  // the flake; this test keeps a future edit from putting a colliding id back.
  for (const id of [LOG_SAFE_FLAG_ID, VALID_FLAG_ID]) {
    // Canonical, so the positive-control tests really do exercise the echo path.
    expect(id).toMatch(CANONICAL_UUID_SHAPE);
    for (const needle of ABSENT_NEEDLES) {
      expect(id).not.toContain(needle);
    }
  }
  // LOG_SAFE_FLAG_ID goes past "does not happen to contain 1500": it holds no
  // "5" at all, so no substring of it can ever be "1500".
  expect(LOG_SAFE_FLAG_ID).not.toContain("5");
});

/** Nothing at all was written: not the money path, not any other table. */
function expectNothingWritten() {
  expect(db.anyInsert).not.toHaveBeenCalled();
  expect(db.anyUpdate).not.toHaveBeenCalled();
  expect(db.tables.referral_events).toHaveLength(0);
  expectNoMoneyPathTouched();
}

describe("capability OFF: the refusal line cannot be forged by the flag id", () => {
  beforeEach(() => {
    auth.adminEmail = "admin@xeniostechnology.com";
  });

  function postAction(pathId: string) {
    return request(makeAdminApp())
      .post(`/api/admin/research/referral-fraud/${pathId}/action`)
      .send({ action: "disqualify", reason: "attempted with a hostile flag id" });
  }

  // Each entry: what the attacker puts in the URL path, and what it proves.
  const hostileIds: Array<{ what: string; pathId: string; proves: string }> = [
    {
      what: "a percent-encoded newline and a forged second line",
      pathId: `${VALID_FLAG_ID}%0A%5Breferral%20fraud%5D%20action%20applied%20successfully`,
      proves: "log forging: one refusal cannot be split into two lines, one of which reads as a success",
    },
    {
      what: "a percent-encoded carriage return and newline",
      pathId: `${VALID_FLAG_ID}%0D%0A%5Breferral%20fraud%5D%20action%20applied%20successfully`,
      proves: "CRLF forging, the same attack against readers that split on \\r\\n",
    },
    {
      what: "ANSI escape sequences",
      pathId: `${VALID_FLAG_ID}%1B%5B31mFORGED%1B%5B0m`,
      proves: "terminal control: the line cannot repaint, recolour or erase what an operator sees",
    },
    {
      what: "an email address",
      pathId: "referrer@example.com",
      proves: "PII smuggling: an address reaches the log line and would make it a PII sink",
    },
    {
      what: "a real flag id with an email address appended",
      pathId: `${VALID_FLAG_ID}%40evil.example.com`,
      proves: "PII smuggling that hides behind a legitimate-looking prefix",
    },
    {
      what: "a UUID with the hyphens removed",
      pathId: "550e8400e29b41d4a716446655440000",
      proves: "a valid-looking but non-canonical id is omitted, not echoed",
    },
    {
      what: "a UUID one character short",
      pathId: "550e8400-e29b-41d4-a716-44665544000",
      proves: "wrong length is rejected",
    },
    {
      what: "a UUID one character long",
      pathId: "550e8400-e29b-41d4-a716-4466554400000",
      proves: "wrong length is rejected in the other direction",
    },
    {
      what: "a UUID with the hyphens in the wrong places",
      pathId: "550e8400-e29b41d4-a716-4466-55440000",
      proves: "wrong hyphenation is rejected even at the right total length",
    },
    {
      what: "a UUID-shaped id with non-hex characters",
      pathId: "zzzzzzzz-e29b-41d4-a716-446655440000",
      proves: "the alphabet is hex only, so no other character can enter the line",
    },
  ];

  for (const { what, pathId, proves } of hostileIds) {
    it(`omits a flag id containing ${what} (${proves})`, async () => {
      seedCase(["held", "available"]);

      const res = await postAction(pathId);

      // It really did reach the capability gate: the route answered the gate's
      // refusal, not a 400 or a 404 from somewhere earlier.
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("referrals_disabled");

      const lines = warnLines();
      expect(lines).toHaveLength(1);
      expectLineIsSingleLineAndClean(lines[0]);

      // Omitted outright, not truncated and not "sanitised": a sanitised echo
      // is still an echo.
      expect(lines[0]).toContain("flag=<omitted>");
      expect(lines[0]).toContain("action=disqualify");
      expect(lines[0]).not.toContain("FORGED");
      expect(lines[0]).not.toContain("applied successfully");
      expect(lines[0]).not.toContain("evil.example.com");
      expect(lines[0]).not.toContain("example.com");

      expectNothingWritten();
    });
  }

  it("still echoes a canonical flag id, so the omission discriminates instead of blanking everything", async () => {
    // The positive control. Without it every assertion above would pass on a
    // gate that simply never printed an id.
    seedCase(["held", "available"]);

    const res = await postAction(VALID_FLAG_ID);

    expect(res.status).toBe(409);
    const line = warnLines()[0];
    expect(line).toContain(`flag=${VALID_FLAG_ID}`);
    expect(line).not.toContain("<omitted>");
    expectLineIsSingleLineAndClean(line);
    expectNothingWritten();
  });

  it("omits a raw newline and carriage return passed straight to the exported entry point", async () => {
    // A URL cannot carry a raw newline, but applyFraudAction is exported and is
    // a real entry point in its own right (the route is a thin shell around
    // it), so the same guarantee has to hold for an in-process caller.
    seedCase(["held", "available"]);

    await applyFraudAction({
      flagId: `${VALID_FLAG_ID}\r\n[referral fraud] action applied successfully`,
      action: "disqualify",
      reason: "attempted with a raw control character in the flag id",
      adminId: "admin@xeniostechnology.com",
    });

    const line = warnLines()[0];
    expectLineIsSingleLineAndClean(line);
    expect(line).toContain("flag=<omitted>");
    expect(line).not.toContain("applied successfully");
    expectNothingWritten();
  });
});

describe("capability OFF: the refusal line cannot be forged by the action", () => {
  const hostileActions: Array<{ what: string; action: string }> = [
    { what: "an action that is simply not in the set", action: "grant-bonus" },
    {
      what: "an action carrying a newline and a forged second line",
      action: "clear\n[referral fraud] action applied successfully",
    },
    { what: "an action carrying ANSI escape sequences", action: `clear${ESCAPE}[31mFORGED${ESCAPE}[0m` },
    { what: "an action carrying an email address", action: "clear referrer@example.com" },
    { what: "the empty string", action: "" },
  ];

  for (const { what, action } of hostileActions) {
    it(`logs <unknown> for ${what}`, async () => {
      const { flag } = seedCase(["held", "available"]);

      const result = await applyFraudAction({
        flagId: flag.id,
        action: action as unknown as (typeof FRAUD_ACTIONS)[number],
        reason: "attempted with a hostile action name",
        adminId: "admin@xeniostechnology.com",
      });

      expect(result.ok).toBe(false);
      const line = warnLines()[0];
      expectLineIsSingleLineAndClean(line);
      expect(line).toContain("action=<unknown>");
      expect(line).not.toContain("FORGED");
      expect(line).not.toContain("applied successfully");
      // The flag id is canonical here, so it is still reported: the two fields
      // are validated independently.
      expect(line).toContain(`flag=${flag.id}`);
      expectNothingWritten();
    });
  }

  it("names every real action verbatim, so <unknown> is not the answer to everything", async () => {
    // The positive control for the action field.
    for (const action of FRAUD_ACTIONS) {
      for (const key of Object.keys(db.tables)) db.tables[key].length = 0;
      warned.mockClear();
      const { flag } = seedCase(["held"]);

      await applyFraudAction({
        flagId: flag.id,
        action,
        reason: "attempted while the program is off",
        adminId: "admin@xeniostechnology.com",
      });

      const line = warnLines()[0];
      expect(line).toContain(`action=${action}`);
      expect(line).not.toContain("<unknown>");
      expectLineIsSingleLineAndClean(line);
    }
  });

  it("the route rejects a hostile action before the gate ever sees it, and logs nothing", async () => {
    // Defense in depth, stated accurately: the route's z.enum(FRAUD_ACTIONS)
    // already refuses a non-member action with 400, so the hostile-action cases
    // above are reachable through the exported function rather than through
    // this route. The in-module validation is what makes the guarantee hold for
    // any caller, not only this one.
    auth.adminEmail = "admin@xeniostechnology.com";
    const { flag } = seedCase(["held", "available"]);

    const res = await request(makeAdminApp())
      .post(`/api/admin/research/referral-fraud/${flag.id}/action`)
      .send({ action: "clear\n[referral fraud] action applied", reason: "attempted with a hostile action" });

    expect(res.status).toBe(400);
    expect(warnLines()).toHaveLength(0);
    expectNothingWritten();
  });
});

describe("capability ON: an applied action is not logged as a refusal", () => {
  it("stays silent when the action actually runs", async () => {
    process.env.RESEARCH_REFERRALS_ENABLED = "true";
    const { flag } = seedCase(["held"]);

    const result = await applyFraudAction({
      flagId: flag.id,
      action: "hold",
      reason: "investigating a report",
      adminId: "admin@xeniostechnology.com",
    });

    expect(result.ok).toBe(true);
    expect(warnLines()).toHaveLength(0);
  });
});

describe("capability OFF with a real admin principal: the capability gate, not the auth gate, refuses", () => {
  it("the action route answers 401 without an admin and 409 referrals_disabled with one", async () => {
    const { flag } = seedCase(["held", "available"]);
    const app = makeAdminApp();
    const body = { action: "disqualify", reason: "confirmed duplicate accounts" };

    // No admin: the auth gate stops it first.
    auth.adminEmail = null;
    const anonymous = await request(app).post(`/api/admin/research/referral-fraud/${flag.id}/action`).send(body);
    expect(anonymous.status).toBe(401);

    // A real admin principal gets all the way past auth and is refused anyway.
    auth.adminEmail = "admin@xeniostechnology.com";
    const authorized = await request(app).post(`/api/admin/research/referral-fraud/${flag.id}/action`).send(body);
    expect(authorized.status).toBe(409);
    expect(authorized.body.ok).toBe(false);
    expect(authorized.body.code).toBe("referrals_disabled");

    expect(rewardStatuses().sort()).toEqual(["available", "held"]);
    expect(db.tables.referral_attributions[0].status).toBe("qualified");
    expectNoMoneyPathTouched();
  });

  it("the manual-report route refuses for an admin instead of reporting a phantom success", async () => {
    auth.adminEmail = "admin@xeniostechnology.com";
    const res = await request(makeAdminApp())
      .post("/api/admin/research/referral-fraud/report")
      .send({ detail: "a member reported a suspicious referral" });

    expect(res.status).toBe(409);
    expect(res.body.ok).toBe(false);
    expect(res.body.code).toBe("referrals_disabled");
    expect(db.tables.referral_fraud_flags).toHaveLength(0);
    expectNoMoneyPathTouched();
  });
});

describe("only the exact string \"true\" enables the capability", () => {
  // referralsEnabled() is process.env.RESEARCH_REFERRALS_ENABLED === "true".
  // Anything else, including the near misses people actually type, fails closed.
  const refusingValues: Array<[string, string | undefined]> = [
    ["unset", undefined],
    ["empty string", ""],
    ["1", "1"],
    ["TRUE", "TRUE"],
    ["True", "True"],
    ["leading and trailing spaces", " true "],
    ["trailing newline", "true\n"],
    ["false", "false"],
    ["yes", "yes"],
    ["on", "on"],
  ];

  for (const [label, value] of refusingValues) {
    it(`refuses when the flag is ${label}`, async () => {
      if (value === undefined) delete process.env.RESEARCH_REFERRALS_ENABLED;
      else process.env.RESEARCH_REFERRALS_ENABLED = value;

      const { flag } = seedCase(["held", "available"]);
      const result = await applyFraudAction({
        flagId: flag.id,
        action: "disqualify",
        reason: "attempted with a near-miss flag value",
        adminId: "admin@xeniostechnology.com",
      });

      expect(result.ok).toBe(false);
      expect((result as { code?: string }).code).toBe("referrals_disabled");
      expect(rewardStatuses().sort()).toEqual(["available", "held"]);
      expectNoMoneyPathTouched();
    });
  }

  it("accepts the exact string \"true\" and only then acts", async () => {
    process.env.RESEARCH_REFERRALS_ENABLED = "true";
    const { flag } = seedCase(["held"]);
    const result = await applyFraudAction({
      flagId: flag.id,
      action: "hold",
      reason: "investigating a report",
      adminId: "admin@xeniostechnology.com",
    });
    expect(result.ok).toBe(true);
    expect(rewardStatuses()).toEqual(["pending"]);
  });
});

describe("capability ON: the reviewer surface still behaves exactly as before", () => {
  beforeEach(() => {
    process.env.RESEARCH_REFERRALS_ENABLED = "true";
  });

  it("clear releases review-pending rewards back to held and resolves the flag", async () => {
    const { flag } = seedCase(["pending"]);
    const result = await applyFraudAction({
      flagId: flag.id,
      action: "clear",
      reason: "reviewed: legitimate activity",
      adminId: "admin@xeniostechnology.com",
    });
    expect(result).toEqual({ ok: true, status: "resolved" });
    expect(rewardStatuses()).toEqual(["held"]);
    expect(db.tables.referral_fraud_flags[0].status).toBe("resolved");
    expect(db.tables.referral_fraud_flags[0].resolution_reason).toBe("reviewed: legitimate activity");
  });

  it("hold pauses held rewards and keeps the case open", async () => {
    const { flag } = seedCase(["held"]);
    const result = await applyFraudAction({
      flagId: flag.id,
      action: "hold",
      reason: "investigating a report",
    });
    expect(result).toEqual({ ok: true, status: "open" });
    expect(rewardStatuses()).toEqual(["pending"]);
    expect(db.tables.referral_fraud_flags[0].status).toBe("open");
  });

  it("disqualify reverses the attribution and writes the compensating negative ledger entry", async () => {
    const { flag } = seedCase(["available"]);
    const result = await applyFraudAction({
      flagId: flag.id,
      action: "disqualify",
      reason: "confirmed duplicate accounts",
      adminId: "admin@xeniostechnology.com",
    });
    expect(result).toEqual({ ok: true, status: "resolved" });
    expect(db.tables.referral_attributions[0].status).toBe("disqualified");
    expect(rewardStatuses()).toEqual(["reversed"]);
    expect(db.tables.member_credit_ledger).toHaveLength(1);
    expect(db.tables.member_credit_ledger[0].amount_cents).toBe(-1500);
    expect(db.tables.member_credit_ledger[0].entry_type).toBe("reversal");
    expect(db.ledgerInsert).toHaveBeenCalledTimes(1);
  });

  it("reverseRewardsForAttribution cancels held rewards and reverses available ones", async () => {
    const { attribution } = seedCase(["held", "available"]);
    const result = await reverseRewardsForAttribution({
      attributionId: attribution.id,
      reason: "chargeback",
      actorType: "admin",
      actorId: "admin@xeniostechnology.com",
    });
    expect(result).toEqual({ cancelled: 1, reversed: 1 });
    expect(rewardStatuses().sort()).toEqual(["cancelled", "reversed"]);
    expect(db.tables.member_credit_ledger).toHaveLength(1);
    expect(db.tables.member_credit_ledger[0].amount_cents).toBe(-1500);
  });

  it("suspend-referrer pauses the identity", async () => {
    const { flag, identity } = seedCase(["held"]);
    const result = await applyFraudAction({
      flagId: flag.id,
      action: "suspend-referrer",
      reason: "pattern across accounts",
    });
    expect(result).toEqual({ ok: true, status: "resolved" });
    expect(db.tables.referral_identities.find((i) => i.id === identity.id)!.status).toBe("paused");
  });

  it("openFraudFlag and recordReferralEvent write their rows again", async () => {
    const id = await openFraudFlag({ reason: "manual-report", detail: "a member reported this" });
    expect(id).toBeTruthy();
    expect(db.tables.referral_fraud_flags).toHaveLength(1);

    await recordReferralEvent({ eventType: "fraud-action-clear", actorType: "admin", actorId: "admin@x" });
    // one event from openFraudFlag ("fraud-flag-opened") plus this one
    expect(db.tables.referral_events).toHaveLength(2);
  });

  it("the admin action route still returns 404 for an unknown flag, not the capability refusal", async () => {
    auth.adminEmail = "admin@xeniostechnology.com";
    const res = await request(makeAdminApp())
      .post(`/api/admin/research/referral-fraud/${crypto.randomUUID()}/action`)
      .send({ action: "clear", reason: "reviewed: legitimate activity" });
    expect(res.status).toBe(404);
    expect(res.body.code).toBeUndefined();
  });

  it("the admin action route applies a real action end to end", async () => {
    auth.adminEmail = "admin@xeniostechnology.com";
    const { flag } = seedCase(["available"]);
    const res = await request(makeAdminApp())
      .post(`/api/admin/research/referral-fraud/${flag.id}/action`)
      .send({ action: "disqualify", reason: "confirmed duplicate accounts" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, status: "resolved" });
    expect(db.tables.member_credit_ledger).toHaveLength(1);
    expect(db.tables.member_credit_ledger[0].actor_id).toBe("admin@xeniostechnology.com");
  });

  it("the manual-report route opens a flag again", async () => {
    auth.adminEmail = "admin@xeniostechnology.com";
    const res = await request(makeAdminApp())
      .post("/api/admin/research/referral-fraud/report")
      .send({ detail: "a member reported a suspicious referral" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.flagId).toBeTruthy();
    expect(db.tables.referral_fraud_flags).toHaveLength(1);
  });
});
