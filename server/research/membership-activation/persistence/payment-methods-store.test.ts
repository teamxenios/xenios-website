import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  approvePaymentMethod,
  createAesGcmInstructionCipher,
  createPaymentMethod,
  type MethodVersionRecord,
  type PaymentMethodRecord,
} from "../payment-methods";
import {
  createInMemoryPaymentMethodsStore,
  createSupabasePaymentMethodsStore,
  methodVersionRecordToRow,
  methodVersionRowToRecord,
  PaymentMethodAlreadyExists,
  PaymentMethodNotFound,
  PaymentMethodStale,
  paymentMethodRecordToRow,
  paymentMethodRowToRecord,
  type MethodVersionRow,
  type PaymentMethodRow,
} from "./payment-methods-store";

const NOW = new Date("2026-07-22T12:00:00.000Z");
const PLAINTEXT = "synthetic destination 00TEST";

function created(methodId = "fm_method_1"): { record: PaymentMethodRecord; version: MethodVersionRecord } {
  const cipher = createAesGcmInstructionCipher("test-only-key-material-long-enough");
  return createPaymentMethod(
    {
      methodId,
      providerCode: "manual_transfer",
      memberFacingName: "Bank transfer",
      adminFacingName: "Manual bank transfer (bridge)",
      duration: "temporary",
      activeStartAt: "2026-07-01T00:00:00.000Z",
      activeEndAt: "2026-09-01T00:00:00.000Z",
      activationEligible: true,
      renewalEligible: true,
      settlementTime: "same day",
      receivingLegalEntity: "Xenios Technology LLC",
      ownershipClassification: "business",
      receivingInstructions: PLAINTEXT,
    },
    cipher,
    "admin_samuel",
    NOW,
  );
}

// ---------------------------------------------------------------------------
// Pure mappers
// ---------------------------------------------------------------------------

describe("payment-method row mappers", () => {
  it("round-trips a record through the row shape", () => {
    const { record } = created();
    expect(paymentMethodRowToRecord(paymentMethodRecordToRow(record))).toEqual(record);
  });

  it("round-trips a version row including the snapshot", () => {
    const { version } = created();
    expect(methodVersionRowToRecord(methodVersionRecordToRow(version))).toEqual(version);
  });

  it("the row carries ciphertext only; no column holds the plaintext", () => {
    const { record } = created();
    const row = paymentMethodRecordToRow(record);
    const values = Object.values(row).filter((v): v is string => typeof v === "string");
    expect(values.some((v) => v.includes(PLAINTEXT))).toBe(false);
    expect(row.receiving_instructions_enc.startsWith("enc.v1:")).toBe(true);
    expect(Object.keys(row).some((k) => k.toLowerCase().includes("plain"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// In-memory reference
// ---------------------------------------------------------------------------

describe("createInMemoryPaymentMethodsStore", () => {
  it("creates, gets, and lists; a duplicate methodId errors", async () => {
    const store = createInMemoryPaymentMethodsStore();
    const { record, version } = created();
    await store.create(record, version);
    expect(await store.get("fm_method_1")).toEqual(record);
    expect(await store.list()).toEqual([record]);
    await expect(store.create(record, version)).rejects.toThrow(PaymentMethodAlreadyExists);
  });

  it("save appends the version row and advances the record", async () => {
    const store = createInMemoryPaymentMethodsStore();
    const { record, version } = created();
    await store.create(record, version);
    const approved = approvePaymentMethod(record, { approvedBy: "admin_samuel", now: NOW });
    await store.save(approved.record, approved.version);

    expect((await store.get("fm_method_1"))?.approvalStatus).toBe("approved");
    const history = await store.listVersions("fm_method_1");
    expect(history.map((v) => [v.version, v.changeKind])).toEqual([
      [1, "created"],
      [2, "approved"],
    ]);
  });

  it("a stale save (wrong base version) is refused, not silently applied", async () => {
    const store = createInMemoryPaymentMethodsStore();
    const { record, version } = created();
    await store.create(record, version);
    const approved = approvePaymentMethod(record, { approvedBy: "admin_samuel", now: NOW });
    await store.save(approved.record, approved.version);
    // A second writer built from the ORIGINAL v1 record races in.
    const racing = approvePaymentMethod(record, { approvedBy: "admin_other", now: NOW });
    await expect(store.save(racing.record, racing.version)).rejects.toThrow(PaymentMethodStale);
  });

  it("saving an unknown method errors", async () => {
    const store = createInMemoryPaymentMethodsStore();
    const approved = approvePaymentMethod(created().record, { approvedBy: "a", now: NOW });
    await expect(store.save(approved.record, approved.version)).rejects.toThrow(PaymentMethodNotFound);
  });
});

// ---------------------------------------------------------------------------
// A fake supabase-js client backing the two tables with plain collections,
// covering exactly the fluent calls the store makes. No network.
// ---------------------------------------------------------------------------

function fakeSupabase(): {
  client: SupabaseClient;
  methods: Map<string, PaymentMethodRow>;
  versions: MethodVersionRow[];
} {
  const methods = new Map<string, PaymentMethodRow>();
  const versions: MethodVersionRow[] = [];

  function builder(table: string) {
    const state: { op: string; filters: Record<string, unknown>; payload?: unknown } = {
      op: "select",
      filters: {},
    };
    const api: Record<string, unknown> = {};
    const matches = (row: Record<string, unknown>): boolean =>
      Object.entries(state.filters).every(([col, val]) => row[col] === val);

    const result = (): { data: unknown; error: { code?: string; message?: string } | null } => {
      if (table === "research_fm_payment_methods") {
        if (state.op === "insert") {
          const row = state.payload as PaymentMethodRow;
          if (methods.has(row.method_id)) return { data: null, error: { code: "23505", message: "duplicate" } };
          methods.set(row.method_id, { ...row });
          return { data: null, error: null };
        }
        if (state.op === "update") {
          const hits = [...methods.values()].filter((r) => matches(r as unknown as Record<string, unknown>));
          for (const hit of hits) Object.assign(hit, state.payload);
          return { data: hits.length > 0 ? { method_id: hits[0].method_id } : null, error: null };
        }
        const rows = [...methods.values()].filter((r) => matches(r as unknown as Record<string, unknown>));
        return { data: rows, error: null };
      }
      if (table === "research_fm_payment_method_versions") {
        if (state.op === "insert") {
          const row = state.payload as MethodVersionRow;
          if (versions.some((v) => v.version_id === row.version_id)) {
            return { data: null, error: { code: "23505", message: "duplicate" } };
          }
          versions.push({ ...row });
          return { data: null, error: null };
        }
        return { data: versions.filter((v) => matches(v as unknown as Record<string, unknown>)), error: null };
      }
      return { data: null, error: { message: `no such table ${table}` } };
    };

    Object.assign(api, {
      select() {
        return api;
      },
      eq(col: string, val: unknown) {
        state.filters[col] = val;
        return api;
      },
      insert(payload: unknown) {
        state.op = "insert";
        state.payload = payload;
        return api;
      },
      update(payload: unknown) {
        state.op = "update";
        state.payload = payload;
        return api;
      },
      maybeSingle() {
        const r = result();
        const data = Array.isArray(r.data) ? ((r.data[0] as unknown) ?? null) : r.data;
        return Promise.resolve({ data, error: r.error });
      },
      then(onF: (v: { data: unknown; error: unknown }) => unknown) {
        return Promise.resolve(result()).then(onF);
      },
    });
    return api;
  }

  const client = { from: (table: string) => builder(table) } as unknown as SupabaseClient;
  return { client, methods, versions };
}

describe("createSupabasePaymentMethodsStore (fake client)", () => {
  it("create inserts the method row AND the v1 version row together", async () => {
    const { client, methods, versions } = fakeSupabase();
    const store = createSupabasePaymentMethodsStore(client);
    const { record, version } = created();
    await store.create(record, version);
    expect(methods.get("fm_method_1")?.receiving_instructions_enc.startsWith("enc.v1:")).toBe(true);
    expect(versions).toHaveLength(1);
    expect(versions[0].change_kind).toBe("created");
  });

  it("a duplicate create surfaces as PaymentMethodAlreadyExists from the DB code", async () => {
    const { client } = fakeSupabase();
    const store = createSupabasePaymentMethodsStore(client);
    const { record, version } = created();
    await store.create(record, version);
    await expect(store.create(record, version)).rejects.toThrow(PaymentMethodAlreadyExists);
  });

  it("get and list map rows back to records; save is guarded on the prior version", async () => {
    const { client, versions } = fakeSupabase();
    const store = createSupabasePaymentMethodsStore(client);
    const { record, version } = created();
    await store.create(record, version);

    expect(await store.get("fm_method_1")).toEqual(record);
    expect(await store.list()).toEqual([record]);

    const approved = approvePaymentMethod(record, { approvedBy: "admin_samuel", now: NOW });
    await store.save(approved.record, approved.version);
    expect((await store.get("fm_method_1"))?.enabled).toBe(true);
    expect(versions.map((v) => v.version)).toEqual([1, 2]);

    // Racing writer built from the stale v1 record: the version filter misses.
    const racing = approvePaymentMethod(record, { approvedBy: "admin_other", now: NOW });
    await expect(store.save(racing.record, racing.version)).rejects.toThrow(PaymentMethodStale);
    expect(versions).toHaveLength(2); // the refused save appended no history
  });

  it("listVersions returns the append-only history oldest first", async () => {
    const { client } = fakeSupabase();
    const store = createSupabasePaymentMethodsStore(client);
    const { record, version } = created();
    await store.create(record, version);
    const approved = approvePaymentMethod(record, { approvedBy: "admin_samuel", now: NOW });
    await store.save(approved.record, approved.version);
    const history = await store.listVersions("fm_method_1");
    expect(history.map((v) => [v.version, v.changeKind])).toEqual([
      [1, "created"],
      [2, "approved"],
    ]);
    expect(history[1].snapshot.approvalStatus).toBe("approved");
  });

  it("reads are defensive: an unprovisioned table reads as an empty registry", async () => {
    const throwing = {
      from: () => {
        throw new Error("relation does not exist");
      },
    } as unknown as SupabaseClient;
    const store = createSupabasePaymentMethodsStore(throwing);
    expect(await store.list()).toEqual([]);
    expect(await store.get("fm_method_1")).toBeUndefined();
    expect(await store.listVersions("fm_method_1")).toEqual([]);
    // Writes stay loud.
    const { record, version } = created();
    await expect(store.create(record, version)).rejects.toThrow();
  });
});
