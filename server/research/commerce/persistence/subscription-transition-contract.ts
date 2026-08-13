import { createHash } from "node:crypto";

import {
  applySubscriptionAction,
  type Actor,
  type SubscriptionAction,
  type SubscriptionState,
} from "@shared/research/commerce";
import { isValidSubscriptionQuantity } from "../subscriptions";

const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{16,160}$/;
const SHA256 = /^[a-f0-9]{64}$/;

export interface SubscriptionTransitionIntent {
  subscriptionId: string;
  memberId: string;
  expectedVersion: number;
  action: SubscriptionAction;
  actorType: Actor;
  fromState: SubscriptionState;
  toState: SubscriptionState;
  quantity: number;
  effectiveAt: string | null;
}

export interface SubscriptionTransitionCommand extends SubscriptionTransitionIntent {
  idempotencyKey: string;
  intentHash: string;
}

export interface VersionedSubscriptionSnapshot {
  subscriptionId: string;
  memberId: string;
  version: number;
  state: SubscriptionState;
  quantity: number;
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
 * Required durable seam. An implementation is conforming only when command
 * reservation, version compare-and-set, header update, event append, and
 * replay result persistence share one database transaction.
 */
export interface AtomicSubscriptionTransitionPort {
  commitTransition(
    command: SubscriptionTransitionCommand,
  ): Promise<SubscriptionTransitionCommitResult>;
}

function intentTuple(intent: SubscriptionTransitionIntent): readonly unknown[] {
  return [
    "xenios:subscription-transition:v1",
    intent.subscriptionId,
    intent.memberId,
    intent.expectedVersion,
    intent.action,
    intent.actorType,
    intent.fromState,
    intent.toState,
    intent.quantity,
    intent.effectiveAt,
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

/** Pure boundary validation shared by a future durable adapter and its tests. */
export function isValidSubscriptionTransitionCommand(
  command: SubscriptionTransitionCommand,
): boolean {
  if (!command.subscriptionId.trim() || !command.memberId.trim()) return false;
  if (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion < 1) return false;
  if (!IDEMPOTENCY_KEY.test(command.idempotencyKey)) return false;
  if (!SHA256.test(command.intentHash)) return false;
  if (!isValidSubscriptionQuantity(command.quantity)) return false;
  if (
    command.effectiveAt !== null &&
    !Number.isFinite(Date.parse(command.effectiveAt))
  ) return false;
  const transition = applySubscriptionAction(
    command.fromState,
    command.action,
    command.actorType,
  );
  if (!transition.ok || transition.state !== command.toState) return false;
  return command.intentHash === subscriptionTransitionIntentHash(command);
}
