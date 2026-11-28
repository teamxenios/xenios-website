import {
  businessInquiryPageSchema, businessInquiryRecordSchema,
  type BusinessInquiryPage, type BusinessInquiryRecord,
} from "@shared/research/business-inquiry";

export interface BusinessInquiryStaffApi {
  list(before?: string, options?: { signal?: AbortSignal }): Promise<BusinessInquiryPage>;
  read(id: string, options?: { signal?: AbortSignal }): Promise<BusinessInquiryRecord>;
}

export type BusinessInquiryStaffErrorCode =
  | "unauthenticated" | "denied" | "not_found" | "invalid_request" | "unavailable" | "stale";

const messages: Record<BusinessInquiryStaffErrorCode, string> = {
  unauthenticated: "Sign in to view business enquiries.",
  denied: "You do not have access to business enquiries.",
  not_found: "The business enquiry was not found.",
  invalid_request: "The business enquiry request is invalid.",
  unavailable: "Business enquiries are temporarily unavailable.",
  stale: "The business enquiry session is no longer current.",
};

export class BusinessInquiryStaffError extends Error {
  constructor(readonly code: BusinessInquiryStaffErrorCode) {
    super(messages[code]);
    this.name = "BusinessInquiryStaffError";
  }
}

const basePath = "/api/admin/research/business-inquiries";
// Covers all 50 records at the shared field limits, including UTF-8 text.
const maxResponseBytes = 4 * 1024 * 1024;
const uuidSchema = businessInquiryRecordSchema.shape.id;

/** Root supplies canonical Care authentication and a synchronous lifetime fence. */
export function createBusinessInquiryStaffApi(transport: {
  fetcher(path: string, init: RequestInit): Promise<Response>;
  isCurrent(): boolean;
}): BusinessInquiryStaffApi {
  if (!transport || typeof transport.fetcher !== "function" || typeof transport.isCurrent !== "function") {
    throw new BusinessInquiryStaffError("unavailable");
  }
  const { fetcher, isCurrent } = transport;
  function assertCurrent(signal?: AbortSignal): void {
    let current = false;
    try { current = !signal?.aborted && isCurrent() === true; } catch { /* Fail closed. */ }
    if (!current) throw new BusinessInquiryStaffError("stale");
  }
  function unavailable(): never { throw new BusinessInquiryStaffError("unavailable"); }

  async function boundedText(response: Response, signal?: AbortSignal): Promise<string> {
    if (!response.body) return unavailable();
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let bytes = 0;
    let text = "";
    let complete = false;
    try {
      while (true) {
        assertCurrent(signal);
        const chunk = await reader.read();
        assertCurrent(signal);
        if (chunk.done) {
          complete = true;
          return text + decoder.decode();
        }
        bytes += chunk.value.byteLength;
        if (bytes > maxResponseBytes) return unavailable();
        text += decoder.decode(chunk.value, { stream: true });
      }
    } finally {
      // Stop an incomplete body without waiting on an untrusted stream's cancellation.
      if (!complete) void reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }

  async function get<T>(path: string, decode: (data: unknown) => T, signal?: AbortSignal): Promise<T> {
    assertCurrent(signal);
    let response: Response;
    try {
      response = await fetcher(path, {
        method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error",
        headers: { Accept: "application/json" }, signal,
      });
    } catch {
      assertCurrent(signal);
      return unavailable();
    }
    // A resolved denial revokes this binding even if this particular read was superseded.
    // A different Root binding still discards every result, including denials.
    assertCurrent();
    if (response.status === 401) throw new BusinessInquiryStaffError("unauthenticated");
    if (response.status === 403) throw new BusinessInquiryStaffError("denied");
    assertCurrent(signal);
    if (response.redirected) return unavailable();
    if (response.status === 404) throw new BusinessInquiryStaffError("not_found");
    if (response.status === 400) throw new BusinessInquiryStaffError("invalid_request");
    if (response.status !== 200
      || !/^application\/json(?:\s*;|$)/i.test(response.headers.get("Content-Type") ?? "")) {
      return unavailable();
    }
    let data: unknown;
    try {
      const text = await boundedText(response, signal);
      assertCurrent(signal);
      data = JSON.parse(text);
    } catch {
      assertCurrent(signal);
      return unavailable();
    }
    assertCurrent(signal);
    const result = decode(data);
    assertCurrent(signal);
    return result;
  }

  return {
    async list(before, options) {
      assertCurrent(options?.signal);
      if (before !== undefined && !uuidSchema.safeParse(before).success) {
        throw new BusinessInquiryStaffError("invalid_request");
      }
      const path = before === undefined ? basePath : `${basePath}?before=${encodeURIComponent(before)}`;
      return get(path, (data) => {
        const parsed = businessInquiryPageSchema.safeParse(data);
        return parsed.success ? parsed.data : unavailable();
      }, options?.signal);
    },
    async read(id, options) {
      assertCurrent(options?.signal);
      if (!uuidSchema.safeParse(id).success) {
        throw new BusinessInquiryStaffError("invalid_request");
      }
      return get(`${basePath}/${id}`, (data) => {
        const parsed = businessInquiryRecordSchema.safeParse(data);
        return parsed.success && parsed.data.id === id ? parsed.data : unavailable();
      }, options?.signal);
    },
  };
}
