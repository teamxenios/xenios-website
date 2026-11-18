import type { Express, Request, RequestHandler } from "express";
import type { Pool } from "pg";
import type { registerPrivateQuoteDispatch } from "../../../outbox";
import type { AssistedOrderQuoteService } from "../service";
import type { bindReviewedXriQuoteLines } from "../xri-line-bindings";
import type { QuoteTransport } from "./mail.mjs";
import type { QuoteQuery } from "./pg.mjs";
type Viewer = {
  tenant?: string;
  subject?: string;
  earlyAccessSessionHash?: string | null;
  capabilities: ReadonlySet<string>;
};
/** quoteId is the durable notice's quote; staging ignores it. */
type Job = { tenant: string; issuer: string; xriId: string; seller: string; quoteId: string };
export function attachApprovedPrivateQuotes(options: {
  enabled: boolean;
  router: Express;
  pool: Pool;
  authority: {
    forIssue(query: QuoteQuery, viewer: Viewer, xriId: string, seller: string): Promise<unknown>;
    forCustomer(query: QuoteQuery, viewer: Viewer, xriId: string, seller: string): Promise<unknown>;
    forDispatch(query: QuoteQuery, job: Job): Promise<unknown>;
    verifiedDispatchEvidence(): Promise<unknown>;
  };
  Engine: typeof AssistedOrderQuoteService;
  bind: typeof bindReviewedXriQuoteLines;
  transport: QuoteTransport;
  tagKey: Buffer;
  customerPrincipal(req: Request): Promise<Viewer | null>;
  ownedRequests(viewer: Viewer): Promise<readonly { xriId: string; seller: string; sellerLabel: string; requestLineCount: number }[]>;
  staffPrincipal(req: Request): Promise<Viewer | null>;
  staffGuard: RequestHandler;
  csrfChecked(req: Request, viewer: Viewer): Promise<boolean>;
  issueInput(req: Request): Promise<unknown>;
  registerPrivateQuoteDispatch: typeof registerPrivateQuoteDispatch;
  assumeStagingRuntimeRole: boolean;
  runtimeRole?: "staging" | "production" | null;
  stageDispatchPaused: boolean;
  deferStagingNotice: boolean;
  /**
   * The signed provider receipt endpoint. Without it, no receipt door is attached.
   * `customerNotices` receives the verified events the quote channel does not claim,
   * on the same endpoint and with the same secrets.
   */
  receiptEndpoint?: {
    enabled: boolean;
    tenant: string;
    secrets: readonly string[];
    expressRaw: (options: { type: string; inflate: boolean; limit: string }) => unknown;
    customerNotices?: { receive(bytes: Buffer, headers: readonly string[]): Promise<{ status: number }> } | null;
  } | null;
}): unknown;
