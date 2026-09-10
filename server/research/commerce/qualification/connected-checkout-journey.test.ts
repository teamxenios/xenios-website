// The connected journey, run end to end over the LOCAL binding.
//
// This proves the runner: that every scenario's steps and expectations are
// right, and that the composed durable surface satisfies them. It is scripted
// transport, so it is NOT provider qualification. The local binding declares
// honestly what it cannot do — it drives no browser challenge and its "restart"
// rebuilds an object over retained maps rather than restarting a process — so
// those scenarios are SKIPPED and the receipt reports `qualified: false`.
import { describe, expect, it } from "vitest";
import type { CartDto, CheckoutRequest } from "@shared/research/commerce-api";
import type { ShippingQuote } from "@shared/research/commerce";
import type { ReservationSeam } from "../checkout";
import { composeDurableCheckout, type DurableCheckoutComposition } from "../durable-checkout-composition";
import type { OrderRecord } from "../orders";
import { createInMemoryCheckoutExecutionStore } from "../persistence/checkout-executions-store";
import { createInMemoryOrderStore } from "../persistence/orders-store";
import { stripeModel } from "../stripe-model.test-helper";
import { createInMemoryWebhookExecutionInbox } from "../webhook-execution-processor";
import {
  assertBindingMatchesTarget,
  assertQualificationTarget,
  isReleasedAtProvider,
  QualificationRefusal,
  runConnectedCheckoutJourney,
  PRODUCTION_PROJECT,
  REQUIRED_SCENARIOS,
  type JourneySurface,
  type JourneyTransports,
  type ScenarioName,
} from "./connected-checkout-journey";

const NOW = new Date("2026-09-09T12:00:00Z");
const NON_CHALLENGE_PM = "pm_card_authenticationRequired";
const CHALLENGE_PM = "pm_card_authenticationRequiredChallenge";
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
 * scripted provider model. A managed binding replaces exactly these functions
 * with the composed managed surface and the provider's test mode, and declares
 * the capabilities it genuinely has; the journey does not change.
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

  // The local-commit fault seam: it lives HERE, in the binding, wrapping a test
  // double. Nothing equivalent exists in the application, so no production
  // request can reach it.
  let failNextCommit = false;
  const save = orders.save.bind(orders);
  orders.save = async (order: OrderRecord) => {
    if (failNextCommit && order.state === "payment_captured") {
      failNextCommit = false;
      throw new Error("simulated local transaction failure after capture");
    }
    return save(order);
  };

  const executions = createInMemoryCheckoutExecutionStore({ now: () => NOW, effects: { orders, inventory } });
  const inbox = createInMemoryWebhookExecutionInbox();
  const committed: string[] = [];
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
      onCommitted: (order) => {
        committed.push(order.orderId);
      },
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
    capabilities: {
      // This binding has no browser and drives no hosted challenge.
      browserDrivenChallenge: false,
      nonChallengeAuthentication: true,
      transportFaultInjection: true,
      // Rebuilding the composition over retained maps is NOT a process restart.
      processRestart: false,
      localCommitFault: true,
    },
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
      // The local binding drives the execution processor directly. The signed
      // envelope is proven separately (webhook-execution-processor.test.ts runs
      // real provider-signed events through the adapter). A managed binding
      // posts a genuinely signed body to the mounted route instead, and says so
      // through transports.signedWebhookRoute.
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
    async providerCaptureCount() {
      return model.captures().length;
    },
    async readDownstreamNotifications() {
      return [...committed];
    },
    async readReservationEvents() {
      return [...holdEvents];
    },
    injectFault(fault) {
      if (fault === "lost_response") model.faults.lostResponses = 1;
      else model.faults.serverErrors = 1;
    },
    failNextLocalCommit() {
      failNextCommit = true;
    },
    async restart() {
      composition = compose();
    },
  };
  return { surface, model, orders, executions, holdEvents, committed };
}

const MEMBERS: Record<ScenarioName, string> = {
  ordinary_payment: "00000000-0000-4000-8000-0000000000a1",
  authentication_challenge_and_return: "00000000-0000-4000-8000-0000000000a2",
  authentication_without_challenge: "00000000-0000-4000-8000-0000000000ac",
  declined_card: "00000000-0000-4000-8000-0000000000a3",
  duplicate_submission: "00000000-0000-4000-8000-0000000000a4",
  lost_response_recovery: "00000000-0000-4000-8000-0000000000a5",
  process_restart_recovery: "00000000-0000-4000-8000-0000000000a6",
  local_commit_failure_then_reconciliation: "00000000-0000-4000-8000-0000000000a7",
  webhook_redelivery_and_out_of_order: "00000000-0000-4000-8000-0000000000a8",
  cancellation_and_settlement: "00000000-0000-4000-8000-0000000000a9",
  cancellation_refuses_an_outstanding_authorization: "00000000-0000-4000-8000-0000000000ad",
  owner_only_reads: "00000000-0000-4000-8000-0000000000aa",
  account_switch_isolation: "00000000-0000-4000-8000-0000000000ab",
};

let keys = 0;
const requestFactory = (prefix: string) => (overrides: Partial<CheckoutRequest> = {}): CheckoutRequest => ({
  shippingAddress: { line1: "1 Fixture St", city: "Austin", state: "TX", postalCode: "78701", country: "US" },
  shippingService: "standard",
  acceptedAgreementKeys: ["research-use"],
  researchAttestation: true,
  idempotencyKey: `req_${prefix}_${String(++keys).padStart(4, "0")}`,
  paymentMethodReference: "pm_fixture_card",
  ...overrides,
});

const run = (surface: JourneySurface, prefix: string) =>
  runConnectedCheckoutJourney({
    surface,
    target: assertQualificationTarget({ binding: "local" }),
    memberFor: (scenario) => MEMBERS[scenario],
    request: requestFactory(prefix),
    decliningPaymentMethod: DECLINE_PM,
    nonChallengePaymentMethod: NON_CHALLENGE_PM,
    challengePaymentMethod: CHALLENGE_PM,
  });

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

  it("needs no credentials for a local run", () => {
    expect(assertQualificationTarget({ binding: "local" })).toEqual({ binding: "local", mode: "test", projectRef: null, syntheticMemberIds: [] });
  });
});

describe("a managed binding must actually be pointed at the approved environment", () => {
  const target = assertQualificationTarget({
    binding: "managed",
    projectRef: "tetynodzrtmdbuzgboro",
    publishableKey: "pk_test_abcdefgh12345678",
    secretKey: "sk_test_fake",
    webhookSecret: "whsec_fake",
    syntheticMemberIds: [MEMBERS.ordinary_payment],
    ownerApprovalSha256: "a".repeat(64),
  });
  const good: JourneyTransports = {
    databaseUrl: "https://tetynodzrtmdbuzgboro.supabase.co",
    providerMode: "test",
    providerAccountId: null,
    signedWebhookRoute: true,
    databaseOverHttp: true,
  };

  it("accepts live clients that match the plan", () => {
    expect(() => assertBindingMatchesTarget(target, good)).not.toThrow();
  });

  it("refuses a binding that validated a plan and then talked to something else", () => {
    // The whole point: a plan check on a project string cannot prove this.
    expect(() => assertBindingMatchesTarget(target, { ...good, databaseUrl: "https://someotherprojectxx.supabase.co" })).toThrow(/points_at_another_project/);
    expect(() => assertBindingMatchesTarget(target, { ...good, providerMode: "live" })).toThrow(/is_not_in_test_mode/);
    expect(() => assertBindingMatchesTarget(target, { ...good, databaseOverHttp: false })).toThrow(/is_not_using_a_real_database_client/);
    expect(() => assertBindingMatchesTarget(target, { ...good, signedWebhookRoute: false })).toThrow(/does_not_post_signed_webhooks/);
    expect(() => assertBindingMatchesTarget(target, undefined)).toThrow(/declared_no_transports/);
  });

  it("asks nothing of a local binding", () => {
    expect(() => assertBindingMatchesTarget(assertQualificationTarget({ binding: "local" }), undefined)).not.toThrow();
  });
});

describe("release is the provider's terminal word, not a zero amount", () => {
  it("refuses to call an outstanding authorization released", () => {
    expect(isReleasedAtProvider({ status: "authorized", amountCapturableCents: 21_000, amountReceivedCents: 0 })).toBe(false);
    expect(isReleasedAtProvider({ status: "pending", amountCapturableCents: 0, amountReceivedCents: 0 })).toBe(false);
    expect(isReleasedAtProvider({ status: "captured", amountCapturableCents: 0, amountReceivedCents: 21_000 })).toBe(false);
    expect(isReleasedAtProvider(null)).toBe(false);
    // Terminal AND holding nothing.
    expect(isReleasedAtProvider({ status: "cancelled", amountCapturableCents: 0, amountReceivedCents: 0 })).toBe(true);
    // Terminal but still holding, or terminal after taking money: not released.
    expect(isReleasedAtProvider({ status: "cancelled", amountCapturableCents: 21_000, amountReceivedCents: 0 })).toBe(false);
    expect(isReleasedAtProvider({ status: "cancelled", amountCapturableCents: 0, amountReceivedCents: 500 })).toBe(false);
  });
});

describe("connected checkout journey over the local binding", () => {
  it("executes every scenario this binding can honestly perform, including the capture-then-local-failure recovery", async () => {
    const binding = localBinding();
    const receipt = await run(binding.surface, "journey");

    const failures = receipt.scenarios.filter((s) => s.status === "failed").map((s) => `${s.scenario}: ${s.failure}`);
    expect(failures).toEqual([]);
    expect(receipt.failed).toBe(0);

    // The scenario that used to be skipped unconditionally now runs here.
    const recovery = receipt.scenarios.find((s) => s.scenario === "local_commit_failure_then_reconciliation");
    expect(recovery?.status).toBe("passed");
    expect(recovery?.observations.join(" ")).toContain("the provider captured exactly once");

    // And the two this binding genuinely cannot do are skipped, naming why.
    const skippedNames = receipt.scenarios.filter((s) => s.status === "skipped").map((s) => s.scenario);
    expect(skippedNames.sort()).toEqual(["authentication_challenge_and_return", "process_restart_recovery"]);
    for (const scenario of receipt.scenarios.filter((s) => s.status === "skipped")) {
      expect(scenario.missingCapability, `${scenario.scenario} must name what it needs`).toBeTruthy();
    }
    expect(receipt.scenarios.find((s) => s.scenario === "process_restart_recovery")?.missingCapability).toContain("rebuilding an object");

    // A local receipt cannot be mistaken for provider evidence, however green.
    expect(receipt.qualified).toBe(false);
    expect(receipt.evidenceClass).toBe("local_scripted_transport");
    expect(receipt.missingRequired.sort()).toEqual(["authentication_challenge_and_return", "process_restart_recovery"]);

    const serialized = JSON.stringify(receipt);
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("sk_test");
    expect(serialized).not.toContain("whsec");
  });

  it("cannot be made to qualify by supplying credentials while a required scenario is skipped", async () => {
    // The gap the review found: the old runner appended an unconditional skip
    // and then required zero skips, so no credentials could ever qualify it.
    // Now the scenario runs when the binding can do it, and a binding that
    // cannot is refused qualification for THAT reason, named.
    const binding = localBinding();
    const limited = {
      ...binding.surface,
      capabilities: { ...binding.surface.capabilities, localCommitFault: false },
      failNextLocalCommit: undefined,
    };
    const receipt = await run(limited, "limited");
    expect(receipt.failed).toBe(0);
    expect(receipt.missingRequired).toContain("local_commit_failure_then_reconciliation");
    expect(receipt.qualified).toBe(false);
    expect(REQUIRED_SCENARIOS).toContain("local_commit_failure_then_reconciliation");
  });

  it("counts one payment per logical purchase across the whole journey", async () => {
    const binding = localBinding();
    await run(binding.surface, "count");
    const executions = binding.executions.snapshot();
    const referenced = executions.map((e) => e.providerReference).filter((r): r is string => r !== null);
    expect(new Set(referenced).size).toBe(referenced.length);
    for (const reference of referenced) {
      expect(binding.model.intents.has(reference)).toBe(true);
    }
    for (const execution of executions) {
      if (!execution.providerReference) continue;
      const intent = binding.model.intents.get(execution.providerReference)!;
      expect(intent.amount_received === 0 || intent.amount_received === execution.amountCents).toBe(true);
    }
  });
});
