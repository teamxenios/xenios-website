import { z } from "zod";
import {
  businessInquiryInputSchema, businessInquiryReceiptSchema,
  type BusinessInquiryInput, type BusinessInquiryReceipt,
} from "@shared/research/business-inquiry";

const commandSchema = z.object({
  attemptKey: z.string().regex(/^[A-Za-z0-9_-]{24,128}$/),
  enquiry: businessInquiryInputSchema,
}).strict();
const refusalSchema = z.object({
  error: z.enum(["invalid_request", "not_permitted", "not_found", "conflict", "not_ready", "unavailable"]),
}).strict();
export type BusinessInquiryCommand = Readonly<{ attemptKey: string; enquiry: BusinessInquiryInput }>;
export type BusinessInquirySubmissionResult =
  | { kind: "saved"; receipt: BusinessInquiryReceipt }
  | { kind: "invalid_command" }
  | { kind: "rejected"; code: "invalid_request" | "not_permitted" | "not_found" }
  | { kind: "conflict" }
  | { kind: "uncertain" }
  | { kind: "discarded" };
export interface BusinessInquiryTransport {
  signal: AbortSignal;
  /** Synchronous Root-owned context/lifecycle fence, never authorization. */
  isCurrent(): boolean;
  fetcher?: typeof fetch;
}

/** Mint only for a new, validated explicit submission; never for a retry. */
export function createBusinessInquiryAttemptKey(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createBusinessInquiryCommand(attemptKey: string, enquiry: unknown): BusinessInquiryCommand {
  const parsed = commandSchema.safeParse({ attemptKey, enquiry });
  if (!parsed.success) throw new Error("invalid_business_inquiry_command");
  Object.freeze(parsed.data.enquiry.categories);
  Object.freeze(parsed.data.enquiry.services);
  parsed.data.enquiry.selections.forEach((selection) => Object.freeze(selection));
  Object.freeze(parsed.data.enquiry.selections);
  Object.freeze(parsed.data.enquiry);
  return Object.freeze(parsed.data);
}

/** No URL/body authority selectors, logging, storage, automatic retry, or raw error exposure. */
export async function submitBusinessInquiry(
  command: BusinessInquiryCommand, transport: BusinessInquiryTransport,
): Promise<BusinessInquirySubmissionResult> {
  const current = () => {
    try { return !transport.signal.aborted && transport.isCurrent() === true; } catch { return false; }
  };
  if (!current()) return { kind: "discarded" };
  const parsed = commandSchema.safeParse(command);
  if (!parsed.success) return { kind: "invalid_command" };
  try {
    if (!current()) return { kind: "discarded" };
    const response = await (transport.fetcher ?? globalThis.fetch)("/api/research/business-inquiries", {
      method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(parsed.data), signal: transport.signal,
    });
    if (!current()) return { kind: "discarded" };
    // A server failure can occur after a committed transaction. Preserve the command.
    if (response.status >= 500 || response.redirected) return { kind: "uncertain" };
    if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get("Content-Type") ?? "")) {
      return { kind: "uncertain" };
    }
    const text = await response.text();
    if (!current()) return { kind: "discarded" };
    if (text.length > 4096) return { kind: "uncertain" };
    let data: unknown;
    try { data = JSON.parse(text); } catch { return { kind: "uncertain" }; }
    if (!current()) return { kind: "discarded" };
    if (response.status === 200 || response.status === 201) {
      const receipt = businessInquiryReceiptSchema.safeParse(data);
      if (receipt.success && ((response.status === 201 && !receipt.data.replayed)
        || (response.status === 200 && receipt.data.replayed))) return { kind: "saved", receipt: receipt.data };
      return { kind: "uncertain" };
    }
    const refusal = refusalSchema.safeParse(data);
    if (!refusal.success) return { kind: "uncertain" };
    const code = refusal.data.error;
    if (response.status === 409 && code === "conflict") return { kind: "conflict" };
    if ((response.status === 400 || response.status === 413) && code === "invalid_request") {
      return { kind: "rejected", code };
    }
    if ((response.status === 403 && code === "not_permitted") || (response.status === 404 && code === "not_found")) {
      return { kind: "rejected", code };
    }
    return { kind: "uncertain" };
  } catch {
    return current() ? { kind: "uncertain" } : { kind: "discarded" };
  }
}
