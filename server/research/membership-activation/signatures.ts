import crypto from "crypto";
import {
  categoryDefinitionFor,
  sha256Hex,
  DOCUMENT_CATEGORY_REGISTRY,
  type DocumentCategory,
  type DocumentVersionRecord,
  type DocumentVersionsStore,
} from "./documents";

// ---------------------------------------------------------------------------
// xenios research founding membership activation: e-signatures.
//
// A signature binds ONE member to ONE PUBLISHED document version. Structural
// rules, enforced in code here and again by the database triggers in
// supabase/research-fm-agreements.sql:
//
//   - A draft (or any non-published version) can never be signed. The sign
//     path looks the version up and refuses everything but status published.
//   - Affirmative consent is never prechecked: the blank form state this
//     module exports carries false, and sign() requires the literal true.
//   - The electronic-record consent must be signed before any other document.
//   - Categories the registry flags (arbitration, and the covenant slot that
//     carries the package's release and waiver document) require their own
//     separate acknowledgment flag; it is never bundled into a general
//     consent.
//   - There is NO admin signing path. The only signer identity a signature
//     can carry is the member the record belongs to; no input field exists
//     for signing on someone's behalf, and none may be added.
//   - The audit record is immutable: the store port has no update and no
//     delete for signatures, and the table has an append-only trigger.
//
// Privacy: IP and user agent are stored as sha-256 hashes only, matching the
// agreements engine. The typed legal name is part of the legal record itself.
// ---------------------------------------------------------------------------

export interface SignatureRecord {
  id: string;
  memberId: string;
  documentVersionId: string;
  category: DocumentCategory;
  /** The semver of the version at signing, denormalized into the record. */
  semver: string;
  /** The content hash of the exact text shown, denormalized into the record. */
  contentHash: string;
  /** The name the member typed as their signature. */
  typedLegalName: string;
  /** Attestation that the full document was rendered to the member. */
  fullDocumentShown: true;
  /** The affirmative, never-prechecked consent action. */
  affirmativeConsent: true;
  /** True only where the registry requires it (its own acknowledgment step). */
  separateAcknowledgment: boolean;
  /**
   * The electronic-record consent version in force for this signature. For
   * the electronic-record consent itself this is its own version id.
   */
  electronicConsentVersionId: string;
  ipHash: string | null;
  userAgentHash: string | null;
  signedAt: string;
}

/** The signatures side of the persistence port. Append-only by construction. */
export interface SignaturesStore {
  /** Insert one signature. Throws DuplicateSignature on (member, version) replay. */
  insertSignature(record: SignatureRecord): Promise<void>;
  getSignature(memberId: string, documentVersionId: string): Promise<SignatureRecord | null>;
  listSignaturesForMember(memberId: string): Promise<readonly SignatureRecord[]>;
}

export class DuplicateSignature extends Error {
  constructor(memberId: string, documentVersionId: string) {
    super(`Member already signed document version ${documentVersionId}.`);
    this.name = "DuplicateSignature";
  }
}

/**
 * The blank state a signature form starts from. Exported so every surface
 * consumes the same structural fact: nothing is prechecked, ever.
 */
export function newSignatureFormState(): {
  affirmativeConsent: false;
  fullDocumentShown: false;
  separateAcknowledgment: false;
  typedLegalName: "";
} {
  return {
    affirmativeConsent: false,
    fullDocumentShown: false,
    separateAcknowledgment: false,
    typedLegalName: "",
  };
}

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

export interface SignDocumentInput {
  /** The member signing. This is the ONLY identity a signature can carry. */
  memberId: string;
  documentVersionId: string;
  typedLegalName: string;
  /** Must be the literal true: the member saw the full rendered document. */
  fullDocumentShown: boolean;
  /** Must be the literal true: an affirmative act, never a default. */
  affirmativeConsent: boolean;
  /** Required true where the registry flags it; ignored (recorded false) elsewhere. */
  separateAcknowledgment?: boolean;
  ip?: string | null;
  userAgent?: string | null;
}

export type SignFailureCode =
  | "version_not_found"
  | "not_published"
  | "full_document_not_shown"
  | "consent_not_affirmative"
  | "legal_name_required"
  | "electronic_consent_required"
  | "separate_acknowledgment_required"
  | "storage_error";

export type SignResult =
  | { ok: true; signature: SignatureRecord; replayed: boolean }
  | { ok: false; code: SignFailureCode };

export interface SignatureServiceOptions {
  now?: () => Date;
  newId?: () => string;
}

export type SignaturesBackingStore = DocumentVersionsStore & SignaturesStore;

export class SignatureService {
  private readonly now: () => Date;
  private readonly newId: () => string;

  constructor(
    private readonly store: SignaturesBackingStore,
    options: SignatureServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.newId = options.newId ?? (() => crypto.randomUUID());
  }

  async sign(input: SignDocumentInput): Promise<SignResult> {
    const version = await this.store.getVersion(input.documentVersionId);
    if (!version) return { ok: false, code: "version_not_found" };

    // A DRAFT CAN NEVER BE SIGNED. Neither can under_legal_review, approved,
    // scheduled, superseded, archived, or withdrawn text: published only.
    if (version.status !== "published") return { ok: false, code: "not_published" };

    if (input.fullDocumentShown !== true) return { ok: false, code: "full_document_not_shown" };
    if (input.affirmativeConsent !== true) return { ok: false, code: "consent_not_affirmative" };

    const typedLegalName = (input.typedLegalName ?? "").trim();
    if (typedLegalName.length < 2) return { ok: false, code: "legal_name_required" };

    // Order gate: the electronic-record consent comes before everything else.
    let electronicConsentVersionId: string;
    if (version.category === "electronic_record_consent") {
      electronicConsentVersionId = version.id;
    } else {
      const consent = await this.satisfyingSignature(input.memberId, "electronic_record_consent");
      if (!consent) return { ok: false, code: "electronic_consent_required" };
      electronicConsentVersionId = consent.documentVersionId;
    }

    // Registry-flagged categories carry their own acknowledgment; nothing
    // else may claim one.
    const definition = categoryDefinitionFor(version.category);
    if (definition.requiresSeparateAcknowledgment && input.separateAcknowledgment !== true) {
      return { ok: false, code: "separate_acknowledgment_required" };
    }

    const existing = await this.store.getSignature(input.memberId, version.id);
    if (existing) return { ok: true, signature: existing, replayed: true };

    const record: SignatureRecord = {
      id: this.newId(),
      memberId: input.memberId,
      documentVersionId: version.id,
      category: version.category,
      semver: version.semver,
      contentHash: version.contentHash,
      typedLegalName,
      fullDocumentShown: true,
      affirmativeConsent: true,
      separateAcknowledgment: definition.requiresSeparateAcknowledgment,
      electronicConsentVersionId,
      ipHash: input.ip ? sha256Hex(input.ip) : null,
      userAgentHash: input.userAgent ? sha256Hex(input.userAgent) : null,
      signedAt: this.now().toISOString(),
    };

    try {
      await this.store.insertSignature(record);
    } catch (error) {
      if (error instanceof DuplicateSignature) {
        // Two racing submits: the database unique constraint let one in.
        const winner = await this.store.getSignature(input.memberId, version.id);
        if (winner) return { ok: true, signature: winner, replayed: true };
      }
      return { ok: false, code: "storage_error" };
    }
    return { ok: true, signature: record, replayed: false };
  }

  /**
   * The member's durable copies: every signed version with the exact text and
   * hash that was signed, retrievable at any time, superseded versions
   * included.
   */
  async listSignedDocuments(memberId: string): Promise<
    Array<{
      signature: SignatureRecord;
      document: {
        id: string;
        category: DocumentCategory;
        title: string;
        semver: string;
        status: DocumentVersionRecord["status"];
        content: string;
        contentHash: string;
        jurisdiction: string;
        publishedAt: string | null;
        effectiveDate: string | null;
        downloadRef: string | null;
      } | null;
    }>
  > {
    const signatures = await this.store.listSignaturesForMember(memberId);
    const out = [];
    for (const signature of signatures) {
      const version = await this.store.getVersion(signature.documentVersionId);
      out.push({
        signature,
        document: version
          ? {
              id: version.id,
              category: version.category,
              title: version.title,
              semver: version.semver,
              status: version.status,
              content: version.content,
              contentHash: version.contentHash,
              jurisdiction: version.jurisdiction,
              publishedAt: version.publishedAt,
              effectiveDate: version.effectiveDate,
              downloadRef: version.downloadRef,
            }
          : null,
      });
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // The activation gate
  // -------------------------------------------------------------------------

  /**
   * True when every required agreement is satisfied for the member. FAILS
   * CLOSED: a required category with no published version blocks activation
   * (nothing to sign is not the same as signed), and a newly published
   * version with reacceptanceRequired invalidates satisfaction until the
   * member re-signs. A version published with reacceptanceRequired false
   * lets a signature on an earlier version of the category carry over.
   *
   * A category can be satisfied by a NATIVE signature (this engine) OR by a
   * completed e-signature (OpenSign) acceptance passed in `opts`. The e-sign
   * acceptances are ADDITIVE and can only ever SATISFY a category for a
   * published version's exact id; they never bypass a missing published
   * version, never relax reacceptance, and default to empty so a caller that
   * passes nothing sees byte-identical native-only behavior. This is the one
   * place the two execution paths converge, and it stays the source of gate
   * truth.
   */
  async requiredAgreementsSatisfied(
    memberId: string,
    opts?: { esignAcceptances?: readonly EsignAcceptance[] },
  ): Promise<AgreementsGateResult> {
    const signatures = await this.store.listSignaturesForMember(memberId);
    const byCategory = new Map<DocumentCategory, SignatureRecord[]>();
    for (const signature of signatures) {
      const list = byCategory.get(signature.category) ?? [];
      list.push(signature);
      byCategory.set(signature.category, list);
    }

    // E-sign completions grouped by category, as a set of accepted version ids.
    const esignByCategory = new Map<DocumentCategory, Set<string>>();
    for (const acceptance of opts?.esignAcceptances ?? []) {
      const set = esignByCategory.get(acceptance.category) ?? new Set<string>();
      set.add(acceptance.documentVersionId);
      esignByCategory.set(acceptance.category, set);
    }

    const blocking: AgreementsGateResult["blocking"] = [];
    for (const definition of DOCUMENT_CATEGORY_REGISTRY) {
      const published = await this.store.getPublished(definition.category);
      if (!published) {
        if (definition.defaultRequirement === "required") {
          blocking.push({ category: definition.category, reason: "no_published_version" });
        }
        continue;
      }
      if (published.requirement !== "required") continue;

      const signed = byCategory.get(definition.category) ?? [];
      const esigned = esignByCategory.get(definition.category) ?? new Set<string>();
      const currentAccepted =
        signed.some((s) => s.documentVersionId === published.id) || esigned.has(published.id);
      if (currentAccepted) continue;

      const hasAnyAcceptance = signed.length > 0 || esigned.size > 0;
      if (!hasAnyAcceptance) {
        blocking.push({ category: definition.category, reason: "not_signed" });
      } else if (published.reacceptanceRequired) {
        blocking.push({ category: definition.category, reason: "reacceptance_required" });
      }
      // An earlier acceptance (native or e-sign) with no reacceptance required
      // carries over and does not block.
    }
    return { satisfied: blocking.length === 0, blocking };
  }

  private async satisfyingSignature(
    memberId: string,
    category: DocumentCategory,
  ): Promise<SignatureRecord | null> {
    const published = await this.store.getPublished(category);
    if (!published) return null;
    const signatures = (await this.store.listSignaturesForMember(memberId)).filter(
      (s) => s.category === category,
    );
    const current = signatures.find((s) => s.documentVersionId === published.id);
    if (current) return current;
    if (!published.reacceptanceRequired && signatures.length > 0) return signatures[0];
    return null;
  }
}

/**
 * A completed e-signature (OpenSign) acceptance of one Xenios document version.
 * The routes layer builds these from the member's completed signing requests
 * and passes them into requiredAgreementsSatisfied so an e-signed category
 * counts exactly like a natively signed one, for the published version id.
 */
export interface EsignAcceptance {
  category: DocumentCategory;
  documentVersionId: string;
}

export interface AgreementsGateResult {
  satisfied: boolean;
  blocking: Array<{
    category: DocumentCategory;
    reason: "no_published_version" | "not_signed" | "reacceptance_required";
  }>;
}
