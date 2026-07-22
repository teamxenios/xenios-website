// xenios research: the member-facing Guide library.
//
// Saving, read tracking, topic requests, following, and anonymous demand.
//
// This module holds member-owned data and one aggregate that is shown back to
// members, so the privacy rules are structural rather than advisory:
//
//   1. Every read is scoped by the caller's own member id. There is no parameter
//      anywhere in this surface that lets one member read another member's
//      bookmarks, reads, or requests.
//   2. `demandFor` returns a count and nothing else. The follower rows never
//      reach the returned object, so no identity can survive serialization.
//   3. A member-visible listing of topic requests is aggregated by topic. The
//      requester id is stored, never projected.
//   4. Saving or following a Guide the member cannot view is allowed, because a
//      member may follow a coming-soon topic. This module therefore projects a
//      STATUS and never a body, claim, source, or excerpt.
//   5. `pendingNotifications` is the notification path's input and lives under
//      `internal`, off the member surface, so a route that spreads the member
//      library cannot expose follower ids by accident.
//
// No dosing may enter the system through free text, so a requested topic that
// carries a unit, a frequency, or a route of administration is refused.

import type { GuideSummaryDto } from "@shared/research/commerce-api";

export type GuideStatus = GuideSummaryDto["status"];

// ---------------------------------------------------------------------------
// Stored rows
// ---------------------------------------------------------------------------

export interface Bookmark {
  memberId: string;
  slug: string;
  savedAt: string;
}

export interface ReadReceipt {
  memberId: string;
  slug: string;
  readAt: string;
}

export interface GuideFollow {
  memberId: string;
  slug: string;
  followedAt: string;
}

export interface TopicRequest {
  id: string;
  memberId: string;
  topic: string;
  requestedAt: string;
}

// ---------------------------------------------------------------------------
// Member-visible shapes
// ---------------------------------------------------------------------------

/** Status only. A Guide body, claim, source, or excerpt is never a key here. */
export interface SavedGuideDto {
  slug: string;
  savedAt: string;
  status: GuideStatus | null;
}

export interface ReadGuideDto {
  slug: string;
  readAt: string;
  status: GuideStatus | null;
}

/** A member's own request. Returned only to the member who made it. */
export interface OwnTopicRequestDto {
  id: string;
  topic: string;
  requestedAt: string;
}

/** Anonymous demand for one Guide. A count, and deliberately nothing else. */
export interface GuideDemandDto {
  followerCount: number;
}

/** Anonymous demand for a requested topic. No requester identity. */
export interface TopicDemandDto {
  topic: string;
  requestCount: number;
}

export type TopicRequestDenialCode = "topic_invalid" | "topic_not_allowed";

export type TopicRequestResult =
  | { ok: true; request: OwnTopicRequestDto }
  | { ok: false; code: TopicRequestDenialCode };

// ---------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------

export interface LibraryRepository {
  saveBookmark(bookmark: Bookmark): Promise<void>;
  removeBookmark(memberId: string, slug: string): Promise<void>;
  listBookmarks(memberId: string): Promise<Bookmark[]>;
  recordRead(read: ReadReceipt): Promise<void>;
  listReads(memberId: string): Promise<ReadReceipt[]>;
  createRequest(request: TopicRequest): Promise<void>;
  listRequests(): Promise<TopicRequest[]>;
  addFollower(follow: GuideFollow): Promise<void>;
  removeFollower(memberId: string, slug: string): Promise<void>;
  countFollowers(slug: string): Promise<number>;
  /**
   * Member-scoped existence check, so an idempotent follow never has to read the
   * follower list. This is the only follower query a member-facing method may use.
   */
  hasFollower(memberId: string, slug: string): Promise<boolean>;
  /** Notification path only. Never called from a member-facing method. */
  listFollowers(slug: string): Promise<GuideFollow[]>;
}

/**
 * Resolves a Guide's publication status. It returns a status and no content, so
 * this module cannot leak an unpublished body even if a caller wanted it to.
 */
export type GuideStatusLookup = (slug: string) => Promise<GuideStatus | null>;

export interface MemberLibraryDeps {
  repository: LibraryRepository;
  guideStatus?: GuideStatusLookup;
  newId?: () => string;
}

export interface LibraryInternals {
  /**
   * Member ids to notify when a Guide publishes. Internal only: this is the one
   * place follower identity is readable, and it is not on the member surface.
   */
  pendingNotifications(slug: string): Promise<string[]>;
}

export interface MemberLibrary {
  save(memberId: string, slug: string, asOf: Date): Promise<SavedGuideDto | null>;
  unsave(memberId: string, slug: string): Promise<void>;
  listSaved(memberId: string): Promise<SavedGuideDto[]>;
  markRead(memberId: string, slug: string, asOf: Date): Promise<void>;
  listRead(memberId: string): Promise<ReadGuideDto[]>;
  requestTopic(memberId: string, topic: string, asOf: Date): Promise<TopicRequestResult>;
  listOwnRequests(memberId: string): Promise<OwnTopicRequestDto[]>;
  follow(memberId: string, slug: string, asOf: Date): Promise<void>;
  unfollow(memberId: string, slug: string): Promise<void>;
  demandFor(slug: string): Promise<GuideDemandDto>;
  topicDemand(): Promise<TopicDemandDto[]>;
  internal: LibraryInternals;
}

// ---------------------------------------------------------------------------
// Input rules
// ---------------------------------------------------------------------------

const MAX_TOPIC_LENGTH = 180;

/**
 * Free text that states a unit, a frequency, or a route of administration is
 * refused outright. The canon forbids dosing anywhere in this system, and a
 * requested topic is member-authored text that later becomes member-visible.
 */
const DOSING_PATTERNS: readonly RegExp[] = [
  // Units of measure, with or without a leading quantity.
  /\b\d+(\.\d+)?\s*(mg|mcg|ug|iu|ml|cc|grams?|g)\b/i,
  /\b(mg|mcg|iu|ml)\b/i,
  /\b(µg|mmol|meq|nanograms?|micrograms?|milligrams?)\b/i,
  // Countable administration units and dose forms.
  /\b\d+(\.\d+)?\s*(units?|tablets?|capsules?|softgels?|scoops?|drops?|sprays?|puffs?)\b/i,
  /\b(tablets?|capsules?|softgels?|lozenges?|suppositor(y|ies))\b/i,
  // The word itself.
  /\b(dose|doses|dosed|dosing|dosage|posology)\b/i,
  // Frequency.
  /\b(once|twice|thrice|three times|[0-9]+x)\s+(a\s+|per\s+)?(day|daily|week|weekly)\b/i,
  /\b\d+\s*(times|x)\s*(a\s+|per\s+)?(day|daily|week|weekly)\b/i,
  /\b(per\s+day|per\s+week|daily\s+intake)\b/i,
  /\b(every|each)\s+(\d+\s*)?(h|hr|hrs|hours?|days?|weeks?|morning|night|evening|other\s+day)\b/i,
  /\b(bid|tid|qid|qd|qhs|prn|q\d+h)\b/i,
  // Route of administration.
  /\b(inject|injects|injecting|injection|subcutaneous(ly)?|intramuscular(ly)?|sublingual(ly)?|intranasal(ly)?)\b/i,
  /\b(orally|topically|transdermal(ly)?|intravenous(ly)?|parenteral(ly)?|inhaled|inhalation|nebuli[sz]ed|buccal(ly)?|rectal(ly)?)\b/i,
  /\b(oral|nasal|rectal|buccal|topical|parenteral)\s+(route|routes|administration|delivery|dosing|dose)\b/i,
  /\broutes?\s+of\s+administration\b/i,
  // Administration instruction.
  /\b(titrate|titration|taper|tapering|loading\s+phase|loading\s+dose|stack\s+protocol|cycle\s+length|washout)\b/i,
  /\b(with\s+food|empty\s+stomach|before\s+bed(time)?|on\s+waking)\b/i,
];

function containsDosing(text: string): boolean {
  return DOSING_PATTERNS.some((pattern) => pattern.test(text));
}

function cleanId(value: string): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Collapses runs of whitespace so two spellings of one topic aggregate together. */
function normalizeTopic(topic: string): string {
  return cleanId(topic).replace(/\s+/g, " ");
}

function topicKey(topic: string): string {
  return topic.toLowerCase();
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createMemberLibrary(deps: MemberLibraryDeps): MemberLibrary {
  const repository = deps.repository;
  const lookupStatus = deps.guideStatus;
  const nextId = deps.newId ?? defaultId;

  async function statusOf(slug: string): Promise<GuideStatus | null> {
    if (!lookupStatus) return null;
    try {
      return await lookupStatus(slug);
    } catch {
      // A status lookup failure must not turn into a content leak or a throw on
      // a member's own library, so the entry renders with an unknown status.
      return null;
    }
  }

  async function save(memberId: string, slug: string, asOf: Date): Promise<SavedGuideDto | null> {
    const owner = cleanId(memberId);
    const target = cleanId(slug);
    if (!owner || !target) return null;

    const existing = await repository.listBookmarks(owner);
    const already = existing.filter((row) => row.slug === target)[0];
    if (already) {
      // Idempotent: a repeated save keeps the original savedAt and writes nothing.
      return { slug: target, savedAt: already.savedAt, status: await statusOf(target) };
    }

    const savedAt = asOf.toISOString();
    await repository.saveBookmark({ memberId: owner, slug: target, savedAt });
    return { slug: target, savedAt, status: await statusOf(target) };
  }

  async function unsave(memberId: string, slug: string): Promise<void> {
    const owner = cleanId(memberId);
    const target = cleanId(slug);
    if (!owner || !target) return;
    await repository.removeBookmark(owner, target);
  }

  async function listSaved(memberId: string): Promise<SavedGuideDto[]> {
    const owner = cleanId(memberId);
    if (!owner) return [];
    const rows = await repository.listBookmarks(owner);
    const mine = rows.filter((row) => row.memberId === owner);
    const out: SavedGuideDto[] = [];
    for (let i = 0; i < mine.length; i++) {
      const row = mine[i];
      out.push({ slug: row.slug, savedAt: row.savedAt, status: await statusOf(row.slug) });
    }
    return out;
  }

  async function markRead(memberId: string, slug: string, asOf: Date): Promise<void> {
    const owner = cleanId(memberId);
    const target = cleanId(slug);
    if (!owner || !target) return;
    await repository.recordRead({ memberId: owner, slug: target, readAt: asOf.toISOString() });
  }

  async function listRead(memberId: string): Promise<ReadGuideDto[]> {
    const owner = cleanId(memberId);
    if (!owner) return [];
    const rows = await repository.listReads(owner);
    const mine = rows.filter((row) => row.memberId === owner);
    const out: ReadGuideDto[] = [];
    for (let i = 0; i < mine.length; i++) {
      const row = mine[i];
      out.push({ slug: row.slug, readAt: row.readAt, status: await statusOf(row.slug) });
    }
    return out;
  }

  async function requestTopic(memberId: string, topic: string, asOf: Date): Promise<TopicRequestResult> {
    const owner = cleanId(memberId);
    const text = normalizeTopic(topic);
    if (!owner || text.length === 0 || text.length > MAX_TOPIC_LENGTH) {
      return { ok: false, code: "topic_invalid" };
    }
    if (containsDosing(text)) {
      return { ok: false, code: "topic_not_allowed" };
    }

    const request: TopicRequest = {
      id: nextId(),
      memberId: owner,
      topic: text,
      requestedAt: asOf.toISOString(),
    };
    await repository.createRequest(request);
    return { ok: true, request: { id: request.id, topic: request.topic, requestedAt: request.requestedAt } };
  }

  async function listOwnRequests(memberId: string): Promise<OwnTopicRequestDto[]> {
    const owner = cleanId(memberId);
    if (!owner) return [];
    const rows = await repository.listRequests();
    return rows
      .filter((row) => row.memberId === owner)
      .map((row) => ({ id: row.id, topic: row.topic, requestedAt: row.requestedAt }));
  }

  async function follow(memberId: string, slug: string, asOf: Date): Promise<void> {
    const owner = cleanId(memberId);
    const target = cleanId(slug);
    if (!owner || !target) return;
    // Scoped to the caller's own row. Reading the whole follower list here would put
    // every other member's id in scope inside a member-facing call.
    const already = await repository.hasFollower(owner, target);
    if (already) return;
    await repository.addFollower({ memberId: owner, slug: target, followedAt: asOf.toISOString() });
  }

  async function unfollow(memberId: string, slug: string): Promise<void> {
    const owner = cleanId(memberId);
    const target = cleanId(slug);
    if (!owner || !target) return;
    await repository.removeFollower(owner, target);
  }

  async function demandFor(slug: string): Promise<GuideDemandDto> {
    const target = cleanId(slug);
    if (!target) return { followerCount: 0 };
    const count = await repository.countFollowers(target);
    // Constructed explicitly. No follower row is in scope in this function, so
    // there is nothing for a serializer to reach.
    return { followerCount: Number.isFinite(count) && count > 0 ? Math.floor(count) : 0 };
  }

  async function topicDemand(): Promise<TopicDemandDto[]> {
    const rows = await repository.listRequests();
    const counts: Record<string, { topic: string; requestCount: number }> = {};
    rows.forEach((row) => {
      const text = normalizeTopic(row.topic);
      if (!text) return;
      const key = topicKey(text);
      const bucket = counts[key];
      if (bucket) {
        bucket.requestCount += 1;
        return;
      }
      counts[key] = { topic: text, requestCount: 1 };
    });
    return Object.keys(counts)
      .map((key) => ({ topic: counts[key].topic, requestCount: counts[key].requestCount }))
      .sort((a, b) => b.requestCount - a.requestCount || a.topic.localeCompare(b.topic));
  }

  async function pendingNotifications(slug: string): Promise<string[]> {
    const target = cleanId(slug);
    if (!target) return [];
    const followers = await repository.listFollowers(target);
    const seen: Record<string, true> = {};
    const ids: string[] = [];
    followers.forEach((row) => {
      const owner = cleanId(row.memberId);
      if (!owner || seen[owner]) return;
      seen[owner] = true;
      ids.push(owner);
    });
    return ids;
  }

  return {
    save,
    unsave,
    listSaved,
    markRead,
    listRead,
    requestTopic,
    listOwnRequests,
    follow,
    unfollow,
    demandFor,
    topicDemand,
    internal: { pendingNotifications },
  };
}

let idCounter = 0;
function defaultId(): string {
  idCounter += 1;
  return `req_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}
