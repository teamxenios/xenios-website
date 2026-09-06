import type {
  ResourceAudience,
  ResourceKind,
  ResourceUsagePolicy,
  ResourceVersionState,
} from "@shared/research/resource-hub/contract";

// ---------------------------------------------------------------------------
// The Resource Hub's data port: Xenios-published materials, their immutable
// versions, and the delivery ledger. Nothing here serializes to a partner; the
// service builds partner-visible shapes by explicit construction.
// ---------------------------------------------------------------------------

export interface ResourceRow {
  resourceId: string;
  title: string;
  purpose: string;
  kind: ResourceKind;
  createdAt: string;
  /** Admin actor as authenticated by the canonical admin guard; never shown to partners. */
  createdByAdmin: string;
  currentPublishedVersionId: string | null;
}

export interface ResourceVersionRow {
  versionId: string;
  resourceId: string;
  versionNumber: number;
  state: ResourceVersionState;
  usagePolicy: ResourceUsagePolicy;
  audience: readonly ResourceAudience[];
  sizeBytes: number;
  sha256: string;
  originalFilename: string;
  contentType: "application/pdf";
  /** Object key inside the private bucket. NEVER serialized outside the server. */
  storageKey: string;
  validationOk: boolean;
  validationReasons: readonly string[];
  uploadedAt: string;
  uploadedByAdmin: string;
  reviewedAt: string | null;
  reviewedByAdmin: string | null;
  reviewReason: string | null;
  publishedAt: string | null;
  publishedByAdmin: string | null;
  withdrawnAt: string | null;
  withdrawnByAdmin: string | null;
  withdrawReason: string | null;
  supersedesVersionId: string | null;
  changeSummary: string | null;
  uploadIdempotencyKey: string;
}

export type ResourceDeliveryOutcome = "delivered" | "denied" | "failed";

export interface ResourceDeliveryRow {
  deliveryId: string;
  resourceId: string;
  versionId: string | null;
  memberId: string;
  requestedAt: string;
  outcome: ResourceDeliveryOutcome;
  /** Machine reason for denied/failed; never a customer-facing sentence. */
  reason: string | null;
}

export interface PublishedResource {
  resource: ResourceRow;
  version: ResourceVersionRow;
}

/**
 * The only version fields a patch may change after insert. Both stores apply
 * exactly this list, so a patch behaves identically in memory and in Postgres
 * (whose immutability trigger refuses the bytes identity anyway).
 */
export const MUTABLE_VERSION_FIELDS = [
  "state",
  "usagePolicy",
  "audience",
  "reviewedAt",
  "reviewedByAdmin",
  "reviewReason",
  "publishedAt",
  "publishedByAdmin",
  "withdrawnAt",
  "withdrawnByAdmin",
  "withdrawReason",
  "changeSummary",
] as const satisfies readonly (keyof ResourceVersionRow)[];
export type MutableVersionField = (typeof MUTABLE_VERSION_FIELDS)[number];
export type ResourceVersionPatch = Partial<Pick<ResourceVersionRow, MutableVersionField>>;

export function restrictVersionPatch(patch: Partial<ResourceVersionRow>): ResourceVersionPatch {
  const out: Record<string, unknown> = {};
  for (const field of MUTABLE_VERSION_FIELDS) if (patch[field] !== undefined) out[field] = patch[field];
  return out as ResourceVersionPatch;
}

/** A write that lost a race (duplicate version number, duplicate upload key). Never a 503. */
export class ResourceHubConflict extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResourceHubConflict";
  }
}
export function isResourceHubConflict(error: unknown): boolean {
  return error instanceof Error && error.name === "ResourceHubConflict";
}

export interface PublishVersionInput {
  resourceId: string;
  versionId: string;
  actorAdmin: string;
  at: string;
}
export interface WithdrawVersionInput extends PublishVersionInput {
  reason: string;
}

export interface ResourceHubStore {
  getResource(resourceId: string): Promise<ResourceRow | null>;
  listResources(): Promise<readonly ResourceRow[]>;
  insertResource(row: ResourceRow): Promise<void>;
  listVersions(resourceId: string): Promise<readonly ResourceVersionRow[]>;
  getVersion(versionId: string): Promise<ResourceVersionRow | null>;
  findVersionByUploadKey(idempotencyKey: string): Promise<ResourceVersionRow | null>;
  /** Throws ResourceHubConflict when a unique constraint (version number, upload key) is hit. */
  insertVersion(row: ResourceVersionRow): Promise<void>;
  updateVersion(versionId: string, patch: ResourceVersionPatch): Promise<void>;
  /**
   * ONE atomic transition: the version becomes published and current, and the
   * previously current version (if any other) becomes superseded. A store must
   * either apply all of it or none of it.
   */
  publishVersion(input: PublishVersionInput): Promise<void>;
  /** ONE atomic transition: the version becomes withdrawn; if it was current, the pointer clears. */
  withdrawVersion(input: WithdrawVersionInput): Promise<void>;
  /** Every resource whose current published version exists, with that version. */
  listPublished(): Promise<readonly PublishedResource[]>;
  recordDelivery(row: ResourceDeliveryRow): Promise<void>;
  listDeliveries(resourceId: string): Promise<readonly ResourceDeliveryRow[]>;
}

/** Process-local store for tests and non-production previews. Deterministic and bounded. */
export function createInMemoryResourceHubStore(): ResourceHubStore & {
  snapshot(): { resources: ResourceRow[]; versions: ResourceVersionRow[]; deliveries: ResourceDeliveryRow[] };
} {
  const resources = new Map<string, ResourceRow>();
  const versions = new Map<string, ResourceVersionRow>();
  const deliveries: ResourceDeliveryRow[] = [];
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
  return {
    async getResource(resourceId) {
      const row = resources.get(resourceId);
      return row ? clone(row) : null;
    },
    async listResources() {
      return [...resources.values()].map(clone).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async insertResource(row) {
      if (resources.has(row.resourceId)) throw new Error("duplicate resource id");
      resources.set(row.resourceId, clone(row));
    },
    async listVersions(resourceId) {
      return [...versions.values()]
        .filter((v) => v.resourceId === resourceId)
        .map(clone)
        .sort((a, b) => a.versionNumber - b.versionNumber);
    },
    async getVersion(versionId) {
      const row = versions.get(versionId);
      return row ? clone(row) : null;
    },
    async findVersionByUploadKey(idempotencyKey) {
      for (const v of versions.values()) if (v.uploadIdempotencyKey === idempotencyKey) return clone(v);
      return null;
    },
    async insertVersion(row) {
      if (versions.has(row.versionId)) throw new Error("duplicate version id");
      for (const v of versions.values()) {
        if (v.resourceId === row.resourceId && v.versionNumber === row.versionNumber) {
          throw new ResourceHubConflict("a version with this number already exists");
        }
        if (v.uploadIdempotencyKey === row.uploadIdempotencyKey) throw new ResourceHubConflict("upload key already used");
      }
      versions.set(row.versionId, clone(row));
    },
    async updateVersion(versionId, patch) {
      const row = versions.get(versionId);
      if (!row) throw new Error("unknown version");
      // Bytes and identity are immutable: only the shared mutable field list applies.
      versions.set(versionId, clone({ ...row, ...restrictVersionPatch(patch) }));
    },
    async publishVersion({ resourceId, versionId, actorAdmin, at }) {
      const resource = resources.get(resourceId);
      const version = versions.get(versionId);
      if (!resource || !version || version.resourceId !== resourceId) throw new Error("unknown resource version");
      const previous = resource.currentPublishedVersionId;
      // All three effects land together; nothing is observable in between.
      versions.set(versionId, clone({ ...version, state: "published", publishedAt: version.publishedAt ?? at, publishedByAdmin: version.publishedByAdmin ?? actorAdmin }));
      resources.set(resourceId, { ...resource, currentPublishedVersionId: versionId });
      if (previous && previous !== versionId) {
        const prior = versions.get(previous);
        if (prior && prior.state === "published") versions.set(previous, clone({ ...prior, state: "superseded" }));
      }
    },
    async withdrawVersion({ resourceId, versionId, actorAdmin, at, reason }) {
      const resource = resources.get(resourceId);
      const version = versions.get(versionId);
      if (!resource || !version || version.resourceId !== resourceId) throw new Error("unknown resource version");
      versions.set(versionId, clone({ ...version, state: "withdrawn", withdrawnAt: at, withdrawnByAdmin: actorAdmin, withdrawReason: reason }));
      if (resource.currentPublishedVersionId === versionId) resources.set(resourceId, { ...resource, currentPublishedVersionId: null });
    },
    async listPublished() {
      const out: PublishedResource[] = [];
      for (const resource of resources.values()) {
        if (!resource.currentPublishedVersionId) continue;
        const version = versions.get(resource.currentPublishedVersionId);
        if (!version || version.state !== "published") continue;
        out.push({ resource: clone(resource), version: clone(version) });
      }
      return out.sort((a, b) => (b.version.publishedAt ?? "").localeCompare(a.version.publishedAt ?? ""));
    },
    async recordDelivery(row) {
      deliveries.push(clone(row));
    },
    async listDeliveries(resourceId) {
      return deliveries.filter((d) => d.resourceId === resourceId).map(clone);
    },
    snapshot() {
      return { resources: [...resources.values()].map(clone), versions: [...versions.values()].map(clone), deliveries: deliveries.map(clone) };
    },
  };
}
