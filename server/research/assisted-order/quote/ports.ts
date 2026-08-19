// Ports for the assisted-order quote engine. Same discipline as the parent
// lane's ports.ts: pure interfaces, no I/O, no Express, composition decides.

import type {
  AssistedOrderQuoteState,
} from "../../../../shared/research/assisted-order/quote-contract";
import type { AssistedOrderViewer } from "../ports";

/** The stored quote line. `pricingBasis` is INTERNAL ONLY (price-pending
 * lines priced by an admin must record why); it never enters a customer
 * projection. */
export type AssistedOrderQuoteLineRecord = Readonly<{
  lineId: string;
  productId: string;
  variantId: string;
  productName: string;
  specification: string | null;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  currency: "USD";
  priceSource: "catalog" | "quoted";
  pricingBasis: string | null;
}>;

export type AssistedOrderQuoteRecord = Readonly<{
  quoteId: string;
  requestId: string;
  requestPublicReference: string;
  version: number;
  state: AssistedOrderQuoteState;
  lines: readonly AssistedOrderQuoteLineRecord[];
  totalCents: number;
  currency: "USD";
  issuedAt: string;
  validUntil: string;
  issuedByActorLabel: string;
  customerNote: string | null;
  internalNote: string | null;
  acceptedAt: string | null;
  acceptanceId: string | null;
  declinedAt: string | null;
}>;

export type AssistedOrderQuoteRepository = Readonly<{
  create(record: AssistedOrderQuoteRecord): Promise<void>;
  byId(quoteId: string): Promise<AssistedOrderQuoteRecord | null>;
  byRequest(requestId: string): Promise<readonly AssistedOrderQuoteRecord[]>;
  /** Replace the stored record whose quoteId and version match; the memory
   * and SQL implementations both refuse a lost update. */
  update(record: AssistedOrderQuoteRecord): Promise<void>;
}>;

/** How the quote engine learns who owns a request. Implemented by the
 * composition over the EXISTING assisted-order repository; the engine never
 * grows a second copy of request ownership. */
export type AssistedOrderQuoteRequestDirectory = Readonly<{
  bindingFor(requestId: string): Promise<Readonly<{
    requestId: string;
    publicReference: string;
    actorMemberId: string | null;
    earlyAccessSessionHash: string | null;
    normalizedEmail: string | null;
  }> | null>;
  byPublicReference(publicReference: string): Promise<Readonly<{
    requestId: string;
    publicReference: string;
    actorMemberId: string | null;
    earlyAccessSessionHash: string | null;
    normalizedEmail: string | null;
  }> | null>;
}>;

/** The lines the request already stored, with their authoritative prices —
 * the ONLY price source for priced ("catalog") quote lines. */
export type AssistedOrderQuoteRequestLines = Readonly<{
  linesFor(requestId: string): Promise<readonly Readonly<{
    lineId: string;
    productId: string;
    variantId: string;
    productName: string;
    specification: string | null;
    quantity: number;
    unitPriceCents: number | null;
    currency: "USD";
  }>[]>;
}>;

export type AssistedOrderQuoteAuditSink = Readonly<{
  record(event: Readonly<Record<string, unknown>>): Promise<void>;
}>;

export type AssistedOrderQuoteClock = Readonly<{ now(): Date }>;

export type AssistedOrderQuoteIds = Readonly<{ uuid(): string }>;

export type AssistedOrderQuoteDependencies = Readonly<{
  repository: AssistedOrderQuoteRepository;
  requests: AssistedOrderQuoteRequestDirectory;
  requestLines: AssistedOrderQuoteRequestLines;
  audit: AssistedOrderQuoteAuditSink;
  clock: AssistedOrderQuoteClock;
  ids: AssistedOrderQuoteIds;
}>;

/** Admin input for one issued quote line. For a priced request line the
 * engine takes the authoritative price and REFUSES an admin-supplied one; a
 * price-pending line requires the admin price plus a recorded basis. */
export type AssistedOrderQuoteIssueLineInput = Readonly<{
  requestLineId: string;
  unitPriceCents?: number;
  pricingBasis?: string;
}>;

export type AssistedOrderQuoteIssueInput = Readonly<{
  requestId: string;
  lines: readonly AssistedOrderQuoteIssueLineInput[];
  validUntil: string;
  customerNote?: string | null;
  internalNote?: string | null;
}>;

export type { AssistedOrderViewer };
