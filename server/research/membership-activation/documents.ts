import crypto from "crypto";
import {
  AGREEMENT_DEFINITIONS,
  type AgreementDefinition,
} from "../agreements";

// ---------------------------------------------------------------------------
// xenios research founding membership activation: versioned agreement documents.
//
// This is the versioned document LIFECYCLE that sits ABOVE the existing
// agreements engine (server/research/agreements.ts). The engine's
// AGREEMENT_DEFINITIONS remain the acceptance-key register for the paperwork
// bundle; this module adds what the engine deliberately does not have: a full
// document version object (content, jurisdiction, effective date, publisher,
// counsel review), a guarded draft -> published -> superseded lifecycle, and
// the structural rule that A DRAFT CAN NEVER BE SIGNED. Categories that map
// to an engine key carry that key (agreementKey) so the two registers stay
// linked, never duplicated.
//
// Everything here is library code. Nothing routes, nothing is reachable
// pre-auth, and the surface wave gates every consumer behind the default-false
// RESEARCH_FOUNDING_ACTIVATION_ENABLED flag. Seeded content is PLACEHOLDER
// text in draft state; this module invents no legal conclusions and no
// document leaves draft without a counsel-review approval recorded on it.
// ---------------------------------------------------------------------------

export function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// The sixteen document categories of the founding membership activation spec.
// ---------------------------------------------------------------------------

export const DOCUMENT_CATEGORIES = [
  "electronic_record_consent",
  "founding_membership_agreement",
  "activation_terms",
  "recurring_membership_authorization",
  "immediate_cancellation_acknowledgment",
  "membership_covenant",
  "confidentiality_covenant",
  "privacy_notice",
  "research_education_disclaimer",
  "assumption_of_risk_acknowledgment",
  "no_guarantee_acknowledgment",
  "arbitration_agreement",
  "manual_payment_bridge_terms",
  "identity_age_verification_consent",
  "sensitive_health_data_consent",
  "referral_store_credit_terms",
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

/** The activation steps a required document can be bound to. */
export const ACTIVATION_STEPS = [
  // The electronic-record consent step. Always first: no other signature can
  // be captured until the member has consented to electronic records.
  "electronic_consent",
  // The main agreements step of the activation flow.
  "activation_agreements",
  // The arbitration acknowledgment step (its own screen, its own checkbox).
  "arbitration_acknowledgment",
  // The recurring $25 renewal authorization step, after the activation payment.
  "recurring_authorization",
  // The manual external payment bridge disclosure step (phase A).
  "payment_bridge",
  // First entry into the mandatory assessment.
  "assessment_entry",
] as const;

export type ActivationStep = (typeof ACTIVATION_STEPS)[number];

export type DocumentRequirement = "required" | "optional";

export interface DocumentCategoryDefinition {
  category: DocumentCategory;
  title: string;
  /** Default requirement for versions of this category (a version may narrow it). */
  defaultRequirement: DocumentRequirement;
  /** The activation step where a required category must be satisfied. */
  activationStep: ActivationStep | null;
  /**
   * True where the paper demands its own separate acknowledgment, never
   * bundled into a general consent: arbitration, and the membership covenant
   * slot (which carries the package's release and waiver document, XR-LEGAL-17,
   * with its required separate conspicuous acceptance).
   */
  requiresSeparateAcknowledgment: boolean;
  /** Link into the existing agreements engine where a key exists, else null. */
  agreementKey: string | null;
  /** Presentation order in the activation flow. */
  ordering: number;
}

function categoryDefinition(
  ordering: number,
  category: DocumentCategory,
  title: string,
  options: {
    requirement?: DocumentRequirement;
    step?: ActivationStep | null;
    separateAck?: boolean;
    agreementKey?: string | null;
  } = {},
): DocumentCategoryDefinition {
  return {
    category,
    title,
    defaultRequirement: options.requirement ?? "required",
    activationStep: options.step === undefined ? "activation_agreements" : options.step,
    requiresSeparateAcknowledgment: options.separateAck === true,
    agreementKey: options.agreementKey ?? null,
    ordering,
  };
}

/**
 * The typed registry of the sixteen categories. Where the existing agreements
 * engine already registers a key for the same paper, that key is carried here
 * so the systems extend each other instead of duplicating.
 */
export const DOCUMENT_CATEGORY_REGISTRY: readonly DocumentCategoryDefinition[] = [
  categoryDefinition(1, "electronic_record_consent", "Electronic Records and Signatures Consent", {
    step: "electronic_consent",
    agreementKey: "XR-PUB-007",
  }),
  categoryDefinition(2, "founding_membership_agreement", "Founding Membership Agreement", {
    agreementKey: "XR-MEM-001",
  }),
  categoryDefinition(3, "activation_terms", "$50 Activation Terms", {
    agreementKey: "XR-MEM-002",
  }),
  categoryDefinition(4, "recurring_membership_authorization", "$25 Recurring Membership Authorization", {
    step: "recurring_authorization",
    agreementKey: "XR-MEM-003",
  }),
  categoryDefinition(5, "immediate_cancellation_acknowledgment", "Immediate Cancellation Acknowledgment", {
    agreementKey: "XR-MEM-004",
  }),
  // The covenant slot carries the legal package's release, waiver, covenant
  // not to sue, limitation of liability and indemnification (XR-LEGAL-17),
  // which the package requires to be accepted with its own separate
  // conspicuous acknowledgment (like arbitration, never bundled).
  categoryDefinition(6, "membership_covenant", "Membership Covenant", {
    agreementKey: "XR-MEM-005",
    separateAck: true,
  }),
  categoryDefinition(7, "confidentiality_covenant", "Private Membership Confidentiality Covenant", {
    agreementKey: "XR-MEM-006",
  }),
  categoryDefinition(8, "privacy_notice", "Privacy Notice"),
  categoryDefinition(9, "research_education_disclaimer", "Research and Education Disclaimer"),
  categoryDefinition(10, "assumption_of_risk_acknowledgment", "Assumption of Risk Acknowledgment"),
  categoryDefinition(11, "no_guarantee_acknowledgment", "No Guarantee and Outcomes Acknowledgment"),
  categoryDefinition(12, "arbitration_agreement", "Arbitration Agreement", {
    step: "arbitration_acknowledgment",
    separateAck: true,
  }),
  categoryDefinition(13, "manual_payment_bridge_terms", "Manual External Payment Bridge Terms", {
    step: "payment_bridge",
  }),
  categoryDefinition(14, "identity_age_verification_consent", "Identity and Age Verification Consent"),
  categoryDefinition(15, "sensitive_health_data_consent", "Sensitive Health Data Consent", {
    step: "assessment_entry",
    agreementKey: "XR-MEM-012",
  }),
  categoryDefinition(16, "referral_store_credit_terms", "Referral and Store Credit Terms", {
    requirement: "optional",
    step: null,
    agreementKey: "XR-MEM-026",
  }),
];

const REGISTRY_BY_CATEGORY: ReadonlyMap<DocumentCategory, DocumentCategoryDefinition> = new Map(
  DOCUMENT_CATEGORY_REGISTRY.map((d) => [d.category, d]),
);

export function categoryDefinitionFor(category: DocumentCategory): DocumentCategoryDefinition {
  const definition = REGISTRY_BY_CATEGORY.get(category);
  if (!definition) throw new InvalidDocumentInput(`Unknown document category: ${category}.`);
  return definition;
}

/**
 * Every agreementKey the registry links must exist in the agreements engine,
 * so the two registers cannot silently drift. Checked at module load.
 */
function assertAgreementLinks(definitions: readonly AgreementDefinition[]): void {
  const engineKeys = new Set(definitions.map((d) => d.key));
  for (const entry of DOCUMENT_CATEGORY_REGISTRY) {
    if (entry.agreementKey !== null && !engineKeys.has(entry.agreementKey)) {
      throw new Error(
        `Document category ${entry.category} links agreement key ${entry.agreementKey}, ` +
          "which the agreements engine does not register.",
      );
    }
  }
}
assertAgreementLinks(AGREEMENT_DEFINITIONS);

// ---------------------------------------------------------------------------
// Document version lifecycle
// ---------------------------------------------------------------------------

export const DOCUMENT_STATUSES = [
  "draft",
  "under_legal_review",
  "approved_for_publication",
  "scheduled",
  "published",
  "superseded",
  "archived",
  "withdrawn",
] as const;

export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

/**
 * The guarded transition map. Anything not listed is refused. "published" is
 * reachable only through publish(), which owns the publication invariants;
 * transition() refuses it so no caller can publish without them.
 */
export const ALLOWED_TRANSITIONS: Readonly<Record<DocumentStatus, readonly DocumentStatus[]>> = {
  draft: ["under_legal_review", "withdrawn"],
  under_legal_review: ["draft", "approved_for_publication", "withdrawn"],
  approved_for_publication: ["scheduled", "published", "withdrawn"],
  scheduled: ["published", "approved_for_publication", "withdrawn"],
  published: ["superseded", "withdrawn"],
  superseded: ["archived"],
  archived: [],
  withdrawn: [],
};

export type CounselReviewState = "not_reviewed" | "under_review" | "changes_requested" | "approved";

/** A single immutable version of one agreement document. */
export interface DocumentVersionRecord {
  id: string;
  category: DocumentCategory;
  title: string;
  /** Semantic version of this document text, e.g. "1.0.0". */
  semver: string;
  status: DocumentStatus;
  /** ISO date (YYYY-MM-DD) the version takes effect. Server-set at publish. */
  effectiveDate: string | null;
  /** ISO timestamp of publication. Server-set at publish, never client-supplied. */
  publishedAt: string | null;
  jurisdiction: string;
  /** The full rendered document content a signer is shown. */
  content: string;
  /** sha-256 hex of content. Computed server-side; immutable once published. */
  contentHash: string;
  /** Reference to a downloadable representation (media provider ref), if any. */
  downloadRef: string | null;
  requirement: DocumentRequirement;
  /** The activation step this version is required at (null when optional). */
  activationStep: ActivationStep | null;
  /**
   * When true, publishing this version invalidates satisfaction from earlier
   * versions: every member must re-sign before the gate passes again.
   */
  reacceptanceRequired: boolean;
  /** Mirrored from the category registry (arbitration and the covenant slot). */
  requiresSeparateAcknowledgment: boolean;
  /** The id of the version this one superseded at publish, if any. */
  supersededVersionId: string | null;
  /** Who published (an internal actor label, never a member). */
  publisher: string | null;
  counselReview: CounselReviewState;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

const SEMVER_PATTERN = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class DocumentNotFound extends Error {
  constructor(id: string) {
    super(`No document version ${id}.`);
    this.name = "DocumentNotFound";
  }
}

export class InvalidTransition extends Error {
  constructor(from: DocumentStatus, to: DocumentStatus) {
    super(`A ${from} document version cannot move to ${to}.`);
    this.name = "InvalidTransition";
  }
}

export class DocumentImmutable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentImmutable";
  }
}

export class PublicationBlocked extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicationBlocked";
  }
}

export class InvalidDocumentInput extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDocumentInput";
  }
}

// ---------------------------------------------------------------------------
// The store port the lifecycle writes through. Implemented by
// persistence/documents-store.ts (in-memory reference and Supabase). There is
// deliberately NO delete method: superseded and withdrawn versions remain on
// record forever, because signatures reference them.
// ---------------------------------------------------------------------------

export interface DocumentVersionsStore {
  insertVersion(record: DocumentVersionRecord): Promise<void>;
  /** Full-record update by id. The lifecycle service is the only writer. */
  updateVersion(record: DocumentVersionRecord): Promise<void>;
  getVersion(id: string): Promise<DocumentVersionRecord | null>;
  listVersions(category?: DocumentCategory): Promise<readonly DocumentVersionRecord[]>;
  /** The single currently published version of a category, if any. */
  getPublished(category: DocumentCategory): Promise<DocumentVersionRecord | null>;
}

// ---------------------------------------------------------------------------
// Lifecycle service
// ---------------------------------------------------------------------------

export interface CreateDraftInput {
  category: DocumentCategory;
  title?: string;
  semver: string;
  jurisdiction: string;
  content: string;
  requirement?: DocumentRequirement;
  activationStep?: ActivationStep | null;
  reacceptanceRequired?: boolean;
  downloadRef?: string | null;
  notes?: string | null;
}

export interface LifecycleOptions {
  now?: () => Date;
  newId?: () => string;
}

export class DocumentLifecycle {
  private readonly now: () => Date;
  private readonly newId: () => string;

  constructor(
    private readonly store: DocumentVersionsStore,
    options: LifecycleOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.newId = options.newId ?? (() => crypto.randomUUID());
  }

  /**
   * Create a new draft version. The content hash is computed here, server
   * side, from the exact content; a caller can never supply its own hash.
   */
  async createDraft(input: CreateDraftInput): Promise<DocumentVersionRecord> {
    const definition = categoryDefinitionFor(input.category);
    if (!SEMVER_PATTERN.test(input.semver)) {
      throw new InvalidDocumentInput(`"${input.semver}" is not a semantic version.`);
    }
    if (!input.content || input.content.trim().length === 0) {
      throw new InvalidDocumentInput("A document version needs content, even as a marked placeholder.");
    }
    if (!input.jurisdiction || input.jurisdiction.trim().length === 0) {
      throw new InvalidDocumentInput("A document version needs a jurisdiction field.");
    }
    const nowIso = this.now().toISOString();
    const record: DocumentVersionRecord = {
      id: this.newId(),
      category: input.category,
      title: input.title ?? definition.title,
      semver: input.semver,
      status: "draft",
      effectiveDate: null,
      publishedAt: null,
      jurisdiction: input.jurisdiction,
      content: input.content,
      contentHash: sha256Hex(input.content),
      downloadRef: input.downloadRef ?? null,
      requirement: input.requirement ?? definition.defaultRequirement,
      activationStep:
        input.activationStep === undefined ? definition.activationStep : input.activationStep,
      reacceptanceRequired: input.reacceptanceRequired === true,
      // Structural: the separate-acknowledgment flag comes from the registry,
      // never from the caller, so arbitration can never lose it.
      requiresSeparateAcknowledgment: definition.requiresSeparateAcknowledgment,
      supersededVersionId: null,
      publisher: null,
      counselReview: "not_reviewed",
      notes: input.notes ?? null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    await this.store.insertVersion(record);
    return record;
  }

  /**
   * Edit content while, and only while, the version is a draft. Any state at
   * or past legal review is frozen text: counsel reviewed those exact words.
   */
  async updateDraftContent(id: string, content: string, notes?: string | null): Promise<DocumentVersionRecord> {
    const record = await this.mustGet(id);
    if (record.status !== "draft") {
      throw new DocumentImmutable(
        `Version ${id} is ${record.status}; content is only editable in draft. ` +
          "Create a new draft version instead.",
      );
    }
    if (!content || content.trim().length === 0) {
      throw new InvalidDocumentInput("A document version needs content.");
    }
    const updated: DocumentVersionRecord = {
      ...record,
      content,
      contentHash: sha256Hex(content),
      notes: notes === undefined ? record.notes : notes,
      updatedAt: this.now().toISOString(),
    };
    await this.store.updateVersion(updated);
    return updated;
  }

  /** Record the counsel-review state. Only meaningful before publication. */
  async setCounselReview(id: string, review: CounselReviewState, notes?: string | null): Promise<DocumentVersionRecord> {
    const record = await this.mustGet(id);
    if (record.status !== "draft" && record.status !== "under_legal_review") {
      throw new DocumentImmutable(
        `Counsel review is recorded during draft or legal review; version ${id} is ${record.status}.`,
      );
    }
    const updated: DocumentVersionRecord = {
      ...record,
      counselReview: review,
      notes: notes === undefined ? record.notes : notes,
      updatedAt: this.now().toISOString(),
    };
    await this.store.updateVersion(updated);
    return updated;
  }

  /**
   * Guarded status transition. Publication is refused here: publish() is the
   * only door into "published" because it owns the invariants (counsel
   * approval, hash integrity, supersession, server-set timestamps).
   */
  async transition(id: string, to: DocumentStatus): Promise<DocumentVersionRecord> {
    if (to === "published") {
      throw new InvalidTransition((await this.mustGet(id)).status, "published");
    }
    const record = await this.mustGet(id);
    if (!ALLOWED_TRANSITIONS[record.status].includes(to)) {
      throw new InvalidTransition(record.status, to);
    }
    if (to === "approved_for_publication" && record.counselReview !== "approved") {
      throw new PublicationBlocked(
        `Version ${id} cannot be approved for publication: counsel review is ` +
          `${record.counselReview}, not approved.`,
      );
    }
    const updated: DocumentVersionRecord = {
      ...record,
      status: to,
      updatedAt: this.now().toISOString(),
    };
    await this.store.updateVersion(updated);
    return updated;
  }

  /**
   * Publish an approved (or scheduled) version. Sets publishedAt and
   * effectiveDate server-side, verifies the stored hash still matches the
   * content, and supersedes the category's previously published version.
   */
  async publish(
    id: string,
    options: { publisher: string; effectiveDate?: string },
  ): Promise<DocumentVersionRecord> {
    const record = await this.mustGet(id);
    if (record.status !== "approved_for_publication" && record.status !== "scheduled") {
      throw new InvalidTransition(record.status, "published");
    }
    if (record.counselReview !== "approved") {
      throw new PublicationBlocked(`Version ${id} has no counsel approval on record.`);
    }
    if (!options.publisher || options.publisher.trim().length === 0) {
      throw new PublicationBlocked("Publication requires a named publisher.");
    }
    if (sha256Hex(record.content) !== record.contentHash) {
      throw new PublicationBlocked(
        `Version ${id} content no longer matches its recorded hash; refusing to publish tampered text.`,
      );
    }
    const now = this.now();
    const previous = await this.store.getPublished(record.category);

    const published: DocumentVersionRecord = {
      ...record,
      status: "published",
      publishedAt: now.toISOString(),
      effectiveDate: options.effectiveDate ?? now.toISOString().slice(0, 10),
      publisher: options.publisher,
      supersededVersionId: previous ? previous.id : null,
      updatedAt: now.toISOString(),
    };

    // Supersede first, then publish: at no point are two versions of one
    // category published (the database has a partial unique index saying so).
    if (previous) {
      await this.store.updateVersion({
        ...previous,
        status: "superseded",
        updatedAt: now.toISOString(),
      });
    }
    await this.store.updateVersion(published);
    return published;
  }

  async getVersion(id: string): Promise<DocumentVersionRecord | null> {
    return this.store.getVersion(id);
  }

  async listVersions(category?: DocumentCategory): Promise<readonly DocumentVersionRecord[]> {
    return this.store.listVersions(category);
  }

  async getPublished(category: DocumentCategory): Promise<DocumentVersionRecord | null> {
    return this.store.getPublished(category);
  }

  private async mustGet(id: string): Promise<DocumentVersionRecord> {
    const record = await this.store.getVersion(id);
    if (!record) throw new DocumentNotFound(id);
    return record;
  }
}

// ---------------------------------------------------------------------------
// Placeholder seeding. Every category gets one clearly marked placeholder
// draft. No final legal conclusions are invented anywhere in this text.
// ---------------------------------------------------------------------------

export const PLACEHOLDER_MARKER = "DRAFT PLACEHOLDER, counsel-provided text replaces this before publication.";

export function placeholderContent(definition: DocumentCategoryDefinition): string {
  return [
    PLACEHOLDER_MARKER,
    "",
    `${definition.title} (category: ${definition.category})`,
    "",
    "This placeholder marks where the counsel-approved text of this document",
    "will appear. It is not legal text, it is not in effect, and while this",
    "version is a draft it cannot be published or signed.",
  ].join("\n");
}

/**
 * Seed one placeholder draft per category that has no versions yet.
 * Idempotent: a category with any existing version is left alone.
 */
export async function seedPlaceholderDrafts(
  lifecycle: DocumentLifecycle,
  store: DocumentVersionsStore,
): Promise<DocumentVersionRecord[]> {
  const created: DocumentVersionRecord[] = [];
  for (const definition of DOCUMENT_CATEGORY_REGISTRY) {
    const existing = await store.listVersions(definition.category);
    if (existing.length > 0) continue;
    created.push(
      await lifecycle.createDraft({
        category: definition.category,
        semver: "0.1.0",
        jurisdiction: "PLACEHOLDER, counsel to determine",
        content: placeholderContent(definition),
        notes: "Seeded placeholder draft. Counsel-provided text replaces this before publication.",
      }),
    );
  }
  return created;
}
