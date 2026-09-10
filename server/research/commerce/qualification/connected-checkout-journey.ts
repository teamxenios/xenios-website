// The connected purchasing journey, as ONE reproducible runner.
//
// The same sequence of scenarios runs in two bindings:
//
//   LOCAL     the in-memory execution store and the scripted Stripe model.
//             This proves the runner's own steps and assertions are right. It
//             proves nothing about the SQL or the real provider.
//   MANAGED   the composed durable surface over the managed database and the
//             provider's TEST mode. Only this produces qualification evidence,
//             and only the integration owner runs it.
//
// Nothing here can reach production or live money. `assertQualificationTarget`
// refuses a live key, a live-mode plan, the production project, and any
// mismatch between the browser key's mode and the server key's mode, BEFORE a
// surface is constructed. There is no override flag: a missing prerequisite is
// reported, never worked around.
//
// The receipt carries outcomes, counts and references. It never carries a
// secret, a client secret, a full webhook body, or a card detail.

import type { CheckoutRequest } from "@shared/research/commerce-api";
import type { CheckoutExecutionRecord } from "@shared/research/durable-checkout-execution";
import type { DurableCheckoutState } from "../durable-checkout-submission";
import type { OrderRecord } from "../orders";

/** Supabase project that must never appear in a qualification plan. */
export const PRODUCTION_PROJECT = "yvzeduaxbwgcwllhywff";

export class QualificationRefusal extends Error {
  constructor(readonly code: string) {
    super(`Connected checkout qualification refused: ${code}`);
  }
}
function refuse(code: string): never {
  throw new QualificationRefusal(code);
}

export interface ConnectedCheckoutTarget {
  /** "local" needs no credentials and produces no qualification evidence. */
  binding: "local" | "managed";
  /** Supabase project ref for a managed run. Absent for local. */
  projectRef?: string;
  /** The provider keys for a managed run. Only their MODE is inspected here. */
  publishableKey?: string;
  secretKey?: string;
  webhookSecret?: string;
  /** Synthetic member ids the run is allowed to touch. Never a real customer. */
  syntheticMemberIds?: readonly string[];
  /** The owner's recorded approval for this exact target. */
  ownerApprovalSha256?: string;
}

export interface QualificationTarget {
  binding: "local" | "managed";
  mode: "test";
  projectRef: string | null;
  syntheticMemberIds: readonly string[];
}

const SHA256 = /^[a-f0-9]{64}$/;
const PROJECT_REF = /^[a-z]{20}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * The only door to a managed run. Every refusal is a precise code the operator
 * can act on; none of them can be turned off.
 */
export function assertQualificationTarget(target: ConnectedCheckoutTarget): QualificationTarget {
  if (target.binding === "local") {
    return { binding: "local", mode: "test", projectRef: null, syntheticMemberIds: target.syntheticMemberIds ?? [] };
  }
  const projectRef = target.projectRef ?? "";
  if (!PROJECT_REF.test(projectRef)) refuse("project_ref_invalid");
  if (projectRef === PRODUCTION_PROJECT) refuse("production_project_refused");

  // Live credentials are never a substitute for missing test access.
  const publishable = target.publishableKey ?? "";
  const secret = target.secretKey ?? "";
  if (!/^pk_test_[A-Za-z0-9]{8,}$/.test(publishable)) {
    refuse(/^pk_live_/.test(publishable) ? "live_publishable_key_refused" : "publishable_key_missing_or_malformed");
  }
  if (!/^(sk|rk)_test_[A-Za-z0-9]{4,}$/.test(secret)) {
    refuse(/^(sk|rk)_live_/.test(secret) ? "live_secret_key_refused" : "secret_key_missing_or_malformed");
  }
  if (!/^whsec_[A-Za-z0-9]{4,}$/.test(target.webhookSecret ?? "")) refuse("webhook_secret_missing");

  const members = target.syntheticMemberIds ?? [];
  if (members.length === 0) refuse("synthetic_members_missing");
  if (members.some((id) => !UUID.test(id))) refuse("synthetic_member_not_a_uuid");
  if (new Set(members).size !== members.length) refuse("synthetic_members_not_distinct");

  if (!SHA256.test(target.ownerApprovalSha256 ?? "")) refuse("owner_approval_missing");
  return { binding: "managed", mode: "test", projectRef, syntheticMemberIds: members };
}

// ---------------------------------------------------------------------------
// The seam the journey drives. A binding supplies these; the journey itself
// contains no transport, no SQL and no provider knowledge.
// ---------------------------------------------------------------------------

export interface JourneySubmitResult {
  ok: boolean;
  code?: string;
  requestKey?: string;
  orderId?: string;
  state?: DurableCheckoutState;
  idempotent?: boolean;
  cancellation?: { reason: string };
}

export interface JourneyContinuation {
  ok: boolean;
  code?: string;
  state?: DurableCheckoutState;
  orderId?: string;
  /** Whether the provider offered a customer-action secret. The secret itself never leaves the surface. */
  hasAuthenticationSecret?: boolean;
}

export interface JourneySurface {
  /** POST the durable door as this member. */
  submit(memberId: string, request: CheckoutRequest): Promise<JourneySubmitResult>;
  status(memberId: string, requestKey: string): Promise<JourneyContinuation>;
  continue(memberId: string, requestKey: string): Promise<JourneyContinuation>;
  cancel(memberId: string, requestKey: string): Promise<JourneyContinuation>;
  /** Complete the customer action at the provider (test-mode helper or the model). */
  completeCustomerAction(providerReference: string): Promise<void>;
  /** Deliver a signed provider event for this execution; returns the handler's answer. */
  deliverWebhook(input: { eventId: string; eventType: string; providerReference: string; orderId: string; memberId: string; amountCents: number }): Promise<{ ok: boolean; applied?: boolean; code?: string }>;
  readOrder(orderId: string): Promise<OrderRecord | null>;
  readExecution(memberId: string, requestKey: string): Promise<CheckoutExecutionRecord | null>;
  /** The provider's own truth for a reference: status and the amounts it holds. */
  readProviderPayment(providerReference: string): Promise<{ status: string; amountCapturableCents: number; amountReceivedCents: number } | null>;
  /** How many payment objects this run has created at the provider, in total. */
  providerPaymentCount(): Promise<number>;
  /** Inject the next fault the transport should produce. Absent means the binding cannot inject it. */
  injectFault?(fault: "lost_response" | "server_error"): void;
  /** Restart the process/composition, dropping all in-process state. */
  restart?(): Promise<void>;
}

export interface JourneyRequestFactory {
  (overrides?: Partial<CheckoutRequest>): CheckoutRequest;
}

export type ScenarioName =
  | "ordinary_payment"
  | "authentication_required_and_return"
  | "declined_card"
  | "duplicate_submission"
  | "lost_response_recovery"
  | "restart_recovery"
  | "local_commit_failure_then_reconciliation"
  | "webhook_redelivery_and_out_of_order"
  | "cancellation_and_settlement"
  | "owner_only_reads"
  | "account_switch_isolation";

export interface ScenarioOutcome {
  scenario: ScenarioName;
  status: "passed" | "failed" | "skipped";
  /** Exactly what this scenario observed, in the vocabulary of the contracts. */
  observations: string[];
  /** Present when status is failed: the first expectation that did not hold. */
  failure?: string;
  /** Present when skipped: the capability the binding could not provide. */
  missingCapability?: string;
}

export interface JourneyReceipt {
  binding: "local" | "managed";
  mode: "test";
  projectRef: string | null;
  scenarios: ScenarioOutcome[];
  passed: number;
  failed: number;
  skipped: number;
  /** True only when every scenario passed AND the binding is managed. */
  qualified: boolean;
  /** Always stated, so a local receipt can never be read as provider evidence. */
  evidenceClass: "local_scripted_transport" | "managed_provider_test_mode";
}

interface Expect {
  (condition: boolean, detail: string): void;
}

/**
 * One member per scenario keeps the runs independent; the caller supplies the
 * synthetic ids and a request factory bound to a cart it has prepared.
 */
export interface JourneyInputs {
  surface: JourneySurface;
  target: QualificationTarget;
  /** A distinct synthetic member for each scenario that needs one. */
  memberFor(scenario: ScenarioName): string;
  /** A fresh request; the factory must vary the idempotency key per call unless asked not to. */
  request: JourneyRequestFactory;
  /** A payment-method reference the provider will decline (Stripe test mode: pm_card_chargeDeclined). */
  decliningPaymentMethod: string;
  /** A payment-method reference the provider will hold for customer action (Stripe test mode: a 3DS-required card). */
  authenticationPaymentMethod: string;
}

async function runScenario(name: ScenarioName, body: (expect: Expect) => Promise<string[]>): Promise<ScenarioOutcome> {
  const observations: string[] = [];
  let failure: string | undefined;
  const expect: Expect = (condition, detail) => {
    if (!condition && failure === undefined) failure = detail;
    if (condition) observations.push(detail);
  };
  try {
    const extra = await body(expect);
    observations.push(...extra);
  } catch (error) {
    failure = failure ?? `threw: ${error instanceof Error ? error.message : "unknown"}`;
  }
  return failure === undefined
    ? { scenario: name, status: "passed", observations }
    : { scenario: name, status: "failed", observations, failure };
}

function skipped(name: ScenarioName, missingCapability: string): ScenarioOutcome {
  return { scenario: name, status: "skipped", observations: [], missingCapability };
}

/**
 * Drives every scenario in order and reconciles the provider's truth against
 * the local records after each one. A scenario the binding cannot exercise is
 * SKIPPED with the exact missing capability; it is never silently passed.
 */
export async function runConnectedCheckoutJourney(inputs: JourneyInputs): Promise<JourneyReceipt> {
  const { surface, target, request } = inputs;
  const scenarios: ScenarioOutcome[] = [];

  // ---- ordinary payment -------------------------------------------------
  scenarios.push(
    await runScenario("ordinary_payment", async (expect) => {
      const member = inputs.memberFor("ordinary_payment");
      const req = request();
      const result = await surface.submit(member, req);
      expect(result.ok === true, `submit answered ok (state ${result.state ?? "none"})`);
      expect(result.state === "completed", "an ordinary payment completes synchronously");
      const order = result.orderId ? await surface.readOrder(result.orderId) : null;
      expect(order?.state === "payment_captured", "the canonical order is payment_captured");
      expect(order?.providerReference != null, "the order carries the provider reference");
      const execution = await surface.readExecution(member, req.idempotencyKey);
      expect(execution?.phase === "committed", "the execution is committed");
      const payment = execution?.providerReference ? await surface.readProviderPayment(execution.providerReference) : null;
      expect(payment?.amountReceivedCents === execution?.amountCents, "the provider received exactly the execution's amount");
      expect(order?.capturedAmountCents === execution?.amountCents, "the order records exactly the captured amount");
      return [];
    }),
  );

  // ---- authentication required, then return -----------------------------
  scenarios.push(
    await runScenario("authentication_required_and_return", async (expect) => {
      const member = inputs.memberFor("authentication_required_and_return");
      const req = request({ paymentMethodReference: inputs.authenticationPaymentMethod });
      const first = await surface.submit(member, req);
      expect(first.state === "authentication_required", "the buyer is asked to confirm with the bank");
      const before = await surface.status(member, req.idempotencyKey);
      expect(before.hasAuthenticationSecret === true, "the owner is given the provider's client flow input");
      // The customer "returns" before finishing: nothing may move.
      const early = await surface.continue(member, req.idempotencyKey);
      expect(early.state === "authentication_required", "returning early changes nothing and starts no second payment");
      const execution = await surface.readExecution(member, req.idempotencyKey);
      expect(execution?.providerReference != null, "the execution names the payment awaiting the customer");
      await surface.completeCustomerAction(execution!.providerReference!);
      const done = await surface.continue(member, req.idempotencyKey);
      expect(done.state === "completed", "after the customer finishes, the server verifies and completes");
      const order = await surface.readOrder(first.orderId!);
      expect(order?.state === "payment_captured", "the order is captured only after the provider's own truth");
      const payment = await surface.readProviderPayment(execution!.providerReference!);
      expect(payment?.amountReceivedCents === execution?.amountCents, "exactly one capture of the exact amount");
      return [];
    }),
  );

  // ---- decline ----------------------------------------------------------
  scenarios.push(
    await runScenario("declined_card", async (expect) => {
      const member = inputs.memberFor("declined_card");
      const req = request({ paymentMethodReference: inputs.decliningPaymentMethod });
      const result = await surface.submit(member, req);
      expect(result.ok === true, "a decline is a truthful answer, not an error");
      expect(result.state === "cancelled", "a declined attempt ends as cancelled");
      expect(result.cancellation?.reason === "declined", "the buyer is told the card was declined");
      const order = await surface.readOrder(result.orderId!);
      expect(order?.state === "cancelled", "the order is cancelled");
      expect((order?.capturedAmountCents ?? 0) === 0, "nothing was captured");
      const execution = await surface.readExecution(member, req.idempotencyKey);
      expect(execution?.settledAt != null, "the cancellation is locally settled");
      if (execution?.providerReference) {
        const payment = await surface.readProviderPayment(execution.providerReference);
        expect(payment?.amountReceivedCents === 0, "the provider holds no money for the declined attempt");
      }
      return [];
    }),
  );

  // ---- duplicate submission ---------------------------------------------
  scenarios.push(
    await runScenario("duplicate_submission", async (expect) => {
      const member = inputs.memberFor("duplicate_submission");
      const req = request();
      const before = await surface.providerPaymentCount();
      const [a, b, c] = await Promise.all([surface.submit(member, req), surface.submit(member, req), surface.submit(member, req)]);
      const orders = new Set([a.orderId, b.orderId, c.orderId].filter(Boolean));
      expect(orders.size === 1, "three concurrent identical submissions converge on one order");
      const after = await surface.providerPaymentCount();
      expect(after - before === 1, "and on exactly one payment at the provider");
      // A changed body under the same key is a conflict, never a silent reuse.
      const changed = await surface.submit(member, { ...req, shippingService: req.shippingService === "standard" ? "expedited_2day" : "standard" });
      expect(changed.ok === false && changed.code === "idempotency_conflict", "a changed request under the same key conflicts");
      expect((await surface.providerPaymentCount()) === after, "and creates no further payment");
      return [];
    }),
  );

  // ---- lost response ----------------------------------------------------
  scenarios.push(
    surface.injectFault
      ? await runScenario("lost_response_recovery", async (expect) => {
          const member = inputs.memberFor("lost_response_recovery");
          const req = request();
          const before = await surface.providerPaymentCount();
          surface.injectFault!("lost_response");
          const first = await surface.submit(member, req);
          expect(first.ok === true, "a lost provider response is answered truthfully, not as failure");
          expect(first.state === "reconciliation_required", "the execution parks for reconciliation");
          const order = await surface.readOrder(first.orderId!);
          expect(order?.state === "checkout_pending", "the order is not advanced on an unknown outcome");
          const retry = await surface.submit(member, req);
          expect(retry.state === "completed", "the identical retry recovers the SAME payment and completes");
          expect((await surface.providerPaymentCount()) - before === 1, "exactly one payment exists for the whole episode");
          return [];
        })
      : skipped("lost_response_recovery", "surface.injectFault"),
  );

  // ---- restart ----------------------------------------------------------
  scenarios.push(
    surface.restart
      ? await runScenario("restart_recovery", async (expect) => {
          const member = inputs.memberFor("restart_recovery");
          const req = request({ paymentMethodReference: inputs.authenticationPaymentMethod });
          const first = await surface.submit(member, req);
          expect(first.state === "authentication_required", "the execution stops for the customer");
          const execution = await surface.readExecution(member, req.idempotencyKey);
          const reference = execution?.providerReference ?? null;
          expect(reference != null, "the reference is durable before the restart");
          await surface.restart!();
          const afterRestart = await surface.readExecution(member, req.idempotencyKey);
          expect(afterRestart?.providerReference === reference, "the reference survives the restart");
          expect(afterRestart?.authorizationAttemptedAt != null, "the first-attempt stamp survives the restart");
          await surface.completeCustomerAction(reference!);
          const done = await surface.continue(member, req.idempotencyKey);
          expect(done.state === "completed", "a new process finishes the payment the old one started");
          return [];
        })
      : skipped("restart_recovery", "surface.restart"),
  );

  // ---- webhook redelivery and out-of-order ------------------------------
  scenarios.push(
    await runScenario("webhook_redelivery_and_out_of_order", async (expect) => {
      const member = inputs.memberFor("webhook_redelivery_and_out_of_order");
      const req = request();
      const placed = await surface.submit(member, req);
      const execution = await surface.readExecution(member, req.idempotencyKey);
      expect(execution?.providerReference != null, "the execution names its payment");
      const event = {
        providerReference: execution!.providerReference!,
        orderId: placed.orderId!,
        memberId: member,
        amountCents: execution!.amountCents,
      };
      // A late authorized event for an execution that already captured must not undo anything.
      const stale = await surface.deliverWebhook({ eventId: "evt_ooo_1", eventType: "payment.authorized", ...event });
      expect(stale.ok === true, "an out-of-order event is accepted without moving the execution backwards");
      const afterStale = await surface.readExecution(member, req.idempotencyKey);
      expect(afterStale?.phase === execution?.phase || afterStale?.phase === "committed", "the phase never regresses");
      const captured = await surface.deliverWebhook({ eventId: "evt_ooo_2", eventType: "payment.captured", ...event });
      expect(captured.ok === true, "the captured event is accepted");
      const redelivered = await surface.deliverWebhook({ eventId: "evt_ooo_2", eventType: "payment.captured", ...event });
      expect(redelivered.ok === true && redelivered.applied !== true, "a redelivery of the same event id applies nothing");
      const order = await surface.readOrder(placed.orderId!);
      expect((order?.capturedAmountCents ?? 0) === execution!.amountCents, "the order still records exactly one capture");
      return [];
    }),
  );

  // ---- cancellation and settlement --------------------------------------
  scenarios.push(
    await runScenario("cancellation_and_settlement", async (expect) => {
      const member = inputs.memberFor("cancellation_and_settlement");
      const req = request({ paymentMethodReference: inputs.authenticationPaymentMethod });
      const placed = await surface.submit(member, req);
      expect(placed.state === "authentication_required", "an unpaid checkout is waiting on the customer");
      const cancelled = await surface.cancel(member, req.idempotencyKey);
      expect(cancelled.state === "cancelled", "the buyer's cancellation is honoured");
      const execution = await surface.readExecution(member, req.idempotencyKey);
      expect(execution?.settledAt != null, "the local settlement completed");
      const order = await surface.readOrder(placed.orderId!);
      expect(order?.state === "cancelled", "the order is cancelled");
      if (execution?.providerReference) {
        const payment = await surface.readProviderPayment(execution.providerReference);
        expect(payment?.status === "cancelled" || payment?.amountReceivedCents === 0, "the provider released the payment");
      }
      const again = await surface.cancel(member, req.idempotencyKey);
      expect(again.state === "cancelled", "a repeated cancellation is a no-op answer");
      return [];
    }),
  );

  // ---- owner-only reads and account isolation ---------------------------
  scenarios.push(
    await runScenario("owner_only_reads", async (expect) => {
      const owner = inputs.memberFor("owner_only_reads");
      const other = inputs.memberFor("account_switch_isolation");
      const req = request({ paymentMethodReference: inputs.authenticationPaymentMethod });
      await surface.submit(owner, req);
      const stranger = await surface.status(other, req.idempotencyKey);
      expect(stranger.ok === false && stranger.code === "not_found", "another account cannot read this checkout");
      const strangerContinue = await surface.continue(other, req.idempotencyKey);
      expect(strangerContinue.ok === false && strangerContinue.code === "not_found", "another account cannot continue it");
      const strangerCancel = await surface.cancel(other, req.idempotencyKey);
      expect(strangerCancel.ok === false && strangerCancel.code === "not_found", "another account cannot cancel it");
      const ownerRead = await surface.status(owner, req.idempotencyKey);
      expect(ownerRead.ok === true, "the owner still reads their own checkout");
      return [];
    }),
  );

  scenarios.push(
    await runScenario("account_switch_isolation", async (expect) => {
      const owner = inputs.memberFor("owner_only_reads");
      const other = inputs.memberFor("account_switch_isolation");
      // The same request key belonging to another member is a different logical
      // checkout: it must never adopt the first member's execution or order.
      const req = request({ paymentMethodReference: inputs.authenticationPaymentMethod });
      const mine = await surface.submit(owner, req);
      const theirs = await surface.submit(other, { ...req, idempotencyKey: req.idempotencyKey });
      expect(theirs.orderId !== mine.orderId, "the same key under another account is a separate checkout");
      const mineExecution = await surface.readExecution(owner, req.idempotencyKey);
      const theirsExecution = await surface.readExecution(other, req.idempotencyKey);
      expect(mineExecution?.executionId !== theirsExecution?.executionId, "the executions are distinct");
      expect(mineExecution?.memberId === owner && theirsExecution?.memberId === other, "each execution names its own buyer");
      return [];
    }),
  );

  // The local-commit-failure case needs a binding that can make the local
  // transaction fail after the provider captured. It is never simulated by
  // pretending; a binding that cannot do it says so.
  scenarios.push(skipped("local_commit_failure_then_reconciliation", "binding cannot fail the local commit after a real capture"));

  const passed = scenarios.filter((s) => s.status === "passed").length;
  const failed = scenarios.filter((s) => s.status === "failed").length;
  const skippedCount = scenarios.filter((s) => s.status === "skipped").length;
  return {
    binding: target.binding,
    mode: "test",
    projectRef: target.projectRef,
    scenarios,
    passed,
    failed,
    skipped: skippedCount,
    // A local run is never qualification, however green it is.
    qualified: target.binding === "managed" && failed === 0 && skippedCount === 0,
    evidenceClass: target.binding === "managed" ? "managed_provider_test_mode" : "local_scripted_transport",
  };
}
