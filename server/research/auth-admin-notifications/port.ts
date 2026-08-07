import type { NotificationIntent, TurnstileAssessment } from "./contracts";

/** Production adapters must verify the token server-side and never persist or log it. */
export interface TurnstileVerificationPort {
  assess(input: Readonly<{ token: string; expectedAction: "membership_application" }>): Promise<TurnstileAssessment>;
}

/** Delivery is deliberately outside the pure kernel and must be idempotent by intent key. */
export interface NotificationDeliveryPort {
  enqueue(intent: NotificationIntent): Promise<Readonly<{ accepted: boolean; providerReference?: string }>>;
}
