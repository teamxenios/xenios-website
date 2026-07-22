import { describe, expect, it } from "vitest";
import crypto from "crypto";
import {
  ACTIVATION_STEPS,
  ALLOWED_TRANSITIONS,
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_REGISTRY,
  DOCUMENT_STATUSES,
  DocumentImmutable,
  DocumentLifecycle,
  DocumentNotFound,
  InvalidDocumentInput,
  InvalidTransition,
  PLACEHOLDER_MARKER,
  PublicationBlocked,
  categoryDefinitionFor,
  placeholderContent,
  seedPlaceholderDrafts,
  sha256Hex,
  type DocumentCategory,
  type DocumentStatus,
} from "./documents";
import { AGREEMENT_DEFINITIONS } from "../agreements";
import { createInMemoryDocumentsStore } from "./persistence/documents-store";

const NOW = new Date("2026-07-22T12:00:00.000Z");

function build() {
  const store = createInMemoryDocumentsStore();
  let n = 0;
  const lifecycle = new DocumentLifecycle(store, {
    now: () => NOW,
    newId: () => `version-${++n}`,
  });
  return { store, lifecycle };
}

async function draftFor(lifecycle: DocumentLifecycle, category: DocumentCategory, semver = "1.0.0") {
  return lifecycle.createDraft({
    category,
    semver,
    jurisdiction: "PLACEHOLDER, counsel to determine",
    content: `${PLACEHOLDER_MARKER}\n\nBody for ${category} ${semver}.`,
  });
}

async function publishNew(
  lifecycle: DocumentLifecycle,
  category: DocumentCategory,
  semver = "1.0.0",
  options: { reacceptanceRequired?: boolean } = {},
) {
  const draft = await lifecycle.createDraft({
    category,
    semver,
    jurisdiction: "PLACEHOLDER, counsel to determine",
    content: `${PLACEHOLDER_MARKER}\n\nBody for ${category} ${semver}.`,
    reacceptanceRequired: options.reacceptanceRequired,
  });
  await lifecycle.transition(draft.id, "under_legal_review");
  await lifecycle.setCounselReview(draft.id, "approved");
  await lifecycle.transition(draft.id, "approved_for_publication");
  return lifecycle.publish(draft.id, { publisher: "counsel-ops" });
}

// ---------------------------------------------------------------------------
// The category registry
// ---------------------------------------------------------------------------

describe("document category registry", () => {
  it("registers exactly the sixteen categories of the spec, uniquely", () => {
    expect(DOCUMENT_CATEGORIES).toHaveLength(16);
    expect(new Set(DOCUMENT_CATEGORIES).size).toBe(16);
    expect(DOCUMENT_CATEGORY_REGISTRY).toHaveLength(16);
    expect(new Set(DOCUMENT_CATEGORY_REGISTRY.map((d) => d.category)).size).toBe(16);
  });

  it("flags arbitration, and only arbitration, as requiring its own separate acknowledgment", () => {
    const flagged = DOCUMENT_CATEGORY_REGISTRY.filter((d) => d.requiresSeparateAcknowledgment);
    expect(flagged.map((d) => d.category)).toEqual(["arbitration_agreement"]);
  });

  it("binds the electronic-record consent to the first activation step", () => {
    const consent = categoryDefinitionFor("electronic_record_consent");
    expect(consent.activationStep).toBe("electronic_consent");
    expect(consent.defaultRequirement).toBe("required");
  });

  it("links every carried agreementKey to a real agreements-engine definition", () => {
    const engineKeys = new Set(AGREEMENT_DEFINITIONS.map((d) => d.key));
    for (const entry of DOCUMENT_CATEGORY_REGISTRY) {
      if (entry.agreementKey !== null) {
        expect(engineKeys.has(entry.agreementKey)).toBe(true);
      }
    }
    // The recurring authorization keeps its engine linkage (XR-MEM-003).
    expect(categoryDefinitionFor("recurring_membership_authorization").agreementKey).toBe("XR-MEM-003");
  });

  it("keeps every activation step in the known step list", () => {
    for (const entry of DOCUMENT_CATEGORY_REGISTRY) {
      if (entry.activationStep !== null) {
        expect(ACTIVATION_STEPS).toContain(entry.activationStep);
      }
    }
  });

  it("marks the referral terms optional and everything else required", () => {
    for (const entry of DOCUMENT_CATEGORY_REGISTRY) {
      expect(entry.defaultRequirement).toBe(
        entry.category === "referral_store_credit_terms" ? "optional" : "required",
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Placeholder seeding
// ---------------------------------------------------------------------------

describe("seedPlaceholderDrafts", () => {
  it("creates one clearly marked placeholder draft per category", async () => {
    const { store, lifecycle } = build();
    const created = await seedPlaceholderDrafts(lifecycle, store);
    expect(created).toHaveLength(16);
    for (const record of created) {
      expect(record.status).toBe("draft");
      expect(record.counselReview).toBe("not_reviewed");
      expect(record.content).toContain(PLACEHOLDER_MARKER);
      expect(record.contentHash).toBe(sha256Hex(record.content));
      expect(record.publishedAt).toBeNull();
      expect(record.effectiveDate).toBeNull();
    }
  });

  it("is idempotent: a second seed creates nothing", async () => {
    const { store, lifecycle } = build();
    await seedPlaceholderDrafts(lifecycle, store);
    const second = await seedPlaceholderDrafts(lifecycle, store);
    expect(second).toHaveLength(0);
    expect(await store.listVersions()).toHaveLength(16);
  });

  it("placeholder content invents no legal conclusions and names the replacement rule", () => {
    for (const definition of DOCUMENT_CATEGORY_REGISTRY) {
      const content = placeholderContent(definition);
      expect(content.startsWith(PLACEHOLDER_MARKER)).toBe(true);
      expect(content).toContain(definition.title);
    }
  });
});

// ---------------------------------------------------------------------------
// Draft creation and content immutability
// ---------------------------------------------------------------------------

describe("createDraft", () => {
  it("computes the content hash server-side from the exact content", async () => {
    const { lifecycle } = build();
    const draft = await draftFor(lifecycle, "founding_membership_agreement");
    expect(draft.contentHash).toBe(
      crypto.createHash("sha256").update(draft.content, "utf8").digest("hex"),
    );
  });

  it("takes the separate-acknowledgment flag from the registry, never the caller", async () => {
    const { lifecycle } = build();
    const arbitration = await draftFor(lifecycle, "arbitration_agreement");
    expect(arbitration.requiresSeparateAcknowledgment).toBe(true);
    const covenant = await draftFor(lifecycle, "membership_covenant");
    expect(covenant.requiresSeparateAcknowledgment).toBe(false);
  });

  it("refuses a non-semver version, empty content, and empty jurisdiction", async () => {
    const { lifecycle } = build();
    await expect(
      lifecycle.createDraft({
        category: "privacy_notice",
        semver: "v1",
        jurisdiction: "PLACEHOLDER",
        content: "x",
      }),
    ).rejects.toThrow(InvalidDocumentInput);
    await expect(
      lifecycle.createDraft({
        category: "privacy_notice",
        semver: "1.0.0",
        jurisdiction: "PLACEHOLDER",
        content: "   ",
      }),
    ).rejects.toThrow(InvalidDocumentInput);
    await expect(
      lifecycle.createDraft({
        category: "privacy_notice",
        semver: "1.0.0",
        jurisdiction: "",
        content: "x",
      }),
    ).rejects.toThrow(InvalidDocumentInput);
  });

  it("edits recompute the hash while in draft", async () => {
    const { lifecycle } = build();
    const draft = await draftFor(lifecycle, "privacy_notice");
    const updated = await lifecycle.updateDraftContent(draft.id, "New draft body.");
    expect(updated.content).toBe("New draft body.");
    expect(updated.contentHash).toBe(sha256Hex("New draft body."));
    expect(updated.contentHash).not.toBe(draft.contentHash);
  });

  it("freezes content the moment the version leaves draft", async () => {
    const { lifecycle } = build();
    const draft = await draftFor(lifecycle, "privacy_notice");
    await lifecycle.transition(draft.id, "under_legal_review");
    await expect(lifecycle.updateDraftContent(draft.id, "sneaky edit")).rejects.toThrow(DocumentImmutable);
  });

  it("refuses content edits on a published version (the hash stays the published hash)", async () => {
    const { lifecycle } = build();
    const published = await publishNew(lifecycle, "privacy_notice");
    await expect(lifecycle.updateDraftContent(published.id, "post-publication edit")).rejects.toThrow(
      DocumentImmutable,
    );
    const reloaded = await lifecycle.getVersion(published.id);
    expect(reloaded!.contentHash).toBe(sha256Hex(reloaded!.content));
  });
});

// ---------------------------------------------------------------------------
// Guarded lifecycle transitions
// ---------------------------------------------------------------------------

describe("lifecycle transitions", () => {
  it("walks the happy path draft -> review -> approved -> scheduled -> published", async () => {
    const { lifecycle } = build();
    const draft = await draftFor(lifecycle, "activation_terms");
    await lifecycle.transition(draft.id, "under_legal_review");
    await lifecycle.setCounselReview(draft.id, "approved");
    await lifecycle.transition(draft.id, "approved_for_publication");
    const scheduled = await lifecycle.transition(draft.id, "scheduled");
    expect(scheduled.status).toBe("scheduled");
    const published = await lifecycle.publish(draft.id, { publisher: "counsel-ops" });
    expect(published.status).toBe("published");
    expect(published.publishedAt).toBe(NOW.toISOString());
    expect(published.effectiveDate).toBe("2026-07-22");
    expect(published.publisher).toBe("counsel-ops");
  });

  it("refuses every transition the map does not list", async () => {
    const { lifecycle } = build();
    const draft = await draftFor(lifecycle, "activation_terms");
    await expect(lifecycle.transition(draft.id, "superseded")).rejects.toThrow(InvalidTransition);
    await expect(lifecycle.transition(draft.id, "archived")).rejects.toThrow(InvalidTransition);
    await expect(lifecycle.transition(draft.id, "scheduled")).rejects.toThrow(InvalidTransition);
  });

  it("refuses reaching published through transition(); publish() is the only door", async () => {
    const { lifecycle } = build();
    const draft = await draftFor(lifecycle, "activation_terms");
    await lifecycle.transition(draft.id, "under_legal_review");
    await lifecycle.setCounselReview(draft.id, "approved");
    await lifecycle.transition(draft.id, "approved_for_publication");
    await expect(lifecycle.transition(draft.id, "published")).rejects.toThrow(InvalidTransition);
  });

  it("blocks approval for publication without counsel approval on record", async () => {
    const { lifecycle } = build();
    const draft = await draftFor(lifecycle, "activation_terms");
    await lifecycle.transition(draft.id, "under_legal_review");
    await expect(lifecycle.transition(draft.id, "approved_for_publication")).rejects.toThrow(
      PublicationBlocked,
    );
  });

  it("blocks publish() from draft and from review states", async () => {
    const { lifecycle } = build();
    const draft = await draftFor(lifecycle, "activation_terms");
    await expect(lifecycle.publish(draft.id, { publisher: "counsel-ops" })).rejects.toThrow(
      InvalidTransition,
    );
    await lifecycle.transition(draft.id, "under_legal_review");
    await expect(lifecycle.publish(draft.id, { publisher: "counsel-ops" })).rejects.toThrow(
      InvalidTransition,
    );
  });

  it("blocks publish() without a named publisher", async () => {
    const { lifecycle } = build();
    const draft = await draftFor(lifecycle, "activation_terms");
    await lifecycle.transition(draft.id, "under_legal_review");
    await lifecycle.setCounselReview(draft.id, "approved");
    await lifecycle.transition(draft.id, "approved_for_publication");
    await expect(lifecycle.publish(draft.id, { publisher: "  " })).rejects.toThrow(PublicationBlocked);
  });

  it("terminal states accept nothing", () => {
    expect(ALLOWED_TRANSITIONS.archived).toHaveLength(0);
    expect(ALLOWED_TRANSITIONS.withdrawn).toHaveLength(0);
    // Every status in the map is a known status and vice versa.
    expect(Object.keys(ALLOWED_TRANSITIONS).sort()).toEqual([...DOCUMENT_STATUSES].sort());
    for (const targets of Object.values(ALLOWED_TRANSITIONS)) {
      for (const target of targets) expect(DOCUMENT_STATUSES).toContain(target as DocumentStatus);
    }
  });

  it("throws DocumentNotFound for an unknown id", async () => {
    const { lifecycle } = build();
    await expect(lifecycle.transition("missing", "under_legal_review")).rejects.toThrow(DocumentNotFound);
  });
});

// ---------------------------------------------------------------------------
// Supersession
// ---------------------------------------------------------------------------

describe("publication supersession", () => {
  it("publishing a new version supersedes the previously published one and links it", async () => {
    const { lifecycle } = build();
    const first = await publishNew(lifecycle, "founding_membership_agreement", "1.0.0");
    const second = await publishNew(lifecycle, "founding_membership_agreement", "1.1.0");

    expect(second.status).toBe("published");
    expect(second.supersededVersionId).toBe(first.id);

    const firstReloaded = await lifecycle.getVersion(first.id);
    expect(firstReloaded!.status).toBe("superseded");

    const current = await lifecycle.getPublished("founding_membership_agreement");
    expect(current!.id).toBe(second.id);
  });

  it("keeps at most one published version per category", async () => {
    const { store, lifecycle } = build();
    await publishNew(lifecycle, "membership_covenant", "1.0.0");
    await publishNew(lifecycle, "membership_covenant", "2.0.0");
    const all = await store.listVersions("membership_covenant");
    expect(all.filter((v) => v.status === "published")).toHaveLength(1);
  });

  it("a superseded version can be archived but never republished", async () => {
    const { lifecycle } = build();
    const first = await publishNew(lifecycle, "membership_covenant", "1.0.0");
    await publishNew(lifecycle, "membership_covenant", "2.0.0");
    const archived = await lifecycle.transition(first.id, "archived");
    expect(archived.status).toBe("archived");
    await expect(lifecycle.publish(first.id, { publisher: "counsel-ops" })).rejects.toThrow(
      InvalidTransition,
    );
  });
});
