// The ONE composition of the durable purchasing path.
//
// Everything below already exists as a reviewed unit: the provider-verified
// payment port, the recovery-aware coordinator, the execution store, the
// durable submission door, the payment-authentication continuation, the
// webhook execution processor and the client configuration answer. This module
// composes them from injected dependencies and decides, once, whether the
// composition is READY. It is not mounted by itself: the integration owner
// calls `registerDurableCheckoutSurface` from the server's composition root
// with the production repositories, next to the legacy commerce surface.
//
// Readiness is fail-closed. Production never runs the money path over an
// in-memory execution store or webhook inbox: when the durable configuration
// is absent the surface still registers, but every door answers a precise
// capability refusal and the client configuration answers payment_disabled,
// so the checkout page keeps the manual and assisted ordering it has now. A
// test composition may allow in-memory stores ONLY under NODE_ENV=test; that
// allowance is not a production readiness override and cannot become one.
//
// The production provider resolver still returns Disabled for Stripe. This
// composition does not change that: with a Disabled provider it reports
// provider_not_durable and mounts the refusing surface.
import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import type { CartDto } from "@shared/research/commerce-api";
import { supportsDurableExecution, type DurablePaymentProvider, type PaymentProvider } from "../providers/payment";
import type { CheckoutService, ReservationAuditEvent, ReservationSeam } from "./checkout";
import { createCheckoutContinuationService, registerCheckoutContinuationApi, CHECKOUT_CONTINUATION_PATHS, type CheckoutContinuationService } from "./checkout-continuation";
import { createCheckoutExecutionAdminService, registerCheckoutExecutionAdminApi, CHECKOUT_EXECUTION_ADMIN_PATH, type CheckoutExecutionAdminService } from "./checkout-execution-admin";
import { createDurableCheckoutExecutor } from "./durable-checkout-executor";
import { createDurableCheckoutSubmission, registerDurableCheckoutApi, DURABLE_CHECKOUT_PATH, type DurableCheckoutSubmission } from "./durable-checkout-submission";
import { createProviderVerifiedPaymentPort } from "./durable-payment-port";
import type { OrderRecord, OrderRepository } from "./orders";
import { registerPaymentClientConfigApi, resolvePaymentClientConfig, PAYMENT_CLIENT_CONFIG_PATH, type PaymentClientConfigResult } from "./payment-client-config";
import {
  createInMemoryCheckoutExecutionStore,
  createSupabaseCheckoutExecutionStore,
  createSupabaseWebhookExecutionInbox,
  type CheckoutExecutionRepository,
} from "./persistence/checkout-executions-store";
import { createInMemoryWebhookExecutionInbox, createWebhookExecutionProcessor, type WebhookExecutionInbox, type WebhookExecutionProcessor } from "./webhook-execution-processor";
import { supabaseConfigured } from "../../supabase";

/** A store plus the fact of whether it survives a process restart. */
export interface DurableStoreChoice<T> {
  store: T;
  durable: boolean;
}

export interface DurableCheckoutCompositionInput {
  env: NodeJS.ProcessEnv;
  /** The resolved payment provider. Production resolves Disabled today. */
  provider: PaymentProvider;
  /** The canonical gates and pricing (CheckoutService.evaluate). */
  checkout: Pick<CheckoutService, "evaluate">;
  orders: OrderRepository;
  executions: DurableStoreChoice<CheckoutExecutionRepository>;
  webhookInbox: DurableStoreChoice<WebhookExecutionInbox>;
  inventory?: ReservationSeam;
  reservationAudit?: { record(event: ReservationAuditEvent): Promise<void> | void };
  isFraudFlagged?: (memberId: string) => boolean;
  priceVersion?: (cart: CartDto) => string | null;
  /**
   * Expected provider account for webhook binding. Omit to use the provider's
   * own binding, which is the single source of truth; supplying a value that
   * disagrees with the provider is refused rather than silently isolating every
   * event.
   */
  expectedProviderAccountId?: string | null;
  /** Downstream after a committed order (the canonical outbox). Absent means no notification. */
  onCommitted?: (order: OrderRecord) => Promise<void> | void;
  /** Creation-key replay window; must stay inside the provider's documented retention. */
  creationKeyRetentionMs?: number;
  now?: () => Date;
  newId?: () => string;
  /**
   * Test compositions only. Honoured exclusively when env.NODE_ENV === "test";
   * in any other environment an in-memory store keeps the composition NOT READY.
   */
  allowInMemoryStores?: boolean;
}

export type DurableCheckoutUnavailableReason =
  | "provider_not_durable"
  | "execution_store_not_durable"
  | "webhook_inbox_not_durable"
  | "provider_account_mismatch";

export type DurableCheckoutComposition =
  | {
      ready: true;
      provider: DurablePaymentProvider;
      executions: CheckoutExecutionRepository;
      executor: ReturnType<typeof createDurableCheckoutExecutor>;
      submission: DurableCheckoutSubmission;
      continuation: CheckoutContinuationService;
      /** Pass as `executions` to createWebhookHandler so verified events bind to executions first. */
      webhookProcessor: WebhookExecutionProcessor;
      /** The operations read: what a customer's payment is doing, for the order an admin is looking at. */
      adminExecutions: CheckoutExecutionAdminService;
      clientConfig: () => PaymentClientConfigResult;
    }
  | {
      ready: false;
      reason: DurableCheckoutUnavailableReason;
      clientConfig: () => PaymentClientConfigResult;
    };

/**
 * The durable stores for THIS process: the managed database when it is
 * configured, otherwise in-memory references that are explicitly NOT durable.
 * The composition refuses the latter outside NODE_ENV=test.
 */
export function resolveDurableCheckoutStores(
  configured: () => boolean = supabaseConfigured,
  now: () => Date = () => new Date(),
): { executions: DurableStoreChoice<CheckoutExecutionRepository>; webhookInbox: DurableStoreChoice<WebhookExecutionInbox> } {
  if (configured()) {
    return {
      executions: { store: createSupabaseCheckoutExecutionStore(), durable: true },
      webhookInbox: { store: createSupabaseWebhookExecutionInbox(), durable: true },
    };
  }
  return {
    executions: { store: createInMemoryCheckoutExecutionStore({ now }), durable: false },
    webhookInbox: { store: createInMemoryWebhookExecutionInbox(), durable: false },
  };
}

/**
 * Wraps the execution store so the downstream hook fires exactly once, at the
 * moment an execution's phase actually becomes committed. Every path that
 * commits (submission, continuation, webhook recovery) goes through
 * commitCaptured, and a repeat call on an already-committed record does not
 * fire again.
 */
function withCommitNotification(
  store: CheckoutExecutionRepository,
  orders: Pick<OrderRepository, "get">,
  onCommitted: (order: OrderRecord) => Promise<void> | void,
): CheckoutExecutionRepository {
  return {
    ...store,
    async commitCaptured(executionId, expected) {
      const after = await store.commitCaptured(executionId, expected);
      // A real commit advances the version past the one it claimed; an
      // already-committed record is returned at the SAME version by both the
      // SQL function and the in-memory reference. That difference is what makes
      // this fire exactly once.
      if (after && after.phase === "committed" && after.version === expected + 1) {
        // The purchase is COMMITTED. A downstream failure (a notifier, an
        // outbox) may not undo that, and may not turn a captured, recorded
        // order into a 503 for the buyer. It is swallowed here; the committed
        // execution row is the durable record a sweeper or an operator works
        // from. This hook is at-most-once by design and is NOT a substitute for
        // a durable outbox written inside the commit transaction.
        try {
          const order = await orders.get(after.orderId);
          if (order && order.memberId === after.memberId) await onCommitted(order);
        } catch {
          // Deliberately ignored: nothing downstream may fail a settled purchase.
        }
      }
      return after;
    },
  };
}

/**
 * The NOT READY composition for a deployment state that composes no commerce
 * repositories at all (flag off, database not provisioned). Every door refuses
 * and the browser is told payment_disabled; nothing is constructed. The
 * composition root uses this directly for those states.
 */
export function unavailableDurableCheckout(reason: DurableCheckoutUnavailableReason): DurableCheckoutComposition {
  return { ready: false, reason, clientConfig: () => ({ ok: false, code: "payment_disabled" }) };
}

export function composeDurableCheckout(input: DurableCheckoutCompositionInput): DurableCheckoutComposition {
  const disabled = unavailableDurableCheckout;
  const { provider, env } = input;
  // The Disabled provider implements the durable interface structurally (it
  // refuses every call); readiness is about a provider that can actually pay.
  if (provider.name === "disabled" || !supportsDurableExecution(provider)) return disabled("provider_not_durable");
  const memoryAllowed = env.NODE_ENV === "test" && input.allowInMemoryStores === true;
  if (!input.executions.durable && !memoryAllowed) return disabled("execution_store_not_durable");
  if (!input.webhookInbox.durable && !memoryAllowed) return disabled("webhook_inbox_not_durable");

  // The account the webhook binding expects is the provider's own. A supplied
  // value that disagrees would isolate every genuine event, so it is refused.
  const providerAccount = provider.providerAccountId ?? null;
  if (input.expectedProviderAccountId !== undefined && input.expectedProviderAccountId !== providerAccount) {
    return disabled("provider_account_mismatch");
  }

  const now = input.now ?? (() => new Date());
  const newId = input.newId ?? (() => randomUUID());
  // Downstream fires on the COMMIT TRANSITION rather than from any one door, so
  // an order committed through the continuation (3DS) or a webhook notifies
  // exactly like a synchronous one, and a retried submit of an already
  // committed execution notifies nothing.
  const executions = input.onCommitted ? withCommitNotification(input.executions.store, input.orders, input.onCommitted) : input.executions.store;
  const port = createProviderVerifiedPaymentPort(provider, {
    now: () => now().getTime(),
    ...(input.creationKeyRetentionMs !== undefined ? { creationKeyRetentionMs: input.creationKeyRetentionMs } : {}),
  });
  const executor = createDurableCheckoutExecutor(executions, port);
  const submission = createDurableCheckoutSubmission({
    evaluate: (memberId, req, asOf) => input.checkout.evaluate(memberId, req, asOf),
    orders: input.orders,
    executions,
    executor,
    inventory: input.inventory,
    reservationAudit: input.reservationAudit,
    isFraudFlagged: input.isFraudFlagged,
    priceVersion: input.priceVersion,
    now,
    newId,
    // Not here: the store wrapper above owns the notification for every door.
  });
  const continuation = createCheckoutContinuationService({ store: executions, provider, executor });
  const adminExecutions = createCheckoutExecutionAdminService({ findByOrder: (orderId) => executions.findByOrder(orderId) });
  const webhookProcessor = createWebhookExecutionProcessor({
    providerName: provider.name,
    inbox: input.webhookInbox.store,
    executions,
    expectedProviderAccountId: providerAccount,
  });
  return {
    ready: true,
    provider,
    executions,
    executor,
    submission,
    continuation,
    webhookProcessor,
    adminExecutions,
    clientConfig: () => resolvePaymentClientConfig(provider, env),
  };
}

export interface DurableCheckoutGuards {
  requireActiveMember: (req: Request, res: Response, next: () => void) => void | Promise<void>;
  /**
   * Supplying this mounts the operations read, so the person who can act on a
   * parked payment can see it. Omitting it mounts only the customer doors.
   */
  requireAdmin?: (req: Request, res: Response, next: () => void) => void | Promise<void>;
}

/** Every durable door. The surface that is not ready answers each with a precise refusal, never an unpublished path. */
export const DURABLE_CHECKOUT_SURFACE_PATHS = {
  submit: DURABLE_CHECKOUT_PATH,
  config: PAYMENT_CLIENT_CONFIG_PATH,
  adminExecution: CHECKOUT_EXECUTION_ADMIN_PATH,
  ...CHECKOUT_CONTINUATION_PATHS,
} as const;

/**
 * Mounts the durable purchasing surface behind the canonical active-member
 * guard. READY mounts the real doors. NOT READY mounts the same paths as
 * fail-closed refusals: the configuration answers payment_disabled (so the
 * checkout page uses the ordering path it has now), and the money doors answer
 * capability_disabled without touching a store or the provider.
 */
export function registerDurableCheckoutSurface(app: Express, guards: DurableCheckoutGuards, composition: DurableCheckoutComposition, options: { now?: () => Date } = {}): void {
  registerPaymentClientConfigApi(app, guards, { resolve: composition.clientConfig });
  if (composition.ready) {
    registerDurableCheckoutApi(app, guards, { submission: composition.submission, now: options.now ?? (() => new Date()) });
    registerCheckoutContinuationApi(app, guards, { service: composition.continuation });
    if (guards.requireAdmin) {
      registerCheckoutExecutionAdminApi(app, { requireAdmin: guards.requireAdmin }, { service: composition.adminExecutions });
    }
    return;
  }
  const refuse = (_req: Request, res: Response) => {
    res.set("Cache-Control", "private, no-store");
    res.set("Pragma", "no-cache");
    res.status(503).json({ ok: false, code: "capability_disabled", message: "Card checkout is not available right now. Nothing was charged; your cart is kept." });
  };
  app.post(DURABLE_CHECKOUT_PATH, guards.requireActiveMember, refuse);
  app.get(CHECKOUT_CONTINUATION_PATHS.status, guards.requireActiveMember, refuse);
  app.post(CHECKOUT_CONTINUATION_PATHS.continue, guards.requireActiveMember, refuse);
  app.post(CHECKOUT_CONTINUATION_PATHS.cancel, guards.requireActiveMember, refuse);
}
