import type { ResourceAudience, ResourceUsagePolicy, ResourceVersionState } from "@shared/research/resource-hub/contract";
import {
  ResourceHubConflict,
  restrictVersionPatch,
  type PublishedResource,
  type ResourceDeliveryRow,
  type ResourceHubStore,
  type ResourceRow,
  type ResourceVersionRow,
} from "./store";

// ---------------------------------------------------------------------------
// Production store over the candidate migration
// supabase/candidates/20260906120000_research_resource_library.sql.
// Every read is a service-role query; every failure THROWS (never an empty
// lie), except a unique-constraint race, which is a typed conflict. The two
// multi-row transitions (publish, withdraw) are SQL functions so they commit
// atomically. No row from here is serialized to a partner: the service builds
// partner shapes by explicit construction.
// ---------------------------------------------------------------------------

export const RESOURCE_LIBRARY_TABLE = "research_resource_library";
export const RESOURCE_VERSIONS_TABLE = "research_resource_versions";
export const RESOURCE_DELIVERIES_TABLE = "research_resource_deliveries";
export const RESOURCE_PUBLISH_FUNCTION = "research_resource_hub_publish";
export const RESOURCE_WITHDRAW_FUNCTION = "research_resource_hub_withdraw";
/** Postgres unique_violation. */
const UNIQUE_VIOLATION = "23505";

type Row = Record<string, unknown>;
type ProviderError = { message: string; code?: string } | null;

/** The tiny slice of the Supabase client this store uses; injected for tests. */
export interface SupabaseQueryLike {
  from(table: string): {
    select(columns: string): SelectBuilder;
    insert(row: Row): Promise<{ error: ProviderError }>;
    update(patch: Row): { eq(column: string, value: unknown): Promise<{ error: ProviderError }> };
  };
  rpc(fn: string, args: Row): Promise<{ error: ProviderError }>;
}

/**
 * The DDL keys every table on a uuid primary key, so an id that is not a
 * canonical uuid cannot name a row. Answering "not found" without a query
 * keeps such ids indistinguishable from unknown uuids (no 503 oracle from a
 * Postgres cast error) and keeps garbage off the wire.
 */
const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
export function isCanonicalUuid(value: string): boolean {
  return CANONICAL_UUID.test(value);
}
interface SelectBuilder {
  eq(column: string, value: unknown): SelectBuilder;
  order(column: string, options: { ascending: boolean }): SelectBuilder;
  maybeSingle(): Promise<{ data: Row | null; error: ProviderError }>;
  then<T>(onfulfilled: (value: { data: Row[] | null; error: ProviderError }) => T): Promise<T>;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
function nullableText(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
function iso(value: unknown): string {
  return typeof value === "string" ? new Date(value).toISOString() : "";
}
function nullableIso(value: unknown): string | null {
  return typeof value === "string" ? new Date(value).toISOString() : null;
}
function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function toResource(row: Row): ResourceRow {
  return {
    resourceId: text(row.id),
    title: text(row.title),
    purpose: text(row.purpose),
    kind: "pdf",
    createdAt: iso(row.created_at),
    createdByAdmin: text(row.created_by_admin),
    currentPublishedVersionId: nullableText(row.current_published_version_id),
  };
}

function toVersion(row: Row): ResourceVersionRow {
  return {
    versionId: text(row.id),
    resourceId: text(row.resource_id),
    versionNumber: Number(row.version_number),
    state: text(row.state) as ResourceVersionState,
    usagePolicy: text(row.usage_policy) as ResourceUsagePolicy,
    audience: strings(row.audience) as ResourceAudience[],
    sizeBytes: Number(row.size_bytes),
    sha256: text(row.sha256),
    originalFilename: text(row.original_filename),
    contentType: "application/pdf",
    storageKey: text(row.storage_key),
    validationOk: row.validation_ok === true,
    validationReasons: strings(row.validation_reasons),
    uploadedAt: iso(row.uploaded_at),
    uploadedByAdmin: text(row.uploaded_by_admin),
    reviewedAt: nullableIso(row.reviewed_at),
    reviewedByAdmin: nullableText(row.reviewed_by_admin),
    reviewReason: nullableText(row.review_reason),
    publishedAt: nullableIso(row.published_at),
    publishedByAdmin: nullableText(row.published_by_admin),
    withdrawnAt: nullableIso(row.withdrawn_at),
    withdrawnByAdmin: nullableText(row.withdrawn_by_admin),
    withdrawReason: nullableText(row.withdraw_reason),
    supersedesVersionId: nullableText(row.supersedes_version_id),
    changeSummary: nullableText(row.change_summary),
    uploadIdempotencyKey: text(row.upload_idempotency_key),
  };
}

function fromVersionPatch(raw: Partial<ResourceVersionRow>): Row {
  const patch = restrictVersionPatch(raw);
  const out: Row = {};
  if (patch.state !== undefined) out.state = patch.state;
  if (patch.usagePolicy !== undefined) out.usage_policy = patch.usagePolicy;
  if (patch.audience !== undefined) out.audience = [...patch.audience];
  if (patch.reviewedAt !== undefined) out.reviewed_at = patch.reviewedAt;
  if (patch.reviewedByAdmin !== undefined) out.reviewed_by_admin = patch.reviewedByAdmin;
  if (patch.reviewReason !== undefined) out.review_reason = patch.reviewReason;
  if (patch.publishedAt !== undefined) out.published_at = patch.publishedAt;
  if (patch.publishedByAdmin !== undefined) out.published_by_admin = patch.publishedByAdmin;
  if (patch.withdrawnAt !== undefined) out.withdrawn_at = patch.withdrawnAt;
  if (patch.withdrawnByAdmin !== undefined) out.withdrawn_by_admin = patch.withdrawnByAdmin;
  if (patch.withdrawReason !== undefined) out.withdraw_reason = patch.withdrawReason;
  if (patch.changeSummary !== undefined) out.change_summary = patch.changeSummary;
  // storageKey, sha256, sizeBytes, resourceId, versionNumber are deliberately
  // not mappable: the database trigger refuses them too.
  return out;
}

const VERSION_COLUMNS =
  "id, resource_id, version_number, state, usage_policy, audience, size_bytes, sha256, original_filename, content_type, storage_key, validation_ok, validation_reasons, uploaded_at, uploaded_by_admin, reviewed_at, reviewed_by_admin, review_reason, published_at, published_by_admin, withdrawn_at, withdrawn_by_admin, withdraw_reason, supersedes_version_id, change_summary, upload_idempotency_key";
const RESOURCE_COLUMNS = "id, title, purpose, kind, created_at, created_by_admin, current_published_version_id";

export function createSupabaseResourceHubStore(client: () => SupabaseQueryLike): ResourceHubStore {
  const fail = (what: string, error: ProviderError) => new Error(`resource hub ${what} failed: ${error?.message ?? "unknown"}`);
  return {
    async getResource(resourceId) {
      if (!isCanonicalUuid(resourceId)) return null;
      const result = await client().from(RESOURCE_LIBRARY_TABLE).select(RESOURCE_COLUMNS).eq("id", resourceId).maybeSingle();
      if (result.error) throw fail("resource read", result.error);
      return result.data ? toResource(result.data) : null;
    },
    async listResources() {
      const result = await client().from(RESOURCE_LIBRARY_TABLE).select(RESOURCE_COLUMNS).order("created_at", { ascending: true });
      if (result.error) throw fail("resource list", result.error);
      return (result.data ?? []).map(toResource);
    },
    async insertResource(row) {
      const result = await client().from(RESOURCE_LIBRARY_TABLE).insert({
        id: row.resourceId,
        title: row.title,
        purpose: row.purpose,
        kind: row.kind,
        created_at: row.createdAt,
        created_by_admin: row.createdByAdmin,
        current_published_version_id: row.currentPublishedVersionId,
      });
      if (result.error) throw fail("resource insert", result.error);
    },
    async listVersions(resourceId) {
      if (!isCanonicalUuid(resourceId)) return [];
      const result = await client().from(RESOURCE_VERSIONS_TABLE).select(VERSION_COLUMNS).eq("resource_id", resourceId).order("version_number", { ascending: true });
      if (result.error) throw fail("version list", result.error);
      return (result.data ?? []).map(toVersion);
    },
    async getVersion(versionId) {
      if (!isCanonicalUuid(versionId)) return null;
      const result = await client().from(RESOURCE_VERSIONS_TABLE).select(VERSION_COLUMNS).eq("id", versionId).maybeSingle();
      if (result.error) throw fail("version read", result.error);
      return result.data ? toVersion(result.data) : null;
    },
    async findVersionByUploadKey(idempotencyKey) {
      const result = await client().from(RESOURCE_VERSIONS_TABLE).select(VERSION_COLUMNS).eq("upload_idempotency_key", idempotencyKey).maybeSingle();
      if (result.error) throw fail("version lookup", result.error);
      return result.data ? toVersion(result.data) : null;
    },
    async insertVersion(row) {
      const result = await client().from(RESOURCE_VERSIONS_TABLE).insert({
        id: row.versionId,
        resource_id: row.resourceId,
        version_number: row.versionNumber,
        state: row.state,
        usage_policy: row.usagePolicy,
        audience: [...row.audience],
        size_bytes: row.sizeBytes,
        sha256: row.sha256,
        original_filename: row.originalFilename,
        content_type: row.contentType,
        storage_key: row.storageKey,
        validation_ok: row.validationOk,
        validation_reasons: [...row.validationReasons],
        uploaded_at: row.uploadedAt,
        uploaded_by_admin: row.uploadedByAdmin,
        supersedes_version_id: row.supersedesVersionId,
        change_summary: row.changeSummary,
        upload_idempotency_key: row.uploadIdempotencyKey,
      });
      if (result.error) {
        if (result.error.code === UNIQUE_VIOLATION) throw new ResourceHubConflict(`version insert conflict: ${result.error.message}`);
        throw fail("version insert", result.error);
      }
    },
    async updateVersion(versionId, patch) {
      const result = await client().from(RESOURCE_VERSIONS_TABLE).update(fromVersionPatch(patch)).eq("id", versionId);
      if (result.error) throw fail("version update", result.error);
    },
    async publishVersion({ resourceId, versionId, actorAdmin, at }) {
      const result = await client().rpc(RESOURCE_PUBLISH_FUNCTION, {
        p_resource_id: resourceId,
        p_version_id: versionId,
        p_actor: actorAdmin,
        p_at: at,
      });
      if (result.error) throw fail("publish transition", result.error);
    },
    async withdrawVersion({ resourceId, versionId, actorAdmin, at, reason }) {
      const result = await client().rpc(RESOURCE_WITHDRAW_FUNCTION, {
        p_resource_id: resourceId,
        p_version_id: versionId,
        p_actor: actorAdmin,
        p_at: at,
        p_reason: reason,
      });
      if (result.error) throw fail("withdraw transition", result.error);
    },
    async listPublished() {
      const versions = await client().from(RESOURCE_VERSIONS_TABLE).select(VERSION_COLUMNS).eq("state", "published").order("published_at", { ascending: false });
      if (versions.error) throw fail("published list", versions.error);
      const out: PublishedResource[] = [];
      for (const raw of versions.data ?? []) {
        const version = toVersion(raw);
        const resourceResult = await client().from(RESOURCE_LIBRARY_TABLE).select(RESOURCE_COLUMNS).eq("id", version.resourceId).maybeSingle();
        if (resourceResult.error) throw fail("resource read", resourceResult.error);
        if (!resourceResult.data) continue;
        const resource = toResource(resourceResult.data);
        if (resource.currentPublishedVersionId !== version.versionId) continue;
        out.push({ resource, version });
      }
      return out;
    },
    async recordDelivery(row) {
      const result = await client().from(RESOURCE_DELIVERIES_TABLE).insert({
        id: row.deliveryId,
        resource_id: row.resourceId,
        version_id: row.versionId,
        member_id: row.memberId,
        requested_at: row.requestedAt,
        outcome: row.outcome,
        reason: row.reason,
      });
      if (result.error) throw fail("delivery record", result.error);
    },
    async listDeliveries(resourceId) {
      if (!isCanonicalUuid(resourceId)) return [];
      const result = await client().from(RESOURCE_DELIVERIES_TABLE).select("id, resource_id, version_id, member_id, requested_at, outcome, reason").eq("resource_id", resourceId).order("requested_at", { ascending: false });
      if (result.error) throw fail("delivery list", result.error);
      return (result.data ?? []).map((row): ResourceDeliveryRow => ({
        deliveryId: text(row.id),
        resourceId: text(row.resource_id),
        versionId: nullableText(row.version_id),
        memberId: text(row.member_id),
        requestedAt: iso(row.requested_at),
        outcome: text(row.outcome) as ResourceDeliveryRow["outcome"],
        reason: nullableText(row.reason),
      }));
    },
  };
}
