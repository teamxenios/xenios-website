import type { EarlyAccessCartCurrency } from "@shared/research/early-access-cart";
import type { EarlyAccessSubmissionAdminView } from "../hardening-contract";
import { isCartCheckoutNumber } from "./model";
import type {
  EarlyAccessCartCheckoutStore,
  EarlyAccessCartSettlementStore,
} from "./ports";
import type { CartAdminRequest } from "./admin-routes";
import type { CartResponsePort } from "./routes";

export type EarlyAccessAdminPaymentReview = Readonly<{
  cartCheckoutNumber: string;
  invoiceNumber: string;
  paymentReference: string;
  amountDueCents: number;
  currency: EarlyAccessCartCurrency;
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
  blockers: readonly (
    | "checkout_superseded"
    | "already_settled"
    | "agreements_not_current"
    | "submission_missing"
    | "submission_unreconciled"
  )[];
}>;

export interface EarlyAccessAdminSubmissionReviewPort {
  byCheckoutNumber(checkoutNumber: string): Promise<EarlyAccessSubmissionAdminView | null>;
}

export interface EarlyAccessAdminAgreementReviewPort {
  forCheckout(checkoutNumber: string): Promise<Readonly<{
    satisfied: boolean;
    packageVersion: string | null;
  }>>;
}

export type EarlyAccessAdminPaymentReviewDeps = Readonly<{
  checkouts: EarlyAccessCartCheckoutStore;
  settlements: EarlyAccessCartSettlementStore;
  submissions: EarlyAccessAdminSubmissionReviewPort;
  agreements: EarlyAccessAdminAgreementReviewPort;
}>;

export async function readEarlyAccessAdminPaymentReview(
  deps: EarlyAccessAdminPaymentReviewDeps,
  checkoutNumber: string,
): Promise<EarlyAccessAdminPaymentReview | null> {
  const checkout = await deps.checkouts.byCheckoutNumber(checkoutNumber);
  if (!checkout) return null;
  const [settlement, submission, agreement] = await Promise.all([
    deps.settlements.settlement(checkoutNumber),
    deps.submissions.byCheckoutNumber(checkoutNumber),
    deps.agreements.forCheckout(checkoutNumber),
  ]);
  const blockers: EarlyAccessAdminPaymentReview["blockers"][number][] = [];
  if (checkout.disposition) blockers.push("checkout_superseded");
  if (settlement) blockers.push("already_settled");
  if (!agreement.satisfied) blockers.push("agreements_not_current");
  if (!submission || submission.internalEmailAcceptance !== "accepted") {
    blockers.push(submission ? "submission_unreconciled" : "submission_missing");
  } else if (submission.reconciliationRequired) {
    blockers.push("submission_unreconciled");
  }

  return Object.freeze({
    cartCheckoutNumber: checkout.cartCheckoutNumber,
    invoiceNumber: checkout.invoice.invoiceNumber,
    paymentReference: checkout.invoice.paymentReference,
    amountDueCents: checkout.invoice.payableTotalCents,
    currency: checkout.invoice.currency,
    customer: Object.freeze({ ...checkout.contact }),
    lines: Object.freeze(
      checkout.invoice.lines.map((line) =>
        Object.freeze({
          orderNumber: line.orderNumber,
          sku: line.sku,
          quantity: line.quantity,
          payableCents: line.payableCents,
        }),
      ),
    ),
    paymentState: checkout.paymentState,
    active: !checkout.disposition,
    alreadySettled: settlement !== null,
    agreementCurrent: agreement.satisfied,
    agreementPackageVersion: agreement.packageVersion,
    submission:
      submission === null
        ? null
        : Object.freeze({
            submissionId: submission.submissionId,
            methodName: submission.method.methodName,
            filename: submission.filename,
            byteSize: submission.byteSize,
            internalEmailAcceptance: submission.internalEmailAcceptance,
            reconciliationRequired: submission.reconciliationRequired,
            createdAt: submission.createdAt,
          }),
    canApprove: blockers.length === 0,
    blockers: Object.freeze(blockers),
  });
}

/** GET on the existing canonical payment-confirm path; POST remains the one action. */
export function createEarlyAccessCartPaymentReviewAdminRoute(
  deps: EarlyAccessAdminPaymentReviewDeps,
) {
  return async (request: CartAdminRequest, response: CartResponsePort): Promise<void> => {
    response.setHeader?.("Cache-Control", "no-store, private, max-age=0");
    response.setHeader?.("Pragma", "no-cache");
    response.setHeader?.("X-Content-Type-Options", "nosniff");
    if (!request.actor) {
      response.status(401).json({ ok: false, code: "UNAUTHORIZED" });
      return;
    }
    if (!isCartCheckoutNumber(request.cartCheckoutNumber)) {
      response.status(404).json({ ok: false, code: "NOT_FOUND" });
      return;
    }
    const review = await readEarlyAccessAdminPaymentReview(
      deps,
      request.cartCheckoutNumber,
    );
    if (!review) {
      response.status(404).json({ ok: false, code: "NOT_FOUND" });
      return;
    }
    response.status(200).json({ ok: true, review });
  };
}
