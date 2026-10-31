import type { AssistedOrderCatalogQuery } from "../../../../shared/research/assisted-order/contract";
import type { RequestIntentCatalogPage, RequestIntentDetail, RequestIntentInput, RequestIntentReceipt, RequestIntentQueuePage } from "../../../../shared/research/assisted-order/request-intent";
import { parseAssistedOrderConfig, type AssistedOrderWizardConfig } from "./wizard-state";

/** Constructed only after a well-formed server error envelope. Body text is never surfaced. */
export class RequestIntentHttpError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super("Request refused by the server.");
    this.name = "RequestIntentHttpError";
  }
}
export function isKnownIntentPrewriteRefusal(error: unknown): error is RequestIntentHttpError {
  return error instanceof RequestIntentHttpError && [400, 401, 403, 429].includes(error.status);
}
/** This copy is used ONLY after first-POST and owned-marker clearance proof. */
export function intentRefusalGuidance(error: RequestIntentHttpError): string {
  if (error.status === 401) return "This request was not saved. Sign in through the existing account or access flow before starting a new attempt.";
  if (error.status === 429) return "This request was not saved. Wait before submitting a new attempt; you can edit the details meanwhile.";
  if (error.status === 403 && error.code === "agreement_standing_required") {
    return "This request was not saved. Complete the existing access and agreement requirements before starting a new attempt.";
  }
  if (error.status === 403) return "This request was not saved. Access was refused. Review your access or contact support before starting a new attempt.";
  if (error.code === "selection_requires_refresh") return "This request was not saved. Reload the current catalog, review the exact products and quantities, and submit a new attempt.";
  if (error.code === "current_acknowledgments_required") return "This request was not saved. Reload the current requirements, review and confirm them, and submit a new attempt.";
  return "This request was not saved. Check the required details, products, quantities and acknowledgments before submitting a new attempt.";
}

export const REQUEST_INTENT_API_PATH = "/api/research/early-access/request-intents";
export interface RequestIntentApi {
  config(): Promise<AssistedOrderWizardConfig>;
  catalog(query: AssistedOrderCatalogQuery): Promise<RequestIntentCatalogPage>;
  submit(input: RequestIntentInput): Promise<unknown>;
  recover(idempotencyKey: string): Promise<RequestIntentReceipt | null>;
  staff(requestId: string): Promise<RequestIntentDetail>;
  staffQueue(page: number): Promise<RequestIntentQueuePage>;
}
export function parseIntentReceipt(raw: unknown): RequestIntentReceipt {
  if (typeof raw !== "object" || raw === null) throw new Error("Request outcome is unconfirmed.");
  const row = raw as Partial<RequestIntentReceipt>;
  if (row.kind !== "unapproved_selection_request" || row.status !== "pending_review"
    || typeof row.requestId !== "string" || !/^[0-9a-f-]{36}$/i.test(row.requestId)
    || row.publicReference !== "XRI-" + row.requestId.replace(/-/g, "").toUpperCase()
    || typeof row.createdAt !== "string" || !Number.isFinite(Date.parse(row.createdAt))) {
    throw new Error("Request outcome is unconfirmed.");
  }
  return { kind: row.kind, status: row.status, requestId: row.requestId,
    publicReference: row.publicReference, createdAt: row.createdAt };
}
/** Token getter is supplied by the existing Auth context, never local email/profile identity. */
export function createRequestIntentApi(
  memberToken: () => string | null = () => null,
  transport: (path: string, init: RequestInit) => Promise<Response> = (path, init) => fetch(path, init),
): RequestIntentApi {
  async function request(path: string, body?: unknown): Promise<unknown> {
    const token = memberToken();
    const response = await transport(REQUEST_INTENT_API_PATH + path, {
      method: body === undefined ? "GET" : "POST",
      credentials: "include", cache: "no-store",
      headers: { accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(token ? { Authorization: "Bearer " + token } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      // A status alone, HTML, a lost body or a malformed envelope is not
      // sufficient evidence of a known refusal, even when the status is 4xx.
      if (result && typeof result === "object" && !Array.isArray(result)
        && typeof (result as { error?: unknown }).error === "string"
        && /^[a-z][a-z0-9_]{0,79}$/.test((result as { error: string }).error)) {
        throw new RequestIntentHttpError(response.status, (result as { error: string }).error);
      }
      throw new Error("Request outcome is unconfirmed. Keep the same attempt.");
    }
    if (result === null) throw new Error("Request outcome is unconfirmed. Keep the same attempt.");
    return result;
  }
  return {
    async config() {
      const raw = await request("/config");
      const config = parseAssistedOrderConfig(raw);
      if (!config || (raw as { enabled?: unknown }).enabled !== true) throw new Error("Request requirements unavailable.");
      return config;
    },
    async catalog(query) {
      const requestedPage = query.page === undefined ? 1 : query.page;
      const requestedSize = query.pageSize === undefined ? 24 : query.pageSize;
      // Match the catalog reader; its internal scan limit is not a public page cap.
      if (!Number.isSafeInteger(requestedPage) || requestedPage < 1
        || !Number.isSafeInteger(requestedSize) || requestedSize < 1 || requestedSize > 100) {
        throw new Error("The current catalog could not be confirmed.");
      }
      const params = new URLSearchParams();
      if (query.search) params.set("search", query.search);
      if (query.family) params.set("family", query.family);
      params.set("page", String(requestedPage)); params.set("pageSize", String(requestedSize));
      const raw = await request("/catalog?" + params);
      const page = raw as RequestIntentCatalogPage;
      if (!page || !Array.isArray(page.items) || !Number.isSafeInteger(page.total) || page.total < 0
        || !Number.isSafeInteger(page.page) || !Number.isSafeInteger(page.pageSize)
        || page.page !== requestedPage || page.pageSize !== requestedSize
        || page.items.length > requestedSize || page.items.length > page.total
        || !Array.isArray(page.families)
        || page.items.some((item) => typeof item.productId !== "string" || typeof item.variantId !== "string"
          || typeof item.selectableForReview !== "boolean" || typeof item.clinicalReviewRequired !== "boolean")) {
        throw new Error("The current catalog could not be confirmed.");
      }
      return page;
    },
    submit: (input) => request("", input),
    async recover(idempotencyKey) {
      const result = await request("/recover", { idempotencyKey }) as { receipt?: unknown };
      if (!Object.prototype.hasOwnProperty.call(result, "receipt")) throw new Error("Recovery is unconfirmed.");
      return result.receipt === null ? null : parseIntentReceipt(result.receipt);
    },
    async staffQueue(page) {
      // Match the existing staffList request bound; server authorization remains authoritative.
      if (!Number.isSafeInteger(page) || page < 1 || page > 10000) throw new Error("Queue unavailable.");
      const raw = await request("/staff?page=" + page) as RequestIntentQueuePage;
      if (!raw || !Array.isArray(raw.items) || !Number.isSafeInteger(raw.total) || raw.total < 0
        || raw.page !== page || !Number.isSafeInteger(raw.pageSize) || raw.pageSize < 1
        || raw.items.length > raw.pageSize || raw.items.length > raw.total) throw new Error("Queue unavailable.");
      return { items: raw.items.map((item) => ({ ...parseIntentReceipt(item), lineCount: item.lineCount })),
        total: raw.total, page: raw.page, pageSize: raw.pageSize };
    },
    async staff(requestId) {
      if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw new Error("Invalid request identity.");
      const raw = await request("/staff/" + requestId);
      const result = raw as RequestIntentDetail;
      const publicPart = parseIntentReceipt(raw);
      if (publicPart.requestId.toLowerCase() !== requestId.toLowerCase()
        || !result.contact || !Array.isArray(result.lines) || !Array.isArray(result.agreements)
        || result.lines.some((line) => line.reviewState !== "pending")) throw new Error("Request detail is unavailable.");
      return { ...publicPart, contact: result.contact, agreements: result.agreements, lines: result.lines };
    },
  };
}
