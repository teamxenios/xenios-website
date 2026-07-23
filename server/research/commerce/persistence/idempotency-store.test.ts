import { describe, it, expect, vi } from "vitest";
import { InMemoryIdempotencyStore } from "./idempotency-store";

describe("InMemoryIdempotencyStore", () => {
  it("runs produce once and replays the stored result", async () => {
    const store = new InMemoryIdempotencyStore();
    const produce = vi.fn(async () => ({ orderId: "ord_1" }));

    const first = await store.once("member_a", "key_1", produce);
    const second = await store.once("member_a", "key_1", produce);

    expect(first).toEqual({ value: { orderId: "ord_1" }, replayed: false });
    expect(second).toEqual({ value: { orderId: "ord_1" }, replayed: true });
    expect(produce).toHaveBeenCalledTimes(1); // no double execution -> no double charge
  });

  it("isolates keys per scope so two members cannot collide on one raw key", async () => {
    const store = new InMemoryIdempotencyStore();

    const a = await store.once("member_a", "same_key", async () => "A");
    const b = await store.once("member_b", "same_key", async () => "B");

    expect(a.value).toBe("A");
    expect(b.value).toBe("B");
    expect(a.replayed).toBe(false);
    expect(b.replayed).toBe(false);
  });

  it("shares one execution across concurrent calls for the same (scope, key)", async () => {
    const store = new InMemoryIdempotencyStore();
    let calls = 0;
    let release!: (v: string) => void;
    const gate = new Promise<string>((resolve) => {
      release = resolve;
    });
    const produce = () => {
      calls++;
      return gate;
    };

    const p1 = store.once("member_a", "concurrent", produce);
    const p2 = store.once("member_a", "concurrent", produce);
    release("done");
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(calls).toBe(1); // exactly one execution under concurrency
    expect(r1.value).toBe("done");
    expect(r2.value).toBe("done");
    // one caller ran it, the other rode along as a replay
    expect([r1.replayed, r2.replayed].filter(Boolean)).toHaveLength(1);
  });

  it("does not cache a failed produce, so the operation stays retryable", async () => {
    const store = new InMemoryIdempotencyStore();
    let attempt = 0;
    const produce = async () => {
      attempt++;
      if (attempt === 1) throw new Error("transient");
      return "recovered";
    };

    await expect(store.once("member_a", "retry", produce)).rejects.toThrow("transient");
    const second = await store.once("member_a", "retry", produce);

    expect(second).toEqual({ value: "recovered", replayed: false });
    expect(attempt).toBe(2); // the failure was not stored; the retry actually ran
  });
});
