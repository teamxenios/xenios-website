import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createPartnerPortalService } from "./portal";
import {
  createSupabasePartnerPortalPort,
  createUnconfiguredPartnerPortalPort,
} from "./portal-production";

// ---------------------------------------------------------------------------
// A Supabase client double. It records every query so the scoping claims can be
// asserted on the FILTERS THAT WERE SENT, not only on the rows that came back:
// a port that fetched everything and filtered in memory would pass a row test and
// fail this one.
// ---------------------------------------------------------------------------

interface Query {
  table: string;
  select?: string;
  eq: Array<[string, unknown]>;
  in: Array<[string, readonly unknown[]]>;
  insert?: Record<string, unknown>;
}

function fakeClient(rows: Record<string, Record<string, unknown>[]>, errors: Record<string, string> = {}) {
  const queries: Query[] = [];
  const client = {
    from(table: string) {
      const query: Query = { table, eq: [], in: [] };
      queries.push(query);
      const result = () =>
        errors[table]
          ? { data: null, error: { message: errors[table], code: errors[table] } }
          : { data: matching(), error: null };
      const matching = () =>
        (rows[table] ?? []).filter(
          (row) =>
            query.eq.every(([key, value]) => row[key] === value) &&
            query.in.every(([key, values]) => (values as unknown[]).includes(row[key])),
        );
      const builder: Record<string, unknown> = {
        select(columns: string) {
          query.select = columns;
          return builder;
        },
        insert(row: Record<string, unknown>) {
          query.insert = row;
          return builder;
        },
        eq(key: string, value: unknown) {
          query.eq.push([key, value]);
          return builder;
        },
        in(key: string, values: readonly unknown[]) {
          query.in.push([key, values]);
          return builder;
        },
        order() {
          return builder;
        },
        maybeSingle() {
          const found = result();
          if (found.error) return Promise.resolve(found);
          const data = found.data as Record<string, unknown>[] | null;
          return Promise.resolve({ data: data && data.length > 0 ? data[0] : null, error: null });
        },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          return Promise.resolve(result()).then(resolve, reject);
        },
      };
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, queries };
}

const PARTNER_ROWS = [
  {
    id: "p_alice",
    member_id: "m_alice",
    role: "research_rep",
    state: "active",
    identity_verified: true,
    tax_status: "verified",
    payout_status: "verified",
    certified_at: "2026-05-01T00:00:00.000Z",
    activated_at: "2026-05-02T00:00:00.000Z",
    legal_name: "Alice Real Name",
    contact_email: "alice@example.test",
    internal_notes: "Samuel only",
  },
  {
    id: "p_bruno",
    member_id: "m_bruno",
    role: "affiliate",
    state: "application",
    identity_verified: false,
    tax_status: "not_started",
    payout_status: "not_started",
    certified_at: null,
    activated_at: null,
    legal_name: "Bruno Real Name",
    contact_email: "bruno@example.test",
    internal_notes: null,
  },
];

describe("the production port scopes every read to the acting partner", () => {
  it("resolves a partner from the member id and never selects the administrative columns", async () => {
    const { client, queries } = fakeClient({ research_partners: PARTNER_ROWS });
    const partner = await createSupabasePartnerPortalPort(client).findPartnerForMember("m_alice");
    expect(partner?.partnerId).toBe("p_alice");
    expect(queries[0].eq).toEqual([["member_id", "m_alice"]]);
    expect(queries[0].select).not.toContain("legal_name");
    expect(queries[0].select).not.toContain("contact_email");
    expect(queries[0].select).not.toContain("internal_notes");
    expect(JSON.stringify(partner)).not.toContain("Alice Real Name");
  });

  it("drops a row whose role or state is not a value the domain defines", async () => {
    const { client } = fakeClient({
      research_partners: [{ ...PARTNER_ROWS[0], role: "kingpin" }],
    });
    expect(await createSupabasePartnerPortalPort(client).findPartnerForMember("m_alice")).toBeNull();
  });

  it("filters leads, conversions, commissions, and payouts by partner id", async () => {
    const { client, queries } = fakeClient({});
    const port = createSupabasePartnerPortalPort(client);
    await port.touchesFor("p_alice");
    await port.conversionsFor("p_alice");
    await port.commissionsFor("p_alice");
    await port.payoutBatchesFor("p_alice");
    queries.forEach((query) => expect(query.eq).toEqual([["partner_id", "p_alice"]]));
    expect(queries.map((q) => q.table)).toEqual([
      "research_attribution_touches",
      "research_attribution_conversions",
      "research_commission_ledger",
      "research_payout_batches",
    ]);
  });

  it("never selects a column that could identify a member or an order", async () => {
    const { client, queries } = fakeClient({});
    const port = createSupabasePartnerPortalPort(client);
    await port.touchesFor("p_alice");
    await port.conversionsFor("p_alice");
    await port.commissionsFor("p_alice");
    const selected = queries.map((q) => q.select ?? "").join(" ");
    expect(selected).not.toContain("subject_key");
    expect(selected).not.toContain("order_id");
  });

  it("NEGATIVE: organizations are resolved from ownership and representation, then re-filtered", async () => {
    const { client, queries } = fakeClient({
      research_organizations: [
        { id: "org_a", name: "Northside", state: "active", owner_partner_id: "p_alice" },
        { id: "org_b", name: "Bruno Gym", state: "active", owner_partner_id: "p_bruno" },
      ],
      research_organization_representatives: [{ organization_id: "org_b", partner_id: "p_bruno" }],
    });
    const orgs = await createSupabasePartnerPortalPort(client).organizationsFor("p_alice");
    expect(orgs.map((o) => o.orgId)).toEqual(["org_a"]);
    expect(JSON.stringify(orgs)).not.toContain("Bruno Gym");
    // Ownership and representation are both asked for, both partner-scoped.
    expect(queries[0].eq).toEqual([["owner_partner_id", "p_alice"]]);
    expect(queries[1].eq).toEqual([["partner_id", "p_alice"]]);
    // The final read is constrained to exactly the resolved ids.
    expect(queries[2].in).toEqual([["id", ["org_a"]]]);
  });

  it("does not query organizations at all when the partner holds none", async () => {
    const { client, queries } = fakeClient({});
    expect(await createSupabasePartnerPortalPort(client).organizationsFor("p_nobody")).toEqual([]);
    expect(queries.map((q) => q.table)).toEqual([
      "research_organizations",
      "research_organization_representatives",
    ]);
  });

  it("asks for events on exactly the organization ids it is given, and never on an empty set", async () => {
    const { client, queries } = fakeClient({
      research_organization_events: [
        { id: "e1", organization_id: "org_a", name: "Launch", campaign: null, starts_at: null },
        { id: "e2", organization_id: "org_b", name: "Other", campaign: null, starts_at: null },
      ],
    });
    const port = createSupabasePartnerPortalPort(client);
    expect(await port.eventsForOrganizations([])).toEqual([]);
    expect(queries).toHaveLength(0);
    const events = await port.eventsForOrganizations(["org_a"]);
    expect(events.map((e) => e.eventId)).toEqual(["e1"]);
    expect(queries[0].in).toEqual([["organization_id", ["org_a"]]]);
  });

  it("lists content submissions for the partner without moving the body back over the wire", async () => {
    const { client, queries } = fakeClient({
      research_content_assets: [
        { id: "a1", partner_id: "p_alice", title: "Reel", state: "submitted", created_at: "2026-05-01T00:00:00.000Z", body: "secret draft" },
      ],
    });
    const rows = await createSupabasePartnerPortalPort(client).contentSubmissionsFor("p_alice");
    expect(rows).toEqual([{ assetId: "a1", title: "Reel", state: "submitted", createdAt: "2026-05-01T00:00:00.000Z" }]);
    expect(queries[0].select).not.toContain("body");
    expect(queries[0].eq).toEqual([["partner_id", "p_alice"]]);
  });

  it("writes a submission only in the submitted state, under the acting partner", async () => {
    const { client, queries } = fakeClient({ research_content_assets: [] });
    const result = await createSupabasePartnerPortalPort(client).submitContent("p_alice", {
      title: "Reel",
      description: "About the program.",
      link: "https://example.test/x",
    });
    expect(result.ok).toBe(true);
    expect(queries[0].insert).toMatchObject({ partner_id: "p_alice", title: "Reel", state: "submitted" });
    expect(String(queries[0].insert?.body)).toContain("https://example.test/x");
    // Nothing in this path can approve content.
    expect(queries[0].insert).not.toHaveProperty("approved_by_admin_id");
    expect(queries[0].insert).not.toHaveProperty("expires_at");
  });

  it("reports a duplicate title as a duplicate, not as a success", async () => {
    const { client } = fakeClient({}, { research_content_assets: "23505" });
    const result = await createSupabasePartnerPortalPort(client).submitContent("p_alice", {
      title: "Reel",
      description: "About the program.",
      link: null,
    });
    expect(result).toMatchObject({ ok: false, code: "duplicate_title" });
  });

  it("raises rather than returning empty when a read fails, so a failure never reads as no data", async () => {
    const { client } = fakeClient({}, { research_commission_ledger: "connection lost" });
    await expect(createSupabasePartnerPortalPort(client).commissionsFor("p_alice")).rejects.toThrow(
      /commissions unavailable/,
    );
  });
});

describe("surfaces with no table answer empty rather than plausible", () => {
  it("returns no library asset and no session, because neither table exists", async () => {
    const { client, queries } = fakeClient({});
    const port = createSupabasePartnerPortalPort(client);
    expect(await port.approvedLibrary()).toEqual([]);
    expect(await port.sessionsFor("p_alice")).toEqual([]);
    // No query is issued at all: there is nothing to query.
    expect(queries).toHaveLength(0);
  });
});

describe("the unconfigured port", () => {
  it("reads as 'this member owns no partner' and refuses the one write", async () => {
    const port = createUnconfiguredPartnerPortalPort();
    expect(await port.findPartnerForMember("m_alice")).toBeNull();
    expect(await port.commissionsFor("p_alice")).toEqual([]);
    const write = await port.submitContent("p_alice", { title: "A", description: "B", link: null });
    expect(write).toMatchObject({ ok: false, code: "capability_disabled" });
  });

  it("serves every read surface without throwing, so the pages render their pending state", async () => {
    const service = createPartnerPortalService(createUnconfiguredPartnerPortalPort());
    expect(await service.leads("p_alice")).toEqual({ rows: [] });
    expect(await service.conversions("p_alice")).toEqual({ rows: [] });
    expect(await service.commissions("p_alice")).toEqual({ entries: [] });
    expect(await service.campaigns("p_alice")).toEqual({ campaigns: [] });
    expect(await service.events("p_alice")).toEqual({ events: [] });
    expect(await service.organizations("p_alice")).toEqual({ organizations: [] });
    expect(await service.compliance("p_alice")).toEqual({ submissions: [] });
    expect(await service.resources()).toEqual({ assets: [] });
    expect(await service.sessions("p_alice")).toEqual({ sessions: [] });
  });
});
