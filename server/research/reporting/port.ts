import type { ReportingRow } from "../../../shared/research/reporting/contracts";

export type ReportingDelivery = Readonly<{
  /** Canonical outbox row identifier, never a provider or business identifier. */
  deliveryId: string;
  /** Runtime input remains unknown until the minimum-necessary contract parses it. */
  event: unknown;
  /** Current claimed attempt number. The durable queue increments this atomically. */
  attempt: number;
}>;

export type ReportingSinkResult =
  | Readonly<{ status: "written" | "already_present" }>
  | Readonly<{ status: "retryable_failure" | "permanent_failure"; reason: string }>;

export interface ReportingSink {
  write(row: ReportingRow): Promise<ReportingSinkResult>;
}

export interface ReportingQueue {
  claim(limit: number): Promise<readonly ReportingDelivery[]>;
  acknowledge(deliveryId: string): Promise<void>;
  retry(deliveryId: string, attempt: number, delayMs: number, reason: string): Promise<void>;
  deadLetter(deliveryId: string, attempt: number, reason: string): Promise<void>;
}
