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
}): unknown;
