/**
 * CONCURRENCY, RATE AND TIMEOUT CONTROL FOR ATTACHMENT SENDS.
 *
 * THE OPERATIONAL FAILURE THIS PREVENTS. An attachment send holds the raw file
 * and the provider's base64 encoding of it in memory at the same time. One
 * 8 MB upload therefore costs roughly 22 MB at peak. Ten of them arriving
 * together on a small container is an out of memory kill, and the process dies
 * in the middle of other customers' checkouts. Nothing about that failure is
 * visible in a unit test, so the cap is a first class part of the design
 * rather than an operational afterthought.
 *
 * A SEMAPHORE, NOT A QUEUE WITHOUT END. Waiters are bounded too. An unbounded
 * queue converts a load spike into a slow motion memory leak, because every
 * waiting request is still holding its own uploaded bytes while it waits. Past
 * the waiter bound the answer is an immediate, honest refusal that the route
 * maps to 503, which a customer can retry, rather than a request that hangs
 * until the platform kills it.
 *
 * THE RATE LIMIT IS PER SUBJECT, NOT GLOBAL. One customer repeatedly uploading
 * must not exhaust the shared send capacity, and the correct answer to that
 * customer is "slow down", not "the service is down for everyone".
 *
 * DETERMINISTIC TIME. Every clock is injected. These are the components most
 * likely to be tested with fake time, and a hidden `Date.now()` makes that
 * impossible.
 */

/** Concurrent provider sends. See the memory arithmetic above. */
export const PROOF_SEND_MAX_CONCURRENT = 3;

/** Requests waiting for a slot before the answer becomes "try again". */
export const PROOF_SEND_MAX_WAITING = 12;

/** One request's total budget for the provider call. */
export const PROOF_SEND_TIMEOUT_MS = 20_000;

/** Submissions one customer may attempt inside the window. */
export const PROOF_SUBMIT_RATE_LIMIT = 5;
export const PROOF_SUBMIT_RATE_WINDOW_MS = 10 * 60 * 1000;

export class SendCapacityExhausted extends Error {
  constructor() {
    super("No attachment send slot is available.");
    this.name = "SendCapacityExhausted";
  }
}

export class SendTimedOut extends Error {
  constructor() {
    super("The attachment send did not complete inside its budget.");
    this.name = "SendTimedOut";
  }
}

export interface SendSemaphore {
  /** Runs `work` inside a slot, or throws `SendCapacityExhausted`. */
  run<T>(work: () => Promise<T>): Promise<T>;
  /** Observability for the route and for tests. Never used for decisions. */
  readonly inFlight: number;
  readonly waiting: number;
}

export function createSendSemaphore(
  maxConcurrent: number = PROOF_SEND_MAX_CONCURRENT,
  maxWaiting: number = PROOF_SEND_MAX_WAITING,
): SendSemaphore {
  let inFlight = 0;
  const queue: Array<() => void> = [];

  const release = (): void => {
    inFlight -= 1;
    const next = queue.shift();
    if (next !== undefined) next();
  };

  return {
    get inFlight() {
      return inFlight;
    },
    get waiting() {
      return queue.length;
    },
    async run<T>(work: () => Promise<T>): Promise<T> {
      if (inFlight >= maxConcurrent) {
        if (queue.length >= maxWaiting) throw new SendCapacityExhausted();
        await new Promise<void>((resolve) => queue.push(resolve));
      }
      inFlight += 1;
      try {
        return await work();
      } finally {
        // In a finally so a throwing send cannot leak a slot. A leaked slot is
        // a permanent capacity loss that only a restart clears.
        release();
      }
    },
  };
}

/**
 * Bound the wall time of one provider call.
 *
 * The underlying promise is NOT cancelled, because a fetch that has already
 * been accepted cannot be un-accepted. The caller therefore treats a timeout as
 * genuinely ambiguous: the email may or may not exist, which is precisely the
 * `confirmation_unknown` state rather than a failure.
 */
export interface TimeoutScheduler {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export const systemTimeoutScheduler: TimeoutScheduler = Object.freeze({
  set(fn: () => void, ms: number): unknown {
    return setTimeout(fn, ms);
  },
  clear(handle: unknown): void {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
});

export async function withSendTimeout<T>(
  work: () => Promise<T>,
  timeoutMs: number = PROOF_SEND_TIMEOUT_MS,
  scheduler: TimeoutScheduler = systemTimeoutScheduler,
): Promise<T> {
  let handle: unknown;
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_resolve, reject) => {
        handle = scheduler.set(() => reject(new SendTimedOut()), timeoutMs);
      }),
    ]);
  } finally {
    // Always cleared, including on the success path, so a pending timer cannot
    // hold the event loop open after the request has answered.
    if (handle !== undefined) scheduler.clear(handle);
  }
}

export interface SubmissionRateLimiter {
  /** True when this subject may proceed. Records the attempt when it does. */
  admit(subject: string, nowMs: number): boolean;
}

/**
 * A fixed window counter, per subject.
 *
 * Deliberately simple. Precision is not the point: the point is that a script
 * cannot drive a hundred attachment sends through one session, and a sliding
 * window would add state per attempt for an accuracy nobody here needs. Entries
 * are swept on read so an idle process does not accumulate subjects for ever.
 */
export function createSubmissionRateLimiter(
  limit: number = PROOF_SUBMIT_RATE_LIMIT,
  windowMs: number = PROOF_SUBMIT_RATE_WINDOW_MS,
): SubmissionRateLimiter {
  const windows = new Map<string, { startedAt: number; count: number }>();

  return Object.freeze({
    admit(subject: string, nowMs: number): boolean {
      // forEach rather than for-of: this repository sets no tsconfig target,
      // so it compiles as ES5 where iterating a Map directly is not available.
      const expired: string[] = [];
      windows.forEach((window, key) => {
        if (nowMs - window.startedAt >= windowMs) expired.push(key);
      });
      for (let index = 0; index < expired.length; index += 1) {
        windows.delete(expired[index]);
      }

      const current = windows.get(subject);
      if (current === undefined || nowMs - current.startedAt >= windowMs) {
        windows.set(subject, { startedAt: nowMs, count: 1 });
        return true;
      }
      if (current.count >= limit) return false;
      current.count += 1;
      return true;
    },
  });
}
