import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  DocumentLifecycle,
  sha256Hex,
  type DocumentCategory,
  type DocumentRequirement,
  type DocumentVersionRecord,
  type DocumentVersionsStore,
} from "./documents";

// ---------------------------------------------------------------------------
// xenios research founding membership activation: counsel-approved legal
// package import (package v1.0, effective 2026-07-22).
//
// This module registers the FINAL, counsel-approved member-facing documents
// from docs/legal/xenios-research/v1.0.0/member_facing/ as document VERSIONS
// in the documents domain, at approved_for_publication. Publication stays the
// controlled release step and is deliberately NOT performed here.
//
// Non-negotiables enforced in code:
//   - Approved legal text is registered VERBATIM. The exact bytes of the
//     source file become the version content; nothing is rewritten,
//     reordered, trimmed, or normalized.
//   - Registration is hash-verified and fails closed. Every source file's
//     SHA-256 is recomputed and compared to the value pinned here (taken from
//     the package's RELEASE_HASH_MANIFEST.json). One tampered byte refuses
//     the ENTIRE import before anything is registered.
//   - Idempotent. A version is keyed by category + semver + content hash: a
//     re-run registers nothing new. A same-key version with a DIFFERENT hash
//     refuses loudly (LegalImportConflict); this module never supersedes.
//   - Internal SOPs (internal_policies/) are imported into the repo for the
//     team but are NEVER registered as member-facing or signable documents.
//     The plan below only names member_facing/ sources, and the register
//     function refuses any other path defensively.
//
// Mapping notes (the registry is read-only to this module):
//   - The package ships 17 member-facing documents; the registry
//     (documents.ts) defines 16 fixed categories with no extension point
//     (DocumentCategory is a closed union and the store keys by category).
//     Twelve package documents map onto registry categories; the remaining
//     five (website terms, product purchase terms, shipping policy, payment
//     evidence upload consent, cookie notice) have no registry category and
//     are registered here as ADDITIONAL documents: typed, hash-verified
//     records derived deterministically from the package on every run.
//   - Document 17 (release, waiver, covenant not to sue, limitation of
//     liability and indemnification) is registered under the
//     membership_covenant category, the closest category the registry
//     supports (the covenant slot of the activation flow; the package's
//     dependency map requires this document before activation payment
//     instructions, so it must participate in the activation gate). The
//     package requires separate conspicuous acceptance for it, and the
//     registry (documents.ts) flags membership_covenant with
//     requiresSeparateAcknowledgment, so the domain ENFORCES that separate
//     acknowledgment at signing exactly as it does for arbitration. The
//     package flag is also carried in PACKAGE_SIGNING_SEQUENCE and in the
//     version's provenance notes.
// ---------------------------------------------------------------------------

/** The package states "Version 1.0"; the domain requires x.y.z semver. */
export const LEGAL_PACKAGE_SEMVER = "1.0.0";

/** Package-level effective date, stated identically by all 17 documents. */
export const LEGAL_PACKAGE_EFFECTIVE_DATE = "2026-07-22";

/**
 * From supporting/FINAL_BUSINESS_TERMS_SCHEDULE.md: "Operating location and
 * governing law: Texas".
 */
export const LEGAL_PACKAGE_JURISDICTION = "Texas";

/** Counsel approval reference recorded on every registered version. */
export const COUNSEL_APPROVAL_REFERENCE =
  "docs/legal/xenios-research/v1.0.0/approval_records/APPROVAL_RECORD_INDEX.md";

/** Repo-relative location of the imported package. */
export const LEGAL_PACKAGE_RELATIVE_DIR = "docs/legal/xenios-research/v1.0.0";

/**
 * The package-wide reacceptance standard, quoted from
 * supporting/VERSIONING_TABLE.md. Individual entries carry a more specific
 * rule only where the package states one.
 */
export const PACKAGE_REACCEPTANCE_STANDARD =
  "Material revisions require affirmative reacceptance when required by the document, policy, or applicable law.";

export type PackageStage =
  | "activation"
  | "payment_evidence_upload"
  | "product_checkout"
  | "cookie_notice";

export type RegistrationTarget =
  | { kind: "category"; category: DocumentCategory }
  | { kind: "additional_required_document" };

export interface MemberFacingImportEntry {
  /** Package-relative source path. Always under member_facing/. */
  sourceFile: string;
  /** The package's own id from supporting/website_integration_manifest.json. */
  documentId: string;
  /** The exact H1 title of the source document. */
  title: string;
  /** The package's signing sequence position (1 to 17, e-records first). */
  signingOrder: number;
  stage: PackageStage;
  requirement: DocumentRequirement;
  /** The package's separate conspicuous acceptance flag (documents 08 and 17). */
  separateConspicuousAcceptance: boolean;
  /** SHA-256 pinned from the package's RELEASE_HASH_MANIFEST.json. */
  sourceSha256: string;
  target: RegistrationTarget;
  /** The package's own reacceptance wording where it states one, else null. */
  reacceptanceRule: string | null;
}

function category(value: DocumentCategory): RegistrationTarget {
  return { kind: "category", category: value };
}

const ADDITIONAL: RegistrationTarget = { kind: "additional_required_document" };

const PRODUCT_REACCEPTANCE =
  "at or before first product checkout and again after material revision";

/**
 * The 17 member-facing documents in the PACKAGE's signing order, which is the
 * order of supporting/MEMBER_SIGNING_SEQUENCE.md and the signing_order values
 * of supporting/website_integration_manifest.json (they agree). Note the
 * sequence is NOT the member_facing numeric file order: file 17 signs at
 * position 9, and files 15, 13, 14, 16 sign at positions 14 to 17.
 */
export const MEMBER_FACING_IMPORT_PLAN: readonly MemberFacingImportEntry[] = [
  {
    sourceFile: "member_facing/01_electronic_records_signature_consent.md",
    documentId: "XR-LEGAL-01",
    title: "Electronic Records and Signature Consent",
    signingOrder: 1,
    stage: "activation",
    requirement: "required",
    separateConspicuousAcceptance: false,
    sourceSha256: "53ddd31dd3a17e23887be600cf5a3ecf9b6fb993fe30a41d76a36b51506d735d",
    target: category("electronic_record_consent"),
    reacceptanceRule: null,
  },
  {
    sourceFile: "member_facing/02_privacy_policy.md",
    documentId: "XR-LEGAL-02",
    title: "Privacy Policy",
    signingOrder: 2,
    stage: "activation",
    requirement: "required",
    separateConspicuousAcceptance: false,
    sourceSha256: "ead5a38b6b38e6580137538d66861058847db0eadab91acef89733e6a6f8aa4c",
    target: category("privacy_notice"),
    reacceptanceRule: null,
  },
  {
    sourceFile: "member_facing/03_identity_driver_license_consent.md",
    documentId: "XR-LEGAL-03",
    title: "Identity Verification and Government ID Consent",
    signingOrder: 3,
    stage: "activation",
    requirement: "required",
    separateConspicuousAcceptance: false,
    sourceSha256: "c3ef088fead444b3c951fd5feba1bc1e86e0a6d5eb697a1d8bc3d5e061d48d8a",
    target: category("identity_age_verification_consent"),
    reacceptanceRule: null,
  },
  {
    sourceFile: "member_facing/04_founding_membership_agreement.md",
    documentId: "XR-LEGAL-04",
    title: "Founding Membership Agreement",
    signingOrder: 4,
    stage: "activation",
    requirement: "required",
    separateConspicuousAcceptance: false,
    sourceSha256: "1d1faf488cf712bafe06f1c3c51a6b6a9d7c75627ef1a07029d002787e704e3b",
    target: category("founding_membership_agreement"),
    reacceptanceRule: null,
  },
  {
    sourceFile: "member_facing/05_private_membership_confidentiality_nda.md",
    documentId: "XR-LEGAL-05",
    title: "Private Membership Confidentiality and Nondisclosure Agreement",
    signingOrder: 5,
    stage: "activation",
    requirement: "required",
    separateConspicuousAcceptance: false,
    sourceSha256: "9b5975629f1c1f782916142bfe606f3c7b07697faac9fc0fc95e1a6fb5c09dde",
    target: category("confidentiality_covenant"),
    reacceptanceRule: null,
  },
  {
    sourceFile: "member_facing/06_research_use_acceptable_use.md",
    documentId: "XR-LEGAL-06",
    title: "Research Use and Acceptable Use Agreement",
    signingOrder: 6,
    stage: "activation",
    requirement: "required",
    separateConspicuousAcceptance: false,
    sourceSha256: "91fe4676b819ac6d1dd283c9301945e1a23a7504ae33ecc741f97c9b7e42bc5c",
    target: category("research_education_disclaimer"),
    reacceptanceRule: null,
  },
  {
    sourceFile: "member_facing/07_no_medical_advice_assumption_risk.md",
    documentId: "XR-LEGAL-07",
    title: "No-Medical-Advice and Assumption-of-Risk Acknowledgment",
    signingOrder: 7,
    stage: "activation",
    requirement: "required",
    separateConspicuousAcceptance: false,
    sourceSha256: "8143232f19795ae680b34d0c0c60813b93d8f54400e3f69c00920e44812ff9b9",
    target: category("assumption_of_risk_acknowledgment"),
    reacceptanceRule: null,
  },
  {
    sourceFile: "member_facing/08_arbitration_class_jury_waiver.md",
    documentId: "XR-LEGAL-08",
    title: "Individual Arbitration, Class-Action Waiver and Jury-Trial Waiver",
    signingOrder: 8,
    stage: "activation",
    requirement: "required",
    separateConspicuousAcceptance: true,
    sourceSha256: "50ec962c87b197cdb1b201ff9441ddb264f90ba51290213918790abe0478c806",
    target: category("arbitration_agreement"),
    reacceptanceRule: null,
  },
  {
    sourceFile: "member_facing/17_release_waiver_covenant_indemnification.md",
    documentId: "XR-LEGAL-17",
    title:
      "Release, Waiver, Covenant Not to Sue, Limitation of Liability and Indemnification",
    signingOrder: 9,
    stage: "activation",
    requirement: "required",
    separateConspicuousAcceptance: true,
    sourceSha256: "ddaefbeb591b49f7ec170cf731ca7de13f490c0af74249d2eb72a5161d4db226",
    target: category("membership_covenant"),
    reacceptanceRule: null,
  },
  {
    sourceFile: "member_facing/09_manual_payment_verification_terms.md",
    documentId: "XR-LEGAL-09",
    title: "Manual Payment and Verification Terms",
    signingOrder: 10,
    stage: "activation",
    requirement: "required",
    separateConspicuousAcceptance: false,
    sourceSha256: "5ae9900f95e696298531bc85d119f24ab3df5a4f3856b9c3831b642304da05de",
    target: category("manual_payment_bridge_terms"),
    reacceptanceRule: null,
  },
  {
    sourceFile: "member_facing/10_membership_renewal_policy.md",
    documentId: "XR-LEGAL-10",
    title: "Membership Renewal Policy",
    signingOrder: 11,
    stage: "activation",
    requirement: "required",
    separateConspicuousAcceptance: false,
    sourceSha256: "cb77a4a905073b3018c136fcfdeb0e5d2982f6fa20f886e1cc0813b29c64c7ae",
    target: category("recurring_membership_authorization"),
    reacceptanceRule: null,
  },
  {
    sourceFile: "member_facing/11_cancellation_refund_policy.md",
    documentId: "XR-LEGAL-11",
    title: "Cancellation and Refund Policy",
    signingOrder: 12,
    stage: "activation",
    requirement: "required",
    separateConspicuousAcceptance: false,
    sourceSha256: "7ac1c45263baf9f92a83ed00afd16e10ffb8083db5a8205762160ebfe370ef7e",
    target: category("immediate_cancellation_acknowledgment"),
    reacceptanceRule: null,
  },
  {
    sourceFile: "member_facing/12_website_terms_of_use.md",
    documentId: "XR-LEGAL-12",
    title: "Website Terms of Use",
    signingOrder: 13,
    stage: "activation",
    requirement: "required",
    separateConspicuousAcceptance: false,
    sourceSha256: "80b9ba55f6e864448779ed41987e981e385aa47eec09776393380acbb04dc8f1",
    target: ADDITIONAL,
    reacceptanceRule: null,
  },
  {
    sourceFile: "member_facing/15_payment_evidence_upload_consent.md",
    documentId: "XR-LEGAL-15",
    title: "Payment Evidence Upload Consent",
    signingOrder: 14,
    stage: "payment_evidence_upload",
    requirement: "required",
    separateConspicuousAcceptance: false,
    sourceSha256: "06e5fcc80c7c3c5ac2541f61b607a99a2f37fa7eb1f979e7760b4a7423b57f2c",
    target: ADDITIONAL,
    reacceptanceRule: "before any evidence upload",
  },
  {
    sourceFile: "member_facing/13_product_purchase_terms.md",
    documentId: "XR-LEGAL-13",
    title: "Product Purchase Terms",
    signingOrder: 15,
    stage: "product_checkout",
    requirement: "required",
    separateConspicuousAcceptance: false,
    sourceSha256: "3888a8a1165d7b191b7be69a913a0d9882b60e7817b394e7d6a462b88631ce7c",
    target: ADDITIONAL,
    reacceptanceRule: PRODUCT_REACCEPTANCE,
  },
  {
    sourceFile: "member_facing/14_shipping_claims_replacement.md",
    documentId: "XR-LEGAL-14",
    title: "Shipping, Claims and Replacement Policy",
    signingOrder: 16,
    stage: "product_checkout",
    requirement: "required",
    separateConspicuousAcceptance: false,
    sourceSha256: "4e5add6645c4d1e882857c8c692a0b2bd3444e242851ed14dc1e0d49358ad836",
    target: ADDITIONAL,
    reacceptanceRule: PRODUCT_REACCEPTANCE,
  },
  {
    sourceFile: "member_facing/16_cookie_tracking_notice.md",
    documentId: "XR-LEGAL-16",
    title: "Cookie and Tracking Notice",
    signingOrder: 17,
    stage: "cookie_notice",
    requirement: "optional",
    separateConspicuousAcceptance: false,
    sourceSha256: "1f9752b7d9d3d24535ecb956e7a97db18543f374281ef9b135874974de8e4b5e",
    target: ADDITIONAL,
    reacceptanceRule: "notice and consent where required by deployed cookies",
  },
];

/** The plan re-exported in signing order under the name surfaces should use. */
export const PACKAGE_SIGNING_SEQUENCE: readonly MemberFacingImportEntry[] =
  [...MEMBER_FACING_IMPORT_PLAN].sort((a, b) => a.signingOrder - b.signingOrder);

/**
 * True only for a plain member_facing/ markdown path. Internal SOPs
 * (internal_policies/), supporting files, approval records, and any
 * path-traversal input are NOT registrable as signable documents, ever.
 */
export function isRegistrableMemberFacingSource(sourceFile: string): boolean {
  if (typeof sourceFile !== "string") return false;
  if (!sourceFile.startsWith("member_facing/")) return false;
  if (!sourceFile.endsWith(".md")) return false;
  if (sourceFile.includes("..") || sourceFile.includes("\\")) return false;
  return true;
}

/** Structural checks on the plan itself, run at module load (never drift). */
function assertPlanShape(plan: readonly MemberFacingImportEntry[]): void {
  if (plan.length !== 17) {
    throw new Error(`Legal import plan must carry 17 member-facing documents, found ${plan.length}.`);
  }
  const orders = plan.map((e) => e.signingOrder).sort((a, b) => a - b);
  for (let i = 0; i < 17; i += 1) {
    if (orders[i] !== i + 1) {
      throw new Error("Legal import plan signing orders must be exactly 1 through 17.");
    }
  }
  const first = plan.find((e) => e.signingOrder === 1);
  if (
    !first ||
    first.target.kind !== "category" ||
    first.target.category !== "electronic_record_consent"
  ) {
    throw new Error("The electronic records consent must be first in the signing sequence.");
  }
  const categories = plan
    .filter((e) => e.target.kind === "category")
    .map((e) => (e.target as { kind: "category"; category: DocumentCategory }).category);
  if (new Set(categories).size !== categories.length) {
    throw new Error("Legal import plan maps two documents to one registry category.");
  }
  const separate = plan.filter((e) => e.separateConspicuousAcceptance).map((e) => e.documentId).sort();
  if (separate.length !== 2 || separate[0] !== "XR-LEGAL-08" || separate[1] !== "XR-LEGAL-17") {
    throw new Error(
      "The package marks exactly documents 08 and 17 for separate conspicuous acceptance.",
    );
  }
  for (const entry of plan) {
    if (!isRegistrableMemberFacingSource(entry.sourceFile)) {
      throw new Error(`Not a registrable member-facing source: ${entry.sourceFile}.`);
    }
    if (!/^[0-9a-f]{64}$/.test(entry.sourceSha256)) {
      throw new Error(`Entry ${entry.documentId} carries a malformed pinned hash.`);
    }
  }
}
assertPlanShape(MEMBER_FACING_IMPORT_PLAN);

// ---------------------------------------------------------------------------
// Errors: every refusal is loud and names the exact document.
// ---------------------------------------------------------------------------

export class LegalImportSourceMissing extends Error {
  constructor(sourceFile: string, resolvedPath: string) {
    super(`Legal package source ${sourceFile} is missing (looked at ${resolvedPath}).`);
    this.name = "LegalImportSourceMissing";
  }
}

export class LegalImportHashMismatch extends Error {
  constructor(sourceFile: string, expected: string, actual: string) {
    super(
      `Legal package source ${sourceFile} does not match its pinned release hash ` +
        `(expected ${expected}, computed ${actual}). Refusing the entire import: ` +
        "approved legal text may not be altered.",
    );
    this.name = "LegalImportHashMismatch";
  }
}

export class LegalImportConflict extends Error {
  constructor(categoryName: string, semver: string, existingHash: string, incomingHash: string) {
    super(
      `Category ${categoryName} already holds version ${semver} with content hash ` +
        `${existingHash}, which differs from the package content hash ${incomingHash}. ` +
        "Refusing to register: this importer never silently supersedes registered legal text.",
    );
    this.name = "LegalImportConflict";
  }
}

export class LegalImportNotMemberFacing extends Error {
  constructor(sourceFile: string) {
    super(
      `${sourceFile} is not a member-facing package document and can never be ` +
        "registered as a signable document.",
    );
    this.name = "LegalImportNotMemberFacing";
  }
}

// ---------------------------------------------------------------------------
// Provenance notes: machine-readable JSON stored in the version's notes field
// (the DocumentVersionRecord has no dedicated provenance columns; this module
// adapts without touching the domain).
// ---------------------------------------------------------------------------

export interface ImportProvenance {
  source: "xenios_research_legal_package";
  packageVersion: "1.0";
  documentId: string;
  sourceFile: string;
  sourceSha256: string;
  signingOrder: number;
  stage: PackageStage;
  required: boolean;
  /** The PACKAGE's separate conspicuous acceptance requirement for this paper. */
  separateConspicuousAcceptance: boolean;
  effectiveDate: string;
  counselApprovalReference: string;
  reacceptanceRule: string | null;
}

export function buildProvenance(entry: MemberFacingImportEntry): ImportProvenance {
  return {
    source: "xenios_research_legal_package",
    packageVersion: "1.0",
    documentId: entry.documentId,
    sourceFile: entry.sourceFile,
    sourceSha256: entry.sourceSha256,
    signingOrder: entry.signingOrder,
    stage: entry.stage,
    required: entry.requirement === "required",
    separateConspicuousAcceptance: entry.separateConspicuousAcceptance,
    effectiveDate: LEGAL_PACKAGE_EFFECTIVE_DATE,
    counselApprovalReference: COUNSEL_APPROVAL_REFERENCE,
    reacceptanceRule: entry.reacceptanceRule,
  };
}

/** Parse a version's notes back into provenance; null when not import notes. */
export function parseProvenance(notes: string | null): ImportProvenance | null {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes) as ImportProvenance;
    return parsed && parsed.source === "xenios_research_legal_package" ? parsed : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Additional documents: the five package documents the 16-category registry
// cannot hold (it has no extension point). Derived deterministically from the
// verified package files on every run, so re-runs are idempotent by
// construction and the records can never drift from the imported text.
// ---------------------------------------------------------------------------

export interface AdditionalDocumentRecord {
  documentId: string;
  title: string;
  semver: string;
  status: "approved_for_publication";
  /** The verbatim source text. */
  content: string;
  /** Rendered-content hash via the domain's own hashing (sha256Hex). */
  contentHash: string;
  sourceFile: string;
  sourceSha256: string;
  signingOrder: number;
  stage: PackageStage;
  requirement: DocumentRequirement;
  separateConspicuousAcceptance: boolean;
  effectiveDate: string;
  jurisdiction: string;
  counselApprovalReference: string;
  reacceptanceRule: string | null;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export interface LegalImportOptions {
  /** Absolute path of the imported package. Defaults to the repo location. */
  packageDir?: string;
}

export interface LegalImportResult {
  /** Domain versions newly registered by THIS run, in signing order. */
  registered: DocumentVersionRecord[];
  /** Domain versions found already registered (idempotent skip), signing order. */
  alreadyRegistered: DocumentVersionRecord[];
  /** The five extra-registry documents, derived fresh each run, signing order. */
  additional: AdditionalDocumentRecord[];
  /** Documents excluded for internal package conflicts. None in package v1.0. */
  excluded: Array<{ sourceFile: string; reason: string }>;
}

function resolvePackageDir(options: LegalImportOptions): string {
  return options.packageDir ?? path.resolve(process.cwd(), LEGAL_PACKAGE_RELATIVE_DIR);
}

function rawSha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * Register the counsel-approved legal package. Deterministic, idempotent,
 * hash-verified, and atomic: ALL source files are verified against their
 * pinned release hashes and ALL store conflicts are checked before a single
 * version is written. On success every mapped category holds the verbatim
 * v1.0.0 text at approved_for_publication (counsel review recorded as
 * approved, referencing the approval record index), and the five
 * extra-registry documents are returned as additional records. Placeholder
 * drafts seeded earlier are left untouched.
 */
export async function registerLegalPackage(
  lifecycle: DocumentLifecycle,
  store: DocumentVersionsStore,
  options: LegalImportOptions = {},
): Promise<LegalImportResult> {
  const packageDir = resolvePackageDir(options);

  // Phase 1: verify every source before touching the store. One bad byte
  // anywhere refuses the whole import.
  const contents = new Map<string, string>();
  for (const entry of PACKAGE_SIGNING_SEQUENCE) {
    if (!isRegistrableMemberFacingSource(entry.sourceFile)) {
      throw new LegalImportNotMemberFacing(entry.sourceFile);
    }
    const resolved = path.join(packageDir, entry.sourceFile);
    let buffer: Buffer;
    try {
      buffer = fs.readFileSync(resolved);
    } catch {
      throw new LegalImportSourceMissing(entry.sourceFile, resolved);
    }
    const actual = rawSha256(buffer);
    if (actual !== entry.sourceSha256) {
      throw new LegalImportHashMismatch(entry.sourceFile, entry.sourceSha256, actual);
    }
    contents.set(entry.sourceFile, buffer.toString("utf8"));
  }

  // Phase 2a: decide every category action against the store; refuse loudly
  // on any conflict before any write happens.
  type Decision =
    | { entry: MemberFacingImportEntry; action: "skip"; existing: DocumentVersionRecord }
    | { entry: MemberFacingImportEntry; action: "create"; categoryName: DocumentCategory };
  const decisions: Decision[] = [];
  for (const entry of PACKAGE_SIGNING_SEQUENCE) {
    if (entry.target.kind !== "category") continue;
    const categoryName = entry.target.category;
    const incomingHash = sha256Hex(contents.get(entry.sourceFile) as string);
    const versions = await store.listVersions(categoryName);
    const sameSemver = versions.find((v) => v.semver === LEGAL_PACKAGE_SEMVER);
    if (sameSemver) {
      if (sameSemver.contentHash !== incomingHash) {
        throw new LegalImportConflict(
          categoryName,
          LEGAL_PACKAGE_SEMVER,
          sameSemver.contentHash,
          incomingHash,
        );
      }
      decisions.push({ entry, action: "skip", existing: sameSemver });
    } else {
      decisions.push({ entry, action: "create", categoryName });
    }
  }

  // Phase 2b: perform the registrations.
  const registered: DocumentVersionRecord[] = [];
  const alreadyRegistered: DocumentVersionRecord[] = [];
  for (const decision of decisions) {
    if (decision.action === "skip") {
      alreadyRegistered.push(decision.existing);
      continue;
    }
    const { entry } = decision;
    const draft = await lifecycle.createDraft({
      category: decision.categoryName,
      title: entry.title,
      semver: LEGAL_PACKAGE_SEMVER,
      jurisdiction: LEGAL_PACKAGE_JURISDICTION,
      content: contents.get(entry.sourceFile) as string,
      requirement: entry.requirement,
      notes: JSON.stringify(buildProvenance(entry)),
    });
    await lifecycle.transition(draft.id, "under_legal_review");
    await lifecycle.setCounselReview(draft.id, "approved");
    const approved = await lifecycle.transition(draft.id, "approved_for_publication");
    registered.push(approved);
  }

  // Additional documents: derived from the verified bytes, every run.
  const additional: AdditionalDocumentRecord[] = [];
  for (const entry of PACKAGE_SIGNING_SEQUENCE) {
    if (entry.target.kind !== "additional_required_document") continue;
    const content = contents.get(entry.sourceFile) as string;
    additional.push({
      documentId: entry.documentId,
      title: entry.title,
      semver: LEGAL_PACKAGE_SEMVER,
      status: "approved_for_publication",
      content,
      contentHash: sha256Hex(content),
      sourceFile: entry.sourceFile,
      sourceSha256: entry.sourceSha256,
      signingOrder: entry.signingOrder,
      stage: entry.stage,
      requirement: entry.requirement,
      separateConspicuousAcceptance: entry.separateConspicuousAcceptance,
      effectiveDate: LEGAL_PACKAGE_EFFECTIVE_DATE,
      jurisdiction: LEGAL_PACKAGE_JURISDICTION,
      counselApprovalReference: COUNSEL_APPROVAL_REFERENCE,
      reacceptanceRule: entry.reacceptanceRule,
    });
  }

  return { registered, alreadyRegistered, additional, excluded: [] };
}
