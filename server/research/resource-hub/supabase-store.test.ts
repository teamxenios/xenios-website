import { describe, expect, it } from "vitest";
import {
  RESOURCE_DELIVERIES_TABLE,
  RESOURCE_LIBRARY_TABLE,
  RESOURCE_PUBLISH_FUNCTION,
  RESOURCE_VERSIONS_TABLE,
  RESOURCE_WITHDRAW_FUNCTION,
  createSupabaseResourceHubStore,
  isCanonicalUuid,
  type SupabaseQueryLike,
} from "./supabase-store";
import { isResourceHubConflict, type ResourceVersionRow } from "./store";

// ---------------------------------------------------------------------------
// A recording double for the few query shapes the store issues. Every call is
// captured so a test can assert the exact table, filters, payload, or RPC.
// ---------------------------------------------------------------------------

interface Call {
  table: string;
  op: "select" | "insert" | "update" | "rpc";
  columns?: string;
  payload?: Record<string, unknown>;
  filters: Array<[string, unknown]>;
  order?: [string, boolean];
  single?: boolean;
}

type Answer = { data?: unknown; error?: { message: string; code?: string } | null };

function fakeClient(answer: (call: Call) => Answer) {
  const calls: Call[] = [];
  const client: SupabaseQueryLike = {
    from(table) {
      return {
        select(columns) {
          const call: Call = { table, op: "select", columns, filters: [] };
          calls.push(call);
          const builder = {
            eq(column: string, value: unknown) {
              call.filters.push([column, value]);
              return builder;
            },
            order(column: string, options: { ascending: boolean }) {
              call.order = [column, options.ascending];
              return builder;
            },
            async maybeSingle() {
              call.single = true;
              const out = answer(call);
              return { data: (out.data as Record<string, unknown> | null) ?? null, error: out.error ?? null };
            },
            then<T>(onfulfilled: (value: { data: Record<string, unknown>[] | null; error: { message: string } | null }) => T) {
              const out = answer(call);
              return Promise.resolve(onfulfilled({ data: (out.data as Record<string, unknown>[] | null) ?? null, error: out.error ?? null }));
            },
          };
          return builder;
        },
        async insert(row) {
          const call: Call = { table, op: "insert", payload: row, filters: [] };
          calls.push(call);
          return { error: answer(call).error ?? null };
        },
        update(patch) {
          const call: Call = { table, op: "update", payload: patch, filters: [] };
          calls.push(call);
          return {
            async eq(column: string, value: unknown) {
              call.filters.push([column, value]);
              return { error: answer(call).error ?? null };
            },
          };
        },
      };
    },
    async rpc(fn, args) {
      const call: Call = { table: fn, op: "rpc", payload: args, filters: [] };
      calls.push(call);
      return { error: answer(call).error ?? null };
    },
  };
  return { client, calls };
}

const R1 = "11111111-1111-4111-8111-111111111111";
const R2 = "11111111-1111-4111-8111-222222222222";
const V1 = "22222222-2222-4222-8222-111111111111";
const V9 = "22222222-2222-4222-8222-999999999999";
const V_OLD = "22222222-2222-4222-8222-000000000001";
const V_NEWER = "22222222-2222-4222-8222-000000000002";
const ADMIN = "admin@xenios.test";

const VERSION_DB = {
  id: V1,
  resource_id: R1,
  version_number: 1,
  state: "published",
  usage_policy: "private",
  audience: ["research_rep"],
  size_bytes: 1234,
  sha256: "a".repeat(64),
  original_filename: "intro.pdf",
  content_type: "application/pdf",
  storage_key: `resource-library/${R1}/v1-${V1}.pdf`,
  validation_ok: true,
  validation_reasons: [],
  uploaded_at: "2026-09-06T12:00:00+00:00",
  uploaded_by_admin: ADMIN,
  reviewed_at: "2026-09-06T12:01:00+00:00",
  reviewed_by_admin: ADMIN,
  review_reason: "ok",
  published_at: "2026-09-06T12:02:00+00:00",
  published_by_admin: ADMIN,
  withdrawn_at: null,
  withdrawn_by_admin: null,
  withdraw_reason: null,
  supersedes_version_id: null,
  change_summary: null,
  upload_idempotency_key: "k1",
};

const RESOURCE_DB = {
  id: R1,
  title: "Intro",
  purpose: "An introduction a partner may hand out.",
  kind: "pdf",
  created_at: "2026-09-06T11:59:00+00:00",
  created_by_admin: ADMIN,
  current_published_version_id: V1,
};

describe("ids that cannot name a row never reach the database", () => {
  it("recognises only canonical lowercase uuids", () => {
    expect(isCanonicalUuid(R1)).toBe(true);
    for (const bad of ["id-none", "", "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA", "11111111111141118111111111111111", "not-a-uuid'; drop table x;--", `${R1}/`]) {
      expect(isCanonicalUuid(bad), bad).toBe(false);
    }
  });

  it("answers null / empty for non-uuid ids without issuing a query (no 503 oracle)", async () => {
    const { client, calls } = fakeClient(() => ({ error: { message: "invalid input syntax for type uuid" } }));
    const store = createSupabaseResourceHubStore(() => client);
    expect(await store.getResource("id-none")).toBeNull();
    expect(await store.getVersion("id-none")).toBeNull();
    expect(await store.listVersions("id-none")).toEqual([]);
    expect(await store.listDeliveries("id-none")).toEqual([]);
    expect(calls).toEqual([]);
  });
});

describe("reads map database rows to the store's camel-case rows", () => {
  it("getVersion selects by id from the versions table and normalizes timestamps", async () => {
    const { client, calls } = fakeClient(() => ({ data: VERSION_DB }));
    const store = createSupabaseResourceHubStore(() => client);
    const version = await store.getVersion(V1);
    expect(calls[0]).toMatchObject({ table: RESOURCE_VERSIONS_TABLE, op: "select", filters: [["id", V1]], single: true });
    expect(version).toMatchObject({
      versionId: V1,
      resourceId: R1,
      state: "published",
      usagePolicy: "private",
      audience: ["research_rep"],
      storageKey: `resource-library/${R1}/v1-${V1}.pdf`,
      uploadedAt: "2026-09-06T12:00:00.000Z",
      publishedAt: "2026-09-06T12:02:00.000Z",
      withdrawnAt: null,
      uploadIdempotencyKey: "k1",
    });
  });

  it("listPublished returns only versions that are the resource's current published version", async () => {
    const { client } = fakeClient((call) => {
      if (call.table === RESOURCE_VERSIONS_TABLE) return { data: [VERSION_DB, { ...VERSION_DB, id: V_OLD, resource_id: R2 }] };
      const id = call.filters.find(([c]) => c === "id")?.[1];
      if (id === R1) return { data: RESOURCE_DB };
      if (id === R2) return { data: { ...RESOURCE_DB, id: R2, current_published_version_id: V_NEWER } };
      return { data: null };
    });
    const store = createSupabaseResourceHubStore(() => client);
    const published = await store.listPublished();
    expect(published.map((p) => [p.resource.resourceId, p.version.versionId])).toEqual([[R1, V1]]);
  });

  it("throws on a provider error instead of answering an empty lie", async () => {
    const { client } = fakeClient(() => ({ error: { message: "relation does not exist" } }));
    const store = createSupabaseResourceHubStore(() => client);
    await expect(store.listResources()).rejects.toThrow(/resource list failed: relation does not exist/);
    await expect(store.getResource(R1)).rejects.toThrow(/resource read failed/);
  });
});

describe("writes address the right table with the right columns", () => {
  const ROW: ResourceVersionRow = {
    versionId: V9,
    resourceId: R1,
    versionNumber: 2,
    state: "draft",
    usagePolicy: "external_share",
    audience: ["all_partners"],
    sizeBytes: 10,
    sha256: "b".repeat(64),
    originalFilename: "intro-v2.pdf",
    contentType: "application/pdf",
    storageKey: `resource-library/${R1}/v2-${V9}.pdf`,
    validationOk: true,
    validationReasons: [],
    uploadedAt: "2026-09-06T13:00:00.000Z",
    uploadedByAdmin: ADMIN,
    reviewedAt: null,
    reviewedByAdmin: null,
    reviewReason: null,
    publishedAt: null,
    publishedByAdmin: null,
    withdrawnAt: null,
    withdrawnByAdmin: null,
    withdrawReason: null,
    supersedesVersionId: V1,
    changeSummary: "second pass",
    uploadIdempotencyKey: "k9",
  };

  it("insertVersion writes every column the migration requires", async () => {
    const { client, calls } = fakeClient(() => ({}));
    await createSupabaseResourceHubStore(() => client).insertVersion(ROW);
    expect(calls[0]).toMatchObject({ table: RESOURCE_VERSIONS_TABLE, op: "insert" });
    expect(calls[0]!.payload).toEqual({
      id: V9,
      resource_id: R1,
      version_number: 2,
      state: "draft",
      usage_policy: "external_share",
      audience: ["all_partners"],
      size_bytes: 10,
      sha256: "b".repeat(64),
      original_filename: "intro-v2.pdf",
      content_type: "application/pdf",
      storage_key: `resource-library/${R1}/v2-${V9}.pdf`,
      validation_ok: true,
      validation_reasons: [],
      uploaded_at: "2026-09-06T13:00:00.000Z",
      uploaded_by_admin: ADMIN,
      supersedes_version_id: V1,
      change_summary: "second pass",
      upload_idempotency_key: "k9",
    });
  });

  it("a unique-constraint race on insert is a typed conflict, not a generic failure", async () => {
    const { client } = fakeClient(() => ({ error: { message: 'duplicate key value violates unique constraint "research_resource_versions_resource_id_version_number_key"', code: "23505" } }));
    const error = await createSupabaseResourceHubStore(() => client).insertVersion(ROW).catch((e: unknown) => e);
    expect(isResourceHubConflict(error)).toBe(true);
    const { client: other } = fakeClient(() => ({ error: { message: "connection reset", code: "08006" } }));
    const generic = await createSupabaseResourceHubStore(() => other).insertVersion(ROW).catch((e: unknown) => e);
    expect(isResourceHubConflict(generic)).toBe(false);
    expect(String(generic)).toMatch(/version insert failed/);
  });

  it("updateVersion never sends bytes identity, even when a patch carries it", async () => {
    const { client, calls } = fakeClient(() => ({}));
    await createSupabaseResourceHubStore(() => client).updateVersion(V9, {
      state: "in_review",
      reviewedAt: "2026-09-06T14:00:00.000Z",
      reviewedByAdmin: ADMIN,
      reviewReason: "ok",
      // Not mutable: silently ignored by BOTH stores (shared allow-list).
      ...({ storageKey: "somewhere/else.pdf", sha256: "c".repeat(64), sizeBytes: 99, resourceId: R2, versionNumber: 7, validationOk: false } as Record<string, unknown>),
    });
    expect(calls[0]).toMatchObject({ table: RESOURCE_VERSIONS_TABLE, op: "update", filters: [["id", V9]] });
    expect(calls[0]!.payload).toEqual({ state: "in_review", reviewed_at: "2026-09-06T14:00:00.000Z", reviewed_by_admin: ADMIN, review_reason: "ok" });
  });

  it("publish and withdraw are single RPC transitions with the exact arguments", async () => {
    const { client, calls } = fakeClient(() => ({}));
    const store = createSupabaseResourceHubStore(() => client);
    await store.publishVersion({ resourceId: R1, versionId: V9, actorAdmin: ADMIN, at: "2026-09-06T15:00:00.000Z" });
    await store.withdrawVersion({ resourceId: R1, versionId: V9, actorAdmin: ADMIN, at: "2026-09-06T16:00:00.000Z", reason: "Superseded pricing." });
    expect(calls).toEqual([
      { table: RESOURCE_PUBLISH_FUNCTION, op: "rpc", filters: [], payload: { p_resource_id: R1, p_version_id: V9, p_actor: ADMIN, p_at: "2026-09-06T15:00:00.000Z" } },
      { table: RESOURCE_WITHDRAW_FUNCTION, op: "rpc", filters: [], payload: { p_resource_id: R1, p_version_id: V9, p_actor: ADMIN, p_at: "2026-09-06T16:00:00.000Z", p_reason: "Superseded pricing." } },
    ]);
  });

  it("a failed transition throws with the operation named", async () => {
    const { client } = fakeClient(() => ({ error: { message: "research_resource_hub_publish: a draft version cannot be published" } }));
    await expect(createSupabaseResourceHubStore(() => client).publishVersion({ resourceId: R1, versionId: V9, actorAdmin: ADMIN, at: "x" })).rejects.toThrow(/publish transition failed/);
  });

  it("recordDelivery targets the deliveries table", async () => {
    const { client, calls } = fakeClient(() => ({}));
    await createSupabaseResourceHubStore(() => client).recordDelivery({ deliveryId: V_OLD, resourceId: R1, versionId: V9, memberId: "m1", requestedAt: "2026-09-06T15:00:00.000Z", outcome: "delivered", reason: null });
    expect(calls[0]).toMatchObject({ table: RESOURCE_DELIVERIES_TABLE, op: "insert", payload: { id: V_OLD, resource_id: R1, version_id: V9, member_id: "m1", outcome: "delivered", reason: null } });
  });

  it("a failed write throws with the operation named", async () => {
    const { client } = fakeClient(() => ({ error: { message: "permission denied" } }));
    await expect(createSupabaseResourceHubStore(() => client).insertVersion(ROW)).rejects.toThrow(/version insert failed: permission denied/);
  });
});
