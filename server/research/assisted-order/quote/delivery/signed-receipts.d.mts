import type { Express, RequestHandler } from "express";
import type { QuoteQuery } from "./pg.mjs";
export type SignedQuoteReceipt = {
  eid: string; pid: string; kind: "accepted" | "delivered" | "bounced"; digest: string; addressTag: string;
};
export type ReceiptReconcile = (...args: unknown[]) => unknown;
export type QuoteReceiptMatch = {
  xriId: string; quoteId: string; deliveryKey: string; providerId: string;
  state: "accepted" | "delivered" | "bounced"; eventId: string;
};
export type QuoteReceiptReceiver = {
  receive(bytes: Buffer, headers: readonly string[], reconcile: ReceiptReconcile): Promise<{ status: number; unclaimed?: boolean }>;
};
export function signedQuoteReceiptVerifier(options: {secrets: readonly string[]; tagKey: Buffer; now?: () => number}):
  (bytes: Buffer, headers: readonly string[]) => SignedQuoteReceipt | null;
export function createResendReceipts(options: {
  tenant: string; tagKey: Buffer;
  transact: <T>(tenant: string, key: string, work: (query: QuoteQuery) => Promise<T>) => Promise<T>;
  verifier: (bytes: Buffer, headers: readonly string[]) => SignedQuoteReceipt | null;
}): QuoteReceiptReceiver & {
  drainAfterAck(providerId: string, reconcile: ReceiptReconcile): Promise<number>;
  verifiedDispatchEvidence(query: QuoteQuery, scope: {tenant: string; xriId: string; quoteId: string; proof: {receiptId?: string}}): Promise<QuoteReceiptMatch | null>;
};
export function attachResendReceiptDoor(router: Pick<Express, "post">, options: {
  raw: (options: {type: string; inflate: boolean; limit: string}) => RequestHandler;
  receipts: QuoteReceiptReceiver;
  reconcile: ReceiptReconcile;
  notices?: { receive(bytes: Buffer, headers: readonly string[]): Promise<{ status: number }> } | null;
}): void;
