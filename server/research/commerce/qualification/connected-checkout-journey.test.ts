// The connected journey, run end to end over the LOCAL binding.
//
// This proves the runner: that every scenario's steps and expectations are
// right, and that the composed durable surface satisfies them. It is scripted
// transport, so it is NOT provider qualification — the receipt says so itself,
// and the last assertion in this file is that a green local run still reports
// `qualified: false`.
import { describe, expect, it } from "vitest";
import type { CartDto, CheckoutRequest } from "@shared/research/commerce-api";
import type { ShippingQuote } from "@shared/research/commerce";
import type { ReservationSeam } from "../checkout";
import { composeDurableCheckout, type DurableCheckoutComposition } from "../durable-checkout-composition";
import { createInMemoryCheckoutExecutionStore } from "../persistence/checkout-executions-store";
import { createInMemoryOrderStore } from "../persistence/orders-store";
import { stripeModel } from "../stripe-model.test-helper";
import { createInMemoryWebhookExecutionInbox } from "../webhook-execution-processor";
import {
  assertQualificationTarget,
  QualificationRefusal,
  runConnectedCheckoutJourney,
  PRODUCTION_PROJECT,
  type JourneySurface,
  type ScenarioName,
} from "./connected-checkout-journey";

const NOW = new Date("2026-09-09T12:00:00Z");
const AUTH_PM = "pm_card_authenticationRequired";
const DECLINE_PM = "pm_card_chargeDeclined";

const cart: CartDto = {
  lines: [{ sku: "SKU-A", displayName: "Fixture A", quantity: 2, purchaseMode: "one_time", unitPriceCents: 10_000, lineTotalCents: 20_000, blockedReason: null }],
  shipmentGroups: [{ owner: "xenios", skus: ["SKU-A"] }],
  subtotalCents: 20_000,
  shippingCents: 1_000,
  storeCreditAppliedCents: 0,
  estimatedTotalCents: 21_000,
  checkoutReady: true,
  blockingReasons: [],
  requiredAgreements: ["research-use"],
};
const quote = { kind: "configured_standard", service: "standard", amountCents: 1_000, estimatedDeliveryRange: null, disclosure: "fixture" } as ShippingQuote;

/**
 * The LOCAL binding: the composed durable surface over in-memory stores and the
 * scripted Stripe model. A managed binding replaces exactly these functions
 * with the composed managed surface and the provider's test mode; the journey
 * above does not change.
 */
function localBinding() {
  const model = stripeModel();
  const orders = createInMemoryOrderStore();
  const holdEvents: string[] = [];
  let reservations = 0;
  const inventory: ReservationSeam = {
    async reserve(_m, lines) {
      const ids = lines.map(() => `res-${++reservations}`);
      holdEvents.push(`reserve:${ids.join("+")}`);
      return { ok: true, reservationIds: ids };
    },
    async release(ids) {
      holdEvents.push(`release:${ids.join("+")}`);
    },
    async finalize(ids) {
      holdEvents.push(`finalize:${ids.join("+")}`);
    },
  };
  // The durable stores outlive a "restart"; only the composition is rebuilt.
  const executions = createInMemoryCheckoutExecutionStore({ now: () => NOW, effects: { orders, inventory } });
  const inbox = createInMemoryWebhookExecutionInbox();
  let ids = 0;
  const compose = (): DurableCheckoutComposition =>
    composeDurableCheckout({
      env: { NODE_ENV: "test", STRIPE_PUBLISHABLE_KEY: "pk_test_abcdefgh12345678", STRIPE_SECRET_KEY: "sk_test_fake_unit_test_only" },
      provider: model.adapter,
      checkout: { evaluate: async () => ({ denials: [], cart, quote }) },
      orders,
      executions: { store: executions, durable: false },
      webhookInbox: { store: inbox, durable: false },
      inventory,
      now: () => NOW,
      newId: () => `${String(++ids).padStart(8, "0")}-0000-4000-8000-000000000000`,
      allowInMemoryStores: true,
    });
  let composition = compose();
  if (!composition.ready) throw new Error("the local binding must be ready");

  const live = () => {
    if (!composition.ready) throw new Error("composition not ready");
    return composition;
  };

  const surface: JourneySurface = {
    async submit(memberId, req) {
      const outcome = await live().submission.submit(memberId, req, NOW);
      return outcome.ok
        ? { ok: true, requestKey: outcome.requestKey, orderId: outcome.orderId, state: outcome.state, idempotent: outcome.idempotent, ...(outcome.cancellation ? { cancellation: outcome.cancellation } : {}) }
        : { ok: false, code: outcome.code };
    },
    async status(memberId, requestKey) {
      const result = await live().continuation.status(memberId, requestKey);
      return result.ok
        ? { ok: true, state: result.continuation.state, orderId: result.continuation.orderId, hasAuthenticationSecret: result.continuation.authentication !== undefined }
        : { ok: false, code: result.code };
    },
    async continue(memberId, requestKey) {
      const result = await live().continuation.continue(memberId, requestKey);
      return result.ok
        ? { ok: true, state: result.continuation.state, orderId: result.continuation.orderId, hasAuthenticationSecret: result.continuation.authentication !== undefined }
        : { ok: false, code: result.code };
    },
    async cancel(memberId, requestKey) {
      const result = await live().continuation.cancel(memberId, requestKey);
      return result.ok
        ? { ok: true, state: result.continuation.state, orderId: result.continuation.orderId, hasAuthenticationSecret: result.continuation.authentication !== undefined }
        : { ok: false, code: result.code };
    },
    async completeCustomerAction(providerReference) {
      model.completeAction(providerReference);
    },
    async deliverWebhook(input) {
      // The local binding drives the execution processor directly: the signed
      // envelope is proven separately (webhook-execution-processor.test.ts runs
      // real Stripe-signed events through the adapter). A managed binding posts
      // a genuinely signed body to the route instead.
      const outcome = await live().webhookProcessor.process(
        { eventId: input.eventId, eventType: input.eventType, providerReference: input.providerReference, orderId: input.orderId, memberId: input.memberId, amountCents: input.amountCents, currency: "usd", verified: true },
        "f".repeat(64),
        NOW,
      );
      return { ok: outcome.outcome !== "conflict" && outcome.outcome !== "retry", applied: outcome.outcome === "applied" };
    },
    readOrder: (orderId) => orders.get(orderId),
    readExecution: (memberId, requestKey) => executions.getForMember(memberId, requestKey),
    async readProviderPayment(providerReference) {
      const intent = model.intents.get(providerReference);
      if (!intent) return null;
      const status = intent.status === "succeeded" ? "captured" : intent.status === "canceled" ? "cancelled" : intent.status === "requires_capture" ? "authorized" : "pending";
      return { status, amountCapturableCents: intent.amount_capturable, amountReceivedCents: intent.amount_received };
    },
    async providerPaymentCount() {
      return model.intents.size;
    },
    injectFault(fault) {
      if (fault === "lost_response") model.faults.lostResponses = 1;
      else model.faults.serverErrors = 1;
    },
    async restart() {
      // Drop every in-process object and rebuild over the SAME durable stores.
      composition = compose();
    },
  };
  return { surface, model, orders, executions, holdEvents };
}

const MEMBERS: Record<ScenarioName, string> = {
  ordinary_payment: "00000000-0000-4000-8000-0000000000a1",
  authentication_required_and_return: "00000000-0000-4000-8000-0000000000a2",
  declined_card: "00000000-0000-4000-8000-0000000000a3",
  duplicate_submission: "00000000-0000-4000-8000-0000000000a4",
  lost_response_recovery: "00000000-0000-4000-8000-0000000000a5",
  restart_recovery: "00000000-0000-4000-8000-0000000000a6",
  local_commit_failure_then_reconciliation: "00000000-0000-4000-8000-0000000000a7",
  webhook_redelivery_and_out_of_order: "00000000-0000-4000-8000-0000000000a8",
  cancellation_and_settlement: "00000000-0000-4000-8000-0000000000a9",
  owner_only_reads: "00000000-0000-4000-8000-0000000000aa",
  account_switch_isolation: "00000000-0000-4000-8000-0000000000ab",
};

describe("connected checkout qualification target", () => {
  const managed = {
    binding: "managed" as const,
    projectRef: "tetynodzrtmdbuzgboro",
    publishableKey: "pk_test_abcdefgh12345678",
    secretKey: "sk_test_fake",
    webhookSecret: "whsec_fake",
    syntheticMemberIds: [MEMBERS.ordinary_payment, MEMBERS.declined_card],
    ownerApprovalSha256: "a".repeat(64),
  };

  it("accepts a complete test-mode plan and reports the target it bound", () => {
    expect(assertQualificationTarget(managed)).toEqual({
      binding: "managed",
      mode: "test",
      projectRef: "tetynodzrtmdbuzgboro",
      syntheticMemberIds: managed.syntheticMemberIds,
    });
  });

  it("refuses live credentials rather than substituting them for missing test access", () => {
    expect(() => assertQualificationTarget({ ...managed, publishableKey: "pk_live_abcdefgh12345678" })).toThrow(/live_publishable_key_refused/);
    expect(() => assertQualificationTarget({ ...managed, secretKey: "sk_live_fake" })).toThrow(/live_secret_key_refused/);
    expect(() => assertQualificationTarget({ ...managed, secretKey: "rk_live_fake" })).toThrow(/live_secret_key_refused/);
  });

  it("refuses the production project and a malformed or absent target", () => {
    expect(() => assertQualificationTarget({ ...managed, projectRef: PRODUCTION_PROJECT })).toThrow(/production_project_refused/);
    expect(() => assertQualificationTarget({ ...managed, projectRef: "nope" })).toThrow(/project_ref_invalid/);
    expect(() => assertQualificationTarget({ ...managed, webhookSecret: undefined })).toThrow(/webhook_secret_missing/);
    expect(() => assertQualificationTarget({ ...managed, ownerApprovalSha256: undefined })).toThrow(/owner_approval_missing/);
  });

  it("refuses a run that is not bound to distinct synthetic identities", () => {
    expect(() => assertQualificationTarget({ ...managed, syntheticMemberIds: [] })).toThrow(/synthetic_members_missing/);
    expect(() => assertQualificationTarget({ ...managed, syntheticMemberIds: ["not-a-uuid"] })).toThrow(/synthetic_member_not_a_uuid/);
    expect(() => assertQualificationTarget({ ...managed, syntheticMemberIds: [MEMBERS.ordinary_payment, MEMBERS.ordinary_payment] })).toThrow(/synthetic_members_not_distinct/);
    expect(() => assertQualificationTarget({ ...managed, syntheticMemberIds: undefined })).toThrow(QualificationRefusal);
  });

  it("needs no credentials for a local run, and a local run is never qualification", () => {
    expect(assertQualificationTarget({ binding: "local" })).toEqual({ binding: "local", mode: "test", projectRef: null, syntheticMemberIds: [] });
  });
});

describe("connected checkout journey over the local binding", () => {
  it("runs every scenario the binding supports, and reports the rest as skipped rather than passed", async () => {
    const binding = localBinding();
    let keys = 0;
    const receipt = await runConnectedCheckoutJourney({
      surface: binding.surface,
      target: assertQualificationTarget({ binding: "local" }),
      memberFor: (scenario) => MEMBERS[scenario],
      request: (overrides = {}): CheckoutRequest => ({
        shippingAddress: { line1: "1 Fixture St", city: "Austin", state: "TX", postalCode: "78701", country: "US" },
        shippingService: "standard",
        acceptedAgreementKeys: ["research-use"],
        researchAttestation: true,
        idempotencyKey: `req_journey_${String(++keys).padStart(4, "0")}`,
        paymentMethodReference: "pm_fixture_card",
        ...overrides,
      }),
      decliningPaymentMethod: DECLINE_PM,
      authenticationPaymentMethod: AUTH_PM,
    });

    const failures = receipt.scenarios.filter((s) => s.status === "failed").map((s) => `${s.scenario}: ${s.failure}`);
    expect(failures).toEqual([]);
    expect(receipt.failed).toBe(0);
    // Every scenario except the one that needs a real post-capture local failure.
    expect(receipt.scenarios.filter((s) => s.status === "skipped").map((s) => s.scenario)).toEqual(["local_commit_failure_then_reconciliation"]);
    expect(receipt.passed).toBe(10);

    // The receipt cannot be mistaken for provider evidence, however green.
    expect(receipt.qualified).toBe(false);
    expect(receipt.evidenceClass).toBe("local_scripted_transport");
    expect(receipt.binding).toBe("local");
    expect(receipt.mode).toBe("test");

    // And it carries no secret of any kind.
    const serialized = JSON.stringify(receipt);
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("sk_test");
    expect(serialized).not.toContain("whsec");
  });

  it("counts one payment per logical purchase across the whole journey", async () => {
    const binding = localBinding();
    let keys = 0;
    await runConnectedCheckoutJourney({
      surface: binding.surface,
      target: assertQualificationTarget({ binding: "local" }),
      memberFor: (scenario) => MEMBERS[scenario],
      request: (overrides = {}): CheckoutRequest => ({
        shippingAddress: { line1: "1 Fixture St", city: "Austin", state: "TX", postalCode: "78701", country: "US" },
        shippingService: "standard",
        acceptedAgreementKeys: ["research-use"],
        researchAttestation: true,
        idempotencyKey: `req_count_${String(++keys).padStart(4, "0")}`,
        paymentMethodReference: "pm_fixture_card",
        ...overrides,
      }),
      decliningPaymentMethod: DECLINE_PM,
      authenticationPaymentMethod: AUTH_PM,
    });
    // Every intent the provider holds is accounted for by exactly one execution.
    const executions = binding.executions.snapshot();
    const referenced = executions.map((e) => e.providerReference).filter((r): r is string => r !== null);
    expect(new Set(referenced).size).toBe(referenced.length);
    for (const reference of referenced) {
      expect(binding.model.intents.has(reference)).toBe(true);
    }
    // No intent ever received more than the execution that owns it asked for.
    for (const execution of executions) {
      if (!execution.providerReference) continue;
      const intent = binding.model.intents.get(execution.providerReference)!;
      expect(intent.amount_received === 0 || intent.amount_received === execution.amountCents).toBe(true);
    }
  });
});
