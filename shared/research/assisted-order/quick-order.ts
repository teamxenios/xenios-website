import type { ASSISTED_ORDER_CURRENCY } from "./contract";

/** Proposed admin-only enrichment. It grants no read, write or payout authority.
 * These type vocabularies mirror the existing QO declarations; the decoder
 * validates against core.mjs SOURCE_KINDS/AFFILIATIONS, not a second policy. */
export type QuickOrderDeclaredSource = "person" | "collective" | "organization" | "social" | "search" | "direct" | "other";
export type QuickOrderAffiliationKind = "none" | "collective" | "gym" | "team" | "clinic" | "other";
export type QuickOrderInitialReviewState = "direct_no_referrer" | "captured_unmatched";
export type QuickOrderEstimate = Readonly<{
  knownSubtotalCents: number;
  estimateComplete: boolean;
  currency: typeof ASSISTED_ORDER_CURRENCY;
}>;

export type QuickOrderIntakeProjection = Readonly<{
  schemaVersion: "quick-order-v1";
  source: QuickOrderDeclaredSource;
  sourceDetail: string;
  declaredCode: string | null;
  affiliationKind: QuickOrderAffiliationKind;
  affiliationDetail: string;
  confirmedByCustomer: true;
  confirmedAt: string;
  requestAcknowledged: true;
  reviewState: QuickOrderInitialReviewState;
  commissionState: "not_authorized";
  estimate: QuickOrderEstimate;
}>;

/** Existing research_notification_outbox vocabulary. `sent` records transport
 * acceptance, not recipient delivery or operator acknowledgment. */
export type QuickOrderNotificationStatus = "held" | "pending" | "processing" | "sent" | "delivered" | "failed_retryable" | "failed_permanent" | "cancelled";
export type QuickOrderAdminObservation =
  | Readonly<{ state: "stale" }>
  | Readonly<{
      state: "observed";
      observedAt: string;
      notification: Readonly<{
        status: QuickOrderNotificationStatus;
        attemptCount: number;
        nextAttemptAt: string;
        completedAt: string | null;
      }>;
    }>;

export type QuickOrderAdminProjection = Readonly<{
  intake: QuickOrderIntakeProjection;
  observation: QuickOrderAdminObservation;
}>;
