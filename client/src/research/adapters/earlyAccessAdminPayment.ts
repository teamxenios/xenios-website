import { apiGet, apiPost, type ApiResult } from "../lib/api";

export type EarlyAccessAdminPaymentReviewDto = Readonly<{
  cartCheckoutNumber: string;
  invoiceNumber: string;
  paymentReference: string;
  amountDueCents: number;
  currency: "USD";
  customer: Readonly<{ email: string; phone: string | null }>;
  lines: readonly Readonly<{
    orderNumber: string;
    sku: string;
    quantity: number;
    payableCents: number;
  }>[];
  paymentState: string;
  active: boolean;
  alreadySettled: boolean;
  agreementCurrent: boolean;
  agreementPackageVersion: string | null;
  submission: null | Readonly<{
    submissionId: string;
    methodName: string;
    filename: string;
    byteSize: number;
    internalEmailAcceptance: string;
    reconciliationRequired: boolean;
    createdAt: string;
  }>;
  canApprove: boolean;
  blockers: readonly string[];
}>;

export type EarlyAccessAdminApprovalInput = Readonly<{
  confirmedFundsReceived: true;
  confirmedAmountAndReference: true;
  externalTransactionId: string;
}>;

function paymentPath(cartCheckoutNumber: string): string {
  return `/api/admin/research/cart/${encodeURIComponent(cartCheckoutNumber)}/confirm-payment`;
}

export function getEarlyAccessAdminPaymentReview(
  token: string,
  cartCheckoutNumber: string,
): Promise<ApiResult<{ ok: true; review: EarlyAccessAdminPaymentReviewDto }>> {
  return apiGet(paymentPath(cartCheckoutNumber), token);
}

export function approveEarlyAccessAdminPayment(
  token: string,
  cartCheckoutNumber: string,
  input: EarlyAccessAdminApprovalInput,
): Promise<ApiResult<{ ok: true; replayed: boolean }>> {
  return apiPost(paymentPath(cartCheckoutNumber), input, token);
}
