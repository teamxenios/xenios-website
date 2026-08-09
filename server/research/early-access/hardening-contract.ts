/**
 * Early Access hardening contract: the server-only half.
 *
 * Everything here names a fact a customer may never see: the legal signer
 * binding, the exact agreement package, the internal email state, the admin
 * submission projection and the settlement refusal vocabulary. It lives under
 * server/ rather than shared/ so none of it is reachable from the client
 * bundle. That is a structural guarantee, not a review convention.
 *
 * The browser-facing half is shared/research/early-access-hardening.ts.
 *
 * Types and ports only. No route, no store, no migration, no side effect. A
 * lane implements these; it does not redefine them.
 */

import type { DocumentCategory } from "../membership-activation/documents";
import type { EarlyAccessPaymentOptionCode } from "@shared/research/early-access-payment-options";

// ---------------------------------------------------------------------------
// 1. Early Access identity is not legal signer identity.
// ---------------------------------------------------------------------------

/**
 * THE PROBLEM THIS SOLVES, stated plainly.
 *
 * `SignatureRecord.memberId` is the only identity a signature can carry
 * (server/research/membership-activation/signatures.ts). An Early Access
 * customer is a `customerRef`: an opaque, session-derived handle whose
 * `boundBy` provenance may be as weak as `email_entry`
 * (server/research/early-access/routes/ports.ts). Those are different kinds of
 * thing. A session proves browser continuity. It does not prove which legal
 * person is agreeing to arbitration.
 *
 * Treating one as the other is how a signature ends up attributed to whoever
 * happened to hold a cookie. So the binding is made explicit, durable and
 * verified, and nothing may be signed without it.
 *
 * A NOTE ON WHAT "MEMBER" ALREADY MEANS, because it is weaker than it sounds.
 * The activation signing routes are guarded by `requireMember`, which admits
 * `pending_activation` and `paused` and refuses only `closed`. Identity
 * document verification gates the PAYMENT path, not the signing path. So
 * "resolves to a member" is not by itself the assurance this binding needs,
 * and the binding is therefore its own durable fact with its own provenance
 * rather than an inference from the presence of a member row.
 */
export type EarlyAccessLegalBinding = Readonly<{
  /** The Early Access continuity handle. Opaque, never an email. */
  customerRef: string;
  /** The legal identity every signature for this customer must carry. */
  memberId: string;
  /**
   * How the binding itself was established. Only `verified_link` may authorize
   * signing: it is the one provenance in the existing identity directory that
   * represents a credential the server verified itself.
   *
   * `admin_attested` exists for exactly one case, the founder checkout that
   * predates this whole mechanism, and it requires a named human on the record.
   * It is not a general escape hatch and no customer-driven path may produce it.
   */
  establishedBy: "verified_link" | "admin_attested";
  /** ISO 8601 UTC. When the binding became durable, not when it was displayed. */
  verifiedAt: string;
  /** Named admin, present only when `establishedBy` is `admin_attested`. */
  attestedBy: string | null;
  /**
   * Other ownership handles this same purchaser's records carry, so verifying
   * an identity never orphans an earlier checkout. Server-derived only, exactly
   * as `EarlyAccessCustomer.aliasRefs` already is. Never read from a request.
   */
  aliasRefs: readonly string[];
}>;

/**
 * Why a signing attempt was refused before any document was rendered.
 *
 * These are deliberately coarse to the customer. A precise answer about
 * another person's binding would make this route an oracle.
 */
export const EARLY_ACCESS_BINDING_REFUSALS = Object.freeze([
  /** No durable binding exists for this customerRef. */
  "binding_absent",
  /** A binding exists but its provenance is too weak to sign under. */
  "binding_unverified",
  /** The binding points at a member this checkout does not belong to. */
  "binding_owner_mismatch",
] as const);

export type EarlyAccessBindingRefusal = (typeof EARLY_ACCESS_BINDING_REFUSALS)[number];

export type EarlyAccessBindingResolution =
  | Readonly<{ ok: true; binding: EarlyAccessLegalBinding }>
  | Readonly<{ ok: false; code: EarlyAccessBindingRefusal }>;

/**
 * The seam a lane implements. Read-only by design: creating a binding is a
 * separate, deliberately narrow write path, not something a checkout can do as
 * a side effect of being visited.
 */
export interface EarlyAccessLegalBindingDirectory {
  forCustomer(customerRef: string): Promise<EarlyAccessBindingResolution>;
  /**
   * True when this member owns this checkout, including through an alias.
   * Another customer or member can never satisfy someone else's order.
   */
  ownsCheckout(memberId: string, cartCheckoutNumber: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// 2. The agreement package, and why a boolean is not enough.
// ---------------------------------------------------------------------------

/**
 * One required document in the Early Access package, resolved to an exact
 * published version.
 *
 * Category and version are both present because a category alone cannot
 * express reacceptance: republishing a document with `reacceptanceRequired`
 * must be able to un-satisfy a package that was complete a minute ago.
 */
export type EarlyAccessAgreementRequirement = Readonly<{
  category: DocumentCategory;
  /** The exact published version this requirement resolves to today. */
  documentVersionId: string;
  semver: string;
  /**
   * True where the paper demands its own conspicuous acceptance rather than
   * being bundled into a general consent. Today the registry flags arbitration
   * and the membership covenant slot, which carries the release and waiver.
   */
  requiresSeparateAcknowledgment: boolean;
  /** Presentation order. Signing order is part of the legal design. */
  ordering: number;
}>;

/**
 * The exact required set, at a point in time.
 *
 * `packageVersion` is a digest over the ordered required set. It is what makes
 * drift detectable: a settlement records the package version it checked, so a
 * later reviewer can tell whether the customer agreed to the package that was
 * actually in force.
 *
 * USE THE DIGEST THAT ALREADY EXISTS. `agreementPackageState` in
 * server/research/membership-activation/production-deps.ts already computes
 * one: the first 24 hex characters of a sha-256 over `category:id:contentHash`
 * joined by `|`. A second algorithm would mean two answers to "which package
 * was in force", which is the one question this field exists to settle. That
 * function currently duplicates the gate's own skip and alias logic; the lane
 * that touches it should collapse the two rather than add a third.
 *
 * The membership of this set is a founder and legal decision, not an
 * engineering one. A lane resolves the package from the existing registry and
 * the designated stage. A lane does not choose which documents apply.
 */
export type EarlyAccessAgreementPackage = Readonly<{
  packageId: string;
  packageVersion: string;
  requirements: readonly EarlyAccessAgreementRequirement[];
}>;

export const EARLY_ACCESS_AGREEMENT_BLOCK_REASONS = Object.freeze([
  "no_published_version",
  "not_signed",
  "reacceptance_required",
  /** Signed, but by a member who is not the one bound to this checkout. */
  "signed_by_other_member",
  /** The category needs its own acknowledgement and did not get one. */
  "separate_acknowledgment_missing",
] as const);

export type EarlyAccessAgreementBlockReason =
  (typeof EARLY_ACCESS_AGREEMENT_BLOCK_REASONS)[number];

/**
 * The recomputed answer. Never a stored `complete = true`.
 *
 * The aggregate the accelerator trusted can lie in three separate ways: the
 * required set can change, a version can be republished, and a row can be
 * written by a different member. So this is recomputed from immutable
 * signature records every time it is asked, which is exactly what
 * `SignatureService.requiredAgreementsSatisfied` already does. This type is
 * that answer, plus the package version it was computed against, so the answer
 * carries its own provenance.
 */
export type EarlyAccessAgreementStanding = Readonly<{
  satisfied: boolean;
  packageId: string;
  packageVersion: string;
  memberId: string;
  blocking: readonly Readonly<{
    category: DocumentCategory;
    reason: EarlyAccessAgreementBlockReason;
  }>[];
  /** ISO 8601 UTC. When this answer was computed, not when anything was signed. */
  evaluatedAt: string;
}>;

export interface EarlyAccessAgreementAuthority {
  /** The package in force right now. */
  currentPackage(): Promise<EarlyAccessAgreementPackage>;
  /** Recompute standing for one member against the current package. */
  standingFor(memberId: string): Promise<EarlyAccessAgreementStanding>;
}

/**
 * WHERE THE PACKAGE MUST BE RE-CHECKED.
 *
 * Not once at signing. At every point where the answer could have changed
 * between then and a consequence: quoting, checking out, submitting proof and
 * settling. Naming the four here means a lane cannot quietly check three.
 *
 * THIS IS A CHANGE, NOT A PRESERVATION, and it must be built and tested as one.
 * Today exactly one of the four checks exists: `quoteEarlyAccessCart` calls the
 * agreement gate. `checkout-service.ts` contains no agreement reference at all,
 * proof submission does not exist yet, and the settlement RPC performs no
 * agreement check. So the package is verified when a quote is minted and never
 * again, which means a customer can quote under one package and settle under
 * another. Three of these four checkpoints are new code.
 */
export const EARLY_ACCESS_AGREEMENT_CHECKPOINTS = Object.freeze([
  "quote",
  "checkout",
  "proof_submission",
  "settlement",
] as const);

export type EarlyAccessAgreementCheckpoint =
  (typeof EARLY_ACCESS_AGREEMENT_CHECKPOINTS)[number];

/**
 * Attestations are append-only and supersedable.
 *
 * One immutable row per checkout cannot survive a package version change: the
 * customer re-signs and there is nowhere to put the new truth. So an
 * attestation is a versioned event, exactly one of which is active per
 * checkout, and settlement reads the active one and re-checks it against the
 * package in force.
 */
export type EarlyAccessAgreementAttestation = Readonly<{
  attestationId: string;
  cartCheckoutNumber: string;
  memberId: string;
  packageId: string;
  packageVersion: string;
  /**
   * The REAL signature timestamps from the legal records, per category. Never
   * the moment the proof was uploaded. Fabricating these would make the audit
   * trail describe an event that did not happen when it says it did.
   *
   * Two sources, because this system has two kinds of acceptance. A natively
   * signed category takes `research_fm_document_signatures.signed_at`. A
   * provider-satisfied category has no signature row at all: OpenSign
   * completions satisfy the gate as ephemeral `EsignAcceptance` values, so the
   * timestamp comes from that request's `completed_at`. A lane that assumes
   * only the first source will silently record nothing for the second.
   */
  signedAt: Readonly<Record<string, string>>;
  attestedAt: string;
  /** Null while active. Set when a later attestation supersedes this one. */
  supersededAt: string | null;
  supersededBy: string | null;
}>;

// ---------------------------------------------------------------------------
// 3. Payment proof. Metadata only, and the method is not a guess.
// ---------------------------------------------------------------------------

/**
 * PROOF BYTES ARE NEVER DURABLE.
 *
 * The image or PDF exists inside one bounded request and inside the message
 * handed to the internal mail provider. It is never written to the database,
 * to Supabase Storage, to the outbox, to the filesystem or to a log. This
 * constant gives that rule a name a test can assert against.
 */
export const EARLY_ACCESS_PROOF_BYTES_ARE_TRANSIENT = true as const;

/**
 * The method snapshot taken at submission.
 *
 * The accelerator hardcoded five methods and defaulted to Zelle. This
 * repository already publishes the correct source: the resolved
 * `EarlyAccessPaymentInstructionsPresentation` for THIS checkout, built by the
 * server from configuration plus the protected registry. The selector is
 * populated from that, there is no default, and the chosen code is checked
 * against that same presentation on the server before it is snapshotted.
 *
 * `registryVersion` is recorded so a later reviewer can tell which governance
 * decision was in force, rather than inferring it from a method name that may
 * since have been retired.
 */
export type EarlyAccessProofMethodSnapshot = Readonly<{
  code: EarlyAccessPaymentOptionCode;
  methodName: string;
  registryVersion: string;
  /** ISO 8601 UTC. When the presentation the customer chose from was built. */
  presentedAt: string;
}>;

/**
 * Everything durable about one submission. Note the absence of bytes and of
 * any object path: there is nowhere here to put a file, deliberately.
 */
export type EarlyAccessProofSubmissionRecord = Readonly<{
  submissionId: string;
  cartCheckoutNumber: string;
  memberId: string;
  method: EarlyAccessProofMethodSnapshot;
  /** The customer's own filename, sanitized. Unicode control and bidi removed. */
  filename: string;
  contentType: string;
  byteSize: number;
  /** Digest of the transient bytes, for reconciliation. Admin-only, never shown. */
  proofSha256: string;
  /** Package version in force when the submission was accepted. */
  packageVersion: string;
  createdAt: string;
}>;

// ---------------------------------------------------------------------------
// 4. Internal email: acceptance is not delivery, and failure is not absence.
// ---------------------------------------------------------------------------

/**
 * What we actually know about the internal notification.
 *
 * `accepted` means the provider took the message. It does not mean a human
 * received it, and the wording shown anywhere must say accepted or queued
 * rather than delivered.
 *
 * `unknown` is the important one and the state the accelerator lacked. The
 * provider can accept while the confirming database write fails. The bytes are
 * gone by then, so the send cannot be safely repeated and the truth cannot be
 * automatically reconstructed. Claiming `failed` there would tell an operator
 * no email exists when one may be sitting in the inbox. `unknown` is the
 * honest state, and it is a work item for a named human.
 */
export const EARLY_ACCESS_INTERNAL_EMAIL_ACCEPTANCE = Object.freeze([
  "not_attempted",
  "accepted",
  "unknown",
  "failed",
] as const);

export type EarlyAccessInternalEmailAcceptance =
  (typeof EARLY_ACCESS_INTERNAL_EMAIL_ACCEPTANCE)[number];

/** The one internal destination. Not configurable per request, ever. */
export const EARLY_ACCESS_INTERNAL_RECIPIENT = "research@xeniostechnology.com" as const;

/**
 * The admin projection of a submission.
 *
 * This is the counterpart the customer view refuses to carry. The two are
 * separate types, produced by separate queries, so a customer route cannot
 * accidentally serialize this one by widening a select.
 */
export type EarlyAccessSubmissionAdminView = Readonly<{
  submissionId: string;
  cartCheckoutNumber: string;
  memberId: string;
  method: EarlyAccessProofMethodSnapshot;
  filename: string;
  contentType: string;
  byteSize: number;
  proofSha256: string;
  internalRecipient: typeof EARLY_ACCESS_INTERNAL_RECIPIENT;
  internalEmailAcceptance: EarlyAccessInternalEmailAcceptance;
  /** Provider's own id when it accepted. Null otherwise. Never customer-facing. */
  providerMessageId: string | null;
  /** Last provider or persistence error, for an operator. Never customer-facing. */
  lastError: string | null;
  /** True while a human must reconcile an `unknown` acceptance. */
  reconciliationRequired: boolean;
  createdAt: string;
}>;

// ---------------------------------------------------------------------------
// 5. Settlement. One door, one vocabulary.
// ---------------------------------------------------------------------------

/**
 * THE SETTLEMENT DOOR FOR THE CART IS ALREADY BUILT AND THERE IS EXACTLY ONE:
 *
 *   POST /api/admin/research/cart/:cartCheckoutNumber/confirm-payment
 *
 * behind the existing `requireSupabaseAdmin` guard, served by
 * `createEarlyAccessCartConfirmPaymentAdminRoute`, calling
 * `settleEarlyAccessCart`, which commits atomically and then runs the existing
 * `EarlyAccessCartNotifier.settled`. A second route calling the settlement
 * port directly would bypass that notifier, and the notification is how the
 * customer and the suppliers find out. Extend this door. Do not add one.
 */
export const EARLY_ACCESS_CART_SETTLEMENT_ROUTE =
  "/api/admin/research/cart/:cartCheckoutNumber/confirm-payment" as const;

/**
 * The refusals that already exist at the accepted base. Frozen here so a lane
 * can see, in one place, what it must not rename, reorder or repurpose.
 *
 * Sources: `CartSettlementCommit` in cart/ports.ts, plus the service-level
 * `input_invalid` in cart/settlement.ts.
 */
export const EARLY_ACCESS_SETTLEMENT_REFUSALS_EXISTING = Object.freeze([
  "input_invalid",
  "checkout_unknown",
  "evidence_missing",
  "amount_mismatch",
  "transaction_id_used",
  /** Not an error. The replay answer, carrying the original settlement. */
  "already_settled",
] as const);

/**
 * The refusals hardening ADDS. Additive only: nothing above changes meaning.
 *
 * Each one exists because there is a way to settle an order that should not be
 * settled, and a refusal is the only honest answer to it.
 */
export const EARLY_ACCESS_SETTLEMENT_REFUSALS_ADDED = Object.freeze([
  /** The customer's agreement package is not currently satisfied. */
  "agreements_not_current",
  /** No accepted customer submission exists for this checkout. */
  "submission_missing",
  /** The submission exists but its internal email state is unreconciled. */
  "submission_unreconciled",
  /** The checkout was superseded by a later one (migration 61's invariant). */
  "checkout_superseded",
  /** The named admin did not record both required confirmations. */
  "admin_confirmation_missing",
  /** The provider transaction id matches an existing one after normalization. */
  "transaction_id_duplicate_canonical",
] as const);

export type EarlyAccessSettlementRefusal =
  | (typeof EARLY_ACCESS_SETTLEMENT_REFUSALS_EXISTING)[number]
  | (typeof EARLY_ACCESS_SETTLEMENT_REFUSALS_ADDED)[number];

/**
 * What a named admin durably attests when they settle.
 *
 * Two checkbox confirmations in a UI are worth nothing if they are not
 * persisted: the audit record must be able to answer "who said the money
 * arrived, and what exactly did they claim", months later, without the
 * screen that collected it.
 */
export type EarlyAccessAdminSettlementAttestation = Readonly<{
  /** Resolved from the admin guard, never from a request body. */
  actorId: string;
  /** The admin confirms funds are actually present in the destination account. */
  confirmedFundsReceived: true;
  /** The admin confirms amount and reference match the invoice. */
  confirmedAmountAndReference: true;
  externalTransactionId: string;
  /**
   * Provider-normalized form of the same id, used for uniqueness. Case and
   * whitespace differences are cosmetic, and letting them through is how one
   * payment gets recorded twice.
   */
  canonicalTransactionId: string;
  attestedAt: string;
}>;

/** Trim, collapse inner whitespace, uppercase. Stable and provider-agnostic. */
export function canonicalTransactionId(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

// ---------------------------------------------------------------------------
// 6. The founder checkout that predates all of this.
// ---------------------------------------------------------------------------

/**
 * The existing founder checkout must cross every new gate WITHOUT becoming a
 * new order. It keeps its cart checkout number, its invoice number and its
 * payment reference. What it acquires is a binding, an attestation against the
 * current package, and a submission. Any design that requires re-checkout has
 * failed this requirement, and the red team will test exactly that.
 */
export const EARLY_ACCESS_FOUNDER_COMPATIBILITY_IS_REQUIRED = true as const;

// ---------------------------------------------------------------------------
// 7. Two prerequisites this contract cannot satisfy in code.
// ---------------------------------------------------------------------------

/**
 * READ THIS BEFORE BUILDING THE LEGAL LANE.
 *
 * 1. THE COUNSEL-APPROVED PACKAGE IS NOT REGISTERED ANYWHERE.
 *    `registerLegalPackage` in
 *    server/research/membership-activation/legal-import.ts verifies and
 *    registers the seventeen approved documents, and it has no production
 *    caller: only its own test imports it. No script, no bootstrap, no CLI. So
 *    `research_fm_document_versions` holds no published Early Access package
 *    today, and `requiredAgreementsSatisfied` fails closed on
 *    `no_published_version` for every category. This is correct behavior and a
 *    hard prerequisite: until a named human runs a registration with the
 *    hash-verified documents, no Early Access customer can complete a package,
 *    and no amount of application code changes that.
 *
 * 2. THE EARLY ACCESS ACCEPTANCE TABLE IS NOT APPLIED.
 *    `research_early_access_agreement_acceptances` arrives in migration
 *    20260804120000 and the ledger records that migration as pending. The
 *    existing Early Access acceptance path therefore has no durable table in
 *    production yet.
 *
 * Neither is a coding task, and neither may be simulated. A lane that finds
 * itself writing a fixture to stand in for one of these has left the contract.
 */
export const EARLY_ACCESS_LEGAL_PACKAGE_REGISTRATION_IS_EXTERNAL = true as const;

// ---------------------------------------------------------------------------
// 8. Standing facts from the forensics pass that every lane needs.
// ---------------------------------------------------------------------------

/**
 * UNRESOLVED, AND IT DECIDES WHETHER THE CART IS REACHABLE AT ALL.
 *
 * The research gateway wall is mounted on `/api/research` before the Early
 * Access API is registered, and it default-denies anyone without the research
 * gateway cookie. Its exemption lists name the session, catalog, agreements,
 * unlock, logout, orders and verification paths. They name no cart path. The
 * single `"/cart"` entry in that file is an exact-match member-platform path,
 * not `/early-access/cart/...`.
 *
 * So an Early Access customer who unlocks with the Early Access password and
 * then posts a cart quote is refused by the wall, unless they also hold the
 * research gateway password. No composed test covers this: the cart route
 * tests register the Early Access API alone, and the one test that mounts both
 * enumerates the exempt paths without listing a cart path.
 *
 * The question is binary and belongs to Samuel: are pilot customers given the
 * research gateway password as well? If yes, this is a deployment precondition
 * and should be written down as one. If no, the exemption list needs
 * method-exact cart entries, and that file is a protection seam only the
 * orchestrator may edit.
 *
 * No lane should route around this. Session 8 in particular is building a
 * journey whose reachability depends on the answer.
 */
export const EARLY_ACCESS_CART_WALL_EXEMPTION_IS_UNRESOLVED = true as const;

/**
 * FOR THE DATABASE LANE: do not drop and recreate the cart event constraint.
 *
 * Migration 61 replaced it wholesale and the current vocabulary is exactly
 * eight values, the eighth being `checkout_superseded`. Migration 61 then
 * writes a real `checkout_superseded` row for the disposed duplicate.
 *
 * `ALTER TABLE ... ADD CONSTRAINT ... CHECK` validates existing rows. So a
 * constraint regenerated from a pre-61 mental model applies cleanly on a fresh
 * container that has no such row, and fails at apply time on production, which
 * does. Every gate would pass and the migration would still be unshippable.
 *
 * Widen additively, or put hardening events in a separate table. If the
 * constraint must be replaced, the replacement must be a strict superset of the
 * eight, and the PG16 and PG17 harness must seed a `checkout_superseded` row so
 * the container reproduces the production shape rather than the empty one.
 */
export const EARLY_ACCESS_CART_EVENT_TYPES_AT_M61 = Object.freeze([
  "quote_created",
  "checkout_created",
  "proof_recorded",
  "payment_verified",
  "child_release_created",
  "shipment_updated",
  "payment_rejected",
  "checkout_superseded",
] as const);

/**
 * THE THREE PROOF CONCEPTS THAT ALREADY EXIST, named so a fourth is deliberate.
 *
 * 1. `admin_recorded_external` — a named admin records the metadata and digest
 *    of proof received off platform. Nothing is stored on the platform. This is
 *    what the cart settlement's `evidence_missing` refusal refers to.
 * 2. `customer_bucket_upload` — the single-product order flow's customer proof
 *    door, backed by a private storage bucket.
 * 3. `transient_email_only` — the new cart submission. Bytes exist inside one
 *    request and one provider send, and are never durable.
 *
 * They are not interchangeable and their evidence has different provenance. A
 * settlement that accepts one must say which.
 */
export const EARLY_ACCESS_PROOF_CONCEPTS = Object.freeze([
  "admin_recorded_external",
  "customer_bucket_upload",
  "transient_email_only",
] as const);

export type EarlyAccessProofConcept = (typeof EARLY_ACCESS_PROOF_CONCEPTS)[number];

/**
 * THE REPOSITORY LEDGER IS NOT EVIDENCE OF PRODUCTION STATE, IN EITHER
 * DIRECTION.
 *
 * `docs/coordination/MIGRATION_DAG.json` marks every Early Access migration,
 * including 58, 60 and 61, as `appliedToProduction: false` with a pending
 * managed id, and `CURRENT_PRODUCTION_STATE.json` was generated before the cart
 * existed at all. Meanwhile migration 61's own header narrates two real
 * production checkouts by number, which cannot exist unless 58 and 60 ran.
 *
 * The likely reading is that the migrations were applied and the ledger was
 * never updated. Nobody has read the managed ledger to confirm it. Until
 * somebody does, no lane may treat either artifact as a source of truth about
 * production, and refreshing them is part of the orchestrator's release-control
 * commit rather than any lane's work.
 */
export const EARLY_ACCESS_MIGRATION_LEDGER_IS_STALE = true as const;

/**
 * ROUTE CARDINALITY IS PINNED AT EXACTLY 348 REGISTRATIONS ACROSS 339 CALL
 * SITES, asserted in `server/release-control-plane.test.ts`, which is a
 * release-control file only the orchestrator may edit.
 *
 * So a lane that adds a route breaks a gate it is forbidden to fix. That is
 * intentional. Report the exact count and the exact paths in the handoff, leave
 * the gate red in the lane branch, and say so plainly. The orchestrator folds
 * every lane's additions into one release-control commit at the end of fusion.
 * A lane that edits the pin to go green has defeated the mechanism.
 */
export const EARLY_ACCESS_ROUTE_PIN_AT_BASE = Object.freeze({
  registrations: 348,
  callSites: 339,
} as const);
