import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Estimate, NormalizedSubmission, PublicReceipt, QuickOrderPorts } from './ports';

export const QUICK_ORDER_MAX_BYTES: 65536;
export interface QuickOrderHandlerOptions {
  origin: string;
  prefix?: string;
  enabled?: boolean;
}
export type QuickOrderHttpRequest = IncomingMessage & { originalUrl?: string; body?: unknown; rawBody?: unknown };
export interface QuickOrderReceiptEnvelope extends PublicReceipt {
  status: 'submitted';
  paymentStatus: 'not_collected';
  commissionState: 'not_authorized';
  estimate: Estimate;
  replayed: boolean;
  nextSteps: string[];
}
export function submissionHash(input: NormalizedSubmission): string;
export function publishedAgreements(config: unknown): boolean;
export function safeReceipt(value: unknown, replayed?: boolean): QuickOrderReceiptEnvelope;
export function createQuickOrderHandler(ports: QuickOrderPorts, options: QuickOrderHandlerOptions):
  (req: QuickOrderHttpRequest, res: ServerResponse, next?: () => void) => Promise<void>;
export function createQuickOrderErrorHandler(options?: { prefix?: string }):
  (error: unknown, req: QuickOrderHttpRequest, res: ServerResponse, next: (error?: unknown) => void) => void;
