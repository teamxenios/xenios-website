import { describe, expect, it, vi } from "vitest";
import { tebraExternalId } from "@shared/care/tebra";
import { createPersistentTebraLinkStore } from "./tebra-link-store";
import {
  TEBRA_ACQUIRE_LEASE_RPC,
  TEBRA_CURSORS_TABLE,
  TEBRA_LEASES_TABLE,
  TEBRA_LINKS_TABLE,
  buildSupabaseTebraLinkRowGateway,
  type TebraSupabaseClient,
} from "./tebra-link-store-supabase";

const PATIENT_ID = "11111111-1111-4111-8111-111111111111";
const PATIENT_EXTERNAL_ID = tebraExternalId("patient", PATIENT_ID);

const LINK_ROW = {
  entity: "patient",
  local_id: PATIENT_ID,
  external_id: PATIENT_EXTERNAL_ID,
  tebra_id: "tebra-patient-1",
  linked_at: "2026-08-13T11:00:00.000Z",
  last_seen_at: "2026-08-13T12:00:00.000Z",
};

type Op = [string, ...unknown[]];

/**
 * A chainable recorder shaped like the Supabase query builder: every step
 * returns itself and the whole chain is awaitable, which is how the real client
 * behaves.
 */
function fakeClient(
  result: { data?: unknown; error?: unknown } = {},
  rpcResult: { data?: unknown; error?: unknown } = {},
) {
  const tables: { table: string; ops: Op[] }[] = [];
  const rpc = vi.fn(async () => ({
    data: rpcResult.data ?? null,
    error: rpcResult.error ?? null,
  }));

  const client: TebraSupabaseClient = {
    from(table: string) {
      const record = { table, ops: [] as Op[] };
      tables.push(record);
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "eq", "upsert", "delete", "maybeSingle"]) {
        builder[method] = (...args: unknown[]) => {
          record.ops.push([method, ...args]);
          return builder;
        };
      }
      builder.then = (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(
          resolve,
        );
      return builder;
    },
    rpc,
  };

  return { client, tables, rpc, gateway: buildSupabaseTebraLinkRowGateway(client) };
}

describe("Supabase link gateway: reads", () => {
  it("filters by entity and local id, and maps the row into lane shape", async () => {
    const harness = fakeClient({ data: LINK_ROW });
    const link = await harness.gateway.selectLinkByLocalId("patient", PATIENT_ID);

    expect(link).toEqual({
      entity: "patient",
      localId: PATIENT_ID,
      externalId: PATIENT_EXTERNAL_ID,
      tebraId: "tebra-patient-1",
      linkedAt: "2026-08-13T11:00:00.000Z",
      lastSeenAt: "2026-08-13T12:00:00.000Z",
    });
    expect(harness.tables[0].table).toBe(TEBRA_LINKS_TABLE);
    expect(harness.tables[0].ops).toContainEqual(["eq", "entity", "patient"]);
    expect(harness.tables[0].ops).toContainEqual(["eq", "local_id", PATIENT_ID]);
  });

  it("looks a link up by external id on the external id column", async () => {
    const harness = fakeClient({ data: LINK_ROW });
    await harness.gateway.selectLinkByExternalId("patient", PATIENT_EXTERNAL_ID);
    expect(harness.tables[0].ops).toContainEqual([
      "eq",
      "external_id",
      PATIENT_EXTERNAL_ID,
    ]);
  });

  it("reports an absent row as null rather than as a failure", async () => {
    const harness = fakeClient({ data: null });
    await expect(harness.gateway.selectLinkByLocalId("patient", PATIENT_ID)).resolves.toBeNull();
  });

  it("reads a cursor and normalizes a missing continuation token", async () => {
    const harness = fakeClient({
      data: {
        entity: "patient",
        from_modified_at: "2026-08-13T11:48:00.000Z",
        to_modified_at: "2026-08-13T11:58:00.000Z",
        continuation_token: null,
      },
    });

    await expect(harness.gateway.selectCursor("patient")).resolves.toEqual({
      entity: "patient",
      fromModifiedAt: "2026-08-13T11:48:00.000Z",
      toModifiedAt: "2026-08-13T11:58:00.000Z",
      continuationToken: null,
    });
    expect(harness.tables[0].table).toBe(TEBRA_CURSORS_TABLE);
  });
});

describe("Supabase link gateway: writes", () => {
  it("upserts a link on the primary key, in column shape", async () => {
    const harness = fakeClient();
    await harness.gateway.upsertLink({
      entity: "patient",
      localId: PATIENT_ID,
      externalId: PATIENT_EXTERNAL_ID,
      tebraId: "tebra-patient-1",
      linkedAt: "2026-08-13T11:00:00.000Z",
      lastSeenAt: "2026-08-13T12:00:00.000Z",
    });

    const upsert = harness.tables[0].ops.find(([method]) => method === "upsert");
    expect(harness.tables[0].table).toBe(TEBRA_LINKS_TABLE);
    expect(upsert?.[1]).toEqual({
      entity: "patient",
      local_id: PATIENT_ID,
      external_id: PATIENT_EXTERNAL_ID,
      tebra_id: "tebra-patient-1",
      linked_at: "2026-08-13T11:00:00.000Z",
      last_seen_at: "2026-08-13T12:00:00.000Z",
    });
    expect(upsert?.[2]).toEqual({ onConflict: "entity,local_id" });
  });

  it("upserts a cursor on its entity key", async () => {
    const harness = fakeClient();
    await harness.gateway.upsertCursor({
      entity: "appointment",
      fromModifiedAt: "2026-08-13T11:48:00.000Z",
      toModifiedAt: "2026-08-13T11:58:00.000Z",
      continuationToken: "page-2",
    });

    const upsert = harness.tables[0].ops.find(([method]) => method === "upsert");
    expect(upsert?.[1]).toMatchObject({ entity: "appointment", continuation_token: "page-2" });
    expect(upsert?.[2]).toEqual({ onConflict: "entity" });
  });
});

describe("Supabase link gateway: the lease", () => {
  it("acquires through the function in one round trip, never a read then a write", async () => {
    const harness = fakeClient({}, { data: true });
    const request = {
      leaseKey: "care:tebra:sync:patient",
      owner: "worker-a:scheduled",
      expiresAt: "2026-08-13T12:10:00.000Z",
      now: "2026-08-13T12:00:00.000Z",
    };

    await expect(harness.gateway.tryAcquireLease(request)).resolves.toBe(true);
    expect(harness.rpc).toHaveBeenCalledTimes(1);
    expect(harness.rpc).toHaveBeenCalledWith(TEBRA_ACQUIRE_LEASE_RPC, {
      p_lease_key: request.leaseKey,
      p_owner: request.owner,
      p_expires_at: request.expiresAt,
      p_now: request.now,
    });
    // No table round trip at all: composing this from a select and an update is
    // exactly how two callers both come to believe they hold the lease.
    expect(harness.tables).toHaveLength(0);
  });

  it("treats anything other than an explicit true as not held", async () => {
    for (const data of [false, null, undefined, "true", 1, {}]) {
      const harness = fakeClient({}, { data });
      await expect(
        harness.gateway.tryAcquireLease({
          leaseKey: "k",
          owner: "o",
          expiresAt: "2026-08-13T12:10:00.000Z",
          now: "2026-08-13T12:00:00.000Z",
        }),
      ).resolves.toBe(false);
    }
  });

  it("releases only its own row, so it cannot evict the next holder", async () => {
    // A worker whose lease expired and was taken by someone else still runs its
    // release on the way out. Scoping the delete to the owner keeps that from
    // deleting the new holder's row.
    const harness = fakeClient();
    await harness.gateway.releaseLease({ leaseKey: "care:tebra:sync:patient", owner: "worker-a" });

    expect(harness.tables[0].table).toBe(TEBRA_LEASES_TABLE);
    expect(harness.tables[0].ops).toContainEqual(["delete"]);
    expect(harness.tables[0].ops).toContainEqual(["eq", "lease_key", "care:tebra:sync:patient"]);
    expect(harness.tables[0].ops).toContainEqual(["eq", "owner", "worker-a"]);
  });
});

describe("Supabase link gateway: failures say nothing", () => {
  it("reduces a driver error that quotes the row to a bare code", async () => {
    const leaky = {
      message:
        'duplicate key value violates unique constraint: Key (external_id)=(xenios:care_patient:REAL-ID) already exists',
      details: "Failing row contains (patient, REAL-ID, chart-9982)",
    };

    for (const call of [
      (h: ReturnType<typeof fakeClient>) => h.gateway.selectLinkByLocalId("patient", PATIENT_ID),
      (h: ReturnType<typeof fakeClient>) => h.gateway.selectCursor("patient"),
      (h: ReturnType<typeof fakeClient>) =>
        h.gateway.upsertLink({
          entity: "patient",
          localId: PATIENT_ID,
          externalId: PATIENT_EXTERNAL_ID,
          tebraId: "t",
          linkedAt: "2026-08-13T11:00:00.000Z",
          lastSeenAt: "2026-08-13T11:00:00.000Z",
        }),
      (h: ReturnType<typeof fakeClient>) =>
        h.gateway.releaseLease({ leaseKey: "k", owner: "o" }),
    ]) {
      const harness = fakeClient({ error: leaky });
      await expect(call(harness)).rejects.toThrow("tebra_unavailable");
      await expect(call(harness)).rejects.not.toThrow(/REAL-ID|chart-9982|Failing row/);
    }
  });

  it("refuses a lease when the function itself errors", async () => {
    const harness = fakeClient({}, { error: { message: "permission denied for function" } });
    await expect(
      harness.gateway.tryAcquireLease({
        leaseKey: "k",
        owner: "o",
        expiresAt: "2026-08-13T12:10:00.000Z",
        now: "2026-08-13T12:00:00.000Z",
      }),
    ).rejects.toThrow("tebra_unavailable");
  });
});

describe("Supabase gateway behind the store port", () => {
  it("still refuses a stored row whose mapping does not check out", async () => {
    // The durable path must not weaken the guard the in-memory path enforces:
    // a row pointing one record at another record's chart is treated as absent.
    const harness = fakeClient({
      data: { ...LINK_ROW, external_id: tebraExternalId("patient", "99999999-9999-4999-8999-999999999999") },
    });
    const store = createPersistentTebraLinkStore(harness.gateway);

    await expect(store.findByLocalId("patient", PATIENT_ID)).resolves.toBeNull();
  });

  it("passes a consistent row straight through", async () => {
    const harness = fakeClient({ data: LINK_ROW });
    const store = createPersistentTebraLinkStore(harness.gateway);

    await expect(store.findByLocalId("patient", PATIENT_ID)).resolves.toMatchObject({
      tebraId: "tebra-patient-1",
    });
  });
});
