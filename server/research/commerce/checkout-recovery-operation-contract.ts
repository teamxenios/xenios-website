import type { CheckoutExecutionPhase } from "@shared/research/durable-checkout-execution";
import type { RecoveryCursor, RecoveryEntryCode } from "./checkout-recovery-sweep";

export const RECOVERY_OPERATION_AUTHORITY = "durable_checkout_recovery_operation_v1" as const;
export const RECOVERY_OPERATION_RPC = "research_checkout_recovery_operation" as const;
export interface RecoveryIntent {
  intentId: string;
  executionId: string;
  memberId: string;
  orderId: string;
  requestKey: string;
  observedUpdatedAt: string;
  observedPhase: CheckoutExecutionPhase;
  decision: "settle" | "skip";
}
export interface RecoveryOperationState {
  schemaVersion: 1;
  owner: string | null;
  /** Decimal string: the database fencing counter must never lose precision. */
  fence: string;
  leaseUntil: string | null;
  cycleId: string;
  /** Fixed, millisecond-aligned database horizon for this cycle. */
  before: string;
  after: RecoveryCursor | null;
  exhausted: boolean;
  pending: RecoveryIntent | null;
}
export interface RecoveryBeginInput {
  intentId: string;
  executionId: string;
  observedUpdatedAt: string;
  observedPhase: CheckoutExecutionPhase;
  decision: "settle" | "skip";
}
export interface RecoveryOperationStore {
  readonly authority: typeof RECOVERY_OPERATION_AUTHORITY;
  readonly durable: true;
  read(): Promise<RecoveryOperationState | null>;
  claim(owner: string): Promise<{ status: "busy" } | { status: "acquired"; state: RecoveryOperationState }>;
  renew(owner: string, fence: string): Promise<RecoveryOperationState>;
  begin(owner: string, fence: string, input: RecoveryBeginInput): Promise<RecoveryOperationState>;
  complete(owner: string, fence: string, intentId: string, code: RecoveryEntryCode): Promise<RecoveryOperationState>;
  exhaust(owner: string, fence: string): Promise<RecoveryOperationState>;
  release(owner: string, fence: string): Promise<RecoveryOperationState>;
}
