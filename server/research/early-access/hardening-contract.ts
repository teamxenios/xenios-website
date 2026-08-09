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
 * RESOLVED BY FOUNDER DECISION. A Private Early Access session is sufficient
 * for the intended Early Access customer cart routes. No second password.
 *
 * THE PROBLEM, PROVEN RATHER THAN INFERRED. The research gateway wall mounts on
 * `/api/research` before the Early Access API registers and default-denies
 * anyone without the research gateway cookie. Its admission sets name session,
 * catalog, agreements, unlock, logout, orders and verification, and no cart
 * path; the single `"/cart"` entry in that file is an exact-match
 * member-platform path. An executed probe, composed exactly as `server/index.ts`
 * composes the app, confirmed all five existing cart routes answer 401 with the
 * wall's own `"Access required."` while an exempt control path answers 200.
 *
 * THE DECISION. Private Early Access authentication is the intended customer
 * gate. A customer who has unlocked Early Access must not be asked for the
 * research gateway password as well. The wall is NOT broadly weakened to
 * achieve that, and no unrelated `/research` route becomes reachable.
 *
 * THE SHAPE OF THE FIX, and it is narrow on purpose. Exactly the seven doors
 * below are admitted, method-exact and path-exact, following the pattern the
 * verification and agreement doors already use: the wall stops answering for
 * them, and each one then enforces its OWN stronger gate. Admission through the
 * wall is not authorization. Every admitted door still resolves the customer
 * from the durable Early Access session and still refuses a checkout that is
 * not theirs with the same 404 an unknown checkout gets. One customer reaching
 * another customer's cart or order remains impossible, and that property is the
 * point of doing this narrowly rather than by prefix.
 *
 * A PREFIX MATCH WOULD BE WRONG. `/early-access/cart/` as a prefix would admit
 * every future path anyone adds under it, including ones written before their
 * ownership check exists. The parameterized entries are anchored regexes over
 * the exact checkout-number grammar, so a malformed or probing segment does not
 * match and is refused by the wall as before.
 *
 * THE ADMIN DOORS ARE NOT AFFECTED. They live under `/api/admin/research/...`,
 * outside this wall, behind `requireSupabaseAdmin`. Nothing here touches them.
 */
export const EARLY_ACCESS_WALL_ADMITS_CART_ON_EA_SESSION = true as const;

/**
 * The checkout-number grammar, mirroring `CART_NUMBER` in `cart/model.ts`. Any
 * anchored admission regex must use exactly this and nothing looser.
 */
export const EARLY_ACCESS_CART_NUMBER_SEGMENT = "XEC-[A-Z0-9]{16,40}" as const;

/**
 * The complete admission list. Paths are as the WALL sees them, relative to the
 * `/api/research` mount, which is why they read `/early-access/...` rather than
 * `/api/research/early-access/...`.
 *
 * Seven doors, no more. Adding an eighth is an orchestrator decision with its
 * own ownership check, not a lane's.
 */
export const EARLY_ACCESS_WALL_ADMITTED_CART_DOORS = Object.freeze([
  // Literal paths. The capability probe is what the browser calls before it
  // renders anything, so walling it makes the cart look absent rather than off.
  Object.freeze({ method: "GET", kind: "literal", path: "/early-access/cart/capability" }),
  Object.freeze({ method: "POST", kind: "literal", path: "/early-access/cart/quote" }),
  Object.freeze({ method: "POST", kind: "literal", path: "/early-access/cart/checkout" }),
  // Parameterized reads, anchored on the checkout-number grammar.
  Object.freeze({ method: "GET", kind: "anchored", path: "/early-access/cart/<XEC>" }),
  Object.freeze({ method: "GET", kind: "anchored", path: "/early-access/cart/<XEC>/status" }),
  Object.freeze({
    method: "GET",
    kind: "anchored",
    path: "/early-access/cart/<XEC>/payment-instructions",
  }),
  // The proof upload door. Without its own entry it reads as broken rather
  // than closed, which is the worst possible answer during a checkout.
  Object.freeze({
    method: "POST",
    kind: "anchored",
    path: "/early-access/cart/<XEC>/payment-proof",
  }),
] as const);

/**
 * Admission through the wall is not authorization, and every admitted door
 * must still prove all three of these for itself. Named so a reviewer can
 * check each door against a list rather than a memory.
 */
export const EARLY_ACCESS_ADMITTED_DOOR_OBLIGATIONS = Object.freeze([
  /** Resolve the customer from the durable Early Access session cookie. */
  "resolve_customer_from_session",
  /** Refuse a checkout belonging to anyone else, indistinguishably from unknown. */
  "enforce_checkout_ownership",
  /** Answer 404, never 403, so the door cannot become an existence oracle. */
  "refuse_as_not_found",
] as const);

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
 * DIRECTION. FROZEN AS A RULE, not as an observation.
 *
 * `docs/coordination/MIGRATION_DAG.json` marks every Early Access migration,
 * including 58, 60 and 61, as `appliedToProduction: false` with a pending
 * managed id, and `CURRENT_PRODUCTION_STATE.json` was generated before the cart
 * existed at all. Meanwhile migration 61's own header narrates two real
 * production checkouts by number, which cannot exist unless 58 and 60 ran.
 *
 * The four rules that follow from that, and they bind every lane:
 *
 * 1. Repository release-control metadata is NOT authoritative production
 *    evidence until it has been reconciled against a read-only read of live
 *    production. `appliedToProduction: false` here does not mean absent, and a
 *    true value would not mean present either.
 * 2. DO NOT change an `appliedToProduction` value on the strength of an
 *    inference. Only a read-only production read may move one, and the read is
 *    cited when it does.
 * 3. DO NOT undo or contradict known production migration 61 state. Its
 *    duplicate-guard index, its supersession triggers and its
 *    `checkout_superseded` row are live facts to build on, not proposals.
 * 4. The final release runbook performs read-only production verification
 *    BEFORE any migration or deploy decision. No candidate is judged shippable
 *    against the repository's own ledger alone.
 */
export const EARLY_ACCESS_LEDGER_IS_NOT_PRODUCTION_EVIDENCE = true as const;

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

// ---------------------------------------------------------------------------
// 9. Six more findings frozen as rules.
// ---------------------------------------------------------------------------

/**
 * THE 72-HOUR SLA IS NEW FUNCTIONALITY, NOT PRESERVATION.
 *
 * No `shipByAt`, no `paymentVerifiedAt` and no Early Access fulfilment clock
 * exists in code or schema at the base. The settlement records `settled_at` and
 * nothing else. The 72-hour commitment appears only as prose in an operations
 * note and a migration comment. `server/research/sla.ts` is the MEMBER PLATFORM
 * sweep, covering assessment deadlines and plan reviews, and it is deliberately
 * not attached to any timer.
 *
 * So this is built, not preserved, and it needs its own tests rather than an
 * assumption that something already enforces it. Two things to reuse rather
 * than reinvent: the sweep's claim-before-emit pattern with a unique
 * (kind, subject, phase) key, and one of the four real production timers in
 * `server/index.ts`. A monitor attached to none of them is library code.
 */
export const EARLY_ACCESS_SLA_IS_NEW_FUNCTIONALITY = true as const;

/**
 * THE PROOF EMAIL CANNOT RIDE THE DURABLE OUTBOX, AND THAT IS NOT NEGOTIABLE.
 *
 * No email in this repository sends an attachment and the outbox has no
 * attachment path. Enqueue is a row insert by design. Putting proof bytes in an
 * outbox row so a retry can resend them is precisely what "transient" forbids,
 * so the proof email is a direct provider send and forfeits the outbox's retry,
 * dedup and reclaim.
 *
 * What replaces them, and all three are required together: persist the
 * submission IDENTITY durably before the send, derive a deterministic provider
 * idempotency key from that identity, and model the ambiguous outcome
 * explicitly rather than collapsing it.
 */
export const EARLY_ACCESS_PROOF_EMAIL_BYPASSES_OUTBOX = true as const;

/**
 * THE CUSTOMER IS CURRENTLY TOLD THEY HAVE AN ORDER BEFORE THEY HAVE SUBMITTED
 * ANYTHING.
 *
 * `ea_checkout_created` fires at checkout confirm and reads "We have your Early
 * Access order". At that moment no proof exists and the payment state is
 * `awaiting_payment`. If the proof submission is the real operational
 * submission, that email contradicts it in the customer's inbox.
 *
 * The wording and the timing must distinguish CHECKOUT RESERVED from ORDER
 * SUBMITTED FOR PAYMENT REVIEW, which is what `EARLY_ACCESS_ORDER_STAGES`
 * exists to express. The existing `checkout_created` database event and email
 * key stay stable, so the founder checkout never needs reissuing.
 */
export const EARLY_ACCESS_RESERVED_IS_NOT_SUBMITTED = true as const;

/**
 * THE AGREEMENT GATE IS CHECKED IN ONE PLACE TODAY, NOT FOUR.
 *
 * The quote calls it. The checkout service does not reference agreements at
 * all, proof submission does not exist yet, and the settlement RPC performs no
 * agreement check. So a customer can quote under one package and settle under
 * another.
 *
 * The three additions go at DURABLE boundaries, not in a route handler where a
 * second caller can bypass them. Defence in depth means the check exists at the
 * commit boundary even when the route above it already checked.
 */
export const EARLY_ACCESS_AGREEMENT_CHECKS_TO_ADD = Object.freeze([
  "checkout",
  "proof_submission",
  "settlement",
] as const);

/**
 * NO SECOND SETTLEMENT DOOR. Extend the existing route, service and RPC.
 *
 * Stated twice in this file on purpose, because it is the single easiest rule
 * to break by accident: a new route that calls the settlement port directly
 * looks correct in isolation and silently skips the notifier that tells the
 * customer and the suppliers. The existing door commits atomically and then
 * notifies outside the transaction, and deliberately does not notify on the
 * `already_settled` replay branch.
 *
 * Note there is a SECOND, SEPARATE door for the single-product order flow at
 * `/api/admin/research/payments/:orderNumber/confirm`. Two product flows, one
 * door each. Do not conflate them, and do not let a new cart route become a
 * third.
 */
export const EARLY_ACCESS_SINGLE_ORDER_SETTLEMENT_ROUTE =
  "/api/admin/research/payments/:orderNumber/confirm" as const;

/**
 * THE CATALOG SEPARATION ALREADY EXISTS. PRESERVE IT, DO NOT REBUILD IT.
 *
 * `server/research/early-access/release/storefront-view.ts` already carries the
 * two orthogonal fields: a unit state of purchasable, request_access,
 * coming_soon or held, crossed with an availability state, with `purchasable`
 * stated explicitly so no client derives it and a price set only when the unit
 * is purchasable. A unit is purchasable only if Product Control cleared it or a
 * valid founder release covers it, and the quote service refuses any line that
 * is not.
 *
 * The roadmap joins to that projection on `(productId, variantId)` and mints
 * nothing: not a purchasable flag, not a price. A roadmap display state must
 * never grant purchase authority, which `canAddToCart` enforces structurally by
 * never reading the roadmap stage at all.
 */
export const EARLY_ACCESS_CATALOG_AUTHORITY_IS_STOREFRONT_VIEW = true as const;
