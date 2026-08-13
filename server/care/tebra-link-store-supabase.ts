import type { TebraSyncCursor, TebraSyncEntity } from "@shared/care/tebra";
import type {
  TebraEntityLink,
  TebraLeaseRequest,
  TebraLinkRowGateway,
} from "./tebra-link-store";

/**
 * The durable implementation of the link store port, against the schema in
 * docs/care/tebra-deployment-packet/001_care_tebra_link_store.sql.
 *
 * Nothing constructs this. It is wired only once that migration is applied,
 * which is a human step, and the connector keeps using the in-memory store
 * until then.
 *
 * The client is injected rather than imported so this is exercised offline. A
 * structural type is used in place of the Supabase client type because this
 * needs exactly two methods, and depending on the full surface would make the
 * seam harder to fake than the thing it is faking.
 */

export interface TebraQueryResult<T> {
  data: T | null;
  error: unknown;
}

export interface TebraSupabaseClient {
  from(table: string): any;
  rpc(name: string, params: Record<string, unknown>): Promise<TebraQueryResult<unknown>>;
}

export const TEBRA_LINKS_TABLE = "care_tebra_links";
export const TEBRA_CURSORS_TABLE = "care_tebra_sync_cursors";
export const TEBRA_LEASES_TABLE = "care_tebra_sync_leases";
export const TEBRA_ACQUIRE_LEASE_RPC = "care_tebra_try_acquire_lease";

/**
 * Postgres error text quotes the offending row. For this table that row is a
 * mapping between a Xenios record and a chart in a practice system, so the
 * driver's message is treated exactly like an upstream SOAP fault: reduced to a
 * fixed code before it can reach a log or a caller.
 */
function refuse(): never {
  throw new Error("tebra_unavailable");
}

type LinkRow = {
  entity: string;
  local_id: string;
  external_id: string;
  tebra_id: string;
  linked_at: string;
  last_seen_at: string;
};

type CursorRow = {
  entity: string;
  from_modified_at: string;
  to_modified_at: string;
  continuation_token: string | null;
};

function toLink(row: LinkRow): TebraEntityLink {
  return {
    entity: row.entity as TebraSyncEntity,
    localId: String(row.local_id),
    externalId: String(row.external_id),
    tebraId: String(row.tebra_id),
    linkedAt: String(row.linked_at),
    lastSeenAt: String(row.last_seen_at),
  };
}

function toCursor(row: CursorRow): TebraSyncCursor {
  return {
    entity: row.entity as TebraSyncEntity,
    fromModifiedAt: String(row.from_modified_at),
    toModifiedAt: String(row.to_modified_at),
    continuationToken: row.continuation_token ?? null,
  };
}

export function buildSupabaseTebraLinkRowGateway(
  client: TebraSupabaseClient,
): TebraLinkRowGateway {
  async function selectLink(
    column: "local_id" | "external_id",
    entity: TebraSyncEntity,
    value: string,
  ): Promise<TebraEntityLink | null> {
    const { data, error } = (await client
      .from(TEBRA_LINKS_TABLE)
      .select("entity, local_id, external_id, tebra_id, linked_at, last_seen_at")
      .eq("entity", entity)
      .eq(column, value)
      .maybeSingle()) as TebraQueryResult<LinkRow>;
    if (error) refuse();
    return data ? toLink(data) : null;
  }

  return {
    selectLinkByLocalId: (entity, localId) => selectLink("local_id", entity, localId),
    selectLinkByExternalId: (entity, externalId) =>
      selectLink("external_id", entity, externalId),

    async upsertLink(link) {
      // Conflict target is the primary key, so a re-sync of the same record
      // updates its row rather than raising. The unique index on
      // (entity, external_id) still refuses a second row pointing at the same
      // chart, which is the case worth failing on.
      const { error } = (await client.from(TEBRA_LINKS_TABLE).upsert(
        {
          entity: link.entity,
          local_id: link.localId,
          external_id: link.externalId,
          tebra_id: link.tebraId,
          linked_at: link.linkedAt,
          last_seen_at: link.lastSeenAt,
        },
        { onConflict: "entity,local_id" },
      )) as TebraQueryResult<unknown>;
      if (error) refuse();
    },

    async selectCursor(entity) {
      const { data, error } = (await client
        .from(TEBRA_CURSORS_TABLE)
        .select("entity, from_modified_at, to_modified_at, continuation_token")
        .eq("entity", entity)
        .maybeSingle()) as TebraQueryResult<CursorRow>;
      if (error) refuse();
      return data ? toCursor(data) : null;
    },

    async upsertCursor(cursor) {
      const { error } = (await client.from(TEBRA_CURSORS_TABLE).upsert(
        {
          entity: cursor.entity,
          from_modified_at: cursor.fromModifiedAt,
          to_modified_at: cursor.toModifiedAt,
          continuation_token: cursor.continuationToken ?? null,
        },
        { onConflict: "entity" },
      )) as TebraQueryResult<unknown>;
      if (error) refuse();
    },

    /**
     * One round trip to the function, never a read then a write. Two racing
     * acquirers resolve under a single row lock inside the database; composing
     * this from a select and an update in application code is precisely how
     * both callers come to believe they hold the lease.
     */
    async tryAcquireLease(request: TebraLeaseRequest) {
      const { data, error } = await client.rpc(TEBRA_ACQUIRE_LEASE_RPC, {
        p_lease_key: request.leaseKey,
        p_owner: request.owner,
        p_expires_at: request.expiresAt,
        p_now: request.now,
      });
      if (error) refuse();
      // Anything other than an explicit true is treated as not held.
      return data === true;
    },

    async releaseLease({ leaseKey, owner }) {
      // Scoped to the owner, so a worker whose lease already expired and was
      // taken by someone else cannot delete the new holder's row on its way out.
      const { error } = (await client
        .from(TEBRA_LEASES_TABLE)
        .delete()
        .eq("lease_key", leaseKey)
        .eq("owner", owner)) as TebraQueryResult<unknown>;
      if (error) refuse();
    },
  };
}
