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
        select(_columns) {
          const filters: Array<[string, unknown]> = [];
          const current = () => row && filters.every(([column, value]) => row![column] === value) ? structuredClone(row) : null;
          const builder = {
            eq(column: string, value: unknown) { filters.push([column, value]); return builder; },
            order() { return builder; },
            async maybeSingle() { return { data: current(), error: null }; },
            then<T>(onfulfilled: (value: { data: Row[] | null; error: null }) => T) {
              const found = current();
              return Promise.resolve(onfulfilled({ data: found ? [found] : [], error: null }));
            },
          };
          return builder;
        },
        insert: unsupported,
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
  return { client, calls, snapshot: () => structuredClone(row), replace: (next: Row) => { row = structuredClone(next); } };
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

describe("activation hardening: provider read to conditional patch", () => {
  it.each([
    ["null", null],
    ["milliseconds", "2026-09-08T00:00:00.123Z"],
    ["PostgreSQL microseconds", "2026-09-08T00:00:00.123456+00:00"],
  ] as const)("preserves %s review timestamp through getVersion and updateVersion", async (_label, timestamp) => {
    const provider = conditionalProvider({ ...dbRow({ ...REVIEWED, reviewedAt: timestamp }), uploaded_at: "2026-09-08T00:00:00+00:00" });
    const store = createSupabaseResourceHubStore(() => provider.client);
    const observed = (await store.getVersion(VERSION_ID))!;
    // Use the actual adapter read as the expected snapshot, never a hand-built expectation.
    await store.updateVersion(VERSION_ID, { usagePolicy: "training" }, observed);
    expect(observed.reviewedAt).toBe(timestamp);
    expect(observed.uploadedAt).toBe("2026-09-08T00:00:00.000Z");
    expect(provider.calls[0]!.filters).toContainEqual([timestamp === null ? "is" : "eq", "reviewed_at", timestamp]);
    expect(provider.snapshot()).toMatchObject({ reviewed_at: timestamp, usage_policy: "training" });
  });

  it("refuses a stale read differing by one microsecond and preserves the current row", async () => {
    const provider = conditionalProvider(dbRow({ ...REVIEWED, reviewedAt: "2026-09-08T00:00:00.123456+00:00" }));
    const store = createSupabaseResourceHubStore(() => provider.client);
    const observed = (await store.getVersion(VERSION_ID))!;
    provider.replace({ ...provider.snapshot()!, reviewed_at: "2026-09-08T00:00:00.123457+00:00" });
    const current = provider.snapshot();
    await expect(store.updateVersion(VERSION_ID, { usagePolicy: "training" }, observed)).rejects.toBeInstanceOf(ResourceHubConflict);
    expect(provider.snapshot()).toEqual(current);
  });

  it("preserves an operational update error after a successful provider read", async () => {
    const provider = conditionalProvider(dbRow({ ...REVIEWED, reviewedAt: "2026-09-08T00:00:00.123456+00:00" }), true);
    const store = createSupabaseResourceHubStore(() => provider.client);
    const observed = (await store.getVersion(VERSION_ID))!;
    const current = provider.snapshot();
    const result = await store.updateVersion(VERSION_ID, { usagePolicy: "training" }, observed).catch((error: unknown) => error);
    expect(isResourceHubConflict(result)).toBe(false);
    expect(String(result)).toContain("version update failed");
    expect(provider.snapshot()).toEqual(current);
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
    if (result.ok) expect(result.resource.resourceId).toBe(winner.resourceId);
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
    const requested = h.store.snapshot();
    expect(await h.service.review("fixture-reviewer", h.resourceId, h.versionId, { action: "request_review", idempotencyKey: "fixture-request-review" })).toMatchObject({ ok: true });
    expect(h.store.snapshot()).toEqual(requested);
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

  it("returns the matching winner while accounting for a private object and zero-version resource", async () => {
    const h = await fixture();
    const winner = (await h.store.getVersion(h.versionId))!;
    const before = h.store.snapshot();
    let lookups = 0;
    const service = h.serviceFor({
      ...h.store,
      findVersionByUploadKey: async () => ++lookups === 1 ? null : winner,
      insertVersion: async () => { throw new ResourceHubConflict("fixture duplicate upload key"); },
    });
    const result = await service.createVersion("fixture-admin", INPUT, { bytes: PDF, contentType: "application/pdf" });
    expect(result).toMatchObject({ ok: true, resource: { resourceId: h.resourceId } });
    if (!result.ok) throw new Error("expected matching fixture replay");
    expect(result.resource.versions).toHaveLength(1);
    expect(result.resource.versions[0]).toMatchObject({ versionId: h.versionId, sha256: winner.sha256 });

    // Preserve-only behavior: the object and new resource precede the version insert.
    const after = h.store.snapshot();
    expect(after.versions).toEqual(before.versions);
    expect(await h.store.getResource(h.resourceId)).toEqual(before.resources[0]);
    expect(after.resources).toHaveLength(before.resources.length + 1);
    const residual = after.resources.find((resource) => resource.resourceId !== h.resourceId)!;
    expect(residual.currentPublishedVersionId).toBeNull();
    expect(after.versions.some((version) => version.resourceId === residual.resourceId)).toBe(false);
    const keys = h.bytes.keys();
    expect(keys).toHaveLength(2);
    const residualKey = keys.find((key) => key.startsWith(`resource-library/${residual.resourceId}/`))!;
    expect(residualKey).toBeDefined();
    expect(after.versions.some((version) => version.storageKey === residualKey)).toBe(false);
    const emptyAdminResource = await h.service.getAdmin(residual.resourceId);
    expect(emptyAdminResource).toMatchObject({ resourceId: residual.resourceId, currentPublishedVersionId: null, versions: [] });
    expect(await h.service.listAdmin()).toContainEqual(emptyAdminResource);
    expect(await h.service.libraryFor({ role: "research_rep", state: "active" })).toEqual([]);
  });

  it("preserves winner bytes through normal publication after a rejected different-file conflict", async () => {
    const h = await fixture();
    const winner = (await h.store.getVersion(h.versionId))!;
    const before = h.store.snapshot();
    const otherPdf = Buffer.from(PDF.toString("latin1").replace("trailer", "% harmless fixture variant\ntrailer"), "latin1");
    expect(sha256Hex(otherPdf)).not.toBe(winner.sha256);
    let lookups = 0;
    const service = h.serviceFor({
      ...h.store,
      findVersionByUploadKey: async () => ++lookups === 1 ? null : winner,
      insertVersion: async () => { throw new ResourceHubConflict("fixture duplicate upload key"); },
    });
    expect(await service.createVersion("fixture-admin", INPUT, { bytes: otherPdf, contentType: "application/pdf" }))
      .toMatchObject({ ok: false, code: "resource_state_conflict" });
    expect(h.store.snapshot().versions).toEqual(before.versions);
    expect(await h.store.getResource(h.resourceId)).toEqual(before.resources[0]);
    const residual = h.store.snapshot().resources.find((resource) => resource.resourceId !== h.resourceId)!;
    expect(residual).toMatchObject({ currentPublishedVersionId: null });
    expect(h.bytes.keys()).toHaveLength(2);

    expect(await h.service.review("fixture-reviewer", h.resourceId, h.versionId, { action: "approve_content", reason: "Fixture reviewed.", idempotencyKey: "fixture-preserved-approval" }))
      .toMatchObject({ ok: true });
    expect(await h.service.review("fixture-reviewer", h.resourceId, h.versionId, { action: "publish", idempotencyKey: "fixture-preserved-publication" }))
      .toMatchObject({ ok: true, resource: { currentPublishedVersionId: h.versionId } });
    const delivery = await h.service.deliverToPartner({ memberId: "fixture-partner", role: "research_rep", state: "active" }, h.resourceId);
    expect(delivery.ok).toBe(true);
    if (!delivery.ok) throw new Error("expected original fixture delivery");
    expect(sha256Hex(delivery.bytes)).toBe(sha256Hex(PDF));
    expect(await h.store.getVersion(h.versionId)).toMatchObject({ sha256: winner.sha256, originalFilename: winner.originalFilename, state: "published" });
    expect(await h.service.getAdmin(residual.resourceId)).toMatchObject({ currentPublishedVersionId: null, versions: [] });
    expect(h.bytes.keys()).toHaveLength(2);
  });

  it("preserves the first review decision when service approval uses an older snapshot", async () => {
    const h = await fixture();
    await h.service.review("fixture-reviewer", h.resourceId, h.versionId, { action: "request_review", idempotencyKey: "fixture-first-request" });
    const older = (await h.store.getVersion(h.versionId))!;
    await h.service.review("fixture-first-reviewer", h.resourceId, h.versionId, { action: "approve_content", reason: "First fixture decision.", idempotencyKey: "fixture-first-approval" });
    const current = h.store.snapshot();
    const staleReader = h.serviceFor({ ...h.store, getVersion: async () => older });
    expect(await staleReader.review("fixture-later-reviewer", h.resourceId, h.versionId, { action: "approve_content", reason: "Later fixture decision.", idempotencyKey: "fixture-later-approval" }))
      .toMatchObject({ ok: false, code: "resource_state_conflict" });
    expect(h.store.snapshot()).toEqual(current);
    expect(await h.store.getVersion(h.versionId)).toMatchObject({ reviewedByAdmin: "fixture-first-reviewer", reviewReason: "First fixture decision." });
  });

  it("keeps a published resource visible when service review uses an older draft snapshot", async () => {
    const h = await fixture();
    const older = (await h.store.getVersion(h.versionId))!;
    await h.service.review("fixture-reviewer", h.resourceId, h.versionId, { action: "approve_content", reason: "Fixture reviewed.", idempotencyKey: "fixture-review-before-publish" });
    await h.service.review("fixture-reviewer", h.resourceId, h.versionId, { action: "publish", idempotencyKey: "fixture-current-publish" });
    const current = h.store.snapshot();
    const audience = { role: "research_rep" as const, state: "active" as const };
    const library = await h.service.libraryFor(audience);
    const staleReader = h.serviceFor({ ...h.store, getVersion: async () => older });
    expect(await staleReader.review("fixture-reviewer", h.resourceId, h.versionId, { action: "request_review", idempotencyKey: "fixture-late-request" }))
      .toMatchObject({ ok: false, code: "resource_state_conflict" });
    expect(h.store.snapshot()).toEqual(current);
    expect(await h.service.libraryFor(audience)).toEqual(library);
    expect(library).toHaveLength(1);
    expect(library[0]!.resourceId).toBe(h.resourceId);
  });
});
