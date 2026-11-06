/** Finite UI observation of an async operation. Never retries or cancels a write. */
export type ObservedResult<T> =
  | Readonly<{ kind: "value"; value: T }>
  | Readonly<{ kind: "error" }>
  | Readonly<{ kind: "timeout" }>
  | Readonly<{ kind: "cancelled" }>;

export interface OperationClock {
  set(callback: () => void, delay: number): unknown;
  clear(handle: unknown): void;
}
const browserClock: OperationClock = {
  set: (callback, delay) => setTimeout(callback, delay),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * A timeout means "not observed", never "the server did not write".
 * Late responses and rejected promises are consumed but cannot update newer UI.
 * invalidate() settles the observation immediately and permits later reuse,
 * including React StrictMode effect cleanup/setup. No timer/network work occurs
 * until run(). Error objects are deliberately not exposed to customer UI/logs.
 */
export function createLatestOperation(clock: OperationClock = browserClock) {
  let generation = 0;
  let cancelPending: (() => void) | undefined;
  function invalidate(): void {
    generation += 1;
    const cancel = cancelPending;
    cancelPending = undefined;
    cancel?.();
  }
  function run<T>(operation: () => T | PromiseLike<T>, timeoutMs = 12_000): Promise<ObservedResult<T>> {
    // Even an invalid new call supersedes the previous observation.
    invalidate();
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
      return Promise.resolve({ kind: "error" });
    }
    const ticket = generation;
    return new Promise((resolve) => {
      let settled = false;
      let timer: unknown;
      let hasTimer = false;
      const finish = (result: ObservedResult<T>) => {
        if (settled) return;
        settled = true;
        if (hasTimer) { try { clock.clear(timer); } catch { /* Cleanup cannot suppress the result. */ } }
        if (generation === ticket) cancelPending = undefined;
        resolve(result);
      };
      cancelPending = () => finish({ kind: "cancelled" });
      try {
        timer = clock.set(() => finish({ kind: "timeout" }), timeoutMs);
        hasTimer = true;
        // Also supports a synchronous test clock without leaving a timer behind.
        if (settled) { try { clock.clear(timer); } catch { /* Observation is already settled. */ } }
      } catch {
        finish({ kind: "error" });
        return;
      }
      void Promise.resolve().then(() => {
        if (settled || ticket !== generation) return;
        return Promise.resolve(operation()).then(
          (value) => finish(ticket === generation ? { kind: "value", value } : { kind: "cancelled" }),
          () => finish({ kind: "error" }),
        );
      }).catch(() => finish({ kind: "error" }));
    });
  }
  return Object.freeze({ run, invalidate });
}
