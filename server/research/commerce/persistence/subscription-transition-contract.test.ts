import { describe, expect, it } from "vitest";

import type { SubscriptionState } from "@shared/research/commerce";
import {
  isValidSubscriptionTransitionCommand,
  subscriptionTransitionCommand,
  type AtomicSubscriptionTransitionPort,
  type CommittedSubscriptionEvent,
  type SubscriptionTransitionCommand,
  type SubscriptionTransitionCommitResult,
  type VersionedSubscriptionSnapshot,
} from "./subscription-transition-contract";

const OWNER = "member-1";
const SUBSCRIPTION = "subscription-1";
const NOW = "2026-08-13T07:00:00.000Z";

function snapshot(overrides: Partial<VersionedSubscriptionSnapshot> = {}): VersionedSubscriptionSnapshot {
  return {
    subscriptionId: SUBSCRIPTION,
    memberId: OWNER,
    version: 1,
    sku: "P001",
    state: "active",
    quantity: 2,
    frequencyDays: 30,
    nextRenewalAt: "2026-09-13T07:00:00.000Z",
    nextShipmentAt: "2026-09-13T07:00:00.000Z",
    paymentProviderReference: "pm_1",
    priceVersion: "2026-08",
    shippingAddressRef: "address_1",
    createdAt: "2026-08-01T07:00:00.000Z",
    updatedAt: NOW,
    cancelledAt: null,
    ...overrides,
  };
}

function pauseCommand(overrides: Partial<SubscriptionTransitionCommand> = {}) {
  const expectedVersion = overrides.expectedVersion ?? 1;
  const next = snapshot({
    ...(overrides.next ?? {}),
    subscriptionId: overrides.subscriptionId ?? SUBSCRIPTION,
    memberId: overrides.memberId ?? OWNER,
    version: expectedVersion + 1,
    state: (overrides.toState ?? "paused") as SubscriptionState,
    quantity: overrides.next?.quantity ?? 50,
  });
  const intent = {
    subscriptionId: overrides.subscriptionId ?? SUBSCRIPTION,
    memberId: overrides.memberId ?? OWNER,
    expectedVersion,
    action: "pause" as const,
    actorType: "member" as const,
    actorId: null,
    fromState: (overrides.fromState ?? "active") as SubscriptionState,
    toState: (overrides.toState ?? "paused") as SubscriptionState,
    effectiveAt: null,
    next,
  };
  const command = subscriptionTransitionCommand(
    intent,
    overrides.idempotencyKey ?? "pause-command-key-0001",
  );
  return overrides.intentHash ? { ...command, intentHash: overrides.intentHash } : command;
}

/**
 * Executable specification only. This test reference mutates one in-memory
 * critical section; it is never exported or wired as durable atomicity.
 */
class ContractReference implements AtomicSubscriptionTransitionPort {
  readonly events: CommittedSubscriptionEvent[] = [];
  readonly commands = new Map<string, { intentHash: string; result: SubscriptionTransitionCommitResult }>();
  snapshot: VersionedSubscriptionSnapshot;
  failNext = false;

  constructor(snapshotValue: VersionedSubscriptionSnapshot = snapshot()) {
    this.snapshot = { ...snapshotValue };
  }

  async replayTransition(input: {
    subscriptionId: string;
    memberId: string;
    idempotencyKey: string;
    intentHash: string;
  }): Promise<SubscriptionTransitionCommitResult | null> {
    const scope = `${input.memberId}\u0000${input.subscriptionId}\u0000${input.idempotencyKey}`;
    const prior = this.commands.get(scope);
    if (!prior) return null;
    if (prior.intentHash !== input.intentHash) return { ok: false, code: "idempotency_conflict" };
    return prior.result.ok ? { ...prior.result, replayed: true } : prior.result;
  }

  async commitTransition(
    command: SubscriptionTransitionCommand,
  ): Promise<SubscriptionTransitionCommitResult> {
    if (!isValidSubscriptionTransitionCommand(command)) {
      return { ok: false, code: "invalid_input" };
    }
    if (
      command.subscriptionId !== this.snapshot.subscriptionId ||
      command.memberId !== this.snapshot.memberId
    ) {
      return { ok: false, code: "subscription_not_found" };
    }
    const scope = `${command.memberId}\u0000${command.subscriptionId}\u0000${command.idempotencyKey}`;
    const prior = this.commands.get(scope);
    if (prior) {
      if (prior.intentHash !== command.intentHash) {
        return { ok: false, code: "idempotency_conflict" };
      }
      if (!prior.result.ok) return prior.result;
      return { ...prior.result, replayed: true };
    }
    if (
      command.expectedVersion !== this.snapshot.version ||
      command.fromState !== this.snapshot.state
    ) {
      return { ok: false, code: "stale_version" };
    }
    if (this.failNext) {
      this.failNext = false;
      return { ok: false, code: "dependency_unavailable" };
    }

    const snapshot: VersionedSubscriptionSnapshot = { ...command.next };
    const event: CommittedSubscriptionEvent = {
      subscriptionId: command.subscriptionId,
      resultingVersion: snapshot.version,
      idempotencyKey: command.idempotencyKey,
      intentHash: command.intentHash,
      action: command.action,
      fromState: command.fromState,
      toState: command.toState,
      actorType: command.actorType,
      actorId: command.actorId,
      effectiveAt: command.effectiveAt,
      occurredAt: NOW,
    };
    const result = { ok: true, replayed: false, snapshot, event } as const;

    // No await or fallible operation exists between these reference writes.
    // A durable implementation must replace this with one database transaction.
    this.snapshot = { ...snapshot };
    this.events.push({ ...event });
    this.commands.set(scope, { intentHash: command.intentHash, result });
    return result;
  }
}

describe("atomic subscription transition contract packet", () => {
  it("replays identical concurrent commands with one version and one event", async () => {
    const port = new ContractReference();
    const command = pauseCommand();
    const [first, second] = await Promise.all([
      port.commitTransition(command),
      port.commitTransition(command),
    ]);

    expect(first).toMatchObject({ ok: true, replayed: false });
    expect(second).toMatchObject({ ok: true, replayed: true });
    expect(port.snapshot).toMatchObject({ version: 2, state: "paused" });
    expect(port.events).toHaveLength(1);
  });

  it("makes conflicting concurrent commands race on expected version", async () => {
    const port = new ContractReference();
    const [first, second] = await Promise.all([
      port.commitTransition(pauseCommand({ idempotencyKey: "pause-command-key-0002" })),
      port.commitTransition(pauseCommand({ idempotencyKey: "pause-command-key-0003" })),
    ]);

    expect([first, second].filter((result) => result.ok)).toHaveLength(1);
    expect([first, second]).toContainEqual({ ok: false, code: "stale_version" });
    expect(port.events).toHaveLength(1);
  });

  it("distinguishes stale version from idempotency conflict", async () => {
    const port = new ContractReference();
    const first = pauseCommand({ idempotencyKey: "pause-command-key-0004" });
    expect((await port.commitTransition(first)).ok).toBe(true);

    expect(await port.commitTransition(
      pauseCommand({ idempotencyKey: "pause-command-key-0005", expectedVersion: 1 }),
    )).toEqual({ ok: false, code: "stale_version" });
    expect(await port.commitTransition({ ...first, intentHash: "a".repeat(64) }))
      .toEqual({ ok: false, code: "invalid_input" });

    const changedIntent = subscriptionTransitionCommand(
      { ...first, next: { ...first.next, quantity: 49 } },
      first.idempotencyKey,
    );
    expect(await port.commitTransition(changedIntent))
      .toEqual({ ok: false, code: "idempotency_conflict" });
    expect(port.events).toHaveLength(1);
  });

  it("rolls an atomic failure back completely and leaves the command retryable", async () => {
    const port = new ContractReference();
    const command = pauseCommand({ idempotencyKey: "pause-command-key-0006" });
    port.failNext = true;

    expect(await port.commitTransition(command))
      .toEqual({ ok: false, code: "dependency_unavailable" });
    expect(port.snapshot).toMatchObject({ version: 1, state: "active" });
    expect(port.events).toHaveLength(0);
    expect(port.commands).toHaveLength(0);

    expect(await port.commitTransition(command)).toMatchObject({ ok: true, replayed: false });
    expect(port.events).toHaveLength(1);
  });

  it("hides a foreign owner's subscription and command history", async () => {
    const port = new ContractReference();
    const foreign = pauseCommand({
      memberId: "member-2",
      idempotencyKey: "pause-command-key-0007",
    });
    expect(await port.commitTransition(foreign))
      .toEqual({ ok: false, code: "subscription_not_found" });
    expect(port.snapshot).toMatchObject({ version: 1, state: "active" });
    expect(port.events).toHaveLength(0);
  });

  it("preserves ordinary quantities 1, 20, 21, 49, and 50 while refusing 51", async () => {
    for (const quantity of [1, 20, 21, 49, 50]) {
      const port = new ContractReference();
      const result = await port.commitTransition(pauseCommand({
        next: { ...snapshot(), quantity },
        idempotencyKey: `pause-quantity-${quantity}-key`,
      }));
      expect(result).toMatchObject({ ok: true, snapshot: { quantity } });
      expect(port.events).toHaveLength(1);
    }

    const refused = new ContractReference();
    expect(await refused.commitTransition(pauseCommand({
      next: { ...snapshot(), quantity: 51 },
      idempotencyKey: "pause-quantity-51-key",
    }))).toEqual({ ok: false, code: "invalid_input" });
    expect(refused.events).toHaveLength(0);
  });
});
