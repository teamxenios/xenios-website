/**
 * Private Early Access: is the designated legal package actually signed?
 *
 * WHY THIS FILE EXISTS
 *
 * The question "has this customer completed the agreements" has exactly one
 * honest answer shape: recompute it, every time, from the immutable signature
 * records and the versions that are published right now. A stored boolean is a
 * claim about the past that stops being true the moment counsel publishes a new
 * version, and a stored boolean is also the one field an attacker or a bug can
 * set. So nothing here reads an aggregate `complete` flag, and nothing here
 * writes one.
 *
 * This mirrors the rules the membership gate already enforces in
 * signatures.ts requiredAgreementsSatisfied, applied to the DESIGNATED Early
 * Access package rather than to the whole activation set, and tightened in
 * three places where Early Access needs more than membership activation does.
 *
 * THE THREE TIGHTENINGS, AND WHY
 *
 * 1. Separate acknowledgments are proven from the record, not assumed from the
 *    registry. The membership gate counts a category as accepted if ANY
 *    acceptance names the published version id, including an EsignAcceptance,
 *    which carries only `{category, documentVersionId}` and no acknowledgment
 *    evidence at all. Arbitration (XR-LEGAL-08) and the release, waiver and
 *    covenant not to sue (XR-LEGAL-17) are exactly the two documents the
 *    package requires a separate conspicuous acceptance for, so for those two
 *    this module requires an immutable SignatureRecord carrying
 *    `separateAcknowledgment === true` and will not accept a bare provider
 *    completion in its place.
 *
 * 2. Content hash drift is checked. A SignatureRecord denormalizes the
 *    `contentHash` of the text that was shown. If that no longer equals the
 *    published version's hash, the record proves assent to different words, and
 *    the database trigger that normally prevents this cannot speak for rows
 *    written before it existed.
 *
 * 3. Documents with no signing path fail closed and say so. The manifest's
 *    `additional_required_document` entries, which include both product
 *    checkout documents, map to no category and can never be signed by this
 *    engine. Reporting such a package as merely "not signed yet" would suggest
 *    a customer could finish it. They cannot.
 *
 * WHAT IT WILL NOT DO
 *
 * It does not sign, record, deliver or settle anything. It reads. A refusal
 * here can block a sale, which is the safe direction; it can never manufacture
 * an acceptance.
 */

import type { DocumentCategory, DocumentVersionRecord } from "../../membership-activation/documents";
import { LEGACY_CATEGORY_MAPPING } from "../../membership-activation/documents";
import type { SignatureRecord } from "../../membership-activation/signatures";
import type { EarlyAccessPackageEntry, ResolvedEarlyAccessPackage } from "./package-manifest";

/**
 * The subset of the existing DocumentVersionsStore this module needs. Method
 * names match, so the real store satisfies it without an adapter.
 */
export interface PublishedVersionReader {
  getPublished(category: DocumentCategory): Promise<DocumentVersionRecord | null>;
}

/** The subset of the existing SignaturesStore this module needs. */
export interface MemberSignatureReader {
  listSignaturesForMember(memberId: string): Promise<SignatureRecord[]>;
}

/**
 * A completed external-provider acceptance, in the existing shape.
 *
 * Carried for parity with the membership gate. It can satisfy an ordinary
 * document. It deliberately cannot satisfy a separate-acknowledgment document,
 * because it carries no evidence that a separate acknowledgment was made.
 */
export type ProviderAcceptance = Readonly<{
  category: DocumentCategory;
  documentVersionId: string;
  /** The provider's own completion time, where one is known. Never invented. */
  completedAt?: string | null;
}>;

export const PACKAGE_BLOCKER_REASONS = [
  "document_not_signable",
  "no_published_version",
  "not_signed",
  "reacceptance_required",
  "separate_acknowledgment_missing",
  "content_hash_drift",
  "electronic_consent_required",
] as const;

export type PackageBlockerReason = (typeof PACKAGE_BLOCKER_REASONS)[number];

export type PackageItemStatus = Readonly<{
  documentId: string;
  title: string;
  signingOrder: number;
  category: DocumentCategory | null;
  requiresSeparateAcknowledgment: boolean;
  satisfied: boolean;
  /** Set only when satisfied by an immutable signature record. */
  signedAt: string | null;
  /** The exact version id the satisfying record binds to. */
  documentVersionId: string | null;
  blocker: PackageBlockerReason | null;
}>;

export type PackageBlocker = Readonly<{
  documentId: string;
  category: DocumentCategory | null;
  reason: PackageBlockerReason;
}>;

export type PackageCompletion = Readonly<{
  /** Recomputed on every call. Never read from storage, never written. */
  complete: boolean;
  packageSemver: string;
  designatedBy: string;
  approvalReference: string;
  memberId: string;
  items: readonly PackageItemStatus[];
  blocking: readonly PackageBlocker[];
  /** The lowest-order unsatisfied item, so a caller can present the sequence. */
  nextToSign: PackageItemStatus | null;
  /**
   * The real moment the package became complete: the latest signedAt across the
   * satisfying records. Null unless complete. It is never the current clock and
   * never the time a proof was uploaded, because those are different facts.
   */
  completedAt: string | null;
}>;

/**
 * The one document that must be signed before any other.
 *
 * This is the single ordering rule the engine actually enforces (signatures.ts
 * refuses any other category with `electronic_consent_required` until it is on
 * file). Presentation order comes from the package's signingOrder; only this
 * one is a gate.
 */
const ELECTRONIC_CONSENT: DocumentCategory = "electronic_record_consent";

function isoMax(values: readonly string[]): string | null {
  let max: string | null = null;
  for (const value of values) {
    if (max === null || value > max) max = value;
  }
  return max;
}

/**
 * Recompute completion of a designated package for one member.
 *
 * `resolved` must be an OK designation. Passing a refused one is a programming
 * error at the composition root, not a runtime state, so it throws rather than
 * returning an incomplete package that a caller might read as "nearly there".
 */
export async function recomputePackageCompletion(input: {
  readonly resolved: ResolvedEarlyAccessPackage;
  readonly memberId: string;
  readonly versions: PublishedVersionReader;
  readonly signatures: MemberSignatureReader;
  readonly providerAcceptances?: readonly ProviderAcceptance[];
}): Promise<PackageCompletion> {
  const { resolved, memberId, versions, signatures } = input;
  if (!resolved.ok) {
    throw new Error(
      `recomputePackageCompletion requires a designated package; got refusal ${resolved.code}.`,
    );
  }

  // Signatures are filtered to this member before anything else. The store is
  // asked for one member's records, and the filter repeats the check locally so
  // a store that over-returns cannot leak another person's assent into this
  // package's completion.
  const all = await signatures.listSignaturesForMember(memberId);
  const owned = all.filter((record) => record.memberId === memberId);
  const byCategory = new Map<DocumentCategory, SignatureRecord[]>();
  for (const record of owned) {
    const list = byCategory.get(record.category) ?? [];
    list.push(record);
    byCategory.set(record.category, list);
  }

  const providerByCategory = new Map<DocumentCategory, Set<string>>();
  for (const acceptance of input.providerAcceptances ?? []) {
    const set = providerByCategory.get(acceptance.category) ?? new Set<string>();
    set.add(acceptance.documentVersionId);
    providerByCategory.set(acceptance.category, set);
  }

  const consentOnFile = await hasElectronicConsent(memberId, versions, byCategory, providerByCategory);

  const items: PackageItemStatus[] = [];
  const blocking: PackageBlocker[] = [];

  for (const entry of resolved.entries) {
    const status = await evaluateEntry({
      entry,
      versions,
      byCategory,
      providerByCategory,
      consentOnFile,
    });
    items.push(status);
    if (!status.satisfied && status.blocker !== null) {
      blocking.push(
        Object.freeze({
          documentId: entry.documentId,
          category: status.category,
          reason: status.blocker,
        }),
      );
    }
  }

  items.sort((a, b) => a.signingOrder - b.signingOrder);
  const complete = blocking.length === 0 && items.every((item) => item.satisfied);
  const signedTimes = items
    .map((item) => item.signedAt)
    .filter((value): value is string => typeof value === "string");

  return Object.freeze({
    complete,
    packageSemver: resolved.packageSemver,
    designatedBy: resolved.designatedBy,
    approvalReference: resolved.approvalReference,
    memberId,
    items: Object.freeze(items),
    blocking: Object.freeze(blocking),
    nextToSign: items.find((item) => !item.satisfied) ?? null,
    completedAt: complete ? isoMax(signedTimes) : null,
  });
}

async function hasElectronicConsent(
  _memberId: string,
  versions: PublishedVersionReader,
  byCategory: Map<DocumentCategory, SignatureRecord[]>,
  providerByCategory: Map<DocumentCategory, Set<string>>,
): Promise<boolean> {
  const published = await versions.getPublished(ELECTRONIC_CONSENT);
  if (!published) return false;
  const signed = byCategory.get(ELECTRONIC_CONSENT) ?? [];
  if (signed.some((record) => record.documentVersionId === published.id)) return true;
  if ((providerByCategory.get(ELECTRONIC_CONSENT) ?? new Set()).has(published.id)) return true;
  // An earlier consent carries over only where the published version does not
  // demand reacceptance, exactly as the membership gate allows.
  return !published.reacceptanceRequired && signed.length > 0;
}

async function evaluateEntry(input: {
  entry: EarlyAccessPackageEntry;
  versions: PublishedVersionReader;
  byCategory: Map<DocumentCategory, SignatureRecord[]>;
  providerByCategory: Map<DocumentCategory, Set<string>>;
  consentOnFile: boolean;
}): Promise<PackageItemStatus> {
  const { entry, versions, byCategory, providerByCategory, consentOnFile } = input;

  const base = {
    documentId: entry.documentId,
    title: entry.title,
    signingOrder: entry.signingOrder,
  };

  if (entry.classification.kind === "not_signable") {
    return Object.freeze({
      ...base,
      category: null,
      requiresSeparateAcknowledgment: entry.separateConspicuousAcceptance,
      satisfied: false,
      signedAt: null,
      documentVersionId: null,
      blocker: "document_not_signable" as const,
    });
  }

  const category = entry.classification.category;
  const requiresSeparateAck = entry.classification.requiresSeparateAcknowledgment;

  // A legacy alias category is satisfied by signing the document that absorbed
  // its terms, which is itself in the required set and checked on its own row.
  // It never needs a published version and never blocks separately.
  const legacy = LEGACY_CATEGORY_MAPPING[category];
  if (legacy?.kind === "alias") {
    return Object.freeze({
      ...base,
      category,
      requiresSeparateAcknowledgment: requiresSeparateAck,
      satisfied: true,
      signedAt: null,
      documentVersionId: null,
      blocker: null,
    });
  }

  const published = await versions.getPublished(category);
  if (!published) {
    return Object.freeze({
      ...base,
      category,
      requiresSeparateAcknowledgment: requiresSeparateAck,
      satisfied: false,
      signedAt: null,
      documentVersionId: null,
      blocker: "no_published_version" as const,
    });
  }

  const signed = byCategory.get(category) ?? [];
  const exact = signed.find((record) => record.documentVersionId === published.id) ?? null;

  // Assent to different words is not assent. Checked before anything counts.
  if (exact && exact.contentHash !== published.contentHash) {
    return Object.freeze({
      ...base,
      category,
      requiresSeparateAcknowledgment: requiresSeparateAck,
      satisfied: false,
      signedAt: null,
      documentVersionId: published.id,
      blocker: "content_hash_drift" as const,
    });
  }

  const providerHasExact = (providerByCategory.get(category) ?? new Set<string>()).has(published.id);

  if (requiresSeparateAck) {
    // The two separate-acknowledgment documents accept only an immutable
    // signature record that carries the acknowledgment. A provider completion
    // has no field for it, so it cannot stand in.
    if (exact && exact.separateAcknowledgment === true) {
      return satisfiedBy(base, category, requiresSeparateAck, exact, consentOnFile, published);
    }
    const carried = carryOver(signed, published);
    if (carried && carried.separateAcknowledgment === true) {
      return satisfiedBy(base, category, requiresSeparateAck, carried, consentOnFile, published);
    }
    // Nothing acceptable was found. Name why, from most specific to least: a
    // record exists but carries no acknowledgment; something was accepted but
    // the version moved on; or the document was never accepted at all.
    let reason: PackageBlockerReason;
    if (exact || carried) {
      reason = "separate_acknowledgment_missing";
    } else if (signed.length > 0 || providerHasExact) {
      reason = published.reacceptanceRequired
        ? "reacceptance_required"
        : "separate_acknowledgment_missing";
    } else {
      reason = "not_signed";
    }
    return Object.freeze({
      ...base,
      category,
      requiresSeparateAcknowledgment: requiresSeparateAck,
      satisfied: false,
      signedAt: null,
      documentVersionId: published.id,
      blocker: reason,
    });
  }

  if (exact) {
    return satisfiedBy(base, category, requiresSeparateAck, exact, consentOnFile, published);
  }
  if (providerHasExact) {
    return Object.freeze({
      ...base,
      category,
      requiresSeparateAcknowledgment: requiresSeparateAck,
      satisfied: true,
      signedAt: null,
      documentVersionId: published.id,
      blocker: null,
    });
  }
  const carried = carryOver(signed, published);
  if (carried) {
    return satisfiedBy(base, category, requiresSeparateAck, carried, consentOnFile, published);
  }

  const hasAny = signed.length > 0 || (providerByCategory.get(category)?.size ?? 0) > 0;
  return Object.freeze({
    ...base,
    category,
    requiresSeparateAcknowledgment: requiresSeparateAck,
    satisfied: false,
    signedAt: null,
    documentVersionId: published.id,
    blocker: hasAny && published.reacceptanceRequired ? "reacceptance_required" : "not_signed",
  });
}

/** An earlier acceptance carries over only where reacceptance is not demanded. */
function carryOver(
  signed: readonly SignatureRecord[],
  published: DocumentVersionRecord,
): SignatureRecord | null {
  if (published.reacceptanceRequired) return null;
  return signed.length > 0 ? signed[0] : null;
}

function satisfiedBy(
  base: { documentId: string; title: string; signingOrder: number },
  category: DocumentCategory,
  requiresSeparateAcknowledgment: boolean,
  record: SignatureRecord,
  consentOnFile: boolean,
  published: DocumentVersionRecord,
): PackageItemStatus {
  // Every document other than the consent itself depends on the electronic
  // records consent being on file. A record that exists without it is a record
  // the engine would refuse to create today, so it is not counted.
  if (category !== ELECTRONIC_CONSENT && !consentOnFile) {
    return Object.freeze({
      ...base,
      category,
      requiresSeparateAcknowledgment,
      satisfied: false,
      signedAt: null,
      documentVersionId: published.id,
      blocker: "electronic_consent_required" as const,
    });
  }
  return Object.freeze({
    ...base,
    category,
    requiresSeparateAcknowledgment,
    satisfied: true,
    signedAt: record.signedAt,
    documentVersionId: record.documentVersionId,
    blocker: null,
  });
}
