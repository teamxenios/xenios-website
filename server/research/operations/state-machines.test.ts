import { describe, expect, it } from "vitest";
import {
  newOperationsAggregate,
  roleCan,
  transitionOperations,
  type OperationsActor,
  type OperationsAggregate,
} from "./state-machines";

const AT = new Date("2026-07-25T16:00:00.000Z");
const mitch: OperationsActor = { id: "mitch-1", role: "mitch" };
const system: OperationsActor = { id: "system", role: "system" };
const admin: OperationsActor = { id: "samuel", role: "admin" };

function move<M extends Parameters<typeof transitionOperations<M>>[0]["machine"]>(
  aggregate: OperationsAggregate,
  machine: M,
  to: Parameters<typeof transitionOperations<M>>[0]["to"],
  actor: OperationsActor,
  key: string,
) {
  return transitionOperations({
    aggregate,
    machine,
    to,
    actor,
    idempotencyKey: key,
    expectedVersion: aggregate.version,
    occurredAt: AT,
  } as Parameters<typeof transitionOperations<M>>[0]);
}

function accepted(result: ReturnType<typeof transitionOperations>): OperationsAggregate {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.message);
  return result.aggregate;
}

describe("operations role boundaries", () => {
  it("gives Mitch fulfillment permissions without full-admin, CRM, affiliate, payout, or audit access", () => {
    expect(roleCan("mitch", "fulfillment:work")).toBe(true);
    expect(roleCan("mitch", "inventory:move")).toBe(true);
    expect(roleCan("mitch", "shipments:manage")).toBe(true);
    expect(roleCan("mitch", "crm:read")).toBe(false);
    expect(roleCan("mitch", "affiliate:review")).toBe(false);
    expect(roleCan("mitch", "payouts:manage")).toBe(false);
    expect(roleCan("mitch", "audit:read")).toBe(false);
  });

  it("does not let admin impersonate the fulfillment operator", () => {
    let aggregate = newOperationsAggregate("ful-1");
    aggregate = accepted(move(aggregate, "fulfillment", "awaiting_acknowledgement", system, "f-1"));
    const result = move(aggregate, "fulfillment", "acknowledged", admin, "f-2");
    expect(result).toMatchObject({ ok: false, code: "role_not_allowed" });
  });
});

describe("separate, protected operations state machines", () => {
  it("changes exactly one state and records a complete immutable audit event", () => {
    const original = newOperationsAggregate("ord-1");
    const result = move(original, "payment", "authorized", system, "pay-1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.aggregate.states).toEqual({ ...original.states, payment: "authorized" });
    expect(result.aggregate.version).toBe(1);
    expect(result.audit).toMatchObject({
      aggregateId: "ord-1",
      aggregateVersion: 1,
      actorId: "system",
      actorRole: "system",
      machine: "payment",
      from: "pending",
      to: "authorized",
      idempotencyKey: "pay-1",
    });
    expect(original.states.payment).toBe("pending");
  });

  it("absorbs an identical retry and rejects reusing the key for another command", () => {
    const original = newOperationsAggregate("ord-2");
    const first = move(original, "payment", "authorized", system, "retry-key");
    const aggregate = accepted(first);
    const retry = transitionOperations({
      aggregate,
      machine: "payment",
      to: "authorized",
      actor: system,
      idempotencyKey: "retry-key",
      expectedVersion: 0,
      occurredAt: AT,
    });
    expect(retry).toMatchObject({ ok: true, idempotent: true, audit: null });

    const conflict = transitionOperations({
      aggregate,
      machine: "payment",
      to: "failed",
      actor: system,
      idempotencyKey: "retry-key",
      expectedVersion: aggregate.version,
      occurredAt: AT,
    });
    expect(conflict).toMatchObject({ ok: false, code: "idempotency_conflict" });
  });

  it("rejects stale writes before any mutation", () => {
    const aggregate = newOperationsAggregate("ord-3");
    const result = transitionOperations({
      aggregate,
      machine: "order",
      to: "confirmed",
      actor: admin,
      idempotencyKey: "order-1",
      expectedVersion: 9,
      occurredAt: AT,
    });
    expect(result).toMatchObject({ ok: false, code: "stale_write" });
    expect(aggregate.version).toBe(0);
    expect(aggregate.states.order).toBe("new");
  });

  it("requires a non-empty idempotency key", () => {
    const result = transitionOperations({
      aggregate: newOperationsAggregate("ord-4"),
      machine: "order",
      to: "confirmed",
      actor: admin,
      idempotencyKey: "  ",
      expectedVersion: 0,
      occurredAt: AT,
    });
    expect(result).toMatchObject({ ok: false, code: "idempotency_key_required" });
  });

  it("rejects invalid transitions and unauthorized actors", () => {
    const invalid = move(newOperationsAggregate("ord-5"), "fulfillment", "packed", mitch, "bad-order");
    expect(invalid).toMatchObject({ ok: false, code: "transition_not_allowed" });

    const actor = move(newOperationsAggregate("ord-6"), "payment", "authorized", admin, "bad-actor");
    expect(actor).toMatchObject({ ok: false, code: "role_not_allowed" });
  });

  it("supports the complete Mitch path without altering payment, order, shipment, or allocation state", () => {
    let aggregate = newOperationsAggregate("ful-2");
    aggregate = accepted(move(aggregate, "fulfillment", "awaiting_acknowledgement", system, "m-1"));
    aggregate = accepted(move(aggregate, "fulfillment", "acknowledged", mitch, "m-2"));
    aggregate = accepted(move(aggregate, "fulfillment", "picking", mitch, "m-3"));
    aggregate = accepted(move(aggregate, "fulfillment", "packed", mitch, "m-4"));
    aggregate = accepted(move(aggregate, "fulfillment", "label_required", mitch, "m-5"));
    aggregate = accepted(move(aggregate, "fulfillment", "ready_to_ship", mitch, "m-6"));
    aggregate = accepted(move(aggregate, "fulfillment", "shipped", mitch, "m-7"));
    expect(aggregate.states).toEqual({
      payment: "pending",
      order: "new",
      fulfillment: "shipped",
      shipment: "not_created",
      allocation: "unallocated",
    });
  });
});
