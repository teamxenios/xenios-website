/** Narrow, validated canonical observations for the managed runner; absent money is never zero. */
import { cents, fail, objectOf, requiredString } from "./managed-runtime";

export const QUALIFICATION_ORDER_COLUMNS = "id,member_id,state,subtotal_cents,shipping_cents,store_credit_applied_cents,total_cents,payment_reference,authorized_amount_cents,captured_amount_cents,refunded_cents,checkout_idempotency_key,last_idempotency_key,review_triggers,created_at,updated_at";
export function mapObservedOrder<S extends string>(value: unknown, allowedStates: readonly S[]) {
  const row = objectOf(value); if (!row) return fail("order_row_invalid");
  const state = requiredString(row.state, "order_state_missing");
  if (!(allowedStates as readonly string[]).includes(state)) fail("order_state_unknown");
  const optionalAmount = (key: string) => row[key] === null ? undefined : cents(row[key], `order_${key}_invalid`);
  const nullableString = (key: string) => row[key] === null ? null : requiredString(row[key], `order_${key}_missing`);
  if (!Array.isArray(row.review_triggers) || row.review_triggers.some(x => typeof x !== "string")) fail("order_review_projection_invalid");
  return {
    orderId: requiredString(row.id, "order_id_missing"), memberId: requiredString(row.member_id, "order_member_missing"),
    state: state as S, lines: [],
    totals: { subtotalCents: cents(row.subtotal_cents), shippingCents: cents(row.shipping_cents),
      storeCreditAppliedCents: cents(row.store_credit_applied_cents), totalCents: cents(row.total_cents) },
    providerReference: nullableString("payment_reference"),
    authorizedAmountCents: optionalAmount("authorized_amount_cents"), capturedAmountCents: optionalAmount("captured_amount_cents"),
    refundedCents: cents(row.refunded_cents, "order_refund_projection_missing"),
    checkoutIdempotencyKey: nullableString("checkout_idempotency_key"), lastIdempotencyKey: nullableString("last_idempotency_key"),
    reviewTriggers: [...row.review_triggers as string[]],
    createdAt: requiredString(row.created_at, "order_created_at_missing"), updatedAt: requiredString(row.updated_at, "order_updated_at_missing"),
  };
}
const PROVIDER_STATES: Record<string, string> = {
  requires_payment_method: "pending", requires_confirmation: "pending", requires_action: "pending", processing: "processing",
  requires_capture: "authorized", succeeded: "captured", canceled: "cancelled",
};
export function mapObservedPayment(raw: unknown, reference: string) {
  const p = objectOf(raw); if (!p) return fail("provider_payment_missing");
  if (p.id !== reference || p.currency !== "usd" || p.livemode !== false) fail("provider_payment_identity_or_mode_mismatch");
  const native = requiredString(p.status, "provider_status_missing");
  const status = PROVIDER_STATES[native]; if (!status) fail("provider_status_unknown");
  return { status, amountCapturableCents: cents(p.amount_capturable), amountReceivedCents: cents(p.amount_received) };
}
