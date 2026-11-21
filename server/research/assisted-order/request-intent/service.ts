import { CatalogAdmissionFailure, type CatalogAdmission, type ContactAdmissionKey } from "./catalog-admission";
import type { CarePrincipal } from "../../../../shared/care/contracts";
import { canReadPendingRequestIntent, pendingRequestStaffMode, type RequestIntentStaffReadContext } from "./staff-read-authority";
import { quantityIsAllowed } from "../../../../shared/research/assisted-order/action-policy";
import { AssistedOrderValidationError, type AssistedOrderCatalogQuery } from "../../../../shared/research/assisted-order/contract";
import { assistedOrderFormPair, requiredAssistedOrderFormAcknowledgments } from "../../../../shared/research/assisted-order/form";
import {
  REQUEST_INTENT_KIND, validateRequestIntentInput,
  type RequestIntentDetail, type RequestIntentReceipt, type RequestIntentLine, type RequestIntentQueuePage, type RequestIntentInput,
} from "../../../../shared/research/assisted-order/request-intent";
import type {
  AssistedOrderViewer, AssistedOrderHasher, AssistedOrderClock,
  AssistedOrderIdGenerator, AssistedOrderSubmissionStanding, AssistedOrderLegalPort,
} from "../ports";
import type { RequestIntentCatalog } from "./catalog";
import { mixedInquiryCatalogPage } from "../../../../shared/research/early-access/quote-only";
import { inquiryReviewCodeForVariant } from "../../master-offerings/inquiry-review-states";

export class RequestIntentError extends Error {
  constructor(public readonly code: string, public readonly status: 400 | 401 | 403 | 409 | 503) {
    super(code);
  }
}
/** One owner authority for save, recovery and the separate workflow projection. */
export function requestIntentOwner(viewer: AssistedOrderViewer, hasher: AssistedOrderHasher): string {
  if (!viewer.capabilities.has("assisted_orders:submit")) throw new RequestIntentError("authentication_required", 401);
  if (viewer.actorType === "member" && viewer.authUserId && viewer.memberId) {
    return hasher.stableHash(["request-intent-owner", "member", viewer.authUserId]);
  }
  if (viewer.actorType === "early_access_session" && viewer.earlyAccessCustomerRef && viewer.earlyAccessSessionHash) {
    return hasher.stableHash(["request-intent-owner", "session", viewer.earlyAccessCustomerRef, viewer.earlyAccessSessionHash]);
  }
  throw new RequestIntentError("authentication_required", 401);
}
export type StoredIntent = Readonly<{ receipt: RequestIntentReceipt; fingerprint: string }>;
export type CreateIntent = Readonly<{
  ownerHash: string; attemptHash: string; fingerprint: string; detail: RequestIntentDetail;
  /** Derived server-side; never accepted from a request body or recovered from email. */
  referralAdmission?: ContactAdmissionKey;
}>;
export type RequestIntentRepository = Readonly<{
  findAttempt(ownerHash: string, attemptHash: string): Promise<StoredIntent | null>;
  createOrReplay(record: CreateIntent): Promise<StoredIntent>;
}>;
export const REQUEST_INTENT_PREPARATION_PROTOCOL = "request-intent/fixture-prepare/v1" as const;
export type RequestIntentPreparationQuery = Readonly<{
  ownerHash: string; attemptHash: string; fingerprint: string;
  snapshot: Readonly<{ lines: readonly RequestIntentLine[]; agreements: RequestIntentDetail["agreements"] }>;
  admissionKey: ContactAdmissionKey;
  /** Current server-observed v4 revision for every mode; null for composed v3. */
  referralRevision: string | null;
  notAfter: string;
}>;
export type RequestIntentPreparationMetadata = Readonly<{
  protocol: typeof REQUEST_INTENT_PREPARATION_PROTOCOL;
  snapshotSha256: string; issuedAt: string; expiresAt: string;
  admissionExpiresAt: string; admissionPolicyRevision: string; referralRevision?: string;
}>;
/** Server-only attestation input, not consent, publication or Auth authority. */
export type RequestIntentPreparedFacts = RequestIntentPreparationMetadata & Readonly<{
  ownerHash: string; attemptHash: string; fingerprint: string;
  sessionBindingHash: string; admissionKey: ContactAdmissionKey;
}>;
export type RequestIntentPreparationPort = Readonly<{
  /** A separately approved absolute upper bound. Never a browser TTL or renewed deadline. */
  notAfter: string;
  metadata(query: RequestIntentPreparationQuery): Promise<unknown>;
  /** Root owns the unavailable-by-default purpose/runtime/credential implementation. */
  issue(facts: RequestIntentPreparedFacts): Promise<unknown>;
}>;
export class RequestIntentPreparationError extends Error {
  constructor(readonly code: "request_preparation_refused" | "request_preparation_unavailable",
    readonly status: 400 | 401 | 403 | 409 | 503) { super(code); }
}
const preparationUnavailable = () => new RequestIntentPreparationError("request_preparation_unavailable",503);
const HASH = /^[a-f0-9]{64}$/;
const REVISION = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
type NormalizedSubmission = Readonly<{ownerHash:string;input:RequestIntentInput;attemptHash:string;fingerprint:string}>;
/** Preserve PostgreSQL microseconds for comparisons; never truncate a deadline. */
export function preparationInstant(value: unknown): bigint {
  if(typeof value!=="string")throw preparationUnavailable();
  const match=/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|\+00:00)$/.exec(value);
  if(!match)throw preparationUnavailable();
  const fraction=(match[2]??"").padEnd(6,"0");
  const canonical=match[1]+"."+fraction.slice(0,3)+"Z";
  const milliseconds=Date.parse(canonical);
  if(!Number.isFinite(milliseconds)||new Date(milliseconds).toISOString()!==canonical)throw preparationUnavailable();
  return BigInt(milliseconds)*1000n+BigInt(fraction.slice(3));
}
/** Validate the same closed SQL return at factory and custom-port boundaries. */
export function validatePreparationMetadata(raw: unknown, query: RequestIntentPreparationQuery): RequestIntentPreparationMetadata {
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw preparationUnavailable();
  const fields=["protocol","snapshotSha256","issuedAt","expiresAt","admissionExpiresAt","admissionPolicyRevision"];
  if(query.referralRevision!==null)fields.push("referralRevision");
  const keys=Reflect.ownKeys(raw);
  if(keys.length!==fields.length||keys.some(key=>typeof key!=="string"||!fields.includes(key)
    ||!("value" in Object.getOwnPropertyDescriptor(raw,key)!)))throw preparationUnavailable();
  const row=Object.fromEntries(fields.map(key=>[key,Object.getOwnPropertyDescriptor(raw,key)!.value]));
  if(row.protocol!==REQUEST_INTENT_PREPARATION_PROTOCOL||typeof row.snapshotSha256!=="string"||!HASH.test(row.snapshotSha256)
    ||row.admissionPolicyRevision!==query.admissionKey.policyRevision
    ||(query.referralRevision!==null&&(row.referralRevision!==query.referralRevision||!REVISION.test(query.referralRevision))))throw preparationUnavailable();
  const issued=preparationInstant(row.issuedAt),expires=preparationInstant(row.expiresAt),admission=preparationInstant(row.admissionExpiresAt);
  if(issued>=expires||expires>admission||expires>preparationInstant(query.notAfter))throw preparationUnavailable();
  return Object.freeze({protocol:REQUEST_INTENT_PREPARATION_PROTOCOL,snapshotSha256:row.snapshotSha256,
    issuedAt:row.issuedAt as string,expiresAt:row.expiresAt as string,admissionExpiresAt:row.admissionExpiresAt as string,
    admissionPolicyRevision:query.admissionKey.policyRevision,
    ...(query.referralRevision!==null?{referralRevision:query.referralRevision}:{})});
}
/** Backend-only reader; the actor comes from canonical Care authentication, never request data. */
export type RequestIntentStaffReader = Readonly<{
  get(requestId: string, verifiedActorSubjectId: string, scope?: "operator"): Promise<RequestIntentDetail | null>;
  list(verifiedActorSubjectId: string, page: number, scope?: "operator"): Promise<RequestIntentQueuePage>;
}>;
export type RequestIntentDependencies = Readonly<{
  catalog: RequestIntentCatalog;
  repository: RequestIntentRepository;
  standing: AssistedOrderSubmissionStanding;
  /** Optional until the private contact custodian and gate/UI are qualified by the owner. */
  contactAdmission?: CatalogAdmission;
  /**
   * Kept for compatibility with older composition wiring. A mixed customer
   * inquiry never exposes catalog prices, even if this value is false or absent.
   * Private pricing and historical orders each have their own authority.
   */
  quoteOnly?: boolean;
  optionalIntakeEnabled?: boolean;
  /** No preparation route/issuer/metadata capability is inferred from ordinary intake. */
  preparation?: RequestIntentPreparationPort;
  legal: AssistedOrderLegalPort;
  hasher: AssistedOrderHasher;
  ids: AssistedOrderIdGenerator;
  clock: AssistedOrderClock;
}>;

/**
 * Private intent only. A separate outbox worker reconciles committed requests
 * for staff alerts. Submission has no mail, payment, or supplier dependency.
 */
export class RequestIntentService {
  constructor(private readonly deps: RequestIntentDependencies) {}

  private owner(viewer: AssistedOrderViewer): string {
    return requestIntentOwner(viewer, this.deps.hasher);
  }

  private async assertStanding(viewer: AssistedOrderViewer) {
    if (!await this.deps.standing.accepted(viewer)) throw new RequestIntentError("agreement_standing_required", 403);
  }
  async admissionStatus(viewer: AssistedOrderViewer) {
    const ownerHash=this.owner(viewer);
    await this.assertStanding(viewer);
    if(!this.deps.contactAdmission) throw new RequestIntentError("catalog_admission_unavailable",503);
    return this.deps.contactAdmission.status(ownerHash,viewer.earlyAccessSessionHash);
  }
  async recordAdmission(viewer: AssistedOrderViewer, input: unknown) {
    const ownerHash=this.owner(viewer);
    await this.assertStanding(viewer);
    if(!this.deps.contactAdmission) throw new RequestIntentError("catalog_admission_unavailable",503);
    return this.deps.contactAdmission.capture(ownerHash,viewer.earlyAccessSessionHash,input);
  }

  async list(viewer: AssistedOrderViewer, query: AssistedOrderCatalogQuery) {
    const ownerHash=this.owner(viewer);
    // The session identifies a customer; it does not prove current policy acceptance.
    await this.assertStanding(viewer);
    await this.deps.contactAdmission?.require(ownerHash,viewer.earlyAccessSessionHash);
    const page = await this.deps.catalog.list(viewer, query);
    return mixedInquiryCatalogPage(page);
  }

  /** Same-session recovery returns only an actual committed reference, never a success guess. */
  async recover(viewer: AssistedOrderViewer, idempotencyKey: string): Promise<RequestIntentReceipt | null> {
    const ownerHash = this.owner(viewer);
    if (!/^[0-9a-f-]{36}$/i.test(idempotencyKey)) throw new RequestIntentError("invalid_attempt", 400);
    const stored = await this.deps.repository.findAttempt(ownerHash, this.deps.hasher.hash(idempotencyKey));
    return stored?.receipt ?? null;
  }

  /** Server-only exact-input read seam for a future prepared boundary. The
   * canonical caller still supplies ownership; a locator/witness grants none.
   * A null read is only not observed, NEVER atomic absence, terminal proof,
   * permission to reissue or evidence that an in-flight birth cannot commit.
   * No standing/admission/catalog/expiry check, ID or new request is created.
   */
  async findSavedSubmission(viewer: AssistedOrderViewer, raw: unknown): Promise<RequestIntentReceipt | null> {
    const {ownerHash,attemptHash,fingerprint}=this.normalizeSubmission(viewer,raw);
    const stored=await this.deps.repository.findAttempt(ownerHash,attemptHash);
    return stored ? this.replay(stored,fingerprint) : null;
  }

  private normalizeSubmission(viewer: AssistedOrderViewer,raw: unknown): NormalizedSubmission {
    const ownerHash = this.owner(viewer);
    const input = validateRequestIntentInput(raw);
    const attemptHash = this.deps.hasher.hash(input.idempotencyKey);
    const fingerprint = this.deps.hasher.stableHash({
      ...(input.optionalIntake ? { optionalIntake: input.optionalIntake } : {}),
      kind: REQUEST_INTENT_KIND, contact: input.contact, agreements: input.agreements, lines: input.lines,
    });
    return {ownerHash,input,attemptHash,fingerprint};
  }

  private async resolveNewSubmission(viewer: AssistedOrderViewer,
    {ownerHash,input}: NormalizedSubmission) {
    if (input.optionalIntake && this.deps.optionalIntakeEnabled !== true) throw new RequestIntentError("optional_intake_unavailable", 400);
    if (input.optionalIntake?.referralChoice && this.deps.contactAdmission?.referralEnabled !== true)
      throw new RequestIntentError("optional_intake_unavailable",400);
    // A reported name is output-only unless the customer explicitly replaces
    // the referral. Legacy short codes remain compatible.
    if (input.optionalIntake?.referralName) throw new RequestIntentError("invalid_referral_choice", 400);
    await this.assertStanding(viewer);
    await this.deps.contactAdmission?.require(ownerHash,viewer.earlyAccessSessionHash);
    const referralAdmission = input.optionalIntake?.referralChoice?.mode === "use_saved"
      ? await this.deps.contactAdmission?.key(ownerHash,viewer.earlyAccessSessionHash) : undefined;
    if (input.optionalIntake?.referralChoice?.mode === "use_saved" && !referralAdmission)
      throw new RequestIntentError("catalog_admission_required", 403);

    const lines: RequestIntentLine[] = [];
    const resolved = await this.deps.catalog.resolveMany(viewer, input.lines);
    if (resolved.length !== input.lines.length) throw new RequestIntentError("catalog_result_invalid", 503);
    for (const [index, requested] of input.lines.entries()) {
      const item = resolved[index];
      if (!item || item.productId !== requested.productId || item.variantId !== requested.variantId
        || !item.selectableForReview || !item.sourceSelection
        || !quantityIsAllowed(item, requested.quantity)) {
        throw new RequestIntentError("selection_requires_refresh", 400);
      }
      lines.push({
        productId: item.productId, variantId: item.variantId, sourceVariantId: item.sourceSelection.variantId,
        productName: item.productName, specification: item.specification, family: item.family,
        workflowMode: item.workflowMode, quantity: requested.quantity, researchUseOnly: item.researchUseOnly,
        clinicalReviewRequired: item.clinicalReviewRequired, sourceDisplayState: item.sourceDisplayState,
        sourceVariantDisplayState: item.sourceVariantDisplayState, sourceRefusal: item.sourceRefusal,
        catalogVersion: item.catalogVersion, reviewState: "pending",
      });
    }
    let required: Awaited<ReturnType<AssistedOrderLegalPort["requiredAgreements"]>>;
    try { required = await this.deps.legal.requiredAgreements(); }
    catch { throw new RequestIntentError("legal_requirements_unavailable", 503); }
    if (!Array.isArray(required) || required.length === 0 || required.some((pair) => !pair.kind || !pair.version
      || pair.kind.startsWith("assisted_order_form_v1:"))) {
      throw new RequestIntentError("legal_requirements_unavailable", 503);
    }
    const expected = [
      ...required,
      ...requiredAssistedOrderFormAcknowledgments({ includesResearchUseOnly: lines.some((line) => line.researchUseOnly) })
        .map(assistedOrderFormPair),
    ];
    const key = (pair: { kind: string; version: string }) => JSON.stringify([pair.kind, pair.version]);
    const expectedSet = new Set(expected.map(key));
    const actual = new Set(input.agreements.map(key));
    if (expectedSet.size !== actual.size || [...expectedSet].some((pair) => !actual.has(pair))) {
      throw new RequestIntentError("current_acknowledgments_required", 400);
    }
    if (input.agreements.some((agreement) => Date.parse(agreement.acceptedAt) > this.deps.clock.now().getTime() + 300_000)) {
      throw new RequestIntentError("invalid_acceptance_time", 400);
    }
    return {lines,referralAdmission};
  }

  async submit(viewer: AssistedOrderViewer, raw: unknown): Promise<RequestIntentReceipt> {
    const normalized=this.normalizeSubmission(viewer,raw);
    const {ownerHash,input,attemptHash,fingerprint}=normalized;
    // Saved attempts replay BEFORE mutable standing/admission/catalog/legal checks.
    const prior=await this.deps.repository.findAttempt(ownerHash,attemptHash);
    if(prior)return this.replay(prior,fingerprint);
    const {lines,referralAdmission}=await this.resolveNewSubmission(viewer,normalized);
    const now = this.deps.clock.now();
    const requestId = this.deps.ids.uuid();
    const detail: RequestIntentDetail = {
      kind: REQUEST_INTENT_KIND, requestId,
      publicReference: "XRI-" + requestId.replace(/-/g, "").toUpperCase(),
      status: "pending_review", createdAt: now.toISOString(),
      contact: input.contact, agreements: input.agreements, lines,
      ...(input.optionalIntake ? { optionalIntake: input.optionalIntake } : {}),
    };
    // The repository transaction stores every line and audit event or none.
    const saved = await this.deps.repository.createOrReplay({ ownerHash, attemptHash, fingerprint, detail,
      ...(referralAdmission ? {referralAdmission} : {}) });
    return this.replay(saved, fingerprint);
  }

  /** Read-only canonical validation. No ID, assent, request, control or mail is minted. */
  async prepareFixture(viewer: AssistedOrderViewer,raw: unknown) {
    try {
      const port=this.deps.preparation;
      if(!port||typeof port.metadata!=="function"||typeof port.issue!=="function")throw preparationUnavailable();
      const normalized=this.normalizeSubmission(viewer,raw);
      const {ownerHash,input,attemptHash,fingerprint}=normalized;
      if(await this.deps.repository.findAttempt(ownerHash,attemptHash))
        throw new RequestIntentPreparationError("request_preparation_refused",409);
      const {lines}=await this.resolveNewSubmission(viewer,normalized);
      const admission=this.deps.contactAdmission;
      if(!admission||!viewer.earlyAccessSessionHash)throw preparationUnavailable();
      const standing=await admission.status(ownerHash,viewer.earlyAccessSessionHash);
      if(!standing.admitted)throw new RequestIntentPreparationError("request_preparation_refused",403);
      const admissionKey=Object.freeze(await admission.key(ownerHash,viewer.earlyAccessSessionHash));
      if(!HASH.test(admissionKey.ownerBinding)||!HASH.test(admissionKey.policyRevision)
        ||standing.policyRevision!==admissionKey.policyRevision)throw preparationUnavailable();
      const referralRevision=admission.referralEnabled?standing.referralRevision??null:null;
      if(admission.referralEnabled&&(!referralRevision||!REVISION.test(referralRevision)))throw preparationUnavailable();
      if(input.optionalIntake?.referralChoice?.mode==="use_saved"
        &&input.optionalIntake.referralChoice.admissionRevision!==referralRevision)
        throw new RequestIntentPreparationError("request_preparation_refused",409);
      const notAfter=port.notAfter;
      const now=this.deps.clock.now().getTime();
      if(!Number.isFinite(now)||preparationInstant(notAfter)<=BigInt(now)*1000n)throw preparationUnavailable();
      const query:RequestIntentPreparationQuery=Object.freeze({ownerHash,attemptHash,fingerprint,
        snapshot:Object.freeze({lines:Object.freeze(lines.map(line=>Object.freeze({...line}))),
          agreements:Object.freeze(input.agreements.map(agreement=>Object.freeze({...agreement})))}),
        admissionKey,referralRevision,notAfter});
      const metadata=validatePreparationMetadata(await port.metadata(query),query);
      const beforeIssue=this.deps.clock.now().getTime();
      if(!Number.isFinite(beforeIssue)||preparationInstant(metadata.expiresAt)<=BigInt(beforeIssue)*1000n)throw preparationUnavailable();
      const facts:RequestIntentPreparedFacts=Object.freeze({...metadata,ownerHash,attemptHash,fingerprint,admissionKey,
        sessionBindingHash:this.deps.hasher.stableHash(["request-intent/fixture-prepare-owner/v1",ownerHash,viewer.earlyAccessSessionHash])});
      const witness=await port.issue(facts);
      if(typeof witness!=="string"||witness.length<1||witness.length>8192||!/^[A-Za-z0-9._~-]+$/.test(witness))throw preparationUnavailable();
      const afterIssue=this.deps.clock.now().getTime();
      if(!Number.isFinite(afterIssue)||preparationInstant(metadata.expiresAt)<=BigInt(afterIssue)*1000n)throw preparationUnavailable();
      return Object.freeze({kind:"request_intent_prepared_fixture" as const,protocol:REQUEST_INTENT_PREPARATION_PROTOCOL,witness,expiresAt:metadata.expiresAt});
    }catch(error){
      if(error instanceof RequestIntentPreparationError)throw error;
      if(error instanceof AssistedOrderValidationError)throw new RequestIntentPreparationError("request_preparation_refused",400);
      if(error instanceof RequestIntentError||error instanceof CatalogAdmissionFailure){
        const status=error.status;
        if(status===400||status===401||status===403||status===409)throw new RequestIntentPreparationError("request_preparation_refused",status);
      }
      throw preparationUnavailable();
    }
  }

  private replay(saved: StoredIntent, expected: string): RequestIntentReceipt {
    if (saved.fingerprint !== expected) throw new RequestIntentError("attempt_conflict", 409);
    return saved.receipt;
  }

  async staffRead(
    principal: CarePrincipal | null, context: RequestIntentStaffReadContext,
    reader: RequestIntentStaffReader, requestId: string,
  ): Promise<RequestIntentDetail | null> {
    if (!principal) throw new RequestIntentError("authentication_required", 401);
    if (!canReadPendingRequestIntent(principal, context)) {
      throw new RequestIntentError("private_review_access_required", 403);
    }
    // This application check authorizes no clinical action. The backend reader
    // independently rechecks the verified actor’s active assignment and the approved
    // request_intent_pending_read capability on EVERY operation. Whole Care can
    // remain disabled. No direct authenticated Data API access is introduced.
    const detail = pendingRequestStaffMode(principal) === "operator"
      ? await reader.get(requestId, principal.subjectId, "operator")
      : await reader.get(requestId, principal.subjectId);
    if (!detail) return null;
    // Add, for staff only, the kind of open question on each line's listing.
    // Read now rather than stored, so it reflects the current review record.
    // A line whose listing has no open question is returned exactly as stored.
    return { ...detail, lines: detail.lines.map((line) => {
      const reviewCode = inquiryReviewCodeForVariant(line.sourceVariantId);
      return reviewCode === null ? line : { ...line, reviewCode };
    }) };
  }

  async staffList(principal: CarePrincipal | null, context: RequestIntentStaffReadContext,
    reader: RequestIntentStaffReader, page: number): Promise<RequestIntentQueuePage> {
    if (!principal) throw new RequestIntentError("authentication_required", 401);
    if (!canReadPendingRequestIntent(principal, context)) throw new RequestIntentError("private_review_access_required", 403);
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000) throw new RequestIntentError("invalid_page", 400);
    return pendingRequestStaffMode(principal) === "operator"
      ? reader.list(principal.subjectId, page, "operator")
      : reader.list(principal.subjectId, page);
  }

  rejectCommercialTransition(): never {
    // No approval/payment/fulfillment state exists on an unapproved intent.
    throw new RequestIntentError("unapproved_intent_has_no_commercial_authority", 409);
  }
}
