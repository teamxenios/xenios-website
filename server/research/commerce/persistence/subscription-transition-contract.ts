import { createHash } from "node:crypto";

import {
  applySubscriptionAction,
  SUBSCRIPTION_FREQUENCIES,
  type Actor,
  type SubscriptionAction,
  type SubscriptionFrequencyDays,
  type SubscriptionState,
} from "@shared/research/commerce";
import { PERSISTENT_CART_QUANTITY_MAX } from "@shared/research/persistent-cart";

const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{16,160}$/;
const SHA256 = /^[a-f0-9]{64}$/;

/** Complete durable state returned for both a commit and an exact replay. */
export interface VersionedSubscriptionSnapshot {
  subscriptionId: string;
  memberId: string;
  version: number;
  sku: string;
  state: SubscriptionState;
  quantity: number;
  frequencyDays: SubscriptionFrequencyDays;
  nextRenewalAt: string | null;
  nextShipmentAt: string | null;
  paymentProviderReference: string | null;
  priceVersion: string;
  shippingAddressRef: string | null;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
}

export interface SubscriptionTransitionIntent {
  subscriptionId: string;
  memberId: string;
  expectedVersion: number;
  action: SubscriptionAction;
  actorType: Actor;
  actorId: string | null;
  fromState: SubscriptionState;
  toState: SubscriptionState;
  effectiveAt: string | null;
  next: VersionedSubscriptionSnapshot;
}

export interface SubscriptionTransitionCommand extends SubscriptionTransitionIntent {
  idempotencyKey: string;
  intentHash: string;
}

export interface CommittedSubscriptionEvent {
  subscriptionId: string;
  resultingVersion: number;
  idempotencyKey: string;
  intentHash: string;
  action: SubscriptionAction;
  fromState: SubscriptionState;
  toState: SubscriptionState;
  actorType: Actor;
  actorId: string | null;
  effectiveAt: string | null;
  occurredAt: string;
}

export type SubscriptionTransitionCommitResult =
  | Readonly<{
      ok: true;
      replayed: boolean;
      snapshot: VersionedSubscriptionSnapshot;
      event: CommittedSubscriptionEvent;
    }>
  | Readonly<{
      ok: false;
      code:
        | "invalid_input"
        | "subscription_not_found"
        | "stale_version"
        | "idempotency_conflict"
        | "dependency_unavailable";
    }>;

/**
 * Canonical durable seam. A conforming implementation commits command identity,
 * version compare-and-set, header mutation, event append, and replay snapshot
 * in one database transaction.
 */
export interface AtomicSubscriptionTransitionPort {
  replayTransition(input: Readonly<{
    subscriptionId: string;
    memberId: string;
    idempotencyKey: string;
    intentHash: string;
  }>): Promise<SubscriptionTransitionCommitResult | null>;
  commitTransition(
    command: SubscriptionTransitionCommand,
  ): Promise<SubscriptionTransitionCommitResult>;
}

function intentTuple(intent: SubscriptionTransitionIntent): readonly unknown[] {
  const next = intent.next;
  return [
    "xenios:subscription-transition:v2",
    intent.subscriptionId,
    intent.memberId,
    intent.expectedVersion,
    intent.action,
    intent.actorType,
    intent.actorId,
    intent.action === "reschedule" ? intent.effectiveAt : null,
    next.sku,
    next.state,
    next.quantity,
    next.frequencyDays,
    next.paymentProviderReference,
    next.priceVersion,
    next.shippingAddressRef,
  ];
}

export function subscriptionTransitionIntentHash(
  intent: SubscriptionTransitionIntent,
): string {
  return createHash("sha256")
    .update(JSON.stringify(intentTuple(intent)), "utf8")
    .digest("hex");
}

export function subscriptionTransitionCommand(
  intent: SubscriptionTransitionIntent,
  idempotencyKey: string,
): SubscriptionTransitionCommand {
  return {
    ...intent,
    idempotencyKey,
    intentHash: subscriptionTransitionIntentHash(intent),
  };
}

function validInstant(value: string | null): boolean {
  return value === null || Number.isFinite(Date.parse(value));
}

function validQuantity(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= PERSISTENT_CART_QUANTITY_MAX
  );
}

/** Pure validation shared by the service, durable adapter, and harness. */
export function isValidSubscriptionTransitionCommand(
  command: SubscriptionTransitionCommand,
): boolean {
  const next = command.next;
  if (!command.subscriptionId.trim() || !command.memberId.trim()) return false;
  if (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion < 1) return false;
  if (!IDEMPOTENCY_KEY.test(command.idempotencyKey)) return false;
  if (!SHA256.test(command.intentHash)) return false;
  if (!validQuantity(next.quantity)) return false;
  if (!(SUBSCRIPTION_FREQUENCIES as readonly number[]).includes(next.frequencyDays)) return false;
  if (
    next.subscriptionId !== command.subscriptionId ||
    next.memberId !== command.memberId ||
    next.version !== command.expectedVersion + 1 ||
    next.state !== command.toState ||
    !next.sku.trim() ||
    typeof next.priceVersion !== "string" ||
    !validInstant(command.effectiveAt) ||
    !validInstant(next.nextRenewalAt) ||
    !validInstant(next.nextShipmentAt) ||
    !validInstant(next.createdAt) ||
    !validInstant(next.updatedAt) ||
    !validInstant(next.cancelledAt)
  ) {
    return false;
  }
  const transition = applySubscriptionAction(
    command.fromState,
    command.action,
    command.actorType,
  );
  if (!transition.ok || transition.state !== command.toState) return false;
  return command.intentHash === subscriptionTransitionIntentHash(command);
}
