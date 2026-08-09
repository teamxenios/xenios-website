import { describe, expect, it } from "vitest";
import {
  createSendSemaphore,
  createSubmissionRateLimiter,
  SendCapacityExhausted,
  SendTimedOut,
  withSendTimeout,
  type TimeoutScheduler,
} from "./concurrency";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("the send semaphore", () => {
  it("holds concurrency at the cap", async () => {
    const semaphore = createSendSemaphore(2, 10);
    const gates = [deferred<void>(), deferred<void>(), deferred<void>()];
    let started = 0;

    const runs = gates.map((gate) =>
      semaphore.run(async () => {
        started += 1;
        await gate.promise;
        return started;
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(started).toBe(2);
    expect(semaphore.inFlight).toBe(2);
    expect(semaphore.waiting).toBe(1);

    gates[0].resolve();
    await runs[0];
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(started).toBe(3);

    gates[1].resolve();
    gates[2].resolve();
    await Promise.all(runs);
    expect(semaphore.inFlight).toBe(0);
  });

  it("refuses past the waiter bound rather than queueing without end", async () => {
    const semaphore = createSendSemaphore(1, 1);
    const gate = deferred<void>();
    const first = semaphore.run(() => gate.promise);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const queued = semaphore.run(async () => undefined);
    await new Promise((resolve) => setTimeout(resolve, 0));

    await expect(semaphore.run(async () => undefined)).rejects.toBeInstanceOf(SendCapacityExhausted);

    gate.resolve();
    await first;
    await queued;
  });

  it("releases the slot when the work throws, so capacity is not lost", async () => {
    const semaphore = createSendSemaphore(1, 1);
    await expect(
      semaphore.run(async () => {
        throw new Error("provider exploded");
      }),
    ).rejects.toThrow("provider exploded");
    expect(semaphore.inFlight).toBe(0);
    await expect(semaphore.run(async () => "next")).resolves.toBe("next");
  });
});

describe("the send timeout", () => {
  it("rejects when the work outlives its budget", async () => {
    const scheduler: TimeoutScheduler = {
      set(fn) {
        fn();
        return 1;
      },
      clear() {},
    };
    await expect(withSendTimeout(() => new Promise(() => {}), 10, scheduler)).rejects.toBeInstanceOf(
      SendTimedOut,
    );
  });

  it("clears the timer on the success path so the event loop is not held open", async () => {
    let cleared = 0;
    const scheduler: TimeoutScheduler = {
      set() {
        return 42;
      },
      clear(handle) {
        expect(handle).toBe(42);
        cleared += 1;
      },
    };
    await expect(withSendTimeout(async () => "done", 10, scheduler)).resolves.toBe("done");
    expect(cleared).toBe(1);
  });
});

describe("the per subject rate limiter", () => {
  it("admits up to the limit and then refuses", () => {
    const limiter = createSubmissionRateLimiter(3, 60_000);
    expect(limiter.admit("cust_a", 0)).toBe(true);
    expect(limiter.admit("cust_a", 1)).toBe(true);
    expect(limiter.admit("cust_a", 2)).toBe(true);
    expect(limiter.admit("cust_a", 3)).toBe(false);
  });

  it("does not let one subject exhaust another's allowance", () => {
    const limiter = createSubmissionRateLimiter(1, 60_000);
    expect(limiter.admit("cust_a", 0)).toBe(true);
    expect(limiter.admit("cust_a", 1)).toBe(false);
    expect(limiter.admit("cust_b", 1)).toBe(true);
  });

  it("reopens after the window", () => {
    const limiter = createSubmissionRateLimiter(1, 1_000);
    expect(limiter.admit("cust_a", 0)).toBe(true);
    expect(limiter.admit("cust_a", 999)).toBe(false);
    expect(limiter.admit("cust_a", 1_000)).toBe(true);
  });
});
