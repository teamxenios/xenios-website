// The connected purchasing journey, as ONE reproducible runner.
//
// The same sequence of scenarios runs in two bindings:
//
//   LOCAL     the in-memory execution store and the scripted provider model.
//             This proves the runner's own steps and assertions are right. It
//             proves nothing about the SQL or the real provider.
//   MANAGED   the composed durable surface over the managed database and the
//             provider's TEST mode. Only this produces qualification evidence,
//             and only the integration owner runs it.
//
// WHAT A BINDING MAY NOT DO IS LIE ABOUT ITSELF. A weaker capability must not
// stand in for a stronger proof, so each binding DECLARES what it can actually
// do (`JourneyCapabilities`) and the journey gates scenarios on those
// declarations. A card that authenticates without a challenge proves a
// different, easier path than a real browser-driven challenge, and it is
// reported as a different scenario. Rebuilding an object over retained
// in-memory maps is not a process restart. A scenario whose capability is
// absent is SKIPPED with the missing capability named; it is never quietly
// passed, and a skipped scenario prevents qualification.
//
// The fault seams (`injectFault`, `failNextLocalCommit`) live on the BINDING,
// not in the application: nothing here adds a switch that production customer
// traffic could reach.
//
// Nothing here can reach production or live money. `assertQualificationTarget`
// refuses a live key, the production project and a missing approval BEFORE a
// surface is constructed, and `assertBindingMatchesTarget` then refuses a
// binding whose LIVE clients do not point at the approved environment. A
// format check on a key prefix or an approval digest is not evidence that the
// clients use the approved environment, so both are required.
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
 * The plan check. Everything here is a FORMAT and policy check on what the
 * operator declared; it is necessary and not sufficient. `assertBindingMatchesTarget`
 * is the half that checks the live clients.
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

/**
 * What the binding's LIVE clients report about themselves.
 *
 * Every field must be read from the constructed client or adapter, never
 * copied from the same configuration the plan was built from. The point is to
 * catch a run that validated a plan for one environment and then talked to
 * another.
 */
export interface JourneyTransports {
  /** The base URL the database client is actually pointed at. */
  databaseUrl: string;
  /** The mode the payment adapter's own credential puts it in. */
  providerMode: "test" | "live";
  /** The provider account the adapter is bound to; null means platform only. */
  providerAccountId: string | null;
  /** True when the webhook scenario posts a genuinely signed body to the mounted route. */
  signedWebhookRoute: boolean;
  /** True when the database calls go through the real HTTP client, not a fake. */
  databaseOverHttp: boolean;
}

/** Refuses a binding whose live clients do not match the approved plan. */
export function assertBindingMatchesTarget(target: QualificationTarget, transports: JourneyTransports | undefined): void {
  if (target.binding === "local") return;
  if (!transports) refuse("managed_binding_declared_no_transports");
  if (transports.providerMode !== "test") refuse("managed_binding_is_not_in_test_mode");
  if (!transports.databaseOverHttp) refuse("managed_binding_is_not_using_a_real_database_client");
  if (!transports.signedWebhookRoute) refuse("managed_binding_does_not_post_signed_webhooks");
  // The one string that ties the live client to the approved project.
  if (transports.databaseUrl !== `https://${target.projectRef}.supabase.co`) refuse("managed_binding_points_at_another_project");
}

/**
 * What a binding can actually do. Declared, not inferred: a binding that cannot
 * drive a real challenge says so, and the scenario that needs one is skipped
 * rather than satisfied by an easier path.
 */
export interface JourneyCapabilities {
  /** Drives the provider's own hosted challenge in a browser and returns. */
  browserDrivenChallenge: boolean;
  /** Completes a customer action WITHOUT a challenge. A different, easier path. */
  nonChallengeAuthentication: boolean;
  /** Can drop a provider response after the provider processed the request. */
  transportFaultInjection: boolean;
  /** Restarts a REAL isolated process over persisted records. Rebuilding an object is not this. */
  processRestart: boolean;
  /** Can fail the local transaction after a real capture, at the intended boundary. */
  localCommitFault: boolean;
}

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
  /**
   * Why it was cancelled, when it was. A buyer's cancellation and a provider
   * decline both end in `cancelled`, so without this the buyer-cancellation
   * scenario cannot tell which one it proved.
   */
  cancellation?: { reason: string };
}

/** The provider's own truth about one payment. */
export interface JourneyPayment {
  /** The provider's terminal/interim status word, in the domain vocabulary. */
  status: string;
  amountCapturableCents: number;
  amountReceivedCents: number;
}

export interface JourneySurface {
  /** What this binding can actually do. */
  capabilities: JourneyCapabilities;
  /** Read from the live clients. Required for a managed run. */
  transports?: JourneyTransports;

  submit(memberId: string, request: CheckoutRequest): Promise<JourneySubmitResult>;
  status(memberId: string, requestKey: string): Promise<JourneyContinuation>;
  continue(memberId: string, requestKey: string): Promise<JourneyContinuation>;
  cancel(memberId: string, requestKey: string): Promise<JourneyContinuation>;

  /**
   * Complete the customer's action WITHOUT a challenge (a test method that
   * authenticates straight through, or the local model). Proves a real but
   * EASIER path; it is not challenge evidence.
   */
  completeCustomerAction?(providerReference: string): Promise<void>;
  /**
   * Drive the provider's own hosted challenge in a browser and return. This is
   * the only thing that proves the authentication-required path.
   */
  completeCustomerChallenge?(providerReference: string): Promise<void>;

  deliverWebhook(input: { eventId: string; eventType: string; providerReference: string; orderId: string; memberId: string; amountCents: number }): Promise<{ ok: boolean; applied?: boolean; code?: string }>;
  readOrder(orderId: string): Promise<OrderRecord | null>;
  readExecution(memberId: string, requestKey: string): Promise<CheckoutExecutionRecord | null>;
  readProviderPayment(providerReference: string): Promise<JourneyPayment | null>;
  /** How many payment objects this run has created at the provider, in total. */
  providerPaymentCount(): Promise<number>;
  /** How many CAPTURE operations the provider has performed, in total. */
  providerCaptureCount(): Promise<number>;

  /** Order ids the downstream hook was told about, in order. */
  readDownstreamNotifications?(): Promise<readonly string[]>;
  /** Inventory hold events, as `reserve:`/`release:`/`finalize:` markers. */
  readReservationEvents?(): Promise<readonly string[]>;

  /** Drop the next provider response AFTER the provider processed it. */
  injectFault?(fault: "lost_response" | "server_error"): void;
  /** Fail the next local commit that follows a real capture. */
  failNextLocalCommit?(): void;
  /** Restart a real isolated process over the persisted records. */
  restart?(): Promise<void>;
}

export interface JourneyRequestFactory {
  (overrides?: Partial<CheckoutRequest>): CheckoutRequest;
}

export type ScenarioName =
  | "ordinary_payment"
  | "authentication_challenge_and_return"
  | "authentication_without_challenge"
  | "declined_card"
  | "duplicate_submission"
  | "lost_response_recovery"
  | "process_restart_recovery"
  | "local_commit_failure_then_reconciliation"
  | "webhook_redelivery_and_out_of_order"
  | "cancellation_and_settlement"
  | "cancellation_refuses_an_outstanding_authorization"
  | "owner_only_reads"
  | "account_switch_isolation";

/** Every scenario a managed run must actually execute before it may qualify. */
export const REQUIRED_SCENARIOS: readonly ScenarioName[] = [
  "ordinary_payment",
  "authentication_challenge_and_return",
  "authentication_without_challenge",
  "declined_card",
  "duplicate_submission",
  "lost_response_recovery",
  "process_restart_recovery",
  "local_commit_failure_then_reconciliation",
  "webhook_redelivery_and_out_of_order",
  "cancellation_and_settlement",
  "cancellation_refuses_an_outstanding_authorization",
  "owner_only_reads",
  "account_switch_isolation",
];

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
  /** What the live clients reported, when the binding declared them. */
  transports: JourneyTransports | null;
  capabilities: JourneyCapabilities;
  scenarios: ScenarioOutcome[];
  passed: number;
  failed: number;
  skipped: number;
  /** Required scenarios that did not execute. Non-empty means not qualified. */
  missingRequired: ScenarioName[];
  /** True only for a managed binding that executed every required scenario with none failed. */
  qualified: boolean;
  /** Always stated, so a local receipt can never be read as provider evidence. */
  evidenceClass: "local_scripted_transport" | "managed_provider_test_mode";
}

interface Expect {
  (condition: boolean, detail: string): void;
}

export interface JourneyInputs {
  surface: JourneySurface;
  target: QualificationTarget;
  /** A distinct synthetic member for each scenario that needs one. */
  memberFor(scenario: ScenarioName): string;
  /** A fresh request; the factory must vary the idempotency key per call unless asked not to. */
  request: JourneyRequestFactory;
  /** A payment method the provider will decline. */
  decliningPaymentMethod: string;
  /** A payment method that authenticates without presenting a challenge. */
  nonChallengePaymentMethod: string;
  /** A payment method that presents a real challenge the customer must complete. */
  challengePaymentMethod: string;
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
 * A payment is RELEASED only when the provider says so terminally AND holds
 * nothing: zero received is not enough on its own, because an authorization
 * that is still outstanding also has zero received.
 */
export function isReleasedAtProvider(payment: JourneyPayment | null): boolean {
  return payment !== null && payment.status === "cancelled" && payment.amountReceivedCents === 0 && payment.amountCapturableCents === 0;
}

/**
 * Drives every scenario in order and reconciles the provider's truth against
 * the local records after each one. A scenario the binding cannot exercise is
 * SKIPPED with the exact missing capability, and any required scenario that did
 * not execute prevents qualification.
 */
export async function runConnectedCheckoutJourney(inputs: JourneyInputs): Promise<JourneyReceipt> {
  const { surface, target, request } = inputs;
  assertBindingMatchesTarget(target, surface.transports);
  const can = surface.capabilities;
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

  // ---- a real challenge, driven in a browser -----------------------------
  scenarios.push(
    can.browserDrivenChallenge && surface.completeCustomerChallenge
      ? await runScenario("authentication_challenge_and_return", async (expect) => {
          const member = inputs.memberFor("authentication_challenge_and_return");
          const req = request({ paymentMethodReference: inputs.challengePaymentMethod });
          const first = await surface.submit(member, req);
          expect(first.state === "authentication_required", "the provider presents a challenge the customer must complete");
          const before = await surface.status(member, req.idempotencyKey);
          expect(before.hasAuthenticationSecret === true, "the owner is given the provider's client flow input");
          const early = await surface.continue(member, req.idempotencyKey);
          expect(early.state === "authentication_required", "returning early changes nothing and starts no second payment");
          const execution = await surface.readExecution(member, req.idempotencyKey);
          expect(execution?.providerReference != null, "the execution names the payment awaiting the customer");
          await surface.completeCustomerChallenge!(execution!.providerReference!);
          const done = await surface.continue(member, req.idempotencyKey);
          expect(done.state === "completed", "after the customer completes the challenge, the server verifies and completes");
          const order = await surface.readOrder(first.orderId!);
          expect(order?.state === "payment_captured", "the order is captured only after the provider's own truth");
          const payment = await surface.readProviderPayment(execution!.providerReference!);
          expect(payment?.amountReceivedCents === execution?.amountCents, "exactly one capture of the exact amount");
          return [];
        })
      : skipped("authentication_challenge_and_return", "surface.completeCustomerChallenge (a real browser-driven challenge; a card that authenticates without one does NOT prove this path)"),
  );

  // ---- an authentication that needs no challenge (a different, easier path)
  scenarios.push(
    can.nonChallengeAuthentication && surface.completeCustomerAction
      ? await runScenario("authentication_without_challenge", async (expect) => {
          const member = inputs.memberFor("authentication_without_challenge");
          const req = request({ paymentMethodReference: inputs.nonChallengePaymentMethod });
          const first = await surface.submit(member, req);
          expect(first.state === "authentication_required", "the provider asks for the customer");
          const execution = await surface.readExecution(member, req.idempotencyKey);
          expect(execution?.providerReference != null, "the execution names the payment");
          await surface.completeCustomerAction!(execution!.providerReference!);
          const done = await surface.continue(member, req.idempotencyKey);
          expect(done.state === "completed", "the server verifies with the provider and completes");
          return ["this is the no-challenge path; it is NOT evidence for authentication_challenge_and_return"];
        })
      : skipped("authentication_without_challenge", "surface.completeCustomerAction"),
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
        expect(isReleasedAtProvider(payment), "the provider holds nothing for the declined attempt");
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
      const changed = await surface.submit(member, { ...req, shippingService: req.shippingService === "standard" ? "expedited_2day" : "standard" });
      expect(changed.ok === false && changed.code === "idempotency_conflict", "a changed request under the same key conflicts");
      expect((await surface.providerPaymentCount()) === after, "and creates no further payment");
      return [];
    }),
  );

  // ---- lost response ----------------------------------------------------
  scenarios.push(
    can.transportFaultInjection && surface.injectFault
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
    can.processRestart && surface.restart && (surface.completeCustomerChallenge ?? surface.completeCustomerAction)
      ? await runScenario("process_restart_recovery", async (expect) => {
          const member = inputs.memberFor("process_restart_recovery");
          const finish = surface.completeCustomerChallenge ?? surface.completeCustomerAction!;
          const req = request({ paymentMethodReference: surface.completeCustomerChallenge ? inputs.challengePaymentMethod : inputs.nonChallengePaymentMethod });
          const first = await surface.submit(member, req);
          expect(first.state === "authentication_required", "the execution stops for the customer");
          const execution = await surface.readExecution(member, req.idempotencyKey);
          const reference = execution?.providerReference ?? null;
          expect(reference != null, "the reference is durable before the restart");
          await surface.restart!();
          const afterRestart = await surface.readExecution(member, req.idempotencyKey);
          expect(afterRestart?.providerReference === reference, "the reference survives the restart");
          expect(afterRestart?.authorizationAttemptedAt != null, "the first-attempt stamp survives the restart");
          await finish(reference!);
          const done = await surface.continue(member, req.idempotencyKey);
          expect(done.state === "completed", "a new process finishes the payment the old one started");
          return [];
        })
      : skipped("process_restart_recovery", surface.restart ? "capabilities.processRestart (a real isolated process over persisted records; rebuilding an object over retained maps is not this)" : "surface.restart"),
  );

  // ---- provider captured, local transaction failed, later reconciled -----
  scenarios.push(
    can.localCommitFault && surface.failNextLocalCommit
      ? await runScenario("local_commit_failure_then_reconciliation", async (expect) => {
          const member = inputs.memberFor("local_commit_failure_then_reconciliation");
          const req = request();
          const capturesBefore = await surface.providerCaptureCount();
          const notifiedBefore = (await surface.readDownstreamNotifications?.())?.length ?? 0;
          // The seams report the whole run, so only this scenario's own tail is read.
          const holdsBefore = (await surface.readReservationEvents?.())?.length ?? 0;

          surface.failNextLocalCommit!();
          const first = await surface.submit(member, req);
          expect(first.ok === true, "a failed local commit is answered truthfully, not as a payment failure");
          expect(first.state === "reconciliation_required", "the execution parks for reconciliation");

          // The money moved. Nothing may pretend otherwise.
          const parked = await surface.readExecution(member, req.idempotencyKey);
          expect(parked?.providerReference != null, "the capture evidence is retained on the execution");
          const payment = parked?.providerReference ? await surface.readProviderPayment(parked.providerReference) : null;
          expect(payment?.amountReceivedCents === parked?.amountCents, "the provider really did take the money");
          const order = await surface.readOrder(first.orderId!);
          expect(order?.state !== "payment_captured", "the order is NOT marked captured while the local record is incomplete");
          expect(order?.state !== "cancelled", "and the order is not erased either");
          expect(((await surface.readDownstreamNotifications?.())?.length ?? notifiedBefore) === notifiedBefore, "nothing downstream fired for an incomplete purchase");

          // Recovery: the same request, resolved from the provider's own truth.
          const recovered = await surface.submit(member, req);
          expect(recovered.state === "completed", "a later attempt reconciles the captured payment and completes");
          const settled = await surface.readOrder(first.orderId!);
          expect(settled?.state === "payment_captured", "the same order is captured, not a new one");
          expect(settled?.capturedAmountCents === parked?.amountCents, "for exactly the amount the provider took");
          expect((await surface.providerCaptureCount()) - capturesBefore === 1, "the provider captured exactly once across the whole episode");
          const committed = await surface.readExecution(member, req.idempotencyKey);
          expect(committed?.phase === "committed", "the execution is committed");
          const notifications = await surface.readDownstreamNotifications?.();
          if (notifications) {
            expect(notifications.filter((id) => id === first.orderId).length === 1, "downstream was told exactly once");
          }
          const holds = (await surface.readReservationEvents?.())?.slice(holdsBefore);
          if (holds) {
            expect(holds.filter((event) => event.startsWith("finalize:")).length === 1, "the inventory holds were finalized exactly once");
            expect(holds.filter((event) => event.startsWith("release:")).length === 0, "and never released for a paid order");
          }
          return [];
        })
      : skipped("local_commit_failure_then_reconciliation", "surface.failNextLocalCommit (a controlled fault at the local commit boundary, in an isolated test process)"),
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
      const holdsBefore = (await surface.readReservationEvents?.())?.length ?? 0;
      const req = request({ paymentMethodReference: inputs.nonChallengePaymentMethod });
      const placed = await surface.submit(member, req);
      expect(placed.state === "authentication_required" || placed.state === "pending", "an unpaid checkout is waiting");
      const cancelled = await surface.cancel(member, req.idempotencyKey);
      expect(cancelled.state === "cancelled", "the buyer's cancellation is honoured");
      // A decline also ends in `cancelled`. This scenario is about the BUYER
      // cancelling, so the recorded reason has to say so.
      expect(
        cancelled.cancellation?.reason === "customer",
        `the cancellation is recorded as the customer's (saw ${cancelled.cancellation?.reason ?? "no reason"})`,
      );
      const execution = await surface.readExecution(member, req.idempotencyKey);
      expect(execution?.settledAt != null, "the local settlement completed");
      const order = await surface.readOrder(placed.orderId!);
      expect(order?.state === "cancelled", "the order is cancelled");
      expect((order?.capturedAmountCents ?? 0) === 0, "nothing was captured");
      // Zero received is NOT proof of release: an outstanding authorization also
      // has zero received. The provider must report it terminally released and
      // holding nothing.
      if (execution?.providerReference) {
        const payment = await surface.readProviderPayment(execution.providerReference);
        expect(payment !== null, "the provider still knows the payment");
        expect(payment?.status === "cancelled", `the provider reports it terminally cancelled (saw ${payment?.status ?? "nothing"})`);
        expect(payment?.amountCapturableCents === 0, "the provider holds nothing capturable");
        expect(payment?.amountReceivedCents === 0, "and took nothing");
        expect(isReleasedAtProvider(payment), "so the authorization is genuinely released, not merely uncaptured");
      }
      const holds = (await surface.readReservationEvents?.())?.slice(holdsBefore);
      if (holds) {
        expect(holds.filter((event) => event.startsWith("release:")).length === 1, "the inventory holds were released exactly once");
        expect(holds.filter((event) => event.startsWith("finalize:")).length === 0, "and never finalized for a cancelled order");
      }
      const again = await surface.cancel(member, req.idempotencyKey);
      expect(again.state === "cancelled", "a repeated cancellation is a no-op answer");
      return [];
    }),
  );

  // ---- the negative case the assertion above exists for ------------------
  scenarios.push(
    await runScenario("cancellation_refuses_an_outstanding_authorization", async (expect) => {
      // An authorized payment holds money and has received nothing. If the
      // release check were "received === 0" it would call this cancelled.
      const member = inputs.memberFor("cancellation_refuses_an_outstanding_authorization");
      const req = request();
      const placed = await surface.submit(member, req);
      const execution = await surface.readExecution(member, req.idempotencyKey);
      expect(execution?.providerReference != null, "there is a payment to inspect");
      const payment = execution?.providerReference ? await surface.readProviderPayment(execution.providerReference) : null;
      expect(payment !== null, "the provider knows it");
      // Whatever this payment's real state, the release predicate must agree
      // with the provider's own terminal word, never with "received is zero".
      const releasedByPredicate = isReleasedAtProvider(payment);
      const terminallyCancelled = payment?.status === "cancelled";
      expect(releasedByPredicate === terminallyCancelled, "release is decided by the provider's terminal state, not by a zero amount");
      const outstanding: JourneyPayment = { status: "authorized", amountCapturableCents: 1_000, amountReceivedCents: 0 };
      expect(isReleasedAtProvider(outstanding) === false, "an outstanding authorization with nothing received is NOT released");
      const captured: JourneyPayment = { status: "captured", amountCapturableCents: 0, amountReceivedCents: 1_000 };
      expect(isReleasedAtProvider(captured) === false, "a captured payment is not released either");
      expect(placed.ok === true, "and the submission itself answered truthfully");
      return [];
    }),
  );

  // ---- owner-only reads and account isolation ---------------------------
  scenarios.push(
    await runScenario("owner_only_reads", async (expect) => {
      const owner = inputs.memberFor("owner_only_reads");
      const other = inputs.memberFor("account_switch_isolation");
      const req = request({ paymentMethodReference: inputs.nonChallengePaymentMethod });
      const placed = await surface.submit(owner, req);
      // Without this the three refusals below hold for a checkout that was
      // never created: an unknown request key answers `not_found` to everyone,
      // so a refused submit would let this scenario pass having proven no
      // isolation at all.
      expect(placed.ok === true && placed.orderId != null, "the owner's checkout exists to be isolated");
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
      const req = request({ paymentMethodReference: inputs.nonChallengePaymentMethod });
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

  const passed = scenarios.filter((s) => s.status === "passed").length;
  const failed = scenarios.filter((s) => s.status === "failed").length;
  const skippedCount = scenarios.filter((s) => s.status === "skipped").length;
  const executed = new Set(scenarios.filter((s) => s.status === "passed").map((s) => s.scenario));
  const missingRequired = REQUIRED_SCENARIOS.filter((name) => !executed.has(name));
  return {
    binding: target.binding,
    mode: "test",
    projectRef: target.projectRef,
    transports: surface.transports ?? null,
    capabilities: can,
    scenarios,
    passed,
    failed,
    skipped: skippedCount,
    missingRequired: [...missingRequired],
    // A local run is never qualification, however green it is, and a managed run
    // that could not execute a required scenario has not proven that scenario.
    qualified: target.binding === "managed" && failed === 0 && missingRequired.length === 0,
    evidenceClass: target.binding === "managed" ? "managed_provider_test_mode" : "local_scripted_transport",
  };
}
