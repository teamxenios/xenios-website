import { describe, expect, it } from "vitest";
import type { CheckoutExecutionRecord } from "@shared/research/durable-checkout-execution";
import type { WebhookVerification } from "../providers/payment";
import { bindPaymentEventToExecution } from "./webhook-execution-binding";

const execution: CheckoutExecutionRecord = {
  executionId: "exe-1",
  requestKey: "req-1",
  phase: "authorizing",
  version: 3,
  providerReference: "pi_0001",
  orderId: "11111111-1111-4111-8111-111111111111",
  memberId: "22222222-2222-4222-8222-222222222222",
  amountCents: 33_999,
  currency: "usd",
  paymentMethodReference: "pm_fixture",
  quoteFingerprint: "quote-1",
  authorizationKey: "xr-auth-key-0001",
  captureKey: "xr-capture-key-0001",
  cancelKey: "xr-cancel-key-0001",
  reservationIds: ["res-1"],
  createdAt: "2026-09-09T00:00:00Z",
};

function event(overrides: Partial<WebhookVerification> = {}): WebhookVerification {
  return {
    eventId: "evt_1",
    eventType: "payment.authorized",
    providerReference: "pi_0001",
    orderId: execution.orderId,
    memberId: execution.memberId,
    amountCents: execution.amountCents,
    currency: "usd",
    verified: true,
    ...overrides,
  };
}
const at = (phase: CheckoutExecutionRecord["phase"], providerReference: string | null = "pi_0001") => ({ ...execution, phase, providerReference });

describe("binding verified payment events to executions", () => {
  it("applies an authorization to a record in flight with exact evidence", () => {
    const decision = bindPaymentEventToExecution(event(), execution, null);
    expect(decision).toEqual({
      kind: "apply",
      target: "authorized",
      proof: { kind: "authorized", providerReference: "pi_0001", amountCents: 33_999, currency: "usd", memberId: execution.memberId, orderId: execution.orderId },
    });
  });
  it("lets a record that never learned its reference adopt it through server-authored order metadata only", () => {
    expect(bindPaymentEventToExecution(event(), at("reconciliation_required", null), null)).toMatchObject({ kind: "apply", target: "authorized" });
    expect(bindPaymentEventToExecution(event({ orderId: undefined }), at("authorizing", null), null)).toEqual({ kind: "isolate", reason: "execution_unbound_without_order_metadata" });
  });
  it.each([
    ["provider account", { providerAccountId: "acct_other" }, "provider_account_mismatch"],
    ["payment reference", { providerReference: "pi_0002" }, "payment_reference_mismatch"],
    ["order", { orderId: "33333333-3333-4333-8333-333333333333" }, "order_mismatch"],
    ["member", { memberId: "44444444-4444-4444-8444-444444444444" }, "member_mismatch"],
    ["currency", { currency: "eur" }, "currency_mismatch"],
    ["amount", { amountCents: 33_998 }, "amount_mismatch"],
    ["missing amount", { amountCents: undefined }, "amount_mismatch"],
    ["missing reference", { providerReference: undefined }, "reference_missing"],
    ["non-intent reference", { providerReference: "ch_123" }, "reference_missing"],
  ])("isolates evidence with a mismatched %s instead of attaching it", (_label, override, reason) => {
    expect(bindPaymentEventToExecution(event(override as Partial<WebhookVerification>), execution, null)).toEqual({ kind: "isolate", reason });
  });
  it("binds Connect events only to the configured account", () => {
    expect(bindPaymentEventToExecution(event({ providerAccountId: "acct_1" }), execution, "acct_1")).toMatchObject({ kind: "apply" });
    expect(bindPaymentEventToExecution(event(), execution, "acct_1")).toEqual({ kind: "isolate", reason: "provider_account_mismatch" });
  });
  it("is monotonic: duplicates and stale ordering acknowledge without re-applying", () => {
    for (const phase of ["authorized", "capturing", "captured", "committed", "cancelled"] as const) {
      expect(bindPaymentEventToExecution(event(), at(phase), null)).toEqual({ kind: "acknowledge", reason: "already_authorized_or_later" });
    }
    for (const phase of ["captured", "committed"] as const) {
      expect(bindPaymentEventToExecution(event({ eventType: "payment.captured" }), at(phase), null)).toEqual({ kind: "acknowledge", reason: "already_captured_or_later" });
    }
  });
  it("accepts a capture that arrives before the authorization was ever recorded", () => {
    for (const phase of ["reserved", "authorizing", "action_required", "reconciliation_required", "authorized", "capturing"] as const) {
      expect(bindPaymentEventToExecution(event({ eventType: "payment.captured" }), at(phase), null)).toMatchObject({ kind: "apply", target: "captured", proof: { kind: "captured", amountCents: 33_999 } });
    }
  });
  it("isolates a capture reported for a cancelled execution", () => {
    expect(bindPaymentEventToExecution(event({ eventType: "payment.captured" }), at("cancelled"), null)).toEqual({ kind: "isolate", reason: "captured_after_cancelled" });
  });
  it("records a failed attempt before authorization as a non-definitive refusal, and ignores it afterwards", () => {
    expect(bindPaymentEventToExecution(event({ eventType: "payment.failed", amountCents: undefined }), at("authorizing"), null)).toEqual({ kind: "apply", target: "refused", proof: { kind: "refused", definitiveNoEffect: false } });
    expect(bindPaymentEventToExecution(event({ eventType: "payment.failed", amountCents: undefined }), at("authorized"), null)).toEqual({ kind: "acknowledge", reason: "failed_after_authorization" });
  });
  it("acknowledges refunds and untranslated provider types without touching the execution", () => {
    expect(bindPaymentEventToExecution(event({ eventType: "payment.refunded" }), execution, null)).toEqual({ kind: "acknowledge", reason: "not_an_execution_event" });
    expect(bindPaymentEventToExecution(event({ eventType: "payment_intent.created" }), execution, null)).toEqual({ kind: "acknowledge", reason: "untranslated_event_type" });
    expect(bindPaymentEventToExecution(event({ eventType: "payment_intent.created" }), null, null)).toEqual({ kind: "acknowledge", reason: "untranslated_event_type" });
  });
  it("reports an event that names no execution as unbound", () => {
    expect(bindPaymentEventToExecution(event(), null, null)).toEqual({ kind: "unbound" });
  });
});
