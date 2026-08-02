import { toReportingRow } from "../../../shared/research/reporting/contracts";
import type { ReportingDelivery, ReportingQueue, ReportingSink } from "./port";

export type ReportingWorkerOptions = Readonly<{ batchSize: number; maxAttempts: number; baseRetryDelayMs: number }>;
export type ReportingRunSummary = Readonly<{ claimed: number; delivered: number; reconciled: number; retried: number; deadLettered: number }>;

export const DEFAULT_REPORTING_WORKER_OPTIONS: ReportingWorkerOptions = Object.freeze({ batchSize: 25, maxAttempts: 3, baseRetryDelayMs: 1_000 });

function validateOptions(options: ReportingWorkerOptions): void {
  if (!Number.isInteger(options.batchSize) || options.batchSize < 1 || options.batchSize > 100) throw new Error("batchSize must be an integer from 1 to 100");
  if (!Number.isInteger(options.maxAttempts) || options.maxAttempts < 1 || options.maxAttempts > 10) throw new Error("maxAttempts must be an integer from 1 to 10");
  if (!Number.isInteger(options.baseRetryDelayMs) || options.baseRetryDelayMs < 1 || options.baseRetryDelayMs > 86_400_000) throw new Error("baseRetryDelayMs must be a bounded positive integer");
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateDeliveries(value: unknown, batchSize: number): readonly ReportingDelivery[] {
  if (!Array.isArray(value) || value.length > batchSize) {
    throw new Error("reporting queue returned an invalid batch");
  }
  const deliveryIds = new Set<string>();
  for (const item of value) {
    if (
      !item ||
      typeof item !== "object" ||
      !("deliveryId" in item) ||
      typeof item.deliveryId !== "string" ||
      !UUID_PATTERN.test(item.deliveryId) ||
      !("attempt" in item) ||
      !Number.isInteger(item.attempt) ||
      Number(item.attempt) < 1 ||
      Number(item.attempt) > 1_000_000 ||
      !("event" in item)
    ) {
      throw new Error("reporting queue returned an invalid delivery");
    }
    const normalized = item.deliveryId.toLowerCase();
    if (deliveryIds.has(normalized)) {
      throw new Error("reporting queue returned a duplicate delivery");
    }
    deliveryIds.add(normalized);
  }
  return value as ReportingDelivery[];
}

export async function runReportingWorker(queue: ReportingQueue, sink: ReportingSink, options: ReportingWorkerOptions = DEFAULT_REPORTING_WORKER_OPTIONS): Promise<ReportingRunSummary> {
  validateOptions(options);
  const deliveries = validateDeliveries(await queue.claim(options.batchSize), options.batchSize);
  let delivered = 0, reconciled = 0, retried = 0, deadLettered = 0;
  for (const delivery of deliveries) {
    const attempt = delivery.attempt;
    let row;
    try {
      row = toReportingRow(delivery.event);
    } catch {
      await queue.deadLetter(delivery.deliveryId, attempt, "invalid_reporting_event");
      deadLettered++;
      continue;
    }
    let outcome;
    try {
      outcome = await sink.write(row);
    } catch {
      outcome = { status: "retryable_failure" as const, reason: "ignored" };
    }
    if (outcome.status === "written" || outcome.status === "already_present") {
      await queue.acknowledge(delivery.deliveryId);
      outcome.status === "written" ? delivered++ : reconciled++;
    } else if (outcome.status === "retryable_failure" && attempt < options.maxAttempts) {
      const delay = Math.min(options.baseRetryDelayMs * 2 ** (attempt - 1), 86_400_000);
      await queue.retry(delivery.deliveryId, attempt, delay, "reporting_sink_retryable_failure");
      retried++;
    } else {
      await queue.deadLetter(delivery.deliveryId, attempt, outcome.status === "permanent_failure" ? "reporting_sink_permanent_failure" : "reporting_sink_retry_exhausted");
      deadLettered++;
    }
  }
  return Object.freeze({ claimed: deliveries.length, delivered, reconciled, retried, deadLettered });
}
