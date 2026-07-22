// xenios research: the Guide runtime.
//
// This module owns four things: append-only revision history, the review record,
// the publication gate, and the member read path.
//
// The publication gate is the reason this file exists. `publish` accepts a
// `FounderReviewerId`, which is a branded string with no public constructor other
// than `namedHumanReviewer(id, "human")`. The second parameter of that function is
// the literal type "human", so an automated caller holding an `AuthorKind` cannot
// satisfy it without first narrowing to the human branch by hand. There is no
// overload, no default, and no system reviewer constant. The runtime gate is a
// second line, not the only line.
//
// Members read the PUBLISHED revision, never the current draft. A revision added
// after publication is invisible until it is itself reviewed and published, so an
// in-flight edit cannot leak through the read path.

import type { GuideDetailDto, GuideSummaryDto } from "@shared/research/commerce-api";

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

/** Who wrote a draft or revision. Automated authorship is allowed. Publication is not. */
export type AuthorKind = "human" | "automated";

/**
 * The five states a Guide can hold.
 *
 * There is deliberately no "withdrawn" state: withdrawal returns a Guide to
 * `in_review`, which is already the state that denies members the body. A sixth
 * state would have to be flattened for the wire DTO anyway, and flattening is where
 * a leak hides.
 */
export type GuideStatus = GuideSummaryDto["status"];

/**
 * Claim grades. A grade belongs to a single claim, never to a Guide or a product.
 * There is no aggregate grade field anywhere in this module by design.
 */
export type ClaimGrade = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "PROHIBITED";

export const CLAIM_GRADE_LABELS: Readonly<Record<ClaimGrade, string>> = {
  A: "Established",
  B: "Supported Human",
  C: "Early Human",
  D: "Preclinical",
  E: "Supplier Reported",
  F: "Traditional",
  G: "Unverified",
  PROHIBITED: "Prohibited",
};

/** A grade that is never serialized to a member, on any Guide, in any state. */
const MEMBER_HIDDEN_GRADES: readonly ClaimGrade[] = ["PROHIBITED"];

export type SourceKind =
  | "peer_reviewed"
  | "clinical_trial"
  | "regulatory"
  | "preclinical"
  | "supplier"
  | "retailer"
  | "vendor"
  | "traditional"
  | "other";

/**
 * A retailer, vendor, supplier, or manufacturer page is commerce, not evidence. None
 * of them can carry a claim past E.
 */
const NON_EVIDENTIARY_SOURCE_KINDS: readonly SourceKind[] = ["retailer", "vendor", "supplier"];
const HUMAN_EVIDENCE_GRADES: readonly ClaimGrade[] = ["A", "B", "C"];

/**
 * The only source kinds that count as human evidence. A, B, and C require at least
 * one of these, so a strong grade cannot rest on preclinical work, tradition, an
 * unclassified page, or nothing at all.
 */
const HUMAN_EVIDENCE_SOURCE_KINDS: readonly SourceKind[] = [
  "peer_reviewed",
  "clinical_trial",
  "regulatory",
];

/** Strength ordering. Lower is stronger. PROHIBITED sits at the bottom deliberately. */
const GRADE_RANK: Readonly<Record<ClaimGrade, number>> = {
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  E: 5,
  F: 6,
  G: 7,
  PROHIBITED: 8,
};

/**
 * The strongest grade a single source of this kind can support.
 *
 * An unrecognized kind caps at G, so adding a source kind without deciding its
 * ceiling degrades safely instead of silently permitting an A.
 */
function maxGradeForSourceKind(kind: SourceKind): ClaimGrade {
  switch (kind) {
    case "peer_reviewed":
    case "regulatory":
      return "A";
    case "clinical_trial":
      return "B";
    case "preclinical":
      return "D";
    case "supplier":
    case "retailer":
    case "vendor":
      return "E";
    case "traditional":
      return "F";
    case "other":
      return "G";
    default:
      return "G";
  }
}

export interface GuideSection {
  heading: string;
  body: string;
}

export interface GuideClaim {
  id: string;
  text: string;
  grade: ClaimGrade;
  sourceIds: readonly string[];
}

export interface GuideSource {
  id: string;
  kind: SourceKind;
  citation: string;
  url: string | null;
  verified: boolean;
}

export interface GuideRevision {
  slug: string;
  revision: number;
  createdAt: string;
  authorKind: AuthorKind;
  sections: readonly GuideSection[];
  claims: readonly GuideClaim[];
  sources: readonly GuideSource[];
}

export type ReviewerRole =
  | "scientific"
  | "regulatory"
  | "medical_safety"
  | "editorial"
  | "founder";

/**
 * All five roles must approve the exact revision being published.
 *
 * Assumption recorded here because the specification names the count, not the set.
 */
export const REQUIRED_REVIEW_ROLES: readonly ReviewerRole[] = [
  "scientific",
  "regulatory",
  "medical_safety",
  "editorial",
  "founder",
];

export type ReviewDecision = "approved" | "changes_requested" | "rejected";

export interface GuideReview {
  slug: string;
  revision: number;
  role: ReviewerRole;
  reviewerId: string;
  decision: ReviewDecision;
  notes: string;
  at: string;
}

export type CorrectionKind = "correction" | "withdrawal";

/** History entries are appended. Nothing in this module deletes or rewrites one. */
export interface GuideCorrection {
  at: string;
  kind: CorrectionKind;
  note: string;
  by: string;
  /**
   * The revision that was live when this entry was written, carried here because
   * `withdraw` clears the live pointer. Without it the record of what a member could
   * once read would be destroyed rather than superseded.
   */
  revision: number | null;
  /** The publication timestamp this entry supersedes, for the same reason. */
  previouslyPublishedAt: string | null;
}

export interface GuideRecord {
  slug: string;
  title: string;
  status: GuideStatus;
  createdAt: string;
  authorKind: AuthorKind;
  /** The newest revision number, published or not. Zero means no content yet. */
  currentRevision: number;
  /** The revision members actually read. Null until a founder publishes one. */
  publishedRevision: number | null;
  publishedAt: string | null;
  lastPublishedBy: string | null;
  relatedProductSkus: readonly string[];
  correctionHistory: readonly GuideCorrection[];
}

// ---------------------------------------------------------------------------
// The publication capability
// ---------------------------------------------------------------------------

declare const FOUNDER_REVIEWER_BRAND: unique symbol;

/**
 * Proof that a named human is publishing.
 *
 * The brand is unforgeable from outside this module without calling
 * `namedHumanReviewer`, and that function cannot be called with an `AuthorKind`
 * variable. This is the type-system half of rule one.
 */
export type FounderReviewerId = string & { readonly [FOUNDER_REVIEWER_BRAND]: true };

/**
 * Mint the publication capability.
 *
 * `kind` is the literal "human". A caller holding `AuthorKind` gets a compile error,
 * which is the point: an automated actor cannot reach `publish` at all.
 */
export function namedHumanReviewer(reviewerId: string, kind: "human"): FounderReviewerId {
  const trimmed = reviewerId.trim();
  if (kind !== "human" || trimmed === "") {
    throw new Error("a publication capability requires a named human reviewer id");
  }
  return trimmed as FounderReviewerId;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export type GuideDenialCode =
  | "guide_not_found"
  | "guide_exists"
  | "guide_has_no_revision"
  | "guide_not_in_review"
  | "revision_not_found"
  | "review_incomplete"
  | "reviewer_mismatch"
  | "claim_grade_unsupported"
  | "guide_not_published";

export type GuideResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: GuideDenialCode; message: string; missingRoles?: ReviewerRole[] };

export type PublishGate =
  | { ok: true }
  | { ok: false; code: GuideDenialCode; message: string; missingRoles: ReviewerRole[] };

export type MemberGuideResult =
  | GuideDetailDto
  | { denied: "guide_not_published" }
  | null;

export interface AdminGuideView {
  guide: GuideRecord;
  revisions: GuideRevision[];
  reviews: GuideReview[];
}

// ---------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------

export interface GuideRepository {
  get(slug: string): GuideRecord | null;
  save(guide: GuideRecord): void;
  list(): GuideRecord[];
  listRevisions(slug: string): GuideRevision[];
  saveRevision(revision: GuideRevision): void;
  saveReview(review: GuideReview): void;
  listReviews(slug: string, revision: number): GuideReview[];
}

export interface GuideServiceDeps {
  repository: GuideRepository;
}

export interface GuideService {
  createDraft(
    slug: string,
    title: string,
    authorKind: AuthorKind,
    asOf: Date,
  ): GuideResult<GuideRecord>;
  addRevision(
    slug: string,
    sections: readonly GuideSection[],
    claims: readonly GuideClaim[],
    sources: readonly GuideSource[],
    authorKind: AuthorKind,
    asOf: Date,
  ): GuideResult<GuideRevision>;
  submitForReview(slug: string, asOf: Date): GuideResult<GuideRecord>;
  recordReview(
    slug: string,
    revision: number,
    role: ReviewerRole,
    reviewerId: string,
    decision: ReviewDecision,
    notes: string,
    asOf: Date,
  ): GuideResult<GuideReview>;
  canPublish(slug: string): PublishGate;
  publish(
    slug: string,
    founderReviewerId: FounderReviewerId,
    asOf: Date,
  ): GuideResult<GuideRecord>;
  withdraw(
    slug: string,
    reviewerId: FounderReviewerId,
    reason: string,
    asOf: Date,
  ): GuideResult<GuideRecord>;
  recordCorrection(
    slug: string,
    reviewerId: FounderReviewerId,
    note: string,
    asOf: Date,
  ): GuideResult<GuideRecord>;
  listForMember(): GuideSummaryDto[];
  getForMember(slug: string): MemberGuideResult;
  adminGet(slug: string): AdminGuideView | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stamp(asOf: Date): string {
  return asOf.toISOString();
}

function deny<T>(
  code: GuideDenialCode,
  message: string,
  missingRoles?: ReviewerRole[],
): GuideResult<T> {
  return missingRoles === undefined
    ? { ok: false, code, message }
    : { ok: false, code, message, missingRoles };
}

function isPublicStatus(status: GuideStatus): boolean {
  return status === "published" || status === "updated";
}

function findRevision(
  revisions: readonly GuideRevision[],
  revision: number,
): GuideRevision | null {
  for (let i = 0; i < revisions.length; i += 1) {
    if (revisions[i].revision === revision) return revisions[i];
  }
  return null;
}

/**
 * Rule four, enforced where a revision enters the system.
 *
 * Three things are checked, and a claim fails if any one of them fails:
 *
 *   1. A, B, and C require at least one human-evidence source. A claim with no
 *      resolvable source at all therefore cannot hold a human-evidence grade.
 *   2. A commercial page cannot prop up a human-evidence grade even when it sits
 *      beside a real one.
 *   3. No claim may outrank the strongest ceiling among the sources it cites, so a
 *      preclinical-only or tradition-only claim cannot be graded above its evidence.
 *
 * PROHIBITED is exempt from the ceiling test because it is blocked by its own rule
 * rather than by strength. The check runs over every claim, not the first failure,
 * so an editor sees the whole problem at once.
 */
function unsupportedGradeClaims(
  claims: readonly GuideClaim[],
  sources: readonly GuideSource[],
): string[] {
  const offenders: string[] = [];
  claims.forEach((claim) => {
    if (claim.grade === "PROHIBITED") return;

    const cited: GuideSource[] = [];
    claim.sourceIds.forEach((sourceId) => {
      const source = sources.find((candidate) => candidate.id === sourceId);
      if (source !== undefined) cited.push(source);
    });

    if (HUMAN_EVIDENCE_GRADES.indexOf(claim.grade) !== -1) {
      const hasHuman = cited.some(
        (source) => HUMAN_EVIDENCE_SOURCE_KINDS.indexOf(source.kind) !== -1,
      );
      if (!hasHuman) {
        offenders.push(claim.id);
        return;
      }
      const leaning = cited.some(
        (source) => NON_EVIDENTIARY_SOURCE_KINDS.indexOf(source.kind) !== -1,
      );
      if (leaning) {
        offenders.push(claim.id);
        return;
      }
    }

    let ceiling: ClaimGrade = "G";
    cited.forEach((source) => {
      const cap = maxGradeForSourceKind(source.kind);
      if (GRADE_RANK[cap] < GRADE_RANK[ceiling]) ceiling = cap;
    });
    if (GRADE_RANK[claim.grade] < GRADE_RANK[ceiling]) offenders.push(claim.id);
  });
  return offenders;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export function createGuideService(deps: GuideServiceDeps): GuideService {
  const { repository } = deps;

  /**
   * Separation of duties.
   *
   * Five roles are five people. A reviewer id that appears under more than one role
   * on the same revision counts for NONE of them, so a single actor cannot satisfy
   * the publication gate by signing the whole ladder itself and then minting a
   * capability with that same id.
   */
  function approvedRoles(slug: string, revision: number): ReviewerRole[] {
    const reviews = repository.listReviews(slug, revision);
    const roles: ReviewerRole[] = [];
    reviews.forEach((review) => {
      if (review.decision !== "approved") return;
      const named = review.reviewerId.trim();
      if (named === "") return;
      const wearsAnotherHat = reviews.some(
        (other) => other.reviewerId.trim() === named && other.role !== review.role,
      );
      if (wearsAnotherHat) return;
      if (roles.indexOf(review.role) === -1) roles.push(review.role);
    });
    return roles;
  }

  function missingRolesFor(slug: string, revision: number): ReviewerRole[] {
    const approved = approvedRoles(slug, revision);
    return REQUIRED_REVIEW_ROLES.filter((role) => approved.indexOf(role) === -1);
  }

  function canPublish(slug: string): PublishGate {
    const guide = repository.get(slug);
    if (guide === null) {
      return {
        ok: false,
        code: "guide_not_found",
        message: "No Guide with that slug.",
        missingRoles: REQUIRED_REVIEW_ROLES.slice(),
      };
    }
    if (guide.currentRevision === 0) {
      return {
        ok: false,
        code: "guide_has_no_revision",
        message: "The Guide has no content revision to publish.",
        missingRoles: REQUIRED_REVIEW_ROLES.slice(),
      };
    }
    if (guide.status !== "in_review") {
      return {
        ok: false,
        code: "guide_not_in_review",
        message: "The Guide must be submitted for review before it can be published.",
        missingRoles: missingRolesFor(slug, guide.currentRevision),
      };
    }
    const missing = missingRolesFor(slug, guide.currentRevision);
    if (missing.length > 0) {
      return {
        ok: false,
        code: "review_incomplete",
        message: "The current revision is missing required review approvals.",
        missingRoles: missing,
      };
    }
    return { ok: true };
  }

  function memberDetail(guide: GuideRecord): GuideDetailDto | null {
    if (!isPublicStatus(guide.status)) return null;
    const revision = guide.publishedRevision;
    if (revision === null) return null;
    const content = findRevision(repository.listRevisions(guide.slug), revision);
    if (content === null) return null;

    // A hidden-grade claim is dropped before anything is built from it, so no
    // downstream step can reach its text or pull its sources in behind it.
    const visibleClaims = content.claims.filter(
      (claim) => MEMBER_HIDDEN_GRADES.indexOf(claim.grade) === -1,
    );

    const citedIds: string[] = [];
    visibleClaims.forEach((claim) => {
      claim.sourceIds.forEach((sourceId) => {
        if (citedIds.indexOf(sourceId) === -1) citedIds.push(sourceId);
      });
    });

    return {
      slug: guide.slug,
      title: guide.title,
      status: guide.status,
      publishedAt: guide.publishedAt,
      relatedProductSkus: guide.relatedProductSkus.slice(),
      revision,
      sections: content.sections.map((section) => ({
        heading: section.heading,
        body: section.body,
      })),
      claims: visibleClaims.map((claim) => ({
        id: claim.id,
        text: claim.text,
        grade: claim.grade,
        sourceIds: claim.sourceIds.slice(),
      })),
      sources: content.sources
        .filter((source) => citedIds.indexOf(source.id) !== -1)
        .map((source) => ({
          id: source.id,
          citation: source.citation,
          url: source.url,
          verified: source.verified,
        })),
      correctionHistory: guide.correctionHistory.map((entry) => ({
        at: entry.at,
        note: entry.note,
      })),
    };
  }

  return {
    createDraft(slug, title, authorKind, asOf) {
      if (repository.get(slug) !== null) {
        return deny("guide_exists", "A Guide with that slug already exists.");
      }
      const guide: GuideRecord = {
        slug,
        title,
        status: "in_development",
        createdAt: stamp(asOf),
        authorKind,
        currentRevision: 0,
        publishedRevision: null,
        publishedAt: null,
        lastPublishedBy: null,
        relatedProductSkus: [],
        correctionHistory: [],
      };
      repository.save(guide);
      return { ok: true, value: guide };
    },

    addRevision(slug, sections, claims, sources, authorKind, asOf) {
      const guide = repository.get(slug);
      if (guide === null) return deny("guide_not_found", "No Guide with that slug.");

      const offenders = unsupportedGradeClaims(claims, sources);
      if (offenders.length > 0) {
        return deny(
          "claim_grade_unsupported",
          `A claim may not carry a grade its cited sources cannot support: ${offenders.join(", ")}.`,
        );
      }

      const revision: GuideRevision = {
        slug,
        revision: guide.currentRevision + 1,
        createdAt: stamp(asOf),
        authorKind,
        sections: sections.slice(),
        claims: claims.map((claim) => ({ ...claim, sourceIds: claim.sourceIds.slice() })),
        sources: sources.slice(),
      };
      repository.saveRevision(revision);

      // The published revision pointer is untouched. New content is invisible to a
      // member until it is reviewed and published in its own right.
      repository.save({
        ...guide,
        currentRevision: revision.revision,
        status: isPublicStatus(guide.status) ? guide.status : "in_development",
      });
      return { ok: true, value: revision };
    },

    submitForReview(slug, asOf) {
      const guide = repository.get(slug);
      if (guide === null) return deny("guide_not_found", "No Guide with that slug.");
      if (guide.currentRevision === 0) {
        return deny("guide_has_no_revision", "There is no revision to review.");
      }
      const updated: GuideRecord = { ...guide, status: "in_review" };
      repository.save(updated);
      void asOf;
      return { ok: true, value: updated };
    },

    recordReview(slug, revision, role, reviewerId, decision, notes, asOf) {
      const guide = repository.get(slug);
      if (guide === null) return deny("guide_not_found", "No Guide with that slug.");
      if (findRevision(repository.listRevisions(slug), revision) === null) {
        return deny("revision_not_found", "No such revision on this Guide.");
      }
      const named = reviewerId.trim();
      if (named === "") {
        return deny("reviewer_mismatch", "A review must name its human reviewer.");
      }
      // Refused at write time as well as at count time, so the record never contains
      // a reviewer holding two roles on one revision.
      const alreadyAnotherRole = repository
        .listReviews(slug, revision)
        .some((existing) => existing.reviewerId.trim() === named && existing.role !== role);
      if (alreadyAnotherRole) {
        return deny(
          "reviewer_mismatch",
          "One reviewer may not sign more than one review role on the same revision.",
        );
      }
      const review: GuideReview = {
        slug,
        revision,
        role,
        reviewerId: named,
        decision,
        notes,
        at: stamp(asOf),
      };
      repository.saveReview(review);
      return { ok: true, value: review };
    },

    canPublish,

    publish(slug, founderReviewerId, asOf) {
      const gate = canPublish(slug);
      if (!gate.ok) {
        // Nothing is written on a refusal. The caller learns what is missing and the
        // record is exactly as it was.
        return deny(gate.code, gate.message, gate.missingRoles);
      }
      const guide = repository.get(slug);
      if (guide === null) return deny("guide_not_found", "No Guide with that slug.");

      // The capability alone is not enough. The named human must be the same person
      // who signed the founder review of this exact revision.
      const founderApproval = repository
        .listReviews(slug, guide.currentRevision)
        .find(
          (review) =>
            review.role === "founder" &&
            review.decision === "approved" &&
            review.reviewerId === (founderReviewerId as string),
        );
      if (founderApproval === undefined) {
        return deny(
          "reviewer_mismatch",
          "The publishing reviewer did not sign the founder approval for this revision.",
        );
      }

      const updated: GuideRecord = {
        ...guide,
        status: guide.publishedRevision === null ? "published" : "updated",
        publishedRevision: guide.currentRevision,
        publishedAt: stamp(asOf),
        lastPublishedBy: founderReviewerId as string,
      };
      repository.save(updated);
      return { ok: true, value: updated };
    },

    withdraw(slug, reviewerId, reason, asOf) {
      const guide = repository.get(slug);
      if (guide === null) return deny("guide_not_found", "No Guide with that slug.");
      if (!isPublicStatus(guide.status)) {
        return deny("guide_not_published", "The Guide is not published.");
      }
      const updated: GuideRecord = {
        ...guide,
        status: "in_review",
        publishedRevision: null,
        publishedAt: null,
        correctionHistory: guide.correctionHistory.concat([
          {
            at: stamp(asOf),
            kind: "withdrawal",
            note: reason,
            by: reviewerId as string,
            revision: guide.publishedRevision,
            previouslyPublishedAt: guide.publishedAt,
          },
        ]),
      };
      repository.save(updated);
      return { ok: true, value: updated };
    },

    recordCorrection(slug, reviewerId, note, asOf) {
      const guide = repository.get(slug);
      if (guide === null) return deny("guide_not_found", "No Guide with that slug.");
      const updated: GuideRecord = {
        ...guide,
        correctionHistory: guide.correctionHistory.concat([
          {
            at: stamp(asOf),
            kind: "correction",
            note,
            by: reviewerId as string,
            revision: guide.publishedRevision,
            previouslyPublishedAt: guide.publishedAt,
          },
        ]),
      };
      repository.save(updated);
      return { ok: true, value: updated };
    },

    listForMember() {
      return repository.list().map((guide) => {
        // Built by explicit construction. An unpublished Guide's summary is assembled
        // from the record's own metadata and never from a revision, so there is no
        // path by which a body, claim, source, or excerpt can appear here.
        const published = isPublicStatus(guide.status);
        return {
          slug: guide.slug,
          title: guide.title,
          status: guide.status,
          publishedAt: published ? guide.publishedAt : null,
          relatedProductSkus: guide.relatedProductSkus.slice(),
        };
      });
    },

    getForMember(slug) {
      const guide = repository.get(slug);
      if (guide === null) return null;
      if (!isPublicStatus(guide.status)) return { denied: "guide_not_published" };
      const detail = memberDetail(guide);
      if (detail === null) return { denied: "guide_not_published" };
      return detail;
    },

    adminGet(slug) {
      const guide = repository.get(slug);
      if (guide === null) return null;
      const revisions = repository.listRevisions(slug);
      const reviews: GuideReview[] = [];
      revisions.forEach((revision) => {
        repository.listReviews(slug, revision.revision).forEach((review) => {
          reviews.push(review);
        });
      });
      return { guide, revisions, reviews };
    },
  };
}

// ---------------------------------------------------------------------------
// In-memory repository
// ---------------------------------------------------------------------------

/**
 * The default adapter. Revisions and reviews are pushed and never spliced, which is
 * the append-only rule expressed in the only place it can be violated.
 */
export function createInMemoryGuideRepository(): GuideRepository {
  const guides: GuideRecord[] = [];
  const revisions: GuideRevision[] = [];
  const reviews: GuideReview[] = [];

  return {
    get(slug) {
      const found = guides.find((guide) => guide.slug === slug);
      return found === undefined ? null : found;
    },
    save(guide) {
      const index = guides.findIndex((candidate) => candidate.slug === guide.slug);
      if (index === -1) guides.push(guide);
      else guides[index] = guide;
    },
    list() {
      return guides.slice();
    },
    listRevisions(slug) {
      return revisions.filter((revision) => revision.slug === slug);
    },
    saveRevision(revision) {
      revisions.push(revision);
    },
    saveReview(review) {
      reviews.push(review);
    },
    listReviews(slug, revision) {
      return reviews.filter(
        (review) => review.slug === slug && review.revision === revision,
      );
    },
  };
}
