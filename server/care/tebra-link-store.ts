import {
  isTebraOpaqueId,
  tebraExternalId,
  type TebraSyncCursor,
  type TebraSyncEntity,
} from "@shared/care/tebra";

/**
 * The mapping between a Xenios Care record and its counterpart inside Tebra,
 * plus the polling cursors and the run lease.
 *
 * A link row is a routing decision. If it were ever wrong, work for one patient
 * would land on another patient chart, so every read is checked against the
 * deterministic external id before it is trusted.
 */
export interface TebraEntityLink {
  entity: TebraSyncEntity;
  localId: string;
  externalId: string;
  tebraId: string;
  linkedAt: string;
  lastSeenAt: string;
}

export interface TebraLeaseRequest {
  leaseKey: string;
  owner: string;
  expiresAt: string;
  now: string;
}

export interface TebraLinkStore {
  findByLocalId(entity: TebraSyncEntity, localId: string): Promise<TebraEntityLink | null>;
  findByExternalId(entity: TebraSyncEntity, externalId: string): Promise<TebraEntityLink | null>;
  saveLink(link: TebraEntityLink): Promise<void>;
  loadCursor(entity: TebraSyncEntity): Promise<TebraSyncCursor | null>;
  saveCursor(cursor: TebraSyncCursor): Promise<void>;
  acquireLease(request: TebraLeaseRequest): Promise<boolean>;
  releaseLease(input: { leaseKey: string; owner: string }): Promise<void>;
}

/**
 * A link is only usable if its external id is exactly the one the connector
 * would derive today. That makes a tampered or stale mapping row inert instead
 * of authoritative.
 */
export function isConsistentTebraLink(link: TebraEntityLink): boolean {
  if (!isTebraOpaqueId(link.localId) || !isTebraOpaqueId(link.tebraId)) return false;
  try {
    return link.externalId === tebraExternalId(link.entity, link.localId);
  } catch {
    return false;
  }
}

function assertConsistent(link: TebraEntityLink): TebraEntityLink {
  if (!isConsistentTebraLink(link)) throw new Error("tebra_conflict");
  return link;
}

/**
 * In-process store for tests and for a single-node dry run. Leases held here do
 * not coordinate across processes, so production must use the persistent store.
 */
export function createMemoryTebraLinkStore(): TebraLinkStore {
  const links = new Map<string, TebraEntityLink>();
  const externalIndex = new Map<string, string>();
  const cursors = new Map<TebraSyncEntity, TebraSyncCursor>();
  const leases = new Map<string, { owner: string; expiresAt: string }>();
  const localKey = (entity: TebraSyncEntity, localId: string) => `${entity}:${localId}`;
  const externalKey = (entity: TebraSyncEntity, externalId: string) => `${entity}:${externalId}`;

  return {
    async findByLocalId(entity, localId) {
      const link = links.get(localKey(entity, localId));
      return link && isConsistentTebraLink(link) ? link : null;
    },
    async findByExternalId(entity, externalId) {
      const localId = externalIndex.get(externalKey(entity, externalId));
      if (!localId) return null;
      const link = links.get(localKey(entity, localId));
      return link && isConsistentTebraLink(link) ? link : null;
    },
    async saveLink(link) {
      assertConsistent(link);
      links.set(localKey(link.entity, link.localId), link);
      externalIndex.set(externalKey(link.entity, link.externalId), link.localId);
    },
    async loadCursor(entity) {
      return cursors.get(entity) ?? null;
    },
    async saveCursor(cursor) {
      cursors.set(cursor.entity, cursor);
    },
    async acquireLease(request) {
      const held = leases.get(request.leaseKey);
      const stillHeld = held !== undefined && Date.parse(held.expiresAt) > Date.parse(request.now);
      if (stillHeld && held.owner !== request.owner) return false;
      leases.set(request.leaseKey, { owner: request.owner, expiresAt: request.expiresAt });
      return true;
    },
    async releaseLease(input) {
      if (leases.get(input.leaseKey)?.owner === input.owner) leases.delete(input.leaseKey);
    },
  };
}

/**
 * The durable port. Each method maps to one statement so the lease stays a
 * single atomic database operation rather than a read then write in app code,
 * which two workers could interleave. The required tables and the exact
 * conditional update are specified in docs/care/TEBRA_CONNECTOR.md; they are an
 * integration dependency of this lane, not something it migrates.
 */
export interface TebraLinkRowGateway {
  selectLinkByLocalId(entity: TebraSyncEntity, localId: string): Promise<TebraEntityLink | null>;
  selectLinkByExternalId(
    entity: TebraSyncEntity,
    externalId: string,
  ): Promise<TebraEntityLink | null>;
  upsertLink(link: TebraEntityLink): Promise<void>;
  selectCursor(entity: TebraSyncEntity): Promise<TebraSyncCursor | null>;
  upsertCursor(cursor: TebraSyncCursor): Promise<void>;
  tryAcquireLease(request: TebraLeaseRequest): Promise<boolean>;
  releaseLease(input: { leaseKey: string; owner: string }): Promise<void>;
}

export function createPersistentTebraLinkStore(gateway: TebraLinkRowGateway): TebraLinkStore {
  return {
    async findByLocalId(entity, localId) {
      const link = await gateway.selectLinkByLocalId(entity, localId);
      return link && isConsistentTebraLink(link) ? link : null;
    },
    async findByExternalId(entity, externalId) {
      const link = await gateway.selectLinkByExternalId(entity, externalId);
      return link && isConsistentTebraLink(link) ? link : null;
    },
    async saveLink(link) {
      await gateway.upsertLink(assertConsistent(link));
    },
    loadCursor: (entity) => gateway.selectCursor(entity),
    saveCursor: (cursor) => gateway.upsertCursor(cursor),
    acquireLease: (request) => gateway.tryAcquireLease(request),
    releaseLease: (input) => gateway.releaseLease(input),
  };
}
