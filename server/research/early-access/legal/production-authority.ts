/**
 * THE PRODUCTION AGREEMENT AUTHORITY FOR THE EARLY ACCESS CHECKPOINTS.
 *
 * WHICH AUTHORITY, AND WHY THIS ONE.
 *
 * The `proof_submission` checkpoint asks "is this member's standing satisfied
 * RIGHT NOW, against the versions published right now". That is what
 * `AgreementAuthority` answers: it recomputes from immutable signature records
 * every time, holds no cache and no stored aggregate, and carries the
 * `packageVersion` it was computed against, so a republication can un-satisfy a
 * standing that was satisfied a minute ago. It is also the only thing in this
 * tree that can see the three facts that live in the legal engine and are
 * invisible to the Early Access schema: a separate conspicuous acknowledgment,
 * content-hash drift under a signature, and a provider acceptance that produces
 * no signature row at all.
 *
 * `research_early_access_current_agreement_package` is deliberately NOT used
 * here. It returns the durable package SNAPSHOT that was recorded, which is the
 * right answer to "what was in force when this was reviewed" and is exactly how
 * the admin lane already uses it in cart/supabase-admin-payment-review.ts.
 * Answering a gate with a snapshot is the stored-aggregate mistake: a snapshot
 * cannot notice a republication, a hash change, or a missing acknowledgment.
 * One authority per question, both wired, in different places.
 *
 * THE DESIGNATION IS DATA, AND ITS ABSENCE REFUSES.
 *
 * Which documents an Early Access purchase requires is a legal act, so
 * `package-manifest.ts` refuses to default it and demands an explicit founder or
 * counsel designation naming exact document ids. Nothing in this repository has
 * ever supplied one. This module reads it from configuration, checks it through
 * `resolveDesignatedPackage` (which refuses a typo, a stale package semver, an
 * unnamed designator, a dropped required document, or a missing
 * separate-acknowledgment document), and when it cannot resolve one it mounts an
 * authority that can only ever answer "not satisfied".
 *
 * SO TODAY EVERY PROOF SUBMISSION REFUSES, AND THAT IS THE TARGET STATE. No
 * legal package is published: `registerLegalPackage` has no production caller
 * and stops at `approved_for_publication`, and nothing calls `publish`, which
 * correctly demands a named publisher. The door is mounted and it refuses. It
 * starts accepting when a named human designates the package and publishes it,
 * and never because a piece of code decided to.
 */

import type {
  EarlyAccessAgreementAuthority,
  EarlyAccessAgreementPackage,
  EarlyAccessAgreementStanding,
} from "../hardening-contract";
import type { SignatureRecord } from "../../membership-activation/signatures";
import type { PackageStage } from "../../membership-activation/legal-import";
import { AgreementAuthority } from "./authority";
import {
  resolveDesignatedPackage,
  type EarlyAccessPackageDesignation,
  type ResolvedEarlyAccessPackage,
} from "./package-manifest";
import type {
  MemberSignatureReader,
  PublishedVersionReader,
} from "./package-completion";

/**
 * The configuration key carrying the designation.
 *
 * A JSON object in the exact `EarlyAccessPackageDesignation` shape. It is
 * configuration rather than code because the value is a decision a named human
 * makes on a date against a counsel approval reference, and a decision like that
 * should not require a deploy to record or a code review to read.
 */
export const EARLY_ACCESS_LEGAL_PACKAGE_ENV = "RESEARCH_EARLY_ACCESS_LEGAL_PACKAGE";

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function stringList(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) return null;
  return value.every((entry) => nonEmptyString(entry)) ? (value as string[]) : null;
}

/**
 * Read the designation from configuration.
 *
 * Every failure returns null and pushes a warning, and null resolves to a
 * refusal downstream. Nothing here repairs a partial designation: a designation
 * that names which paper a customer is held to is not a value to guess at.
 */
export function readEarlyAccessPackageDesignation(
  env: NodeJS.ProcessEnv,
  warnings: string[] = [],
): EarlyAccessPackageDesignation | null {
  const raw = (env[EARLY_ACCESS_LEGAL_PACKAGE_ENV] ?? "").trim();
  if (raw.length === 0) {
    warnings.push(
      `${EARLY_ACCESS_LEGAL_PACKAGE_ENV} is not set, so no Early Access legal package is designated. ` +
        "Every agreement checkpoint, including payment-proof submission, refuses until a named human designates one.",
    );
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    warnings.push(
      `${EARLY_ACCESS_LEGAL_PACKAGE_ENV} is set but is not valid JSON; treating it as unset, so the agreement checkpoints stay fail-closed.`,
    );
    return null;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    warnings.push(
      `${EARLY_ACCESS_LEGAL_PACKAGE_ENV} is not a JSON object; treating it as unset, so the agreement checkpoints stay fail-closed.`,
    );
    return null;
  }

  const candidate = parsed as Record<string, unknown>;
  const stages = stringList(candidate.stages);
  const documentIds = stringList(candidate.documentIds);
  if (
    !nonEmptyString(candidate.packageSemver) ||
    !nonEmptyString(candidate.designatedBy) ||
    !nonEmptyString(candidate.designatedAt) ||
    !nonEmptyString(candidate.approvalReference) ||
    stages === null ||
    documentIds === null
  ) {
    warnings.push(
      `${EARLY_ACCESS_LEGAL_PACKAGE_ENV} is set but is not a complete designation ` +
        "(packageSemver, stages, documentIds, designatedBy, designatedAt, approvalReference); " +
        "treating it as unset, so the agreement checkpoints stay fail-closed.",
    );
    return null;
  }

  return Object.freeze({
    packageSemver: candidate.packageSemver,
    stages: Object.freeze([...stages]) as readonly PackageStage[],
    documentIds: Object.freeze([...documentIds]),
    designatedBy: candidate.designatedBy,
    designatedAt: candidate.designatedAt,
    approvalReference: candidate.approvalReference,
  });
}

/**
 * The authority mounted when no designation resolves.
 *
 * It cannot return a satisfied standing. There is no branch, no flag and no
 * input that produces one, which is what makes "the door refuses until a named
 * human designates and publishes the package" a property of the code rather
 * than of the configuration.
 *
 * `currentPackage` throws rather than describing a package that does not exist,
 * matching `AgreementAuthority`'s own behaviour on a refused designation.
 * `standingFor` answers instead of throwing, so a caller gets the truthful
 * "your agreements are not in place" refusal rather than a service error.
 */
export class UndesignatedEarlyAccessAgreementAuthority
  implements EarlyAccessAgreementAuthority
{
  constructor(
    /** The refusal code from `resolveDesignatedPackage`, carried for operators. */
    private readonly code: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async currentPackage(): Promise<EarlyAccessAgreementPackage> {
    throw new Error(
      `No Early Access legal package is designated (${this.code}); there is no package in force to describe.`,
    );
  }

  async standingFor(memberId: string): Promise<EarlyAccessAgreementStanding> {
    return Object.freeze({
      satisfied: false,
      packageId: `xenios-research@undesignated:${this.code}`,
      packageVersion: `undesignated:${this.code}`,
      memberId,
      blocking: Object.freeze([
        Object.freeze({
          category: "electronic_record_consent" as const,
          reason: "no_published_version" as const,
        }),
      ]),
      evaluatedAt: this.now().toISOString(),
    });
  }
}

/**
 * Adapt the existing signatures store to the reader the completion engine wants.
 *
 * The store returns a readonly array and the engine's port asks for a mutable
 * one. A copy is made here rather than widening either type, so no consumer of
 * the store gains the ability to mutate what it was handed.
 */
export function toMemberSignatureReader(store: {
  listSignaturesForMember(memberId: string): Promise<readonly SignatureRecord[]>;
}): MemberSignatureReader {
  return Object.freeze({
    async listSignaturesForMember(memberId: string): Promise<SignatureRecord[]> {
      return [...(await store.listSignaturesForMember(memberId))];
    },
  });
}

export type EarlyAccessAgreementAuthorityBuild = Readonly<{
  authority: EarlyAccessAgreementAuthority;
  /** The designation as resolved, so a caller can report exactly why it refuses. */
  resolved: ResolvedEarlyAccessPackage;
}>;

/**
 * Build the authority a production deployment runs on.
 *
 * The readers are injected so this is testable with no database, and so the
 * caller composes them from the SAME documents store the membership signing
 * engine writes through. A second store here would let the gate read signatures
 * the engine never wrote, or miss the ones it did.
 */
export function buildEarlyAccessAgreementAuthority(deps: {
  readonly env: NodeJS.ProcessEnv;
  readonly versions: PublishedVersionReader;
  readonly signatures: MemberSignatureReader;
  readonly now?: () => Date;
  readonly warnings?: string[];
}): EarlyAccessAgreementAuthorityBuild {
  const warnings = deps.warnings ?? [];
  const now = deps.now ?? (() => new Date());
  const resolved = resolveDesignatedPackage(
    readEarlyAccessPackageDesignation(deps.env, warnings),
  );

  if (!resolved.ok) {
    if (resolved.code !== "designation_missing") {
      warnings.push(
        `${EARLY_ACCESS_LEGAL_PACKAGE_ENV} was rejected (${resolved.code}${
          resolved.detail.length > 0 ? `: ${resolved.detail.join(", ")}` : ""
        }); the Early Access agreement checkpoints stay fail-closed.`,
      );
    }
    return Object.freeze({
      authority: new UndesignatedEarlyAccessAgreementAuthority(resolved.code, now),
      resolved,
    });
  }

  if (resolved.containsUnsignableDocuments) {
    // Real, required paper that maps to no DocumentCategory and therefore has
    // no signing path at all. Completion already fails closed on it; this says
    // so out loud at boot so an operator is not left wondering why a correctly
    // designated package never completes.
    warnings.push(
      "The designated Early Access legal package contains documents the signature engine cannot sign " +
        "(the manifest's additional_required_document entries). Completion will refuse until they have a signing path.",
    );
  }

  return Object.freeze({
    authority: new AgreementAuthority(resolved, deps.versions, deps.signatures, now),
    resolved,
  });
}
