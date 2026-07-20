import { describe, expect, it } from "vitest";
import {
  REQUIRED_REVIEW_ROLES,
  createGuideService,
  createInMemoryGuideRepository,
  namedHumanReviewer,
  type AuthorKind,
  type ClaimGrade,
  type GuideClaim,
  type GuideSection,
  type GuideService,
  type GuideSource,
  type ReviewerRole,
} from "./guides";

const T0 = new Date("2026-01-05T10:00:00.000Z");
const T1 = new Date("2026-02-05T10:00:00.000Z");
const T2 = new Date("2026-03-05T10:00:00.000Z");

const FOUNDER = "mitch.founder";

// A string that could only have come from a section body. Every leak assertion below
// searches for this exact marker in serialized output.
const SECRET_BODY = "UNPUBLISHED-BODY-MARKER-do-not-serialize";

const SECTIONS: GuideSection[] = [
  { heading: "What this material is", body: SECRET_BODY },
  { heading: "How it has been studied", body: "Work to date is described in the sources." },
];

const SOURCES: GuideSource[] = [
  {
    id: "s1",
    kind: "peer_reviewed",
    citation: "Journal of Research Chemistry, 2024",
    url: "https://example.org/study",
    verified: true,
  },
  {
    id: "s2",
    kind: "retailer",
    citation: "A storefront listing",
    url: "https://example.com/listing",
    verified: false,
  },
];

const CLAIMS: GuideClaim[] = [
  { id: "c1", text: "Human work has examined this signaling pathway.", grade: "C", sourceIds: ["s1"] },
  { id: "c2", text: "A supplier reports this characteristic.", grade: "E", sourceIds: ["s2"] },
  { id: "c3", text: "A claim that may never be shown to a member.", grade: "PROHIBITED", sourceIds: ["s2"] },
];

function service(): GuideService {
  return createGuideService({ repository: createInMemoryGuideRepository() });
}

function seedDraft(svc: GuideService, authorKind: AuthorKind = "automated"): void {
  const created = svc.createDraft("peptide-overview", "Peptide Overview", authorKind, T0);
  expect(created.ok).toBe(true);
  const revision = svc.addRevision("peptide-overview", SECTIONS, CLAIMS, SOURCES, authorKind, T0);
  expect(revision.ok).toBe(true);
  expect(svc.submitForReview("peptide-overview", T0).ok).toBe(true);
}

function approveAll(svc: GuideService, except: ReviewerRole[] = []): void {
  REQUIRED_REVIEW_ROLES.forEach((role) => {
    if (except.indexOf(role) !== -1) return;
    const reviewerId = role === "founder" ? FOUNDER : `${role}.reviewer`;
    const recorded = svc.recordReview("peptide-overview", 1, role, reviewerId, "approved", "", T1);
    expect(recorded.ok).toBe(true);
  });
}

function publishFully(svc: GuideService): void {
  seedDraft(svc);
  approveAll(svc);
  const published = svc.publish("peptide-overview", namedHumanReviewer(FOUNDER, "human"), T2);
  expect(published.ok).toBe(true);
}

describe("publication is a named human act", () => {
  it("refuses to mint a publication capability for a non-human actor", () => {
    const automated: AuthorKind = "automated";
    // The type system rejects this call outright, which is the primary gate. The
    // runtime throw below is the second line for callers that reach it dynamically.
    // @ts-expect-error an AuthorKind cannot satisfy the literal "human" parameter
    expect(() => namedHumanReviewer("bot-1", automated)).toThrow();
  });

  it("refuses an unnamed reviewer", () => {
    expect(() => namedHumanReviewer("   ", "human")).toThrow();
  });

  it("publishes only when a named human signed the founder approval", () => {
    const svc = service();
    seedDraft(svc);
    approveAll(svc);

    const wrongHuman = svc.publish(
      "peptide-overview",
      namedHumanReviewer("someone.else", "human"),
      T2,
    );
    expect(wrongHuman.ok).toBe(false);
    if (!wrongHuman.ok) expect(wrongHuman.code).toBe("reviewer_mismatch");
    expect(svc.getForMember("peptide-overview")).toEqual({ denied: "guide_not_published" });

    const right = svc.publish("peptide-overview", namedHumanReviewer(FOUNDER, "human"), T2);
    expect(right.ok).toBe(true);
    if (right.ok) {
      expect(right.value.status).toBe("published");
      expect(right.value.lastPublishedBy).toBe(FOUNDER);
    }
  });
});

describe("the five-review gate", () => {
  it("refuses publication with a missing role and changes nothing", () => {
    const svc = service();
    seedDraft(svc);
    approveAll(svc, ["regulatory", "medical_safety"]);

    const before = svc.adminGet("peptide-overview");
    const attempt = svc.publish("peptide-overview", namedHumanReviewer(FOUNDER, "human"), T2);

    expect(attempt.ok).toBe(false);
    if (!attempt.ok) {
      expect(attempt.code).toBe("review_incomplete");
      expect(attempt.missingRoles).toEqual(["regulatory", "medical_safety"]);
    }

    const after = svc.adminGet("peptide-overview");
    expect(after?.guide).toEqual(before?.guide);
    expect(after?.guide.status).toBe("in_review");
    expect(after?.guide.publishedRevision).toBeNull();
    expect(after?.guide.publishedAt).toBeNull();
    expect(svc.getForMember("peptide-overview")).toEqual({ denied: "guide_not_published" });
  });

  it("does not count a changes_requested review as an approval", () => {
    const svc = service();
    seedDraft(svc);
    approveAll(svc, ["editorial"]);
    svc.recordReview("peptide-overview", 1, "editorial", "ed.reviewer", "changes_requested", "", T1);

    const gate = svc.canPublish("peptide-overview");
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.missingRoles).toEqual(["editorial"]);
  });

  it("refuses publication of a Guide that was never submitted for review", () => {
    const svc = service();
    svc.createDraft("peptide-overview", "Peptide Overview", "human", T0);
    svc.addRevision("peptide-overview", SECTIONS, CLAIMS, SOURCES, "human", T0);
    approveAll(svc);

    const attempt = svc.publish("peptide-overview", namedHumanReviewer(FOUNDER, "human"), T2);
    expect(attempt.ok).toBe(false);
    if (!attempt.ok) expect(attempt.code).toBe("guide_not_in_review");
  });
});

describe("an unpublished Guide leaks nothing", () => {
  it("denies the detail path for every non-public status", () => {
    const svc = service();
    const created = svc.createDraft("peptide-overview", "Peptide Overview", "human", T0);
    expect(created.ok).toBe(true);
    expect(svc.getForMember("peptide-overview")).toEqual({ denied: "guide_not_published" });

    svc.addRevision("peptide-overview", SECTIONS, CLAIMS, SOURCES, "human", T0);
    expect(svc.getForMember("peptide-overview")).toEqual({ denied: "guide_not_published" });

    svc.submitForReview("peptide-overview", T0);
    expect(svc.getForMember("peptide-overview")).toEqual({ denied: "guide_not_published" });
  });

  it("serializes no body, claim, source, or excerpt in the member list", () => {
    const svc = service();
    seedDraft(svc);

    const serialized = JSON.stringify(svc.listForMember());
    expect(serialized).not.toContain(SECRET_BODY);
    expect(serialized).not.toContain("signaling pathway");
    expect(serialized).not.toContain("Journal of Research Chemistry");
    expect(serialized).not.toContain("storefront listing");

    const summary = svc.listForMember()[0];
    expect(summary.status).toBe("in_review");
    expect(summary.publishedAt).toBeNull();
    expect(Object.keys(summary).sort()).toEqual([
      "publishedAt",
      "relatedProductSkus",
      "slug",
      "status",
      "title",
    ]);
  });

  it("returns null for a Guide that does not exist", () => {
    expect(service().getForMember("no-such-guide")).toBeNull();
  });

  it("keeps a post-publication draft revision invisible to members", () => {
    const svc = service();
    publishFully(svc);

    const laterBody = "DRAFT-TWO-BODY-MARKER";
    svc.addRevision(
      "peptide-overview",
      [{ heading: "Revised", body: laterBody }],
      [],
      [],
      "automated",
      T2,
    );

    const detail = svc.getForMember("peptide-overview");
    expect(JSON.stringify(detail)).not.toContain(laterBody);
    expect(detail).not.toBeNull();
    if (detail !== null && !("denied" in detail)) {
      expect(detail.revision).toBe(1);
      expect(detail.sections[0].body).toBe(SECRET_BODY);
    }
  });

  it("denies members again after a withdrawal", () => {
    const svc = service();
    publishFully(svc);
    const withdrawn = svc.withdraw(
      "peptide-overview",
      namedHumanReviewer(FOUNDER, "human"),
      "A source needs re-verification.",
      T2,
    );
    expect(withdrawn.ok).toBe(true);
    expect(svc.getForMember("peptide-overview")).toEqual({ denied: "guide_not_published" });
    expect(JSON.stringify(svc.listForMember())).not.toContain(SECRET_BODY);
  });
});

describe("claims are graded one at a time", () => {
  it("never serializes a PROHIBITED claim to a member", () => {
    const svc = service();
    publishFully(svc);

    const detail = svc.getForMember("peptide-overview");
    expect(detail).not.toBeNull();
    if (detail === null || "denied" in detail) throw new Error("expected a published detail");

    const ids = detail.claims.map((claim) => claim.id);
    expect(ids).toEqual(["c1", "c2"]);
    expect(detail.claims.every((claim) => claim.grade !== "PROHIBITED")).toBe(true);
    expect(JSON.stringify(detail)).not.toContain("may never be shown");

    // The admin view still holds it. Hiding from a member is not erasure.
    const admin = svc.adminGet("peptide-overview");
    expect(admin?.revisions[0].claims.map((claim) => claim.id)).toEqual(["c1", "c2", "c3"]);
  });

  it("refuses a human-evidence grade resting on a retailer page", () => {
    const svc = service();
    svc.createDraft("peptide-overview", "Peptide Overview", "human", T0);
    const attempt = svc.addRevision(
      "peptide-overview",
      SECTIONS,
      [{ id: "bad", text: "Human work supports this.", grade: "B", sourceIds: ["s2"] }],
      SOURCES,
      "human",
      T0,
    );
    expect(attempt.ok).toBe(false);
    if (!attempt.ok) expect(attempt.code).toBe("claim_grade_unsupported");
    expect(svc.adminGet("peptide-overview")?.revisions).toEqual([]);
  });

  it("allows a retailer page to support a supplier-reported grade", () => {
    const svc = service();
    svc.createDraft("peptide-overview", "Peptide Overview", "human", T0);
    const attempt = svc.addRevision(
      "peptide-overview",
      SECTIONS,
      [{ id: "ok", text: "A supplier reports this characteristic.", grade: "E", sourceIds: ["s2"] }],
      SOURCES,
      "human",
      T0,
    );
    expect(attempt.ok).toBe(true);
  });
});

describe("five reviews means five people", () => {
  it("refuses to let one identity sign every role and then publish", () => {
    // Regression, and the AI publish path this closes: an automated pipeline holding
    // a single identity used to be able to sign all five roles, mint the capability
    // with that same id, and reach published without a second human ever involved.
    const svc = service();
    seedDraft(svc);

    const solo = "automation-bot";
    const recorded = REQUIRED_REVIEW_ROLES.map((role) =>
      svc.recordReview("peptide-overview", 1, role, solo, "approved", "", T1),
    );

    expect(recorded[0].ok).toBe(true);
    recorded.slice(1).forEach((result) => {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("reviewer_mismatch");
    });

    const gate = svc.canPublish("peptide-overview");
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.missingRoles).toEqual(REQUIRED_REVIEW_ROLES.slice(1));

    const attempt = svc.publish("peptide-overview", namedHumanReviewer(solo, "human"), T2);
    expect(attempt.ok).toBe(false);
    expect(svc.getForMember("peptide-overview")).toEqual({ denied: "guide_not_published" });
    expect(JSON.stringify(svc.listForMember())).not.toContain(SECRET_BODY);
  });

  it("discounts a reviewer who somehow holds two roles on one revision", () => {
    // Defense in depth: even if such a pair reached the store, neither role counts.
    const svc = service();
    seedDraft(svc);
    approveAll(svc);

    const repository = createInMemoryGuideRepository();
    const direct = createGuideService({ repository });
    direct.createDraft("g", "G", "human", T0);
    direct.addRevision("g", SECTIONS, [], [], "human", T0);
    direct.submitForReview("g", T0);
    REQUIRED_REVIEW_ROLES.forEach((role) => {
      repository.saveReview({
        slug: "g",
        revision: 1,
        role,
        reviewerId: "one.person",
        decision: "approved",
        notes: "",
        at: T1.toISOString(),
      });
    });

    const gate = direct.canPublish("g");
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.missingRoles).toEqual([...REQUIRED_REVIEW_ROLES]);
  });
});

describe("a grade may not outrun its sources", () => {
  it("refuses a human-evidence grade with no source at all", () => {
    const svc = service();
    svc.createDraft("peptide-overview", "Peptide Overview", "human", T0);
    const attempt = svc.addRevision(
      "peptide-overview",
      SECTIONS,
      [{ id: "bare", text: "Human work supports this.", grade: "A", sourceIds: [] }],
      SOURCES,
      "human",
      T0,
    );
    expect(attempt.ok).toBe(false);
    if (!attempt.ok) expect(attempt.code).toBe("claim_grade_unsupported");
  });

  it("refuses a human-evidence grade resting on a supplier page", () => {
    const svc = service();
    svc.createDraft("peptide-overview", "Peptide Overview", "human", T0);
    const supplier: GuideSource = {
      id: "sup",
      kind: "supplier",
      citation: "A supplier data sheet",
      url: null,
      verified: false,
    };
    (["A", "B", "C"] as const).forEach((grade) => {
      const attempt = svc.addRevision(
        "peptide-overview",
        SECTIONS,
        [{ id: `c-${grade}`, text: "Human work supports this.", grade, sourceIds: ["sup"] }],
        [supplier],
        "human",
        T0,
      );
      expect(attempt.ok, `supplier must not support ${grade}`).toBe(false);
    });
  });

  it("refuses a claim graded above the ceiling of the sources it cites", () => {
    const svc = service();
    svc.createDraft("peptide-overview", "Peptide Overview", "human", T0);
    const weak: GuideSource[] = [
      { id: "pre", kind: "preclinical", citation: "A bench study", url: null, verified: true },
      { id: "trad", kind: "traditional", citation: "Traditional use", url: null, verified: false },
      { id: "misc", kind: "other", citation: "An unclassified page", url: null, verified: false },
    ];
    const cases: Array<[string, ClaimGrade]> = [
      ["pre", "C"],
      ["trad", "D"],
      ["misc", "F"],
    ];
    cases.forEach(([sourceId, grade]) => {
      const attempt = svc.addRevision(
        "peptide-overview",
        SECTIONS,
        [{ id: `c-${sourceId}`, text: "A statement.", grade, sourceIds: [sourceId] }],
        weak,
        "human",
        T0,
      );
      expect(attempt.ok, `${sourceId} must not support ${grade}`).toBe(false);
    });
  });

  it("still accepts a grade the cited evidence supports", () => {
    const svc = service();
    svc.createDraft("peptide-overview", "Peptide Overview", "human", T0);
    const attempt = svc.addRevision(
      "peptide-overview",
      SECTIONS,
      [
        { id: "ok-b", text: "A trial examined this.", grade: "B", sourceIds: ["s1"] },
        { id: "ok-e", text: "A supplier reports this.", grade: "E", sourceIds: ["s2"] },
        { id: "ok-p", text: "Never shown to a member.", grade: "PROHIBITED", sourceIds: ["s2"] },
      ],
      SOURCES,
      "human",
      T0,
    );
    expect(attempt.ok).toBe(true);
  });
});

describe("history is append-only", () => {
  it("records what was live when a withdrawal clears the published pointer", () => {
    // Regression: withdraw nulled publishedRevision and publishedAt with nothing
    // appended in their place, so the record of what a member could read was lost.
    const svc = service();
    publishFully(svc);
    svc.withdraw(
      "peptide-overview",
      namedHumanReviewer(FOUNDER, "human"),
      "A source needs re-verification.",
      T2,
    );

    const history = svc.adminGet("peptide-overview")?.guide.correctionHistory ?? [];
    expect(history).toHaveLength(1);
    expect(history[0].kind).toBe("withdrawal");
    expect(history[0].revision).toBe(1);
    expect(history[0].previouslyPublishedAt).toBe(T2.toISOString());

    // The member surface is unchanged: still denied, still no revision pointer.
    expect(svc.getForMember("peptide-overview")).toEqual({ denied: "guide_not_published" });
    expect(svc.adminGet("peptide-overview")?.guide.publishedRevision).toBeNull();
  });

  it("appends corrections without erasing earlier ones", () => {
    const svc = service();
    publishFully(svc);
    const founder = namedHumanReviewer(FOUNDER, "human");

    svc.recordCorrection("peptide-overview", founder, "Clarified the study population.", T2);
    svc.recordCorrection("peptide-overview", founder, "Corrected a citation year.", T2);

    const history = svc.adminGet("peptide-overview")?.guide.correctionHistory ?? [];
    expect(history.map((entry) => entry.note)).toEqual([
      "Clarified the study population.",
      "Corrected a citation year.",
    ]);
    expect(history.every((entry) => entry.by === FOUNDER)).toBe(true);

    const detail = svc.getForMember("peptide-overview");
    if (detail === null || "denied" in detail) throw new Error("expected a published detail");
    expect(detail.correctionHistory).toEqual([
      { at: T2.toISOString(), note: "Clarified the study population." },
      { at: T2.toISOString(), note: "Corrected a citation year." },
    ]);
  });

  it("keeps every revision and every review", () => {
    const svc = service();
    publishFully(svc);
    svc.addRevision("peptide-overview", SECTIONS, [], [], "automated", T2);

    const admin = svc.adminGet("peptide-overview");
    expect(admin?.revisions.map((revision) => revision.revision)).toEqual([1, 2]);
    expect(admin?.reviews.length).toBe(REQUIRED_REVIEW_ROLES.length);
    expect(admin?.revisions[0].sections[0].body).toBe(SECRET_BODY);
  });

  it("marks a second publication as updated without losing the first", () => {
    const svc = service();
    publishFully(svc);
    svc.addRevision("peptide-overview", SECTIONS, CLAIMS, SOURCES, "human", T2);
    svc.submitForReview("peptide-overview", T2);
    REQUIRED_REVIEW_ROLES.forEach((role) => {
      const reviewerId = role === "founder" ? FOUNDER : `${role}.reviewer`;
      svc.recordReview("peptide-overview", 2, role, reviewerId, "approved", "", T2);
    });

    const again = svc.publish("peptide-overview", namedHumanReviewer(FOUNDER, "human"), T2);
    expect(again.ok).toBe(true);
    if (again.ok) {
      expect(again.value.status).toBe("updated");
      expect(again.value.publishedRevision).toBe(2);
    }
    expect(svc.adminGet("peptide-overview")?.revisions.length).toBe(2);
  });
});
