// Track B, commerce activation: persistent storage for the partners domain
// (partner records, attribution events, and organizations).
//
// The three partner-domain services are NOT changed here. Persistence is an async
// boundary layered beneath them, mirroring the member platform's Supabase pattern
// (getSupabaseAdmin().from(table)) and never inventing a second data system. Two
// exemplars set the shape this file follows exactly: cart-store.ts (pure mappers +
// in-memory double + injected-client Supabase impl + a resolver) and
// idempotency-store.ts (durability from a DB unique constraint, not an app check).
//
// What maps cleanly to the SHIPPED schema (supabase/production, migration 25) gets
// a full Supabase-backed store here:
//   - research_partner_links      <- StoredLink            (attribution links)
//   - research_attribution_touches <- AttributionTouch     (APPEND-ONLY facts)
// These two are precisely the "attribution events" of the partners domain, and a
// touch is a historical fact, so the touch store is insert + read only, with no
// update or delete path (the DB carries no update path for these rows either).
//
// What does NOT map cleanly to the shipped schema is given an async seam plus the
// existing in-memory reference and a documented, itemized deferral, because the
// canon forbids inventing business facts or dropping audited history to force a
// mapping. Concretely:
//   - Partner records: research_partners requires member_id (NOT NULL UNIQUE), a
//     field the current PartnerRecord model does not carry at all; and the shipped
//     lifecycle-event table is keyed by (from_state, to_state, actor_id NOT NULL)
//     while the domain PartnerLifecycleEvent is keyed by a typed `type` with a
//     nullable actorId. A faithful round trip is impossible without a schema and
//     domain reconciliation, so this store fails safe to the in-memory reference.
//   - Attribution conversions: research_attribution_conversions carries
//     (order_id, partner_id, subject_key, model) but not the AttributionRecord
//     provenance (channel, setByAdminId, overrideReason), so a stored record could
//     not be reconstructed on read. The append-only insert-if-absent winner is kept
//     in the in-memory reference and maps onto the UNIQUE(order_id) constraint once
//     those columns exist.
//   - Organizations: research_organizations carries (owner_partner_id, state) and
//     drops the domain `kind`, and representation is a separate join table, so a
//     faithful org mapping is deferred with the same discipline.
//
// Nothing here enables commerce. The stores are additive; production-deps still
// fails every stateful surface closed until a later wave wires the load-operate-
// save bridge behind the commerce flag.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AttributionChannel, AttributionTouch } from "@shared/research/distribution";
import {
  createInMemoryPartnerRepository,
  type PartnerRepository,
  type PartnerRecord,
} from "../../partners/partners";
import {
  createInMemoryAttributionRepository,
  type AttributionRecord,
  type AttributionRepository,
  type LinkChannel,
  type StoredLink,
} from "../../partners/attribution";
import {
  createInMemoryOrganizationRepository,
  type OrganizationRepository,
} from "../../partners/organizations";
import { getSupabaseAdmin, supabaseConfigured } from "../../../supabase";

// ---------------------------------------------------------------------------
// Channel guards. A persisted channel string is validated against the known set
// on the way out rather than cast, so a row written by some future path with an
// unexpected channel is dropped rather than silently trusted (the same "drop, do
// not guess" discipline cart-store applies to a malformed line).
// ---------------------------------------------------------------------------

const LINK_CHANNELS: readonly LinkChannel[] = [
  "signed_link",
  "code",
  "qr",
  "campaign",
  "organization",
  "event",
];

const ATTRIBUTION_CHANNELS: readonly AttributionChannel[] = [
  "signed_link",
  "code",
  "qr",
  "campaign",
  "organization",
  "event",
  "manual",
];

function asLinkChannel(value: string): LinkChannel | null {
  return (LINK_CHANNELS as readonly string[]).includes(value) ? (value as LinkChannel) : null;
}

function asAttributionChannel(value: string): AttributionChannel | null {
  return (ATTRIBUTION_CHANNELS as readonly string[]).includes(value)
    ? (value as AttributionChannel)
    : null;
}

// ===========================================================================
// Partner links (research_partner_links)
// ===========================================================================

const PARTNER_LINKS = "research_partner_links";

/** A research_partner_links row, only the columns a StoredLink needs. */
export interface PartnerLinkRow {
  partner_id: string;
  code: string;
  channel: string;
  campaign: string | null;
  created_at: string;
}

/**
 * Map a persisted link row to a StoredLink. Returns null when the channel is not
 * a value the domain issues, so a corrupt or foreign row is dropped rather than
 * surfaced as a link the partner never created.
 */
export function linkRowToStoredLink(row: PartnerLinkRow): StoredLink | null {
  const channel = asLinkChannel(row.channel);
  if (channel === null) return null;
  return {
    code: row.code,
    partnerId: row.partner_id,
    channel,
    campaign: row.campaign,
    issuedAt: row.created_at,
  };
}

/** Map a StoredLink to an insertable research_partner_links row. */
export function storedLinkToRow(link: StoredLink): PartnerLinkRow {
  return {
    partner_id: link.partnerId,
    code: link.code,
    channel: link.channel,
    campaign: link.campaign,
    created_at: link.issuedAt,
  };
}

/**
 * The async storage seam for partner links, and THE seam the attribution service
 * will adopt: AttributionRepository (../../partners/attribution) is still
 * synchronous, so the partner modules declare no async repository of their own.
 * This interface is that missing declaration, kept here (like the payout port in
 * commissions-store and the idempotency port in idempotency-store) until the
 * async seam conversion moves it onto the service. Method naming follows the
 * sync seam's verbs (saveLink/findLinkByCode/listLinks) so the adoption is a
 * mechanical `async` conversion, not a rename.
 * A link is insert + read only: there is no update or delete path.
 */
export interface AsyncPartnerLinkStore {
  /** Insert a newly issued link. A duplicate code throws DuplicatePartnerLinkCode. */
  saveLink(link: StoredLink): Promise<void>;
  findLinkByCode(code: string): Promise<StoredLink | null>;
  listLinks(partnerId: string): Promise<StoredLink[]>;
}

/**
 * Raised when a link code is saved twice. The code is the attribution identity
 * of the link, and research_partner_links keeps it UNIQUE, so a second save is
 * REJECTED rather than overwritten: an overwrite could silently re-point an
 * existing code at a different partner, which is an attribution integrity hole.
 */
export class DuplicatePartnerLinkCode extends Error {
  constructor(code: string) {
    super(`Partner link code ${code} already exists; a link is never overwritten.`);
    this.name = "DuplicatePartnerLinkCode";
  }
}

export function createInMemoryPartnerLinkStore(): AsyncPartnerLinkStore {
  const byCode = new Map<string, StoredLink>();
  const byPartner = new Map<string, StoredLink[]>();
  const clone = (link: StoredLink): StoredLink => ({ ...link });
  return {
    async saveLink(link) {
      // Never an overwrite: the DB keeps code UNIQUE, so the reference rejects a
      // duplicate identically. (The audit found the earlier version re-pointing
      // byCode while the old partner's byPartner list kept the stale link, so
      // one code could appear under two partners. Rejection closes that gap.)
      if (byCode.has(link.code)) throw new DuplicatePartnerLinkCode(link.code);
      const stored = clone(link);
      byCode.set(stored.code, stored);
      const existing = byPartner.get(stored.partnerId) ?? [];
      existing.push(stored);
      byPartner.set(stored.partnerId, existing);
    },
    async findLinkByCode(code) {
      const link = byCode.get(code);
      return link ? clone(link) : null;
    },
    async listLinks(partnerId) {
      return (byPartner.get(partnerId) ?? []).map(clone);
    },
  };
}

// PostgREST unique-violation code, surfaced when a link code is inserted twice.
const UNIQUE_VIOLATION = "23505";

/**
 * Supabase-backed link store. Reads are scoped by the partner id the caller
 * passes and never by any ambient identity, so one partner's links can never be
 * read under another's id.
 */
export function createSupabasePartnerLinkStore(
  client: SupabaseClient = getSupabaseAdmin(),
): AsyncPartnerLinkStore {
  return {
    async saveLink(link) {
      const ins = await client.from(PARTNER_LINKS).insert(storedLinkToRow(link));
      if (ins.error) {
        // The UNIQUE constraint on code is the guarantee; surface it as the same
        // typed error the in-memory reference raises.
        if (ins.error.code === UNIQUE_VIOLATION) throw new DuplicatePartnerLinkCode(link.code);
        throw new Error(`partner link insert failed: ${ins.error.message}`);
      }
    },

    async findLinkByCode(code) {
      const found = await client
        .from(PARTNER_LINKS)
        .select("partner_id, code, channel, campaign, created_at")
        .eq("code", code)
        .maybeSingle();
      if (found.error) throw new Error(`partner link load failed: ${found.error.message}`);
      if (!found.data) return null;
      return linkRowToStoredLink(found.data as PartnerLinkRow);
    },

    async listLinks(partnerId) {
      const rows = await client
        .from(PARTNER_LINKS)
        .select("partner_id, code, channel, campaign, created_at")
        .eq("partner_id", partnerId)
        .order("created_at", { ascending: true });
      if (rows.error) throw new Error(`partner links list failed: ${rows.error.message}`);
      const links: StoredLink[] = [];
      for (const row of (rows.data ?? []) as PartnerLinkRow[]) {
        const link = linkRowToStoredLink(row);
        if (link) links.push(link);
      }
      return links;
    },
  };
}

export function resolvePartnerLinkStore(): AsyncPartnerLinkStore {
  return supabaseConfigured() ? createSupabasePartnerLinkStore() : createInMemoryPartnerLinkStore();
}

// ===========================================================================
// Attribution touches (research_attribution_touches) - APPEND-ONLY
// ===========================================================================

const ATTRIBUTION_TOUCHES = "research_attribution_touches";

/** A research_attribution_touches row, only the columns a touch needs. */
export interface AttributionTouchRow {
  subject_key: string;
  partner_id: string;
  channel: string;
  set_by_admin_id: string | null;
  occurred_at: string;
}

/**
 * Map a persisted touch row to an AttributionTouch. Returns null for an unknown
 * channel so a foreign row cannot masquerade as a touch. `setByAdminId` is only
 * present when the row actually names an admin, matching the optional field.
 */
export function touchRowToAttributionTouch(row: AttributionTouchRow): AttributionTouch | null {
  const channel = asAttributionChannel(row.channel);
  if (channel === null) return null;
  const touch: AttributionTouch = {
    partnerId: row.partner_id,
    channel,
    occurredAt: row.occurred_at,
  };
  if (row.set_by_admin_id !== null && row.set_by_admin_id !== undefined) {
    touch.setByAdminId = row.set_by_admin_id;
  }
  return touch;
}

/** Map a subject key and touch to an insertable research_attribution_touches row. */
export function attributionTouchToRow(subjectKey: string, touch: AttributionTouch): AttributionTouchRow {
  return {
    subject_key: subjectKey,
    partner_id: touch.partnerId,
    channel: touch.channel,
    set_by_admin_id: touch.setByAdminId ?? null,
    occurred_at: touch.occurredAt,
  };
}

/**
 * The async storage seam for attribution touches, and THE seam the attribution
 * service will adopt when its synchronous repository goes async (the partner
 * modules declare no async repository of their own, so the declaration lives
 * here, mirroring the payout port in commissions-store). Verbs follow the sync
 * seam (appendTouch/touchesFor) so adoption is mechanical.
 * A touch is a historical fact: this interface exposes insert (appendTouch) and
 * read (touchesFor) only, and carries no update or delete method, so the store
 * itself cannot rewrite history. The shipped table has no update path for these
 * rows either, so the invariant is enforced in two places, not one.
 */
export interface AsyncAttributionTouchStore {
  appendTouch(subjectKey: string, touch: AttributionTouch): Promise<void>;
  touchesFor(subjectKey: string): Promise<AttributionTouch[]>;
}

export function createInMemoryAttributionTouchStore(): AsyncAttributionTouchStore {
  const bySubject = new Map<string, AttributionTouch[]>();
  const clone = (touch: AttributionTouch): AttributionTouch => ({ ...touch });
  return {
    async appendTouch(subjectKey, touch) {
      const existing = bySubject.get(subjectKey) ?? [];
      existing.push(clone(touch));
      bySubject.set(subjectKey, existing);
    },
    async touchesFor(subjectKey) {
      return (bySubject.get(subjectKey) ?? []).map(clone);
    },
  };
}

/**
 * Supabase-backed touch store. Reads are scoped by the subject key the caller
 * passes, so touches for one visitor are never read under another's key, and the
 * result is ordered by occurrence so the attribution resolver sees a stable
 * sequence. Insert + read only: no update or delete, because a touch is a fact.
 */
export function createSupabaseAttributionTouchStore(
  client: SupabaseClient = getSupabaseAdmin(),
): AsyncAttributionTouchStore {
  return {
    async appendTouch(subjectKey, touch) {
      const ins = await client
        .from(ATTRIBUTION_TOUCHES)
        .insert(attributionTouchToRow(subjectKey, touch));
      if (ins.error) throw new Error(`attribution touch insert failed: ${ins.error.message}`);
    },

    async touchesFor(subjectKey) {
      const rows = await client
        .from(ATTRIBUTION_TOUCHES)
        .select("subject_key, partner_id, channel, set_by_admin_id, occurred_at")
        .eq("subject_key", subjectKey)
        .order("occurred_at", { ascending: true });
      if (rows.error) throw new Error(`attribution touches load failed: ${rows.error.message}`);
      const touches: AttributionTouch[] = [];
      for (const row of (rows.data ?? []) as AttributionTouchRow[]) {
        const touch = touchRowToAttributionTouch(row);
        if (touch) touches.push(touch);
      }
      return touches;
    },
  };
}

export function resolveAttributionTouchStore(): AsyncAttributionTouchStore {
  return supabaseConfigured()
    ? createSupabaseAttributionTouchStore()
    : createInMemoryAttributionTouchStore();
}

// ===========================================================================
// Attribution conversions (the winner per order) - APPEND-ONLY, seam only
// ===========================================================================

/**
 * The async storage seam for the resolved winner of one order, and THE seam the
 * attribution service will adopt for conversions when its synchronous repository
 * goes async (declared here because the partner modules declare no async
 * repository of their own; same pattern as the two seams above). It exposes the
 * append-only pair only: putAttributionIfAbsent (insert the first winner, return
 * the existing one on a retry or race) and getAttribution (read). There is
 * deliberately no update or delete here; the admin-override path
 * (replaceAttribution on the sync service seam) is a privileged operation that a
 * later wave models separately, so this store cannot rewrite a settled winner.
 *
 * SUPABASE DEFERRED: research_attribution_conversions stores
 * (order_id, partner_id, subject_key, model, converted_at) and does NOT carry the
 * AttributionRecord provenance fields (channel, setByAdminId, overrideReason), so
 * a persisted record could not be reconstructed on read without inventing them.
 * The in-memory reference below keeps the insert-if-absent semantics, which map
 * directly onto the UNIQUE(order_id) constraint (as idempotency-store maps onto
 * UNIQUE(scope, key)) once the schema carries those columns.
 */
export interface AsyncAttributionConversionStore {
  putAttributionIfAbsent(record: AttributionRecord): Promise<AttributionRecord>;
  getAttribution(orderId: string): Promise<AttributionRecord | null>;
}

export function createInMemoryAttributionConversionStore(): AsyncAttributionConversionStore {
  const byOrder = new Map<string, AttributionRecord>();
  const clone = (record: AttributionRecord): AttributionRecord => ({ ...record });
  return {
    async putAttributionIfAbsent(record) {
      const existing = byOrder.get(record.orderId);
      if (existing) return clone(existing);
      byOrder.set(record.orderId, clone(record));
      return clone(record);
    },
    async getAttribution(orderId) {
      const record = byOrder.get(orderId);
      return record ? clone(record) : null;
    },
  };
}

export function resolveAttributionConversionStore(): AsyncAttributionConversionStore {
  // No Supabase branch on purpose: the shipped schema cannot round-trip an
  // AttributionRecord (see the interface note), so this fails safe to the
  // in-memory reference rather than persist a lossy row.
  return createInMemoryAttributionConversionStore();
}

// ===========================================================================
// Partner records and organizations - resolvers with a documented deferral
// ===========================================================================

/**
 * PartnerRepository is already async, so the store IS the interface. The Supabase
 * branch is deferred (not stubbed): research_partners requires a member_id the
 * PartnerRecord model does not carry, and the lifecycle-event table shape diverges
 * from the typed PartnerLifecycleEvent, so a faithful mapping needs a schema and
 * domain reconciliation. Until then this fails safe to the in-memory reference,
 * which keeps the service's behavior identical and leaves commerce failing closed.
 */
export function resolvePartnerRepository(seed: readonly PartnerRecord[] = []): PartnerRepository {
  return createInMemoryPartnerRepository(seed);
}

/**
 * The attribution service seam as a whole (links + touches + conversions) is still
 * synchronous. The two attribution-event stores above are its clean-mapping halves;
 * this returns the existing in-memory AttributionRepository for callers that still
 * want the whole synchronous seam while the async migration lands piece by piece.
 */
export function resolveInMemoryAttributionRepository(): AttributionRepository {
  return createInMemoryAttributionRepository();
}

/**
 * Organizations: research_organizations drops the domain `kind` and adds an
 * owner_partner_id and state the domain does not model, with representation in a
 * separate join table, so a faithful Supabase mapping is deferred with the same
 * discipline as partner records. This returns the existing in-memory reference so
 * behavior is unchanged until the schema and domain are reconciled.
 */
export function resolveOrganizationRepository(): OrganizationRepository {
  return createInMemoryOrganizationRepository();
}
