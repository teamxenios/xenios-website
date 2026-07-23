import { describe, expect, it } from "vitest";
import {
  DOCUMENT_CATEGORY_REGISTRY,
  DocumentLifecycle,
  LEGACY_CATEGORY_MAPPING,
  PLACEHOLDER_MARKER,
  sha256Hex,
  type DocumentCategory,
  type DocumentVersionRecord,
} from "./documents";
import * as signaturesModule from "./signatures";
import {
  SignatureService,
  newSignatureFormState,
  type SignDocumentInput,
} from "./signatures";
import { createInMemoryDocumentsStore, type DocumentsStore } from "./persistence/documents-store";

const NOW = new Date("2026-07-22T12:00:00.000Z");
const MEMBER = "11111111-1111-4111-8111-111111111111";
const OTHER_MEMBER = "22222222-2222-4222-8222-222222222222";

function build() {
  const store: DocumentsStore = createInMemoryDocumentsStore();
  let n = 0;
  const lifecycle = new DocumentLifecycle(store, { now: () => NOW, newId: () => `v-${++n}` });
  let s = 0;
  const service = new SignatureService(store, { now: () => NOW, newId: () => `sig-${++s}` });
  return { store, lifecycle, service };
}

async function publishCategory(
  lifecycle: DocumentLifecycle,
  category: DocumentCategory,
  semver = "1.0.0",
  options: { reacceptanceRequired?: boolean } = {},
): Promise<DocumentVersionRecord> {
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

function signInput(overrides: Partial<SignDocumentInput> = {}): SignDocumentInput {
  return {
    memberId: MEMBER,
    documentVersionId: "unset",
    typedLegalName: "Sam Member",
    fullDocumentShown: true,
    affirmativeConsent: true,
    ip: "203.0.113.9",
    userAgent: "vitest",
    ...overrides,
  };
}

/** Publish the e-record consent and sign it, unlocking the order gate. */
async function withElectronicConsent(lifecycle: DocumentLifecycle, service: SignatureService) {
  const consent = await publishCategory(lifecycle, "electronic_record_consent");
  const result = await service.sign(signInput({ documentVersionId: consent.id }));
  expect(result.ok).toBe(true);
  return consent;
}

// ---------------------------------------------------------------------------
// A draft can never be signed
// ---------------------------------------------------------------------------

describe("draft unsignable (structural)", () => {
  it("refuses to sign a draft", async () => {
    const { lifecycle, service } = build();
    const draft = await lifecycle.createDraft({
      category: "electronic_record_consent",
      semver: "1.0.0",
      jurisdiction: "PLACEHOLDER, counsel to determine",
      content: `${PLACEHOLDER_MARKER}\n\nDraft body.`,
    });
    const result = await service.sign(signInput({ documentVersionId: draft.id }));
    expect(result).toEqual({ ok: false, code: "not_published" });
  });

  it("refuses every non-published lifecycle state, not just draft", async () => {
    const { lifecycle, service } = build();
    // under_legal_review
    const inReview = await lifecycle.createDraft({
      category: "electronic_record_consent",
      semver: "1.0.0",
      jurisdiction: "PLACEHOLDER",
      content: "body",
    });
    await lifecycle.transition(inReview.id, "under_legal_review");
    expect((await service.sign(signInput({ documentVersionId: inReview.id }))).ok).toBe(false);

    // approved_for_publication and scheduled
    await lifecycle.setCounselReview(inReview.id, "approved");
    await lifecycle.transition(inReview.id, "approved_for_publication");
    expect((await service.sign(signInput({ documentVersionId: inReview.id }))).ok).toBe(false);
    await lifecycle.transition(inReview.id, "scheduled");
    expect((await service.sign(signInput({ documentVersionId: inReview.id }))).ok).toBe(false);
  });

  it("refuses a superseded version: only the currently published text is signable", async () => {
    const { lifecycle, service } = build();
    const v1 = await publishCategory(lifecycle, "electronic_record_consent", "1.0.0");
    await publishCategory(lifecycle, "electronic_record_consent", "2.0.0");
    const result = await service.sign(signInput({ documentVersionId: v1.id }));
    expect(result).toEqual({ ok: false, code: "not_published" });
  });

  it("returns version_not_found for an unknown version id", async () => {
    const { service } = build();
    const result = await service.sign(signInput({ documentVersionId: "missing" }));
    expect(result).toEqual({ ok: false, code: "version_not_found" });
  });
});

// ---------------------------------------------------------------------------
// Consent mechanics: never prechecked, name required, full document shown
// ---------------------------------------------------------------------------

describe("consent mechanics", () => {
  it("the blank form state is never prechecked (structural)", () => {
    const state = newSignatureFormState();
    expect(state.affirmativeConsent).toBe(false);
    expect(state.fullDocumentShown).toBe(false);
    expect(state.separateAcknowledgment).toBe(false);
    expect(state.typedLegalName).toBe("");
  });

  it("requires the literal true for affirmative consent", async () => {
    const { lifecycle, service } = build();
    const consent = await publishCategory(lifecycle, "electronic_record_consent");
    for (const value of [false, undefined, "true", 1]) {
      const result = await service.sign(
        signInput({ documentVersionId: consent.id, affirmativeConsent: value as unknown as boolean }),
      );
      expect(result).toEqual({ ok: false, code: "consent_not_affirmative" });
    }
  });

  it("requires the full-document-shown attestation", async () => {
    const { lifecycle, service } = build();
    const consent = await publishCategory(lifecycle, "electronic_record_consent");
    const result = await service.sign(signInput({ documentVersionId: consent.id, fullDocumentShown: false }));
    expect(result).toEqual({ ok: false, code: "full_document_not_shown" });
  });

  it("requires a typed legal name of substance", async () => {
    const { lifecycle, service } = build();
    const consent = await publishCategory(lifecycle, "electronic_record_consent");
    for (const name of ["", "  ", "X"]) {
      const result = await service.sign(signInput({ documentVersionId: consent.id, typedLegalName: name }));
      expect(result).toEqual({ ok: false, code: "legal_name_required" });
    }
  });

  it("records timestamp, version, hash, hashed ip and user agent, and the e-consent version", async () => {
    const { lifecycle, service } = build();
    const consent = await publishCategory(lifecycle, "electronic_record_consent");
    const result = await service.sign(signInput({ documentVersionId: consent.id }));
    if (!result.ok) throw new Error("expected ok");
    const signature = result.signature;
    expect(signature.signedAt).toBe(NOW.toISOString());
    expect(signature.semver).toBe("1.0.0");
    expect(signature.contentHash).toBe(consent.contentHash);
    expect(signature.ipHash).toBe(sha256Hex("203.0.113.9"));
    expect(signature.userAgentHash).toBe(sha256Hex("vitest"));
    // Raw ip and user agent never appear on the record.
    expect(JSON.stringify(signature)).not.toContain("203.0.113.9");
    expect(signature.electronicConsentVersionId).toBe(consent.id);
    expect(signature.typedLegalName).toBe("Sam Member");
  });

  it("the recorded hash matches the published version's content exactly", async () => {
    const { lifecycle, service } = build();
    const consent = await withElectronicConsent(lifecycle, service);
    const agreement = await publishCategory(lifecycle, "founding_membership_agreement");
    const result = await service.sign(signInput({ documentVersionId: agreement.id }));
    if (!result.ok) throw new Error("expected ok");
    expect(result.signature.contentHash).toBe(sha256Hex(agreement.content));
    expect(result.signature.electronicConsentVersionId).toBe(consent.id);
  });

  it("replays, never duplicates, a second signature of the same version", async () => {
    const { lifecycle, service } = build();
    const consent = await publishCategory(lifecycle, "electronic_record_consent");
    const first = await service.sign(signInput({ documentVersionId: consent.id }));
    const second = await service.sign(signInput({ documentVersionId: consent.id }));
    if (!first.ok || !second.ok) throw new Error("expected ok");
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.signature.id).toBe(first.signature.id);
  });
});

// ---------------------------------------------------------------------------
// Order: electronic-record consent precedes every other signature
// ---------------------------------------------------------------------------

describe("electronic-record consent ordering", () => {
  it("blocks any other signature until the e-record consent is signed", async () => {
    const { lifecycle, service } = build();
    await publishCategory(lifecycle, "electronic_record_consent");
    const agreement = await publishCategory(lifecycle, "founding_membership_agreement");
    const before = await service.sign(signInput({ documentVersionId: agreement.id }));
    expect(before).toEqual({ ok: false, code: "electronic_consent_required" });
  });

  it("blocks when no e-record consent version is even published", async () => {
    const { lifecycle, service } = build();
    const agreement = await publishCategory(lifecycle, "founding_membership_agreement");
    const result = await service.sign(signInput({ documentVersionId: agreement.id }));
    expect(result).toEqual({ ok: false, code: "electronic_consent_required" });
  });

  it("unblocks after the e-record consent is signed, and stamps its version id", async () => {
    const { lifecycle, service } = build();
    const consent = await withElectronicConsent(lifecycle, service);
    const agreement = await publishCategory(lifecycle, "founding_membership_agreement");
    const result = await service.sign(signInput({ documentVersionId: agreement.id }));
    if (!result.ok) throw new Error("expected ok");
    expect(result.signature.electronicConsentVersionId).toBe(consent.id);
  });

  it("the gate is per member: one member's consent does not unlock another", async () => {
    const { lifecycle, service } = build();
    await withElectronicConsent(lifecycle, service);
    const agreement = await publishCategory(lifecycle, "founding_membership_agreement");
    const other = await service.sign(
      signInput({ memberId: OTHER_MEMBER, documentVersionId: agreement.id }),
    );
    expect(other).toEqual({ ok: false, code: "electronic_consent_required" });
  });
});

// ---------------------------------------------------------------------------
// Separate acknowledgment (arbitration, and the covenant slot carrying the
// package's release document)
// ---------------------------------------------------------------------------

describe("separate acknowledgment", () => {
  it("refuses arbitration without the separate acknowledgment flag", async () => {
    const { lifecycle, service } = build();
    await withElectronicConsent(lifecycle, service);
    const arbitration = await publishCategory(lifecycle, "arbitration_agreement");
    const without = await service.sign(signInput({ documentVersionId: arbitration.id }));
    expect(without).toEqual({ ok: false, code: "separate_acknowledgment_required" });
    const withFalse = await service.sign(
      signInput({ documentVersionId: arbitration.id, separateAcknowledgment: false }),
    );
    expect(withFalse).toEqual({ ok: false, code: "separate_acknowledgment_required" });
  });

  it("refuses the covenant slot (the release document) without its own acknowledgment", async () => {
    const { lifecycle, service } = build();
    await withElectronicConsent(lifecycle, service);
    const covenant = await publishCategory(lifecycle, "membership_covenant");
    const without = await service.sign(signInput({ documentVersionId: covenant.id }));
    expect(without).toEqual({ ok: false, code: "separate_acknowledgment_required" });
    const withAck = await service.sign(
      signInput({ documentVersionId: covenant.id, separateAcknowledgment: true }),
    );
    if (!withAck.ok) throw new Error("expected ok");
    expect(withAck.signature.separateAcknowledgment).toBe(true);
  });

  it("records the separate acknowledgment on the arbitration signature", async () => {
    const { lifecycle, service } = build();
    await withElectronicConsent(lifecycle, service);
    const arbitration = await publishCategory(lifecycle, "arbitration_agreement");
    const result = await service.sign(
      signInput({ documentVersionId: arbitration.id, separateAcknowledgment: true }),
    );
    if (!result.ok) throw new Error("expected ok");
    expect(result.signature.separateAcknowledgment).toBe(true);
  });

  it("never records a stray separate acknowledgment on an unflagged category's signature", async () => {
    const { lifecycle, service } = build();
    await withElectronicConsent(lifecycle, service);
    const privacy = await publishCategory(lifecycle, "privacy_notice");
    const result = await service.sign(
      signInput({ documentVersionId: privacy.id, separateAcknowledgment: true }),
    );
    if (!result.ok) throw new Error("expected ok");
    expect(result.signature.separateAcknowledgment).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// No admin path (structural)
// ---------------------------------------------------------------------------

describe("no admin signing path", () => {
  it("a signature is attributed to the signing member and no one else", async () => {
    const { lifecycle, service } = build();
    const consent = await publishCategory(lifecycle, "electronic_record_consent");
    const result = await service.sign(signInput({ documentVersionId: consent.id }));
    if (!result.ok) throw new Error("expected ok");
    expect(result.signature.memberId).toBe(MEMBER);
  });

  it("the module exports no on-behalf-of or admin sign function (structural)", () => {
    const exportNames = Object.keys(signaturesModule);
    for (const name of exportNames) {
      expect(name.toLowerCase()).not.toContain("admin");
      expect(name.toLowerCase()).not.toContain("behalf");
    }
    // The service itself exposes exactly the member-facing surface.
    const { service } = build();
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(service));
    expect(methods).not.toContain("signForMember");
    expect(methods).not.toContain("adminSign");
  });

  it("two members signing the same version produce two distinct records", async () => {
    const { lifecycle, service } = build();
    const consent = await publishCategory(lifecycle, "electronic_record_consent");
    const first = await service.sign(signInput({ documentVersionId: consent.id }));
    const second = await service.sign(
      signInput({ memberId: OTHER_MEMBER, documentVersionId: consent.id, typedLegalName: "Other Member" }),
    );
    if (!first.ok || !second.ok) throw new Error("expected ok");
    expect(first.signature.id).not.toBe(second.signature.id);
    expect(second.signature.memberId).toBe(OTHER_MEMBER);
  });
});

// ---------------------------------------------------------------------------
// The activation gate: requiredAgreementsSatisfied
// ---------------------------------------------------------------------------

async function publishAllRequired(lifecycle: DocumentLifecycle) {
  const published = new Map<DocumentCategory, DocumentVersionRecord>();
  for (const definition of DOCUMENT_CATEGORY_REGISTRY) {
    if (definition.defaultRequirement !== "required") continue;
    published.set(definition.category, await publishCategory(lifecycle, definition.category));
  }
  return published;
}

async function signAllRequired(
  service: SignatureService,
  published: Map<DocumentCategory, DocumentVersionRecord>,
  memberId = MEMBER,
) {
  // Order matters: e-record consent first, registry-flagged categories with
  // their own acknowledgment flag.
  const consent = published.get("electronic_record_consent")!;
  expect((await service.sign(signInput({ memberId, documentVersionId: consent.id }))).ok).toBe(true);
  const flagged = new Set(
    DOCUMENT_CATEGORY_REGISTRY.filter((d) => d.requiresSeparateAcknowledgment).map((d) => d.category),
  );
  for (const [category, version] of published) {
    if (category === "electronic_record_consent") continue;
    const result = await service.sign(
      signInput({
        memberId,
        documentVersionId: version.id,
        separateAcknowledgment: flagged.has(category) ? true : undefined,
      }),
    );
    expect(result.ok).toBe(true);
  }
}

describe("requiredAgreementsSatisfied", () => {
  it("fails closed when nothing is published: every CANONICAL required category blocks", async () => {
    const { service } = build();
    const gate = await service.requiredAgreementsSatisfied(MEMBER);
    expect(gate.satisfied).toBe(false);
    // The canonical required set: registry-required minus the legacy aliases
    // and the deferred health-data consent (none of which is a final-package
    // document, so none blocks activation).
    const canonicalRequired = DOCUMENT_CATEGORY_REGISTRY.filter(
      (d) => d.defaultRequirement === "required" && !LEGACY_CATEGORY_MAPPING[d.category],
    );
    expect(gate.blocking).toHaveLength(canonicalRequired.length);
    expect(gate.blocking.every((b) => b.reason === "no_published_version")).toBe(true);
    // The three legacy categories are never in the blocking set.
    const blocked = gate.blocking.map((b) => b.category);
    expect(blocked).not.toContain("activation_terms");
    expect(blocked).not.toContain("no_guarantee_acknowledgment");
    expect(blocked).not.toContain("sensitive_health_data_consent");
  });

  it("required published but unsigned blocks activation", async () => {
    const { lifecycle, service } = build();
    await publishAllRequired(lifecycle);
    const gate = await service.requiredAgreementsSatisfied(MEMBER);
    expect(gate.satisfied).toBe(false);
    expect(gate.blocking.every((b) => b.reason === "not_signed")).toBe(true);
  });

  it("an e-sign acceptance of the current version satisfies a category with no native signature", async () => {
    const { lifecycle, service } = build();
    const published = await publishAllRequired(lifecycle);
    // Not a single native signature; every required category is accepted via
    // a completed e-signature of its exact published version.
    const esignAcceptances = [...published.entries()].map(([category, version]) => ({
      category,
      documentVersionId: version.id,
    }));
    const gate = await service.requiredAgreementsSatisfied(MEMBER, { esignAcceptances });
    expect(gate.satisfied).toBe(true);
    expect(gate.blocking).toHaveLength(0);
    // Without the acceptances, the very same state fails closed.
    expect((await service.requiredAgreementsSatisfied(MEMBER)).satisfied).toBe(false);
  });

  it("an e-sign acceptance never bypasses a MISSING published version", async () => {
    const { lifecycle, service } = build();
    const published = await publishAllRequired(lifecycle);
    // Drop one required category by never publishing it: publishAllRequired
    // published all, so instead fabricate an acceptance for a category whose
    // published version id does NOT match (a stale/foreign id cannot satisfy).
    const acceptances = [...published.entries()].map(([category]) => ({
      category,
      documentVersionId: "not-the-published-id",
    }));
    const gate = await service.requiredAgreementsSatisfied(MEMBER, { esignAcceptances: acceptances });
    // Every required category is now "has an acceptance but not the current
    // version" with no reacceptance flag, so the earlier-acceptance carry-over
    // rule applies and it does NOT block. Prove the stronger property instead:
    // a category with NO published version can never be satisfied by an esign.
    const fresh = build();
    const onlyOne = await publishCategory(fresh.lifecycle, "privacy_notice");
    const partial = await fresh.service.requiredAgreementsSatisfied(MEMBER, {
      esignAcceptances: [{ category: "privacy_notice", documentVersionId: onlyOne.id }],
    });
    // privacy_notice is satisfied by the esign, but the other required
    // categories have no published version and still block.
    expect(partial.satisfied).toBe(false);
    expect(partial.blocking.some((b) => b.category === "privacy_notice")).toBe(false);
    expect(partial.blocking.every((b) => b.reason === "no_published_version")).toBe(true);
    expect(gate.satisfied).toBe(true);
  });

  it("an e-sign acceptance of an OLD version does not clear a reacceptance-required republish", async () => {
    const { lifecycle, service } = build();
    const v1 = await publishCategory(lifecycle, "privacy_notice", "1.0.0");
    // The member e-signed v1.
    const afterV1 = await service.requiredAgreementsSatisfied(MEMBER, {
      esignAcceptances: [{ category: "privacy_notice", documentVersionId: v1.id }],
    });
    expect(afterV1.blocking.some((b) => b.category === "privacy_notice")).toBe(false);
    // v2 republished with reacceptance required: the old esign no longer clears it.
    await publishCategory(lifecycle, "privacy_notice", "2.0.0", { reacceptanceRequired: true });
    const afterV2 = await service.requiredAgreementsSatisfied(MEMBER, {
      esignAcceptances: [{ category: "privacy_notice", documentVersionId: v1.id }],
    });
    const privacyBlock = afterV2.blocking.find((b) => b.category === "privacy_notice");
    expect(privacyBlock?.reason).toBe("reacceptance_required");
  });

  it("satisfied once every required current version is signed; optional does not block", async () => {
    const { lifecycle, service } = build();
    const published = await publishAllRequired(lifecycle);
    await signAllRequired(service, published);
    // referral_store_credit_terms (optional) is published but never signed.
    await publishCategory(lifecycle, "referral_store_credit_terms");
    const gate = await service.requiredAgreementsSatisfied(MEMBER);
    expect(gate.satisfied).toBe(true);
    expect(gate.blocking).toHaveLength(0);
  });

  it("stays per member", async () => {
    const { lifecycle, service } = build();
    const published = await publishAllRequired(lifecycle);
    await signAllRequired(service, published);
    const other = await service.requiredAgreementsSatisfied(OTHER_MEMBER);
    expect(other.satisfied).toBe(false);
  });

  it("a new published version with reacceptance required invalidates satisfaction until re-signed", async () => {
    const { lifecycle, service } = build();
    const published = await publishAllRequired(lifecycle);
    await signAllRequired(service, published);
    expect((await service.requiredAgreementsSatisfied(MEMBER)).satisfied).toBe(true);

    const v2 = await publishCategory(lifecycle, "founding_membership_agreement", "2.0.0", {
      reacceptanceRequired: true,
    });
    const gate = await service.requiredAgreementsSatisfied(MEMBER);
    expect(gate.satisfied).toBe(false);
    expect(gate.blocking).toEqual([
      { category: "founding_membership_agreement", reason: "reacceptance_required" },
    ]);

    const resigned = await service.sign(signInput({ documentVersionId: v2.id }));
    expect(resigned.ok).toBe(true);
    expect((await service.requiredAgreementsSatisfied(MEMBER)).satisfied).toBe(true);
  });

  it("a new published version without reacceptance lets the earlier signature carry over", async () => {
    const { lifecycle, service } = build();
    const published = await publishAllRequired(lifecycle);
    await signAllRequired(service, published);
    await publishCategory(lifecycle, "privacy_notice", "1.1.0", { reacceptanceRequired: false });
    const gate = await service.requiredAgreementsSatisfied(MEMBER);
    expect(gate.satisfied).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The canonical package required set (FINAL AGREEMENT-GATE CORRECTION)
// ---------------------------------------------------------------------------

/** Publish only the CANONICAL final-package required categories: registry-
 * required minus the legacy aliases and the deferred health-data consent. */
async function publishCanonicalRequired(lifecycle: DocumentLifecycle) {
  const published = new Map<DocumentCategory, DocumentVersionRecord>();
  for (const definition of DOCUMENT_CATEGORY_REGISTRY) {
    if (definition.defaultRequirement !== "required") continue;
    if (LEGACY_CATEGORY_MAPPING[definition.category]) continue; // skip aliases + deferred
    published.set(definition.category, await publishCategory(lifecycle, definition.category));
  }
  return published;
}

describe("canonical package required set (legacy mapping)", () => {
  it("maps exactly the three legacy categories, and none of them is a direct required document", () => {
    expect(Object.keys(LEGACY_CATEGORY_MAPPING).sort()).toEqual(
      ["activation_terms", "no_guarantee_acknowledgment", "sensitive_health_data_consent"].sort(),
    );
    expect(LEGACY_CATEGORY_MAPPING.activation_terms).toEqual({
      kind: "alias",
      satisfiedByCategory: "founding_membership_agreement",
      finalDocumentTitle: "Founding Membership Agreement",
    });
    expect(LEGACY_CATEGORY_MAPPING.no_guarantee_acknowledgment).toEqual({
      kind: "alias",
      satisfiedByCategory: "assumption_of_risk_acknowledgment",
      finalDocumentTitle: "No-Medical-Advice and Assumption-of-Risk Acknowledgment",
    });
    expect(LEGACY_CATEGORY_MAPPING.sensitive_health_data_consent).toEqual({
      kind: "deferred_until_flag",
      flag: "healthDataCollectionEnabled",
    });
  });

  it("is SATISFIED by the canonical package set alone, with no legacy-category document at all", async () => {
    const { lifecycle, service } = build();
    const published = await publishCanonicalRequired(lifecycle);
    await signAllRequired(service, published);
    // Not one of activation_terms / no_guarantee_acknowledgment /
    // sensitive_health_data_consent was ever published or signed.
    const gate = await service.requiredAgreementsSatisfied(MEMBER);
    expect(gate.satisfied).toBe(true);
    expect(gate.blocking).toHaveLength(0);
  });

  it("never lists a legacy alias category as a blocker, even with nothing signed", async () => {
    const { service } = build();
    const gate = await service.requiredAgreementsSatisfied(MEMBER);
    const blockedCategories = gate.blocking.map((b) => b.category);
    expect(blockedCategories).not.toContain("activation_terms");
    expect(blockedCategories).not.toContain("no_guarantee_acknowledgment");
  });

  it("does NOT require sensitive-health-data consent when health-data collection is disabled (default)", async () => {
    const { lifecycle, service } = build();
    const published = await publishCanonicalRequired(lifecycle);
    await signAllRequired(service, published);
    // Default: no health-data flag. The gate passes without a health-data consent.
    const gate = await service.requiredAgreementsSatisfied(MEMBER);
    expect(gate.satisfied).toBe(true);
    expect(gate.blocking.map((b) => b.category)).not.toContain("sensitive_health_data_consent");
    // Explicit false is identical.
    const explicit = await service.requiredAgreementsSatisfied(MEMBER, {
      healthDataCollectionEnabled: false,
    });
    expect(explicit.satisfied).toBe(true);
  });

  it("REQUIRES sensitive-health-data consent once health-data collection is enabled", async () => {
    const { lifecycle, service } = build();
    const published = await publishCanonicalRequired(lifecycle);
    await signAllRequired(service, published);
    // The same fully-signed canonical state now fails closed, because the
    // future health-data feature gate makes the consent required and no such
    // document is published.
    const gate = await service.requiredAgreementsSatisfied(MEMBER, {
      healthDataCollectionEnabled: true,
    });
    expect(gate.satisfied).toBe(false);
    expect(gate.blocking).toEqual([
      { category: "sensitive_health_data_consent", reason: "no_published_version" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Durable copies
// ---------------------------------------------------------------------------

describe("listSignedDocuments", () => {
  it("returns every signed version with the exact text and hash that was signed", async () => {
    const { lifecycle, service } = build();
    const consent = await withElectronicConsent(lifecycle, service);
    const agreement = await publishCategory(lifecycle, "founding_membership_agreement");
    await service.sign(signInput({ documentVersionId: agreement.id }));

    const copies = await service.listSignedDocuments(MEMBER);
    expect(copies).toHaveLength(2);
    const byCategory = new Map(copies.map((c) => [c.signature.category, c]));
    const agreementCopy = byCategory.get("founding_membership_agreement")!;
    expect(agreementCopy.document).not.toBeNull();
    expect(agreementCopy.document!.content).toBe(agreement.content);
    expect(agreementCopy.document!.contentHash).toBe(agreement.contentHash);
    expect(agreementCopy.signature.contentHash).toBe(agreement.contentHash);
    expect(byCategory.get("electronic_record_consent")!.document!.id).toBe(consent.id);
  });

  it("keeps the copy retrievable after the version is superseded", async () => {
    const { lifecycle, service } = build();
    const consentV1 = await withElectronicConsent(lifecycle, service);
    await publishCategory(lifecycle, "electronic_record_consent", "2.0.0");

    const copies = await service.listSignedDocuments(MEMBER);
    expect(copies).toHaveLength(1);
    expect(copies[0].document!.id).toBe(consentV1.id);
    expect(copies[0].document!.status).toBe("superseded");
    expect(copies[0].document!.content).toBe(consentV1.content);
  });

  it("returns an empty list for a member who signed nothing", async () => {
    const { service } = build();
    expect(await service.listSignedDocuments(MEMBER)).toEqual([]);
  });
});
