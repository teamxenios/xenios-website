// ---------------------------------------------------------------------------
// Founding membership activation: the MEMBER API adapter. One exported
// function per /api/research/activation/* endpoint (13 member routes, wire
// shapes frozen by server/research/membership-activation/routes.ts). Every
// call attaches the member token and returns the shared ApiResult envelope,
// so the activation page routes on machine codes and never invents data.
//
// Money discipline: amounts travel as integer cents. Consent discipline:
// every boolean the server requires to be "exactly true" is typed as a
// literal here so a defaulted or prechecked value cannot compile its way
// onto the wire.
// ---------------------------------------------------------------------------

import { apiGet, apiPost, type ApiResult } from "../lib/api";

const BASE = "/api/research/activation";

// ------------------------------- wire types --------------------------------

export type ActivationStepState = "complete" | "action_required" | "pending" | "blocked";

export interface ActivationStep {
  step: string;
  state: ActivationStepState;
  detail: string | null;
}

export interface ActivationStatusDto {
  steps: ActivationStep[];
  currentStep: string | null;
  active: boolean;
  membershipStatus: string;
  activatedAt: string | null;
  renewalDate: string | null;
  /** The server's verbatim submission contract; render it, never rewrite it. */
  submissionContract: string;
}

export interface IdentityCaseDto {
  status: string;
  consentVersion: string | null;
  consentRecordedAt: string | null;
  uploadedAt: string | null;
  outcome: string | null;
  rejectionCategory: string | null;
}

export interface IdentityStatusDto {
  case: IdentityCaseDto | null;
  /** The applicant guidance (incl. permitted concealment) from the domain
   * constants, served verbatim by the server. */
  guidance: string[];
}

export interface UploadGrantDto {
  uploadUrl: string;
  expiresAt: string;
  maxBytes: number;
}

export interface EvidenceGrantDto extends UploadGrantDto {
  evidenceRef: string;
}

export interface AgreementDto {
  category: string;
  title: string;
  documentVersionId: string;
  semver: string;
  requirement: string;
  activationStep: number;
  requiresSeparateAcknowledgment: boolean;
  jurisdiction: string;
  effectiveDate: string | null;
  content: string;
  contentHash: string;
  signed: boolean;
  signedCurrentVersion: boolean;
}

export interface AgreementsDto {
  agreements: AgreementDto[];
  satisfied: boolean;
  blocking: Array<{ category: string; reason: string }>;
  /** The exported blank form state: nothing is ever prechecked. */
  formState: {
    affirmativeConsent: boolean;
    fullDocumentShown: boolean;
    separateAcknowledgment: boolean;
    typedLegalName: string;
  };
}

export interface SignatureDto {
  id: string;
  category: string;
  documentVersionId: string;
  semver: string;
  contentHash: string;
  typedLegalName: string;
  separateAcknowledgment: boolean;
  signedAt: string;
}

export interface SignedAgreementDto {
  signature: SignatureDto;
  document: {
    id: string;
    category: string;
    title: string;
    semver: string;
    status: string;
    content: string;
    contentHash: string;
    jurisdiction: string;
    publishedAt: string | null;
    effectiveDate: string | null;
  } | null;
}

export interface MemberObligationDto {
  xeniosRef: string;
  type: "activation_50" | "renewal_25";
  status: string;
  expectedAmountCents: number;
  currency: string;
  description: string;
  dueAt: string;
  methodId: string;
  methodLabel: string;
  submittedAt: string | null;
  receiptRef: string | null;
}

/** Masked-only, always: the wire has no field for receiving-instruction
 * plaintext, so nothing here can ever render a real destination. */
export interface MemberMethodDto {
  methodId: string;
  memberFacingName: string;
  category: string;
  currency: string;
  activationEligible: boolean;
  renewalEligible: boolean;
  minAmountCents: number | null;
  maxAmountCents: number | null;
  settlementTime: string | null;
  receivingInstructionsMasked: string;
  mobileInstructions: string | null;
  desktopInstructions: string | null;
  memoInstructions: string | null;
  deepLinkRef: string | null;
  qrAssetRef: string | null;
  supportContactRef: string | null;
  /** The memo the member must include so the payment matches them. */
  memoReference: string;
}

export interface SignAgreementInput {
  documentVersionId: string;
  typedLegalName: string;
  /** True only because the UI truly rendered the full document. */
  fullDocumentShown: boolean;
  /** The member's own affirmative act; never defaulted. */
  affirmativeConsent: boolean;
  separateAcknowledgment?: boolean;
}

export interface ReportPaymentInput {
  amountCents: number;
  sentDate: string;
  sentTime: string | null;
  senderName: string;
  senderContact: string | null;
  senderIdentifierMasked: string | null;
  externalRef: string | null;
  note: string | null;
  evidenceRef: string | null;
  /** The literal true the wire demands; a false report never leaves the page. */
  accuracyCertified: true;
}

export interface UploadUrlInput {
  contentType: string;
  contentLengthBytes: number;
  fileName: string;
}

// --------------------------------- reads -----------------------------------

export function getActivationStatus(token: string | null): Promise<ApiResult<ActivationStatusDto>> {
  return apiGet<ActivationStatusDto>(`${BASE}/status`, token);
}

export function getIdentityStatus(token: string | null): Promise<ApiResult<IdentityStatusDto>> {
  return apiGet<IdentityStatusDto>(`${BASE}/identity/status`, token);
}

export function listAgreements(token: string | null): Promise<ApiResult<AgreementsDto>> {
  return apiGet<AgreementsDto>(`${BASE}/agreements`, token);
}

export function listSignedAgreements(
  token: string | null,
): Promise<ApiResult<{ signed: SignedAgreementDto[] }>> {
  return apiGet(`${BASE}/agreements/signed`, token);
}

export function listPaymentMethods(
  token: string | null,
): Promise<ApiResult<{ methods: MemberMethodDto[]; memoReference: string; submissionContract: string }>> {
  return apiGet(`${BASE}/payment/methods`, token);
}

export function getObligation(
  token: string | null,
): Promise<ApiResult<{ obligation: MemberObligationDto | null; submissionContract: string }>> {
  return apiGet(`${BASE}/payment/obligation`, token);
}

// -------------------------------- actions ----------------------------------

export function recordIdentityConsent(
  token: string | null,
  accepted: boolean,
  consentVersion: string,
): Promise<ApiResult<{ case: IdentityCaseDto; guidance?: string[] }>> {
  return apiPost(`${BASE}/identity/consent`, { accepted, consentVersion }, token);
}

export function requestIdentityUploadUrl(
  token: string | null,
  input: UploadUrlInput,
): Promise<ApiResult<{ grant: UploadGrantDto }>> {
  return apiPost(`${BASE}/identity/upload-url`, input, token);
}

export function markIdentityUploaded(token: string | null): Promise<ApiResult<{ case: IdentityCaseDto }>> {
  return apiPost(`${BASE}/identity/mark-uploaded`, {}, token);
}

export function signAgreement(
  token: string | null,
  input: SignAgreementInput,
): Promise<ApiResult<{ replayed: boolean; signature: SignatureDto }>> {
  return apiPost(`${BASE}/agreements/sign`, input, token);
}

export function selectPaymentMethod(
  token: string | null,
  methodId: string,
): Promise<ApiResult<{ obligation: MemberObligationDto; created: boolean }>> {
  return apiPost(`${BASE}/payment/select-method`, { methodId }, token);
}

export function reportPayment(
  token: string | null,
  input: ReportPaymentInput,
): Promise<ApiResult<{ obligation: MemberObligationDto; submissionContract: string }>> {
  return apiPost(`${BASE}/payment/report`, input, token);
}

export function requestEvidenceUploadUrl(
  token: string | null,
  input: UploadUrlInput,
): Promise<ApiResult<{ grant: EvidenceGrantDto }>> {
  return apiPost(`${BASE}/payment/evidence-upload-url`, input, token);
}

// ---------------------------- upload transport -----------------------------

/**
 * PUT the file bytes to a signed upload URL. This talks to the storage
 * provider directly (the grant), never to our API, and sends no bearer token.
 */
export async function uploadFileToGrant(uploadUrl: string, file: Blob, contentType: string): Promise<boolean> {
  try {
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: file,
    });
    return res.ok;
  } catch {
    return false;
  }
}
