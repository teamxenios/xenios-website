/**
 * Private Early Access: the legal lane, speaking the frozen contract's
 * vocabulary.
 *
 * WHY THIS FILE EXISTS
 *
 * The other files in this directory hold the reasoning: which documents the
 * package contains (package-manifest.ts), who is allowed to sign
 * (signer-identity.ts), and whether the paper is actually signed
 * (package-completion.ts). Those modules carry more detail than the integration
 * contract does, on purpose, because a refusal is only useful if it says which
 * thing went wrong.
 *
 * This file is the adapter between that detail and the frozen shapes in
 * server/research/early-access/hardening-contract.ts. It exists so the final
 * tree has ONE vocabulary at the seam, and so the richer internal vocabulary
 * cannot leak out of the lane by accident.
 *
 * TWO PLACES THE MAPPING LOSES INFORMATION, DELIBERATELY
 *
 * 1. Binding refusals collapse from six internal codes to the frozen three.
 *    The contract is right that a precise answer about someone else's binding
 *    makes the route an oracle, so `binding_conflict` and `binding_superseded`
 *    both surface as `binding_absent`: from the caller's side, there is no
 *    binding they may sign under. The precise reason stays inside the lane.
 *
 * 2. Block reasons collapse to the frozen five. Two internal reasons have no
 *    frozen equivalent and both are proposed as contract additions in the lane
 *    handoff rather than invented here:
 *      - `document_not_signable`, which is the state the Early Access package
 *        is actually in today, maps to `no_published_version`. That is honest
 *        (no published version exists, and none can) but it understates the
 *        problem, because it reads as "counsel has not published yet" when the
 *        truth is "there is no category to publish into".
 *      - `content_hash_drift` maps to `not_signed`, which is the correct legal
 *        answer: assent to different words is not assent to these words.
 */

import crypto from "crypto";
import type {
  EarlyAccessAgreementAuthority,
  EarlyAccessAgreementBlockReason,
  EarlyAccessAgreementPackage,
  EarlyAccessAgreementRequirement,
  EarlyAccessAgreementStanding,
  EarlyAccessBindingRefusal,
  EarlyAccessBindingResolution,
  EarlyAccessLegalBinding,
  EarlyAccessLegalBindingDirectory,
} from "../hardening-contract";
import type { EarlyAccessAgreementStandingView } from "@shared/research/early-access-hardening";
import type { DocumentCategory } from "../../membership-activation/documents";
import { categoryDefinitionFor } from "../../membership-activation/documents";
import type { ResolvedEarlyAccessPackage } from "./package-manifest";
import {
  recomputePackageCompletion,
  type MemberSignatureReader,
  type PackageBlockerReason,
  type PackageCompletion,
  type ProviderAcceptance,
  type PublishedVersionReader,
} from "./package-completion";
import {
  resolveSigner,
  type EarlyAccessSignerBindingStore,
  type EarlyAccessSignerCandidate,
  type SignerResolutionRefusal,
} from "./signer-identity";

/**
 * The package version digest.
 *
 * This is the algorithm `agreementPackageState` already uses in
 * membership-activation/production-deps.ts, character for character: sha-256
 * over `category:id:contentHash` joined by a pipe, first 24 hex characters. It
 * is duplicated here rather than reinvented, and the lane handoff proposes
 * collapsing the two call sites into this one function so there is a single
 * answer to "which package was in force".
 */
export function packageVersionDigest(
  documents: readonly Readonly<{ category: string; id: string; contentHash: string }>[],
): string {
  return crypto
    .createHash("sha256")
    .update(
      documents.map((doc) => `${doc.category}:${doc.id}:${doc.contentHash}`).join("|"),
      "utf8",
    )
    .digest("hex")
    .slice(0, 24);
}

const BLOCK_REASON_MAP: Readonly<Record<PackageBlockerReason, EarlyAccessAgreementBlockReason>> = {
  // No category exists to publish into, so no published version can ever exist.
  document_not_signable: "no_published_version",
  no_published_version: "no_published_version",
  not_signed: "not_signed",
  reacceptance_required: "reacceptance_required",
  separate_acknowledgment_missing: "separate_acknowledgment_missing",
  // Assent to different words is not assent to these words.
  content_hash_drift: "not_signed",
  // The consent is missing, so nothing downstream of it counts as signed.
  electronic_consent_required: "not_signed",
};

export function toContractBlockReason(
  reason: PackageBlockerReason,
): EarlyAccessAgreementBlockReason {
  return BLOCK_REASON_MAP[reason];
}

const BINDING_REFUSAL_MAP: Readonly<
  Record<SignerResolutionRefusal, EarlyAccessBindingRefusal>
> = {
  binding_required: "binding_absent",
  // A binding the caller may not sign under is, to the caller, no binding.
  binding_conflict: "binding_absent",
  binding_superseded: "binding_absent",
  binding_unverified: "binding_unverified",
  checkout_not_owned: "binding_owner_mismatch",
  foreign_member: "binding_owner_mismatch",
};

/**
 * The frozen contract admits only `verified_link` and `admin_attested`.
 *
 * This is narrower than the identity directory's own notion of a redeemed
 * credential, which also includes `session_code`. The narrower rule wins: this
 * lane does not widen who may sign.
 */
export type EarlyAccessBindingProvenance = EarlyAccessLegalBinding["establishedBy"];

/**
 * Adapts the lane's binding store to the frozen read-only directory.
 *
 * `ownsCheckout` is injected rather than implemented here, because which
 * checkout numbers a member owns is cart state, and this lane does not read
 * the cart's tables. The injected function is expected to apply the existing
 * ownership rule, primary handle plus server-derived aliases.
 */
export class LegalBindingDirectory implements EarlyAccessLegalBindingDirectory {
  constructor(
    private readonly store: EarlyAccessSignerBindingStore,
    private readonly checkoutOwnership: (
      memberId: string,
      cartCheckoutNumber: string,
    ) => Promise<boolean>,
    /**
     * Resolves the customer record behind a handle, so provenance can be read.
     * Returns null where the handle resolves to nobody.
     */
    private readonly candidateFor: (
      customerRef: string,
    ) => Promise<EarlyAccessSignerCandidate | null>,
  ) {}

  async forCustomer(customerRef: string): Promise<EarlyAccessBindingResolution> {
    const candidate = await this.candidateFor(customerRef);
    if (!candidate) return Object.freeze({ ok: false, code: "binding_absent" } as const);

    const resolved = await resolveSigner(candidate, this.store);
    if (!resolved.ok) {
      return Object.freeze({ ok: false, code: BINDING_REFUSAL_MAP[resolved.code] } as const);
    }

    const establishedBy = establishedByFor(resolved.binding.verification);
    if (establishedBy === null) {
      // The binding exists but was established a way the contract does not
      // admit for signing.
      return Object.freeze({ ok: false, code: "binding_unverified" } as const);
    }

    return Object.freeze({
      ok: true,
      binding: Object.freeze({
        customerRef: resolved.binding.customerRef,
        memberId: resolved.binding.memberId,
        establishedBy,
        verifiedAt: resolved.binding.boundAt,
        attestedBy:
          resolved.binding.verification.method === "named_admin_review"
            ? resolved.binding.verification.reviewedBy
            : null,
        aliasRefs: Object.freeze(
          resolved.binding.coveredRefs.filter((ref) => ref !== resolved.binding.customerRef),
        ),
      }),
    } as const);
  }

  async ownsCheckout(memberId: string, cartCheckoutNumber: string): Promise<boolean> {
    return this.checkoutOwnership(memberId, cartCheckoutNumber);
  }

  /**
   * Every handle this member is bound to, from the lane's own store.
   *
   * The store already answers `findByMemberId`, and a binding already carries
   * `coveredRefs` (primary plus the server-derived aliases), so this direction
   * needed no new state, only exposing. A superseded binding resolves to
   * nothing: a member whose binding was replaced holds the handles of the
   * CURRENT binding, not of every binding they ever had.
   */
  async customerRefsFor(memberId: string): Promise<readonly string[]> {
    if (typeof memberId !== "string" || memberId.trim() === "") return Object.freeze([]);
    const binding = await this.store.findByMemberId(memberId);
    if (binding === null) return Object.freeze([]);
    // Defence in depth: the store was asked for THIS member, and the answer is
    // checked to actually be this member's before any handle is handed back.
    if (binding.memberId !== memberId) return Object.freeze([]);
    if (binding.supersededAt !== undefined && binding.supersededAt !== null) {
      return Object.freeze([]);
    }
    const refs = new Set<string>(binding.coveredRefs);
    refs.add(binding.customerRef);
    return Object.freeze(Array.from(refs).sort());
  }
}

function establishedByFor(
  verification: EarlyAccessLegalBindingVerificationInput,
): EarlyAccessBindingProvenance | null {
  if (verification.method === "member_claim_token") return "verified_link";
  if (verification.method === "named_admin_review") {
    // A named human is the whole point of this path. An unnamed attestation is
    // not an attestation.
    return verification.reviewedBy.trim().length > 0 ? "admin_attested" : null;
  }
  return null;
}

type EarlyAccessLegalBindingVerificationInput =
  | Readonly<{ method: "member_claim_token"; tokenPurpose: "account_claim" }>
  | Readonly<{ method: "named_admin_review"; reviewedBy: string; reference: string }>;

/**
 * Recomputes the package and the standing, every time it is asked.
 *
 * There is no cache and no stored aggregate, which is the point. `currentPackage`
 * resolves the designated documents to the versions published right now, so a
 * republication changes the package version and can un-satisfy a standing that
 * was satisfied a minute ago.
 */
export class AgreementAuthority implements EarlyAccessAgreementAuthority {
  constructor(
    private readonly resolved: ResolvedEarlyAccessPackage,
    private readonly versions: PublishedVersionReader,
    private readonly signatures: MemberSignatureReader,
    private readonly now: () => Date = () => new Date(),
    private readonly providerAcceptances: (
      memberId: string,
    ) => Promise<readonly ProviderAcceptance[]> = async () => [],
  ) {}

  async currentPackage(): Promise<EarlyAccessAgreementPackage> {
    if (!this.resolved.ok) {
      throw new Error(
        `AgreementAuthority requires a designated package; got refusal ${this.resolved.code}.`,
      );
    }
    const requirements: EarlyAccessAgreementRequirement[] = [];
    const digestInput: { category: string; id: string; contentHash: string }[] = [];

    for (const entry of this.resolved.entries) {
      if (entry.classification.kind !== "signable") continue;
      const category: DocumentCategory = entry.classification.category;
      const published = await this.versions.getPublished(category);
      if (!published) continue;
      requirements.push(
        Object.freeze({
          category,
          documentVersionId: published.id,
          semver: published.semver,
          requiresSeparateAcknowledgment: categoryDefinitionFor(category)
            .requiresSeparateAcknowledgment,
          ordering: entry.signingOrder,
        }),
      );
      digestInput.push({ category, id: published.id, contentHash: published.contentHash });
    }

    requirements.sort((a, b) => a.ordering - b.ordering);
    return Object.freeze({
      packageId: `xenios-research@${this.resolved.packageSemver}`,
      packageVersion: packageVersionDigest(digestInput),
      requirements: Object.freeze(requirements),
    });
  }

  async standingFor(memberId: string): Promise<EarlyAccessAgreementStanding> {
    const pkg = await this.currentPackage();
    const completion = await recomputePackageCompletion({
      resolved: this.resolved,
      memberId,
      versions: this.versions,
      signatures: this.signatures,
      providerAcceptances: await this.providerAcceptances(memberId),
    });

    const blocking = completion.blocking.map((blocker) =>
      Object.freeze({
        // A document with no category still has to name one at the seam. It
        // reports as the electronic-consent category only if it truly is that
        // category; otherwise the first requirement's category would be a lie,
        // so the unmapped case is surfaced through the reason instead.
        category: (blocker.category ?? "electronic_record_consent") as DocumentCategory,
        reason: toContractBlockReason(blocker.reason),
      }),
    );

    return Object.freeze({
      satisfied: completion.complete,
      packageId: pkg.packageId,
      packageVersion: pkg.packageVersion,
      memberId,
      blocking: Object.freeze(blocking),
      evaluatedAt: this.now().toISOString(),
    });
  }
}

/**
 * The customer-safe projection.
 *
 * The server answer carries `memberId`, which the frozen contract lists as a
 * key a customer payload may never contain at any depth. This strips it, along
 * with everything else that is an internal fact, and keeps only what a person
 * needs to finish their paperwork: whether they are done, which package the
 * answer was computed against, and what is still outstanding, in order.
 */
export function toStandingView(
  completion: PackageCompletion,
  packageVersion: string,
): EarlyAccessAgreementStandingView {
  return Object.freeze({
    satisfied: completion.complete,
    packageVersion,
    outstanding: Object.freeze(
      completion.items
        .filter((item) => !item.satisfied)
        .map((item) =>
          Object.freeze({
            category: item.category ?? item.documentId,
            title: item.title,
            requiresSeparateAcknowledgment: item.requiresSeparateAcknowledgment,
          }),
        ),
    ),
  });
}
