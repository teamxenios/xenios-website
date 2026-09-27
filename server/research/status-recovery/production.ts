import type { StatusRecoveryStore } from "./ports";
import { statusRecoveryCrypto } from "./crypto";
import { StatusRecoveryService } from "./service";
import { SupabaseStatusRecoveryStore, type StatusRecoveryRpcClient } from "./supabase-store";

const unavailableStore: StatusRecoveryStore = Object.freeze({
  findEligibleSubject: async () => null,
  prepareDelivery: async () => null,
  exchange: async () => false,
  getStatus: async () => null,
  revokeSession: async () => undefined,
});

export function createProductionStatusRecoveryService(input: Readonly<{
  rpc: StatusRecoveryRpcClient | null;
  enqueue: (intent: Parameters<import("./ports").StatusRecoveryOutbox["enqueue"]>[0]) => Promise<boolean>;
  rateLimit: import("./ports").StatusRecoveryRateLimiter;
}>): StatusRecoveryService {
  return new StatusRecoveryService({
    store: input.rpc ? new SupabaseStatusRecoveryStore(input.rpc) : unavailableStore,
    outbox: Object.freeze({ enqueue: input.enqueue }),
    rateLimit: input.rateLimit,
    clock: Object.freeze({ now: () => new Date(), nowMs: () => Date.now() }),
    crypto: statusRecoveryCrypto,
  });
}

export { unavailableStore as unavailableStatusRecoveryStore };
