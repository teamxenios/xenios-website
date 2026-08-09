/**
 * Private Early Access: which legal documents an Early Access purchase requires.
 *
 * WHY THIS FILE EXISTS
 *
 * Early Access has its own tiny agreement gate (one configured kind/version
 * pair, recorded against an `eac_` handle in
 * research_early_access_agreement_acceptances). That gate proves a customer
 * ticked a box. It does not prove a legally identified person signed the
 * counsel-approved paper, and it names no document id, no version and no
 * content hash.
 *
 * The counsel-approved paper already exists, already has an ordered signing
 * sequence, and already pins a SHA-256 per document: it is
 * MEMBER_FACING_IMPORT_PLAN in membership-activation/legal-import.ts. This file
 * DERIVES the Early Access package from that manifest. It does not author a
 * package, restate a document, or invent a requirement. Every field below is
 * read from the existing plan.
 *
 * WHAT IT WILL NOT DO
 *
 * It will not choose the Early Access package on its own. Selecting which
 * documents a purchase requires is a legal act, not an engineering one, so the
 * exact set must arrive as an explicit founder or counsel DESIGNATION naming
 * document ids. This module's job is to derive the candidate set from the
 * manifest, then check a designation against it and refuse anything that does
 * not match exactly. An unset designation resolves to a refusal, never to a
 * default, because a default here would silently pick the paper a customer is
 * held to.
 *
 * THE STRUCTURAL FINDING THIS MODULE MAKES VISIBLE
 *
 * The manifest stages the two product-purchase documents (XR-LEGAL-13 Product
 * Purchase Terms, XR-LEGAL-14 Shipping, Claims and Replacement) at
 * `product_checkout`, and the evidence-upload consent (XR-LEGAL-15) at
 * `payment_evidence_upload`. All three carry `target.kind ===
 * "additional_required_document"`, which means they map to no DocumentCategory,
 * are never persisted as document versions by registerLegalPackage, and
 * therefore CANNOT be signed by the existing signature engine at all. That is
 * not a defect introduced here; it is the state of the tree, and this module
 * classifies it explicitly so completion can fail closed on it rather than
 * quietly reporting a package as satisfiable when no signing path exists.
 */

import {
  LEGAL_PACKAGE_SEMVER,
  MEMBER_FACING_IMPORT_PLAN,
  type MemberFacingImportEntry,
  type PackageStage,
} from "../../membership-activation/legal-import";
import {
  categoryDefinitionFor,
  type DocumentCategory,
  type DocumentRequirement,
} from "../../membership-activation/documents";

/**
 * How a manifest entry can be satisfied by the existing signature engine.
 *
 * `signable` entries map to a DocumentCategory, so a published version can
 * exist and an immutable SignatureRecord can bind to it. `not_signable` entries
 * are the manifest's `additional_required_document` targets: real, required
 * paper with no category, no published version and no signature path.
 */
export type PackageEntryClassification =
  | Readonly<{
      kind: "signable";
      category: DocumentCategory;
      /**
       * Read from the CATEGORY registry, not from the manifest entry. The
       * registry flag is what the signing guard enforces and what the stored
       * signature records, so it is the one that decides whether a separate
       * acknowledgment is legally required.
       */
      requiresSeparateAcknowledgment: boolean;
    }>
  | Readonly<{
      kind: "not_signable";
      reason: "additional_required_document";
    }>;

/** One manifest entry, carried verbatim, plus how it can be satisfied. */
export type EarlyAccessPackageEntry = Readonly<{
  documentId: string;
  title: string;
  signingOrder: number;
  stage: PackageStage;
  requirement: DocumentRequirement;
  /** The package's own separate conspicuous acceptance flag (08 and 17). */
  separateConspicuousAcceptance: boolean;
  /** SHA-256 pinned by the package's RELEASE_HASH_MANIFEST.json. */
  sourceSha256: string;
  reacceptanceRule: string | null;
  classification: PackageEntryClassification;
}>;

function classify(entry: MemberFacingImportEntry): PackageEntryClassification {
  if (entry.target.kind === "additional_required_document") {
    return Object.freeze({ kind: "not_signable", reason: "additional_required_document" } as const);
  }
  const definition = categoryDefinitionFor(entry.target.category);
  return Object.freeze({
    kind: "signable",
    category: entry.target.category,
    requiresSeparateAcknowledgment: definition.requiresSeparateAcknowledgment,
  } as const);
}

function toPackageEntry(entry: MemberFacingImportEntry): EarlyAccessPackageEntry {
  return Object.freeze({
    documentId: entry.documentId,
    title: entry.title,
    signingOrder: entry.signingOrder,
    stage: entry.stage,
    requirement: entry.requirement,
    separateConspicuousAcceptance: entry.separateConspicuousAcceptance,
    sourceSha256: entry.sourceSha256,
    reacceptanceRule: entry.reacceptanceRule,
    classification: classify(entry),
  });
}

/**
 * Every manifest entry for the named stages, in the package's own signing
 * order. Order comes from `signingOrder`, which is the order of
 * supporting/MEMBER_SIGNING_SEQUENCE.md, so the sequence a customer is walked
 * through is the sequence counsel approved.
 */
export function deriveCandidatePackage(
  stages: readonly PackageStage[],
): readonly EarlyAccessPackageEntry[] {
  const wanted = new Set<PackageStage>(stages);
  return Object.freeze(
    MEMBER_FACING_IMPORT_PLAN.filter((entry) => wanted.has(entry.stage))
      .map(toPackageEntry)
      .sort((a, b) => a.signingOrder - b.signingOrder),
  );
}

/** Every entry the manifest holds, in signing order. */
export function fullCandidatePackage(): readonly EarlyAccessPackageEntry[] {
  return Object.freeze(
    [...MEMBER_FACING_IMPORT_PLAN].map(toPackageEntry).sort((a, b) => a.signingOrder - b.signingOrder),
  );
}

/**
 * A founder or counsel decision naming the exact package an Early Access
 * purchase requires.
 *
 * This is deliberately data, not configuration derived from code: a named human
 * decided, on a date, against a counsel approval reference. `documentIds` is
 * the exact set, compared exactly. Nothing here is defaulted.
 */
export type EarlyAccessPackageDesignation = Readonly<{
  /** Must equal the package semver this tree carries, else the ids are stale. */
  packageSemver: string;
  /** The manifest stages this designation covers. */
  stages: readonly PackageStage[];
  /** Exact manifest document ids, for example XR-LEGAL-13. */
  documentIds: readonly string[];
  /** A named human. "the system" is not an accountable designator. */
  designatedBy: string;
  designatedAt: string;
  /** The counsel approval this designation rests on. */
  approvalReference: string;
}>;

export const PACKAGE_DESIGNATION_REFUSALS = [
  "designation_missing",
  "package_version_mismatch",
  "designator_unnamed",
  "approval_reference_missing",
  "stages_empty",
  "documents_empty",
  "unknown_document_id",
  "document_outside_designated_stage",
  "required_document_omitted",
  "separate_acknowledgment_document_omitted",
] as const;

export type PackageDesignationRefusal = (typeof PACKAGE_DESIGNATION_REFUSALS)[number];

export type ResolvedEarlyAccessPackage =
  | Readonly<{
      ok: true;
      packageSemver: string;
      stages: readonly PackageStage[];
      entries: readonly EarlyAccessPackageEntry[];
      designatedBy: string;
      designatedAt: string;
      approvalReference: string;
      /**
       * True when at least one designated entry has no signing path in the
       * current engine. The designation is still legally correct; the engine
       * simply cannot record it yet, and completion refuses accordingly.
       */
      containsUnsignableDocuments: boolean;
    }>
  | Readonly<{
      ok: false;
      code: PackageDesignationRefusal;
      /** Exact offending ids where the refusal names some, else empty. */
      detail: readonly string[];
    }>;

function refuse(
  code: PackageDesignationRefusal,
  detail: readonly string[] = [],
): ResolvedEarlyAccessPackage {
  return Object.freeze({ ok: false, code, detail: Object.freeze([...detail]) } as const);
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Check a designation against the manifest and return the exact ordered package
 * it names, or a typed refusal.
 *
 * The checks that matter, in order:
 *
 *  - a missing designation refuses, so an unconfigured deployment sells nothing;
 *  - the package semver must match, so a designation written against an older
 *    package cannot name ids whose text has since changed;
 *  - every named id must exist in the manifest, so a typo is a refusal rather
 *    than a silently smaller package;
 *  - every named id must belong to a designated stage, so a designation cannot
 *    reach sideways into unrelated membership paper;
 *  - every REQUIRED entry of every designated stage must be named, so a
 *    designation cannot quietly drop a required document;
 *  - both separate-acknowledgment documents must be named whenever their stage
 *    is designated, checked by their own rule so that dropping arbitration or
 *    the release and waiver is its own distinct refusal and never blends into
 *    the general required-set check.
 */
export function resolveDesignatedPackage(
  designation: EarlyAccessPackageDesignation | null | undefined,
): ResolvedEarlyAccessPackage {
  if (!designation) return refuse("designation_missing");
  if (designation.packageSemver !== LEGAL_PACKAGE_SEMVER) {
    return refuse("package_version_mismatch", [designation.packageSemver]);
  }
  if (!isNonEmpty(designation.designatedBy)) return refuse("designator_unnamed");
  if (!isNonEmpty(designation.approvalReference)) return refuse("approval_reference_missing");
  if (designation.stages.length === 0) return refuse("stages_empty");
  if (designation.documentIds.length === 0) return refuse("documents_empty");

  const candidates = deriveCandidatePackage(designation.stages);
  const byId = new Map(fullCandidatePackage().map((entry) => [entry.documentId, entry]));
  const designatedIds = new Set(designation.documentIds);

  const unknown = designation.documentIds.filter((id) => !byId.has(id));
  if (unknown.length > 0) return refuse("unknown_document_id", unknown.sort());

  const inStage = new Set(candidates.map((entry) => entry.documentId));
  const outside = designation.documentIds.filter((id) => !inStage.has(id));
  if (outside.length > 0) return refuse("document_outside_designated_stage", outside.sort());

  const separateAckMissing = candidates
    .filter(
      (entry) =>
        entry.separateConspicuousAcceptance ||
        (entry.classification.kind === "signable" &&
          entry.classification.requiresSeparateAcknowledgment),
    )
    .filter((entry) => !designatedIds.has(entry.documentId))
    .map((entry) => entry.documentId);
  if (separateAckMissing.length > 0) {
    return refuse("separate_acknowledgment_document_omitted", separateAckMissing.sort());
  }

  const requiredMissing = candidates
    .filter((entry) => entry.requirement === "required")
    .filter((entry) => !designatedIds.has(entry.documentId))
    .map((entry) => entry.documentId);
  if (requiredMissing.length > 0) return refuse("required_document_omitted", requiredMissing.sort());

  const entries = candidates.filter((entry) => designatedIds.has(entry.documentId));
  return Object.freeze({
    ok: true,
    packageSemver: designation.packageSemver,
    stages: Object.freeze([...designation.stages]),
    entries: Object.freeze(entries),
    designatedBy: designation.designatedBy,
    designatedAt: designation.designatedAt,
    approvalReference: designation.approvalReference,
    containsUnsignableDocuments: entries.some(
      (entry) => entry.classification.kind === "not_signable",
    ),
  } as const);
}
