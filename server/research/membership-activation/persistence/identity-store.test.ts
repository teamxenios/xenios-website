import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { IdentityDocumentCase } from "../identity-documents";
import type { IdentityVerificationRecord } from "../identity-reviews";
import type { IdentityAuditEvent } from "../identity-retention";
import {
  auditToRow,
  caseToRow,
  createInMemoryIdentityStore,
  createSupabaseIdentityStore,
  reviewToRow,
  rowToAudit,
  rowToCase,
  rowToReview,
  type IdentityAuditRow,
  type IdentityCaseRow,
  type IdentityReviewRow,
} from "./identity-store";

const NOW = "2026-07-22T12:00:00.000Z";

function kase(overrides: Partial<IdentityDocumentCase> = {}): IdentityDocumentCase {
  return {
    caseId: "0f5b3a1c-0000-4000-8000-000000000001",
    tenantId: "xenios-research",
    memberId: "member-1",
    status: "uploaded",
    consentVersion: "0.1.0-draft",
    consentRecordedAt: NOW,
    storagePath: "identity/xenios-research/member-1/abc-def",
    contentType: "image/jpeg",
    uploadUrlExpiresAt: NOW,
    uploadedAt: NOW,
    reviewId: null,
    rawDeletedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function review(overrides: Partial<IdentityVerificationRecord> = {}): IdentityVerificationRecord {
  return {
    reviewId: "0f5b3a1c-0000-4000-8000-000000000002",
    caseId: "0f5b3a1c-0000-4000-8000-000000000001",
    tenantId: "xenios-research",
    memberId: "member-1",
    reviewType: "manual_name_age",
    nameMatch: "match",
    ageThresholdMet: true,
    documentNotExpired: true,
    jurisdiction: "TX",
    licenseLast4: "4821",
    outcome: "verified",
    rejectionCategory: null,
    reviewerId: "admin-sam",
    startedAt: NOW,
    completedAt: NOW,
    rawSourceDeletedAt: null,
    ...overrides,
  };
}

function auditEvent(overrides: Partial<IdentityAuditEvent> = {}): IdentityAuditEvent {
  return {
    tenantId: "xenios-research",
    caseId: "0f5b3a1c-0000-4000-8000-000000000001",
    memberId: "member-1",
    kind: "admin_viewed",
    actorType: "admin",
    actorId: "admin-sam",
    at: NOW,
    detail: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Pure row mapping
// ---------------------------------------------------------------------------

describe("case row mapping", () => {
  it("round-trips a case through the mappers", () => {
    const record = kase();
    expect(rowToCase(caseToRow(record))).toEqual(record);
  });

  it("round-trips a deleted case with no pointer", () => {
    const record = kase({
      status: "deleted",
      storagePath: null,
      contentType: null,
      rawDeletedAt: NOW,
    });
    expect(rowToCase(caseToRow(record))).toEqual(record);
  });

  it("drops a row with a status outside the twelve rather than guessing", () => {
    const row: IdentityCaseRow = { ...caseToRow(kase()), status: "approved" };
    expect(rowToCase(row)).toBeNull();
  });
});

describe("review row mapping", () => {
  it("round-trips the minimal verification record", () => {
    const record = review();
    expect(rowToReview(reviewToRow(record))).toEqual(record);
  });

  it("drops a row whose review type is not manual_name_age", () => {
    const row: IdentityReviewRow = { ...reviewToRow(review()), review_type: "kyc_vendor" };
    expect(rowToReview(row)).toBeNull();
  });

  it("drops a row with an unknown outcome or category", () => {
    const badOutcome: IdentityReviewRow = { ...reviewToRow(review()), outcome: "maybe" };
    expect(rowToReview(badOutcome)).toBeNull();
    const badCategory: IdentityReviewRow = {
      ...reviewToRow(review({ outcome: "rejected", rejectionCategory: "name_mismatch" })),
      rejection_category: "vibes",
    };
    expect(rowToReview(badCategory)).toBeNull();
  });

  it("scrubs an overlong license fragment on read; a fuller number never propagates", () => {
    const row: IdentityReviewRow = { ...reviewToRow(review()), license_last4: "TX12345678" };
    const mapped = rowToReview(row);
    expect(mapped).not.toBeNull();
    expect(mapped!.licenseLast4).toBeNull();
  });
});

describe("audit row mapping", () => {
  it("round-trips an audit event", () => {
    const event = auditEvent();
    expect(rowToAudit(auditToRow(event))).toEqual(event);
  });

  it("drops a row with an unknown kind or actor", () => {
    const badKind: IdentityAuditRow = { ...auditToRow(auditEvent()), kind: "peeked" };
    expect(rowToAudit(badKind)).toBeNull();
    const badActor: IdentityAuditRow = { ...auditToRow(auditEvent()), actor_type: "robot" };
    expect(rowToAudit(badActor)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// In-memory reference
// ---------------------------------------------------------------------------

describe("createInMemoryIdentityStore", () => {
  it("saves and loads a case scoped by tenant", async () => {
    const store = createInMemoryIdentityStore();
    await store.saveCase(kase());
    expect(await store.getCase("xenios-research", kase().caseId)).toEqual(kase());
    expect(await store.getCase("other-tenant", kase().caseId)).toBeNull();
  });

  it("scopes listCasesByMember to the named member (cross-member denied)", async () => {
    const store = createInMemoryIdentityStore();
    await store.saveCase(kase({ caseId: "c1", memberId: "member-1" }));
    await store.saveCase(kase({ caseId: "c2", memberId: "member-2" }));
    const mine = await store.listCasesByMember("xenios-research", "member-1");
    expect(mine.map((record) => record.caseId)).toEqual(["c1"]);
  });

  it("lists only cases still holding a raw source for the sweep", async () => {
    const store = createInMemoryIdentityStore();
    await store.saveCase(kase({ caseId: "c1" }));
    await store.saveCase(kase({ caseId: "c2", status: "deleted", storagePath: null }));
    const holding = await store.listCasesWithRawSource("xenios-research");
    expect(holding.map((record) => record.caseId)).toEqual(["c1"]);
  });

  it("refuses to persist a review that grew a forbidden field", async () => {
    const store = createInMemoryIdentityStore();
    const smuggled = { ...review(), ssn: "000-00-0000" } as unknown as IdentityVerificationRecord;
    await expect(store.saveReview(smuggled)).rejects.toThrow(/forbidden/);
  });

  it("stores reviews and audit events per case, without shared references", async () => {
    const store = createInMemoryIdentityStore();
    await store.saveReview(review());
    const loaded = await store.getReviewForCase("xenios-research", review().caseId);
    expect(loaded).toEqual(review());
    loaded!.outcome = "rejected";
    expect((await store.getReviewForCase("xenios-research", review().caseId))!.outcome).toBe(
      "verified",
    );

    await store.appendAuditEvent(auditEvent());
    const events = await store.listAuditEvents("xenios-research", auditEvent().caseId);
    expect(events).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Supabase-backed store against a fake client (no network)
// ---------------------------------------------------------------------------

function fakeSupabase(): {
  client: SupabaseClient;
  cases: Map<string, IdentityCaseRow>;
  reviews: Map<string, IdentityReviewRow>;
  audit: IdentityAuditRow[];
  ops: Array<{ table: string; op: string }>;
} {
  const cases = new Map<string, IdentityCaseRow>();
  const reviews = new Map<string, IdentityReviewRow>();
  const audit: IdentityAuditRow[] = [];
  const ops: Array<{ table: string; op: string }> = [];

  function builder(table: string) {
    const state: {
      op: string;
      filters: Array<{ col: string; val: unknown }>;
      notNull: string | null;
      payload?: unknown;
    } = { op: "select", filters: [], notNull: null };
    const api: Record<string, unknown> = {};

    const rowsFor = (): unknown[] => {
      const source: Array<Record<string, unknown>> =
        table === "research_fm_identity_cases"
          ? Array.from(cases.values())
          : table === "research_fm_identity_reviews"
            ? Array.from(reviews.values())
            : [...audit];
      return source.filter((row) => {
        for (const filter of state.filters) {
          if (row[filter.col] !== filter.val) return false;
        }
        if (state.notNull && (row[state.notNull] === null || row[state.notNull] === undefined)) {
          return false;
        }
        return true;
      });
    };

    const result = (single: boolean): { data: unknown; error: null } => {
      ops.push({ table, op: state.op });
      if (state.op === "upsert") {
        const row = state.payload as Record<string, unknown>;
        if (table === "research_fm_identity_cases") {
          cases.set(String(row.case_id), row as unknown as IdentityCaseRow);
        } else if (table === "research_fm_identity_reviews") {
          reviews.set(String(row.review_id), row as unknown as IdentityReviewRow);
        }
        return { data: null, error: null };
      }
      if (state.op === "insert") {
        if (table === "research_fm_identity_audit") {
          audit.push({ ...(state.payload as IdentityAuditRow) });
        }
        return { data: null, error: null };
      }
      const rows = rowsFor();
      return { data: single ? (rows[0] ?? null) : rows, error: null };
    };

    Object.assign(api, {
      select() {
        return api;
      },
      eq(col: string, val: unknown) {
        state.filters.push({ col, val });
        return api;
      },
      not(col: string, operator: string, _val: unknown) {
        if (operator === "is") state.notNull = col;
        return api;
      },
      upsert(payload: unknown) {
        state.op = "upsert";
        state.payload = payload;
        return api;
      },
      insert(payload: unknown) {
        state.op = "insert";
        state.payload = payload;
        return api;
      },
      maybeSingle() {
        return Promise.resolve(result(true));
      },
      then(onFulfilled: (value: { data: unknown; error: null }) => unknown) {
        return Promise.resolve(result(false)).then(onFulfilled);
      },
    });
    return api;
  }

  const client = { from: (table: string) => builder(table) } as unknown as SupabaseClient;
  return { client, cases, reviews, audit, ops };
}

describe("createSupabaseIdentityStore (fake client)", () => {
  it("round-trips a case and updates it in place on a second save", async () => {
    const { client, cases } = fakeSupabase();
    const store = createSupabaseIdentityStore(client);
    const record = kase();
    await store.saveCase(record);
    await store.saveCase({ ...record, status: "review_pending" });
    expect(cases.size).toBe(1);
    expect((await store.getCase("xenios-research", record.caseId))!.status).toBe("review_pending");
  });

  it("returns null for a missing case and for a cross-tenant read", async () => {
    const { client } = fakeSupabase();
    const store = createSupabaseIdentityStore(client);
    await store.saveCase(kase());
    expect(await store.getCase("xenios-research", "missing")).toBeNull();
    expect(await store.getCase("other-tenant", kase().caseId)).toBeNull();
  });

  it("scopes listCasesByMember to the member named in the call", async () => {
    const { client } = fakeSupabase();
    const store = createSupabaseIdentityStore(client);
    await store.saveCase(kase({ caseId: "c1", memberId: "member-1" }));
    await store.saveCase(kase({ caseId: "c2", memberId: "member-2" }));
    const mine = await store.listCasesByMember("xenios-research", "member-1");
    expect(mine.map((record) => record.caseId)).toEqual(["c1"]);
  });

  it("lists only cases with a raw source for the deletion sweep", async () => {
    const { client } = fakeSupabase();
    const store = createSupabaseIdentityStore(client);
    await store.saveCase(kase({ caseId: "c1" }));
    await store.saveCase(kase({ caseId: "c2", status: "deleted", storagePath: null }));
    const holding = await store.listCasesWithRawSource("xenios-research");
    expect(holding.map((record) => record.caseId)).toEqual(["c1"]);
  });

  it("drops a malformed persisted case rather than guessing", async () => {
    const { client, cases } = fakeSupabase();
    const store = createSupabaseIdentityStore(client);
    const bad = { ...caseToRow(kase({ caseId: "c-bad" })), status: "limbo" };
    cases.set("c-bad", bad as IdentityCaseRow);
    expect(await store.getCase("xenios-research", "c-bad")).toBeNull();
  });

  it("persists and reloads the minimal verification record", async () => {
    const { client } = fakeSupabase();
    const store = createSupabaseIdentityStore(client);
    await store.saveReview(review());
    expect(await store.getReviewForCase("xenios-research", review().caseId)).toEqual(review());
  });

  it("refuses to send a forbidden-field review over the wire at all", async () => {
    const { client, ops } = fakeSupabase();
    const store = createSupabaseIdentityStore(client);
    const smuggled = { ...review(), ssn: "000-00-0000" } as unknown as IdentityVerificationRecord;
    await expect(store.saveReview(smuggled)).rejects.toThrow(/forbidden/);
    expect(ops.filter((op) => op.table === "research_fm_identity_reviews")).toEqual([]);
  });

  it("the audit table only ever sees inserts and selects, never update or delete", async () => {
    const { client, ops } = fakeSupabase();
    const store = createSupabaseIdentityStore(client);
    await store.appendAuditEvent(auditEvent({ at: "2026-07-23T00:00:00.000Z" }));
    await store.appendAuditEvent(auditEvent({ kind: "raw_deleted", at: NOW }));
    const events = await store.listAuditEvents("xenios-research", auditEvent().caseId);
    expect(events.map((event) => event.kind)).toEqual(["raw_deleted", "admin_viewed"]);

    const auditOps = ops.filter((op) => op.table === "research_fm_identity_audit");
    expect(auditOps.every((op) => op.op === "insert" || op.op === "select")).toBe(true);
    expect(auditOps.some((op) => op.op === "insert")).toBe(true);
  });
});
