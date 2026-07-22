import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AttributionTouch } from "@shared/research/distribution";
import type { StoredLink } from "../../partners/attribution";
import {
  attributionTouchToRow,
  createInMemoryAttributionConversionStore,
  createInMemoryAttributionTouchStore,
  createInMemoryPartnerLinkStore,
  createInMemoryPartnerMemberStore,
  createSupabaseAttributionTouchStore,
  createSupabasePartnerLinkStore,
  createSupabasePartnerMemberStore,
  DuplicatePartnerLinkCode,
  linkRowToStoredLink,
  MemberAlreadyPartner,
  partnerMemberRowToLink,
  storedLinkToRow,
  touchRowToAttributionTouch,
  type AsyncPartnerMemberStore,
  type AttributionTouchRow,
  type NewPartnerMemberRecord,
  type PartnerLinkRow,
  type PartnerMemberRow,
} from "./partners-store";

// ---------------------------------------------------------------------------
// Pure row mapping: partner links
// ---------------------------------------------------------------------------

describe("linkRowToStoredLink", () => {
  it("maps a link row to a StoredLink", () => {
    const row: PartnerLinkRow = {
      partner_id: "partner_1",
      code: "v1.abc.def.sig",
      channel: "signed_link",
      campaign: "spring",
      created_at: "2026-01-01T00:00:00.000Z",
    };
    expect(linkRowToStoredLink(row)).toEqual({
      code: "v1.abc.def.sig",
      partnerId: "partner_1",
      channel: "signed_link",
      campaign: "spring",
      issuedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("carries a null campaign through unchanged", () => {
    const row: PartnerLinkRow = {
      partner_id: "partner_1",
      code: "c",
      channel: "qr",
      campaign: null,
      created_at: "2026-01-02T00:00:00.000Z",
    };
    expect(linkRowToStoredLink(row)?.campaign).toBeNull();
  });

  it("drops a row whose channel the domain does not issue rather than guessing", () => {
    const row: PartnerLinkRow = {
      partner_id: "partner_1",
      code: "c",
      channel: "manual", // valid for a touch, never for an issued link
      campaign: null,
      created_at: "2026-01-01T00:00:00.000Z",
    };
    expect(linkRowToStoredLink(row)).toBeNull();
  });
});

describe("storedLinkToRow", () => {
  it("round-trips a StoredLink through the mapping functions", () => {
    const link: StoredLink = {
      code: "v1.x.y.z",
      partnerId: "partner_9",
      channel: "campaign",
      campaign: "summer",
      issuedAt: "2026-03-03T12:00:00.000Z",
    };
    expect(linkRowToStoredLink(storedLinkToRow(link))).toEqual(link);
  });
});

// ---------------------------------------------------------------------------
// Pure row mapping: attribution touches
// ---------------------------------------------------------------------------

describe("touchRowToAttributionTouch", () => {
  it("maps a touch row and omits setByAdminId when the row names no admin", () => {
    const row: AttributionTouchRow = {
      subject_key: "subj_1",
      partner_id: "partner_1",
      channel: "code",
      set_by_admin_id: null,
      occurred_at: "2026-01-01T00:00:00.000Z",
    };
    const touch = touchRowToAttributionTouch(row);
    expect(touch).toEqual({
      partnerId: "partner_1",
      channel: "code",
      occurredAt: "2026-01-01T00:00:00.000Z",
    });
    expect(touch && "setByAdminId" in touch).toBe(false);
  });

  it("carries setByAdminId for a manual touch", () => {
    const row: AttributionTouchRow = {
      subject_key: "subj_1",
      partner_id: "partner_1",
      channel: "manual",
      set_by_admin_id: "admin_7",
      occurred_at: "2026-01-01T00:00:00.000Z",
    };
    expect(touchRowToAttributionTouch(row)).toEqual({
      partnerId: "partner_1",
      channel: "manual",
      occurredAt: "2026-01-01T00:00:00.000Z",
      setByAdminId: "admin_7",
    });
  });

  it("drops a row with an unknown channel", () => {
    const row: AttributionTouchRow = {
      subject_key: "subj_1",
      partner_id: "partner_1",
      channel: "carrier_pigeon",
      set_by_admin_id: null,
      occurred_at: "2026-01-01T00:00:00.000Z",
    };
    expect(touchRowToAttributionTouch(row)).toBeNull();
  });

  it("round-trips a touch through the mapping functions", () => {
    const touch: AttributionTouch = {
      partnerId: "partner_2",
      channel: "qr",
      occurredAt: "2026-02-02T00:00:00.000Z",
    };
    const row = attributionTouchToRow("subj_9", touch);
    expect(row.subject_key).toBe("subj_9");
    expect(touchRowToAttributionTouch(row)).toEqual(touch);
  });
});

// ---------------------------------------------------------------------------
// In-memory partner link store
// ---------------------------------------------------------------------------

describe("createInMemoryPartnerLinkStore", () => {
  const link = (partnerId: string, code: string): StoredLink => ({
    code,
    partnerId,
    channel: "signed_link",
    campaign: null,
    issuedAt: "2026-01-01T00:00:00.000Z",
  });

  it("returns null for an unknown code", async () => {
    const store = createInMemoryPartnerLinkStore();
    expect(await store.findLinkByCode("nope")).toBeNull();
  });

  it("saves then finds a link by code and lists it by partner", async () => {
    const store = createInMemoryPartnerLinkStore();
    await store.saveLink(link("partner_1", "code_a"));
    expect(await store.findLinkByCode("code_a")).toEqual(link("partner_1", "code_a"));
    expect(await store.listLinks("partner_1")).toEqual([link("partner_1", "code_a")]);
  });

  it("keeps two partners' links separate (tenant isolation)", async () => {
    const store = createInMemoryPartnerLinkStore();
    await store.saveLink(link("partner_1", "code_a"));
    await store.saveLink(link("partner_2", "code_b"));
    expect(await store.listLinks("partner_1")).toEqual([link("partner_1", "code_a")]);
    expect(await store.listLinks("partner_2")).toEqual([link("partner_2", "code_b")]);
  });

  it("does not let a caller mutate stored state through a returned reference", async () => {
    const store = createInMemoryPartnerLinkStore();
    await store.saveLink(link("partner_1", "code_a"));
    const loaded = await store.findLinkByCode("code_a");
    loaded!.partnerId = "partner_hijack";
    expect((await store.findLinkByCode("code_a"))!.partnerId).toBe("partner_1");
  });

  it("rejects a duplicate code and never re-points it at another partner", async () => {
    const store = createInMemoryPartnerLinkStore();
    await store.saveLink(link("partner_1", "code_a"));
    // The audit finding: the earlier version overwrote byCode while partner_1's
    // listing kept the stale link, so one code appeared under two partners. The
    // DB keeps code UNIQUE, so the reference now rejects identically.
    await expect(store.saveLink(link("partner_2", "code_a"))).rejects.toBeInstanceOf(
      DuplicatePartnerLinkCode,
    );
    expect((await store.findLinkByCode("code_a"))!.partnerId).toBe("partner_1");
    expect(await store.listLinks("partner_1")).toHaveLength(1);
    expect(await store.listLinks("partner_2")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// In-memory attribution touch store (append-only)
// ---------------------------------------------------------------------------

describe("createInMemoryAttributionTouchStore", () => {
  it("returns an empty list for an unknown subject", async () => {
    const store = createInMemoryAttributionTouchStore();
    expect(await store.touchesFor("subj_x")).toEqual([]);
  });

  it("appends touches and reads them back in order", async () => {
    const store = createInMemoryAttributionTouchStore();
    await store.appendTouch("subj_1", { partnerId: "p1", channel: "code", occurredAt: "2026-01-01T00:00:00.000Z" });
    await store.appendTouch("subj_1", { partnerId: "p2", channel: "qr", occurredAt: "2026-01-02T00:00:00.000Z" });
    expect(await store.touchesFor("subj_1")).toEqual([
      { partnerId: "p1", channel: "code", occurredAt: "2026-01-01T00:00:00.000Z" },
      { partnerId: "p2", channel: "qr", occurredAt: "2026-01-02T00:00:00.000Z" },
    ]);
  });

  it("keeps two subjects' touches separate (subject isolation)", async () => {
    const store = createInMemoryAttributionTouchStore();
    await store.appendTouch("subj_1", { partnerId: "p1", channel: "code", occurredAt: "2026-01-01T00:00:00.000Z" });
    await store.appendTouch("subj_2", { partnerId: "p2", channel: "code", occurredAt: "2026-01-01T00:00:00.000Z" });
    expect(await store.touchesFor("subj_1")).toHaveLength(1);
    expect(await store.touchesFor("subj_2")).toHaveLength(1);
    expect((await store.touchesFor("subj_1"))[0].partnerId).toBe("p1");
  });
});

// ---------------------------------------------------------------------------
// In-memory attribution conversion store (append-only insert-if-absent)
// ---------------------------------------------------------------------------

describe("createInMemoryAttributionConversionStore", () => {
  const record = (orderId: string, partnerId: string) => ({
    orderId,
    partnerId,
    channel: "code" as const,
    attributedAt: "2026-01-01T00:00:00.000Z",
    setByAdminId: null,
    overrideReason: null,
  });

  it("inserts the first winner and returns the existing one on a retry", async () => {
    const store = createInMemoryAttributionConversionStore();
    const first = await store.putAttributionIfAbsent(record("order_1", "partner_1"));
    expect(first.partnerId).toBe("partner_1");
    // A second, different record for the same order must NOT overwrite the winner.
    const second = await store.putAttributionIfAbsent(record("order_1", "partner_2"));
    expect(second.partnerId).toBe("partner_1");
    expect((await store.getAttribution("order_1"))!.partnerId).toBe("partner_1");
  });

  it("returns null for an order with no attribution", async () => {
    const store = createInMemoryAttributionConversionStore();
    expect(await store.getAttribution("order_x")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Fake Supabase client (no network), covering exactly the calls the stores make.
// Backs each table with a plain array so a save then load round-trips, proving
// the query wiring and not only the mapping.
// ---------------------------------------------------------------------------

function fakeSupabase(): { client: SupabaseClient; tables: Map<string, Record<string, unknown>[]> } {
  const tables = new Map<string, Record<string, unknown>[]>();
  const rowsFor = (table: string): Record<string, unknown>[] => {
    const existing = tables.get(table);
    if (existing) return existing;
    const created: Record<string, unknown>[] = [];
    tables.set(table, created);
    return created;
  };

  function builder(table: string) {
    const state: {
      op: "select" | "insert";
      payload?: Record<string, unknown> | Record<string, unknown>[];
      filters: Array<{ col: string; val: unknown }>;
      sortCol?: string;
      ascending?: boolean;
    } = { op: "select", filters: [] };

    const matches = (row: Record<string, unknown>): boolean =>
      state.filters.every((f) => row[f.col] === f.val);

    const selected = (): Record<string, unknown>[] => {
      let out = rowsFor(table).filter(matches);
      if (state.sortCol) {
        const col = state.sortCol;
        const asc = state.ascending !== false;
        out = out.slice().sort((a, b) => {
          const av = String(a[col]);
          const bv = String(b[col]);
          if (av === bv) return 0;
          return (av < bv ? -1 : 1) * (asc ? 1 : -1);
        });
      }
      return out;
    };

    const insertResult = (): { data: null; error: { code: string; message: string } | null } => {
      const payload = state.payload;
      const list = Array.isArray(payload) ? payload : payload ? [payload] : [];
      for (const row of list) {
        // research_partner_links keeps code UNIQUE; a duplicate is a 23505.
        if (
          table === "research_partner_links" &&
          rowsFor(table).some((r) => r.code === row.code)
        ) {
          return { data: null, error: { code: "23505", message: "duplicate key" } };
        }
        // research_partners keeps member_id UNIQUE; one member, one partner.
        if (
          table === "research_partners" &&
          rowsFor(table).some((r) => r.member_id === row.member_id)
        ) {
          return { data: null, error: { code: "23505", message: "duplicate key" } };
        }
        rowsFor(table).push({ ...row });
      }
      return { data: null, error: null };
    };

    const api: Record<string, unknown> = {};
    Object.assign(api, {
      select() {
        state.op = "select";
        return api;
      },
      insert(payload: Record<string, unknown> | Record<string, unknown>[]) {
        state.op = "insert";
        state.payload = payload;
        // insert() is awaited directly by the stores.
        return Promise.resolve(insertResult());
      },
      eq(col: string, val: unknown) {
        state.filters.push({ col, val });
        return api;
      },
      order(col: string, opts?: { ascending?: boolean }) {
        state.sortCol = col;
        state.ascending = opts?.ascending;
        return Promise.resolve({ data: selected(), error: null });
      },
      maybeSingle() {
        const rows = selected();
        return Promise.resolve({ data: rows[0] ?? null, error: null });
      },
      then(onF: (v: { data: unknown; error: null }) => unknown) {
        return Promise.resolve({ data: selected(), error: null }).then(onF);
      },
    });
    return api;
  }

  const client = { from: (table: string) => builder(table) } as unknown as SupabaseClient;
  return { client, tables };
}

// ---------------------------------------------------------------------------
// Supabase-backed partner link store (fake client)
// ---------------------------------------------------------------------------

describe("createSupabasePartnerLinkStore (fake client)", () => {
  const link = (partnerId: string, code: string, issuedAt: string): StoredLink => ({
    code,
    partnerId,
    channel: "signed_link",
    campaign: null,
    issuedAt,
  });

  it("returns null for an unknown code", async () => {
    const { client } = fakeSupabase();
    const store = createSupabasePartnerLinkStore(client);
    expect(await store.findLinkByCode("nope")).toBeNull();
  });

  it("saves then finds a link by code round-trip", async () => {
    const { client } = fakeSupabase();
    const store = createSupabasePartnerLinkStore(client);
    await store.saveLink(link("partner_1", "code_a", "2026-01-01T00:00:00.000Z"));
    expect(await store.findLinkByCode("code_a")).toEqual(link("partner_1", "code_a", "2026-01-01T00:00:00.000Z"));
  });

  it("lists a partner's links ordered by issue time and isolates partners", async () => {
    const { client } = fakeSupabase();
    const store = createSupabasePartnerLinkStore(client);
    await store.saveLink(link("partner_1", "code_late", "2026-02-01T00:00:00.000Z"));
    await store.saveLink(link("partner_1", "code_early", "2026-01-01T00:00:00.000Z"));
    await store.saveLink(link("partner_2", "code_other", "2026-01-15T00:00:00.000Z"));

    const listed = await store.listLinks("partner_1");
    expect(listed.map((l) => l.code)).toEqual(["code_early", "code_late"]);
    expect(await store.listLinks("partner_2")).toEqual([
      link("partner_2", "code_other", "2026-01-15T00:00:00.000Z"),
    ]);
  });

  it("surfaces the DB unique violation on a duplicate code as DuplicatePartnerLinkCode", async () => {
    const { client } = fakeSupabase();
    const store = createSupabasePartnerLinkStore(client);
    await store.saveLink(link("partner_1", "code_a", "2026-01-01T00:00:00.000Z"));
    await expect(
      store.saveLink(link("partner_2", "code_a", "2026-01-02T00:00:00.000Z")),
    ).rejects.toBeInstanceOf(DuplicatePartnerLinkCode);
    expect((await store.findLinkByCode("code_a"))!.partnerId).toBe("partner_1");
  });
});

// ---------------------------------------------------------------------------
// Supabase-backed attribution touch store (fake client) - append-only
// ---------------------------------------------------------------------------

describe("createSupabaseAttributionTouchStore (fake client)", () => {
  it("appends touches and reads them back ordered by occurrence", async () => {
    const { client } = fakeSupabase();
    const store = createSupabaseAttributionTouchStore(client);
    await store.appendTouch("subj_1", { partnerId: "p1", channel: "qr", occurredAt: "2026-01-02T00:00:00.000Z" });
    await store.appendTouch("subj_1", { partnerId: "p2", channel: "code", occurredAt: "2026-01-01T00:00:00.000Z" });

    expect(await store.touchesFor("subj_1")).toEqual([
      { partnerId: "p2", channel: "code", occurredAt: "2026-01-01T00:00:00.000Z" },
      { partnerId: "p1", channel: "qr", occurredAt: "2026-01-02T00:00:00.000Z" },
    ]);
  });

  it("accumulates rather than replaces, and isolates subjects", async () => {
    const { client, tables } = fakeSupabase();
    const store = createSupabaseAttributionTouchStore(client);
    await store.appendTouch("subj_1", { partnerId: "p1", channel: "code", occurredAt: "2026-01-01T00:00:00.000Z" });
    await store.appendTouch("subj_1", { partnerId: "p1", channel: "code", occurredAt: "2026-01-03T00:00:00.000Z" });
    await store.appendTouch("subj_2", { partnerId: "p9", channel: "code", occurredAt: "2026-01-02T00:00:00.000Z" });

    // Append-only: every insert added a row, none was overwritten.
    expect(tables.get("research_attribution_touches")).toHaveLength(3);
    expect(await store.touchesFor("subj_1")).toHaveLength(2);
    expect(await store.touchesFor("subj_2")).toHaveLength(1);
  });

  it("preserves a manual touch's admin through the round trip", async () => {
    const { client } = fakeSupabase();
    const store = createSupabaseAttributionTouchStore(client);
    await store.appendTouch("subj_1", {
      partnerId: "p1",
      channel: "manual",
      occurredAt: "2026-01-01T00:00:00.000Z",
      setByAdminId: "admin_3",
    });
    expect((await store.touchesFor("subj_1"))[0].setByAdminId).toBe("admin_3");
  });
});

// ---------------------------------------------------------------------------
// Pure row mapping: partner member linkage
// ---------------------------------------------------------------------------

describe("partnerMemberRowToLink", () => {
  const row = (overrides: Partial<PartnerMemberRow> = {}): PartnerMemberRow => ({
    id: "p1",
    member_id: "mem_1",
    role: "affiliate",
    state: "application",
    certified_at: null,
    activated_at: null,
    ...overrides,
  });

  it("maps a partner row to a PartnerMemberLink", () => {
    expect(partnerMemberRowToLink(row())).toEqual({
      partnerId: "p1",
      memberId: "mem_1",
      role: "affiliate",
      state: "application",
      certifiedAt: null,
      activatedAt: null,
    });
  });

  it("carries certification and activation timestamps through", () => {
    const mapped = partnerMemberRowToLink(
      row({ state: "active", certified_at: "2026-01-01T00:00:00.000Z", activated_at: "2026-01-02T00:00:00.000Z" }),
    );
    expect(mapped?.certifiedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(mapped?.activatedAt).toBe("2026-01-02T00:00:00.000Z");
  });

  it("drops a row with an unknown role or state rather than guessing", () => {
    expect(partnerMemberRowToLink(row({ role: "regional_director" }))).toBeNull();
    expect(partnerMemberRowToLink(row({ state: "shadow_banned" }))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Partner member linkage stores (in-memory reference + fake Supabase client)
// ---------------------------------------------------------------------------

const newPartner = (
  memberId: string,
  partnerId: string,
): NewPartnerMemberRecord => ({
  partnerId,
  memberId,
  role: "affiliate",
  legalName: "A Name",
  contactEmail: "a@example.com",
  appliedAt: "2026-01-01T00:00:00.000Z",
});

/** The behavioral contract both implementations must satisfy identically. */
function memberStoreContract(name: string, makeStore: () => AsyncPartnerMemberStore): void {
  describe(name, () => {
    it("returns null for a member with no partner", async () => {
      expect(await makeStore().findByMemberId("mem_none")).toBeNull();
    });

    it("creates the member's one partner and finds it by member id", async () => {
      const store = makeStore();
      const created = await store.createPartnerForMember(newPartner("mem_1", "p1"));
      expect(created).toEqual({
        partnerId: "p1",
        memberId: "mem_1",
        role: "affiliate",
        state: "application",
        certifiedAt: null,
        activatedAt: null,
      });
      expect(await store.findByMemberId("mem_1")).toEqual(created);
    });

    it("rejects a second partner for the same member and keeps the first", async () => {
      const store = makeStore();
      await store.createPartnerForMember(newPartner("mem_1", "p1"));
      await expect(
        store.createPartnerForMember(newPartner("mem_1", "p2")),
      ).rejects.toBeInstanceOf(MemberAlreadyPartner);
      expect((await store.findByMemberId("mem_1"))!.partnerId).toBe("p1");
    });

    it("keeps two members' partners separate (tenant isolation)", async () => {
      const store = makeStore();
      await store.createPartnerForMember(newPartner("mem_1", "p1"));
      await store.createPartnerForMember(newPartner("mem_2", "p2"));
      expect((await store.findByMemberId("mem_1"))!.partnerId).toBe("p1");
      expect((await store.findByMemberId("mem_2"))!.partnerId).toBe("p2");
    });
  });
}

memberStoreContract("createInMemoryPartnerMemberStore", () => createInMemoryPartnerMemberStore());
memberStoreContract("createSupabasePartnerMemberStore (fake client)", () =>
  createSupabasePartnerMemberStore(fakeSupabase().client),
);

describe("createSupabasePartnerMemberStore specifics", () => {
  it("does not let a caller mutate stored state through a returned reference", async () => {
    const store = createInMemoryPartnerMemberStore();
    await store.createPartnerForMember(newPartner("mem_1", "p1"));
    const loaded = await store.findByMemberId("mem_1");
    loaded!.partnerId = "p_hijack";
    expect((await store.findByMemberId("mem_1"))!.partnerId).toBe("p1");
  });

  it("persists the schema's NOT NULL columns without reading them back", async () => {
    const { client, tables } = fakeSupabase();
    const store = createSupabasePartnerMemberStore(client);
    await store.createPartnerForMember(newPartner("mem_1", "p1"));
    const row = tables.get("research_partners")![0];
    expect(row.legal_name).toBe("A Name");
    expect(row.contact_email).toBe("a@example.com");
    expect(row.state).toBe("application");
    // The linkage read carries neither administrative column.
    const link = await store.findByMemberId("mem_1");
    expect(JSON.stringify(link)).not.toContain("A Name");
    expect(JSON.stringify(link)).not.toContain("a@example.com");
  });

  it("drops a persisted row with a foreign role rather than trusting it", async () => {
    const { client, tables } = fakeSupabase();
    const store = createSupabasePartnerMemberStore(client);
    tables.set("research_partners", [
      {
        id: "p1",
        member_id: "mem_1",
        role: "regional_director",
        state: "application",
        certified_at: null,
        activated_at: null,
      },
    ]);
    expect(await store.findByMemberId("mem_1")).toBeNull();
  });
});
