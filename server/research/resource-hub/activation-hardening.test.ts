import { describe, expect, it, vi } from "vitest";
import type { ResourceUploadInput } from "@shared/research/resource-hub/contract";
import { createMemoryResourceBytesStore } from "./bytes-store";
import { createResourceHubService, sha256Hex } from "./service";
import { createSupabaseResourceHubStore, RESOURCE_VERSIONS_TABLE, type SupabaseQueryLike } from "./supabase-store";
import {
  createInMemoryResourceHubStore, isResourceHubConflict, ResourceHubConflict,
  type ResourceHubStore, type ResourceVersionExpectation,
} from "./store";

// Benign local fixtures only. No server, HTTP client, managed adapter, or production composition starts.
const PDF = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [] /Count 0 >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n", "latin1");
const INPUT: ResourceUploadInput = {
  title: "Local review fixture", purpose: "Check review state invariants with a harmless PDF.",
  usagePolicy: "private", audience: ["research_rep"], originalFilename: "guide.pdf", idempotencyKey: "fixture-upload-1",
};
const AT = "2026-09-08T00:00:00.000Z";
const INITIAL: ResourceVersionExpectation = { state: "draft", reviewedAt: null, reviewedByAdmin: null, reviewReason: null };
const REVIEWED: ResourceVersionExpectation = { state: "in_review", reviewedAt: AT, reviewedByAdmin: "fixture-reviewer", reviewReason: "Fixture reviewed." };

async function fixture() {
  const store = createInMemoryResourceHubStore();
  const bytes = createMemoryResourceBytesStore();
  let id = 0;
  const serviceFor = (port: ResourceHubStore) => createResourceHubService({ store: port, bytes, now: () => new Date(AT), newId: () => `fixture-${++id}` });
  const service = serviceFor(store);
  const created = await service.createVersion("fixture-admin", INPUT, { bytes: PDF, contentType: "application/pdf" });
  if (!created.ok) throw new Error("fixture setup failed");
  const resourceId = created.resource.resourceId;
  const versionId = created.resource.versions[0]!.versionId;
  return { store, bytes, service, serviceFor, resourceId, versionId };
}

const CHANGED_SNAPSHOTS: Array<[string, Partial<ResourceVersionExpectation>]> = [
  ["state", { state: "published" }],
  ["review time", { reviewedAt: AT }],
  ["review actor", { reviewedByAdmin: "fixture-reviewer" }],
  ["review reason", { reviewReason: "Fixture reviewed." }],
];

describe("activation hardening: conditional memory patches", () => {
  it("accepts matching null and populated snapshots", async () => {
    const h = await fixture();
    await h.store.updateVersion(h.versionId, REVIEWED, INITIAL);
    await h.store.updateVersion(h.versionId, { usagePolicy: "training" }, REVIEWED);
    expect(await h.store.getVersion(h.versionId)).toMatchObject({ ...REVIEWED, usagePolicy: "training" });
  });

  it.each(CHANGED_SNAPSHOTS)("preserves all fields when expected %s is stale", async (_label, changed) => {
    const h = await fixture();
    const before = await h.store.getVersion(h.versionId);
    await expect(h.store.updateVersion(h.versionId, REVIEWED, { ...INITIAL, ...changed })).rejects.toBeInstanceOf(ResourceHubConflict);
    expect(await h.store.getVersion(h.versionId)).toEqual(before);
  });

  it("reports a missing row as a conflict without writes", async () => {
    const h = await fixture();
    const before = h.store.snapshot();
    await expect(h.store.updateVersion("fixture-missing", REVIEWED, INITIAL)).rejects.toBeInstanceOf(ResourceHubConflict);
    expect(h.store.snapshot()).toEqual(before);
  });

  it("preserves immutable bytes identity when a matching patch carries extra fields", async () => {
    const h = await fixture();
    const before = (await h.store.getVersion(h.versionId))!;
    await h.store.updateVersion(h.versionId, { ...REVIEWED, ...({ sha256: "b".repeat(64), storageKey: "fixture-other.pdf" } as Record<string, unknown>) }, INITIAL);
    expect(await h.store.getVersion(h.versionId)).toMatchObject({ ...REVIEWED, sha256: before.sha256, storageKey: before.storageKey });
  });
});

type Row = Record<string, unknown>;
type Filter = ["eq" | "is", string, unknown];
function conditionalProvider(seed: Row | null, providerError = false) {
  let row = seed ? structuredClone(seed) : null;
  const calls: { table: string; patch: Row; filters: Filter[]; columns?: string; statements: number }[] = [];
  const unsupported = () => { throw new Error("unexpected local-double operation"); };
  const client: SupabaseQueryLike = {
    from(table) {
      return {
        select: unsupported, insert: unsupported,
        update(patch) {
          const call = { table, patch, filters: [] as Filter[], columns: undefined as string | undefined, statements: 0 };
          calls.push(call);
          const builder = {
            eq(column: string, value: unknown) { call.filters.push(["eq", column, value]); return builder; },
            is(column: string, value: null) { call.filters.push(["is", column, value]); return builder; },
            select(columns: string) {
              call.columns = columns;
              return {
                async maybeSingle() {
                  call.statements++;
                  if (providerError) return { data: null, error: { message: "fixture provider unavailable", code: "08006" } };
                  // Match and update happen together; EQ NULL intentionally never matches SQL NULL.
                  const matches = row && call.filters.every(([kind, column, value]) => kind === "is"
                    ? value === null && row![column] === null
                    : value !== null && row![column] === value);
                  if (!matches) return { data: null, error: null };
                  row = { ...row, ...structuredClone(patch) };
                  return { data: { id: row.id }, error: null };
                },
              };
            },
          };
          return builder;
        },
      };
    },
    rpc: unsupported,
  };
  return { client, calls, snapshot: () => structuredClone(row) };
}
const VERSION_ID = "22222222-2222-4222-8222-111111111111";
function dbRow(expected: ResourceVersionExpectation): Row {
  return { id: VERSION_ID, state: expected.state, reviewed_at: expected.reviewedAt,
    reviewed_by_admin: expected.reviewedByAdmin, review_reason: expected.reviewReason, sha256: "a".repeat(64) };
}

describe("activation hardening: conditional provider patches", () => {
  it.each([["null", INITIAL], ["populated", REVIEWED]] as const)("matches %s review fields and returns an updated ID", async (_label, expected) => {
    const provider = conditionalProvider(dbRow(expected));
    await createSupabaseResourceHubStore(() => provider.client).updateVersion(VERSION_ID, { usagePolicy: "training" }, expected);
    expect(provider.snapshot()).toEqual({ ...dbRow(expected), usage_policy: "training" });
    expect(provider.calls).toEqual([{
      table: RESOURCE_VERSIONS_TABLE, patch: { usage_policy: "training" }, columns: "id", statements: 1,
      filters: [["eq", "id", VERSION_ID], ["eq", "state", expected.state],
        [expected.reviewedAt === null ? "is" : "eq", "reviewed_at", expected.reviewedAt],
        [expected.reviewedByAdmin === null ? "is" : "eq", "reviewed_by_admin", expected.reviewedByAdmin],
        [expected.reviewReason === null ? "is" : "eq", "review_reason", expected.reviewReason]],
    }]);
  });

  it.each(CHANGED_SNAPSHOTS)("refuses a mismatched %s without any row change", async (_label, changed) => {
    const provider = conditionalProvider(dbRow(INITIAL));
    const before = provider.snapshot();
    await expect(createSupabaseResourceHubStore(() => provider.client).updateVersion(VERSION_ID, REVIEWED, { ...INITIAL, ...changed })).rejects.toBeInstanceOf(ResourceHubConflict);
    expect(provider.snapshot()).toEqual(before);
  });

  it("maps zero matching rows to a conflict", async () => {
    const provider = conditionalProvider(null);
    await expect(createSupabaseResourceHubStore(() => provider.client).updateVersion(VERSION_ID, REVIEWED, INITIAL)).rejects.toBeInstanceOf(ResourceHubConflict);
  });

  it("preserves an operational provider error instead of labelling it a conflict", async () => {
    const provider = conditionalProvider(dbRow(INITIAL), true);
    const result = await createSupabaseResourceHubStore(() => provider.client).updateVersion(VERSION_ID, REVIEWED, INITIAL).catch((error: unknown) => error);
    expect(isResourceHubConflict(result)).toBe(false);
    expect(String(result)).toContain("version update failed");
    expect(provider.snapshot()).toEqual(dbRow(INITIAL));
  });
});

describe("activation hardening: service outcomes", () => {
  it.each([["request_review", "draft"], ["approve_content", "draft"], ["approve_content", "in_review"]] as const)("maps a conditional %s conflict from %s to the existing denial", async (action, state) => {
    const h = await fixture();
    if (state === "in_review") await h.store.updateVersion(h.versionId, { state }, INITIAL);
    const before = h.store.snapshot();
    const patch = vi.fn<ResourceHubStore["updateVersion"]>(async () => { throw new ResourceHubConflict("fixture stale snapshot"); });
    const service = h.serviceFor({ ...h.store, updateVersion: patch });
    expect(await service.review("fixture-reviewer", h.resourceId, h.versionId, { action, reason: "Fixture reviewed.", idempotencyKey: "fixture-review-1" }))
      .toMatchObject({ ok: false, code: "resource_state_conflict" });
    expect(patch).toHaveBeenCalledWith(h.versionId, expect.objectContaining({ state: "in_review" }), expect.objectContaining({ ...INITIAL, state }));
    expect(h.store.snapshot()).toEqual(before);
  });

  it("preserves an operational review failure", async () => {
    const h = await fixture();
    const service = h.serviceFor({ ...h.store, updateVersion: async () => { throw new Error("fixture provider unavailable"); } });
    await expect(service.review("fixture-reviewer", h.resourceId, h.versionId, { action: "request_review", idempotencyKey: "fixture-review-2" })).rejects.toThrow("fixture provider unavailable");
  });

  it.each([
    ["matching file", {}, true],
    ["different SHA", { sha256: "b".repeat(64) }, false],
    ["different filename", { originalFilename: "other-guide.pdf" }, false],
  ] as const)("requires matching upload identity after a typed insert conflict: %s", async (_label, override, accepted) => {
    const h = await fixture();
    const winner = { ...(await h.store.getVersion(h.versionId))!, ...override };
    let lookups = 0;
    const service = h.serviceFor({
      ...h.store,
      findVersionByUploadKey: async () => ++lookups === 1 ? null : winner,
      insertVersion: async () => { throw new ResourceHubConflict("fixture duplicate upload key"); },
    });
    const result = await service.createVersion("fixture-admin", { ...INPUT, resourceId: h.resourceId }, { bytes: PDF, contentType: "application/pdf" });
    expect(result.ok).toBe(accepted);
    if (!accepted) expect(result).toMatchObject({ ok: false, code: "resource_state_conflict" });
    expect(h.store.snapshot().versions).toHaveLength(1);
    expect(h.store.snapshot().versions[0]!.sha256).toBe(sha256Hex(PDF));
    expect(h.store.snapshot().resources[0]!.currentPublishedVersionId).toBeNull();
  });

  it("preserves sequential replay, review provenance, atomic publication and withdrawal", async () => {
    const h = await fixture();
    expect(await h.service.createVersion("fixture-admin", INPUT, { bytes: PDF, contentType: "application/pdf" })).toMatchObject({ ok: true });
    expect(h.bytes.keys()).toHaveLength(1);
    expect(await h.service.review("fixture-reviewer", h.resourceId, h.versionId, { action: "request_review", idempotencyKey: "fixture-request-review" })).toMatchObject({ ok: true });
    expect(await h.store.getVersion(h.versionId)).toMatchObject({ ...INITIAL, state: "in_review" });
    const review = { action: "approve_content" as const, reason: "Fixture reviewed.", idempotencyKey: "fixture-review-3" };
    expect(await h.service.review("fixture-reviewer", h.resourceId, h.versionId, review)).toMatchObject({ ok: true });
    const approved = await h.store.getVersion(h.versionId);
    expect(await h.service.review("fixture-other-reviewer", h.resourceId, h.versionId, review)).toMatchObject({ ok: true });
    expect(await h.store.getVersion(h.versionId)).toEqual(approved);
    expect(await h.service.review("fixture-reviewer", h.resourceId, h.versionId, { action: "publish", idempotencyKey: "fixture-publish-1" })).toMatchObject({ ok: true });
    expect(await h.store.getResource(h.resourceId)).toMatchObject({ currentPublishedVersionId: h.versionId });
    expect(await h.service.review("fixture-reviewer", h.resourceId, h.versionId, { action: "withdraw", reason: "Fixture complete.", idempotencyKey: "fixture-withdraw-1" })).toMatchObject({ ok: true });
    expect(await h.store.getResource(h.resourceId)).toMatchObject({ currentPublishedVersionId: null });
    expect(await h.store.getVersion(h.versionId)).toMatchObject({ state: "withdrawn", reviewedAt: approved!.reviewedAt, reviewReason: approved!.reviewReason });
    expect(h.bytes.keys()).toHaveLength(1);
  });
});
