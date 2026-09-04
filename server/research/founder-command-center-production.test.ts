import type { Request } from "express";
import { describe, expect, it, vi } from "vitest";
import { buildFounderCommandCenterSnapshot } from "./founder-command-center";
import {
  buildFounderCommandCenterProductionSources,
  createSupabaseFounderCommandCenterReadPort,
  type FounderCommandCenterPageQuery,
  type FounderCommandCenterReadPort,
} from "./founder-command-center-production";

const NOW = new Date("2026-09-04T20:00:00.000Z");
const OLDEST = "2026-09-01T10:00:00.000Z";

function readPort(
  overrides: Partial<FounderCommandCenterReadPort> = {},
): FounderCommandCenterReadPort {
  return {
    count: vi.fn(async () => 0),
    oldestTimestamp: vi.fn(async () => null),
    page: vi.fn(async () => []),
    ...overrides,
  };
}

function sourcesFor(
  overrides: Partial<Parameters<typeof buildFounderCommandCenterProductionSources>[0]> = {},
) {
  return buildFounderCommandCenterProductionSources({
    reads: readPort(),
    releaseEvidence: async () => ({}),
    environment: {},
    now: () => NOW,
    ...overrides,
  });
}

describe("Founder Command Center production sources", () => {
  it("uses a read-only Supabase adapter with exact counts and explicit narrow selects", async () => {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const responses = [
      { count: 3, data: [], error: null },
      { count: null, data: [{ created_at: OLDEST }], error: null },
      { count: null, data: [{ id: "opaque-1", status: "New" }], error: null },
    ];
    const database = {
      from: vi.fn((table: string) => {
        const response = responses.shift();
        const builder: any = {
          select(...args: unknown[]) {
            calls.push({ method: "select", args: [table, ...args] });
            return builder;
          },
          eq(...args: unknown[]) {
            calls.push({ method: "eq", args });
            return builder;
          },
          order(...args: unknown[]) {
            calls.push({ method: "order", args });
            return builder;
          },
          limit(...args: unknown[]) {
            calls.push({ method: "limit", args });
            return builder;
          },
          range(...args: unknown[]) {
            calls.push({ method: "range", args });
            return Promise.resolve(response);
          },
          then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
            return Promise.resolve(response).then(resolve, reject);
          },
        };
        return builder;
      }),
    };
    const port = createSupabaseFounderCommandCenterReadPort(database as never);

    await expect(
      port.count({
        table: "research_applications",
        column: "id",
        filters: [{ operation: "eq", column: "status", value: "submitted" }],
      }),
    ).resolves.toBe(3);
    await expect(
      port.oldestTimestamp({
        table: "research_applications",
        timestampColumn: "created_at",
      }),
    ).resolves.toBe(OLDEST);
    await expect(
      port.page({
        table: "loi_submissions",
        columns: "id,status,created_at",
        from: 0,
        to: 99,
      }),
    ).resolves.toHaveLength(1);

    expect(calls.filter((call) => call.method === "select")).toEqual([
      {
        method: "select",
        args: [
          "research_applications",
          "id",
          { count: "exact", head: true },
        ],
      },
      {
        method: "select",
        args: ["research_applications", "created_at"],
      },
      {
        method: "select",
        args: ["loi_submissions", "id,status,created_at"],
      },
    ]);
    expect("insert" in database).toBe(false);
    expect("update" in database).toBe(false);
    expect("rpc" in database).toBe(false);
  });

  it("reports exact scoped application counts and the oldest waiting instant", async () => {
    const reads = readPort({
      count: vi.fn(async (query) => {
        const states = query.filters?.find((filter) => filter.operation === "in")?.value;
        if (Array.isArray(states) && states.length === 6) return 9;
        if (Array.isArray(states) && states.includes("submitted")) return 3;
        if (Array.isArray(states) && states.includes("more_information_requested")) return 2;
        if (Array.isArray(states) && states.includes("approved_pending_payment")) return 3;
        return 1;
      }),
      oldestTimestamp: vi.fn(async () => OLDEST),
    });
    const card = await sourcesFor({ reads }).applications!({ request: null });

    expect(card.source.state).toBe("current");
    expect(card.primaryCount).toMatchObject({ state: "exact", value: 9 });
    expect(card.breakdown.map((metric) => metric.value)).toEqual([3, 1, 2, 3]);
    expect(card.oldestWaiting).toEqual({ state: "available", since: OLDEST });
  });

  it("caps every Care marker projection and never calls an unbounded fifth page", async () => {
    const page = vi.fn(async (query: FounderCommandCenterPageQuery) => {
      return Array.from({ length: 500 }, (_, index) => ({
        // Full pages still exercise all four bounded marker projections. Reusing
        // identifiers keeps the canonical projection fixture intentionally small.
        id: `care-${index}`,
        business_name: "Xenios Care access request",
        role: "care_access:new_care_request",
        why_interested: JSON.stringify({ schema: "xenios_care_manual_access_v1" }),
        source_page: "/care/schedule",
        landing_page: "/care/schedule",
        status: "Reviewed",
        email_status: "sent",
        created_at: OLDEST,
        name: "PII NAME SENTINEL",
        email: "pii-sentinel@example.invalid",
        phone: "+15555550123",
      }));
    });
    const card = await sourcesFor({ reads: readPort({ page }) }).care_requests!({
      request: null,
    });

    expect(page).toHaveBeenCalledTimes(16);
    expect(
      page.mock.calls.some(([query]) => query.from >= 2_000),
    ).toBe(false);
    expect(card.source.state).toBe("partial");
    expect(card.primaryCount).toMatchObject({ state: "bounded", value: 0 });
    expect(card.oldestWaiting).toEqual({ state: "unavailable", since: null });
    expect(card.attention.code).toBe("care_projection_bounded");
    for (const [query] of page.mock.calls) {
      const selected = query.columns.split(",");
      expect(selected).not.toContain("name");
      expect(selected).not.toContain("email");
      expect(selected).not.toContain("phone");
      expect(selected).not.toContain("ip");
    }
    expect(JSON.stringify(card)).not.toContain("PII NAME SENTINEL");
    expect(JSON.stringify(card)).not.toContain("pii-sentinel@example.invalid");
  });

  it("uses the canonical assisted reader while projecting timestamps only", async () => {
    const list = vi.fn(async (
      _request: Request,
      input: { status: string; page: number; pageSize: number },
    ) => {
      const totals: Record<string, number> = {
        submitted: 2,
        reviewing: 1,
        waiting_on_customer: 0,
      };
      const total = totals[input.status] ?? 0;
      return {
        total,
        items: total === 0
          ? []
          : [{ createdAt: input.page === total ? OLDEST : NOW.toISOString() }],
      };
    });
    const card = await sourcesFor({ assistedOrders: { list } }).assisted_orders!({
      request: {} as Request,
    });

    expect(card.primaryCount).toMatchObject({ state: "exact", value: 3 });
    expect(card.oldestWaiting).toEqual({ state: "available", since: OLDEST });
    expect(card.source.state).toBe("partial");
    expect(list).toHaveBeenCalledTimes(5);
    expect(JSON.stringify(card)).not.toContain("requestId");
  });

  it("keeps fulfillment unavailable and independently reports payment and exception oldest facts", async () => {
    const sources = sourcesFor({
      awaitingPaymentReview: async () => [
        { placedAt: NOW.toISOString() },
        { placedAt: OLDEST },
      ],
      openExceptions: async () => [
        { raisedAt: "2026-09-03T12:00:00.000Z" },
        { raisedAt: OLDEST },
      ],
    });
    const [payment, fulfillment, exceptions] = await Promise.all([
      sources.payment_review!({ request: null }),
      sources.fulfillment!({ request: null }),
      sources.exceptions!({ request: null }),
    ]);

    expect(payment.primaryCount).toMatchObject({ state: "exact", value: 2 });
    expect(payment.oldestWaiting).toEqual({ state: "available", since: OLDEST });
    expect(exceptions.primaryCount).toMatchObject({ state: "exact", value: 2 });
    expect(exceptions.oldestWaiting).toEqual({ state: "available", since: OLDEST });
    expect(fulfillment.source.state).toBe("feature_gated");
    expect(fulfillment.primaryCount).toMatchObject({
      state: "unavailable",
      value: null,
    });
  });

  it("keeps product, referral, support, and system claims explicitly partial", async () => {
    const count = vi.fn(async (query) => {
      if (query.table === "research_products") return 2;
      if (query.table === "referral_fraud_flags") return 0;
      if (query.table === "research_member_questions") return 4;
      if (query.table === "research_notification_outbox") return 0;
      return 0;
    });
    const sources = sourcesFor({
      reads: readPort({ count, oldestTimestamp: vi.fn(async (query) =>
        query.table === "referral_fraud_flags" || query.table === "research_notification_outbox"
          ? null
          : OLDEST) }),
      emailConfiguration: async () => ({ provider: "resend-env" }),
    });
    const [products, referrals, support, system] = await Promise.all([
      sources.products!({ request: null }),
      sources.referrals!({ request: null }),
      sources.support!({ request: null }),
      sources.system_status!({ request: null }),
    ]);

    expect(products.source.state).toBe("partial");
    expect(products.facts[0]).toMatchObject({ state: "unavailable", value: null });
    expect(referrals.source.state).toBe("partial");
    expect(referrals.primaryCount).toMatchObject({ state: "exact", value: 0 });
    expect(referrals.attention.code).toBe("referral_source_partial");
    expect(support.source.state).toBe("partial");
    expect(support.facts[0]).toMatchObject({ state: "unavailable", value: null });
    expect(system.source.state).toBe("partial");
    expect(system.facts).toContainEqual({
      key: "system.email_provider",
      label: "Email provider",
      value: "Configured",
      state: "current",
    });
  });

  it("never converts a database failure into an exact zero", async () => {
    const reads = readPort({
      count: vi.fn(async (query) => {
        if (query.table === "research_notification_outbox") {
          throw new Error("provider detail must stay private");
        }
        return 0;
      }),
    });
    const snapshot = await buildFounderCommandCenterSnapshot(
      sourcesFor({ reads, emailConfiguration: async () => ({ provider: "unavailable" }) }),
      { now: () => NOW },
    );
    const system = snapshot.cards.find((card) => card.area === "system_status");

    expect(system?.source.state).toBe("unavailable");
    expect(system?.primaryCount).toMatchObject({
      state: "unavailable",
      value: null,
    });
    expect(JSON.stringify(snapshot)).not.toContain("provider detail");
  });

  it("labels only strict runtime and last-verified release SHAs, never working state", async () => {
    const validRuntime = "a".repeat(40);
    const validProduction = "b".repeat(40);
    const validSource = "c".repeat(40);
    const source = sourcesFor({
      environment: { RENDER_GIT_COMMIT: validRuntime },
      releaseEvidence: async () => ({
        source: { sha: validSource },
        production: {
          sha: validProduction,
          observedAt: OLDEST,
          verificationStatus: "live_verified",
          deployId: "must-not-escape",
        },
      }),
    }).release_status!;
    const card = await source({ request: null });

    expect(card.primaryCount).toMatchObject({ state: "unavailable", value: null });
    expect(card.facts).toContainEqual({
      key: "release.runtime_sha",
      label: "Runtime SHA",
      value: validRuntime,
      state: "current",
    });
    expect(card.facts).toContainEqual({
      key: "release.production_sha",
      label: "Last verified production SHA",
      value: validProduction,
      state: "last_verified",
    });
    expect(card.facts).toContainEqual({
      key: "release.working_sha",
      label: "Working-tree SHA",
      value: null,
      state: "unavailable",
    });
    expect(JSON.stringify(card)).not.toContain("must-not-escape");

    const malformed = await sourcesFor({
      environment: { RENDER_GIT_COMMIT: "A".repeat(40) },
      releaseEvidence: async () => ({
        source: { sha: "not-a-sha" },
        production: {
          sha: "b".repeat(39),
          observedAt: "not-a-date",
          verificationStatus: "pii-sentinel@example.invalid",
        },
      }),
    }).release_status!({ request: null });
    expect(
      malformed.facts
        .filter((fact) => fact.key.endsWith("sha"))
        .every((fact) => fact.state === "unavailable"),
    ).toBe(true);
    expect(
      malformed.facts.find((fact) => fact.key === "release.production_verification"),
    ).toMatchObject({ state: "unavailable", value: null });
    expect(JSON.stringify(malformed)).not.toContain("pii-sentinel@example.invalid");
  });
});
